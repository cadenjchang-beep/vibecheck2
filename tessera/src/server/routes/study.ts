import { Hono } from 'hono';
import { syncInputSchema } from '@shared/schemas';
import { parseJson, requireViewer, type AppEnv } from '../http/context';
import { enforceRateLimit } from '../services/rate-limit';
import { syncStudy } from '../services/study';

export const studyRoutes = new Hono<AppEnv>()
  /** Records answers, review ratings, sessions and game scores. Safe to retry. */
  .post('/sync', async (c) => {
    const viewer = requireViewer(c);
    await enforceRateLimit(`study:sync:${viewer.id}`, { window: 60, max: 120 });
    const input = await parseJson(c, syncInputSchema);
    return c.json(await syncStudy(viewer, input));
  });
