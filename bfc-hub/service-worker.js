// BFC Administration Hub — service worker
// Caches the app shell so the (fully self-contained) app opens instantly and works offline,
// and satisfies the browser's installability requirement for a real "Install" prompt.

const CACHE_NAME = 'bfc-hub-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

// The single index.html carries the whole app (data model, UI, committee lists, etc.), so it
// changes often as the app is updated and re-pushed. Network-first here means a fresh page load
// always shows your latest push when you're online — offline/slow-network visitors still get the
// last cached copy as a fallback. Static assets that rarely change (icons, manifest) stay
// cache-first for instant loads.
const NETWORK_FIRST_PATHS = ['/', '/index.html', '/manifest.json', '/service-worker.js'];

function isNetworkFirst(url) {
  return NETWORK_FIRST_PATHS.some((p) => url.pathname.endsWith(p)) || url.pathname === new URL('./', self.registration.scope).pathname;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => { /* best-effort precache; fetch handler still works without it */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (event.request.mode === 'navigate' || isNetworkFirst(url)) {
    // Network-first: always try to get the latest push; fall back to cache only when offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stale-while-revalidate for everything else (icons, etc.) — instant from cache, refreshed
  // in the background.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
