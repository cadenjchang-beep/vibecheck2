import CloudKit
import Foundation
import SwiftData

/// Record types in the household zone. One type per model, one record per
/// object — the §2 requirement that two people checking off two different items
/// can never write the same record.
public enum TendRecordType {
    public static let event = "TendEvent"
    public static let listItem = "TendListItem"
    public static let task = "TendTask"
    public static let recipe = "TendRecipe"
    public static let mealPlanEntry = "TendMealPlanEntry"
    public static let member = "TendMember"
    public static let household = "TendHousehold"
}

/// Mirrors a **shared** household zone into the local SwiftData store.
///
/// SwiftData's automatic mirroring only covers the private database, so a
/// participant's copy of someone else's household is synced here instead, with
/// `CKSyncEngine` doing the change-token bookkeeping. The local store is the
/// same one the rest of the app reads, so views, widgets and the Watch app do
/// not know or care which half of the sync stack produced a row.
///
/// Conflict handling matches §2: per-item records mean genuine collisions are
/// rare, and where one does happen (the same event edited on two devices at
/// once) the server record wins and `lastModifiedBy` drives the quiet
/// "updated by Sam" line in the UI. No merge prompts.
public actor SharedZoneSyncEngine {

    private let container: CKContainer
    private let modelContainer: ModelContainer
    private var engine: CKSyncEngine?
    private let stateStore: SyncStateStore
    private let onIssue: @Sendable (SyncIssue) -> Void

    /// Set when a zone we were syncing vanishes — the resolver turns this into
    /// the read-only archive state rather than deleting anything.
    public private(set) var vanishedZones: Set<String> = []

    public init(
        modelContainer: ModelContainer,
        containerIdentifier: String = TendIdentifiers.cloudKitContainer,
        onIssue: @escaping @Sendable (SyncIssue) -> Void = { _ in }
    ) {
        self.modelContainer = modelContainer
        self.container = CKContainer(identifier: containerIdentifier)
        self.stateStore = SyncStateStore(key: "shared-zone-sync-state")
        self.onIssue = onIssue
    }

    public func start() async {
        guard engine == nil else { return }
        var configuration = CKSyncEngine.Configuration(
            database: container.sharedCloudDatabase,
            stateSerialization: stateStore.load(),
            delegate: SyncEngineDelegateBox(owner: self)
        )
        configuration.automaticallySync = true
        engine = CKSyncEngine(configuration)
        TendLog.sync.info("Shared-zone sync engine started.")
    }

    public func stop() {
        engine = nil
    }

    /// Called when a participant's local edit needs pushing back to the owner's
    /// zone. Ignored for read-only participants.
    public func recordChanged(recordID: CKRecord.ID) {
        engine?.state.add(pendingRecordZoneChanges: [.saveRecord(recordID)])
    }

    public func recordDeleted(recordID: CKRecord.ID) {
        engine?.state.add(pendingRecordZoneChanges: [.deleteRecord(recordID)])
    }

    // MARK: - Event handling

    fileprivate func handle(_ event: CKSyncEngine.Event) async {
        switch event {
        case .stateUpdate(let update):
            stateStore.save(update.stateSerialization)

        case .accountChange(let change):
            await handleAccountChange(change)

        case .fetchedRecordZoneChanges(let changes):
            await apply(changes)

        case .fetchedDatabaseChanges(let changes):
            for deletion in changes.deletions {
                // A deleted zone means we were removed, we left, or the owner
                // deleted the household. All three keep the local copy.
                vanishedZones.insert(deletion.zoneID.zoneName)
                TendLog.sharing.notice("Shared zone \(deletion.zoneID.zoneName) disappeared; keeping local copy read-only.")
                onIssue(.removedFromHousehold)
            }

        case .sentRecordZoneChanges(let sent):
            for failure in sent.failedRecordSaves {
                await handleSaveFailure(failure)
            }

        case .willFetchChanges, .didFetchChanges, .willSendChanges, .didSendChanges,
             .willFetchRecordZoneChanges, .didFetchRecordZoneChanges, .sentDatabaseChanges:
            break

        @unknown default:
            TendLog.sync.info("Unhandled CKSyncEngine event.")
        }
    }

    private func handleAccountChange(_ change: CKSyncEngine.Event.AccountChange) async {
        switch change.changeType {
        case .signOut, .switchAccounts:
            // Drop every token immediately. Reusing a token across accounts is
            // exactly how one person ends up seeing another's household.
            stateStore.clear()
            engine = nil
            TendLog.sync.notice("Account change; shared-zone sync state cleared.")
        case .signIn:
            await start()
        @unknown default:
            break
        }
    }

    private func handleSaveFailure(_ failure: (record: CKRecord, error: CKError)) async {
        switch CloudKitErrorPolicy.response(to: failure.error) {
        case .surfaceToUser(let issue):
            onIssue(issue)
        case .permanent(let reason) where reason == "serverRecordChanged":
            // Last-writer-wins: take the server's copy and let the UI attribute
            // it. Nothing to re-push.
            if let serverRecord = failure.error.serverRecord {
                await applyToStore([serverRecord], deletions: [])
            }
        case .retry, .retryWhenOnline:
            engine?.state.add(pendingRecordZoneChanges: [.saveRecord(failure.record.recordID)])
        case .permanent, .ignore:
            break
        }
    }

    private func apply(_ changes: CKSyncEngine.Event.FetchedRecordZoneChanges) async {
        await applyToStore(changes.modifications.map(\.record), deletions: changes.deletions.map(\.recordID))
    }

    // MARK: - Store application

    private func applyToStore(_ records: [CKRecord], deletions: [CKRecord.ID]) async {
        let context = ModelContext(modelContainer)
        for record in records {
            TendRecordMapper.apply(record, to: context)
        }
        for recordID in deletions {
            TendRecordMapper.delete(recordName: recordID.recordName, from: context)
        }
        do {
            try context.save()
        } catch {
            TendLog.sync.error("Failed to persist fetched changes: \(error.localizedDescription)")
        }
    }

    // MARK: - Outgoing batches

    fileprivate func nextBatch(
        _ context: CKSyncEngine.SendChangesContext,
        engine: CKSyncEngine
    ) async -> CKSyncEngine.RecordZoneChangeBatch? {
        let scope = context.options.scope
        let pending = engine.state.pendingRecordZoneChanges.filter { scope.contains($0) }
        guard !pending.isEmpty else { return nil }

        let modelContext = ModelContext(modelContainer)
        return await CKSyncEngine.RecordZoneChangeBatch(pendingChanges: pending) { recordID in
            TendRecordMapper.record(forRecordName: recordID.recordName, zoneID: recordID.zoneID, in: modelContext)
        }
    }
}

