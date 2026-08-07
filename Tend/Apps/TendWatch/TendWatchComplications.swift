import SwiftData
import SwiftUI
import TendKit
import WidgetKit

/// Watch complications. On watchOS 10 these are WidgetKit widgets, so they
/// share the `TimelineEntry` shape and the deep-link contract with the phone's
/// widgets — including the rule that a complication opens the *thing*, not the
/// app.
@main
struct TendWatchComplications: WidgetBundle {
    var body: some Widget {
        NextEventComplication()
        ListCountComplication()
    }
}

struct WatchNextEventEntry: TimelineEntry {
    let date: Date
    let eventID: UUID?
    let title: String
    let start: Date?

    static let placeholder = WatchNextEventEntry(
        date: .now,
        eventID: UUID(),
        title: "Soccer",
        start: .now.addingTimeInterval(3600)
    )
}

struct WatchNextEventProvider: TimelineProvider {
    func placeholder(in context: Context) -> WatchNextEventEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (WatchNextEventEntry) -> Void) {
        completion(context.isPreview ? .placeholder : entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WatchNextEventEntry>) -> Void) {
        let current = entry()
        let refresh = current.start.map { $0.addingTimeInterval(1800) } ?? .now.addingTimeInterval(3600)
        completion(Timeline(entries: [current], policy: .after(max(refresh, .now.addingTimeInterval(900)))))
    }

    private func entry() -> WatchNextEventEntry {
        guard let container = try? TendModelContainer.make(.cloudKit) else {
            return WatchNextEventEntry(date: .now, eventID: nil, title: "—", start: nil)
        }
        let context = ModelContext(container)
        let events = (try? context.fetch(FetchDescriptor<Event>())) ?? []
        let horizon = Calendar.current.date(byAdding: .day, value: 14, to: .now) ?? .now

        guard let next = EventStore.occurrences(in: Date.now..<horizon, events: events).first,
              let event = events.first(where: { $0.id == next.eventID })
        else {
            return WatchNextEventEntry(date: .now, eventID: nil, title: "Nothing on", start: nil)
        }
        return WatchNextEventEntry(date: .now, eventID: event.id, title: event.title, start: next.start)
    }
}

struct NextEventComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TendWatchNextEvent", provider: WatchNextEventProvider()) { entry in
            NextEventComplicationView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Next up")
        .description("The next thing on the household's calendar.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
    }
}

struct NextEventComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WatchNextEventEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.title).font(.headline).lineLimit(1)
                    if let start = entry.start {
                        Text(start, style: .time).font(.caption)
                    }
                }
            case .accessoryInline:
                if let start = entry.start {
                    Text("\(entry.title) \(start.formatted(date: .omitted, time: .shortened))")
                } else {
                    Text(entry.title)
                }
            default:
                VStack(spacing: 0) {
                    Image(systemName: "calendar").font(.caption2)
                    if let start = entry.start {
                        Text(start, style: .time).font(.caption2)
                    }
                }
            }
        }
        .widgetURL(
            entry.eventID.map { DeepLink.event(id: $0, occurrence: entry.start).url }
                ?? DeepLink.calendar(date: nil).url
        )
    }
}

struct WatchListEntry: TimelineEntry {
    let date: Date
    let listName: String
    let remaining: Int

    static let placeholder = WatchListEntry(date: .now, listName: TendList.groceries, remaining: 7)
}

struct WatchListProvider: TimelineProvider {
    func placeholder(in context: Context) -> WatchListEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (WatchListEntry) -> Void) {
        completion(context.isPreview ? .placeholder : entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WatchListEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .after(.now.addingTimeInterval(1800))))
    }

    private func entry() -> WatchListEntry {
        guard let container = try? TendModelContainer.make(.cloudKit) else {
            return WatchListEntry(date: .now, listName: TendList.groceries, remaining: 0)
        }
        let context = ModelContext(container)
        let open = ListStore.openItems(in: TendList.groceries, context: context).count
        return WatchListEntry(date: .now, listName: TendList.groceries, remaining: open)
    }
}

struct ListCountComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TendWatchListCount", provider: WatchListProvider()) { entry in
            VStack(spacing: 0) {
                Image(systemName: "cart").font(.caption2)
                Text("\(entry.remaining)").font(.caption.monospacedDigit())
            }
            .containerBackground(.fill.tertiary, for: .widget)
            .widgetURL(DeepLink.list(name: entry.listName).url)
        }
        .configurationDisplayName("Groceries")
        .description("How much is still on the list.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryInline])
    }
}
