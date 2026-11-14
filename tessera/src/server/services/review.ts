import { sql } from 'drizzle-orm';
import { isChildBirth } from '@shared/age';
import type { MatchScoresResponse, ReviewQueueResponse, ReviewSummary } from '@shared/api';
import type { Stage } from '@shared/constants';
import { db } from '../db/client';
import type { Viewer } from '../http/context';
import { loadViewableSet, viewableSetCondition } from './policies';

interface DueRow extends Record<string, unknown> {
  card_id: string;
  position: number;
  term: string;
  term_plain: string;
  definition: string;
  definition_plain: string;
  term_image_id: string | null;
  definition_image_id: string | null;
  term_audio_id: string | null;
  definition_audio_id: string | null;
  ai_generated: boolean;
  set_id: string;
  set_title: string;
  term_lang: string;
  definition_lang: string;
  stage: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  due_at: Date;
  last_reviewed_at: Date | null;
  correct_count: number;
  incorrect_count: number;
  streak: number;
  starred: boolean;
}

const media = (id: string | null) => (id ? { id, url: `/api/media/${id}` } : null);

/**
 * The daily queue: every card whose review is due, across all sets the viewer
 * can still see, most overdue first. Served by the (user_id, due_at) index.
 */
export async function getReviewQueue(viewer: Viewer, limit: number): Promise<ReviewQueueResponse> {
  const visible = viewableSetCondition(viewer.id);
  const [rows, total] = await Promise.all([
    db.execute<DueRow>(sql`
      select c.id as card_id, c.position, c.term, c.term_plain, c.definition, c.definition_plain,
             c.term_image_id, c.definition_image_id, c.term_audio_id, c.definition_audio_id, c.ai_generated,
             s.id as set_id, s.title as set_title, s.term_lang, s.definition_lang,
             cp.stage, cp.ease_factor, cp.interval_days, cp.repetitions, cp.lapses, cp.due_at,
             cp.last_reviewed_at, cp.correct_count, cp.incorrect_count, cp.streak, cp.starred
      from card_progress cp
      join cards c on c.id = cp.card_id
      join sets s on s.id = cp.set_id
      where cp.user_id = ${viewer.id} and cp.due_at <= now() and ${visible}
      order by cp.due_at asc, c.position asc
      limit ${limit}
    `),
    db.execute<{ count: number }>(sql`
      select count(*)::int as count
      from card_progress cp
      join sets s on s.id = cp.set_id
      where cp.user_id = ${viewer.id} and cp.due_at <= now() and ${visible}
    `),
  ]);
  return {
    dueCount: total.rows[0]?.count ?? 0,
    items: rows.rows.map((row) => ({
      setId: row.set_id,
      setTitle: row.set_title,
      termLang: row.term_lang,
      definitionLang: row.definition_lang,
      card: {
        id: row.card_id,
        position: row.position,
        term: row.term,
        termPlain: row.term_plain,
        definition: row.definition,
        definitionPlain: row.definition_plain,
        termImage: media(row.term_image_id),
        definitionImage: media(row.definition_image_id),
        termAudio: media(row.term_audio_id),
        definitionAudio: media(row.definition_audio_id),
        aiGenerated: row.ai_generated,
      },
      progress: {
        cardId: row.card_id,
        stage: row.stage as Stage,
        easeFactor: row.ease_factor,
        intervalDays: row.interval_days,
        repetitions: row.repetitions,
        lapses: row.lapses,
        dueAt: new Date(row.due_at).toISOString(),
        lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at).toISOString() : null,
        correctCount: row.correct_count,
        incorrectCount: row.incorrect_count,
        streak: row.streak,
        starred: row.starred,
      },
    })),
  };
}

/** How much is due, broken down by set, and when the next card comes due. */
export async function getReviewSummary(viewer: Viewer): Promise<ReviewSummary> {
  const visible = viewableSetCondition(viewer.id);
  const [bySet, next] = await Promise.all([
    db.execute<{ id: string; title: string; card_count: number; due: number }>(sql`
      select s.id, s.title, s.card_count, count(*)::int as due
      from card_progress cp
      join sets s on s.id = cp.set_id
      where cp.user_id = ${viewer.id} and cp.due_at <= now() and ${visible}
      group by s.id
      order by due desc, s.title asc
      limit 100
    `),
    db.execute<{ next: Date | null }>(sql`
      select min(cp.due_at) as next
      from card_progress cp
      join sets s on s.id = cp.set_id
      where cp.user_id = ${viewer.id} and cp.due_at > now() and ${visible}
    `),
  ]);
  const nextDue = next.rows[0]?.next;
  return {
    dueCount: bySet.rows.reduce((sum, row) => sum + row.due, 0),
    sets: bySet.rows.map((row) => ({ setId: row.id, title: row.title, dueCount: row.due, cardCount: row.card_count })),
    nextDueAt: nextDue ? new Date(nextDue).toISOString() : null,
  };
}

/** Best Match times for a set and board size: the viewer's own, and the fastest players. */
export async function getMatchScores(viewer: Viewer | null, setId: string, pairs: number): Promise<MatchScoresResponse> {
  await loadViewableSet(viewer, setId);
  const [personal, leaders] = await Promise.all([
    viewer
      ? db.execute<{ time_ms: number; mistakes: number; created_at: Date }>(sql`
          select time_ms, mistakes, created_at from match_scores
          where user_id = ${viewer.id} and set_id = ${setId} and pairs = ${pairs}
          order by time_ms asc
          limit 5
        `)
      : Promise.resolve({ rows: [] as Array<{ time_ms: number; mistakes: number; created_at: Date }> }),
    db.execute<{ user_id: string; name: string; birth_year: number | null; birth_month: number | null; best: number }>(sql`
      select u.id as user_id, u.name, u.birth_year, u.birth_month, min(m.time_ms)::int as best
      from match_scores m
      join users u on u.id = m.user_id
      where m.set_id = ${setId} and m.pairs = ${pairs}
      group by u.id
      order by best asc
      limit 10
    `),
  ]);
  return {
    personal: personal.rows.map((row) => ({ timeMs: row.time_ms, mistakes: row.mistakes, createdAt: new Date(row.created_at).toISOString() })),
    leaders: leaders.rows.map((row) => {
      const isYou = viewer?.id === row.user_id;
      // Under-13 players are never named to other people.
      const hidden = !isYou && isChildBirth(row.birth_year, row.birth_month);
      return { name: hidden ? null : row.name, timeMs: row.best, isYou };
    }),
  };
}
