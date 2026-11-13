import { describe, expect, it } from 'vitest';
import { addDays, computeStreak, daysBetween, localDay, startOfDay } from './dates';
import { countStages, masteryPercent } from './progress';
import { applyEvent, demote, NEW_PROGRESS, promote, stageAfterAnswer, stageAfterRating, type AnswerEvent, type CardProgress, type RatingEvent } from './study';

let n = 0;
const answer = (kind: AnswerEvent['kind'], correct: boolean, at = '2026-03-01T10:00:00.000Z'): AnswerEvent => ({
  id: `e${++n}`,
  type: 'answer',
  cardId: 'c1',
  setId: 's1',
  mode: 'learn',
  kind,
  correct,
  at,
});
const rating = (value: RatingEvent['rating'], at = '2026-03-01T10:00:00.000Z'): RatingEvent => ({
  id: `e${++n}`,
  type: 'rating',
  cardId: 'c1',
  setId: 's1',
  mode: 'review',
  rating: value,
  at,
});

describe('the mastery ladder', () => {
  it('climbs one stage per correct answer', () => {
    expect(promote('new', false)).toBe('learning');
    expect(promote('learning', false)).toBe('familiar');
    expect(promote('familiar', true)).toBe('mastered');
    expect(promote('mastered', true)).toBe('mastered');
  });

  it('needs recall, not just recognition, to reach mastered', () => {
    expect(promote('familiar', false)).toBe('familiar');
    for (const kind of ['mc', 'tf', 'matching', 'flashcard'] as const) expect(stageAfterAnswer('familiar', kind, true, 3)).toBe('familiar');
    expect(stageAfterAnswer('familiar', 'written', true, 3)).toBe('mastered');
    // Recognition does not take mastery away either.
    expect(stageAfterAnswer('mastered', 'mc', true, 3)).toBe('mastered');
  });

  it('takes two correct answers in a row to leave "learning"', () => {
    expect(stageAfterAnswer('learning', 'mc', true, 0)).toBe('learning');
    expect(stageAfterAnswer('learning', 'mc', true, 1)).toBe('familiar');
    expect(stageAfterAnswer('learning', 'written', true, 0)).toBe('learning');
    // A first correct answer on a new card still counts.
    expect(stageAfterAnswer('new', 'mc', true, 0)).toBe('learning');
  });

  it('drops one stage on a wrong answer, but never back to new', () => {
    expect(demote('mastered')).toBe('familiar');
    expect(demote('familiar')).toBe('learning');
    expect(demote('learning')).toBe('learning');
    expect(demote('new')).toBe('learning');
  });

  it('moves with review ratings', () => {
    expect(stageAfterRating('mastered', 1)).toBe('learning');
    expect(stageAfterRating('familiar', 2)).toBe('familiar');
    expect(stageAfterRating('new', 2)).toBe('learning');
    expect(stageAfterRating('familiar', 3)).toBe('mastered');
    expect(stageAfterRating('learning', 4)).toBe('familiar');
  });
});

