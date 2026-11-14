import { FileUp } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { LIMITS } from '@shared/constants';
import { detectSeparators, parseBulk, unescapeSeparator, type ImportedCard } from '@shared/import';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

type TermChoice = 'tab' | 'comma' | 'custom';
type CardChoice = 'newline' | 'semicolon' | 'custom';

const TERM_VALUE: Record<Exclude<TermChoice, 'custom'>, string> = { tab: '\t', comma: ',' };
const CARD_VALUE: Record<Exclude<CardChoice, 'custom'>, string> = { newline: '\n', semicolon: ';' };

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Text to start with, for example rows pasted straight into a card field. */
  initialText?: string;
  /** How many more cards the set can take. */
  room: number;
  onImport: (cards: ImportedCard[]) => void;
}

function choicesFor(text: string): { term: TermChoice; card: CardChoice; termCustom: string; cardCustom: string } {
  const detected = detectSeparators(text);
  const term: TermChoice = detected.termSeparator === '\t' ? 'tab' : detected.termSeparator === ',' ? 'comma' : 'custom';
  const card: CardChoice = detected.cardSeparator === '\n' ? 'newline' : detected.cardSeparator === ';' ? 'semicolon' : 'custom';
  return { term, card, termCustom: term === 'custom' ? detected.termSeparator : ' - ', cardCustom: card === 'custom' ? detected.cardSeparator : '\\n\\n' };
}

/** Bulk entry: paste or upload, choose the separators, check the preview, import. */
export function ImportDialog({ open, onOpenChange, initialText = '', room, onImport }: ImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <ImportForm key={initialText} initialText={initialText} room={room} onImport={onImport} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function ImportForm({ initialText, room, onImport, onClose }: { initialText: string; room: number; onImport: (cards: ImportedCard[]) => void; onClose: () => void }) {
  const { t } = useI18n();
  const initial = useMemo(() => choicesFor(initialText), [initialText]);
  const [text, setText] = useState(initialText);
  const [term, setTerm] = useState<TermChoice>(initial.term);
  const [card, setCard] = useState<CardChoice>(initial.card);
  const [termCustom, setTermCustom] = useState(initial.termCustom);
  const [cardCustom, setCardCustom] = useState(initial.cardCustom);
  const [fileError, setFileError] = useState('');
  // Separators follow the text until the user chooses one themselves.
  const [manual, setManual] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const result = useMemo(
    () =>
      parseBulk(
        text,
        {
          termSeparator: term === 'custom' ? unescapeSeparator(termCustom) : TERM_VALUE[term],
          cardSeparator: card === 'custom' ? unescapeSeparator(cardCustom) : CARD_VALUE[card],
        },
        Math.max(0, room),
      ),
    [text, term, card, termCustom, cardCustom, room],
  );

  const changeText = (next: string, redetect = !manual) => {
    setText(next);
    if (!redetect || !next.trim()) return;
    const detected = choicesFor(next);
    setTerm(detected.term);
    setCard(detected.card);
    if (detected.term === 'custom') setTermCustom(detected.termCustom);
    if (detected.card === 'custom') setCardCustom(detected.cardCustom);
  };

  const readFile = async (file: File | undefined) => {
    setFileError('');
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('too large');
      // A new file is a fresh start, so detect its layout whatever was chosen before.
      setManual(false);
      changeText(await file.text(), true);
    } catch {
      setFileError(t('editor.importFileError'));
    }
  };

  const preview = result.cards.slice(0, 5);
  const count = result.cards.length;

  return (
    <DialogContent
      title={t('editor.importTitle')}
      description={t('editor.importBody')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={count === 0}
            onClick={() => {
              onImport(result.cards);
              onClose();
            }}
          >
            {t('editor.importSubmit', { count })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-text">{t('editor.importPasteLabel')}</Label>
          <Textarea
            id="import-text"
            value={text}
            dir="auto"
            autoFocus
            spellCheck={false}
            onChange={(e) => changeText(e.target.value)}
            placeholder={t('editor.importPlaceholder')}
            className="min-h-40 font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileInput} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values" hidden onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ''; }} />
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
              <FileUp aria-hidden="true" />
              {t('editor.importFile')}
            </Button>
            {fileError ? (
              <span className="text-sm font-medium text-destructive" role="alert">
                {fileError}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold" id="import-term-sep">
              {t('editor.importBetweenTerm')}
            </span>
            <Segmented
              aria-label={t('editor.importBetweenTerm')}
              size="sm"
              value={term}
              onValueChange={(v) => {
                setManual(true);
                setTerm(v);
              }}
              options={[
                { value: 'tab', label: t('editor.sepTab') },
                { value: 'comma', label: t('editor.sepComma') },
                { value: 'custom', label: t('editor.sepCustom') },
              ]}
            />
            {term === 'custom' ? (
              <Input aria-label={`${t('editor.importBetweenTerm')}: ${t('editor.sepCustomLabel')}`} value={termCustom} onChange={(e) => setTermCustom(e.target.value)} className="font-mono" />
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t('editor.importBetweenCards')}</span>
            <Segmented
              aria-label={t('editor.importBetweenCards')}
              size="sm"
              value={card}
              onValueChange={(v) => {
                setManual(true);
                setCard(v);
              }}
              options={[
                { value: 'newline', label: t('editor.sepNewline') },
                { value: 'semicolon', label: t('editor.sepSemicolon') },
                { value: 'custom', label: t('editor.sepCustom') },
              ]}
            />
            {card === 'custom' ? (
              <Input aria-label={`${t('editor.importBetweenCards')}: ${t('editor.sepCustomLabel')}`} value={cardCustom} onChange={(e) => setCardCustom(e.target.value)} className="font-mono" />
            ) : null}
          </div>
        </div>

        <section aria-labelledby="import-preview-title" aria-live="polite">
          <h3 id="import-preview-title" className="font-sans text-sm font-semibold">
            {t('editor.importPreview')}
            {count > 0 ? <span className="ms-2 font-normal text-muted-foreground">{t('editor.cardsCount', { count })}</span> : null}
          </h3>
          {count === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t('editor.importPreviewEmpty')}</p>
          ) : (
            <ol className="mt-2 flex flex-col gap-1.5">
              {preview.map((item, i) => (
                <li key={i} className="grid grid-cols-2 gap-3 rounded-xl bg-muted px-3 py-2 text-sm">
                  <span dir="auto" className="line-clamp-2 font-semibold break-words whitespace-pre-wrap">
                    {item.term || '—'}
                  </span>
                  <span dir="auto" className="line-clamp-2 break-words whitespace-pre-wrap text-muted-foreground">
                    {item.definition || '—'}
                  </span>
                </li>
              ))}
              {count > preview.length ? <li className="px-1 text-sm text-muted-foreground">{t('editor.importMore', { count: count - preview.length })}</li> : null}
            </ol>
          )}
        </section>

        {result.incomplete > 0 ? <Alert variant="warning">{t('editor.importIncomplete', { count: result.incomplete })}</Alert> : null}
        {result.truncated ? <Alert variant="warning">{t('editor.importTruncated', { max: LIMITS.cardsPerSet })}</Alert> : null}
      </div>
    </DialogContent>
  );
}
