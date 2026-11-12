import { Bold, Italic, Subscript, Superscript, Underline } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { sanitizeRich } from '@shared/richtext';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Command = 'bold' | 'italic' | 'underline' | 'subscript' | 'superscript';

/** Applies a format to the current selection. Used by the toolbar and shortcuts. */
function format(command: Command): void {
  // Ask the browser for <b>/<i>/… rather than styled spans; either is accepted.
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand(command);
}

interface RichEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  lang?: string;
  className?: string;
  /** Called instead of pasting when the clipboard holds several rows of cells. */
  onPasteRows?: (text: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * A small rich-text field for one side of a card.
 *
 * It is an uncontrolled contentEditable: the browser owns the DOM while the
 * user types (so the caret, undo history and IME composition all behave
 * natively), and every change is read back out through `sanitizeRich`.
 */
export const RichEditor = memo(function RichEditor({
  value,
  onChange,
  placeholder,
  label,
  lang,
  className,
  onPasteRows,
  onKeyDown,
}: RichEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);

  // Write into the DOM only when the value changed from outside (import, reorder, reset).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value === lastEmitted.current) return;
    el.innerHTML = sanitizeRich(value);
    el.dataset.empty = String(value === '');
    lastEmitted.current = value;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const next = sanitizeRich(el.innerHTML);
    el.dataset.empty = String(next === '');
    if (next === lastEmitted.current) return;
    lastEmitted.current = next;
    onChange(next);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    if (onPasteRows && /\t/.test(text) && /\n/.test(text.trim())) {
      onPasteRows(text);
      return;
    }
    // Plain text only: formatting from other pages never comes along.
    document.execCommand('insertText', false, text);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (event.key === ',') {
        event.preventDefault();
        format('subscript');
      } else if (event.key === '.') {
        event.preventDefault();
        format('superscript');
      }
    }
  };

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      lang={lang}
      dir="auto"
      data-rich-editor=""
      data-placeholder={placeholder}
      onInput={emit}
      onBlur={emit}
      onPaste={handlePaste}
      onDrop={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
      className={cn(
        'min-h-11 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-base break-words whitespace-pre-wrap transition-colors hover:border-foreground/50',
        'data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-muted-foreground data-[empty=true]:before:content-[attr(data-placeholder)]',
        className,
      )}
    />
  );
});

const COMMANDS: Array<{ command: Command; icon: typeof Bold; label: 'bold' | 'italic' | 'underline' | 'subscript' | 'superscript'; keys: string }> = [
  { command: 'bold', icon: Bold, label: 'bold', keys: 'B' },
  { command: 'italic', icon: Italic, label: 'italic', keys: 'I' },
  { command: 'underline', icon: Underline, label: 'underline', keys: 'U' },
  { command: 'subscript', icon: Subscript, label: 'subscript', keys: ',' },
  { command: 'superscript', icon: Superscript, label: 'superscript', keys: '.' },
];

/**
 * One formatting toolbar for the whole editor page. It acts on whichever card
 * field holds the selection, so hundreds of fields share five buttons.
 */
export function FormatToolbar({ className }: { className?: string }) {
  const { t } = useI18n();
  const [active, setActive] = useState<Partial<Record<Command, boolean>>>({});
  const [enabled, setEnabled] = useState(false);
  const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

  useEffect(() => {
    const update = () => {
      const node = document.getSelection()?.anchorNode;
      const element = node instanceof Element ? node : node?.parentElement;
      const inEditor = Boolean(element?.closest('[data-rich-editor]'));
      setEnabled(inEditor);
      if (!inEditor) return;
      const next: Partial<Record<Command, boolean>> = {};
      for (const { command } of COMMANDS) next[command] = document.queryCommandState(command);
      setActive(next);
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  return (
    <div role="toolbar" aria-label={t('editor.formatting')} className={cn('inline-flex items-center gap-0.5 rounded-xl bg-secondary p-1', className)}>
      {COMMANDS.map(({ command, icon: Icon, label, keys }) => (
        <button
          key={command}
          type="button"
          title={`${t(`editor.${label}`)} (${mod}${keys})`}
          aria-label={t(`editor.${label}`)}
          aria-pressed={enabled && Boolean(active[command])}
          disabled={!enabled}
          // Keep the text selection where it is while the button is pressed.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => format(command)}
          className="flex size-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-card disabled:text-muted-foreground disabled:opacity-60 aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-card"
        >
          <Icon className="size-4.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
