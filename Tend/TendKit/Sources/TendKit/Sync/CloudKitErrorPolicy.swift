import CloudKit
import Foundation

/// What the app should do about a failed CloudKit operation.
///
/// §6 treats this as required rather than polish, and it is: a family app that
/// silently drops "add milk to the list" once is a family app nobody trusts
/// again. Every branch below either retries, surfaces something honest, or is
/// explicitly a no-op — none of them discard work quietly.
public enum SyncFailureResponse: Equatable, Sendable {
    /// Try again after a delay (throttling, zone busy, service unavailable).
    case retry(after: TimeInterval)
    /// Hold the work until the device is back online.
    case retryWhenOnline
    /// The user has to do something — there is no retry that fixes it.
    case surfaceToUser(SyncIssue)
    /// The operation can never succeed as written; the local write stands.
    case permanent(reason: String)
    /// Expected and harmless (e.g. deleting something already gone).
    case ignore
}

/// User-facing sync problems. Deliberately few, and every one has a sentence a
/// person can act on.
public enum SyncIssue: String, Equatable, Sendable, Identifiable {
    case notSignedIn
    case iCloudStorageFull
    case accountRestricted
    case shareUnavailable
    case removedFromHousehold
    case incompatibleVersion

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .notSignedIn: "Sign in to iCloud to sync"
        case .iCloudStorageFull: "iCloud storage is full"
        case .accountRestricted: "iCloud is restricted on this device"
        case .shareUnavailable: "This household is no longer available"
        case .removedFromHousehold: "You've left this household"
        case .incompatibleVersion: "Update Tend to keep syncing"
        }
    }

    public var message: String {
        switch self {
        case .notSignedIn:
            "Tend keeps working on this device. Sign in to iCloud in Settings to share with your household again."
        case .iCloudStorageFull:
            "New changes are saved on this device but can't sync until there's room in iCloud. Nothing has been lost."
        case .accountRestricted:
            "A device restriction is blocking iCloud. Tend will keep everything locally until that changes."
        case .shareUnavailable:
            "The invite link has expired or been turned off. Ask whoever set up the household for a new one."
        case .removedFromHousehold:
            "Your copy stays on this device, read-only. Nothing was deleted."
        case .incompatibleVersion:
            "Someone in your household is on a newer version of Tend. Update to see their changes."
        }
    }

    public var isBlocking: Bool {
        switch self {
        case .notSignedIn, .accountRestricted: false
        case .iCloudStorageFull, .shareUnavailable, .removedFromHousehold, .incompatibleVersion: true
        }
    }
}

public enum CloudKitErrorPolicy {

    /// Base delay for exponential backoff, doubled per attempt and capped.
    public static let baseRetryDelay: TimeInterval = 2
    public static let maxRetryDelay: TimeInterval = 120

    public static func response(to error: Error, attempt: Int = 0) -> SyncFailureResponse {
        guard let ckError = error as? CKError else {
            // Non-CloudKit errors reaching the sync layer are bugs, not network
            // conditions. Keep the local write and log loudly.
            TendLog.sync.error("Non-CKError from CloudKit path: \(String(describing: error))")
            return .permanent(reason: error.localizedDescription)
        }

        // CloudKit's own suggestion always wins — it knows about server-side
        // throttling windows we can't see.
        if let suggested = ckError.retryAfterSeconds {
            return .retry(after: min(suggested, maxRetryDelay))
        }

        switch ckError.code {
        case .networkUnavailable, .networkFailure:
            // Queue and retry. Never surfaced as a failure — offline is a
            // normal state for this app, not an error.
            return .retryWhenOnline

        case .serviceUnavailable, .requestRateLimited, .zoneBusy:
            return .retry(after: backoff(attempt: attempt))

        case .quotaExceeded:
            return .surfaceToUser(.iCloudStorageFull)

        case .notAuthenticated:
            return .surfaceToUser(.notSignedIn)

        case .managedAccountRestricted, .permissionFailure:
            return .surfaceToUser(.accountRestricted)

        case .participantMayNeedVerification:
            return .surfaceToUser(.shareUnavailable)

        case .userDeletedZone, .zoneNotFound:
            // The owner deleted the shared zone, or we were removed from it.
            return .surfaceToUser(.removedFromHousehold)

        case .unknownItem:
            // Deleting something already gone, or fetching a record another
            // device removed. Both are fine.
            return .ignore

        case .serverRecordChanged:
            // Last-writer-wins by design (§2). The caller re-applies its change
            // onto the server record and the UI shows "updated by …".
            return .permanent(reason: "serverRecordChanged")

        case .incompatibleVersion:
            return .surfaceToUser(.incompatibleVersion)

        case .limitExceeded:
            // The batch was too big. The caller halves it and retries.
            return .retry(after: 0)

        case .partialFailure:
            return partialFailureResponse(ckError, attempt: attempt)

        case .changeTokenExpired:
            // Server history was truncated; the caller re-syncs the zone from
            // scratch rather than trusting a stale token.
            return .permanent(reason: "changeTokenExpired")

        default:
            TendLog.sync.error("Unhandled CKError \(ckError.code.rawValue): \(ckError.localizedDescription)")
            return .retry(after: backoff(attempt: attempt))
        }
    }

    /// A partial failure is only as bad as its worst part. Retryable beats
    /// user-facing beats permanent, so one throttled record does not tear down
    /// a whole batch.
    private static func partialFailureResponse(_ error: CKError, attempt: Int) -> SyncFailureResponse {
        guard let partials = error.partialErrorsByItemID, !partials.isEmpty else {
            return .retry(after: backoff(attempt: attempt))
        }

        var worst: SyncFailureResponse = .ignore
        for (_, itemError) in partials {
            let response = self.response(to: itemError, attempt: attempt)
            if severity(of: response) > severity(of: worst) { worst = response }
        }
        return worst
    }

    private static func severity(of response: SyncFailureResponse) -> Int {
        switch response {
        case .ignore: 0
        case .retry: 1
        case .retryWhenOnline: 2
        case .permanent: 3
        case .surfaceToUser: 4
        }
    }

    public static func backoff(attempt: Int) -> TimeInterval {
        let exponential = baseRetryDelay * pow(2, Double(max(attempt, 0)))
        // A little jitter so a household coming back online together doesn't
        // stampede the same second.
        let jitter = Double.random(in: 0...0.3) * exponential
        return min(exponential + jitter, maxRetryDelay)
    }
}
