import { and, asc, eq, inArray, isNull, notInArray, sql, type SQL } from 'drizzle-orm';
import type { CardDto, CardProgressDto, MediaRef, Page, SetDetail, SetSummary } from '@shared/api';
import { LIMITS, type Stage, type Subject, type Visibility } from '@shared/constants';
import { richToPlain, sanitizeRich } from '@shared/richtext';
import type { CardInput, SetInput } from '@shared/schemas';
import { db, type Tx } from '../db/client';
import { cardProgress, cards, media, setFolderLinks, folders, sets, setUserState, type CardProgressRow, type CardRow } from '../db/schema';
import type { Viewer } from '../http/context';
import { badRequest, conflict, notFound } from '../http/errors';
import { newId } from '../ids';
import { assertMayPublish, loadOwnedSet, loadViewableSet, viewableSetCondition } from './policies';

// ── Reading ──────────────────────────────────────────────────────────────────

interface SummaryRow extends Record<string, unknown> {
  id: string;
  title: string;
  description: string;
  subject: string;
  term_lang: string;
  definition_lang: string;
  visibility: string;
  card_count: number;
  owner_id: string;
  owner_name: string;
  owner_image: string | null;
  updated_at: Date;
  created_at: Date;
  starred: boolean;
  last_studied_at: Date | null;
  last_opened_at: Date | null;
  due_count: number | null;
  stage_points: number | null;
  tracked: number | null;
  sort_key?: unknown;
}

function toSummary(row: SummaryRow, viewerId: string | null): SetSummary {
  const tracked = row.tracked ?? 0;
  const mastery =
    tracked > 0 && row.card_count > 0
      ? Math.min(100, Math.round(((row.stage_points ?? 0) / (3 * row.card_count)) * 100))
      : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subject: row.subject as Subject,
    termLang: row.term_lang,
    definitionLang: row.definition_lang,
    visibility: row.visibility as Visibility,
    cardCount: row.card_count,
    owner: { id: row.owner_id, name: row.owner_name, image: row.owner_image },
    isOwner: viewerId !== null && row.owner_id === viewerId,
    starred: row.starred,
    updatedAt: new Date(row.updated_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    mastery,
    dueCount: row.due_count ?? 0,
    lastStudiedAt: row.last_studied_at ? new Date(row.last_studied_at).toISOString() : null,
  };
}

interface SummaryQuery {
  viewerId: string | null;
  /** Condition over `s` (sets), `st` (the viewer's set_user_state) and `u` (owner). */
  where: SQL;
  orderBy: SQL;
  limit: number;
  /** Extra expression returned as `sort_key`, for building the next cursor. */
  sortKey?: SQL;
}

/**
 * The one query behind every list of sets: set, owner, and the viewer's own
 * star, recency, mastery and due count, in a single round trip.
 */
export async function selectSetSummaries(q: SummaryQuery, tx: Tx = db): Promise<Array<SetSummary & { sortKey: unknown }>> {
  const viewer = q.viewerId;
  const result = await tx.execute<SummaryRow>(sql`
    select s.id, s.title, s.description, s.subject, s.term_lang, s.definition_lang, s.visibility,
           s.card_count, s.owner_id, s.updated_at, s.created_at,
           u.name as owner_name, u.image as owner_image,
           coalesce(st.starred, false) as starred, st.last_studied_at, st.last_opened_at,
           p.due_count, p.stage_points, p.tracked
           ${q.sortKey ? sql`, ${q.sortKey} as sort_key` : sql``}
    from sets s
    join users u on u.id = s.owner_id
    left join set_user_state st on st.set_id = s.id and st.user_id = ${viewer}
    left join lateral (
      select count(*) filter (where cp.due_at <= now())::int as due_count,
             coalesce(sum(case cp.stage when 'mastered' then 3 when 'familiar' then 2 when 'learning' then 1 else 0 end), 0)::int as stage_points,
             count(*) filter (where cp.stage <> 'new' or cp.correct_count + cp.incorrect_count > 0)::int as tracked
      from card_progress cp
      where cp.user_id = ${viewer} and cp.set_id = s.id
    ) p on true
    where ${q.where}
    order by ${q.orderBy}
    limit ${q.limit}
  `);
  return result.rows.map((row) => ({ ...toSummary(row, viewer), sortKey: row.sort_key }));
}

const mediaRef = (id: string | null): MediaRef | null => (id ? { id, url: `/api/media/${id}` } : null);

function toCardDto(card: CardRow): CardDto {
  return {
    id: card.id,
    position: card.position,
    term: card.term,
    termPlain: card.termPlain,
    definition: card.definition,
    definitionPlain: card.definitionPlain,
    termImage: mediaRef(card.termImageId),
    definitionImage: mediaRef(card.definitionImageId),
    termAudio: mediaRef(card.termAudioId),
    definitionAudio: mediaRef(card.definitionAudioId),
    aiGenerated: card.aiGenerated,
  };
}

