// Keeps the app's own files available when the connection is poor.
// Records are never cached here: requests to the database always go to the network.
const CACHE = "ait-fee-keeper-v1";
const SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "vendor/supabase.js",
  "manifest.webmanifest", "icons/logo-badge.png", "icons/logo-login.png", "icons/logo-watermark.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});
