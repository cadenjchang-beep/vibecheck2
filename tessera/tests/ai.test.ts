import { describe, expect, it } from 'vitest';
import { db } from '@server/db/client';
import { aiUsage } from '@server/db/schema';
import { app, createUser, guest, sampleSet, type TestClient } from './helpers';

const notes = ['Photosynthesis - how plants turn light into chemical energy', 'Mitochondria: where cells release energy', 'Osmosis is the movement of water across a membrane'].join('\n');

async function upload(user: TestClient, bytes: Uint8Array<ArrayBuffer>, name: string, type: string) {
  const form = new FormData();
  form.set('file', new File([bytes], name, { type }));
  form.set('count', '5');
  return app.request('/api/ai/generate', { method: 'POST', headers: { cookie: user.cookie }, body: form });
}

describe('AI card generation', () => {
  it('turns notes into cards and counts the request', async () => {
    const user = await createUser();
    const result = await user.post('/api/ai/generate', { source: 'notes', text: notes, count: 10 });
    expect(result.cards).toEqual([
      { term: 'Photosynthesis', definition: 'how plants turn light into chemical energy' },
      { term: 'Mitochondria', definition: 'where cells release energy' },
      { term: 'Osmosis', definition: 'the movement of water across a membrane' },
    ]);
    expect(result.usage).toMatchObject({ used: 1, limit: 20 });
    expect(await user.get('/api/ai/usage')).toMatchObject({ used: 1, limit: 20 });
  });

  it('accepts a PDF or an image and rejects other files without charging', async () => {
    const user = await createUser();
    const pdf = await upload(user, new TextEncoder().encode('%PDF-1.4 fake'), 'biology.pdf', 'application/pdf');
    expect(pdf.status).toBe(200);
    expect((await pdf.json()).title).toBe('biology');

    const text = await upload(user, new TextEncoder().encode('just some plain text here'), 'notes.txt', 'text/plain');
    expect(text.status).toBe(400);
    expect((await text.json()).error.code).toBe('unsupported_file');
    expect((await user.get('/api/ai/usage')).used).toBe(1);
  });

  it('requires a confirmed email and a signed-in user', async () => {
    const unverified = await createUser({ verified: false });
    const res = await unverified.request('POST', '/api/ai/generate', { source: 'topic', text: 'Volcanoes', count: 5 });
    expect(res.status).toBe(403);
    expect((await guest.request('POST', '/api/ai/generate', { source: 'topic', text: 'Volcanoes' })).status).toBe(401);
  });

  it('stops at the monthly allowance, which is higher on premium', async () => {
    const free = await createUser();
    await db.insert(aiUsage).values(Array.from({ length: 20 }, () => ({ userId: free.id, feature: 'test' })));
    const res = await free.request('POST', '/api/ai/suggest', { kind: 'definition', term: 'osmosis' });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe('ai_quota_exceeded');
    expect(body.error.details).toMatchObject({ used: 20, limit: 20, plan: 'free' });

    const premium = await createUser({ plan: 'premium' });
    await db.insert(aiUsage).values(Array.from({ length: 20 }, () => ({ userId: premium.id, feature: 'test' })));
    const ok = await premium.post('/api/ai/suggest', { kind: 'mnemonic', term: 'osmosis' });
    expect(ok.text).toContain('osmosis');
    expect(ok.usage).toMatchObject({ used: 21, limit: 500 });
  });
});

describe('AI help while studying', () => {
  it('explains a wrong answer only on sets the viewer can see', async () => {
    const owner = await createUser();
    const other = await createUser();
    const set = await owner.post('/api/sets', sampleSet());
    const explain = { setId: set.id, term: 'alpha', definition: 'first letter', given: 'second letter' };
    const result = await owner.post('/api/ai/explain', explain);
    expect(result.text).toContain('first letter');
    expect((await other.request('POST', '/api/ai/explain', explain)).status).toBe(404);
  });

  it('writes wrong answers once, shares them with every viewer and refreshes edited cards', async () => {
    const owner = await createUser();
    const learner = await createUser();
    const set = await owner.post('/api/sets', sampleSet({ visibility: 'public' }));

    expect(await learner.get(`/api/ai/distractors/${set.id}`)).toMatchObject({ distractors: {}, missing: 3 });
    const written = await learner.post(`/api/ai/distractors/${set.id}`);
    expect(written.missing).toBe(0);
    const first = set.cards[0];
    expect(written.distractors[first.id].definition).toEqual(['second letter', 'third letter']);
    expect(written.usage.used).toBe(1);

    // Free to read for everyone, including signed-out visitors of a public set.
    const cached = await (await guest.request('GET', `/api/ai/distractors/${set.id}`)).json();
    expect(cached.missing).toBe(0);

    // A second request with nothing missing costs nothing.
    expect((await learner.post(`/api/ai/distractors/${set.id}`)).usage).toBeNull();

    // Editing a card's text makes its old options stale.
    const detail = await owner.get(`/api/sets/${set.id}`);
    await owner.put(`/api/sets/${set.id}`, {
      ...sampleSet({ visibility: 'public' }),
      cards: detail.cards.map((c: any, i: number) => ({ id: c.id, term: c.term, definition: i === 0 ? 'the first Greek letter' : c.definition })),
    });
    expect((await owner.get(`/api/ai/distractors/${set.id}`)).missing).toBe(1);
  });
});
