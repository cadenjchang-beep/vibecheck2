// Starts the app for end-to-end tests: a clean test database, the production
// client build, and local stand-ins for email, storage, AI and payments.
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import pg from 'pg';

const PORT = process.env.E2E_PORT ?? '4173';
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera_test';

const env = {
  ...process.env,
  NODE_ENV: 'test',
  PORT,
  APP_URL: `http://localhost:${PORT}`,
  DATABASE_URL,
  BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
  EMAIL_TRANSPORT: 'file',
  OUTBOX_DIR: '.data/e2e/outbox',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: '.data/e2e/uploads',
  AI_PROVIDER: 'mock',
  PAYMENTS_PROVIDER: 'mock',
  RUN_SCHEDULER: '0',
  CRON_SECRET: 'e2e-cron-secret',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn',
  ANTHROPIC_API_KEY: '',
  STRIPE_SECRET_KEY: '',
};

function run(cmd, args, overrides = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env: { ...env, ...overrides } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync('.data/e2e', { recursive: true, force: true });

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
await client.end();

run('npx', ['tsx', 'src/server/db/migrate.ts']);
run('npx', ['tsx', 'src/server/db/seed.ts']);
// Tests run against the same optimised client bundle that ships.
if (process.env.E2E_SKIP_BUILD !== '1') run('npx', ['vite', 'build'], { NODE_ENV: 'production' });

const server = spawn('npx', ['tsx', 'src/server/main.ts'], { stdio: 'inherit', env });
const stop = () => server.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code) => process.exit(code ?? 0));
