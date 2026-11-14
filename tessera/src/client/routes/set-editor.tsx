import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowLeft, ArrowLeftRight, FileUp, Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, Navigate, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { SetDetail } from '@shared/api';
import { LANGUAGES, LIMITS, SUBJECTS, type Subject, type Visibility } from '@shared/constants';
import type { ImportedCard } from '@shared/import';
import type { AiSuggestKind, GeneratedCard } from '@shared/ai';
import { isRichEmpty, plainToRich, richToPlain } from '@shared/richtext';
import { GenerateDialog } from '@/components/ai/generate-dialog';
import { CardRow } from '@/components/editor/card-row';
import {
  blankCard,
  clearStoredDraft,
  draftFromSet,
  draftReducer,
  emptyDraft,
  isBlankCard,
  isIncompleteCard,
  loadStoredDraft,
  storeDraft,
  toSetInput,
  type Draft,
  type DraftAction,
  type DraftCard,
} from '@/components/editor/draft';
import { ImportDialog } from '@/components/editor/import-dialog';
import { FormatToolbar } from '@/components/rich-editor';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, PageLoading } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { suggest, useAiAvailable, useRecordUsage } from '@/lib/ai';
import { ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage, useUser } from '@/lib/me';
import { usePageTitle } from '@/lib/page';
import { useSaveSet, useSet } from '@/lib/sets';
import NotFound from './not-found';

export default function SetEditor() {
  const { id } = useParams();
  const set = useSet(id);
  if (!id) return <EditorForm key="new" />;
  if (set.isPending) return <PageLoading />;
  if (set.isError) return <NotFound />;
  if (!set.data.canEdit) return <Navigate to={`/sets/${id}`} replace />;
  return <EditorForm key={id} set={set.data} />;
}

