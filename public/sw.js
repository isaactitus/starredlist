const CACHE_NAME = "taskflow-v2";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/logo192.png",
  "/logo512.png"
];

// Install Event
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache what we can, don't fail if some ASSETS aren't found
      return Promise.allSettled(
        ASSETS.map((asset) =>
          cache.add(asset).catch((err) => console.log('Asset cache failed:', asset, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Stale While Revalidate / Cache First fallback
self.addEventListener("fetch", (e) => {
  // Ignore non-GET requests and external API/Firebase calls
  if (e.request.method !== "GET" || e.request.url.includes("firestore.googleapis.com") || e.request.url.includes("google.com")) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse); // fallback to cache on network failure
      
      return cachedResponse || fetchPromise;
    })
  );
});

// Handle Push Notifications Events
self.addEventListener("push", (e) => {
  const data = e.data ? e.data.json() : { title: "Taskflow Reminder" };
  const options = {
    body: data.body || "You have tasks waiting!",
    icon: "/logo192.png",
    badge: "/logo192.png",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" }
  };
  e.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle Notification Clicks
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === "/" && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
