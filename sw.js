// Bump this on any release where you want to be extra sure old clients drop
// their cache — not strictly required anymore (see fetch handler below),
// but harmless to bump occasionally.
const CACHE_VERSION = 'v2';
const CACHE_NAME = 'transworld-cache-' + CACHE_VERSION;

// Only genuinely static, rarely-changing assets are pre-cached here.
// index.html is deliberately NOT in this list — see the fetch handler:
// it's always fetched fresh from the network first, so a redeploy is live
// on the very next load instead of waiting on a cache/version bump.
const STATIC_ASSETS = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Lets index.html tell a waiting service worker to take over immediately
// (instead of waiting for every open tab to close) — this is what makes
// the in-app "Update available" banner's button actually do something.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Page loads (the app shell itself) — network-first. Always try to get
  // the latest index.html; only fall back to whatever was last cached if
  // the device is genuinely offline. This is the fix for "I redeployed and
  // reloaded but still see the old version" — a cache-first strategy here
  // was serving the very first cached copy forever, regardless of deploys.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Everything else (icons, manifest) — cache-first is fine, these rarely
  // change and it keeps the app shell usable offline.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