function EditorForm({ set }: { set?: SetDetail }) {
  const { t, locale } = useI18n();
  const setId = set?.id;
  usePageTitle(set ? t('editor.editTitle') : t('editor.newTitle'));
  const navigate = useNavigate();
  const user = useUser();
  const errorMessage = useErrorMessage();
  const save = useSaveSet(setId);

  // A draft left on this device takes priority over what the server has.
  const restored = useMemo(() => loadStoredDraft(setId), [setId]);
  const [draft, dispatch] = useReducer(draftReducer, undefined, (): Draft => {
    if (restored) return restored;
    if (set) return draftFromSet(set);
    return emptyDraft(LANGUAGES.some((l) => l.code === locale) ? locale : 'en');
  });
  const [dirty, setDirty] = useState(Boolean(restored));
  const [errors, setErrors] = useState<{ title?: string; cards?: string }>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [searchParams] = useSearchParams();
  const aiAvailable = useAiAvailable();
  const recordUsage = useRecordUsage();
  const [aiOpen, setAiOpen] = useState(() => searchParams.get('ai') === '1');
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const leaving = useRef(false);
  const focusKey = useRef<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const apply = useCallback((action: DraftAction) => {
    setDirty(true);
    dispatch(action);
  }, []);

  // Tell the user once that their earlier draft is back, and how to drop it.
  useEffect(() => {
    if (!restored) return;
    const toastId = toast(t('editor.draftRestored'), {
      duration: 12_000,
      action: {
        label: t('editor.draftDiscard'),
        onClick: () => {
          clearStoredDraft(setId);
          dispatch({ type: 'replace', draft: set ? draftFromSet(set) : emptyDraft('en') });
          setDirty(false);
        },
      },
    });
    return () => void toast.dismiss(toastId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the draft on this device while it is being edited.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => storeDraft(setId, draft), 600);
    return () => clearTimeout(timer);
  }, [draft, dirty, setId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );

  // Move the caret into a card that was just added.
  useEffect(() => {
    if (!focusKey.current) return;
    const field = document.querySelector<HTMLElement>(`[data-card-key="${focusKey.current}"] [data-rich-editor]`);
    focusKey.current = null;
    field?.focus();
  });

  const cards = draft.cards;
  const atLimit = cards.length >= LIMITS.cardsPerSet;
  const filled = cards.filter((c) => !isBlankCard(c)).length;
  const incomplete = cards.filter(isIncompleteCard).length;

  const addCard = useCallback(() => {
    const card = blankCard();
    focusKey.current = card.key;
    apply({ type: 'add', card });
  }, [apply]);

  const changeCard = useCallback((key: string, patch: Partial<DraftCard>) => apply({ type: 'card', key, patch }), [apply]);
  const moveCard = useCallback((from: number, to: number) => apply({ type: 'move', from, to }), [apply]);

  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const removeCard = useCallback(
    (key: string) => {
      const index = cardsRef.current.findIndex((c) => c.key === key);
      const card = cardsRef.current[index];
      if (!card) return;
      apply({ type: 'remove', key });
      if (isBlankCard(card)) return;
      toast(t('editor.cardDeleted'), {
        action: { label: t('common.undo'), onClick: () => apply({ type: 'insert', card, index }) },
      });
    },
    [apply, t],
  );

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const suggestFor = useCallback(
    async (key: string, kind: AiSuggestKind) => {
      const card = cardsRef.current.find((c) => c.key === key);
      if (!card) return;
      const term = richToPlain(card.term).trim();
      if (!term) {
        toast(t('ai.suggestNeedsTerm'));
        return;
      }
      setSuggesting(key);
      try {
        const { title, termLang, definitionLang } = draftRef.current;
        const result = await suggest({ kind, term, definition: richToPlain(card.definition).trim(), setTitle: title, termLang, definitionLang });
        recordUsage(result.usage);
        const latest = cardsRef.current.find((c) => c.key === key);
        if (!latest) return;
        const previous = { definition: latest.definition, aiGenerated: latest.aiGenerated };
        const text = plainToRich(result.text);
        const definition = kind === 'definition' || isRichEmpty(latest.definition) ? text : `${latest.definition}<br>${text}`;
        apply({ type: 'card', key, patch: { definition, aiGenerated: true } });
        toast.success(t('ai.suggestDone'), { action: { label: t('common.undo'), onClick: () => apply({ type: 'card', key, patch: previous }) } });
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setSuggesting(null);
      }
    },
    [apply, errorMessage, recordUsage, t],
  );

  const addGenerated = (generated: GeneratedCard[], suggestedTitle: string | null) => {
    apply({
      type: 'append',
      cards: generated.map((c) => blankCard({ term: plainToRich(c.term), definition: plainToRich(c.definition), aiGenerated: true })),
    });
    if (!draftRef.current.title.trim() && suggestedTitle) apply({ type: 'meta', patch: { title: suggestedTitle.slice(0, LIMITS.titleMax) } });
    toast.success(t('ai.added', { count: generated.length }));
  };

  const pasteRows = useCallback((text: string) => {
    setImportText(text);
    setImportOpen(true);
  }, []);

  const importCards = (imported: ImportedCard[]) => {
    apply({
      type: 'append',
      cards: imported.map((c) => blankCard({ term: plainToRich(c.term), definition: plainToRich(c.definition) })),
    });
    toast.success(t('editor.imported', { count: imported.length }));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const keys = useMemo(() => cards.map((c) => c.key), [cards]);
  const positionOf = (id: string | number) => keys.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('editor.dragPicked', { number: positionOf(active.id) }),
    onDragOver: ({ over }) => (over ? t('editor.dragMoved', { position: positionOf(over.id), total: keys.length }) : undefined),
    onDragEnd: ({ over }) => (over ? t('editor.dragDropped', { position: positionOf(over.id), total: keys.length }) : t('editor.dragCancelled')),
    onDragCancel: () => t('editor.dragCancelled'),
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    moveCard(keys.indexOf(String(active.id)), keys.indexOf(String(over.id)));
  };

  const submit = async (options: { overwrite?: boolean } = {}) => {
    const found: typeof errors = {};
    if (!draft.title.trim()) found.title = t('editor.errorTitle');
    if (filled === 0) found.cards = t('editor.errorNoCards');
    setErrors(found);
    if (found.title) {
      titleRef.current?.focus();
      return;
    }
    if (found.cards) return;

    try {
      const saved = await save.mutateAsync(toSetInput(draft, options.overwrite ? undefined : set?.updatedAt));
      clearStoredDraft(setId);
      leaving.current = true;
      setDirty(false);
      toast.success(set ? t('editor.savedToast') : t('editor.created'));
      navigate(`/sets/${saved.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'stale_set') {
        setStale(true);
      } else if (err instanceof ApiError && err.isNetwork) {
        storeDraft(setId, draft);
        toast.error(t('editor.offlineSave'));
      } else if (err instanceof ApiError && err.code === 'card_too_long') {
        const index = (err.details as { index?: number } | undefined)?.index ?? 0;
        setErrors({ cards: t('editor.errorTooLong', { number: index + 1, max: LIMITS.cardSideMax }) });
      } else if (err instanceof ApiError && err.code === 'email_unverified') {
        toast.error(t('editor.publicNeedsVerify'));
      } else {
        toast.error(errorMessage(err));
      }
    }
  };

  const canPublish = Boolean(user && !user.isChild);
  const backTo = set ? `/sets/${set.id}` : '/library';
  const submitLabel = set ? t('editor.save') : t('editor.create');

  return (
    <form
      className="mx-auto max-w-4xl"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="sticky top-16 z-30 -mx-4 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to={backTo} aria-label={t('common.back')}>
            <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold sm:text-2xl">{set ? t('editor.editTitle') : t('editor.newTitle')}</h1>
        <FormatToolbar className="hidden md:inline-flex" />
        <Button type="submit" loading={save.isPending}>
          {submitLabel}
        </Button>
      </div>

      <section className="mt-5 grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-6" aria-label={t('editor.detailsHeading')}>
        <Field label={t('editor.titleLabel')} error={errors.title}>
          {(p) => (
            <Input
              {...p}
              ref={titleRef}
              value={draft.title}
              onChange={(e) => apply({ type: 'meta', patch: { title: e.target.value } })}
              placeholder={t('editor.titlePlaceholder')}
              maxLength={LIMITS.titleMax}
              autoFocus={!set}
              dir="auto"
              className="h-12 text-lg font-semibold"
              required
            />
          )}
        </Field>
        <Field label={<>{t('editor.descriptionLabel')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></>}>
          {(p) => (
            <Textarea
              {...p}
              value={draft.description}
              onChange={(e) => apply({ type: 'meta', patch: { description: e.target.value } })}
              placeholder={t('editor.descriptionPlaceholder')}
              maxLength={LIMITS.descriptionMax}
              dir="auto"
              rows={2}
              className="min-h-16"
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('editor.subjectLabel')}>
            {(p) => (
              <Select {...p} value={draft.subject} onChange={(e) => apply({ type: 'meta', patch: { subject: e.target.value as Subject } })}>
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`subjects.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('editor.termLangLabel')}>
            {(p) => (
              <Select {...p} value={draft.termLang} onChange={(e) => apply({ type: 'meta', patch: { termLang: e.target.value } })}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('editor.definitionLangLabel')}>
            {(p) => (
              <Select {...p} value={draft.definitionLang} onChange={(e) => apply({ type: 'meta', patch: { definitionLang: e.target.value } })}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('sets.visibility')}>
            {(p) => (
              <Select {...p} value={draft.visibility} onChange={(e) => apply({ type: 'meta', patch: { visibility: e.target.value as Visibility } })}>
                <option value="private">{t('sets.visibilityPrivate')}</option>
                <option value="unlisted">{t('sets.visibilityUnlisted')}</option>
                {canPublish || draft.visibility === 'public' ? <option value="public">{t('sets.visibilityPublic')}</option> : null}
              </Select>
            )}
          </Field>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <h2 className="me-auto text-xl font-bold">
          {t('editor.cardsHeading')} <span className="font-sans text-base font-normal text-muted-foreground">· {t('editor.cardsCount', { count: filled })}</span>
        </h2>
        <FormatToolbar className="md:hidden" />
        <Button
          variant="secondary"
          onClick={() => {
            setImportText('');
            setImportOpen(true);
          }}
        >
          <FileUp aria-hidden="true" />
          {t('editor.import')}
        </Button>
        {aiAvailable ? (
          <Button variant="secondary" onClick={() => setAiOpen(true)}>
            <Sparkles aria-hidden="true" />
            {t('ai.generateButton')}
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" aria-label={t('editor.swap')} title={t('editor.swap')} onClick={() => apply({ type: 'swap' })}>
          <ArrowLeftRight aria-hidden="true" />
        </Button>
      </div>
      <p className="mt-1 hidden text-sm text-muted-foreground md:block">{t('editor.tips')}</p>

      {errors.cards ? (
        <Alert variant="error" className="mt-3">
          {errors.cards}
        </Alert>
      ) : null}
      {incomplete > 0 ? (
        <Alert variant="warning" className="mt-3">
          {t('editor.incompleteNote', { count: incomplete })}
        </Alert>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{ announcements, screenReaderInstructions: { draggable: t('editor.dragInstructions') } }}
      >
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ol className="mt-4 flex flex-col gap-3">
            {cards.map((card, index) => (
                <CardRow
                  key={card.key}
                  card={card}
                  index={index}
                  total={cards.length}
                  termLang={draft.termLang}
                  definitionLang={draft.definitionLang}
                  onChange={changeCard}
                  onRemove={removeCard}
                  onMove={moveCard}
                  onPasteRows={pasteRows}
                  onTabOut={addCard}
                  onSuggest={aiAvailable ? suggestFor : undefined}
                  suggesting={suggesting === card.key}
                />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={addCard}
        disabled={atLimit}
        className="mt-3 flex h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
      >
        <Plus className="size-5" aria-hidden="true" />
        {t('editor.addCard')}
      </button>

      <div className="mt-6 flex justify-end">
        <Button type="submit" size="lg" loading={save.isPending}>
          {submitLabel}
        </Button>
      </div>

      {aiAvailable ? (
        <GenerateDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          termLang={draft.termLang}
          definitionLang={draft.definitionLang}
          room={LIMITS.cardsPerSet - filled}
          onAdd={addGenerated}
        />
      ) : null}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} initialText={importText} room={LIMITS.cardsPerSet - filled} onImport={importCards} />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title={t('editor.unsavedTitle')}
        description={t('editor.unsavedBody')}
        confirmLabel={t('editor.unsavedLeave')}
        cancelLabel={t('editor.unsavedStay')}
        onConfirm={() => blocker.proceed?.()}
      />
      <ConfirmDialog
        open={stale}
        onOpenChange={setStale}
        title={t('editor.staleTitle')}
        description={t('editor.staleBody')}
        confirmLabel={t('editor.staleOverwrite')}
        loading={save.isPending}
        onConfirm={() => {
          setStale(false);
          void submit({ overwrite: true });
        }}
      />
    </form>
  );
}
