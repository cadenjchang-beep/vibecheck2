import { useEffect, useSyncExternalStore } from 'react';
import { APP_NAME } from '@shared/constants';

let announced = '';
const listeners = new Set<() => void>();

/**
 * Sets the document title and announces the new page to screen readers, which
 * otherwise get no signal that a client-side navigation happened.
 */
export function usePageTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · ${APP_NAME}`;
    announced = title;
    listeners.forEach((l) => l());
  }, [title]);
}

export function useAnnouncedTitle(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => announced,
  );
}

/** Only same-site paths are accepted as a post-login destination. */
export function safeNext(next: string | null | undefined, fallback = '/home'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
