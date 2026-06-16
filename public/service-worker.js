const CACHE_NAME = 'labs-eln-v5';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/entry-renderer.js', '/timezone.js', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('labs-eln-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) return;

  const requestUrl = new URL(event.request.url);
  const fallbackKey = event.request.mode === 'navigate' ? '/index.html' : requestUrl.pathname;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(fallbackKey, clone));
        return response;
      })
      .catch(() => caches.match(fallbackKey).then((cached) => cached || caches.match('/index.html')))
  );
});
