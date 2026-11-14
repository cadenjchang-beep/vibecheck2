import { Hono } from 'hono';
import { optionalViewer, requireViewer, type AppEnv } from '../http/context';
import { badRequest, notFound } from '../http/errors';
import { loadReadableMedia, uploadMedia } from '../services/media';
import { enforceRateLimit } from '../services/rate-limit';
import { storage, type ByteRange } from '../services/storage';

function parseRange(header: string | undefined): ByteRange | undefined {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header ?? '');
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  if (end !== undefined && end < start) return undefined;
  return { start, end };
}

export const mediaRoutes = new Hono<AppEnv>()
  .post('/', async (c) => {
    const viewer = requireViewer(c);
    await enforceRateLimit(`media:${viewer.id}`, { window: 3600, max: 120 });
    const form = await c.req.parseBody();
    const file = form.file;
    const kind = form.kind;
    if (!(file instanceof File) || (kind !== 'image' && kind !== 'audio')) {
      throw badRequest('validation_error', 'Send a file and say whether it is an image or audio.');
    }
    return c.json(await uploadMedia(viewer, kind, file), 201);
  })

  .get('/:id', async (c) => {
    const { row, shared } = await loadReadableMedia(optionalViewer(c), c.req.param('id'));
    const etag = `"${row.id}"`;
    // Uploads are never modified, so the id works as a permanent validator.
    c.header('etag', etag);
    c.header('cache-control', shared ? 'private, max-age=3600' : 'private, max-age=86400');
    if (c.req.header('if-none-match') === etag) return c.body(null, 304);

    const range = parseRange(c.req.header('range'));
    const object = await storage.get(row.storageKey, range);
    if (!object) throw notFound();
    c.header('content-type', row.mime);
    c.header('content-length', String(object.size));
    c.header('accept-ranges', 'bytes');
    c.header('content-disposition', 'inline');
    // Belt and braces: even if a file were mislabelled, it could not run script.
    c.header('content-security-policy', "default-src 'none'; sandbox");
    if (object.range) {
      c.header('content-range', `bytes ${object.range.start}-${object.range.end}/${object.total}`);
      return c.body(object.body, 206);
    }
    return c.body(object.body, 200);
  });
