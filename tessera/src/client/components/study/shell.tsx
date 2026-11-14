import { CloudOff, Layers, Settings2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import type { SetDetail } from '@shared/api';
import type { StudyMode } from '@shared/constants';
import { SkipLink } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/controls';
import { Alert, EmptyState, PageLoading, ProgressBar } from '@/components/ui/feedback';
import { ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isActive, useErrorMessage, useUser } from '@/lib/me';
import { MODES } from '@/lib/modes';
import { useOnline } from '@/lib/online';
import { usePageTitle } from '@/lib/page';
import { isStudyable, useSet } from '@/lib/sets';
import { usePendingSync } from '@/lib/study';
import NotFound from '@/routes/not-found';

interface StudyShellProps {
  set: Pick<SetDetail, 'id' | 'title'>;
  mode: StudyMode;
  /** 0-100 with a spoken label, shown as a thin bar under the header. */
  progress?: { value: number; label: string };
  /** Short status shown next to the title, such as "3 of 20". */
  status?: ReactNode;
  onOpenOptions?: () => void;
  children: ReactNode;
  /** Where the close button leads; the set page by default. */
  closeTo?: string;
}

/**
 * The frame every study mode sits in: nothing on screen but the task, a way
 * out, and how far along you are.
 */
export function StudyShell({ set, mode, progress, status, onOpenOptions, children, closeTo }: StudyShellProps) {
  const { t } = useI18n();
  const info = MODES.find((m) => m.mode === mode)!;
  const modeName = t(info.label);
  usePageTitle(`${modeName}: ${set.title}`);
  const online = useOnline();
  const pending = usePendingSync();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SkipLink />
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-2 sm:px-4">
          <Tooltip label={t('study.close')}>
            <Button variant="ghost" size="icon" asChild>
              <Link to={closeTo ?? `/sets/${set.id}`} aria-label={t('study.close')}>
                <X aria-hidden="true" />
              </Link>
            </Button>
          </Tooltip>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-bold text-primary">
              <info.icon className="size-4" aria-hidden="true" />
              {modeName}
            </p>
            <p dir="auto" className="truncate text-sm text-muted-foreground">
              {set.title}
            </p>
          </div>
          {/* Only worth showing when offline: online, syncing takes a second and needs no attention. */}
          {!online ? (
            <Tooltip label={t('study.savedOffline')}>
              <span tabIndex={0} className="flex h-9 items-center gap-1.5 rounded-full bg-warning-soft px-2.5 text-sm font-semibold text-warning-soft-foreground" role="status">
                <CloudOff className="size-4" aria-hidden="true" />
                <span className="sr-only">{t('study.savedOffline')}</span>
                {pending > 0 ? <span aria-hidden="true">{pending}</span> : null}
              </span>
            </Tooltip>
          ) : null}
          {status ? <div className="shrink-0 font-display text-sm font-bold tabular-nums">{status}</div> : null}
          {onOpenOptions ? (
            <Tooltip label={t('study.options')}>
              <Button variant="ghost" size="icon" aria-label={t('study.options')} onClick={onOpenOptions}>
                <Settings2 aria-hidden="true" />
              </Button>
            </Tooltip>
          ) : null}
        </div>
        {progress ? <ProgressBar value={progress.value} label={progress.label} className="h-1.5 rounded-none" /> : <div className="h-px bg-border" />}
      </header>
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-5 outline-none sm:py-8">
        {children}
      </main>
    </div>
  );
}

interface StudyGateProps {
  mode: StudyMode;
  /** Fewest studyable cards the mode needs. */
  minCards: number;
  children: (set: SetDetail) => ReactNode;
}

/** Loads the set for a study mode and deals with every way that can go wrong. */
export function StudyGate({ mode, minCards, children }: StudyGateProps) {
  const { id } = useParams();
  const { t } = useI18n();
  const query = useSet(id);
  const errorMessage = useErrorMessage();

  if (query.isPending) return <PageLoading />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />;
    return (
      <div className="mx-auto max-w-xl p-6">
        <Alert variant="error" action={<Button variant="secondary" size="sm" onClick={() => query.refetch()}>{t('common.retry')}</Button>}>
          {errorMessage(query.error)}
        </Alert>
      </div>
    );
  }
  const set = query.data;
  if (set.cards.filter(isStudyable).length < minCards) {
    return (
      <StudyShell set={set} mode={mode}>
        <EmptyState
          level={1}
          className="my-auto"
          icon={<Layers />}
          title={t('study.notEnoughTitle')}
          description={t('study.notEnoughBody', { count: minCards })}
          action={
            <Button asChild>
              <Link to={set.canEdit ? `/sets/${set.id}/edit` : `/sets/${set.id}`}>{set.canEdit ? t('sets.addCards') : t('study.backToSet')}</Link>
            </Button>
          }
        />
      </StudyShell>
    );
  }
  return <>{children(set)}</>;
}

/** Shown at the end of a session to visitors, whose progress is not kept. */
function GuestNote({ setId }: { setId: string }) {
  const { t } = useI18n();
  const user = useUser();
  if (isActive(user)) return null;
  return (
    <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-primary-soft p-4 text-center text-primary-soft-foreground sm:flex-row sm:text-start">
      <p className="flex-1 font-semibold">{t('study.guestNote')}</p>
      <Button asChild>
        <Link to={`/signup?next=${encodeURIComponent(`/sets/${setId}`)}`}>{t('study.guestCta')}</Link>
      </Button>
    </div>
  );
}

interface NextStep {
  to: string;
  label: string;
  icon: ReactNode;
}

/** The end-of-session card shared by the study modes. */
export function SessionSummary({
  title,
  body,
  stats,
  children,
  primary,
  steps,
  setId,
  back,
}: {
  title: ReactNode;
  body?: ReactNode;
  stats?: Array<{ label: string; value: ReactNode }>;
  children?: ReactNode;
  primary?: ReactNode;
  steps?: NextStep[];
  setId: string;
  back?: { to: string; label: string };
}) {
  const { t } = useI18n();
  return (
    <section className="mx-auto my-auto w-full max-w-xl motion-safe:animate-rise" aria-labelledby="summary-title">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
        <h1 id="summary-title" tabIndex={-1} className="text-3xl font-extrabold outline-none">
          {title}
        </h1>
        {body ? <p className="mt-2 text-lg text-muted-foreground">{body}</p> : null}
        {stats && stats.length > 0 ? (
          <dl className="mt-5 grid grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-muted p-3 text-center">
                <dd className="font-display text-2xl font-extrabold tabular-nums">{stat.value}</dd>
                <dt className="text-sm text-muted-foreground">{stat.label}</dt>
              </div>
            ))}
          </dl>
        ) : null}
        {children}
        <div className="mt-6 flex flex-col gap-2">
          {primary}
          <Button variant="secondary" asChild>
            <Link to={back?.to ?? `/sets/${setId}`}>{back?.label ?? t('study.backToSet')}</Link>
          </Button>
        </div>
      </div>
      {steps && steps.length > 0 ? (
        <nav aria-label={t('study.nextUp')} className="mt-5">
          <h2 className="font-sans text-sm font-semibold text-muted-foreground">{t('study.nextUp')}</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {steps.map((step) => (
              <li key={step.to}>
                <Link
                  to={step.to}
                  className="flex h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 font-semibold shadow-card transition-colors hover:border-primary [&_svg]:size-5 [&_svg]:text-primary"
                >
                  {step.icon}
                  {step.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {setId ? <GuestNote setId={setId} /> : null}
    </section>
  );
}
