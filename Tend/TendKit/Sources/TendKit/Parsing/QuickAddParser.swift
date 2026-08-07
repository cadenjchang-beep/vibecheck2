import Foundation

/// What one line of typed text turned into.
public struct QuickAddResult: Equatable, Sendable {

    public enum Kind: String, Equatable, Sendable {
        case event
        case task
        case listItem
    }

    public var kind: Kind
    public var title: String
    public var startDate: Date?
    public var endDate: Date?
    public var isAllDay: Bool
    public var rule: RecurrenceRule?
    public var location: String?
    public var listName: String?
    public var quantity: String?
    public var priority: Int
    /// Names mentioned with `@`, resolved to members by the caller (the parser
    /// has no store access on purpose).
    public var mentionedNames: [String]
    /// Rough 0–1 sense of how much of the input we understood. The UI uses it
    /// to decide between "just save it" and "show the parsed fields first".
    public var confidence: Double

    public init(
        kind: Kind,
        title: String,
        startDate: Date? = nil,
        endDate: Date? = nil,
        isAllDay: Bool = false,
        rule: RecurrenceRule? = nil,
        location: String? = nil,
        listName: String? = nil,
        quantity: String? = nil,
        priority: Int = 0,
        mentionedNames: [String] = [],
        confidence: Double = 0
    ) {
        self.kind = kind
        self.title = title
        self.startDate = startDate
        self.endDate = endDate
        self.isAllDay = isAllDay
        self.rule = rule
        self.location = location
        self.listName = listName
        self.quantity = quantity
        self.priority = priority
        self.mentionedNames = mentionedNames
        self.confidence = confidence
    }
}

/// Turns "soccer practice every Tue 5pm at Lincoln Park" into a structured
/// recurring event, with no form to fill in.
///
/// The design constraint from §1 is capture friction: anything that makes the
/// user stop and correct the parse is worse than not parsing at all. So the
/// parser is conservative — it only claims a field when the pattern is
/// unambiguous, and it reports `confidence` so the UI can show its work.
///
/// `NSDataDetector` handles the dates it is good at (absolute dates, "next
/// Friday"); the hand-written passes handle the things it is bad at
/// (recurrence, durations, "at <place>" vs "at 5pm", list routing).
///
/// Locale note: the hand-written vocabulary below is English. Other locales
/// fall through to `NSDataDetector`, which is localised, so parsing degrades to
/// dates-only rather than breaking.
public enum QuickAddParser {

    public static func parse(
        _ input: String,
        referenceDate: Date = .now,
        calendar: Calendar = .current
    ) -> QuickAddResult {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            return QuickAddResult(kind: .listItem, title: "", confidence: 0)
        }

        var signals = 0
        var mentions: [String] = []
        var priority = 0
        var listName: String?
        var rule: RecurrenceRule?
        var location: String?
        var explicitTask = false

        // 1. Mentions — "@sam". Stripped first so a name can never be mistaken
        //    for a place or a weekday.
        (text, mentions) = extractMentions(from: text)
        if !mentions.isEmpty { signals += 1 }

        // 2. Priority — trailing "!", "!!", "!!!".
        (text, priority) = extractPriority(from: text)
        if priority > 0 { signals += 1; explicitTask = true }

        // 3. List routing — "#groceries" or "… to the grocery list".
        (text, listName) = extractListTarget(from: text)
        if listName != nil { signals += 1 }

        // 4. Recurrence.
        (text, rule) = extractRecurrence(from: text, calendar: calendar)
        if rule != nil { signals += 1 }

        // 5. Times and dates. Duration and ranges resolve before single times,
        //    so "5-7pm" is never read as "5" followed by garbage.
        var timing = extractTiming(from: text, referenceDate: referenceDate, calendar: calendar)
        text = timing.remainder
        if timing.start != nil { signals += 1 }

        // 6. Location — after timing, so "at 5pm" has already been consumed and
        //    only a real "at <place>" is left.
        (text, location) = extractLocation(from: text)
        if location != nil { signals += 1 }

