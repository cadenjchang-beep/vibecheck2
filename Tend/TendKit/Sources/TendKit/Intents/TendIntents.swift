import AppIntents
import Foundation
import SwiftData
#if canImport(WidgetKit)
import WidgetKit
#endif

/// One container for every extension-side write.
///
/// Intents run in the widget process, in the Siri process, and in the app. All
/// three open the same app-group store, which is what makes "add milk" from a
/// watch, a widget and a voice request land in one place.
enum IntentContainer {
    @MainActor
    static let shared: ModelContainer? = {
        do {
            return try TendModelContainer.make(.cloudKit)
        } catch {
            TendLog.sync.error("Intent could not open the store: \(error.localizedDescription)")
            return nil
        }
    }()
}

// MARK: - Add to a list

public struct AddListItemIntent: AppIntent {
    public static var title: LocalizedStringResource = "Add to a List"
    public static var description = IntentDescription(
        "Adds something to one of your household's lists.",
        categoryName: "Lists"
    )
    /// Adding an item never needs the app on screen — that is the entire point
    /// of the capture-friction goal in §1.
    public static var openAppWhenRun: Bool = false

    @Parameter(title: "Item", requestValueDialog: "What should I add?")
    public var item: String

    @Parameter(title: "List", default: TendList.groceries)
    public var listName: String

    public init() {}

    public init(item: String, listName: String = TendList.groceries) {
        self.item = item
        self.listName = listName
    }

    @MainActor
    public func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let container = IntentContainer.shared else {
            return .result(dialog: "I couldn't reach your lists just now.")
        }
        let context = container.mainContext

        // The parser runs here too, so "2 dozen eggs" said out loud gets the
        // same quantity handling as typed input.
        let parsed = QuickAddParser.parse(item)
        let target = parsed.listName ?? listName
        let added = ListStore.add(
            parsed.title.isEmpty ? item : parsed.title,
            to: target,
            quantity: parsed.quantity,
            by: HouseholdContext.storedMemberID(),
            context: context
        )

        guard let added else {
            return .result(dialog: "I didn't catch what to add.")
        }

        reloadWidgets()
        return .result(dialog: "Added \(added.text) to \(target).")
    }
}

// MARK: - Check off (the interactive-widget path)

public struct ToggleListItemIntent: AppIntent {
    public static var title: LocalizedStringResource = "Check Off an Item"
    public static var description = IntentDescription("Checks an item off a list.", categoryName: "Lists")
    public static var openAppWhenRun: Bool = false

    @Parameter(title: "Item ID")
    public var itemID: String

    public init() {}

    public init(itemID: UUID) {
        self.itemID = itemID.uuidString
    }

    @MainActor
    public func perform() async throws -> some IntentResult {
        guard let container = IntentContainer.shared, let uuid = UUID(uuidString: itemID) else {
            return .result()
        }
        // Goes through `ListStore` rather than flipping the flag directly, so
        // the Home Screen check-off records `completedBy`/`completedAt` exactly
        // like an in-app one and shows up in Load View.
        ListStore.toggle(itemID: uuid, by: HouseholdContext.storedMemberID(), context: container.mainContext)
        reloadWidgets()
        return .result()
    }
}

public struct CompleteTaskIntent: AppIntent {
    public static var title: LocalizedStringResource = "Complete a Task"
    public static var description = IntentDescription("Marks a household task done.", categoryName: "Tasks")
    public static var openAppWhenRun: Bool = false

    @Parameter(title: "Task ID")
    public var taskID: String

    public init() {}

    public init(taskID: UUID) {
        self.taskID = taskID.uuidString
    }

    @MainActor
    public func perform() async throws -> some IntentResult {
        guard let container = IntentContainer.shared, let uuid = UUID(uuidString: taskID) else {
            return .result()
        }
        TaskStore.toggle(taskID: uuid, by: HouseholdContext.storedMemberID(), context: container.mainContext)
        reloadWidgets()
        return .result()
    }
}

// MARK: - Ask what's left

