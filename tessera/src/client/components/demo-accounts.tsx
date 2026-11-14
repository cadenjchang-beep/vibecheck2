import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoAccount } from '@shared/demo';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { useFeatures } from '@/lib/me';

const LABELS = { student: 'auth.demoStudent', teacher: 'auth.demoTeacher', premium: 'auth.demoPremium' } as const;

/** One-click sign-in for the demo accounts, offered only in previews. */
export function DemoAccounts({ onPick, busy }: { onPick: (email: string, password: string) => void; busy: boolean }) {
  const { t } = useI18n();
  if (useFeatures()?.environment !== 'preview') return null;
  return (
    <section aria-labelledby="demo-title" className="mb-5 rounded-2xl border border-dashed border-input p-4">
      <h2 id="demo-title" className="font-bold">
        {t('auth.demoTitle')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('auth.demoBody', { password: DEMO_PASSWORD })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(DEMO_ACCOUNTS) as DemoAccount[]).map((key) => (
          <Button
            key={key}
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-label={t('auth.demoUse', { role: t(LABELS[key]).toLowerCase() })}
            onClick={() => onPick(DEMO_ACCOUNTS[key].email, DEMO_PASSWORD)}
          >
            {t(LABELS[key])}
          </Button>
        ))}
      </div>
    </section>
  );
}
