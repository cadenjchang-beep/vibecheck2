import { and, desc, eq, sql } from 'drizzle-orm';
import type { CardHistory, DashboardResponse, DayActivity, StatsDetailed, StatsOverview } from '@shared/api';
import type { Stage, StudyMode } from '@shared/constants';
import { addDays, localDay } from '@shared/dates';
import { db } from '../db/client';
import { cardProgress, cards, dailyActivity, reviewLogs } from '../db/schema';
import type { Viewer } from '../http/context';
import { notFound, paymentRequired } from '../http/errors';
import { loadViewableSet, viewableSetCondition } from './policies';
import { getReviewSummary } from './review';
import { selectSetSummaries, toProgressDto } from './sets';
import { readStreak } from './study';

async function activity(viewer: Viewer, days: number): Promise<DayActivity[]> {
  const today = localDay(new Date(), viewer.timezone);
  const first = addDays(today, -(days - 1));
  const rows = await db
    .select({ day: dailyActivity.day, cards: dailyActivity.cardsStudied, seconds: dailyActivity.secondsStudied })
    .from(dailyActivity)
    .where(and(eq(dailyActivity.userId, viewer.id), sql`${dailyActivity.day} >= ${first}`));
  const byDay = new Map(rows.map((r) => [r.day, r]));
  // Every day is present, including the ones with nothing studied.
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(first, i);
    return { day, cards: byDay.get(day)?.cards ?? 0, seconds: byDay.get(day)?.seconds ?? 0 };
  });
}

export async function getOverview(viewer: Viewer): Promise<StatsOverview> {
  const [streak, week, totals, mastered, setsStudied] = await Promise.all([
    readStreak(db, viewer),
    activity(viewer, 7),
    db.execute<{ cards: number; seconds: number; days: number }>(sql`
      select coalesce(sum(cards_studied), 0)::int as cards, coalesce(sum(seconds_studied), 0)::int as seconds,
             count(*) filter (where cards_studied > 0 or seconds_studied > 0)::int as days
      from daily_activity where user_id = ${viewer.id}
    `),
    db.execute<{ count: number }>(sql`
      select count(*)::int as count from card_progress cp
      join sets s on s.id = cp.set_id
      where cp.user_id = ${viewer.id} and cp.stage = 'mastered' and s.deleted_at is null
    `),
    db.execute<{ count: number }>(sql`
      select count(*)::int as count from set_user_state st
      join sets s on s.id = st.set_id
      where st.user_id = ${viewer.id} and st.last_studied_at is not null and s.deleted_at is null
    `),
  ]);
  const today = week[week.length - 1]!;
  return {
    streak,
    today: { cards: today.cards, seconds: today.seconds, goal: viewer.dailyGoal, goalMet: viewer.dailyGoal > 0 && today.cards >= viewer.dailyGoal },
    week,
    totals: {
      cards: totals.rows[0]?.cards ?? 0,
      seconds: totals.rows[0]?.seconds ?? 0,
      daysActive: totals.rows[0]?.days ?? 0,
      mastered: mastered.rows[0]?.count ?? 0,
      setsStudied: setsStudied.rows[0]?.count ?? 0,
    },
  };
}

