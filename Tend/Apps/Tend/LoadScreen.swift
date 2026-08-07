import SwiftData
import SwiftUI
import TendKit

enum LoadScreenModel {
    /// Pulls the window's raw material out of the store and hands it to
    /// ``LoadCalculator``. All the judgement lives there; this is plumbing.
    @MainActor
    static func summary(window: LoadWindow, context: ModelContext) -> LoadSummary {
        let members = (try? context.fetch(FetchDescriptor<Member>())) ?? []
        let tasks = (try? context.fetch(FetchDescriptor<HouseholdTask>())) ?? []
        let items = (try? context.fetch(FetchDescriptor<ListItem>())) ?? []
        let events = (try? context.fetch(FetchDescriptor<Event>())) ?? []

        return LoadCalculator.summarize(
            window: window,
            members: members.map { PulseMemberInput(id: $0.id, name: $0.name) },
            memberColors: Dictionary(members.map { ($0.id, $0.colorHex) }, uniquingKeysWith: { first, _ in first }),
            tasks: tasks.map {
                PulseTaskInput(
                    id: $0.id, title: $0.title, dueDate: $0.dueDate, isComplete: $0.isComplete,
                    completedAt: $0.completedAt, completedBy: $0.completedBy,
                    assignedMemberID: $0.assignedMemberID
                )
            },
            listItems: items.map {
                PulseListItemInput(
                    id: $0.id, listName: $0.listName, text: $0.text, isChecked: $0.isChecked,
                    completedAt: $0.completedAt, completedBy: $0.completedBy,
                    addedBy: $0.addedBy, createdAt: $0.createdAt
                )
            },
            events: events.map {
                PulseEventInput(
                    id: $0.id, title: $0.title, start: $0.startDate, end: $0.endDate,
                    isAllDay: $0.isAllDay, attendeeIDs: $0.attendeeIDs
                )
            },
            // "Organised" means "last touched it" — the person who typed the
            // event in, not everyone who shows up to it.
            eventOrganizers: Dictionary(
                events.compactMap { event in event.lastModifiedBy.map { (event.id, $0) } },
                uniquingKeysWith: { first, _ in first }
            )
        )
    }
}

/// Load View.
///
/// The design brief is explicit and it is the hard part: make imbalance visible
/// **without** becoming a scoreboard. Concretely, in this file:
///
/// - Bars are drawn in household order, never sorted by size.
/// - No numbers are shown as a total per person by default; the raw counts sit
///   behind a disclosure, because a number invites comparison in a way a shape
///   does not.
/// - No rank, no target, no streak, no week-over-week delta, no "you're doing
///   better than" anything.
/// - The caveat stays on screen. It is not a disclaimer to be dismissed; it is
///   part of the claim the chart is making.
struct LoadScreen: View {
    @Environment(\.modelContext) private var modelContext

    @State private var isWeekly = true
    @State private var showsCounts = false

    private var window: LoadWindow {
        isWeekly ? .week(containing: .now) : .month(containing: .now)
    }

    private var summary: LoadSummary {
        LoadScreenModel.summary(window: window, context: modelContext)
    }

    var body: some View {
        let summary = summary

        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.l) {
                Picker("Window", selection: $isWeekly) {
                    Text("Week").tag(true)
                    Text("Month").tag(false)
                }
                .pickerStyle(.segmented)

                if summary.isEmpty {
                    EmptyStateView(
                        systemImage: "chart.bar.doc.horizontal",
                        title: "Nothing to show yet",
                        message: "As things get checked off, this fills in with the shape of who's been carrying what."
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.top, Spacing.xl)
                } else {
                    chart(summary)
                    if let observation = summary.observation {
                        Text(observation)
                            .font(.callout)
                            .foregroundStyle(.primary)
                            .padding(Spacing.m)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: Radius.medium))
                    }
                    breakdown(summary)
                }

                Text(summary.caveat)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.top, Spacing.s)
            }
            .padding(Spacing.m)
        }
        .navigationTitle("The shape of the week")
        .navigationBarTitleDisplayMode(.inline)
        .animation(Motion.gentle, value: isWeekly)
    }

    // MARK: - Chart

    private func chart(_ summary: LoadSummary) -> some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            ForEach(summary.shares) { share in
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    HStack {
                        Text(share.name)
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        if showsCounts {
                            Text("\(share.total)")
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .transition(.opacity)
                        }
                    }

                    GeometryReader { geometry in
                        // A single soft bar per person. Not stacked against a
                        // "target", not compared to a household average — just
                        // the width of what they did.
                        RoundedRectangle(cornerRadius: Radius.small)
                            .fill(Color(hex: share.colorHex).opacity(0.85))
                            .frame(
                                width: max(
                                    geometry.size.width * share.fraction(of: summary.householdTotal),
                                    share.total > 0 ? 12 : 0
                                )
                            )
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                RoundedRectangle(cornerRadius: Radius.small)
                                    .fill(.quaternary.opacity(0.25))
                            )
                    }
                    .frame(height: 14)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(share.name)
                // VoiceOver gets the plain facts rather than a described
                // picture — "12 things" is more useful than "a medium bar".
                .accessibilityValue(
                    share.total == 0
                        ? "Nothing logged this \(isWeekly ? "week" : "month")"
                        : "\(share.total) \(share.total == 1 ? "thing" : "things") logged"
                )
            }

            Toggle("Show counts", isOn: $showsCounts.animation(Motion.gentle))
                .font(.footnote)
                .padding(.top, Spacing.xs)
        }
    }

    private func breakdown(_ summary: LoadSummary) -> some View {
        DisclosureGroup("What's counted") {
            VStack(alignment: .leading, spacing: Spacing.s) {
                ForEach(LoadCategory.allCases) { category in
                    HStack(spacing: Spacing.s) {
                        Image(systemName: category.systemImage)
                            .frame(width: 20)
                            .foregroundStyle(.secondary)
                        Text(category.title)
                            .font(.subheadline)
                        Spacer()
                        Text("\(summary.shares.reduce(0) { $0 + $1.count(category) })")
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.top, Spacing.s)
        }
        .font(.subheadline)
    }
}

/// The compact version that sits on the Pulse screen: the same shape, no
/// numbers, no names, just a sense of the distribution.
struct LoadSparkline: View {
    let shares: [LoadShare]
    let total: Int

    var body: some View {
        HStack(spacing: 3) {
            if total == 0 {
                RoundedRectangle(cornerRadius: 3)
                    .fill(.quaternary.opacity(0.4))
                    .frame(width: 44)
            } else {
                ForEach(shares) { share in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(hex: share.colorHex).opacity(0.85))
                        .frame(width: max(4, 60 * share.fraction(of: total)))
                }
            }
        }
        .frame(width: 64, alignment: .leading)
        .accessibilityHidden(true)
    }
}

#Preview("Load") {
    NavigationStack {
        LoadScreen()
    }
    .modelContainer(TendModelContainer.preview())
}
