import {
  Copy,
  Download,
  EllipsisVertical,
  FolderPlus,
  Layers,
  Pencil,
  Printer,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Volume2,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { CardDto, SetDetail } from '@shared/api';
import { LANGUAGES, type Stage } from '@shared/constants';
import { toCsv } from '@shared/csv';
import { countStages, masteryPercent, STAGE_ORDER } from '@shared/progress';
import { Mosaic, StageTile } from '@/components/mosaic';
import { RichText } from '@/components/rich-text';
import { VisibilityBadge } from '@/components/set-card';
import { ShareDialog } from '@/components/share-dialog';
import { StageLegend } from '@/components/stage-legend';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Segmented, Tooltip } from '@/components/ui/controls';
import { Alert, Avatar, EmptyState, Skeleton } from '@/components/ui/feedback';
import { Select } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isActive, useErrorMessage, useUser } from '@/lib/me';
import { MODES } from '@/lib/modes';
import { usePageTitle } from '@/lib/page';
import { isStudyable, useDeleteSet, useDuplicateSet, useSet, useStarCard, useStarSet } from '@/lib/sets';
import { canSpeak, speak } from '@/lib/speech';
import { cn, downloadBlob, slugify } from '@/lib/utils';
import NotFound from './not-found';

/** Fewest studyable cards each mode needs to make sense. */
const MIN_CARDS = { flashcards: 1, learn: 2, test: 2, match: 2, review: 1, listen: 1 } as const;

function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="mt-3 h-5 w-1/3" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-40 rounded-2xl" />
      <div className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

