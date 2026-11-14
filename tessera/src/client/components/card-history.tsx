import { useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import type { CardDto, CardHistory } from '@shared/api';
import { api } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { StageBadge } from './stage-legend';
import { Dialog, DialogContent } from './ui/dialog';
import { Spinner } from './ui/feedback';

/** Where one card stands for you, and every answer that got it there. */
export function CardHistoryDialog({ card, onClose }: { card: CardDto | null; onClose: () => void }) {
  const { t, tMaybe, formatDate, formatRelative } = useI18n();
  const history = useQuery({
    queryKey: ['card-history', card?.id],
    queryFn: ({ signal }) => api<CardHistory>(`/api/stats/cards/${card!.id}/history`, { signal }),
    enabled: Boolean(card),
    gcTime: 0,
  });
  const p = history.data?.progress;
  return (
    <Dialog open={Boolean(card)} onOpenChange={(open) => !open && onClose()}>
      {card ? (
        <DialogContent title={t('stats.historyTitle', { term: card.termPlain })} size="sm">
          {history.isPending ? (
            <Spinner />
          ) : !p || history.data!.events.length === 0 ? (
            <p className="text-muted-foreground">{t('stats.historyEmpty')}</p>
          ) : (
            <>
              <StageBadge stage={p.stage} className="text-base text-foreground" />
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {[
                  [t('stats.historyRight'), p.correctCount],
                  [t('stats.historyWrong'), p.incorrectCount],
                  [t('stats.historyNextDue'), p.dueAt ? formatRelative(p.dueAt) : t('stats.historyNotScheduled')],
                  [t('stats.historyInterval'), t('common.days', { count: p.intervalDays })],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-muted px-3 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
              <ol className="mt-4 flex flex-col gap-1.5">
                {history.data!.events.map((event, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    {event.correct ? <Check className="size-4 shrink-0 text-success" aria-label={t('study.correct')} /> : <X className="size-4 shrink-0 text-destructive" aria-label={t('study.incorrect')} />}
                    <span className="flex-1">{tMaybe(`stats.kind_${event.kind}` as MessageKey) ?? event.kind}</span>
                    <time dateTime={event.at} className="text-muted-foreground">
                      {formatDate(event.at, { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                  </li>
                ))}
              </ol>
            </>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
