import { describe, expect, it } from 'vitest'
import { normalizeListName, parseQuickAdd, splitQuantity } from './quickAdd'
import { GROCERIES, HOUSEHOLD_LIST } from '../types'

/** Monday 2 March 2026, 09:00 local — every relative phrase resolves against this. */
const NOW = new Date(2026, 2, 2, 9, 0, 0, 0)
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min, 0, 0)
const parse = (text: string) => parseQuickAdd(text, NOW)

describe('the brief’s own example', () => {
  it('parses a recurring event with a time and a place', () => {
    const result = parse('soccer practice every Tue 5pm at Lincoln Park')

    expect(result.kind).toBe('event')
    expect(result.title.toLowerCase()).toBe('soccer practice')
    expect(result.location).toBe('Lincoln Park')
    expect(result.rule?.frequency).toBe('WEEKLY')
    expect(result.rule?.weekdays).toEqual([2])
    // Typed on a Monday, so the first occurrence is the coming Tuesday — not
    // today, which would contradict the rule that produced it.
    expect(result.start).toEqual(at(2026, 2, 3, 17))
    expect(result.isAllDay).toBe(false)
    expect(result.confidence).toBeGreaterThan(0.5)
  })
})

describe('times', () => {
  it('reads a bare time as today', () => {
    expect(parse('standup 11am').start).toEqual(at(2026, 2, 2, 11))
  })

  it('rolls a time that has already passed to tomorrow', () => {
    // 8am, said at 9am, means tomorrow — not an hour ago.
    expect(parse('gym 8am').start).toEqual(at(2026, 2, 3, 8))
  })

  it('parses a time range', () => {
    const result = parse('book club 7-9pm friday')
    expect(result.start).toEqual(at(2026, 2, 6, 19))
    expect(result.end).toEqual(at(2026, 2, 6, 21))
  })

  it('borrows the meridiem from the end of a range', () => {
    const result = parse('swim 5-7pm')
    expect(result.start).toEqual(at(2026, 2, 2, 17))
    expect(result.end).toEqual(at(2026, 2, 2, 19))
  })

  it('parses a duration', () => {
    const result = parse('piano 4pm for 90 mins')
    expect(result.start).toEqual(at(2026, 2, 2, 16))
    expect(result.end).toEqual(at(2026, 2, 2, 17, 30))
  })

  it('lets an explicit time beat an implied one', () => {
    expect(parse('movie tonight').start).toEqual(at(2026, 2, 2, 19))
    expect(parse('movie tonight at 9pm').start).toEqual(at(2026, 2, 2, 21))
  })
})

describe('days', () => {
  it('treats a bare day as all-day', () => {
    const result = parse('library books due tomorrow')
    expect(result.start).toEqual(at(2026, 2, 3))
    expect(result.isAllDay).toBe(true)
  })

  it('reads a bare weekday as the next one', () => {
    expect(parse('haircut thursday 2pm').start).toEqual(at(2026, 2, 5, 14))
  })

  it('skips a week for "next"', () => {
    expect(parse('haircut next thursday 2pm').start).toEqual(at(2026, 2, 12, 14))
  })

  it('parses a month and day', () => {
    expect(parse('passport renewal Apr 14').start).toEqual(at(2026, 3, 14))
  })

  it('parses a relative day offset', () => {
    expect(parse('follow up in 3 days').start).toEqual(at(2026, 2, 5))
  })
})

describe('recurrence vocabulary', () => {
  it('understands "every other <weekday>"', () => {
    const rule = parse('bins out every other wednesday').rule
    expect(rule?.frequency).toBe('WEEKLY')
    expect(rule?.interval).toBe(2)
    expect(rule?.weekdays).toEqual([3])
  })

  it('expands "every weekday" to five days', () => {
    expect(parse('school run every weekday 8am').rule?.weekdays).toEqual([1, 2, 3, 4, 5])
  })

  it('handles several weekdays', () => {
    expect(parse('swim every mon and wed 6pm').rule?.weekdays).toEqual([1, 3])
  })

  it('understands bare adverbs', () => {
    expect(parse('water the plants weekly').rule?.frequency).toBe('WEEKLY')
    expect(parse('check smoke alarms monthly').rule?.frequency).toBe('MONTHLY')
  })
})

describe('lists', () => {
  it('routes by hashtag', () => {
    const result = parse('oat milk #groceries')
    expect(result.kind).toBe('listItem')
    expect(result.listName).toBe(GROCERIES)
    expect(result.title).toBe('oat milk')
  })

  it('routes by phrase', () => {
    const result = parse('add batteries to the household list')
    expect(result.kind).toBe('listItem')
    expect(result.listName).toBe(HOUSEHOLD_LIST)
    expect(result.title).toBe('batteries')
  })

  it('normalises synonymous list names', () => {
    expect(normalizeListName('grocery')).toBe(GROCERIES)
    expect(normalizeListName('shopping')).toBe(GROCERIES)
    expect(normalizeListName('chores')).toBe(HOUSEHOLD_LIST)
  })

  it('treats plain text with no signals as a list item', () => {
    const result = parse('paper towels')
    expect(result.kind).toBe('listItem')
    expect(result.title).toBe('paper towels')
  })

  it('extracts a quantity', () => {
    const result = parse('2 dozen eggs')
    expect(result.kind).toBe('listItem')
    expect(result.title).toBe('eggs')
    expect(result.quantity).toBe('2 dozen')
  })

  it('leaves a bare number alone', () => {
    expect(splitQuantity('12')).toEqual(['12', null])
  })
})

describe('tasks', () => {
  it('makes a task, not an event, when there is a task verb', () => {
    const result = parse('remind me to call the plumber tomorrow')
    expect(result.kind).toBe('task')
    expect(result.title).toBe('call the plumber')
    expect(result.start).toEqual(at(2026, 2, 3))
  })

  it('reads priority bangs', () => {
    const result = parse('renew the passport !!')
    expect(result.kind).toBe('task')
    expect(result.priority).toBe(2)
    expect(result.title).toBe('renew the passport')
  })
})

describe('degenerate input', () => {
  it('extracts mentions', () => {
    const result = parse('dentist 9am @mika')
    expect(result.mentions).toEqual(['mika'])
    expect(result.title).toBe('dentist')
  })

  it('is harmless on empty input', () => {
    const result = parse('   ')
    expect(result.title).toBe('')
    expect(result.confidence).toBe(0)
  })

  it('keeps the whole title when nothing parses', () => {
    const result = parse('asdkjh qweoiu')
    expect(result.title).toBe('asdkjh qweoiu')
    expect(result.kind).toBe('listItem')
    // Low confidence is the signal the UI uses to show its work rather than
    // saving silently.
    expect(result.confidence).toBeLessThan(0.5)
  })

  it('does not mistake a place for a time', () => {
    const result = parse('pickup at 3pm at Northside School')
    expect(result.start).toEqual(at(2026, 2, 2, 15))
    expect(result.location).toBe('Northside School')
    expect(result.title).toBe('pickup')
  })
})
