import SwiftData
import SwiftUI
import TendKit
import UIKit
#if canImport(VisionKit)
import VisionKit
#endif

struct MealPlanScreen: View {
    @Environment(HouseholdContext.self) private var context
    @Environment(\.modelContext) private var modelContext

    @Query private var recipes: [Recipe]
    @Query private var entries: [MealPlanEntry]

    @State private var weekAnchor = Date.now
    @State private var picking: (day: Date, meal: MealType)?
    @State private var generationResult: MealPlanner.GroceryGenerationResult?
    @State private var isShowingRecipes = false

    private var calendar: Calendar { .current }
    private var days: [Date] { MealPlanner.week(containing: weekAnchor, calendar: calendar) }

    var body: some View {
        @Bindable var context = context

        NavigationStack(path: $context.mealsPath) {
            ScrollView {
                VStack(spacing: Spacing.m) {
                    weekStepper

                    ForEach(days, id: \.self) { day in
                        DayCard(
                            day: day,
                            isToday: calendar.isDateInToday(day),
                            entries: entries.filter { calendar.isDate($0.date, inSameDayAs: day) },
                            recipes: recipes
                        ) { mealType in
                            picking = (day, mealType)
                        }
                    }

                    generateButton
                }
                .padding(Spacing.m)
            }
            .navigationTitle("Meals")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isShowingRecipes = true } label: { Image(systemName: "book") }
                        .accessibilityLabel("Recipe box")
                }
            }
            .sheet(isPresented: $isShowingRecipes) { RecipeBoxView() }
            .sheet(item: Binding(
                get: { picking.map { MealSlot(day: $0.day, mealType: $0.meal) } },
                set: { picking = $0.map { ($0.day, $0.mealType) } }
            )) { slot in
                MealPickerView(day: slot.day, mealType: slot.mealType)
            }
            .navigationDestination(for: DeepLink.self) { link in
                if case .recipe(let id) = link, let recipe = recipes.first(where: { $0.id == id }) {
                    RecipeDetailView(recipe: recipe)
                }
            }
            .alert(
                "Groceries updated",
                isPresented: Binding(get: { generationResult != nil }, set: { if !$0 { generationResult = nil } })
            ) {
                Button("OK") { generationResult = nil }
            } message: {
                Text(generationResult?.summary ?? "")
            }
        }
    }

    private var weekStepper: some View {
        HStack {
            Button { step(-1) } label: { Image(systemName: "chevron.left") }
                .accessibilityLabel("Previous week")
            Spacer()
            Text(weekLabel).font(.subheadline.weight(.medium))
            Spacer()
            Button { step(1) } label: { Image(systemName: "chevron.right") }
                .accessibilityLabel("Next week")
        }
    }

    /// The §11 Phase 2 definition of done, in one control: a planned week
    /// becomes a grocery list in one tap, de-duplicated.
    private var generateButton: some View {
        Button {
            withAnimation(Motion.smooth) {
                generationResult = MealPlanner.generateGroceries(
                    forWeekOf: weekAnchor,
                    by: context.currentMemberID,
                    context: modelContext
                )
            }
        } label: {
            Label("Add this week's ingredients to Groceries", systemImage: "cart.badge.plus")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(plannedRecipeCount == 0)
        .padding(.top, Spacing.s)
    }

    private var plannedRecipeCount: Int {
        MealPlanner.entries(forWeekOf: weekAnchor, context: modelContext, calendar: calendar)
            .filter { $0.recipeID != nil }
            .count
    }

    private var weekLabel: String {
        guard let first = days.first, let last = days.last else { return "" }
        return first.formatted(.dateTime.day().month(.abbreviated))
            + " – " + last.formatted(.dateTime.day().month(.abbreviated))
    }

    private func step(_ amount: Int) {
        withAnimation(Motion.smooth) {
            weekAnchor = calendar.date(byAdding: .weekOfYear, value: amount, to: weekAnchor) ?? weekAnchor
        }
    }
}

private struct MealSlot: Identifiable {
    let day: Date
    let mealType: MealType
    var id: String { "\(day.timeIntervalSince1970)-\(mealType.rawValue)" }
}

