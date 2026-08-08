/* Service Worker — ネットワーク優先。オンライン時は常に最新を配信し、
   オフライン時のみキャッシュから起動する。更新配布時は CACHE 名を上げること。 */
const CACHE = 'chest-app-v2';

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
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return; // 外部リソースは素通し

  // ネットワーク優先: 取得できたら最新を返しつつキャッシュを更新。
  // オフライン等で失敗したらキャッシュ、無ければ index.html を返す。
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
