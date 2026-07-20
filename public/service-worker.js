// WellnessHub Service Worker
// Provides an installable, offline-capable app shell for the mobile web app.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `wellnesshub-shell-${CACHE_VERSION}`;

// Core "app shell" assets needed to load the UI without a network connection.
// Only static, same-origin files go here — API calls are always network-first.
const APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/css/style.css',
  '/css/login.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: pre-cache the app shell.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old cache versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('wellnesshub-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - API calls (/api/...): always network, never cached (data must stay fresh).
// - Everything else (app shell, static assets): cache-first, falling back to network,
//   and updating the cache in the background (stale-while-revalidate).
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API/data requests.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'You appear to be offline. Please reconnect and try again.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Only handle same-origin requests with the cache strategy below.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cached || caches.match('/index.html'));

      return cached || networkFetch;
    })
  );
});
  
self.addEventListener('message', (event) => { if (event.data && event.data.type === 'TRIGGER_REMINDER') { self.registration.showNotification('WellnessHub Reminder', { body: event.data.text, icon: '/icons/icon-192.png', vibrate: [200, 100, 200], requireInteraction: true }); } }); 
  
self.addEventListener('message', (event) => { if (event.data && event.data.type === 'TRIGGER_REMINDER') { self.registration.showNotification('WellnessHub Reminder', { body: event.data.text, icon: '/icons/icon-192.png', vibrate: [200, 100, 200], requireInteraction: true }); } }); 
