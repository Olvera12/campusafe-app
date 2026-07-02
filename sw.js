const CACHE_NAME = 'campusafe-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './dashboard.html',
  './style.css',
  './dashboard.css',
  './db.js',
  './dashboard.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retorna la versión en caché si existe, o haz la petición a la red
        return response || fetch(event.request);
      })
  );
});
