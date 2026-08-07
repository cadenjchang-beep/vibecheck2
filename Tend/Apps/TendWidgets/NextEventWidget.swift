import SwiftData
import SwiftUI
import TendKit
import WidgetKit

struct NextEventEntry: TimelineEntry {
    let date: Date
    let eventID: UUID?
    let title: String
    let start: Date?
    let isAllDay: Bool
    let location: String?
    let colorHex: String

    static let placeholder = NextEventEntry(
        date: .now,
        eventID: UUID(),
        title: "Dentist — Mika",
        start: .now.addingTimeInterval(5400),
        isAllDay: false,
        location: "Bright Smiles",
        colorHex: MemberPalette.hex(forIndex: 2)
    )
}

struct NextEventProvider: TimelineProvider {

    func placeholder(in context: Context) -> NextEventEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (NextEventEntry) -> Void) {
        completion(context.isPreview ? .placeholder : entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NextEventEntry>) -> Void) {
        let current = entry()
        // Refresh just after the current event ends, so the widget rolls to the
        // next one exactly when it becomes wrong — rather than on a fixed
        // cadence that is either wasteful or late.
        let refresh = current.start.map { $0.addingTimeInterval(3600) } ?? .now.addingTimeInterval(3600)
        completion(Timeline(entries: [current], policy: .after(max(refresh, .now.addingTimeInterval(900)))))
    }

    private func entry() -> NextEventEntry {
        guard let container = try? TendModelContainer.make(.cloudKit) else {
            return NextEventEntry(date: .now, eventID: nil, title: "Nothing on", start: nil, isAllDay: false, location: nil, colorHex: MemberPalette.hex(forIndex: 0))
        }
        let context = ModelContext(container)
        let calendar = Calendar.current
        let horizon = calendar.date(byAdding: .day, value: 30, to: .now) ?? .now

        let events = (try? context.fetch(FetchDescriptor<Event>())) ?? []
        let members = (try? context.fetch(FetchDescriptor<Member>())) ?? []

        guard let next = EventStore.occurrences(in: Date.now..<horizon, events: events, calendar: calendar).first,
              let event = events.first(where: { $0.id == next.eventID })
        else {
            return NextEventEntry(date: .now, eventID: nil, title: "Nothing on", start: nil, isAllDay: false, location: nil, colorHex: MemberPalette.hex(forIndex: 0))
        }

        let colorHex = members.first { event.attendeeIDs.contains($0.id) }?.colorHex ?? MemberPalette.hex(forIndex: 0)
        return NextEventEntry(
            date: .now,
            eventID: event.id,
            title: event.title,
            start: next.start,
            isAllDay: event.isAllDay,
            location: event.location,
            colorHex: colorHex
        )
    }
}

struct NextEventWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: TendIdentifiers.nextEventWidgetKind, provider: NextEventProvider()) { entry in
            NextEventWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Next up")
        .description("The next thing on the household's calendar.")
        .supportedFamilies([
            .systemSmall, .systemMedium,
            .accessoryRectangular, .accessoryInline, .accessoryCircular,
        ])
    }
}

struct NextEventWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: NextEventEntry

    private var destination: URL {
        guard let id = entry.eventID else { return DeepLink.calendar(date: nil).url }
        return DeepLink.event(id: id, occurrence: entry.start).url
    }

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Text(inlineText)

            case .accessoryCircular:
                VStack(spacing: 0) {
                    Image(systemName: "calendar")
                        .font(.caption2)
                    if let start = entry.start, !entry.isAllDay {
                        Text(start, style: .time).font(.caption2)
                    }
                }

            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.title).font(.headline).lineLimit(1)
                    Text(timeText).font(.caption).lineLimit(1)
                }

            default:
                HStack(alignment: .top, spacing: Spacing.s) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(hex: entry.colorHex))
                        .frame(width: 4)
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text(entry.title)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(2)
                        Text(timeText)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let location = entry.location, !location.isEmpty {
                            Label(location, systemImage: "mappin")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .widgetURL(destination)
    }

    private var inlineText: String {
        guard let start = entry.start else { return "Nothing on" }
        return "\(entry.title) · \(start.formatted(date: .omitted, time: .shortened))"
    }

    private var timeText: String {
        guard let start = entry.start else { return "Nothing coming up" }
        if entry.isAllDay {
            return start.formatted(.dateTime.weekday(.wide).day().month(.abbreviated)) + " · All day"
        }
        return start.formatted(.dateTime.weekday(.abbreviated).hour().minute())
    }
}

#Preview("Next event", as: .systemSmall) {
    NextEventWidget()
} timeline: {
    NextEventEntry.placeholder
}
