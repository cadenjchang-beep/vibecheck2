import { log } from '../log';
import { pool } from './client';
import { runMigrations } from './migrations';

// Command line: `npm run db:migrate`, or `node dist/server/db/migrate.js` in production.
runMigrations()
  .then(() => log.info('migrations applied'))
  .catch((err) => {
    log.error({ err }, 'migration failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
