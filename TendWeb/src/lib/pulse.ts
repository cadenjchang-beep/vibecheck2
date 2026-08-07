/**
 * Pulse — the generated recap.
 *
 * Two properties matter more than the wording. It is **accurate**: every number
 * is countable, nothing is estimated or rounded up to sound impressive. And it
 * is **cheap**: a pure function over already-loaded data, so the morning view
 * renders without a spinner.
 */

import { addDays, formatTime, formatWeekday, isSameDay, startOfDay, startOfWeek } from './dates'
import { expandEvents, type ExpandedEvent } from './eventStore'
import type { HouseholdData } from '../types'

export type PulseKind = 'morning' | 'weekly'

export interface PulseLine {
  id: string
  text: string
  icon: string
  /** Where tapping this line goes — nothing here just "opens the app". */
  target: { tab: string; id?: string; listName?: string }
}

export interface PulseSnapshot {
  kind: PulseKind
  generatedAt: Date
  headline: string
  lines: PulseLine[]
}

/**
 * Morning, every day — the weekly recap only Sunday evening.
 *
 * The weekly copy talks about "this week", "next week" and "left this
 * weekend" — language that's only true right before the week turns over.
 * Gating on hour alone (any evening) would show that language on a Tuesday
 * night, where "next week: 4 events" quietly means "the rest of this week".
 */
export function pulseKindFor(now = new Date()): PulseKind {
  return now.getDay() === 0 && now.getHours() >= 16 ? 'weekly' : 'morning'
}

export function generatePulse(data: HouseholdData, kind: PulseKind, now = new Date()): PulseSnapshot {
  return kind === 'morning' ? morningPulse(data, now) : weeklyPulse(data, now)
}

/** Lists with any activity at all, busiest first, so Pulse talks about real lists. */
function activeListNames(data: HouseholdData): string[] {
  const counts = new Map<string, number>()
  for (const item of data.items) counts.set(item.listName, (counts.get(item.listName) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]))
    .map(([name]) => name)
}

function morningPulse(data: HouseholdData, now: Date): PulseSnapshot {
  const dayStart = startOfDay(now)
  const dayEnd = addDays(dayStart, 1)
  const lines: PulseLine[] = []

  const todays: ExpandedEvent[] = expandEvents(data.events, dayStart, dayEnd)

  const next = todays.find((e) => e.end >= now) ?? todays[0]
  if (next) {
    const when = next.event.isAllDay ? 'all day' : `at ${formatTime(next.start)}`
    const rest = todays.length - 1
    lines.push({
      id: 'events',
      text: `${next.event.title} ${when}${rest > 0 ? `, then ${rest} more` : ''}`,
      icon: 'calendar',
      target: { tab: 'calendar', id: next.event.id },
    })
  }

  const dueToday = data.tasks.filter((t) => !t.isComplete && t.dueDate && new Date(t.dueDate) < dayEnd)
  if (dueToday.length) {
    const overdue = dueToday.filter((t) => new Date(t.dueDate!) < dayStart).length
    lines.push({
      id: 'tasks',
      text: overdue
        ? `${dueToday.length} tasks due — ${overdue} carried over`
        : `${dueToday.length} ${dueToday.length === 1 ? 'task' : 'tasks'} due today`,
      icon: 'check',
      target: { tab: 'tasks' },
    })
  }

  for (const listName of activeListNames(data)) {
    const open = data.items.filter((i) => i.listName === listName && !i.isChecked).length
    if (!open) continue
    lines.push({
      id: `list-${listName}`,
      text: `${open} on ${listName}`,
      icon: 'list',
      target: { tab: 'lists', listName },
    })
  }

  const dinner = data.meals.find(
    (m) => m.mealType === 'dinner' && isSameDay(new Date(`${m.date}T12:00:00`), now),
  )
  if (dinner) {
    const label = dinner.recipeId
      ? (data.recipes.find((r) => r.id === dinner.recipeId)?.title ?? '')
      : (dinner.customText ?? '')
    if (label) {
      lines.push({ id: 'meal', text: `Dinner: ${label}`, icon: 'meal', target: { tab: 'meals' } })
    }
  }

  return {
    kind: 'morning',
    generatedAt: now,
    headline: todays.length === 0 && dueToday.length === 0 ? 'A clear day' : `${formatWeekday(now)} at a glance`,
    lines,
  }
}

