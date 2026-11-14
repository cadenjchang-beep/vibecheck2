import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import type { MeUser } from '@shared/api';
import { DAILY_GOAL_OPTIONS, UI_LOCALES, type ReminderChannel, type UiLocale } from '@shared/constants';
import { AccountSection } from '@/components/settings/account';
import { SettingsCard } from '@/components/settings/card';
import { Button } from '@/components/ui/button';
import { Segmented, Switch, ToggleRow } from '@/components/ui/controls';
import { Alert, PageLoading } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useErrorMessage, useFeatures, useUser } from '@/lib/me';
import { usePageTitle } from '@/lib/page';
import { subscribeToPush } from '@/lib/push';
import { keys } from '@/lib/query';
import { useTheme, type ThemeChoice } from '@/lib/theme';

function SettingsForm({ user }: { user: MeUser }) {
  const { t, locale, setLocale, formatDate } = useI18n();
  const client = useQueryClient();
  const features = useFeatures();
  const errorMessage = useErrorMessage();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(user.name);
  const [pushNote, setPushNote] = useState('');

  const save = async (patch: Record<string, unknown>, quiet = false) => {
    try {
      await api('/api/me', { method: 'PATCH', body: patch });
      await client.invalidateQueries({ queryKey: keys.me });
      void client.invalidateQueries({ queryKey: keys.dashboard });
      void client.invalidateQueries({ queryKey: keys.stats });
      if (!quiet) toast.success(t('settings.saved'));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const setChannel = async (channel: ReminderChannel) => {
    setPushNote('');
    if (channel === 'push') {
      const result = await subscribeToPush(features?.vapidPublicKey ?? null);
      if (result !== 'ok') {
        setPushNote(result === 'denied' ? t('settings.pushDenied') : result === 'unavailable' ? t('settings.pushUnavailable') : t('settings.pushUnsupported'));
        return;
      }
    }
    await save({ reminderChannel: channel });
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-3xl font-extrabold">{t('settings.title')}</h1>

      <SettingsCard title={t('settings.profile')}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void save({ name: name.trim() });
          }}
        >
          <Field label={t('settings.displayName')}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} dir="auto" required />}</Field>
          <Field label={t('settings.emailLabel')}>{(p) => <Input {...p} value={user.email} readOnly disabled />}</Field>
          <Button type="submit" className="self-start" disabled={!name.trim() || name.trim() === user.name}>
            {t('common.save')}
          </Button>
        </form>
        {!user.isChild ? (
          <ToggleRow
            htmlFor="set-teacher"
            label={t('settings.teacher')}
            description={t('settings.teacherHint')}
            control={<Switch id="set-teacher" checked={user.role === 'teacher'} onCheckedChange={(checked) => void save({ role: checked ? 'teacher' : 'student' })} />}
          />
        ) : null}
      </SettingsCard>

      <SettingsCard title={t('settings.study')}>
        <Field label={t('settings.dailyGoal')}>
          {(p) => (
            <Select {...p} value={user.dailyGoal} onChange={(e) => void save({ dailyGoal: Number(e.target.value) })}>
              {[...new Set([...DAILY_GOAL_OPTIONS, user.dailyGoal])].sort((a, b) => a - b).map((goal) => (
                <option key={goal} value={goal}>
                  {goal === 0 ? t('settings.goalOff') : t('settings.goalCards', { count: goal })}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{t('settings.reminders')}</span>
          <Segmented
            aria-label={t('settings.reminders')}
            value={user.reminderChannel}
            onValueChange={(channel) => void setChannel(channel)}
            options={[
              { value: 'off', label: t('settings.reminderOff') },
              { value: 'email', label: t('settings.reminderEmail') },
              { value: 'push', label: t('settings.reminderPush') },
            ]}
          />
          <p className="text-sm text-muted-foreground">{t('settings.remindersHint')}</p>
          {pushNote ? <Alert variant="warning">{pushNote}</Alert> : null}
        </div>
        {user.reminderChannel !== 'off' ? (
          <Field label={t('settings.reminderTime')}>
            {(p) => (
              <Select {...p} value={user.reminderHour} onChange={(e) => void save({ reminderHour: Number(e.target.value) })}>
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {formatDate(new Date(2024, 0, 1, h), { hour: 'numeric', minute: '2-digit' })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </SettingsCard>

      <SettingsCard title={t('settings.appearance')}>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{t('common.theme')}</span>
          <Segmented
            aria-label={t('common.theme')}
            value={theme}
            onValueChange={(value) => setTheme(value as ThemeChoice)}
            options={[
              { value: 'system', label: t('common.themeSystem') },
              { value: 'light', label: t('common.themeLight') },
              { value: 'dark', label: t('common.themeDark') },
            ]}
          />
        </div>
        <Field label={t('common.language')}>
          {(p) => (
            <Select
              {...p}
              value={locale}
              onChange={(e) => {
                setLocale(e.target.value as UiLocale);
                void save({ locale: e.target.value }, true);
              }}
            >
              {UI_LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </SettingsCard>

      <AccountSection user={user} />
    </div>
  );
}

export default function Settings() {
  const { t } = useI18n();
  usePageTitle(t('settings.title'));
  const user = useUser();
  if (!user) return <PageLoading />;
  return <SettingsForm key={user.id} user={user} />;
}
