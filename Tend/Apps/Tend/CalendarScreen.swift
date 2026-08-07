import SwiftData
import SwiftUI
import TendKit

enum CalendarMode: String, CaseIterable, Identifiable {
    case day, week, month, list
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

struct CalendarScreen: View {
    @Environment(HouseholdContext.self) private var context
    @Environment(\.modelContext) private var modelContext

    @Query(sort: \Event.startDate) private var events: [Event]
    @Query private var members: [Member]

    @State private var mode: CalendarMode = .week
    @State private var anchor = Date.now
    @State private var editing: EventEditorTarget?

    private var calendar: Calendar { .current }

    var body: some View {
        @Bindable var context = context

        NavigationStack(path: $context.calendarPath) {
            VStack(spacing: 0) {
                Picker("View", selection: $mode) {
                    ForEach(CalendarMode.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, Spacing.m)
                .padding(.bottom, Spacing.s)

                content
            }
            .navigationTitle(navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        editing = .creating(start: defaultStart)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("New event")
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button("Today") { withAnimation(Motion.smooth) { anchor = .now } }
                }
            }
            .sheet(item: $editing) { target in
                EventEditorView(target: target)
            }
            .navigationDestination(for: DeepLink.self) { link in
                if case .event(let id, let occurrence) = link, let event = EventStore.event(id: id, context: modelContext) {
                    EventDetailView(event: event, occurrenceStart: occurrence ?? event.startDate)
                }
            }
            .animation(Motion.smooth, value: mode)
        }
    }

    // MARK: - Modes

    @ViewBuilder
    private var content: some View {
        switch mode {
        case .day: dayView
        case .week: weekView
        case .month: monthView
        case .list: listView
        }
    }

    private var dayView: some View {
        ScrollView {
            let occurrences = occurrences(in: dayRange(anchor))
            if occurrences.isEmpty {
                EmptyStateView(
                    systemImage: "calendar.day.timeline.left",
                    title: "Nothing on",
                    message: "A clear day. Add something if it belongs here."
                ) { editing = .creating(start: defaultStart) }
                .frame(maxWidth: .infinity)
                .padding(.top, Spacing.xl)
            } else {
                LazyVStack(spacing: Spacing.s) {
                    ForEach(occurrences, id: \.self) { occurrence in
                        occurrenceRow(occurrence, showsDate: false)
                    }
                }
                .padding(.horizontal, Spacing.m)
            }
        }
        .safeAreaInset(edge: .top) { dateStepper(unit: .day) }
    }