private struct DayCard: View {
    let day: Date
    let isToday: Bool
    let entries: [MealPlanEntry]
    let recipes: [Recipe]
    let onTap: (MealType) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            HStack {
                Text(day.formatted(.dateTime.weekday(.wide)))
                    .font(.subheadline.weight(.semibold))
                Text(day.formatted(.dateTime.day().month(.abbreviated)))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                if isToday {
                    Text("Today")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, Spacing.s)
                        .padding(.vertical, 2)
                        .background(.tint.opacity(0.15), in: Capsule())
                }
            }

            ForEach([MealType.breakfast, .lunch, .dinner], id: \.self) { mealType in
                let entry = entries.first { $0.mealType == mealType.rawValue }
                Button { onTap(mealType) } label: {
                    HStack(spacing: Spacing.s) {
                        Image(systemName: mealType.systemImage)
                            .frame(width: 20)
                            .foregroundStyle(.secondary)
                        Text(label(for: entry) ?? mealType.title)
                            .foregroundStyle(entry == nil ? .tertiary : .primary)
                        Spacer()
                    }
                    .font(.subheadline)
                    .padding(.vertical, Spacing.xs)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(Spacing.m)
        .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: Radius.medium))
    }

    private func label(for entry: MealPlanEntry?) -> String? {
        guard let entry else { return nil }
        let text = MealPlanner.label(for: entry, recipes: recipes)
        return text.isEmpty ? nil : text
    }
}

struct MealPickerView: View {
    let day: Date
    let mealType: MealType

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Recipe.title) private var recipes: [Recipe]

    @State private var customText = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Something else", text: $customText)
                        .onSubmit { plan(recipeID: nil, custom: customText) }
                }
                Section("From the recipe box") {
                    ForEach(recipes) { recipe in
                        Button(recipe.title) { plan(recipeID: recipe.id, custom: nil) }
                            .foregroundStyle(.primary)
                    }
                }
                Section {
                    Button("Clear this meal", role: .destructive) {
                        MealPlanner.clear(on: day, mealType: mealType, context: modelContext)
                        dismiss()
                    }
                }
            }
            .navigationTitle("\(mealType.title) · \(day.formatted(.dateTime.weekday(.abbreviated)))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private func plan(recipeID: UUID?, custom: String?) {
        MealPlanner.plan(
            recipeID: recipeID,
            customText: custom?.isEmpty == true ? nil : custom,
            on: day,
            mealType: mealType,
            context: modelContext
        )
        dismiss()
    }
}

struct RecipeBoxView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Recipe.title) private var recipes: [Recipe]

    @State private var isImporting = false

    var body: some View {
        NavigationStack {
            Group {
                if recipes.isEmpty {
                    EmptyStateView(
                        systemImage: "book.closed",
                        title: "The recipe box is empty",
                        message: "Paste a link or scan a page — Tend reads the ingredients so you don't have to type them.",
                        actionTitle: "Import a recipe"
                    ) { isImporting = true }
                } else {
                    List {
                        ForEach(recipes) { recipe in
                            NavigationLink { RecipeDetailView(recipe: recipe) } label: {
                                HStack(spacing: Spacing.m) {
                                    if let data = recipe.photoData, let image = UIImage(data: data) {
                                        Image(uiImage: image)
                                            .resizable()
                                            .scaledToFill()
                                            .frame(width: 44, height: 44)
                                            .clipShape(RoundedRectangle(cornerRadius: Radius.small))
                                    } else {
                                        RoundedRectangle(cornerRadius: Radius.small)
                                            .fill(.quaternary.opacity(0.4))
                                            .frame(width: 44, height: 44)
                                            .overlay(Image(systemName: "fork.knife").foregroundStyle(.secondary))
                                    }
                                    VStack(alignment: .leading) {
                                        Text(recipe.title)
                                        Text("\(recipe.ingredients.count) ingredients")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                        .onDelete { offsets in
                            for index in offsets { modelContext.delete(recipes[index]) }
                            try? modelContext.save()
                        }
                    }
                }
            }
            .navigationTitle("Recipes")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isImporting = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Import a recipe")
                }
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .sheet(isPresented: $isImporting) { RecipeImportView() }
        }
    }
}

struct RecipeDetailView: View {
    let recipe: Recipe

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.m) {
                if let data = recipe.photoData, let image = UIImage(data: data) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity, maxHeight: 220)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.large))
                }
                Text(recipe.title).font(.title2.bold())
                if !recipe.ingredients.isEmpty {
                    Text("Ingredients").font(.headline)
                    ForEach(recipe.ingredients, id: \.self) { ingredient in
                        Label(ingredient, systemImage: "circle.fill")
                            .font(.subheadline)
                            .labelStyle(BulletLabelStyle())
                    }
                }
                if !recipe.instructions.isEmpty {
                    Text("Method").font(.headline).padding(.top, Spacing.s)
                    Text(recipe.instructions).font(.subheadline)
                }
            }
            .padding(Spacing.m)
        }
        .navigationTitle("Recipe")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct BulletLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
            configuration.icon.font(.system(size: 5)).foregroundStyle(.tertiary)
            configuration.title
        }
    }
}

