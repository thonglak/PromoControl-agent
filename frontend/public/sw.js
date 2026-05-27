// PromoControl PWA Service Worker (root scope)
// scope: /  — ทำให้ทั้งแอป installable ได้บนมือถือ/เดสก์ทอป
//
// หลักการสำคัญ (สำคัญมาก — ห้ามแก้):
// - "Minimal SW": cache เฉพาะ icon/manifest เท่านั้น
// - ไม่ intercept /api/*, /version.json, HTML, JS, CSS bundles
//   เพราะระบบ banner "พบเวอร์ชันใหม่" (VersionCheckService) ต้องอ่าน version.json สดเสมอ
//   และ Angular bundle ต้อง fetch ใหม่ทุก deploy
// - หน้า /monitor/* มี SW แยก (scope=/monitor/) — browser จะใช้ตัวนั้นเอง
//
// ผลลัพธ์: Chrome/Edge/Safari/Android ขึ้น install criteria
//          แต่ทุก request ของแอปจริงยัง fetch จาก network ตามปกติ (ไม่ offline)

const CACHE = 'promo-shell-v1';
const APP_SHELL = [
  '/manifest.webmanifest',
  '/monitor/icon.svg',
  '/monitor/icon-192.png',
  '/monitor/icon-512.png',
  '/monitor/apple-touch-icon.png',
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
      Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('promo-shell-')).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // เฉพาะ GET เท่านั้น
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ปล่อยทุก request ของ /monitor/* ให้ SW อีกตัวจัดการ (scope ใกล้กว่าจะชนะ — แค่ป้องกันชัดเจน)
  if (url.pathname.startsWith('/monitor')) return;

  // ตอบจาก cache เฉพาะไฟล์ใน app shell (icons + manifest)
  // ที่เหลือทั้งหมด (HTML, JS, CSS, /api/*, /version.json) ไม่แตะ → network ปกติ
  const isAppShell = APP_SHELL.some((p) => url.pathname === p);
  if (!isAppShell) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
