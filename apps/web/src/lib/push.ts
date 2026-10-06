import { api } from './api';

/**
 * The VAPID public key arrives as URL-safe base64; the Push API wants the raw
 * bytes, so undo the transport encoding before subscribing.
 */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    view[i] = raw.charCodeAt(i);
  }
  return buffer;
}

/** Whether this browser can receive Web Push at all. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Requests browser permission, registers a push subscription and stores it on
 * the server. Returns `true` once the device is reachable through Web Push.
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (!pushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;

  const { publicKey } = await api.get<{ publicKey: string }>(
    '/notifications/vapid-public-key',
  );
  // The server has no VAPID keys configured, so there is nothing to subscribe
  // to; surface this as a failure instead of storing a dead subscription.
  if (!publicKey) return false;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  await api.post('/notifications/subscribe', {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });

  return true;
}
