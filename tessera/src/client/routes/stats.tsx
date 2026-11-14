import { Crown, Flame } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { StatsOverview } from '@shared/api';
import { BarChart, Heatmap } from '@/components/charts';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { useI18n } from '@/lib/i18n';
import { useEntitlements, useErrorMessage } from '@/lib/me';
import { MODES } from '@/lib/modes';
import { usePageTitle } from '@/lib/page';
import { dayDate, useDetailedStats, useOverview } from '@/lib/stats';

function Tile({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 font-display text-2xl font-extrabold tabular-nums">
        {icon}
        {value}
      </dd>
    </div>
  );
}

function WeekChart({ overview }: { overview: StatsOverview }) {
  const { t, formatDate } = useI18n();
  const [measure, setMeasure] = useState<'cards' | 'minutes'>('cards');
  const value = (d: StatsOverview['week'][number]) => (measure === 'cards' ? d.cards : Math.round(d.seconds / 60));
  const format = (n: number) => (measure === 'cards' ? t('stats.cardsOn', { count: n }) : t('stats.minutesOn', { count: n }));
  const total = overview.week.reduce((sum, d) => sum + value(d), 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6" aria-labelledby="week-title">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id="week-title" className="me-auto text-lg font-bold">
          {t('stats.weekTitle')}
        </h2>
        <Segmented
          aria-label={t('stats.weekTitle')}
          size="sm"
          value={measure}
          onValueChange={setMeasure}
          options={[
            { value: 'cards', label: t('stats.tableCards') },
            { value: 'minutes', label: t('stats.tableMinutes') },
          ]}
        />
      </div>
      <BarChart
        bars={overview.week.map((d, i) => ({
          key: d.day,
          label: formatDate(dayDate(d.day), { weekday: 'short' }),
          title: formatDate(dayDate(d.day), { weekday: 'long', day: 'numeric', month: 'short' }),
          value: value(d),
          emphasis: i === overview.week.length - 1,
        }))}
        format={format}
        goal={measure === 'cards' && overview.today.goal > 0 ? { value: overview.today.goal, label: t('stats.goalLine', { goal: overview.today.goal }) } : undefined}
        summary={`${t('stats.weekTitle')}: ${format(total)}`}
        columns={[t('stats.tableDay'), measure === 'cards' ? t('stats.tableCards') : t('stats.tableMinutes')]}
        empty={<p className="py-8 text-center text-muted-foreground">{t('stats.weekEmpty')}</p>}
      />
    </section>
  );
}

