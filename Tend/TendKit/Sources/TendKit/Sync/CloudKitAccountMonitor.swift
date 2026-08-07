import CloudKit
import Foundation
import Observation

public enum CloudAccountState: Equatable, Sendable {
    case unknown
    case available(userRecordName: String)
    case noAccount
    case restricted
    case temporarilyUnavailable

    public var isAvailable: Bool {
        if case .available = self { return true }
        return false
    }

    public var userRecordName: String? {
        if case .available(let name) = self { return name }
        return nil
    }
}

/// Watches the iCloud account underneath the app.
///
/// The case §6 calls out — a device switching iCloud accounts mid-session — is
/// not exotic: it happens on shared family iPads and on any device being handed
/// down. Getting it wrong means showing one person another person's household.
/// So the rule here is absolute: **when the user record name changes, every
/// resolved household is discarded before anything is displayed.**
@Observable
@MainActor
public final class CloudKitAccountMonitor {

    public private(set) var state: CloudAccountState = .unknown
    /// Set when the signed-in Apple ID changes while the app is running.
    public private(set) var didSwitchAccounts = false

    private let container: CKContainer
    private var observationTask: Task<Void, Never>?
    private var lastKnownUserRecordName: String?

    /// Called with the new user record name (or `nil`) whenever membership has
    /// to be re-resolved. The app wires this to ``HouseholdMembershipResolver``.
    public var onAccountChange: ((String?) async -> Void)?

    public init(containerIdentifier: String = TendIdentifiers.cloudKitContainer) {
        self.container = CKContainer(identifier: containerIdentifier)
    }

    public func start() {
        guard observationTask == nil else { return }
        observationTask = Task { [weak self] in
            await self?.refresh()
            let notifications = NotificationCenter.default.notifications(named: .CKAccountChanged)
            for await _ in notifications {
                guard let self else { return }
                TendLog.sync.info("CKAccountChanged received; re-resolving membership.")
                await self.refresh()
            }
        }
    }

    public func stop() {
        observationTask?.cancel()
        observationTask = nil
    }

    public func refresh() async {
        let status: CKAccountStatus
        do {
            status = try await container.accountStatus()
        } catch {
            TendLog.sync.error("accountStatus failed: \(error.localizedDescription)")
            state = .unknown
            return
        }

        switch status {
        case .available:
            do {
                let recordID = try await container.userRecordID()
                await apply(userRecordName: recordID.recordName)
            } catch {
                // Signed in but the user record is unreachable — treat as
                // temporarily unavailable rather than as a different account,
                // which would wrongly wipe resolved households.
                TendLog.sync.error("userRecordID failed: \(error.localizedDescription)")
                state = .temporarilyUnavailable
            }
        case .noAccount:
            await apply(userRecordName: nil)
            state = .noAccount
        case .restricted:
            await apply(userRecordName: nil)
            state = .restricted
        case .couldNotDetermine, .temporarilyUnavailable:
            state = .temporarilyUnavailable
        @unknown default:
            state = .unknown
        }
    }

    private func apply(userRecordName: String?) async {
        let changed = lastKnownUserRecordName != nil && lastKnownUserRecordName != userRecordName
        if changed {
            didSwitchAccounts = true
            TendLog.sync.notice("iCloud account changed; discarding resolved households.")
        }
        lastKnownUserRecordName = userRecordName

        if let userRecordName {
            state = .available(userRecordName: userRecordName)
        }

        // Always re-resolve, even on the first pass: the account may have
        // changed while the app was suspended, which produces no notification.
        await onAccountChange?(userRecordName)
    }

    public func acknowledgeAccountSwitch() {
        didSwitchAccounts = false
    }
}