public struct WhatsLeftIntent: AppIntent {
    public static var title: LocalizedStringResource = "What's Left"
    public static var description = IntentDescription(
        "Reads back what's still open on a list.",
        categoryName: "Lists"
    )
    public static var openAppWhenRun: Bool = false

    @Parameter(title: "List", default: TendList.groceries)
    public var listName: String

    public init() {}

    @MainActor
    public func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let container = IntentContainer.shared else {
            return .result(dialog: "I couldn't reach your lists just now.")
        }
        let open = ListStore.openItems(in: listName, context: container.mainContext)
        guard !open.isEmpty else {
            return .result(dialog: "\(listName) is clear.")
        }
        let names = open.prefix(5).map(\.text).joined(separator: ", ")
        let extra = open.count > 5 ? ", and \(open.count - 5) more" : ""
        return .result(dialog: "\(open.count) on \(listName): \(names)\(extra).")
    }
}

// MARK: - Quick capture

public struct QuickAddIntent: AppIntent {
    public static var title: LocalizedStringResource = "Quick Add to Tend"
    public static var description = IntentDescription(
        "Captures anything — an event, a task or a list item — from one line of text.",
        categoryName: "Capture"
    )
    public static var openAppWhenRun: Bool = false

    @Parameter(title: "Text", requestValueDialog: "What would you like to add?")
    public var text: String

    public init() {}

    public init(text: String) { self.text = text }

    @MainActor
    public func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let container = IntentContainer.shared else {
            return .result(dialog: "I couldn't reach Tend just now.")
        }
        let context = container.mainContext
        let memberID = HouseholdContext.storedMemberID()
        let parsed = QuickAddParser.parse(text)

        switch parsed.kind {
        case .listItem:
            let item = ListStore.add(
                parsed.title,
                to: parsed.listName ?? TendList.groceries,
                quantity: parsed.quantity,
                by: memberID,
                context: context
            )
            reloadWidgets()
            return .result(dialog: "Added \(item?.text ?? parsed.title).")

        case .task:
            TaskStore.add(
                title: parsed.title,
                dueDate: parsed.startDate,
                priority: parsed.priority,
                by: memberID,
                context: context
            )
            reloadWidgets()
            return .result(dialog: "Added the task \(parsed.title).")

        case .event:
            guard let start = parsed.startDate else {
                return .result(dialog: "I couldn't work out when that is.")
            }
            let event = Event(
                title: parsed.title,
                location: parsed.location,
                startDate: start,
                endDate: parsed.endDate ?? start.addingTimeInterval(3600),
                isAllDay: parsed.isAllDay,
                recurrenceRule: parsed.rule?.rawValue,
                lastModifiedBy: memberID
            )
            context.insert(event)
            try? context.save()
            reloadWidgets()
            let when = start.formatted(date: .abbreviated, time: parsed.isAllDay ? .omitted : .shortened)
            return .result(dialog: "Added \(parsed.title) on \(when).")
        }
    }
}

// MARK: - Shortcuts

public struct TendShortcuts: AppShortcutsProvider {
    public static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddListItemIntent(),
            phrases: [
                "Add \(\.$item) to \(.applicationName)",
                "Add \(\.$item) to my \(.applicationName) list",
                "Put \(\.$item) on the \(.applicationName) list",
            ],
            shortTitle: "Add to List",
            systemImageName: "cart.badge.plus"
        )
        AppShortcut(
            intent: WhatsLeftIntent(),
            phrases: [
                "What's left on my \(.applicationName) list",
                "What do I need from \(.applicationName)",
            ],
            shortTitle: "What's Left",
            systemImageName: "checklist"
        )
        AppShortcut(
            intent: QuickAddIntent(),
            phrases: [
                "Quick add to \(.applicationName)",
                "Capture this in \(.applicationName)",
            ],
            shortTitle: "Quick Add",
            systemImageName: "plus.circle"
        )
    }
}

private func reloadWidgets() {
    #if canImport(WidgetKit)
    WidgetCenter.shared.reloadAllTimelines()
    #endif
}
