// Runs the production build in preview mode on this machine: demo accounts,
// sample sets, test payments and (without an API key) test AI, kept out of
// search engines. Usage: npm run preview [-- --no-build]
//
// Uses PREVIEW_DATABASE_URL, or DATABASE_URL from the environment or .env.
// A separate database is best: the preview migrates it and loads demo data.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = process.env.PREVIEW_PORT ?? '4300';
const databaseUrl = process.env.PREVIEW_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Set PREVIEW_DATABASE_URL (or DATABASE_URL) to a PostgreSQL database for the preview.');
  process.exit(1);
}

if (!process.argv.includes('--no-build')) {
  const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const server = spawn('node', ['dist/server/main.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    APP_ENV: 'preview',
    PORT: port,
    APP_URL: process.env.PREVIEW_URL ?? `http://localhost:${port}`,
    DATABASE_URL: databaseUrl,
    OUTBOX_DIR: process.env.PREVIEW_OUTBOX_DIR ?? '.data/preview/outbox',
    STORAGE_LOCAL_DIR: process.env.PREVIEW_UPLOADS_DIR ?? '.data/preview/uploads',
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
