import type { Stage } from './constants';

/** How much of "mastered" each stage counts for when a set's mastery is averaged. */
export const STAGE_WEIGHT: Record<Stage, number> = { new: 0, learning: 1 / 3, familiar: 2 / 3, mastered: 1 };

export const STAGE_ORDER: Stage[] = ['new', 'learning', 'familiar', 'mastered'];

/** Mastery of a set, 0-100: the average stage weight over every card in it. */
export function masteryPercent(stages: Stage[], totalCards: number): number {
  if (totalCards <= 0) return 0;
  const points = stages.reduce((sum, stage) => sum + STAGE_WEIGHT[stage], 0);
  return Math.min(100, Math.round((points / totalCards) * 100));
}

export function countStages(stages: Stage[], totalCards: number): Record<Stage, number> {
  const counts: Record<Stage, number> = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  for (const stage of stages) counts[stage]++;
  // Cards with no progress row yet are new.
  const tracked = counts.new + counts.learning + counts.familiar + counts.mastered;
  counts.new += Math.max(0, totalCards - tracked);
  return counts;
}
