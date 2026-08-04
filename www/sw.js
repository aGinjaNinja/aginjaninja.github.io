const CACHE_NAME = 'netrack-v29';

const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/core.js',
  '/js/gdrive.js',
  '/js/ui.js',
  '/js/inventory.js',
  '/js/rackports.js',
  '/js/photos.js',
  '/js/sitemap.js',
  '/js/search.js',
  '/js/report.js',
  '/img/logo.jpg',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/manifest.json',
];

// Install: cache all app shell assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for JS/HTML/CSS (always get latest code),
// cache-first for images and other static assets (fast offline)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  const isCode = url.pathname.endsWith('.js') || url.pathname.endsWith('.html') || url.pathname.endsWith('.css') || e.request.mode === 'navigate';

  if (isCode) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match(e.request).then(c => c || (e.request.mode === 'navigate' ? caches.match('/index.html') : undefined)))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return resp;
        });
      }).catch(() => undefined)
    );
  }
});
