import Foundation

public struct DraftRecipe: Equatable, Sendable {
    public var title: String
    public var ingredients: [String]
    public var instructions: String
    public var imageURL: URL?
    public var sourceURL: URL?
    public var servings: Int?

    public init(
        title: String,
        ingredients: [String] = [],
        instructions: String = "",
        imageURL: URL? = nil,
        sourceURL: URL? = nil,
        servings: Int? = nil
    ) {
        self.title = title
        self.ingredients = ingredients
        self.instructions = instructions
        self.imageURL = imageURL
        self.sourceURL = sourceURL
        self.servings = servings
    }

    public var isUsable: Bool { !title.isEmpty && !ingredients.isEmpty }
}

public enum RecipeImportError: LocalizedError {
    case couldNotReachPage
    case noRecipeFound

    public var errorDescription: String? {
        switch self {
        case .couldNotReachPage: "Couldn't open that page."
        case .noRecipeFound: "No recipe found on that page — you can still paste it in by hand."
        }
    }
}

/// Imports a recipe from a URL by reading the page's schema.org JSON-LD, which
/// virtually every recipe site publishes for search engines.
///
/// No scraping heuristics, no third-party service, no API key: it is structured
/// data the page already declares. When a page doesn't publish any, the import
/// fails honestly and hands the user a pre-filled draft instead of guessing.
public enum RecipeImporter {

    public static func importRecipe(from url: URL, session: URLSession = .shared) async throws -> DraftRecipe {
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        // Some sites serve a stripped page to unknown agents; asking for HTML
        // as a browser would is the difference between JSON-LD and nothing.
        request.setValue("text/html,application/xhtml+xml", forHTTPHeaderField: "Accept")

        let data: Data
        do {
            (data, _) = try await session.data(for: request)
        } catch {
            throw RecipeImportError.couldNotReachPage
        }

        guard let html = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else {
            throw RecipeImportError.couldNotReachPage
        }

        guard var draft = parseJSONLD(from: html) else {
            throw RecipeImportError.noRecipeFound
        }
        draft.sourceURL = url
        if draft.title.isEmpty { draft.title = htmlTitle(from: html) ?? url.host() ?? "Recipe" }
        return draft
    }

    // MARK: - JSON-LD

