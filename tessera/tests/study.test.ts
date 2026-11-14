import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createUser, guest, sampleSet, cards as makeCards, type TestClient } from './helpers';

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86_400_000;

function answer(set: any, index: number, correct: boolean, extra: Record<string, unknown> = {}) {
  return { id: randomUUID(), type: 'answer', mode: 'learn', kind: 'mc', correct, cardId: set.cards[index].id, setId: set.id, at: iso(), ...extra };
}
function rating(set: any, index: number, value: 1 | 2 | 3 | 4, extra: Record<string, unknown> = {}) {
  return { id: randomUUID(), type: 'rating', mode: 'review', rating: value, cardId: set.cards[index].id, setId: set.id, at: iso(), ...extra };
}
const sync = (user: TestClient, body: Record<string, unknown>) => user.post('/api/study/sync', body);

describe('recording study activity', () => {
  it('turns answers into per-card progress and set mastery', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet({ cards: makeCards(4) }));
    const result = await sync(user, {
      events: [
        answer(set, 0, true, { at: iso(-3000) }),
        answer(set, 0, true, { at: iso(-2000) }),
        answer(set, 0, true, { kind: 'written', at: iso(-1000) }),
        answer(set, 1, false),
      ],
    });
    expect(result.appliedEvents).toBe(4);
    expect(result.progress[set.cards[0].id]).toMatchObject({ stage: 'mastered', correctCount: 3, incorrectCount: 0, streak: 3 });
    expect(result.progress[set.cards[1].id]).toMatchObject({ stage: 'learning', correctCount: 0, incorrectCount: 1 });

    const detail = await user.get(`/api/sets/${set.id}`);
    expect(detail.progress[set.cards[0].id].stage).toBe('mastered');
    // One of four mastered (1) plus one learning (1/3): (1 + 1/3) / 4 = 33%.
    expect(detail.mastery).toBe(33);
    // The missed card is due for review immediately; the mastered one tomorrow.
    expect(detail.dueCount).toBe(1);
    expect(detail.lastStudiedAt).toBeTruthy();
  });

  it('applies each event once, however often the batch is replayed', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    const batch = { events: [answer(set, 0, true), answer(set, 1, false)] };
    const first = await sync(user, batch);
    const second = await sync(user, batch);
    const third = await sync(user, { events: [...batch.events, batch.events[0]] });
    expect(first.appliedEvents).toBe(2);
    expect(second.appliedEvents).toBe(0);
    expect(third.appliedEvents).toBe(0);
    const detail = await user.get(`/api/sets/${set.id}`);
    expect(detail.progress[set.cards[0].id]).toMatchObject({ correctCount: 1, incorrectCount: 0 });
    expect(detail.progress[set.cards[1].id]).toMatchObject({ correctCount: 0, incorrectCount: 1 });
  });

  it('applies events in the order they happened, not the order they arrived', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    // Sent newest first, as an offline queue flushed out of order might be.
    await sync(user, {
      events: [
        answer(set, 0, false, { at: iso(-1000) }),
        answer(set, 0, true, { at: iso(-3000) }),
        answer(set, 0, true, { at: iso(-2000) }),
      ],
    });
    const detail = await user.get(`/api/sets/${set.id}`);
    // right, right, wrong → familiar then back down to learning, streak reset.
    expect(detail.progress[set.cards[0].id]).toMatchObject({ stage: 'learning', streak: 0, correctCount: 2, incorrectCount: 1 });
  });

  it('review ratings schedule the next review', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    const result = await sync(user, { events: [rating(set, 0, 3), rating(set, 1, 1), rating(set, 2, 4)] });
    const [good, again, easy] = [0, 1, 2].map((i) => result.progress[set.cards[i].id]);
    expect(good).toMatchObject({ repetitions: 1, intervalDays: 1, easeFactor: 2.5 });
    expect(again).toMatchObject({ repetitions: 0, intervalDays: 0, stage: 'learning' });
    expect(easy).toMatchObject({ repetitions: 1, intervalDays: 4 });
    expect(easy.easeFactor).toBeCloseTo(2.6, 5);
    expect(new Date(good.dueAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(easy.dueAt).getTime()).toBeGreaterThan(new Date(good.dueAt).getTime());
    // "Again" comes back within minutes.
    expect(new Date(again.dueAt).getTime() - Date.now()).toBeLessThan(11 * 60_000);
  });

  it('keeps a starred card starred', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    await user.put(`/api/cards/${set.cards[0].id}/star`, { starred: true });
    const result = await sync(user, { events: [answer(set, 0, true)] });
    expect(result.progress[set.cards[0].id]).toMatchObject({ starred: true, stage: 'learning' });
  });

  it('cannot record progress against a set the user is not allowed to see', async () => {
    const owner = await createUser();
    const other = await createUser();
    const secret = await owner.post('/api/sets', sampleSet({ visibility: 'private' }));
    const result = await sync(other, { events: [answer(secret, 0, true)], sessions: [session(secret.id)] });
    expect(result.appliedEvents).toBe(0);
    expect(result.progress).toEqual({});
    // Nothing leaked into the owner's own view either.
    expect((await owner.get(`/api/sets/${secret.id}`)).progress).toEqual({});
  });

  it('ignores events that name a card from a different set', async () => {
    const user = await createUser();
    const a = await user.post('/api/sets', sampleSet());
    const b = await user.post('/api/sets', sampleSet());
    const result = await sync(user, { events: [{ ...answer(a, 0, true), setId: b.id }] });
    expect(result.appliedEvents).toBe(0);
  });

  it('progress on a shared set belongs to whoever studied', async () => {
    const owner = await createUser();
    const learner = await createUser();
    const set = await owner.post('/api/sets', sampleSet({ visibility: 'public' }));
    await sync(learner, { events: [answer(set, 0, true)] });
    expect((await learner.get(`/api/sets/${set.id}`)).progress[set.cards[0].id].stage).toBe('learning');
    expect((await owner.get(`/api/sets/${set.id}`)).progress).toEqual({});
    expect((await learner.get('/api/sets?scope=studied')).items.map((s: any) => s.id)).toEqual([set.id]);
  });

  it('rejects malformed events and signed-out requests', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    const bad = await user.request('POST', '/api/study/sync', { events: [{ ...answer(set, 0, true), id: 'not-a-uuid' }] });
    expect(bad.status).toBe(400);
    const wrongRating = await user.request('POST', '/api/study/sync', { events: [{ ...rating(set, 0, 3), rating: 9 }] });
    expect(wrongRating.status).toBe(400);
    expect((await guest.request('POST', '/api/study/sync', { events: [] })).status).toBe(401);
  });

  it('survives two devices syncing the same card at once', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    const batches = Array.from({ length: 6 }, (_, i) => ({ events: [answer(set, 0, true, { at: iso(-10_000 + i * 1000) })] }));
    await Promise.all(batches.map((b) => sync(user, b)));
    const detail = await user.get(`/api/sets/${set.id}`);
    expect(detail.progress[set.cards[0].id].correctCount).toBe(6);
  });
});

