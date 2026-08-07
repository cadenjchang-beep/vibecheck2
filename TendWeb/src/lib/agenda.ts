/**
 * Agenda — the Cozi-style "everything, in one list" view.
 *
 * Pure transforms over an already-expanded occurrence list, kept separate from
 * the component so the filtering and grouping rules are testable without
 * rendering anything — the same pattern as `recurrence.ts` and `load.ts`.
 */

import { addDays, dayKey, formatDayMonth, formatShortWeekday, fromDayKey, isSameDay } from './dates'
import type { ExpandedEvent } from './eventStore'

export interface AgendaFilter {
  /** Matched against title and location, case-insensitively. */
  search: string
  /**
   * Attendee ids to show. Empty means everyone. Multiple ids are OR'd — "Sam
   * or Alex", not "Sam and Alex" — since most events have one or two
   * attendees and an AND filter would mostly return nothing.
   */
  memberIds: string[]
}

export function matchesFilter(occurrence: ExpandedEvent, filter: AgendaFilter): boolean {
  if (filter.memberIds.length > 0) {
    const attendees = occurrence.event.attendeeIds
    if (!filter.memberIds.some((id) => attendees.includes(id))) return false
  }

  const query = filter.search.trim().toLowerCase()
  if (!query) return true
  const haystack = `${occurrence.event.title} ${occurrence.event.location ?? ''}`.toLowerCase()
  return haystack.includes(query)
}

export function filterOccurrences(occurrences: ExpandedEvent[], filter: AgendaFilter): ExpandedEvent[] {
  return occurrences.filter((occurrence) => matchesFilter(occurrence, filter))
}

export interface AgendaGroup {
  key: string
  date: Date
  occurrences: ExpandedEvent[]
}

/**
 * Groups occurrences by calendar day, preserving whatever order they arrived
 * in within a day (callers pass already time-sorted occurrences, so this
 * stays chronological for free).
 */
export function groupByDay(occurrences: ExpandedEvent[]): AgendaGroup[] {
  const order: string[] = []
  const buckets = new Map<string, ExpandedEvent[]>()

  for (const occurrence of occurrences) {
    const key = dayKey(occurrence.start)
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(occurrence)
  }

  return order.map((key) => ({ key, date: fromDayKey(key), occurrences: buckets.get(key)! }))
}

/** "Today", "Tomorrow", "Yesterday", or a weekday + date — the year only when it isn't this one. */
export function agendaDateLabel(date: Date, today = new Date()): string {
  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, addDays(today, 1))) return 'Tomorrow'
  if (isSameDay(date, addDays(today, -1))) return 'Yesterday'

  const base = `${formatShortWeekday(date)}, ${formatDayMonth(date)}`
  return date.getFullYear() === today.getFullYear() ? base : `${base}, ${date.getFullYear()}`
}

/**
 * A long enough list of recurring series can generate more rows than anyone
 * would ever scroll through. Rather than silently cut the list off, this caps
 * it and says so — the same "never silently drop something" instinct as the
 * rest of the app, just applied to render volume instead of data.
 */
export const AGENDA_RENDER_LIMIT = 400

export function capOccurrences(
  occurrences: ExpandedEvent[],
  limit = AGENDA_RENDER_LIMIT,
): { shown: ExpandedEvent[]; truncated: number } {
  if (occurrences.length <= limit) return { shown: occurrences, truncated: 0 }
  return { shown: occurrences.slice(0, limit), truncated: occurrences.length - limit }
}
