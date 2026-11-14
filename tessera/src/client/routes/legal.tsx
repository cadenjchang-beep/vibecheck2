import { Alert } from '@/components/ui/feedback';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { usePageTitle } from '@/lib/page';

type Block = { heading?: MessageKey; items: MessageKey[]; list?: boolean };

function LegalPage({ title, intro, blocks }: { title: MessageKey; intro: MessageKey; blocks: Block[] }) {
  const { t } = useI18n();
  usePageTitle(t(title));
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-extrabold sm:text-4xl">{t(title)}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{t(intro)}</p>
      {blocks.map((block, i) => (
        <section key={i} className="mt-7">
          {block.heading ? <h2 className="text-xl font-bold">{t(block.heading)}</h2> : null}
          {block.list ? (
            <ul className="mt-2 list-disc space-y-1.5 ps-5">
              {block.items.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          ) : (
            block.items.map((key) => (
              <p key={key} className="mt-2">
                {t(key)}
              </p>
            ))
          )}
        </section>
      ))}
      <Alert variant="info" className="mt-8">
        {t('legal.operatorNote')}
      </Alert>
    </article>
  );
}

export function Privacy() {
  return (
    <LegalPage
      title="legal.privacyTitle"
      intro="legal.privacyIntro"
      blocks={[
        { heading: 'legal.privacyCollectTitle', items: ['legal.privacyCollect1', 'legal.privacyCollect2', 'legal.privacyCollect3'], list: true },
        { heading: 'legal.privacyUseTitle', items: ['legal.privacyUse'] },
        { heading: 'legal.privacyChildrenTitle', items: ['legal.privacyChildren'] },
        { heading: 'legal.privacyChoicesTitle', items: ['legal.privacyChoices'] },
      ]}
    />
  );
}

export function Terms() {
  return (
    <LegalPage
      title="legal.termsTitle"
      intro="legal.termsIntro"
      blocks={[
        { heading: 'legal.termsContentTitle', items: ['legal.termsContent'] },
        { heading: 'legal.termsConductTitle', items: ['legal.termsConduct'] },
        { heading: 'legal.termsServiceTitle', items: ['legal.termsService'] },
      ]}
    />
  );
}