/** Deeper analytics: a premium entitlement, enforced here rather than in the client. */
export async function getDetailed(viewer: Viewer): Promise<StatsDetailed> {
  if (!viewer.entitlements.detailedAnalytics) throw paymentRequired('detailedAnalytics');
  const visible = viewableSetCondition(viewer.id);
  const today = localDay(new Date(), viewer.timezone);
  const [days, byMode, hardest, due] = await Promise.all([
    activity(viewer, 84),
    db.execute<{ mode: string; sessions: number; seconds: number; correct: number; incorrect: number }>(sql`
      select mode, count(*)::int as sessions, coalesce(sum(duration_seconds), 0)::int as seconds,
             coalesce(sum(correct_count), 0)::int as correct, coalesce(sum(incorrect_count), 0)::int as incorrect
      from study_sessions
      where user_id = ${viewer.id} and started_at > now() - interval '90 days'
      group by mode order by seconds desc
    `),
    db.execute<{ card_id: string; set_id: string; title: string; term: string; definition: string; correct: number; incorrect: number }>(sql`
      select c.id as card_id, s.id as set_id, s.title, c.term_plain as term, c.definition_plain as definition,
             cp.correct_count as correct, cp.incorrect_count as incorrect
      from card_progress cp
      join cards c on c.id = cp.card_id
      join sets s on s.id = cp.set_id
      where cp.user_id = ${viewer.id} and cp.incorrect_count > 0 and ${visible}
      order by cp.incorrect_count::float / (cp.correct_count + cp.incorrect_count) desc, cp.incorrect_count desc
      limit 10
    `),
    db.execute<{ day: string; due: number }>(sql`
      select greatest((cp.due_at at time zone ${viewer.timezone})::date, ${today}::date)::text as day, count(*)::int as due
      from card_progress cp
      join sets s on s.id = cp.set_id
      where cp.user_id = ${viewer.id} and cp.due_at is not null
        and cp.due_at < now() + interval '14 days' and ${visible}
      group by 1
    `),
  ]);
  const dueByDay = new Map(due.rows.map((r) => [r.day, r.due]));
  return {
    days,
    byMode: byMode.rows.map((r) => ({ ...r, mode: r.mode as StudyMode })),
    hardest: hardest.rows.map((r) => ({ cardId: r.card_id, setId: r.set_id, setTitle: r.title, term: r.term, definition: r.definition, correct: r.correct, incorrect: r.incorrect })),
    forecast: Array.from({ length: 14 }, (_, i) => {
      const day = addDays(today, i);
      return { day, due: dueByDay.get(day) ?? 0 };
    }),
  };
}

/** Everything recorded for one card: where it stands and the answers that got it there. */
export async function getCardHistory(viewer: Viewer, cardId: string): Promise<CardHistory> {
  const [card] = await db.select({ id: cards.id, setId: cards.setId }).from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card) throw notFound();
  await loadViewableSet(viewer, card.setId);
  const [progress, events] = await Promise.all([
    db.select().from(cardProgress).where(and(eq(cardProgress.userId, viewer.id), eq(cardProgress.cardId, cardId))).limit(1),
    db.select().from(reviewLogs).where(and(eq(reviewLogs.userId, viewer.id), eq(reviewLogs.cardId, cardId))).orderBy(desc(reviewLogs.reviewedAt)).limit(30),
  ]);
  return {
    progress: progress[0] ? toProgressDto(progress[0]) : null,
    events: events.map((e) => ({
      at: e.reviewedAt.toISOString(),
      mode: e.mode as StudyMode,
      kind: e.kind,
      correct: e.correct,
      rating: e.rating,
      stageAfter: e.stageAfter as Stage,
    })),
  };
}

/** One request for the home page: today, what is due, and the sets to jump back into. */
export async function getDashboard(viewer: Viewer): Promise<DashboardResponse> {
  const visible = viewableSetCondition(viewer.id);
  const strip = <T extends { sortKey: unknown }>(rows: T[]) => rows.map(({ sortKey: _k, ...rest }) => rest);
  const [overview, review, recent, starred] = await Promise.all([
    getOverview(viewer),
    getReviewSummary(viewer),
    selectSetSummaries({ viewerId: viewer.id, where: sql`st.last_opened_at is not null and ${visible}`, orderBy: sql`st.last_opened_at desc`, limit: 6 }),
    selectSetSummaries({ viewerId: viewer.id, where: sql`st.starred and ${visible}`, orderBy: sql`s.updated_at desc`, limit: 6 }),
  ]);
  return { overview, review, recent: strip(recent), starred: strip(starred) };
}
