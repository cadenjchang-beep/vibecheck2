import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardDto } from '@shared/api';
import { requeuePosition } from '@shared/review';
import { NEW_SCHEDULE, previewIntervals, RATINGS, type Rating } from '@shared/srs';
import { applyEvent, type CardProgress } from '@shared/study';
import { SideContent } from '@/components/study/side-content';
import { SessionSummary, StudyShell } from '@/components/study/shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { useUser } from '@/lib/me';
import { useRecorder, useStudySession } from '@/lib/study';
import { cn, isTypingTarget } from '@/lib/utils';

export interface ReviewEntry {
  card: CardDto;
  setId: string;
  setTitle: string;
  termLang: string;
  definitionLang: string;
  progress: CardProgress | undefined;
}

const RATING_STYLE: Record<Rating, string> = {
  1: 'border-destructive/50 hover:bg-destructive-soft',
  2: 'border-warning/70 hover:bg-warning-soft',
  3: 'border-success/50 hover:bg-success-soft',
  4: 'border-info/50 hover:bg-info-soft',
};

/**
 * One spaced-repetition session: show a card, reveal the answer, rate recall.
 * A card rated "again" comes back a few cards later, until it is recalled.
 */
export function ReviewSession({
  entries,
  shell,
  back,
  showSet,
  nextDueAt,
}: {
  entries: ReviewEntry[];
  shell: { id: string; title: string; closeTo?: string };
  back?: { to: string; label: string };
  showSet?: boolean;
  nextDueAt?: string | null;
}) {
  const { t, formatRelative } = useI18n();
  const user = useUser();
  const timeZone = user?.timezone ?? 'UTC';
  const recorder = useRecorder(shell.id, 'review');
  const session = useStudySession(shell.id || null, 'review');
  const [queue, setQueue] = useState(entries);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, remembered: 0, forgot: 0 });
  const total = useRef(entries.length);
  const answerRef = useRef<HTMLDivElement>(null);
  const current = queue[0];

  const labels = useMemo(() => ({ 1: t('review.again'), 2: t('review.hard'), 3: t('review.good'), 4: t('review.easy') }), [t]);
  const hints = useMemo(() => ({ 1: t('review.againHint'), 2: t('review.hardHint'), 3: t('review.goodHint'), 4: t('review.easyHint') }), [t]);

  const interval = (value: { minutes: number } | { days: number }) => {
    if ('minutes' in value) return t('review.inMinutes', { count: value.minutes });
    if (value.days < 30) return t('review.inDays', { count: value.days });
    if (value.days < 365) return t('review.inMonths', { count: Math.round(value.days / 30) });
    return t('review.inYears', { count: Math.round((value.days / 365) * 10) / 10 });
  };

  const rate = useCallback(
    (rating: Rating) => {
      if (!current || !revealed) return;
      recorder.rate(current.card.id, current.setId, rating);
      session.count(rating !== 1);
      const progress = applyEvent(
        current.progress,
        { id: 'local', type: 'rating', mode: 'review', cardId: current.card.id, setId: current.setId, rating, at: new Date().toISOString() },
        timeZone,
      );
      setStats((s) => ({ reviewed: s.reviewed + 1, remembered: s.remembered + (rating === 1 ? 0 : 1), forgot: s.forgot + (rating === 1 ? 1 : 0) }));
      setQueue((q) => {
        const rest = q.slice(1);
        if (rating !== 1) return rest;
        const again = { ...current, progress };
        const at = requeuePosition(rest.length);
        return [...rest.slice(0, at), again, ...rest.slice(at)];
      });
      setRevealed(false);
    },
    [current, revealed, recorder, session, timeZone],
  );

  useEffect(() => {
    if (queue.length === 0) session.finish();
  }, [queue.length, session]);

  useEffect(() => {
    if (revealed) answerRef.current?.focus();
  }, [revealed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      const onControl = event.target instanceof HTMLElement && Boolean(event.target.closest('button, a'));
      if (!revealed && (event.key === ' ' || event.key === 'Enter') && !onControl) {
        event.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault();
        rate(Number(event.key) as Rating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, rate]);

  const shellSet = { id: shell.id, title: shell.title };
  if (!current) {
    return (
      <StudyShell set={shellSet} mode="review" closeTo={shell.closeTo}>
        <SessionSummary
          setId={shell.id}
          back={back}
          title={t('review.doneTitle')}
          body={`${t('review.doneBody', { count: total.current })}${nextDueAt ? ` ${t('review.doneNext', { when: formatRelative(nextDueAt) })}` : ''}`}
          stats={[
            { label: t('review.reviewed'), value: stats.reviewed },
            { label: t('review.remembered'), value: stats.remembered },
            { label: t('review.forgot'), value: stats.forgot },
          ]}
        />
      </StudyShell>
    );
  }

  const preview = previewIntervals(current.progress ?? NEW_SCHEDULE);
  const done = total.current - new Set(queue.map((e) => e.card.id)).size;
  return (
    <StudyShell
      set={shellSet}
      mode="review"
      closeTo={shell.closeTo}
      status={<span>{t('review.remaining', { count: queue.length })}</span>}
      progress={{ value: (done / total.current) * 100, label: t('review.remaining', { count: queue.length }) }}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <section className="flex min-h-[38dvh] flex-1 flex-col rounded-3xl border border-border bg-card p-5 shadow-card sm:p-8" aria-labelledby="review-prompt">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
            <span>{t('study.term')}</span>
            {!current.progress?.lastReviewedAt ? <Badge variant="primary">{t('review.newCard')}</Badge> : null}
            {showSet ? (
              <span dir="auto" className="ms-auto truncate font-normal">
                {t('review.fromSet', { title: current.setTitle })}
              </span>
            ) : null}
          </div>
          <h1 id="review-prompt" className="mt-2 font-display text-3xl font-bold sm:text-4xl">
            <SideContent card={current.card} side="term" langs={current} />
          </h1>
          {revealed ? (
            <div ref={answerRef} tabIndex={-1} className="mt-6 border-t border-border pt-5 outline-none motion-safe:animate-fade-in" aria-live="polite">
              <p className="text-sm font-semibold text-muted-foreground">{t('study.definition')}</p>
              <div className="mt-1 text-xl sm:text-2xl">
                <SideContent card={current.card} side="definition" langs={current} />
              </div>
            </div>
          ) : null}
        </section>

        <div className="mt-5">
          {revealed ? (
            <fieldset>
              <legend className="mb-2.5 w-full text-center text-sm font-semibold text-muted-foreground">{t('review.howWell')}</legend>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {RATINGS.map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => rate(rating)}
                    className={cn('flex min-h-18 flex-col items-center justify-center rounded-2xl border-2 bg-card px-2 py-2 transition-colors', RATING_STYLE[rating])}
                  >
                    <span className="text-lg font-bold">{labels[rating]}</span>
                    <span className="text-sm text-muted-foreground">{hints[rating]}</span>
                    <span className="mt-0.5 text-sm font-semibold tabular-nums">{interval(preview[rating])}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <Button size="lg" className="w-full" autoFocus onClick={() => setRevealed(true)}>
              {t('review.showAnswer')}
            </Button>
          )}
        </div>
      </div>
    </StudyShell>
  );
}
