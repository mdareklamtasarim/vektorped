'use strict';
// Builds the browser-only demo into a folder: the real web app (public/) plus the real
// server code (src/) bundled to run in the page on sql.js, with sample data.
//
//   npm i --no-save sql.js@1.10.3
//   node demo/build.js [output folder]       (default: demo-dist)
//
// The output is static files; open index.html through any web server.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'demo-dist'));
const sqljs = process.env.SQLJS || path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-asm.js');
if (!fs.existsSync(sqljs)) {
  console.error(`sql.js bulunamadı: ${sqljs}\nÖnce: npm i --no-save sql.js@1.10.3 (veya SQLJS=/yol/sql-asm.js)`);
  process.exit(1);
}

const MODULES = [
  'src/http.js', 'src/queries.js', 'src/db.js',
  'src/api/admin.js', 'src/api/stock.js', 'src/api/parties.js', 'src/api/invoices.js', 'src/api/finance.js', 'src/api/reports.js',
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'js', 'views'), { recursive: true });

// 1. Server modules + runtime in one classic script.
const defs = MODULES.map((m) => {
  const src = fs.readFileSync(path.join(root, m), 'utf8');
  return `${JSON.stringify(m)}: function (require, module, exports) {\n${src}\n}`;
}).join(',\n');
const runtime = fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8');
fs.writeFileSync(path.join(out, 'backend.js'), `var __MODULES__ = {\n${defs}\n};\n${runtime}`);

// 2. The web app as is (no service worker: the demo needs no server).
const copy = (from, to = from) => fs.copyFileSync(path.join(root, 'public', from), path.join(out, to));
copy('app.css');
copy('icon.svg');
for (const f of fs.readdirSync(path.join(root, 'public', 'js'))) {
  if (f.endsWith('.js')) copy(path.join('js', f));
}
for (const f of fs.readdirSync(path.join(root, 'public', 'js', 'views'))) copy(path.join('js', 'views', f));
fs.copyFileSync(sqljs, path.join(out, 'sql-asm.js'));

// 3. Page. Written without <html>/<head> so it can also be published as a hosted page.
fs.writeFileSync(path.join(out, 'index.html'), `<title>Ön Muhasebe Deneme</title>
<link rel="stylesheet" href="app.css">
<style>
body { padding-bottom: 64px; }
.demo-tag {
  position: fixed; left: 50%; transform: translateX(-50%);
  bottom: calc(10px + env(safe-area-inset-bottom, 0px)); z-index: 900;
  display: flex; gap: 8px; align-items: center; white-space: nowrap;
  background: var(--panel); color: var(--warn); border: 1px dashed var(--warn);
  border-radius: 99px; padding: 4px 4px 4px 12px; font-size: 12px; font-weight: 600; box-shadow: var(--shadow);
}
.demo-tag button {
  font: inherit; border: 0; border-radius: 99px; padding: 6px 12px; cursor: pointer;
  background: var(--warn-soft); color: var(--warn);
}
</style>
<div id="root"><div class="boot">Deneme sürümü yükleniyor…</div></div>
<div id="toasts" aria-live="polite"></div>
<script src="sql-asm.js"></script>
<script src="backend.js"></script>
<script type="module" src="js/app.js"></script>
`);

const size = fs.readdirSync(out, { recursive: true })
  .map((f) => path.join(out, f)).filter((f) => fs.statSync(f).isFile())
  .reduce((s, f) => s + fs.statSync(f).size, 0);
console.log(`Deneme paketi hazır: ${out} (${(size / 1024 / 1024).toFixed(1)} MB)`);
