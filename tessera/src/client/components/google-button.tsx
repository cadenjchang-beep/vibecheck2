import { useState } from 'react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Button } from './ui/button';

/** Starts the Google OAuth redirect. Rendered only when the server has it configured. */
export function GoogleButton({ next }: { next: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: next,
      newUserCallbackURL: '/welcome',
      errorCallbackURL: '/login?error=oauth',
    });
    if (error) {
      setBusy(false);
      toast.error(t('errors.generic'));
    }
  };
  return (
    <>
      <Button variant="secondary" size="lg" className="w-full" loading={busy} onClick={start}>
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        {t('auth.continueWithGoogle')}
      </Button>
      <div className="my-5 flex items-center gap-3 text-sm text-muted-foreground" role="separator">
        <span className="h-px flex-1 bg-border" />
        {t('auth.orWithEmail')}
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
