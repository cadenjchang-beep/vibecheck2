// Reminders and clean-up, every ten minutes on the published site.
import '../lib/environment';
import type { Config } from '@netlify/functions';
import { log } from '../../src/server/log';
import { runJobs } from '../../src/server/services/reminders';

export default async () => {
  log.info({ jobs: await runJobs() }, 'scheduled jobs ran');
};

export const config: Config = { schedule: '*/10 * * * *' };
