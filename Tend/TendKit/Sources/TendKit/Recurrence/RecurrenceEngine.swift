import Foundation

/// Value mirror of a stored ``Event``. Recurrence maths runs on these, not on
/// `@Model` objects, so the highest-risk logic in the app is testable without
/// a `ModelContainer` and cannot half-apply a mutation to the store.
public struct EventSnapshot: Equatable, Hashable, Sendable, Identifiable {
    public var id: UUID
    public var seriesID: UUID
    public var title: String
    public var location: String?
    public var startDate: Date
    public var endDate: Date
    public var isAllDay: Bool
    public var rule: RecurrenceRule?
    public var exceptionDates: [Date]
    public var detachedFromOccurrence: Date?
    public var attendeeIDs: [UUID]
    public var notes: String?

    public init(
        id: UUID = UUID(),
        seriesID: UUID? = nil,
        title: String,
        location: String? = nil,
        startDate: Date,
        endDate: Date,
        isAllDay: Bool = false,
        rule: RecurrenceRule? = nil,
        exceptionDates: [Date] = [],
        detachedFromOccurrence: Date? = nil,
        attendeeIDs: [UUID] = [],
        notes: String? = nil
    ) {
        self.id = id
        self.seriesID = seriesID ?? id
        self.title = title
        self.location = location
        self.startDate = startDate
        self.endDate = endDate
        self.isAllDay = isAllDay
        self.rule = rule
        self.exceptionDates = exceptionDates
        self.detachedFromOccurrence = detachedFromOccurrence
        self.attendeeIDs = attendeeIDs
        self.notes = notes
    }

    public var duration: TimeInterval { endDate.timeIntervalSince(startDate) }
    public var isSeriesMaster: Bool { rule != nil }
}

/// One materialised instance of a series.
public struct EventOccurrence: Equatable, Hashable, Sendable {
    public let eventID: UUID
    public let seriesID: UUID
    public let start: Date
    public let end: Date
    /// True when this instance came out of a detached "this event only" copy
    /// rather than the series rule.
    public let isDetached: Bool

    public init(eventID: UUID, seriesID: UUID, start: Date, end: Date, isDetached: Bool = false) {
        self.eventID = eventID
        self.seriesID = seriesID
        self.start = start
        self.end = end
        self.isDetached = isDetached
    }
}

/// The fields an editor can change. Everything is optional: `nil` means "leave
/// as it was", which is what makes a "this and future" edit that only moves the
/// time leave the title alone.
public struct EventEdit: Equatable, Sendable {
    public var title: String?
    public var location: String??
    public var start: Date?
    public var end: Date?
    public var isAllDay: Bool?
    public var rule: RecurrenceRule??
    public var attendeeIDs: [UUID]?
    public var notes: String??

    public init(
        title: String? = nil,
        location: String?? = nil,
        start: Date? = nil,
        end: Date? = nil,
        isAllDay: Bool? = nil,
        rule: RecurrenceRule?? = nil,
        attendeeIDs: [UUID]? = nil,
        notes: String?? = nil
    ) {
        self.title = title
        self.location = location
        self.start = start
        self.end = end
        self.isAllDay = isAllDay
        self.rule = rule
        self.attendeeIDs = attendeeIDs
        self.notes = notes
    }
}

/// The complete set of writes an edit implies. The SwiftData layer applies this
/// atomically; it never decides *what* to write.
public struct SeriesMutation: Equatable, Sendable {
    /// The original master, updated in place (may be unchanged).
    public var updatedMaster: EventSnapshot
    /// Brand-new events: a detached occurrence, or the second half of a split.
    public var createdEvents: [EventSnapshot]
    /// Detached occurrences that now belong to a different series after a split.
    public var reassignedSeries: [UUID: UUID]
    /// Events to delete outright (a "delete all" on a series).
    public var deletedEventIDs: [UUID]
    /// Recorded on every touched event so the UI can explain what changed.
    public var appliedScope: RecurrenceEditScope

