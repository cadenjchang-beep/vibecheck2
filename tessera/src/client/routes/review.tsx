import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import type { ReviewQueueResponse, ReviewSummary } from '@shared/api';
import { ReviewSession } from '@/components/study/review-session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, PageLoading, Skeleton } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage } from '@/lib/me';
import { usePageTitle } from '@/lib/page';
import { keys } from '@/lib/query';

export function useReviewSummary(enabled = true) {
  return useQuery({
    queryKey: [...keys.review(), 'summary'],
    queryFn: ({ signal }) => api<ReviewSummary>('/api/review/summary', { signal }),
    enabled,
    staleTime: 60_000,
  });
}

/** The daily queue: everything due across all your sets. */
export default function ReviewHome() {
  const { t, formatRelative } = useI18n();
  usePageTitle(t('review.title'));
  const summary = useReviewSummary();
  const errorMessage = useErrorMessage();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold">{t('review.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('review.intro')}</p>
      {summary.isPending ? (
        <Skeleton className="mt-6 h-40 rounded-3xl" />
      ) : summary.isError ? (
        <Alert variant="error" className="mt-6">
          {errorMessage(summary.error)}
        </Alert>
      ) : summary.data.dueCount === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<CalendarCheck />}
          title={t('review.caughtUpTitle')}
          description={summary.data.nextDueAt ? t('review.caughtUpNext', { when: formatRelative(summary.data.nextDueAt) }) : t('review.caughtUpNone')}
          action={
            <Button asChild variant="secondary">
              <Link to="/library">{t('review.findSets')}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section className="mt-6 flex flex-col items-start gap-4 rounded-3xl border border-border bg-card p-6 shadow-card sm:flex-row sm:items-center sm:p-8">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-foreground" aria-hidden="true">
              <RotateCcw className="size-7" />
            </span>
            <p className="flex-1 font-display text-2xl font-extrabold">{t('review.dueToday', { count: summary.data.dueCount })}</p>
            <Button size="lg" asChild>
              <Link to="/review/session">{t('review.start')}</Link>
            </Button>
          </section>
          <h2 className="mt-8 text-xl font-bold">{t('review.bySet')}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {summary.data.sets.map((set) => (
              <li key={set.setId} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                <Link to={`/sets/${set.setId}`} dir="auto" className="min-w-0 flex-1 truncate font-semibold hover:text-primary hover:underline">
                  {set.title}
                </Link>
                <Badge variant="primary">{t('sets.due', { count: set.dueCount })}</Badge>
                <Button variant="secondary" size="sm" asChild>
                  <Link to={`/sets/${set.setId}/review`}>{t('review.reviewSet')}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function ReviewQueueSession() {
  const { t } = useI18n();
  const client = useQueryClient();
  const queue = useQuery({
    queryKey: [...keys.review(), 'queue'],
    queryFn: ({ signal }) => api<ReviewQueueResponse>('/api/review/queue', { signal }),
    // The queue is taken once per session; refetching mid-session would reorder it.
    staleTime: Infinity,
    gcTime: 0,
  });
  // Counts elsewhere are stale as soon as the session is left.
  useEffect(() => () => void client.invalidateQueries({ queryKey: keys.review() }), [client]);

  if (queue.isPending) return <PageLoading />;
  const back = { to: '/review', label: t('review.title') };
  if (queue.isError || queue.data.items.length === 0) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <EmptyState
          level={1}
          icon={<CalendarCheck />}
          title={t('review.caughtUpTitle')}
          action={
            <Button asChild>
              <Link to={back.to}>{back.label}</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <ReviewSession
      entries={queue.data.items.map((item) => ({ ...item, progress: item.progress ?? undefined }))}
      shell={{ id: '', title: t('review.dueToday', { count: queue.data.dueCount }), closeTo: '/review' }}
      back={back}
      showSet
    />
  );
}
