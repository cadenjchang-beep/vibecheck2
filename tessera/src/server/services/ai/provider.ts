import type { AiSuggestKind, GeneratedCard } from '@shared/ai';
import { LANGUAGES } from '@shared/constants';

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export type GenerateSource =
  | { kind: 'notes'; text: string }
  | { kind: 'topic'; text: string }
  | { kind: 'pdf'; data: Uint8Array; name: string }
  | { kind: 'image'; data: Uint8Array; mediaType: ImageMediaType; name: string };

export interface GenerateRequest {
  source: GenerateSource;
  count: number;
  termLanguage: string;
  definitionLanguage: string;
}

export interface SuggestRequest {
  kind: AiSuggestKind;
  term: string;
  definition: string;
  setTitle: string;
  termLanguage: string;
  definitionLanguage: string;
}

export interface ExplainRequest {
  term: string;
  definition: string;
  given: string;
  answerSide: 'term' | 'definition';
  setTitle: string;
  language: string;
}

export interface DistractorCard {
  id: string;
  term: string;
  definition: string;
}

export interface DistractorRequest {
  setTitle: string;
  cards: DistractorCard[];
  termLanguage: string;
  definitionLanguage: string;
}

export interface CardDistractors {
  id: string;
  wrongTerms: string[];
  wrongDefinitions: string[];
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface AiProvider {
  readonly name: 'anthropic' | 'mock';
  generateCards(request: GenerateRequest): Promise<{ title: string | null; cards: GeneratedCard[]; usage: TokenUsage }>;
  suggest(request: SuggestRequest): Promise<{ text: string; usage: TokenUsage }>;
  explain(request: ExplainRequest): Promise<{ text: string; usage: TokenUsage }>;
  distractors(request: DistractorRequest): Promise<{ items: CardDistractors[]; usage: TokenUsage }>;
}

/** "Español (es)" for prompts; unknown codes pass through unchanged. */
export function languageLabel(code: string): string {
  const known = LANGUAGES.find((l) => l.code === code);
  return known ? `${known.name} (${code})` : code || 'the same language as the material';
}
