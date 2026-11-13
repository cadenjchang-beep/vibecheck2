import { api } from './api';

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Asks permission and registers this device for reminder notifications.
 * `unavailable` means the server has no push keys; `unsupported` means the browser cannot do it.
 */
export async function subscribeToPush(vapidPublicKey: string | null): Promise<'ok' | 'denied' | 'unsupported' | 'unavailable'> {
  if (!vapidPublicKey) return 'unavailable';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) }));
    const json = subscription.toJSON();
    await api('/api/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
    return 'ok';
  } catch {
    return 'unsupported';
  }
}
