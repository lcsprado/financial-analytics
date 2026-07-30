const CACHE_VERSION = "financial-analytics-v1-20260730";
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL = [
  "/",
  "/importar",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png"
];

function cacheable(url) {
  return url.origin === self.location.origin
    && !url.pathname.startsWith("/api/")
    && !url.pathname.startsWith("/_next/webpack-hmr");
}

async function cachePageAndAssets(cache, path) {
  const response = await fetch(path, { cache: "reload" });
  if (!response.ok) throw new Error(`Falha ao preparar ${path}`);
  await cache.put(path, response.clone());
  const html = await response.text();
  const assets = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter(cacheable)
    .map((url) => url.pathname);
  await Promise.allSettled(assets.map(async (asset) => {
    const assetResponse = await fetch(asset, { cache: "reload" });
    if (assetResponse.ok) await cache.put(asset, assetResponse);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.allSettled(APP_SHELL.map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (response.ok) await cache.put(path, response);
    }));
    await Promise.all([cachePageAndAssets(cache, "/"), cachePageAndAssets(cache, "/importar")]);
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name !== APP_CACHE && name !== RUNTIME_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("authorization")) return;
  const url = new URL(request.url);
  if (!cacheable(url)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(APP_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request))
          || (await caches.match(url.pathname))
          || (await caches.match("/"));
      }
    })());
    return;
  }

  if (["script", "style", "font", "image", "worker"].includes(request.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })());
  }
});