export function toProgressDto(row: CardProgressRow): CardProgressDto {
  return {
    cardId: row.cardId,
    stage: row.stage as Stage,
    easeFactor: row.easeFactor,
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    lapses: row.lapses,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
    correctCount: row.correctCount,
    incorrectCount: row.incorrectCount,
    streak: row.streak,
    starred: row.starred,
  };
}

/** Everything the set page and the study modes need, in one response. */
export async function getSetDetail(viewer: Viewer | null, setId: string, options: { touch?: boolean } = {}): Promise<SetDetail> {
  const access = await loadViewableSet(viewer, setId);
  const viewerId = viewer?.id ?? null;

  const [[summary], cardRows, progressRows, folderRows, source] = await Promise.all([
    selectSetSummaries({ viewerId, where: sql`s.id = ${setId}`, orderBy: sql`s.id`, limit: 1 }),
    db.select().from(cards).where(eq(cards.setId, setId)).orderBy(asc(cards.position), asc(cards.id)),
    viewerId
      ? db
          .select()
          .from(cardProgress)
          .where(and(eq(cardProgress.userId, viewerId), eq(cardProgress.setId, setId)))
      : Promise.resolve([]),
    viewerId
      ? db
          .select({ folderId: setFolderLinks.folderId })
          .from(setFolderLinks)
          .innerJoin(folders, eq(folders.id, setFolderLinks.folderId))
          .where(and(eq(setFolderLinks.setId, setId), eq(folders.ownerId, viewerId), isNull(folders.deletedAt)))
      : Promise.resolve([]),
    access.set.sourceSetId
      ? db
          .select({ id: sets.id, title: sets.title })
          .from(sets)
          .where(and(eq(sets.id, access.set.sourceSetId), isNull(sets.deletedAt), sql`${sets.visibility} <> 'private'`))
          .limit(1)
      : Promise.resolve([]),
  ]);
  if (!summary) throw notFound();

  if (viewerId && options.touch !== false) {
    await db
      .insert(setUserState)
      .values({ userId: viewerId, setId, lastOpenedAt: new Date() })
      .onConflictDoUpdate({ target: [setUserState.userId, setUserState.setId], set: { lastOpenedAt: new Date() } });
  }

  const { sortKey: _sortKey, ...rest } = summary;
  return {
    ...rest,
    cards: cardRows.map(toCardDto),
    progress: Object.fromEntries(progressRows.map((row) => [row.cardId, toProgressDto(row)])),
    folderIds: folderRows.map((f) => f.folderId),
    canEdit: access.isOwner,
    viaClass: access.viaClass,
    sourceSet: source[0] ?? null,
  };
}

// ── Cursors ──────────────────────────────────────────────────────────────────

function encodeCursor(parts: unknown[]): string {
  return Buffer.from(JSON.stringify(parts)).toString('base64url');
}

function decodeCursor(cursor: string | undefined): unknown[] | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    throw badRequest('invalid_cursor', 'That page link is not valid.');
  }
}

export type LibraryScope = 'mine' | 'starred' | 'recent' | 'studied';

