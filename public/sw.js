/* Chalkvault service worker: caches the app shell so the workspace opens offline.
   Firestore and Google traffic is never cached (those requests are left to the network). */
const CACHE = 'chalkvault-shell-v1';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle our own origin. Firestore and Google APIs are cross-origin, so they
  // fall through to the network untouched and are never cached.
  if (url.origin !== self.location.origin) return;

  // Belt and braces: never cache Firestore/Google endpoints even if same-origin proxied.
  if (/firestore|googleapis|gstatic|firebaseio|recaptcha|identitytoolkit/i.test(url.href)) return;

  // Navigations: network first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./'))),
    );
    return;
  }

  // Built assets: cache first, then network.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
