import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { useT } from '@/lib/i18n';
import { reportClientError } from '@/lib/report';
import { Logo } from './logo';
import { Button } from './ui/button';

function CrashScreen({ notFound }: { notFound?: boolean }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo />
      <h1 className="text-3xl font-extrabold">{notFound ? t('errors.pageNotFoundTitle') : t('errors.crashTitle')}</h1>
      <p className="max-w-md text-muted-foreground">{notFound ? t('errors.pageNotFoundBody') : t('errors.crashBody')}</p>
      <div className="flex gap-2">
        {!notFound && <Button onClick={() => window.location.reload()}>{t('errors.reload')}</Button>}
        <Button variant={notFound ? 'primary' : 'secondary'} asChild>
          <Link to="/">{t('errors.goHome')}</Link>
        </Button>
      </div>
    </div>
  );
}

/** Shown by the router when a route throws while loading or rendering. */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (!notFound) reportClientError(error, 'route');
  return <CrashScreen notFound={notFound} />;
}

/** Last line of defence around the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error, `boundary:${info.componentStack?.split('\n')[1]?.trim() ?? ''}`);
  }
  override render() {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}
