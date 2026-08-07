import SwiftData
import SwiftUI
import TendKit

struct TasksScreen: View {
    @Environment(HouseholdContext.self) private var context
    @Environment(\.modelContext) private var modelContext

    @Query(sort: [SortDescriptor(\HouseholdTask.dueDate), SortDescriptor(\HouseholdTask.createdAt)])
    private var tasks: [HouseholdTask]
    @Query private var members: [Member]

    @State private var filter: TaskFilter = .household
    @State private var editing: HouseholdTask?
    @State private var isCreating = false

    var body: some View {
        @Bindable var context = context

        NavigationStack(path: $context.tasksPath) {
            List {
                Picker("Filter", selection: $filter.animation(Motion.list)) {
                    ForEach(TaskFilter.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowInsets(EdgeInsets(top: Spacing.s, leading: Spacing.m, bottom: Spacing.s, trailing: Spacing.m))

                if visible.isEmpty {
                    EmptyStateView(
                        systemImage: "checkmark.circle",
                        title: filter == .mine ? "Nothing on you right now" : "No open tasks",
                        message: "Tasks are the things that don't belong on a calendar but still need doing."
                    ) { isCreating = true }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                }

                ForEach(sections, id: \.title) { section in
                    Section(section.title) {
                        ForEach(section.tasks) { task in
                            TaskRow(task: task, members: members) { toggle(task) }
                                .onTapGesture { editing = task }
                        }
                    }
                }

                if !completed.isEmpty {
                    Section("Recently done") {
                        ForEach(completed.prefix(10)) { task in
                            TaskRow(task: task, members: members) { toggle(task) }
                        }
                    }
                }
            }
            .navigationTitle("Tasks")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isCreating = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("New task")
                }
            }
            .sheet(isPresented: $isCreating) { TaskEditorView(task: nil) }
            .sheet(item: $editing) { TaskEditorView(task: $0) }
            .navigationDestination(for: DeepLink.self) { link in
                if case .task(let id) = link, let task = TaskStore.task(id: id, context: modelContext) {
                    TaskEditorView(task: task)
                }
            }
            .animation(Motion.list, value: tasks.count)
        }
    }

    // MARK: - Grouping

    private var visible: [HouseholdTask] {
        TaskStore.filtered(tasks.filter { !$0.isComplete }, by: filter, currentMemberID: context.currentMemberID)
    }

    private var completed: [HouseholdTask] {
        tasks.filter(\.isComplete).sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }
    }

    private struct Section2 {
        let title: String
        let tasks: [HouseholdTask]
    }

    private var sections: [Section2] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: today) ?? today
        let weekEnd = calendar.date(byAdding: .day, value: 7, to: today) ?? today

        var overdue: [HouseholdTask] = []
        var todayTasks: [HouseholdTask] = []
        var soon: [HouseholdTask] = []
        var later: [HouseholdTask] = []
        var undated: [HouseholdTask] = []

        for task in visible {
            guard let due = task.dueDate else { undated.append(task); continue }
            if due < today { overdue.append(task) }
            else if due < tomorrow { todayTasks.append(task) }
            else if due < weekEnd { soon.append(task) }
            else { later.append(task) }
        }

        return [
            Section2(title: "Overdue", tasks: overdue),
            Section2(title: "Today", tasks: todayTasks),
            Section2(title: "This week", tasks: soon),
            Section2(title: "Later", tasks: later),
            Section2(title: "No date", tasks: undated),
        ].filter { !$0.tasks.isEmpty }
    }

    private func toggle(_ task: HouseholdTask) {
        withAnimation(Motion.snappy) {
            TaskStore.setComplete(!task.isComplete, on: task, by: context.currentMemberID, context: modelContext)
        }
    }
}

private struct TaskRow: View {
    let task: HouseholdTask
    let members: [Member]
    let toggle: () -> Void

