import Foundation
import SwiftData

/// Version 1 of Tend's persisted schema.
///
/// Every model change ships as a **new** `VersionedSchema` plus an explicit
/// `MigrationStage` in ``TendMigrationPlan``. A shipped schema is never edited
/// in place — CloudKit-backed stores in the wild already contain records
/// written against it, and there is no way to reach back and fix them.
///
/// CloudKit mirroring imposes three rules that every model here obeys:
/// 1. No `@Attribute(.unique)` — CloudKit cannot enforce uniqueness.
/// 2. Every stored property is optional or has a default value.
/// 3. Every relationship is optional and has an inverse.
public enum TendSchemaV1: VersionedSchema {

    public static var versionIdentifier: Schema.Version { Schema.Version(1, 0, 0) }

    public static var models: [any PersistentModel.Type] {
        [
            Household.self,
            Member.self,
            Event.self,
            ListItem.self,
            HouseholdTask.self,
            Recipe.self,
            MealPlanEntry.self,
            PulseDigest.self,
        ]
    }

    // MARK: - Household

    @Model
    public final class Household {
        public var id: UUID = UUID()
        public var name: String = ""
        public var createdAt: Date = Date.distantPast

        /// Name of the `CKRecordZone` backing this household. Sharing is
        /// zone-wide, so every record belonging to the household lives here.
        public var zoneName: String = ""

        /// True when this household arrived through a `CKShare` we accepted
        /// rather than one we own.
        public var isSharedWithMe: Bool = false

        /// Owner's CloudKit user record name, when known. Used to re-resolve
        /// membership after an iCloud account switch.
        public var ownerRecordName: String?

        /// Flipped when the local user leaves or is removed. Sync stops, the
        /// data stays readable, and the UI says so out loud. Never a silent
        /// delete — see `HouseholdMembershipState`.
        public var isReadOnlyArchive: Bool = false

        @Relationship(deleteRule: .cascade, inverse: \Member.household)
        public var members: [Member]? = []

        public init(
            id: UUID = UUID(),
            name: String,
            createdAt: Date = .now,
            zoneName: String = "household-\(UUID().uuidString)",
            isSharedWithMe: Bool = false,
            ownerRecordName: String? = nil
        ) {
            self.id = id
            self.name = name
            self.createdAt = createdAt
            self.zoneName = zoneName
            self.isSharedWithMe = isSharedWithMe
            self.ownerRecordName = ownerRecordName
            self.members = []
        }

        public var memberList: [Member] { (members ?? []).sorted { $0.name < $1.name } }
    }

    // MARK: - Member

    @Model
    public final class Member {
        public var id: UUID = UUID()
        public var name: String = ""
        public var colorHex: String = "#6C8F7E"
        public var isChild: Bool = false
        public var avatarSystemImage: String = "person.circle.fill"

        /// CloudKit user record name of the Apple ID driving this member, when
        /// there is one. Children on Family Sharing accounts have none.
        public var cloudKitUserRecordName: String?

        public var household: Household?

        public init(
            id: UUID = UUID(),
            name: String,
            colorHex: String = "#6C8F7E",
            isChild: Bool = false,
            avatarSystemImage: String = "person.circle.fill",
            cloudKitUserRecordName: String? = nil
        ) {
            self.id = id
            self.name = name
            self.colorHex = colorHex
            self.isChild = isChild
            self.avatarSystemImage = avatarSystemImage
            self.cloudKitUserRecordName = cloudKitUserRecordName
        }
    }

    // MARK: - Event

    @Model
    public final class Event {
        public var id: UUID = UUID()
        public var title: String = ""
        public var location: String?
        public var startDate: Date = Date.distantPast
        public var endDate: Date = Date.distantPast
        public var isAllDay: Bool = false

        /// RFC 5545-flavoured rule string, parsed by ``RecurrenceRule``.
        /// `nil` means a one-off event.
        public var recurrenceRule: String?

        /// The scope chosen the last time this event was edited
        /// ("single" | "future" | "all"). Recorded so the sync layer and the
        /// UI can explain what a change actually touched.
        public var recurrenceEditScope: String?

        /// Links every occurrence and every split of one recurring series.
        public var seriesID: UUID?