function session(setId: string | null, extra: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    setId,
    mode: 'flashcards',
    startedAt: iso(-120_000),
    endedAt: iso(),
    durationSeconds: 90,
    cardsStudied: 12,
    correctCount: 9,
    incorrectCount: 3,
    ...extra,
  };
}

describe('sessions and streaks', () => {
  it('records a session once and starts a streak', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    const one = session(set.id);
    const first = await sync(user, { sessions: [one] });
    expect(first.streak).toEqual({ current: 1, longest: 1 });
    const again = await sync(user, { sessions: [one] });
    expect(again.streak).toEqual({ current: 1, longest: 1 });
  });

  it('never credits more study time than the session lasted', async () => {
    const { db } = await import('@server/db/client');
    const { dailyActivity } = await import('@server/db/schema');
    const { eq } = await import('drizzle-orm');
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    await sync(user, { sessions: [session(set.id, { durationSeconds: 5000, startedAt: iso(-60_000) })] });
    const [row] = await db.select().from(dailyActivity).where(eq(dailyActivity.userId, user.id));
    expect(row!.secondsStudied).toBeLessThanOrEqual(61);
    expect(row!.sessions).toBe(1);
  });

  it('builds a streak from consecutive days, including days synced late from an offline device', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    // Studied today first; the two previous days arrive afterwards.
    await sync(user, { events: [answer(set, 0, true)] });
    const late = await sync(user, {
      events: [answer(set, 1, true, { at: iso(-DAY) }), answer(set, 2, true, { at: iso(-2 * DAY) })],
    });
    expect(late.streak).toEqual({ current: 3, longest: 3 });
  });

  it('a gap breaks the streak but the longest run is remembered', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    const result = await sync(user, {
      events: [
        answer(set, 0, true, { at: iso(-10 * DAY) }),
        answer(set, 0, true, { at: iso(-9 * DAY) }),
        answer(set, 0, true, { at: iso(-8 * DAY) }),
        answer(set, 1, true),
      ],
    });
    expect(result.streak).toEqual({ current: 1, longest: 3 });
  });
});
