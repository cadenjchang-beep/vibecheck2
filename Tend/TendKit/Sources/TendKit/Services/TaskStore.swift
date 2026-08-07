import Foundation
import SwiftData

public enum TaskFilter: String, CaseIterable, Sendable, Identifiable {
    case mine
    case household

    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .mine: "Mine"
        case .household: "Household"
        }
    }
}

public enum TaskStore {

    public static func tasks(context: ModelContext) -> [HouseholdTask] {
        let descriptor = FetchDescriptor<HouseholdTask>(
            sortBy: [SortDescriptor(\.isComplete), SortDescriptor(\.dueDate), SortDescriptor(\.createdAt)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    public static func task(id: UUID, context: ModelContext) -> HouseholdTask? {
        var descriptor = FetchDescriptor<HouseholdTask>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    public static func filtered(
        _ tasks: [HouseholdTask],
        by filter: TaskFilter,
        currentMemberID: UUID?
    ) -> [HouseholdTask] {
        switch filter {
        case .household:
            return tasks
        case .mine:
            guard let currentMemberID else { return tasks }
            // Unassigned tasks belong to everyone, which means they show up in
            // "Mine" too — an unassigned task nobody sees is how chores rot.
            return tasks.filter { $0.assignedMemberID == currentMemberID || $0.assignedMemberID == nil }
        }
    }

    @discardableResult
    public static func add(
        title: String,
        dueDate: Date? = nil,
        assignedTo memberID: UUID? = nil,
        priority: Int = 0,
        recurrence: RecurrenceRule? = nil,
        notes: String? = nil,
        by creatorID: UUID? = nil,
        context: ModelContext
    ) -> HouseholdTask? {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let task = HouseholdTask(
            title: trimmed,
            notes: notes,
            dueDate: dueDate,
            assignedMemberID: memberID,
            recurrenceRule: recurrence?.rawValue,
            priority: priority,
            createdBy: creatorID
        )
        context.insert(task)
        try? context.save()
        return task
    }

    /// Completing a recurring task rolls it forward rather than closing it —
    /// "take the bins out every Tuesday" is not done forever on one Tuesday.
    /// The completed instance is preserved so Load View and Pulse can count it.
    public static func setComplete(
        _ isComplete: Bool,
        on task: HouseholdTask,
        by memberID: UUID?,
        at date: Date = .now,
        context: ModelContext,
        calendar: Calendar = .current
    ) {
        if isComplete, let rule = task.recurrenceRule.flatMap(RecurrenceRule.init(rawValue:)) {
            let completed = HouseholdTask(
                title: task.title,
                notes: task.notes,
                dueDate: task.dueDate,
                assignedMemberID: task.assignedMemberID,
                recurrenceRule: nil,
                isComplete: true,
                priority: task.priority,
                createdBy: task.createdBy
            )
            completed.completedBy = memberID
            completed.completedAt = date
            context.insert(completed)

            let anchor = task.dueDate ?? date
            let horizon = calendar.date(byAdding: .year, value: 2, to: anchor) ?? anchor
            let next = RecurrenceEngine.occurrences(
                of: EventSnapshot(title: task.title, startDate: anchor, endDate: anchor, rule: rule),
                in: anchor.addingTimeInterval(1)..<horizon,
                calendar: calendar
            ).first

            if let next {
                task.dueDate = next.start
                task.isComplete = false
                task.completedBy = nil
                task.completedAt = nil
            } else {
                // The series ran out; the live task closes for good.
                task.isComplete = true
                task.completedBy = memberID
                task.completedAt = date
            }
        } else {
            task.isComplete = isComplete
            task.completedBy = isComplete ? memberID : nil
            task.completedAt = isComplete ? date : nil
        }

        task.lastModifiedBy = memberID
        task.lastModifiedAt = date
        try? context.save()
    }

    public static func toggle(taskID: UUID, by memberID: UUID?, context: ModelContext) {
        guard let task = task(id: taskID, context: context) else { return }
        setComplete(!task.isComplete, on: task, by: memberID, context: context)
    }
}
