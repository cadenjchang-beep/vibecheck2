import Foundation
import Observation
import SwiftData

/// App-wide state that isn't persisted: which household and member this device
/// is acting as, what sync is doing, and where the router currently points.
///
/// Uses the iOS 17 `@Observable` macro rather than `ObservableObject`, so views
/// only invalidate on the properties they actually read — which matters on the
/// calendar, where a sync-status change must not redraw a month grid.
@Observable
@MainActor
public final class HouseholdContext {

    // MARK: - Identity

    public var currentHouseholdID: UUID? {
        didSet { persistIdentity() }
    }

    /// Which member this device is. Every completion is attributed to this ID,
    /// which is the whole basis of Load View, so it is chosen during onboarding
    /// and changeable in Settings.
    public var currentMemberID: UUID? {
        didSet { persistIdentity() }
    }

    public private(set) var membershipState: HouseholdMembershipState = .active(.notShared)
    public private(set) var accountState: CloudAccountState = .unknown
    public var syncIssue: SyncIssue?
    public var pendingSyncCount: Int = 0

    // MARK: - Routing

    public var selectedTab: TendTab = .pulse
    public var calendarPath: [DeepLink] = []
    public var listsPath: [DeepLink] = []
    public var tasksPath: [DeepLink] = []
    public var mealsPath: [DeepLink] = []
    public var pulsePath: [DeepLink] = []
    public var quickAddText: String?
    public var isQuickAddPresented = false

    // MARK: - Privacy

    public var isLocked = false
    public var lockedSections: Set<TendTab> = []

    private let defaults: UserDefaults

    public init(defaults: UserDefaults? = nil) {
        self.defaults = defaults ?? UserDefaults(suiteName: TendIdentifiers.appGroup) ?? .standard
        self.currentHouseholdID = self.defaults.string(forKey: Keys.householdID).flatMap(UUID.init(uuidString:))
        self.currentMemberID = self.defaults.string(forKey: Keys.memberID).flatMap(UUID.init(uuidString:))
    }

    private enum Keys {
        static let householdID = "tend.currentHouseholdID"
        static let memberID = "tend.currentMemberID"
    }

    private func persistIdentity() {
        defaults.set(currentHouseholdID?.uuidString, forKey: Keys.householdID)
        // The widget and the Watch app read this to attribute their own
        // check-offs, which is why it lives in the app group rather than in
        // standard defaults.
        defaults.set(currentMemberID?.uuidString, forKey: Keys.memberID)
    }

    /// Reads the acting member without a full context — used by the widget
    /// intent and the Watch app, which have no `HouseholdContext`.
    public static func storedMemberID() -> UUID? {
        let defaults = UserDefaults(suiteName: TendIdentifiers.appGroup) ?? .standard
        return defaults.string(forKey: Keys.memberID).flatMap(UUID.init(uuidString:))
    }

    // MARK: - State transitions

    public func update(membership: HouseholdMembershipState) {
        membershipState = membership
        if case .readOnlyArchive = membership {
            // Stop pretending anything is in flight; there is nothing left to
            // sync and a spinner here would read as "trying to recover".
            pendingSyncCount = 0
        }
    }

    public func update(account: CloudAccountState) {
        accountState = account
        switch account {
        case .noAccount:
            syncIssue = .notSignedIn
        case .restricted:
            syncIssue = .accountRestricted
        case .available, .temporarilyUnavailable, .unknown:
            if syncIssue == .notSignedIn || syncIssue == .accountRestricted { syncIssue = nil }
        }
    }

    /// Called when the signed-in Apple ID changes mid-session. Everything
    /// identity-shaped is dropped before any view can read it again.
    public func resetForAccountSwitch() {
        currentHouseholdID = nil
        currentMemberID = nil
        membershipState = .active(.notShared)
        calendarPath = []
        listsPath = []
        tasksPath = []
        mealsPath = []
        pulsePath = []
        TendLog.sync.notice("Cleared in-memory household identity after account switch.")
    }

    // MARK: - Deep links

    public func open(_ link: DeepLink) {
        selectedTab = link.tab

        switch link {
        case .quickAdd(let text):
            quickAddText = text
            isQuickAddPresented = true
        case .pulse, .tasks, .settings, .household, .load:
            path(for: link.tab).wrappedValue = link == .load ? [link] : []
        default:
            path(for: link.tab).wrappedValue = [link]
        }
    }

    private func path(for tab: TendTab) -> Binding<[DeepLink]> {
        switch tab {
        case .calendar: Binding(get: { self.calendarPath }, set: { self.calendarPath = $0 })
        case .lists: Binding(get: { self.listsPath }, set: { self.listsPath = $0 })
        case .tasks: Binding(get: { self.tasksPath }, set: { self.tasksPath = $0 })
        case .meals: Binding(get: { self.mealsPath }, set: { self.mealsPath = $0 })
        case .pulse: Binding(get: { self.pulsePath }, set: { self.pulsePath = $0 })
        }
    }

    /// Minimal binding shim so this type stays free of SwiftUI.
    public struct Binding<Value> {
        let get: () -> Value
        let set: (Value) -> Void
        public var wrappedValue: Value {
            get { get() }
            nonmutating set { set(newValue) }
        }
    }

    // MARK: - Convenience

    public func currentMember(in context: ModelContext) -> Member? {
        guard let currentMemberID else { return nil }
        var descriptor = FetchDescriptor<Member>(predicate: #Predicate { $0.id == currentMemberID })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    public func household(in context: ModelContext) -> Household? {
        if let currentHouseholdID {
            var descriptor = FetchDescriptor<Household>(predicate: #Predicate { $0.id == currentHouseholdID })
            descriptor.fetchLimit = 1
            if let found = (try? context.fetch(descriptor))?.first { return found }
        }
        // Falling back to "the only household there is" keeps a fresh install
        // working before onboarding has written the identity.
        return (try? context.fetch(FetchDescriptor<Household>()))?.first
    }
}
