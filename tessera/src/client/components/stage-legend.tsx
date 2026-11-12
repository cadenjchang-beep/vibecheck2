import { STAGES, type Stage } from '@shared/constants';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { StageTile } from './mosaic';

/** The four stages with how many cards are in each. */
export function StageLegend({ counts, className }: { counts: Record<Stage, number>; className?: string }) {
  const { t } = useI18n();
  return (
    <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4', className)}>
      {[...STAGES].reverse().map((stage) => (
        <div key={stage} className="flex items-center gap-2">
          <StageTile stage={stage} className="size-4 shrink-0" />
          <dt className="text-sm text-muted-foreground">{t(`stages.${stage}`)}</dt>
          <dd className="ms-auto font-display font-bold tabular-nums sm:ms-0">{counts[stage]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  const { t } = useI18n();
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground', className)}>
      <StageTile stage={stage} className="size-3.5 shrink-0" />
      {t(`stages.${stage}`)}
    </span>
  );
}
