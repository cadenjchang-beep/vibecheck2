import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@server/db/client';
import { cardProgress } from '@server/db/schema';
import { createUser, guest, sampleSet, cards as makeCards, type TestClient } from './helpers';

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86_400_000;
const rate = (set: any, index: number, rating: 1 | 2 | 3 | 4, at = iso()) => ({
  id: randomUUID(),
  type: 'rating',
  mode: 'review',
  rating,
  cardId: set.cards[index].id,
  setId: set.id,
  at,
});
const sync = (user: TestClient, events: unknown[]) => user.post('/api/study/sync', { events });

/** Pretends time has passed by moving a user's due dates into the past. */
async function makeDue(userId: string) {
  await db.update(cardProgress).set({ dueAt: new Date(Date.now() - 60_000) }).where(eq(cardProgress.userId, userId));
}

describe('the review queue', () => {
  it('is empty for someone who has not studied', async () => {
    const user = await createUser();
    await user.post('/api/sets', sampleSet());
    expect(await user.get('/api/review/queue')).toEqual({ items: [], dueCount: 0 });
    expect(await user.get('/api/review/summary')).toEqual({ dueCount: 0, sets: [], nextDueAt: null });
  });

  it('holds cards only once they are due, and schedules each rating correctly', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet({ title: 'Reviewed', cards: makeCards(4) }));
    // First reviews, rated good: each is due tomorrow, so nothing is due yet.
    await sync(user, [0, 1, 2, 3].map((i) => rate(set, i, 3)));
    let summary = await user.get('/api/review/summary');
    expect(summary.dueCount).toBe(0);
    expect(new Date(summary.nextDueAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(summary.nextDueAt).getTime()).toBeLessThanOrEqual(Date.now() + DAY);

    await makeDue(user.id);
    const queue = await user.get('/api/review/queue');
    expect(queue.dueCount).toBe(4);
    expect(queue.items.map((i: any) => i.card.termPlain).sort()).toEqual(['term 1', 'term 2', 'term 3', 'term 4']);
    expect(queue.items[0]).toMatchObject({ setId: set.id, setTitle: 'Reviewed', termLang: 'en' });
    expect(queue.items[0].progress).toMatchObject({ repetitions: 1, intervalDays: 1 });
    summary = await user.get('/api/review/summary');
    expect(summary.sets).toEqual([{ setId: set.id, title: 'Reviewed', dueCount: 4, cardCount: 4 }]);

    // Second reviews: again, hard, good, easy.
    const result = await sync(user, [rate(set, 0, 1), rate(set, 1, 2), rate(set, 2, 3), rate(set, 3, 4)]);
    const p = (i: number) => result.progress[set.cards[i].id];
    expect(p(0)).toMatchObject({ repetitions: 0, intervalDays: 0, lapses: 1, stage: 'learning' });
    expect(p(1)).toMatchObject({ repetitions: 2, intervalDays: 3 });
    expect(p(2)).toMatchObject({ repetitions: 2, intervalDays: 6 });
    expect(p(3)).toMatchObject({ repetitions: 2, intervalDays: 8 });
    expect(p(1).easeFactor).toBeCloseTo(2.36, 5);
    expect(p(2).easeFactor).toBeCloseTo(2.5, 5);
    expect(p(3).easeFactor).toBeCloseTo(2.6, 5);
    // Due dates are in step with the intervals.
    const dueIn = (i: number) => (new Date(p(i).dueAt).getTime() - Date.now()) / DAY;
    expect(dueIn(1)).toBeGreaterThan(2);
    expect(dueIn(1)).toBeLessThanOrEqual(3);
    expect(dueIn(2)).toBeGreaterThan(5);
    expect(dueIn(2)).toBeLessThanOrEqual(6);
    expect(dueIn(3)).toBeGreaterThan(7);
    expect(dueIn(3)).toBeLessThanOrEqual(8);
    // The passed cards have left the queue; the forgotten one returns within minutes.
    const after = await user.get('/api/review/queue');
    expect(after.dueCount).toBe(0);
    expect(dueIn(0) * DAY).toBeLessThanOrEqual(10 * 60_000 + 1000);
  });

  it('orders the queue with the most overdue card first', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet({ cards: makeCards(3) }));
    await sync(user, [rate(set, 0, 3, iso(-5 * DAY)), rate(set, 1, 3, iso(-9 * DAY)), rate(set, 2, 3, iso(-2 * DAY))]);
    const queue = await user.get('/api/review/queue');
    expect(queue.items.map((i: any) => i.card.termPlain)).toEqual(['term 2', 'term 1', 'term 3']);
  });

  it("never shows another user's due cards, or cards from a set that became private", async () => {
    const owner = await createUser();
    const learner = await createUser();
    const set = await owner.post('/api/sets', sampleSet({ visibility: 'public' }));
    await sync(learner, [rate(set, 0, 3)]);
    await makeDue(learner.id);
    expect((await learner.get('/api/review/queue')).dueCount).toBe(1);
    expect((await owner.get('/api/review/queue')).dueCount).toBe(0);

    await owner.request('PATCH', `/api/sets/${set.id}`, { visibility: 'private' });
    expect(await learner.get('/api/review/queue')).toEqual({ items: [], dueCount: 0 });
    expect((await learner.get('/api/review/summary')).dueCount).toBe(0);
  });

  it('drops cards from deleted sets and requires an account', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    await sync(user, [rate(set, 0, 3)]);
    await makeDue(user.id);
    await user.request('DELETE', `/api/sets/${set.id}`);
    expect((await user.get('/api/review/queue')).dueCount).toBe(0);
    expect((await guest.request('GET', '/api/review/queue')).status).toBe(401);
  });
});