    public init(
        updatedMaster: EventSnapshot,
        createdEvents: [EventSnapshot] = [],
        reassignedSeries: [UUID: UUID] = [:],
        deletedEventIDs: [UUID] = [],
        appliedScope: RecurrenceEditScope
    ) {
        self.updatedMaster = updatedMaster
        self.createdEvents = createdEvents
        self.reassignedSeries = reassignedSeries
        self.deletedEventIDs = deletedEventIDs
        self.appliedScope = appliedScope
    }
}

public enum RecurrenceEngine {

    /// Hard ceiling on generated instances, so a malformed rule can never spin
    /// the calendar view forever.
    public static let expansionLimit = 750

    // MARK: - Expansion

    /// Occurrences of `master` that start within `range`, honouring COUNT,
    /// UNTIL and EXDATE. Detached copies are *not* included — pass them to
    /// ``merge(occurrences:detached:)`` alongside this result.
    public static func occurrences(
        of master: EventSnapshot,
        in range: Range<Date>,
        calendar: Calendar = .current,
        limit: Int = expansionLimit
    ) -> [EventOccurrence] {
        guard let rule = master.rule else {
            let single = EventOccurrence(
                eventID: master.id,
                seriesID: master.seriesID,
                start: master.startDate,
                end: master.endDate,
                isDetached: master.detachedFromOccurrence != nil
            )
            return range.contains(master.startDate) ? [single] : []
        }

        let duration = master.duration
        let exceptions = Set(master.exceptionDates.map { $0.timeIntervalSinceReferenceDate.rounded() })
        var results: [EventOccurrence] = []
        var emitted = 0

        for start in starts(from: master.startDate, rule: rule, calendar: calendar, limit: limit) {
            // COUNT is applied to the recurrence set *before* exceptions are
            // subtracted, which is what RFC 5545 specifies and what EventKit
            // does. Increment first, filter second.
            emitted += 1
            if let count = rule.count, emitted > count { break }
            if let until = rule.until, start > until { break }
            if start >= range.upperBound { break }

            guard start >= range.lowerBound else { continue }
            guard !exceptions.contains(start.timeIntervalSinceReferenceDate.rounded()) else { continue }

            results.append(
                EventOccurrence(
                    eventID: master.id,
                    seriesID: master.seriesID,
                    start: start,
                    end: start.addingTimeInterval(duration)
                )
            )
        }
        return results
    }

    /// The first occurrence strictly after `date`, or `nil` if the series has
    /// run out. Used by the next-event complication and Live Activity.
    public static func nextOccurrence(
        of master: EventSnapshot,
        after date: Date,
        calendar: Calendar = .current
    ) -> EventOccurrence? {
        // Two years is far enough to find the next instance of anything a
        // household actually schedules, and bounded enough to stay cheap.
        let horizon = calendar.date(byAdding: .year, value: 2, to: date) ?? date.addingTimeInterval(63_072_000)
        return occurrences(of: master, in: date.addingTimeInterval(1)..<horizon, calendar: calendar).first
    }

    /// Folds detached "this event only" copies into an expanded series,
    /// replacing the slots they were detached from.
    public static func merge(
        occurrences seriesOccurrences: [EventOccurrence],
        detached: [EventSnapshot],
        in range: Range<Date>
    ) -> [EventOccurrence] {
        var merged = seriesOccurrences
        for copy in detached {
            guard range.contains(copy.startDate) else { continue }
            merged.append(
                EventOccurrence(
                    eventID: copy.id,
                    seriesID: copy.seriesID,
                    start: copy.startDate,
                    end: copy.endDate,
                    isDetached: true
                )
            )
        }
        return merged.sorted { $0.start < $1.start }
    }

    // MARK: - Editing

    /// Turns "the user edited the occurrence starting at X, with scope S" into
    /// the exact set of writes that implies.
    ///
    /// This is the function the §6 requirement is about. Every branch either
    /// splits the series or narrows it — none of them mutate a whole series in
    /// place unless the scope explicitly says to.
    public static func apply(
        edit: EventEdit,
        scope: RecurrenceEditScope,
        to master: EventSnapshot,
        occurrenceStart: Date,
        detachedCopies: [EventSnapshot] = [],
        calendar: Calendar = .current,
        newIdentifier: () -> UUID = UUID.init
    ) -> SeriesMutation {
        // A non-recurring event has exactly one occurrence, so every scope
        // collapses to the same edit.
        guard master.rule != nil else {
            return SeriesMutation(
                updatedMaster: applyFields(edit, to: master),
                appliedScope: .all
            )
        }

        switch scope {
        case .single:
            return applySingle(
                edit: edit,
                master: master,
                occurrenceStart: occurrenceStart,
                newIdentifier: newIdentifier
            )
        case .future:
            return applyFuture(
                edit: edit,
                master: master,
                occurrenceStart: occurrenceStart,
                detachedCopies: detachedCopies,
                calendar: calendar,
                newIdentifier: newIdentifier
            )
        case .all:
            return applyAll(edit: edit, master: master, occurrenceStart: occurrenceStart)
        }
    }

