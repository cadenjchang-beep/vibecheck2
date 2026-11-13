/**
 * Calendar-day arithmetic in a user's time zone. Days are 'YYYY-MM-DD' strings.
 * Streaks, daily goals and review due dates all depend on the user's local
 * day, not the server's.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      f = formatter('UTC');
    }
    formatters.set(timeZone, f);
  }
  return f;
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsIn(date: Date, timeZone: string): Parts {
  const out: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out as unknown as Parts;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The calendar day it is at `date` in `timeZone`. */
export function localDay(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function localHour(date: Date, timeZone: string): number {
  return partsIn(date, timeZone).hour;
}

export function addDays(day: string, amount: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + amount));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const ms = (day: string) => {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** The instant at which `day` begins in `timeZone`. */
export function startOfDay(day: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const target = Date.UTC(y, m - 1, d);
  // Start from "midnight as if UTC" and correct by the zone's offset there.
  // Two passes settle days on which the offset changes (daylight saving).
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess -= shown - target;
  }
  return new Date(guess);
}

/**
 * Current and longest streak from the set of days with study activity.
 * A streak is still alive if the last active day was yesterday: today simply
 * has not been studied yet.
 */
export function computeStreak(activeDays: Iterable<string>, today: string): { current: number; longest: number } {
  const days = [...new Set(activeDays)].sort();
  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = daysBetween(days[i - 1]!, days[i]!) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const last = days[days.length - 1]!;
  const gap = daysBetween(last, today);
  let current = 0;
  if (gap === 0 || gap === 1) {
    current = 1;
    for (let i = days.length - 1; i > 0 && daysBetween(days[i - 1]!, days[i]!) === 1; i--) current++;
  }
  return { current, longest: Math.max(longest, current) };
}
