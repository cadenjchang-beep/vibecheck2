import Foundation

// MARK: - Inputs
//
// Pulse runs on value types rather than `@Model` objects so it can be unit
// tested and so the background task can compute it off the main actor without
// dragging a `ModelContext` across a task boundary.

public struct PulseMemberInput: Equatable, Sendable {
    public let id: UUID
    public let name: String
    public init(id: UUID, name: String) { self.id = id; self.name = name }
}

public struct PulseEventInput: Equatable, Sendable {
    public let id: UUID
    public let title: String
    public let start: Date
    public let end: Date
    public let isAllDay: Bool
    public let attendeeIDs: [UUID]

    public init(id: UUID, title: String, start: Date, end: Date, isAllDay: Bool = false, attendeeIDs: [UUID] = []) {
        self.id = id
        self.title = title
        self.start = start
        self.end = end
        self.isAllDay = isAllDay
        self.attendeeIDs = attendeeIDs
    }
}

public struct PulseTaskInput: Equatable, Sendable {
    public let id: UUID
    public let title: String
    public let dueDate: Date?
    public let isComplete: Bool
    public let completedAt: Date?
    public let completedBy: UUID?
    public let assignedMemberID: UUID?

    public init(
        id: UUID,
        title: String,
        dueDate: Date?,
        isComplete: Bool,
        completedAt: Date? = nil,
        completedBy: UUID? = nil,
        assignedMemberID: UUID? = nil
    ) {
        self.id = id
        self.title = title
        self.dueDate = dueDate
        self.isComplete = isComplete
        self.completedAt = completedAt
        self.completedBy = completedBy
        self.assignedMemberID = assignedMemberID
    }
}

public struct PulseListItemInput: Equatable, Sendable {
    public let id: UUID
    public let listName: String
    public let text: String
    public let isChecked: Bool
    public let completedAt: Date?
    public let completedBy: UUID?
    public let addedBy: UUID?
    public let createdAt: Date

    public init(
        id: UUID,
        listName: String,
        text: String,
        isChecked: Bool,
        completedAt: Date? = nil,
        completedBy: UUID? = nil,
        addedBy: UUID? = nil,
        createdAt: Date = .now
    ) {
        self.id = id
        self.listName = listName
        self.text = text
        self.isChecked = isChecked
        self.completedAt = completedAt
        self.completedBy = completedBy
        self.addedBy = addedBy
        self.createdAt = createdAt
    }
}

public struct PulseMealInput: Equatable, Sendable {
    public let date: Date
    public let mealType: MealType
    public let label: String

    public init(date: Date, mealType: MealType, label: String) {
        self.date = date
        self.mealType = mealType
        self.label = label
    }
}

public struct PulseInput: Equatable, Sendable {
    public var now: Date
    public var members: [PulseMemberInput]
    public var events: [PulseEventInput]
    public var tasks: [PulseTaskInput]
    public var listItems: [PulseListItemInput]
    public var meals: [PulseMealInput]

    public init(
        now: Date = .now,
        members: [PulseMemberInput] = [],
        events: [PulseEventInput] = [],
        tasks: [PulseTaskInput] = [],
        listItems: [PulseListItemInput] = [],
        meals: [PulseMealInput] = []
    ) {
        self.now = now
        self.members = members
        self.events = events
        self.tasks = tasks
        self.listItems = listItems
        self.meals = meals
    }
}

// MARK: - Output

public struct PulseSnapshot: Equatable, Sendable {
    public let kind: PulseKind
    public let generatedAt: Date
    public let headline: String
    public let lines: [PulseLine]
    public let deepLink: DeepLink

    public init(kind: PulseKind, generatedAt: Date, headline: String, lines: [PulseLine], deepLink: DeepLink) {
        self.kind = kind
        self.generatedAt = generatedAt
        self.headline = headline
        self.lines = lines
        self.deepLink = deepLink
    }

    /// One-line form for a notification body and the small widget.
    public var compactSummary: String {
        lines.prefix(3).map(\.text).joined(separator: " · ")
    }

    public var isEmpty: Bool { lines.isEmpty }
}

public struct PulseLine: Equatable, Sendable, Identifiable {
    public let id: String
    public let text: String
    public let systemImage: String
    public let destination: DeepLink

