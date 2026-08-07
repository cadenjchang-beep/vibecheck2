import Foundation
import SwiftData

/// A believable household, used by every SwiftUI preview and by UI tests.
///
/// Previews are only worth keeping if they show something real — an empty
/// calendar tells you nothing about whether a week view works. §9 asks for a
/// preview of every screen in Light/Dark at the largest accessibility size, and
/// this is what makes that cheap enough to actually do.
public enum SampleData {

    @MainActor
    public static func populate(_ context: ModelContext, now: Date = .now, calendar: Calendar = .current) {
        let household = Household(name: "The Nguyen–Rileys")
        context.insert(household)

        let sam = Member(name: "Sam", colorHex: MemberPalette.hex(forIndex: 0), avatarSystemImage: "person.circle.fill")
        let alex = Member(name: "Alex", colorHex: MemberPalette.hex(forIndex: 1), avatarSystemImage: "person.circle.fill")
        let mika = Member(name: "Mika", colorHex: MemberPalette.hex(forIndex: 2), isChild: true, avatarSystemImage: "figure.child.circle.fill")
        for member in [sam, alex, mika] {
            member.household = household
            context.insert(member)
        }

        let today = calendar.startOfDay(for: now)
        func at(_ dayOffset: Int, _ hour: Int, _ minute: Int = 0) -> Date {
            let day = calendar.date(byAdding: .day, value: dayOffset, to: today) ?? today
            return calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) ?? day
        }

        // -- Events ---------------------------------------------------------
        let soccer = Event(
            title: "Soccer practice",
            location: "Lincoln Park",
            startDate: at(0, 17),
            endDate: at(0, 18, 30),
            recurrenceRule: RecurrenceRule(frequency: .weekly, weekdays: [.tuesday, .thursday]).rawValue,
            attendeeIDs: [mika.id],
            lastModifiedBy: alex.id
        )
        context.insert(soccer)

        context.insert(Event(
            title: "Dentist — Mika",
            location: "Bright Smiles",
            startDate: at(2, 9, 30),
            endDate: at(2, 10, 15),
            attendeeIDs: [mika.id, sam.id],
            lastModifiedBy: sam.id
        ))

        context.insert(Event(
            title: "Dinner with the Okonjos",
            location: "42 Ash Street",
            startDate: at(4, 19),
            endDate: at(4, 22),
            attendeeIDs: [sam.id, alex.id],
            lastModifiedBy: sam.id
        ))

        context.insert(Event(
            title: "Bin day",
            startDate: at(1, 0),
            endDate: at(1, 0),
            isAllDay: true,
            recurrenceRule: RecurrenceRule(frequency: .weekly, weekdays: [.wednesday]).rawValue,
            lastModifiedBy: alex.id
        ))

        // -- Lists ----------------------------------------------------------
        let groceries = ["Milk", "Sourdough", "Chicken thighs", "Spinach", "Olive oil", "Coffee", "Paper towels"]
        for (index, text) in groceries.enumerated() {
            let item = ListItem(
                listName: TendList.groceries,
                text: text,
                category: AisleCategorizer.category(for: text).rawValue,
                addedBy: index.isMultiple(of: 2) ? sam.id : alex.id,
                sortIndex: index
            )
            context.insert(item)
        }

        // A finished shop earlier in the week, so Pulse and Load View have
        // something true to talk about.
        for (index, text) in ["Eggs", "Rice", "Bananas", "Yogurt"].enumerated() {
            let item = ListItem(
                listName: TendList.groceries,
                text: text,
                category: AisleCategorizer.category(for: text).rawValue,
                isChecked: true,
                addedBy: sam.id,
                sortIndex: 100 + index
            )
            item.completedBy = sam.id
            item.completedAt = at(-2, 18, index)
            context.insert(item)
        }

        context.insert(ListItem(listName: TendList.household, text: "Furnace filter", addedBy: alex.id, sortIndex: 0))

        // -- Tasks ----------------------------------------------------------
        let renew = HouseholdTask(
            title: "Renew Mika's passport",
            notes: "Photos are in the drawer",
            dueDate: at(6, 12),
            assignedMemberID: sam.id,
            priority: TaskPriority.high.rawValue,
            createdBy: sam.id
        )
        context.insert(renew)

        context.insert(HouseholdTask(
            title: "Book the plumber",
            dueDate: at(1, 9),
            assignedMemberID: alex.id,
            priority: TaskPriority.medium.rawValue,
            createdBy: sam.id
        ))

        let bins = HouseholdTask(
            title: "Take the bins out",
            dueDate: at(2, 20),
            assignedMemberID: mika.id,
            recurrenceRule: RecurrenceRule(frequency: .weekly, weekdays: [.wednesday]).rawValue,
            createdBy: alex.id
        )
        context.insert(bins)

        for (index, title) in ["Pay the water bill", "Sign the field trip form", "Swap the smoke alarm battery"].enumerated() {
            let done = HouseholdTask(title: title, dueDate: at(-3 + index, 12), isComplete: true, createdBy: sam.id)
            done.completedBy = index == 2 ? alex.id : sam.id
            done.completedAt = at(-3 + index, 15)
            context.insert(done)
        }

        // -- Recipes and meals ----------------------------------------------
        let traybake = Recipe(
            title: "Sheet-pan chicken and potatoes",
            ingredients: ["6 chicken thighs", "1 kg potatoes", "2 lemons", "4 cloves garlic", "olive oil", "rosemary"],
            instructions: "1. Heat the oven to 220°C.\n2. Toss everything on a tray.\n3. Roast 45 minutes.",
            tags: ["weeknight", "one pan"]
        )
        context.insert(traybake)

        let pasta = Recipe(
            title: "Lemon spinach pasta",
            ingredients: ["400 g pasta", "200 g spinach", "1 lemon", "parmesan", "olive oil"],
            instructions: "1. Boil the pasta.\n2. Wilt the spinach in the pan.\n3. Toss with lemon and parmesan.",
            tags: ["fast", "vegetarian"]
        )
        context.insert(pasta)

        context.insert(MealPlanEntry(date: today, mealType: MealType.dinner.rawValue, recipeID: traybake.id))
        context.insert(MealPlanEntry(date: at(1, 0), mealType: MealType.dinner.rawValue, recipeID: pasta.id))
        context.insert(MealPlanEntry(date: at(2, 0), mealType: MealType.dinner.rawValue, customText: "Leftovers"))

        try? context.save()
    }
}