struct RecipeImportView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var urlText = ""
    @State private var draft: DraftRecipe?
    @State private var isWorking = false
    @State private var error: String?
    @State private var isScanning = false

    var body: some View {
        NavigationStack {
            Form {
                Section("From a link") {
                    TextField("https://…", text: $urlText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Button("Import") { Task { await importFromURL() } }
                        .disabled(urlText.isEmpty || isWorking)
                }

                Section("From a photo") {
                    Button {
                        isScanning = true
                    } label: {
                        Label("Scan a page", systemImage: "doc.viewfinder")
                    }
                }

                if isWorking { ProgressView().frame(maxWidth: .infinity) }

                if let error {
                    Text(error).font(.footnote).foregroundStyle(.secondary)
                }

                if let draft {
                    Section("Found") {
                        Text(draft.title).font(.headline)
                        ForEach(draft.ingredients, id: \.self) { Text($0).font(.subheadline) }
                        Button("Save to the recipe box") { save(draft) }
                    }
                }
            }
            .navigationTitle("Import a recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            #if canImport(VisionKit) && os(iOS)
            .fullScreenCover(isPresented: $isScanning) {
                DocumentScanner { text in
                    draft = RecipeImporter.draft(fromScannedText: text)
                    isScanning = false
                }
            }
            #endif
        }
    }

    private func importFromURL() async {
        guard let url = URL(string: urlText) else { return }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            draft = try await RecipeImporter.importRecipe(from: url)
        } catch {
            self.error = error.localizedDescription
            // A failed import still leaves something usable rather than a dead
            // end — the URL becomes a stub the user can fill in.
            draft = DraftRecipe(title: url.host() ?? "Recipe", sourceURL: url)
        }
    }

    private func save(_ draft: DraftRecipe) {
        let recipe = Recipe(
            title: draft.title,
            ingredients: draft.ingredients,
            instructions: draft.instructions,
            tags: [],
            sourceURL: draft.sourceURL?.absoluteString,
            servings: draft.servings
        )
        modelContext.insert(recipe)
        try? modelContext.save()

        if let imageURL = draft.imageURL {
            Task {
                if let (data, _) = try? await URLSession.shared.data(from: imageURL) {
                    await MainActor.run {
                        recipe.photoData = data
                        try? modelContext.save()
                    }
                }
            }
        }
        dismiss()
    }
}

#if canImport(VisionKit) && os(iOS)
/// VisionKit's document camera, wrapped so the OCR result comes back as plain
/// text for ``RecipeImporter``.
struct DocumentScanner: UIViewControllerRepresentable {
    let onText: (String) -> Void

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: VNDocumentCameraViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onText: onText) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let onText: (String) -> Void
        init(onText: @escaping (String) -> Void) { self.onText = onText }

        func documentCameraViewController(
            _ controller: VNDocumentCameraViewController,
            didFinishWith scan: VNDocumentCameraScan
        ) {
            var text = ""
            for index in 0..<scan.pageCount {
                text += TextRecognizer.text(in: scan.imageOfPage(at: index)) + "\n"
            }
            onText(text)
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            onText("")
        }
    }
}
#endif

#Preview("Meals") {
    MealPlanScreen()
        .environment(HouseholdContext())
        .modelContainer(TendModelContainer.preview())
}
