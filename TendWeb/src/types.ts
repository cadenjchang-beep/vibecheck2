/**
 * Tend's data model.
 *
 * Mirrors the SwiftData schema one-for-one so the two implementations stay
 * comparable, with two web-shaped differences:
 *
 * - Dates are ISO strings, not `Date`. They cross localStorage and JSONB, and a
 *   `Date` that survives one round trip but not the other is a bug factory.
 * - Every entity carries `createdAt`/`updatedAt` epoch millis. CloudKit tracked
 *   record versions for us; here they're what the merge in `sync.ts` runs on.
 */

export const SCHEMA_VERSION = 1

/** Well-known lists. Users can make any list; these are the ones Tend has opinions about. */
export const GROCERIES = 'Groceries'
export const HOUSEHOLD_LIST = 'Household'
export const DEFAULT_LISTS = [GROCERIES, HOUSEHOLD_LIST]

export interface Member {
  id: string
  name: string
  colorHex: string
  isChild: boolean
  createdAt: number
  updatedAt?: number
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'other'

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'other']

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  other: 'Other',
}

/** The EventKit-style three-way split. Guessing here rewrites someone's whole season. */
export type EditScope = 'single' | 'future' | 'all'

export const EDIT_SCOPE_LABELS: Record<EditScope, string> = {
  single: 'This event only',
  future: 'This and all future events',
  all: 'All events in the series',
}

export interface TendEvent {
  id: string
  title: string
  location?: string
  /** ISO 8601, with timezone. */
  start: string
  end: string
  isAllDay: boolean
  /** RFC 5545-flavoured rule string; undefined means a one-off. */
  recurrenceRule?: string
  /** Links every occurrence and every split of one recurring series. */
  seriesId: string
  /** Occurrence starts removed from this series, by deletion or detachment. */
  exceptionDates: string[]
  /** Set on a copy detached by a "this event only" edit; holds the slot it replaced. */
  detachedFrom?: string
  attendeeIds: string[]
  notes?: string
  /** Powers the quiet "updated by Sam" line — last-writer-wins, never a merge prompt. */
  lastModifiedBy?: string
  createdAt: number
  updatedAt?: number
}

export interface ListItem {
  id: string
  listName: string
  text: string
  quantity?: string
  category?: string
  isChecked: boolean
  /** These two exist to power Load View. They are not optional metadata. */
  completedBy?: string
  completedAt?: string
  addedBy?: string
  assignedTo?: string
  sortIndex: number
  createdAt: number
  updatedAt?: number
}

export interface Task {
  id: string
  title: string
  notes?: string
  /** ISO 8601. */
  dueDate?: string
  assignedTo?: string
  recurrenceRule?: string
  isComplete: boolean
  /** Powers Load View. */
  completedBy?: string
  completedAt?: string
  /** 0 none, 1 low, 2 medium, 3 high. */
  priority: number
  createdBy?: string
  createdAt: number
  updatedAt?: number
}

export const PRIORITY_LABELS: Record<number, string> = {
  0: 'No priority',
  1: 'Low',
  2: 'Medium',
  3: 'High',
}

export interface Recipe {
  id: string
  title: string
  ingredients: string[]
  instructions: string
  /** Data URL. Kept small deliberately — see `importRecipe`. */
  photo?: string
  tags: string[]
  sourceUrl?: string
  servings?: number
  createdAt: number
  updatedAt?: number
}

export interface MealPlanEntry {
  id: string
  /** yyyy-mm-dd. A meal belongs to a day, not an instant. */
  date: string
  mealType: MealType
  recipeId?: string
  customText?: string
  /** Ingredients already pushed to Groceries, so repeat taps de-duplicate. */
  exportedIngredients: string[]
  createdAt: number
  updatedAt?: number
}

export interface HouseholdData {
  version: number
  householdName: string
  members: Member[]
  events: TendEvent[]
  items: ListItem[]
  tasks: Task[]
  recipes: Recipe[]
  meals: MealPlanEntry[]
}

export function emptyData(): HouseholdData {
  return {
    version: SCHEMA_VERSION,
    householdName: '',
    members: [],
    events: [],
    items: [],
    tasks: [],
    recipes: [],
    meals: [],
  }
}

/**
 * Per-member colour is the app's core visual language: every event, assignment
 * and Load View bar is tinted by whose it is.
 *
 * Chosen to stay distinguishable in dark mode and to survive the common forms
 * of colour blindness — no red/green pair carries meaning on its own, and every
 * colour is always paired with a name or an initial in the UI.
 */
export const MEMBER_COLORS = [
  '#6c8f7e', // sage
  '#c97b5a', // terracotta
  '#5b7da8', // slate blue
  '#b0894e', // ochre
  '#8a6fa8', // muted violet
  '#4f8a8b', // teal
  '#a85c74', // dusty rose
  '#7a8b5c', // olive
]

export function nextMemberColor(used: string[]): string {
  return MEMBER_COLORS.find((c) => !used.includes(c)) ?? MEMBER_COLORS[used.length % MEMBER_COLORS.length]
}
