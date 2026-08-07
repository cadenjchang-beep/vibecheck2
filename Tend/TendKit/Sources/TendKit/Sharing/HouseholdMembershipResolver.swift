import CloudKit
import Foundation
import SwiftData

/// What this device is allowed to do with a household right now.
public enum HouseholdMembershipState: Equatable, Sendable {
    /// Syncing normally.
    case active(HouseholdOwnership)
    /// We left, or were removed. Data stays, sync stops, the UI says so.
    case readOnlyArchive(reason: ArchiveReason)
    /// Signed out of iCloud — local only, nothing lost.
    case localOnly
    /// The household belongs to a different Apple ID than the one signed in.
    case foreignAccount

    public enum ArchiveReason: String, Equatable, Sendable {
        case youLeft
        case removedByOwner
        case ownerDeletedHousehold

        public var title: String {
            switch self {
            case .youLeft: "You've left this household"
            case .removedByOwner: "You're no longer in this household"
            case .ownerDeletedHousehold: "This household was deleted"
            }
        }

        public var message: String {
            switch self {
            case .youLeft:
                "Your copy stays on this device, read-only. You can export it any time, or rejoin with a new invite."
            case .removedByOwner:
                "Your copy stays on this device, read-only — nothing was deleted. You can export it or ask for a new invite."
            case .ownerDeletedHousehold:
                "The last copy you synced is still here, read-only. Export it if you want to keep it."
            }
        }
    }

    public var isEditable: Bool {
        switch self {
        case .active(let ownership): ownership.canEdit
        case .readOnlyArchive, .foreignAccount: false
        case .localOnly: true
        }
    }

    public var shouldSync: Bool {
        if case .active = self { return true }
        return false
    }
}

/// Reconciles the households stored locally against the ones the currently
/// signed-in Apple ID can actually reach.
///
/// This is the piece that makes the three §6 scenarios behave:
///
/// - **A participant leaves.** The zone disappears from their shared database.
///   We flip to `readOnlyArchive(.youLeft)` — never delete.
/// - **The owner removes someone.** Same signal from the other direction; we
///   flip to `readOnlyArchive(.removedByOwner)`.
/// - **The device switches iCloud accounts.** Households owned by the previous
///   account resolve to `.foreignAccount` and are hidden immediately, before
///   any view can read them.
@MainActor
public final class HouseholdMembershipResolver {

    private let container: CKContainer
    private let shareController: HouseholdShareController
    private let modelContainer: ModelContainer

    public private(set) var states: [UUID: HouseholdMembershipState] = [:]

    public init(
        modelContainer: ModelContainer,
        shareController: HouseholdShareController,
        containerIdentifier: String = TendIdentifiers.cloudKitContainer
    ) {
        self.modelContainer = modelContainer
        self.shareController = shareController
        self.container = CKContainer(identifier: containerIdentifier)
    }

    /// Re-resolves every local household. Called on launch, on
    /// `CKAccountChanged`, on foreground, and after any share mutation.
    @discardableResult
    public func resolveAll(currentUserRecordName: String?) async -> [UUID: HouseholdMembershipState] {
        let context = modelContainer.mainContext
        let households = (try? context.fetch(FetchDescriptor<Household>())) ?? []

        guard let currentUserRecordName else {
            // Signed out. Everything is local-only, and nothing is hidden —
            // the data on this device belongs to whoever is holding it.
            states = households.reduce(into: [:]) { $0[$1.id] = .localOnly }
            return states
        }

        var resolved: [UUID: HouseholdMembershipState] = [:]

        for household in households {
            // A household recorded as owned by a different Apple ID must never
            // render. This check runs before any network call so an offline
            // account switch still hides the previous account's data.
            if let owner = household.ownerRecordName,
               owner != currentUserRecordName,
               !household.isSharedWithMe {
                resolved[household.id] = .foreignAccount
                continue
            }

            if household.isReadOnlyArchive {
                resolved[household.id] = .readOnlyArchive(reason: .youLeft)
                continue
            }

            do {
                let ownership = try await shareController.resolveOwnership(zoneName: household.zoneName)
                switch ownership {
                case .owner, .notShared:
                    resolved[household.id] = .active(ownership)
                case .participant:
                    resolved[household.id] = .active(ownership)
                }
            } catch let error as CKError where error.code == .zoneNotFound || error.code == .userDeletedZone {
                // The zone we were syncing against is gone. From this device we
                // cannot tell "removed" from "household deleted", so we say the
                // thing that is true either way and keep the data.
                archive(household, reason: .removedByOwner, in: context)
                resolved[household.id] = .readOnlyArchive(reason: .removedByOwner)
            } catch {
                // Network trouble is not membership trouble. Keep the previous
                // verdict rather than inventing a scary one.
                TendLog.sharing.error("Ownership check failed for \(household.name): \(error.localizedDescription)")
                resolved[household.id] = states[household.id] ?? .active(.notShared)
            }
        }

        states = resolved
        return resolved
    }

