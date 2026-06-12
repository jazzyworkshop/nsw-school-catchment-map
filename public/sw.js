/* NSW School Map Service Worker (Optimized)
  Strategy: Cache-First for Hashed Assets + Dynamic Network Fallback
*/

const CACHE_NAME = "school-map-v3";

// Core static shell (Files that never change names)
const IMMUTABLE_SHELL = [
  "/",
  "/index.html",
  "/site.webmanifest",
  "/favicon.ico",
  "/logo.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(IMMUTABLE_SHELL))
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
        })
      );
    })()
  );
});

self.addEventListener("fetch", (event) => {
  // 1. COMPLETE LOCALHOST BYPASS
  // Completely disable service worker caching during local development
  if (self.location.hostname === "localhost") {
    return;
  }

  const url = new URL(event.request.url);

  // 2. THIRD-PARTY MAP API & GEOCENTER BYPASS
  if (
    url.hostname.includes("tile.openstreetmap.org") || 
    url.hostname.includes("nominatim")
  ) {
    return;
  }

  // 3. Method and Protocol Guard
  if (event.request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // 4. SPA ROUTING FIX (Navigate Mode)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match("/index.html") || caches.match("./index.html");
      })
    );
    return;
  }

  // 5. OPTIMIZED ASSETS STRATEGY
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // A. Cache-First: If it's a static Vite asset (compiled JS/CSS/Fonts), serve it instantly!
      // These assets have hashes, so if they exist in cache, they are guaranteed to be correct.
      if (cachedResponse && (url.pathname.includes("/assets/") || url.pathname.endsWith(".woff2"))) {
        return cachedResponse;
      }

      // B. Stale-While-Revalidate / Network-First fallback for everything else
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse.ok && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });

      // Return the cached asset immediately if we have it, otherwise wait for network
      return cachedResponse || fetchPromise;
    }).catch(() => {
      // Final desperation fallback if completely offline and un-cached
      return new Response("Offline content unavailable", { status: 503, statusText: "Offline" });
    })
  );
});