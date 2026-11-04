// UĞULTU service worker: cache-first for immutable game assets so the game
// keeps working offline after the first play; network-first for the page.
const CACHE = 'ugultu-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || req.url.endsWith('/') || req.url.endsWith('.html');
  if (isPage) {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); return r; }).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && r.status === 200) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); }
    return r;
  })));
});
