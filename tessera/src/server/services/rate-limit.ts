import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { env } from '../env';
import { tooManyRequests } from '../http/errors';

export interface RateRule {
  /** Window length in seconds. */
  window: number;
  /** Requests allowed per window. */
  max: number;
}

/**
 * Atomically counts one request against `key`. A single upsert both checks and
 * increments, so concurrent requests cannot slip past a stale read, and the
 * counter lives in Postgres so the limit holds across server instances.
 */
export async function consumeRateLimit(
  key: string,
  rule: RateRule,
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const result = await db.execute<{ count: number; elapsed: number }>(sql`
    insert into rate_limits as r (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when r.window_start < now() - make_interval(secs => ${rule.window}) then 1 else r.count + 1 end,
      window_start = case when r.window_start < now() - make_interval(secs => ${rule.window}) then now() else r.window_start end
    returning count, extract(epoch from (now() - window_start))::float8 as elapsed
  `);
  const row = result.rows[0];
  if (!row) return { allowed: true, retryAfter: null };
  if (row.count <= rule.max) return { allowed: true, retryAfter: null };
  return { allowed: false, retryAfter: Math.max(1, Math.ceil(rule.window - row.elapsed)) };
}

/** Throws 429 when the limit is exceeded. Limits are skipped under test. */
export async function enforceRateLimit(key: string, rule: RateRule, code?: string, message?: string): Promise<void> {
  if (env.isTest && process.env.RATE_LIMIT_IN_TESTS !== '1') return;
  const { allowed, retryAfter } = await consumeRateLimit(key, rule);
  if (!allowed) throw tooManyRequests(retryAfter, code, message);
}

export async function purgeExpiredRateLimits(): Promise<void> {
  await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
}
