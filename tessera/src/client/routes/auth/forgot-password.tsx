import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { isEmail } from '@/components/account-fields';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { authClient, authErrorCode } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { usePageTitle } from '@/lib/page';

export default function ForgotPassword() {
  const { t, tMaybe } = useI18n();
  usePageTitle(t('auth.forgotTitle'));
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isEmail(email)) {
      setError(t('errors.invalid_email'));
      return;
    }
    setBusy(true);
    setError('');
    const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: '/reset-password' });
    setBusy(false);
    // The same confirmation is shown whether or not the address has an account.
    if (result.error && result.error.status === 429) setError(tMaybe(`errors.${authErrorCode(result.error)}`) ?? t('errors.generic'));
    else setSent(true);
  };

  return (
    <AuthLayout
      title={t('auth.forgotTitle')}
      subtitle={sent ? undefined : t('auth.forgotSubtitle')}
      footer={
        <Link to="/login" className="tap-target font-semibold text-primary hover:underline">
          {t('auth.backToLogIn')}
        </Link>
      }
    >
      {sent ? (
        <Alert variant="success">{t('auth.resetSent', { email: email.trim() })}</Alert>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label={t('auth.email')} error={error}>
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
          <Button type="submit" size="lg" loading={busy}>
            {t('auth.sendResetLink')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