    static func parseJSONLD(from html: String) -> DraftRecipe? {
        for json in jsonLDBlocks(in: html) {
            guard let data = json.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) else { continue }
            if let recipe = findRecipeObject(in: object) {
                return draft(from: recipe)
            }
        }
        return nil
    }

    static func jsonLDBlocks(in html: String) -> [String] {
        let pattern = "<script[^>]*type=[\"']application/ld\\+json[\"'][^>]*>([\\s\\S]*?)</script>"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        let nsHTML = html as NSString
        return regex
            .matches(in: html, range: NSRange(location: 0, length: nsHTML.length))
            .compactMap { match in
                guard match.numberOfRanges > 1 else { return nil }
                return nsHTML.substring(with: match.range(at: 1))
            }
    }

    /// JSON-LD arrives as an object, an array, or an `@graph` — all three are
    /// common in the wild, so all three are walked.
    static func findRecipeObject(in object: Any) -> [String: Any]? {
        if let dictionary = object as? [String: Any] {
            if isRecipe(dictionary) { return dictionary }
            if let graph = dictionary["@graph"] {
                return findRecipeObject(in: graph)
            }
        }
        if let array = object as? [Any] {
            for element in array {
                if let found = findRecipeObject(in: element) { return found }
            }
        }
        return nil
    }

    private static func isRecipe(_ dictionary: [String: Any]) -> Bool {
        let type = dictionary["@type"]
        if let string = type as? String { return string.caseInsensitiveCompare("Recipe") == .orderedSame }
        if let array = type as? [String] {
            return array.contains { $0.caseInsensitiveCompare("Recipe") == .orderedSame }
        }
        return false
    }

    static func draft(from recipe: [String: Any]) -> DraftRecipe {
        let title = (recipe["name"] as? String) ?? ""

        let ingredients = (recipe["recipeIngredient"] as? [String])
            ?? (recipe["ingredients"] as? [String])
            ?? []

        let instructions = instructionText(from: recipe["recipeInstructions"])

        var imageURL: URL?
        if let string = recipe["image"] as? String {
            imageURL = URL(string: string)
        } else if let array = recipe["image"] as? [Any], let string = array.first as? String {
            imageURL = URL(string: string)
        } else if let object = recipe["image"] as? [String: Any], let string = object["url"] as? String {
            imageURL = URL(string: string)
        }

        var servings: Int?
        if let yield = recipe["recipeYield"] as? Int {
            servings = yield
        } else if let yield = recipe["recipeYield"] as? String {
            servings = Int(yield.filter(\.isNumber))
        }

        return DraftRecipe(
            title: decodeEntities(title),
            ingredients: ingredients.map(decodeEntities),
            instructions: decodeEntities(instructions),
            imageURL: imageURL,
            servings: servings
        )
    }

    private static func instructionText(from value: Any?) -> String {
        if let string = value as? String { return stripTags(string) }
        if let array = value as? [Any] {
            let steps = array.compactMap { element -> String? in
                if let string = element as? String { return stripTags(string) }
                if let object = element as? [String: Any] {
                    if let text = object["text"] as? String { return stripTags(text) }
                    if let items = object["itemListElement"] { return instructionText(from: items) }
                }
                return nil
            }
            return steps.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
        }
        if let object = value as? [String: Any] {
            return instructionText(from: object["itemListElement"] ?? object["text"])
        }
        return ""
    }

    // MARK: - From scanned text (VisionKit hands us this)

    /// Turns OCR'd text — a cookbook page, a card, a screenshot — into a draft.
    /// Deliberately simple: the ingredient block is the run of short lines, the
    /// instructions are the prose after it.
    public static func draft(fromScannedText text: String) -> DraftRecipe {
        let lines = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        guard let title = lines.first else { return DraftRecipe(title: "Scanned recipe") }

        var ingredients: [String] = []
        var instructionLines: [String] = []
        var inInstructions = false

        for line in lines.dropFirst() {
            let lowered = line.lowercased()
            if lowered.hasPrefix("instructions") || lowered.hasPrefix("method") || lowered.hasPrefix("directions") {
                inInstructions = true
                continue
            }
            if lowered.hasPrefix("ingredients") { continue }

            if inInstructions {
                instructionLines.append(line)
            } else if looksLikeIngredient(line) {
                ingredients.append(line)
            } else {
                inInstructions = true
                instructionLines.append(line)
            }
        }

        return DraftRecipe(
            title: title,
            ingredients: ingredients,
            instructions: instructionLines.joined(separator: "\n")
        )
    }

    static func looksLikeIngredient(_ line: String) -> Bool {
        // Ingredients are short and usually start with a quantity; prose does
        // neither.
        guard line.count <= 60 else { return false }
        if line.first?.isNumber == true { return true }
        let units = ["cup", "tbsp", "tsp", "tablespoon", "teaspoon", "oz", "lb", "gram", "g ", "ml", "clove", "pinch"]
        let lowered = line.lowercased()
        return units.contains { lowered.contains($0) }
    }

    // MARK: - HTML helpers

    static func htmlTitle(from html: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: "<title[^>]*>([\\s\\S]*?)</title>", options: [.caseInsensitive]),
              let match = regex.firstMatch(in: html, range: NSRange(location: 0, length: (html as NSString).length)),
              match.numberOfRanges > 1
        else { return nil }
        return decodeEntities((html as NSString).substring(with: match.range(at: 1)))
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func stripTags(_ text: String) -> String {
        decodeEntities(
            text.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        ).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func decodeEntities(_ text: String) -> String {
        var result = text
        let entities = [
            "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'",
            "&apos;": "'", "&nbsp;": " ", "&frac12;": "½", "&frac14;": "¼", "&frac34;": "¾",
        ]
        for (entity, replacement) in entities {
            result = result.replacingOccurrences(of: entity, with: replacement)
        }
        // Numeric entities, which recipe sites use for fractions constantly.
        result = result.replacingOccurrences(
            of: "&#(\\d+);",
            with: "$1",
            options: .regularExpression
        )
        return result
    }
}
