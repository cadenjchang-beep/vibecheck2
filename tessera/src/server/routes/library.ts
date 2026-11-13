import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { LIMITS, SUBJECTS } from '@shared/constants';
import { env } from '../env';
import { forbidden } from '../http/errors';
import { optionalViewer, parseJson, parseQuery, requireViewer, type AppEnv } from '../http/context';
import { addSetToFolder, createFolder, deleteFolder, getFolder, listFolders, removeSetFromFolder, restoreFolder, setFoldersForSet, updateFolder } from '../services/folders';
import { enforceRateLimit } from '../services/rate-limit';
import { removePushSubscription, runJobs, savePushSubscription } from '../services/reminders';
import { searchSets, subjectCounts } from '../services/search';
import { getCardHistory, getDashboard, getDetailed, getOverview } from '../services/stats';

const folderInput = z.object({
  name: z.string().trim().min(1).max(LIMITS.folderNameMax),
  description: z.string().trim().max(300).optional(),
});

export const folderRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await listFolders(requireViewer(c))))
  .post('/', async (c) => {
    const viewer = requireViewer(c);
    await enforceRateLimit(`folders:${viewer.id}`, { window: 3600, max: 100 });
    const id = await createFolder(viewer, await parseJson(c, folderInput));
    return c.json({ id }, 201);
  })
  .get('/:id', async (c) => c.json(await getFolder(requireViewer(c), c.req.param('id'))))
  .patch('/:id', async (c) => {
    await updateFolder(requireViewer(c), c.req.param('id'), await parseJson(c, folderInput.partial()));
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    await deleteFolder(requireViewer(c), c.req.param('id'));
    return c.json({ ok: true });
  })
  .post('/:id/restore', async (c) => {
    await restoreFolder(requireViewer(c), c.req.param('id'));
    return c.json({ ok: true });
  })
  .put('/:id/sets/:setId', async (c) => {
    await addSetToFolder(requireViewer(c), c.req.param('id'), c.req.param('setId'));
    return c.json({ ok: true });
  })
  .delete('/:id/sets/:setId', async (c) => {
    await removeSetFromFolder(requireViewer(c), c.req.param('id'), c.req.param('setId'));
    return c.json({ ok: true });
  });

/** Which of the viewer's folders a set is in. Mounted under /api/sets. */
export const setFolderRoutes = new Hono<AppEnv>().put('/:id/folders', async (c) => {
  const { folderIds } = await parseJson(c, z.object({ folderIds: z.array(z.string().max(40)).max(200) }));
  await setFoldersForSet(requireViewer(c), c.req.param('id'), folderIds);
  return c.json({ ok: true });
});

const searchQuery = z.object({
  q: z.string().max(100).optional(),
  subject: z.enum(SUBJECTS).optional(),
  mine: z.enum(['1']).optional(),
  cursor: z.coerce.number().int().min(0).max(600).default(0),
  limit: z.coerce.number().int().min(1).max(48).default(LIMITS.pageSize),
});

export const searchRoutes = new Hono<AppEnv>()
  // Open to visitors: only public sets (and the viewer's own) are ever returned.
  .get('/', async (c) => {
    const input = parseQuery(c, searchQuery);
    return c.json(await searchSets(optionalViewer(c), { q: input.q, subject: input.subject, mine: input.mine === '1', offset: input.cursor, limit: input.limit }));
  })
  .get('/subjects', async (c) => {
    c.header('cache-control', 'public, max-age=300');
    return c.json(await subjectCounts());
  });

export const statsRoutes = new Hono<AppEnv>()
  .get('/overview', async (c) => c.json(await getOverview(requireViewer(c))))
  .get('/detailed', async (c) => c.json(await getDetailed(requireViewer(c))))
  .get('/dashboard', async (c) => c.json(await getDashboard(requireViewer(c))))
  .get('/cards/:id/history', async (c) => c.json(await getCardHistory(requireViewer(c), c.req.param('id'))));

const pushInput = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(300) }) });

export const pushRoutes = new Hono<AppEnv>()
  .post('/subscribe', async (c) => {
    const viewer = requireViewer(c);
    const input = await parseJson(c, pushInput);
    await savePushSubscription(viewer.id, { endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth });
    return c.json({ ok: true });
  })
  .post('/unsubscribe', async (c) => {
    const { endpoint } = await parseJson(c, z.object({ endpoint: z.string().max(1000) }));
    await removePushSubscription(requireViewer(c).id, endpoint);
    return c.json({ ok: true });
  });

/** For hosts without a long-running process: an external scheduler calls this with the shared secret. */
export const internalRoutes = new Hono<AppEnv>().post('/cron', async (c) => {
  const given = Buffer.from(c.req.header('x-cron-secret') ?? '');
  const expected = Buffer.from(env.CRON_SECRET ?? '');
  if (expected.length === 0 || given.length !== expected.length || !timingSafeEqual(given, expected)) throw forbidden();
  return c.json(await runJobs());
});
