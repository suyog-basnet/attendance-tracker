// Service worker: shows push notifications, and caches the app shell so
// the page still loads (even if briefly with stale schedule data) when the
// backend or network is unreachable. API calls (to the backend) are always
// left untouched — only the page shell itself is cached.

const SHELL_CACHE = 'ku-tracker-shell-v1';
const SHELL_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.add(SHELL_URL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle top-level page navigations; never intercept API calls,
  // so the backend is always hit fresh and never served stale from cache.
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(SHELL_URL).then((cached) => cached || Response.error())
    )
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'KU Tracker', body: '' };
  try {
    data = event.data.json();
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'KU Tracker', {
      body: data.body || '',
      icon: '/icon-192.png',
      tag: data.tag || 'ku-tracker',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
