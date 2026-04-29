/* 
  NSW School Map Service Worker 
  Strategy: Network-First (Ensures latest school data and fixes 403/Cache issues)
*/

const CACHE_NAME = "school-map-v2"; // Incremented version to clear old broken caches
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/site.webmanifest",
  "/favicon.ico",
  "/logo.png",
];

// 1. Install & Immediate Takeover
self.addEventListener("install", (event) => {
  // Force this new SW to become active immediately, killing old versions
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching core assets...");
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

// 2. Cleanup Old Caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Take control of all open tabs immediately
      await clients.claim();

      // Delete any old caches that don't match CACHE_NAME
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log("Deleting old cache:", name);
            return caches.delete(name);
          }
        }),
      );
    })(),
  );
});

// 3. Network-First Strategy
self.addEventListener("fetch", (event) => {
  // We only intercept GET requests (ignore browser-internal schemes)
  if (event.request.method !== "GET" || !event.request.url.startsWith("http")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If network is successful, update the cache with the new version
        if (networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If network fails (Offline), try to serve from cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If both fail and it's a page request, you could return index.html here
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
      }),
  );
});
