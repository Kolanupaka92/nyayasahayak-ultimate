// ============================================
// sw.js — NyayaSahayak Service Worker
// Offline-first: precache the app shell, serve cache-first
// for local assets, network-first for everything else.
// ============================================
const CACHE = 'nyayasahayak-v8';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/districts-data.js',
  './js/legal-data.js',
  './js/storage.js',
  './js/ai-engine.js',
  './js/ecourts-api.js',
  './js/encryption.js',
  './js/geolocation.js',
  './js/ivr.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Cache-first for our own app shell/assets.
    e.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html')))
    );
  } else {
    // Network-first for cross-origin (fonts, gov portals) with cache fallback.
    e.respondWith(
      fetch(request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(request))
    );
  }
});
