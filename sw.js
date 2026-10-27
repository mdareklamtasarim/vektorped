/* VektörPad offline worker: keeps every file of the app on the iPad so it opens without internet.
   A new version of the package (a different VERSION) is downloaded in the background when online. */
const VERSION = '90b1c4370fe1';
const CACHE = 'vektorpad-' + VERSION;
const FILES = [
 "./",
 "OFL-FiraSans.txt",
 "fonts/f01.woff2",
 "fonts/f02.woff2",
 "fonts/f03.woff2",
 "fonts/f04.woff2",
 "fonts/f05.woff2",
 "fonts/f06.woff2",
 "fonts/f07.woff2",
 "fonts/f08.woff2",
 "fonts/f09.woff2",
 "fonts/f10.woff2",
 "fonts/f11.woff2",
 "fonts/f12.woff2",
 "fonts/f13.woff2",
 "fonts/f14.woff2",
 "fonts/f15.woff2",
 "fonts/f16.woff2",
 "fonts/f17.woff2",
 "fonts/f18.woff2",
 "fonts/f19.woff2",
 "fonts/f20.woff2",
 "fonts/f21.woff2",
 "fonts/f22.woff2",
 "fonts/f23.woff2",
 "fonts/f24.woff2",
 "fonts/f25.woff2",
 "fonts/f26.woff2",
 "fonts/f27.woff2",
 "fonts/f28.woff2",
 "fonts/f29.woff2",
 "fonts/f30.woff2",
 "fonts/f31.woff2",
 "fonts/f32.woff2",
 "fonts/f33.woff2",
 "fonts/f34.woff2",
 "fonts/fonts.css",
 "icons/icon-180.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "index.html",
 "lib/jspdf.umd.min.js",
 "lib/opentype.min.js",
 "lib/paper-full.min.js",
 "lib/pdfjs/pdf.min.js",
 "lib/pdfjs/pdf.worker.min.js",
 "lib/svg2pdf.umd.min.js",
 "manifest.webmanifest",
 "vp-bitmap.js",
 "vp-bmpfx.js",
 "vp-cdr.js",
 "vp-classic.js",
 "vp-cmds.js",
 "vp-core.js",
 "vp-curves.js",
 "vp-doc.js",
 "vp-docs.js",
 "vp-draw2.js",
 "vp-ecut.js",
 "vp-effects.js",
 "vp-effects2.js",
 "vp-files.js",
 "vp-fill.js",
 "vp-fillfx.js",
 "vp-font.js",
 "vp-icons.js",
 "vp-io.js",
 "vp-main.js",
 "vp-measure.js",
 "vp-objops.js",
 "vp-outline.js",
 "vp-paramedit.js",
 "vp-scripts.js",
 "vp-shape.js",
 "vp-shapes.js",
 "vp-styles.js",
 "vp-text.js",
 "vp-text2.js",
 "vp-textdock.js",
 "vp-tools.js",
 "vp-ui.js"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('vektorpad-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        // the app's start page
        if (req.mode === 'navigate') return c.match('./').then((r) => r || c.match('index.html')).then((r) => r || fetch(req));
        return fetch(req);
      })
    )
  );
});
