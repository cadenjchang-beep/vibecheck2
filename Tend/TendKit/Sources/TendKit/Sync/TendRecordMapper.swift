import CloudKit
import Foundation
import SwiftData

/// Translates between `CKRecord`s in a shared household zone and the local
/// SwiftData objects.
///
/// The record name is always the model's `UUID` string. That is what makes an
/// upsert idempotent across devices and what lets a widget's interactive
/// check-off produce the same record ID the app would have produced.
enum TendRecordMapper {

    // MARK: - Incoming

    static func apply(_ record: CKRecord, to context: ModelContext) {
        guard let id = UUID(uuidString: record.recordID.recordName) else {
            TendLog.sync.error("Record name \(record.recordID.recordName) is not a UUID; skipping.")
            return
        }

        switch record.recordType {
        case TendRecordType.event: applyEvent(record, id: id, context: context)
        case TendRecordType.listItem: applyListItem(record, id: id, context: context)
        case TendRecordType.task: applyTask(record, id: id, context: context)
        case TendRecordType.recipe: applyRecipe(record, id: id, context: context)
        case TendRecordType.mealPlanEntry: applyMeal(record, id: id, context: context)
        case TendRecordType.member: applyMember(record, id: id, context: context)
        default:
            // A newer client added a type we don't know. Ignoring it is correct
            // and non-destructive — we never delete what we can't parse.
            TendLog.sync.info("Ignoring unknown record type \(record.recordType).")
        }
    }

    static func delete(recordName: String, from context: ModelContext) {
        guard let id = UUID(uuidString: recordName) else { return }
        if let event = fetchOne(Event.self, id: id, context: context) { context.delete(event) }
        if let item = fetchOne(ListItem.self, id: id, context: context) { context.delete(item) }
        if let task = fetchOne(HouseholdTask.self, id: id, context: context) { context.delete(task) }
        if let recipe = fetchOne(Recipe.self, id: id, context: context) { context.delete(recipe) }
        if let meal = fetchOne(MealPlanEntry.self, id: id, context: context) { context.delete(meal) }
    }

    // MARK: - Outgoing

    static func record(forRecordName recordName: String, zoneID: CKRecordZone.ID, in context: ModelContext) -> CKRecord? {
        guard let id = UUID(uuidString: recordName) else { return nil }
        let recordID = CKRecord.ID(recordName: recordName, zoneID: zoneID)

        if let event = fetchOne(Event.self, id: id, context: context) {
            let record = CKRecord(recordType: TendRecordType.event, recordID: recordID)
            record["title"] = event.title as CKRecordValue
            record["location"] = event.location as CKRecordValue?
            record["startDate"] = event.startDate as CKRecordValue
            record["endDate"] = event.endDate as CKRecordValue
            record["isAllDay"] = (event.isAllDay ? 1 : 0) as CKRecordValue
            record["recurrenceRule"] = event.recurrenceRule as CKRecordValue?
            record["recurrenceEditScope"] = event.recurrenceEditScope as CKRecordValue?
            record["seriesID"] = event.seriesID?.uuidString as CKRecordValue?
            record["exceptionDates"] = event.exceptionDates as CKRecordValue
            record["detachedFromOccurrence"] = event.detachedFromOccurrence as CKRecordValue?
            record["attendeeIDs"] = event.attendeeIDs.map(\.uuidString) as CKRecordValue
            record["notes"] = event.notes as CKRecordValue?
            record["lastModifiedBy"] = event.lastModifiedBy?.uuidString as CKRecordValue?
            record["lastModifiedAt"] = event.lastModifiedAt as CKRecordValue
            return record
        }

        if let item = fetchOne(ListItem.self, id: id, context: context) {
            let record = CKRecord(recordType: TendRecordType.listItem, recordID: recordID)
            record["listName"] = item.listName as CKRecordValue
            record["text"] = item.text as CKRecordValue
            record["quantity"] = item.quantity as CKRecordValue?
            record["category"] = item.category as CKRecordValue?
            record["isChecked"] = (item.isChecked ? 1 : 0) as CKRecordValue
            record["completedBy"] = item.completedBy?.uuidString as CKRecordValue?
            record["completedAt"] = item.completedAt as CKRecordValue?
            record["addedBy"] = item.addedBy?.uuidString as CKRecordValue?
            record["assignedMemberID"] = item.assignedMemberID?.uuidString as CKRecordValue?
            record["sortIndex"] = item.sortIndex as CKRecordValue
            record["createdAt"] = item.createdAt as CKRecordValue
            return record
        }

        if let task = fetchOne(HouseholdTask.self, id: id, context: context) {
            let record = CKRecord(recordType: TendRecordType.task, recordID: recordID)
            record["title"] = task.title as CKRecordValue
            record["notes"] = task.notes as CKRecordValue?
            record["dueDate"] = task.dueDate as CKRecordValue?
            record["assignedMemberID"] = task.assignedMemberID?.uuidString as CKRecordValue?
            record["recurrenceRule"] = task.recurrenceRule as CKRecordValue?
            record["isComplete"] = (task.isComplete ? 1 : 0) as CKRecordValue
            record["completedBy"] = task.completedBy?.uuidString as CKRecordValue?
            record["completedAt"] = task.completedAt as CKRecordValue?
            record["priority"] = task.priority as CKRecordValue
            record["lastModifiedBy"] = task.lastModifiedBy?.uuidString as CKRecordValue?
            record["lastModifiedAt"] = task.lastModifiedAt as CKRecordValue
            return record
        }

        if let recipe = fetchOne(Recipe.self, id: id, context: context) {
            let record = CKRecord(recordType: TendRecordType.recipe, recordID: recordID)
            record["title"] = recipe.title as CKRecordValue
            record["ingredients"] = recipe.ingredients as CKRecordValue
            record["instructions"] = recipe.instructions as CKRecordValue
            record["tags"] = recipe.tags as CKRecordValue
            record["sourceURL"] = recipe.sourceURL as CKRecordValue?
            // Photos travel as assets so a recipe image never counts against
            // the 1 MB record size limit.
            if let data = recipe.photoData, let asset = temporaryAsset(for: data, name: recipe.id.uuidString) {
                record["photo"] = asset
            }
            return record
        }

        if let meal = fetchOne(MealPlanEntry.self, id: id, context: context) {
            let record = CKRecord(recordType: TendRecordType.mealPlanEntry, recordID: recordID)
            record["date"] = meal.date as CKRecordValue
            record["mealType"] = meal.mealType as CKRecordValue
            record["recipeID"] = meal.recipeID?.uuidString as CKRecordValue?
            record["customText"] = meal.customText as CKRecordValue?
            return record
        }

        // No local object means it was deleted between the change being queued
        // and the batch being built. Returning nil turns the save into a
        // delete, which is what CKSyncEngine expects.
        return nil
    }

