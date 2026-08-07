/**
 * The operations every entry point goes through.
 *
 * The rule from the iOS build carries over: `isChecked` and `isComplete` flip
 * in exactly one place each, so `completedBy` / `completedAt` can never be
 * forgotten. Those two fields are what Load View runs on, and a check-off that
 * skips them is invisible work all over again.
 */

import { addYears, dayKey, startOfDay } from './dates'
import { aisleSortOrder, categorize, normalizeItem, type Aisle } from './aisles'
import { occurrences, parseRule, type Snapshot } from './recurrence'
import { splitQuantity } from './quickAdd'
import {
  GROCERIES,
  type HouseholdData,
  type ListItem,
  type MealPlanEntry,
  type MealType,
  type Recipe,
  type Task,
} from '../types'

const now = () => Date.now()

// -- Lists --------------------------------------------------------------------

export function listNames(data: HouseholdData, defaults: string[]): string[] {
  const discovered = new Set(data.items.map((i) => i.listName))
  const custom = [...discovered].filter((n) => !defaults.includes(n)).sort()
  return [...defaults, ...custom]
}

export function openItems(data: HouseholdData, listName: string): ListItem[] {
  return data.items
    .filter((i) => i.listName === listName && !i.isChecked)
    .sort((a, b) => a.sortIndex - b.sortIndex || a.createdAt - b.createdAt)
}

export function checkedItems(data: HouseholdData, listName: string): ListItem[] {
  return data.items
    .filter((i) => i.listName === listName && i.isChecked)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
}

/**
 * Adds an item, de-duplicating against what's already open on the list.
 *
 * The capture-friction rule lives here: this never fails, never asks a
 * question, and never needs the network. A duplicate silently merges rather
 * than prompting.
 */
export function addItem(
  data: HouseholdData,
  text: string,
  listName = GROCERIES,
  quantity: string | null = null,
  by?: string,
): HouseholdData {
  const trimmed = text.trim()
  if (!trimmed) return data

  const existing = openItems(data, listName)
  const duplicate = existing.find((i) => normalizeItem(i.text) === normalizeItem(trimmed))
  if (duplicate) {
    if (quantity && duplicate.quantity !== quantity) {
      return {
        ...data,
        items: data.items.map((i) =>
          i.id === duplicate.id ? { ...i, quantity, updatedAt: now() } : i,
        ),
      }
    }
    return data
  }

  const item: ListItem = {
    id: crypto.randomUUID(),
    listName,
    text: trimmed,
    quantity: quantity ?? undefined,
    category: categorize(trimmed),
    isChecked: false,
    addedBy: by,
    sortIndex: existing.reduce((max, i) => Math.max(max, i.sortIndex), -1) + 1,
    createdAt: now(),
    updatedAt: now(),
  }
  return { ...data, items: [...data.items, item] }
}

/** The single place `isChecked` flips. */
export function setItemChecked(
  data: HouseholdData,
  itemId: string,
  isChecked: boolean,
  by?: string,
): HouseholdData {
  return {
    ...data,
    items: data.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            isChecked,
            completedBy: isChecked ? by : undefined,
            completedAt: isChecked ? new Date().toISOString() : undefined,
            updatedAt: now(),
          }
        : item,
    ),
  }
}

export function deleteItem(data: HouseholdData, itemId: string): HouseholdData {
  return { ...data, items: data.items.filter((i) => i.id !== itemId) }
}

export function clearChecked(data: HouseholdData, listName: string): HouseholdData {
  return { ...data, items: data.items.filter((i) => !(i.listName === listName && i.isChecked)) }
}

export interface AisleGroup {
  aisle: Aisle
  items: ListItem[]
}

/** Groups open items into aisles, in the order a person walks a store. */
export function groupByAisle(items: ListItem[]): AisleGroup[] {
  const buckets = new Map<Aisle, ListItem[]>()
  for (const item of items) {
    const aisle = (item.category as Aisle | undefined) ?? categorize(item.text)
    buckets.set(aisle, [...(buckets.get(aisle) ?? []), item])
  }
  return [...buckets.entries()]
    .map(([aisle, group]) => ({ aisle, items: group.sort((a, b) => a.sortIndex - b.sortIndex) }))
    .sort((a, b) => aisleSortOrder(a.aisle) - aisleSortOrder(b.aisle))
}

