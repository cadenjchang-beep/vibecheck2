import { addDays, localDay, startOfDay } from './dates';

/**
 * Spaced-repetition scheduling in the SM-2 family.
 *
 * After each review the learner rates their recall. A pass lengthens the
 * interval by the card's ease factor; a fail sends the card back to be
 * relearned a few minutes later.
 *
 *   again (1)  forgot it        → back to the start, due in 10 minutes, ease −0.20
 *   hard  (2)  recalled, barely → interval × 1.2,                        ease −0.14
 *   good  (3)  recalled         → interval × ease,                       ease unchanged
 *   easy  (4)  effortless       → interval × ease × 1.3,                 ease +0.10
 *
 * The ease changes for hard/good/easy are SM-2's own formula at qualities 3,
 * 4 and 5. The first two passes use fixed intervals (1 then 6 days), also as
 * in SM-2. Two deliberate differences: "again" lowers ease (as Anki does) so a
 * card that keeps being forgotten comes round sooner, and due dates fall on
 * the start of a local calendar day so the queue is a daily one.
 */

export const RATINGS = [1, 2, 3, 4] as const;
export type Rating = (typeof RATINGS)[number];
export const RATING_NAMES: Record<Rating, 'again' | 'hard' | 'good' | 'easy'> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_INTERVAL_DAYS = 3650;
export const RELEARN_MINUTES = 10;

export interface Schedule {
  easeFactor: number;
  /** Days between the last review and the next; 0 while (re)learning. */
  intervalDays: number;
  /** Consecutive passes since the card was new or last forgotten. */
  repetitions: number;
  lapses: number;
  dueAt: string | null;
  lastReviewedAt: string | null;
}

export const NEW_SCHEDULE: Schedule = {
  easeFactor: DEFAULT_EASE,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
  dueAt: null,
  lastReviewedAt: null,
};

/** SM-2 quality (0-5) each passing rating stands for. */
const QUALITY: Record<Exclude<Rating, 1>, number> = { 2: 3, 3: 4, 4: 5 };

function nextEase(ease: number, rating: Rating): number {
  if (rating === 1) return Math.max(MIN_EASE, round2(ease - 0.2));
  const q = QUALITY[rating];
  return Math.max(MIN_EASE, round2(ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const cap = (days: number) => Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)));

/** The interval, in days, each passing rating would give. Always hard ≤ good ≤ easy. */
function passIntervals(schedule: Schedule): Record<Exclude<Rating, 1>, number> {
  if (schedule.repetitions === 0) return { 2: 1, 3: 1, 4: 4 };
  if (schedule.repetitions === 1) return { 2: 3, 3: 6, 4: 8 };
  const base = Math.max(1, schedule.intervalDays);
  const hard = cap(Math.max(base + 1, base * 1.2));
  const good = cap(Math.max(hard + 1, base * nextEase(schedule.easeFactor, 3)));
  const easy = cap(Math.max(good + 1, base * nextEase(schedule.easeFactor, 4) * 1.3));
  return { 2: hard, 3: good, 4: easy };
}

/** When a card passed today with `intervalDays` comes due: the start of that local day. */
export function dueAfterDays(now: Date, intervalDays: number, timeZone: string): Date {
  return startOfDay(addDays(localDay(now, timeZone), intervalDays), timeZone);
}

/** The schedule after rating a review at `now`. Pure: returns a new object. */
export function schedule(current: Schedule, rating: Rating, now: Date, timeZone = 'UTC'): Schedule {
  const easeFactor = nextEase(current.easeFactor, rating);
  const lastReviewedAt = now.toISOString();
  if (rating === 1) {
    return {
      easeFactor,
      intervalDays: 0,
      repetitions: 0,
      // Forgetting a card that had been learned is a lapse; failing a new one is not.
      lapses: current.lapses + (current.repetitions > 0 ? 1 : 0),
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60_000).toISOString(),
      lastReviewedAt,
    };
  }
  const intervalDays = passIntervals(current)[rating];
  return {
    easeFactor,
    intervalDays,
    repetitions: current.repetitions + 1,
    lapses: current.lapses,
    dueAt: dueAfterDays(now, intervalDays, timeZone).toISOString(),
    lastReviewedAt,
  };
}

/** What each button would do, for showing "10 min", "1 day", "6 days" on the buttons. */
export function previewIntervals(current: Schedule): Record<Rating, { minutes: number } | { days: number }> {
  const pass = passIntervals(current);
  return { 1: { minutes: RELEARN_MINUTES }, 2: { days: pass[2] }, 3: { days: pass[3] }, 4: { days: pass[4] } };
}

export function isDue(dueAt: string | null, now: Date): boolean {
  return dueAt !== null && new Date(dueAt).getTime() <= now.getTime();
}
