import { Hono } from 'hono';
import { z } from 'zod';
import { parseQuery, requireViewer, type AppEnv } from '../http/context';
import { getReviewQueue, getReviewSummary } from '../services/review';

export const reviewRoutes = new Hono<AppEnv>()
  .get('/queue', async (c) => {
    const viewer = requireViewer(c);
    const { limit } = parseQuery(c, z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }));
    return c.json(await getReviewQueue(viewer, limit));
  })
  .get('/summary', async (c) => c.json(await getReviewSummary(requireViewer(c))));
