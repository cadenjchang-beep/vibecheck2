import CloudKit
import SwiftData
import SwiftUI
import TendKit
import UserNotifications

@main
struct TendApp: App {

    @State private var context = HouseholdContext()
    @State private var lock = BiometricLock()
    @State private var plusStore = TendPlusStore()
    @State private var accountMonitor = CloudKitAccountMonitor()

    @Environment(\.scenePhase) private var scenePhase

    private let modelContainer: ModelContainer
    private let shareController = HouseholdShareController()
    private let membershipResolver: HouseholdMembershipResolver

    init() {
        let container: ModelContainer
        do {
            container = try TendModelContainer.make(.cloudKit)
        } catch {
            // A store that will not open is unrecoverable, but falling back to
            // a local one keeps the app usable while the CloudKit problem is
            // diagnosed — better than a launch crash on someone's phone.
            TendLog.sync.critical("CloudKit store failed to open: \(error.localizedDescription)")
            container = (try? TendModelContainer.make(.localOnly)) ?? {
                fatalError("Could not open any store: \(error)")
            }()
        }
        self.modelContainer = container
        self.membershipResolver = HouseholdMembershipResolver(
            modelContainer: container,
            shareController: HouseholdShareController()
        )

        // BGTaskScheduler rejects registrations made after the first scene
        // connects, so this has to happen here rather than in `.task`.
        #if os(iOS)
        PulseService.registerBackgroundTasks(modelContainer: container)
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(context)
                .environment(lock)
                .environment(plusStore)
                .modelContainer(modelContainer)
                .task { await bootstrap() }
                .onOpenURL { url in handle(url: url) }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background:
                lock.lock()
                #if os(iOS)
                PulseService.scheduleNextRefresh()
                #endif
            case .active:
                Task { await refreshOnForeground() }
            default:
                break
            }
        }
    }

    // MARK: - Lifecycle

    @MainActor
    private func bootstrap() async {
        plusStore.start()

        accountMonitor.onAccountChange = { userRecordName in
            await handleAccountChange(userRecordName: userRecordName)
        }
        accountMonitor.start()

        _ = try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .badge, .sound, .provisional])

        if lock.isEnabled { await lock.unlock() }

        // Pulse is regenerated on launch as well as in the background task,
        // because the background budget is a hint and a stale recap is worse
        // than a slightly expensive launch.
        await regeneratePulse()
    }

    @MainActor
    private func handleAccountChange(userRecordName: String?) async {
        if accountMonitor.didSwitchAccounts {
            context.resetForAccountSwitch()
            accountMonitor.acknowledgeAccountSwitch()
        }
        context.update(account: accountMonitor.state)

        let states = await membershipResolver.resolveAll(currentUserRecordName: userRecordName)
        if let householdID = context.currentHouseholdID, let state = states[householdID] {
            context.update(membership: state)
        }
    }

    @MainActor
    private func refreshOnForeground() async {
        await accountMonitor.refresh()
        if lock.isEnabled, !lock.isUnlocked { await lock.unlock() }
        await regeneratePulse()
    }

    @MainActor
    private func regeneratePulse() async {
        let hour = Calendar.current.component(.hour, from: .now)
        PulseService.generate(kind: hour >= 16 ? .weekly : .morning, context: modelContainer.mainContext)
    }

    // MARK: - Routing

    private func handle(url: URL) {
        if let link = DeepLink(url: url) {
            context.open(link)
            return
        }
        // A CKShare invite link opened outside the share sheet.
        if url.host()?.contains("icloud.com") == true {
            Task { await acceptShare(at: url) }
        }
    }

    private func acceptShare(at url: URL) async {
        do {
            let metadata = try await CKContainer(identifier: TendIdentifiers.cloudKitContainer)
                .shareMetadata(for: url)
            _ = try await shareController.accept(metadata)
            await handleAccountChange(userRecordName: accountMonitor.state.userRecordName)
        } catch {
            TendLog.sharing.error("Could not accept share: \(error.localizedDescription)")
            await MainActor.run { context.syncIssue = .shareUnavailable }
        }
    }
}
