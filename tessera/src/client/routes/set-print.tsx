import { ArrowLeft, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { CardDto, SetDetail } from '@shared/api';
import { RichText } from '@/components/rich-text';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { PageLoading } from '@/components/ui/feedback';
import { useI18n } from '@/lib/i18n';
import { usePageTitle } from '@/lib/page';
import { useSet } from '@/lib/sets';
import NotFound from './not-found';

type Layout = 'table' | 'cards' | 'glossary';

function Media({ card, side }: { card: CardDto; side: 'term' | 'definition' }) {
  const image = side === 'term' ? card.termImage : card.definitionImage;
  return image ? <img src={image.url} alt="" className="mt-1.5 max-h-24 rounded" /> : null;
}

function Sheet({ set, layout }: { set: SetDetail; layout: Layout }) {
  if (layout === 'table') {
    return (
      <table className="w-full border-collapse text-[0.95rem]">
        <tbody>
          {set.cards.map((card) => (
            <tr key={card.id} className="break-inside-avoid border-b border-neutral-300 align-top">
              <td className="w-[38%] py-2.5 pe-4 font-semibold">
                <RichText value={card.term} lang={set.termLang} />
                <Media card={card} side="term" />
              </td>
              <td className="py-2.5">
                <RichText value={card.definition} lang={set.definitionLang} />
                <Media card={card} side="definition" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (layout === 'glossary') {
    return (
      <dl className="columns-1 gap-10 text-[0.95rem] sm:columns-2 print:columns-2">
        {set.cards.map((card) => (
          <div key={card.id} className="mb-3 break-inside-avoid">
            <dt className="font-bold">
              <RichText value={card.term} lang={set.termLang} />
            </dt>
            <dd>
              <RichText value={card.definition} lang={set.definitionLang} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
      {set.cards.map((card) => (
        <li key={card.id} className="flex min-h-36 break-inside-avoid flex-col rounded-xl border border-neutral-400 p-4">
          <div className="border-b border-dashed border-neutral-400 pb-2 text-lg font-bold">
            <RichText value={card.term} lang={set.termLang} />
            <Media card={card} side="term" />
          </div>
          <div className="pt-2">
            <RichText value={card.definition} lang={set.definitionLang} />
            <Media card={card} side="definition" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * A print-optimised view of a set. The browser's own print dialog produces the
 * paper copy or the PDF, so every script and writing direction renders exactly
 * as it does on screen.
 */
export default function SetPrint() {
  const { id } = useParams();
  const { t } = useI18n();
  const query = useSet(id);
  const [layout, setLayout] = useState<Layout>('table');
  usePageTitle(query.data?.title);

  if (query.isPending) return <PageLoading />;
  if (query.isError) return <NotFound />;
  const set = query.data;

  return (
    <div className="min-h-dvh bg-background print:bg-white">
      <div className="no-print sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
          <Button variant="ghost" asChild>
            <Link to={`/sets/${set.id}`}>
              <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
              {t('print.backToSet')}
            </Link>
          </Button>
          <Segmented
            aria-label={t('print.layout')}
            className="ms-auto"
            value={layout}
            onValueChange={setLayout}
            options={[
              { value: 'table', label: t('print.layoutTable') },
              { value: 'cards', label: t('print.layoutCards') },
              { value: 'glossary', label: t('print.layoutGlossary') },
            ]}
          />
          <Button onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            {t('print.button')}
          </Button>
        </div>
        <p className="mx-auto max-w-4xl px-4 pb-3 text-sm text-muted-foreground">{t('print.hint')}</p>
      </div>
      <main id="main" className="mx-auto max-w-4xl bg-white px-4 py-8 text-black sm:px-8 print:max-w-none print:p-0">
        <header className="mb-6 border-b-2 border-black pb-3">
          <h1 dir="auto" className="font-display text-3xl font-extrabold">
            {set.title}
          </h1>
          {set.description ? (
            <p dir="auto" className="mt-1 text-neutral-700">
              {set.description}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-neutral-600">
            <span dir="auto">{set.owner.name}</span> · {t('print.footer', { count: set.cards.length, url: `${window.location.host}/sets/${set.id}` })}
          </p>
        </header>
        <Sheet set={set} layout={layout} />
      </main>
    </div>
  );
}
