import { Check, Crown, GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { Footer, SkipLink } from '@/components/app-layout';
import { Logo } from '@/components/logo';
import { Mosaic } from '@/components/mosaic';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { isActive, useMe } from '@/lib/me';
import { MODES } from '@/lib/modes';
import { usePageTitle } from '@/lib/page';
import type { Stage } from '@shared/constants';
import { PREMIUM_PRICE } from '@shared/entitlements';

/** A fixed, pleasing spread of stages for the decorative hero mosaic. */
const HERO_STAGES: Stage[] = Array.from({ length: 112 }, (_, i) => {
  const col = i % 14;
  const row = Math.floor(i / 14);
  const wave = Math.sin(col * 0.55 + row * 0.9) + Math.cos(row * 1.3 - col * 0.25);
  const score = (13 - col) / 13 + (7 - row) / 14 + wave * 0.22;
  if (score > 1.05) return 'mastered';
  if (score > 0.72) return 'familiar';
  if (score > 0.42) return 'learning';
  return 'new';
});

function SampleCard() {
  const { t } = useI18n();
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="flip-scene mx-auto w-full max-w-sm">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        data-flipped={flipped}
        className="flip-card block aspect-[5/3] w-full rounded-3xl text-center"
      >
        <span data-face="front" className="flip-face flex items-center justify-center rounded-3xl border border-border bg-card p-6 shadow-raised">
          <span className="font-display text-3xl font-bold">{t('landing.sampleTerm')}</span>
        </span>
        <span
          data-face="back"
          className="flip-face flip-face-back flex items-center justify-center rounded-3xl border border-border bg-card p-6 shadow-raised"
        >
          <span className="text-lg">{t('landing.sampleDefinition')}</span>
        </span>
      </button>
    </div>
  );
}

export default function Landing() {
  const { t, formatNumber } = useI18n();
  usePageTitle(t('common.tagline'));
  const { data } = useMe();
  if (isActive(data?.user)) return <Navigate to="/home" replace />;
  const aiOn = Boolean(data?.features.ai);

  const price = formatNumber(PREMIUM_PRICE.amount, { style: 'currency', currency: PREMIUM_PRICE.currency, maximumFractionDigits: 0 });
  // AI can be switched off per deployment, so the first step only promises it when it is on.
  const steps = [
    aiOn ? { title: t('landing.how1Title'), body: t('landing.how1Body') } : { title: t('landing.how1TitleBasic'), body: t('landing.how1BodyBasic') },
    { title: t('landing.how2Title'), body: t('landing.how2Body') },
    { title: t('landing.how3Title'), body: t('landing.how3Body') },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="container-page flex h-16 items-center gap-2">
        <Logo />
        <div className="ms-auto flex items-center gap-1">
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <Link to="/browse">{t('nav.browse')}</Link>
          </Button>
          {/* Tighter on phones, where longer translations would not fit beside the logo. */}
          <Button variant="ghost" asChild className="px-2.5 text-sm sm:px-4 sm:text-[0.95rem]">
            <Link to="/login">{t('nav.logIn')}</Link>
          </Button>
          <Button asChild className="px-3 text-sm sm:px-4 sm:text-[0.95rem]">
            <Link to="/signup">{t('nav.signUp')}</Link>
          </Button>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <section className="container-page grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div>
            <h1 className="text-[2.6rem] leading-[1.05] font-extrabold sm:text-6xl">{t('landing.heroTitle')}</h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground sm:text-xl">{t('landing.heroBody')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/signup">{t('landing.ctaPrimary')}</Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link to="/browse">{t('landing.ctaBrowse')}</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{t('landing.trust')}</p>
          </div>
          <div className="relative">
            <div className="rounded-[2rem] border border-border bg-card p-5 shadow-card sm:p-7">
              <Mosaic stages={HERO_STAGES} className="grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5" />
            </div>
            <div className="-mt-16 px-6 sm:-mt-20 sm:px-12">
              <SampleCard />
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-muted/60 py-14 sm:py-20" aria-labelledby="modes-title">
          <div className="container-page">
            <h2 id="modes-title" className="text-3xl font-extrabold sm:text-4xl">
              {MODES.length === 6 ? t('landing.modesTitle') : t('landing.modesTitleShort')}
            </h2>
            <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{t('landing.modesBody')}</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MODES.map(({ mode, icon: Icon, label, description }) => (
                <li key={mode} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground" aria-hidden="true">
                    <Icon className="size-5.5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{t(label)}</h3>
                  <p className="mt-1 text-muted-foreground">{t(description)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="container-page py-14 sm:py-20" aria-labelledby="how-title">
          <h2 id="how-title" className="text-3xl font-extrabold sm:text-4xl">
            {t('landing.howTitle')}
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-4 md:flex-col">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-foreground font-display text-lg font-bold text-background" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-xl font-bold">{step.title}</h3>
                  <p className="mt-1.5 text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-border bg-muted/60 py-14 sm:py-20">
          <div className="container-page grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-extrabold">{t('landing.mosaicTitle')}</h2>
              <p className="mt-3 text-lg text-muted-foreground">{t('landing.mosaicBody')}</p>
            </div>
            <div className="flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground" aria-hidden="true">
                <GraduationCap className="size-5.5" />
              </span>
              <div>
                <h2 className="text-2xl font-extrabold">{t('landing.teachersTitle')}</h2>
                <p className="mt-2 text-lg text-muted-foreground">{t('landing.teachersBody')}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="container-page py-14 sm:py-20">
          <h2 className="text-3xl font-extrabold sm:text-4xl">{t('landing.pricingTitle')}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
              <h3 className="text-xl font-bold">{t('common.free')}</h3>
              <p className="mt-2 font-display text-4xl font-extrabold">
                {formatNumber(0, { style: 'currency', currency: PREMIUM_PRICE.currency, maximumFractionDigits: 0 })}
              </p>
              <p className="mt-3 flex gap-2 text-muted-foreground">
                <Check className="mt-1 size-4 shrink-0 text-success" aria-hidden="true" />
                {t('landing.pricingFreeBody')}
              </p>
            </div>
            <div className="rounded-3xl border-2 border-primary bg-card p-6 shadow-card sm:p-8">
              <h3 className="flex items-center gap-2 text-xl font-bold">
                <Crown className="size-5 text-gold" aria-hidden="true" />
                {t('common.premium')}
              </h3>
              <p className="mt-2 font-display text-4xl font-extrabold">{t('landing.pricingPerMonth', { price })}</p>
              <p className="mt-3 flex gap-2 text-muted-foreground">
                <Check className="mt-1 size-4 shrink-0 text-success" aria-hidden="true" />
                {t('landing.pricingPremiumBody')}
              </p>
            </div>
          </div>
          <div className="mt-14 flex flex-col items-center gap-5 text-center">
            <h2 className="text-3xl font-extrabold sm:text-4xl">{t('landing.finalTitle')}</h2>
            <Button size="lg" asChild>
              <Link to="/signup">{t('landing.ctaPrimary')}</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
