import SwiftData
import SwiftUI
import TendKit

/// The global "+".
///
/// One field, no form, no type picker. The bet from §1 is that a thought which
/// takes ten seconds to log doesn't get logged — so the parse happens live and
/// what it found is shown as a quiet line underneath, not as fields to confirm.
/// Return saves. Everything else is optional.
struct QuickAddSheet: View {
    let initialText: String

    @Environment(HouseholdContext.self) private var appContext
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @Query private var members: [Member]

    @State private var text = ""
    @State private var parsed: QuickAddResult?
    @FocusState private var isFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Spacing.m) {
                TextField("soccer practice every Tue 5pm at Lincoln Park", text: $text, axis: .vertical)
                    .font(.title3)
                    .focused($isFocused)
                    .lineLimit(1...4)
                    .submitLabel(.done)
                    .onSubmit(save)
                    .onChange(of: text) { _, newValue in
                        parsed = newValue.isEmpty ? nil : QuickAddParser.parse(newValue)
                    }

                if let parsed, !parsed.title.isEmpty {
                    interpretation(parsed)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }

                Spacer()

                examples
            }
            .padding(Spacing.m)
            .navigationTitle("Add")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add", action: save).disabled(parsed?.title.isEmpty ?? true)
                }
            }
            .task {
                text = initialText
                if !initialText.isEmpty { parsed = QuickAddParser.parse(initialText) }
                isFocused = true
            }
            .animation(Motion.smooth, value: parsed)
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - What the parser understood

    private func interpretation(_ parsed: QuickAddResult) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            HStack(spacing: Spacing.s) {
                Image(systemName: icon(for: parsed.kind))
                    .foregroundStyle(.tint)
                Text(parsed.title).font(.body.weight(.medium))
            }

            FlowRow(spacing: Spacing.xs) {
                if let start = parsed.startDate {
                    chip(start.formatted(
                        date: .abbreviated,
                        time: parsed.isAllDay ? .omitted : .shortened
                    ), systemImage: "clock")
                }
                if let rule = parsed.rule {
                    chip(rule.localizedDescription(), systemImage: "repeat")
                }
                if let location = parsed.location {
                    chip(location, systemImage: "mappin")
                }
                if let listName = parsed.listName {
                    chip(listName, systemImage: "checklist")
                }
                if let quantity = parsed.quantity {
                    chip(quantity, systemImage: "number")
                }
                if parsed.priority > 0 {
                    chip(TaskPriority(rawValue: parsed.priority)?.title ?? "Priority", systemImage: "exclamationmark")
                }
                ForEach(matchedMembers(parsed), id: \.id) { member in
                    chip(member.name, systemImage: "person")
                }
            }

            // Below a confidence threshold the parse is offered rather than
            // asserted, so a bad guess never silently becomes an event.
            if parsed.confidence < 0.45 {
                Text("Not sure about this one — it'll go to \(destinationName(parsed)) unless you edit it.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: Radius.medium))
    }

    private var examples: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Try").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ForEach([
                "dentist thursday 9:30am",
                "swim every mon and wed 6pm at the rec centre",
                "2 dozen eggs #groceries",
                "remind me to renew the passport !!",
            ], id: \.self) { example in
                Button(example) {
                    text = example
                    parsed = QuickAddParser.parse(example)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
    }

    private func chip(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.caption)
            .padding(.horizontal, Spacing.s)
            .padding(.vertical, Spacing.xs)
            .background(.quaternary.opacity(0.5), in: Capsule())
    }

    private func icon(for kind: QuickAddResult.Kind) -> String {
        switch kind {
        case .event: "calendar"
        case .task: "checkmark.circle"
        case .listItem: "cart"
        }
    }

    private func destinationName(_ parsed: QuickAddResult) -> String {
        switch parsed.kind {
        case .event: "the calendar"
        case .task: "Tasks"
        case .listItem: parsed.listName ?? TendList.groceries
        }
    }

    private func matchedMembers(_ parsed: QuickAddResult) -> [Member] {
        members.filter { member in
            parsed.mentionedNames.contains { member.name.lowercased().hasPrefix($0.lowercased()) }
        }
    }

    // MARK: - Save

    private func save() {
        guard let parsed, !parsed.title.isEmpty else { return }
        let memberID = appContext.currentMemberID
        let mentioned = matchedMembers(parsed).map(\.id)

        switch parsed.kind {
        case .listItem:
            ListStore.add(
                parsed.title,
                to: parsed.listName ?? TendList.groceries,
                quantity: parsed.quantity,
                by: memberID,
                context: modelContext
            )
        case .task:
            TaskStore.add(
                title: parsed.title,
                dueDate: parsed.startDate,
                assignedTo: mentioned.first ?? memberID,
                priority: parsed.priority,
                recurrence: parsed.rule,
                by: memberID,
                context: modelContext
            )
        case .event:
            let start = parsed.startDate ?? .now
            let event = Event(
                title: parsed.title,
                location: parsed.location,
                startDate: start,
                endDate: parsed.endDate ?? start.addingTimeInterval(3600),
                isAllDay: parsed.isAllDay,
                recurrenceRule: parsed.rule?.rawValue,
                attendeeIDs: mentioned.isEmpty ? [memberID].compactMap { $0 } : mentioned,
                lastModifiedBy: memberID
            )
            modelContext.insert(event)
            try? modelContext.save()
        }

        dismiss()
    }
}

/// A wrapping row of chips. `Layout` rather than a `LazyVGrid` so chips of
/// different widths pack properly at every Dynamic Type size.
struct FlowRow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var rowWidth: CGFloat = 0
        var totalHeight: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if rowWidth + size.width > width, rowWidth > 0 {
                totalHeight += rowHeight + spacing
                rowWidth = 0
                rowHeight = 0
            }
            rowWidth += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: totalHeight + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

#Preview("Quick add") {
    QuickAddSheet(initialText: "soccer practice every Tue 5pm at Lincoln Park")
        .environment(HouseholdContext())
        .modelContainer(TendModelContainer.preview())
}
