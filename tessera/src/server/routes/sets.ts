import { Hono } from 'hono';
import { z } from 'zod';
import { listQuerySchema, setInputSchema } from '@shared/schemas';
import { LIMITS, VISIBILITIES } from '@shared/constants';
import { optionalViewer, parseJson, parseQuery, requireViewer, type AppEnv } from '../http/context';
import { enforceRateLimit } from '../services/rate-limit';
import {
  createSet,
  duplicateSet,
  getSetDetail,
  listLibrary,
  restoreSet,
  saveSet,
  setVisibility,
  softDeleteSet,
  starCard,
  starSet,
} from '../services/sets';

const libraryQuery = listQuerySchema.extend({
  scope: z.enum(['mine', 'starred', 'recent', 'studied']).default('mine'),
  q: z.string().max(100).optional(),
});

const starBody = z.object({ starred: z.boolean() });

export const setRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireViewer(c);
    const { scope, cursor, limit, q } = parseQuery(c, libraryQuery);
    return c.json(await listLibrary(viewer, scope, { cursor, limit, q }));
  })

  .post('/', async (c) => {
    const viewer = requireViewer(c);
    await enforceRateLimit(`sets:create:${viewer.id}`, { window: 3600, max: 60 });
    const input = await parseJson(c, setInputSchema);
    const id = await createSet(viewer, input);
    return c.json(await getSetDetail(viewer, id), 201);
  })

  // Readable without an account when the set is public or shared by link.
  .get('/:id', async (c) => {
    const viewer = optionalViewer(c);
    return c.json(await getSetDetail(viewer, c.req.param('id')));
  })

  .put('/:id', async (c) => {
    const viewer = requireViewer(c);
    await enforceRateLimit(`sets:save:${viewer.id}`, { window: 3600, max: 400 });
    const input = await parseJson(c, setInputSchema);
    await saveSet(viewer, c.req.param('id'), input);
    return c.json(await getSetDetail(viewer, c.req.param('id'), { touch: false }));
  })

  .patch('/:id', async (c) => {
    const viewer = requireViewer(c);
    const { visibility } = await parseJson(c, z.object({ visibility: z.enum(VISIBILITIES) }));
    await setVisibility(viewer, c.req.param('id'), visibility);
    return c.json({ ok: true });
  })

  .delete('/:id', async (c) => {
    const viewer = requireViewer(c);
    await softDeleteSet(viewer, c.req.param('id'));
    return c.json({ ok: true });
  })

  .post('/:id/restore', async (c) => {
    const viewer = requireViewer(c);
    await restoreSet(viewer, c.req.param('id'));
    return c.json({ ok: true });
  })

  .post('/:id/duplicate', async (c) => {
    const viewer = requireViewer(c);
    await enforceRateLimit(`sets:create:${viewer.id}`, { window: 3600, max: 60 });
    const { title } = await parseJson(c, z.object({ title: z.string().trim().max(LIMITS.titleMax).optional() }));
    const id = await duplicateSet(viewer, c.req.param('id'), title);
    return c.json({ id }, 201);
  })

  .put('/:id/star', async (c) => {
    const viewer = requireViewer(c);
    const { starred } = await parseJson(c, starBody);
    await starSet(viewer, c.req.param('id'), starred);
    return c.json({ ok: true });
  });

export const cardRoutes = new Hono<AppEnv>().put('/:id/star', async (c) => {
  const viewer = requireViewer(c);
  const { starred } = await parseJson(c, starBody);
  await starCard(viewer, c.req.param('id'), starred);
  return c.json({ ok: true });
});
