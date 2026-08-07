#if canImport(ActivityKit)
import ActivityKit
import SwiftUI
import TendKit
import WidgetKit

/// Lock Screen and Dynamic Island presentation for an in-progress shop.
struct ShoppingTripLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ShoppingTripAttributes.self) { context in
            lockScreen(context)
                .activityBackgroundTint(Color.black.opacity(0.35))
                .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("\(context.state.remaining)", systemImage: "cart")
                        .font(.title3.weight(.semibold))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.attributes.storeName ?? context.attributes.listName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        ProgressView(value: context.state.progress)
                            .tint(.accentColor)
                        if let last = context.state.lastCheckedOff {
                            Text("Just got \(last)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "cart")
            } compactTrailing: {
                Text("\(context.state.remaining)")
                    .font(.caption.monospacedDigit())
            } minimal: {
                Text("\(context.state.remaining)")
                    .font(.caption2.monospacedDigit())
            }
            .widgetURL(DeepLink.list(name: context.attributes.listName).url)
        }
    }

    private func lockScreen(_ context: ActivityViewContext<ShoppingTripAttributes>) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            HStack {
                Label(context.attributes.storeName ?? context.attributes.listName, systemImage: "cart")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text(
                    context.state.remaining == 0
                        ? "All done"
                        : "\(context.state.remaining) left"
                )
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
            }

            ProgressView(value: context.state.progress)
                .tint(.accentColor)

            if let last = context.state.lastCheckedOff {
                Text("Just got \(last)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(Spacing.m)
    }
}
#endif
