/**
 * The store-facing side of recurrence.
 *
 * It decides nothing: `recurrence.ts` works out what an edit means and this
 * applies the result to the events array in one pass, so a half-applied split
 * can't exist.
 */

import {
  applyDelete,
  applyEdit,
  applySnapshot,
  formatRule,
  mergeOccurrences,
  occurrences,
  toSnapshot,
  type EventEdit,
  type Occurrence,
  type SeriesMutation,
  type Snapshot,
} from './recurrence'
import type { EditScope, TendEvent } from '../types'

export interface ExpandedEvent {
  event: TendEvent
  start: Date
  end: Date
  isDetached: boolean
  /** The occurrence the user is looking at — what an edit must be anchored to. */
  occurrenceStart: Date
}

/** Every occurrence visible in a range, series expanded and detached copies folded in. */
export function expandEvents(events: TendEvent[], from: Date, to: Date): ExpandedEvent[] {
  const snapshots = events.map(toSnapshot)
  const byId = new Map(events.map((e) => [e.id, e]))

  const detachedBySeries = new Map<string, Snapshot[]>()
  for (const snapshot of snapshots) {
    if (!snapshot.detachedFrom) continue
    const list = detachedBySeries.get(snapshot.seriesId) ?? []
    list.push(snapshot)
    detachedBySeries.set(snapshot.seriesId, list)
  }

  const results: Occurrence[] = []
  for (const snapshot of snapshots) {
    if (snapshot.detachedFrom) continue
    const expanded = occurrences(snapshot, from, to)
    results.push(...mergeOccurrences(expanded, detachedBySeries.get(snapshot.seriesId) ?? [], from, to))
  }

  return results
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .flatMap((occurrence) => {
      const event = byId.get(occurrence.eventId)
      if (!event) return []
      return [
        {
          event,
          start: occurrence.start,
          end: occurrence.end,
          isDetached: occurrence.isDetached,
          occurrenceStart: occurrence.start,
        },
      ]
    })
}

/** The rule-bearing event for a series. A detached copy has to reach back to it. */
function masterFor(events: TendEvent[], event: TendEvent): TendEvent {
  if (event.recurrenceRule && !event.detachedFrom) return event
  return (
    events.find((e) => e.seriesId === event.seriesId && e.recurrenceRule && !e.detachedFrom) ?? event
  )
}

function detachedFor(events: TendEvent[], seriesId: string): TendEvent[] {
  return events.filter((e) => e.seriesId === seriesId && e.detachedFrom)
}

function applyMutation(
  events: TendEvent[],
  master: TendEvent,
  mutation: SeriesMutation,
  by: string | undefined,
): TendEvent[] {
  const deleted = new Set(mutation.deletedEventIds)
  const now = Date.now()

  let next = events
    .filter((e) => !deleted.has(e.id))
    .map((e) => {
      if (e.id === master.id && !deleted.has(e.id)) {
        return applySnapshot(e, mutation.updatedMaster, by)
      }
      const reassigned = mutation.reassignedSeries[e.id]
      if (reassigned) return { ...e, seriesId: reassigned, updatedAt: now }
      return e
    })

  for (const created of mutation.createdEvents) {
    next = [
      ...next,
      applySnapshot(
        {
          id: created.id,
          title: created.title,
          start: created.start.toISOString(),
          end: created.end.toISOString(),
          isAllDay: created.isAllDay,
          seriesId: created.seriesId,
          exceptionDates: [],
          attendeeIds: created.attendeeIds,
          createdAt: now,
        },
        created,
        by,
      ),
    ]
  }

  return next
}

/**
 * Applies an edit under an explicit scope.
 *
 * `occurrenceStart` is the instance the user was looking at, not the series
 * start. Passing the series start for a "this and future" edit is the classic
 * bug this signature is shaped to prevent.
 */
export function editEvent(
  events: TendEvent[],
  event: TendEvent,
  edit: EventEdit,
  scope: EditScope,
  occurrenceStart: Date,
  by: string | undefined,
): TendEvent[] {
  const master = masterFor(events, event)
  const detached = detachedFor(events, master.seriesId).map(toSnapshot)
  const mutation = applyEdit(toSnapshot(master), edit, scope, occurrenceStart, detached)
  return applyMutation(events, master, mutation, by)
}

export function deleteEvent(
  events: TendEvent[],
  event: TendEvent,
  scope: EditScope,
  occurrenceStart: Date,
  by: string | undefined,
): TendEvent[] {
  const master = masterFor(events, event)
  const detached = detachedFor(events, master.seriesId).map(toSnapshot)
  const mutation = applyDelete(toSnapshot(master), scope, occurrenceStart, detached)
  return applyMutation(events, master, mutation, by)
}

export function makeEvent(fields: {
  title: string
  start: Date
  end: Date
  isAllDay?: boolean
  location?: string
  notes?: string
  attendeeIds?: string[]
  rule?: ReturnType<typeof formatRule> | null
  by?: string
}): TendEvent {
  const id = crypto.randomUUID()
  return {
    id,
    title: fields.title,
    location: fields.location,
    start: fields.start.toISOString(),
    end: fields.end.toISOString(),
    isAllDay: fields.isAllDay ?? false,
    recurrenceRule: fields.rule ?? undefined,
    // A one-off is its own series of one, so every event has a series to belong
    // to and nothing has to special-case `null` later.
    seriesId: id,
    exceptionDates: [],
    attendeeIds: fields.attendeeIds ?? [],
    notes: fields.notes,
    lastModifiedBy: fields.by,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
