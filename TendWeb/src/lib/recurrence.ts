/**
 * Recurrence: a small subset of RFC 5545, plus the edit-scope surgery that
 * "this event / this and future / all events" actually requires.
 *
 * Everything here is a pure function over plain values. Nothing touches
 * storage. That is deliberate — this is the highest-risk, least-visible logic
 * in the app, and it needs to be testable without a store and impossible to
 * half-apply.
 */

import { addDays, addMonths, addYears, daysInMonth, startOfWeek, withTimeOf } from './dates'
import type { TendEvent } from '../types'

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export const FREQUENCIES: Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
}

/** Weekday numbers match `Date.getDay()` — Sunday is 0 — so there is one numbering. */
export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

export interface RecurrenceRule {
  frequency: Frequency
  interval: number
  /** `Date.getDay()` values. Empty means "same weekday as the series start". */
  weekdays: number[]
  monthDays: number[]
  count?: number
  until?: Date
  /** Keys we didn't understand, preserved so a newer client's rule survives a round trip. */
  unknown: string[]
}

export function makeRule(partial: Partial<RecurrenceRule> & { frequency: Frequency }): RecurrenceRule {
  return {
    frequency: partial.frequency,
    interval: Math.max(1, partial.interval ?? 1),
    weekdays: [...(partial.weekdays ?? [])].sort((a, b) => a - b),
    monthDays: [...(partial.monthDays ?? [])].sort((a, b) => a - b),
    count: partial.count,
    until: partial.until,
    unknown: partial.unknown ?? [],
  }
}

// -- Parsing and formatting ---------------------------------------------------

function parseIcsDate(value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(value)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  return new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0)),
  )
}

function formatIcsDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

export function parseRule(raw: string | undefined | null): RecurrenceRule | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/^RRULE:/i, '')
  if (!trimmed) return null

  let frequency: Frequency | null = null
  let interval = 1
  let weekdays: number[] = []
  let monthDays: number[] = []
  let count: number | undefined
  let until: Date | undefined
  const unknown: string[] = []

  for (const part of trimmed.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) {
      if (part) unknown.push(part)
      continue
    }
    const key = part.slice(0, eq).toUpperCase()
    const value = part.slice(eq + 1)

    switch (key) {
      case 'FREQ':
        if (FREQUENCIES.includes(value.toUpperCase() as Frequency)) {
          frequency = value.toUpperCase() as Frequency
        }
        break
      case 'INTERVAL':
        interval = Number(value) || 1
        break
      case 'BYDAY':
        weekdays = value
          .split(',')
          // Drop any ordinal prefix ("2TU"): ordinals aren't supported yet, and
          // degrading to the plain weekday beats dropping the rule.
          .map((token) => (WEEKDAY_CODES as readonly string[]).indexOf(token.slice(-2).toUpperCase()))
          .filter((index) => index >= 0)
        break
      case 'BYMONTHDAY':
        monthDays = value.split(',').map(Number).filter(Number.isFinite)
        break
      case 'COUNT':
        count = Number(value) || undefined
        break
      case 'UNTIL': {
        const parsed = parseIcsDate(value)
        if (parsed) until = parsed
        break
      }
      default:
        unknown.push(part)
    }
  }

  if (!frequency) return null
  return makeRule({ frequency, interval, weekdays, monthDays, count, until, unknown })
}

