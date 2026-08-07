import SwiftData
import SwiftUI
import TendKit

/// Four screens, ending in CKShare's native invite flow (§7).
///
/// The last screen is deliberately not skippable-with-a-shrug: Tend's whole
/// premise is a household, and a solo install has none of the value. But it *is*
/// skippable, because forcing an invite before someone has seen the app is how
/// you lose them.
struct OnboardingView: View {
    @Environment(HouseholdContext.self) private var context
    @Environment(\.modelContext) private var modelContext
    @Query private var households: [Household]

    @State private var page = 0
    @State private var householdName = ""
    @State private var memberNames: [String] = ["", ""]
    @State private var isPresentingShare = false

    var body: some View {
        TabView(selection: $page) {
            welcome.tag(0)
            mentalLoadPitch.tag(1)
            householdSetup.tag(2)
            invite.tag(3)
        }
        .tabViewStyle(.page)
        .indexViewStyle(.page(backgroundDisplayMode: .always))
        .animation(Motion.smooth, value: page)
    }

    // MARK: - Pages

    private var welcome: some View {
        OnboardingPage(
            systemImage: "leaf",
            title: "Tend",
            body: "The app that carries what you're carrying in your head.",
            actionTitle: "Show me"
        ) { page = 1 }
    }

    private var mentalLoadPitch: some View {
        OnboardingPage(
            systemImage: "brain.head.profile",
            title: "The invisible part",
            body: """
            Every household runs on a running list nobody wrote down — who needs what, \
            when, and who's remembering it.

            Tend's job is to hold that list where everyone can see it, and make it easy \
            to hand a piece of it to someone else.
            """,
            actionTitle: "Set up our household"
        ) { page = 2 }
    }

    private var householdSetup: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.l) {
                Text("Who's in it?")
                    .font(.largeTitle.bold())

                Text("You can change all of this later.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                TextField("Household name", text: $householdName)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.words)

                VStack(spacing: Spacing.s) {
                    ForEach(memberNames.indices, id: \.self) { index in
                        HStack(spacing: Spacing.s) {
                            Circle()
                                .fill(Color(hex: MemberPalette.hex(forIndex: index)))
                                .frame(width: 24, height: 24)
                            TextField(index == 0 ? "Your name" : "Someone else", text: $memberNames[index])
                                .textFieldStyle(.roundedBorder)
                                .textInputAutocapitalization(.words)
                        }
                    }
                }

                Button {
                    memberNames.append("")
                } label: {
                    Label("Add another", systemImage: "plus.circle")
                }
                .buttonStyle(.borderless)

                Button("Continue") { createHousehold() }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canContinue)
                    .frame(maxWidth: .infinity)
                    .padding(.top, Spacing.m)
            }
            .padding(Spacing.l)
        }
    }

    private var invite: some View {
        VStack(spacing: Spacing.l) {
            Spacer()
            Image(systemName: "person.2")
                .font(.system(size: 44))
                .foregroundStyle(.tertiary)

            Text("Bring everyone in")
                .font(.largeTitle.bold())
                .multilineTextAlignment(.center)

            // §8's plain-language disclosure, shown *before* the system sheet
            // rather than buried in a settings screen after the fact.
            VStack(alignment: .leading, spacing: Spacing.s) {
                Label("Everyone you invite can see and change everything in this household.",
                      systemImage: "eye")
                Label("It syncs through their iCloud account — Tend has no server and never sees your data.",
                      systemImage: "lock.icloud")
                Label("You can remove someone later. Their copy stops updating and turns read-only.",
                      systemImage: "person.badge.minus")
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(Spacing.m)
            .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: Radius.medium))

            Button {
                isPresentingShare = true
            } label: {
                Label("Invite with iCloud", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            Button("I'll do this later") { finish() }
                .buttonStyle(.borderless)

            Spacer()
        }
        .padding(Spacing.l)
        .sheet(isPresented: $isPresentingShare, onDismiss: finish) {
            if let household = households.first {
                CloudSharingSheet(household: household)
            }
        }
    }

    // MARK: - Actions

    private var canContinue: Bool {
        !householdName.trimmingCharacters(in: .whitespaces).isEmpty
            && !memberNames[0].trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func createHousehold() {
        let household = Household(name: householdName.trimmingCharacters(in: .whitespaces))
        modelContext.insert(household)

        var firstMember: Member?
        for (index, rawName) in memberNames.enumerated() {
            let name = rawName.trimmingCharacters(in: .whitespaces)
            guard !name.isEmpty else { continue }
            let member = Member(name: name, colorHex: MemberPalette.hex(forIndex: index))
            member.household = household
            modelContext.insert(member)
            if firstMember == nil { firstMember = member }
        }

        try? modelContext.save()
        context.currentHouseholdID = household.id
        // The first name entered is this device's member — every completion
        // gets attributed to them, which is what Load View reads.
        context.currentMemberID = firstMember?.id
        page = 3
    }

    private func finish() {
        context.selectedTab = .pulse
    }
}

private struct OnboardingPage: View {
    let systemImage: String
    let title: String
    let body: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: Spacing.l) {
            Spacer()
            Image(systemName: systemImage)
                .font(.system(size: 52))
                .foregroundStyle(.tint)
                .accessibilityHidden(true)

            Text(title)
                .font(.largeTitle.bold())

            Text(body)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 480)

            Spacer()

            Button(actionTitle, action: action)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
        .padding(Spacing.xl)
    }
}

#Preview("Onboarding") {
    OnboardingView()
        .environment(HouseholdContext())
        .modelContainer(TendModelContainer.preview())
}
