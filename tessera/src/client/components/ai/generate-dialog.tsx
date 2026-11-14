import { FileText, Lightbulb, NotebookPen, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AI_CARD_COUNT, type AiSource, type GeneratedCard } from '@shared/ai';
import { LIMITS } from '@shared/constants';
import { Button } from '@/components/ui/button';
import { Checkbox, Segmented } from '@/components/ui/controls';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { generateFromFile, generateFromText, isQuotaError, useAiUsage, useRecordUsage } from '@/lib/ai';
import { useI18n } from '@/lib/i18n';
import { useEntitlements, useErrorMessage, useFeatures, useUser } from '@/lib/me';
import { entitlementsFor } from '@shared/entitlements';

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  termLang: string;
  definitionLang: string;
  /** How many more cards the set can take. */
  room: number;
  onAdd: (cards: GeneratedCard[], title: string | null) => void;
}

const COUNTS = [5, 10, 15, 20, 30, 40, 50];
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/gif';

interface PreviewCard extends GeneratedCard {
  include: boolean;
}

export function GenerateDialog(props: GenerateDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <GenerateFlow {...props} /> : null}
    </Dialog>
  );
}

function GenerateFlow({ onOpenChange, termLang, definitionLang, room, onAdd }: GenerateDialogProps) {
  const { t, formatDate, formatNumber } = useI18n();
  const errorMessage = useErrorMessage();
  const features = useFeatures();
  const entitlements = useEntitlements();
  const usage = useAiUsage();
  const recordUsage = useRecordUsage();
  const verified = useUser()?.emailVerified ?? false;

  const [source, setSource] = useState<AiSource>('notes');
  const [notes, setNotes] = useState('');
  const [topic, setTopic] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState<number>(Math.min(AI_CARD_COUNT.default, Math.max(room, AI_CARD_COUNT.min)));
  const [stage, setStage] = useState<'form' | 'working' | 'preview'>('form');
  const [error, setError] = useState<{ message: string; quota?: boolean } | null>(null);
  const [preview, setPreview] = useState<PreviewCard[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (stage === 'preview') previewHeading.current?.focus();
  }, [stage]);

  const counts = COUNTS.filter((n) => n <= Math.max(room, AI_CARD_COUNT.min));
  const left = usage.data ? Math.max(0, usage.data.limit - usage.data.used) : null;
  const ready = source === 'notes' ? notes.trim().length > 0 : source === 'topic' ? topic.trim().length > 0 : file !== null;

  const run = async () => {
    setError(null);
    if (source === 'file' && file && file.size > LIMITS.aiUploadBytes) {
      setError({ message: t('ai.fileHint') });
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setStage('working');
    try {
      const result =
        source === 'file' && file
          ? await generateFromFile(file, { count, termLang, definitionLang }, abort.signal)
          : await generateFromText(
              { source: source === 'topic' ? 'topic' : 'notes', text: source === 'topic' ? topic : notes, count, termLang, definitionLang },
              abort.signal,
            );
      recordUsage(result.usage);
      setPreview(result.cards.map((c) => ({ ...c, include: true })));
      setTitle(result.title);
      setStage('preview');
    } catch (err) {
      if (abort.signal.aborted) return;
      setError({ message: errorMessage(err), quota: isQuotaError(err) });
      setStage('form');
      void usage.refetch();
    }
  };

  const cancel = () => {
    controller.current?.abort();
    setStage('form');
  };

  const chosen = preview.filter((c) => c.include && c.term.trim() && c.definition.trim());
  const update = (index: number, patch: Partial<PreviewCard>) =>
    setPreview((cards) => cards.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  if (stage === 'working') {
    return (
      <DialogContent title={t('ai.dialogTitle')} footer={<Button variant="secondary" onClick={cancel}>{t('ai.cancel')}</Button>}>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Spinner className="size-8 text-primary" label={t('ai.generating')} />
          <p className="font-semibold" aria-hidden="true">
            {t('ai.generating')}
          </p>
          <p className="text-sm text-muted-foreground">{t('ai.generatingHint')}</p>
        </div>
      </DialogContent>
    );
  }

  if (stage === 'preview') {
    return (
      <DialogContent
        size="lg"
        title={t('ai.previewTitle')}
        description={t('ai.previewHint')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStage('form')}>
              {t('ai.back')}
            </Button>
            <Button
              disabled={chosen.length === 0}
              onClick={() => {
                onAdd(chosen.slice(0, room).map(({ term, definition }) => ({ term: term.trim(), definition: definition.trim() })), title);
                onOpenChange(false);
              }}
            >
              <Sparkles aria-hidden="true" />
              {t('ai.addCards', { count: Math.min(chosen.length, room) })}
            </Button>
          </>
        }
      >
        <h3 ref={previewHeading} tabIndex={-1} className="sr-only">
          {t('ai.previewTitle')}
        </h3>
        {features?.aiMock ? <Alert className="mb-3">{t('ai.mockNote')}</Alert> : null}
        {preview.length === 0 ? (
          <Alert variant="warning">{t('ai.previewEmpty')}</Alert>
        ) : (
          <ol className="flex flex-col gap-3">
            {preview.map((card, index) => {
              const number = index + 1;
              return (
                <li key={index} className="flex gap-3 rounded-xl border border-border bg-card p-3" data-included={card.include}>
                  <Checkbox
                    className="mt-2.5"
                    checked={card.include}
                    onCheckedChange={(checked) => update(index, { include: checked === true })}
                    aria-label={t('ai.includeCard', { number })}
                  />
                  <div className={card.include ? 'grid flex-1 gap-2 sm:grid-cols-2' : 'grid flex-1 gap-2 opacity-60 sm:grid-cols-2'}>
                    <Input
                      aria-label={t('ai.termField', { number })}
                      value={card.term}
                      dir="auto"
                      lang={termLang}
                      maxLength={LIMITS.cardSideMax}
                      onChange={(e) => update(index, { term: e.target.value })}
                    />
                    <Textarea
                      aria-label={t('ai.definitionField', { number })}
                      value={card.definition}
                      dir="auto"
                      lang={definitionLang}
                      rows={2}
                      maxLength={LIMITS.cardSideMax}
                      onChange={(e) => update(index, { definition: e.target.value })}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    );
  }

  const premiumLimit = entitlementsFor('premium').aiMonthlyLimit;
  return (
    <DialogContent
      size="lg"
      title={t('ai.dialogTitle')}
      description={t('ai.dialogDescription')}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('ai.cancel')}
          </Button>
          <Button disabled={!ready || left === 0 || !verified} onClick={() => void run()}>
            <Sparkles aria-hidden="true" />
            {t('ai.generate')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && verified) void run();
        }}
      >
        {!verified ? <Alert variant="warning">{t('ai.needsVerify')}</Alert> : null}
        <Segmented<AiSource>
          aria-label={t('ai.dialogTitle')}
          value={source}
          onValueChange={setSource}
          options={[
            { value: 'notes', label: t('ai.sourceNotes'), icon: <NotebookPen aria-hidden="true" /> },
            { value: 'topic', label: t('ai.sourceTopic'), icon: <Lightbulb aria-hidden="true" /> },
            { value: 'file', label: t('ai.sourceFile'), icon: <FileText aria-hidden="true" /> },
          ]}
        />

        {source === 'notes' ? (
          <Field label={t('ai.notesLabel')} hint={t('ai.notesCount', { count: notes.length, max: LIMITS.aiSourceChars })}>
            {(p) => (
              <Textarea
                {...p}
                value={notes}
                rows={8}
                dir="auto"
                maxLength={LIMITS.aiSourceChars}
                placeholder={t('ai.notesPlaceholder')}
                onChange={(e) => setNotes(e.target.value)}
              />
            )}
          </Field>
        ) : source === 'topic' ? (
          <Field label={t('ai.topicLabel')} hint={t('ai.topicHint')}>
            {(p) => <Input {...p} value={topic} dir="auto" maxLength={300} placeholder={t('ai.topicPlaceholder')} onChange={(e) => setTopic(e.target.value)} />}
          </Field>
        ) : (
          <Field label={t('ai.fileLabel')} hint={file ? t('ai.fileChosen', { name: file.name, size: `${formatNumber(Math.round(file.size / 1024))} KB` }) : t('ai.fileHint')}>
            {(p) => (
              <input
                {...p}
                type="file"
                accept={ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-xl border border-input bg-background p-2 text-sm file:me-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:font-semibold file:text-secondary-foreground"
              />
            )}
          </Field>
        )}

        <Field label={t('ai.countLabel')} className="max-w-48">
          {(p) => (
            <Select {...p} value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
              {counts.map((n) => (
                <option key={n} value={n}>
                  {formatNumber(n)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {error ? (
          <Alert variant="error" title={error.quota ? t('ai.quotaTitle') : undefined}>
            {error.message}
            {error.quota && usage.data ? ` ${t('ai.quotaBody', { date: formatDate(usage.data.resetsAt, { dateStyle: 'long' }) })}` : null}
            {error.quota && entitlements.plan === 'free' ? (
              <>
                {' '}
                <Link to="/upgrade" className="font-semibold underline">
                  {t('ai.quotaUpgrade', { count: premiumLimit })}
                </Link>
              </>
            ) : null}
          </Alert>
        ) : null}

        {usage.data ? (
          <p className="text-sm text-muted-foreground">
            {t('ai.usageLeft', { left: left ?? 0 })} {t('ai.usageResets', { date: formatDate(usage.data.resetsAt, { month: 'long', day: 'numeric' }) })}
          </p>
        ) : null}
        {features?.aiMock ? <p className="text-sm text-muted-foreground">{t('ai.mockNote')}</p> : null}
      </form>
    </DialogContent>
  );
}
