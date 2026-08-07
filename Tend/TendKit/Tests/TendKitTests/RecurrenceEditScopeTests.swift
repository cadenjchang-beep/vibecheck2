import XCTest
@testable import TendKit

/// The "this event / this and future / all events" split, which §6 calls out as
/// required behaviour and which is the single easiest place in a calendar app
/// to quietly destroy someone's data.
final class RecurrenceEditScopeTests: XCTestCase {

    private let seriesID = UUID(uuidString: "00000000-0000-0000-0000-0000000000AA")!
    private var counter = 0

    private func nextID() -> UUID {
        counter += 1
        return UUID(uuidString: String(format: "00000000-0000-0000-0000-%012X", counter))!
    }

    override func setUp() {
        super.setUp()
        counter = 0
    }

    /// Weekly on Tuesday, starting 3 March 2026 at 17:00.
    private func weeklyMaster() -> EventSnapshot {
        EventSnapshot(
            id: seriesID,
            seriesID: seriesID,
            title: "Soccer practice",
            location: "Lincoln Park",
            startDate: Fixture.date(2026, 3, 3, 17),
            endDate: Fixture.date(2026, 3, 3, 18, 30),
            rule: RecurrenceRule(frequency: .weekly, weekdays: [.tuesday])
        )
    }

    // MARK: - This event only

    func testSingleEditDetachesOneOccurrenceAndLeavesTheRestAlone() {
        let master = weeklyMaster()
        let occurrence = Fixture.date(2026, 3, 17, 17)

        let mutation = RecurrenceEngine.apply(
            edit: EventEdit(title: "Soccer — away game", start: Fixture.date(2026, 3, 17, 19)),
            scope: .single,
            to: master,
            occurrenceStart: occurrence,
            calendar: Fixture.calendar,
            newIdentifier: nextID
        )

        XCTAssertEqual(mutation.appliedScope, .single)
        XCTAssertEqual(mutation.updatedMaster.exceptionDates, [occurrence])
        XCTAssertEqual(mutation.updatedMaster.title, "Soccer practice", "The series title must not change.")
        XCTAssertEqual(mutation.updatedMaster.startDate, master.startDate)

        XCTAssertEqual(mutation.createdEvents.count, 1)
        let detached = mutation.createdEvents[0]
        XCTAssertEqual(detached.title, "Soccer — away game")
        XCTAssertEqual(detached.startDate, Fixture.date(2026, 3, 17, 19))
        XCTAssertNil(detached.rule, "A detached occurrence carries no rule of its own.")
        XCTAssertEqual(detached.seriesID, seriesID, "It stays part of the series for grouping.")
        XCTAssertEqual(detached.detachedFromOccurrence, occurrence)
    }

    func testDetachedOccurrenceReplacesTheSlotWhenExpanded() {
        let master = weeklyMaster()
        let occurrence = Fixture.date(2026, 3, 17, 17)
        let mutation = RecurrenceEngine.apply(
            edit: EventEdit(start: Fixture.date(2026, 3, 17, 19)),
            scope: .single,
            to: master,
            occurrenceStart: occurrence,
            calendar: Fixture.calendar,
            newIdentifier: nextID
        )

        let range = Fixture.range(Fixture.date(2026, 3, 1), Fixture.date(2026, 4, 1))
        let expanded = RecurrenceEngine.occurrences(
            of: mutation.updatedMaster,
            in: range,
            calendar: Fixture.calendar
        )
        let merged = RecurrenceEngine.merge(
            occurrences: expanded,
            detached: mutation.createdEvents,
            in: range
        )

        let starts = merged.map(\.start)
        XCTAssertEqual(starts, [
            Fixture.date(2026, 3, 3, 17),
            Fixture.date(2026, 3, 10, 17),
            Fixture.date(2026, 3, 17, 19), // moved
            Fixture.date(2026, 3, 24, 17),
            Fixture.date(2026, 3, 31, 17),
        ])
        XCTAssertEqual(merged.filter(\.isDetached).count, 1)
    }

    // MARK: - This and future

