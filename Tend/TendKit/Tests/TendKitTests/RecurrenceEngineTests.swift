import XCTest
@testable import TendKit

final class RecurrenceRuleTests: XCTestCase {

    func testRoundTripsWeeklyRule() {
        let rule = RecurrenceRule(frequency: .weekly, interval: 2, weekdays: [.tuesday, .thursday])
        let parsed = RecurrenceRule(rawValue: rule.rawValue)
        XCTAssertEqual(parsed, rule)
        XCTAssertEqual(rule.rawValue, "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH")
    }

    func testParsesRRULEPrefixAndUntil() {
        let raw = "RRULE:FREQ=DAILY;UNTIL=20260401T000000Z"
        let rule = RecurrenceRule(rawValue: raw)
        XCTAssertEqual(rule?.frequency, .daily)
        XCTAssertEqual(rule?.until, Fixture.date(2026, 4, 1))
    }

    func testPreservesUnknownComponents() {
        let rule = RecurrenceRule(rawValue: "FREQ=WEEKLY;WKST=MO;BYDAY=MO")
        XCTAssertEqual(rule?.unknownComponents, ["WKST=MO"])
        // The round trip must not drop a key a newer client wrote.
        XCTAssertTrue(rule?.rawValue.contains("WKST=MO") ?? false)
    }

    func testStripsOrdinalPrefixFromByDay() {
        let rule = RecurrenceRule(rawValue: "FREQ=MONTHLY;BYDAY=2TU")
        XCTAssertEqual(rule?.weekdays, [.tuesday])
    }

    func testRejectsRuleWithoutFrequency() {
        XCTAssertNil(RecurrenceRule(rawValue: "INTERVAL=2;BYDAY=MO"))
    }
}

final class RecurrenceExpansionTests: XCTestCase {

    private func snapshot(
        start: Date,
        durationHours: Int = 1,
        rule: RecurrenceRule?,
        exceptions: [Date] = []
    ) -> EventSnapshot {
        EventSnapshot(
            title: "Soccer practice",
            startDate: start,
            endDate: start.addingTimeInterval(TimeInterval(durationHours) * 3600),
            rule: rule,
            exceptionDates: exceptions
        )
    }

    func testDailyExpansion() {
        // 2 March 2026 is a Monday.
        let event = snapshot(start: Fixture.date(2026, 3, 2, 8), rule: RecurrenceRule(frequency: .daily))
        let occurrences = RecurrenceEngine.occurrences(
            of: event,
            in: Fixture.range(Fixture.date(2026, 3, 1), Fixture.date(2026, 3, 8)),
            calendar: Fixture.calendar
        )
        XCTAssertEqual(occurrences.count, 6)
        XCTAssertEqual(occurrences.first?.start, Fixture.date(2026, 3, 2, 8))
        XCTAssertEqual(occurrences.last?.start, Fixture.date(2026, 3, 7, 8))
    }

    func testWeeklyWithTwoWeekdays() {
        // Anchored on Tuesday 3 March; BYDAY covers Tuesday and Thursday.
        let rule = RecurrenceRule(frequency: .weekly, weekdays: [.tuesday, .thursday])
        let event = snapshot(start: Fixture.date(2026, 3, 3, 17), rule: rule)
        let occurrences = RecurrenceEngine.occurrences(
            of: event,
            in: Fixture.range(Fixture.date(2026, 3, 1), Fixture.date(2026, 3, 15)),
            calendar: Fixture.calendar
        )
        let starts = occurrences.map(\.start)
        XCTAssertEqual(starts, [
            Fixture.date(2026, 3, 3, 17),
            Fixture.date(2026, 3, 5, 17),
            Fixture.date(2026, 3, 10, 17),
            Fixture.date(2026, 3, 12, 17),
        ])
    }

    func testEveryOtherWeekSkipsAWeek() {
        let rule = RecurrenceRule(frequency: .weekly, interval: 2, weekdays: [.tuesday])
        let event = snapshot(start: Fixture.date(2026, 3, 3, 17), rule: rule)
        let starts = RecurrenceEngine.occurrences(
            of: event,
            in: Fixture.range(Fixture.date(2026, 3, 1), Fixture.date(2026, 4, 1)),
            calendar: Fixture.calendar
        ).map(\.start)
        XCTAssertEqual(starts, [
            Fixture.date(2026, 3, 3, 17),
            Fixture.date(2026, 3, 17, 17),
            Fixture.date(2026, 3, 31, 17),
        ])
    }

