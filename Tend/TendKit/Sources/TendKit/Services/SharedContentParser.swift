import Foundation

/// What a piece of shared content wants to become.
public enum SharedDraft: Equatable, Sendable {
    case event(EventDraft)
    case listItem(text: String, listName: String, quantity: String?)
    case recipe(url: URL)
    case note(String)

    public var summary: String {
        switch self {
        case .event(let draft): draft.title
        case .listItem(let text, let listName, _): "\(text) → \(listName)"
        case .recipe(let url): url.host() ?? "Recipe"
        case .note(let text): text
        }
    }
}

public struct EventDraft: Equatable, Sendable {
    public var title: String
    public var startDate: Date?
    public var endDate: Date?
    public var isAllDay: Bool
    public var location: String?
    public var notes: String?
    public var rule: RecurrenceRule?

    public init(
        title: String,
        startDate: Date? = nil,
        endDate: Date? = nil,
        isAllDay: Bool = false,
        location: String? = nil,
        notes: String? = nil,
        rule: RecurrenceRule? = nil
    ) {
        self.title = title
        self.startDate = startDate
        self.endDate = endDate
        self.isAllDay = isAllDay
        self.location = location
        self.notes = notes
        self.rule = rule
    }
}

/// The re-entry problem from §1, attacked directly.
///
/// A school flyer in Photos, a birthday invite in Messages, an address in
/// Safari — all of it is information the household already has, and all of it
/// currently gets retyped by one person. This turns a share sheet tap into a
/// filled-in draft.
public enum SharedContentParser {

    public static func parse(
        text: String? = nil,
        url: URL? = nil,
        scannedText: String? = nil,
        referenceDate: Date = .now
    ) -> SharedDraft {
        // A recipe URL is unambiguous and has its own importer.
        if let url, looksLikeRecipe(url) {
            return .recipe(url: url)
        }

        let body = [text, scannedText]
            .compactMap { $0 }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !body.isEmpty else {
            if let url { return .note(url.absoluteString) }
            return .note("")
        }

        let detected = detect(in: body)

        // A date anywhere in the content means it is almost certainly an event
        // — invites, flyers and confirmations all lead with when.
        if let date = detected.date {
            let title = headline(from: body) ?? "New event"
            return .event(
                EventDraft(
                    title: title,
                    startDate: date,
                    endDate: detected.endDate ?? date.addingTimeInterval(3600),
                    isAllDay: detected.isAllDay,
                    location: detected.address,
                    notes: noteBody(from: body, url: url)
                )
            )
        }

        // No date: fall back to the quick-add parser, which knows how to route
        // "2 dozen eggs" to Groceries.
        let parsed = QuickAddParser.parse(body, referenceDate: referenceDate)
        switch parsed.kind {
        case .event:
            return .event(
                EventDraft(
                    title: parsed.title,
                    startDate: parsed.startDate,
                    endDate: parsed.endDate,
                    isAllDay: parsed.isAllDay,
                    location: parsed.location ?? detected.address,
                    notes: noteBody(from: body, url: url),
                    rule: parsed.rule
                )
            )
        case .listItem where body.count <= 60:
            return .listItem(
                text: parsed.title,
                listName: parsed.listName ?? TendList.groceries,
                quantity: parsed.quantity
            )
        default:
            return .note(noteBody(from: body, url: url) ?? body)
        }
    }

    // MARK: - Detection

    struct Detected {
        var date: Date?
        var endDate: Date?
        var isAllDay: Bool = false
        var address: String?
    }

    static func detect(in text: String) -> Detected {
        var result = Detected()
        let types: NSTextCheckingResult.CheckingType = [.date, .address]
        guard let detector = try? NSDataDetector(types: types.rawValue) else { return result }

        let range = NSRange(text.startIndex..., in: text)
        for match in detector.matches(in: text, options: [], range: range) {
            if match.resultType == .date, result.date == nil {
                result.date = match.date
                if match.duration > 0 {
                    result.endDate = match.date?.addingTimeInterval(match.duration)
                }
                let components = Calendar.current.dateComponents([.hour, .minute], from: match.date ?? .now)
                result.isAllDay = components.hour == 0 && components.minute == 0
            }
            if match.resultType == .address, result.address == nil {
                result.address = formatted(address: match.addressComponents)
            }
        }
        return result
    }

    private static func formatted(address components: [NSTextCheckingKey: String]?) -> String? {
        guard let components else { return nil }
        let ordered: [NSTextCheckingKey] = [.name, .street, .city, .state, .zip]
        let parts = ordered.compactMap { components[$0] }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    /// The first line that reads like a title: short, not a URL, not a date.
    static func headline(from text: String) -> String? {
        let lines = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        for line in lines {
            guard line.count <= 70,
                  !line.lowercased().hasPrefix("http"),
                  line.rangeOfCharacter(from: .letters) != nil
            else { continue }
            return line
        }
        return lines.first.map { String($0.prefix(70)) }
    }

    static func noteBody(from text: String, url: URL?) -> String? {
        var parts: [String] = []
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { parts.append(trimmed) }
        if let url { parts.append(url.absoluteString) }
        return parts.isEmpty ? nil : parts.joined(separator: "\n\n")
    }

    static func looksLikeRecipe(_ url: URL) -> Bool {
        let path = url.path.lowercased()
        let host = url.host()?.lowercased() ?? ""
        let markers = ["recipe", "recipes", "cooking", "kitchn", "allrecipes", "seriouseats", "bonappetit", "nytimes.com/cooking"]
        return markers.contains { path.contains($0) || host.contains($0) }
    }
}
