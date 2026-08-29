/* eslint-disable no-undef */
// Firebase Cloud Messaging service worker for the OutReign PWA.
// Config arrives via the query string because a service worker cannot read
// import.meta.env. Registered from src/lib/fcm.ts.
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp(Object.fromEntries(new URL(self.location).searchParams));
const messaging = firebase.messaging();

// Data-only messages (the ones this app sends) do not auto-display, so render
// them here.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const notification = payload.notification || {};
  const title = notification.title || data.title || 'OutReign';
  self.registration.showNotification(title, {
    body: notification.body || data.body || '',
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/dashboard' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      try {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        }
      } catch (_e) { /* ignore */ }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
