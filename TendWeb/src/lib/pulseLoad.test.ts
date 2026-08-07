import { describe, expect, it } from 'vitest'
import { categorize } from './aisles'
import { compactSummary, generatePulse, pulseKindFor } from './pulse'
import { CAVEAT, observationFor, summarizeLoad, weekWindow, type LoadShare } from './load'
import { emptyData, type HouseholdData, type ListItem, type Task, type TendEvent } from '../types'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min, 0, 0)

/** Wednesday 4 March 2026, 07:00 local. */
const NOW = at(2026, 2, 4, 7)

const SAM = 'member-sam'
const ALEX = 'member-alex'

function household(overrides: Partial<HouseholdData> = {}): HouseholdData {
  return {
    ...emptyData(),
    householdName: 'Test',
    members: [
      { id: SAM, name: 'Sam', colorHex: '#6c8f7e', isChild: false, createdAt: 1 },
      { id: ALEX, name: 'Alex', colorHex: '#c97b5a', isChild: false, createdAt: 2 },
    ],
    ...overrides,
  }
}

function event(title: string, start: Date, end: Date): TendEvent {
  const id = `event-${title}-${start.getTime()}`
  return {
    id,
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    isAllDay: false,
    seriesId: id,
    exceptionDates: [],
    attendeeIds: [],
    createdAt: 1,
  }
}

function task(title: string, fields: Partial<Task> = {}): Task {
  return {
    id: `task-${title}-${fields.completedAt ?? fields.dueDate ?? ''}`,
    title,
    isComplete: false,
    priority: 0,
    createdAt: 1,
    ...fields,
  }
}

function item(text: string, fields: Partial<ListItem> = {}): ListItem {
  return {
    id: `item-${text}-${fields.completedAt ?? ''}`,
    listName: 'Groceries',
    text,
    isChecked: false,
    sortIndex: 0,
    createdAt: 1,
    ...fields,
  }
}

describe('aisle categorisation', () => {
  it('categorises common items', () => {
    expect(categorize('Milk')).toBe('Dairy & Eggs')
    expect(categorize('sourdough')).toBe('Bakery')
    expect(categorize('Chicken thighs')).toBe('Meat & Seafood')
    expect(categorize('spinach')).toBe('Produce')
    expect(categorize('paper towels')).toBe('Household')
  })

  it('prefers the longer keyword', () => {
    // "peanut butter" must not be filed under "butter", nor "ice cream" under "ice".
    expect(categorize('peanut butter')).toBe('Pantry')
    expect(categorize('ice cream')).toBe('Frozen')
    expect(categorize('sour cream')).toBe('Dairy & Eggs')
  })

  it('matches on word boundaries only', () => {
    // "ham" must not catch "hamper".
    expect(categorize('laundry hamper')).not.toBe('Meat & Seafood')
  })

  it('handles plurals', () => {
    expect(categorize('eggs')).toBe('Dairy & Eggs')
    expect(categorize('carrots')).toBe('Produce')
  })

  it('falls back to Other', () => {
    expect(categorize('zzzz widget')).toBe('Other')
  })
})

describe('morning pulse', () => {
  it('leads with the next event', () => {
    const data = household({
      events: [
        event('Dentist', at(2026, 2, 4, 9, 30), at(2026, 2, 4, 10)),
        event('Soccer', at(2026, 2, 4, 17), at(2026, 2, 4, 18)),
      ],
      tasks: [task('Call the plumber', { dueDate: at(2026, 2, 4, 12).toISOString() })],
      items: [item('Milk'), item('Eggs')],
    })

    const snapshot = generatePulse(data, 'morning', NOW)
    expect(snapshot.lines[0].text).toContain('Dentist')
    expect(snapshot.lines[0].text).toContain('then 1 more')
    expect(snapshot.lines.some((l) => l.text === '1 task due today')).toBe(true)
    expect(snapshot.lines.some((l) => l.text === '2 on Groceries')).toBe(true)
  })

  it('calls out carried-over tasks', () => {
    const data = household({
      tasks: [
        task('Overdue thing', { dueDate: at(2026, 2, 1, 12).toISOString() }),
        task('Today thing', { dueDate: at(2026, 2, 4, 12).toISOString() }),
      ],
    })
    const snapshot = generatePulse(data, 'morning', NOW)
    expect(snapshot.lines.some((l) => l.text === '2 tasks due — 1 carried over')).toBe(true)
  })

  it('gives an empty day its own headline rather than a blank screen', () => {
    const snapshot = generatePulse(household(), 'morning', NOW)
    expect(snapshot.headline).toBe('A clear day')
    expect(snapshot.lines).toHaveLength(0)
  })

  it('keeps the compact summary to three parts', () => {
    const data = household({
      events: [event('Dentist', at(2026, 2, 4, 9), at(2026, 2, 4, 10))],
      tasks: [task('Plumber', { dueDate: at(2026, 2, 4, 12).toISOString() })],
      items: [item('Milk')],
    })
    expect(compactSummary(generatePulse(data, 'morning', NOW)).split(' · ')).toHaveLength(3)
  })
})