/** The viewer's own library, newest first, one page at a time. */
export async function listLibrary(
  viewer: Viewer,
  scope: LibraryScope,
  options: { cursor?: string; limit: number; q?: string },
): Promise<Page<SetSummary>> {
  const sortColumn = scope === 'mine' || scope === 'starred' ? sql`s.updated_at` : scope === 'recent' ? sql`st.last_opened_at` : sql`st.last_studied_at`;
  const scopeCondition =
    scope === 'mine'
      ? sql`s.owner_id = ${viewer.id} and s.deleted_at is null`
      : scope === 'starred'
        ? sql`st.starred and ${viewableSetCondition(viewer.id)}`
        : scope === 'recent'
          ? sql`st.last_opened_at is not null and ${viewableSetCondition(viewer.id)}`
          : sql`st.last_studied_at is not null and ${viewableSetCondition(viewer.id)}`;

  const cursor = decodeCursor(options.cursor);
  const after =
    cursor && typeof cursor[0] === 'string' && typeof cursor[1] === 'string'
      ? sql`and (${sortColumn}, s.id) < (${cursor[0]}::timestamptz, ${cursor[1]})`
      : sql``;
  const search = options.q?.trim() ? sql`and s.title ilike ${`%${options.q.trim().replace(/[\\%_]/g, '\\$&')}%`}` : sql``;

  const rows = await selectSetSummaries({
    viewerId: viewer.id,
    where: sql`${scopeCondition} ${search} ${after}`,
    orderBy: sql`${sortColumn} desc, s.id desc`,
    limit: options.limit + 1,
    sortKey: sortColumn,
  });
  const page = rows.slice(0, options.limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > options.limit && last ? encodeCursor([new Date(last.sortKey as string).toISOString(), last.id]) : null;
  return { items: page.map(({ sortKey: _k, ...item }) => item), nextCursor };
}

// ── Writing ──────────────────────────────────────────────────────────────────

interface PreparedCard {
  inputId: string | null;
  term: string;
  termPlain: string;
  definition: string;
  definitionPlain: string;
  termImageId: string | null;
  definitionImageId: string | null;
  termAudioId: string | null;
  definitionAudioId: string | null;
  aiGenerated: boolean;
}

/** Sanitises every card and drops the ones that are entirely empty. */
function prepareCards(input: CardInput[]): PreparedCard[] {
  const out: PreparedCard[] = [];
  input.forEach((card, index) => {
    const term = sanitizeRich(card.term);
    const definition = sanitizeRich(card.definition);
    if (term.length > LIMITS.cardSideMax || definition.length > LIMITS.cardSideMax) {
      throw badRequest('card_too_long', `Card ${index + 1} is longer than ${LIMITS.cardSideMax} characters on one side.`, { index });
    }
    const prepared: PreparedCard = {
      inputId: card.id ?? null,
      term,
      termPlain: richToPlain(term),
      definition,
      definitionPlain: richToPlain(definition),
      termImageId: card.termImageId ?? null,
      definitionImageId: card.definitionImageId ?? null,
      termAudioId: card.termAudioId ?? null,
      definitionAudioId: card.definitionAudioId ?? null,
      aiGenerated: card.aiGenerated ?? false,
    };
    const hasMedia = prepared.termImageId || prepared.definitionImageId || prepared.termAudioId || prepared.definitionAudioId;
    if (prepared.termPlain || prepared.definitionPlain || hasMedia) out.push(prepared);
  });
  return out;
}

/**
 * A card may only point at files the viewer uploaded, or files already on this
 * set (for example on a copy of someone else's set), and only in a matching slot.
 */
async function assertMediaAllowed(tx: Tx, viewerId: string, prepared: PreparedCard[], existing: CardRow[]): Promise<void> {
  const wanted = new Map<string, 'image' | 'audio'>();
  for (const card of prepared) {
    if (card.termImageId) wanted.set(card.termImageId, 'image');
    if (card.definitionImageId) wanted.set(card.definitionImageId, 'image');
    if (card.termAudioId) wanted.set(card.termAudioId, 'audio');
    if (card.definitionAudioId) wanted.set(card.definitionAudioId, 'audio');
  }
  if (wanted.size === 0) return;
  const alreadyOnSet = new Set(
    existing.flatMap((c) => [c.termImageId, c.definitionImageId, c.termAudioId, c.definitionAudioId]).filter((v): v is string => Boolean(v)),
  );
  const rows = await tx
    .select({ id: media.id, ownerId: media.ownerId, kind: media.kind })
    .from(media)
    .where(inArray(media.id, [...wanted.keys()]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const [id, kind] of wanted) {
    const row = byId.get(id);
    if (!row || row.kind !== kind || (row.ownerId !== viewerId && !alreadyOnSet.has(id))) {
      throw badRequest('invalid_media', 'One of the attached files could not be used.');
    }
  }
}

const CHUNK = 400;

async function writeCards(tx: Tx, setId: string, prepared: PreparedCard[], existing: CardRow[]): Promise<void> {
  const existingIds = new Set(existing.map((c) => c.id));
  const used = new Set<string>();
  const rows = prepared.map((card, position) => {
    // An id is honoured only if it already belongs to this set; anything else
    // is a new card. A client can therefore never address another set's cards.
    const keep = card.inputId && existingIds.has(card.inputId) && !used.has(card.inputId);
    const id = keep ? card.inputId! : newId();
    used.add(id);
    const { inputId: _inputId, ...fields } = card;
    return { id, setId, position, ...fields };
  });

  const keptIds = rows.map((r) => r.id);
  await tx.delete(cards).where(keptIds.length > 0 ? and(eq(cards.setId, setId), notInArray(cards.id, keptIds)) : eq(cards.setId, setId));

  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx
      .insert(cards)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: cards.id,
        set: {
          position: sql`excluded.position`,
          term: sql`excluded.term`,
          termPlain: sql`excluded.term_plain`,
          definition: sql`excluded.definition`,
          definitionPlain: sql`excluded.definition_plain`,
          termImageId: sql`excluded.term_image_id`,
          definitionImageId: sql`excluded.definition_image_id`,
          termAudioId: sql`excluded.term_audio_id`,
          definitionAudioId: sql`excluded.definition_audio_id`,
          aiGenerated: sql`excluded.ai_generated`,
          updatedAt: sql`case when (cards.term, cards.definition) is distinct from (excluded.term, excluded.definition) then now() else cards.updated_at end`,
        },
        setWhere: eq(cards.setId, setId),
      });
  }
}

