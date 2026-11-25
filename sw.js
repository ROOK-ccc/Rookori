/* ROOKORI_SW_BUILD */
const scope = new URL(self.registration.scope);
const prefix = `rookori-shell:${scope.pathname}:`;
const shell = new URL('index.html', scope).href;
const assetUrls = new Set(build.assets.map(asset => new URL(asset, scope).href));
const cacheName = prefix + build.version;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(
    [...assetUrls].map(url => new Request(url, { cache: 'reload' })),
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;
  const entry = request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === new URL(shell).pathname);
  if (!entry && !assetUrls.has(url.href)) return;
  // Serve one coherent release while an update waits. Hash routes and query
  // strings stay in the address and remain available to the existing router.
  event.respondWith(caches.open(cacheName).then(async cache =>
    await cache.match(entry ? shell : url.href) || fetch(request)));
});
