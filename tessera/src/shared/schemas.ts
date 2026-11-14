/** Request validation shared by the server (enforcement) and the client (types). */
import { z } from 'zod';
import { LANGUAGE_CODES, LIMITS, STUDY_MODES, SUBJECTS, VISIBILITIES } from './constants';
import { ANSWER_KINDS } from './study';

const id = z.string().min(8).max(40).regex(/^[A-Za-z0-9_-]+$/);
const optionalId = id.nullable().optional();
const language = z.string().refine((v) => LANGUAGE_CODES.includes(v), 'Unsupported language');

const cardInputSchema = z.object({
  /** Present for a card that already exists; omitted for a new one. */
  id: optionalId,
  // Checked again, against the stored length, once the markup is sanitised.
  term: z.string().max(LIMITS.cardSideMax * 4),
  definition: z.string().max(LIMITS.cardSideMax * 4),
  termImageId: optionalId,
  definitionImageId: optionalId,
  termAudioId: optionalId,
  definitionAudioId: optionalId,
  aiGenerated: z.boolean().optional(),
});
export type CardInput = z.infer<typeof cardInputSchema>;

export const setInputSchema = z.object({
  title: z.string().trim().min(1, 'A title is required').max(LIMITS.titleMax),
  description: z.string().trim().max(LIMITS.descriptionMax).default(''),
  subject: z.enum(SUBJECTS).default('other'),
  termLang: language.default('en'),
  definitionLang: language.default('en'),
  visibility: z.enum(VISIBILITIES).default('private'),
  cards: z.array(cardInputSchema).max(LIMITS.cardsPerSet),
  /**
   * The `updatedAt` the editor started from. When sent, the save is refused if
   * the set has changed since, instead of silently overwriting that change.
   */
  baseUpdatedAt: z.string().datetime().optional(),
});
export type SetInput = z.infer<typeof setInputSchema>;

export const listQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(LIMITS.pageSize),
});

// ── Studying ─────────────────────────────────────────────────────────────────

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Expected a UUID');
const eventBase = { id: uuid, cardId: id, setId: id, at: z.string().datetime() };

const studyEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...eventBase,
    type: z.literal('answer'),
    mode: z.enum(STUDY_MODES),
    kind: z.enum(ANSWER_KINDS),
    correct: z.boolean(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('rating'),
    mode: z.literal('review'),
    rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
]);

const sessionInputSchema = z.object({
  clientId: uuid,
  setId: id.nullable(),
  mode: z.enum(STUDY_MODES),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationSeconds: z.number().int().min(0).max(6 * 3600),
  cardsStudied: z.number().int().min(0).max(20_000),
  correctCount: z.number().int().min(0).max(20_000),
  incorrectCount: z.number().int().min(0).max(20_000),
  score: z.number().min(0).max(100).nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

const matchScoreInputSchema = z.object({
  clientId: uuid,
  setId: id,
  timeMs: z.number().int().min(1000).max(3_600_000),
  pairs: z.number().int().min(2).max(12),
  mistakes: z.number().int().min(0).max(1000),
});
export type MatchScoreInput = z.infer<typeof matchScoreInputSchema>;

/** Everything a device has recorded since it last reached the server. */
export const syncInputSchema = z.object({
  events: z.array(studyEventSchema).max(500).default([]),
  sessions: z.array(sessionInputSchema).max(100).default([]),
  matchScores: z.array(matchScoreInputSchema).max(100).default([]),
});
export type SyncInput = z.infer<typeof syncInputSchema>;
