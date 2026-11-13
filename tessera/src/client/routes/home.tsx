import { Flame, Layers, Plus, RotateCcw, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { SetSummary } from '@shared/api';
import { SetCard, SetCardSkeleton, SetGrid } from '@/components/set-card';
import { Button } from '@/components/ui/button';
import { EmptyState, ProgressBar } from '@/components/ui/feedback';
import { useI18n } from '@/lib/i18n';
import { useUser } from '@/lib/me';
import { usePageTitle } from '@/lib/page';
import { useLibrary } from '@/lib/sets';
import { useDashboard } from '@/lib/stats';
import { PromoSlot } from '@/components/promo';

function Section({ title, sets, more }: { title: string; sets: SetSummary[]; more?: boolean }) {
  const { t } = useI18n();
  if (sets.length === 0) return null;
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        {more ? (
          <Link to="/library" className="font-semibold text-primary hover:underline">
            {t('sets.homeSeeAll')}
          </Link>
        ) : null}
      </div>
      <SetGrid className="mt-3">
        {sets.map((set) => (
          <li key={set.id}>
            <SetCard set={set} className="h-full" />
          </li>
        ))}
      </SetGrid>
    </section>
  );
}

function Widget({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 font-sans text-sm font-semibold text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="mt-2 flex-1">{children}</div>
      {action ? <div className="mt-3">{action}</div> : null}
    </section>
  );
}

/** The signed-in start page: today's streak, goal and reviews, then the sets to jump back into. */
export default function Home() {
  const { t } = useI18n();
  usePageTitle(t('nav.home'));
  const user = useUser();
  const dashboard = useDashboard();
  const mine = useLibrary('mine', '');
  const data = dashboard.data;
  const recent = data?.recent.slice(0, 3) ?? [];
  const starred = (data?.starred ?? []).filter((s) => !recent.some((r) => r.id === s.id)).slice(0, 3);
  const shown = new Set([...recent, ...starred].map((s) => s.id));
  const mySets = (mine.data?.pages[0]?.items ?? []).filter((s) => !shown.has(s.id)).slice(0, 6);
  const loading = dashboard.isPending || mine.isPending;
  const empty = !loading && recent.length === 0 && starred.length === 0 && mySets.length === 0;
  const overview = data?.overview;
  const studiedToday = (overview?.today.cards ?? 0) > 0 || (overview?.today.seconds ?? 0) > 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold" dir="auto">
          {t('sets.homeGreeting', { name: user?.name ?? '' })}
        </h1>
        <Button asChild className="hidden sm:inline-flex lg:hidden">
          <Link to="/sets/new">
            <Plus aria-hidden="true" />
            {t('nav.createSet')}
          </Link>
        </Button>
      </div>

      {overview && data && !empty ? (
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <Widget icon={<Flame className="size-4 text-gold" aria-hidden="true" />} title={overview.streak.current > 0 ? t('home.streak', { count: overview.streak.current }) : t('home.streakNone')}>
            <p className="font-display text-4xl font-extrabold tabular-nums">{overview.streak.current}</p>
            <p className="text-sm text-muted-foreground">
              {studiedToday ? t('home.streakDone') : overview.streak.current > 0 ? t('home.streakKeep') : t('home.streakHint')}
              {overview.streak.longest > overview.streak.current ? ` ${t('home.longest', { count: overview.streak.longest })}` : ''}
            </p>
          </Widget>
          <Widget icon={<Target className="size-4 text-primary" aria-hidden="true" />} title={t('home.goalTitle')}>
            {overview.today.goal > 0 ? (
              <>
                <p className="font-display text-2xl font-extrabold tabular-nums">{t('home.goalProgress', { done: overview.today.cards, goal: overview.today.goal })}</p>
                <ProgressBar
                  className="mt-2"
                  value={(overview.today.cards / overview.today.goal) * 100}
                  label={t('home.goalProgress', { done: overview.today.cards, goal: overview.today.goal })}
                  barClassName={overview.today.goalMet ? 'bg-success' : undefined}
                />
                {overview.today.goalMet ? <p className="mt-2 text-sm font-semibold text-success">{t('home.goalMet')}</p> : null}
              </>
            ) : (
              <p className="text-muted-foreground">{t('home.goalOff')}</p>
            )}
          </Widget>
          <Widget
            icon={<RotateCcw className="size-4 text-primary" aria-hidden="true" />}
            title={t('home.dueTitle')}
            action={
              data.review.dueCount > 0 ? (
                <Button asChild className="w-full">
                  <Link to="/review/session">{t('review.start')}</Link>
                </Button>
              ) : undefined
            }
          >
            {data.review.dueCount > 0 ? (
              <p className="font-display text-2xl font-extrabold">{t('home.dueBody', { count: data.review.dueCount })}</p>
            ) : (
              <p className="text-muted-foreground">{t('home.dueNone')}</p>
            )}
          </Widget>
        </div>
      ) : null}

      {loading ? (
        <SetGrid className="mt-8" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i}>
              <SetCardSkeleton />
            </li>
          ))}
        </SetGrid>
      ) : empty ? (
        <EmptyState
          className="mt-8"
          icon={<Layers />}
          title={t('sets.homeEmptyTitle')}
          description={t('sets.homeEmptyBody')}
          action={
            <>
              <Button asChild size="lg">
                <Link to="/sets/new">{t('nav.createSet')}</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/browse">{t('home.browse')}</Link>
              </Button>
            </>
          }
        />
      ) : (
        <>
          <Section title={t('sets.homeRecent')} sets={recent} />
          <Section title={t('home.starred')} sets={starred} />
          <Section title={t('sets.homeYours')} sets={mySets} more={Boolean(mine.data?.pages[0]?.nextCursor) || mySets.length >= 6} />
        </>
      )}
      <PromoSlot className="mt-10" />
    </div>
  );
}
