import type { ComponentType } from 'react';
import { createBrowserRouter, Outlet } from 'react-router';
import { AppLayout, RouteAnnouncer } from './components/app-layout';
import { RouteError } from './components/error-boundary';
import { GuestOnly, RequireAuth } from './components/guards';

/** Route-level code splitting: each page is its own chunk. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

function Root() {
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
      {
        element: <AppLayout />,
        children: [
          {
            element: <RequireAuth />,
            children: [{ path: 'home', lazy: page(() => import('./routes/home')) }],
          },
          { path: '*', lazy: page(() => import('./routes/not-found')) },
        ],
      },
    ],
  },
]);