describe('match scores', () => {
  const score = (setId: string, timeMs: number, extra: Record<string, unknown> = {}) => ({ clientId: randomUUID(), setId, timeMs, pairs: 6, mistakes: 0, ...extra });

  it('keeps personal bests, fastest first, and a leaderboard of each player\'s best', async () => {
    const owner = await createUser({ name: 'Owner' });
    const rival = await createUser({ name: 'Rival' });
    const set = await owner.post('/api/sets', sampleSet({ visibility: 'public', cards: makeCards(8) }));
    await owner.post('/api/study/sync', { matchScores: [score(set.id, 30_000), score(set.id, 22_500, { mistakes: 2 }), score(set.id, 41_000)] });
    await rival.post('/api/study/sync', { matchScores: [score(set.id, 19_000), score(set.id, 25_000)] });

    const mine = await owner.get(`/api/sets/${set.id}/match-scores?pairs=6`);
    expect(mine.personal.map((s: any) => s.timeMs)).toEqual([22_500, 30_000, 41_000]);
    expect(mine.personal[0].mistakes).toBe(2);
    expect(mine.leaders).toEqual([
      { name: 'Rival', timeMs: 19_000, isYou: false },
      { name: 'Owner', timeMs: 22_500, isYou: true },
    ]);
    // A different board size is a separate leaderboard.
    expect((await owner.get(`/api/sets/${set.id}/match-scores?pairs=4`)).leaders).toEqual([]);
  });

  it('records a score once and rejects implausible ones', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    const one = score(set.id, 15_000);
    await user.post('/api/study/sync', { matchScores: [one] });
    await user.post('/api/study/sync', { matchScores: [one] });
    expect((await user.get(`/api/sets/${set.id}/match-scores`)).personal).toHaveLength(1);
    const tooFast = await user.request('POST', '/api/study/sync', { matchScores: [score(set.id, 200)] });
    expect(tooFast.status).toBe(400);
  });

  it('hides the names of under-13 players from other people', async () => {
    const owner = await createUser({ name: 'Teacher' });
    const child = await createUser({ name: 'Kiddo', birthYear: new Date().getFullYear() - 10, consentStatus: 'granted' });
    const set = await owner.post('/api/sets', sampleSet({ visibility: 'unlisted' }));
    await child.post('/api/study/sync', { matchScores: [score(set.id, 12_000)] });
    expect((await owner.get(`/api/sets/${set.id}/match-scores`)).leaders).toEqual([{ name: null, timeMs: 12_000, isYou: false }]);
    expect((await child.get(`/api/sets/${set.id}/match-scores`)).leaders).toEqual([{ name: 'Kiddo', timeMs: 12_000, isYou: true }]);
  });

  it('is not readable, or writable, for a private set by anyone else', async () => {
    const owner = await createUser();
    const other = await createUser();
    const set = await owner.post('/api/sets', sampleSet());
    expect((await other.request('GET', `/api/sets/${set.id}/match-scores`)).status).toBe(404);
    await other.post('/api/study/sync', { matchScores: [score(set.id, 9000)] });
    expect((await owner.get(`/api/sets/${set.id}/match-scores`)).leaders).toEqual([]);
  });
});