function metaFields(input: SetInput, prepared: PreparedCard[]) {
  return {
    title: input.title,
    description: input.description,
    subject: input.subject,
    termLang: input.termLang,
    definitionLang: input.definitionLang,
    visibility: input.visibility,
    cardCount: prepared.length,
    termsText: prepared
      .map((c) => c.termPlain)
      .join('\n')
      .slice(0, 100_000),
  };
}

export async function createSet(viewer: Viewer, input: SetInput, options: { sourceSetId?: string } = {}): Promise<string> {
  if (input.visibility === 'public') assertMayPublish(viewer);
  const prepared = prepareCards(input.cards);
  const id = newId();
  await db.transaction(async (tx) => {
    await assertMediaAllowed(tx, viewer.id, prepared, []);
    await tx.insert(sets).values({ id, ownerId: viewer.id, sourceSetId: options.sourceSetId ?? null, ...metaFields(input, prepared) });
    await writeCards(tx, id, prepared, []);
  });
  return id;
}

/** Replaces a set's details and its whole ordered list of cards in one transaction. */
export async function saveSet(viewer: Viewer, setId: string, input: SetInput): Promise<void> {
  const prepared = prepareCards(input.cards);
  await db.transaction(async (tx) => {
    const set = await loadOwnedSet(viewer, setId, tx, { forUpdate: true });
    if (input.baseUpdatedAt && new Date(input.baseUpdatedAt).getTime() !== set.updatedAt.getTime()) {
      throw conflict('stale_set', 'This set was changed somewhere else since you opened it.');
    }
    if (input.visibility === 'public' && set.visibility !== 'public') assertMayPublish(viewer);
    const existing = await tx.select().from(cards).where(eq(cards.setId, setId));
    await assertMediaAllowed(tx, viewer.id, prepared, existing);
    await writeCards(tx, setId, prepared, existing);
    await tx
      .update(sets)
      .set({ ...metaFields(input, prepared), updatedAt: new Date() })
      .where(eq(sets.id, setId));
  });
}

/** Changes who can see a set without touching its content (the share dialog). */
export async function setVisibility(viewer: Viewer, setId: string, visibility: Visibility): Promise<void> {
  const set = await loadOwnedSet(viewer, setId);
  if (visibility === 'public' && set.visibility !== 'public') assertMayPublish(viewer);
  await db.update(sets).set({ visibility }).where(eq(sets.id, setId));
}

export async function softDeleteSet(viewer: Viewer, setId: string): Promise<void> {
  await loadOwnedSet(viewer, setId);
  await db.update(sets).set({ deletedAt: new Date() }).where(eq(sets.id, setId));
}

export async function restoreSet(viewer: Viewer, setId: string): Promise<void> {
  const set = await loadOwnedSet(viewer, setId, db, { includeDeleted: true });
  if (set.deletedAt) await db.update(sets).set({ deletedAt: null }).where(eq(sets.id, setId));
}

/** A private copy of any set the viewer can see, linked back to the original. */
export async function duplicateSet(viewer: Viewer, setId: string, title?: string): Promise<string> {
  const { set } = await loadViewableSet(viewer, setId);
  const sourceCards = await db.select().from(cards).where(eq(cards.setId, setId)).orderBy(asc(cards.position));
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(sets).values({
      id,
      ownerId: viewer.id,
      title: (title?.trim() || `${set.title} (copy)`).slice(0, LIMITS.titleMax),
      description: set.description,
      subject: set.subject,
      termLang: set.termLang,
      definitionLang: set.definitionLang,
      visibility: 'private',
      cardCount: sourceCards.length,
      termsText: set.termsText,
      sourceSetId: set.id,
    });
    for (let i = 0; i < sourceCards.length; i += CHUNK) {
      await tx.insert(cards).values(
        sourceCards.slice(i, i + CHUNK).map((card) => ({
          ...card,
          id: newId(),
          setId: id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    }
  });
  return id;
}

export async function starSet(viewer: Viewer, setId: string, starred: boolean): Promise<void> {
  await loadViewableSet(viewer, setId);
  await db
    .insert(setUserState)
    .values({ userId: viewer.id, setId, starred })
    .onConflictDoUpdate({ target: [setUserState.userId, setUserState.setId], set: { starred } });
}

export async function starCard(viewer: Viewer, cardId: string, starred: boolean): Promise<void> {
  const [card] = await db.select({ id: cards.id, setId: cards.setId }).from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card) throw notFound();
  await loadViewableSet(viewer, card.setId);
  await db
    .insert(cardProgress)
    .values({ userId: viewer.id, cardId, setId: card.setId, starred })
    .onConflictDoUpdate({ target: [cardProgress.userId, cardProgress.cardId], set: { starred, updatedAt: new Date() } });
}
