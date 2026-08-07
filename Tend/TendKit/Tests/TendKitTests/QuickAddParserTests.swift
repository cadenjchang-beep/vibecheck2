import XCTest
@testable import TendKit

final class QuickAddParserTests: XCTestCase {

    /// Monday 2 March 2026, 09:00 — every relative phrase below is resolved
    /// against this.
    private let now = Fixture.date(2026, 3, 2, 9)

    private func parse(_ text: String) -> QuickAddResult {
        QuickAddParser.parse(text, referenceDate: now, calendar: Fixture.calendar)
    }

    // MARK: - The brief's own example

    func testParsesRecurringEventWithTimeAndPlace() {
        let result = parse("soccer practice every Tue 5pm at Lincoln Park")

        XCTAssertEqual(result.kind, .event)
        XCTAssertEqual(result.title.lowercased(), "soccer practice")
        XCTAssertEqual(result.location, "Lincoln Park")
        XCTAssertEqual(result.rule?.frequency, .weekly)
        XCTAssertEqual(result.rule?.weekdays, [.tuesday])
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 3, 17))
        XCTAssertFalse(result.isAllDay)
        XCTAssertGreaterThan(result.confidence, 0.5)
    }

    // MARK: - Times

    func testParsesBareTimeAsToday() {
        let result = parse("standup 11am")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 2, 11))
    }

    func testBareTimeThatHasPassedRollsToTomorrow() {
        // 8am, said at 9am, means tomorrow — not four minutes ago.
        let result = parse("gym 8am")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 3, 8))
    }

    func testParsesTimeRange() {
        let result = parse("book club 7-9pm friday")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 6, 19))
        XCTAssertEqual(result.endDate, Fixture.date(2026, 3, 6, 21))
    }

    func testBorrowsMeridiemFromTheEndOfARange() {
        let result = parse("swim 5-7pm")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 2, 17))
        XCTAssertEqual(result.endDate, Fixture.date(2026, 3, 2, 19))
    }

    func testParsesDuration() {
        let result = parse("piano 4pm for 90 mins")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 2, 16))
        XCTAssertEqual(result.endDate, Fixture.date(2026, 3, 2, 17, 30))
    }

    func testTonightImpliesEveningButAnExplicitTimeWins() {
        XCTAssertEqual(parse("movie tonight").startDate, Fixture.date(2026, 3, 2, 19))
        XCTAssertEqual(parse("movie tonight at 9pm").startDate, Fixture.date(2026, 3, 2, 21))
    }

    // MARK: - Days

    func testTomorrowIsAllDayWithoutATime() {
        let result = parse("library books due tomorrow")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 3))
        XCTAssertTrue(result.isAllDay)
    }

    func testBareWeekdayMeansTheNextOne() {
        let result = parse("haircut thursday 2pm")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 5, 14))
    }

    func testNextWeekdaySkipsAWeek() {
        let result = parse("haircut next thursday 2pm")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 12, 14))
    }

    func testParsesMonthAndDay() {
        let result = parse("passport renewal Apr 14")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 4, 14))
    }

    func testParsesRelativeDayOffset() {
        let result = parse("follow up in 3 days")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 5))
    }

    // MARK: - Recurrence vocabulary

    func testEveryOtherWeekday() {
        let result = parse("bins out every other wednesday")
        XCTAssertEqual(result.rule?.frequency, .weekly)
        XCTAssertEqual(result.rule?.interval, 2)
        XCTAssertEqual(result.rule?.weekdays, [.wednesday])
    }

    func testEveryWeekdayExpandsToFiveDays() {
        let result = parse("school run every weekday 8am")
        XCTAssertEqual(result.rule?.weekdays, [.monday, .tuesday, .wednesday, .thursday, .friday])
    }

    func testMultipleWeekdays() {
        let result = parse("swim every mon and wed 6pm")
        XCTAssertEqual(result.rule?.weekdays, [.monday, .wednesday])
    }

    func testBareAdverbRecurrence() {
        XCTAssertEqual(parse("water the plants weekly").rule?.frequency, .weekly)
        XCTAssertEqual(parse("check smoke alarms monthly").rule?.frequency, .monthly)
    }

    // MARK: - Lists

    func testRoutesToAListByHashtag() {
        let result = parse("oat milk #groceries")
        XCTAssertEqual(result.kind, .listItem)
        XCTAssertEqual(result.listName, TendList.groceries)
        XCTAssertEqual(result.title, "oat milk")
    }

    func testRoutesToAListByPhrase() {
        let result = parse("add batteries to the household list")
        XCTAssertEqual(result.kind, .listItem)
        XCTAssertEqual(result.listName, TendList.household)
        XCTAssertEqual(result.title, "batteries")
    }

    func testNormalisesSynonymousListNames() {
        XCTAssertEqual(QuickAddParser.normalizeListName("grocery"), TendList.groceries)
        XCTAssertEqual(QuickAddParser.normalizeListName("shopping"), TendList.groceries)
        XCTAssertEqual(QuickAddParser.normalizeListName("chores"), TendList.household)
    }

    func testPlainTextWithNoSignalsBecomesAListItem() {
        let result = parse("paper towels")
        XCTAssertEqual(result.kind, .listItem)
        XCTAssertEqual(result.title, "paper towels")
    }

    func testExtractsQuantityFromListItems() {
        let result = parse("2 dozen eggs")
        XCTAssertEqual(result.kind, .listItem)
        XCTAssertEqual(result.title, "eggs")
        XCTAssertEqual(result.quantity, "2 dozen")
    }

    func testAQuantityWithNoItemStaysIntact() {
        let (title, quantity) = QuickAddParser.splitQuantity(from: "12")
        XCTAssertEqual(title, "12")
        XCTAssertNil(quantity)
    }

    // MARK: - Tasks

    func testTaskVerbMakesATaskNotAnEvent() {
        let result = parse("remind me to call the plumber tomorrow")
        XCTAssertEqual(result.kind, .task)
        XCTAssertEqual(result.title, "call the plumber")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 3))
    }

    func testPriorityBangs() {
        let result = parse("renew the passport !!")
        XCTAssertEqual(result.kind, .task)
        XCTAssertEqual(result.priority, 2)
        XCTAssertEqual(result.title, "renew the passport")
    }

    // MARK: - Mentions

    func testExtractsMentions() {
        let result = parse("dentist 9am @mika")
        XCTAssertEqual(result.mentionedNames, ["mika"])
        XCTAssertEqual(result.title, "dentist")
    }

    // MARK: - Degenerate input

    func testEmptyInputIsHarmless() {
        let result = parse("   ")
        XCTAssertTrue(result.title.isEmpty)
        XCTAssertEqual(result.confidence, 0)
    }

    func testUnparseableInputStillKeepsTheWholeTitle() {
        let result = parse("asdkjh qweoiu")
        XCTAssertEqual(result.title, "asdkjh qweoiu")
        XCTAssertEqual(result.kind, .listItem)
        // Low confidence is the signal the UI uses to show the parsed fields
        // rather than saving silently.
        XCTAssertLessThan(result.confidence, 0.5)
    }

    func testALocationIsNotMistakenForATime() {
        let result = parse("pickup at 3pm at Northside School")
        XCTAssertEqual(result.startDate, Fixture.date(2026, 3, 2, 15))
        XCTAssertEqual(result.location, "Northside School")
        XCTAssertEqual(result.title, "pickup")
    }
}
