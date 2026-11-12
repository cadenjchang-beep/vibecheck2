/** Request validation shared by the server (enforcement) and the client (types). */
import { z } from 'zod';
import { LANGUAGE_CODES, LIMITS, SUBJECTS, VISIBILITIES } from './constants';

const id = z.string().min(8).max(40).regex(/^[A-Za-z0-9_-]+$/);
const optionalId = id.nullable().optional();
const language = z.string().refine((v) => LANGUAGE_CODES.includes(v), 'Unsupported language');

export const cardInputSchema = z.object({
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
