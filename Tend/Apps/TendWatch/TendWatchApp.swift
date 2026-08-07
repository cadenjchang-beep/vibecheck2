import SwiftData
import SwiftUI
import TendKit

@main
struct TendWatchApp: App {
    private let modelContainer: ModelContainer

    init() {
        // The Watch app opens the same CloudKit-mirrored store as the phone
        // rather than talking to the phone over WatchConnectivity. That means
        // it works with the phone out of range, which is exactly when someone
        // is standing in a shop.
        modelContainer = (try? TendModelContainer.make(.cloudKit))
            ?? (try? TendModelContainer.make(.localOnly))
            ?? TendModelContainer.previewUnsafe()
    }

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .modelContainer(modelContainer)
        }
    }
}

struct WatchRootView: View {
    @State private var selection: WatchTab = .today

    enum WatchTab: Hashable { case today, lists, tasks }

    var body: some View {
        TabView(selection: $selection) {
            WatchTodayView().tag(WatchTab.today)
            WatchListsView().tag(WatchTab.lists)
            WatchTasksView().tag(WatchTab.tasks)
        }
        .tabViewStyle(.verticalPage)
    }
}

struct WatchTodayView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var events: [Event]

    private var todaysOccurrences: [EventOccurrence] {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: .now)
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start
        return EventStore.occurrences(in: start..<end, events: events, calendar: calendar)
    }

    var body: some View {
        NavigationStack {
            List {
                if todaysOccurrences.isEmpty {
                    Text("Nothing on today")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(todaysOccurrences, id: \.self) { occurrence in
                        let event = events.first { $0.id == occurrence.eventID }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event?.title ?? "Event")
                                .font(.headline)
                                .lineLimit(2)
                            Text(
                                event?.isAllDay == true
                                    ? "All day"
                                    : occurrence.start.formatted(date: .omitted, time: .shortened)
                            )
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Today")
        }
    }
}

struct WatchListsView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var items: [ListItem]

    private var listNames: [String] {
        let discovered = Set(items.map(\.listName))
        return (TendList.defaults + discovered.subtracting(TendList.defaults).sorted())
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(listNames, id: \.self) { name in
                    NavigationLink {
                        WatchListDetail(listName: name)
                    } label: {
                        HStack {
                            Text(name)
                            Spacer()
                            Text("\(items.filter { $0.listName == name && !$0.isChecked }.count)")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Lists")
        }
    }
}

struct WatchListDetail: View {
    let listName: String

    @Environment(\.modelContext) private var modelContext
    @Query private var items: [ListItem]

    init(listName: String) {
        self.listName = listName
        _items = Query(
            filter: #Predicate<ListItem> { $0.listName == listName && !$0.isChecked },
            sort: [SortDescriptor(\ListItem.sortIndex)]
        )
    }

    var body: some View {
        List {
            if items.isEmpty {
                Text("All clear").font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(items) { item in
                Button {
                    withAnimation(Motion.snappy) {
                        // Same code path as the phone and the widget, so a
                        // check-off from the wrist is attributed correctly.
                        ListStore.setChecked(
                            true,
                            on: item,
                            by: HouseholdContext.storedMemberID(),
                            context: modelContext
                        )
                    }
                } label: {
                    HStack {
                        Image(systemName: "circle")
                        Text(item.text).lineLimit(2)
                    }
                }
            }
        }
        .navigationTitle(listName)
    }
}

struct WatchTasksView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(filter: #Predicate<HouseholdTask> { !$0.isComplete }, sort: [SortDescriptor(\HouseholdTask.dueDate)])
    private var tasks: [HouseholdTask]

    var body: some View {
        NavigationStack {
            List {
                if tasks.isEmpty {
                    Text("Nothing open").font(.footnote).foregroundStyle(.secondary)
                }
                ForEach(tasks) { task in
                    Button {
                        withAnimation(Motion.snappy) {
                            TaskStore.setComplete(
                                true,
                                on: task,
                                by: HouseholdContext.storedMemberID(),
                                context: modelContext
                            )
                        }
                    } label: {
                        HStack {
                            Image(systemName: "circle")
                            Text(task.title).lineLimit(2)
                        }
                    }
                }
            }
            .navigationTitle("Tasks")
        }
    }
}

private extension TendModelContainer {
    /// Last-resort in-memory container so the Watch app shows an empty state
    /// rather than refusing to launch.
    static func previewUnsafe() -> ModelContainer {
        // Force-try is acceptable here only because an in-memory container has
        // no failure mode short of a broken schema, which would have failed the
        // build.
        try! make(.ephemeral)
    }
}
