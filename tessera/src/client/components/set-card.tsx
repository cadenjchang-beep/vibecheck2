import { Globe, Link2, Lock, RotateCcw, Star } from 'lucide-react';
import { Link } from 'react-router';
import type { SetSummary } from '@shared/api';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Avatar, ProgressBar, Skeleton } from './ui/feedback';

const visibilityIcon = { private: Lock, unlisted: Link2, public: Globe };

export function VisibilityBadge({ visibility }: { visibility: SetSummary['visibility'] }) {
  const { t } = useI18n();
  const Icon = visibilityIcon[visibility];
  const label = visibility === 'private' ? t('sets.badgePrivate') : visibility === 'unlisted' ? t('sets.badgeUnlisted') : t('sets.badgePublic');
  return (
    <Badge variant="outline">
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

/** A set as it appears in every list: library, dashboard, folders, search. */
export function SetCard({ set, className }: { set: SetSummary; className?: string }) {
  const { t } = useI18n();
  return (
    <Link
      to={`/sets/${set.id}`}
      className={cn(
        'group flex min-h-40 flex-col rounded-2xl border border-border bg-card p-4 shadow-card transition-[box-shadow,border-color] hover:border-primary/50 hover:shadow-raised sm:p-5',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <h3 dir="auto" className="line-clamp-2 flex-1 font-sans text-lg leading-snug font-bold group-hover:text-primary">
          {set.title}
        </h3>
        {set.starred ? <Star className="mt-1 size-4.5 shrink-0 fill-gold text-gold" aria-label={t('sets.scopeStarred')} role="img" /> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge>{t('common.termCount', { count: set.cardCount })}</Badge>
        {set.subject !== 'other' ? <Badge variant="outline">{t(`subjects.${set.subject}`)}</Badge> : null}
        {set.isOwner ? <VisibilityBadge visibility={set.visibility} /> : null}
        {set.dueCount > 0 ? (
          <Badge variant="primary">
            <RotateCcw aria-hidden="true" />
            {t('sets.due', { count: set.dueCount })}
          </Badge>
        ) : null}
      </div>
      <div className="mt-auto pt-4">
        {set.mastery !== null ? (
          <div className="flex items-center gap-3">
            <ProgressBar value={set.mastery} label={t('sets.mastery', { percent: set.mastery })} className="h-2" barClassName="bg-stage-mastered" />
            <span className="shrink-0 text-sm font-semibold text-muted-foreground" aria-hidden="true">
              {set.mastery}%
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Avatar name={set.owner.name} image={set.owner.image} className="size-6 text-[0.65rem]" />
            <span dir="auto" className="truncate">
              {set.isOwner ? t('common.you') : set.owner.name}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

export function SetCardSkeleton() {
  return (
    <div className="flex min-h-40 flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="mt-auto h-2 w-full" />
    </div>
  );
}

export function SetGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>{children}</ul>;
}
