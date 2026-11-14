import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, LoaderCircle, Mic, Sparkles, Trash2, X } from 'lucide-react';
import { memo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import type { AiSuggestKind } from '@shared/ai';
import { SuggestMenu } from '@/components/ai/suggest-menu';
import { RichEditor } from '@/components/rich-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/controls';
import { useI18n } from '@/lib/i18n';
import { useEntitlements, useErrorMessage } from '@/lib/me';
import { MEDIA_ACCEPT, uploadMedia } from '@/lib/media';
import { cn } from '@/lib/utils';
import type { DraftCard, MediaSlot } from './draft';

interface MediaControlsProps {
  card: DraftCard;
  side: 'term' | 'definition';
  onChange: (patch: Partial<DraftCard>) => void;
}

/** Image and audio attachment for one side of a card. */
function MediaControls({ card, side, onChange }: MediaControlsProps) {
  const { t } = useI18n();
  const entitlements = useEntitlements();
  const errorMessage = useErrorMessage();
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'image' | 'audio' | null>(null);
  const imageSlot = `${side}Image` as MediaSlot;
  const audioSlot = `${side}Audio` as MediaSlot;
  const image = card[imageSlot];
  const audio = card[audioSlot];

  const pick = (kind: 'image' | 'audio') => {
    const entitled = kind === 'image' ? entitlements.imageUploads : entitlements.audioUploads;
    if (!entitled) {
      toast(t('editor.mediaPremium'), { action: { label: t('nav.upgrade'), onClick: () => window.location.assign('/upgrade') } });
      return;
    }
    (kind === 'image' ? imageInput : audioInput).current?.click();
  };

  const upload = async (kind: 'image' | 'audio', file: File | undefined) => {
    if (!file) return;
    setBusy(kind);
    try {
      const ref = await uploadMedia(file, kind);
      onChange({ [kind === 'image' ? imageSlot : audioSlot]: ref });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <input ref={imageInput} type="file" accept={MEDIA_ACCEPT.image} hidden onChange={(e) => { void upload('image', e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={audioInput} type="file" accept={MEDIA_ACCEPT.audio} hidden onChange={(e) => { void upload('audio', e.target.files?.[0]); e.target.value = ''; }} />
      {image ? (
        <span className="relative inline-flex">
          <img src={image.url} alt={t('editor.imageAttached')} className="h-14 w-20 rounded-lg border border-border object-cover" />
          <button
            type="button"
            aria-label={t('editor.removeImage')}
            onClick={() => onChange({ [imageSlot]: null })}
            className="absolute -end-2 -top-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ) : (
        <Tooltip label={t('editor.addImage')}>
          <Button variant="ghost" size="icon-sm" aria-label={t('editor.addImage')} onClick={() => pick('image')} disabled={busy !== null}>
            {busy === 'image' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
          </Button>
        </Tooltip>
      )}
      {audio ? (
        <span className="inline-flex items-center gap-1 rounded-lg bg-secondary ps-1 pe-0.5">
          <audio src={audio.url} controls preload="none" className="h-8 max-w-44" aria-label={t('editor.audioAttached')} />
          <Button variant="ghost" size="icon-sm" aria-label={t('editor.removeAudio')} onClick={() => onChange({ [audioSlot]: null })}>
            <X aria-hidden="true" />
          </Button>
        </span>
      ) : (
        <Tooltip label={t('editor.addAudio')}>
          <Button variant="ghost" size="icon-sm" aria-label={t('editor.addAudio')} onClick={() => pick('audio')} disabled={busy !== null}>
            {busy === 'audio' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Mic aria-hidden="true" />}
          </Button>
        </Tooltip>
      )}
      {busy ? (
        <span className="text-sm text-muted-foreground" role="status">
          {t('editor.uploading')}
        </span>
      ) : null}
    </div>
  );
}

export interface CardRowProps {
  card: DraftCard;
  index: number;
  total: number;
  termLang: string;
  definitionLang: string;
  onChange: (key: string, patch: Partial<DraftCard>) => void;
  onRemove: (key: string) => void;
  onMove: (from: number, to: number) => void;
  onPasteRows: (text: string) => void;
  /** Tab out of the last definition: add a card and continue typing there. */
  onTabOut: () => void;
  /** AI help for this card; omitted when AI is unavailable. */
  onSuggest?: (key: string, kind: AiSuggestKind) => void;
  suggesting?: boolean;
}

export const CardRow = memo(function CardRow({
  card,
  index,
  total,
  termLang,
  definitionLang,
  onChange,
  onRemove,
  onMove,
  onPasteRows,
  onTabOut,
  onSuggest,
  suggesting = false,
}: CardRowProps) {
  const { t } = useI18n();
  const number = index + 1;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: card.key });
  const isLast = index === total - 1;

  const change = (patch: Partial<DraftCard>) => onChange(card.key, patch);
  const definitionKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isLast && event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      onTabOut();
    }
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-card-key={card.key}
      className={cn(
        'rounded-2xl border border-border bg-card shadow-card [contain-intrinsic-size:auto_11rem] [content-visibility:auto]',
        isDragging && 'relative z-10 opacity-90 shadow-pop',
      )}
    >
      <div className="flex items-center gap-1 border-b border-border px-2 py-1 sm:px-3">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t('editor.dragHandle', { number })}
          className="flex size-9 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4.5" aria-hidden="true" />
        </button>
        <span className="min-w-6 font-display font-bold text-muted-foreground" aria-hidden="true">
          {number}
        </span>
        {card.aiGenerated ? (
          <Badge variant="primary">
            <Sparkles aria-hidden="true" />
            {t('common.aiGenerated')}
          </Badge>
        ) : null}
        <div className="ms-auto flex items-center">
          {onSuggest ? <SuggestMenu number={number} busy={suggesting} onSuggest={(kind) => onSuggest(card.key, kind)} /> : null}
          <Button variant="ghost" size="icon-sm" aria-label={t('editor.moveUp', { number })} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t('editor.moveDown', { number })} disabled={isLast} onClick={() => onMove(index, index + 1)}>
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t('editor.deleteCard', { number })} onClick={() => onRemove(card.key)}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2 md:gap-5">
        <div>
          <RichEditor
            value={card.term}
            onChange={(term) => change({ term })}
            placeholder={t('editor.termPlaceholder')}
            label={t('editor.termLabel', { number })}
            lang={termLang}
            onPasteRows={onPasteRows}
          />
          <MediaControls card={card} side="term" onChange={change} />
        </div>
        <div>
          <RichEditor
            value={card.definition}
            onChange={(definition) => change({ definition })}
            placeholder={t('editor.definitionPlaceholder')}
            label={t('editor.definitionLabel', { number })}
            lang={definitionLang}
            onKeyDown={definitionKeyDown}
          />
          <MediaControls card={card} side="definition" onChange={change} />
        </div>
      </div>
    </li>
  );
});
