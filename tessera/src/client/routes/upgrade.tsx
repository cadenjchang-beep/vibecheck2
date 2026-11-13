import { useQueryClient } from '@tanstack/react-query';
import { Check, Crown, Minus } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { entitlementsFor, PREMIUM_PRICE } from '@shared/entitlements';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { useBillingRedirect } from '@/lib/billing';
import { useI18n } from '@/lib/i18n';
import { useFeatures, useUser } from '@/lib/me';
import { usePageTitle } from '@/lib/page';
import { keys } from '@/lib/query';

const FREE = entitlementsFor('free');
const PREMIUM = entitlementsFor('premium');

export default function Upgrade() {
  const { t, formatNumber } = useI18n();
  usePageTitle(t('upgrade.title'));
  const user = useUser();
  const features = useFeatures();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const outcome = params.get('checkout');
  const checkout = useBillingRedirect('checkout');
  const portal = useBillingRedirect('portal');

  // Returning from a successful checkout: the plan has changed on the server.
  useEffect(() => {
    if (outcome === 'success') {
      void client.invalidateQueries({ queryKey: keys.me });
      void client.invalidateQueries({ queryKey: keys.billing });
      void client.invalidateQueries({ queryKey: keys.aiUsage });
    }
  }, [outcome, client]);

  const price = formatNumber(PREMIUM_PRICE.amount, { style: 'currency', currency: PREMIUM_PRICE.currency, maximumFractionDigits: 0 });
  const payments = features?.payments ?? 'off';
  const yes = (
    <>
      <Check className="mx-auto size-5 text-success" aria-hidden="true" />
      <span className="sr-only">{t('upgrade.included')}</span>
    </>
  );
  const no = (
    <>
      <Minus className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t('upgrade.notIncluded')}</span>
    </>
  );
  const rows = [
    { label: t('upgrade.rowSets'), free: yes, premium: yes },
    { label: t('upgrade.rowAi'), free: formatNumber(FREE.aiMonthlyLimit), premium: formatNumber(PREMIUM.aiMonthlyLimit) },
    { label: t('upgrade.rowMedia'), free: no, premium: yes },
    { label: t('upgrade.rowOffline'), free: no, premium: yes },
    { label: t('upgrade.rowStats'), free: no, premium: yes },
    { label: t('upgrade.rowAds'), free: no, premium: yes },
  ];

  let action;
  if (user?.plan === 'premium') {
    action = (
      <div className="flex flex-col items-start gap-3">
        <p className="flex items-center gap-2 font-semibold">
          <Crown className="size-5 text-gold" aria-hidden="true" />
          {t('upgrade.already')}
        </p>
        {payments !== 'off' ? (
          <Button variant="secondary" loading={portal.isPending} onClick={() => portal.mutate()}>
            {t('upgrade.manage')}
          </Button>
        ) : null}
      </div>
    );
  } else if (!user) {
    action = (
      <Button asChild size="lg">
        <Link to="/signup?next=%2Fupgrade">{t('upgrade.ctaSignUp')}</Link>
      </Button>
    );
  } else if (user.isChild) {
    action = <Alert>{t('upgrade.child')}</Alert>;
  } else if (payments === 'off') {
    action = <Alert>{t('upgrade.unavailable')}</Alert>;
  } else {
    action = (
      <div className="flex flex-col items-start gap-2">
        <Button size="lg" loading={checkout.isPending} onClick={() => checkout.mutate()}>
          <Crown aria-hidden="true" />
          {checkout.isPending ? t('upgrade.redirecting') : t('upgrade.cta', { price })}
        </Button>
        {payments === 'mock' ? <p className="text-sm text-muted-foreground">{t('upgrade.testMode')}</p> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {outcome === 'success' ? (
        <Alert variant="success" className="mb-6">
          {t('upgrade.success')}
        </Alert>
      ) : outcome === 'cancelled' ? (
        <Alert className="mb-6">{t('upgrade.cancelled')}</Alert>
      ) : null}
      <h1 className="flex items-center gap-3 text-3xl font-extrabold sm:text-4xl">
        <Crown className="size-8 text-gold" aria-hidden="true" />
        {t('upgrade.title')}
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{t('upgrade.subtitle')}</p>
      <p className="mt-5 font-display text-2xl font-bold">{t('upgrade.perMonth', { price })}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('upgrade.cancelAnytime')}</p>
      <div className="mt-5">{action}</div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm sm:text-base">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-3 text-start font-semibold">
                {t('upgrade.feature')}
              </th>
              <th scope="col" className="w-20 px-2 py-3 text-center font-semibold sm:w-28">
                {t('upgrade.free')}
              </th>
              <th scope="col" className="w-20 px-2 py-3 text-center font-semibold text-primary sm:w-28">
                {t('upgrade.premium')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border last:border-0">
                <th scope="row" className="px-4 py-3 text-start font-normal">
                  {row.label}
                </th>
                <td className="px-2 py-3 text-center tabular-nums">{row.free}</td>
                <td className="px-2 py-3 text-center font-semibold tabular-nums">{row.premium}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
