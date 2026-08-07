import SwiftData
import SwiftUI
import TendKit
import WidgetKit

// MARK: - Timeline entries

struct PulseEntry: TimelineEntry {
    let date: Date
    let headline: String
    let lines: [String]
    let isStale: Bool

    static let placeholder = PulseEntry(
        date: .now,
        headline: "Tuesday at a glance",
        lines: ["Soccer at 5:00 PM, then 1 more", "2 tasks due today", "7 on Groceries"],
        isStale: false
    )
}

struct PulseProvider: TimelineProvider {

    func placeholder(in context: Context) -> PulseEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (PulseEntry) -> Void) {
        completion(context.isPreview ? .placeholder : entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PulseEntry>) -> Void) {
        let current = entry()
        // Pulse only changes meaningfully a couple of times a day, so asking
        // for a refresh every hour would burn the budget §9 cares about for
        // nothing. Next morning, or in four hours, whichever is sooner.
        let next = min(
            Calendar.current.nextDate(after: .now, matching: DateComponents(hour: 6, minute: 30), matchingPolicy: .nextTime) ?? .now.addingTimeInterval(14_400),
            Date.now.addingTimeInterval(14_400)
        )
        completion(Timeline(entries: [current], policy: .after(next)))
    }

    private func entry() -> PulseEntry {
        guard let container = try? TendModelContainer.make(.cloudKit) else {
            return PulseEntry(date: .now, headline: "Tend", lines: [], isStale: true)
        }
        let context = ModelContext(container)
        let hour = Calendar.current.component(.hour, from: .now)
        let kind: PulseKind = hour >= 16 ? .weekly : .morning

        // The digest is read, never computed here. A widget that recomputes on
        // every timeline request is a widget that gets throttled.
        guard let digest = PulseService.latest(kind: kind, context: context) else {
            return PulseEntry(date: .now, headline: "Nothing needs you", lines: [], isStale: false)
        }
        return PulseEntry(
            date: digest.generatedAt,
            headline: digest.headline,
            lines: digest.lines,
            isStale: digest.generatedAt.timeIntervalSinceNow < -86_400
        )
    }
}

// MARK: - Widget

struct PulseWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: TendIdentifiers.pulseWidgetKind, provider: PulseProvider()) { entry in
            PulseWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Pulse")
        .description("What's done, what's left, what's coming.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct PulseWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PulseEntry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.headline).font(.headline).lineLimit(1)
                ForEach(entry.lines.prefix(2), id: \.self) { line in
                    Text(line).font(.caption).lineLimit(1)
                }
            }
            .widgetURL(DeepLink.pulse(nil).url)

        default:
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(entry.headline)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)

                if entry.lines.isEmpty {
                    Text("A clear day.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(entry.lines.prefix(family == .systemSmall ? 2 : 4), id: \.self) { line in
                        Text(line)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }

                Spacer(minLength: 0)

                if entry.isStale {
                    Text("Open Tend to refresh")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(DeepLink.pulse(nil).url)
        }
    }
}

#Preview("Pulse widget", as: .systemMedium) {
    PulseWidget()
} timeline: {
    PulseEntry.placeholder
}
