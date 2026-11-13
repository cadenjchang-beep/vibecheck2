import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@shared/api';
import { auth } from './auth';
import { env } from './env';
import { HttpError } from './http/errors';
import { originGuard, requestContext, sessionMiddleware, type AppEnv } from './http/context';
import { reportError } from './log';
import { mountSeoRoutes, renderPage } from './http/pages';
import { mountClient } from './http/static';
import { folderRoutes, internalRoutes, pushRoutes, searchRoutes, setFolderRoutes, statsRoutes } from './routes/library';
import { consentRoutes, meRoutes } from './routes/me';
import { aiRoutes } from './routes/ai';
import { classRoutes } from './routes/classes';
import { mediaRoutes } from './routes/media';
import { reviewRoutes } from './routes/review';
import { cardRoutes, setRoutes } from './routes/sets';
import { studyRoutes } from './routes/study';
import { enforceRateLimit } from './services/rate-limit';
import { clientIp, parseJson } from './http/context';
import { log } from './log';
import { z } from 'zod';
import { compress } from 'hono/compress';

const MB = 1024 * 1024;

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use(requestContext);
  app.use(
    secureHeaders({
      contentSecurityPolicy: env.isProd
        ? {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            mediaSrc: ["'self'", 'blob:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            workerSrc: ["'self'"],
            manifestSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
          }
        : undefined,
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      crossOriginResourcePolicy: 'same-origin',
      permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    }),
  );

  app.use('/api/*', compress());
  app.use('/api/*', originGuard);
  app.use('/api/*', async (c, next) => {
    // API responses are per-user; nothing may be cached by shared caches.
    await next();
    if (!c.res.headers.has('cache-control')) c.header('cache-control', 'no-store');
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  // Better Auth owns sign-up, sign-in, OAuth, verification and password reset.
  app.on(['GET', 'POST'], '/api/auth/*', bodyLimit({ maxSize: MB }), (c) => auth.handler(c.req.raw));

  app.use('/api/*', sessionMiddleware);
  app.use('/api/*', bodyLimit({ maxSize: 12 * MB }));

  app.route('/api/me', meRoutes);
  app.route('/api/consent', consentRoutes);
  app.route('/api/sets', setRoutes);
  app.route('/api/cards', cardRoutes);
  app.route('/api/media', mediaRoutes);
  app.route('/api/study', studyRoutes);
  app.route('/api/review', reviewRoutes);
  app.route('/api/sets', setFolderRoutes);
  app.route('/api/folders', folderRoutes);
  app.route('/api/search', searchRoutes);
  app.route('/api/stats', statsRoutes);
  app.route('/api/push', pushRoutes);
  app.route('/api/ai', aiRoutes);
  app.route('/api/classes', classRoutes);
app.route('/api/internal', internalRoutes);

  // Uncaught errors from the browser, so client-side failures show up in the logs too.
  app.post('/api/client-errors', async (c) => {
    await enforceRateLimit(`client-errors:${c.get('viewer')?.id ?? clientIp(c)}`, { window: 60, max: 20 });
    const report = await parseJson(
      c,
      z.object({
        message: z.string().max(500),
        stack: z.string().max(4000).optional(),
        where: z.string().max(200).optional(),
        url: z.string().max(500).optional(),
      }),
    );
    log.error({ source: 'client', userId: c.get('viewer')?.id, ...report }, `client error: ${report.message}`);
    return c.body(null, 204);
  });

  app.all('/api/*', (c) => c.json<ApiErrorBody>({ error: { code: 'not_found', message: 'Not found.' } }, 404));

  mountSeoRoutes(app);
  mountClient(app, renderPage);

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      if (err.status === 429 && err.details && typeof err.details === 'object') {
        const retry = (err.details as { retryAfter?: number | null }).retryAfter;
        if (retry) c.header('retry-after', String(retry));
      }
      return c.json<ApiErrorBody>({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
    }
    if (err instanceof ZodError) {
      return c.json<ApiErrorBody>(
        { error: { code: 'validation_error', message: 'Some of the information sent was not valid.', details: err.issues } },
        400,
      );
    }
    reportError(err, { requestId: c.get('requestId'), path: c.req.path, method: c.req.method });
    return c.json<ApiErrorBody>(
      { error: { code: 'internal_error', message: 'Something went wrong on our side. Please try again.' } },
      500,
    );
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