    func testCountLimitsTheSeries() {
        let rule = RecurrenceRule(frequency: .daily, count: 3)
        let event = snapshot(start: Fixture.date(2026, 3, 2, 8), rule: rule)
        let starts = RecurrenceEngine.occurrences(
            of: event,
            in: Fixture.range(Fixture.date(2026, 3, 1), Fixture.date(2026, 4, 1)),
            calendar: Fixture.calendar
        ).map(\.start)
        XCTAssertEqual(starts.count, 3)
    }

    func testUntilIsInclusiveOfItsOwnDay() {
        let rule = RecurrenceRule(frequency: .daily, until: Fixture.date(2026, 3, 4, 8))
        let event = snapshot(start: Fixture.date(2026, 3, 2, 8), rule: rule)
        let starts = RecurrenceEngine.occurrences(
            of: event,
            in: Fixture.range(Fixture.date(2026, 3, 1), Fixture.date(2026, 4, 1)),
            calendar: Fixture.calendar
        ).map(\.start)
        XCTAssertEqual(starts, [
            Fixture.date(2026, 3, 2, 8),
            Fixture.date(2026, 3, 3, 8),
            Fixture.date(2026, 3, 4, 8),
        ])
    }

    func testExceptionDatesAreSkippedButStillConsumeCount() {
        // RFC 5545: COUNT applies before EXDATE, so excluding one instance
        // shortens the series rather than shifting it along.
        let rule = RecurrenceRule(frequency: .daily, count: 3)
        let event = snapshot(
            start: Fixture.date(2026, 3, 2, 8),
            rule: rule,
            exceptions: [Fixture.date(2026, 3, 3, 8)]
        )
        let starts = RecurrenceEngine.occurrences(
            of: event,
            in: Fixture.range(Fixture.date(2026, 3, 1), Fixture.date(2026, 4, 1)),
            calendar: Fixture.calendar
        ).map(\.start)
        XCTAssertEqual(starts, [Fixture.date(2026, 3, 2, 8), Fixture.date(2026, 3, 4, 8)])
    }

    func testMonthlySkipsMonthsWithoutTheDay() {
        let rule = RecurrenceRule(frequency: .monthly, monthDays: [31])
        let event = snapshot(start: Fixture.date(2026, 1, 31, 9), rule: rule)
        let starts = RecurrenceEngine.occurrences(
            of: event,
            in: Fixture.range(Fixture.date(2026, 1, 1), Fixture.date(2026, 5, 1)),
            calendar: Fixture.calendar
        ).map(\.start)
        // February and April have no 31st.
        XCTAssertEqual(starts, [
            Fixture.date(2026, 1, 31, 9),
            Fixture.date(2026, 3, 31, 9),
        ])
    }

    func testNonRecurringEventOnlyAppearsInsideTheRange() {
        let event = snapshot(start: Fixture.date(2026, 3, 2, 8), rule: nil)
        XCTAssertEqual(
            RecurrenceEngine.occurrences(
                of: event,
                in: Fixture.range(Fixture.date(2026, 3, 1), Fixture.date(2026, 3, 5)),
                calendar: Fixture.calendar
            ).count,
            1
        )
        XCTAssertTrue(
            RecurrenceEngine.occurrences(
                of: event,
                in: Fixture.range(Fixture.date(2026, 4, 1), Fixture.date(2026, 4, 5)),
                calendar: Fixture.calendar
            ).isEmpty
        )
    }

    func testNextOccurrenceLooksForward() {
        let rule = RecurrenceRule(frequency: .weekly, weekdays: [.tuesday])
        let event = snapshot(start: Fixture.date(2026, 3, 3, 17), rule: rule)
        let next = RecurrenceEngine.nextOccurrence(
            of: event,
            after: Fixture.date(2026, 3, 4, 12),
            calendar: Fixture.calendar
        )
        XCTAssertEqual(next?.start, Fixture.date(2026, 3, 10, 17))
    }
}
