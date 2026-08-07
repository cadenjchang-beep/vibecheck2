import Foundation
import SwiftData
#if canImport(BackgroundTasks) && os(iOS)
import BackgroundTasks
#endif
#if canImport(WidgetKit)
import WidgetKit
#endif
import UserNotifications

/// Builds Pulse from the store, saves it, and gets it in front of the user.
///
/// Generation happens in a background task rather than on view appearance, so
/// the widget and the notification are reads of an already-computed digest.
/// §4 asks for "instant when viewed" and this is what makes that true.
public enum PulseService {

    // MARK: - Generation

    @discardableResult
    public static func generate(
        kind: PulseKind,
        context: ModelContext,
        now: Date = .now,
        calendar: Calendar = .current
    ) -> PulseSnapshot {
        let snapshot = PulseGenerator.generate(
            kind: kind,
            input: input(from: context, now: now, calendar: calendar),
            calendar: calendar
        )
        persist(snapshot, context: context)
        reloadWidgets()
        return snapshot
    }

    /// Reads the whole store once and hands ``PulseGenerator`` plain values.
    ///
    /// The date window is deliberately bounded — two weeks back for "what got
    /// done", two weeks forward for "what's coming". A background task has a
    /// few seconds of budget, not a full-store scan.
    public static func input(
        from context: ModelContext,
        now: Date = .now,
        calendar: Calendar = .current
    ) -> PulseInput {
        let windowStart = calendar.date(byAdding: .day, value: -14, to: now) ?? now
        let windowEnd = calendar.date(byAdding: .day, value: 14, to: now) ?? now

        let members = ((try? context.fetch(FetchDescriptor<Member>())) ?? [])
            .map { PulseMemberInput(id: $0.id, name: $0.name) }

        let storedEvents = (try? context.fetch(FetchDescriptor<Event>())) ?? []
        let occurrences = EventStore.occurrences(
            in: windowStart..<windowEnd,
            events: storedEvents,
            calendar: calendar
        )
        let titlesByID = Dictionary(storedEvents.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let events = occurrences.compactMap { occurrence -> PulseEventInput? in
            guard let event = titlesByID[occurrence.eventID] else { return nil }
            return PulseEventInput(
                id: event.id,
                title: event.title,
                start: occurrence.start,
                end: occurrence.end,
                isAllDay: event.isAllDay,
                attendeeIDs: event.attendeeIDs
            )
        }

        let tasks = ((try? context.fetch(FetchDescriptor<HouseholdTask>())) ?? []).map {
            PulseTaskInput(
                id: $0.id,
                title: $0.title,
                dueDate: $0.dueDate,
                isComplete: $0.isComplete,
                completedAt: $0.completedAt,
                completedBy: $0.completedBy,
                assignedMemberID: $0.assignedMemberID
            )
        }

        let items = ((try? context.fetch(FetchDescriptor<ListItem>())) ?? []).map {
            PulseListItemInput(
                id: $0.id,
                listName: $0.listName,
                text: $0.text,
                isChecked: $0.isChecked,
                completedAt: $0.completedAt,
                completedBy: $0.completedBy,
                addedBy: $0.addedBy,
                createdAt: $0.createdAt
            )
        }

        let recipes = (try? context.fetch(FetchDescriptor<Recipe>())) ?? []
        let meals = ((try? context.fetch(FetchDescriptor<MealPlanEntry>())) ?? []).map { entry in
            PulseMealInput(
                date: entry.date,
                mealType: MealType(rawValue: entry.mealType) ?? .dinner,
                label: MealPlanner.label(for: entry, recipes: recipes)
            )
        }

        return PulseInput(now: now, members: members, events: events, tasks: tasks, listItems: items, meals: meals)
    }

    static func persist(_ snapshot: PulseSnapshot, context: ModelContext) {
        let kind = snapshot.kind.rawValue
        let existing = ((try? context.fetch(FetchDescriptor<PulseDigest>())) ?? [])
            .filter { $0.kind == kind }

        // Exactly one digest per kind is kept. Pulse is a current view of the
        // household, not a history — keeping old ones would just be data with
        // no reader.
        for old in existing { context.delete(old) }

        let digest = PulseDigest(
            generatedAt: snapshot.generatedAt,
            kind: kind,
            headline: snapshot.headline,
            lines: snapshot.lines.map(\.text),
            deepLink: snapshot.deepLink.url.absoluteString
        )
        context.insert(digest)
        try? context.save()
    }

    public static func latest(kind: PulseKind, context: ModelContext) -> PulseDigest? {
        let raw = kind.rawValue
        var descriptor = FetchDescriptor<PulseDigest>(
            predicate: #Predicate { $0.kind == raw },
            sortBy: [SortDescriptor(\.generatedAt, order: .reverse)]
        )
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    // MARK: - Delivery

    public static func notify(_ snapshot: PulseSnapshot) async {
        guard !snapshot.isEmpty else { return }

        let content = UNMutableNotificationContent()
        content.title = snapshot.headline
        content.body = snapshot.compactSummary
        content.sound = nil
        content.interruptionLevel = .passive
        content.userInfo = ["deepLink": snapshot.deepLink.url.absoluteString]
        content.threadIdentifier = "pulse-\(snapshot.kind.rawValue)"

        let request = UNNotificationRequest(
            identifier: "pulse-\(snapshot.kind.rawValue)",
            content: content,
            trigger: nil
        )
        try? await UNUserNotificationCenter.current().add(request)
    }

    static func reloadWidgets() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    // MARK: - Background scheduling

    #if os(iOS)
    /// Registers the two background tasks. Called from the app's `init`, before
    /// the scene connects — `BGTaskScheduler` rejects late registration.
    public static func registerBackgroundTasks(modelContainer: ModelContainer) {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: TendIdentifiers.pulseRefreshTask,
            using: nil
        ) { task in
            guard let refreshTask = task as? BGAppRefreshTask else { return }
            handlePulseRefresh(refreshTask, modelContainer: modelContainer)
        }
    }

    /// Asks for a refresh ahead of the two moments Pulse is for: early morning,
    /// and Sunday evening.
    ///
    /// The scheduler is a hint, not a promise. iOS decides when — sometimes not
    /// at all on a device that never opens the app. So Pulse also regenerates
    /// on foreground, and the widget timeline carries a stale-content fallback
    /// rather than a blank state.
    public static func scheduleNextRefresh(now: Date = .now, calendar: Calendar = .current) {
        let request = BGAppRefreshTaskRequest(identifier: TendIdentifiers.pulseRefreshTask)
        request.earliestBeginDate = nextPulseMoment(after: now, calendar: calendar)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Simulators and devices in Low Power Mode reject submissions; that
            // is not a user-facing problem.
            TendLog.pulse.info("Could not schedule Pulse refresh: \(error.localizedDescription)")
        }
    }

