import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { isEmail } from '@/components/account-fields';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Alert, PageLoading } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage, useMe } from '@/lib/me';
import { usePageTitle } from '@/lib/page';

/** Shown to an under-13 account until a parent or guardian approves it. */
export default function Waiting() {
  const { t } = useI18n();
  usePageTitle(t('onboarding.waitingTitle'));
  const { data, isPending, refetch, isFetching } = useMe();
  const navigate = useNavigate();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [notice, setNotice] = useState<{ kind: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [changing, setChanging] = useState(false);
  const [parentEmail, setParentEmail] = useState('');
  const [busy, setBusy] = useState(false);

  if (isPending) return <PageLoading />;
  const user = data?.user;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.onboarded) return <Navigate to="/welcome" replace />;
  if (user.consentStatus !== 'pending') return <Navigate to="/home" replace />;

  const check = async () => {
    const result = await refetch();
    if (result.data?.user?.consentStatus === 'pending') setNotice({ kind: 'info', text: t('onboarding.waitingNotYet') });
  };

  const resend = async (e?: FormEvent) => {
    e?.preventDefault();
    if (changing && !isEmail(parentEmail)) {
      setNotice({ kind: 'error', text: t('errors.parent_email_required') });
      return;
    }
    setBusy(true);
    try {
      await api('/api/me/consent/resend', { method: 'POST', body: changing ? { parentEmail: parentEmail.trim() } : {} });
      setNotice({ kind: 'success', text: t('onboarding.waitingResent') });
      setChanging(false);
    } catch (err) {
      setNotice({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const logOut = async () => {
    await authClient.signOut();
    client.clear();
    navigate('/', { replace: true });
  };

  return (
    <AuthLayout title={t('onboarding.waitingTitle')} subtitle={t('onboarding.waitingBodyNoEmail')}>
      <div className="flex flex-col gap-3">
        {notice ? <Alert variant={notice.kind}>{notice.text}</Alert> : null}
        <Button size="lg" onClick={check} loading={isFetching}>
          {t('onboarding.waitingCheck')}
        </Button>
        {changing ? (
          <form onSubmit={resend} noValidate className="flex flex-col gap-3 rounded-2xl bg-muted p-4">
            <Field label={t('auth.parentEmail')}>
              {(p) => (
                <Input {...p} type="email" inputMode="email" autoCapitalize="none" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
              )}
            </Field>
            <Button type="submit" variant="secondary" loading={busy}>
              {t('onboarding.waitingResend')}
            </Button>
          </form>
        ) : (
          <>
            <Button variant="secondary" onClick={() => void resend()} loading={busy}>
              {t('onboarding.waitingResend')}
            </Button>
            <Button variant="ghost" onClick={() => setChanging(true)}>
              {t('onboarding.waitingChange')}
            </Button>
          </>
        )}
        <Button variant="link" onClick={logOut} className="self-center">
          {t('nav.logOut')}
        </Button>
      </div>
    </AuthLayout>
  );
}
