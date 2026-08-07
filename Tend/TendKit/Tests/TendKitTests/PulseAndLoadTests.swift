import XCTest
@testable import TendKit

final class PulseGeneratorTests: XCTestCase {

    private let sam = UUID()
    private let alex = UUID()

    /// Wednesday 4 March 2026, 07:00.
    private let now = Fixture.date(2026, 3, 4, 7)

    private var members: [PulseMemberInput] {
        [PulseMemberInput(id: sam, name: "Sam"), PulseMemberInput(id: alex, name: "Alex")]
    }

    func testMorningPulseLeadsWithTheNextEvent() {
        let input = PulseInput(
            now: now,
            members: members,
            events: [
                PulseEventInput(id: UUID(), title: "Dentist", start: Fixture.date(2026, 3, 4, 9, 30), end: Fixture.date(2026, 3, 4, 10)),
                PulseEventInput(id: UUID(), title: "Soccer", start: Fixture.date(2026, 3, 4, 17), end: Fixture.date(2026, 3, 4, 18)),
            ],
            tasks: [
                PulseTaskInput(id: UUID(), title: "Call the plumber", dueDate: Fixture.date(2026, 3, 4, 12), isComplete: false),
            ],
            listItems: [
                PulseListItemInput(id: UUID(), listName: "Groceries", text: "Milk", isChecked: false),
                PulseListItemInput(id: UUID(), listName: "Groceries", text: "Eggs", isChecked: false),
            ]
        )

        let snapshot = PulseGenerator.generate(kind: .morning, input: input, calendar: Fixture.calendar)

        XCTAssertEqual(snapshot.kind, .morning)
        XCTAssertTrue(snapshot.lines[0].text.contains("Dentist"))
        XCTAssertTrue(snapshot.lines[0].text.contains("then 1 more"))
        XCTAssertTrue(snapshot.lines.contains { $0.text.contains("1 task due today") })
        XCTAssertTrue(snapshot.lines.contains { $0.text == "2 on Groceries" })
    }

    func testMorningPulseCallsOutCarriedOverTasks() {
        let input = PulseInput(
            now: now,
            members: members,
            tasks: [
                PulseTaskInput(id: UUID(), title: "Overdue thing", dueDate: Fixture.date(2026, 3, 1, 12), isComplete: false),
                PulseTaskInput(id: UUID(), title: "Today thing", dueDate: Fixture.date(2026, 3, 4, 12), isComplete: false),
            ]
        )
        let snapshot = PulseGenerator.generate(kind: .morning, input: input, calendar: Fixture.calendar)
        XCTAssertTrue(snapshot.lines.contains { $0.text == "2 tasks due — 1 carried over" })
    }

    func testAnEmptyDayGetsItsOwnHeadlineNotABlankScreen() {
        let snapshot = PulseGenerator.generate(
            kind: .morning,
            input: PulseInput(now: now, members: members),
            calendar: Fixture.calendar
        )
        XCTAssertEqual(snapshot.headline, "A clear day")
        XCTAssertTrue(snapshot.isEmpty)
    }

    func testWeeklyPulseCountsTripsByDistinctDays() {
        // Four items checked off across two days is two trips, not four.
        let items = [
            PulseListItemInput(id: UUID(), listName: "Groceries", text: "Milk", isChecked: true, completedAt: Fixture.date(2026, 3, 2, 18), completedBy: sam),
            PulseListItemInput(id: UUID(), listName: "Groceries", text: "Eggs", isChecked: true, completedAt: Fixture.date(2026, 3, 2, 18, 5), completedBy: sam),
            PulseListItemInput(id: UUID(), listName: "Groceries", text: "Rice", isChecked: true, completedAt: Fixture.date(2026, 3, 4, 10), completedBy: alex),
            PulseListItemInput(id: UUID(), listName: "Groceries", text: "Kale", isChecked: true, completedAt: Fixture.date(2026, 3, 4, 10, 2), completedBy: alex),
        ]
        let input = PulseInput(now: now, members: members, listItems: items)
        let snapshot = PulseGenerator.generate(kind: .weekly, input: input, calendar: Fixture.calendar)

        XCTAssertTrue(
            snapshot.lines.contains { $0.text == "Groceries cleared 4 items across 2 trips" },
            "Got: \(snapshot.lines.map(\.text))"
        )
    }

