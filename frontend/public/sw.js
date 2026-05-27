const STATIC_CACHE = "gymtracker-static-v1";
const API_CACHE = "gymtracker-api-v1";

// App shell: HTML + Next.js assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then((c) => c.addAll(["/", "/dashboard", "/workouts", "/exercises", "/progress"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API calls (backend port 8000) → network-first, NO cache for mutations
  if (url.port === "8000" || url.pathname.startsWith("/api/")) {
    if (e.request.method !== "GET") return; // POST/PUT/DELETE: bypass SW
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Next.js JS/CSS chunks → cache-first (immutable, versioned filenames)
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(e.request).then(
        (cached) => cached ||
          fetch(e.request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(e.request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // HTML pages → network-first, fall back to cache for offline
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
