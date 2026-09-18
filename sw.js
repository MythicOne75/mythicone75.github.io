/**
 * The Command Center's service worker.
 *
 * It exists so the installed app opens without a server: the shell, the brand, the film and the
 * exported run are precached, and a launch out of range still renders.
 *
 * WHAT IT WILL NOT CACHE, AND WHY THAT MATTERS
 * ============================================
 * Nothing on the command service. A cached `/api/status` would let the interface report a
 * containment the registry no longer holds — the interface claiming a security state the
 * backend has not confirmed, which is the one thing this product may never do. Those requests
 * go to the network or they fail, and a failure renders as "not answering" rather than as a
 * stale success.
 *
 * `snapshot.json` is network-first: the freshest export wins, and the cache is the fallback so
 * an offline launch shows the last run rather than an error. It is an EXPORT either way, and
 * the interface already labels it as one.
 */
const VERSION = 'genghis-5e52115d7391';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;

/** The launch path. Hashed build assets are picked up on first fetch rather than listed here. */
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/brand/genghis-lockup.webp',
  '/brand/genghis-emblem.webp',
  '/brand/genghis-wordmark.webp',
  '/brand/genghis-intro.mp4',
  '/brand/genghis-intro-poster.webp',
  '/brand/icon-192.png',
  '/brand/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      // One failure must not fail the whole install, or a single 404 leaves the app uninstalled.
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // The command service is never cached — see the header. Same-origin only below, so a
  // cross-origin API call falls through to the network untouched anyway; this is explicit
  // because "it happens to fall through" is not a property anybody can check.
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/snapshot.json')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(DATA).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Everything else: cache first, and fill the cache as it is used. A navigation that misses
  // falls back to the shell, because a single-page app has one document.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        void caches.open(SHELL).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('/') : Response.error()))),
  );
});
