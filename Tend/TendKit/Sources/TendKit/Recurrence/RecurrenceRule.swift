import Foundation

/// A deliberately small subset of RFC 5545 RRULE — the part households
/// actually use — with a lossless string round-trip so the stored form stays
/// readable and interoperable with EventKit.
///
/// Supported: `FREQ`, `INTERVAL`, `BYDAY`, `BYMONTHDAY`, `COUNT`, `UNTIL`.
/// Unsupported keys are preserved verbatim on parse so a future version that
/// understands them does not lose data written by a newer client.
public struct RecurrenceRule: Equatable, Hashable, Codable, Sendable {

    public enum Frequency: String, CaseIterable, Codable, Sendable, Identifiable {
        case daily = "DAILY"
        case weekly = "WEEKLY"
        case monthly = "MONTHLY"
        case yearly = "YEARLY"

        public var id: String { rawValue }

        public var title: String {
            switch self {
            case .daily: "Daily"
            case .weekly: "Weekly"
            case .monthly: "Monthly"
            case .yearly: "Yearly"
            }
        }
    }

    /// ICS two-letter weekday codes. Raw values match `Calendar` weekday
    /// numbers (Sunday == 1) to keep the conversion honest in one place.
    public enum Weekday: Int, CaseIterable, Codable, Sendable, Identifiable, Comparable {
        case sunday = 1, monday, tuesday, wednesday, thursday, friday, saturday

        public var id: Int { rawValue }

        public var icsCode: String {
            switch self {
            case .sunday: "SU"
            case .monday: "MO"
            case .tuesday: "TU"
            case .wednesday: "WE"
            case .thursday: "TH"
            case .friday: "FR"
            case .saturday: "SA"
            }
        }

        public init?(icsCode: String) {
            guard let match = Weekday.allCases.first(where: { $0.icsCode == icsCode.uppercased() }) else {
                return nil
            }
            self = match
        }

        public static func < (lhs: Weekday, rhs: Weekday) -> Bool { lhs.rawValue < rhs.rawValue }
    }

    public var frequency: Frequency
    public var interval: Int
    public var weekdays: [Weekday]
    public var monthDays: [Int]
    public var count: Int?
    public var until: Date?

    /// Keys we did not understand, kept so a round-trip is non-destructive.
    public var unknownComponents: [String]

    public init(
        frequency: Frequency,
        interval: Int = 1,
        weekdays: [Weekday] = [],
        monthDays: [Int] = [],
        count: Int? = nil,
        until: Date? = nil,
        unknownComponents: [String] = []
    ) {
        self.frequency = frequency
        self.interval = max(1, interval)
        self.weekdays = weekdays.sorted()
        self.monthDays = monthDays.sorted()
        self.count = count
        self.until = until
        self.unknownComponents = unknownComponents
    }

    // MARK: - Parsing

    public init?(rawValue: String) {
        let trimmed = rawValue
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "RRULE:", with: "", options: [.anchored, .caseInsensitive])
        guard !trimmed.isEmpty else { return nil }

        var frequency: Frequency?
        var interval = 1
        var weekdays: [Weekday] = []
        var monthDays: [Int] = []
        var count: Int?
        var until: Date?
        var unknown: [String] = []

        for component in trimmed.split(separator: ";") {
            let pair = component.split(separator: "=", maxSplits: 1)
            guard pair.count == 2 else {
                unknown.append(String(component))
                continue
            }
            let key = pair[0].uppercased()
            let value = String(pair[1])

            switch key {
            case "FREQ":
                frequency = Frequency(rawValue: value.uppercased())
            case "INTERVAL":
                interval = Int(value) ?? 1
            case "BYDAY":
                weekdays = value
                    .split(separator: ",")
                    // Strip any ordinal prefix ("2TU"); ordinals are not
                    // supported yet, and dropping to the plain weekday is a
                    // better failure than dropping the rule.
                    .compactMap { Weekday(icsCode: String($0.suffix(2))) }
            case "BYMONTHDAY":
                monthDays = value.split(separator: ",").compactMap { Int($0) }
            case "COUNT":
                count = Int(value)
            case "UNTIL":
                until = RecurrenceRule.icsFormatter.date(from: value)
                    ?? RecurrenceRule.icsDateOnlyFormatter.date(from: value)
            default:
                unknown.append(String(component))
            }
        }

        guard let frequency else { return nil }
        self.init(
            frequency: frequency,
            interval: interval,
            weekdays: weekdays,
            monthDays: monthDays,
            count: count,
            until: until,
            unknownComponents: unknown
        )
    }

    // MARK: - Serialising

    public var rawValue: String {
        var parts = ["FREQ=\(frequency.rawValue)"]
        if interval > 1 { parts.append("INTERVAL=\(interval)") }
        if !weekdays.isEmpty {
            parts.append("BYDAY=" + weekdays.map(\.icsCode).joined(separator: ","))
        }
        if !monthDays.isEmpty {
            parts.append("BYMONTHDAY=" + monthDays.map(String.init).joined(separator: ","))
        }
        if let count { parts.append("COUNT=\(count)") }
        if let until { parts.append("UNTIL=" + RecurrenceRule.icsFormatter.string(from: until)) }
        parts.append(contentsOf: unknownComponents)
        return parts.joined(separator: ";")
    }

    // MARK: - Display

    /// Plain-language description, e.g. "Every 2 weeks on Tue, Thu".
    public func localizedDescription(calendar: Calendar = .current) -> String {
        let unit: String
        switch frequency {
        case .daily: unit = interval == 1 ? "Every day" : "Every \(interval) days"
        case .weekly: unit = interval == 1 ? "Every week" : "Every \(interval) weeks"
        case .monthly: unit = interval == 1 ? "Every month" : "Every \(interval) months"
        case .yearly: unit = interval == 1 ? "Every year" : "Every \(interval) years"
        }

        var text = unit
        if !weekdays.isEmpty {
            let symbols = calendar.shortWeekdaySymbols
            let names = weekdays.compactMap { day -> String? in
                let index = day.rawValue - 1
                return symbols.indices.contains(index) ? symbols[index] : nil
            }
            text += " on " + names.joined(separator: ", ")
        }
        if let count { text += ", \(count) times" }
        if let until {
            text += ", until " + until.formatted(date: .abbreviated, time: .omitted)
        }
        return text
    }

    // MARK: - Formatters

    static let icsFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        return formatter
    }()

    static let icsDateOnlyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd"
        return formatter
    }()
}