function Header({ set }: { set: SetDetail }) {
  const { t, formatRelative } = useI18n();
  const user = useUser();
  const signedIn = isActive(user);
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const [shareOpen, setShareOpen] = useState(false);
  const star = useStarSet();
  const remove = useDeleteSet();
  const duplicate = useDuplicateSet();

  const exportCsv = () => {
    const csv = toCsv(set.cards.map((c) => [c.termPlain, c.definitionPlain]));
    // The byte-order mark makes spreadsheet apps read the file as UTF-8.
    downloadBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), `${slugify(set.title)}.csv`);
  };

  const makeCopy = () => {
    duplicate.mutate(
      { id: set.id, title: t('sets.copyTitle', { title: set.title }).slice(0, 120) },
      {
        onSuccess: ({ id }) => {
          toast.success(t('sets.duplicated'));
          navigate(`/sets/${id}`);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const deleteSet = () => remove.mutate(set, { onSuccess: () => navigate('/library', { replace: true }) });

  return (
    <header>
      {set.viaClass ? (
        <Alert variant="info" className="mb-4">
          {t('sets.viaClass', { name: set.viaClass.name })}
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-4">
        <div className="min-w-0 flex-1 basis-72">
          <h1 dir="auto" className="text-3xl font-extrabold break-words sm:text-4xl">
            {set.title}
          </h1>
          {set.description ? (
            <p dir="auto" className="mt-2 max-w-3xl whitespace-pre-wrap text-muted-foreground">
              {set.description}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Avatar name={set.owner.name} image={set.owner.image} className="size-6 text-[0.65rem]" />
              <span dir="auto">{t('sets.ownerLabel', { name: set.isOwner ? t('common.you') : set.owner.name })}</span>
            </span>
            <Badge>{t('common.termCount', { count: set.cardCount })}</Badge>
            {set.subject !== 'other' ? <Badge variant="outline">{t(`subjects.${set.subject}`)}</Badge> : null}
            {set.termLang !== set.definitionLang ? (
              <Badge variant="outline">{t('sets.languagePair', { term: languageName(set.termLang), definition: languageName(set.definitionLang) })}</Badge>
            ) : null}
            {set.isOwner ? <VisibilityBadge visibility={set.visibility} /> : null}
            <span>{t('sets.updated', { when: formatRelative(set.updatedAt) })}</span>
          </div>
          {set.sourceSet ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t('sets.copiedFrom')}{' '}
              <Link to={`/sets/${set.sourceSet.id}`} className="font-semibold text-primary hover:underline" dir="auto">
                {set.sourceSet.title}
              </Link>
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {signedIn ? (
            <Tooltip label={set.starred ? t('sets.unstarSet') : t('sets.starSet')}>
              <Button
                variant="secondary"
                size="icon"
                aria-label={set.starred ? t('sets.unstarSet') : t('sets.starSet')}
                aria-pressed={set.starred}
                onClick={() => star.mutate({ id: set.id, starred: !set.starred })}
              >
                <Star className={cn(set.starred && 'fill-gold text-gold')} aria-hidden="true" />
              </Button>
            </Tooltip>
          ) : null}
          <Button variant="secondary" onClick={() => setShareOpen(true)}>
            <Share2 aria-hidden="true" />
            <span className="hidden sm:inline">{t('sets.share')}</span>
            <span className="sr-only sm:hidden">{t('sets.share')}</span>
          </Button>
          {set.canEdit ? (
            <Button asChild>
              <Link to={`/sets/${set.id}/edit`}>
                <Pencil aria-hidden="true" />
                {t('sets.edit')}
              </Link>
            </Button>
          ) : null}
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label={t('common.more')}>
                <EllipsisVertical aria-hidden="true" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {signedIn ? (
                <>
                  <MenuItem onSelect={makeCopy}>
                    <Copy aria-hidden="true" />
                    {t('sets.duplicate')}
                  </MenuItem>
                  <MenuItem asChild>
                    <Link to={`/folders?add=${set.id}`}>
                      <FolderPlus aria-hidden="true" />
                      {t('sets.addToFolder')}
                    </Link>
                  </MenuItem>
                </>
              ) : null}
              <MenuItem onSelect={exportCsv} disabled={set.cards.length === 0}>
                <Download aria-hidden="true" />
                {t('sets.exportCsv')}
              </MenuItem>
              <MenuItem asChild disabled={set.cards.length === 0}>
                <Link to={`/sets/${set.id}/print`}>
                  <Printer aria-hidden="true" />
                  {t('sets.print')}
                </Link>
              </MenuItem>
              {set.canEdit ? (
                <>
                  <MenuSeparator />
                  <MenuItem destructive onSelect={deleteSet}>
                    <Trash2 aria-hidden="true" />
                    {t('sets.delete')}
                  </MenuItem>
                </>
              ) : null}
            </MenuContent>
          </Menu>
        </div>
      </div>
      <ShareDialog set={set} open={shareOpen} onOpenChange={setShareOpen} />
    </header>
  );
}

function ModePicker({ set, studyable }: { set: SetDetail; studyable: number }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="study-title" className="mt-7">
      <h2 id="study-title" className="sr-only">
        {t('sets.studyTitle')}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {MODES.map(({ mode, icon: Icon, label }) => {
          const needed = MIN_CARDS[mode];
          const enabled = studyable >= needed;
          const body = (
            <>
              <Icon className="size-6 text-primary" aria-hidden="true" />
              <span className="font-bold">{t(label)}</span>
              {mode === 'review' && set.dueCount > 0 ? (
                <Badge variant="primary" className="absolute end-2.5 top-2.5">
                  {t('sets.due', { count: set.dueCount })}
                </Badge>
              ) : null}
            </>
          );
          const classes =
            'relative flex h-24 flex-col items-start justify-between rounded-2xl border border-border bg-card p-4 shadow-card transition-[box-shadow,border-color]';
          return (
            <li key={mode}>
              {enabled ? (
                <Link to={`/sets/${set.id}/${mode}`} className={cn(classes, 'hover:border-primary hover:shadow-raised')}>
                  {body}
                </Link>
              ) : (
                <Tooltip label={t('sets.notEnoughCards', { count: needed })}>
                  <span tabIndex={0} aria-disabled="true" className={cn(classes, 'cursor-not-allowed opacity-55')}>
                    {body}
                    <span className="sr-only">{t('sets.notEnoughCards', { count: needed })}</span>
                  </span>
                </Tooltip>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProgressPanel({ set }: { set: SetDetail }) {
  const { t } = useI18n();
  const signedIn = isActive(useUser());
  const stages = useMemo(() => set.cards.map((c): Stage => set.progress[c.id]?.stage ?? 'new'), [set]);
  const counts = useMemo(() => countStages(stages, set.cards.length), [stages, set.cards.length]);
  const mastery = masteryPercent(stages, set.cards.length);
  // Furthest-along tiles first, so the mosaic fills in like a picture.
  const sorted = useMemo(() => [...stages].sort((a, b) => STAGE_ORDER.indexOf(b) - STAGE_ORDER.indexOf(a)), [stages]);

  if (set.cards.length === 0) return null;
  if (!signedIn) {
    return (
      <section className="mt-6 flex flex-col items-start gap-3 rounded-2xl bg-primary-soft p-5 text-primary-soft-foreground sm:flex-row sm:items-center">
        <p className="flex-1 font-semibold">{t('sets.progressGuest')}</p>
        <Button asChild>
          <Link to={`/signup?next=${encodeURIComponent(`/sets/${set.id}`)}`}>{t('sets.signUpToSave')}</Link>
        </Button>
      </section>
    );
  }
  return (
    <section aria-labelledby="progress-title" className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="progress-title" className="text-xl font-bold">
          {t('sets.progressTitle')}
        </h2>
        <p className="font-display text-2xl font-extrabold tabular-nums">{t('sets.mastery', { percent: mastery })}</p>
      </div>
      <Mosaic
        stages={sorted}
        className="mt-4"
        label={t('sets.progressSummary', { mastered: counts.mastered, familiar: counts.familiar, learning: counts.learning, fresh: counts.new })}
      />
      <StageLegend counts={counts} className="mt-4" />
    </section>
  );
}

interface TermRowProps {
  card: CardDto;
  stage: Stage;
  starred: boolean;
  termLang: string;
  definitionLang: string;
  showStage: boolean;
  onStar?: (cardId: string, starred: boolean) => void;
}

const TermRow = memo(function TermRow({ card, stage, starred, termLang, definitionLang, showStage, onStar }: TermRowProps) {
  const { t } = useI18n();
  const starLabel = starred ? t('sets.unstarCard', { term: card.termPlain }) : t('sets.starCard', { term: card.termPlain });
  const play = () => {
    if (card.termAudio) void new Audio(card.termAudio.url).play().catch(() => undefined);
    else speak(card.termPlain, termLang);
  };
  return (
    <li className="flex gap-2 rounded-2xl border border-border bg-card p-3 shadow-card [contain-intrinsic-size:auto_5rem] [content-visibility:auto] sm:p-4">
      {showStage ? (
        <Tooltip label={t(`stages.${stage}`)}>
          <span tabIndex={0} className="mt-1.5 shrink-0 rounded-[22%]">
            <StageTile stage={stage} className="size-4" />
            <span className="sr-only">{t(`stages.${stage}`)}</span>
          </span>
        </Tooltip>
      ) : null}
      <div className="grid min-w-0 flex-1 gap-x-6 gap-y-1.5 md:grid-cols-[2fr_3fr]">
        <div className="min-w-0">
          <RichText value={card.term} lang={termLang} className="font-semibold" />
          {card.termImage ? (
            <img src={card.termImage.url} alt={t('sets.imageFor', { text: card.termPlain })} loading="lazy" className="mt-2 max-h-32 rounded-lg border border-border" />
          ) : null}
        </div>
        <div className="min-w-0 md:border-s md:border-border md:ps-6">
          <RichText value={card.definition} lang={definitionLang} className="text-muted-foreground md:text-foreground" />
          {card.definitionImage ? (
            <img src={card.definitionImage.url} alt={t('sets.imageFor', { text: card.definitionPlain })} loading="lazy" className="mt-2 max-h-32 rounded-lg border border-border" />
          ) : null}
          {card.aiGenerated ? (
            <Badge variant="primary" className="mt-2">
              <Sparkles aria-hidden="true" />
              {t('common.aiGenerated')}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col sm:flex-row">
        {(canSpeak() || card.termAudio) && card.termPlain ? (
          <Button variant="ghost" size="icon-sm" aria-label={t('sets.speak', { text: card.termPlain })} onClick={play}>
            <Volume2 aria-hidden="true" />
          </Button>
        ) : null}
        {onStar ? (
          <Button variant="ghost" size="icon-sm" aria-label={starLabel} aria-pressed={starred} onClick={() => onStar(card.id, !starred)}>
            <Star className={cn(starred && 'fill-gold text-gold')} aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </li>
  );
});

type TermFilter = 'all' | 'starred';
type TermSort = 'original' | 'alpha' | 'stage';

function Terms({ set }: { set: SetDetail }) {
  const { t, locale } = useI18n();
  const signedIn = isActive(useUser());
  const [filter, setFilter] = useState<TermFilter>('all');
  const [sort, setSort] = useState<TermSort>('original');
  const starCard = useStarCard(set.id);
  const onStar = useMemo(
    () => (signedIn ? (cardId: string, starred: boolean) => starCard.mutate({ cardId, starred }) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signedIn, set.id],
  );
  const starredCount = set.cards.filter((c) => set.progress[c.id]?.starred).length;

  const cards = useMemo(() => {
    const list = filter === 'starred' ? set.cards.filter((c) => set.progress[c.id]?.starred) : [...set.cards];
    if (sort === 'alpha') {
      const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
      list.sort((a, b) => collator.compare(a.termPlain, b.termPlain));
    } else if (sort === 'stage') {
      const rank = (c: CardDto) => STAGE_ORDER.indexOf(set.progress[c.id]?.stage ?? 'new');
      list.sort((a, b) => rank(a) - rank(b));
    }
    return list;
  }, [set, filter, sort, locale]);

  if (set.cards.length === 0) {
    return (
      <EmptyState
        className="mt-6"
        icon={<Layers />}
        title={t('sets.emptyCardsTitle')}
        description={set.canEdit ? t('sets.emptyCardsBody') : undefined}
        action={
          set.canEdit ? (
            <Button asChild>
              <Link to={`/sets/${set.id}/edit`}>{t('sets.addCards')}</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <section aria-labelledby="terms-title" className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="terms-title" className="me-auto text-xl font-bold">
          {t('sets.termsTitle')} <span className="font-sans text-base font-normal text-muted-foreground">({set.cards.length})</span>
        </h2>
        {signedIn ? (
          <Segmented
            aria-label={t('sets.termsTitle')}
            size="sm"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: 'all', label: t('sets.termsAll') },
              { value: 'starred', label: `${t('sets.termsStarred')} (${starredCount})` },
            ]}
          />
        ) : null}
        <Select aria-label={t('sets.sortLabel')} value={sort} onChange={(e) => setSort(e.target.value as TermSort)} className="h-10 w-auto">
          <option value="original">{t('sets.sortOriginal')}</option>
          <option value="alpha">{t('sets.sortAlpha')}</option>
          {signedIn ? <option value="stage">{t('sets.sortStage')}</option> : null}
        </Select>
      </div>
      {cards.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-input p-6 text-center text-muted-foreground">{t('sets.noStarredTerms')}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {cards.map((card) => (
            <TermRow
              key={card.id}
              card={card}
              stage={set.progress[card.id]?.stage ?? 'new'}
              starred={Boolean(set.progress[card.id]?.starred)}
              termLang={set.termLang}
              definitionLang={set.definitionLang}
              showStage={signedIn}
              onStar={onStar}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SetDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const query = useSet(id);
  const errorMessage = useErrorMessage();
  usePageTitle(query.data?.title);

  if (query.isPending) return <DetailSkeleton />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />;
    return (
      <Alert variant="error" action={<Button variant="secondary" size="sm" onClick={() => query.refetch()}>{t('common.retry')}</Button>}>
        {errorMessage(query.error)}
      </Alert>
    );
  }
  const set = query.data;
  const studyable = set.cards.filter(isStudyable).length;
  return (
    <article>
      <Header set={set} />
      <ModePicker set={set} studyable={studyable} />
      <ProgressPanel set={set} />
      <Terms set={set} />
    </article>
  );
}
