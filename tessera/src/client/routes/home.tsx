import { Layers, Plus } from 'lucide-react';
import { Link } from 'react-router';
import type { SetSummary } from '@shared/api';
import { SetCard, SetCardSkeleton, SetGrid } from '@/components/set-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { useI18n } from '@/lib/i18n';
import { useUser } from '@/lib/me';
import { usePageTitle } from '@/lib/page';
import { useLibrary } from '@/lib/sets';

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

/** The signed-in start page: recently opened sets and your own, or a way to make the first one. */
export default function Home() {
  const { t } = useI18n();
  usePageTitle(t('nav.home'));
  const user = useUser();
  const recent = useLibrary('recent', '');
  const mine = useLibrary('mine', '');
  const recentSets = recent.data?.pages[0]?.items.slice(0, 3) ?? [];
  const mySets = (mine.data?.pages[0]?.items ?? []).filter((s) => !recentSets.some((r) => r.id === s.id)).slice(0, 6);
  const loading = recent.isPending || mine.isPending;
  const empty = !loading && recentSets.length === 0 && mySets.length === 0;

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
            <Button asChild size="lg">
              <Link to="/sets/new">{t('nav.createSet')}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Section title={t('sets.homeRecent')} sets={recentSets} />
          <Section title={t('sets.homeYours')} sets={mySets} more={Boolean(mine.data?.pages[0]?.nextCursor) || mySets.length >= 6} />
        </>
      )}
    </div>
  );
}
