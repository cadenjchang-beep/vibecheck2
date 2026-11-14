import { describe, expect, it } from 'vitest';
import { cards, createUser, guest, sampleSet } from './helpers';

describe('sets: saving', () => {
  it('creates a set and returns it with its cards in order', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet({ cards: cards(20) }));
    expect(set.cardCount).toBe(20);
    expect(set.cards.map((c: any) => c.termPlain)).toEqual(cards(20).map((c) => c.term));
    expect(set.isOwner).toBe(true);
    expect(set.canEdit).toBe(true);
  });

  it('sanitises card markup on the way in', async () => {
    const user = await createUser();
    const set = await user.post(
      '/api/sets',
      sampleSet({
        cards: [{ term: '<b onclick="x()">bold</b><script>alert(1)</script>', definition: '<img src=x onerror=alert(1)>H<sub>2</sub>O' }],
      }),
    );
    expect(set.cards[0].term).toBe('<b>bold</b>');
    expect(set.cards[0].definition).toBe('H<sub>2</sub>O');
    expect(set.cards[0].definitionPlain).toBe('H2O');
  });

  it('drops empty cards and rejects a set without a title', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet({ cards: [{ term: 'a', definition: 'b' }, { term: '  ', definition: '<br>' }] }));
    expect(set.cardCount).toBe(1);
    const res = await user.request('POST', '/api/sets', sampleSet({ title: '   ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation_error');
  });

  it('updates, reorders, adds and removes cards in one save while keeping ids', async () => {
    const user = await createUser();
    const created = await user.post('/api/sets', sampleSet());
    const [a, b, c] = created.cards;
    const saved = await user.put(`/api/sets/${created.id}`, {
      ...sampleSet({ title: 'Renamed' }),
      cards: [
        { id: c.id, term: 'gamma', definition: 'third letter' },
        { id: a.id, term: 'ALPHA', definition: 'first letter' },
        { term: 'delta', definition: 'fourth letter' },
      ],
    });
    expect(saved.title).toBe('Renamed');
    expect(saved.cards.map((x: any) => x.termPlain)).toEqual(['gamma', 'ALPHA', 'delta']);
    expect(saved.cards[0].id).toBe(c.id);
    expect(saved.cards[1].id).toBe(a.id);
    expect(saved.cards.some((x: any) => x.id === b.id)).toBe(false);
    expect(saved.cardCount).toBe(3);
  });

  it("cannot take over another set's cards by sending their ids", async () => {
    const victim = await createUser();
    const attacker = await createUser();
    const theirs = await victim.post('/api/sets', sampleSet());
    const mine = await attacker.post('/api/sets', sampleSet());
    await attacker.put(`/api/sets/${mine.id}`, {
      ...sampleSet(),
      cards: [{ id: theirs.cards[0].id, term: 'hijacked', definition: 'hijacked' }],
    });
    const after = await victim.get(`/api/sets/${theirs.id}`);
    expect(after.cards.map((c: any) => c.termPlain)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('refuses to overwrite a set that changed since the editor loaded it', async () => {
    const user = await createUser();
    const created = await user.post('/api/sets', sampleSet());
    await user.put(`/api/sets/${created.id}`, sampleSet({ title: 'From another device' }));
    const res = await user.request('PUT', `/api/sets/${created.id}`, sampleSet({ title: 'Stale', baseUpdatedAt: created.updatedAt }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('stale_set');
  });

  it('accepts a full-size set', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet({ cards: cards(2000) }));
    expect(set.cardCount).toBe(2000);
    const tooMany = await user.request('POST', '/api/sets', sampleSet({ cards: cards(2001) }));
    expect(tooMany.status).toBe(400);
  });
});

describe('sets: who can see what', () => {
  it('a private set is invisible to other users and to visitors', async () => {
    const owner = await createUser();
    const other = await createUser();
    const set = await owner.post('/api/sets', sampleSet({ visibility: 'private' }));

    expect((await owner.request('GET', `/api/sets/${set.id}`)).status).toBe(200);
    // 404 rather than 403: the response must not confirm that the set exists.
    expect((await other.request('GET', `/api/sets/${set.id}`)).status).toBe(404);
    expect((await guest.request('GET', `/api/sets/${set.id}`)).status).toBe(404);
  });

  it('other users cannot edit, delete, restore or duplicate a private set', async () => {
    const owner = await createUser();
    const other = await createUser();
    const set = await owner.post('/api/sets', sampleSet());
    expect((await other.request('PUT', `/api/sets/${set.id}`, sampleSet({ title: 'x' }))).status).toBe(404);
    expect((await other.request('DELETE', `/api/sets/${set.id}`)).status).toBe(404);
    expect((await other.request('POST', `/api/sets/${set.id}/restore`, {})).status).toBe(404);
    expect((await other.request('POST', `/api/sets/${set.id}/duplicate`, {})).status).toBe(404);
    expect((await other.request('PUT', `/api/sets/${set.id}/star`, { starred: true })).status).toBe(404);
    expect((await other.request('PUT', `/api/cards/${set.cards[0].id}/star`, { starred: true })).status).toBe(404);
    expect((await owner.get(`/api/sets/${set.id}`)).title).toBe('Sample set');
  });

  it('a link-shared set opens for anyone with the link but cannot be edited by them', async () => {
    const owner = await createUser();
    const other = await createUser();
    const set = await owner.post('/api/sets', sampleSet({ visibility: 'unlisted' }));
    const seen = await other.get(`/api/sets/${set.id}`);
    expect(seen.isOwner).toBe(false);
    expect(seen.canEdit).toBe(false);
    expect((await guest.request('GET', `/api/sets/${set.id}`)).status).toBe(200);
    const edit = await other.request('PUT', `/api/sets/${set.id}`, sampleSet({ title: 'defaced' }));
    expect(edit.status).toBe(403);
    expect((await other.request('DELETE', `/api/sets/${set.id}`)).status).toBe(403);
  });

  it('publishing needs a verified email and is not offered to under-13 accounts', async () => {
    const unverified = await createUser({ verified: false });
    const res = await unverified.request('POST', '/api/sets', sampleSet({ visibility: 'public' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('email_unverified');

    const child = await createUser({ birthYear: new Date().getFullYear() - 10, consentStatus: 'granted' });
    const childRes = await child.request('POST', '/api/sets', sampleSet({ visibility: 'public' }));
    expect(childRes.status).toBe(403);
    expect((await childRes.json()).error.code).toBe('child_restricted');
    // Sharing by link is still allowed.
    expect((await child.request('POST', '/api/sets', sampleSet({ visibility: 'unlisted' }))).status).toBe(201);
  });

  it('accounts that have not finished setup, or await a parent, cannot use the API', async () => {
    const fresh = await createUser({ onboarded: false });
    const res = await fresh.request('POST', '/api/sets', sampleSet());
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('onboarding_required');

    const waiting = await createUser({ birthYear: new Date().getFullYear() - 9, consentStatus: 'pending' });
    const blocked = await waiting.request('GET', '/api/sets');
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe('consent_required');
  });

  it('signed-out requests to private endpoints are rejected', async () => {
    expect((await guest.request('GET', '/api/sets')).status).toBe(401);
    expect((await guest.request('POST', '/api/sets', sampleSet())).status).toBe(401);
  });

  it('rejects state-changing requests from another origin', async () => {
    const user = await createUser();
    const { app } = await import('./helpers');
    const res = await app.request('/api/sets', {
      method: 'POST',
      headers: { cookie: user.cookie, 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify(sampleSet()),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('bad_origin');
  });
});

describe('sets: library, delete, duplicate, stars', () => {
  it('lists only my own sets, newest first, in pages', async () => {
    const user = await createUser();
    const other = await createUser();
    await other.post('/api/sets', sampleSet({ title: 'Not mine', visibility: 'public' }));
    for (let i = 1; i <= 5; i++) await user.post('/api/sets', sampleSet({ title: `Mine ${i}` }));

    const first = await user.get('/api/sets?limit=2');
    expect(first.items.map((s: any) => s.title)).toEqual(['Mine 5', 'Mine 4']);
    expect(first.nextCursor).toBeTruthy();
    const second = await user.get(`/api/sets?limit=2&cursor=${first.nextCursor}`);
    expect(second.items.map((s: any) => s.title)).toEqual(['Mine 3', 'Mine 2']);
    const third = await user.get(`/api/sets?limit=2&cursor=${second.nextCursor}`);
    expect(third.items.map((s: any) => s.title)).toEqual(['Mine 1']);
    expect(third.nextCursor).toBeNull();

    const filtered = await user.get('/api/sets?q=mine%203');
    expect(filtered.items.map((s: any) => s.title)).toEqual(['Mine 3']);
  });

  it('deleting hides a set everywhere and restoring brings it back', async () => {
    const user = await createUser();
    const set = await user.post('/api/sets', sampleSet({ visibility: 'unlisted' }));
    await user.request('DELETE', `/api/sets/${set.id}`);
    expect((await user.request('GET', `/api/sets/${set.id}`)).status).toBe(404);
    expect((await guest.request('GET', `/api/sets/${set.id}`)).status).toBe(404);
    expect((await user.get('/api/sets')).items).toHaveLength(0);

    await user.post(`/api/sets/${set.id}/restore`);
    expect((await user.get(`/api/sets/${set.id}`)).cardCount).toBe(3);
  });

  it('duplicates a shared set into a private copy that credits the original', async () => {
    const owner = await createUser();
    const other = await createUser();
    const set = await owner.post('/api/sets', sampleSet({ visibility: 'public', title: 'Original' }));
    const { id } = await other.post(`/api/sets/${set.id}/duplicate`, {});
    const copy = await other.get(`/api/sets/${id}`);
    expect(copy.visibility).toBe('private');
    expect(copy.isOwner).toBe(true);
    expect(copy.cards.map((c: any) => c.termPlain)).toEqual(['alpha', 'beta', 'gamma']);
    expect(copy.cards[0].id).not.toBe(set.cards[0].id);
    expect(copy.sourceSet).toEqual({ id: set.id, title: 'Original' });
    // The copy is private: its original owner cannot open it.
    expect((await owner.request('GET', `/api/sets/${id}`)).status).toBe(404);
  });

  it('stars are per user, for sets and for individual cards', async () => {
    const owner = await createUser();
    const other = await createUser();
    const set = await owner.post('/api/sets', sampleSet({ visibility: 'public' }));
    await other.put(`/api/sets/${set.id}/star`, { starred: true });
    await other.put(`/api/cards/${set.cards[1].id}/star`, { starred: true });

    const mine = await other.get(`/api/sets/${set.id}`);
    expect(mine.starred).toBe(true);
    expect(mine.progress[set.cards[1].id].starred).toBe(true);
    const theirs = await owner.get(`/api/sets/${set.id}`);
    expect(theirs.starred).toBe(false);
    expect(theirs.progress[set.cards[1].id]).toBeUndefined();
    // Starring alone is not study progress.
    expect(mine.mastery).toBeNull();

    expect((await other.get('/api/sets?scope=starred')).items.map((s: any) => s.id)).toEqual([set.id]);
  });
});