    func testWeeklyPulseFlagsAnUnplannedWeekAhead() {
        let snapshot = PulseGenerator.generate(
            kind: .weekly,
            input: PulseInput(now: now, members: members),
            calendar: Fixture.calendar
        )
        XCTAssertTrue(snapshot.lines.contains { $0.text == "No meals planned yet for next week" })
    }

    func testCompactSummaryStaysShortEnoughForANotification() {
        let input = PulseInput(
            now: now,
            members: members,
            events: [PulseEventInput(id: UUID(), title: "Dentist", start: Fixture.date(2026, 3, 4, 9), end: Fixture.date(2026, 3, 4, 10))],
            tasks: [PulseTaskInput(id: UUID(), title: "Plumber", dueDate: Fixture.date(2026, 3, 4, 12), isComplete: false)],
            listItems: [PulseListItemInput(id: UUID(), listName: "Groceries", text: "Milk", isChecked: false)]
        )
        let snapshot = PulseGenerator.generate(kind: .morning, input: input, calendar: Fixture.calendar)
        XCTAssertEqual(snapshot.compactSummary.components(separatedBy: " · ").count, 3)
    }

    func testEveryLineHasSomewhereToGo() {
        // §2: nothing deep-links to "open the app".
        let input = PulseInput(
            now: now,
            members: members,
            events: [PulseEventInput(id: UUID(), title: "Dentist", start: Fixture.date(2026, 3, 4, 9), end: Fixture.date(2026, 3, 4, 10))],
            tasks: [PulseTaskInput(id: UUID(), title: "Plumber", dueDate: Fixture.date(2026, 3, 4, 12), isComplete: false)],
            listItems: [PulseListItemInput(id: UUID(), listName: "Groceries", text: "Milk", isChecked: false)]
        )
        let snapshot = PulseGenerator.generate(kind: .morning, input: input, calendar: Fixture.calendar)
        for line in snapshot.lines {
            XCTAssertNotNil(DeepLink(url: line.destination.url), "\(line.text) has an unroutable destination")
        }
    }
}

final class LoadCalculatorTests: XCTestCase {

    private let sam = UUID()
    private let alex = UUID()
    private let now = Fixture.date(2026, 3, 4, 7)

    private var window: LoadWindow { LoadWindow.week(containing: now, calendar: Fixture.calendar) }

    private var members: [PulseMemberInput] {
        [PulseMemberInput(id: sam, name: "Sam"), PulseMemberInput(id: alex, name: "Alex")]
    }

    private func completedTask(by member: UUID, on date: Date) -> PulseTaskInput {
        PulseTaskInput(id: UUID(), title: "Thing", dueDate: date, isComplete: true, completedAt: date, completedBy: member)
    }

    private func completedItem(by member: UUID, on date: Date) -> PulseListItemInput {
        PulseListItemInput(id: UUID(), listName: "Groceries", text: "Milk", isChecked: true, completedAt: date, completedBy: member)
    }

    func testCountsAreAttributedToWhoActuallyDidTheThing() {
        let summary = LoadCalculator.summarize(
            window: window,
            members: members,
            tasks: [completedTask(by: sam, on: Fixture.date(2026, 3, 2, 10))],
            listItems: [completedItem(by: alex, on: Fixture.date(2026, 3, 3, 10))]
        )

        XCTAssertEqual(summary.householdTotal, 2)
        XCTAssertEqual(summary.shares.first { $0.memberID == sam }?.count(.tasks), 1)
        XCTAssertEqual(summary.shares.first { $0.memberID == alex }?.count(.lists), 1)
    }

    func testWorkOutsideTheWindowIsNotCounted() {
        let summary = LoadCalculator.summarize(
            window: window,
            members: members,
            tasks: [completedTask(by: sam, on: Fixture.date(2026, 2, 20, 10))],
            listItems: []
        )
        XCTAssertTrue(summary.isEmpty)
    }

