import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { isActive, useMe } from '@/lib/me';
import { safeNext } from '@/lib/page';
import { PageLoading } from './ui/feedback';

/** Sends visitors to log in, and unfinished accounts to the step they still owe. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { data, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <PageLoading />;
  const user = data?.user;
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (!user.onboarded) return <Navigate to="/welcome" replace />;
  if (user.consentStatus === 'pending') return <Navigate to="/waiting" replace />;
  return <>{children ?? <Outlet />}</>;
}

/** For log-in and sign-up pages: someone already signed in goes straight to the app. */
export function GuestOnly() {
  const { data, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <PageLoading />;
  const user = data?.user;
  if (user && !user.onboarded) return <Navigate to="/welcome" replace />;
  if (user?.consentStatus === 'pending') return <Navigate to="/waiting" replace />;
  if (isActive(user)) {
    return <Navigate to={safeNext(new URLSearchParams(location.search).get('next'))} replace />;
  }
  return <Outlet />;
}