        /// Occurrence start dates removed from this series, either because the
        /// user deleted one occurrence or because one was detached by a
        /// "this event only" edit. Stored on the series master.
        public var exceptionDates: [Date] = []

        /// Set on an event that was detached out of a series by a
        /// "this event only" edit. Holds the original occurrence start so the
        /// detached copy can be matched back to the slot it replaced.
        public var detachedFromOccurrence: Date?

        public var attendeeIDs: [UUID] = []
        public var notes: String?

        /// Non-recurring housekeeping for last-writer-wins conflicts. The UI
        /// surfaces these as a subtle "updated by Sam" line, never a merge
        /// prompt.
        public var lastModifiedBy: UUID?
        public var lastModifiedAt: Date = Date.distantPast

        /// Identifier of the mirrored `EKEvent`, when two-way EventKit sync is
        /// switched on for this household.
        public var eventKitIdentifier: String?

        public init(
            id: UUID = UUID(),
            title: String,
            location: String? = nil,
            startDate: Date,
            endDate: Date,
            isAllDay: Bool = false,
            recurrenceRule: String? = nil,
            seriesID: UUID? = nil,
            attendeeIDs: [UUID] = [],
            notes: String? = nil,
            lastModifiedBy: UUID? = nil,
            lastModifiedAt: Date = .now
        ) {
            self.id = id
            self.title = title
            self.location = location
            self.startDate = startDate
            self.endDate = endDate
            self.isAllDay = isAllDay
            self.recurrenceRule = recurrenceRule
            self.seriesID = seriesID ?? (recurrenceRule == nil ? nil : id)
            self.attendeeIDs = attendeeIDs
            self.notes = notes
            self.lastModifiedBy = lastModifiedBy
            self.lastModifiedAt = lastModifiedAt
        }

        public var isRecurring: Bool { recurrenceRule != nil }
        public var duration: TimeInterval { endDate.timeIntervalSince(startDate) }
    }

    // MARK: - ListItem

    @Model
    public final class ListItem {
        // One SwiftData object == one CloudKit record. Items are never stored
        // as an array on a parent list object, so two people checking off two
        // different items can never collide on the same record.
        public var id: UUID = UUID()
        public var listName: String = "Groceries"
        public var text: String = ""
        public var quantity: String?
        public var category: String?
        public var isChecked: Bool = false

        /// Set whenever `isChecked` flips to true. Powers Load View — not
        /// optional metadata.
        public var completedBy: UUID?
        public var completedAt: Date?

        public var addedBy: UUID?
        public var createdAt: Date = Date.distantPast

        public var assignedMemberID: UUID?
        public var sortIndex: Int = 0

        /// Region-monitoring trigger, when the item has a location reminder.
        public var reminderLatitude: Double?
        public var reminderLongitude: Double?
        public var reminderRadius: Double?
        public var reminderPlaceName: String?

        public init(
            id: UUID = UUID(),
            listName: String,
            text: String,
            quantity: String? = nil,
            category: String? = nil,
            isChecked: Bool = false,
            addedBy: UUID? = nil,
            assignedMemberID: UUID? = nil,
            sortIndex: Int = 0,
            createdAt: Date = .now
        ) {
            self.id = id
            self.listName = listName
            self.text = text
            self.quantity = quantity
            self.category = category
            self.isChecked = isChecked
            self.addedBy = addedBy
            self.assignedMemberID = assignedMemberID
            self.sortIndex = sortIndex
            self.createdAt = createdAt
        }

        public var hasLocationReminder: Bool {
            reminderLatitude != nil && reminderLongitude != nil
        }
    }

    // MARK: - HouseholdTask

    @Model
    public final class HouseholdTask {
        public var id: UUID = UUID()
        public var title: String = ""
        public var notes: String?
        public var dueDate: Date?
        public var assignedMemberID: UUID?
        public var recurrenceRule: String?
        public var isComplete: Bool = false

        /// Powers Load View.
        public var completedBy: UUID?
        public var completedAt: Date?

        public var createdBy: UUID?
        public var createdAt: Date = Date.distantPast

        /// 0 = none, 1 = low, 2 = medium, 3 = high.
        public var priority: Int = 0

        public var lastModifiedBy: UUID?
        public var lastModifiedAt: Date = Date.distantPast

