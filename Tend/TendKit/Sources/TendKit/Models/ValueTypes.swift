import Foundation
import OSLog

public enum TendLog {
    public static let sync = Logger(subsystem: "com.tend.household", category: "sync")
    public static let sharing = Logger(subsystem: "com.tend.household", category: "sharing")
    public static let pulse = Logger(subsystem: "com.tend.household", category: "pulse")
    public static let parser = Logger(subsystem: "com.tend.household", category: "parser")
    public static let location = Logger(subsystem: "com.tend.household", category: "location")
}

public enum MealType: String, CaseIterable, Codable, Sendable, Identifiable {
    case breakfast, lunch, dinner, other

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .breakfast: "Breakfast"
        case .lunch: "Lunch"
        case .dinner: "Dinner"
        case .other: "Other"
        }
    }

    public var systemImage: String {
        switch self {
        case .breakfast: "sunrise"
        case .lunch: "sun.max"
        case .dinner: "moon.stars"
        case .other: "fork.knife"
        }
    }
}

public enum PulseKind: String, Codable, Sendable {
    case morning
    case weekly
}

/// The three-way split EventKit trained everyone to expect. Modelled
/// explicitly rather than inferred, because guessing here is exactly the bug
/// that quietly rewrites someone's whole soccer season.
public enum RecurrenceEditScope: String, CaseIterable, Codable, Sendable, Identifiable {
    case single = "single"
    case future = "future"
    case all = "all"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .single: "This event only"
        case .future: "This and all future events"
        case .all: "All events in the series"
        }
    }
}

public enum TaskPriority: Int, CaseIterable, Codable, Sendable, Identifiable {
    case none = 0, low = 1, medium = 2, high = 3

    public var id: Int { rawValue }

    public var title: String {
        switch self {
        case .none: "No priority"
        case .low: "Low"
        case .medium: "Medium"
        case .high: "High"
        }
    }

    public var systemImage: String? {
        switch self {
        case .none: nil
        case .low: "arrow.down"
        case .medium: "equal"
        case .high: "exclamationmark.2"
        }
    }
}

/// Well-known list names. Users can make any list they like; these are the ones
/// the app has opinions about (Groceries gets aisle categorisation).
public enum TendList {
    public static let groceries = "Groceries"
    public static let household = "Household"
    public static let defaults = [groceries, household]
}
