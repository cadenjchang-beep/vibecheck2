import SwiftData
import SwiftUI
import TendKit

/// What the share sheet shows: the draft, editable, one button to save.
///
/// It deliberately does not open the app. The whole point is that the thing is
/// captured before attention moves on.
struct ShareDraftView: View {
    let draft: SharedDraft
    let onSave: () -> Void
    let onCancel: () -> Void

    @State private var title = ""
    @State private var startDate = Date.now
    @State private var hasDate = false
    @State private var location = ""
    @State private var notes = ""
    @State private var listName = TendList.groceries
    @State private var kind: QuickAddResult.Kind = .listItem
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var container: ModelContainer? {
        try? TendModelContainer.make(.cloudKit)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Add as", selection: $kind) {
                        Text("Event").tag(QuickAddResult.Kind.event)
                        Text("Task").tag(QuickAddResult.Kind.task)
                        Text("List item").tag(QuickAddResult.Kind.listItem)
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    TextField("Title", text: $title, axis: .vertical)

                    if kind != .listItem {
                        Toggle("Has a date", isOn: $hasDate.animation(Motion.snappy))
                        if hasDate {
                            DatePicker("When", selection: $startDate)
                        }
                    }

                    if kind == .event {
                        TextField("Where", text: $location)
                    }

                    if kind == .listItem {
                        TextField("List", text: $listName)
                    }
                }

                if !notes.isEmpty {
                    Section("From the share") {
                        Text(notes)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(6)
                    }
                }

                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("Add to Tend")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onCancel) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { save() }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .task { apply(draft) }
        }
    }

    // MARK: - Draft → fields

    private func apply(_ draft: SharedDraft) {
        switch draft {
        case .event(let eventDraft):
            kind = .event
            title = eventDraft.title
            hasDate = eventDraft.startDate != nil
            startDate = eventDraft.startDate ?? .now
            location = eventDraft.location ?? ""
            notes = eventDraft.notes ?? ""

        case .listItem(let text, let list, _):
            kind = .listItem
            title = text
            listName = list

        case .recipe(let url):
            // A recipe URL becomes a task to import it, because the import
            // itself wants a network call and a review step that don't belong
            // in a share sheet's few seconds of runtime.
            kind = .task
            title = "Save recipe from \(url.host() ?? "the web")"
            notes = url.absoluteString

        case .note(let text):
            kind = .listItem
            title = String(text.prefix(80))
            notes = text
        }
    }

    // MARK: - Save

    private func save() {
        guard let container else {
            errorMessage = "Couldn't reach your household's data."
            return
        }
        isSaving = true
        let context = ModelContext(container)
        let memberID = HouseholdContext.storedMemberID()
        let cleanTitle = title.trimmingCharacters(in: .whitespaces)

        switch kind {
        case .listItem:
            ListStore.add(cleanTitle, to: listName, by: memberID, context: context)

        case .task:
            TaskStore.add(
                title: cleanTitle,
                dueDate: hasDate ? startDate : nil,
                notes: notes.isEmpty ? nil : notes,
                by: memberID,
                context: context
            )

        case .event:
            let event = Event(
                title: cleanTitle,
                location: location.isEmpty ? nil : location,
                startDate: hasDate ? startDate : .now,
                endDate: (hasDate ? startDate : .now).addingTimeInterval(3600),
                notes: notes.isEmpty ? nil : notes,
                lastModifiedBy: memberID
            )
            context.insert(event)
        }

        do {
            try context.save()
            onSave()
        } catch {
            isSaving = false
            errorMessage = "Couldn't save that. Nothing was lost — try again."
        }
    }
}
