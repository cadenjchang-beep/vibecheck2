import type { Stage } from '@shared/constants';
import { cn } from '@/lib/utils';

// Stage is shown twice over: by colour and by how much of the tile is filled,
// so the picture still reads without colour vision.
const fill: Record<Stage, string> = {
  new: 'scale-0',
  learning: 'scale-[0.45] bg-stage-learning',
  familiar: 'scale-[0.72] bg-stage-familiar',
  mastered: 'scale-100 bg-stage-mastered',
};

export function StageTile({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span
      className={cn(
        'relative block aspect-square rounded-[22%] border border-stage-new/70',
        stage === 'mastered' && 'border-transparent',
        className,
      )}
    >
      <span className={cn('absolute inset-0 rounded-[22%] transition-transform duration-500', fill[stage])} />
    </span>
  );
}

interface MosaicProps {
  stages: Stage[];
  /** Accessible summary, e.g. "12 mastered, 5 familiar, 3 learning, 4 new". */
  label?: string;
  className?: string;
  tileClassName?: string;
}

/** A set's progress as a mosaic: one tile per card. */
export function Mosaic({ stages, label, className, tileClassName }: MosaicProps) {
  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('grid grid-cols-[repeat(auto-fill,minmax(0.9rem,1fr))] gap-1', className)}
    >
      {stages.map((stage, i) => (
        <StageTile key={i} stage={stage} className={tileClassName} />
      ))}
    </div>
  );
}
