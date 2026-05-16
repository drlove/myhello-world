const CACHE = 'bp-tracker-v1';
const PRECACHE = [
  './', './index.html', './app.js', './db.js', './fhir.js', './style.css', './manifest.json', './icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok && event.request.method === 'GET') caches.open(CACHE).then(c => c.put(event.request, res.clone()));
        return res;
      });
    }).catch(() => { if (event.request.mode === 'navigate') return caches.match('./index.html'); })
  );
});