    // MARK: - Per-type application

    private static func applyEvent(_ record: CKRecord, id: UUID, context: ModelContext) {
        let event = fetchOne(Event.self, id: id, context: context) ?? {
            let new = Event(id: id, title: "", startDate: .now, endDate: .now)
            context.insert(new)
            return new
        }()

        // Last-writer-wins, decided by the record's own timestamp rather than
        // by arrival order — an out-of-order fetch must not resurrect an older
        // edit.
        let incomingModified = record["lastModifiedAt"] as? Date ?? record.modificationDate ?? .distantPast
        guard incomingModified >= event.lastModifiedAt else { return }

        event.title = record["title"] as? String ?? event.title
        event.location = record["location"] as? String
        event.startDate = record["startDate"] as? Date ?? event.startDate
        event.endDate = record["endDate"] as? Date ?? event.endDate
        event.isAllDay = (record["isAllDay"] as? Int ?? 0) == 1
        event.recurrenceRule = record["recurrenceRule"] as? String
        event.recurrenceEditScope = record["recurrenceEditScope"] as? String
        event.seriesID = (record["seriesID"] as? String).flatMap(UUID.init(uuidString:))
        event.exceptionDates = record["exceptionDates"] as? [Date] ?? []
        event.detachedFromOccurrence = record["detachedFromOccurrence"] as? Date
        event.attendeeIDs = (record["attendeeIDs"] as? [String] ?? []).compactMap(UUID.init(uuidString:))
        event.notes = record["notes"] as? String
        event.lastModifiedBy = (record["lastModifiedBy"] as? String).flatMap(UUID.init(uuidString:))
        event.lastModifiedAt = incomingModified
    }

    private static func applyListItem(_ record: CKRecord, id: UUID, context: ModelContext) {
        let item = fetchOne(ListItem.self, id: id, context: context) ?? {
            let new = ListItem(id: id, listName: TendList.groceries, text: "")
            context.insert(new)
            return new
        }()

        item.listName = record["listName"] as? String ?? item.listName
        item.text = record["text"] as? String ?? item.text
        item.quantity = record["quantity"] as? String
        item.category = record["category"] as? String
        item.isChecked = (record["isChecked"] as? Int ?? 0) == 1
        item.completedBy = (record["completedBy"] as? String).flatMap(UUID.init(uuidString:))
        item.completedAt = record["completedAt"] as? Date
        item.addedBy = (record["addedBy"] as? String).flatMap(UUID.init(uuidString:))
        item.assignedMemberID = (record["assignedMemberID"] as? String).flatMap(UUID.init(uuidString:))
        item.sortIndex = record["sortIndex"] as? Int ?? item.sortIndex
        item.createdAt = record["createdAt"] as? Date ?? item.createdAt
    }

