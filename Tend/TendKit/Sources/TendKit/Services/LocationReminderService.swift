#if os(iOS)
import CoreLocation
import Foundation
import SwiftData
import UserNotifications
#if canImport(BackgroundTasks)
import BackgroundTasks
#endif

/// Location-based reminders: "next time you're at the hardware store".
///
/// Two constraints shape this. iOS allows **20 monitored regions per app**
/// total, and regions do not survive indefinitely across reboots and app
/// updates. So the service keeps the 20 most relevant regions rather than
/// trying to register everything, and re-registers on a periodic background
/// task (§2).
public final class LocationReminderService: NSObject, CLLocationManagerDelegate {

    public static let maxMonitoredRegions = 20

    private let manager = CLLocationManager()
    private let modelContainer: ModelContainer

    public init(modelContainer: ModelContainer) {
        self.modelContainer = modelContainer
        super.init()
        manager.delegate = self
    }

    public var authorizationStatus: CLAuthorizationStatus { manager.authorizationStatus }

    /// Asked for only when the user attaches a location to their first item —
    /// never at launch. A family app that demands Always location on first run
    /// gets deleted on first run.
    public func requestAuthorization() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            // Region monitoring needs Always, but asking for it only after
            // When-In-Use has been granted is both required and kinder.
            manager.requestAlwaysAuthorization()
        default:
            break
        }
    }

    // MARK: - Registration

    /// Rebuilds the monitored set from the store. Idempotent; safe to call on
    /// launch, on foreground, and from the background refresh task.
    public func refreshMonitoredRegions() {
        guard manager.authorizationStatus == .authorizedAlways else {
            TendLog.location.info("Skipping region registration: no Always authorization.")
            return
        }

        let context = ModelContext(modelContainer)
        let candidates = prioritizedCandidates(context: context)

        let wanted = Dictionary(uniqueKeysWithValues: candidates.map { ($0.identifier, $0) })
        let monitored = manager.monitoredRegions.compactMap { $0 as? CLCircularRegion }

        for region in monitored where wanted[region.identifier] == nil {
            manager.stopMonitoring(for: region)
        }

        let alreadyMonitored = Set(monitored.map(\.identifier))
        for candidate in candidates where !alreadyMonitored.contains(candidate.identifier) {
            manager.startMonitoring(for: candidate.region)
        }

        TendLog.location.info("Monitoring \(candidates.count) of \(LocationReminderService.maxMonitoredRegions) allowed regions.")
    }

    private struct Candidate {
        let identifier: String
        let region: CLCircularRegion
    }

    /// Ranks by urgency: tasks with a due date first, then open list items,
    /// newest first. The 20-region cap makes this a real decision, not a detail.
    private func prioritizedCandidates(context: ModelContext) -> [Candidate] {
        var candidates: [Candidate] = []

        let tasks = ((try? context.fetch(FetchDescriptor<HouseholdTask>())) ?? [])
            .filter { !$0.isComplete && $0.reminderLatitude != nil }
            .sorted { ($0.dueDate ?? .distantFuture) < ($1.dueDate ?? .distantFuture) }

        let items = ((try? context.fetch(FetchDescriptor<ListItem>())) ?? [])
            .filter { !$0.isChecked && $0.reminderLatitude != nil }
            .sorted { $0.createdAt > $1.createdAt }

        for task in tasks {
            guard let region = region(
                latitude: task.reminderLatitude,
                longitude: task.reminderLongitude,
                radius: task.reminderRadius,
                identifier: "task:\(task.id.uuidString)"
            ) else { continue }
            candidates.append(Candidate(identifier: region.identifier, region: region))
        }

        for item in items {
            guard let region = region(
                latitude: item.reminderLatitude,
                longitude: item.reminderLongitude,
                radius: item.reminderRadius,
                identifier: "item:\(item.id.uuidString)"
            ) else { continue }
            candidates.append(Candidate(identifier: region.identifier, region: region))
        }

        return Array(candidates.prefix(Self.maxMonitoredRegions))
    }

    private func region(latitude: Double?, longitude: Double?, radius: Double?, identifier: String) -> CLCircularRegion? {
        guard let latitude, let longitude else { return nil }
        let region = CLCircularRegion(
            center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
            radius: max(radius ?? 150, 100),
            identifier: identifier
        )
        region.notifyOnEntry = true
        region.notifyOnExit = false
        return region
    }

    // MARK: - Delegate

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        Task { await notify(for: region.identifier) }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        refreshMonitoredRegions()
    }

    public func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        TendLog.location.error("Region monitoring failed for \(region?.identifier ?? "unknown"): \(error.localizedDescription)")
    }

    @MainActor
    private func notify(for identifier: String) async {
        let context = ModelContext(modelContainer)
        let parts = identifier.split(separator: ":", maxSplits: 1)
        guard parts.count == 2, let id = UUID(uuidString: String(parts[1])) else { return }

        let content = UNMutableNotificationContent()
        content.interruptionLevel = .timeSensitive

        if parts[0] == "item", let item = ListStore.item(id: id, context: context), !item.isChecked {
            let open = ListStore.openItems(in: item.listName, context: context)
            content.title = item.reminderPlaceName.map { "You're near \($0)" } ?? "While you're here"
            content.body = open.count > 1
                ? "\(item.text) and \(open.count - 1) more on \(item.listName)"
                : item.text
            content.userInfo = ["deepLink": DeepLink.list(name: item.listName).url.absoluteString]
        } else if parts[0] == "task", let task = TaskStore.task(id: id, context: context), !task.isComplete {
            content.title = task.reminderPlaceName.map { "You're near \($0)" } ?? "While you're here"
            content.body = task.title
            content.userInfo = ["deepLink": DeepLink.task(id: task.id).url.absoluteString]
        } else {
            // Already handled by someone else in the household — no ping.
            return
        }

        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Background refresh

    #if canImport(BackgroundTasks)
    public static func registerBackgroundTask(service: @escaping () -> LocationReminderService) {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: TendIdentifiers.regionRefreshTask,
            using: nil
        ) { task in
            scheduleRegionRefresh()
            service().refreshMonitoredRegions()
            task.setTaskCompleted(success: true)
        }
    }

    public static func scheduleRegionRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: TendIdentifiers.regionRefreshTask)
        // Daily is enough: regions are lost to reboots and app updates, neither
        // of which happens hourly. Asking more often just burns budget that
        // Pulse needs.
        request.earliestBeginDate = Date().addingTimeInterval(24 * 3600)
        try? BGTaskScheduler.shared.submit(request)
    }
    #endif
}
#endif