    public func state(for household: Household) -> HouseholdMembershipState {
        states[household.id] ?? .active(.notShared)
    }

    /// Explicit user-initiated leave.
    public func leave(_ household: Household) async throws {
        try await shareController.leaveHousehold(zoneNamed: household.zoneName)
        archive(household, reason: .youLeft, in: modelContainer.mainContext)
        states[household.id] = .readOnlyArchive(reason: .youLeft)
    }

    private func archive(_ household: Household, reason: HouseholdMembershipState.ArchiveReason, in context: ModelContext) {
        household.isReadOnlyArchive = true
        try? context.save()
        TendLog.sharing.notice("Household \(household.name) archived (\(reason.rawValue)); local copy kept.")
    }

    // MARK: - Export

    /// The other half of "never silent data loss": whatever state a household
    /// ends in, its contents can always leave the app as plain JSON.
    public func exportArchive(for household: Household) throws -> Data {
        let context = modelContainer.mainContext
        let householdID = household.id

        let events = (try? context.fetch(FetchDescriptor<Event>())) ?? []
        let items = (try? context.fetch(FetchDescriptor<ListItem>())) ?? []
        let tasks = (try? context.fetch(FetchDescriptor<HouseholdTask>())) ?? []
        let recipes = (try? context.fetch(FetchDescriptor<Recipe>())) ?? []

        let archive = HouseholdArchive(
            householdID: householdID,
            householdName: household.name,
            exportedAt: .now,
            members: household.memberList.map { .init(id: $0.id, name: $0.name, isChild: $0.isChild) },
            events: events.map {
                .init(id: $0.id, title: $0.title, start: $0.startDate, end: $0.endDate,
                      location: $0.location, recurrenceRule: $0.recurrenceRule, notes: $0.notes)
            },
            listItems: items.map {
                .init(id: $0.id, listName: $0.listName, text: $0.text, quantity: $0.quantity, isChecked: $0.isChecked)
            },
            tasks: tasks.map {
                .init(id: $0.id, title: $0.title, dueDate: $0.dueDate, isComplete: $0.isComplete, notes: $0.notes)
            },
            recipes: recipes.map {
                .init(id: $0.id, title: $0.title, ingredients: $0.ingredients, instructions: $0.instructions)
            }
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(archive)
    }
}

// MARK: - Export shapes

public struct HouseholdArchive: Codable, Sendable {
    public struct ArchivedMember: Codable, Sendable {
        public let id: UUID
        public let name: String
        public let isChild: Bool
    }
    public struct ArchivedEvent: Codable, Sendable {
        public let id: UUID
        public let title: String
        public let start: Date
        public let end: Date
        public let location: String?
        public let recurrenceRule: String?
        public let notes: String?
    }
    public struct ArchivedListItem: Codable, Sendable {
        public let id: UUID
        public let listName: String
        public let text: String
        public let quantity: String?
        public let isChecked: Bool
    }
    public struct ArchivedTask: Codable, Sendable {
        public let id: UUID
        public let title: String
        public let dueDate: Date?
        public let isComplete: Bool
        public let notes: String?
    }
    public struct ArchivedRecipe: Codable, Sendable {
        public let id: UUID
        public let title: String
        public let ingredients: [String]
        public let instructions: String
    }

    public let householdID: UUID
    public let householdName: String
    public let exportedAt: Date
    public let members: [ArchivedMember]
    public let events: [ArchivedEvent]
    public let listItems: [ArchivedListItem]
    public let tasks: [ArchivedTask]
    public let recipes: [ArchivedRecipe]
}
