import { useMutation, useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useParams } from 'react-router';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Alert, PageLoading } from '@/components/ui/feedback';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage } from '@/lib/me';
import { usePageTitle } from '@/lib/page';

interface ConsentInfo {
  childName: string;
  status: 'pending' | 'granted' | 'declined';
  expired: boolean;
}

/** The page a parent or guardian reaches from the emailed link. No account needed. */
export default function Consent() {
  const { t } = useI18n();
  usePageTitle(t('onboarding.consentTitle'));
  const { token = '' } = useParams();
  const errorMessage = useErrorMessage();
  const info = useQuery({
    queryKey: ['consent', token],
    queryFn: () => api<ConsentInfo>(`/api/consent/${encodeURIComponent(token)}`),
    retry: false,
    gcTime: 0,
  });
  const decide = useMutation({
    mutationFn: (decision: 'grant' | 'decline') =>
      api<{ status: 'granted' | 'declined' }>(`/api/consent/${encodeURIComponent(token)}`, { method: 'POST', body: { decision } }),
  });

  if (info.isPending) return <PageLoading />;
  if (info.isError) {
    const missing = info.error instanceof ApiError && info.error.status === 404;
    return (
      <AuthLayout title={t('onboarding.consentTitle')}>
        <Alert variant="error">{missing ? t('onboarding.consentNotFound') : errorMessage(info.error)}</Alert>
      </AuthLayout>
    );
  }

  const name = info.data.childName;
  const list = (items: string[]) => (
    <ul className="mt-2 flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <Check className="mt-1 size-4 shrink-0 text-success" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );

  let body;
  if (decide.data) {
    body = (
      <Alert variant="success">
        {decide.data.status === 'granted' ? t('onboarding.consentApproved', { name }) : t('onboarding.consentDeclined')}
      </Alert>
    );
  } else if (info.data.status !== 'pending') {
    body = <Alert variant="info">{t('onboarding.consentAlready')}</Alert>;
  } else if (info.data.expired) {
    body = <Alert variant="warning">{t('onboarding.consentExpired')}</Alert>;
  } else {
    body = (
      <div className="flex flex-col gap-5">
        <p dir="auto">{t('onboarding.consentIntro', { name })}</p>
        <section>
          <h2 className="text-base font-bold">{t('onboarding.consentWhatTitle')}</h2>
          <p className="mt-1 text-muted-foreground">{t('onboarding.consentWhat')}</p>
        </section>
        <section>
          <h2 className="text-base font-bold">{t('onboarding.consentDataTitle')}</h2>
          {list([t('onboarding.consentData1'), t('onboarding.consentData2'), t('onboarding.consentData3')])}
        </section>
        <section>
          <h2 className="text-base font-bold">{t('onboarding.consentLimitsTitle')}</h2>
          {list([t('onboarding.consentLimits1'), t('onboarding.consentLimits2'), t('onboarding.consentLimits3'), t('onboarding.consentLimits4')])}
        </section>
        {decide.isError ? <Alert variant="error">{errorMessage(decide.error)}</Alert> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="flex-1" loading={decide.isPending && decide.variables === 'grant'} onClick={() => decide.mutate('grant')}>
            {t('onboarding.consentApprove')}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="flex-1"
            loading={decide.isPending && decide.variables === 'decline'}
            onClick={() => decide.mutate('decline')}
          >
            {t('onboarding.consentDecline')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AuthLayout title={t('onboarding.consentTitle')} wide>
      {body}
    </AuthLayout>
  );
}
