import { z } from 'zod';
import { LIMITS } from './constants';
import type { Distractors } from './learn';

const AI_SUGGEST_KINDS = ['definition', 'example', 'mnemonic'] as const;
export type AiSuggestKind = (typeof AI_SUGGEST_KINDS)[number];

const AI_SOURCES = ['notes', 'topic', 'file'] as const;
export type AiSource = (typeof AI_SOURCES)[number];

/** How many cards one generation request may ask for. */
export const AI_CARD_COUNT = { min: 3, max: 50, default: 15 } as const;
/** Cards whose wrong answers one distractor request may write. */
export const AI_DISTRACTOR_BATCH = 100;

const lang = z.string().trim().max(12).optional();
const short = (max: number) => z.string().trim().max(max);

export const aiGenerateTextSchema = z.object({
  source: z.enum(['notes', 'topic']),
  text: z.string().trim().min(1).max(LIMITS.aiSourceChars),
  count: z.coerce.number().int().min(AI_CARD_COUNT.min).max(AI_CARD_COUNT.max).default(AI_CARD_COUNT.default),
  termLang: lang,
  definitionLang: lang,
});
export type AiGenerateTextInput = z.infer<typeof aiGenerateTextSchema>;

export const aiGenerateFileFieldsSchema = aiGenerateTextSchema.pick({ count: true, termLang: true, definitionLang: true });

export const aiSuggestSchema = z.object({
  kind: z.enum(AI_SUGGEST_KINDS),
  term: short(LIMITS.cardSideMax).min(1),
  definition: short(LIMITS.cardSideMax).default(''),
  setTitle: short(LIMITS.titleMax).default(''),
  termLang: lang,
  definitionLang: lang,
});
export type AiSuggestInput = z.infer<typeof aiSuggestSchema>;

export const aiExplainSchema = z.object({
  setId: z.string().min(1).max(64),
  term: short(LIMITS.cardSideMax).min(1),
  definition: short(LIMITS.cardSideMax).min(1),
  given: short(LIMITS.cardSideMax).default(''),
  /** Which side the learner was asked to produce. */
  answerSide: z.enum(['term', 'definition']).default('definition'),
});
export type AiExplainInput = z.infer<typeof aiExplainSchema>;

export interface AiUsageDto {
  used: number;
  limit: number;
  /** Start of the next calendar month (UTC), when the allowance resets. */
  resetsAt: string;
}

export interface GeneratedCard {
  term: string;
  definition: string;
}

export interface AiGenerateResponse {
  title: string | null;
  cards: GeneratedCard[];
  usage: AiUsageDto;
}

export interface AiTextResponse {
  text: string;
  usage: AiUsageDto;
}

export interface AiDistractorsResponse {
  distractors: Distractors;
  /** Cards in the set that have no AI-written wrong answers yet. */
  missing: number;
  usage: AiUsageDto | null;
}
