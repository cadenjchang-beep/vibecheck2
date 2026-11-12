import { Eye, EyeOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isChildBirth } from '@shared/age';
import { useI18n } from '@/lib/i18n';
import { Button } from './ui/button';
import { Checkbox } from './ui/controls';
import { Field, Input, Label, Select } from './ui/input';

export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pe-12" />
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute end-1 top-1/2 -translate-y-1/2"
        aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}

export interface AgeRoleValue {
  birthMonth: string;
  birthYear: string;
  teacher: boolean;
  parentEmail: string;
}

export const emptyAgeRole: AgeRoleValue = { birthMonth: '', birthYear: '', teacher: false, parentEmail: '' };

export function isChildValue(value: AgeRoleValue): boolean {
  return isChildBirth(Number(value.birthYear) || null, Number(value.birthMonth) || null);
}

/**
 * Birthday (month and year), the teacher toggle, and, for under-13s, the
 * parent or guardian's email. Shared by sign-up and the post-OAuth step.
 */
export function AgeRoleFields({
  value,
  onChange,
  errors,
}: {
  value: AgeRoleValue;
  onChange: (value: AgeRoleValue) => void;
  errors: Partial<Record<'birthday' | 'parentEmail', string>>;
}) {
  const { t, locale } = useI18n();
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, i, 1))),
    [locale],
  );
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 100 }, (_, i) => now - 4 - i);
  }, []);
  const child = isChildValue(value);

  return (
    <>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold">{t('auth.birthday')}</legend>
        <div className="grid grid-cols-2 gap-3">
          <Select
            aria-label={t('auth.birthMonth')}
            value={value.birthMonth}
            onChange={(e) => onChange({ ...value, birthMonth: e.target.value })}
            aria-invalid={errors.birthday ? true : undefined}
            aria-describedby="birthday-hint"
            autoComplete="bday-month"
          >
            <option value="">{t('auth.month')}</option>
            {months.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('auth.birthYear')}
            value={value.birthYear}
            onChange={(e) => onChange({ ...value, birthYear: e.target.value })}
            aria-invalid={errors.birthday ? true : undefined}
            aria-describedby="birthday-hint"
            autoComplete="bday-year"
          >
            <option value="">{t('auth.year')}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        {errors.birthday ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {errors.birthday}
          </p>
        ) : null}
        <p id="birthday-hint" className="text-sm text-muted-foreground">
          {t('auth.birthdayHint')}
        </p>
      </fieldset>

      {child ? (
        <Field label={t('auth.parentEmail')} hint={t('auth.parentEmailHint')} error={errors.parentEmail}>
          {(p) => (
            <Input
              {...p}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={value.parentEmail}
              onChange={(e) => onChange({ ...value, parentEmail: e.target.value })}
            />
          )}
        </Field>
      ) : (
        <div className="flex items-start gap-3">
          <Checkbox id="teacher" checked={value.teacher} onCheckedChange={(c) => onChange({ ...value, teacher: c === true })} className="mt-0.5" />
          <div>
            <Label htmlFor="teacher" className="cursor-pointer text-base">
              {t('auth.iAmTeacher')}
            </Label>
            <p className="text-sm text-muted-foreground">{t('auth.iAmTeacherHint')}</p>
          </div>
        </div>
      )}
    </>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value: string) => EMAIL_RE.test(value.trim());

export function validateAgeRole(
  value: AgeRoleValue,
  ownEmail: string,
  t: ReturnType<typeof useI18n>['t'],
): Partial<Record<'birthday' | 'parentEmail', string>> {
  const errors: Partial<Record<'birthday' | 'parentEmail', string>> = {};
  if (!value.birthMonth || !value.birthYear) errors.birthday = t('errors.required');
  if (isChildValue(value)) {
    if (!isEmail(value.parentEmail)) errors.parentEmail = t('errors.parent_email_required');
    else if (value.parentEmail.trim().toLowerCase() === ownEmail.trim().toLowerCase()) errors.parentEmail = t('errors.parent_email_same');
  }
  return errors;
}

export function onboardingPayload(value: AgeRoleValue, locale: string) {
  const child = isChildValue(value);
  return {
    birthYear: Number(value.birthYear),
    birthMonth: Number(value.birthMonth),
    role: !child && value.teacher ? 'teacher' : 'student',
    parentEmail: child ? value.parentEmail.trim() : undefined,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
    locale,
  };
}
