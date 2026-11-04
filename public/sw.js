// UĞULTU service worker: cache-first for game assets so the game keeps working
// offline after the first play; network-first for the page.
// CACHE is rewritten at build time with a content hash of the build (see
// vite.config.ts), so every new deploy drops the previous build's assets.
const CACHE = 'ugultu-dev';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Safari streams <audio> with Range requests and needs real 206 answers
  if (req.headers.has('range')) return;
  const isPage = req.mode === 'navigate' || req.url.endsWith('/') || req.url.endsWith('.html');
  if (isPage) {
    // revalidate past the HTTP cache (static hosts send max-age) so a new deploy shows up at once
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((r) => {
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); }
      return r;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req, { cache: 'no-cache' }).then((r) => {
    if (r.ok && r.status === 200) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); }
    return r;
  })));
});
