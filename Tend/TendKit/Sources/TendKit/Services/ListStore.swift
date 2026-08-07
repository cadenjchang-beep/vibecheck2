import Foundation
import SwiftData

/// List reads and writes, shared by the app, the widget's interactive toggle,
/// the Watch app and the Siri intent — so "check off milk" behaves identically
/// down all four paths, including the Load View bookkeeping.
public enum ListStore {

    // MARK: - Reading

    public static func items(in listName: String, context: ModelContext) -> [ListItem] {
        let descriptor = FetchDescriptor<ListItem>(
            predicate: #Predicate { $0.listName == listName },
            sortBy: [SortDescriptor(\.sortIndex), SortDescriptor(\.createdAt)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    public static func openItems(in listName: String, context: ModelContext) -> [ListItem] {
        items(in: listName, context: context).filter { !$0.isChecked }
    }

    public static func item(id: UUID, context: ModelContext) -> ListItem? {
        var descriptor = FetchDescriptor<ListItem>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    /// Every list that exists, defaults first, then whatever the household made.
    public static func listNames(context: ModelContext) -> [String] {
        let all = (try? context.fetch(FetchDescriptor<ListItem>())) ?? []
        let discovered = Set(all.map(\.listName))
        let custom = discovered.subtracting(TendList.defaults).sorted()
        return TendList.defaults + custom
    }

    /// Groups a list into aisles for display. Checked items sink to the bottom
    /// in a single group so a half-done shop still reads top to bottom.
    public static func grouped(_ items: [ListItem]) -> [(aisle: Aisle, items: [ListItem])] {
        let open = items.filter { !$0.isChecked }
        var buckets: [Aisle: [ListItem]] = [:]
        for item in open {
            let aisle = item.category.flatMap(Aisle.init(rawValue:)) ?? AisleCategorizer.category(for: item.text)
            buckets[aisle, default: []].append(item)
        }
        return buckets
            .sorted { $0.key.sortOrder < $1.key.sortOrder }
            .map { ($0.key, $0.value.sorted { $0.sortIndex < $1.sortIndex }) }
    }

    // MARK: - Writing

    /// Adds an item, de-duplicating against what is already open on the list.
    ///
    /// The capture-friction rule from §1 lives here: this never fails, never
    /// asks a question, and never needs the network. A duplicate silently
    /// merges rather than prompting.
    @discardableResult
    public static func add(
        _ text: String,
        to listName: String = TendList.groceries,
        quantity: String? = nil,
        by memberID: UUID? = nil,
        context: ModelContext
    ) -> ListItem? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let existing = openItems(in: listName, context: context)
        if let duplicate = existing.first(where: {
            AisleCategorizer.normalize($0.text) == AisleCategorizer.normalize(trimmed)
        }) {
            if let quantity, duplicate.quantity != quantity {
                duplicate.quantity = quantity
            }
            try? context.save()
            return duplicate
        }

        let nextIndex = (existing.map(\.sortIndex).max() ?? -1) + 1
        let item = ListItem(
            listName: listName,
            text: trimmed,
            quantity: quantity,
            category: AisleCategorizer.category(for: trimmed).rawValue,
            addedBy: memberID,
            sortIndex: nextIndex
        )
        context.insert(item)
        // Save immediately: an item that only exists in memory is an item that
        // a crash loses, and §6 says this flow must never lose data.
        try? context.save()
        return item
    }

    /// The single place `isChecked` flips, so `completedBy`/`completedAt` can
    /// never be forgotten — those two fields are what Load View runs on.
    public static func setChecked(
        _ isChecked: Bool,
        on item: ListItem,
        by memberID: UUID?,
        at date: Date = .now,
        context: ModelContext
    ) {
        item.isChecked = isChecked
        if isChecked {
            item.completedBy = memberID
            item.completedAt = date
        } else {
            item.completedBy = nil
            item.completedAt = nil
        }
        try? context.save()
    }

    public static func toggle(itemID: UUID, by memberID: UUID?, context: ModelContext) {
        guard let item = item(id: itemID, context: context) else { return }
        setChecked(!item.isChecked, on: item, by: memberID, context: context)
    }

    /// Clears the checked items after a shop. Reversible in the UI via undo,
    /// which is why there is no confirmation dialog (§3).
    public static func clearChecked(in listName: String, context: ModelContext) -> [ListItem] {
        let checked = items(in: listName, context: context).filter(\.isChecked)
        for item in checked { context.delete(item) }
        try? context.save()
        return checked
    }

    public static func reorder(_ items: [ListItem], context: ModelContext) {
        for (index, item) in items.enumerated() { item.sortIndex = index }
        try? context.save()
    }
}
