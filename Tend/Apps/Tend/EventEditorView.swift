import SwiftData
import SwiftUI
import TendKit

enum EventEditorTarget: Identifiable {
    case creating(start: Date)
    case editing(eventID: UUID, occurrenceStart: Date)

    var id: String {
        switch self {
        case .creating(let start): "new-\(start.timeIntervalSince1970)"
        case .editing(let id, let occurrence): "\(id.uuidString)-\(occurrence.timeIntervalSince1970)"
        }
    }
}

struct EventEditorView: View {
    let target: EventEditorTarget

    @Environment(HouseholdContext.self) private var appContext
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @Query private var members: [Member]

    @State private var title = ""
    @State private var location = ""
    @State private var notes = ""
    @State private var start = Date.now
    @State private var end = Date.now.addingTimeInterval(3600)
    @State private var isAllDay = false
    @State private var attendeeIDs: Set<UUID> = []
    @State private var repeats = false
    @State private var frequency: RecurrenceRule.Frequency = .weekly
    @State private var interval = 1
    @State private var weekdays: Set<RecurrenceRule.Weekday> = []

    @State private var pendingScope: RecurrenceEditScope?
    @State private var isAskingScope = false
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                        .font(.title3)
                    TextField("Location", text: $location)
                }

                Section {
                    Toggle("All day", isOn: $isAllDay.animation(Motion.snappy))
                    DatePicker("Starts", selection: $start, displayedComponents: isAllDay ? .date : [.date, .hourAndMinute])
                    if !isAllDay {
                        DatePicker("Ends", selection: $end, in: start..., displayedComponents: [.date, .hourAndMinute])
                    }
                }

                Section("Repeat") {
                    Toggle("Repeats", isOn: $repeats.animation(Motion.snappy))
                    if repeats {
                        Picker("Frequency", selection: $frequency) {
                            ForEach(RecurrenceRule.Frequency.allCases) { Text($0.title).tag($0) }
                        }
                        Stepper("Every \(interval) \(unitLabel)", value: $interval, in: 1...30)
                        if frequency == .weekly {
                            WeekdayPicker(selection: $weekdays)
                        }
                        if let rule = builtRule {
                            Text(rule.localizedDescription())
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Who's involved") {
                    ForEach(members) { member in
                        Button {
                            withAnimation(Motion.snappy) { toggle(member) }
                        } label: {
                            HStack {
                                MemberBadge(member: member)
                                Text(member.name).foregroundStyle(.primary)
                                Spacer()
                                if attendeeIDs.contains(member.id) {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.tint)
                                }
                            }
                        }
                        .accessibilityAddTraits(attendeeIDs.contains(member.id) ? .isSelected : [])
                    }
                }

                Section("Notes") {
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(3...8)
                }

                if case .editing(let id, let occurrence) = target,
                   let event = EventStore.event(id: id, context: modelContext) {
                    Section {
                        Button("Delete", role: .destructive) { delete(event, occurrence: occurrence) }
                    } footer: {
                        if let modifier = lastModifier(of: event) {
                            Text("Last updated by \(modifier.name)")
                        }
                    }
                }
            }
            .navigationTitle(isCreating ? "New event" : "Edit event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { attemptSave() }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            // The EventKit-style three-way prompt (§6). It appears only when it
            // genuinely applies, and no branch of it mutates a whole series
            // unless the user picked "All events".
            .confirmationDialog(
                "This is a repeating event",
                isPresented: $isAskingScope,
                titleVisibility: .visible
            ) {
                ForEach(RecurrenceEditScope.allCases) { scope in
                    Button(scope.title) { save(scope: scope) }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("What should this change apply to?")
            }
            .task { loadIfNeeded() }
        }
    }

    // MARK: - Loading

    private var isCreating: Bool {
        if case .creating = target { return true }
        return false
    }

    private func loadIfNeeded() {
        guard !loaded else { return }
        loaded = true

        switch target {
        case .creating(let startDate):
            start = startDate
            end = startDate.addingTimeInterval(3600)
            if let me = appContext.currentMemberID { attendeeIDs = [me] }

        case .editing(let id, let occurrenceStart):
            guard let event = EventStore.event(id: id, context: modelContext) else { return }
            title = event.title
            location = event.location ?? ""
            notes = event.notes ?? ""
            // The editor opens on the occurrence the user tapped, not on the
            // series master — this is the difference between "move Tuesday's
            // practice" and "move every practice".
            start = occurrenceStart
            end = occurrenceStart.addingTimeInterval(event.duration)
            isAllDay = event.isAllDay
            attendeeIDs = Set(event.attendeeIDs)

            if let rule = event.recurrenceRule.flatMap(RecurrenceRule.init(rawValue:)) {
                repeats = true
                frequency = rule.frequency
                interval = rule.interval
                weekdays = Set(rule.weekdays)
            }
        }
    }

    // MARK: - Saving

    private var builtRule: RecurrenceRule? {
        guard repeats else { return nil }
        return RecurrenceRule(
            frequency: frequency,
            interval: interval,
            weekdays: frequency == .weekly ? Array(weekdays) : []
        )
    }

    private func attemptSave() {
        switch target {
        case .creating:
            createEvent()
        case .editing(let id, _):
            guard let event = EventStore.event(id: id, context: modelContext) else { return }
            if EventStore.requiresScopePrompt(for: event) || event.detachedFromOccurrence != nil {
                isAskingScope = true
            } else {
                save(scope: .all)
            }
        }
    }

    private func createEvent() {
        let event = Event(
            title: title.trimmingCharacters(in: .whitespaces),
            location: location.isEmpty ? nil : location,
            startDate: start,
            endDate: isAllDay ? start : end,
            isAllDay: isAllDay,
            recurrenceRule: builtRule?.rawValue,
            attendeeIDs: Array(attendeeIDs),
            notes: notes.isEmpty ? nil : notes,
            lastModifiedBy: appContext.currentMemberID
        )
        modelContext.insert(event)
        try? modelContext.save()
        dismiss()
    }

    private func save(scope: RecurrenceEditScope) {
        guard case .editing(let id, let occurrenceStart) = target,
              let event = EventStore.event(id: id, context: modelContext) else { return }

        let edit = EventEdit(
            title: title.trimmingCharacters(in: .whitespaces),
            location: location.isEmpty ? .some(nil) : .some(location),
            start: start,
            end: isAllDay ? start : end,
            isAllDay: isAllDay,
            rule: .some(builtRule),
            attendeeIDs: Array(attendeeIDs),
            notes: notes.isEmpty ? .some(nil) : .some(notes)
        )

        try? EventStore.applyEdit(
            edit,
            scope: scope,
            to: event,
            occurrenceStart: occurrenceStart,
            by: appContext.currentMemberID,
            context: modelContext
        )
        dismiss()
    }

    private func delete(_ event: Event, occurrence: Date) {
        if EventStore.requiresScopePrompt(for: event) {
            pendingScope = nil
            isAskingScope = true
            return
        }
        try? EventStore.delete(
            event,
            scope: .all,
            occurrenceStart: occurrence,
            by: appContext.currentMemberID,
            context: modelContext
        )
        dismiss()
    }

    private func toggle(_ member: Member) {
        if attendeeIDs.contains(member.id) {
            attendeeIDs.remove(member.id)
        } else {
            attendeeIDs.insert(member.id)
        }
    }

    private func lastModifier(of event: Event) -> Member? {
        guard let id = event.lastModifiedBy else { return nil }
        return members.first { $0.id == id }
    }

    private var unitLabel: String {
        switch frequency {
        case .daily: interval == 1 ? "day" : "days"
        case .weekly: interval == 1 ? "week" : "weeks"
        case .monthly: interval == 1 ? "month" : "months"
        case .yearly: interval == 1 ? "year" : "years"
        }
    }
}

