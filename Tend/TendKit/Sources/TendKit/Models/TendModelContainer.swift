import Foundation
import SwiftData

/// Identifiers shared by every target. The app group is what lets the widget,
/// the Watch app and the share extension read and write the *same* store
/// rather than each keeping a private copy that has to be reconciled.
public enum TendIdentifiers {
    public static let appGroup = "group.com.tend.household"
    public static let cloudKitContainer = "iCloud.com.tend.household"
    public static let urlScheme = "tend"

    /// Background task identifiers, registered in Info.plist under
    /// `BGTaskSchedulerPermittedIdentifiers`.
    public static let pulseRefreshTask = "com.tend.household.pulse-refresh"
    public static let regionRefreshTask = "com.tend.household.region-refresh"

    /// Widget kinds — also the deep-link targets they open.
    public static let pulseWidgetKind = "TendPulseWidget"
    public static let listWidgetKind = "TendListWidget"
    public static let nextEventWidgetKind = "TendNextEventWidget"

    public static var storeURL: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appending(path: "Tend.store")
    }
}

/// Builds the app's `ModelContainer`.
///
/// The default configuration is SwiftData's automatic CloudKit mirroring
/// against the **private** database: offline-first, one CloudKit record per
/// model object, no backend to run. Cross-Apple-ID household sharing rides on
/// top of this via ``HouseholdShareController`` and ``SharedZoneSyncEngine`` —
/// see the note in `Sharing/HouseholdShareController.swift` for why the shared
/// database needs its own path on iOS 17.
public enum TendModelContainer {

    public enum Mode {
        /// Production: app-group store, CloudKit private-database mirroring.
        case cloudKit
        /// Local only — used when the user has no iCloud account, and in UI tests.
        case localOnly
        /// In-memory, for previews and unit tests.
        case ephemeral
    }

    public static func make(_ mode: Mode = .cloudKit) throws -> ModelContainer {
        let schema = TendSchema.current

        let configuration: ModelConfiguration
        switch mode {
        case .cloudKit:
            if let url = TendIdentifiers.storeURL {
                configuration = ModelConfiguration(
                    schema: schema,
                    url: url,
                    cloudKitDatabase: .private(TendIdentifiers.cloudKitContainer)
                )
            } else {
                // No app group container means a misconfigured build. Fall back
                // to a local store rather than trapping in front of a user.
                TendLog.sync.error("App group container unavailable; falling back to a local store.")
                configuration = ModelConfiguration(schema: schema, cloudKitDatabase: .none)
            }
        case .localOnly:
            configuration = ModelConfiguration(
                schema: schema,
                url: TendIdentifiers.storeURL ?? URL.applicationSupportDirectory.appending(path: "Tend.store"),
                cloudKitDatabase: .none
            )
        case .ephemeral:
            configuration = ModelConfiguration(
                schema: schema,
                isStoredInMemoryOnly: true,
                cloudKitDatabase: .none
            )
        }

        return try ModelContainer(
            for: schema,
            migrationPlan: TendMigrationPlan.self,
            configurations: [configuration]
        )
    }

    /// A container preloaded with a believable household. Every SwiftUI preview
    /// in the app uses this, which is also why previews cost nothing to keep
    /// current.
    @MainActor
    public static func preview() -> ModelContainer {
        // A preview that cannot build its container is a programmer error, and
        // failing loudly here is more useful than a blank canvas.
        let container = try! make(.ephemeral)
        SampleData.populate(container.mainContext)
        return container
    }
}
