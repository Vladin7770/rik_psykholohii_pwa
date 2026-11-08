// Change BUILD whenever an app-shell file changes.
const BUILD = '2026-11-09-learning-1';
const SCOPE = new URL(self.registration.scope);
const PREFIX = 'rik-psykholohii:' + encodeURIComponent(SCOPE.pathname) + ':shell-';
const CACHE_NAME = PREFIX + BUILD;
const SHELL = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']
  .map(path => new URL(path, SCOPE).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // A partial release must never replace the old app.
    const responses = await Promise.all(SHELL.map(async url => {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok || response.type === 'opaque') throw new Error('Incomplete app shell');
      return response;
    }));
    const cache = await caches.open(CACHE_NAME);
    try { await Promise.all(SHELL.map((url, i) => cache.put(url, responses[i]))); }
    catch (error) { await caches.delete(CACHE_NAME); throw error; }
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'APPLY_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME &&
      (key.startsWith(PREFIX) || (SCOPE.pathname === '/' &&
        ['rik-psykholohii-offline-v1', 'rik-psykholohii-offline-v2'].includes(key))))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const asset = SHELL.find(path => new URL(path).pathname === url.pathname);
  if (request.mode !== 'navigate' && !asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const saved = await cache.match(request.mode === 'navigate' ? SHELL[0] : asset);
    return saved || fetch(request);
  })());
});
