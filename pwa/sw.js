// Offline cache. Small core files are cached at install. project.zip (the game
// data, about 25 MB) is cached once the page says the game has started, so it
// is not downloaded twice during the first load (it comes from the HTTP cache).
const VERSION = '__VERSION__';
const CACHE = 'nbgen-' + VERSION;
const CORE = ['./', 'index.html', 'script.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data !== 'cache-project') return;
  event.waitUntil(caches.open(CACHE).then(async c => { if (!(await c.match('project.zip'))) await c.add('project.zip'); }));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(event.request);
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  })());
});
