import { sql } from 'drizzle-orm';
import type { Page, SetSummary, SubjectCount } from '@shared/api';
import { SUBJECTS, type Subject } from '@shared/constants';
import { db } from '../db/client';
import type { Viewer } from '../http/context';
import { selectSetSummaries } from './sets';

const MAX_OFFSET = 600;

export interface SearchInput {
  q?: string;
  subject?: Subject;
  /** Only the viewer's own sets. */
  mine?: boolean;
  offset: number;
  limit: number;
}

/**
 * Search over public sets and the viewer's own.
 *
 * Words are matched against title, subject, description and terms with the
 * full-text index (the last word as a prefix, so results appear while typing).
 * Titles are also matched loosely with trigrams, which catches typos and
 * scripts that are not separated into words.
 */
export async function searchSets(viewer: Viewer | null, input: SearchInput): Promise<Page<SetSummary>> {
  const viewerId = viewer?.id ?? null;
  const scope = input.mine && viewerId ? sql`s.owner_id = ${viewerId}` : sql`(s.visibility = 'public' or s.owner_id = ${viewerId})`;
  const subject = input.subject ? sql`and s.subject = ${input.subject}` : sql``;
  const q = input.q?.trim().slice(0, 100) ?? '';
  const words = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);

  let match = sql``;
  let order = sql`s.updated_at desc, s.id desc`;
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    if (words.length > 0) {
      const query = words.map((w, i) => (i === words.length - 1 ? `${w}:*` : w)).join(' & ');
      match = sql`and (s.search_tsv @@ to_tsquery('simple', ${query}) or s.title % ${q} or s.title ilike ${pattern})`;
      order = sql`ts_rank_cd(s.search_tsv, to_tsquery('simple', ${query})) + similarity(s.title, ${q}) desc, s.updated_at desc, s.id desc`;
    } else {
      match = sql`and s.title ilike ${pattern}`;
    }
  }

  const offset = Math.min(Math.max(0, input.offset), MAX_OFFSET);
  const rows = await selectSetSummaries({
    viewerId,
    where: sql`s.deleted_at is null and s.card_count > 0 and ${scope} ${subject} ${match}`,
    orderBy: sql`${order} offset ${offset}`,
    limit: input.limit + 1,
  });
  const items = rows.slice(0, input.limit).map(({ sortKey: _k, ...rest }) => rest);
  const more = rows.length > input.limit && offset + input.limit < MAX_OFFSET;
  return { items, nextCursor: more ? String(offset + input.limit) : null };
}

/** How many public sets each subject has, for the browse page. */
export async function subjectCounts(): Promise<SubjectCount[]> {
  const rows = await db.execute<{ subject: string; count: number }>(sql`
    select subject, count(*)::int as count from sets
    where visibility = 'public' and deleted_at is null and card_count > 0
    group by subject
  `);
  const counts = new Map(rows.rows.map((r) => [r.subject, r.count]));
  return SUBJECTS.map((subject) => ({ subject, count: counts.get(subject) ?? 0 }));
}
