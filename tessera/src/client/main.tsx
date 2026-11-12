import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css';
import '@fontsource-variable/bricolage-grotesque/wght.css';
import './styles.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Direction } from 'radix-ui';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/error-boundary';
import { TooltipProvider } from './components/ui/controls';
import { I18nProvider, useI18n } from './lib/i18n';
import { queryClient } from './lib/query';
import { installGlobalErrorReporting } from './lib/report';
import { router } from './router';

installGlobalErrorReporting();

function DirectionProvider({ children }: { children: ReactNode }) {
  const { dir } = useI18n();
  return <Direction.Provider dir={dir}>{children}</Direction.Provider>;
}

function AppToaster() {
  const { dir } = useI18n();
  return (
    <Toaster
      dir={dir}
      position="bottom-center"
      // Sits above the mobile tab bar.
      mobileOffset={{ bottom: 84 }}
      toastOptions={{
        duration: 5000,
        classNames: {
          toast:
            '!rounded-2xl !border !border-border !bg-popover !text-popover-foreground !shadow-pop !font-sans !text-[0.95rem] !gap-3',
          description: '!text-muted-foreground',
          actionButton: '!bg-primary !text-primary-foreground !font-semibold !rounded-lg !h-9 !px-3',
          cancelButton: '!bg-secondary !text-secondary-foreground !rounded-lg !h-9 !px-3',
          error: '!text-destructive',
          success: '!text-foreground',
        },
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <DirectionProvider>
            <TooltipProvider delayDuration={350}>
              <RouterProvider router={router} />
              <AppToaster />
            </TooltipProvider>
          </DirectionProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
