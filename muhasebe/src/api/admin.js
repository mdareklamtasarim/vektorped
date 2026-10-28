'use strict';
// Sign-in, first-run setup, users, company settings, audit log and backup.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { HttpError, badRequest, notFound, text, oneOf, bool, id } = require('../http');
const { hashPassword, verifyPassword, createSession, sessionCookie } = require('../auth');

const ROLES = ['admin', 'user', 'viewer'];
const SETTING_KEYS = [
  'company_name', 'company_address', 'company_phone', 'company_tax_office', 'company_tax_no',
  'sale_prefix', 'purchase_prefix', 'sale_return_prefix', 'purchase_return_prefix',
];

function password(v) {
  const p = typeof v === 'string' ? v : '';
  if (p.length < 8) throw badRequest('Şifre en az 8 karakter olmalı.');
  if (p.length > 200) throw badRequest('Şifre çok uzun.');
  return p;
}

function username(v) {
  const u = text(v, 'Kullanıcı adı', { required: true, max: 40 });
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) throw badRequest('Kullanıcı adı yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir.');
  return u;
}

function register(r, { throttle }) {
  r.get('/api/auth/state', { access: 'public' }, ({ db, user }) => {
    const users = db.get('SELECT COUNT(*) AS n FROM users').n;
    return {
      needsSetup: users === 0,
      user: user ? { id: user.id, username: user.username, name: user.name, role: user.role } : null,
      company: db.setting('company_name'),
    };
  });

  // First run only: creates the first admin while the user table is empty.
  r.post('/api/auth/setup', { access: 'public' }, (ctx) => {
    const { db, body } = ctx;
    const u = username(body.username);
    const name = text(body.name, 'Ad soyad', { required: true, max: 80 });
    const pw = password(body.password);
    const company = text(body.company, 'Firma adı', { max: 120 });
    const userId = db.tx(() => {
      if (db.get('SELECT COUNT(*) AS n FROM users').n > 0) throw new HttpError(409, 'Kurulum zaten yapılmış.');
      const { id: newId } = db.run(
        "INSERT INTO users (username, name, password_hash, role) VALUES (:u, :n, :h, 'admin')",
        { u, n: name, h: hashPassword(pw) },
      );
      if (company) db.run("UPDATE settings SET value = :v WHERE key = 'company_name'", { v: company });
      return newId;
    });
    ctx.setCookie(sessionCookie(createSession(db, userId), ctx.secureCookies));
    ctx.audit('setup', 'user', userId, u, userId);
    return { ok: true };
  });

  r.post('/api/auth/login', { access: 'public' }, (ctx) => {
    const { db, body, ip } = ctx;
    if (throttle.blocked(ip)) throw new HttpError(429, 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.');
    const u = text(body.username, 'Kullanıcı adı', { required: true, max: 40 });
    const pw = typeof body.password === 'string' ? body.password : '';
    const row = db.get('SELECT id, password_hash, active FROM users WHERE username = :u', { u });
    if (!row || !row.active || !verifyPassword(pw, row.password_hash)) {
      throttle.fail(ip);
      throw new HttpError(401, 'Kullanıcı adı veya şifre hatalı.');
    }
    throttle.reset(ip);
    ctx.setCookie(sessionCookie(createSession(db, row.id), ctx.secureCookies));
    ctx.audit('login', 'user', row.id, null, row.id);
    return { ok: true };
  });

  r.post('/api/auth/logout', { access: 'read' }, (ctx) => {
    ctx.db.run('DELETE FROM sessions WHERE token_hash = :h', { h: ctx.user.tokenHash });
    ctx.setCookie(sessionCookie('', ctx.secureCookies, 0));
    return { ok: true };
  });

  r.post('/api/auth/password', { access: 'read' }, (ctx) => {
    const { db, body, user } = ctx;
    const row = db.get('SELECT password_hash FROM users WHERE id = :id', { id: user.id });
    if (!verifyPassword(String(body.current || ''), row.password_hash)) throw badRequest('Mevcut şifre hatalı.');
    const next = password(body.next);
    db.tx(() => {
      db.run('UPDATE users SET password_hash = :h WHERE id = :id', { h: hashPassword(next), id: user.id });
      db.run('DELETE FROM sessions WHERE user_id = :id AND token_hash <> :t', { id: user.id, t: user.tokenHash });
    });
    ctx.audit('password', 'user', user.id);
    return { ok: true };
  });

  // ---- users ------------------------------------------------------------
  r.get('/api/users', { access: 'admin' }, ({ db }) =>
    db.all('SELECT id, username, name, role, active, created_at FROM users ORDER BY name'));

  r.post('/api/users', { access: 'admin' }, (ctx) => {
    const { db, body } = ctx;
    const u = username(body.username);
    if (db.get('SELECT 1 AS x FROM users WHERE username = :u', { u })) throw badRequest('Bu kullanıcı adı kullanılıyor.');
    const { id: newId } = db.run(
      'INSERT INTO users (username, name, password_hash, role) VALUES (:u, :n, :h, :r)',
      {
        u,
        n: text(body.name, 'Ad soyad', { required: true, max: 80 }),
        h: hashPassword(password(body.password)),
        r: oneOf(body.role, 'Yetki', ROLES),
      },
    );
    ctx.audit('create', 'user', newId, u);
    return { id: newId };
  });

  r.put('/api/users/:id', { access: 'admin' }, (ctx) => {
    const { db, body, params, user } = ctx;
    const userId = id(params.id, 'Kullanıcı');
    const existing = db.get('SELECT * FROM users WHERE id = :id', { id: userId });
    if (!existing) throw notFound();
    const role = oneOf(body.role ?? existing.role, 'Yetki', ROLES);
    const active = body.active === undefined ? existing.active : bool(body.active) ? 1 : 0;
    if (userId === user.id && (role !== 'admin' || !active)) {
      throw badRequest('Kendi yönetici yetkinizi kaldıramaz veya hesabınızı kapatamazsınız.');
    }
    db.tx(() => {
      db.run('UPDATE users SET name = :n, role = :r, active = :a WHERE id = :id', {
        n: text(body.name ?? existing.name, 'Ad soyad', { required: true, max: 80 }), r: role, a: active, id: userId,
      });
      if (body.password) {
        db.run('UPDATE users SET password_hash = :h WHERE id = :id', { h: hashPassword(password(body.password)), id: userId });
      }
      if (body.password || !active) db.run('DELETE FROM sessions WHERE user_id = :id', { id: userId });
    });
    ctx.audit('update', 'user', userId, existing.username);
    return { ok: true };
  });

  // ---- settings ---------------------------------------------------------
  r.get('/api/settings', ({ db }) => {
    const out = {};
    for (const row of db.all('SELECT key, value FROM settings')) out[row.key] = row.value;
    return out;
  });

  r.put('/api/settings', { access: 'admin' }, (ctx) => {
    const { db, body } = ctx;
    db.tx(() => {
      for (const key of SETTING_KEYS) {
        if (body[key] === undefined) continue;
        const max = key.endsWith('_prefix') ? 10 : 300;
        const value = text(body[key], 'Ayar', { max });
        if (key.endsWith('_prefix') && !/^[A-Za-z0-9-]*$/.test(value)) throw badRequest('Fatura ön eki yalnızca harf, rakam ve tire içerebilir.');
        db.run('INSERT INTO settings (key, value) VALUES (:k, :v) ON CONFLICT(key) DO UPDATE SET value = excluded.value', { k: key, v: value });
      }
    });
    ctx.audit('update', 'settings', null);
    return { ok: true };
  });

  // ---- audit log --------------------------------------------------------
  r.get('/api/audit', { access: 'admin' }, ({ db, query }) => {
    const limit = Math.min(Number(query.limit) || 200, 1000);
    return db.all(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at, u.name AS user_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.id DESC LIMIT :limit`,
      { limit },
    );
  });

  // ---- backup: a consistent copy of the whole database file -------------
  r.get('/api/backup', { access: 'admin' }, (ctx) => {
    const tmp = path.join(os.tmpdir(), `muhasebe-yedek-${crypto.randomBytes(6).toString('hex')}.db`);
    ctx.db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    ctx.audit('backup', 'database', null);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return {
      $file: {
        path: tmp,
        name: `muhasebe-yedek-${stamp}.db`,
        type: 'application/vnd.sqlite3',
        cleanup: () => fs.rm(tmp, { force: true }, () => {}),
      },
    };
  });
}

module.exports = { register };
