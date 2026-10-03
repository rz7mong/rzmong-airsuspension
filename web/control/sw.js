/* Service worker sederhana: cache-first untuk aset kontroler supaya bisa dibuka offline. */
const CACHE = "rzm-control-v9";
const ASSETS = ["./", "./index.html", "./control.css", "./app.js", "./theme.css", "./theme.js", "./cars-pixel.js", "./cars.js", "./remote.js", "./dash.js", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // Network-first agar update cepat terlihat, fallback ke cache saat offline.
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
