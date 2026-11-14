import { serve } from '@hono/node-server';
import { createApp } from './app';
import { pool } from './db/client';
import { runMigrations } from './db/migrations';
import { env } from './env';
import { log, reportError } from './log';
import { startScheduler } from './services/reminders';

for (const warning of env.warnings) log.warn(warning);

// Previews (and single-instance hosts that opt in) bring the database up to
// date and load the demo data before taking traffic.
if (env.migrateOnStart) {
  await runMigrations();
  log.info('migrations applied');
}
if (env.seedDemo) {
  const { seedDemo } = await import('./db/demo');
  await seedDemo();
  log.info('demo accounts and sample sets ready');
}

const app = createApp();

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port, mode: env.appEnv, node: env.NODE_ENV, version: env.version, appUrl: env.appUrl }, 'tessera listening');
});

if (env.RUN_SCHEDULER && !env.isTest) startScheduler();

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
