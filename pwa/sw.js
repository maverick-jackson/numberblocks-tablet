// Offline cache. Core files are cached at install; assets are cached in the
// background so the first launch is not slowed down.
const VERSION = '__VERSION__';
const CACHE = 'nbgen-' + VERSION;
const CORE = ['./', 'index.html', 'script.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const ASSETS = __ASSETS__;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
    const cache = await caches.open(CACHE);
    for (let i = 0; i < ASSETS.length; i += 16) {
      await Promise.all(ASSETS.slice(i, i + 16).map(async url => {
        if (!(await cache.match(url))) { try { await cache.add(url); } catch (e) {} }
      }));
    }
  })());
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