// -- Tasks --------------------------------------------------------------------

export function addTask(
  data: HouseholdData,
  fields: {
    title: string
    dueDate?: Date | null
    assignedTo?: string
    priority?: number
    recurrenceRule?: string
    notes?: string
    by?: string
  },
): HouseholdData {
  const trimmed = fields.title.trim()
  if (!trimmed) return data

  const task: Task = {
    id: crypto.randomUUID(),
    title: trimmed,
    notes: fields.notes,
    dueDate: fields.dueDate ? fields.dueDate.toISOString() : undefined,
    assignedTo: fields.assignedTo,
    recurrenceRule: fields.recurrenceRule,
    isComplete: false,
    priority: fields.priority ?? 0,
    createdBy: fields.by,
    createdAt: now(),
    updatedAt: now(),
  }
  return { ...data, tasks: [...data.tasks, task] }
}

/**
 * Completing a recurring task rolls it forward rather than closing it — "take
 * the bins out every Tuesday" isn't done forever on one Tuesday. The completed
 * instance is kept so Pulse and Load View can count it.
 */
export function setTaskComplete(
  data: HouseholdData,
  taskId: string,
  isComplete: boolean,
  by?: string,
): HouseholdData {
  const task = data.tasks.find((t) => t.id === taskId)
  if (!task) return data

  const rule = isComplete ? parseRule(task.recurrenceRule) : null
  if (rule) {
    const anchor = task.dueDate ? new Date(task.dueDate) : new Date()
    const snapshot: Snapshot = {
      id: task.id,
      seriesId: task.id,
      title: task.title,
      start: anchor,
      end: anchor,
      isAllDay: true,
      rule,
      exceptionDates: [],
      detachedFrom: null,
      attendeeIds: [],
    }
    const next = occurrences(snapshot, new Date(anchor.getTime() + 1000), addYears(anchor, 2))[0]

    const completedCopy: Task = {
      ...task,
      id: crypto.randomUUID(),
      recurrenceRule: undefined,
      isComplete: true,
      completedBy: by,
      completedAt: new Date().toISOString(),
      createdAt: now(),
      updatedAt: now(),
    }

    const rolled: Task = next
      ? {
          ...task,
          dueDate: next.start.toISOString(),
          isComplete: false,
          completedBy: undefined,
          completedAt: undefined,
          updatedAt: now(),
        }
      : // The series ran out; the live task closes for good.
        {
          ...task,
          isComplete: true,
          completedBy: by,
          completedAt: new Date().toISOString(),
          updatedAt: now(),
        }

    return {
      ...data,
      tasks: [...data.tasks.map((t) => (t.id === taskId ? rolled : t)), completedCopy],
    }
  }

  return {
    ...data,
    tasks: data.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            isComplete,
            completedBy: isComplete ? by : undefined,
            completedAt: isComplete ? new Date().toISOString() : undefined,
            updatedAt: now(),
          }
        : t,
    ),
  }
}

export function updateTask(data: HouseholdData, taskId: string, patch: Partial<Task>): HouseholdData {
  return {
    ...data,
    tasks: data.tasks.map((t) => (t.id === taskId ? { ...t, ...patch, updatedAt: now() } : t)),
  }
}

export function deleteTask(data: HouseholdData, taskId: string): HouseholdData {
  return { ...data, tasks: data.tasks.filter((t) => t.id !== taskId) }
}

// -- Meals --------------------------------------------------------------------

export function mealFor(data: HouseholdData, day: Date, mealType: MealType): MealPlanEntry | undefined {
  const key = dayKey(day)
  return data.meals.find((m) => m.date === key && m.mealType === mealType)
}

