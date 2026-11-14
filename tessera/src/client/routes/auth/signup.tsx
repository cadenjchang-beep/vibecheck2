import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  AgeRoleFields,
  emptyAgeRole,
  isChildValue,
  isEmail,
  onboardingPayload,
  PasswordInput,
  validateAgeRole,
  type AgeRoleValue,
} from '@/components/account-fields';
import { AuthLayout } from '@/components/auth-layout';
import { GoogleButton } from '@/components/google-button';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { authClient, authErrorCode } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage, useFeatures, useRefreshMe } from '@/lib/me';
import { safeNext, usePageTitle } from '@/lib/page';

export default function SignUp() {
  const { t, tMaybe, locale } = useI18n();
  usePageTitle(t('auth.signUpTitle'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const refreshMe = useRefreshMe();
  const errorMessage = useErrorMessage();
  const features = useFeatures();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState<AgeRoleValue>(emptyAgeRole);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const child = isChildValue(age);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = { ...validateAgeRole(age, email, t) };
    if (!name.trim()) found.name = t('errors.required');
    if (!isEmail(email)) found.email = t('errors.invalid_email');
    if (password.length < 8) found.password = t('errors.password_too_short');
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const { error } = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
        callbackURL: '/home?verified=1',
      });
      if (error) {
        setFormError(tMaybe(`errors.${authErrorCode(error)}`) ?? error.message ?? t('errors.generic'));
        return;
      }
      await api('/api/me/onboarding', { method: 'POST', body: onboardingPayload(age, locale) });
      await refreshMe();
      navigate(child ? '/waiting' : next, { replace: true });
    } catch (err) {
      // The account exists but setup did not finish: the guard routes to /welcome.
      setFormError(errorMessage(err));
      await refreshMe();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t('auth.signUpTitle')}
      subtitle={t('auth.signUpSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="tap-target font-semibold text-primary hover:underline">
            {t('auth.logIn')}
          </Link>
        </>
      }
    >
      {features?.googleAuth ? <GoogleButton next={next} /> : null}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        <AgeRoleFields value={age} onChange={setAge} errors={errors} />
        <Field label={t('auth.name')} error={errors.name} hint={child ? t('auth.nameChildHint') : undefined}>
          {(p) => (
            <Input
              {...p}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete={child ? 'nickname' : 'name'}
              maxLength={60}
              placeholder={t('auth.namePlaceholder')}
              required
            />
          )}
        </Field>
        <Field label={t('auth.email')} error={errors.email}>
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
        <Field label={t('auth.password')} error={errors.password} hint={t('auth.passwordHint')}>
          {(p) => (
            <PasswordInput {...p} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          )}
        </Field>
        <Button type="submit" size="lg" loading={busy} className="mt-1">
          {t('auth.signUp')}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.agree')}{' '}
          <Link to="/terms" className="underline hover:text-foreground">
            {t('nav.terms')}
          </Link>
          {' · '}
          <Link to="/privacy" className="underline hover:text-foreground">
            {t('nav.privacy')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