describe('applying study events', () => {
  it('takes a card from new to mastered: two choice answers, then a typed one', () => {
    let p: CardProgress | undefined;
    p = applyEvent(p, answer('mc', true));
    expect(p.stage).toBe('learning');
    p = applyEvent(p, answer('tf', true));
    expect(p.stage).toBe('familiar');
    p = applyEvent(p, answer('written', true));
    expect(p.stage).toBe('mastered');
    expect(p).toMatchObject({ correctCount: 3, incorrectCount: 0, streak: 3 });
  });

  it('a miss costs an extra correct answer compared with getting it right first time', () => {
    const answersToMaster = (first: boolean) => {
      let p = applyEvent(undefined, answer('mc', first));
      let count = 1;
      while (p.stage !== 'mastered') {
        p = applyEvent(p, answer(p.stage === 'familiar' ? 'written' : 'mc', true));
        count++;
      }
      return count;
    };
    expect(answersToMaster(true)).toBe(3);
    expect(answersToMaster(false)).toBe(4);
  });

  it('counts answers and resets the streak on a miss', () => {
    let p = applyEvent(undefined, answer('mc', true));
    p = applyEvent(p, answer('mc', true));
    p = applyEvent(p, answer('written', false));
    expect(p).toMatchObject({ stage: 'learning', correctCount: 2, incorrectCount: 1, streak: 0 });
  });

  it('queues a card studied for the first time for tomorrow, in the learner\'s time zone', () => {
    const p = applyEvent(undefined, answer('mc', true, '2026-03-02T02:00:00.000Z'), 'America/New_York');
    expect(p.dueAt).toBe('2026-03-02T05:00:00.000Z');
    // Practice does not touch the spaced-repetition numbers.
    expect(p).toMatchObject({ repetitions: 0, intervalDays: 0, easeFactor: 2.5 });
  });

  it('puts a card answered wrongly straight into the review queue', () => {
    const scheduled: CardProgress = { ...NEW_PROGRESS, stage: 'mastered', repetitions: 4, intervalDays: 30, dueAt: '2026-04-01T00:00:00.000Z' };
    const p = applyEvent(scheduled, answer('written', false, '2026-03-05T08:00:00.000Z'));
    expect(p.dueAt).toBe('2026-03-05T08:00:00.000Z');
    expect(p).toMatchObject({ stage: 'familiar', repetitions: 4, intervalDays: 30, easeFactor: 2.5 });
  });

  it('leaves an existing schedule alone when practice goes well', () => {
    const scheduled: CardProgress = { ...NEW_PROGRESS, stage: 'familiar', repetitions: 2, intervalDays: 6, dueAt: '2026-03-07T00:00:00.000Z' };
    expect(applyEvent(scheduled, answer('mc', true)).dueAt).toBe('2026-03-07T00:00:00.000Z');
    // An overdue card stays overdue rather than being pushed back.
    const overdue = { ...scheduled, dueAt: '2026-02-01T00:00:00.000Z' };
    expect(applyEvent(overdue, answer('mc', false)).dueAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('review ratings drive the schedule and the stage together', () => {
    let p = applyEvent(undefined, rating(3, '2026-03-01T10:00:00.000Z'));
    expect(p).toMatchObject({ stage: 'learning', repetitions: 1, intervalDays: 1, correctCount: 1 });
    p = applyEvent(p, rating(3, '2026-03-02T10:00:00.000Z'));
    expect(p).toMatchObject({ stage: 'familiar', repetitions: 2, intervalDays: 6 });
    p = applyEvent(p, rating(4, '2026-03-08T10:00:00.000Z'));
    expect(p.stage).toBe('mastered');
    p = applyEvent(p, rating(1, '2026-04-01T10:00:00.000Z'));
    expect(p).toMatchObject({ stage: 'learning', repetitions: 0, lapses: 1, streak: 0, incorrectCount: 1 });
  });

  it('keeps the star and does not modify its input', () => {
    const starred: CardProgress = { ...NEW_PROGRESS, starred: true };
    const copy = { ...starred };
    expect(applyEvent(starred, answer('mc', true)).starred).toBe(true);
    expect(applyEvent(starred, rating(1)).starred).toBe(true);
    expect(starred).toEqual(copy);
  });

  it('gives the same result on the device and on the server for the same events', () => {
    const events = [answer('mc', true), answer('mc', false), rating(3), answer('written', true), rating(1), rating(4)];
    const replay = () => events.reduce<CardProgress | undefined>((p, e) => applyEvent(p, e, 'Europe/Paris'), undefined);
    expect(replay()).toEqual(replay());
  });
});

describe('mastery of a set', () => {
  it('averages stage weights over every card, counting unstudied cards as new', () => {
    expect(masteryPercent([], 10)).toBe(0);
    expect(masteryPercent(['mastered', 'mastered'], 2)).toBe(100);
    expect(masteryPercent(['mastered', 'familiar', 'learning', 'new'], 4)).toBe(50);
    // Two of ten cards mastered, the rest untouched.
    expect(masteryPercent(['mastered', 'mastered'], 10)).toBe(20);
    expect(masteryPercent([], 0)).toBe(0);
  });

  it('counts cards per stage', () => {
    expect(countStages(['mastered', 'learning', 'learning'], 6)).toEqual({ new: 3, learning: 2, familiar: 0, mastered: 1 });
  });
});

describe('calendar days and streaks', () => {
  it('finds the local day for a moment in time', () => {
    const moment = new Date('2026-03-02T02:00:00Z');
    expect(localDay(moment, 'UTC')).toBe('2026-03-02');
    expect(localDay(moment, 'America/New_York')).toBe('2026-03-01');
    expect(localDay(moment, 'Asia/Tokyo')).toBe('2026-03-02');
    expect(localDay(moment, 'Not/AZone')).toBe('2026-03-02');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3);
  });

  it('finds the start of a local day', () => {
    expect(startOfDay('2026-07-01', 'UTC').toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(startOfDay('2026-07-01', 'Europe/Paris').toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(startOfDay('2026-01-01', 'Asia/Kolkata').toISOString()).toBe('2025-12-31T18:30:00.000Z');
  });

  it('counts a streak of consecutive days', () => {
    expect(computeStreak([], '2026-03-10')).toEqual({ current: 0, longest: 0 });
    expect(computeStreak(['2026-03-10'], '2026-03-10')).toEqual({ current: 1, longest: 1 });
    expect(computeStreak(['2026-03-08', '2026-03-09', '2026-03-10'], '2026-03-10')).toEqual({ current: 3, longest: 3 });
  });

  it('keeps a streak alive until the end of the following day', () => {
    const days = ['2026-03-07', '2026-03-08', '2026-03-09'];
    expect(computeStreak(days, '2026-03-10').current).toBe(3); // not studied yet today
    expect(computeStreak(days, '2026-03-11').current).toBe(0); // a whole day missed
    expect(computeStreak(days, '2026-03-11').longest).toBe(3);
  });

  it('starts again after a gap and remembers the longest run', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-08', '2026-03-09'];
    expect(computeStreak(days, '2026-03-09')).toEqual({ current: 2, longest: 4 });
  });

  it('ignores duplicate and out-of-order days, as offline sync can deliver them', () => {
    expect(computeStreak(['2026-03-10', '2026-03-08', '2026-03-09', '2026-03-09'], '2026-03-10')).toEqual({ current: 3, longest: 3 });
  });
});