export function formatRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.frequency}`]
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.weekdays.length) parts.push(`BYDAY=${rule.weekdays.map((d) => WEEKDAY_CODES[d]).join(',')}`)
  if (rule.monthDays.length) parts.push(`BYMONTHDAY=${rule.monthDays.join(',')}`)
  if (rule.count) parts.push(`COUNT=${rule.count}`)
  if (rule.until) parts.push(`UNTIL=${formatIcsDate(rule.until)}`)
  parts.push(...rule.unknown)
  return parts.join(';')
}

export function describeRule(rule: RecurrenceRule): string {
  const unit = {
    DAILY: rule.interval === 1 ? 'Every day' : `Every ${rule.interval} days`,
    WEEKLY: rule.interval === 1 ? 'Every week' : `Every ${rule.interval} weeks`,
    MONTHLY: rule.interval === 1 ? 'Every month' : `Every ${rule.interval} months`,
    YEARLY: rule.interval === 1 ? 'Every year' : `Every ${rule.interval} years`,
  }[rule.frequency]

  let text = unit
  if (rule.weekdays.length) {
    const names = rule.weekdays.map((d) =>
      new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2024, 0, 7 + d)),
    )
    text += ` on ${names.join(', ')}`
  }
  if (rule.count) text += `, ${rule.count} times`
  if (rule.until) text += `, until ${rule.until.toLocaleDateString()}`
  return text
}

// -- Snapshots ----------------------------------------------------------------

/** A stored event, converted to real `Date`s for maths. */
export interface Snapshot {
  id: string
  seriesId: string
  title: string
  location?: string
  start: Date
  end: Date
  isAllDay: boolean
  rule: RecurrenceRule | null
  exceptionDates: Date[]
  detachedFrom: Date | null
  attendeeIds: string[]
  notes?: string
}

export function toSnapshot(event: TendEvent): Snapshot {
  return {
    id: event.id,
    seriesId: event.seriesId,
    title: event.title,
    location: event.location,
    start: new Date(event.start),
    end: new Date(event.end),
    isAllDay: event.isAllDay,
    rule: parseRule(event.recurrenceRule),
    exceptionDates: event.exceptionDates.map((d) => new Date(d)),
    detachedFrom: event.detachedFrom ? new Date(event.detachedFrom) : null,
    attendeeIds: event.attendeeIds,
    notes: event.notes,
  }
}

export function applySnapshot(event: TendEvent, snapshot: Snapshot, by?: string): TendEvent {
  return {
    ...event,
    title: snapshot.title,
    location: snapshot.location,
    start: snapshot.start.toISOString(),
    end: snapshot.end.toISOString(),
    isAllDay: snapshot.isAllDay,
    recurrenceRule: snapshot.rule ? formatRule(snapshot.rule) : undefined,
    seriesId: snapshot.seriesId,
    exceptionDates: snapshot.exceptionDates.map((d) => d.toISOString()),
    detachedFrom: snapshot.detachedFrom?.toISOString(),
    attendeeIds: snapshot.attendeeIds,
    notes: snapshot.notes,
    lastModifiedBy: by ?? event.lastModifiedBy,
    updatedAt: Date.now(),
  }
}

export interface Occurrence {
  eventId: string
  seriesId: string
  start: Date
  end: Date
  /** Came from a detached "this event only" copy rather than the series rule. */
  isDetached: boolean
}

// -- Expansion ----------------------------------------------------------------

/** Ceiling on generated instances, so a malformed rule can't spin the calendar forever. */
export const EXPANSION_LIMIT = 750

/**
 * Candidate start dates for a rule. Everything else filters this list; keeping
 * generation in one place is what stops weekly-with-BYDAY drifting out of step
 * with the other frequencies.
 */
export function starts(anchor: Date, rule: RecurrenceRule, limit = EXPANSION_LIMIT): Date[] {
  const results: Date[] = []

  switch (rule.frequency) {
    case 'DAILY': {
      for (let step = 0; results.length < limit; step++) {
        results.push(addDays(anchor, step * rule.interval))
      }
      break
    }

    case 'WEEKLY': {
      const weekdays = rule.weekdays.length ? [...rule.weekdays].sort((a, b) => a - b) : [anchor.getDay()]
      const anchorWeek = startOfWeek(anchor)
      for (let week = 0; results.length < limit; week++) {
        const weekStart = addDays(anchorWeek, week * rule.interval * 7)
        for (const weekday of weekdays) {
          const date = withTimeOf(addDays(weekStart, weekday), anchor)
          if (date < anchor) continue
          results.push(date)
          if (results.length >= limit) break
        }
        // A rule whose weekdays all fall before the anchor in week 0 would
        // otherwise loop forever producing nothing.
        if (week > limit) break
      }
      break
    }

    case 'MONTHLY': {
      const days = rule.monthDays.length ? [...rule.monthDays].sort((a, b) => a - b) : [anchor.getDate()]
      const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      for (let step = 0; results.length < limit; step++) {
        const month = addMonths(firstOfMonth, step * rule.interval)
        const available = daysInMonth(month.getFullYear(), month.getMonth())
        for (const day of days) {
          // A 31st in a 30-day month simply doesn't occur — RFC 5545's rule,
          // and what people expect.
          if (day > available) continue
          const date = withTimeOf(new Date(month.getFullYear(), month.getMonth(), day), anchor)
          if (date < anchor) continue
          results.push(date)
          if (results.length >= limit) break
        }
        if (step > limit) break
      }
      break
    }

    case 'YEARLY': {
      for (let step = 0; results.length < limit; step++) {
        results.push(addYears(anchor, step * rule.interval))
      }
      break
    }
  }

  return results.sort((a, b) => a.getTime() - b.getTime())
}

/**
 * Occurrences of `master` starting within `[from, to)`, honouring COUNT, UNTIL
 * and exception dates. Detached copies are *not* included — fold them in with
 * `mergeOccurrences`.
 */
export function occurrences(master: Snapshot, from: Date, to: Date, limit = EXPANSION_LIMIT): Occurrence[] {
  if (!master.rule) {
    if (master.start < from || master.start >= to) return []
    return [
      {
        eventId: master.id,
        seriesId: master.seriesId,
        start: master.start,
        end: master.end,
        isDetached: master.detachedFrom !== null,
      },
    ]
  }

  const duration = master.end.getTime() - master.start.getTime()
  const exceptions = new Set(master.exceptionDates.map((d) => d.getTime()))
  const results: Occurrence[] = []
  let emitted = 0

  for (const start of starts(master.start, master.rule, limit)) {
    // COUNT applies to the recurrence set *before* exceptions are subtracted —
    // RFC 5545's rule, and what EventKit does. Increment first, filter second.
    emitted += 1
    if (master.rule.count !== undefined && emitted > master.rule.count) break
    if (master.rule.until && start > master.rule.until) break
    if (start >= to) break
    if (start < from) continue
    if (exceptions.has(start.getTime())) continue

    results.push({
      eventId: master.id,
      seriesId: master.seriesId,
      start,
      end: new Date(start.getTime() + duration),
      isDetached: false,
    })
  }

  return results
}

export function mergeOccurrences(base: Occurrence[], detached: Snapshot[], from: Date, to: Date): Occurrence[] {
  const merged = [...base]
  for (const copy of detached) {
    if (copy.start < from || copy.start >= to) continue
    merged.push({
      eventId: copy.id,
      seriesId: copy.seriesId,
      start: copy.start,
      end: copy.end,
      isDetached: true,
    })
  }
  return merged.sort((a, b) => a.start.getTime() - b.start.getTime())
}

export function nextOccurrence(master: Snapshot, after: Date): Occurrence | null {
  const horizon = addYears(after, 2)
  return occurrences(master, new Date(after.getTime() + 1000), horizon)[0] ?? null
}

// -- Editing ------------------------------------------------------------------

/**
 * The fields an editor can change. `undefined` means "leave alone", which is
 * what lets a "this and future" edit that only moves the time keep the title.
 */
export interface EventEdit {
  title?: string
  location?: string | null
  start?: Date
  end?: Date
  isAllDay?: boolean
  rule?: RecurrenceRule | null
  attendeeIds?: string[]
  notes?: string | null
}

/** Every write an edit implies. The store applies this atomically; it decides nothing. */
export interface SeriesMutation {
  updatedMaster: Snapshot
  createdEvents: Snapshot[]
  /** Detached copies that belong to a different series after a split. */
  reassignedSeries: Record<string, string>
  deletedEventIds: string[]
  appliedScope: EditScopeName
}

type EditScopeName = 'single' | 'future' | 'all'

function applyFields(snapshot: Snapshot, edit: EventEdit): Snapshot {
  const next: Snapshot = { ...snapshot }
  if (edit.title !== undefined) next.title = edit.title
  if (edit.location !== undefined) next.location = edit.location ?? undefined
  if (edit.start !== undefined) {
    // Moving the start without touching the end carries the duration along
    // rather than silently shortening the event.
    const delta = edit.start.getTime() - next.start.getTime()
    next.start = edit.start
    if (edit.end === undefined) next.end = new Date(next.end.getTime() + delta)
  }
  if (edit.end !== undefined) next.end = edit.end
  if (edit.isAllDay !== undefined) next.isAllDay = edit.isAllDay
  if (edit.attendeeIds !== undefined) next.attendeeIds = edit.attendeeIds
  if (edit.notes !== undefined) next.notes = edit.notes ?? undefined
  if (edit.rule !== undefined) next.rule = edit.rule
  if (next.end < next.start) next.end = new Date(next.start.getTime() + (snapshot.end.getTime() - snapshot.start.getTime()))
  return next
}

/**
 * Ends a rule just before `date`, converting COUNT into the number of
 * occurrences that actually fall in the first half so the two halves together
 * still produce the original total.
 */
function truncateRule(rule: RecurrenceRule | null, before: Date, master: Snapshot): RecurrenceRule | null {
  if (!rule) return null
  const next = { ...rule }
  if (rule.count !== undefined) {
    next.count = Math.max(
      starts(master.start, rule).slice(0, rule.count).filter((d) => d < before).length,
      0,
    )
    next.until = undefined
  } else {
    next.until = new Date(before.getTime() - 1000)
  }
  return next
}

/** The complement of `truncateRule` — what still has to happen after the split. */
function remainingRule(rule: RecurrenceRule | null, from: Date, master: Snapshot): RecurrenceRule | null {
  if (!rule) return null
  const next = { ...rule }
  if (rule.count !== undefined) {
    const consumed = starts(master.start, rule).slice(0, rule.count).filter((d) => d < from).length
    next.count = Math.max(rule.count - consumed, 1)
  }
  return next
}

/**
 * Turns "the user edited the occurrence starting at X, with scope S" into the
 * exact set of writes that implies.
 *
 * `occurrenceStart` is the instance they were looking at, not the series start.
 * Passing the series start for a "this and future" edit is the classic bug this
 * signature is shaped to prevent.
 */
export function applyEdit(
  master: Snapshot,
  edit: EventEdit,
  scope: EditScopeName,
  occurrenceStart: Date,
  detachedCopies: Snapshot[] = [],
  newId: () => string = () => crypto.randomUUID(),
): SeriesMutation {
  // A non-recurring event has one occurrence, so every scope collapses.
  if (!master.rule) {
    return {
      updatedMaster: applyFields(master, edit),
      createdEvents: [],
      reassignedSeries: {},
      deletedEventIds: [],
      appliedScope: 'all',
    }
  }

  if (scope === 'single') {
    const updatedMaster: Snapshot = {
      ...master,
      exceptionDates: master.exceptionDates.some((d) => d.getTime() === occurrenceStart.getTime())
        ? master.exceptionDates
        : [...master.exceptionDates, occurrenceStart],
    }

    // The detached copy is a plain, ruleless event that remembers the slot it
    // replaced. That back-reference is what lets a later "this and future" edit
    // decide whether it travels with the split.
    const duration = master.end.getTime() - master.start.getTime()
    const detached = applyFields(
      {
        ...master,
        id: newId(),
        start: occurrenceStart,
        end: new Date(occurrenceStart.getTime() + duration),
        rule: null,
        exceptionDates: [],
        detachedFrom: occurrenceStart,
      },
      edit,
    )

    return {
      updatedMaster,
      createdEvents: [detached],
      reassignedSeries: {},
      deletedEventIds: [],
      appliedScope: 'single',
    }
  }

  if (scope === 'future') {
    // Splitting at the very first occurrence leaves an empty first half, so
    // treat it as "all".
    if (occurrenceStart <= master.start) {
      return applyEdit(master, edit, 'all', occurrenceStart, detachedCopies, newId)
    }

    const head: Snapshot = {
      ...master,
      rule: truncateRule(master.rule, occurrenceStart, master),
      exceptionDates: master.exceptionDates.filter((d) => d < occurrenceStart),
    }

    const newSeriesId = newId()
    const delta = (edit.start ?? occurrenceStart).getTime() - occurrenceStart.getTime()
    const duration = master.end.getTime() - master.start.getTime()

    const tail = applyFields(
      {
        ...master,
        id: newSeriesId,
        seriesId: newSeriesId,
        start: occurrenceStart,
        end: new Date(occurrenceStart.getTime() + duration),
        rule: remainingRule(master.rule, occurrenceStart, master),
        // Exceptions after the split travel with the tail, shifted by the same
        // delta the occurrences moved — otherwise they stop matching.
        exceptionDates: master.exceptionDates
          .filter((d) => d >= occurrenceStart)
          .map((d) => new Date(d.getTime() + delta)),
        detachedFrom: null,
      },
      edit,
    )

    // Detached one-offs in the tail's range belong to the new series now, or a
    // later "all events" edit on either half would reach across the split.
    const reassignedSeries: Record<string, string> = {}
    for (const copy of detachedCopies) {
      if (copy.start >= occurrenceStart) reassignedSeries[copy.id] = newSeriesId
    }

    return {
      updatedMaster: head,
      createdEvents: [tail],
      reassignedSeries,
      deletedEventIds: [],
      appliedScope: 'future',
    }
  }

  // scope === 'all'
  // The user was looking at *an* occurrence, so a start change is a shift
  // relative to that occurrence, not an absolute move of the series master.
  const delta = (edit.start ?? occurrenceStart).getTime() - occurrenceStart.getTime()
  const updated: Snapshot = { ...master }

  if (edit.title !== undefined) updated.title = edit.title
  if (edit.location !== undefined) updated.location = edit.location ?? undefined
  if (edit.isAllDay !== undefined) updated.isAllDay = edit.isAllDay
  if (edit.attendeeIds !== undefined) updated.attendeeIds = edit.attendeeIds
  if (edit.notes !== undefined) updated.notes = edit.notes ?? undefined
  if (edit.rule !== undefined) updated.rule = edit.rule

  if (delta !== 0) {
    updated.start = new Date(master.start.getTime() + delta)
    updated.end = new Date(master.end.getTime() + delta)
    // An exception that didn't move with the series would stop matching, and
    // the skipped week would silently reappear.
    updated.exceptionDates = master.exceptionDates.map((d) => new Date(d.getTime() + delta))
  }
  if (edit.end && edit.start) {
    updated.end = new Date(updated.start.getTime() + (edit.end.getTime() - edit.start.getTime()))
  }

  return {
    updatedMaster: updated,
    createdEvents: [],
    reassignedSeries: {},
    deletedEventIds: [],
    appliedScope: 'all',
  }
}

export function applyDelete(
  master: Snapshot,
  scope: EditScopeName,
  occurrenceStart: Date,
  detachedCopies: Snapshot[] = [],
): SeriesMutation {
  if (scope === 'single') {
    const orphan = detachedCopies.find((c) => c.start.getTime() === occurrenceStart.getTime())
    return {
      updatedMaster: { ...master, exceptionDates: [...master.exceptionDates, occurrenceStart] },
      createdEvents: [],
      reassignedSeries: {},
      deletedEventIds: orphan ? [orphan.id] : [],
      appliedScope: 'single',
    }
  }

  if (scope === 'future') {
    return {
      updatedMaster: {
        ...master,
        rule: truncateRule(master.rule, occurrenceStart, master),
        exceptionDates: master.exceptionDates.filter((d) => d < occurrenceStart),
      },
      createdEvents: [],
      reassignedSeries: {},
      deletedEventIds: detachedCopies.filter((c) => c.start >= occurrenceStart).map((c) => c.id),
      appliedScope: 'future',
    }
  }

  return {
    updatedMaster: master,
    createdEvents: [],
    reassignedSeries: {},
    deletedEventIds: [master.id, ...detachedCopies.map((c) => c.id)],
    appliedScope: 'all',
  }
}

/** True when the editor has to ask "this / this and future / all". */
export function needsScopePrompt(event: TendEvent): boolean {
  const rule = parseRule(event.recurrenceRule)
  if (!rule) return false
  if (rule.count !== undefined && rule.count <= 1) return false
  return true
}
