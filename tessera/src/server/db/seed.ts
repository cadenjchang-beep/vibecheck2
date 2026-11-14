import { log } from '../log';
import { pool } from './client';
import { seedDemo } from './demo';

// Command line: `npm run db:seed`. Loads demo accounts and sample sets.
seedDemo()
  .then(() => log.info('seed complete'))
  .catch((err) => {
    log.error({ err }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
