import Foundation
import SwiftData

public struct PlannedMeal: Identifiable, Sendable {
    public let id: UUID
    public let date: Date
    public let mealType: MealType
    public let label: String
    public let recipeID: UUID?

    public init(id: UUID, date: Date, mealType: MealType, label: String, recipeID: UUID?) {
        self.id = id
        self.date = date
        self.mealType = mealType
        self.label = label
        self.recipeID = recipeID
    }
}

public enum MealPlanner {

    // MARK: - Reading

    public static func week(containing date: Date, calendar: Calendar = .current) -> [Date] {
        let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? calendar.startOfDay(for: date)
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    public static func entries(
        forWeekOf date: Date,
        context: ModelContext,
        calendar: Calendar = .current
    ) -> [MealPlanEntry] {
        let days = week(containing: date, calendar: calendar)
        guard let start = days.first,
              let end = calendar.date(byAdding: .day, value: 7, to: start) else { return [] }
        let descriptor = FetchDescriptor<MealPlanEntry>(
            predicate: #Predicate { $0.date >= start && $0.date < end },
            sortBy: [SortDescriptor(\.date)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    public static func entry(
        on day: Date,
        mealType: MealType,
        context: ModelContext,
        calendar: Calendar = .current
    ) -> MealPlanEntry? {
        let start = calendar.startOfDay(for: day)
        let raw = mealType.rawValue
        var descriptor = FetchDescriptor<MealPlanEntry>(
            predicate: #Predicate { $0.date == start && $0.mealType == raw }
        )
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    public static func label(for entry: MealPlanEntry, recipes: [Recipe]) -> String {
        if let recipeID = entry.recipeID, let recipe = recipes.first(where: { $0.id == recipeID }) {
            return recipe.title
        }
        return entry.customText ?? ""
    }

    // MARK: - Writing

    @discardableResult
    public static func plan(
        recipeID: UUID?,
        customText: String?,
        on day: Date,
        mealType: MealType,
        context: ModelContext,
        calendar: Calendar = .current
    ) -> MealPlanEntry {
        if let existing = entry(on: day, mealType: mealType, context: context, calendar: calendar) {
            existing.recipeID = recipeID
            existing.customText = customText
            try? context.save()
            return existing
        }
        let entry = MealPlanEntry(
            date: calendar.startOfDay(for: day),
            mealType: mealType.rawValue,
            recipeID: recipeID,
            customText: customText
        )
        context.insert(entry)
        try? context.save()
        return entry
    }

    public static func clear(on day: Date, mealType: MealType, context: ModelContext, calendar: Calendar = .current) {
        guard let existing = entry(on: day, mealType: mealType, context: context, calendar: calendar) else { return }
        context.delete(existing)
        try? context.save()
    }

    // MARK: - Groceries

    public struct GroceryGenerationResult: Sendable {
        public let added: [String]
        public let alreadyOnList: [String]
        public let previouslyExported: [String]

        public var isEmpty: Bool { added.isEmpty && alreadyOnList.isEmpty && previouslyExported.isEmpty }

        public var summary: String {
            if added.isEmpty && !alreadyOnList.isEmpty {
                return "Everything's already on the list"
            }
            if added.isEmpty { return "Nothing to add" }
            var text = "Added \(added.count) \(added.count == 1 ? "item" : "items")"
            let skipped = alreadyOnList.count + previouslyExported.count
            if skipped > 0 { text += " · \(skipped) already there" }
            return text
        }
    }

    /// One tap: this week's recipes → the grocery list, de-duplicated three
    /// ways.
    ///
    /// 1. Against ingredients this entry already contributed (so pressing the
    ///    button twice doesn't double the list).
    /// 2. Against what is already open on the list.
    /// 3. Against the other recipes in the same run — two recipes both wanting
    ///    onions produce one line, not two.
    @discardableResult
    public static func generateGroceries(
        forWeekOf date: Date,
        by memberID: UUID? = nil,
        listName: String = TendList.groceries,
        context: ModelContext,
        calendar: Calendar = .current
    ) -> GroceryGenerationResult {
        let entries = entries(forWeekOf: date, context: context, calendar: calendar)
        let recipes = (try? context.fetch(FetchDescriptor<Recipe>())) ?? []
        let existing = ListStore.openItems(in: listName, context: context)
        var seen = Set(existing.map { AisleCategorizer.normalize($0.text) })

        var added: [String] = []
        var alreadyOnList: [String] = []
        var previouslyExported: [String] = []

        for entry in entries {
            guard let recipeID = entry.recipeID,
                  let recipe = recipes.first(where: { $0.id == recipeID }) else { continue }

            let exported = Set(entry.exportedIngredients.map(AisleCategorizer.normalize))
            var newlyExported: [String] = []

            for ingredient in recipe.ingredients {
                let trimmed = ingredient.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                let key = AisleCategorizer.normalize(trimmed)

                if exported.contains(key) {
                    previouslyExported.append(trimmed)
                    continue
                }
                if seen.contains(key) {
                    alreadyOnList.append(trimmed)
                    newlyExported.append(trimmed)
                    continue
                }

                let (text, quantity) = QuickAddParser.splitQuantity(from: trimmed)
                ListStore.add(text, to: listName, quantity: quantity, by: memberID, context: context)
                seen.insert(key)
                added.append(trimmed)
                newlyExported.append(trimmed)
            }

            entry.exportedIngredients.append(contentsOf: newlyExported)
        }

        try? context.save()
        return GroceryGenerationResult(
            added: added,
            alreadyOnList: alreadyOnList,
            previouslyExported: previouslyExported
        )
    }
}
