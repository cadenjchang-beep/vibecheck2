/**
 * Turns "soccer practice every Tue 5pm at Lincoln Park" into a structured
 * recurring event, with no form to fill in.
 *
 * The constraint is capture friction: anything that makes the user stop and
 * correct the parse is worse than not parsing at all. So this is conservative —
 * it only claims a field when the pattern is unambiguous, and it reports a
 * confidence so the UI can show its work instead of asserting.
 *
 * Vocabulary is English. There's no `NSDataDetector` on the web, so unlike the
 * iOS version there's no localised fallback — a non-English phrase falls
 * through to "list item with the text you typed", which is at least never wrong.
 */

import { addDays, startOfDay, withTimeOf } from './dates'
import { GROCERIES, HOUSEHOLD_LIST } from '../types'
import { makeRule, type RecurrenceRule } from './recurrence'

export type QuickAddKind = 'event' | 'task' | 'listItem'

interface TimeOfDay {
  h: number
  m: number
}

export interface QuickAddResult {
  kind: QuickAddKind
  title: string
  start: Date | null
  end: Date | null
  isAllDay: boolean
  rule: RecurrenceRule | null
  location: string | null
  listName: string | null
  quantity: string | null
  priority: number
  /** Names written with `@`, resolved to members by the caller. */
  mentions: string[]
  /** Rough 0–1 sense of how much of the input we understood. */
  confidence: number
}

const WEEKDAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0, sundays: 0,
  mon: 1, monday: 1, mondays: 1,
  tue: 2, tues: 2, tuesday: 2, tuesdays: 2,
  wed: 3, weds: 3, wednesday: 3, wednesdays: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4,
  fri: 5, friday: 5, fridays: 5,
  sat: 6, saturday: 6, saturdays: 6,
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const TASK_VERBS = [
  'remind me to',
  'remember to',
  "don't forget to",
  'dont forget to',
  'need to',
  'todo',
  'to-do',
  'task',
]

/**
 * Reads a variable that is only ever assigned inside a callback.
 *
 * TypeScript's control-flow analysis can't see through the `replaceAll`
 * callbacks below, so it narrows those variables to `null` and then refuses
 * property access on them. Passing the value through a function yields the
 * declared type rather than the narrowed one — the type argument has to be
 * explicit, since inference would pick up the narrowed type too. Runtime
 * behaviour is unaffected; this is purely about what the compiler can prove.
 */
function assigned<T>(value: T | null): T | null {
  return value
}

/** Replaces each match with whatever `transform` returns, collecting side effects. */
function replaceAll(
  text: string,
  pattern: RegExp,
  transform: (groups: (string | undefined)[]) => string,
): string {
  return text.replace(pattern, (...args) => {
    // The trailing args are offset and the whole string (and possibly groups).
    const groups = args.slice(0, -2).map((g) => (typeof g === 'string' ? g : undefined))
    return transform(groups as (string | undefined)[])
  })
}

