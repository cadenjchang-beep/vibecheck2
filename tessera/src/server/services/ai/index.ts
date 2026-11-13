import { AI_DISTRACTOR_BATCH, type AiUsageDto } from '@shared/ai';
import type { Distractors } from '@shared/learn';
import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { aiUsage, cardDistractors, cards } from '../../db/schema';
import { env } from '../../env';
import type { Viewer } from '../../http/context';
import { HttpError } from '../../http/errors';
import { sha256 } from '../../ids';
import { log } from '../../log';
import { enforceRateLimit } from '../rate-limit';
import { loadViewableSet } from '../policies';
import { anthropicProvider } from './anthropic';
import { mockProvider } from './mock';
import type { AiProvider, TokenUsage } from './provider';

export function aiProvider(): AiProvider {
  if (env.aiProvider === 'anthropic') return anthropicProvider;
  if (env.aiProvider === 'mock') return mockProvider;
  throw new HttpError(503, 'ai_unavailable', 'AI features are not set up on this server.');
}

function monthWindow(now = new Date()): { start: Date; next: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, next };
}

async function usedThisMonth(userId: string, tx: Pick<typeof db, 'select'> = db): Promise<number> {
  const { start } = monthWindow();
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, start)));
  return row?.count ?? 0;
}

export async function getAiUsage(viewer: Viewer): Promise<AiUsageDto> {
  return {
    used: await usedThisMonth(viewer.id),
    limit: viewer.entitlements.aiMonthlyLimit,
    resetsAt: monthWindow().next.toISOString(),
  };
}

/**
 * Runs one AI request against the viewer's monthly allowance. A usage row is
 * reserved under a per-user lock before calling the model, so parallel
 * requests cannot overshoot the limit, and released again if the call fails:
 * failed requests are not charged.
 */
export async function withAllowance<T extends { usage: TokenUsage }>(
  viewer: Viewer,
  feature: string,
  call: (provider: AiProvider) => Promise<T>,
): Promise<Omit<T, 'usage'> & { usage: AiUsageDto }> {
  const provider = aiProvider();
  if (!viewer.emailVerified) throw new HttpError(403, 'email_unverified', 'Confirm your email address to use AI features.');
  await enforceRateLimit(`ai:${viewer.id}`, { window: 60, max: 10 }, 'rate_limited');

  const limit = viewer.entitlements.aiMonthlyLimit;
  const reservation = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai:${viewer.id}`}))`);
    const used = await usedThisMonth(viewer.id, tx);
    if (used >= limit) {
      throw new HttpError(429, 'ai_quota_exceeded', 'You have used all your AI requests for this month.', {
        used,
        limit,
        resetsAt: monthWindow().next.toISOString(),
        plan: viewer.plan,
      });
    }
    const [row] = await tx.insert(aiUsage).values({ userId: viewer.id, feature }).returning({ id: aiUsage.id });
    return row!.id;
  });

  let result: T;
  const started = Date.now();
  try {
    result = await call(provider);
  } catch (error) {
    await db.delete(aiUsage).where(eq(aiUsage.id, reservation));
    throw error;
  }
  await db.update(aiUsage).set({ inputTokens: result.usage.input, outputTokens: result.usage.output }).where(eq(aiUsage.id, reservation));
  log.info({ feature, provider: provider.name, ms: Date.now() - started, tokensIn: result.usage.input, tokensOut: result.usage.output }, 'ai request');

  const { usage: _tokens, ...rest } = result;
  return { ...rest, usage: await getAiUsage(viewer) };
}

/* ---------------------------------------------------------------- */
/* Distractors: AI-written wrong answers, shared by everyone who studies the set. */

function contentHash(term: string, definition: string): string {
  return sha256(`${term}\u0000${definition}`);
}

const clean = (options: string[], real: string) => {
  const seen = new Set([real.trim().toLowerCase()]);
  return options
    .map((o) => o.trim())
    .filter((o) => {
      const key = o.toLowerCase();
      if (!o || o.length > 400 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
};

async function cachedDistractors(setId: string) {
  const rows = await db
    .select({
      id: cards.id,
      term: cards.termPlain,
      definition: cards.definitionPlain,
      hash: cardDistractors.sourceHash,
      terms: cardDistractors.termOptions,
      definitions: cardDistractors.definitionOptions,
    })
    .from(cards)
    .leftJoin(cardDistractors, eq(cardDistractors.cardId, cards.id))
    .where(eq(cards.setId, setId))
    .orderBy(asc(cards.position));

  const distractors: Distractors = {};
  const missing: { id: string; term: string; definition: string }[] = [];
  for (const row of rows) {
    if (row.hash && row.hash === contentHash(row.term, row.definition)) {
      distractors[row.id] = { term: row.terms ?? [], definition: row.definitions ?? [] };
    } else if (row.term.trim() && row.definition.trim()) {
      missing.push({ id: row.id, term: row.term, definition: row.definition });
    }
  }
  return { distractors, missing };
}

export async function getDistractors(viewer: Viewer | null, setId: string) {
  await loadViewableSet(viewer, setId);
  const { distractors, missing } = await cachedDistractors(setId);
  return { distractors, missing: missing.length, usage: null };
}

export async function writeDistractors(viewer: Viewer, setId: string) {
  const { set } = await loadViewableSet(viewer, setId);
  const { missing } = await cachedDistractors(setId);
  if (missing.length === 0) return getDistractors(viewer, setId);

  const batch = missing.slice(0, AI_DISTRACTOR_BATCH);
  const { usage } = await withAllowance(viewer, 'distractors', async (provider) => {
    // Smaller groups answer faster and keep each response well inside its limit.
    const groups: (typeof batch)[] = [];
    for (let i = 0; i < batch.length; i += 25) groups.push(batch.slice(i, i + 25));
    const results = await Promise.all(
      groups.map((group) =>
        provider.distractors({ setTitle: set.title, cards: group, termLanguage: set.termLang, definitionLanguage: set.definitionLang }),
      ),
    );
    const byId = new Map(batch.map((c) => [c.id, c]));
    const rows = results
      .flatMap((r) => r.items)
      .flatMap((item) => {
        const card = byId.get(item.id);
        if (!card) return [];
        return [
          {
            cardId: card.id,
            sourceHash: contentHash(card.term, card.definition),
            termOptions: clean(item.wrongTerms, card.term),
            definitionOptions: clean(item.wrongDefinitions, card.definition),
          },
        ];
      });
    if (rows.length) {
      await db
        .insert(cardDistractors)
        .values(rows)
        .onConflictDoUpdate({
          target: cardDistractors.cardId,
          set: {
            sourceHash: sql`excluded.source_hash`,
            termOptions: sql`excluded.term_options`,
            definitionOptions: sql`excluded.definition_options`,
            createdAt: sql`now()`,
          },
        });
    }
    return {
      written: rows.length,
      usage: results.reduce((sum, r) => ({ input: sum.input + r.usage.input, output: sum.output + r.usage.output }), { input: 0, output: 0 }),
    };
  });

  const fresh = await cachedDistractors(setId);
  return { distractors: fresh.distractors, missing: fresh.missing.length, usage };
}