    /// Deleting one occurrence is just an EXDATE; deleting the series removes
    /// the master and every detached copy.
    public static func applyDelete(
        scope: RecurrenceEditScope,
        to master: EventSnapshot,
        occurrenceStart: Date,
        detachedCopies: [EventSnapshot] = [],
        calendar: Calendar = .current
    ) -> SeriesMutation {
        switch scope {
        case .single:
            var updated = master
            updated.exceptionDates.append(occurrenceStart)
            let orphan = detachedCopies.first { $0.startDate == occurrenceStart }
            return SeriesMutation(
                updatedMaster: updated,
                deletedEventIDs: orphan.map { [$0.id] } ?? [],
                appliedScope: .single
            )
        case .future:
            var updated = master
            updated.rule = truncate(master.rule, before: occurrenceStart, master: master, calendar: calendar)
            updated.exceptionDates = master.exceptionDates.filter { $0 < occurrenceStart }
            let doomed = detachedCopies.filter { $0.startDate >= occurrenceStart }.map(\.id)
            return SeriesMutation(updatedMaster: updated, deletedEventIDs: doomed, appliedScope: .future)
        case .all:
            return SeriesMutation(
                updatedMaster: master,
                deletedEventIDs: [master.id] + detachedCopies.map(\.id),
                appliedScope: .all
            )
        }
    }

    // MARK: - Scope implementations

    private static func applySingle(
        edit: EventEdit,
        master: EventSnapshot,
        occurrenceStart: Date,
        newIdentifier: () -> UUID
    ) -> SeriesMutation {
        var updatedMaster = master
        if !updatedMaster.exceptionDates.contains(occurrenceStart) {
            updatedMaster.exceptionDates.append(occurrenceStart)
        }

        // The detached copy is a plain, ruleless event that remembers which
        // slot it replaced. That back-reference is what lets a later "this and
        // future" edit decide whether it travels with the split.
        var detached = EventSnapshot(
            id: newIdentifier(),
            seriesID: master.seriesID,
            title: master.title,
            location: master.location,
            startDate: occurrenceStart,
            endDate: occurrenceStart.addingTimeInterval(master.duration),
            isAllDay: master.isAllDay,
            rule: nil,
            exceptionDates: [],
            detachedFromOccurrence: occurrenceStart,
            attendeeIDs: master.attendeeIDs,
            notes: master.notes
        )
        detached = applyFields(edit, to: detached)

        return SeriesMutation(
            updatedMaster: updatedMaster,
            createdEvents: [detached],
            appliedScope: .single
        )
    }

