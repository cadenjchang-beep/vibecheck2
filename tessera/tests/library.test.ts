import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@server/db/client';
import { users } from '@server/db/schema';
import { runReminders } from '@server/services/reminders';
import { app, createUser, guest, sampleSet, cards as makeCards } from './helpers';

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const answer = (set: any, index: number, correct: boolean, extra: Record<string, unknown> = {}) => ({
  id: randomUUID(), type: 'answer', mode: 'learn', kind: 'mc', correct, cardId: set.cards[index].id, setId: set.id, at: iso(), ...extra,
});

describe('folders', () => {
  it('create, fill, rename, delete and restore; a set can be in several folders', async () => {
    const user = await createUser();
    const a = await user.post('/api/sets', sampleSet({ title: 'Set A' }));
    const b = await user.post('/api/sets', sampleSet({ title: 'Set B' }));
    const { id: f1 } = await user.post('/api/folders', { name: 'Biology' });
    const { id: f2 } = await user.post('/api/folders', { name: 'Exams' });
    await user.put(`/api/sets/${a.id}/folders`, { folderIds: [f1, f2] });
    await user.put(`/api/sets/${b.id}/folders`, { folderIds: [f1] });

    const list = await user.get('/api/folders');
    expect(list.map((f: any) => [f.name, f.setCount])).toEqual([['Biology', 2], ['Exams', 1]]);
    expect((await user.get(`/api/folders/${f1}`)).sets.map((s: any) => s.title)).toEqual(['Set A', 'Set B']);
    expect((await user.get(`/api/sets/${a.id}`)).folderIds.sort()).toEqual([f1, f2].sort());

    await user.request('PATCH', `/api/folders/${f1}`, { name: 'Biology 101' });
    await user.request('DELETE', `/api/folders/${f1}/sets/${b.id}`);
    expect((await user.get(`/api/folders/${f1}`)).folder).toMatchObject({ name: 'Biology 101', setCount: 1 });

    await user.request('DELETE', `/api/folders/${f2}`);
    expect((await user.get('/api/folders')).map((f: any) => f.name)).toEqual(['Biology 101']);
    await user.post(`/api/folders/${f2}/restore`);
    expect(await user.get('/api/folders')).toHaveLength(2);
    // Deleting a folder never deletes the sets in it.
    expect((await user.get(`/api/sets/${a.id}`)).title).toBe('Set A');
  });

  it("are private: nobody else can read, change or file sets into another person's folder", async () => {
    const owner = await createUser();
    const other = await createUser();
    const { id } = await owner.post('/api/folders', { name: 'Mine' });
    const theirs = await other.post('/api/sets', sampleSet({ visibility: 'public' }));
    expect((await other.request('GET', `/api/folders/${id}`)).status).toBe(404);
    expect((await other.request('PATCH', `/api/folders/${id}`, { name: 'x' })).status).toBe(404);
    expect((await other.request('DELETE', `/api/folders/${id}`)).status).toBe(404);
    await other.put(`/api/sets/${theirs.id}/folders`, { folderIds: [id] });
    expect((await owner.get(`/api/folders/${id}`)).sets).toEqual([]);
    expect((await guest.request('GET', '/api/folders')).status).toBe(401);
  });
});

describe('search and browse', () => {
  it('finds public sets by title, subject and term; never private ones', async () => {
    const owner = await createUser();
    const tag = `zq${Date.now().toString(36)}`;
    const pub = await owner.post('/api/sets', sampleSet({ title: `${tag} photosynthesis basics`, subject: 'science', visibility: 'public', cards: [{ term: `${tag}chlorophyll`, definition: 'green pigment' }, { term: 'stoma', definition: 'pore' }] }));
    await owner.post('/api/sets', sampleSet({ title: `${tag} photosynthesis secret notes`, visibility: 'private' }));
    await owner.post('/api/sets', sampleSet({ title: `${tag} photosynthesis by link`, visibility: 'unlisted' }));
    const searcher = await createUser();
    const titles = async (path: string, as = searcher) => (await as.get(path)).items.map((s: any) => s.title);

    expect(await titles(`/api/search?q=${tag}%20photosynthesis`)).toEqual([`${tag} photosynthesis basics`]);
    // A word still being typed, and a term inside the set.
    expect(await titles(`/api/search?q=${tag}%20photosyn`)).toEqual([`${tag} photosynthesis basics`]);
    expect(await titles(`/api/search?q=${tag}chlorophyll`)).toEqual([`${tag} photosynthesis basics`]);
    // A typo in the title.
    expect(await titles(`/api/search?q=${tag}%20fotosynthesis%20basics`)).toContain(`${tag} photosynthesis basics`);
    // Subject filter.
    expect(await titles(`/api/search?q=${tag}&subject=science`)).toEqual([`${tag} photosynthesis basics`]);
    expect(await titles(`/api/search?q=${tag}&subject=law`)).toEqual([]);
    // The owner also finds their own private and link-only sets; "mine" narrows to them.
    expect((await titles(`/api/search?q=${tag}`, owner)).length).toBe(3);
    expect((await titles(`/api/search?q=${tag}&mine=1`, searcher)).length).toBe(0);
    // Visitors can search too.
    const visitor = await (await guest.request('GET', `/api/search?q=${tag}`)).json();
    expect(visitor.items.map((s: any) => s.id)).toEqual([pub.id]);
    const subjects = await (await guest.request('GET', '/api/search/subjects')).json();
    expect(subjects.find((s: any) => s.subject === 'science').count).toBeGreaterThan(0);
  });

  it('pages through results', async () => {
    const owner = await createUser();
    const tag = `pg${Date.now().toString(36)}`;
    for (let i = 0; i < 5; i++) await owner.post('/api/sets', sampleSet({ title: `${tag} set ${i}`, visibility: 'public' }));
    const first = await owner.get(`/api/search?q=${tag}&limit=2`);
    expect(first.items).toHaveLength(2);
    const second = await owner.get(`/api/search?q=${tag}&limit=2&cursor=${first.nextCursor}`);
    const third = await owner.get(`/api/search?q=${tag}&limit=2&cursor=${second.nextCursor}`);
    expect(third.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items, ...third.items].map((s: any) => s.id)).size).toBe(5);
  });
});

