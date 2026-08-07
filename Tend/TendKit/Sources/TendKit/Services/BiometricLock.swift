import Foundation
import LocalAuthentication
import Observation

/// Optional Face ID / Touch ID lock, with per-section locking (§4).
///
/// The design point from §8 is that this is *visible and easy to find* — a
/// privacy control nobody can locate protects nobody. It is off by default,
/// because a shared family device that suddenly demands a face is worse than no
/// lock at all.
@Observable
@MainActor
public final class BiometricLock {

    public private(set) var isUnlocked = true
    public private(set) var lastError: String?

    public var isEnabled: Bool {
        didSet {
            defaults.set(isEnabled, forKey: Keys.enabled)
            isUnlocked = !isEnabled
        }
    }

    /// Sections the user chose to lock individually. Empty with ``isEnabled``
    /// on means the whole app is locked.
    public var lockedSections: Set<TendTab> {
        didSet {
            defaults.set(lockedSections.map(\.rawValue), forKey: Keys.sections)
        }
    }

    private let defaults: UserDefaults

    private enum Keys {
        static let enabled = "tend.biometricLock.enabled"
        static let sections = "tend.biometricLock.sections"
    }

    public init(defaults: UserDefaults? = nil) {
        let store = defaults ?? UserDefaults(suiteName: TendIdentifiers.appGroup) ?? .standard
        self.defaults = store
        self.isEnabled = store.bool(forKey: Keys.enabled)
        let raw = store.stringArray(forKey: Keys.sections) ?? []
        self.lockedSections = Set(raw.compactMap(TendTab.init(rawValue:)))
        self.isUnlocked = !store.bool(forKey: Keys.enabled)
    }

    public var biometryDescription: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "your passcode"
        }
    }

    public var isAvailable: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    public func requiresUnlock(for tab: TendTab) -> Bool {
        guard isEnabled, !isUnlocked else { return false }
        return lockedSections.isEmpty || lockedSections.contains(tab)
    }

    public func unlock(reason: String = "Unlock Tend") async {
        guard isEnabled else {
            isUnlocked = true
            return
        }

        let context = LAContext()
        // `.deviceOwnerAuthentication`, not `...WithBiometrics`: a passcode
        // fallback means a failed Face ID scan never locks someone out of their
        // own household.
        do {
            isUnlocked = try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
            lastError = nil
        } catch {
            isUnlocked = false
            lastError = error.localizedDescription
        }
    }

    /// Called when the app backgrounds, so returning to it re-prompts.
    public func lock() {
        guard isEnabled else { return }
        isUnlocked = false
    }
}
