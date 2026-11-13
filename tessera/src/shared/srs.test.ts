import { describe, expect, it } from 'vitest';
import { DEFAULT_EASE, isDue, MAX_INTERVAL_DAYS, MIN_EASE, NEW_SCHEDULE, previewIntervals, RELEARN_MINUTES, schedule, type Rating, type Schedule } from './srs';

const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);

/** Reviews a card on its due date each time, as a diligent learner would. */
function run(ratings: Rating[], start = at('2026-03-01T09:00:00Z')): { states: Schedule[]; intervals: number[] } {
  let state = NEW_SCHEDULE;
  let now = start;
  const states: Schedule[] = [];
  for (const rating of ratings) {
    state = schedule(state, rating, now);
    states.push(state);
    now = new Date(Math.max(now.getTime(), new Date(state.dueAt!).getTime()) + 9 * 3_600_000);
  }
  return { states, intervals: states.map((s) => s.intervalDays) };
}

describe('spaced-repetition scheduler', () => {
  it('follows the SM-2 progression for repeated "good" reviews: 1, 6, then × ease', () => {
    const { intervals, states } = run([3, 3, 3, 3, 3]);
    expect(intervals).toEqual([1, 6, 15, 38, 95]);
    // "Good" never changes the ease factor.
    expect(states.every((s) => s.easeFactor === DEFAULT_EASE)).toBe(true);
    expect(states.map((s) => s.repetitions)).toEqual([1, 2, 3, 4, 5]);
  });

  it('changes ease by the SM-2 amounts for hard and easy', () => {
    expect(schedule(NEW_SCHEDULE, 2, at('2026-03-01T09:00:00Z')).easeFactor).toBeCloseTo(2.36, 5);
    expect(schedule(NEW_SCHEDULE, 3, at('2026-03-01T09:00:00Z')).easeFactor).toBeCloseTo(2.5, 5);
    expect(schedule(NEW_SCHEDULE, 4, at('2026-03-01T09:00:00Z')).easeFactor).toBeCloseTo(2.6, 5);
  });

  it('"again" sends the card back to the start, due in ten minutes, and lowers ease', () => {
    const now = at('2026-03-10T12:00:00Z');
    const learned: Schedule = { ...NEW_SCHEDULE, repetitions: 3, intervalDays: 15, dueAt: now.toISOString() };
    const next = schedule(learned, 1, now);
    expect(next.repetitions).toBe(0);
    expect(next.intervalDays).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.easeFactor).toBeCloseTo(2.3, 5);
    expect(new Date(next.dueAt!).getTime() - now.getTime()).toBe(RELEARN_MINUTES * 60_000);
    // Relearning starts over at one day.
    expect(schedule(next, 3, new Date(now.getTime() + 11 * 60_000)).intervalDays).toBe(1);
  });

  it('failing a card that was never learned is not counted as a lapse', () => {
    expect(schedule(NEW_SCHEDULE, 1, at('2026-03-01T09:00:00Z')).lapses).toBe(0);
  });

  it('never lets ease fall below the floor, however often a card is forgotten', () => {
    let state = NEW_SCHEDULE;
    let now = at('2026-03-01T09:00:00Z');
    for (let i = 0; i < 30; i++) {
      state = schedule(state, 1, now);
      now = new Date(now.getTime() + DAY);
    }
    expect(state.easeFactor).toBe(MIN_EASE);
    for (let i = 0; i < 30; i++) state = schedule(state, 2, now);
    expect(state.easeFactor).toBe(MIN_EASE);
  });

  it('always orders the outcomes hard ≤ good ≤ easy, and every pass moves the card later', () => {
    const cases: Schedule[] = [
      NEW_SCHEDULE,
      { ...NEW_SCHEDULE, repetitions: 1, intervalDays: 1 },
      { ...NEW_SCHEDULE, repetitions: 2, intervalDays: 6 },
      { ...NEW_SCHEDULE, repetitions: 5, intervalDays: 40, easeFactor: MIN_EASE },
      { ...NEW_SCHEDULE, repetitions: 9, intervalDays: 400, easeFactor: 3.1 },
    ];
    for (const current of cases) {
      const now = at('2026-06-01T15:30:00Z');
      const hard = schedule(current, 2, now);
      const good = schedule(current, 3, now);
      const easy = schedule(current, 4, now);
      expect(hard.intervalDays).toBeLessThanOrEqual(good.intervalDays);
      expect(good.intervalDays).toBeLessThanOrEqual(easy.intervalDays);
      for (const next of [hard, good, easy]) {
        expect(next.intervalDays).toBeGreaterThanOrEqual(1);
        expect(new Date(next.dueAt!).getTime()).toBeGreaterThan(now.getTime());
        expect(next.repetitions).toBe(current.repetitions + 1);
      }
      if (current.repetitions >= 2) expect(hard.intervalDays).toBeGreaterThan(current.intervalDays);
    }
  });

  it('caps the interval so a card is never scheduled absurdly far away', () => {
    const old: Schedule = { ...NEW_SCHEDULE, repetitions: 12, intervalDays: 3000, easeFactor: 3 };
    expect(schedule(old, 4, at('2026-01-01T00:00:00Z')).intervalDays).toBe(MAX_INTERVAL_DAYS);
  });

  it('makes cards due at the start of the local day, so the queue is a daily one', () => {
    // 9pm in New York on 1 March. "Good" on a new card is due at local midnight on 2 March.
    const now = at('2026-03-02T02:00:00Z');
    const next = schedule(NEW_SCHEDULE, 3, now, 'America/New_York');
    expect(next.dueAt).toBe('2026-03-02T05:00:00.000Z');
    // The same moment for someone in Tokyo is already 2 March, so it is due on the 3rd there.
    expect(schedule(NEW_SCHEDULE, 3, now, 'Asia/Tokyo').dueAt).toBe('2026-03-02T15:00:00.000Z');
    // Studying the next morning finds the card due, whatever time yesterday's review was.
    expect(isDue(next.dueAt, at('2026-03-02T13:00:00Z'))).toBe(true);
    expect(isDue(next.dueAt, at('2026-03-02T04:00:00Z'))).toBe(false);
  });

  it('handles days when the clocks change', () => {
    // US daylight saving starts on 8 March 2026: local midnight moves from UTC-5 to UTC-4.
    const before = schedule(NEW_SCHEDULE, 3, at('2026-03-07T18:00:00Z'), 'America/New_York');
    expect(before.dueAt).toBe('2026-03-08T05:00:00.000Z');
    const after = schedule(NEW_SCHEDULE, 3, at('2026-03-08T18:00:00Z'), 'America/New_York');
    expect(after.dueAt).toBe('2026-03-09T04:00:00.000Z');
  });

  it('previews exactly what each button will do', () => {
    const current: Schedule = { ...NEW_SCHEDULE, repetitions: 2, intervalDays: 6 };
    const preview = previewIntervals(current);
    const now = at('2026-03-01T09:00:00Z');
    expect(preview[1]).toEqual({ minutes: RELEARN_MINUTES });
    for (const rating of [2, 3, 4] as const) {
      expect(preview[rating]).toEqual({ days: schedule(current, rating, now).intervalDays });
    }
    expect(previewIntervals(NEW_SCHEDULE)).toEqual({ 1: { minutes: 10 }, 2: { days: 1 }, 3: { days: 1 }, 4: { days: 4 } });
  });

  it('does not modify the schedule it is given', () => {
    const current: Schedule = { ...NEW_SCHEDULE, repetitions: 2, intervalDays: 6 };
    const copy = { ...current };
    schedule(current, 1, at('2026-03-01T09:00:00Z'));
    schedule(current, 4, at('2026-03-01T09:00:00Z'));
    expect(current).toEqual(copy);
  });

  it('a card with no due date is not due', () => {
    expect(isDue(null, new Date())).toBe(false);
  });
});