    func testFutureEditSplitsTheSeriesIntoTwo() {
        let master = weeklyMaster()
        let splitPoint = Fixture.date(2026, 3, 17, 17)

        let mutation = RecurrenceEngine.apply(
            edit: EventEdit(location: "Riverside Fields", start: Fixture.date(2026, 3, 17, 18)),
            scope: .future,
            to: master,
            occurrenceStart: splitPoint,
            calendar: Fixture.calendar,
            newIdentifier: nextID
        )

        XCTAssertEqual(mutation.appliedScope, .future)

        // Head keeps the original details and stops before the split.
        let head = mutation.updatedMaster
        XCTAssertEqual(head.id, seriesID)
        XCTAssertEqual(head.location, "Lincoln Park")
        XCTAssertEqual(head.rule?.until, splitPoint.addingTimeInterval(-1))

        let headStarts = RecurrenceEngine.occurrences(
            of: head,
            in: Fixture.range(Fixture.date(2026, 3, 1), Fixture.date(2026, 5, 1)),
            calendar: Fixture.calendar
        ).map(\.start)
        XCTAssertEqual(headStarts, [Fixture.date(2026, 3, 3, 17), Fixture.date(2026, 3, 10, 17)])

        // Tail is a new series with the edit applied.
        XCTAssertEqual(mutation.createdEvents.count, 1)
        let tail = mutation.createdEvents[0]
        XCTAssertEqual(tail.location, "Riverside Fields")
        XCTAssertEqual(tail.startDate, Fixture.date(2026, 3, 17, 18))
        XCTAssertNotEqual(tail.seriesID, seriesID, "The two halves must not share a series ID.")
        XCTAssertEqual(tail.id, tail.seriesID)

        let tailStarts = RecurrenceEngine.occurrences(
            of: tail,
            in: Fixture.range(Fixture.date(2026, 3, 1), Fixture.date(2026, 4, 8)),
            calendar: Fixture.calendar
        ).map(\.start)
        XCTAssertEqual(tailStarts, [
            Fixture.date(2026, 3, 17, 18),
            Fixture.date(2026, 3, 24, 18),
            Fixture.date(2026, 3, 31, 18),
            Fixture.date(2026, 4, 7, 18),
        ])
    }

    func testFutureEditFromTheFirstOccurrenceEditsTheWholeSeries() {
        let master = weeklyMaster()
        let mutation = RecurrenceEngine.apply(
            edit: EventEdit(title: "Soccer"),
            scope: .future,
            to: master,
            occurrenceStart: master.startDate,
            calendar: Fixture.calendar,
            newIdentifier: nextID
        )

        // Splitting at the very first occurrence would leave an empty head.
        XCTAssertEqual(mutation.appliedScope, .all)
        XCTAssertTrue(mutation.createdEvents.isEmpty)
        XCTAssertEqual(mutation.updatedMaster.title, "Soccer")
    }

    func testFutureEditSplitsCountAcrossBothHalves() {
        var master = weeklyMaster()
        master.rule = RecurrenceRule(frequency: .weekly, weekdays: [.tuesday], count: 6)

        let mutation = RecurrenceEngine.apply(
            edit: EventEdit(title: "Soccer — new coach"),
            scope: .future,
            to: master,
            occurrenceStart: Fixture.date(2026, 3, 17, 17),
            calendar: Fixture.calendar,
            newIdentifier: nextID
        )

        XCTAssertEqual(mutation.updatedMaster.rule?.count, 2)
        XCTAssertEqual(mutation.createdEvents.first?.rule?.count, 4)
    }

    func testFutureEditMovesLaterDetachedCopiesToTheNewSeries() {
        let master = weeklyMaster()
        let earlyDetached = EventSnapshot(
            id: UUID(),
            seriesID: seriesID,
            title: "Soccer — early",
            startDate: Fixture.date(2026, 3, 10, 18),
            endDate: Fixture.date(2026, 3, 10, 19),
            detachedFromOccurrence: Fixture.date(2026, 3, 10, 17)
        )
        let lateDetached = EventSnapshot(
            id: UUID(),
            seriesID: seriesID,
            title: "Soccer — late",
            startDate: Fixture.date(2026, 3, 24, 18),
            endDate: Fixture.date(2026, 3, 24, 19),
            detachedFromOccurrence: Fixture.date(2026, 3, 24, 17)
        )

        let mutation = RecurrenceEngine.apply(
            edit: EventEdit(location: "Riverside Fields"),
            scope: .future,
            to: master,
            occurrenceStart: Fixture.date(2026, 3, 17, 17),
            detachedCopies: [earlyDetached, lateDetached],
            calendar: Fixture.calendar,
            newIdentifier: nextID
        )

        XCTAssertNil(mutation.reassignedSeries[earlyDetached.id], "A copy before the split stays with the head.")
        XCTAssertEqual(mutation.reassignedSeries[lateDetached.id], mutation.createdEvents.first?.seriesID)
    }

