import { describe, expect, it } from 'vitest';
import { sniffMedia } from '@server/services/media';
import { app, createUser, guest, sampleSet, type TestClient } from './helpers';

// A real 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
// The start of an MP3 file with an ID3 tag.
const MP3 = Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x0a'), Buffer.alloc(64)]);

async function upload(user: TestClient, bytes: Buffer, kind: string, name = 'file.bin', type = 'application/octet-stream') {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', new File([new Uint8Array(bytes)], name, { type }));
  return app.request('/api/media', { method: 'POST', headers: { cookie: user.cookie }, body: form });
}

describe('media uploads', () => {
  it('recognises files by their content, not their name', () => {
    expect(sniffMedia(new Uint8Array(PNG))?.mime).toBe('image/png');
    expect(sniffMedia(new Uint8Array(MP3))?.mime).toBe('audio/mpeg');
    expect(sniffMedia(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(sniffMedia(new TextEncoder().encode('<!doctype html><script>alert(1)</script>'))).toBeNull();
  });

  it('is a premium feature', async () => {
    const free = await createUser();
    const res = await upload(free, PNG, 'image');
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe('premium_required');
  });

  it('stores an image and serves it back to its owner', async () => {
    const user = await createUser({ plan: 'premium' });
    const res = await upload(user, PNG, 'image', 'pixel.png', 'image/png');
    expect(res.status).toBe(201);
    const { id, url } = (await res.json()) as { id: string; url: string };
    expect(url).toBe(`/api/media/${id}`);

    const got = await user.request('GET', url);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/png');
    expect(got.headers.get('content-security-policy')).toContain('sandbox');
    expect(Buffer.from(await got.arrayBuffer()).equals(PNG)).toBe(true);

    // Byte ranges, which audio players depend on.
    const part = await app.request(url, { headers: { cookie: user.cookie, range: 'bytes=0-7' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 0-7/${PNG.length}`);
    expect(Buffer.from(await part.arrayBuffer()).equals(PNG.subarray(0, 8))).toBe(true);

    const cached = await app.request(url, { headers: { cookie: user.cookie, 'if-none-match': `"${id}"` } });
    expect(cached.status).toBe(304);
  });

  it('rejects files that are not what they claim to be', async () => {
    const user = await createUser({ plan: 'premium' });
    const html = Buffer.from('<html><script>alert(1)</script></html>'.padEnd(64, ' '));
    const disguised = await upload(user, html, 'image', 'photo.png', 'image/png');
    expect(disguised.status).toBe(400);
    expect((await disguised.json()).error.code).toBe('unsupported_file');
    // An audio file in an image slot is refused too.
    expect((await upload(user, MP3, 'image')).status).toBe(400);
    expect((await upload(user, MP3, 'audio')).status).toBe(201);
  });

  it('media on a private set is as private as the set', async () => {
    const owner = await createUser({ plan: 'premium' });
    const other = await createUser();
    const { id: mediaId, url } = (await (await upload(owner, PNG, 'image')).json()) as { id: string; url: string };
    const set = await owner.post('/api/sets', sampleSet({ cards: [{ term: 'pixel', definition: 'a dot', termImageId: mediaId }] }));
    expect(set.cards[0].termImage).toEqual({ id: mediaId, url });

    expect((await other.request('GET', url)).status).toBe(404);
    expect((await guest.request('GET', url)).status).toBe(404);

    // Sharing the set shares its media, and nothing more.
    await owner.request('PATCH', `/api/sets/${set.id}`, { visibility: 'unlisted' });
    expect((await other.request('GET', url)).status).toBe(200);
    expect((await guest.request('GET', url)).status).toBe(200);

    await owner.request('PATCH', `/api/sets/${set.id}`, { visibility: 'private' });
    expect((await other.request('GET', url)).status).toBe(404);
  });

  it("a card cannot use another user's upload", async () => {
    const owner = await createUser({ plan: 'premium' });
    const thief = await createUser({ plan: 'premium' });
    const { id: mediaId } = (await (await upload(owner, PNG, 'image')).json()) as { id: string };
    const res = await thief.request('POST', '/api/sets', sampleSet({ cards: [{ term: 'x', definition: 'y', termImageId: mediaId }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_media');
  });

  it('an image cannot be attached as audio', async () => {
    const user = await createUser({ plan: 'premium' });
    const { id: mediaId } = (await (await upload(user, PNG, 'image')).json()) as { id: string };
    const res = await user.request('POST', '/api/sets', sampleSet({ cards: [{ term: 'x', definition: 'y', termAudioId: mediaId }] }));
    expect(res.status).toBe(400);
  });
});
