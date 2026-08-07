#if canImport(ActivityKit) && os(iOS)
import ActivityKit
import Foundation

/// Live Activity for an in-progress shop: "3 items left at Trader Joe's" on the
/// Lock Screen and in the Dynamic Island.
///
/// The shape of the data matters here. The activity carries counts and a list
/// name, not the items themselves — a Live Activity is visible on a locked
/// screen, and a household's grocery list is nobody else's business.
public struct ShoppingTripAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var remaining: Int
        public var total: Int
        public var lastCheckedOff: String?

        public init(remaining: Int, total: Int, lastCheckedOff: String? = nil) {
            self.remaining = remaining
            self.total = total
            self.lastCheckedOff = lastCheckedOff
        }

        public var progress: Double {
            total > 0 ? Double(total - remaining) / Double(total) : 0
        }
    }

    public var listName: String
    public var storeName: String?

    public init(listName: String, storeName: String? = nil) {
        self.listName = listName
        self.storeName = storeName
    }
}

public enum ShoppingTripActivity {

    public static var current: Activity<ShoppingTripAttributes>? {
        Activity<ShoppingTripAttributes>.activities.first
    }

    @discardableResult
    public static func start(listName: String, remaining: Int, storeName: String? = nil) -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        guard current == nil else {
            update(remaining: remaining, total: remaining)
            return true
        }

        do {
            _ = try Activity.request(
                attributes: ShoppingTripAttributes(listName: listName, storeName: storeName),
                content: .init(
                    state: .init(remaining: remaining, total: remaining),
                    // A shop is not an all-day thing. Staleness after four
                    // hours means a forgotten activity fades instead of sitting
                    // on the Lock Screen until tomorrow.
                    staleDate: Date().addingTimeInterval(4 * 3600)
                )
            )
            return true
        } catch {
            TendLog.sync.error("Could not start the shopping Live Activity: \(error.localizedDescription)")
            return false
        }
    }

    public static func update(remaining: Int, total: Int, lastCheckedOff: String? = nil) {
        guard let activity = current else { return }
        Task {
            await activity.update(
                .init(
                    state: .init(remaining: remaining, total: total, lastCheckedOff: lastCheckedOff),
                    staleDate: Date().addingTimeInterval(4 * 3600)
                )
            )
            if remaining == 0 { await end() }
        }
    }

    public static func end() async {
        guard let activity = current else { return }
        await activity.end(nil, dismissalPolicy: .after(.now.addingTimeInterval(60)))
    }
}
#endif
