import { Layers, Plus, SearchX } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { LibraryTabs } from '@/components/library-tabs';
import { SetCard, SetCardSkeleton, SetGrid } from '@/components/set-card';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage } from '@/lib/me';
import { usePageTitle } from '@/lib/page';
import { useLibrary, type LibraryScope } from '@/lib/sets';

export default function Library() {
  const { t } = useI18n();
  usePageTitle(t('sets.yourLibrary'));
  const [scope, setScope] = useState<LibraryScope>('mine');
  const [filter, setFilter] = useState('');
  const query = useDeferredValue(filter.trim());
  const library = useLibrary(scope, query);
  const errorMessage = useErrorMessage();
  const sets = library.data?.pages.flatMap((p) => p.items) ?? [];

  const empty = {
    mine: { title: t('sets.emptyMineTitle'), body: t('sets.emptyMineBody') },
    starred: { title: t('sets.emptyStarredTitle'), body: t('sets.emptyStarredBody') },
    studied: { title: t('sets.emptyStudiedTitle'), body: t('sets.emptyStudiedBody') },
    recent: { title: t('sets.emptyRecentTitle'), body: t('sets.emptyRecentBody') },
  }[scope];

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">{t('sets.yourLibrary')}</h1>
        <Button asChild className="hidden sm:inline-flex">
          <Link to="/sets/new">
            <Plus aria-hidden="true" />
            {t('nav.createSet')}
          </Link>
        </Button>
      </div>
      <div className="mt-4">
        <LibraryTabs />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Select aria-label={t('sets.showing')} value={scope} onChange={(e) => setScope(e.target.value as LibraryScope)} className="sm:w-56">
          <option value="mine">{t('sets.scopeMine')}</option>
          <option value="studied">{t('sets.scopeStudied')}</option>
          <option value="starred">{t('sets.scopeStarred')}</option>
          <option value="recent">{t('sets.scopeRecent')}</option>
        </Select>
        <Input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('sets.filterPlaceholder')}
          aria-label={t('sets.filterLabel')}
          className="sm:max-w-sm"
        />
      </div>

      <div className="mt-5" aria-busy={library.isPending}>
        {library.isPending ? (
          <SetGrid>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <SetCardSkeleton />
              </li>
            ))}
          </SetGrid>
        ) : library.isError ? (
          <Alert variant="error" action={<Button variant="secondary" size="sm" onClick={() => library.refetch()}>{t('common.retry')}</Button>}>
            {errorMessage(library.error)}
          </Alert>
        ) : sets.length === 0 ? (
          query ? (
            <EmptyState icon={<SearchX />} title={t('sets.emptyFilter', { query })} />
          ) : (
            <EmptyState
              icon={<Layers />}
              title={empty.title}
              description={empty.body}
              action={
                scope === 'mine' ? (
                  <Button asChild>
                    <Link to="/sets/new">{t('sets.createFirst')}</Link>
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <>
            <SetGrid>
              {sets.map((set) => (
                <li key={set.id}>
                  <SetCard set={set} className="h-full" />
                </li>
              ))}
            </SetGrid>
            {library.hasNextPage ? (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" loading={library.isFetchingNextPage} onClick={() => library.fetchNextPage()}>
                  {t('common.loadMore')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
