import { createElement, memo, useMemo, type ReactNode } from 'react';
import { parseRich, type RichNode } from '@shared/richtext';
import { cn } from '@/lib/utils';

const tagClass: Partial<Record<string, string>> = {
  mark: 'rounded bg-warning/40 px-0.5 text-inherit',
  code: 'rounded bg-muted px-1 py-0.5 font-mono text-[0.92em]',
};

function render(nodes: RichNode[], prefix = ''): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${prefix}${i}`;
    if (node.type === 'text') return node.text;
    if (node.type === 'br') return <br key={key} />;
    return createElement(node.tag, { key, className: tagClass[node.tag] }, render(node.children, `${key}.`));
  });
}

interface RichTextProps {
  /** Stored card markup. It is parsed and rendered as elements, never injected as HTML. */
  value: string;
  className?: string;
  lang?: string;
  /** Render a <span> instead of a block, for use inside a line of text. */
  inline?: boolean;
}

/**
 * Displays a card's term or definition. `dir="auto"` lets right-to-left text
 * (Arabic, Hebrew…) lay out correctly whatever the interface language is.
 */
export const RichText = memo(function RichText({ value, className, lang, inline }: RichTextProps) {
  const children = useMemo(() => render(parseRich(value)), [value]);
  const Tag = inline ? 'span' : 'div';
  return (
    <Tag dir="auto" lang={lang} className={cn('break-words whitespace-pre-wrap', className)}>
      {children}
    </Tag>
  );
});
