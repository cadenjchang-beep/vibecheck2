import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';
import { log } from '../log';
import type { AppEnv, Ctx } from './context';

const CLIENT_DIR = './dist/client';

/** The built single-page app's HTML shell, or null when the client is not built. */
export function readIndexHtml(): string | null {
  const file = path.resolve(CLIENT_DIR, 'index.html');
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/**
 * Serves the built client. Hashed assets are cached forever; everything else
 * (the HTML shell, service worker, manifest) is revalidated on each request so
 * a deploy reaches users immediately.
 */
export function mountClient(
  app: Hono<AppEnv>,
  renderPage: (c: Ctx, indexHtml: string) => Promise<{ html: string; status: 200 | 404 }>,
): void {
  const indexHtml = readIndexHtml();
  if (!indexHtml) {
    log.warn('dist/client not found: serving the API only (run `npm run build` to serve the web app)');
    return;
  }

  app.use(
    '*',
    serveStatic({
      root: CLIENT_DIR,
      precompressed: true,
      onFound: (file, c) => {
        const immutable = file.includes('/assets/');
        c.header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
        c.header('cross-origin-resource-policy', 'same-origin');
      },
    }),
  );

  // Anything else is a client-side route: answer with the app shell.
  app.get('*', async (c) => {
    if (c.req.path.startsWith('/assets/') || /\.[a-z0-9]{2,5}$/i.test(c.req.path)) {
      return c.text('Not found', 404);
    }
    const page = await renderPage(c, indexHtml);
    // The shell can embed a viewer-specific answer, so it is never shared between users.
    c.header('cache-control', 'private, no-cache');
    return c.html(page.html, page.status);
  });
}
