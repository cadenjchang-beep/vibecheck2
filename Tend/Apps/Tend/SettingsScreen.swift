import CloudKit
import SwiftData
import SwiftUI
import TendKit
import UIKit

struct SettingsScreen: View {
    @Environment(HouseholdContext.self) private var context
    @Environment(BiometricLock.self) private var lock
    @Environment(TendPlusStore.self) private var plusStore
    @Environment(\.modelContext) private var modelContext

    @Query private var members: [Member]

    var body: some View {
        @Bindable var lock = lock
        @Bindable var context = context

        Form {
            Section("This device") {
                Picker("I'm", selection: $context.currentMemberID) {
                    Text("Not set").tag(UUID?.none)
                    ForEach(members) { member in
                        Text(member.name).tag(UUID?.some(member.id))
                    }
                }
            } footer: {
                Text("Everything you check off is recorded as yours. That's what makes the shape of the week accurate.")
            }

            Section("Household") {
                NavigationLink("Members and sharing") { HouseholdScreen() }
            }

            Section("Privacy") {
                Toggle("Require \(lock.biometryDescription)", isOn: $lock.isEnabled)
                    .disabled(!lock.isAvailable)
                if lock.isEnabled {
                    ForEach(TendTab.allCases) { tab in
                        Toggle(tab.title, isOn: Binding(
                            get: { lock.lockedSections.contains(tab) },
                            set: { isOn in
                                if isOn { lock.lockedSections.insert(tab) } else { lock.lockedSections.remove(tab) }
                            }
                        ))
                        .font(.subheadline)
                    }
                }
            } footer: {
                Text(lock.lockedSections.isEmpty
                     ? "With nothing selected, the whole app is locked."
                     : "Only the selected sections are locked.")
            }

            Section("What Tend collects") {
                Label("Everything lives in your household's private iCloud database.", systemImage: "lock.icloud")
                Label("No analytics SDKs, no ad SDKs, no third-party servers.", systemImage: "hand.raised")
                Label("Children's data never leaves the household's private zone.", systemImage: "figure.and.child.holdinghands")
            }
            .font(.footnote)
            .foregroundStyle(.secondary)

            Section("Tend+") {
                NavigationLink {
                    TendPlusView()
                } label: {
                    HStack {
                        Text(plusStore.isSubscribed ? "Tend+ is active" : "See what's in Tend+")
                        Spacer()
                        if plusStore.isSubscribed {
                            Image(systemName: "checkmark.seal.fill").foregroundStyle(.tint)
                        }
                    }
                }
            } footer: {
                Text("Everything a household needs to run is free, and stays free.")
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct HouseholdScreen: View {
    @Environment(HouseholdContext.self) private var context
    @Environment(\.modelContext) private var modelContext

    @Query private var households: [Household]
    @Query private var members: [Member]

    @State private var participants: [HouseholdParticipant] = []
    @State private var isSharing = false
    @State private var isConfirmingLeave = false
    @State private var exportURL: URL?
    @State private var errorMessage: String?

    private let shareController = HouseholdShareController()

    private var household: Household? { context.household(in: modelContext) }

    var body: some View {
        Form {
            if let household {
                Section("Members") {
                    ForEach(members) { member in
                        HStack(spacing: Spacing.m) {
                            MemberBadge(member: member)
                            VStack(alignment: .leading) {
                                Text(member.name)
                                if member.isChild {
                                    Text("Child account").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if member.id == context.currentMemberID {
                                Text("You").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Button("Add someone", systemImage: "person.badge.plus") { addMember() }
                }

                if case .readOnlyArchive(let reason) = context.membershipState {
                    Section {
                        Label(reason.title, systemImage: "archivebox")
                            .font(.headline)
                        Text(reason.message)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Button("Export a copy") { export(household) }
                    }
                } else {
                    Section("Sharing") {
                        Button("Invite with iCloud", systemImage: "square.and.arrow.up") { isSharing = true }

                        ForEach(participants) { participant in
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(participant.displayName)
                                    Text(participant.statusDescription)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if participant.permission == .readOnly {
                                    Text("View only").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            .swipeActions {
                                if participant.role != .owner && !participant.isCurrentUser {
                                    Button("Remove", role: .destructive) { remove(participant, from: household) }
                                }
                            }
                        }
                    } footer: {
                        Text("Anyone here can see and change everything in this household. Removing someone stops their copy updating — it doesn't delete it.")
                    }

                    Section {
                        Button("Leave this household", role: .destructive) { isConfirmingLeave = true }
                        Button("Export everything") { export(household) }
                    }
                }
            }

            if let errorMessage {
                Section { Text(errorMessage).font(.footnote).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("Household")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadParticipants() }
        .sheet(isPresented: $isSharing) {
            if let household { CloudSharingSheet(household: household) }
        }
        // Leaving is destructive-ish, irreversible from this device, and
        // outward-facing — one of the few places a confirmation earns its keep.
        .confirmationDialog(
            "Leave this household?",
            isPresented: $isConfirmingLeave,
            titleVisibility: .visible
        ) {
            Button("Leave", role: .destructive) { Task { await leave() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your copy stays on this device, read-only. Nothing is deleted for anyone else.")
        }
        .sheet(item: Binding(
            get: { exportURL.map { ExportFile(url: $0) } },
            set: { exportURL = $0?.url }
        )) { file in
            ShareSheet(items: [file.url])
        }
    }

    // MARK: - Actions

    private func addMember() {
        guard let household else { return }
        let used = members.map(\.colorHex)
        let member = Member(name: "New member", colorHex: MemberPalette.nextHex(used: used))
        member.household = household
        modelContext.insert(member)
        try? modelContext.save()
    }

    private func loadParticipants() async {
        guard let household else { return }
        do {
            participants = try await shareController.participants(forZoneNamed: household.zoneName)
        } catch {
            TendLog.sharing.info("No participants yet: \(error.localizedDescription)")
        }
    }

    private func remove(_ participant: HouseholdParticipant, from household: Household) {
        Task {
            do {
                try await shareController.removeParticipant(id: participant.id, fromZoneNamed: household.zoneName)
                await loadParticipants()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func leave() async {
        guard let household else { return }
        let resolver = HouseholdMembershipResolver(
            modelContainer: modelContext.container,
            shareController: shareController
        )
        do {
            try await resolver.leave(household)
            context.update(membership: .readOnlyArchive(reason: .youLeft))
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func export(_ household: Household) {
        let resolver = HouseholdMembershipResolver(
            modelContainer: modelContext.container,
            shareController: shareController
        )
        do {
            let data = try resolver.exportArchive(for: household)
            let url = FileManager.default.temporaryDirectory
                .appending(path: "\(household.name).tend.json")
            try data.write(to: url, options: .atomic)
            exportURL = url
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ExportFile: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// `UICloudSharingController` — the native invite flow §2 asks for. Wrapping
/// Apple's own sheet means the wording about what sharing grants is Apple's,
/// alongside Tend's plain-language version shown just before it.
struct CloudSharingSheet: UIViewControllerRepresentable {
    let household: Household

    func makeUIViewController(context: Context) -> UICloudSharingController {
        let controller = UICloudSharingController { _, completion in
            Task {
                do {
                    let shareController = HouseholdShareController()
                    let share = try await shareController.share(
                        forZoneNamed: household.zoneName,
                        householdName: household.name
                    )
                    completion(share, CKContainer(identifier: TendIdentifiers.cloudKitContainer), nil)
                } catch {
                    completion(nil, nil, error)
                }
            }
        }
        controller.availablePermissions = [.allowReadWrite, .allowPrivate]
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: UICloudSharingController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(householdName: household.name) }

    final class Coordinator: NSObject, UICloudSharingControllerDelegate {
        let householdName: String
        init(householdName: String) { self.householdName = householdName }

        func itemTitle(for controller: UICloudSharingController) -> String? { householdName }

        func cloudSharingController(_ controller: UICloudSharingController, failedToSaveShareWithError error: Error) {
            TendLog.sharing.error("Share sheet failed: \(error.localizedDescription)")
        }

        func cloudSharingControllerDidStopSharing(_ controller: UICloudSharingController) {
            TendLog.sharing.notice("Owner stopped sharing the household.")
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

struct TendPlusView: View {
    @Environment(TendPlusStore.self) private var store

    var body: some View {
        List {
            Section {
                ForEach(TendPlusFeature.allCases) { feature in
                    HStack(alignment: .top, spacing: Spacing.m) {
                        Image(systemName: feature.systemImage)
                            .frame(width: 24)
                            .foregroundStyle(.tint)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(feature.title).font(.subheadline.weight(.medium))
                            Text(feature.detail).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            } header: {
                Text("Tend+")
            } footer: {
                Text("The calendar, lists, tasks, meals, Pulse and the shape of the week are free for everyone, with no ads and no limits.")
            }

            if store.isSubscribed {
                Section { Label("Tend+ is active", systemImage: "checkmark.seal.fill") }
            } else {
                Section {
                    ForEach(store.products, id: \.id) { product in
                        Button {
                            Task { await store.purchase(product) }
                        } label: {
                            HStack {
                                Text(product.displayName)
                                Spacer()
                                Text(product.displayPrice).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Button("Restore purchases") { Task { await store.restore() } }
                        .font(.footnote)
                }
            }

            if let error = store.purchaseError {
                Section { Text(error).font(.footnote).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("Tend+")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview("Settings") {
    NavigationStack { SettingsScreen() }
        .environment(HouseholdContext())
        .environment(BiometricLock())
        .environment(TendPlusStore())
        .modelContainer(TendModelContainer.preview())
}