        // 7. Task vocabulary.
        if containsTaskVerb(text) { explicitTask = true }
        text = stripTaskVerbs(text)

        let title = tidy(text)

        // If a recurrence rule was found without any time, anchor it to the
        // rule's own weekday rather than leaving a series with no start.
        if let rule, timing.start == nil {
            timing.start = anchorDate(for: rule, referenceDate: referenceDate, calendar: calendar)
            timing.isAllDay = true
        }

        // "every Tue 5pm" typed on a Monday means next Tuesday at 5, not today
        // at 5. A weekly rule that names its days must start on one of them, or
        // the first occurrence contradicts the rule that produced it.
        if let rule, !rule.weekdays.isEmpty, let start = timing.start {
            let aligned = align(start, to: rule.weekdays, calendar: calendar)
            if aligned != start {
                let shift = aligned.timeIntervalSince(start)
                timing.start = aligned
                timing.end = timing.end?.addingTimeInterval(shift)
            }
        }

        let kind: QuickAddResult.Kind
        if listName != nil {
            kind = .listItem
        } else if timing.start != nil && !explicitTask {
            kind = .event
        } else if explicitTask || timing.start != nil {
            kind = .task
        } else {
            kind = .listItem
        }

        var quantity: String?
        var finalTitle = title
        if kind == .listItem {
            (finalTitle, quantity) = splitQuantity(from: title)
        }