        public var reminderLatitude: Double?
        public var reminderLongitude: Double?
        public var reminderRadius: Double?
        public var reminderPlaceName: String?

        public init(
            id: UUID = UUID(),
            title: String,
            notes: String? = nil,
            dueDate: Date? = nil,
            assignedMemberID: UUID? = nil,
            recurrenceRule: String? = nil,
            isComplete: Bool = false,
            priority: Int = 0,
            createdBy: UUID? = nil,
            createdAt: Date = .now
        ) {
            self.id = id
            self.title = title
            self.notes = notes
            self.dueDate = dueDate
            self.assignedMemberID = assignedMemberID
            self.recurrenceRule = recurrenceRule
            self.isComplete = isComplete
            self.priority = priority
            self.createdBy = createdBy
            self.createdAt = createdAt
            self.lastModifiedAt = createdAt
        }
    }

    // MARK: - Recipe

    @Model
    public final class Recipe {
        public var id: UUID = UUID()
        public var title: String = ""
        public var ingredients: [String] = []
        public var instructions: String = ""

        /// Stored externally so a recipe photo never bloats the record itself.
        @Attribute(.externalStorage) public var photoData: Data?

        public var tags: [String] = []
        public var sourceURL: String?
        public var servings: Int?
        public var createdAt: Date = Date.distantPast

        public init(
            id: UUID = UUID(),
            title: String,
            ingredients: [String] = [],
            instructions: String = "",
            photoData: Data? = nil,
            tags: [String] = [],
            sourceURL: String? = nil,
            servings: Int? = nil,
            createdAt: Date = .now
        ) {
            self.id = id
            self.title = title
            self.ingredients = ingredients
            self.instructions = instructions
            self.photoData = photoData
            self.tags = tags
            self.sourceURL = sourceURL
            self.servings = servings
            self.createdAt = createdAt
        }
    }

    // MARK: - MealPlanEntry

    @Model
    public final class MealPlanEntry {
        public var id: UUID = UUID()
        /// Normalised to the start of the day it belongs to.
        public var date: Date = Date.distantPast
        /// "breakfast" | "lunch" | "dinner" | "other" — see ``MealType``.
        public var mealType: String = "dinner"
        public var recipeID: UUID?
        public var customText: String?

        /// Ingredients already pushed to Groceries from this entry, so the
        /// one-tap generator can de-duplicate across repeated taps.
        public var exportedIngredients: [String] = []

        public init(
            id: UUID = UUID(),
            date: Date,
            mealType: String,
            recipeID: UUID? = nil,
            customText: String? = nil
        ) {
            self.id = id
            self.date = Calendar.current.startOfDay(for: date)
            self.mealType = mealType
            self.recipeID = recipeID
            self.customText = customText
        }
    }

    // MARK: - PulseDigest

    /// A pre-computed Pulse recap. Written by a background task so opening the
    /// widget or the notification is instant rather than a spinner.
    @Model
    public final class PulseDigest {
        public var id: UUID = UUID()
        public var generatedAt: Date = Date.distantPast
        /// "morning" | "weekly" — see ``PulseKind``.
        public var kind: String = "morning"
        public var headline: String = ""
        public var lines: [String] = []
        /// Deep link the notification and widget open.
        public var deepLink: String = "tend://pulse"

        public init(
            id: UUID = UUID(),
            generatedAt: Date = .now,
            kind: String,
            headline: String,
            lines: [String],
            deepLink: String = "tend://pulse"
        ) {
            self.id = id
            self.generatedAt = generatedAt
            self.kind = kind
            self.headline = headline
            self.lines = lines
            self.deepLink = deepLink
        }
    }
}

// MARK: - Current-version aliases
//
// The rest of the app refers to these names only. When V2 lands, these aliases
// move to `TendSchemaV2` and nothing else has to change.

public typealias Household = TendSchemaV1.Household
public typealias Member = TendSchemaV1.Member
public typealias Event = TendSchemaV1.Event
public typealias ListItem = TendSchemaV1.ListItem
public typealias HouseholdTask = TendSchemaV1.HouseholdTask
public typealias Recipe = TendSchemaV1.Recipe
public typealias MealPlanEntry = TendSchemaV1.MealPlanEntry
public typealias PulseDigest = TendSchemaV1.PulseDigest