export function planMeal(
  data: HouseholdData,
  day: Date,
  mealType: MealType,
  recipeId: string | null,
  customText: string | null,
): HouseholdData {
  const key = dayKey(startOfDay(day))
  const existing = data.meals.find((m) => m.date === key && m.mealType === mealType)

  if (existing) {
    return {
      ...data,
      meals: data.meals.map((m) =>
        m.id === existing.id
          ? { ...m, recipeId: recipeId ?? undefined, customText: customText ?? undefined, updatedAt: now() }
          : m,
      ),
    }
  }

  const entry: MealPlanEntry = {
    id: crypto.randomUUID(),
    date: key,
    mealType,
    recipeId: recipeId ?? undefined,
    customText: customText ?? undefined,
    exportedIngredients: [],
    createdAt: now(),
    updatedAt: now(),
  }
  return { ...data, meals: [...data.meals, entry] }
}

export function clearMeal(data: HouseholdData, day: Date, mealType: MealType): HouseholdData {
  const key = dayKey(startOfDay(day))
  return { ...data, meals: data.meals.filter((m) => !(m.date === key && m.mealType === mealType)) }
}

export function mealLabel(entry: MealPlanEntry, recipes: Recipe[]): string {
  if (entry.recipeId) return recipes.find((r) => r.id === entry.recipeId)?.title ?? ''
  return entry.customText ?? ''
}

export interface GroceryGenerationResult {
  added: string[]
  alreadyOnList: string[]
  previouslyExported: string[]
}

export function generationSummary(result: GroceryGenerationResult): string {
  if (!result.added.length && result.alreadyOnList.length) return "Everything's already on the list"
  if (!result.added.length) return 'Nothing to add'
  const skipped = result.alreadyOnList.length + result.previouslyExported.length
  return `Added ${result.added.length} ${result.added.length === 1 ? 'item' : 'items'}${
    skipped ? ` · ${skipped} already there` : ''
  }`
}

/**
 * One tap: this week's recipes → the grocery list, de-duplicated three ways.
 *
 * 1. Against ingredients this entry already contributed, so pressing the button
 *    twice doesn't double the list.
 * 2. Against what's already open on the list.
 * 3. Against the other recipes in the same run — two recipes wanting onions
 *    produce one line, not two.
 */
export function generateGroceries(
  data: HouseholdData,
  weekDays: Date[],
  by?: string,
  listName = GROCERIES,
): { data: HouseholdData; result: GroceryGenerationResult } {
  const keys = new Set(weekDays.map((d) => dayKey(d)))
  const entries = data.meals.filter((m) => keys.has(m.date))

  const seen = new Set(openItems(data, listName).map((i) => normalizeItem(i.text)))
  const added: string[] = []
  const alreadyOnList: string[] = []
  const previouslyExported: string[] = []

  let next = data
  const exportedUpdates = new Map<string, string[]>()

  for (const entry of entries) {
    if (!entry.recipeId) continue
    const recipe = data.recipes.find((r) => r.id === entry.recipeId)
    if (!recipe) continue

    const exported = new Set(entry.exportedIngredients.map(normalizeItem))
    const newlyExported: string[] = []

    for (const raw of recipe.ingredients) {
      const ingredient = raw.trim()
      if (!ingredient) continue
      const key = normalizeItem(ingredient)

      if (exported.has(key)) {
        previouslyExported.push(ingredient)
        continue
      }
      if (seen.has(key)) {
        alreadyOnList.push(ingredient)
        newlyExported.push(ingredient)
        continue
      }

      const [text, quantity] = splitQuantity(ingredient)
      next = addItem(next, text, listName, quantity, by)
      seen.add(key)
      added.push(ingredient)
      newlyExported.push(ingredient)
    }

    if (newlyExported.length) {
      exportedUpdates.set(entry.id, [...entry.exportedIngredients, ...newlyExported])
    }
  }

  next = {
    ...next,
    meals: next.meals.map((m) =>
      exportedUpdates.has(m.id)
        ? { ...m, exportedIngredients: exportedUpdates.get(m.id)!, updatedAt: now() }
        : m,
    ),
  }

  return { data: next, result: { added, alreadyOnList, previouslyExported } }
}
