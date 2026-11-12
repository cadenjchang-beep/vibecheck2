import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PasswordInput } from '@/components/account-fields';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field } from '@/components/ui/input';
import { authClient } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { usePageTitle } from '@/lib/page';

export default function ResetPassword() {
  const { t } = useI18n();
  usePageTitle(t('auth.resetTitle'));
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState<'form' | 'done' | 'invalid'>(token && !params.get('error') ? 'form' : 'invalid');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError(t('errors.password_too_short'));
      return;
    }
    setBusy(true);
    setError('');
    const result = await authClient.resetPassword({ newPassword: password, token: token! });
    setBusy(false);
    setState(result.error ? 'invalid' : 'done');
  };

  const backLink = (
    <Link to="/login" className="font-semibold text-primary hover:underline">
      {t('auth.backToLogIn')}
    </Link>
  );

  return (
    <AuthLayout title={t('auth.resetTitle')} subtitle={state === 'form' ? t('auth.resetSubtitle') : undefined} footer={backLink}>
      {state === 'done' ? <Alert variant="success">{t('auth.resetDone')}</Alert> : null}
      {state === 'invalid' ? (
        <div className="flex flex-col gap-4">
          <Alert variant="error">{t('auth.resetInvalid')}</Alert>
          <Button asChild variant="secondary">
            <Link to="/forgot-password">{t('auth.sendResetLink')}</Link>
          </Button>
        </div>
      ) : null}
      {state === 'form' ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label={t('auth.newPassword')} error={error} hint={t('auth.passwordHint')}>
            {(p) => (
              <PasswordInput {...p} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            )}
          </Field>
          <Button type="submit" size="lg" loading={busy}>
            {t('auth.resetSubmit')}
          </Button>
        </form>
      ) : null}
    </AuthLayout>
  );
}
