import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';
import { log } from '../log';

/** Applies every pending SQL migration in ./drizzle. Safe to run on each deploy. */
export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: './drizzle' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => log.info('migrations applied'))
    .catch((err) => {
      log.error({ err }, 'migration failed');
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
