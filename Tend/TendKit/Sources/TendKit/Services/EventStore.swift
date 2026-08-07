import Foundation
import SwiftData

public extension Event {
    var snapshot: EventSnapshot {
        EventSnapshot(
            id: id,
            seriesID: seriesID ?? id,
            title: title,
            location: location,
            startDate: startDate,
            endDate: endDate,
            isAllDay: isAllDay,
            rule: recurrenceRule.flatMap(RecurrenceRule.init(rawValue:)),
            exceptionDates: exceptionDates,
            detachedFromOccurrence: detachedFromOccurrence,
            attendeeIDs: attendeeIDs,
            notes: notes
        )
    }

    func apply(_ snapshot: EventSnapshot, by memberID: UUID?, at date: Date = .now) {
        title = snapshot.title
        location = snapshot.location
        startDate = snapshot.startDate
        endDate = snapshot.endDate
        isAllDay = snapshot.isAllDay
        recurrenceRule = snapshot.rule?.rawValue
        seriesID = snapshot.seriesID
        exceptionDates = snapshot.exceptionDates
        detachedFromOccurrence = snapshot.detachedFromOccurrence
        attendeeIDs = snapshot.attendeeIDs
        notes = snapshot.notes
        lastModifiedBy = memberID
        lastModifiedAt = date
    }

    static func make(from snapshot: EventSnapshot, by memberID: UUID?) -> Event {
        let event = Event(
            id: snapshot.id,
            title: snapshot.title,
            location: snapshot.location,
            startDate: snapshot.startDate,
            endDate: snapshot.endDate,
            isAllDay: snapshot.isAllDay,
            recurrenceRule: snapshot.rule?.rawValue,
            seriesID: snapshot.seriesID,
            attendeeIDs: snapshot.attendeeIDs,
            notes: snapshot.notes,
            lastModifiedBy: memberID
        )
        event.exceptionDates = snapshot.exceptionDates
        event.detachedFromOccurrence = snapshot.detachedFromOccurrence
        return event
    }
}

/// The SwiftData side of recurrence. It decides *nothing* — ``RecurrenceEngine``
/// works out what an edit means and this applies the result in one save, so a
/// half-applied split can't exist.
public enum EventStore {

    // MARK: - Reading

    /// Every occurrence visible in a date range, series expanded and detached
    /// copies folded in.
    public static func occurrences(
        in range: Range<Date>,
        context: ModelContext,
        calendar: Calendar = .current
    ) -> [EventOccurrence] {
        let events = (try? context.fetch(FetchDescriptor<Event>())) ?? []
        return occurrences(in: range, events: events, calendar: calendar)
    }

    public static func occurrences(
        in range: Range<Date>,
        events: [Event],
        calendar: Calendar = .current
    ) -> [EventOccurrence] {
        let snapshots = events.map(\.snapshot)
        let detachedBySeries = Dictionary(grouping: snapshots.filter { $0.detachedFromOccurrence != nil }) {
            $0.seriesID
        }

        var results: [EventOccurrence] = []
        for snapshot in snapshots where snapshot.detachedFromOccurrence == nil {
            let expanded = RecurrenceEngine.occurrences(of: snapshot, in: range, calendar: calendar)
            results.append(
                contentsOf: RecurrenceEngine.merge(
                    occurrences: expanded,
                    detached: detachedBySeries[snapshot.seriesID] ?? [],
                    in: range
                )
            )
        }
        return results.sorted { $0.start < $1.start }
    }

    public static func event(id: UUID, context: ModelContext) -> Event? {
        var descriptor = FetchDescriptor<Event>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    /// True when the editor has to ask "this event / this and future / all".
    /// A one-off event never prompts, and neither does a series with exactly
    /// one remaining occurrence.
    public static func requiresScopePrompt(for event: Event) -> Bool {
        guard let rule = RecurrenceRule(rawValue: event.recurrenceRule ?? "") else { return false }
        if let count = rule.count, count <= 1 { return false }
        return true
    }

    // MARK: - Writing

    /// Applies an edit under an explicit scope.
    ///
    /// `occurrenceStart` is the instance the user was actually looking at, not
    /// the series start. Passing the series start for a "this and future" edit
    /// is the classic bug this signature is shaped to prevent.
    @discardableResult
    public static func applyEdit(
        _ edit: EventEdit,
        scope: RecurrenceEditScope,
        to event: Event,
        occurrenceStart: Date,
        by memberID: UUID?,
        context: ModelContext,
        calendar: Calendar = .current
    ) throws -> SeriesMutation {
        let master = masterEvent(for: event, context: context) ?? event
        let detached = detachedCopies(ofSeries: master.seriesID ?? master.id, context: context)

        let mutation = RecurrenceEngine.apply(
            edit: edit,
            scope: scope,
            to: master.snapshot,
            occurrenceStart: occurrenceStart,
            detachedCopies: detached.map(\.snapshot),
            calendar: calendar
        )

        master.apply(mutation.updatedMaster, by: memberID)
        master.recurrenceEditScope = mutation.appliedScope.rawValue

        for snapshot in mutation.createdEvents {
            let created = Event.make(from: snapshot, by: memberID)
            created.recurrenceEditScope = mutation.appliedScope.rawValue
            context.insert(created)
        }

        for (eventID, newSeriesID) in mutation.reassignedSeries {
            detached.first { $0.id == eventID }?.seriesID = newSeriesID
        }

        for eventID in mutation.deletedEventIDs {
            if let doomed = self.event(id: eventID, context: context) { context.delete(doomed) }
        }

        try context.save()
        return mutation
    }

    @discardableResult
    public static func delete(
        _ event: Event,
        scope: RecurrenceEditScope,
        occurrenceStart: Date,
        by memberID: UUID?,
        context: ModelContext,
        calendar: Calendar = .current
    ) throws -> SeriesMutation {
        let master = masterEvent(for: event, context: context) ?? event
        let detached = detachedCopies(ofSeries: master.seriesID ?? master.id, context: context)

        let mutation = RecurrenceEngine.applyDelete(
            scope: scope,
            to: master.snapshot,
            occurrenceStart: occurrenceStart,
            detachedCopies: detached.map(\.snapshot),
            calendar: calendar
        )

        if mutation.deletedEventIDs.contains(master.id) {
            for eventID in mutation.deletedEventIDs {
                if let doomed = self.event(id: eventID, context: context) { context.delete(doomed) }
            }
        } else {
            master.apply(mutation.updatedMaster, by: memberID)
            for eventID in mutation.deletedEventIDs {
                if let doomed = self.event(id: eventID, context: context) { context.delete(doomed) }
            }
        }

        try context.save()
        return mutation
    }

    // MARK: - Series helpers

    /// The rule-bearing event for a series. A detached copy has no rule, so
    /// editing one with "all events" has to reach back to the master.
    static func masterEvent(for event: Event, context: ModelContext) -> Event? {
        guard let seriesID = event.seriesID else { return event }
        if event.recurrenceRule != nil, event.detachedFromOccurrence == nil { return event }
        let descriptor = FetchDescriptor<Event>(predicate: #Predicate { $0.seriesID == seriesID })
        return (try? context.fetch(descriptor))?.first { $0.recurrenceRule != nil && $0.detachedFromOccurrence == nil }
    }

    static func detachedCopies(ofSeries seriesID: UUID, context: ModelContext) -> [Event] {
        let descriptor = FetchDescriptor<Event>(predicate: #Predicate { $0.seriesID == seriesID })
        return ((try? context.fetch(descriptor)) ?? []).filter { $0.detachedFromOccurrence != nil }
    }
}
