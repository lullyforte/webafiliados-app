// WebAfiliados — Service Worker v1
const CACHE_NAME = 'webafiliados-pwa-v1';

const ASSETS = [
  '/sw.js',
];

function notifyClients(msg) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    clientList.forEach((client) => client.postMessage(msg));
  });
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.hostname.includes('railway.app') || url.hostname.includes('webafliados.shop')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── Push: recebe notificação do servidor ─────────────────────────────────
// IMPORTANTE (iOS): showNotification() precisa ser a PRIMEIRA coisa a rodar
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'WebAfiliados', body: event.data ? event.data.text() : 'Nova notificação!' };
  }

  const title = data.title || 'WebAfiliados';
  const body  = data.body  || 'Você tem uma nova notificação!';

  const options = {
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: data.tag || 'webafiliados',
    data: { url: data.data?.url || '/' },
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch(() => {})
  );

  notifyClients({ type: 'push', title, body });
});

// ── Clique na notificação: abre o app ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
