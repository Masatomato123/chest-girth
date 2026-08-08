/* Service Worker — アプリ本体をキャッシュしてオフラインでも起動できるようにする */
const CACHE = 'chest-app-v1';

// 相対パス（GitHub Pages のサブディレクトリ配信に対応）
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/standards.js',
  './js/store.js',
  './js/app.js',
  './lib/chart.umd.min.js',
  './lib/oswald-500.woff2',
  './lib/oswald-600.woff2',
  './manifest.webmanifest',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // キャッシュ優先。無ければネットワーク、取得できたら追加キャッシュ。
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // 同一オリジンのみキャッシュ
        try {
          const url = new URL(req.url);
          if (url.origin === self.location.origin && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
        } catch (_) {}
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
