/* eslint-disable no-restricted-globals */
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

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
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

// 3. Updated Fetch Strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // A. CRITICAL DEVELOPER BYPASS: Don't let SW interfere with Vite development tools
  if (
    url.hostname === "localhost" &&
    (url.pathname.includes("@vite") || url.pathname.includes("node_modules"))
  ) {
    return;
  }

  // B. THIRD-PARTY MAP API BYPASS: Prevent opaque/CSP routing blocks
  if (
    url.hostname.includes("tile.openstreetmap.org") ||
    url.hostname.includes("nominatim")
  ) {
    return;
  }

  // C. Method and Protocol Guard
  if (event.request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // D. ROUTING FIX: Handle client-side routing safely (e.g., navigate("/"))
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If offline or network fails during client routing, ALWAYS drop back to index.html safely
        return caches.match("/index.html") || caches.match("./index.html");
      }),
    );
    return;
  }

  // E. Standard Assets (CSS, JS, Images, Data Blobs)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Only cache valid, non-error, local origin assets
        if (networkResponse.ok && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache asset if offline
        return caches.match(event.request);
      }),
  );
});
