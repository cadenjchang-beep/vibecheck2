import CloudKit
import Foundation

/// Where a given household's data actually lives, from this device's point of
/// view. Everything in the sharing layer keys off this rather than off a bare
/// boolean, because "shared" and "mine" behave differently in four places.
public enum HouseholdOwnership: Equatable, Sendable {
    case owner
    case participant(permission: CKShare.ParticipantPermission)
    case notShared

    public var canEdit: Bool {
        switch self {
        case .owner, .notShared: true
        case .participant(let permission): permission == .readWrite
        }
    }
}

public struct HouseholdParticipant: Identifiable, Equatable, Sendable {
    public let id: String
    public let displayName: String
    public let emailOrPhone: String?
    public let permission: CKShare.ParticipantPermission
    public let role: CKShare.ParticipantRole
    public let acceptanceStatus: CKShare.ParticipantAcceptanceStatus
    public let isCurrentUser: Bool

    public var hasAccepted: Bool { acceptanceStatus == .accepted }

    public var statusDescription: String {
        switch acceptanceStatus {
        case .accepted: role == .owner ? "Set up this household" : "Joined"
        case .pending: "Invited, hasn't joined yet"
        case .removed: "Removed"
        case .unknown: "Unknown"
        @unknown default: "Unknown"
        }
    }
}

public enum HouseholdShareError: LocalizedError {
    case noShareForHousehold
    case notOwner
    case cannotRemoveOwner
    case participantNotFound

    public var errorDescription: String? {
        switch self {
        case .noShareForHousehold: "This household hasn't been shared yet."
        case .notOwner: "Only the person who set up this household can change who's in it."
        case .cannotRemoveOwner: "The person who set up the household can't be removed from it."
        case .participantNotFound: "That person isn't part of this household."
        }
    }
}

