/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

// Drop precache entries that belong to superseded deployments.
cleanupOutdatedCaches();

// Replaced at build time by vite-plugin-pwa with the asset manifest.
precacheAndRoute(self.__WB_MANIFEST);

// Media downloads are immutable (content-addressed, presigned), so serving them
// from cache for a week is safe and keeps attachments instant offline.
registerRoute(
  ({ url }) => /\/api\/v1\/media\/download\//.test(url.pathname),
  new CacheFirst({
    cacheName: 'media-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
    ],
  }),
);

interface PushPayload {
  title?: string;
  body?: string;
  data?: { chatId?: string; type?: string };
}

// Web Push: show a system notification for a message received while the tab is
// closed or in the background.
self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    payload = { body: event.data?.text() ?? '' };
  }

  const title = payload.title || 'FLUX';
  const chatId = payload.data?.chatId;
  const options: NotificationOptions = {
    body: payload.body ?? '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: payload.data ?? {},
    // Reuse one notification per chat instead of stacking every message.
    tag: chatId ? `chat-${chatId}` : undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking a notification focuses an open tab (navigating it to the chat) or
// opens a new one.
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const chatId = (event.notification.data as { chatId?: string } | undefined)?.chatId;
  const target = chatId ? `/chats/${chatId}` : '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            void client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