describe('stats', () => {
  it('reports today, the week, the streak and totals', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet({ cards: makeCards(4) }));
    await user.post('/api/study/sync', {
      events: [answer(set, 0, true), answer(set, 1, false), answer(set, 2, true, { at: iso(-86_400_000) })],
      sessions: [{ clientId: randomUUID(), setId: set.id, mode: 'learn', startedAt: iso(-300_000), endedAt: iso(), durationSeconds: 240, cardsStudied: 2, correctCount: 1, incorrectCount: 1 }],
    });
    const overview = await user.get('/api/stats/overview');
    expect(overview.streak).toEqual({ current: 2, longest: 2 });
    expect(overview.today).toMatchObject({ cards: 2, seconds: 240, goal: 20, goalMet: false });
    expect(overview.week).toHaveLength(7);
    expect(overview.week.slice(-2).map((d: any) => d.cards)).toEqual([1, 2]);
    expect(overview.totals).toMatchObject({ cards: 3, seconds: 240, daysActive: 2, setsStudied: 1 });

    const dashboard = await user.get('/api/stats/dashboard');
    expect(dashboard.recent.map((s: any) => s.id)).toEqual([set.id]);
    // The card missed today, and the one first studied yesterday, which is due today.
    expect(dashboard.review.dueCount).toBe(2);
  });

  it('per-card history lists what was answered, newest first', async () => {
    const user = await createUser();
    const other = await createUser();
    const set = await user.post('/api/sets', sampleSet());
    await user.post('/api/study/sync', { events: [answer(set, 0, false, { at: iso(-2000) }), answer(set, 0, true, { at: iso(-1000) })] });
    const history = await user.get(`/api/stats/cards/${set.cards[0].id}/history`);
    expect(history.events.map((e: any) => e.correct)).toEqual([true, false]);
    expect(history.progress).toMatchObject({ correctCount: 1, incorrectCount: 1 });
    expect((await other.request('GET', `/api/stats/cards/${set.cards[0].id}/history`)).status).toBe(404);
  });

  it('detailed analytics are a premium feature', async () => {
    const free = await createUser();
    const res = await free.request('GET', '/api/stats/detailed');
    expect(res.status).toBe(402);
    const premium = await createUser({ plan: 'premium' });
    const set = await premium.post('/api/sets', sampleSet());
    await premium.post('/api/study/sync', { events: [answer(set, 0, false), answer(set, 1, true)] });
    const detailed = await premium.get('/api/stats/detailed');
    expect(detailed.days).toHaveLength(84);
    expect(detailed.forecast).toHaveLength(14);
    expect(detailed.forecast[0].due).toBe(1);
    expect(detailed.hardest[0]).toMatchObject({ term: 'alpha', incorrect: 1 });
  });
});

describe('reminders', () => {
  const emailsTo = (address: string) => {
    try {
      return readdirSync('.data/test/outbox').map((f) => JSON.parse(readFileSync(`.data/test/outbox/${f}`, 'utf8'))).filter((m) => m.to === address && /review|study session/i.test(m.subject));
    } catch {
      return [];
    }
  };

  it('are sent once a day, at the chosen local hour, only when there is something to do', async () => {
    const user = await createUser();
    const done = await createUser();
    const wrongHour = await createUser();
    const now = new Date();
    const hour = now.getUTCHours();
    for (const u of [user, done]) await db.update(users).set({ reminderChannel: 'email', reminderHour: hour, timezone: 'UTC', dailyGoal: 1 }).where(eq(users.id, u.id));
    await db.update(users).set({ reminderChannel: 'email', reminderHour: (hour + 5) % 24, timezone: 'UTC' }).where(eq(users.id, wrongHour.id));
    // "done" has already met a goal of one card today and has nothing due.
    const set = await done.post('/api/sets', sampleSet());
    await done.post('/api/study/sync', { events: [{ ...answer(set, 0, true), type: 'rating', mode: 'review', rating: 3, kind: undefined, correct: undefined }] });

    await runReminders(now);
    expect(emailsTo(user.email)).toHaveLength(1);
    expect(emailsTo(done.email)).toHaveLength(0);
    expect(emailsTo(wrongHour.email)).toHaveLength(0);
    // Running again the same day does not send a second one.
    await runReminders(now);
    expect(emailsTo(user.email)).toHaveLength(1);
  });

  it('the cron endpoint needs the shared secret', async () => {
    expect((await app.request('/api/internal/cron', { method: 'POST' })).status).toBe(403);
    expect((await app.request('/api/internal/cron', { method: 'POST', headers: { 'x-cron-secret': 'wrong-secret-value' } })).status).toBe(403);
    const ok = await app.request('/api/internal/cron', { method: 'POST', headers: { 'x-cron-secret': 'test-cron-secret' } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ purgeDeleted: 'ok', rateLimits: 'ok' });
  });
});