describe('weekly pulse', () => {
  it('counts trips by distinct days, not by items', () => {
    // Four items across two days is two trips, not four.
    const data = household({
      items: [
        item('Milk', { isChecked: true, completedAt: at(2026, 2, 2, 18).toISOString(), completedBy: SAM }),
        item('Eggs', { isChecked: true, completedAt: at(2026, 2, 2, 18, 5).toISOString(), completedBy: SAM }),
        item('Rice', { isChecked: true, completedAt: at(2026, 2, 4, 10).toISOString(), completedBy: ALEX }),
        item('Kale', { isChecked: true, completedAt: at(2026, 2, 4, 10, 2).toISOString(), completedBy: ALEX }),
      ],
    })
    const snapshot = generatePulse(data, 'weekly', NOW)
    expect(snapshot.lines.map((l) => l.text)).toContain('Groceries cleared 4 items across 2 trips')
  })

  it('flags an unplanned week ahead', () => {
    const snapshot = generatePulse(household(), 'weekly', NOW)
    expect(snapshot.lines.map((l) => l.text)).toContain('No meals planned yet for next week')
  })
})

describe('pulseKindFor', () => {
  it('is weekly only on Sunday evening', () => {
    // Sunday 8 March 2026, 18:00.
    expect(pulseKindFor(at(2026, 2, 8, 18))).toBe('weekly')
  })

  it('stays morning on a weekday evening', () => {
    // The weekly copy says "this week" and "next week" — true on Sunday
    // night, misleading on a Tuesday, so an evening filter alone isn't enough.
    expect(pulseKindFor(NOW)).toBe('morning') // Wednesday, 07:00
    expect(pulseKindFor(at(2026, 2, 4, 20))).toBe('morning') // Wednesday, 20:00
  })

  it('stays morning on Sunday before evening', () => {
    expect(pulseKindFor(at(2026, 2, 8, 9))).toBe('morning')
  })
})

describe('load view', () => {
  const window = weekWindow(NOW)

  const completedTask = (by: string, on: Date) =>
    task(`t-${by}-${on.getTime()}`, { isComplete: true, completedAt: on.toISOString(), completedBy: by })

  const completedItem = (by: string, on: Date) =>
    item(`i-${by}-${on.getTime()}`, { isChecked: true, completedAt: on.toISOString(), completedBy: by })

  it('attributes work to whoever actually did it', () => {
    const summary = summarizeLoad(
      household({
        tasks: [completedTask(SAM, at(2026, 2, 2, 10))],
        items: [completedItem(ALEX, at(2026, 2, 3, 10))],
      }),
      window,
    )
    expect(summary.householdTotal).toBe(2)
    expect(summary.shares.find((s) => s.memberId === SAM)?.counts.tasks).toBe(1)
    expect(summary.shares.find((s) => s.memberId === ALEX)?.counts.lists).toBe(1)
  })

  it('ignores work outside the window', () => {
    const summary = summarizeLoad(
      household({ tasks: [completedTask(SAM, at(2026, 1, 20, 10))] }),
      window,
    )
    expect(summary.householdTotal).toBe(0)
  })

  /** The design rule that keeps this from becoming a scoreboard. */
  it('keeps household order rather than ranking', () => {
    const summary = summarizeLoad(
      household({
        tasks: Array.from({ length: 5 }, (_, i) => completedTask(ALEX, at(2026, 2, 2, 10 + i))),
        items: [completedItem(SAM, at(2026, 2, 3, 10))],
      }),
      window,
    )
    // Alex did five times as much; Sam is still listed first.
    expect(summary.shares.map((s) => s.name)).toEqual(['Sam', 'Alex'])
  })

  it('says nothing when there is barely any data', () => {
    const summary = summarizeLoad(household({ tasks: [completedTask(SAM, at(2026, 2, 2, 10))] }), window)
    expect(summary.observation).toBeNull()
  })

  it('describes rather than prescribes', () => {
    const summary = summarizeLoad(
      household({
        tasks: Array.from({ length: 9 }, (_, i) => completedTask(SAM, at(2026, 2, 2, 8 + i))),
        items: [completedItem(ALEX, at(2026, 2, 3, 10))],
      }),
      window,
    )
    const observation = summary.observation ?? ''
    expect(observation).toContain('Sam')
    for (const forbidden of ['should', 'needs to', 'more than', 'less than', 'winner', '%']) {
      expect(observation.toLowerCase()).not.toContain(forbidden)
    }
  })

  it('describes a balanced week as such', () => {
    const summary = summarizeLoad(
      household({
        tasks: Array.from({ length: 5 }, (_, i) => completedTask(SAM, at(2026, 2, 2, 8 + i))),
        items: Array.from({ length: 5 }, (_, i) => completedItem(ALEX, at(2026, 2, 3, 8 + i))),
      }),
      window,
    )
    expect(summary.observation).toBe('This one was spread fairly evenly.')
  })

  it('always carries the caveat', () => {
    expect(summarizeLoad(household(), window).caveat).toBe(CAVEAT)
  })

  it('never ranks a single active person', () => {
    const shares: LoadShare[] = [
      { memberId: SAM, name: 'Sam', colorHex: '#000', counts: { tasks: 9, lists: 0, events: 0, meals: 0 }, total: 9 },
      { memberId: ALEX, name: 'Alex', colorHex: '#000', counts: { tasks: 0, lists: 0, events: 0, meals: 0 }, total: 0 },
    ]
    // One person doing everything isn't a comparison worth narrating.
    expect(observationFor(shares, 9)).toBeNull()
  })
})
