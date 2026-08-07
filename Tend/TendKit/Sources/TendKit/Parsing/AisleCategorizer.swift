import Foundation

/// Grocery aisles, in the order a person actually walks a store: fresh
/// perimeter first, freezers last. Sorting a list by this order is the whole
/// point of categorising it.
public enum Aisle: String, CaseIterable, Codable, Sendable, Identifiable {
    case produce = "Produce"
    case bakery = "Bakery"
    case meat = "Meat & Seafood"
    case dairy = "Dairy & Eggs"
    case pantry = "Pantry"
    case snacks = "Snacks"
    case beverages = "Beverages"
    case frozen = "Frozen"
    case household = "Household"
    case personalCare = "Personal Care"
    case baby = "Baby & Kids"
    case pet = "Pet"
    case other = "Other"

    public var id: String { rawValue }

    public var systemImage: String {
        switch self {
        case .produce: "carrot"
        case .bakery: "birthday.cake"
        case .meat: "fish"
        case .dairy: "waterbottle"
        case .pantry: "shippingbox"
        case .snacks: "popcorn"
        case .beverages: "cup.and.saucer"
        case .frozen: "snowflake"
        case .household: "house"
        case .personalCare: "drop"
        case .baby: "figure.and.child.holdinghands"
        case .pet: "pawprint"
        case .other: "questionmark.circle"
        }
    }

    public var sortOrder: Int { Aisle.allCases.firstIndex(of: self) ?? 99 }
}

/// A curated keyword map — no ML, no network, no model download, works offline
/// on the first launch, and every mistake is a one-line fix rather than a
/// retraining run.
public enum AisleCategorizer {

    public static func category(for text: String) -> Aisle {
        let normalized = normalize(text)
        guard !normalized.isEmpty else { return .other }

        // Whole-string match first: "ice cream" must not be caught by "ice".
        if let exact = lookup[normalized] { return exact }

        // Then longest keyword contained in the text, so "sour cream" beats
        // "cream" and "peanut butter" beats "butter".
        let words = normalized.split(separator: " ").map(String.init)
        var best: (aisle: Aisle, length: Int)?
        for (keyword, aisle) in lookup {
            guard normalized.contains(keyword) else { continue }
            // Require the match to sit on a word boundary so "ham" does not
            // categorise "hamper".
            guard matchesOnWordBoundary(keyword: keyword, in: normalized, words: words) else { continue }
            if best == nil || keyword.count > best!.length {
                best = (aisle, keyword.count)
            }
        }
        return best?.aisle ?? .other
    }

    /// Convenience for the list UI: category plus a stable sort key.
    public static func sortKey(for text: String) -> (Int, String) {
        (category(for: text).sortOrder, normalize(text))
    }

    static func normalize(_ text: String) -> String {
        text
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .replacingOccurrences(of: "[^a-z0-9 ]", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    private static func matchesOnWordBoundary(keyword: String, in text: String, words: [String]) -> Bool {
        if keyword.contains(" ") { return text.contains(keyword) }
        // Allow a trailing plural "s" so "eggs" hits "egg".
        return words.contains { $0 == keyword || ($0.hasSuffix("s") && String($0.dropLast()) == keyword) }
    }

    // MARK: - The map

    static let lookup: [String: Aisle] = {
        var map: [String: Aisle] = [:]
        func add(_ aisle: Aisle, _ keywords: [String]) {
            for keyword in keywords { map[keyword] = aisle }
        }

        add(.produce, [
            "apple", "avocado", "banana", "basil", "bell pepper", "berries", "blueberry",
            "broccoli", "cabbage", "carrot", "cauliflower", "celery", "cilantro", "cucumber",
            "garlic", "ginger", "grape", "green bean", "kale", "lemon", "lettuce", "lime",
            "mango", "mushroom", "onion", "orange", "parsley", "peach", "pear", "pepper",
            "pineapple", "potato", "raspberry", "salad", "scallion", "spinach", "strawberry",
            "sweet potato", "tomato", "zucchini", "herbs", "produce",
        ])
        add(.bakery, [
            "bagel", "baguette", "bread", "bun", "croissant", "donut", "english muffin",
            "muffin", "pita", "roll", "sourdough", "tortilla", "cake", "pastry",
        ])
        add(.meat, [
            "bacon", "beef", "chicken", "chicken breast", "chicken thigh", "cod", "ground beef",
            "ground turkey", "ham", "lamb", "pork", "prosciutto", "salmon", "sausage", "shrimp",
            "steak", "tilapia", "tuna", "turkey", "meat", "seafood",
        ])
        add(.dairy, [
            "butter", "cheddar", "cheese", "cottage cheese", "cream", "cream cheese", "egg",
            "feta", "greek yogurt", "half and half", "heavy cream", "milk", "mozzarella",
            "oat milk", "parmesan", "sour cream", "yogurt", "almond milk", "creamer",
        ])
        add(.pantry, [
            "baking powder", "baking soda", "beans", "black beans", "broth", "cereal",
            "chickpeas", "cocoa", "coconut milk", "flour", "honey", "hot sauce", "jam",
            "ketchup", "lentils", "maple syrup", "mayo", "mayonnaise", "mustard", "noodles",
            "oats", "oil", "olive oil", "pasta", "peanut butter", "quinoa", "rice", "salsa",
            "salt", "soy sauce", "spices", "stock", "sugar", "tomato sauce", "tuna can",
            "vanilla", "vinegar", "canned tomatoes", "soup", "syrup",
        ])
        add(.snacks, [
            "chips", "chocolate", "cookies", "crackers", "granola bar", "nuts", "popcorn",
            "pretzels", "trail mix", "candy", "almonds", "snack",
        ])
        add(.beverages, [
            "beer", "coffee", "juice", "kombucha", "lacroix", "lemonade", "seltzer", "soda",
            "sparkling water", "tea", "water", "wine", "orange juice",
        ])
        add(.frozen, [
            "frozen", "frozen peas", "frozen pizza", "ice", "ice cream", "popsicles",
            "frozen berries", "waffles", "frozen vegetables",
        ])
        add(.household, [
            "aluminum foil", "batteries", "bleach", "dish soap", "dishwasher pods", "detergent",
            "trash bags", "napkins", "paper towels", "parchment paper", "plastic wrap",
            "sponges", "ziploc", "light bulb", "laundry", "cleaner", "candles",
        ])
        add(.personalCare, [
            "body wash", "conditioner", "deodorant", "floss", "razors", "shampoo", "soap",
            "sunscreen", "toilet paper", "toothpaste", "tissues", "vitamins", "advil",
            "ibuprofen", "band aids", "lotion",
        ])
        add(.baby, [
            "baby food", "baby wipes", "diapers", "formula", "pull ups", "sippy cup",
        ])
        add(.pet, [
            "cat food", "cat litter", "dog food", "dog treats", "litter", "pet food",
        ])
        return map
    }()
}
