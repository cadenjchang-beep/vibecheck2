import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import pg from 'pg';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera_vitest';

/** Creates a clean, migrated database for the API tests. */
export default async function setup(): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `API tests need PostgreSQL. Could not connect using ${admin.host} (${(err as Error).message}). ` +
        'Start the database (see README) or run only the unit tests with `npm run test:unit`.',
    );
  }
  await client.query(`drop database if exists "${name}" with (force)`);
  await client.query(`create database "${name}"`);
  await client.end();

  rmSync('.data/test', { recursive: true, force: true });
  const migrate = spawnSync('npx', ['tsx', 'src/server/db/migrate.ts'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'test', LOG_LEVEL: 'error' },
  });
  if (migrate.status !== 0) throw new Error('Could not migrate the test database.');
}