    private static func applyFuture(
        edit: EventEdit,
        master: EventSnapshot,
        occurrenceStart: Date,
        detachedCopies: [EventSnapshot],
        calendar: Calendar,
        newIdentifier: () -> UUID
    ) -> SeriesMutation {
        // Editing from the very first occurrence has no "before" half, so
        // splitting would leave an empty series behind. Treat it as "all".
        guard occurrenceStart > master.startDate else {
            return applyAll(edit: edit, master: master, occurrenceStart: occurrenceStart)
        }

        var head = master
        head.rule = truncate(master.rule, before: occurrenceStart, master: master, calendar: calendar)
        head.exceptionDates = master.exceptionDates.filter { $0 < occurrenceStart }

        let newSeriesID = newIdentifier()
        let delta = (edit.start ?? occurrenceStart).timeIntervalSince(occurrenceStart)

        var tail = EventSnapshot(
            id: newSeriesID,
            seriesID: newSeriesID,
            title: master.title,
            location: master.location,
            startDate: occurrenceStart,
            endDate: occurrenceStart.addingTimeInterval(master.duration),
            isAllDay: master.isAllDay,
            rule: remainingRule(master.rule, from: occurrenceStart, master: master, calendar: calendar),
            // Exceptions at or after the split travel with the tail, shifted by
            // the same delta the occurrences moved, or they stop matching.
            exceptionDates: master.exceptionDates
                .filter { $0 >= occurrenceStart }
                .map { $0.addingTimeInterval(delta) },
            detachedFromOccurrence: nil,
            attendeeIDs: master.attendeeIDs,
            notes: master.notes
        )
        tail = applyFields(edit, to: tail)

        // Detached one-offs living in the tail's date range belong to the new
        // series now — otherwise a later "all events" edit on either half would
        // reach across the split.
        var reassigned: [UUID: UUID] = [:]
        for copy in detachedCopies where copy.startDate >= occurrenceStart {
            reassigned[copy.id] = newSeriesID
        }

        return SeriesMutation(
            updatedMaster: head,
            createdEvents: [tail],
            reassignedSeries: reassigned,
            appliedScope: .future
        )
    }

    private static func applyAll(
        edit: EventEdit,
        master: EventSnapshot,
        occurrenceStart: Date
    ) -> SeriesMutation {
        // The user was looking at *an* occurrence, so a start-date change is a
        // shift relative to that occurrence, not an absolute move of the master.
        let delta = (edit.start ?? occurrenceStart).timeIntervalSince(occurrenceStart)

        var updated = master
        if let title = edit.title { updated.title = title }
        if let location = edit.location { updated.location = location }
        if let isAllDay = edit.isAllDay { updated.isAllDay = isAllDay }
        if let attendees = edit.attendeeIDs { updated.attendeeIDs = attendees }
        if let notes = edit.notes { updated.notes = notes }
        if let rule = edit.rule { updated.rule = rule }

        if delta != 0 {
            updated.startDate = master.startDate.addingTimeInterval(delta)
            updated.endDate = master.endDate.addingTimeInterval(delta)
            updated.exceptionDates = master.exceptionDates.map { $0.addingTimeInterval(delta) }
        }
        if let end = edit.end, let start = edit.start {
            // An explicit duration change applies to every occurrence.
            updated.endDate = updated.startDate.addingTimeInterval(end.timeIntervalSince(start))
        }

        return SeriesMutation(updatedMaster: updated, appliedScope: .all)
    }

    // MARK: - Rule surgery

    /// Ends a rule immediately before `date`, converting COUNT into the number
    /// of occurrences that actually fall in the head half so the two halves
    /// together still produce the original total.
    private static func truncate(
        _ rule: RecurrenceRule?,
        before date: Date,
        master: EventSnapshot,
        calendar: Calendar
    ) -> RecurrenceRule? {
        guard var rule else { return nil }
        if rule.count != nil {
            let headCount = starts(from: master.startDate, rule: rule, calendar: calendar, limit: expansionLimit)
                .prefix(rule.count ?? expansionLimit)
                .filter { $0 < date }
                .count
            rule.count = max(headCount, 0)
            rule.until = nil
        } else {
            rule.until = date.addingTimeInterval(-1)
        }
        return rule
    }

    /// The complement of ``truncate(_:before:master:calendar:)`` — the part of
    /// the rule that still has to happen after the split point.
    private static func remainingRule(
        _ rule: RecurrenceRule?,
        from date: Date,
        master: EventSnapshot,
        calendar: Calendar
    ) -> RecurrenceRule? {
        guard var rule else { return nil }
        if let total = rule.count {
            let consumed = starts(from: master.startDate, rule: rule, calendar: calendar, limit: expansionLimit)
                .prefix(total)
                .filter { $0 < date }
                .count
            rule.count = max(total - consumed, 1)
        }
        return rule
    }

    // MARK: - Start-date generation

