/* Live your life: keeps the site itself on this device so it opens without internet.
   Stored here: the page, its icons, the Firebase library files and the fonts.
   Study records are not handled here. Firebase keeps them on the device and uploads them once the internet is back.
   Login and database traffic always goes straight to the network. */
const VERSION = 'v1';
const SHELL = 'lyl-shell-' + VERSION;   // the page and icons
const LIB = 'lyl-lib';                  // Firebase files (their URLs carry the version, so they never change)
const FONT = 'lyl-font';                // Google Fonts
const KEEP = [SHELL, LIB, FONT];
const SDK_BASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
const SDK = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js', 'firebase-database.js'].map((f) => SDK_BASE + f);
const SCOPE = self.registration.scope;  // e.g. https://wkdal2873.github.io/Live-your-life/
const PAGE = SCOPE;                     // every page visit is answered with this one page
const ASSETS = ['manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].map((f) => SCOPE + f);
const PAGE_WAIT_MS = 3500;              // on a slow connection, show the saved page after this long

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.add(new Request(PAGE, { cache: 'reload' }));
    await Promise.all(ASSETS.map((u) => shell.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    const lib = await caches.open(LIB);
    await Promise.all(SDK.map(async (u) => { if (!(await lib.match(u))) await lib.add(new Request(u, { mode: 'cors' })); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.indexOf('lyl-') === 0 && KEEP.indexOf(k) === -1) await caches.delete(k);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { if (req.url.indexOf(SCOPE) === 0) e.respondWith(page(e)); return; }
  if (req.url.indexOf(SCOPE) === 0) { e.respondWith(fresh(e, SHELL)); return; }
  if (req.url.indexOf('https://www.gstatic.com/firebasejs/') === 0) { e.respondWith(stored(e, LIB, 40)); return; }
  if (url.hostname === 'fonts.gstatic.com') { e.respondWith(stored(e, FONT, 160)); return; }
  if (url.hostname === 'fonts.googleapis.com') { e.respondWith(fresh(e, FONT)); return; }
  // anything else (Firebase login, Firestore, Realtime Database) is left to the network
});

const isHtml = (res) => (res.headers.get('content-type') || '').indexOf('text/html') !== -1;

/* The page: newest copy from the network, the saved copy when offline or slow. */
async function page(e) {
  const cache = await caches.open(SHELL);
  const saved = await cache.match(PAGE);
  const net = Promise.resolve(e.preloadResponse)
    .then((r) => r || fetch(e.request))
    .then((res) => {
      if (res.ok && res.type === 'basic' && isHtml(res)) e.waitUntil(cache.put(PAGE, res.clone()));
      if (!res.ok && res.type !== 'opaqueredirect' && saved) return saved;
      return res;
    });
  if (!saved) return net;
  const slow = new Promise((resolve) => setTimeout(() => resolve(saved), PAGE_WAIT_MS));
  return Promise.race([net.catch(() => saved), slow]);
}

/* Saved copy right away, refreshed in the background for next time. */
async function fresh(e, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(e.request);
  const net = fetch(e.request).then((res) => {
    if (res.ok || res.type === 'opaque') e.waitUntil(cache.put(e.request, res.clone()));
    return res;
  });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net;
}

/* Files that never change: saved copy if there is one, otherwise download once and keep. */
async function stored(e, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(e.request);
  if (hit) return hit;
  const res = await fetch(e.request);
  if (res.ok || res.type === 'opaque') e.waitUntil(cache.put(e.request, res.clone()).then(() => trim(cache, max)));
  return res;
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
