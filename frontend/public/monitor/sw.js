// Monitor PWA Service Worker
// scope: /monitor/  — controls เฉพาะ /monitor/* (ไม่กระทบ /api/*, version-check, หน้าอื่น)
//
// Strategy:
// - HTML/JS/CSS หน้า monitor → network-first (fall back cache เมื่อ offline)
// - /api/public/monitor/* → network-only (data ต้อง fresh เสมอ)
// - SW จะ activate ทันทีและ claim clients

const CACHE = 'monitor-v1';
const APP_SHELL = [
  '/monitor/icon.svg',
  '/monitor/icon-192.png',
  '/monitor/icon-512.png',
  '/monitor/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API: ห้าม cache — ต้องการ data สดเสมอ
  if (url.pathname.startsWith('/api/')) {
    return; // ปล่อยให้ browser fetch ปกติ
  }

  // เฉพาะ GET requests ภายใต้ /monitor scope
  if (event.request.method !== 'GET') return;
  if (!url.pathname.startsWith('/monitor')) return;

  // Network-first, fallback cache
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // เก็บ copy ลง cache (best effort)
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r ?? new Response('Offline', { status: 503 })))
  );
});
