import { describe, expect, it } from 'vitest'
import {
  applyDelete,
  applyEdit,
  describeRule,
  formatRule,
  makeRule,
  mergeOccurrences,
  nextOccurrence,
  occurrences,
  parseRule,
  type Snapshot,
} from './recurrence'

/**
 * Local time throughout, matching how the app computes. `at(2026, 2, 3, 17)` is
 * 3 March 2026 at 17:00 — month is 0-based, like `Date`.
 */
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min, 0, 0)

const SERIES = 'series-aa'

function weeklyMaster(): Snapshot {
  return {
    id: SERIES,
    seriesId: SERIES,
    title: 'Soccer practice',
    location: 'Lincoln Park',
    start: at(2026, 2, 3, 17), // Tuesday
    end: at(2026, 2, 3, 18, 30),
    isAllDay: false,
    rule: makeRule({ frequency: 'WEEKLY', weekdays: [2] }),
    exceptionDates: [],
    detachedFrom: null,
    attendeeIds: [],
  }
}

let counter = 0
const nextId = () => `generated-${++counter}`

describe('rule parsing', () => {
  it('round-trips a weekly rule', () => {
    const rule = makeRule({ frequency: 'WEEKLY', interval: 2, weekdays: [2, 4] })
    expect(formatRule(rule)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH')
    expect(parseRule(formatRule(rule))).toEqual(rule)
  })

  it('accepts an RRULE prefix and a UNTIL stamp', () => {
    const rule = parseRule('RRULE:FREQ=DAILY;UNTIL=20260401T000000Z')
    expect(rule?.frequency).toBe('DAILY')
    expect(rule?.until?.toISOString()).toBe('2026-04-01T00:00:00.000Z')
  })

  it('preserves keys it does not understand', () => {
    // A newer client's rule must survive a round trip through an older one.
    const rule = parseRule('FREQ=WEEKLY;WKST=MO;BYDAY=MO')
    expect(rule?.unknown).toEqual(['WKST=MO'])
    expect(formatRule(rule!)).toContain('WKST=MO')
  })

  it('drops an ordinal prefix rather than the whole rule', () => {
    expect(parseRule('FREQ=MONTHLY;BYDAY=2TU')?.weekdays).toEqual([2])
  })

  it('rejects a rule with no frequency', () => {
    expect(parseRule('INTERVAL=2;BYDAY=MO')).toBeNull()
  })

  it('describes itself in plain language', () => {
    expect(describeRule(makeRule({ frequency: 'WEEKLY', interval: 2 }))).toBe('Every 2 weeks')
  })
})

describe('expansion', () => {
  it('expands a daily rule', () => {
    const master = { ...weeklyMaster(), start: at(2026, 2, 2, 8), end: at(2026, 2, 2, 9), rule: makeRule({ frequency: 'DAILY' }) }
    const result = occurrences(master, at(2026, 2, 1), at(2026, 2, 8))
    expect(result).toHaveLength(6)
    expect(result[0].start).toEqual(at(2026, 2, 2, 8))
    expect(result[5].start).toEqual(at(2026, 2, 7, 8))
  })

  it('expands weekly with two weekdays', () => {
    const master = { ...weeklyMaster(), rule: makeRule({ frequency: 'WEEKLY', weekdays: [2, 4] }) }
    const starts = occurrences(master, at(2026, 2, 1), at(2026, 2, 15)).map((o) => o.start)
    expect(starts).toEqual([
      at(2026, 2, 3, 17),
      at(2026, 2, 5, 17),
      at(2026, 2, 10, 17),
      at(2026, 2, 12, 17),
    ])
  })

  it('skips a week when the interval is 2', () => {
    const master = { ...weeklyMaster(), rule: makeRule({ frequency: 'WEEKLY', interval: 2, weekdays: [2] }) }
    const starts = occurrences(master, at(2026, 2, 1), at(2026, 3, 1)).map((o) => o.start)
    expect(starts).toEqual([at(2026, 2, 3, 17), at(2026, 2, 17, 17), at(2026, 2, 31, 17)])
  })

  it('honours COUNT', () => {
    const master = { ...weeklyMaster(), rule: makeRule({ frequency: 'DAILY', count: 3 }) }
    expect(occurrences(master, at(2026, 2, 1), at(2026, 3, 1))).toHaveLength(3)
  })

  it('treats UNTIL as inclusive of its own instant', () => {
    const master = {
      ...weeklyMaster(),
      start: at(2026, 2, 2, 8),
      end: at(2026, 2, 2, 9),
      rule: makeRule({ frequency: 'DAILY', until: at(2026, 2, 4, 8) }),
    }
    const starts = occurrences(master, at(2026, 2, 1), at(2026, 3, 1)).map((o) => o.start)
    expect(starts).toEqual([at(2026, 2, 2, 8), at(2026, 2, 3, 8), at(2026, 2, 4, 8)])
  })

  it('subtracts exceptions after COUNT, not before', () => {
    // RFC 5545: COUNT applies to the recurrence set, then EXDATE removes from
    // it. Excluding one instance shortens the series rather than shifting it.
    const master = {
      ...weeklyMaster(),
      start: at(2026, 2, 2, 8),
      end: at(2026, 2, 2, 9),
      rule: makeRule({ frequency: 'DAILY', count: 3 }),
      exceptionDates: [at(2026, 2, 3, 8)],
    }
    const starts = occurrences(master, at(2026, 2, 1), at(2026, 3, 1)).map((o) => o.start)
    expect(starts).toEqual([at(2026, 2, 2, 8), at(2026, 2, 4, 8)])
  })

  it('skips months without the requested day', () => {
    const master = {
      ...weeklyMaster(),
      start: at(2026, 0, 31, 9),
      end: at(2026, 0, 31, 10),
      rule: makeRule({ frequency: 'MONTHLY', monthDays: [31] }),
    }
    const starts = occurrences(master, at(2026, 0, 1), at(2026, 4, 1)).map((o) => o.start)
    // February and April have no 31st.
    expect(starts).toEqual([at(2026, 0, 31, 9), at(2026, 2, 31, 9)])
  })

  it('shows a one-off only inside the range', () => {
    const oneOff: Snapshot = { ...weeklyMaster(), rule: null }
    expect(occurrences(oneOff, at(2026, 2, 1), at(2026, 2, 5))).toHaveLength(1)
    expect(occurrences(oneOff, at(2026, 3, 1), at(2026, 3, 5))).toHaveLength(0)
  })

  it('finds the next occurrence after a date', () => {
    expect(nextOccurrence(weeklyMaster(), at(2026, 2, 4, 12))?.start).toEqual(at(2026, 2, 10, 17))
  })
})

/**
 * The "this event / this and future / all events" split — the single easiest
 * place in a calendar app to quietly destroy someone's data.
 */
describe('edit scopes', () => {
  it('detaches one occurrence and leaves the rest alone', () => {
    const occurrence = at(2026, 2, 17, 17)
    const mutation = applyEdit(
      weeklyMaster(),
      { title: 'Soccer — away game', start: at(2026, 2, 17, 19) },
      'single',
      occurrence,
      [],
      nextId,
    )

    expect(mutation.appliedScope).toBe('single')
    expect(mutation.updatedMaster.exceptionDates).toEqual([occurrence])
    expect(mutation.updatedMaster.title).toBe('Soccer practice')
    expect(mutation.updatedMaster.start).toEqual(at(2026, 2, 3, 17))

    const [detached] = mutation.createdEvents
    expect(detached.title).toBe('Soccer — away game')
    expect(detached.start).toEqual(at(2026, 2, 17, 19))
    expect(detached.rule).toBeNull()
    expect(detached.seriesId).toBe(SERIES)
    expect(detached.detachedFrom).toEqual(occurrence)
    // The duration travels with the move rather than silently shrinking.
    expect(detached.end).toEqual(at(2026, 2, 17, 20, 30))
  })

  it('replaces the slot when the series is expanded', () => {
    const mutation = applyEdit(
      weeklyMaster(),
      { start: at(2026, 2, 17, 19) },
      'single',
      at(2026, 2, 17, 17),
      [],
      nextId,
    )
    const from = at(2026, 2, 1)
    const to = at(2026, 3, 1)
    const merged = mergeOccurrences(
      occurrences(mutation.updatedMaster, from, to),
      mutation.createdEvents,
      from,
      to,
    )
    expect(merged.map((o) => o.start)).toEqual([
      at(2026, 2, 3, 17),
      at(2026, 2, 10, 17),
      at(2026, 2, 17, 19), // moved
      at(2026, 2, 24, 17),
      at(2026, 2, 31, 17),
    ])
    expect(merged.filter((o) => o.isDetached)).toHaveLength(1)
  })

  it('splits the series in two for a future edit', () => {
    const splitPoint = at(2026, 2, 17, 17)
    const mutation = applyEdit(
      weeklyMaster(),
      { location: 'Riverside Fields', start: at(2026, 2, 17, 18) },
      'future',
      splitPoint,
      [],
      nextId,
    )

    const head = mutation.updatedMaster
    expect(head.location).toBe('Lincoln Park')
    expect(occurrences(head, at(2026, 2, 1), at(2026, 4, 1)).map((o) => o.start)).toEqual([
      at(2026, 2, 3, 17),
      at(2026, 2, 10, 17),
    ])

    const [tail] = mutation.createdEvents
    expect(tail.location).toBe('Riverside Fields')
    expect(tail.seriesId).not.toBe(SERIES)
    expect(tail.id).toBe(tail.seriesId)
    expect(occurrences(tail, at(2026, 2, 1), at(2026, 3, 8)).map((o) => o.start)).toEqual([
      at(2026, 2, 17, 18),
      at(2026, 2, 24, 18),
      at(2026, 2, 31, 18),
      at(2026, 3, 7, 18),
    ])
  })

  it('treats a future edit from the first occurrence as an edit to everything', () => {
    // Splitting at the very first occurrence would leave an empty first half.
    const master = weeklyMaster()
    const mutation = applyEdit(master, { title: 'Soccer' }, 'future', master.start, [], nextId)
    expect(mutation.appliedScope).toBe('all')
    expect(mutation.createdEvents).toHaveLength(0)
    expect(mutation.updatedMaster.title).toBe('Soccer')
  })

  it('splits COUNT across both halves', () => {
    const master = { ...weeklyMaster(), rule: makeRule({ frequency: 'WEEKLY', weekdays: [2], count: 6 }) }
    const mutation = applyEdit(master, { title: 'New coach' }, 'future', at(2026, 2, 17, 17), [], nextId)
    expect(mutation.updatedMaster.rule?.count).toBe(2)
    expect(mutation.createdEvents[0].rule?.count).toBe(4)
  })

  it('moves later detached copies to the new series', () => {
    const early: Snapshot = {
      ...weeklyMaster(),
      id: 'early',
      start: at(2026, 2, 10, 18),
      end: at(2026, 2, 10, 19),
      rule: null,
      detachedFrom: at(2026, 2, 10, 17),
    }
    const late: Snapshot = { ...early, id: 'late', start: at(2026, 2, 24, 18), detachedFrom: at(2026, 2, 24, 17) }

    const mutation = applyEdit(
      weeklyMaster(),
      { location: 'Riverside Fields' },
      'future',
      at(2026, 2, 17, 17),
      [early, late],
      nextId,
    )

    expect(mutation.reassignedSeries.early).toBeUndefined()
    expect(mutation.reassignedSeries.late).toBe(mutation.createdEvents[0].seriesId)
  })

  it('shifts every occurrence by the same delta for an all-events edit', () => {
    // The user opened the 17 March instance and moved it an hour later.
    const mutation = applyEdit(
      weeklyMaster(),
      { start: at(2026, 2, 17, 18) },
      'all',
      at(2026, 2, 17, 17),
      [],
      nextId,
    )
    expect(mutation.createdEvents).toHaveLength(0)
    // The series start moves by one hour, not to 17 March.
    expect(mutation.updatedMaster.start).toEqual(at(2026, 2, 3, 18))
    expect(mutation.updatedMaster.end).toEqual(at(2026, 2, 3, 19, 30))
  })

  it('shifts exception dates along with an all-events move', () => {
    const master = { ...weeklyMaster(), exceptionDates: [at(2026, 2, 10, 17)] }
    const mutation = applyEdit(master, { start: at(2026, 2, 17, 18) }, 'all', at(2026, 2, 17, 17), [], nextId)
    // An exception that didn't move would stop matching, and the skipped week
    // would silently reappear.
    expect(mutation.updatedMaster.exceptionDates).toEqual([at(2026, 2, 10, 18)])
  })

  it('ignores scope for a non-recurring event', () => {
    const oneOff: Snapshot = { ...weeklyMaster(), rule: null, title: 'Dentist' }
    const mutation = applyEdit(oneOff, { title: 'Dentist — Mika' }, 'future', oneOff.start, [], nextId)
    expect(mutation.appliedScope).toBe('all')
    expect(mutation.createdEvents).toHaveLength(0)
    expect(mutation.updatedMaster.title).toBe('Dentist — Mika')
  })
})

describe('deletes', () => {
  it('adds an exception when deleting one occurrence', () => {
    const mutation = applyDelete(weeklyMaster(), 'single', at(2026, 2, 17, 17))
    expect(mutation.updatedMaster.exceptionDates).toEqual([at(2026, 2, 17, 17)])
    expect(mutation.deletedEventIds).toHaveLength(0)
  })

  it('truncates the rule when deleting future occurrences', () => {
    const mutation = applyDelete(weeklyMaster(), 'future', at(2026, 2, 17, 17))
    expect(occurrences(mutation.updatedMaster, at(2026, 2, 1), at(2026, 4, 1)).map((o) => o.start)).toEqual([
      at(2026, 2, 3, 17),
      at(2026, 2, 10, 17),
    ])
  })

  it('removes the master and its detached copies when deleting everything', () => {
    const detached: Snapshot = {
      ...weeklyMaster(),
      id: 'detached',
      rule: null,
      detachedFrom: at(2026, 2, 24, 17),
    }
    const mutation = applyDelete(weeklyMaster(), 'all', at(2026, 2, 24, 17), [detached])
    expect(new Set(mutation.deletedEventIds)).toEqual(new Set([SERIES, 'detached']))
  })
})
