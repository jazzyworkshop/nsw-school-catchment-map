/* eslint-env serviceworker */
/* global self, clients */

/* 
  NSW School Map Service Worker 
  Strategy: Network-First + Tile Bypass
*/

const CACHE_NAME = "school-map-v2";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/site.webmanifest",
  "/favicon.ico",
  "/logo.png",
];

// 1. Install & Immediate Takeover
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

// 2. Cleanup & Claim
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // "clients" is a global specifically for Service Workers
      await clients.claim();
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        }),
      );
    })(),
  );
});

// 3. Fetch Strategy
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Bypass for Map Tiles and Search to prevent CSP/Opaque response errors
  if (url.includes("tile.openstreetmap.org") || url.includes("nominatim")) {
    return;
  }

  if (event.request.method !== "GET" || !url.startsWith("http")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse.ok && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
      }),
  );
});
