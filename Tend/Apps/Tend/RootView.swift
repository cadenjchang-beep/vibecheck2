import SwiftData
import SwiftUI
import TendKit

struct RootView: View {
    @Environment(HouseholdContext.self) private var context
    @Environment(BiometricLock.self) private var lock
    @Environment(\.modelContext) private var modelContext

    @Query private var households: [Household]

    var body: some View {
        @Bindable var context = context

        Group {
            if households.isEmpty || context.currentMemberID == nil {
                OnboardingView()
            } else {
                mainInterface
            }
        }
        .sheet(isPresented: $context.isQuickAddPresented) {
            QuickAddSheet(initialText: context.quickAddText ?? "")
        }
        .overlay {
            if lock.isEnabled && !lock.isUnlocked && lock.lockedSections.isEmpty {
                LockScreen()
                    .transition(.opacity)
            }
        }
        .animation(Motion.smooth, value: lock.isUnlocked)
    }

    private var mainInterface: some View {
        @Bindable var context = context

        return TabView(selection: $context.selectedTab) {
            tab(.pulse) { PulseScreen() }
            tab(.calendar) { CalendarScreen() }
            tab(.lists) { ListsScreen() }
            tab(.tasks) { TasksScreen() }
            tab(.meals) { MealPlanScreen() }
        }
        .tint(.accentColor)
        .safeAreaInset(edge: .top, spacing: 0) {
            SyncStatusBanner()
        }
    }

    @ViewBuilder
    private func tab<Content: View>(_ tab: TendTab, @ViewBuilder content: () -> Content) -> some View {
        SectionLockGate(tab: tab) { content() }
            .tabItem { Label(tab.title, systemImage: tab.systemImage) }
            .tag(tab)
    }
}

/// Per-section Face ID locking (§4). Wrapping each tab rather than gating the
/// whole app means someone can hand over their phone with the calendar visible
/// and the tasks list closed.
struct SectionLockGate<Content: View>: View {
    let tab: TendTab
    @ViewBuilder let content: () -> Content

    @Environment(BiometricLock.self) private var lock

    var body: some View {
        Group {
            if lock.requiresUnlock(for: tab) && !lock.lockedSections.isEmpty {
                LockScreen(sectionTitle: tab.title)
            } else {
                content()
            }
        }
    }
}

struct LockScreen: View {
    var sectionTitle: String?

    @Environment(BiometricLock.self) private var lock

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.regularMaterial)
                .ignoresSafeArea()

            VStack(spacing: Spacing.l) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(.secondary)

                VStack(spacing: Spacing.s) {
                    Text(sectionTitle.map { "\($0) is locked" } ?? "Tend is locked")
                        .font(.headline)
                    Text("Unlock with \(lock.biometryDescription).")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Button("Unlock") {
                    Task { await lock.unlock(reason: sectionTitle.map { "Unlock \($0)" } ?? "Unlock Tend") }
                }
                .buttonStyle(.borderedProminent)

                if let error = lock.lastError {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(Spacing.xl)
        }
        .task { await lock.unlock() }
    }
}

/// The honest status line. It appears only when there is something true and
/// useful to say — never a permanent "syncing…" chrome.
struct SyncStatusBanner: View {
    @Environment(HouseholdContext.self) private var context

    var body: some View {
        Group {
            if case .readOnlyArchive(let reason) = context.membershipState {
                banner(
                    systemImage: "archivebox",
                    title: reason.title,
                    message: reason.message,
                    tint: .secondary
                )
            } else if let issue = context.syncIssue {
                banner(
                    systemImage: issue.isBlocking ? "exclamationmark.icloud" : "icloud.slash",
                    title: issue.title,
                    message: issue.message,
                    tint: issue.isBlocking ? .orange : .secondary
                )
            } else if context.pendingSyncCount > 0 {
                banner(
                    systemImage: "arrow.triangle.2.circlepath",
                    title: "\(context.pendingSyncCount) waiting to sync",
                    message: "Saved on this device. They'll go out when you're back online.",
                    tint: .secondary
                )
            }
        }
        .animation(Motion.smooth, value: context.syncIssue)
    }

    private func banner(systemImage: String, title: String, message: String, tint: Color) -> some View {
        HStack(alignment: .top, spacing: Spacing.s) {
            Image(systemName: systemImage)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.footnote.weight(.medium))
                Text(message).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(Spacing.s)
        .background(.regularMaterial)
        .accessibilityElement(children: .combine)
    }
}

#Preview("Root") {
    RootView()
        .environment(HouseholdContext())
        .environment(BiometricLock())
        .environment(TendPlusStore())
        .modelContainer(TendModelContainer.preview())
}
