import SwiftData
import SwiftUI
import TendKit

/// Pulse — the recap, and the app's home screen.
///
/// It opens onto what the household is carrying rather than onto a calendar
/// grid, because the grid is the thing every other app already opens onto.
struct PulseScreen: View {
    @Environment(HouseholdContext.self) private var context
    @Environment(\.modelContext) private var modelContext

    @Query private var digests: [PulseDigest]
    @Query private var members: [Member]

    @State private var snapshot: PulseSnapshot?

    var body: some View {
        @Bindable var context = context

        NavigationStack(path: $context.pulsePath) {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.l) {
                    header
                    if let snapshot, !snapshot.isEmpty {
                        lines(for: snapshot)
                    } else {
                        EmptyStateView(
                            systemImage: "leaf",
                            title: "Nothing needs you right now",
                            message: "When there are events, tasks or lists in flight, this is where the shape of the week shows up."
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.top, Spacing.xl)
                    }
                    loadCard
                }
                .padding(Spacing.m)
            }
            .navigationTitle("Pulse")
            .toolbar { toolbar }
            .navigationDestination(for: DeepLink.self) { destination(for: $0) }
            .refreshable { regenerate() }
            .task { load() }
            .onChange(of: digests.count) { _, _ in load() }
        }
    }

    // MARK: - Pieces

    private var header: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(snapshot?.headline ?? "Today")
                .font(.largeTitle.bold())
            if let generated = snapshot?.generatedAt {
                Text("Updated \(generated.formatted(.relative(presentation: .named)))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func lines(for snapshot: PulseSnapshot) -> some View {
        VStack(spacing: Spacing.s) {
            ForEach(snapshot.lines) { line in
                Button {
                    context.open(line.destination)
                } label: {
                    HStack(spacing: Spacing.m) {
                        Image(systemName: line.systemImage)
                            .font(.title3)
                            .foregroundStyle(.tint)
                            .frame(width: 28)
                            .accessibilityHidden(true)
                        Text(line.text)
                            .font(.body)
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: Spacing.s)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tertiary)
                            .accessibilityHidden(true)
                    }
                    .padding(Spacing.m)
                    .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: Radius.medium))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var loadCard: some View {
        NavigationLink(value: DeepLink.load) {
            HStack(spacing: Spacing.m) {
                LoadSparkline(shares: currentSummary.shares, total: currentSummary.householdTotal)
                    .frame(height: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text("The shape of the week")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                    Text(currentSummary.observation ?? "Who's been carrying what.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
            }
            .padding(Spacing.m)
            .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: Radius.medium))
        }
        .buttonStyle(.plain)
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            NavigationLink(value: DeepLink.settings) {
                Image(systemName: "gearshape")
            }
            .accessibilityLabel("Settings")
        }
        ToolbarItem(placement: .topBarLeading) {
            Button {
                context.isQuickAddPresented = true
            } label: {
                Image(systemName: "plus")
            }
            .accessibilityLabel("Quick add")
        }
    }

    @ViewBuilder
    private func destination(for link: DeepLink) -> some View {
        switch link {
        case .load: LoadScreen()
        case .settings: SettingsScreen()
        case .household: HouseholdScreen()
        default: EmptyView()
        }
    }

    // MARK: - Data

    private var currentSummary: LoadSummary {
        LoadScreenModel.summary(window: .week(containing: .now), context: modelContext)
    }

    private func load() {
        let kind: PulseKind = Calendar.current.component(.hour, from: .now) >= 16 ? .weekly : .morning
        guard let digest = PulseService.latest(kind: kind, context: modelContext) else {
            regenerate()
            return
        }
        // Rendered straight from the stored digest — no recomputation on
        // appearance, which is what makes this instant (§4).
        snapshot = PulseSnapshot(
            kind: kind,
            generatedAt: digest.generatedAt,
            headline: digest.headline,
            lines: digest.lines.enumerated().map { index, text in
                PulseLine(
                    id: "\(index)",
                    text: text,
                    systemImage: "circle.fill",
                    destination: DeepLink(url: URL(string: digest.deepLink) ?? DeepLink.pulse(kind).url) ?? .pulse(kind)
                )
            },
            deepLink: .pulse(kind)
        )
        // Regenerate quietly behind the rendered copy so the next open is fresh
        // without this one being slow.
        Task { regenerate() }
    }

    private func regenerate() {
        let kind: PulseKind = Calendar.current.component(.hour, from: .now) >= 16 ? .weekly : .morning
        snapshot = PulseService.generate(kind: kind, context: modelContext)
    }
}

#Preview("Pulse") {
    PulseScreen()
        .environment(HouseholdContext())
        .modelContainer(TendModelContainer.preview())
}

#Preview("Pulse — large type") {
    PulseScreen()
        .environment(HouseholdContext())
        .modelContainer(TendModelContainer.preview())
        .environment(\.dynamicTypeSize, .accessibility3)
}