/// `CKSyncEngineDelegate` is not an actor protocol, so the delegate work hops
/// back onto the engine actor rather than reaching into the store from whatever
/// queue CloudKit used.
private final class SyncEngineDelegateBox: CKSyncEngineDelegate {
    private let owner: SharedZoneSyncEngine

    init(owner: SharedZoneSyncEngine) { self.owner = owner }

    func handleEvent(_ event: CKSyncEngine.Event, syncEngine: CKSyncEngine) async {
        await owner.handle(event)
    }

    func nextRecordZoneChangeBatch(
        _ context: CKSyncEngine.SendChangesContext,
        syncEngine: CKSyncEngine
    ) async -> CKSyncEngine.RecordZoneChangeBatch? {
        await owner.nextBatch(context, engine: syncEngine)
    }
}

/// Change tokens live in the app group so the widget and the Watch app resume
/// from the same point the app did.
struct SyncStateStore {
    let key: String

    private var defaults: UserDefaults {
        UserDefaults(suiteName: TendIdentifiers.appGroup) ?? .standard
    }

    func load() -> CKSyncEngine.State.Serialization? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(CKSyncEngine.State.Serialization.self, from: data)
    }

    func save(_ serialization: CKSyncEngine.State.Serialization) {
        guard let data = try? JSONEncoder().encode(serialization) else { return }
        defaults.set(data, forKey: key)
    }

    func clear() {
        defaults.removeObject(forKey: key)
    }
}
