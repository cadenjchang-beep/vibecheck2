/**
 * Date helpers.
 *
 * Everything in Tend is stored as an ISO string and computed on a `Date` in the
 * browser's local zone. The one rule that matters: a *day* is a calendar day
 * where the user lives, not a UTC day. Meals, all-day events and "due today"
 * all get this wrong if you slice ISO strings.
 */

export const MS_PER_DAY = 86_400_000

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function addYears(date: Date, years: number): Date {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() + years)
  return d
}

/** Sunday-first, matching `Date.getDay()` so weekday maths stays in one numbering. */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  return addDays(d, -d.getDay())
}

export function startOfMonth(date: Date): Date {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** `yyyy-mm-dd` in local time — the key format for meal-plan days. */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function iso(date: Date): string {
  return date.toISOString()
}

export function parse(value: string | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Sets the clock on `date` to the clock of `time`, keeping `date`'s calendar day. */
export function withTimeOf(date: Date, time: Date): Date {
  const d = new Date(date)
  d.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), 0)
  return d
}

// -- Formatting ---------------------------------------------------------------
// One place, so a time never renders two different ways on two screens.

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const shortWeekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const dayMonthFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const fullFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export const formatTime = (d: Date) => timeFmt.format(d)
export const formatWeekday = (d: Date) => weekdayFmt.format(d)
export const formatShortWeekday = (d: Date) => shortWeekdayFmt.format(d)
export const formatDayMonth = (d: Date) => dayMonthFmt.format(d)
export const formatMonthYear = (d: Date) => monthYearFmt.format(d)
export const formatFullDate = (d: Date) => fullFmt.format(d)

export function formatDateTime(d: Date, allDay: boolean): string {
  return allDay ? formatFullDate(d) : `${formatFullDate(d)} at ${formatTime(d)}`
}

/** "3 days ago", "in 2 hours" — for the "updated by" line and Pulse's timestamp. */
export function formatRelative(date: Date, now = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const diff = date.getTime() - now.getTime()
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * MS_PER_DAY],
    ['month', 30 * MS_PER_DAY],
    ['day', MS_PER_DAY],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ]
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return 'just now'
}

/** Localised weekday initials in Sunday-first order, for the month grid and repeat picker. */
export function weekdayInitials(): string[] {
  const base = new Date(2024, 0, 7) // a Sunday
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(addDays(base, i)),
  )
}
