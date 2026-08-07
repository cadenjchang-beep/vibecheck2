import SwiftData
import SwiftUI
import TendKit

struct ListsScreen: View {
    @Environment(HouseholdContext.self) private var context
    @Environment(\.modelContext) private var modelContext

    @Query private var items: [ListItem]

    var body: some View {
        @Bindable var context = context

        NavigationStack(path: $context.listsPath) {
            List {
                ForEach(listNames, id: \.self) { name in
                    NavigationLink(value: DeepLink.list(name: name)) {
                        HStack {
                            Label(name, systemImage: name == TendList.groceries ? "cart" : "checklist")
                            Spacer()
                            let open = items.filter { $0.listName == name && !$0.isChecked }.count
                            Text(open == 0 ? "Clear" : "\(open)")
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Lists")
            .navigationDestination(for: DeepLink.self) { link in
                switch link {
                case .list(let name):
                    ListDetailView(listName: name)
                case .listItem(_, let listName):
                    ListDetailView(listName: listName ?? TendList.groceries)
                case .shoppingTrip(let name):
                    ListDetailView(listName: name)
                default:
                    EmptyView()
                }
            }
            .overlay {
                if listNames.isEmpty {
                    EmptyStateView(
                        systemImage: "checklist",
                        title: "No lists yet",
                        message: "Groceries and Household are waiting for you. Add something and they'll appear."
                    )
                }
            }
        }
    }

    private var listNames: [String] {
        let discovered = Set(items.map(\.listName))
        let custom = discovered.subtracting(TendList.defaults).sorted()
        return TendList.defaults + custom
    }
}

struct ListDetailView: View {
    let listName: String

    @Environment(HouseholdContext.self) private var appContext
    @Environment(\.modelContext) private var modelContext

    @Query private var allItems: [ListItem]
    @Query private var members: [Member]

    @State private var draft = ""
    @State private var undoBuffer: [ListItem] = []
    @FocusState private var isFieldFocused: Bool

    init(listName: String) {
        self.listName = listName
        _allItems = Query(
            filter: #Predicate<ListItem> { $0.listName == listName },
            sort: [SortDescriptor(\ListItem.sortIndex), SortDescriptor(\ListItem.createdAt)]
        )
    }

    var body: some View {
        List {
            // The add field lives at the top and keeps focus after each add.
            // §3 is specific about this and it is the single highest-leverage
            // detail in the whole list feature: it turns "add six things" from
            // six round trips into one.
            Section {
                HStack(spacing: Spacing.s) {
                    Image(systemName: "plus.circle.fill")
                        .foregroundStyle(.tint)
                        .accessibilityHidden(true)
                    TextField("Add to \(listName)", text: $draft)
                        .focused($isFieldFocused)
                        .submitLabel(.done)
                        .onSubmit(add)
                        .textInputAutocapitalization(.sentences)
                        .autocorrectionDisabled(false)
                }
            }

            if openItems.isEmpty && checkedItems.isEmpty {
                Section {
                    EmptyStateView(
                        systemImage: "cart",
                        title: "\(listName) is clear",
                        message: "Type above, ask Siri, or check something off from the Home Screen."
                    )
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                }
            }

            ForEach(ListStore.grouped(openItems), id: \.aisle) { group in
                Section(group.aisle.rawValue) {
                    ForEach(group.items) { item in
                        ItemRow(item: item, members: members) { toggle(item) }
                    }
                    .onDelete { offsets in delete(offsets, in: group.items) }
                }
            }

            if !checkedItems.isEmpty {
                Section("Done") {
                    ForEach(checkedItems) { item in
                        ItemRow(item: item, members: members) { toggle(item) }
                    }
                    Button("Clear \(checkedItems.count) checked") { clearChecked() }
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle(listName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Start a shopping trip", systemImage: "cart") { startTrip() }
                    if !undoBuffer.isEmpty {
                        Button("Undo clearing", systemImage: "arrow.uturn.backward") { undoClear() }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .animation(Motion.list, value: allItems.count)
    }

    // MARK: - Data

    private var openItems: [ListItem] { allItems.filter { !$0.isChecked } }
    private var checkedItems: [ListItem] { allItems.filter(\.isChecked) }

    // MARK: - Actions

    private func add() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        // Even a plain list entry goes through the parser, so "2 dozen eggs"
        // and "milk #household" behave the same here as they do in quick add.
        let parsed = QuickAddParser.parse(text)
        withAnimation(Motion.list) {
            ListStore.add(
                parsed.kind == .listItem ? parsed.title : text,
                to: parsed.listName ?? listName,
                quantity: parsed.quantity,
                by: appContext.currentMemberID,
                context: modelContext
            )
        }
        draft = ""
        isFieldFocused = true
    }

    private func toggle(_ item: ListItem) {
        withAnimation(Motion.snappy) {
            ListStore.setChecked(!item.isChecked, on: item, by: appContext.currentMemberID, context: modelContext)
        }
    }

    private func delete(_ offsets: IndexSet, in items: [ListItem]) {
        withAnimation(Motion.list) {
            for index in offsets { modelContext.delete(items[index]) }
            try? modelContext.save()
        }
    }

    private func clearChecked() {
        withAnimation(Motion.list) {
            undoBuffer = ListStore.clearChecked(in: listName, context: modelContext)
        }
    }

    private func undoClear() {
        withAnimation(Motion.list) {
            for item in undoBuffer {
                ListStore.add(item.text, to: listName, quantity: item.quantity, by: item.addedBy, context: modelContext)
            }
            undoBuffer = []
        }
    }

    private func startTrip() {
        #if os(iOS)
        ShoppingTripActivity.start(listName: listName, remaining: openItems.count)
        #endif
    }
}

private struct ItemRow: View {
    let item: ListItem
    let members: [Member]
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: Spacing.m) {
                Image(systemName: item.isChecked ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(item.isChecked ? AnyShapeStyle(.tint) : AnyShapeStyle(.tertiary))
                    .contentTransition(.symbolEffect(.replace))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 1) {
                    Text(item.text)
                        .strikethrough(item.isChecked, color: .secondary)
                        .foregroundStyle(item.isChecked ? .secondary : .primary)
                    if let quantity = item.quantity {
                        Text(quantity).font(.caption).foregroundStyle(.secondary)
                    }
                }

                Spacer(minLength: 0)

                if item.hasLocationReminder {
                    Image(systemName: "location.circle")
                        .foregroundStyle(.tertiary)
                        .accessibilityLabel("Has a location reminder")
                }
                if let completer = members.first(where: { $0.id == item.completedBy }), item.isChecked {
                    MemberBadge(member: completer, size: 20)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(item.isChecked ? [.isButton, .isSelected] : .isButton)
        .accessibilityLabel(item.text)
        .accessibilityValue(item.isChecked ? "Checked off" : "Still needed")
        // No confirmation dialog: deleting one list item is reversible and a
        // dialog here would cost more than the mistake it prevents (§3).
        .swipeActions(edge: .trailing) {
            Button(item.isChecked ? "Uncheck" : "Check", systemImage: item.isChecked ? "arrow.uturn.backward" : "checkmark") {
                toggle()
            }
            .tint(.accentColor)
        }
    }
}

#Preview("Lists") {
    ListsScreen()
        .environment(HouseholdContext())
        .modelContainer(TendModelContainer.preview())
}

#Preview("List detail — dark") {
    NavigationStack {
        ListDetailView(listName: TendList.groceries)
    }
    .environment(HouseholdContext())
    .modelContainer(TendModelContainer.preview())
    .preferredColorScheme(.dark)
}
