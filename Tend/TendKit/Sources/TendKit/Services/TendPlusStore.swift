import Foundation
import Observation
import StoreKit

/// What Tend+ unlocks. Everything a household needs to run is outside this
/// list — §10 is explicit that the free tier is fully functional, and a
/// paywall in front of "add an event" would undercut the entire premise.
public enum TendPlusFeature: String, CaseIterable, Sendable, Identifiable {
    case multipleHouseholds
    case customIcons
    case nutrition
    case priorityWidgetRefresh

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .multipleHouseholds: "More than one household"
        case .customIcons: "App icons and themes"
        case .nutrition: "Nutrition in meal planning"
        case .priorityWidgetRefresh: "Priority widget refresh"
        }
    }

    public var detail: String {
        switch self {
        case .multipleHouseholds: "Keep a second household separate — co-parenting, a shared house, grandparents."
        case .customIcons: "Pick an icon and accent that suit your Home Screen."
        case .nutrition: "See calories and macros alongside the week's meals."
        case .priorityWidgetRefresh: "Widgets update as often as iOS allows."
        }
    }

    public var systemImage: String {
        switch self {
        case .multipleHouseholds: "house.and.flag"
        case .customIcons: "paintpalette"
        case .nutrition: "chart.bar"
        case .priorityWidgetRefresh: "bolt"
        }
    }
}

/// StoreKit 2. No receipt server, no third-party SDK — `Transaction.currentEntitlements`
/// is the source of truth and it works offline against the on-device receipt.
@Observable
@MainActor
public final class TendPlusStore {

    public static let monthlyID = "com.tend.household.plus.monthly"
    public static let yearlyID = "com.tend.household.plus.yearly"
    public static let lifetimeID = "com.tend.household.plus.lifetime"

    public private(set) var products: [Product] = []
    public private(set) var isSubscribed = false
    public private(set) var isLoading = false
    public var purchaseError: String?

    private var updatesTask: Task<Void, Never>?

    public init() {}

    public func start() {
        // Listening for transactions before loading products matters: a
        // purchase completed on another device arrives here, not in a response
        // to a call we made.
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                guard case .verified(let transaction) = update else { continue }
                await transaction.finish()
                await self?.refreshEntitlements()
            }
        }
        Task {
            await loadProducts()
            await refreshEntitlements()
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    public func loadProducts() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let identifiers = [Self.monthlyID, Self.yearlyID, Self.lifetimeID]
            products = try await Product.products(for: identifiers)
                .sorted { $0.price < $1.price }
        } catch {
            TendLog.sync.error("Could not load products: \(error.localizedDescription)")
        }
    }

    public func refreshEntitlements() async {
        var entitled = false
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if transaction.revocationDate == nil {
                entitled = true
            }
        }
        isSubscribed = entitled
    }

    public func purchase(_ product: Product) async {
        purchaseError = nil
        do {
            switch try await product.purchase() {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    purchaseError = "That purchase couldn't be verified."
                    return
                }
                await transaction.finish()
                await refreshEntitlements()
            case .userCancelled, .pending:
                break
            @unknown default:
                break
            }
        } catch {
            purchaseError = error.localizedDescription
        }
    }

    public func restore() async {
        do {
            try await AppStore.sync()
            await refreshEntitlements()
        } catch {
            purchaseError = error.localizedDescription
        }
    }

    public func isUnlocked(_ feature: TendPlusFeature) -> Bool {
        isSubscribed
    }
}
