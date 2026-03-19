// sw.js — Service Worker (ADP-FC v16 Studio)
const CACHE_NAME = 'artist-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './js/app.js',
  './js/store.js',
  './js/api.js',
  './js/ui.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' }))))
      .catch(() => {}) // don't fail install if fonts unavailable
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always network for Gemini API
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('fonts.g')) {
    return; // bypass
  }

  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request)
        .then(response => {
          // Cache new assets
          if (response.ok && e.request.method === 'GET') {
            caches.open(CACHE_NAME).then(c => c.put(e.request, response.clone()));
          }
          return response;
        })
      )
      .catch(() => caches.match('./index.html'))
  );
});
