/**
 * Load View — the shape of the week.
 *
 * This is the feature most likely to go wrong socially rather than technically,
 * so the rules live here in the data layer rather than only in the view:
 *
 * - `shares` comes back in **household order**, never sorted by volume. A list
 *   sorted by "who did most" is a leaderboard no matter how it's styled.
 * - There is no rank, no score, no target, no streak and no week-over-week
 *   delta, because every one of those invites a comparison the app has no
 *   business making.
 * - `observation` is descriptive ("Most of the list check-offs came from Sam
 *   this time"), never prescriptive.
 * - `CAVEAT` is part of the claim the chart makes, not a disclaimer to dismiss.
 */

import { addDays, addMonths, startOfMonth, startOfWeek } from './dates'
import type { HouseholdData } from '../types'

export type LoadCategory = 'tasks' | 'lists' | 'events' | 'meals'

export const LOAD_CATEGORIES: LoadCategory[] = ['tasks', 'lists', 'events', 'meals']

export const CATEGORY_LABELS: Record<LoadCategory, string> = {
  tasks: 'Tasks finished',
  lists: 'List items handled',
  events: 'Events organised',
  meals: 'Meals planned',
}

/**
 * How a category is named inside a sentence. Kept separate from the label so
 * the observation copy reads like a person wrote it.
 */
const NARRATIVE_NOUNS: Record<LoadCategory, string> = {
  tasks: 'finished tasks',
  lists: 'list check-offs',
  events: 'calendar upkeep',
  meals: 'meal planning',
}

/** The one sentence that never comes off the screen. */
export const CAVEAT =
  "This is only what Tend can see. Plenty of the work at home doesn't get logged anywhere."

export interface LoadWindow {
  title: string
  start: Date
  end: Date
}

export function weekWindow(now = new Date()): LoadWindow {
  const start = startOfWeek(now)
  return { title: 'This week', start, end: addDays(start, 7) }
}

export function monthWindow(now = new Date()): LoadWindow {
  const start = startOfMonth(now)
  return { title: 'This month', start, end: addMonths(start, 1) }
}

export interface LoadShare {
  memberId: string
  name: string
  colorHex: string
  counts: Record<LoadCategory, number>
  total: number
}

export interface LoadSummary {
  window: LoadWindow
  shares: LoadShare[]
  householdTotal: number
  observation: string | null
  caveat: string
}

function inWindow(value: string | undefined, window: LoadWindow): boolean {
  if (!value) return false
  const at = new Date(value)
  return at >= window.start && at < window.end
}

export function summarizeLoad(data: HouseholdData, window: LoadWindow): LoadSummary {
  const counts = new Map<string, Record<LoadCategory, number>>()

  const bump = (memberId: string | undefined, category: LoadCategory) => {
    if (!memberId) return
    const existing = counts.get(memberId) ?? { tasks: 0, lists: 0, events: 0, meals: 0 }
    existing[category] += 1
    counts.set(memberId, existing)
  }

  for (const task of data.tasks) {
    if (!inWindow(task.completedAt, window)) continue
    // Credit whoever actually did it, falling back to the assignee for data
    // written before completedBy existed.
    bump(task.completedBy ?? task.assignedTo, 'tasks')
  }

  for (const item of data.items) {
    if (!item.isChecked || !inWindow(item.completedAt, window)) continue
    bump(item.completedBy, 'lists')
  }

  for (const event of data.events) {
    const start = new Date(event.start)
    if (start < window.start || start >= window.end) continue
    // "Organised" means "last touched it" — whoever typed the event in, not
    // everyone who shows up to it.
    bump(event.lastModifiedBy, 'events')
  }

  // Meal planning is deliberately not counted: the model has no per-entry
  // author, and inferring one would put a number on the chart that nobody can
  // check. A missing bar is honest; a guessed one isn't. The category stays in
  // the type so adding the field later is additive.

  // Member order is the household's own order. This is the anti-leaderboard rule.
  const shares: LoadShare[] = data.members.map((member) => {
    const memberCounts = counts.get(member.id) ?? { tasks: 0, lists: 0, events: 0, meals: 0 }
    return {
      memberId: member.id,
      name: member.name,
      colorHex: member.colorHex,
      counts: memberCounts,
      total: LOAD_CATEGORIES.reduce((sum, c) => sum + memberCounts[c], 0),
    }
  })

  const householdTotal = shares.reduce((sum, s) => sum + s.total, 0)

  return {
    window,
    shares,
    householdTotal,
    observation: observationFor(shares, householdTotal),
    caveat: CAVEAT,
  }
}

/**
 * Descriptive, singular, and only when there's genuinely something to describe.
 * Silence is a valid output — a balanced week doesn't need congratulating and
 * an unbalanced one doesn't need a verdict.
 */
export function observationFor(shares: LoadShare[], total: number): string | null {
  const active = shares.filter((s) => s.total > 0)
  if (total < 8 || active.length < 2) return null

  const top = [...active].sort((a, b) => b.total - a.total)[0]
  const topFraction = top.total / total

  if (topFraction >= 0.65) {
    // Lead with the *kind* of work, not the person: "the list check-offs" is
    // something a household can hand off, whereas a sentence about a person is
    // a verdict about them.
    const dominant = dominantCategory(top)
    return dominant
      ? `Most of the ${NARRATIVE_NOUNS[dominant]} came from ${top.name} this time.`
      : `A lot of this week ran through ${top.name}.`
  }

  // An even split among however many people are active — 1/n, with slack.
  if (topFraction <= 1 / active.length + 0.05) return 'This one was spread fairly evenly.'
  return null
}

function dominantCategory(share: LoadShare): LoadCategory | null {
  let best: LoadCategory | null = null
  for (const category of LOAD_CATEGORIES) {
    if (share.counts[category] === 0) continue
    if (!best || share.counts[category] > share.counts[best]) best = category
  }
  return best
}

export function fractionOf(share: LoadShare, total: number): number {
  return total > 0 ? share.total / total : 0
}
