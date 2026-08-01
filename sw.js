/* Rikster Service Worker – v4
   Strategie:
   - Seitenaufrufe & veränderliche Dateien (config.js, app.js, CSS …):
     erst Netz, Cache nur als Fallback → Änderungen kommen sofort an.
   - Große, unveränderliche Dateien (jsQR.js, Icons, data/): erst Cache. */
const CACHE = 'rikster-v42';
const ASSETS = [
  './',
  'index.html',
  'config.js',
  'manifest.webmanifest',
  'css/style.css',
  'js/qrcode.js',
  'js/hints.js',
  'js/app.js',
  'js/party.js',
  'js/cards.js',
  'js/jsQR.js',
  'logo.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.png'
];
/* Diese Pfade ändern sich nie – Cache-first spart Daten */
const IMMUTABLE = ['js/jsQR.js', 'js/qrcode.js', 'js/jspdf.js', 'js/font-montserrat.js', 'icons/', 'data/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      /* cache:'reload' = beim Vorab-Cachen den HTTP-Cache umgehen */
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; /* Spotify/Wikipedia nie cachen */

  /* Seitenaufrufe: erst Netz, sonst Cache */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }

  /* Unveränderliche Dateien: erst Cache, sonst Netz */
  const immutable = IMMUTABLE.some((p) => url.pathname.indexOf(p) !== -1);
  if (immutable) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  /* Alles andere (config.js, app.js, style.css …): erst Netz – immer frisch */
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
