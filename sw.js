// Keeps the app shell available offline. Calls to Supabase are never cached.
const CACHE = 'pto-tracker-v7';
const SHELL = ['./', './index.html', './app.js', './app.css', './config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => fetch(new Request(u, { cache: 'reload' })).then((r) => r.ok && c.put(u, r)).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  const cacheable = url.origin === location.origin || /(^|\.)jsdelivr\.net$|(^|\.)googleapis\.com$|(^|\.)gstatic\.com$/.test(url.hostname);
  if (!cacheable) return;

  if (url.origin === location.origin) {
    // Our own files: always try the network first so updates show up right away.
    e.respondWith(
      caches.open(CACHE).then((cache) =>
        fetch(new Request(req, { cache: 'no-cache' }))
          .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => cache.match(req))
      )
    );
    return;
  }

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
