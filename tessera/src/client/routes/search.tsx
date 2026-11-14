import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search as SearchIcon, SearchX } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { Page, SetSummary, SubjectCount } from '@shared/api';
import { SUBJECTS, type Subject } from '@shared/constants';
import { SetCard, SetCardSkeleton, SetGrid } from '@/components/set-card';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isActive, useErrorMessage, useUser } from '@/lib/me';
import { usePageTitle } from '@/lib/page';
import { keys } from '@/lib/query';

function useSearch(params: { q?: string; subject?: string; mine?: string }, enabled: boolean) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>;
  return useInfiniteQuery({
    queryKey: keys.search(clean),
    queryFn: ({ pageParam, signal }) => api<Page<SetSummary>>('/api/search', { query: { ...clean, cursor: pageParam }, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

function Results({ params, empty }: { params: { q?: string; subject?: string; mine?: string }; empty: { title: string; body: string } }) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const search = useSearch(params, true);
  const sets = search.data?.pages.flatMap((p) => p.items) ?? [];
  if (search.isPending) {
    return (
      <SetGrid aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <SetCardSkeleton />
          </li>
        ))}
      </SetGrid>
    );
  }
  if (search.isError) return <Alert variant="error">{errorMessage(search.error)}</Alert>;
  if (sets.length === 0) return <EmptyState icon={<SearchX />} title={empty.title} description={empty.body} />;
  return (
    <>
      <SetGrid>
        {sets.map((set) => (
          <li key={set.id}>
            <SetCard set={set} className="h-full" />
          </li>
        ))}
      </SetGrid>
      {search.hasNextPage ? (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" loading={search.isFetchingNextPage} onClick={() => search.fetchNextPage()}>
            {t('common.loadMore')}
          </Button>
        </div>
      ) : null}
    </>
  );
}

export default function SearchPage() {
  const { t } = useI18n();
  const signedIn = isActive(useUser());
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const subject = params.get('subject') ?? '';
  const mine = params.get('mine') ?? '';
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  usePageTitle(q ? t('search.resultsFor', { query: q }) : t('search.title'));

  const update = (patch: Record<string, string>) => {
    const next = { q, subject, mine, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: draft.trim() });
  };
  const active = Boolean(q || subject || mine);

  return (
    <div>
      <h1 className="text-3xl font-extrabold">{q ? t('search.resultsFor', { query: q }) : t('search.title')}</h1>
      <form role="search" onSubmit={submit} className="mt-4 flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.title')} className="ps-10" autoFocus={!q} enterKeyHint="search" />
        </div>
        <Select aria-label={t('search.subjectFilter')} value={subject} onChange={(e) => update({ subject: e.target.value })} className="md:w-56">
          <option value="">{t('search.allSubjects')}</option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {t(`subjects.${s}`)}
            </option>
          ))}
        </Select>
        {signedIn ? (
          <Select aria-label={t('search.scope')} value={mine} onChange={(e) => update({ mine: e.target.value })} className="md:w-56">
            <option value="">{t('search.scopeAll')}</option>
            <option value="1">{t('search.scopeMine')}</option>
          </Select>
        ) : null}
        <Button type="submit">{t('common.search')}</Button>
      </form>
      <div className="mt-6">
        {active ? (
          <Results params={{ q, subject, mine }} empty={{ title: t('search.emptyTitle'), body: t('search.emptyBody') }} />
        ) : (
          <EmptyState
            icon={<SearchIcon />}
            title={t('search.startTitle')}
            description={t('search.startBody')}
            action={
              <Button asChild variant="secondary">
                <Link to="/browse">{t('search.browseTitle')}</Link>
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

export function Browse() {
  const { t } = useI18n();
  usePageTitle(t('search.browseTitle'));
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: ({ signal }) => api<SubjectCount[]>('/api/search/subjects', { signal }), staleTime: 300_000 });
  return (
    <div>
      <h1 className="text-3xl font-extrabold">{t('search.browseTitle')}</h1>
      <p className="mt-2 text-muted-foreground">{t('search.browseBody')}</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SUBJECTS.map((subject) => (
          <li key={subject}>
            <Link to={`/browse/${subject}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/50">
              <span className="text-lg font-bold">{t(`subjects.${subject}`)}</span>
              <span className="text-sm text-muted-foreground">{t('search.subjectCount', { count: subjects.data?.find((s) => s.subject === subject)?.count ?? 0 })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BrowseSubject() {
  const { subject = '' } = useParams();
  const { t } = useI18n();
  const valid = (SUBJECTS as readonly string[]).includes(subject);
  const name = valid ? t(`subjects.${subject as Subject}`) : subject;
  usePageTitle(t('search.subjectTitle', { subject: name }));
  return (
    <div>
      <Link to="/browse" className="text-sm font-semibold text-primary hover:underline">
        {t('search.allSubjectsLink')}
      </Link>
      <h1 className="mt-1 text-3xl font-extrabold">{t('search.subjectTitle', { subject: name })}</h1>
      <div className="mt-6">
        <Results params={{ subject: valid ? subject : 'other' }} empty={{ title: t('search.emptyTitle'), body: t('search.subjectEmpty') }} />
      </div>
    </div>
  );
}