    public init(id: String, text: String, systemImage: String, destination: DeepLink) {
        self.id = id
        self.text = text
        self.systemImage = systemImage
        self.destination = destination
    }
}

// MARK: - Generator

/// Builds the recap that goes out Sunday evening and every morning.
///
/// Two properties matter more than the wording. It is **accurate** — every
/// number here is countable, nothing is estimated or rounded up to sound
/// impressive. And it is **pre-computed** — a background task writes the result
/// so opening the widget is a read, not a query.
public enum PulseGenerator {

    public static func generate(
        kind: PulseKind,
        input: PulseInput,
        calendar: Calendar = .current
    ) -> PulseSnapshot {
        switch kind {
        case .morning: morning(input: input, calendar: calendar)
        case .weekly: weekly(input: input, calendar: calendar)
        }
    }

    // MARK: Morning

    static func morning(input: PulseInput, calendar: Calendar) -> PulseSnapshot {
        let now = input.now
        let dayStart = calendar.startOfDay(for: now)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? now
        var lines: [PulseLine] = []

        let todaysEvents = input.events
            .filter { $0.start < dayEnd && $0.end >= dayStart }
            .sorted { $0.start < $1.start }

        if let next = todaysEvents.first(where: { $0.end >= now }) ?? todaysEvents.first {
            let time = next.isAllDay
                ? "all day"
                : next.start.formatted(date: .omitted, time: .shortened)
            let rest = todaysEvents.count - 1
            let suffix = rest > 0 ? ", then \(rest) more" : ""
            lines.append(
                PulseLine(
                    id: "events",
                    text: "\(next.title) at \(time)\(suffix)",
                    systemImage: "calendar",
                    destination: .event(id: next.id, occurrence: next.start)
                )
            )
        }

        let dueToday = input.tasks.filter { task in
            guard !task.isComplete, let due = task.dueDate else { return false }
            return due < dayEnd
        }
        if !dueToday.isEmpty {
            let overdue = dueToday.filter { ($0.dueDate ?? now) < dayStart }.count
            let text = overdue > 0
                ? "\(dueToday.count) tasks due — \(overdue) carried over"
                : "\(dueToday.count) \(dueToday.count == 1 ? "task" : "tasks") due today"
            lines.append(PulseLine(id: "tasks", text: text, systemImage: "checkmark.circle", destination: .tasks))
        }

        for listName in openListNames(in: input) {
            let open = input.listItems.filter { $0.listName == listName && !$0.isChecked }.count
            guard open > 0 else { continue }
            lines.append(
                PulseLine(
                    id: "list-\(listName)",
                    text: "\(open) on \(listName)",
                    systemImage: "checklist",
                    destination: .list(name: listName)
                )
            )
        }

        if let dinner = input.meals.first(where: {
            calendar.isDate($0.date, inSameDayAs: now) && $0.mealType == .dinner
        }) {
            lines.append(
                PulseLine(
                    id: "meal",
                    text: "Dinner: \(dinner.label)",
                    systemImage: "fork.knife",
                    destination: .meals(week: dayStart)
                )
            )
        }

        let headline: String
        if todaysEvents.isEmpty && dueToday.isEmpty {
            headline = "A clear day"
        } else {
            headline = now.formatted(.dateTime.weekday(.wide)) + " at a glance"
        }

        return PulseSnapshot(
            kind: .morning,
            generatedAt: now,
            headline: headline,
            lines: lines,
            deepLink: .pulse(.morning)
        )
    }

    // MARK: Weekly