    /// The design rule that keeps this from becoming a scoreboard.
    func testSharesKeepHouseholdOrderRatherThanRanking() {
        let summary = LoadCalculator.summarize(
            window: window,
            members: members,
            tasks: (0..<5).map { completedTask(by: alex, on: Fixture.date(2026, 3, 2, 10 + $0)) },
            listItems: [completedItem(by: sam, on: Fixture.date(2026, 3, 3, 10))]
        )
        // Alex did five times as much; Sam is still listed first, because the
        // household's own order is the order.
        XCTAssertEqual(summary.shares.map(\.name), ["Sam", "Alex"])
    }

    func testNoObservationWhenThereIsBarelyAnyData() {
        let summary = LoadCalculator.summarize(
            window: window,
            members: members,
            tasks: [completedTask(by: sam, on: Fixture.date(2026, 3, 2, 10))],
            listItems: []
        )
        XCTAssertNil(summary.observation, "One task is not a pattern worth narrating.")
    }

    func testObservationIsDescriptiveNotPrescriptive() {
        let summary = LoadCalculator.summarize(
            window: window,
            members: members,
            tasks: (0..<9).map { completedTask(by: sam, on: Fixture.date(2026, 3, 2, 8 + $0)) },
            listItems: [completedItem(by: alex, on: Fixture.date(2026, 3, 3, 10))]
        )
        let observation = try? XCTUnwrap(summary.observation)
        guard let observation else { return XCTFail("Expected an observation") }

        XCTAssertTrue(observation.contains("Sam"))
        for word in ["should", "needs to", "more than", "less than", "winner", "%"] {
            XCTAssertFalse(observation.lowercased().contains(word), "Observation must not say '\(word)': \(observation)")
        }
    }

    func testBalancedWeekIsDescribedAsSuch() {
        let summary = LoadCalculator.summarize(
            window: window,
            members: members,
            tasks: (0..<5).map { completedTask(by: sam, on: Fixture.date(2026, 3, 2, 8 + $0)) },
            listItems: (0..<5).map { completedItem(by: alex, on: Fixture.date(2026, 3, 3, 8 + $0)) }
        )
        XCTAssertEqual(summary.observation, "This one was spread fairly evenly.")
    }

    func testTheCaveatIsAlwaysPresent() {
        let summary = LoadCalculator.summarize(window: window, members: members, tasks: [], listItems: [])
        XCTAssertEqual(summary.caveat, LoadCalculator.standardCaveat)
    }
}

final class DeepLinkTests: XCTestCase {

    func testEveryCaseRoundTrips() {
        let id = UUID()
        let date = Fixture.date(2026, 3, 4, 9)
        let links: [DeepLink] = [
            .pulse(.weekly),
            .pulse(nil),
            .load,
            .calendar(date: date),
            .event(id: id, occurrence: date),
            .list(name: "Groceries"),
            .listItem(id: id, listName: "Groceries"),
            .task(id: id),
            .tasks,
            .meals(week: date),
            .recipe(id: id),
            .quickAdd(text: "milk"),
            .shoppingTrip(listName: "Groceries"),
            .settings,
            .household,
        ]

        for link in links {
            XCTAssertEqual(DeepLink(url: link.url), link, "Round trip failed for \(link.url)")
        }
    }

    func testRejectsForeignSchemes() {
        XCTAssertNil(DeepLink(url: URL(string: "https://example.com/event/123")!))
        XCTAssertNil(DeepLink(url: URL(string: "tend://nonsense")!))
    }

    func testRejectsMalformedIdentifiers() {
        XCTAssertNil(DeepLink(url: URL(string: "tend://event/not-a-uuid")!))
    }

    func testLinksLandOnTheRightTab() {
        XCTAssertEqual(DeepLink.event(id: UUID(), occurrence: nil).tab, .calendar)
        XCTAssertEqual(DeepLink.listItem(id: UUID(), listName: nil).tab, .lists)
        XCTAssertEqual(DeepLink.load.tab, .pulse)
    }
}
