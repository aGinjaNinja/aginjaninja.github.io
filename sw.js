const CACHE_NAME = 'netrack-v3';

const ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/devices.html',
  '/racks.html',
  '/ports.html',
  '/photos.html',
  '/cableruns.html',
  '/checklist.html',
  '/flowchart.html',
  '/log.html',
  '/scan.html',
  '/settings.html',
  '/sitemap.html',
  '/fieldmode.html',
  '/css/styles.css',
  '/js/core.js',
  '/js/layout.js',
  '/js/gdrive.js',
  '/js/projects.js',
  '/js/dashboard.js',
  '/js/devices.js',
  '/js/racks.js',
  '/js/ports.js',
  '/js/photos.js',
  '/js/cableruns.js',
  '/js/checklist.js',
  '/js/flowchart.js',
  '/js/log.js',
  '/js/scan.js',
  '/js/settings.js',
  '/js/sitemap.js',
  '/js/fieldmode.js',
  '/js/timelog.js',
  '/js/vendors.js',
  '/js/print.js',
  '/img/logo.jpg',
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
    // Network-first: always try fresh copy, fall back to cache offline
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
    // Cache-first for images, manifest, etc.
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