    private var weekView: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Spacing.m) {
                ForEach(weekDays, id: \.self) { day in
                    let dayOccurrences = occurrences(in: dayRange(day))
                    VStack(alignment: .leading, spacing: Spacing.s) {
                        HStack(spacing: Spacing.s) {
                            Text(day.formatted(.dateTime.weekday(.abbreviated)))
                                .font(.subheadline.weight(.semibold))
                            Text(day.formatted(.dateTime.day().month(.abbreviated)))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            if calendar.isDateInToday(day) {
                                Text("Today")
                                    .font(.caption2.weight(.semibold))
                                    .padding(.horizontal, Spacing.s)
                                    .padding(.vertical, 2)
                                    .background(.tint.opacity(0.15), in: Capsule())
                            }
                            Spacer()
                        }

                        if dayOccurrences.isEmpty {
                            Text("—")
                                .font(.footnote)
                                .foregroundStyle(.tertiary)
                        } else {
                            ForEach(dayOccurrences, id: \.self) { occurrence in
                                occurrenceRow(occurrence, showsDate: false)
                            }
                        }
                    }
                }
            }
            .padding(Spacing.m)
        }
        .safeAreaInset(edge: .top) { dateStepper(unit: .weekOfYear) }
    }

    private var monthView: some View {
        VStack(spacing: Spacing.s) {
            dateStepper(unit: .month)

            let columns = Array(repeating: GridItem(.flexible(), spacing: Spacing.xs), count: 7)
            LazyVGrid(columns: columns, spacing: Spacing.xs) {
                ForEach(calendar.shortWeekdaySymbols, id: \.self) { symbol in
                    Text(symbol.prefix(2))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                ForEach(monthGrid, id: \.self) { day in
                    MonthCell(
                        day: day,
                        isInMonth: calendar.isDate(day, equalTo: anchor, toGranularity: .month),
                        isToday: calendar.isDateInToday(day),
                        colors: memberColors(on: day)
                    )
                    .onTapGesture {
                        withAnimation(Motion.smooth) {
                            anchor = day
                            mode = .day
                        }
                    }
                }
            }
            .padding(.horizontal, Spacing.m)

            Divider()

            ScrollView {
                LazyVStack(spacing: Spacing.s) {
                    ForEach(occurrences(in: dayRange(anchor)), id: \.self) { occurrence in
                        occurrenceRow(occurrence, showsDate: false)
                    }
                }
                .padding(Spacing.m)
            }
        }
    }

    private var listView: some View {
        let upcoming = occurrences(
            in: calendar.startOfDay(for: .now)..<(calendar.date(byAdding: .month, value: 3, to: .now) ?? .now)
        )
        return Group {
            if upcoming.isEmpty {
                EmptyStateView(
                    systemImage: "calendar",
                    title: "Nothing coming up",
                    message: "Events you add will show up here in order."
                ) { editing = .creating(start: defaultStart) }
            } else {
                List {
                    ForEach(upcoming, id: \.self) { occurrence in
                        occurrenceRow(occurrence, showsDate: true)
                            .listRowInsets(EdgeInsets(top: Spacing.xs, leading: Spacing.m, bottom: Spacing.xs, trailing: Spacing.m))
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    // MARK: - Rows

    private func occurrenceRow(_ occurrence: EventOccurrence, showsDate: Bool) -> some View {
        let event = events.first { $0.id == occurrence.eventID }
        return Button {
            if let event {
                context.calendarPath.append(.event(id: event.id, occurrence: occurrence.start))
            }
        } label: {
            HStack(spacing: Spacing.m) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(color(for: event))
                    .frame(width: 4)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(event?.title ?? "Event")
                        .font(.body)
                        .foregroundStyle(.primary)
                    HStack(spacing: Spacing.xs) {
                        Text(timeLabel(occurrence, event: event, showsDate: showsDate))
                        if let location = event?.location, !location.isEmpty {
                            Text("· \(location)")
                        }
                        if occurrence.isDetached {
                            Image(systemName: "pencil.circle")
                                .accessibilityLabel("Changed for this date only")
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)

                if let event {
                    HStack(spacing: -Spacing.xs) {
                        ForEach(attendees(of: event).prefix(3)) { member in
                            MemberBadge(member: member, size: 22)
                        }
                    }
                }
            }
            .padding(.vertical, Spacing.xs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private func occurrences(in range: Range<Date>) -> [EventOccurrence] {
        EventStore.occurrences(in: range, events: events, calendar: calendar)
    }

    private func dayRange(_ date: Date) -> Range<Date> {
        let start = calendar.startOfDay(for: date)
        return start..<(calendar.date(byAdding: .day, value: 1, to: start) ?? start)
    }

    private var weekDays: [Date] {
        let start = calendar.dateInterval(of: .weekOfYear, for: anchor)?.start ?? anchor
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    private var monthGrid: [Date] {
        guard let monthInterval = calendar.dateInterval(of: .month, for: anchor),
              let gridStart = calendar.dateInterval(of: .weekOfYear, for: monthInterval.start)?.start
        else { return [] }
        return (0..<42).compactMap { calendar.date(byAdding: .day, value: $0, to: gridStart) }
    }

    private var navigationTitle: String {
        switch mode {
        case .day: anchor.formatted(.dateTime.weekday(.wide).day().month(.wide))
        case .week: anchor.formatted(.dateTime.month(.wide).year())
        case .month: anchor.formatted(.dateTime.month(.wide).year())
        case .list: "Upcoming"
        }
    }

    private var defaultStart: Date {
        let base = calendar.isDateInToday(anchor) ? Date.now : anchor
        let hour = calendar.component(.hour, from: base)
        return calendar.date(bySettingHour: min(hour + 1, 22), minute: 0, second: 0, of: base) ?? base
    }

    private func dateStepper(unit: Calendar.Component) -> some View {
        HStack {
            Button { step(unit, by: -1) } label: { Image(systemName: "chevron.left") }
                .accessibilityLabel("Previous")
            Spacer()
            Text(navigationTitle).font(.subheadline.weight(.medium))
            Spacer()
            Button { step(unit, by: 1) } label: { Image(systemName: "chevron.right") }
                .accessibilityLabel("Next")
        }
        .padding(.horizontal, Spacing.m)
        .padding(.vertical, Spacing.s)
        .background(.bar)
    }

    private func step(_ unit: Calendar.Component, by amount: Int) {
        withAnimation(Motion.smooth) {
            anchor = calendar.date(byAdding: unit, value: amount, to: anchor) ?? anchor
        }
    }

    private func attendees(of event: Event) -> [Member] {
        members.filter { event.attendeeIDs.contains($0.id) }
    }

    private func color(for event: Event?) -> Color {
        guard let event, let first = attendees(of: event).first else { return .accentColor }
        return first.color
    }

    private func memberColors(on day: Date) -> [Color] {
        let dayOccurrences = occurrences(in: dayRange(day))
        let colors = dayOccurrences.compactMap { occurrence -> Color? in
            guard let event = events.first(where: { $0.id == occurrence.eventID }) else { return nil }
            return color(for: event)
        }
        return Array(colors.prefix(4))
    }

    private func timeLabel(_ occurrence: EventOccurrence, event: Event?, showsDate: Bool) -> String {
        let isAllDay = event?.isAllDay ?? false
        if showsDate {
            return isAllDay
                ? occurrence.start.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
                : occurrence.start.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute())
        }
        return isAllDay ? "All day" : occurrence.start.formatted(date: .omitted, time: .shortened)
    }
}

private struct MonthCell: View {
    let day: Date
    let isInMonth: Bool
    let isToday: Bool
    let colors: [Color]

    var body: some View {
        VStack(spacing: 3) {
            Text(day.formatted(.dateTime.day()))
                .font(.footnote)
                .foregroundStyle(isInMonth ? .primary : .tertiary)
                .frame(width: 28, height: 28)
                .background {
                    if isToday {
                        Circle().fill(.tint.opacity(0.18))
                    }
                }
            HStack(spacing: 2) {
                ForEach(Array(colors.enumerated()), id: \.offset) { _, color in
                    Circle().fill(color).frame(width: 4, height: 4)
                }
            }
            .frame(height: 4)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(day.formatted(date: .complete, time: .omitted))
        .accessibilityValue(colors.isEmpty ? "Nothing on" : "\(colors.count) events")
    }
}

#Preview("Calendar") {
    CalendarScreen()
        .environment(HouseholdContext())
        .modelContainer(TendModelContainer.preview())
}
