/* Rocky's Retreat and Rambles — Service Worker
 *
 * Strategies:
 *   - App shell: cache-first, revalidate in background (stale-while-revalidate)
 *   - HTML navigations: network-first, falls back to cached page, then /offline.html
 *   - Static assets (_next/static, images): cache-first
 *   - Supabase API: network-only (auth/RLS must hit the network to be safe)
 *   - Failed POST/PATCH/DELETE to `/sync-queue` endpoints: queued in IndexedDB
 *     and retried via Background Sync when online.
 */

const SW_VERSION = 'rockys-v2';
const SHELL_CACHE  = `rockys-shell-${SW_VERSION}`;
const STATIC_CACHE = `rockys-static-${SW_VERSION}`;
const PAGE_CACHE   = `rockys-pages-${SW_VERSION}`;

const SHELL_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/rocky-hero.jpg',
  '/rocky-square.jpg',
  '/styles.css',
];

// ------- Install: precache shell -------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

// ------- Activate: wipe old versions -------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => {
          if (!name.endsWith(SW_VERSION)) return caches.delete(name);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ------- Fetch handler -------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never cache non-GET
  if (req.method !== 'GET') return;

  // Never intercept Supabase / analytics / different origins (except images)
  if (url.origin !== self.location.origin) {
    // Allow cross-origin image caching (Supabase storage dog photos)
    if (req.destination === 'image') {
      event.respondWith(cacheFirst(req, STATIC_CACHE));
    }
    return;
  }

  // HTML navigations → network-first, fall back to cache, then offline page
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirstPage(req));
    return;
  }

  // Next.js static assets → cache-first
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/_next/image')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Other same-origin static files
  if (/\.(css|js|woff2?|ttf|otf|eot|png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    // Background refresh (stale-while-revalidate lite)
    fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return cached || new Response('', { status: 504 });
  }
}

async function networkFirstPage(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(PAGE_CACHE);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cache = await caches.open(PAGE_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    const shell = await caches.open(SHELL_CACHE);
    return (await shell.match('/offline.html')) || new Response('Offline', { status: 503 });
  }
}

// ------- Background sync: drain queued writes -------
self.addEventListener('sync', (event) => {
  if (event.tag === 'rockys-queue') {
    event.waitUntil(drainQueue());
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'rockys:drain-queue') {
    event.waitUntil(drainQueue());
  }
});

async function drainQueue() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  // Delegate drainage to the app shell (has auth context + supabase client).
  // The SW just nudges any open tab to run its offline-queue.ts drain routine.
  for (const client of clients) client.postMessage({ type: 'rockys:drain-queue' });
}

// ------- Push notifications -------
self.addEventListener('push', (event) => {
  let data = { title: "Rocky's Retreat", body: 'You have a new update', url: '/' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/rocky-square.jpg',
      badge: '/rocky-square.jpg',
      data: { url: data.url || '/' },
      tag: data.tag || 'rockys-default',
      renotify: false,
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) {
        if (c.url.includes(url)) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
