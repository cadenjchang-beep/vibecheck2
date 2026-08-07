import { useMemo, useState } from 'react'
import { CartIcon, ChevronLeftIcon, ChevronRightIcon, MealIcon, TrashIcon } from './icons'
import { addDays, formatDayMonth, formatWeekday, isToday, startOfWeek } from '../lib/dates'
import { clearMeal, generateGroceries, generationSummary, mealFor, mealLabel, planMeal } from '../lib/store'
import { MEAL_LABELS, type HouseholdData, type MealType, type Member, type Recipe } from '../types'

interface Props {
  data: HouseholdData
  setData(next: HouseholdData): void
  me: Member | null
}

const PLANNED_MEALS: MealType[] = ['breakfast', 'lunch', 'dinner']

export default function Meals({ data, setData, me }: Props) {
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const [picking, setPicking] = useState<{ day: Date; mealType: MealType } | null>(null)
  const [showingRecipes, setShowingRecipes] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(weekAnchor), i)),
    [weekAnchor],
  )

  const plannedRecipes = days.filter((day) =>
    PLANNED_MEALS.some((meal) => mealFor(data, day, meal)?.recipeId),
  ).length

  return (
    <div className="screen">
      <header className="screen-head with-action">
        <h1>Meals</h1>
        <button className="btn btn-quiet" onClick={() => setShowingRecipes(true)}>
          Recipes
        </button>
      </header>

      <div className="stepper">
        <button onClick={() => setWeekAnchor(addDays(weekAnchor, -7))} aria-label="Previous week">
          <ChevronLeftIcon size={18} />
        </button>
        <span className="stepper-title">
          {formatDayMonth(days[0])} – {formatDayMonth(days[6])}
        </span>
        <button onClick={() => setWeekAnchor(addDays(weekAnchor, 7))} aria-label="Next week">
          <ChevronRightIcon size={18} />
        </button>
      </div>

      {days.map((day) => (
        <section key={day.toISOString()} className="day-card">
          <h2>
            {formatWeekday(day)} <span className="muted">{formatDayMonth(day)}</span>
            {isToday(day) && <span className="pill">Today</span>}
          </h2>
          {PLANNED_MEALS.map((mealType) => {
            const entry = mealFor(data, day, mealType)
            const label = entry ? mealLabel(entry, data.recipes) : ''
            return (
              <button
                key={mealType}
                className="meal-slot"
                onClick={() => setPicking({ day, mealType })}
              >
                <MealIcon size={16} />
                <span className={label ? '' : 'muted'}>{label || MEAL_LABELS[mealType]}</span>
              </button>
            )
          })}
        </section>
      ))}

      {/* The one-tap week → grocery list, de-duplicated three ways. */}
      <button
        className="btn btn-primary wide"
        disabled={plannedRecipes === 0}
        onClick={() => {
          const outcome = generateGroceries(data, days, me?.id)
          setData(outcome.data)
          setResult(generationSummary(outcome.result))
        }}
      >
        <CartIcon size={16} /> Add this week's ingredients to Groceries
      </button>

      {result && (
        <p className="toast" role="status" onAnimationEnd={() => setResult(null)}>
          {result}
        </p>
      )}

      {picking && (
        <MealPicker
          data={data}
          day={picking.day}
          mealType={picking.mealType}
          onPick={(recipeId, customText) => {
            setData(planMeal(data, picking.day, picking.mealType, recipeId, customText))
            setPicking(null)
          }}
          onClear={() => {
            setData(clearMeal(data, picking.day, picking.mealType))
            setPicking(null)
          }}
          onClose={() => setPicking(null)}
        />
      )}

      {showingRecipes && (
        <RecipeBox data={data} setData={setData} onClose={() => setShowingRecipes(false)} />
      )}
    </div>
  )
}

function MealPicker({
  data,
  day,
  mealType,
  onPick,
  onClear,
  onClose,
}: {
  data: HouseholdData
  day: Date
  mealType: MealType
  onPick(recipeId: string | null, customText: string | null): void
  onClear(): void
  onClose(): void
}) {
  const [custom, setCustom] = useState('')

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Plan a meal">
      <div className="sheet">
        <header className="sheet-head">
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <strong>
            {MEAL_LABELS[mealType]} · {formatWeekday(day)}
          </strong>
          <span />
        </header>
        <div className="sheet-body">
          <form
            className="add-row"
            onSubmit={(e) => {
              e.preventDefault()
              if (custom.trim()) onPick(null, custom.trim())
            }}
          >
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Something else"
              aria-label="Something else"
              autoFocus
            />
            <button className="btn btn-primary" type="submit" disabled={!custom.trim()}>
              Set
            </button>
          </form>

          {data.recipes.length > 0 && (
            <>
              <h3>From the recipe box</h3>
              <ul className="item-list">
                {data.recipes.map((recipe) => (
                  <li key={recipe.id} className="item-row">
                    <button className="item-main" onClick={() => onPick(recipe.id, null)}>
                      {recipe.title}
                      <span className="muted small">{recipe.ingredients.length} ingredients</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <button className="btn btn-danger" onClick={onClear}>
            Clear this meal
          </button>
        </div>
      </div>
    </div>
  )
}

function RecipeBox({
  data,
  setData,
  onClose,
}: {
  data: HouseholdData
  setData(next: HouseholdData): void
  onClose(): void
}) {
  const [title, setTitle] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [instructions, setInstructions] = useState('')

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    const recipe: Recipe = {
      id: crypto.randomUUID(),
      title: trimmed,
      // One ingredient per line is the format people already paste in.
      ingredients: ingredients
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      instructions: instructions.trim(),
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setData({ ...data, recipes: [...data.recipes, recipe] })
    setTitle('')
    setIngredients('')
    setInstructions('')
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Recipes">
      <div className="sheet">
        <header className="sheet-head">
          <button className="btn btn-quiet" onClick={onClose}>
            Done
          </button>
          <strong>Recipes</strong>
          <span />
        </header>
        <div className="sheet-body">
          {data.recipes.length === 0 && (
            <div className="empty">
              <MealIcon size={40} />
              <h2>The recipe box is empty</h2>
              <p>Add one below. Ingredients become grocery items in one tap.</p>
            </div>
          )}

          <ul className="item-list">
            {data.recipes.map((recipe) => (
              <li key={recipe.id} className="item-row">
                <span className="item-main">
                  {recipe.title}
                  <span className="muted small">{recipe.ingredients.length} ingredients</span>
                </span>
                <button
                  className="icon-btn"
                  aria-label={`Delete ${recipe.title}`}
                  onClick={() =>
                    setData({ ...data, recipes: data.recipes.filter((r) => r.id !== recipe.id) })
                  }
                >
                  <TrashIcon size={16} />
                </button>
              </li>
            ))}
          </ul>

          <h3>Add a recipe</h3>
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Ingredients — one per line</span>
            <textarea
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              rows={5}
              placeholder={'6 chicken thighs\n1 kg potatoes\n2 lemons'}
            />
          </label>
          <label className="field">
            <span>Method</span>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} />
          </label>
          <button className="btn btn-primary" onClick={save} disabled={!title.trim()}>
            Save recipe
          </button>
        </div>
      </div>
    </div>
  )
}
