const CACHE_NAME = "school-lens-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/catchments.json", // Cache your large data file for offline use
  "/favicon.ico",
];

// Install Service Worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

// Intercept requests to serve from cache
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }),
  );
});
