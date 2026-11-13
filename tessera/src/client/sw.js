/* Tessera service worker. Built by the plugin in vite.config.ts, which fills in
 * the version and the list of files to precache. Plain JavaScript on purpose:
 * it runs in a worker, outside the app bundle. */
/* eslint-disable no-restricted-globals */

const VERSION = '__BUILD_VERSION__';
const PRECACHE = '__PRECACHE_MANIFEST__';

const SHELL = '/shell';
const STATIC_CACHE = `tessera-static-${VERSION}`;
const RUNTIME_CACHE = 'tessera-runtime';
/** API answers the user has seen recently, so opened sets work offline. */
const API_CACHE = 'tessera-api';
/** Sets downloaded on purpose (premium): never trimmed. */
const OFFLINE_CACHE = 'tessera-offline';
const MEDIA_CACHE = 'tessera-media';
const API_CACHE_LIMIT = 300;
const MEDIA_CACHE_LIMIT = 400;
const USER_CACHES = [API_CACHE, OFFLINE_CACHE, MEDIA_CACHE];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll([SHELL, ...PRECACHE]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('tessera-static-') && n !== STATIC_CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  // Keys come back in insertion order: drop the oldest.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((k) => cache.delete(k)));
}

async function networkFirstApi(request) {
  try {
    const response = await fetch(request);
    if (response.ok && (response.headers.get('content-type') || '').includes('application/json')) {
      const copy = response.clone();
      const pinned = response.clone();
      caches
        .open(API_CACHE)
        .then((cache) => cache.put(request, copy))
        .then(() => trim(API_CACHE, API_CACHE_LIMIT))
        .catch(() => {});
      // Keep a downloaded set's offline copy as fresh as what was last seen.
      caches
        .open(OFFLINE_CACHE)
        .then(async (cache) => ((await cache.match(request)) ? cache.put(request, pinned) : undefined))
        .catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = (await caches.match(request, { cacheName: API_CACHE })) || (await caches.match(request, { cacheName: OFFLINE_CACHE }));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName, limit) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.status === 200) {
    const copy = response.clone();
    caches
      .open(cacheName)
      .then((cache) => cache.put(request, copy))
      .then(() => (limit ? trim(cacheName, limit) : undefined))
      .catch(() => {});
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.status === 200) {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    })
    .catch((error) => {
      if (cached) return cached;
      throw error;
    });
  return cached || fresh;
}

async function navigate(request) {
  try {
    return await fetch(request);
  } catch (error) {
    // Offline: the app shell renders the route from cached data.
    const shell = await caches.match(SHELL);
    if (shell) return shell;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/api/auth/') || url.pathname === '/api/health') return;
    if (url.pathname.startsWith('/api/media/')) {
      // Uploads never change, so a cached copy is always right. Partial
      // (range) requests for audio go to the network.
      if (request.headers.has('range')) return;
      event.respondWith(cacheFirst(request, MEDIA_CACHE, MEDIA_CACHE_LIMIT));
      return;
    }
    event.respondWith(networkFirstApi(request));
    return;
  }
  // Built files are content-hashed, so a cached copy never goes stale.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'clear-user-data') {
    event.waitUntil(Promise.all(USER_CACHES.map((name) => caches.delete(name))));
  }
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Tessera', body: '', url: '/review' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url },
      tag: 'tessera-reminder',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/home', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      if (windows[0] && 'navigate' in windows[0]) {
        await windows[0].navigate(target);
        return windows[0].focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