    static func nextPulseMoment(after now: Date, calendar: Calendar = .current) -> Date {
        // 6:30am daily, and 6:00pm on Sundays.
        let morning = calendar.nextDate(
            after: now,
            matching: DateComponents(hour: 6, minute: 30),
            matchingPolicy: .nextTime
        )
        let sundayEvening = calendar.nextDate(
            after: now,
            matching: DateComponents(hour: 18, minute: 0, weekday: 1),
            matchingPolicy: .nextTime
        )
        return [morning, sundayEvening].compactMap { $0 }.min() ?? now.addingTimeInterval(3600)
    }

    private static func handlePulseRefresh(_ task: BGAppRefreshTask, modelContainer: ModelContainer) {
        // Chain the next request first: if the work below is killed, the app
        // still has a future slot booked.
        scheduleNextRefresh()

        let work = Task {
            let context = ModelContext(modelContainer)
            let now = Date.now
            let kind: PulseKind = Calendar.current.component(.hour, from: now) >= 16 ? .weekly : .morning
            let snapshot = generate(kind: kind, context: context, now: now)
            await notify(snapshot)
            task.setTaskCompleted(success: true)
        }

        task.expirationHandler = {
            work.cancel()
            task.setTaskCompleted(success: false)
        }
    }
    #endif
}
