import { Crown, Download, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { MeUser } from '@shared/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { authClient, authErrorCode } from '@/lib/auth';
import { useBilling, useBillingRedirect } from '@/lib/billing';
import { BUILT } from '@/lib/built';
import { useI18n } from '@/lib/i18n';
import { useFeatures, useRefreshMe } from '@/lib/me';
import { clearUserCaches } from '@/lib/pwa';
import { queryClient } from '@/lib/query';
import { SettingsCard } from '@/routes/settings';

function PlanCard({ user }: { user: MeUser }) {
  const { t, formatDate } = useI18n();
  const features = useFeatures();
  const billing = useBilling();
  const portal = useBillingRedirect('portal');
  const refreshMe = useRefreshMe();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('billing') === 'updated') {
      toast.success(t('settings.billingUpdated'));
      void billing.refetch();
      void refreshMe();
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sub = billing.data?.subscription;
  const premium = user.plan === 'premium';
  return (
    <SettingsCard title={t('settings.plan')}>
      <p className="flex items-center gap-2 font-semibold">
        {premium ? <Crown className="size-5 text-gold" aria-hidden="true" /> : null}
        {premium ? t('settings.planPremium') : t('settings.planFree')}
      </p>
      {sub?.currentPeriodEnd && premium ? (
        <p className="text-sm text-muted-foreground">
          {sub.cancelAtPeriodEnd
            ? t('settings.ends', { date: formatDate(sub.currentPeriodEnd, { dateStyle: 'long' }) })
            : t('settings.renews', { date: formatDate(sub.currentPeriodEnd, { dateStyle: 'long' }) })}
        </p>
      ) : null}
      {sub && !sub.manageable ? <Alert>{t('settings.billingElsewhere')}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {sub?.manageable && features?.payments !== 'off' ? (
          <Button variant="secondary" loading={portal.isPending} onClick={() => portal.mutate()}>
            {t('settings.manageBilling')}
          </Button>
        ) : null}
        {!premium && BUILT.upgrade ? (
          <Button asChild>
            <Link to="/upgrade">{t('settings.seePremium')}</Link>
          </Button>
        ) : null}
      </div>
    </SettingsCard>
  );
}

function PasswordForm() {
  const { t, tMaybe } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: failure } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (failure) {
      setError(tMaybe(`errors.${authErrorCode(failure)}`) ?? t('errors.generic'));
      return;
    }
    setCurrent('');
    setNext('');
    toast.success(t('settings.passwordChanged'));
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h3 className="font-bold">{t('settings.changePassword')}</h3>
      <Field label={t('settings.currentPassword')}>
        {(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />}
      </Field>
      <Field label={t('settings.newPassword')} error={error ?? undefined}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />}
      </Field>
      <Button type="submit" variant="secondary" className="self-start" loading={busy} disabled={!current || next.length < 8}>
        {t('settings.changePassword')}
      </Button>
    </form>
  );
}

function DeleteAccount({ user }: { user: MeUser }) {
  const { t, tMaybe } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setConfirm('');
      setError(null);
    }
  }, [open]);
  const ready = user.hasPassword ? confirm.length > 0 : confirm.trim().toLowerCase() === user.email.toLowerCase();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await authClient.deleteUser(user.hasPassword ? { password: confirm } : {});
    setBusy(false);
    if (failure) {
      const code = authErrorCode(failure);
      setError(code === 'session_expired' ? t('settings.deleteFresh') : (tMaybe(`errors.${code}`) ?? t('errors.generic')));
      return;
    }
    await clearUserCaches();
    queryClient.clear();
    toast.success(t('settings.deleteDone'));
    navigate('/', { replace: true });
  };
  return (
    <>
      <div>
        <h3 className="font-bold">{t('settings.deleteTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('settings.deleteBody')}</p>
        <Button variant="destructive" className="mt-3" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden="true" />
          {t('settings.deleteButton')}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('settings.deleteConfirmTitle')} description={t('settings.deleteConfirmBody')} size="sm">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label={user.hasPassword ? t('settings.deletePassword') : t('settings.deleteGoogle')} error={error ?? undefined}>
              {(p) =>
                user.hasPassword ? (
                  <Input {...p} type="password" autoComplete="current-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus />
                ) : (
                  <Input {...p} type="email" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus />
                )
              }
            </Field>
            <Button type="submit" variant="destructive" loading={busy} disabled={!ready}>
              {t('settings.deleteButton')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Plan, password, data export and account deletion. */
export function AccountSection({ user }: { user: MeUser }) {
  const { t } = useI18n();
  return (
    <>
      <PlanCard user={user} />
      <SettingsCard title={t('settings.account')}>
        {user.hasPassword ? <PasswordForm /> : <p className="text-sm text-muted-foreground">{t('settings.noPassword')}</p>}
        <div className="border-t border-border pt-4">
          <h3 className="font-bold">{t('settings.exportTitle')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.exportBody')}</p>
          <Button asChild variant="secondary" className="mt-3">
            <a href="/api/me/export" download onClick={() => toast(t('settings.exportStarted'))}>
              <Download aria-hidden="true" />
              {t('settings.exportButton')}
            </a>
          </Button>
        </div>
        <div className="border-t border-border pt-4">
          <DeleteAccount user={user} />
        </div>
      </SettingsCard>
    </>
  );
}
