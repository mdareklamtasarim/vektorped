'use strict';
// HTTP server: serves the web app from /public and the JSON API under /api.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('./db');
const { Router, HttpError } = require('./http');
const { sessionUser, LoginThrottle } = require('./auth');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 2 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function buildRouter() {
  const router = new Router();
  const throttle = new LoginThrottle();
  require('./api/admin').register(router, { throttle });
  require('./api/stock').register(router);
  require('./api/parties').register(router);
  require('./api/invoices').register(router);
  require('./api/finance').register(router);
  require('./api/reports').register(router);
  return router;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'İstek çok büyük.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(body && typeof body === 'object' && !Array.isArray(body) ? body : {});
      } catch {
        reject(new HttpError(400, 'Geçersiz JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data, extra = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(body);
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Bulunamadı');
    }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': type,
      'Content-Length': st.size,
      // App files change with each release; let the browser revalidate.
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const ACCESS = {
  public: () => true,
  read: (u) => !!u,
  write: (u) => !!u && (u.role === 'admin' || u.role === 'user'),
  admin: (u) => !!u && u.role === 'admin',
};

function createApp({ dbFile, secureCookies = false, trustProxy = false, log = console } = {}) {
  const db = openDb(dbFile);
  const router = buildRouter();

  async function handleApi(req, res, url) {
    const found = router.match(req.method, url.pathname);
    if (!found) throw new HttpError(404, 'Bulunamadı.');
    if (found === 'method') throw new HttpError(405, 'Bu işlem desteklenmiyor.');
    const { route, params } = found;

    // Writes must be JSON from this same site (with SameSite cookies this blocks CSRF).
    if (req.method !== 'GET') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        throw new HttpError(415, 'İstek JSON olmalı.');
      }
      // Browsers say themselves whether a request comes from this same site; that works behind
      // any proxy (Tailscale, Caddy). Older browsers fall back to comparing Origin with Host.
      const site = req.headers['sec-fetch-site'];
      const origin = req.headers.origin;
      if (site) {
        if (site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'İzin verilmeyen kaynak.');
      } else if (origin) {
        const host = req.headers['x-forwarded-host'] && trustProxy ? req.headers['x-forwarded-host'] : req.headers.host;
        let ok = false;
        try { ok = new URL(origin).host === host; } catch { ok = false; }
        if (!ok) throw new HttpError(403, 'İzin verilmeyen kaynak.');
      }
    }

    const user = sessionUser(db, req);
    if (!ACCESS[route.access](user)) {
      throw user ? new HttpError(403, 'Bu işlem için yetkiniz yok.') : new HttpError(401, 'Oturum açmanız gerekiyor.');
    }

    const body = req.method === 'GET' ? {} : await readBody(req);
    const headers = {};
    const ip = trustProxy && req.headers['x-forwarded-for']
      ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
      : req.socket.remoteAddress;
    const ctx = {
      db, user, params, body, ip, req, secureCookies,
      query: Object.fromEntries(url.searchParams),
      setCookie: (c) => { headers['Set-Cookie'] = c; },
      audit: (action, entity, entityId, detail = null, userId = user && user.id) => {
        db.run(
          'INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (:u, :a, :e, :i, :d)',
          { u: userId || null, a: action, e: entity, i: entityId ?? null, d: detail == null ? null : String(detail).slice(0, 300) },
        );
      },
    };
    const opId = req.method === 'GET' ? null : req.headers['x-op-id'];
    let result;
    if (opId) {
      if (!/^[A-Za-z0-9-]{8,64}$/.test(opId)) throw new HttpError(400, 'Geçersiz işlem kimliği.');
      const done = db.get('SELECT response FROM client_ops WHERE id = :id', { id: opId });
      if (done) return sendJson(res, 200, JSON.parse(done.response), { 'X-Op-Replayed': '1' });
      // The change and the record of it commit together, so a retry can never apply it twice.
      result = db.tx(() => {
        const r = route.handler(ctx);
        if (r && typeof r.then === 'function') throw new Error('Asenkron işleyici tekrar korumasıyla kullanılamaz.');
        db.run('INSERT INTO client_ops (id, user_id, response) VALUES (:id, :u, :r)', {
          id: opId, u: user ? user.id : null, r: JSON.stringify(r === undefined ? { ok: true } : r),
        });
        return r;
      });
    } else {
      result = await route.handler(ctx);
    }

    if (result && result.$file) {
      const f = result.$file;
      const st = fs.statSync(f.path);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': f.type,
        'Content-Length': st.size,
        'Content-Disposition': `attachment; filename="${f.name}"`,
        'Cache-Control': 'no-store',
      });
      const stream = fs.createReadStream(f.path);
      stream.pipe(res);
      stream.on('close', () => f.cleanup && f.cleanup());
      return;
    }
    sendJson(res, 200, result === undefined ? { ok: true } : result, headers);
  }

  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (url.pathname.startsWith('/api/')) {
      try {
        await handleApi(req, res, url);
      } catch (err) {
        if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
        if (err && /UNIQUE constraint failed/.test(err.message)) {
          return sendJson(res, 409, { error: 'Bu kayıt zaten var (aynı kod veya numara).' });
        }
        log.error(err);
        return sendJson(res, 500, { error: 'Sunucuda beklenmeyen bir hata oluştu.' });
      }
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    serveStatic(req, res, url.pathname);
  });

  db.run("DELETE FROM client_ops WHERE created_at < datetime('now', '-180 days')");
  server.on('close', () => db.close());
  return { server, db };
}

// Daily copy of the database into dir (BACKUP_DIR); keeps the newest `keep` files.
function scheduleBackups(db, dir, keep = 30, log = console) {
  const run = () => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      const file = path.join(dir, `muhasebe-${day}.db`);
      if (!fs.existsSync(file)) {
        db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
        log.log(`Yedek alındı: ${file}`);
      }
      const old = fs.readdirSync(dir).filter((f) => /^muhasebe-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -keep);
      for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
    } catch (err) {
      log.error('Yedek alınamadı:', err.message);
    }
  };
  run();
  return setInterval(run, 60 * 60 * 1000).unref();
}

module.exports = { createApp, scheduleBackups };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  const dbFile = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'muhasebe.db');
  const { server, db } = createApp({
    dbFile,
    secureCookies: process.env.COOKIE_SECURE === '1',
    trustProxy: process.env.TRUST_PROXY === '1',
  });
  if (process.env.BACKUP_DIR) scheduleBackups(db, path.resolve(process.env.BACKUP_DIR));
  server.listen(port, host, () => {
    console.log(`Muhasebe & Stok çalışıyor: http://localhost:${port}  (veritabanı: ${dbFile})`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
