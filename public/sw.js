const staticCache = "lifesaving-timer-static-v2";
const eventCache = "lifesaving-timer-events-v1";
const appShell = [
  "/",
  "/index.html",
  "/styles.css?v=app-icon-brand",
  "/app.js?v=app-icon-brand",
  "/icons.svg?v=participant-import",
  "/app-icon-64.png",
  "/app-icon-180.png",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(staticCache).then((cache) => cache.addAll(appShell)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== staticCache && key !== eventCache)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallbackRequest = request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackRequest);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, staticCache, "/index.html"));
    return;
  }

  if (/^\/api\/events(?:\/[^/]+)?$/.test(url.pathname)) {
    event.respondWith(networkFirst(request, eventCache));
    return;
  }

  if (appShell.includes(`${url.pathname}${url.search}`) || appShell.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then(async (response) => {
        if (response.ok) await (await caches.open(staticCache)).put(request, response.clone());
        return response;
      })),
    );
  }
});