    var body: some View {
        HStack(spacing: Spacing.m) {
            Button(action: toggle) {
                Image(systemName: task.isComplete ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(task.isComplete ? AnyShapeStyle(.tint) : AnyShapeStyle(.tertiary))
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(task.isComplete ? "Mark not done" : "Mark done")

            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .strikethrough(task.isComplete, color: .secondary)
                    .foregroundStyle(task.isComplete ? .secondary : .primary)
                HStack(spacing: Spacing.xs) {
                    if let due = task.dueDate {
                        Text(due.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
                    }
                    if task.recurrenceRule != nil {
                        Image(systemName: "repeat").accessibilityLabel("Repeats")
                    }
                    if let priority = TaskPriority(rawValue: task.priority), let symbol = priority.systemImage {
                        Image(systemName: symbol).accessibilityLabel(priority.title)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            if let assignee = members.first(where: { $0.id == task.assignedMemberID }) {
                MemberBadge(member: assignee, size: 24)
            }
        }
        .contentShape(Rectangle())
        .swipeActions(edge: .leading) {
            Button(task.isComplete ? "Reopen" : "Done", systemImage: "checkmark", action: toggle)
                .tint(.accentColor)
        }
    }
}

struct TaskEditorView: View {
    let task: HouseholdTask?

    @Environment(HouseholdContext.self) private var appContext
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @Query private var members: [Member]

    @State private var title = ""
    @State private var notes = ""
    @State private var hasDueDate = false
    @State private var dueDate = Date.now
    @State private var assignee: UUID?
    @State private var priority = TaskPriority.none
    @State private var repeats = false
    @State private var frequency: RecurrenceRule.Frequency = .weekly
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What needs doing?", text: $title, axis: .vertical)
                    TextField("Notes", text: $notes, axis: .vertical).lineLimit(2...6)
                }

                Section {
                    Toggle("Has a due date", isOn: $hasDueDate.animation(Motion.snappy))
                    if hasDueDate {
                        DatePicker("Due", selection: $dueDate, displayedComponents: [.date, .hourAndMinute])
                    }
                    Toggle("Repeats", isOn: $repeats.animation(Motion.snappy))
                    if repeats {
                        Picker("Frequency", selection: $frequency) {
                            ForEach(RecurrenceRule.Frequency.allCases) { Text($0.title).tag($0) }
                        }
                    }
                }

                Section("Who") {
                    Picker("Assigned to", selection: $assignee) {
                        Text("Anyone").tag(UUID?.none)
                        ForEach(members) { member in
                            Text(member.name).tag(UUID?.some(member.id))
                        }
                    }
                }

                Section("Priority") {
                    Picker("Priority", selection: $priority) {
                        ForEach(TaskPriority.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                if let task {
                    Section {
                        Button("Delete", role: .destructive) {
                            modelContext.delete(task)
                            try? modelContext.save()
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(task == nil ? "New task" : "Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .task { loadIfNeeded() }
        }
    }

    private func loadIfNeeded() {
        guard !loaded, let task else {
            loaded = true
            assignee = assignee ?? appContext.currentMemberID
            return
        }
        loaded = true
        title = task.title
        notes = task.notes ?? ""
        hasDueDate = task.dueDate != nil
        dueDate = task.dueDate ?? .now
        assignee = task.assignedMemberID
        priority = TaskPriority(rawValue: task.priority) ?? .none
        if let rule = task.recurrenceRule.flatMap(RecurrenceRule.init(rawValue:)) {
            repeats = true
            frequency = rule.frequency
        }
    }

    private func save() {
        let rule = repeats ? RecurrenceRule(frequency: frequency) : nil
        if let task {
            task.title = title.trimmingCharacters(in: .whitespaces)
            task.notes = notes.isEmpty ? nil : notes
            task.dueDate = hasDueDate ? dueDate : nil
            task.assignedMemberID = assignee
            task.priority = priority.rawValue
            task.recurrenceRule = rule?.rawValue
            task.lastModifiedBy = appContext.currentMemberID
            task.lastModifiedAt = .now
            try? modelContext.save()
        } else {
            TaskStore.add(
                title: title,
                dueDate: hasDueDate ? dueDate : nil,
                assignedTo: assignee,
                priority: priority.rawValue,
                recurrence: rule,
                notes: notes.isEmpty ? nil : notes,
                by: appContext.currentMemberID,
                context: modelContext
            )
        }
        dismiss()
    }
}

#Preview("Tasks") {
    TasksScreen()
        .environment(HouseholdContext())
        .modelContainer(TendModelContainer.preview())
}