/// Owns the `CKShare` lifecycle for a household.
///
/// ## Why sharing is driven explicitly
///
/// SwiftData's automatic mirroring (`cloudKitDatabase: .private(_:)`) covers
/// the **private** database only. Cross-Apple-ID household sharing needs a
/// `CKShare` on a custom zone plus a mirror of the **shared** database, and on
/// iOS 17 there is no SwiftData API for either. So the split is:
///
/// - SwiftData mirrors the owner's own copy to their private database, exactly
///   as §2 describes: offline-first, one record per model object, no backend.
/// - This controller owns the household's custom zone and its `CKShare`.
/// - ``SharedZoneSyncEngine`` mirrors the shared zone into the same local
///   SwiftData store for participants.
///
/// Sharing is **zone-wide** (`CKShare(recordZoneID:)`) rather than per-record.
/// That is what makes "everything in this household is shared, one record per
/// item" true without hanging every event and list item off a share root.
public actor HouseholdShareController {

    private let container: CKContainer
    private var privateDatabase: CKDatabase { container.privateCloudDatabase }
    private var sharedDatabase: CKDatabase { container.sharedCloudDatabase }

    public init(containerIdentifier: String = TendIdentifiers.cloudKitContainer) {
        self.container = CKContainer(identifier: containerIdentifier)
    }

    // MARK: - Zone lifecycle

    /// Creates the household's zone if it isn't there yet. Idempotent — calling
    /// it on every launch is the intended usage.
    @discardableResult
    public func ensureZone(named zoneName: String) async throws -> CKRecordZone {
        let zone = CKRecordZone(zoneName: zoneName)
        do {
            return try await privateDatabase.save(zone)
        } catch let error as CKError where error.code == .serverRecordChanged {
            // Already exists — that is the success case for an idempotent call.
            return zone
        }
    }

    // MARK: - Creating and fetching the share

    /// Returns the household's share, creating it on first invite.
    ///
    /// The returned `CKShare` is handed straight to `UICloudSharingController`
    /// so the invite goes out through the native share sheet, with Apple's own
    /// wording about what access means — plus Tend's plain-language disclosure
    /// shown immediately before it (§8).
    public func share(forZoneNamed zoneName: String, householdName: String) async throws -> CKShare {
        let zone = try await ensureZone(named: zoneName)

        if let existing = try await existingShare(for: zone.zoneID) {
            return existing
        }

        let share = CKShare(recordZoneID: zone.zoneID)
        share[CKShare.SystemFieldKey.title] = householdName as CKRecordValue
        share[CKShare.SystemFieldKey.shareType] = "com.tend.household" as CKRecordValue
        // Invite-only. A household is never discoverable by link alone.
        share.publicPermission = .none

        let (saveResults, _) = try await privateDatabase.modifyRecords(saving: [share], deleting: [])
        guard let result = saveResults[share.recordID] else { throw HouseholdShareError.noShareForHousehold }
        let saved = try result.get()
        guard let savedShare = saved as? CKShare else { throw HouseholdShareError.noShareForHousehold }
        return savedShare
    }

    public func existingShare(for zoneID: CKRecordZone.ID) async throws -> CKShare? {
        let shareID = CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: zoneID)
        do {
            return try await privateDatabase.record(for: shareID) as? CKShare
        } catch let error as CKError where error.code == .unknownItem || error.code == .zoneNotFound {
            return nil
        }
    }

    /// Looks in both databases, because a participant's copy of the household
    /// lives in the shared database and has no private-database zone at all.
    public func resolveOwnership(zoneName: String) async throws -> HouseholdOwnership {
        let currentUserID = try await container.userRecordID()

        if let privateShare = try await existingShare(
            for: CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
        ) {
            return privateShare.owner.userIdentity.userRecordID == currentUserID ? .owner : .notShared
        }

        for zone in try await sharedDatabase.allRecordZones() where zone.zoneName == zoneName {
            let shareID = CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: zone.zoneID)
            if let share = try? await sharedDatabase.record(for: shareID) as? CKShare,
               let me = share.participants.first(where: { $0.userIdentity.userRecordID == currentUserID }) {
                return .participant(permission: me.permission)
            }
        }

        return .notShared
    }

    // MARK: - Participants

    public func participants(forZoneNamed zoneName: String) async throws -> [HouseholdParticipant] {
        let currentUserID = try await container.userRecordID()
        let share = try await anyShare(forZoneNamed: zoneName)
        guard let share else { return [] }

        return share.participants.map { participant in
            let identity = participant.userIdentity
            let components = identity.nameComponents
            let name = components.map { PersonNameComponentsFormatter().string(from: $0) } ?? ""
            return HouseholdParticipant(
                id: identity.userRecordID?.recordName ?? UUID().uuidString,
                displayName: name.isEmpty ? (identity.lookupInfo?.emailAddress ?? "Invited") : name,
                emailOrPhone: identity.lookupInfo?.emailAddress ?? identity.lookupInfo?.phoneNumber,
                permission: participant.permission,
                role: participant.role,
                acceptanceStatus: participant.acceptanceStatus,
                isCurrentUser: identity.userRecordID == currentUserID
            )
        }
    }

    /// Owner-side removal. The participant's device finds the zone gone on its
    /// next sync and switches to the read-only archive state — see
    /// ``HouseholdMembershipResolver``.
    public func removeParticipant(id participantID: String, fromZoneNamed zoneName: String) async throws {
        let zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
        guard let share = try await existingShare(for: zoneID) else {
            throw HouseholdShareError.noShareForHousehold
        }

        guard let participant = share.participants.first(where: {
            $0.userIdentity.userRecordID?.recordName == participantID
        }) else {
            throw HouseholdShareError.participantNotFound
        }
        guard participant.role != .owner else { throw HouseholdShareError.cannotRemoveOwner }

        share.removeParticipant(participant)
        _ = try await privateDatabase.modifyRecords(saving: [share], deleting: [])
        TendLog.sharing.notice("Removed participant from household zone \(zoneName).")
    }

    public func setPermission(
        _ permission: CKShare.ParticipantPermission,
        forParticipant participantID: String,
        inZoneNamed zoneName: String
    ) async throws {
        let zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
        guard let share = try await existingShare(for: zoneID) else {
            throw HouseholdShareError.noShareForHousehold
        }
        guard let participant = share.participants.first(where: {
            $0.userIdentity.userRecordID?.recordName == participantID
        }) else {
            throw HouseholdShareError.participantNotFound
        }
        participant.permission = permission
        _ = try await privateDatabase.modifyRecords(saving: [share], deleting: [])
    }

    // MARK: - Joining and leaving

    /// Accepts an invite. Called from the scene delegate's
    /// `userDidAcceptCloudKitShareWith:` and from the share-URL deep link.
    @discardableResult
    public func accept(_ metadata: CKShare.Metadata) async throws -> CKShare.Metadata {
        let accepted = try await container.accept(metadata)
        TendLog.sharing.notice("Accepted household share.")
        return accepted
    }

    /// Participant-side leave. Deleting our copy of the share record removes
    /// this device from the household without touching the owner's data.
    ///
    /// The local SwiftData copy is deliberately **not** deleted here — the
    /// caller flips `isReadOnlyArchive` instead. §6 is explicit that leaving
    /// must never look like data loss.
    public func leaveHousehold(zoneNamed zoneName: String) async throws {
        for zone in try await sharedDatabase.allRecordZones() where zone.zoneName == zoneName {
            let shareID = CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: zone.zoneID)
            do {
                _ = try await sharedDatabase.deleteRecord(withID: shareID)
                TendLog.sharing.notice("Left household zone \(zoneName).")
                return
            } catch let error as CKError where error.code == .unknownItem {
                // Already gone — the owner removed us first. Same outcome.
                return
            }
        }
    }

    /// Owner-side teardown: stops sharing entirely and keeps the data private.
    public func stopSharing(zoneNamed zoneName: String) async throws {
        let zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
        guard let share = try await existingShare(for: zoneID) else { return }
        _ = try await privateDatabase.modifyRecords(saving: [], deleting: [share.recordID])
        TendLog.sharing.notice("Stopped sharing household zone \(zoneName).")
    }

    // MARK: - Helpers

    private func anyShare(forZoneNamed zoneName: String) async throws -> CKShare? {
        if let owned = try await existingShare(
            for: CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
        ) {
            return owned
        }
        for zone in try await sharedDatabase.allRecordZones() where zone.zoneName == zoneName {
            let shareID = CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: zone.zoneID)
            if let share = try? await sharedDatabase.record(for: shareID) as? CKShare { return share }
        }
        return nil
    }
}
