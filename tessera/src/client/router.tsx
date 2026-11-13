import { useEffect, type ComponentType } from 'react';
import { createBrowserRouter, Outlet } from 'react-router';
import { AppLayout, RouteAnnouncer, syncTimezone } from './components/app-layout';
import { isActive, useUser } from './lib/me';
import { setOutboxUser } from './lib/outbox';
import { RouteError } from './components/error-boundary';
import { GuestOnly, RequireAuth } from './components/guards';

/** Route-level code splitting: each page is its own chunk. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

/** Keeps device-level state in step with whoever is signed in. */
function Root() {
  const user = useUser();
  const userId = isActive(user) ? user.id : null;
  useEffect(() => {
    // Study activity is queued per user, so it is never sent as someone else.
    setOutboxUser(userId);
    if (isActive(user)) syncTimezone(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  return (
    <>
      <RouteAnnouncer />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: page(() => import('./routes/landing')) },
      {
        element: <GuestOnly />,
        children: [
          { path: 'login', lazy: page(() => import('./routes/auth/login')) },
          { path: 'signup', lazy: page(() => import('./routes/auth/signup')) },
          { path: 'forgot-password', lazy: page(() => import('./routes/auth/forgot-password')) },
        ],
      },
      { path: 'reset-password', lazy: page(() => import('./routes/auth/reset-password')) },
      { path: 'welcome', lazy: page(() => import('./routes/welcome')) },
      { path: 'waiting', lazy: page(() => import('./routes/waiting')) },
      { path: 'consent/:token', lazy: page(() => import('./routes/consent')) },
      { path: 'sets/:id/print', lazy: page(() => import('./routes/set-print')) },
      // Study modes fill the screen: no site navigation, nothing to distract.
      { path: 'sets/:id/flashcards', lazy: page(() => import('./routes/study/flashcards')) },
      { path: 'sets/:id/learn', lazy: page(() => import('./routes/study/learn')) },
      {
        element: <AppLayout />,
        children: [
          {
            element: <RequireAuth />,
            children: [
              { path: 'home', lazy: page(() => import('./routes/home')) },
              { path: 'library', lazy: page(() => import('./routes/library')) },
              { path: 'sets/new', lazy: page(() => import('./routes/set-editor')) },
              { path: 'sets/:id/edit', lazy: page(() => import('./routes/set-editor')) },
            ],
          },
          // Public and link-shared sets open without an account.
          { path: 'sets/:id', lazy: page(() => import('./routes/set-detail')) },
          { path: '*', lazy: page(() => import('./routes/not-found')) },
        ],
      },
    ],
  },
]);