    private static func applyTask(_ record: CKRecord, id: UUID, context: ModelContext) {
        let task = fetchOne(HouseholdTask.self, id: id, context: context) ?? {
            let new = HouseholdTask(id: id, title: "")
            context.insert(new)
            return new
        }()

        let incomingModified = record["lastModifiedAt"] as? Date ?? record.modificationDate ?? .distantPast
        guard incomingModified >= task.lastModifiedAt else { return }

        task.title = record["title"] as? String ?? task.title
        task.notes = record["notes"] as? String
        task.dueDate = record["dueDate"] as? Date
        task.assignedMemberID = (record["assignedMemberID"] as? String).flatMap(UUID.init(uuidString:))
        task.recurrenceRule = record["recurrenceRule"] as? String
        task.isComplete = (record["isComplete"] as? Int ?? 0) == 1
        task.completedBy = (record["completedBy"] as? String).flatMap(UUID.init(uuidString:))
        task.completedAt = record["completedAt"] as? Date
        task.priority = record["priority"] as? Int ?? task.priority
        task.lastModifiedBy = (record["lastModifiedBy"] as? String).flatMap(UUID.init(uuidString:))
        task.lastModifiedAt = incomingModified
    }

    private static func applyRecipe(_ record: CKRecord, id: UUID, context: ModelContext) {
        let recipe = fetchOne(Recipe.self, id: id, context: context) ?? {
            let new = Recipe(id: id, title: "")
            context.insert(new)
            return new
        }()

        recipe.title = record["title"] as? String ?? recipe.title
        recipe.ingredients = record["ingredients"] as? [String] ?? []
        recipe.instructions = record["instructions"] as? String ?? ""
        recipe.tags = record["tags"] as? [String] ?? []
        recipe.sourceURL = record["sourceURL"] as? String
        if let asset = record["photo"] as? CKAsset, let url = asset.fileURL {
            recipe.photoData = try? Data(contentsOf: url)
        }
    }

    private static func applyMeal(_ record: CKRecord, id: UUID, context: ModelContext) {
        let meal = fetchOne(MealPlanEntry.self, id: id, context: context) ?? {
            let new = MealPlanEntry(id: id, date: .now, mealType: MealType.dinner.rawValue)
            context.insert(new)
            return new
        }()

        meal.date = record["date"] as? Date ?? meal.date
        meal.mealType = record["mealType"] as? String ?? meal.mealType
        meal.recipeID = (record["recipeID"] as? String).flatMap(UUID.init(uuidString:))
        meal.customText = record["customText"] as? String
    }

    private static func applyMember(_ record: CKRecord, id: UUID, context: ModelContext) {
        let member = fetchOne(Member.self, id: id, context: context) ?? {
            let new = Member(id: id, name: "")
            context.insert(new)
            return new
        }()

        member.name = record["name"] as? String ?? member.name
        member.colorHex = record["colorHex"] as? String ?? member.colorHex
        member.isChild = (record["isChild"] as? Int ?? 0) == 1
        member.avatarSystemImage = record["avatarSystemImage"] as? String ?? member.avatarSystemImage
        member.cloudKitUserRecordName = record["cloudKitUserRecordName"] as? String
    }

    // MARK: - Helpers

    /// Looks a model up by its own `id`, not by `persistentModelID` — the
    /// latter is device-local and meaningless across sync.
    ///
    /// `#Predicate` can't be written generically over `T`, so each model type
    /// gets its own descriptor and the result is cast back.
    private static func fetchOne<T: PersistentModel>(
        _ type: T.Type,
        id: UUID,
        context: ModelContext
    ) -> T? {
        func first<M: PersistentModel>(_ descriptor: FetchDescriptor<M>) -> M? {
            var limited = descriptor
            limited.fetchLimit = 1
            return (try? context.fetch(limited))?.first
        }

        switch type {
        case is Event.Type:
            return first(FetchDescriptor<Event>(predicate: #Predicate { $0.id == id })) as? T
        case is ListItem.Type:
            return first(FetchDescriptor<ListItem>(predicate: #Predicate { $0.id == id })) as? T
        case is HouseholdTask.Type:
            return first(FetchDescriptor<HouseholdTask>(predicate: #Predicate { $0.id == id })) as? T
        case is Recipe.Type:
            return first(FetchDescriptor<Recipe>(predicate: #Predicate { $0.id == id })) as? T
        case is MealPlanEntry.Type:
            return first(FetchDescriptor<MealPlanEntry>(predicate: #Predicate { $0.id == id })) as? T
        case is Member.Type:
            return first(FetchDescriptor<Member>(predicate: #Predicate { $0.id == id })) as? T
        case is Household.Type:
            return first(FetchDescriptor<Household>(predicate: #Predicate { $0.id == id })) as? T
        default:
            return nil
        }
    }

    private static func temporaryAsset(for data: Data, name: String) -> CKAsset? {
        let url = FileManager.default.temporaryDirectory.appending(path: "\(name).jpg")
        do {
            try data.write(to: url, options: .atomic)
            return CKAsset(fileURL: url)
        } catch {
            TendLog.sync.error("Could not stage recipe photo asset: \(error.localizedDescription)")
            return nil
        }
    }
}