    /// Lazily generates candidate start dates for a rule. Everything above
    /// filters this stream; keeping generation in one place is what stops
    /// weekly-with-BYDAY drifting out of sync with the other frequencies.
    static func starts(
        from anchor: Date,
        rule: RecurrenceRule,
        calendar: Calendar,
        limit: Int
    ) -> [Date] {
        var results: [Date] = []
        let time = calendar.dateComponents([.hour, .minute, .second], from: anchor)

        switch rule.frequency {
        case .daily:
            var step = 0
            while results.count < limit {
                guard let date = calendar.date(byAdding: .day, value: step * rule.interval, to: anchor) else { break }
                results.append(date)
                step += 1
            }

        case .weekly:
            let weekdays: [RecurrenceRule.Weekday] = rule.weekdays.isEmpty
                ? [RecurrenceRule.Weekday(rawValue: calendar.component(.weekday, from: anchor))].compactMap { $0 }
                : rule.weekdays

            guard let anchorWeekStart = calendar.dateInterval(of: .weekOfYear, for: anchor)?.start else { break }
            var week = 0
            outer: while results.count < limit {
                guard let weekStart = calendar.date(
                    byAdding: .weekOfYear,
                    value: week * rule.interval,
                    to: anchorWeekStart
                ) else { break }

                for weekday in weekdays.sorted() {
                    guard var date = calendar.date(
                        bySetting: .weekday,
                        value: weekday.rawValue,
                        of: weekStart
                    ) else { continue }
                    // `bySetting:` can land on the following week's instance of
                    // the weekday; pull it back into the week we asked for.
                    if let interval = calendar.dateInterval(of: .weekOfYear, for: weekStart),
                       !interval.contains(date),
                       let corrected = calendar.date(byAdding: .day, value: -7, to: date),
                       interval.contains(corrected) {
                        date = corrected
                    }
                    guard let stamped = calendar.date(
                        bySettingHour: time.hour ?? 0,
                        minute: time.minute ?? 0,
                        second: time.second ?? 0,
                        of: date
                    ) else { continue }
                    guard stamped >= anchor else { continue }
                    results.append(stamped)
                    if results.count >= limit { break outer }
                }
                week += 1
            }

        case .monthly:
            let days = rule.monthDays.isEmpty ? [calendar.component(.day, from: anchor)] : rule.monthDays
            var step = 0
            outer: while results.count < limit {
                guard let monthStart = calendar.date(
                    byAdding: .month,
                    value: step * rule.interval,
                    to: calendar.date(from: calendar.dateComponents([.year, .month], from: anchor)) ?? anchor
                ) else { break }

                let range = calendar.range(of: .day, in: .month, for: monthStart)?.count ?? 28
                for day in days.sorted() {
                    // A 31st in a 30-day month simply does not occur, which is
                    // what RFC 5545 says and what users expect.
                    guard day <= range else { continue }
                    var components = calendar.dateComponents([.year, .month], from: monthStart)
                    components.day = day
                    components.hour = time.hour
                    components.minute = time.minute
                    components.second = time.second
                    guard let date = calendar.date(from: components), date >= anchor else { continue }
                    results.append(date)
                    if results.count >= limit { break outer }
                }
                step += 1
            }

        case .yearly:
            var step = 0
            while results.count < limit {
                guard let date = calendar.date(byAdding: .year, value: step * rule.interval, to: anchor) else { break }
                results.append(date)
                step += 1
            }
        }

        return results.sorted()
    }

    // MARK: - Field application

    private static func applyFields(_ edit: EventEdit, to snapshot: EventSnapshot) -> EventSnapshot {
        var updated = snapshot
        if let title = edit.title { updated.title = title }
        if let location = edit.location { updated.location = location }
        if let start = edit.start {
            // Moving the start without touching the end carries the duration
            // along, rather than silently shortening the event.
            let delta = start.timeIntervalSince(updated.startDate)
            updated.startDate = start
            if edit.end == nil { updated.endDate = updated.endDate.addingTimeInterval(delta) }
        }
        if let end = edit.end { updated.endDate = end }
        if let isAllDay = edit.isAllDay { updated.isAllDay = isAllDay }
        if let attendees = edit.attendeeIDs { updated.attendeeIDs = attendees }
        if let notes = edit.notes { updated.notes = notes }
        if let rule = edit.rule { updated.rule = rule }
        if updated.endDate < updated.startDate {
            updated.endDate = updated.startDate.addingTimeInterval(snapshot.duration)
        }
        return updated
    }
}
