const CACHE_NAME = "honeycomb-quote-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=3",
  "./app.js?v=3",
  "./experience.js?v=3",
  "./motion.css?v=3",
  "./manifest.webmanifest?v=4",
  "./icon.svg?v=2",
  "./apple-touch-icon-internal.png"
];

self.addEventListener("install", (event) => {
  const requests = APP_SHELL.map((url) => new Request(url, { cache: "reload" }));
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(requests)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("honeycomb-quote-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

