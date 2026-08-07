import Foundation

/// The kinds of invisible work Tend can actually observe. Named plainly,
/// because the whole feature depends on people trusting what it counts.
public enum LoadCategory: String, CaseIterable, Codable, Sendable, Identifiable {
    case tasks
    case lists
    case events
    case meals

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .tasks: "Tasks finished"
        case .lists: "List items handled"
        case .events: "Events organised"
        case .meals: "Meals planned"
        }
    }

    public var systemImage: String {
        switch self {
        case .tasks: "checkmark.circle"
        case .lists: "checklist"
        case .events: "calendar"
        case .meals: "fork.knife"
        }
    }

    /// How the category is named inside a sentence. Kept separate from
    /// ``title`` so the observation copy reads like a person wrote it.
    var narrativeNoun: String {
        switch self {
        case .tasks: "finished tasks"
        case .lists: "list check-offs"
        case .events: "calendar upkeep"
        case .meals: "meal planning"
        }
    }
}

public struct LoadWindow: Equatable, Sendable, Identifiable {
    public let title: String
    public let range: Range<Date>
    public var id: String { title }

    public init(title: String, range: Range<Date>) {
        self.title = title
        self.range = range
    }

    public static func week(containing date: Date, calendar: Calendar = .current) -> LoadWindow {
        let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
        let end = calendar.date(byAdding: .day, value: 7, to: start) ?? date
        return LoadWindow(title: "This week", range: start..<end)
    }

    public static func month(containing date: Date, calendar: Calendar = .current) -> LoadWindow {
        let start = calendar.dateInterval(of: .month, for: date)?.start ?? date
        let end = calendar.date(byAdding: .month, value: 1, to: start) ?? date
        return LoadWindow(title: "This month", range: start..<end)
    }
}

/// One person's slice of the window.
public struct LoadShare: Equatable, Sendable, Identifiable {
    public let memberID: UUID
    public let name: String
    public let colorHex: String
    public let counts: [LoadCategory: Int]

    public var id: UUID { memberID }
    public var total: Int { counts.values.reduce(0, +) }

    public init(memberID: UUID, name: String, colorHex: String, counts: [LoadCategory: Int]) {
        self.memberID = memberID
        self.name = name
        self.colorHex = colorHex
        self.counts = counts
    }

    public func count(_ category: LoadCategory) -> Int { counts[category] ?? 0 }

    /// 0–1 of the household's total for the window. Presented as a bar width,
    /// never as a percentage label — see the note on ``LoadSummary``.
    public func fraction(of householdTotal: Int) -> Double {
        householdTotal > 0 ? Double(total) / Double(householdTotal) : 0
    }
}

/// What Load View renders.
///
/// ## The design constraint
///
/// This is the feature most likely to go wrong socially rather than
/// technically, so the rules are in the type, not just the view:
///
/// - ``shares`` is ordered by **household join order**, never by volume. A list
///   sorted by "who did most" is a leaderboard no matter how it is styled.
/// - There is no rank, no score, no target, no streak and no delta-vs-last-week
///   here, because every one of those invites a comparison the app has no
///   business making.
/// - ``observation`` is deliberately descriptive ("Most of the list items came
///   from Sam this week"), never prescriptive ("Alex should do more").
/// - The counts are honest about being partial — see ``caveat``. The app cannot
///   see who sat with a sick kid, and saying so out loud is what keeps the
///   chart from being read as the whole truth.
public struct LoadSummary: Equatable, Sendable {
    public let window: LoadWindow
    public let shares: [LoadShare]
    public let householdTotal: Int
    public let observation: String?
    public let caveat: String

    public init(window: LoadWindow, shares: [LoadShare], householdTotal: Int, observation: String?, caveat: String) {
        self.window = window
        self.shares = shares
        self.householdTotal = householdTotal
        self.observation = observation
        self.caveat = caveat
    }

    public var isEmpty: Bool { householdTotal == 0 }
}

public enum LoadCalculator {

    /// The one sentence that never comes off the screen.
    public static let standardCaveat =
        "This is only what Tend can see. Plenty of the work at home doesn't get logged anywhere."

    public static func summarize(
        window: LoadWindow,
        members: [PulseMemberInput],
        memberColors: [UUID: String] = [:],
        tasks: [PulseTaskInput],
        listItems: [PulseListItemInput],
        events: [PulseEventInput] = [],
        eventOrganizers: [UUID: UUID] = [:],
        meals: [(date: Date, plannedBy: UUID?)] = []
    ) -> LoadSummary {
        var counts: [UUID: [LoadCategory: Int]] = [:]

        func bump(_ memberID: UUID?, _ category: LoadCategory) {
            guard let memberID else { return }
            counts[memberID, default: [:]][category, default: 0] += 1
        }

        for task in tasks {
            guard let completedAt = task.completedAt, window.range.contains(completedAt) else { continue }
            // Credit the person who actually did it, falling back to whoever it
            // was assigned to when the completing device predates that field.
            bump(task.completedBy ?? task.assignedMemberID, .tasks)
        }

        for item in listItems {
            guard item.isChecked, let completedAt = item.completedAt, window.range.contains(completedAt) else { continue }
            bump(item.completedBy, .lists)
        }

        for event in events {
            guard window.range.contains(event.start), let organizer = eventOrganizers[event.id] else { continue }
            bump(organizer, .events)
        }

        for meal in meals {
            guard window.range.contains(meal.date) else { continue }
            bump(meal.plannedBy, .meals)
        }

        // Member order is the household's own order, not a ranking.
        let shares = members.map { member in
            LoadShare(
                memberID: member.id,
                name: member.name,
                colorHex: memberColors[member.id] ?? "#6C8F7E",
                counts: counts[member.id] ?? [:]
            )
        }

        let total = shares.reduce(0) { $0 + $1.total }
        return LoadSummary(
            window: window,
            shares: shares,
            householdTotal: total,
            observation: observation(for: shares, total: total),
            caveat: standardCaveat
        )
    }

    /// Descriptive, singular, and only when there is genuinely something to
    /// describe. Silence is a valid output — a balanced week does not need a
    /// congratulatory sentence, and an unbalanced one does not need a verdict.
    static func observation(for shares: [LoadShare], total: Int) -> String? {
        let active = shares.filter { $0.total > 0 }
        guard total >= 8, active.count >= 2 else { return nil }

        let sorted = active.sorted { $0.total > $1.total }
        guard let top = sorted.first else { return nil }
        let topFraction = Double(top.total) / Double(total)

        if topFraction >= 0.65 {
            // Lead with the *kind* of work, not the person: "the list
            // check-offs" is something a household can hand off, whereas a
            // sentence about a person is a verdict about them.
            if let category = dominantCategory(for: top) {
                return "Most of the \(category.narrativeNoun) came from \(top.name) this time."
            }
            return "A lot of this week ran through \(top.name)."
        }

        // An even split among however many people are active — 1/n, with a
        // little slack.
        if topFraction <= (1.0 / Double(active.count)) + 0.05 {
            return "This one was spread fairly evenly."
        }
        return nil
    }

    static func dominantCategory(for share: LoadShare) -> LoadCategory? {
        share.counts
            .filter { $0.value > 0 }
            .max { lhs, rhs in
                lhs.value == rhs.value ? lhs.key.rawValue > rhs.key.rawValue : lhs.value < rhs.value
            }?
            .key
    }
}
