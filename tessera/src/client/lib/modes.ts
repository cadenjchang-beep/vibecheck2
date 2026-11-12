import { Brain, ClipboardCheck, Headphones, Layers, Puzzle, RotateCcw, type LucideIcon } from 'lucide-react';
import type { StudyMode } from '@shared/constants';
import type { MessageKey } from './i18n';

export interface ModeInfo {
  mode: StudyMode;
  icon: LucideIcon;
  label: MessageKey;
  description: MessageKey;
}

/** Display order, icon and copy for the six study modes. */
export const MODES: ModeInfo[] = [
  { mode: 'flashcards', icon: Layers, label: 'landing.modeFlashcards', description: 'landing.modeFlashcardsBody' },
  { mode: 'learn', icon: Brain, label: 'landing.modeLearn', description: 'landing.modeLearnBody' },
  { mode: 'test', icon: ClipboardCheck, label: 'landing.modeTest', description: 'landing.modeTestBody' },
  { mode: 'match', icon: Puzzle, label: 'landing.modeMatch', description: 'landing.modeMatchBody' },
  { mode: 'review', icon: RotateCcw, label: 'landing.modeReview', description: 'landing.modeReviewBody' },
  { mode: 'listen', icon: Headphones, label: 'landing.modeListen', description: 'landing.modeListenBody' },
];
