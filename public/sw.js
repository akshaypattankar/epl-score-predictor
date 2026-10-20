// Service Worker for EPL Score Predictor
const SW_VERSION = 'v1.0.1';
const STATIC_CACHE_NAME = `epl-predictor-static-${SW_VERSION}`;
const DYNAMIC_CACHE_NAME = `epl-predictor-dynamic-${SW_VERSION}`;
const API_CACHE_NAME = `epl-predictor-api-${SW_VERSION}`;

// Pre-cached core application shell resources
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.ico',
  '/assets/pl-logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
];

// Install Event - Pre-cache App Shell with resilience
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled(
          PRECACHE_ASSETS.map((url) =>
            fetch(url).then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
              return cache.put(url, res);
            }).catch((err) => {
              console.warn('[ServiceWorker] Precaching notice for:', url, err.message);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - Clean old caches & claim clients
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME, API_CACHE_NAME];
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (!currentCaches.includes(name)) {
              console.log('[ServiceWorker] Deleting old cache:', name);
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Event - Dynamic caching & Offline fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP(S) requests (browser extensions, etc.)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 1. Navigation requests (HTML document) -> Network First with App Shell cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, clone);
              cache.put('/index.html', response.clone());
              cache.put('/', response.clone());
            });
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request) ||
                         await caches.match('/index.html') ||
                         await caches.match('/');
          if (cached) return cached;
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Offline - EPL Predictor</title>' +
            '<style>body{background:#0d0f17;color:#fff;font-family:sans-serif;text-align:center;padding:50px;}</style></head>' +
            '<body><h1>⚡ You are offline</h1><p>Please check your internet connection.</p>' +
            '<button onclick="location.reload()" style="padding:10px 20px;border-radius:8px;background:#37003c;color:#fff;border:none;cursor:pointer;">Retry</button></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // 2. API requests (/api/...)
  if (url.pathname.startsWith('/api/')) {
    // Non-GET requests (mutations: predict, login, update rules, etc.) -> Network Only
    if (request.method !== 'GET') {
      event.respondWith(
        fetch(request).catch(() => {
          return new Response(
            JSON.stringify({
              error: 'You are currently offline. Changes cannot be saved until internet connectivity is restored.',
              offline: true,
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
            }
          );
        })
      );
      return;
    }

    // GET requests -> Network-First with API Cache Fallback
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }
          return new Response(
            JSON.stringify({
              error: 'Data unavailable offline',
              offline: true,
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
            }
          );
        })
    );
    return;
  }

  // 3. Static Assets (CSS, JS, Fonts, Images, Audio, SVG, WebManifest)
  // Cache First, falling back to network, and revalidating
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached immediately; optionally revalidate in background if online
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const clone = networkResponse.clone();
          const targetCache = url.origin === self.location.origin ? STATIC_CACHE_NAME : DYNAMIC_CACHE_NAME;
          caches.open(targetCache).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      });
    })
  );
});

// Message listener for manual skip waiting or updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
