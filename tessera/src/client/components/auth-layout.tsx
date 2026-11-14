import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '@/lib/i18n';
import { Logo } from './logo';
import { SkipLink } from './app-layout';

/** Centred single-column layout for log in, sign up and other one-task pages. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="container-page flex h-16 items-center">
        <Link to="/" className="rounded-lg pointer-coarse:py-1" aria-label={t('common.appName')}>
          <Logo />
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-6 outline-none sm:items-center sm:py-10">
        <div className={wide ? 'w-full max-w-xl' : 'w-full max-w-md'}>
          <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
            <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
            {subtitle ? <p className="mt-2 text-muted-foreground">{subtitle}</p> : null}
            <div className="mt-6">{children}</div>
          </div>
          {footer ? <div className="mt-5 text-center text-[0.95rem] text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
