import { serve } from '@hono/node-server';
import { createApp } from './app';
import { pool } from './db/client';
import { env } from './env';
import { log, reportError } from './log';

const app = createApp();

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port, env: env.NODE_ENV, appUrl: env.appUrl }, 'tessera api listening');
});

process.on('unhandledRejection', (reason) => reportError(reason, { where: 'unhandledRejection' }));
process.on('uncaughtException', (err) => {
  reportError(err, { where: 'uncaughtException' });
  process.exit(1);
});

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  log.info({ signal }, 'shutting down');
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
