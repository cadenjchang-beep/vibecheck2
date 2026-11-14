import { CalendarCheck } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { SetDetail } from '@shared/api';
import { buildReviewQueue } from '@shared/review';
import { ReviewSession, type ReviewEntry } from '@/components/study/review-session';
import { StudyGate, StudyShell } from '@/components/study/shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { useI18n } from '@/lib/i18n';
import { isStudyable } from '@/lib/sets';

/** Spaced repetition for one set: what is due, plus a few new cards. Built on the device, so it works offline. */
function SetReview({ set }: { set: SetDetail }) {
  const { t, formatRelative } = useI18n();
  // Fixed when the session starts: ratings must not reshuffle the queue under the learner.
  const { entries, nextDueAt } = useMemo(() => {
    const cards = set.cards.filter(isStudyable);
    const queue = buildReviewQueue(
      cards.map((c) => ({ cardId: c.id, dueAt: set.progress[c.id]?.dueAt ?? null, studied: Boolean(set.progress[c.id]?.lastReviewedAt) })),
      new Date(),
    );
    const byId = new Map(cards.map((c) => [c.id, c]));
    const list: ReviewEntry[] = [...queue.due, ...queue.fresh].map((id) => ({
      card: byId.get(id)!,
      setId: set.id,
      setTitle: set.title,
      termLang: set.termLang,
      definitionLang: set.definitionLang,
      progress: set.progress[id],
    }));
    return { entries: list, nextDueAt: queue.nextDueAt };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.id]);

  if (entries.length === 0) {
    return (
      <StudyShell set={set} mode="review">
        <EmptyState
          level={1}
          className="my-auto"
          icon={<CalendarCheck />}
          title={t('review.nothingDueTitle')}
          description={nextDueAt ? t('review.nothingDueSet', { when: formatRelative(nextDueAt) }) : t('review.nothingDueNever')}
          action={
            <Button asChild>
              <Link to={`/sets/${set.id}`}>{t('study.backToSet')}</Link>
            </Button>
          }
        />
      </StudyShell>
    );
  }
  return <ReviewSession entries={entries} shell={{ id: set.id, title: set.title }} nextDueAt={nextDueAt} />;
}

export default function SetReviewPage() {
  return (
    <StudyGate mode="review" minCards={1}>
      {(set) => <SetReview key={set.id} set={set} />}
    </StudyGate>
  );
}
