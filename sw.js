/* ROOKORI_SW_BUILD */
const scope = new URL(self.registration.scope);
const prefix = `rookori-shell:${scope.pathname}:`;
const shell = scope.href;
const assetUrls = new Set(build.assets.map(asset => new URL(asset, scope).href));
const cacheName = prefix + build.version;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      await cache.addAll([...assetUrls].map(url => new Request(url, { cache: 'reload', redirect: 'error' })));
    } catch { /* Install the network-first worker even if offline setup fails. */ }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
    } catch { /* Cache Storage may be unavailable. Online requests still work. */ }
    await self.clients.claim();
  })());
});

async function cachedResponse(url) {
  try {
    const response = await (await caches.open(cacheName)).match(url);
    // Navigation requests use redirect: manual. A response fetched by
    // following a redirect cannot be returned to such a request.
    if (response?.ok && !response.redirected) return response;
  } catch { /* Let the caller use the network or an offline message. */ }
}

async function navigate(request) {
  try {
    return await fetch(request);
  } catch {
    return await cachedResponse(shell) ?? new Response(
      'Rookoriを開けませんでした。ネット接続を確認してから、もう一度開いてください。',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;
  if (request.mode === 'navigate') {
    if (url.pathname === scope.pathname) event.respondWith(navigate(request));
    // Let the browser handle redirects from /index.html and other aliases.
    return;
  }
  if (url.href !== shell && assetUrls.has(url.href)) {
    event.respondWith(cachedResponse(url.href).then(response => response ?? fetch(request)));
  }
});
