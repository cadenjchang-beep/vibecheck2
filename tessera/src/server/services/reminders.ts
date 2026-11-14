import { and, eq, lt, sql } from 'drizzle-orm';
import { sendNotification, setVapidDetails } from 'web-push';
import { localDay } from '@shared/dates';
import { db } from '../db/client';
import { folders, pushSubscriptions, sets, users } from '../db/schema';
import { env } from '../env';
import { log, reportError } from '../log';
import { reminderEmail } from './email/templates';
import { sendEmail } from './email/transport';
import { purgeOrphanedMedia } from './media';
import { purgeExpiredRateLimits } from './rate-limit';

if (env.pushEnabled) setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

interface Candidate extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  timezone: string;
  daily_goal: number;
  reminder_channel: string;
  cards_today: number;
  due: number;
  streak: number;
}

async function sendPush(userId: string, payload: { title: string; body: string; url: string }): Promise<number> {
  if (!env.pushEnabled) return 0;
  const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload));
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // The browser has dropped this subscription: stop sending to it.
      if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      else reportError(err, { where: 'push', userId });
    }
  }
  return sent;
}

/**
 * Sends today's reminder to everyone whose chosen hour it is (in their own
 * time zone), who has not been reminded today, and who still has something to
 * do: reviews due, or a daily goal not yet reached.
 */
export async function runReminders(now = new Date()): Promise<number> {
  const candidates = await db.execute<Candidate>(sql`
    select u.id, u.name, u.email, u.timezone, u.daily_goal, u.reminder_channel,
           coalesce((select d.cards_studied from daily_activity d
                     where d.user_id = u.id and d.day = (${now}::timestamptz at time zone u.timezone)::date), 0)::int as cards_today,
           (select count(*)::int from card_progress cp join sets s on s.id = cp.set_id
             where cp.user_id = u.id and cp.due_at <= ${now}::timestamptz and s.deleted_at is null) as due,
           coalesce((select st.current_streak from streaks st where st.user_id = u.id), 0)::int as streak
    from users u
    where u.reminder_channel <> 'off'
      and u.onboarded_at is not null and u.consent_status <> 'pending'
      and extract(hour from (${now}::timestamptz at time zone u.timezone))::int = u.reminder_hour
      and (u.last_reminder_day is null or u.last_reminder_day < (${now}::timestamptz at time zone u.timezone)::date)
    limit 1000
  `);
  let sent = 0;
  for (const user of candidates.rows) {
    const today = localDay(now, user.timezone);
    const goalOpen = user.daily_goal > 0 && user.cards_today < user.daily_goal;
    // Recorded either way, so the hour is not re-checked for this user today.
    await db.update(users).set({ lastReminderDay: today }).where(eq(users.id, user.id));
    if (user.due === 0 && !goalOpen) continue;
    try {
      const url = `${env.appUrl}${user.due > 0 ? '/review' : '/home'}`;
      if (user.reminder_channel === 'push') {
        const body = user.due > 0 ? `${user.due} ${user.due === 1 ? 'card is' : 'cards are'} ready for review.` : "You haven't reached today's goal yet.";
        const delivered = await sendPush(user.id, { title: 'Time to study', body, url });
        // No working device: fall back to email rather than silently skipping.
        if (delivered === 0) await sendEmail(reminderEmail(user, { dueCount: user.due, streak: user.streak, url }));
      } else {
        await sendEmail(reminderEmail(user, { dueCount: user.due, streak: user.streak, url }));
      }
      sent++;
    } catch (err) {
      reportError(err, { where: 'reminder', userId: user.id });
    }
  }
  return sent;
}

const THIRTY_DAYS = 30 * 86_400_000;

/** Permanently removes what was deleted more than thirty days ago. */
async function purgeDeleted(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - THIRTY_DAYS);
  await db.delete(sets).where(lt(sets.deletedAt, cutoff));
  await db.delete(folders).where(lt(folders.deletedAt, cutoff));
}

/** Every periodic job. Each is isolated so one failure does not stop the others. */
export async function runJobs(): Promise<Record<string, number | string>> {
  const result: Record<string, number | string> = {};
  const job = async (name: string, fn: () => Promise<number | void>) => {
    try {
      result[name] = (await fn()) ?? 'ok';
    } catch (err) {
      result[name] = 'failed';
      reportError(err, { where: `job:${name}` });
    }
  };
  await job('reminders', () => runReminders());
  await job('purgeDeleted', () => purgeDeleted());
  await job('orphanedMedia', () => purgeOrphanedMedia());
  await job('rateLimits', () => purgeExpiredRateLimits());
  return result;
}

/** Runs the jobs every ten minutes inside this process. Use the cron endpoint instead on serverless hosts. */
export function startScheduler(): () => void {
  const tick = () => void runJobs().then((r) => log.debug({ jobs: r }, 'scheduled jobs ran'));
  const timer = setInterval(tick, 10 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

export async function savePushSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ id: crypto.randomUUID(), userId, ...sub })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth } });
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}


