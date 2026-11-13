import type { GeneratedCard } from '@shared/ai';
import type { AiProvider } from './provider';

/**
 * A deterministic stand-in for the model, for tests and for running the app
 * without an API key. It is only used when AI_PROVIDER=mock is set, and the
 * client labels its output as sample text.
 */

const NO_USAGE = { input: 0, output: 0 };
const SEPARATORS = [/\t/, /\s+[-–—=]\s+/, /:\s+/];

function cardFromLine(line: string): GeneratedCard | null {
  for (const separator of SEPARATORS) {
    const parts = line.split(separator);
    if (parts.length >= 2) {
      const term = parts[0]!.trim();
      const definition = parts.slice(1).join(' ').trim();
      if (term && definition) return { term, definition };
    }
  }
  const is = /^(.{2,60}?)\s+(?:is|are|was|were|means)\s+(.{3,})$/i.exec(line);
  if (is) return { term: is[1]!.trim(), definition: is[2]!.replace(/\.$/, '').trim() };
  return null;
}

function fromNotes(text: string, count: number): GeneratedCard[] {
  const lines = text
    .split(/\n+|(?<=\.)\s+(?=[A-Z])/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const cards: GeneratedCard[] = [];
  for (const line of lines) {
    const card = cardFromLine(line);
    if (!card || seen.has(card.term.toLowerCase())) continue;
    seen.add(card.term.toLowerCase());
    cards.push(card);
    if (cards.length >= count) break;
  }
  return cards;
}

function samples(subject: string, count: number): GeneratedCard[] {
  return Array.from({ length: Math.min(count, 5) }, (_, i) => ({
    term: `${subject} — idea ${i + 1}`,
    definition: `Sample definition ${i + 1} about ${subject}. (Written by the test AI, not a real model.)`,
  }));
}

export const mockProvider: AiProvider = {
  name: 'mock',

  async generateCards({ source, count }) {
    if (source.kind === 'notes') {
      const cards = fromNotes(source.text, count);
      const title = source.text.split('\n')[0]!.slice(0, 60).trim();
      return { title: title || null, cards: cards.length ? cards : samples('your notes', count), usage: NO_USAGE };
    }
    if (source.kind === 'topic') return { title: source.text.slice(0, 60), cards: samples(source.text.slice(0, 60), count), usage: NO_USAGE };
    return { title: source.name.replace(/\.[a-z0-9]+$/i, ''), cards: samples(source.name, count), usage: NO_USAGE };
  },

  async suggest({ kind, term }) {
    const text = {
      definition: `A short definition of ${term}.`,
      example: `An example sentence that uses ${term}.`,
      mnemonic: `A memory trick for ${term}.`,
    }[kind];
    return { text, usage: NO_USAGE };
  },

  async explain({ term, definition, given, answerSide }) {
    const right = answerSide === 'definition' ? definition : term;
    const text = given
      ? `The answer is "${right}". You wrote "${given}", which belongs to a different card. Picture "${term}" together with "${definition}" to keep them linked.`
      : `The answer is "${right}". Picture "${term}" together with "${definition}" to keep them linked.`;
    return { text, usage: NO_USAGE };
  },

  async distractors({ cards }) {
    const items = cards.map((card, index) => {
      const others = cards.filter((_, i) => i !== index);
      const pick = (side: 'term' | 'definition', fallback: (n: number) => string) =>
        [0, 1, 2].map((n) => others[(index + n) % Math.max(others.length, 1)]?.[side] ?? fallback(n));
      return {
        id: card.id,
        wrongTerms: pick('term', (n) => `Not ${card.term} (${n + 1})`),
        wrongDefinitions: pick('definition', (n) => `Not quite: ${card.definition} (${n + 1})`),
      };
    });
    return { items, usage: NO_USAGE };
  },
};
