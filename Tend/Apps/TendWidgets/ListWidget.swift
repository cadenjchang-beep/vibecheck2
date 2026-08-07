import AppIntents
import SwiftData
import SwiftUI
import TendKit
import WidgetKit

// MARK: - Configuration

struct ListWidgetConfiguration: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "List"
    static var description = IntentDescription("Choose which list to show.")

    @Parameter(title: "List", default: TendList.groceries)
    var listName: String

    init() {}
    init(listName: String) { self.listName = listName }
}

// MARK: - Timeline

struct ListEntry: TimelineEntry {
    let date: Date
    let listName: String
    let items: [ItemSnapshot]
    let remaining: Int

    struct ItemSnapshot: Identifiable, Hashable {
        let id: UUID
        let text: String
        let quantity: String?
        let isChecked: Bool
    }

    static let placeholder = ListEntry(
        date: .now,
        listName: TendList.groceries,
        items: [
            .init(id: UUID(), text: "Milk", quantity: nil, isChecked: false),
            .init(id: UUID(), text: "Sourdough", quantity: nil, isChecked: false),
            .init(id: UUID(), text: "Chicken thighs", quantity: "6", isChecked: false),
        ],
        remaining: 7
    )
}

struct ListProvider: AppIntentTimelineProvider {

    func placeholder(in context: Context) -> ListEntry { .placeholder }

    func snapshot(for configuration: ListWidgetConfiguration, in context: Context) async -> ListEntry {
        context.isPreview ? .placeholder : entry(for: configuration.listName)
    }

    func timeline(for configuration: ListWidgetConfiguration, in context: Context) async -> Timeline<ListEntry> {
        // The interactive check-off reloads the timeline itself, so this only
        // needs a slow safety-net refresh for changes that arrived by sync.
        Timeline(entries: [entry(for: configuration.listName)], policy: .after(.now.addingTimeInterval(1800)))
    }

    private func entry(for listName: String) -> ListEntry {
        guard let container = try? TendModelContainer.make(.cloudKit) else {
            return ListEntry(date: .now, listName: listName, items: [], remaining: 0)
        }
        let context = ModelContext(container)
        let open = ListStore.openItems(in: listName, context: context)
        return ListEntry(
            date: .now,
            listName: listName,
            items: open.prefix(6).map {
                .init(id: $0.id, text: $0.text, quantity: $0.quantity, isChecked: $0.isChecked)
            },
            remaining: open.count
        )
    }
}

// MARK: - Widget

struct ListWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: TendIdentifiers.listWidgetKind,
            intent: ListWidgetConfiguration.self,
            provider: ListProvider()
        ) { entry in
            ListWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("List")
        .description("Check things off without opening the app.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
    }
}

struct ListWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ListEntry

    private var visibleCount: Int {
        switch family {
        case .systemSmall: 3
        case .systemMedium: 4
        case .systemLarge: 6
        default: 2
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack {
                Text(entry.listName)
                    .font(.caption.weight(.semibold))
                Spacer()
                Text("\(entry.remaining)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            if entry.items.isEmpty {
                Spacer()
                Text("All clear")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer()
            } else {
                ForEach(entry.items.prefix(visibleCount)) { item in
                    // The interactive part: a `Button(intent:)` runs
                    // `ToggleListItemIntent` in the widget's own process and
                    // writes straight to the shared store — no app launch, and
                    // the check-off is attributed to the right person because
                    // the intent goes through `ListStore` like everything else.
                    Button(intent: ToggleListItemIntent(itemID: item.id)) {
                        HStack(spacing: Spacing.s) {
                            Image(systemName: "circle")
                                .foregroundStyle(.tertiary)
                            Text(item.text)
                                .font(.caption)
                                .lineLimit(1)
                            if let quantity = item.quantity {
                                Text(quantity)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Check off \(item.text)")
                }

                if entry.remaining > visibleCount {
                    Text("+\(entry.remaining - visibleCount) more")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // Tapping anywhere that isn't an item opens the list itself, not just
        // "the app".
        .widgetURL(DeepLink.list(name: entry.listName).url)
    }
}

#Preview("List widget", as: .systemMedium) {
    ListWidget()
} timeline: {
    ListEntry.placeholder
}
