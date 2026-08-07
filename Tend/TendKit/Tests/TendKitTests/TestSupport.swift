import Foundation
@testable import TendKit

/// A fixed calendar in a fixed time zone. Recurrence tests that run against
/// `Calendar.current` pass in one office and fail in another.
enum Fixture {
    static var calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        calendar.locale = Locale(identifier: "en_US_POSIX")
        // Sunday, so weekday numbering lines up with `RecurrenceRule.Weekday`.
        calendar.firstWeekday = 1
        return calendar
    }()

    /// `Fixture.date(2026, 3, 3, 17, 0)` — 3 March 2026, 17:00 UTC (a Tuesday).
    static func date(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 0, _ minute: Int = 0) -> Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        components.minute = minute
        return calendar.date(from: components)!
    }

    static func range(_ from: Date, _ to: Date) -> Range<Date> { from..<to }
}
