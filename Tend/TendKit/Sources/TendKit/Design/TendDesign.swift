import SwiftUI

/// The 8pt grid from §7, named so nothing in the app ever hardcodes a stray 13.
public enum Spacing {
    public static let xs: CGFloat = 4
    public static let s: CGFloat = 8
    public static let m: CGFloat = 16
    public static let l: CGFloat = 24
    public static let xl: CGFloat = 32
    public static let xxl: CGFloat = 48
}

public enum Radius {
    public static let small: CGFloat = 8
    public static let medium: CGFloat = 12
    public static let large: CGFloat = 20
}

/// Spring animations tuned per interaction.
///
/// §7 rules out linear and ease curves for a reason: they read as
/// cross-platform. A check-off should feel like a physical switch, a sheet like
/// something with weight.
public enum Motion {
    /// Check-offs, toggles, anything the finger is still touching.
    public static let snappy = Animation.snappy(duration: 0.25, extraBounce: 0.08)
    /// Row insertion and removal.
    public static let list = Animation.spring(response: 0.35, dampingFraction: 0.8)
    /// View transitions and sheets.
    public static let smooth = Animation.smooth(duration: 0.42)
    /// The Load View bars, which should settle rather than snap — the feature
    /// is meant to feel calm, and a bouncy chart reads as a scoreboard.
    public static let gentle = Animation.spring(response: 0.6, dampingFraction: 0.95)
}

/// Per-member colour is the app's core visual language (§7): every event,
/// assignment and Load View bar is tinted by whose it is.
public enum MemberPalette {
    /// Chosen to stay distinguishable in Dark Mode and to survive the common
    /// forms of colour-blindness — no red/green pair carries meaning alone,
    /// and every one is paired with a name or a symbol in the UI.
    public static let hexes: [String] = [
        "#6C8F7E", // sage
        "#C97B5A", // terracotta
        "#5B7DA8", // slate blue
        "#B0894E", // ochre
        "#8A6FA8", // muted violet
        "#4F8A8B", // teal
        "#A85C74", // dusty rose
        "#7A8B5C", // olive
    ]

    public static func hex(forIndex index: Int) -> String {
        hexes[abs(index) % hexes.count]
    }

    public static func nextHex(used: [String]) -> String {
        hexes.first { !used.contains($0) } ?? hex(forIndex: used.count)
    }
}

public extension Color {
    /// `#RRGGBB` or `#RRGGBBAA`. Falls back to the app's primary sage rather
    /// than to a jarring magenta, so a bad value degrades quietly.
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var value: UInt64 = 0
        guard Scanner(string: cleaned).scanHexInt64(&value) else {
            self = Color(red: 0.42, green: 0.56, blue: 0.49)
            return
        }

        let red, green, blue, alpha: Double
        switch cleaned.count {
        case 6:
            red = Double((value & 0xFF0000) >> 16) / 255
            green = Double((value & 0x00FF00) >> 8) / 255
            blue = Double(value & 0x0000FF) / 255
            alpha = 1
        case 8:
            red = Double((value & 0xFF000000) >> 24) / 255
            green = Double((value & 0x00FF0000) >> 16) / 255
            blue = Double((value & 0x0000FF00) >> 8) / 255
            alpha = Double(value & 0x000000FF) / 255
        default:
            self = Color(red: 0.42, green: 0.56, blue: 0.49)
            return
        }
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}

public extension Member {
    var color: Color { Color(hex: colorHex) }
}

/// Designed empty states are a §7 requirement — every screen has one, and none
/// of them is a shrug.
public struct EmptyStateView: View {
    let systemImage: String
    let title: String
    let message: String
    let actionTitle: String?
    let action: (() -> Void)?

    public init(
        systemImage: String,
        title: String,
        message: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.systemImage = systemImage
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        VStack(spacing: Spacing.m) {
            Image(systemName: systemImage)
                .font(.system(size: 44))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)

            VStack(spacing: Spacing.s) {
                Text(title)
                    .font(.headline)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .padding(.top, Spacing.xs)
            }
        }
        .padding(Spacing.xl)
        .frame(maxWidth: 420)
        .accessibilityElement(children: .combine)
    }
}

/// A member's colour dot plus initials. Used everywhere a person appears.
public struct MemberBadge: View {
    let member: Member
    var size: CGFloat = 28

    public init(member: Member, size: CGFloat = 28) {
        self.member = member
        self.size = size
    }

    public var body: some View {
        ZStack {
            Circle()
                .fill(member.color.opacity(0.22))
            Text(initials)
                // Scales with Dynamic Type instead of pinning a point size.
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(member.color)
                .minimumScaleFactor(0.6)
        }
        .frame(width: size, height: size)
        .accessibilityLabel(member.name)
    }

    private var initials: String {
        let parts = member.name.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }
        return String(letters).uppercased()
    }
}
