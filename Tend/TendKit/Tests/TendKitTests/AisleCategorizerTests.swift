import XCTest
@testable import TendKit

final class AisleCategorizerTests: XCTestCase {

    func testCategorisesCommonItems() {
        XCTAssertEqual(AisleCategorizer.category(for: "Milk"), .dairy)
        XCTAssertEqual(AisleCategorizer.category(for: "sourdough"), .bakery)
        XCTAssertEqual(AisleCategorizer.category(for: "Chicken thighs"), .meat)
        XCTAssertEqual(AisleCategorizer.category(for: "spinach"), .produce)
        XCTAssertEqual(AisleCategorizer.category(for: "paper towels"), .household)
        XCTAssertEqual(AisleCategorizer.category(for: "toothpaste"), .personalCare)
    }

    func testPrefersTheLongerKeyword() {
        // "sour cream" is dairy either way, but "peanut butter" must not be
        // filed under "butter" and "ice cream" must not be filed under "ice".
        XCTAssertEqual(AisleCategorizer.category(for: "peanut butter"), .pantry)
        XCTAssertEqual(AisleCategorizer.category(for: "ice cream"), .frozen)
        XCTAssertEqual(AisleCategorizer.category(for: "sour cream"), .dairy)
    }

    func testMatchesOnWordBoundariesOnly() {
        // "ham" must not catch "hamper".
        XCTAssertNotEqual(AisleCategorizer.category(for: "laundry hamper"), .meat)
    }

    func testHandlesPlurals() {
        XCTAssertEqual(AisleCategorizer.category(for: "eggs"), .dairy)
        XCTAssertEqual(AisleCategorizer.category(for: "carrots"), .produce)
    }

    func testUnknownItemsFallToOther() {
        XCTAssertEqual(AisleCategorizer.category(for: "zzzz widget"), .other)
    }

    func testIsCaseAndAccentInsensitive() {
        XCTAssertEqual(AisleCategorizer.category(for: "CRÈME"), AisleCategorizer.category(for: "creme"))
        XCTAssertEqual(AisleCategorizer.category(for: "Bananas"), .produce)
    }

    func testAislesSortInWalkingOrder() {
        XCTAssertLessThan(Aisle.produce.sortOrder, Aisle.frozen.sortOrder)
        XCTAssertLessThan(Aisle.dairy.sortOrder, Aisle.household.sortOrder)
        XCTAssertEqual(Aisle.other.sortOrder, Aisle.allCases.count - 1)
    }
}
