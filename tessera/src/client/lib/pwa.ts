import type { SetDetail } from '@shared/api';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from './i18n';
import { reportClientError } from './report';

/** Must match the cache names in sw.js. */
const API_CACHE = 'tessera-api';
const OFFLINE_CACHE = 'tessera-offline';
const MEDIA_CACHE = 'tessera-media';
const OWNER_KEY = 'tessera:cache-owner';
const DOWNLOADS_KEY = 'tessera:offline-sets';
const UPDATE_EVENT = 'tessera:update-ready';

const hasCaches = () => typeof caches !== 'undefined';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // A page that was already controlled is running the previous version once a new worker takes over.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.dispatchEvent(new Event(UPDATE_EVENT));
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => reportClientError(error, 'service-worker'));
  });
}

/** Offers a reload when a new version has been installed in the background. */
export function useUpdateNotice(): void {
  const { t } = useI18n();
  useEffect(() => {
    const show = () =>
      toast(t('common.updateReady'), { duration: Infinity, action: { label: t('common.reload'), onClick: () => window.location.reload() } });
    window.addEventListener(UPDATE_EVENT, show);
    return () => window.removeEventListener(UPDATE_EVENT, show);
  }, [t]);
}

/** Removes everything cached for the signed-in person (API answers, uploads, downloads). */
export async function clearUserCaches(): Promise<void> {
  try {
    localStorage.removeItem(DOWNLOADS_KEY);
  } catch {
    /* storage unavailable */
  }
  navigator.serviceWorker?.controller?.postMessage({ type: 'clear-user-data' });
  if (hasCaches()) await Promise.all([API_CACHE, OFFLINE_CACHE, MEDIA_CACHE].map((name) => caches.delete(name)));
}

/**
 * Cached answers belong to one account. When someone else signs in on this
 * device, or the owner signs out, they are cleared.
 */
export function syncCacheOwner(userId: string | null): void {
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(OWNER_KEY);
    if (userId) localStorage.setItem(OWNER_KEY, userId);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    return;
  }
  if (previous && previous !== userId) void clearUserCaches();
}

function readDownloads(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DOWNLOADS_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function writeDownloads(ids: string[]): void {
  try {
    localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(DOWNLOADS_KEY));
}

export function useIsDownloaded(setId: string): boolean {
  const [downloaded, setDownloaded] = useState(() => readDownloads().includes(setId));
  useEffect(() => {
    const update = () => setDownloaded(readDownloads().includes(setId));
    window.addEventListener(DOWNLOADS_KEY, update);
    return () => window.removeEventListener(DOWNLOADS_KEY, update);
  }, [setId]);
  return downloaded;
}

function setUrls(set: SetDetail): string[] {
  const media = set.cards.flatMap((card) => [card.termImage, card.definitionImage, card.termAudio, card.definitionAudio]);
  return [`/api/sets/${set.id}`, ...media.filter((m): m is NonNullable<typeof m> => m !== null).map((m) => m.url)];
}

/** Saves a set and all of its images and audio for use without a connection. */
export async function downloadSet(set: SetDetail): Promise<void> {
  if (!hasCaches()) throw new Error('offline storage unavailable');
  const cache = await caches.open(OFFLINE_CACHE);
  for (const url of setUrls(set)) {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`could not download ${url}`);
    await cache.put(url, response);
  }
  writeDownloads([...new Set([...readDownloads(), set.id])]);
}

export async function removeDownload(set: SetDetail): Promise<void> {
  if (hasCaches()) {
    const cache = await caches.open(OFFLINE_CACHE);
    await Promise.all(setUrls(set).map((url) => cache.delete(url)));
  }
  writeDownloads(readDownloads().filter((id) => id !== set.id));
}