    static func weekly(input: PulseInput, calendar: Calendar) -> PulseSnapshot {
        let now = input.now
        let weekStart = calendar.dateInterval(of: .weekOfYear, for: now)?.start ?? now
        let weekEnd = calendar.date(byAdding: .day, value: 7, to: weekStart) ?? now
        let nextWeekEnd = calendar.date(byAdding: .day, value: 14, to: weekStart) ?? now
        var lines: [PulseLine] = []

        // -- What got done ---------------------------------------------------
        let completedTasks = input.tasks.filter { task in
            guard let completedAt = task.completedAt else { return false }
            return completedAt >= weekStart && completedAt < weekEnd
        }
        if !completedTasks.isEmpty {
            lines.append(
                PulseLine(
                    id: "done-tasks",
                    text: "\(completedTasks.count) \(completedTasks.count == 1 ? "task" : "tasks") finished",
                    systemImage: "checkmark.circle.fill",
                    destination: .tasks
                )
            )
        }

        for listName in openListNames(in: input) {
            let trips = shoppingTrips(for: listName, in: input, weekStart: weekStart, weekEnd: weekEnd, calendar: calendar)
            guard trips.items > 0 else { continue }
            let text = trips.days == 1
                ? "\(listName) cleared \(trips.items) items"
                : "\(listName) cleared \(trips.items) items across \(trips.days) trips"
            lines.append(
                PulseLine(
                    id: "done-list-\(listName)",
                    text: text,
                    systemImage: "cart",
                    destination: .list(name: listName)
                )
            )
        }

        // -- What's left -----------------------------------------------------
        let remainingThisWeek = input.events.filter { $0.start >= now && $0.start < weekEnd }
        if !remainingThisWeek.isEmpty {
            lines.append(
                PulseLine(
                    id: "left-events",
                    text: "\(remainingThisWeek.count) \(remainingThisWeek.count == 1 ? "event" : "events") left this weekend",
                    systemImage: "calendar.badge.clock",
                    destination: .calendar(date: now)
                )
            )
        }

        let openTasks = input.tasks.filter { !$0.isComplete }
        if !openTasks.isEmpty {
            lines.append(
                PulseLine(
                    id: "left-tasks",
                    text: "\(openTasks.count) open \(openTasks.count == 1 ? "task" : "tasks") carrying over",
                    systemImage: "arrow.uturn.forward",
                    destination: .tasks
                )
            )
        }

        // -- What's coming ---------------------------------------------------
        let nextWeek = input.events
            .filter { $0.start >= weekEnd && $0.start < nextWeekEnd }
            .sorted { $0.start < $1.start }
        if !nextWeek.isEmpty {
            var text = "Next week: \(nextWeek.count) \(nextWeek.count == 1 ? "event" : "events")"
            if let notable = nextWeek.first {
                let day = notable.start.formatted(.dateTime.weekday(.abbreviated))
                text += ", \(notable.title) \(day)"
            }
            lines.append(
                PulseLine(
                    id: "coming",
                    text: text,
                    systemImage: "arrow.right.circle",
                    destination: .calendar(date: weekEnd)
                )
            )
        }

        let plannedMeals = input.meals.filter { $0.date >= weekEnd && $0.date < nextWeekEnd }.count
        if plannedMeals < 3 {
            lines.append(
                PulseLine(
                    id: "meals-gap",
                    text: plannedMeals == 0 ? "No meals planned yet for next week" : "Only \(plannedMeals) meals planned next week",
                    systemImage: "fork.knife",
                    destination: .meals(week: weekEnd)
                )
            )
        }

        let headline = lines.isEmpty ? "A quiet week" : "This week, in short"
        return PulseSnapshot(
            kind: .weekly,
            generatedAt: now,
            headline: headline,
            lines: lines,
            deepLink: .pulse(.weekly)
        )
    }

    // MARK: Helpers

    /// Lists that have any activity at all, most-used first, so Pulse talks
    /// about the household's real lists rather than the built-in defaults.
    static func openListNames(in input: PulseInput) -> [String] {
        var counts: [String: Int] = [:]
        for item in input.listItems { counts[item.listName, default: 0] += 1 }
        return counts
            .sorted { lhs, rhs in lhs.value == rhs.value ? lhs.key < rhs.key : lhs.value > rhs.value }
            .map(\.key)
    }

    /// "Cleared 3x this week" is not a stored event, so it is derived: distinct
    /// days on which items from a list were checked off. That is a defensible
    /// definition of a shopping trip and it never overstates.
    static func shoppingTrips(
        for listName: String,
        in input: PulseInput,
        weekStart: Date,
        weekEnd: Date,
        calendar: Calendar
    ) -> (items: Int, days: Int) {
        let completions = input.listItems.compactMap { item -> Date? in
            guard item.listName == listName, item.isChecked, let at = item.completedAt else { return nil }
            return (at >= weekStart && at < weekEnd) ? at : nil
        }
        let days = Set(completions.map { calendar.startOfDay(for: $0) })
        return (completions.count, days.count)
    }
}
