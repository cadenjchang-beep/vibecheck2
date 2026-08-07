import Foundation

/// One routing scheme shared by the app, both widget families, the Live
/// Activity, the Watch complications and the share extension.
///
/// The rule the brief sets, kept honest by this type: nothing deep-links to
/// "open the app". A widget showing an item opens *that item*; a notification
/// about Tuesday's dentist appointment opens *that event*.
public enum DeepLink: Equatable, Hashable, Sendable {
    case pulse(PulseKind?)
    case load
    case calendar(date: Date?)
    case event(id: UUID, occurrence: Date?)
    case list(name: String)
    case listItem(id: UUID, listName: String?)
    case task(id: UUID)
    case tasks
    case meals(week: Date?)
    case recipe(id: UUID)
    case quickAdd(text: String?)
    case shoppingTrip(listName: String)
    case settings
    case household

    // MARK: - Encoding

    public var url: URL {
        var components = URLComponents()
        components.scheme = TendIdentifiers.urlScheme

        switch self {
        case .pulse(let kind):
            components.host = "pulse"
            if let kind { components.queryItems = [.init(name: "kind", value: kind.rawValue)] }
        case .load:
            components.host = "load"
        case .calendar(let date):
            components.host = "calendar"
            if let date { components.queryItems = [.init(name: "date", value: Self.stamp(date))] }
        case .event(let id, let occurrence):
            components.host = "event"
            components.path = "/\(id.uuidString)"
            if let occurrence {
                components.queryItems = [.init(name: "occurrence", value: Self.stamp(occurrence))]
            }
        case .list(let name):
            components.host = "list"
            components.path = "/\(name)"
        case .listItem(let id, let listName):
            components.host = "item"
            components.path = "/\(id.uuidString)"
            if let listName { components.queryItems = [.init(name: "list", value: listName)] }
        case .task(let id):
            components.host = "task"
            components.path = "/\(id.uuidString)"
        case .tasks:
            components.host = "tasks"
        case .meals(let week):
            components.host = "meals"
            if let week { components.queryItems = [.init(name: "week", value: Self.stamp(week))] }
        case .recipe(let id):
            components.host = "recipe"
            components.path = "/\(id.uuidString)"
        case .quickAdd(let text):
            components.host = "quickadd"
            if let text { components.queryItems = [.init(name: "text", value: text)] }
        case .shoppingTrip(let listName):
            components.host = "trip"
            components.path = "/\(listName)"
        case .settings:
            components.host = "settings"
        case .household:
            components.host = "household"
        }

        // Every case above sets a host, so this is unreachable in practice;
        // returning the bare scheme keeps the property non-optional for call
        // sites (widgets take a `URL`, not a `URL?`).
        return components.url ?? URL(string: "\(TendIdentifiers.urlScheme)://")!
    }

    // MARK: - Decoding

    public init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == TendIdentifiers.urlScheme,
              let host = components.host?.lowercased()
        else { return nil }

        let segments = components.path.split(separator: "/").map(String.init)
        let first = segments.first
        func query(_ name: String) -> String? {
            components.queryItems?.first { $0.name == name }?.value
        }

        switch host {
        case "pulse":
            self = .pulse(query("kind").flatMap(PulseKind.init(rawValue:)))
        case "load":
            self = .load
        case "calendar":
            self = .calendar(date: query("date").flatMap(Self.date(from:)))
        case "event":
            guard let id = first.flatMap(UUID.init(uuidString:)) else { return nil }
            self = .event(id: id, occurrence: query("occurrence").flatMap(Self.date(from:)))
        case "list":
            guard let name = first?.removingPercentEncoding, !name.isEmpty else { return nil }
            self = .list(name: name)
        case "item":
            guard let id = first.flatMap(UUID.init(uuidString:)) else { return nil }
            self = .listItem(id: id, listName: query("list"))
        case "task":
            guard let id = first.flatMap(UUID.init(uuidString:)) else { return nil }
            self = .task(id: id)
        case "tasks":
            self = .tasks
        case "meals":
            self = .meals(week: query("week").flatMap(Self.date(from:)))
        case "recipe":
            guard let id = first.flatMap(UUID.init(uuidString:)) else { return nil }
            self = .recipe(id: id)
        case "quickadd":
            self = .quickAdd(text: query("text"))
        case "trip":
            guard let name = first?.removingPercentEncoding, !name.isEmpty else { return nil }
            self = .shoppingTrip(listName: name)
        case "settings":
            self = .settings
        case "household":
            self = .household
        default:
            return nil
        }
    }

    /// The tab a link lands on, so the router can switch context before
    /// pushing detail.
    public var tab: TendTab {
        switch self {
        case .pulse, .load: .pulse
        case .calendar, .event: .calendar
        case .list, .listItem, .shoppingTrip: .lists
        case .task, .tasks: .tasks
        case .meals, .recipe: .meals
        case .quickAdd, .settings, .household: .pulse
        }
    }

    // MARK: - Date stamps

    private static let stampFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func stamp(_ date: Date) -> String { stampFormatter.string(from: date) }
    static func date(from stamp: String) -> Date? { stampFormatter.date(from: stamp) }
}

public enum TendTab: String, CaseIterable, Hashable, Sendable, Identifiable {
    case pulse, calendar, lists, tasks, meals

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .pulse: "Pulse"
        case .calendar: "Calendar"
        case .lists: "Lists"
        case .tasks: "Tasks"
        case .meals: "Meals"
        }
    }

    public var systemImage: String {
        switch self {
        case .pulse: "waveform.path.ecg"
        case .calendar: "calendar"
        case .lists: "checklist"
        case .tasks: "checkmark.circle"
        case .meals: "fork.knife"
        }
    }
}