struct WeekdayPicker: View {
    @Binding var selection: Set<RecurrenceRule.Weekday>

    var body: some View {
        HStack(spacing: Spacing.xs) {
            ForEach(RecurrenceRule.Weekday.allCases) { weekday in
                let isOn = selection.contains(weekday)
                Button {
                    withAnimation(Motion.snappy) {
                        if isOn { selection.remove(weekday) } else { selection.insert(weekday) }
                    }
                } label: {
                    Text(String(weekday.icsCode.prefix(1)))
                        .font(.footnote.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(isOn ? AnyShapeStyle(.tint) : AnyShapeStyle(.quaternary.opacity(0.4)), in: Capsule())
                        .foregroundStyle(isOn ? Color.white : Color.primary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(weekday.icsCode)
                .accessibilityAddTraits(isOn ? .isSelected : [])
            }
        }
    }
}

struct EventDetailView: View {
    let event: Event
    let occurrenceStart: Date

    @Environment(HouseholdContext.self) private var appContext
    @Environment(\.modelContext) private var modelContext
    @Query private var members: [Member]

    @State private var isEditing = false
    @State private var isAskingDeleteScope = false

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(event.title).font(.title2.bold())
                    Text(whenLabel).font(.subheadline).foregroundStyle(.secondary)
                    if let rule = event.recurrenceRule.flatMap(RecurrenceRule.init(rawValue:)) {
                        Label(rule.localizedDescription(), systemImage: "repeat")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, Spacing.xs)
            }

            if let location = event.location, !location.isEmpty {
                Section("Where") { Text(location) }
            }

            if !attendees.isEmpty {
                Section("Who") {
                    ForEach(attendees) { member in
                        HStack { MemberBadge(member: member); Text(member.name) }
                    }
                }
            }

            if let notes = event.notes, !notes.isEmpty {
                Section("Notes") { Text(notes) }
            }

            Section {
                Button("Delete", role: .destructive) {
                    if EventStore.requiresScopePrompt(for: event) {
                        isAskingDeleteScope = true
                    } else {
                        performDelete(.all)
                    }
                }
            } footer: {
                // The subtle last-writer-wins indicator from §2. Not a conflict
                // dialog — just attribution, so a surprise change has a name on
                // it.
                if let modifier = members.first(where: { $0.id == event.lastModifiedBy }) {
                    Text("Last updated by \(modifier.name) \(event.lastModifiedAt.formatted(.relative(presentation: .named)))")
                }
            }
        }
        .navigationTitle("Event")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit") { isEditing = true }
            }
        }
        .sheet(isPresented: $isEditing) {
            EventEditorView(target: .editing(eventID: event.id, occurrenceStart: occurrenceStart))
        }
        .confirmationDialog("Delete a repeating event", isPresented: $isAskingDeleteScope, titleVisibility: .visible) {
            ForEach(RecurrenceEditScope.allCases) { scope in
                Button(scope.title, role: .destructive) { performDelete(scope) }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private var attendees: [Member] {
        members.filter { event.attendeeIDs.contains($0.id) }
    }

    private var whenLabel: String {
        if event.isAllDay {
            return occurrenceStart.formatted(date: .complete, time: .omitted) + " · All day"
        }
        let end = occurrenceStart.addingTimeInterval(event.duration)
        return occurrenceStart.formatted(date: .complete, time: .shortened)
            + " – " + end.formatted(date: .omitted, time: .shortened)
    }

    private func performDelete(_ scope: RecurrenceEditScope) {
        try? EventStore.delete(
            event,
            scope: scope,
            occurrenceStart: occurrenceStart,
            by: appContext.currentMemberID,
            context: modelContext
        )
    }
}

#Preview("Event editor") {
    EventEditorView(target: .creating(start: .now))
        .environment(HouseholdContext())
        .modelContainer(TendModelContainer.preview())
}