export function normalizeListName(raw: string): string {
  const cleaned = raw.trim().toLowerCase()
  // "grocery", "groceries" and "shopping" all mean one list to a person, and a
  // household that ends up with three of them has been let down by the app.
  if (['grocery', 'groceries', 'shopping', 'food', 'supermarket'].includes(cleaned)) return GROCERIES
  if (['household', 'house', 'home', 'chores'].includes(cleaned)) return HOUSEHOLD_LIST
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** "2 dozen eggs" → ["eggs", "2 dozen"]; "milk" → ["milk", null]. */
export function splitQuantity(text: string): [string, string | null] {
  let quantity: string | null = null
  const stripped = replaceAll(
    text,
    /^\s*(\d+(?:\.\d+)?\s*(?:x|dozen|lbs?|oz|kgs?|g|ml|l|liters?|litres?|cans?|bags?|boxes|bottles?|packs?)?)\s+/i,
    (g) => {
      quantity = (g[1] ?? '').trim()
      return ''
    },
  )
  const title = tidy(stripped)
  // A quantity with nothing left over was never a quantity.
  return title ? [title, quantity] : [tidy(text), null]
}

function tidy(text: string): string {
  let result = text.replace(/\s{2,}/g, ' ').trim()
  // Strip prepositions and articles that only made sense next to a token we
  // already consumed.
  result = result.replace(/^(?:add|at|on|the|a|an|to|for|with|of)\b\s*/i, '')
  result = result.replace(/\s*\b(?:at|on|to|for|with|from|the)\s*$/i, '')
  return result.trim()
}

function hour24(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour
  if (meridiem.toLowerCase() === 'pm') return hour === 12 ? 12 : hour + 12
  return hour === 12 ? 0 : hour
}

/** Next date on or after `from` whose weekday is in `weekdays`, keeping the time. */
function alignToWeekday(date: Date, weekdays: number[]): Date {
  if (!weekdays.length) return date
  const wanted = new Set(weekdays)
  let candidate = date
  for (let i = 0; i < 7; i++) {
    if (wanted.has(candidate.getDay())) return candidate
    candidate = addDays(candidate, 1)
  }
  return date
}

function ruleFromUnitPhrase(phrase: string, interval: number): RecurrenceRule | null {
  const words = phrase
    .toLowerCase()
    .replace(/&/g, ',')
    .replace(/\band\b/g, ',')
    .split(/[,\s]+/)
    .map((w) => w.trim())
    .filter(Boolean)

  if (words.length === 1 && (words[0] === 'weekday' || words[0] === 'weekdays')) {
    return makeRule({ frequency: 'WEEKLY', interval, weekdays: [1, 2, 3, 4, 5] })
  }
  if (words.length === 1 && (words[0] === 'weekend' || words[0] === 'weekends')) {
    return makeRule({ frequency: 'WEEKLY', interval, weekdays: [0, 6] })
  }

  const weekdays = words.map((w) => WEEKDAY_WORDS[w]).filter((d) => d !== undefined)
  if (weekdays.length && weekdays.length === words.length) {
    return makeRule({ frequency: 'WEEKLY', interval, weekdays })
  }

  switch (words[0]) {
    case 'day':
    case 'days':
      return makeRule({ frequency: 'DAILY', interval })
    case 'week':
    case 'weeks':
      return makeRule({ frequency: 'WEEKLY', interval })
    case 'month':
    case 'months':
      return makeRule({ frequency: 'MONTHLY', interval })
    case 'year':
    case 'years':
      return makeRule({ frequency: 'YEARLY', interval })
    default:
      return null
  }
}

export function parseQuickAdd(input: string, now = new Date()): QuickAddResult {
  let text = input.trim()
  if (!text) {
    return {
      kind: 'listItem', title: '', start: null, end: null, isAllDay: false, rule: null,
      location: null, listName: null, quantity: null, priority: 0, mentions: [], confidence: 0,
    }
  }

  let signals = 0
  const mentions: string[] = []
  let priority = 0
  let listName: string | null = null
  let rule: RecurrenceRule | null = null
  let location: string | null = null
  let explicitTask = false

  // 1. Mentions first, so a name can never be mistaken for a place or a weekday.
  text = replaceAll(text, /@([\p{L}][\p{L}'-]*)/gu, (g) => {
    if (g[1]) mentions.push(g[1])
    return ''
  })
  if (mentions.length) signals++

  // 2. Priority bangs.
  text = replaceAll(text, /(?:\s|^)(!{1,3})(?=\s|$)/g, (g) => {
    priority = Math.max(priority, Math.min((g[1] ?? '').length, 3))
    return ' '
  })
  if (priority > 0) {
    signals++
    explicitTask = true
  }

  // 3. List routing — "#groceries", or "… to the grocery list".
  text = replaceAll(text, /#([\p{L}][\p{L}0-9_-]*)/gu, (g) => {
    if (!listName && g[1]) listName = normalizeListName(g[1])
    return ''
  })
  if (!listName) {
    text = replaceAll(text, /\bto\s+(?:the\s+|my\s+|our\s+)?([\p{L} ]{2,30}?)\s+list\b/giu, (g) => {
      if (!listName && g[1]) listName = normalizeListName(g[1])
      return ''
    })
  }
  if (listName) signals++

  // 4. Recurrence.
  text = replaceAll(
    text,
    /\bevery\s+(other\s+|\d+\s+)?([\p{L}]+(?:\s*(?:,|and|&)\s*[\p{L}]+)*)/giu,
    (g) => {
      if (rule) return ' '
      const rawInterval = (g[1] ?? '').trim().toLowerCase()
      const interval = rawInterval === 'other' ? 2 : Number(rawInterval) || 1
      const unit = g[2]
      if (!unit) return ' '
      rule = ruleFromUnitPhrase(unit, interval)
      return rule ? ' ' : ` every ${g[1] ?? ''}${unit} `
    },
  )
  if (!rule) {
    text = replaceAll(text, /\b(daily|weekly|biweekly|monthly|yearly|annually)\b/gi, (g) => {
      const word = (g[1] ?? '').toLowerCase()
      if (word === 'daily') rule = makeRule({ frequency: 'DAILY' })
      else if (word === 'weekly') rule = makeRule({ frequency: 'WEEKLY' })
      else if (word === 'biweekly') rule = makeRule({ frequency: 'WEEKLY', interval: 2 })
      else if (word === 'monthly') rule = makeRule({ frequency: 'MONTHLY' })
      else rule = makeRule({ frequency: 'YEARLY' })
      return ' '
    })
  }
  if (rule) signals++

  // 5. Timing.
  //
  // These are assigned inside the replace callbacks below. TypeScript can't see
  // through that, so each one is re-read through an explicitly typed local
  // before use rather than relying on narrowing that isn't there.
  let day: Date | null = null
  let startTime: TimeOfDay | null = null
  let endTime: TimeOfDay | null = null
  /** A time a word merely suggests ("tonight"), used only if nothing explicit is typed. */
  let impliedTime: TimeOfDay | null = null
  let isAllDay = false
  let durationMs: number | null = null

  text = replaceAll(text, /\b(today|tonight|tomorrow|yesterday)\b/gi, (g) => {
    if (day) return ' '
    const word = (g[1] ?? '').toLowerCase()
    if (word === 'today') day = startOfDay(now)
    else if (word === 'tonight') {
      day = startOfDay(now)
      impliedTime = { h: 19, m: 0 }
    } else if (word === 'tomorrow') day = addDays(startOfDay(now), 1)
    else day = addDays(startOfDay(now), -1)
    isAllDay = true
    return ' '
  })

  text = replaceAll(
    text,
    /\b(next\s+|this\s+|on\s+)?(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
    (g) => {
      const weekday = WEEKDAY_WORDS[(g[2] ?? '').toLowerCase()]
      if (day || weekday === undefined) return g[0] ?? ' '
      const skipAWeek = (g[1] ?? '').toLowerCase().startsWith('next')
      const today = startOfDay(now)
      // A bare "Saturday" said on a Saturday means the one coming — people say
      // "today" when they mean today.
      let delta = weekday - today.getDay()
      if (delta <= 0) delta += 7
      if (skipAWeek) delta += 7
      day = addDays(today, delta)
      isAllDay = true
      return ' '
    },
  )

  text = replaceAll(text, /\bin\s+(\d{1,3})\s+(days?|weeks?|months?)\b/gi, (g) => {
    if (day) return ' '
    const amount = Number(g[1])
    const unit = (g[2] ?? '').toLowerCase()
    const base = startOfDay(now)
    if (unit.startsWith('day')) day = addDays(base, amount)
    else if (unit.startsWith('week')) day = addDays(base, amount * 7)
    else {
      day = new Date(base)
      day.setMonth(day.getMonth() + amount)
    }
    isAllDay = true
    return ' '
  })

  text = replaceAll(
    text,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi,
    (g) => {
      if (day) return ' '
      const month = MONTHS.indexOf((g[1] ?? '').slice(0, 3).toLowerCase())
      const dayNumber = Number(g[2])
      if (month < 0 || !dayNumber) return ' '
      let candidate = new Date(now.getFullYear(), month, dayNumber)
      if (candidate < startOfDay(now)) candidate = new Date(now.getFullYear() + 1, month, dayNumber)
      day = candidate
      isAllDay = true
      return ' '
    },
  )

  text = replaceAll(text, /\bfor\s+(\d{1,3})\s*(h|hrs?|hours?|m|mins?|minutes?)\b/gi, (g) => {
    const amount = Number(g[1])
    const unit = (g[2] ?? '').toLowerCase()
    durationMs = unit.startsWith('h') ? amount * 3_600_000 : amount * 60_000
    return ' '
  })

  // Ranges before single times, so "5-7pm" is never read as "5" plus garbage.
  text = replaceAll(
    text,
    /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi,
    (g) => {
      if (startTime) return g[0] ?? ' '
      const startHour = Number(g[1])
      const endHour = Number(g[4])
      if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return g[0] ?? ' '
      // A bare start meridiem borrows the end's — "5-7pm" is an evening.
      const endMeridiem = g[6]
      const startMeridiem = g[3] ?? endMeridiem
      startTime = { h: hour24(startHour, startMeridiem), m: Number(g[2] ?? 0) }
      endTime = { h: hour24(endHour, endMeridiem ?? startMeridiem), m: Number(g[5] ?? 0) }
      isAllDay = false
      return ' '
    },
  )

  text = replaceAll(
    text,
    /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at\s+)?(\d{1,2}):(\d{2})\b|\b(noon|midnight)\b/gi,
    (g) => {
      if (startTime) return ' '
      if (g[6]) {
        startTime = { h: g[6].toLowerCase() === 'noon' ? 12 : 0, m: 0 }
      } else if (g[1] !== undefined) {
        startTime = { h: hour24(Number(g[1]), g[3]), m: Number(g[2] ?? 0) }
      } else if (g[4] !== undefined) {
        startTime = { h: Number(g[4]), m: Number(g[5] ?? 0) }
      } else {
        return g[0] ?? ' '
      }
      isAllDay = false
      return ' '
    },
  )

  if (startTime || day) signals++

  // 6. Location last, so "at 5pm" has already been consumed and only a real
  //    "at <place>" is left.
  text = replaceAll(text, /\s(?:at|@)\s+([\p{L}0-9][\p{L}0-9 .'&-]{1,48})$/iu, (g) => {
    const raw = (g[1] ?? '').trim()
    if (!raw) return g[0] ?? ''
    location = raw
    return ''
  })
  if (location) signals++

  // 7. Task vocabulary.
  const lowered = text.toLowerCase()
  if (TASK_VERBS.some((verb) => lowered.includes(verb))) explicitTask = true
  for (const verb of TASK_VERBS) {
    text = text.replace(new RegExp(verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
  }

  const title = tidy(text)

  const implied = assigned<TimeOfDay>(impliedTime)
  if (!startTime && implied) {
    startTime = implied
    isAllDay = false
  }

  // Assemble.
  const at = assigned<TimeOfDay>(startTime)
  let start: Date | null = null
  if (at) {
    const base = day ?? startOfDay(now)
    start = withTimeOf(base, new Date(2000, 0, 1, at.h, at.m))
    // A bare time that has already passed means tomorrow — what a person means
    // at 9pm when they type "standup 9am".
    if (!day && start < now) start = addDays(start, 1)
  } else if (day) {
    start = day
  }

  // A rule with no time at all still needs somewhere to start.
  if (rule && !start) {
    const r = rule as RecurrenceRule
    start = r.weekdays.length ? alignToWeekday(startOfDay(now), r.weekdays) : startOfDay(now)
    isAllDay = true
  }

  // "every Tue 5pm" typed on a Monday means next Tuesday at 5, not today at 5:
  // a weekly rule that names its days must start on one of them, or the first
  // occurrence contradicts the rule that produced it.
  if (rule && start) {
    const r = rule as RecurrenceRule
    if (r.weekdays.length) {
      const aligned = alignToWeekday(start, r.weekdays)
      if (aligned.getTime() !== start.getTime()) start = aligned
    }
  }

  const until = assigned<TimeOfDay>(endTime)
  let end: Date | null = null
  if (start) {
    if (until) {
      let candidate = withTimeOf(start, new Date(2000, 0, 1, until.h, until.m))
      // "10pm to 1am" crosses midnight.
      if (candidate <= start) candidate = addDays(candidate, 1)
      end = candidate
    } else if (durationMs) {
      end = new Date(start.getTime() + durationMs)
      isAllDay = false
    }
  }

  if (until) isAllDay = false

  let kind: QuickAddKind
  if (listName) kind = 'listItem'
  else if (start && !explicitTask) kind = 'event'
  else if (explicitTask || start) kind = 'task'
  else kind = 'listItem'

  let finalTitle = title
  let quantity: string | null = null
  if (kind === 'listItem') {
    ;[finalTitle, quantity] = splitQuantity(title)
  }

  return {
    kind,
    title: finalTitle,
    start,
    end: end ?? (start ? new Date(start.getTime() + (isAllDay ? 0 : 3_600_000)) : null),
    isAllDay,
    rule,
    location,
    listName,
    quantity,
    priority,
    mentions,
    confidence: confidenceFor(signals, finalTitle, input),
  }
}

function confidenceFor(signals: number, title: string, original: string): number {
  if (!title) return 0
  // Understanding more of the line and leaving a sensible title behind both
  // raise confidence; a title that swallowed the whole input means nothing was
  // recognised.
  const recognised = 1 - title.length / Math.max(original.length, 1)
  const structural = Math.min(signals / 3, 1)
  return Math.min(1, Math.max(0.15, 0.45 * structural + 0.55 * recognised))
}
