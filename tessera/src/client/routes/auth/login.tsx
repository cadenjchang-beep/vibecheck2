import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PasswordInput } from '@/components/account-fields';
import { AuthLayout } from '@/components/auth-layout';
import { DemoAccounts } from '@/components/demo-accounts';
import { GoogleButton } from '@/components/google-button';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { authClient, authErrorCode } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useFeatures, useRefreshMe } from '@/lib/me';
import { safeNext, usePageTitle } from '@/lib/page';

export default function LogIn() {
  const { t, tMaybe } = useI18n();
  usePageTitle(t('auth.logIn'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const refreshMe = useRefreshMe();
  const features = useFeatures();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(params.get('error') ? t('errors.generic') : '');
  const [busy, setBusy] = useState(false);

  const signIn = async (address: string, secret: string) => {
    setBusy(true);
    setError('');
    const result = await authClient.signIn.email({ email: address.trim(), password: secret });
    if (result.error) {
      setBusy(false);
      setError(tMaybe(`errors.${authErrorCode(result.error)}`) ?? t('errors.invalid_email_or_password'));
      return;
    }
    await refreshMe();
    navigate(next, { replace: true });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(t('errors.invalid_email_or_password'));
      return;
    }
    void signIn(email, password);
  };

  return (
    <AuthLayout
      title={t('auth.logInTitle')}
      subtitle={t('auth.logInSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-primary hover:underline">
            {t('auth.signUp')}
          </Link>
        </>
      }
    >
      <DemoAccounts busy={busy} onPick={(address, secret) => void signIn(address, secret)} />
      {features?.googleAuth ? <GoogleButton next={next} /> : null}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Field label={t('auth.email')}>
          {(p) => (
            <Input
              {...p}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
        </Field>
        <Field label={t('auth.password')}>
          {(p) => <PasswordInput {...p} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
        </Field>
        <Button type="submit" size="lg" loading={busy} className="mt-1">
          {t('auth.logIn')}
        </Button>
        <Link to="/forgot-password" className="self-center font-semibold text-primary hover:underline">
          {t('auth.forgotPassword')}
        </Link>
      </form>
    </AuthLayout>
  );
}
