import { describe, expect, it } from 'vitest'
import { agendaDateLabel, capOccurrences, filterOccurrences, groupByDay, matchesFilter } from './agenda'
import type { ExpandedEvent } from './eventStore'
import type { TendEvent } from '../types'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min, 0, 0)

function occurrence(
  title: string,
  start: Date,
  fields: Partial<TendEvent> = {},
): ExpandedEvent {
  const event: TendEvent = {
    id: `event-${title}-${start.getTime()}`,
    title,
    start: start.toISOString(),
    end: start.toISOString(),
    isAllDay: false,
    seriesId: `series-${title}`,
    exceptionDates: [],
    attendeeIds: [],
    createdAt: 1,
    ...fields,
  }
  return { event, start, end: start, isDetached: false, occurrenceStart: start }
}

describe('matchesFilter', () => {
  it('matches on title, case-insensitively', () => {
    const soccer = occurrence('Soccer practice', at(2026, 2, 3))
    expect(matchesFilter(soccer, { search: 'SOCCER', memberIds: [] })).toBe(true)
    expect(matchesFilter(soccer, { search: 'dentist', memberIds: [] })).toBe(false)
  })

  it('matches on location', () => {
    const dentist = occurrence('Dentist', at(2026, 2, 3), { location: 'Bright Smiles' })
    expect(matchesFilter(dentist, { search: 'bright', memberIds: [] })).toBe(true)
  })

  it('shows everything when the search is blank', () => {
    const event = occurrence('Anything', at(2026, 2, 3))
    expect(matchesFilter(event, { search: '   ', memberIds: [] })).toBe(true)
  })

  it('filters by attendee', () => {
    const sam = occurrence('Dentist', at(2026, 2, 3), { attendeeIds: ['sam'] })
    const alex = occurrence('Soccer', at(2026, 2, 3), { attendeeIds: ['alex'] })
    expect(matchesFilter(sam, { search: '', memberIds: ['sam'] })).toBe(true)
    expect(matchesFilter(alex, { search: '', memberIds: ['sam'] })).toBe(false)
  })

  it('ORs multiple selected members rather than ANDing them', () => {
    // Most events have one or two attendees; requiring every selected person
    // to be on every event would mostly return nothing.
    const sam = occurrence('Dentist', at(2026, 2, 3), { attendeeIds: ['sam'] })
    expect(matchesFilter(sam, { search: '', memberIds: ['sam', 'alex'] })).toBe(true)
  })

  it('combines search and member filters', () => {
    const samSoccer = occurrence('Soccer', at(2026, 2, 3), { attendeeIds: ['sam'] })
    const samDentist = occurrence('Dentist', at(2026, 2, 3), { attendeeIds: ['sam'] })
    const filter = { search: 'soccer', memberIds: ['sam'] }
    expect(matchesFilter(samSoccer, filter)).toBe(true)
    expect(matchesFilter(samDentist, filter)).toBe(false)
  })
})

describe('filterOccurrences', () => {
  it('keeps only the occurrences that match, in their original order', () => {
    const list = [
      occurrence('Soccer', at(2026, 2, 3)),
      occurrence('Dentist', at(2026, 2, 4)),
      occurrence('Soccer tournament', at(2026, 2, 5)),
    ]
    const result = filterOccurrences(list, { search: 'soccer', memberIds: [] })
    expect(result.map((o) => o.event.title)).toEqual(['Soccer', 'Soccer tournament'])
  })

  it('returns everything when the filter is empty', () => {
    const list = [occurrence('A', at(2026, 2, 3)), occurrence('B', at(2026, 2, 4))]
    expect(filterOccurrences(list, { search: '', memberIds: [] })).toEqual(list)
  })
})

describe('groupByDay', () => {
  it('groups same-day occurrences together, in order', () => {
    const groups = groupByDay([
      occurrence('Breakfast', at(2026, 2, 3, 8)),
      occurrence('Lunch', at(2026, 2, 3, 12)),
      occurrence('Dinner', at(2026, 2, 4, 18)),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].occurrences.map((o) => o.event.title)).toEqual(['Breakfast', 'Lunch'])
    expect(groups[1].occurrences.map((o) => o.event.title)).toEqual(['Dinner'])
  })

  it('keys groups so two different days never collide', () => {
    const groups = groupByDay([occurrence('A', at(2026, 2, 3)), occurrence('B', at(2026, 3, 3))])
    expect(groups.map((g) => g.key)).toEqual(['2026-03-03', '2026-04-03'])
  })

  it('returns nothing for an empty list', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('agendaDateLabel', () => {
  const today = at(2026, 2, 4)

  it('names today, tomorrow and yesterday', () => {
    expect(agendaDateLabel(at(2026, 2, 4), today)).toBe('Today')
    expect(agendaDateLabel(at(2026, 2, 5), today)).toBe('Tomorrow')
    expect(agendaDateLabel(at(2026, 2, 3), today)).toBe('Yesterday')
  })

  it('formats other dates as weekday + date, within the current year', () => {
    expect(agendaDateLabel(at(2026, 2, 10), today)).toBe('Tue, Mar 10')
  })

  it('adds the year once a date crosses into a different one', () => {
    expect(agendaDateLabel(at(2027, 0, 5), today)).toBe('Tue, Jan 5, 2027')
  })
})

describe('capOccurrences', () => {
  it('passes a short list through untouched', () => {
    const list = [occurrence('A', at(2026, 2, 3))]
    expect(capOccurrences(list, 10)).toEqual({ shown: list, truncated: 0 })
  })

  it('caps a long list and reports how much was cut', () => {
    const list = Array.from({ length: 12 }, (_, i) => occurrence(`E${i}`, at(2026, 2, 3 + i)))
    const { shown, truncated } = capOccurrences(list, 10)
    expect(shown).toHaveLength(10)
    expect(truncated).toBe(2)
  })
})
