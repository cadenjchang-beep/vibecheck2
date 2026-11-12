import type { MediaRef, SetDetail } from '@shared/api';
import type { Subject, Visibility } from '@shared/constants';
import { isRichEmpty } from '@shared/richtext';
import type { SetInput } from '@shared/schemas';
import { uuid } from '@/lib/utils';

export interface DraftCard {
  /** Stable key for React and drag-and-drop; not sent to the server. */
  key: string;
  /** The server's id once the card has been saved. */
  id: string | null;
  term: string;
  definition: string;
  termImage: MediaRef | null;
  definitionImage: MediaRef | null;
  termAudio: MediaRef | null;
  definitionAudio: MediaRef | null;
  aiGenerated: boolean;
}

export interface Draft {
  title: string;
  description: string;
  subject: Subject;
  termLang: string;
  definitionLang: string;
  visibility: Visibility;
  cards: DraftCard[];
}

export type MediaSlot = 'termImage' | 'definitionImage' | 'termAudio' | 'definitionAudio';

export function blankCard(partial: Partial<DraftCard> = {}): DraftCard {
  return {
    key: uuid(),
    id: null,
    term: '',
    definition: '',
    termImage: null,
    definitionImage: null,
    termAudio: null,
    definitionAudio: null,
    aiGenerated: false,
    ...partial,
  };
}

export function emptyDraft(defaultLang: string): Draft {
  return {
    title: '',
    description: '',
    subject: 'other',
    termLang: defaultLang,
    definitionLang: defaultLang,
    visibility: 'private',
    cards: [blankCard(), blankCard(), blankCard()],
  };
}

export function draftFromSet(set: SetDetail): Draft {
  return {
    title: set.title,
    description: set.description,
    subject: set.subject,
    termLang: set.termLang,
    definitionLang: set.definitionLang,
    visibility: set.visibility,
    cards: set.cards.map((card) => ({
      key: card.id,
      id: card.id,
      term: card.term,
      definition: card.definition,
      termImage: card.termImage,
      definitionImage: card.definitionImage,
      termAudio: card.termAudio,
      definitionAudio: card.definitionAudio,
      aiGenerated: card.aiGenerated,
    })),
  };
}

export function isBlankCard(card: DraftCard): boolean {
  return (
    isRichEmpty(card.term) &&
    isRichEmpty(card.definition) &&
    !card.termImage &&
    !card.definitionImage &&
    !card.termAudio &&
    !card.definitionAudio
  );
}

export function isIncompleteCard(card: DraftCard): boolean {
  if (isBlankCard(card)) return false;
  const hasTerm = !isRichEmpty(card.term) || Boolean(card.termImage);
  const hasDefinition = !isRichEmpty(card.definition) || Boolean(card.definitionImage);
  return !hasTerm || !hasDefinition;
}

export function toSetInput(draft: Draft, baseUpdatedAt?: string): SetInput {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    subject: draft.subject,
    termLang: draft.termLang,
    definitionLang: draft.definitionLang,
    visibility: draft.visibility,
    baseUpdatedAt,
    cards: draft.cards
      .filter((card) => !isBlankCard(card))
      .map((card) => ({
        id: card.id,
        term: card.term,
        definition: card.definition,
        termImageId: card.termImage?.id ?? null,
        definitionImageId: card.definitionImage?.id ?? null,
        termAudioId: card.termAudio?.id ?? null,
        definitionAudioId: card.definitionAudio?.id ?? null,
        aiGenerated: card.aiGenerated,
      })),
  };
}

export type DraftAction =
  | { type: 'replace'; draft: Draft }
  | { type: 'meta'; patch: Partial<Omit<Draft, 'cards'>> }
  | { type: 'card'; key: string; patch: Partial<DraftCard> }
  | { type: 'add'; card?: DraftCard }
  | { type: 'insert'; card: DraftCard; index: number }
  | { type: 'remove'; key: string }
  | { type: 'move'; from: number; to: number }
  | { type: 'append'; cards: DraftCard[] }
  | { type: 'swap' };

export function draftReducer(state: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case 'replace':
      return action.draft;
    case 'meta':
      return { ...state, ...action.patch };
    case 'card':
      return { ...state, cards: state.cards.map((c) => (c.key === action.key ? { ...c, ...action.patch } : c)) };
    case 'add':
      return { ...state, cards: [...state.cards, action.card ?? blankCard()] };
    case 'insert': {
      const cards = [...state.cards];
      cards.splice(Math.min(action.index, cards.length), 0, action.card);
      return { ...state, cards };
    }
    case 'remove':
      return { ...state, cards: state.cards.filter((c) => c.key !== action.key) };
    case 'move': {
      if (action.from === action.to || action.to < 0 || action.to >= state.cards.length) return state;
      const cards = [...state.cards];
      const [moved] = cards.splice(action.from, 1);
      cards.splice(action.to, 0, moved!);
      return { ...state, cards };
    }
    case 'append': {
      // Imported cards replace the untouched blank rows at the end.
      const kept = [...state.cards];
      while (kept.length > 0 && isBlankCard(kept[kept.length - 1]!)) kept.pop();
      return { ...state, cards: [...kept, ...action.cards] };
    }
    case 'swap':
      return {
        ...state,
        termLang: state.definitionLang,
        definitionLang: state.termLang,
        cards: state.cards.map((c) => ({
          ...c,
          term: c.definition,
          definition: c.term,
          termImage: c.definitionImage,
          definitionImage: c.termImage,
          termAudio: c.definitionAudio,
          definitionAudio: c.termAudio,
        })),
      };
  }
}

// ── Local draft storage ──────────────────────────────────────────────────────
// Unsaved work survives a closed tab, a dropped connection or a crash.

interface StoredDraft {
  savedAt: number;
  draft: Draft;
}

const storageKey = (setId: string | undefined) => `tessera.draft.${setId ?? 'new'}`;

export function loadStoredDraft(setId: string | undefined): Draft | null {
  try {
    const raw = localStorage.getItem(storageKey(setId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    // Drafts older than two weeks are stale enough to be more confusing than useful.
    if (!parsed.draft || Date.now() - parsed.savedAt > 14 * 86_400_000) return null;
    return parsed.draft;
  } catch {
    return null;
  }
}

export function storeDraft(setId: string | undefined, draft: Draft): void {
  try {
    localStorage.setItem(storageKey(setId), JSON.stringify({ savedAt: Date.now(), draft } satisfies StoredDraft));
  } catch {
    /* storage full or unavailable: the draft simply is not kept */
  }
}

export function clearStoredDraft(setId: string | undefined): void {
  try {
    localStorage.removeItem(storageKey(setId));
  } catch {
    /* ignore */
  }
}
