/* Murmurations service worker — offline-first */
const VERSION = 'murmurations-v0.4.1';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest',
  'js/noise.js', 'js/core.js', 'js/audio.js', 'js/caustics.js', 'js/main.js',
  'js/scenes/starlings.js', 'js/scenes/locusts.js', 'js/scenes/fish.js', 'js/scenes/smoke.js', 'js/scenes/clouds.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'assets/bg/starlings-marsh-sunset.jpg', 'assets/bg/starlings-lake-dusk.jpg',
  'assets/bg/locusts-savanna.jpg', 'assets/bg/locusts-desert.jpg',
  'assets/bg/fish-shallows.jpg', 'assets/bg/fish-reef.jpg',
  'assets/bg/smoke-garden-day.jpg', 'assets/bg/smoke-garden-night.jpg',
  'assets/bg/clouds-fields.jpg', 'assets/bg/clouds-mountains.jpg'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.url.endsWith('.json')) { e.respondWith(fetch(req).catch(() => caches.match(req))); return; }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
