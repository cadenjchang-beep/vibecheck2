import XCTest

/// The §9 critical path: create a household → add an event → add an item →
/// check it off. The cross-device half of the flow (checking off on a second
/// simulator and watching it arrive) is driven by
/// `Scripts/two-device-sync-check.sh`, because XCTest cannot run two simulators
/// inside one test process.
final class CriticalPathUITests: XCTestCase {

    private var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
        // A clean local store per run: sync correctness is checked by the
        // two-device script, not by leaking state between UI tests.
        app.launchArguments = ["-TendUITesting", "-TendResetStore"]
        app.launch()
    }

    func testCreateHouseholdAddEventAndCheckOffAnItem() {
        createHouseholdIfNeeded()

        // -- Add an event via quick add ------------------------------------
        app.tabBars.buttons["Pulse"].tap()
        app.buttons["Quick add"].tap()

        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText("dentist thursday 9:30am")

        // The parse is shown before saving; that it appears at all is part of
        // the contract.
        XCTAssertTrue(app.staticTexts["dentist"].waitForExistence(timeout: 3))
        app.buttons["Add"].tap()

        app.tabBars.buttons["Calendar"].tap()
        XCTAssertTrue(app.staticTexts["dentist"].waitForExistence(timeout: 5))

        // -- Add a list item, keeping focus --------------------------------
        app.tabBars.buttons["Lists"].tap()
        app.staticTexts["Groceries"].tap()

        let addField = app.textFields["Add to Groceries"]
        XCTAssertTrue(addField.waitForExistence(timeout: 5))
        addField.tap()
        addField.typeText("oat milk\n")
        // The field must still be focused so a second item needs no extra tap.
        addField.typeText("sourdough\n")

        XCTAssertTrue(app.staticTexts["oat milk"].exists)
        XCTAssertTrue(app.staticTexts["sourdough"].exists)

        // -- Check one off --------------------------------------------------
        let item = app.buttons["oat milk"]
        XCTAssertTrue(item.waitForExistence(timeout: 3))
        item.tap()

        // It moves to Done rather than disappearing — a checked item that
        // vanishes reads as data loss.
        XCTAssertTrue(app.staticTexts["Done"].waitForExistence(timeout: 3))
    }

    func testEditingARecurringEventAsksForScope() {
        createHouseholdIfNeeded()

        app.tabBars.buttons["Pulse"].tap()
        app.buttons["Quick add"].tap()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText("swim every tue 6pm")
        app.buttons["Add"].tap()

        app.tabBars.buttons["Calendar"].tap()
        app.staticTexts["swim"].firstMatch.tap()
        app.buttons["Edit"].tap()
        app.buttons["Save"].tap()

        // The three-way prompt from §6 must appear for a repeating event.
        XCTAssertTrue(app.buttons["This event only"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["This and all future events"].exists)
        XCTAssertTrue(app.buttons["All events in the series"].exists)
        app.buttons["This event only"].tap()
    }

    func testEveryTabHasAnEmptyStateRatherThanABlankScreen() {
        createHouseholdIfNeeded()
        for tab in ["Calendar", "Lists", "Tasks", "Meals"] {
            app.tabBars.buttons[tab].tap()
            XCTAssertFalse(
                app.staticTexts.count == 0,
                "\(tab) showed nothing at all — every screen needs a designed empty state."
            )
        }
    }

    // MARK: - Helpers

    private func createHouseholdIfNeeded() {
        guard app.buttons["Show me"].waitForExistence(timeout: 5) else { return }
        app.buttons["Show me"].tap()
        app.buttons["Set up our household"].tap()

        let householdField = app.textFields["Household name"]
        XCTAssertTrue(householdField.waitForExistence(timeout: 3))
        householdField.tap()
        householdField.typeText("Test household")

        let nameField = app.textFields["Your name"]
        nameField.tap()
        nameField.typeText("Sam")

        app.buttons["Continue"].tap()
        app.buttons["I'll do this later"].tap()
    }
}
