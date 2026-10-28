/* Keeps the app's own files on the device so it opens without a connection.
   Online: always fetch fresh files (so updates arrive at once) and refresh the copy.
   Offline: serve the saved copy. Data requests (/api/) are handled by the app itself. */
const CACHE = 'muhasebe-app-v1';
const SHELL = [
  './', 'index.html', 'app.css', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest',
  'js/app.js', 'js/core.js', 'js/offline.js',
  'js/views/dashboard.js', 'js/views/stock.js', 'js/views/parties.js', 'js/views/invoices.js',
  'js/views/finance.js', 'js/views/reports.js', 'js/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fromNetwork(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then((res) => { clearTimeout(timer); resolve(res); }, (err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fromNetwork(req, 5000);
      if (res.ok) cache.put(req.mode === 'navigate' ? 'index.html' : req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});
