import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../env';
import { log } from '../log';
import * as schema from './schema';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.isTest ? 5 : env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => log.error({ err }, 'idle database client error'));

export const db = drizzle(pool, { schema });
export type Db = typeof db;
/** A transaction handle or the pool-backed database; services accept either. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0] | Db;