    // MARK: - All events

    func testAllEditShiftsEveryOccurrenceByTheSameDelta() {
        let master = weeklyMaster()
        // The user opened the 17 March instance and moved it an hour later.
        let mutation = RecurrenceEngine.apply(
            edit: EventEdit(start: Fixture.date(2026, 3, 17, 18)),
            scope: .all,
            to: master,
            occurrenceStart: Fixture.date(2026, 3, 17, 17),
            calendar: Fixture.calendar,
            newIdentifier: nextID
        )

        XCTAssertEqual(mutation.appliedScope, .all)
        XCTAssertTrue(mutation.createdEvents.isEmpty)
        // The series start moves by one hour, not to 17 March.
        XCTAssertEqual(mutation.updatedMaster.startDate, Fixture.date(2026, 3, 3, 18))
        XCTAssertEqual(mutation.updatedMaster.endDate, Fixture.date(2026, 3, 3, 19, 30))
    }

    func testAllEditShiftsExceptionDatesToo() {
        var master = weeklyMaster()
        master.exceptionDates = [Fixture.date(2026, 3, 10, 17)]

        let mutation = RecurrenceEngine.apply(
            edit: EventEdit(start: Fixture.date(2026, 3, 17, 18)),
            scope: .all,
            to: master,
            occurrenceStart: Fixture.date(2026, 3, 17, 17),
            calendar: Fixture.calendar,
            newIdentifier: nextID
        )

        // An exception that didn't move with the series would stop matching and
        // the skipped week would silently reappear.
        XCTAssertEqual(mutation.updatedMaster.exceptionDates, [Fixture.date(2026, 3, 10, 18)])
    }

    func testEditingANonRecurringEventIgnoresScope() {
        let oneOff = EventSnapshot(
            title: "Dentist",
            startDate: Fixture.date(2026, 3, 5, 9),
            endDate: Fixture.date(2026, 3, 5, 10)
        )
        let mutation = RecurrenceEngine.apply(
            edit: EventEdit(title: "Dentist — Mika"),
            scope: .future,
            to: oneOff,
            occurrenceStart: oneOff.startDate,
            calendar: Fixture.calendar,
            newIdentifier: nextID
        )
        XCTAssertEqual(mutation.appliedScope, .all)
        XCTAssertEqual(mutation.updatedMaster.title, "Dentist — Mika")
        XCTAssertTrue(mutation.createdEvents.isEmpty)
    }

    // MARK: - Deletes

    func testDeletingOneOccurrenceOnlyAddsAnException() {
        let master = weeklyMaster()
        let mutation = RecurrenceEngine.applyDelete(
            scope: .single,
            to: master,
            occurrenceStart: Fixture.date(2026, 3, 17, 17),
            calendar: Fixture.calendar
        )
        XCTAssertEqual(mutation.updatedMaster.exceptionDates, [Fixture.date(2026, 3, 17, 17)])
        XCTAssertTrue(mutation.deletedEventIDs.isEmpty)
    }

    func testDeletingFutureOccurrencesTruncatesTheRule() {
        let master = weeklyMaster()
        let mutation = RecurrenceEngine.applyDelete(
            scope: .future,
            to: master,
            occurrenceStart: Fixture.date(2026, 3, 17, 17),
            calendar: Fixture.calendar
        )
        let starts = RecurrenceEngine.occurrences(
            of: mutation.updatedMaster,
            in: Fixture.range(Fixture.date(2026, 3, 1), Fixture.date(2026, 5, 1)),
            calendar: Fixture.calendar
        ).map(\.start)
        XCTAssertEqual(starts, [Fixture.date(2026, 3, 3, 17), Fixture.date(2026, 3, 10, 17)])
    }

    func testDeletingAllRemovesTheMasterAndItsDetachedCopies() {
        let master = weeklyMaster()
        let detached = EventSnapshot(
            id: UUID(),
            seriesID: seriesID,
            title: "Soccer — away",
            startDate: Fixture.date(2026, 3, 24, 18),
            endDate: Fixture.date(2026, 3, 24, 19),
            detachedFromOccurrence: Fixture.date(2026, 3, 24, 17)
        )
        let mutation = RecurrenceEngine.applyDelete(
            scope: .all,
            to: master,
            occurrenceStart: Fixture.date(2026, 3, 24, 17),
            detachedCopies: [detached],
            calendar: Fixture.calendar
        )
        XCTAssertEqual(Set(mutation.deletedEventIDs), Set([master.id, detached.id]))
    }
}
