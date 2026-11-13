import type { CardDto } from '@shared/api';
import { RichText } from '@/components/rich-text';
import { useI18n } from '@/lib/i18n';

export type Side = 'term' | 'definition';

/** One side of a card: its image, if any, and its text. */
export function SideContent({
  card,
  side,
  langs,
  className,
  imageClassName = 'mb-3 max-h-44 rounded-xl',
}: {
  card: CardDto;
  side: Side;
  langs: { termLang: string; definitionLang: string };
  className?: string;
  imageClassName?: string;
}) {
  const { t } = useI18n();
  const image = side === 'term' ? card.termImage : card.definitionImage;
  return (
    <>
      {image ? <img src={image.url} alt={t('study.imageAlt')} className={imageClassName} draggable={false} /> : null}
      <RichText value={side === 'term' ? card.term : card.definition} lang={side === 'term' ? langs.termLang : langs.definitionLang} className={className} />
    </>
  );
}

export const plainOf = (card: CardDto, side: Side) => (side === 'term' ? card.termPlain : card.definitionPlain);