function Detailed() {
  const { t, formatDate, formatDuration } = useI18n();
  const entitlements = useEntitlements();
  const detailed = useDetailedStats(entitlements.detailedAnalytics);

  if (!entitlements.detailedAnalytics) {
    return (
      <section className="mt-8 rounded-2xl border border-dashed border-input p-6 text-center" aria-labelledby="detailed-title">
        <Crown className="mx-auto size-7 text-gold" aria-hidden="true" />
        <h2 id="detailed-title" className="mt-2 text-xl font-bold">
          {t('stats.detailedTitle')}
        </h2>
        <p className="mx-auto mt-1 max-w-lg text-muted-foreground">{t('stats.detailedLocked')}</p>
        <Button asChild className="mt-4">
          <Link to="/upgrade">{t('nav.upgrade')}</Link>
        </Button>
      </section>
    );
  }
  if (!detailed.data) return <Skeleton className="mt-8 h-64 rounded-2xl" />;
  const { days, byMode, hardest, forecast } = detailed.data;
  const card = 'rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6';
  const cards = (n: number) => t('stats.cardsOn', { count: n });
  const modeName = (mode: string) => t(MODES.find((m) => m.mode === mode)!.label);

  return (
    <section className="mt-8" aria-labelledby="detailed-title">
      <h2 id="detailed-title" className="text-xl font-bold">
        {t('stats.detailedTitle')}
      </h2>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h3 className="mb-3 font-sans font-bold">{t('stats.heatmapTitle')}</h3>
          <Heatmap
            days={days.map((d) => ({ day: d.day, value: d.cards, title: formatDate(dayDate(d.day), { day: 'numeric', month: 'short' }) }))}
            format={cards}
            summary={`${t('stats.heatmapTitle')}: ${cards(days.reduce((s, d) => s + d.cards, 0))}`}
          />
        </div>
        <div className={card}>
          <h3 className="mb-3 font-sans font-bold">{t('stats.forecastTitle')}</h3>
          <BarChart
            bars={forecast.map((f, i) => ({
              key: f.day,
              label: formatDate(dayDate(f.day), { day: 'numeric' }),
              title: formatDate(dayDate(f.day), { weekday: 'short', day: 'numeric', month: 'short' }),
              value: f.due,
              emphasis: i === 0,
            }))}
            format={(n) => t('stats.dueOn', { count: n })}
            summary={t('stats.forecastTitle')}
            columns={[t('stats.tableDay'), t('nav.review')]}
            empty={<p className="py-8 text-center text-muted-foreground">{t('stats.forecastEmpty')}</p>}
          />
        </div>
        <div className={card}>
          <h3 className="mb-3 font-sans font-bold">{t('stats.byModeTitle')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th scope="col" className="py-1.5 text-start font-semibold">{t('stats.modeColumn')}</th>
                <th scope="col" className="py-1.5 text-end font-semibold">{t('stats.sessionsColumn')}</th>
                <th scope="col" className="py-1.5 text-end font-semibold">{t('stats.timeColumn')}</th>
                <th scope="col" className="py-1.5 text-end font-semibold">{t('stats.accuracyColumn')}</th>
              </tr>
            </thead>
            <tbody>
              {byMode.map((m) => (
                <tr key={m.mode} className="border-b border-border last:border-0">
                  <th scope="row" className="py-1.5 text-start font-normal">{modeName(m.mode)}</th>
                  <td className="py-1.5 text-end tabular-nums">{m.sessions}</td>
                  <td className="py-1.5 text-end tabular-nums">{formatDuration(m.seconds)}</td>
                  <td className="py-1.5 text-end font-semibold tabular-nums">{m.correct + m.incorrect > 0 ? `${Math.round((m.correct / (m.correct + m.incorrect)) * 100)}%` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={card}>
          <h3 className="mb-3 font-sans font-bold">{t('stats.hardestTitle')}</h3>
          {hardest.length === 0 ? (
            <p className="text-muted-foreground">{t('stats.hardestEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {hardest.map((h) => (
                <li key={h.cardId} className="flex items-baseline gap-3">
                  <Link to={`/sets/${h.setId}`} dir="auto" className="min-w-0 flex-1 truncate font-semibold hover:text-primary hover:underline">
                    {h.term}
                  </Link>
                  <span className="shrink-0 text-sm text-muted-foreground">{t('stats.missed', { incorrect: h.incorrect, total: h.correct + h.incorrect })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Stats() {
  const { t, formatDuration, formatNumber } = useI18n();
  usePageTitle(t('stats.title'));
  const overview = useOverview();
  const errorMessage = useErrorMessage();

  return (
    <div>
      <h1 className="text-3xl font-extrabold">{t('stats.title')}</h1>
      {overview.isPending ? (
        <Skeleton className="mt-6 h-72 rounded-2xl" />
      ) : overview.isError ? (
        <Alert variant="error" className="mt-6">
          {errorMessage(overview.error)}
        </Alert>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Tile label={t('home.streak', { count: overview.data.streak.current })} value={overview.data.streak.current} icon={<Flame className="size-6 text-gold" aria-hidden="true" />} />
            <Tile label={t('stats.totalCards')} value={formatNumber(overview.data.totals.cards)} />
            <Tile label={t('stats.totalTime')} value={formatDuration(overview.data.totals.seconds)} />
            <Tile label={t('stats.totalMastered')} value={formatNumber(overview.data.totals.mastered)} />
            <Tile label={t('stats.totalDays')} value={formatNumber(overview.data.totals.daysActive)} />
          </dl>
          <div className="mt-4">
            <WeekChart overview={overview.data} />
          </div>
          <Detailed />
        </>
      )}
    </div>
  );
}
