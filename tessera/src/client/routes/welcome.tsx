import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { AgeRoleFields, emptyAgeRole, isChildValue, onboardingPayload, validateAgeRole, type AgeRoleValue } from '@/components/account-fields';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Alert, PageLoading } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage, useMe, useRefreshMe } from '@/lib/me';
import { usePageTitle } from '@/lib/page';

/** The age gate and role step for accounts that arrive without it (Google sign-in). */
export default function Welcome() {
  const { t, locale } = useI18n();
  usePageTitle(t('onboarding.title'));
  const { data, isPending } = useMe();
  const navigate = useNavigate();
  const refreshMe = useRefreshMe();
  const errorMessage = useErrorMessage();
  const [age, setAge] = useState<AgeRoleValue>(emptyAgeRole);
  const [errors, setErrors] = useState<Partial<Record<'birthday' | 'parentEmail', string>>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (isPending) return <PageLoading />;
  const user = data?.user;
  if (!user) return <Navigate to="/login" replace />;
  if (user.consentStatus === 'pending') return <Navigate to="/waiting" replace />;
  if (user.onboarded) return <Navigate to="/home" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateAgeRole(age, user.email, t);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFormError('');
    try {
      await api('/api/me/onboarding', { method: 'POST', body: onboardingPayload(age, locale) });
      await refreshMe();
      navigate(isChildValue(age) ? '/waiting' : '/home', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('onboarding.title')} subtitle={t('onboarding.subtitle')}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        <AgeRoleFields value={age} onChange={setAge} errors={errors} />
        <Button type="submit" size="lg" loading={busy} className="mt-1">
          {t('onboarding.finish')}
        </Button>
      </form>
    </AuthLayout>
  );
}
