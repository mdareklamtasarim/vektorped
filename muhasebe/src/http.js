'use strict';
// Small HTTP toolkit: errors, a path router and input validators.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const badRequest = (msg) => new HttpError(400, msg);
const notFound = (msg = 'Kayıt bulunamadı.') => new HttpError(404, msg);

class Router {
  constructor() {
    this.routes = [];
  }
  // opts.access: 'public' | 'read' (any signed-in user) | 'write' (admin or user) | 'admin'
  add(method, pattern, opts, handler) {
    if (typeof opts === 'function') {
      handler = opts;
      opts = {};
    }
    const keys = [];
    const source = pattern.replace(/:(\w+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    });
    const access = opts.access || (method === 'GET' ? 'read' : 'write');
    this.routes.push({ method, re: new RegExp(`^${source}$`), keys, handler, access });
  }
  get(p, o, h) { this.add('GET', p, o, h); }
  post(p, o, h) { this.add('POST', p, o, h); }
  put(p, o, h) { this.add('PUT', p, o, h); }
  delete(p, o, h) { this.add('DELETE', p, o, h); }

  match(method, path) {
    let pathMatched = false;
    for (const route of this.routes) {
      const m = route.re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params = {};
      route.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1]);
      });
      return { route, params };
    }
    return pathMatched ? 'method' : null;
  }
}

// ---- validators ---------------------------------------------------------
// Each returns a clean value or throws a 400 with a Turkish message.

function text(v, label, { required = false, max = 500 } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') throw badRequest(`${label} geçersiz.`);
  v = v.trim();
  if (required && !v) throw badRequest(`${label} boş olamaz.`);
  if (v.length > max) throw badRequest(`${label} en fazla ${max} karakter olabilir.`);
  return v;
}

function optText(v, label, max) {
  const t = text(v, label, { max });
  return t || null;
}

function num(v, label, { min = -Infinity, max = Infinity, required = true, def = 0, decimals = 3 } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw badRequest(`${label} girilmeli.`);
    return def;
  }
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  if (!Number.isFinite(n)) throw badRequest(`${label} sayı olmalı.`);
  if (n < min) throw badRequest(`${label} en az ${min} olabilir.`);
  if (n > max) throw badRequest(`${label} en fazla ${max} olabilir.`);
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

// TL amount in, integer kuruş out.
function money(v, label, opts = {}) {
  const n = num(v, label, { ...opts, decimals: 2, max: opts.max ?? 1e11 });
  return Math.round(n * 100);
}

function id(v, label, { required = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw badRequest(`${label} seçilmeli.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`${label} geçersiz.`);
  return n;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function date(v, label, { required = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw badRequest(`${label} girilmeli.`);
    return null;
  }
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw badRequest(`${label} YYYY-AA-GG biçiminde olmalı.`);
  }
  return v;
}

function oneOf(v, label, allowed) {
  if (!allowed.includes(v)) throw badRequest(`${label} geçersiz.`);
  return v;
}

function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

// Query string date range; defaults are open-ended.
function range(query) {
  return {
    from: date(query.from, 'Başlangıç tarihi', { required: false }) || '0000-01-01',
    to: date(query.to, 'Bitiş tarihi', { required: false }) || '9999-12-31',
  };
}

const toTL = (k) => (k == null ? null : Math.round(k) / 100);

module.exports = {
  HttpError, badRequest, notFound, Router,
  text, optText, num, money, id, date, oneOf, bool, range, toTL,
};