        return QuickAddResult(
            kind: kind,
            title: finalTitle,
            startDate: timing.start,
            endDate: timing.end ?? timing.start.map { $0.addingTimeInterval(timing.isAllDay ? 0 : 3600) },
            isAllDay: timing.isAllDay,
            rule: rule,
            location: location,
            listName: listName,
            quantity: quantity,
            priority: priority,
            mentionedNames: mentions,
            confidence: confidence(signals: signals, title: finalTitle, original: input)
        )
    }

    // MARK: - Mentions

    private static func extractMentions(from text: String) -> (String, [String]) {
        var names: [String] = []
        let stripped = replacingMatches(of: "@([\\p{L}][\\p{L}'\\-]*)", in: text) { groups in
            if let name = groups[1] { names.append(name) }
            return ""
        }
        return (stripped, names)
    }

    // MARK: - Priority

    private static func extractPriority(from text: String) -> (String, Int) {
        var level = 0
        let stripped = replacingMatches(of: "(?:\\s|^)(!{1,3})(?=\\s|$)", in: text) { groups in
            level = max(level, min(groups[1]?.count ?? 0, 3))
            return " "
        }
        return (stripped, level)
    }

    // MARK: - List routing

    private static func extractListTarget(from text: String) -> (String, String?) {
        var name: String?

        // "#groceries"
        var stripped = replacingMatches(of: "#([\\p{L}][\\p{L}0-9_\\-]*)", in: text) { groups in
            if name == nil, let raw = groups[1] { name = normalizeListName(raw) }
            return ""
        }
        if name != nil { return (stripped, name) }

        // "… to the grocery list" / "… to groceries"
        stripped = replacingMatches(
            of: "\\bto\\s+(?:the\\s+|my\\s+|our\\s+)?([\\p{L} ]{2,30}?)\\s+list\\b",
            in: stripped
        ) { groups in
            if name == nil, let raw = groups[1] { name = normalizeListName(raw) }
            return ""
        }
        return (stripped, name)
    }

    static func normalizeListName(_ raw: String) -> String {
        let cleaned = raw.trimmingCharacters(in: .whitespaces).lowercased()
        // "grocery", "groceries" and "shopping" all mean the same list to a
        // person, and a household that ends up with three of them has been let
        // down by the app.
        switch cleaned {
        case "grocery", "groceries", "shopping", "food", "supermarket":
            return TendList.groceries
        case "household", "house", "home", "chores":
            return TendList.household
        default:
            return cleaned.capitalized
        }
    }

    // MARK: - Recurrence

    private static func extractRecurrence(
        from text: String,
        calendar: Calendar
    ) -> (String, RecurrenceRule?) {
        var rule: RecurrenceRule?

        // "every other Tuesday", "every 2 weeks", "every Tue and Thu",
        // "every weekday", "every day"
        var stripped = replacingMatches(
            of: "\\bevery\\s+(other\\s+|\\d+\\s+)?([\\p{L}]+(?:\\s*(?:,|and|&)\\s*[\\p{L}]+)*)",
            in: text,
            options: [.caseInsensitive]
        ) { groups in
            guard rule == nil else { return " " }
            let interval: Int = {
                guard let raw = groups[1]?.trimmingCharacters(in: .whitespaces).lowercased() else { return 1 }
                if raw == "other" { return 2 }
                return Int(raw) ?? 1
            }()
            guard let unit = groups[2] else { return " " }
            rule = recurrence(fromUnitPhrase: unit, interval: interval)
            return rule == nil ? " every \(groups[1] ?? "")\(unit) " : " "
        }
        if rule != nil { return (stripped, rule) }

        // Bare adverbs: "daily", "weekly on Tue", "monthly", "yearly".
        stripped = replacingMatches(
            of: "\\b(daily|weekly|biweekly|monthly|yearly|annually)\\b",
            in: stripped,
            options: [.caseInsensitive]
        ) { groups in
            guard rule == nil, let word = groups[1]?.lowercased() else { return " " }
            switch word {
            case "daily": rule = RecurrenceRule(frequency: .daily)
            case "weekly": rule = RecurrenceRule(frequency: .weekly)
            case "biweekly": rule = RecurrenceRule(frequency: .weekly, interval: 2)
            case "monthly": rule = RecurrenceRule(frequency: .monthly)
            default: rule = RecurrenceRule(frequency: .yearly)
            }
            return " "
        }
        return (stripped, rule)
    }

    private static func recurrence(fromUnitPhrase phrase: String, interval: Int) -> RecurrenceRule? {
        let words = phrase
            .lowercased()
            .replacingOccurrences(of: "&", with: ",")
            .replacingOccurrences(of: " and ", with: ",")
            .split(whereSeparator: { $0 == "," || $0 == " " })
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        // "every weekday"
        if words == ["weekday"] || words == ["weekdays"] {
            return RecurrenceRule(
                frequency: .weekly,
                interval: interval,
                weekdays: [.monday, .tuesday, .wednesday, .thursday, .friday]
            )
        }
        if words == ["weekend"] || words == ["weekends"] {
            return RecurrenceRule(frequency: .weekly, interval: interval, weekdays: [.saturday, .sunday])
        }

        let weekdays = words.compactMap { weekday(named: $0) }
        if !weekdays.isEmpty, weekdays.count == words.count {
            return RecurrenceRule(frequency: .weekly, interval: interval, weekdays: weekdays)
        }

        guard let first = words.first else { return nil }
        switch first {
        case "day", "days": return RecurrenceRule(frequency: .daily, interval: interval)
        case "week", "weeks": return RecurrenceRule(frequency: .weekly, interval: interval)
        case "month", "months": return RecurrenceRule(frequency: .monthly, interval: interval)
        case "year", "years": return RecurrenceRule(frequency: .yearly, interval: interval)
        default: return nil
        }
    }

    static func weekday(named raw: String) -> RecurrenceRule.Weekday? {
        switch raw.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: ".")) {
        case "sun", "sunday", "suns", "sundays": return .sunday
        case "mon", "monday", "mons", "mondays": return .monday
        case "tue", "tues", "tuesday", "tuesdays": return .tuesday
        case "wed", "weds", "wednesday", "wednesdays": return .wednesday
        case "thu", "thur", "thurs", "thursday", "thursdays": return .thursday
        case "fri", "friday", "fridays": return .friday
        case "sat", "saturday", "saturdays": return .saturday
        default: return nil
        }
    }

    // MARK: - Timing

    struct Timing {
        var remainder: String
        var start: Date?
        var end: Date?
        var isAllDay: Bool
    }

    private static func extractTiming(
        from text: String,
        referenceDate: Date,
        calendar: Calendar
    ) -> Timing {
        var working = text
        var day: Date?
        var startTime: DateComponents?
        var endTime: DateComponents?
        var isAllDay = false
        var duration: TimeInterval?
        /// A time a word merely suggests ("tonight"), used only when no
        /// explicit time is typed. Keeps "tonight at 9pm" at 9pm.
        var impliedTime: DateComponents?

        // -- Day words -------------------------------------------------------
        working = replacingMatches(
            of: "\\b(today|tonight|tomorrow|yesterday)\\b",
            in: working,
            options: [.caseInsensitive]
        ) { groups in
            guard day == nil, let word = groups[1]?.lowercased() else { return " " }
            switch word {
            case "today": day = calendar.startOfDay(for: referenceDate)
            case "tonight":
                day = calendar.startOfDay(for: referenceDate)
                impliedTime = DateComponents(hour: 19, minute: 0)
            case "tomorrow":
                day = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: referenceDate))
            default:
                day = calendar.date(byAdding: .day, value: -1, to: calendar.startOfDay(for: referenceDate))
            }
            isAllDay = true
            return " "
        }

        // "next Tuesday", "this Friday", bare "Saturday"
        working = replacingMatches(
            of: "\\b(next\\s+|this\\s+|on\\s+)?(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\\b",
            in: working,
            options: [.caseInsensitive]
        ) { groups in
            guard day == nil, let name = groups[2], let weekday = weekday(named: name) else {
                return groups[0] ?? " "
            }
            let wantsNextWeek = groups[1]?.lowercased().hasPrefix("next") ?? false
            day = nextDate(weekday: weekday, after: referenceDate, skipAWeek: wantsNextWeek, calendar: calendar)
            isAllDay = true
            return " "
        }

        // "in 3 days" / "in 2 weeks"
        working = replacingMatches(
            of: "\\bin\\s+(\\d{1,3})\\s+(day|days|week|weeks|month|months)\\b",
            in: working,
            options: [.caseInsensitive]
        ) { groups in
            guard day == nil, let amount = groups[1].flatMap(Int.init), let unit = groups[2]?.lowercased() else {
                return " "
            }
            let component: Calendar.Component = unit.hasPrefix("day") ? .day : (unit.hasPrefix("week") ? .weekOfYear : .month)
            day = calendar.date(byAdding: component, value: amount, to: calendar.startOfDay(for: referenceDate))
            isAllDay = true
            return " "
        }

        // "Mar 3", "March 3rd", "3/14"
        working = replacingMatches(
            of: "\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b",
            in: working,
            options: [.caseInsensitive]
        ) { groups in
            guard day == nil, let monthWord = groups[1]?.lowercased(), let dayNumber = groups[2].flatMap(Int.init),
                  let month = monthNumber(monthWord) else { return " " }
            day = resolveCalendarDate(month: month, day: dayNumber, after: referenceDate, calendar: calendar)
            isAllDay = true
            return " "
        }

        working = replacingMatches(
            of: "\\b(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?\\b",
            in: working
        ) { groups in
            guard day == nil, let month = groups[1].flatMap(Int.init), let dayNumber = groups[2].flatMap(Int.init),
                  (1...12).contains(month), (1...31).contains(dayNumber) else { return groups[0] ?? " " }
            if let year = groups[3].flatMap(Int.init) {
                var components = DateComponents()
                components.year = year < 100 ? 2000 + year : year
                components.month = month
                components.day = dayNumber
                day = calendar.date(from: components)
            } else {
                day = resolveCalendarDate(month: month, day: dayNumber, after: referenceDate, calendar: calendar)
            }
            isAllDay = true
            return " "
        }

        // -- Durations and ranges -------------------------------------------
        working = replacingMatches(
            of: "\\bfor\\s+(\\d{1,3})\\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\\b",
            in: working,
            options: [.caseInsensitive]
        ) { groups in
            guard let amount = groups[1].flatMap(Double.init), let unit = groups[2]?.lowercased() else { return " " }
            duration = unit.hasPrefix("h") ? amount * 3600 : amount * 60
            return " "
        }

        // "5-7pm", "from 5 to 7pm", "9:30–11am"
        working = replacingMatches(
            of: "\\b(?:from\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\s*(?:-|–|—|to|until)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\b",
            in: working,
            options: [.caseInsensitive]
        ) { groups in
            guard startTime == nil,
                  let startHour = groups[1].flatMap(Int.init),
                  let endHour = groups[4].flatMap(Int.init) else { return groups[0] ?? " " }
            // A bare start meridiem borrows the end's — "5-7pm" is an evening.
            let endMeridiem = groups[6]?.lowercased()
            let startMeridiem = groups[3]?.lowercased() ?? endMeridiem
            startTime = DateComponents(
                hour: hour24(startHour, meridiem: startMeridiem),
                minute: groups[2].flatMap(Int.init) ?? 0
            )
            endTime = DateComponents(
                hour: hour24(endHour, meridiem: endMeridiem ?? startMeridiem),
                minute: groups[5].flatMap(Int.init) ?? 0
            )
            isAllDay = false
            return " "
        }

        // Single time: "5pm", "5:30 pm", "17:30", "noon"
        working = replacingMatches(
            of: "\\b(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b|\\b(?:at\\s+)?(\\d{1,2}):(\\d{2})\\b|\\b(noon|midnight)\\b",
            in: working,
            options: [.caseInsensitive]
        ) { groups in
            guard startTime == nil else { return " " }
            if let word = groups[6]?.lowercased() {
                startTime = DateComponents(hour: word == "noon" ? 12 : 0, minute: 0)
            } else if let hour = groups[1].flatMap(Int.init) {
                startTime = DateComponents(
                    hour: hour24(hour, meridiem: groups[3]?.lowercased()),
                    minute: groups[2].flatMap(Int.init) ?? 0
                )
            } else if let hour = groups[4].flatMap(Int.init) {
                startTime = DateComponents(hour: hour, minute: groups[5].flatMap(Int.init) ?? 0)
            } else {
                return groups[0] ?? " "
            }
            isAllDay = false
            return " "
        }

        // -- NSDataDetector fallback ----------------------------------------
        // Only consulted when the hand-written passes found nothing, so a
        // detector guess can never override an explicit parse.
        if day == nil, startTime == nil, let detected = detectDate(in: working, referenceDate: referenceDate) {
            day = calendar.startOfDay(for: detected.date)
            let components = calendar.dateComponents([.hour, .minute], from: detected.date)
            if detected.hasTime {
                startTime = components
                isAllDay = false
            } else {
                isAllDay = true
            }
            working = removing(range: detected.range, from: working)
        }

        // -- Assemble --------------------------------------------------------
        if startTime == nil, let impliedTime {
            startTime = impliedTime
            isAllDay = false
        }

        var start: Date?
        if let startTime {
            let base = day ?? calendar.startOfDay(for: referenceDate)
            start = calendar.date(
                bySettingHour: startTime.hour ?? 0,
                minute: startTime.minute ?? 0,
                second: 0,
                of: base
            )
            // A bare time that has already passed means tomorrow — the thing a
            // person means at 9pm when they type "standup 9am".
            if day == nil, let candidate = start, candidate < referenceDate {
                start = calendar.date(byAdding: .day, value: 1, to: candidate)
            }
        } else if let day {
            start = day
        }

        var end: Date?
        if let start {
            if let endTime {
                let candidate = calendar.date(
                    bySettingHour: endTime.hour ?? 0,
                    minute: endTime.minute ?? 0,
                    second: 0,
                    of: start
                )
                // "10pm to 1am" crosses midnight.
                end = (candidate.map { $0 <= start } ?? false)
                    ? calendar.date(byAdding: .day, value: 1, to: candidate!)
                    : candidate
            } else if let duration {
                end = start.addingTimeInterval(duration)
                isAllDay = false
            }
        }

        return Timing(remainder: working, start: start, end: end, isAllDay: isAllDay && endTime == nil)
    }

    private static func hour24(_ hour: Int, meridiem: String?) -> Int {
        guard let meridiem else { return hour }
        if meridiem == "pm" { return hour == 12 ? 12 : hour + 12 }
        return hour == 12 ? 0 : hour
    }

    private static func monthNumber(_ word: String) -> Int? {
        let months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        let prefix = String(word.prefix(3))
        return months.firstIndex(of: prefix).map { $0 + 1 }
    }

    private static func nextDate(
        weekday: RecurrenceRule.Weekday,
        after date: Date,
        skipAWeek: Bool,
        calendar: Calendar
    ) -> Date? {
        let today = calendar.startOfDay(for: date)
        let current = calendar.component(.weekday, from: today)
        var delta = weekday.rawValue - current
        // Bare "Saturday" said on a Saturday means the one coming, not today —
        // people say "today" when they mean today.
        if delta <= 0 { delta += 7 }
        if skipAWeek { delta += 7 }
        return calendar.date(byAdding: .day, value: delta, to: today)
    }

    private static func resolveCalendarDate(
        month: Int,
        day: Int,
        after reference: Date,
        calendar: Calendar
    ) -> Date? {
        var components = calendar.dateComponents([.year], from: reference)
        components.month = month
        components.day = day
        guard let candidate = calendar.date(from: components) else { return nil }
        if candidate < calendar.startOfDay(for: reference) {
            components.year = (components.year ?? 0) + 1
            return calendar.date(from: components)
        }
        return candidate
    }

    private struct DetectedDate {
        let date: Date
        let range: NSRange
        let hasTime: Bool
    }

    private static func detectDate(in text: String, referenceDate: Date) -> DetectedDate? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.date.rawValue) else {
            return nil
        }
        let range = NSRange(text.startIndex..., in: text)
        guard let match = detector.firstMatch(in: text, options: [], range: range), let date = match.date else {
            return nil
        }
        // `NSDataDetector` reports a bare date as midnight; treat exactly
        // midnight as "no time given" rather than "an event at 00:00".
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        let hasTime = !(components.hour == 0 && components.minute == 0)
        return DetectedDate(date: date, range: match.range, hasTime: hasTime)
    }

    // MARK: - Location

    private static func extractLocation(from text: String) -> (String, String?) {
        var place: String?
        let stripped = replacingMatches(
            of: "\\s(?:at|@)\\s+([\\p{L}0-9][\\p{L}0-9 .'&\\-]{1,48})$",
            in: text,
            options: [.caseInsensitive]
        ) { groups in
            guard let raw = groups[1]?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else {
                return groups[0] ?? ""
            }
            place = raw
            return ""
        }
        return (stripped, place)
    }

    // MARK: - Tasks

    private static let taskVerbs = [
        "remind me to", "remember to", "need to", "don't forget to",
        "dont forget to", "todo", "to-do", "task",
    ]

    private static func containsTaskVerb(_ text: String) -> Bool {
        let lowered = text.lowercased()
        return taskVerbs.contains { lowered.contains($0) }
    }

    private static func stripTaskVerbs(_ text: String) -> String {
        var result = text
        for verb in taskVerbs {
            result = replacingMatches(
                of: "\\b\(NSRegularExpression.escapedPattern(for: verb))\\b",
                in: result,
                options: [.caseInsensitive]
            ) { _ in " " }
        }
        return result
    }

    // MARK: - Quantities

    /// "2 dozen eggs" → ("eggs", "2 dozen"); "milk" → ("milk", nil).
    static func splitQuantity(from text: String) -> (String, String?) {
        var quantity: String?
        let stripped = replacingMatches(
            of: "^\\s*(\\d+(?:\\.\\d+)?\\s*(?:x|dozen|lb|lbs|oz|kg|g|ml|l|liters?|litres?|cans?|bags?|boxes|bottles?|packs?)?)\\s+",
            in: text,
            options: [.caseInsensitive]
        ) { groups in
            quantity = groups[1]?.trimmingCharacters(in: .whitespaces)
            return ""
        }
        let title = tidy(stripped)
        // A quantity with nothing left over was never a quantity.
        return title.isEmpty ? (tidy(text), nil) : (title, quantity)
    }

    // MARK: - Cleanup

    private static func tidy(_ text: String) -> String {
        var result = text
        result = replacingMatches(of: "\\s{2,}", in: result) { _ in " " }
        result = result.trimmingCharacters(in: .whitespacesAndNewlines)
        // Strip prepositions and articles that only made sense next to a token
        // we already consumed.
        result = replacingMatches(
            of: "^(?:add|at|on|the|a|an|to|for|with|of)\\b\\s*",
            in: result,
            options: [.caseInsensitive]
        ) { _ in "" }
        result = replacingMatches(
            of: "\\s*\\b(?:at|on|to|for|with|from|the)\\s*$",
            in: result,
            options: [.caseInsensitive]
        ) { _ in "" }
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func confidence(signals: Int, title: String, original: String) -> Double {
        guard !title.isEmpty else { return 0 }
        // Understanding more of the line and leaving a sensible title behind
        // both raise confidence; a title that swallowed the whole input means
        // nothing was recognised.
        let recognised = 1.0 - (Double(title.count) / Double(max(original.count, 1)))
        let structural = min(Double(signals) / 3.0, 1.0)
        return min(1.0, max(0.15, 0.45 * structural + 0.55 * recognised))
    }

    /// Moves `date` forward to the next day whose weekday is in `weekdays`,
    /// keeping the time of day. Returns `date` unchanged when it already lands
    /// on one.
    static func align(
        _ date: Date,
        to weekdays: [RecurrenceRule.Weekday],
        calendar: Calendar
    ) -> Date {
        guard !weekdays.isEmpty else { return date }
        let wanted = Set(weekdays.map(\.rawValue))
        var candidate = date
        for _ in 0..<7 {
            if wanted.contains(calendar.component(.weekday, from: candidate)) { return candidate }
            guard let next = calendar.date(byAdding: .day, value: 1, to: candidate) else { break }
            candidate = next
        }
        return date
    }

    private static func anchorDate(
        for rule: RecurrenceRule,
        referenceDate: Date,
        calendar: Calendar
    ) -> Date? {
        guard let weekday = rule.weekdays.first else { return calendar.startOfDay(for: referenceDate) }
        let today = calendar.startOfDay(for: referenceDate)
        let current = calendar.component(.weekday, from: today)
        var delta = weekday.rawValue - current
        if delta < 0 { delta += 7 }
        return calendar.date(byAdding: .day, value: delta, to: today)
    }

    // MARK: - Regex plumbing

    /// Runs `transform` over each match, replacing it with the returned string.
    /// Groups arrive as `[Int: String]` with `0` as the whole match.
    private static func replacingMatches(
        of pattern: String,
        in text: String,
        options: NSRegularExpression.Options = [],
        transform: ([Int: String]) -> String
    ) -> String {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else { return text }
        let nsText = text as NSString
        var result = ""
        var cursor = 0

        for match in regex.matches(in: text, options: [], range: NSRange(location: 0, length: nsText.length)) {
            var groups: [Int: String] = [:]
            for index in 0..<match.numberOfRanges {
                let range = match.range(at: index)
                if range.location != NSNotFound {
                    groups[index] = nsText.substring(with: range)
                }
            }
            result += nsText.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
            result += transform(groups)
            cursor = match.range.location + match.range.length
        }
        result += nsText.substring(from: cursor)
        return result
    }

    private static func removing(range: NSRange, from text: String) -> String {
        let nsText = text as NSString
        guard range.location != NSNotFound, range.location + range.length <= nsText.length else { return text }
        return nsText.replacingCharacters(in: range, with: " ")
    }
}