function weeklyPulse(data: HouseholdData, now: Date): PulseSnapshot {
  const weekStart = startOfWeek(now)
  const weekEnd = addDays(weekStart, 7)
  const nextWeekEnd = addDays(weekStart, 14)
  const lines: PulseLine[] = []

  // -- What got done ---------------------------------------------------------
  const completedTasks = data.tasks.filter((t) => {
    if (!t.completedAt) return false
    const at = new Date(t.completedAt)
    return at >= weekStart && at < weekEnd
  })
  if (completedTasks.length) {
    lines.push({
      id: 'done-tasks',
      text: `${completedTasks.length} ${completedTasks.length === 1 ? 'task' : 'tasks'} finished`,
      icon: 'check',
      target: { tab: 'tasks' },
    })
  }

  for (const listName of activeListNames(data)) {
    // "Cleared 3x this week" isn't a stored event, so it's derived: distinct
    // days on which items were checked off. A defensible definition of a trip
    // that never overstates.
    const completions = data.items
      .filter((i) => i.listName === listName && i.isChecked && i.completedAt)
      .map((i) => new Date(i.completedAt!))
      .filter((at) => at >= weekStart && at < weekEnd)
    if (!completions.length) continue
    const days = new Set(completions.map((at) => startOfDay(at).getTime())).size
    const noun = completions.length === 1 ? 'item' : 'items'
    lines.push({
      id: `done-list-${listName}`,
      text:
        days === 1
          ? `${listName} cleared ${completions.length} ${noun}`
          : `${listName} cleared ${completions.length} ${noun} across ${days} trips`,
      icon: 'cart',
      target: { tab: 'lists', listName },
    })
  }

  // -- What's left -----------------------------------------------------------
  const remaining = expandEvents(data.events, now, weekEnd)
  if (remaining.length) {
    lines.push({
      id: 'left-events',
      text: `${remaining.length} ${remaining.length === 1 ? 'event' : 'events'} left this weekend`,
      icon: 'calendar',
      target: { tab: 'calendar' },
    })
  }

  const openTasks = data.tasks.filter((t) => !t.isComplete)
  if (openTasks.length) {
    lines.push({
      id: 'left-tasks',
      text: `${openTasks.length} open ${openTasks.length === 1 ? 'task' : 'tasks'} carrying over`,
      icon: 'forward',
      target: { tab: 'tasks' },
    })
  }

  // -- What's coming ---------------------------------------------------------
  const nextWeek = expandEvents(data.events, weekEnd, nextWeekEnd)
  if (nextWeek.length) {
    const notable = nextWeek[0]
    lines.push({
      id: 'coming',
      text:
        `Next week: ${nextWeek.length} ${nextWeek.length === 1 ? 'event' : 'events'}` +
        `, ${notable.event.title} ${formatWeekday(notable.start)}`,
      icon: 'forward',
      target: { tab: 'calendar' },
    })
  }

  const plannedNextWeek = data.meals.filter((m) => {
    const date = new Date(`${m.date}T12:00:00`)
    return date >= weekEnd && date < nextWeekEnd
  }).length
  if (plannedNextWeek < 3) {
    lines.push({
      id: 'meals-gap',
      text: plannedNextWeek
        ? `Only ${plannedNextWeek} meals planned next week`
        : 'No meals planned yet for next week',
      icon: 'meal',
      target: { tab: 'meals' },
    })
  }

  return {
    kind: 'weekly',
    generatedAt: now,
    headline: lines.length ? 'This week, in short' : 'A quiet week',
    lines,
  }
}

/** One-line form, for the notification body and the compact card. */
export function compactSummary(snapshot: PulseSnapshot): string {
  return snapshot.lines.slice(0, 3).map((l) => l.text).join(' · ')
}
