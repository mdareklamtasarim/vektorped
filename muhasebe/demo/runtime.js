/* Browser runtime for the demo: runs the real server code (src/) inside the page.
   - node:sqlite is replaced by sql.js (SQLite compiled to JavaScript)
   - fetch('api/...') calls are answered by the same router and handlers as the server
   - the database is kept in this browser (IndexedDB) and starts with sample data
   This file is wrapped by demo/build.js together with the server modules. */
/* global initSqlJs, __MODULES__ */
(function () {
  'use strict';

  // ---- tiny CommonJS loader for the bundled server modules -------------------------
  const cache = {};
  const shims = {};
  function dirname(p) { return p.slice(0, p.lastIndexOf('/')); }
  function resolve(from, name) {
    const parts = (dirname(from) + '/' + name).split('/');
    const out = [];
    for (const part of parts) {
      if (part === '..') out.pop();
      else if (part !== '.' && part !== '') out.push(part);
    }
    let p = out.join('/');
    if (!p.endsWith('.js')) p += '.js';
    return p;
  }
  function load(path) {
    if (shims[path]) return shims[path];
    if (cache[path]) return cache[path].exports;
    const def = __MODULES__[path];
    if (!def) throw new Error('Modül yok: ' + path);
    const module = { exports: {} };
    cache[path] = module;
    def((name) => (shims[name] ? shims[name] : load(resolve(path, name))), module, module.exports);
    return module.exports;
  }

  // ---- node:sqlite on top of sql.js ------------------------------------------------
  let SQL = null;
  let initialBytes = null;
  const prefixed = (params) => {
    const out = {};
    for (const [k, v] of Object.entries(params || {})) out[':' + k] = v;
    return out;
  };
  class StatementSync {
    constructor(owner, sql) { this.owner = owner; this.sql = sql; }
    // Statements are prepared per call: sql.js frees prepared statements on export().
    each(params, fn) {
      const st = this.owner.db.prepare(this.sql);
      try {
        st.bind(prefixed(params));
        while (st.step()) if (fn(st.getAsObject()) === false) break;
      } finally {
        st.free();
      }
    }
    all(params) { const rows = []; this.each(params, (r) => { rows.push(r); }); return rows; }
    get(params) { let row; this.each(params, (r) => { row = r; return false; }); return row; }
    run(params) {
      const st = this.owner.db.prepare(this.sql);
      try { st.run(prefixed(params)); } finally { st.free(); }
      const changes = this.owner.db.getRowsModified();
      const id = this.owner.db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
      return { changes, lastInsertRowid: id };
    }
  }
  class DatabaseSync {
    constructor() { this.db = new SQL.Database(initialBytes || undefined); }
    exec(sql) { this.db.exec(sql); }
    prepare(sql) { return new StatementSync(this, sql); }
    close() {}
    exportBytes() {
      const bytes = this.db.export();
      this.db.exec('PRAGMA foreign_keys = ON;'); // export() reopens the database and resets pragmas
      return bytes;
    }
  }
  shims['node:sqlite'] = { DatabaseSync };
  shims['node:fs'] = { mkdirSync() {}, rm() {}, existsSync: () => false };
  shims['node:os'] = { tmpdir: () => '/tmp' };
  shims['node:path'] = { join: (...a) => a.join('/'), dirname, resolve: (p) => p };
  const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    }));
  shims['node:crypto'] = {
    randomUUID: uuid,
    randomBytes: () => ({ toString: () => uuid().replace(/-/g, '') }),
  };
  // Sign-in is not used in the demo: everyone is the demo administrator.
  shims['src/auth.js'] = {
    hashPassword: (p) => 'demo$' + String(p).length,
    verifyPassword: () => true,
    createSession: () => 'demo',
    sessionCookie: () => '',
    sessionUser: () => null,
    LoginThrottle: class { blocked() { return false; } fail() {} reset() {} },
  };

  // ---- storage of the demo database (IndexedDB) ---------------------------------------
  const STORE = { db: 'muhasebe-demo', os: 'kv', key: 'database' };
  function idb() {
    return new Promise((resolve) => {
      try {
        const r = indexedDB.open(STORE.db, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE.os);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  async function loadBytes() {
    const d = await idb();
    if (!d) return null;
    return new Promise((resolve) => {
      const g = d.transaction(STORE.os).objectStore(STORE.os).get(STORE.key);
      g.onsuccess = () => resolve(g.result || null);
      g.onerror = () => resolve(null);
    });
  }
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const bytes = rawDb.exportBytes();
        const d = await idb();
        if (d) d.transaction(STORE.os, 'readwrite').objectStore(STORE.os).put(bytes, STORE.key);
      } catch (e) { console.warn('Deneme verisi kaydedilemedi', e); }
    }, 300);
  }
  async function resetDemo() {
    for (const name of [STORE.db, 'muhasebe-offline']) {
      await new Promise((resolve) => {
        try {
          const r = indexedDB.deleteDatabase(name);
          r.onsuccess = r.onerror = r.onblocked = () => resolve();
        } catch { resolve(); }
      });
    }
    location.reload();
  }

  // ---- the API, answered in the page ---------------------------------------------------
  let db = null;
  let rawDb = null;
  let router = null;
  const DEMO_USER = { id: 1, username: 'deneme', name: 'Deneme Kullanıcısı', role: 'admin', tokenHash: 'demo' };

  function dispatch(method, url, body) {
    const u = new URL(url, 'http://demo/');
    const path = u.pathname.replace(/^\/+/, '/');
    const { HttpError } = load('src/http.js');
    if (path === '/api/backup') return [400, { error: 'Deneme sürümünde yedek indirilemez.' }];
    const found = router.match(method, path);
    if (!found) return [404, { error: 'Bulunamadı.' }];
    if (found === 'method') return [405, { error: 'Bu işlem desteklenmiyor.' }];
    const ctx = {
      db, user: DEMO_USER, params: found.params, body: body || {}, ip: 'demo', secureCookies: false,
      query: Object.fromEntries(u.searchParams),
      setCookie() {},
      audit(action, entity, entityId, detail) {
        db.run('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (1, :a, :e, :i, :d)', {
          a: action, e: entity, i: entityId == null ? null : entityId, d: detail == null ? null : String(detail).slice(0, 300),
        });
      },
    };
    try {
      const result = found.route.handler(ctx);
      if (method !== 'GET') scheduleSave();
      if (result && result.$file) return [400, { error: 'Deneme sürümünde dosya indirilemez.' }];
      return [200, result === undefined ? { ok: true } : result];
    } catch (err) {
      if (err instanceof HttpError) return [err.status, { error: err.message }];
      if (/UNIQUE constraint failed/.test(String(err && err.message))) return [409, { error: 'Bu kayıt zaten var (aynı kod veya numara).' }];
      console.error(err);
      return [500, { error: 'Beklenmeyen bir hata oluştu: ' + (err && err.message) }];
    }
  }
  const call = (method, path, body) => {
    const [status, data] = dispatch(method, '/api/' + path, body);
    if (status !== 200) throw new Error(path + ': ' + data.error);
    return data;
  };

  // ---- sample data (dates relative to today) -------------------------------------------
  function seed() {
    const day = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    };
    db.run("INSERT INTO users (id, username, name, password_hash, role) VALUES (1, 'deneme', 'Deneme Kullanıcısı', 'demo', 'admin')");
    call('PUT', 'settings', {
      company_name: 'Örnek Reklam Atölyesi', company_address: 'Örnek Mah. Deneme Sok. No:1\nİstanbul',
      company_phone: '0212 000 00 00', company_tax_office: 'Örnek', company_tax_no: '1234567890',
    });
    const cash = 1;
    call('PUT', 'accounts/1', { name: 'Merkez Kasa', kind: 'cash', opening_balance: 8000 });
    const bank = call('POST', 'accounts', { name: 'Banka (örnek)', kind: 'bank', opening_balance: 120000 }).id;
    const p = {};
    p.branda = call('POST', 'products', { name: 'Branda 440 gr', unit: 'm²', category: 'Baskı malzemesi', buy_price: 55, sell_price: 120, critical_level: 40 }).id;
    p.vinil = call('POST', 'products', { name: 'Vinil folyo beyaz', unit: 'm²', category: 'Baskı malzemesi', buy_price: 40, sell_price: 85, critical_level: 30 }).id;
    p.dekota = call('POST', 'products', { name: 'Dekota 3 mm', unit: 'Adet', category: 'Levha', buy_price: 450, sell_price: 750, critical_level: 5 }).id;
    p.panel = call('POST', 'products', { name: 'Kompozit panel 4 mm', unit: 'Adet', category: 'Levha', buy_price: 1250, sell_price: 1950, critical_level: 4 }).id;
    p.murekkep = call('POST', 'products', { name: 'Solvent mürekkep', unit: 'Lt', category: 'Sarf', buy_price: 900, sell_price: 1500, critical_level: 6 }).id;
    const c = {};
    c.kafe = call('POST', 'parties', { name: 'Örnek Kafe', kind: 'customer', phone: '0532 000 00 01' }).id;
    c.eczane = call('POST', 'parties', { name: 'Örnek Eczanesi', kind: 'customer', phone: '0532 000 00 02', opening_balance: 1500 }).id;
    c.insaat = call('POST', 'parties', { name: 'Örnek İnşaat Ltd.', kind: 'customer', tax_office: 'Örnek', tax_no: '9876543210' }).id;
    c.tedarik = call('POST', 'parties', { name: 'Örnek Reklam Malzemeleri', kind: 'supplier' }).id;
    c.baski = call('POST', 'parties', { name: 'Örnek Baskı Market', kind: 'supplier' }).id;

    const inv = (type, party, date, lines, extra = {}) => call('POST', 'invoices', { type, party_id: party, date, lines, ...extra });
    inv('purchase', c.tedarik, day(-40), [
      { product_id: p.branda, qty: 300, unit_price: 55, vat_rate: 20 },
      { product_id: p.vinil, qty: 200, unit_price: 40, vat_rate: 20 },
    ], { no: 'ORM-2041' });
    inv('purchase', c.baski, day(-38), [
      { product_id: p.dekota, qty: 30, unit_price: 450, vat_rate: 20 },
      { product_id: p.panel, qty: 12, unit_price: 1250, vat_rate: 20 },
      { product_id: p.murekkep, qty: 10, unit_price: 900, discount_rate: 5, vat_rate: 20 },
    ], { no: 'OBM-778', payment_account_id: bank });
    inv('sale', c.insaat, day(-30), [
      { product_id: p.panel, qty: 6, unit_price: 1950, vat_rate: 20 },
      { description: 'Cephe tabelası montajı', qty: 1, unit: 'Hizmet', unit_price: 6000, vat_rate: 20 },
    ], { due_date: day(-10) });
    inv('sale', c.kafe, day(-21), [
      { product_id: p.branda, qty: 24, unit_price: 120, vat_rate: 20 },
      { product_id: p.vinil, qty: 15, unit_price: 85, vat_rate: 20 },
    ], { payment_account_id: cash });
    inv('sale', c.eczane, day(-12), [
      { product_id: p.dekota, qty: 4, unit_price: 750, vat_rate: 20 },
      { product_id: p.vinil, qty: 18, unit_price: 85, discount_rate: 10, vat_rate: 20 },
    ], { due_date: day(18) });
    inv('sale', c.kafe, day(-5), [
      { product_id: p.branda, qty: 250, unit_price: 115, vat_rate: 20 },
    ]);
    inv('sale', c.eczane, day(0), [
      { product_id: p.vinil, qty: 6, unit_price: 85, vat_rate: 20 },
    ], { payment_account_id: cash });
    inv('sale', c.insaat, day(-1), [
      { product_id: p.murekkep, qty: 5, unit_price: 1500, vat_rate: 20 },
      { description: 'Tasarım hizmeti', qty: 1, unit: 'Hizmet', unit_price: 2500, vat_rate: 20 },
    ], { payment_account_id: bank });
    inv('sale_return', c.eczane, day(-8), [{ product_id: p.vinil, qty: 2, unit_price: 76.5, vat_rate: 20 }]);

    call('POST', 'transactions', { kind: 'payment', account_id: bank, party_id: c.tedarik, amount: 10000, date: day(-25), description: 'Havale' });
    call('POST', 'transactions', { kind: 'collection', account_id: bank, party_id: c.insaat, amount: 12000, date: day(-15) });
    call('POST', 'transactions', { kind: 'collection', account_id: cash, party_id: c.eczane, amount: 1500, date: day(-9) });
    call('POST', 'transactions', { kind: 'expense', account_id: bank, amount: 15000, category: 'Kira', date: day(-27) });
    call('POST', 'transactions', { kind: 'expense', account_id: cash, amount: 2350, category: 'Elektrik', date: day(-14) });
    call('POST', 'transactions', { kind: 'expense', account_id: cash, amount: 1800, category: 'Yakıt', date: day(-3) });
    call('POST', 'transactions', { kind: 'transfer', account_id: cash, to_account_id: bank, amount: 5000, date: day(-2) });
    call('POST', 'stock-moves', { product_id: p.branda, kind: 'out', qty: 4, date: day(-4), note: 'Fire' });
  }

  // ---- start -------------------------------------------------------------------------
  const ready = (async () => {
    SQL = await initSqlJs({});
    initialBytes = await loadBytes();
    const { openDb } = load('src/db.js');
    db = openDb(':memory:');
    rawDb = db.raw;
    const { Router } = load('src/http.js');
    router = new Router();
    load('src/api/admin.js').register(router, { throttle: new shims['src/auth.js'].LoginThrottle() });
    for (const m of ['stock', 'parties', 'invoices', 'finance', 'reports']) load('src/api/' + m + '.js').register(router);
    if (!initialBytes) {
      seed();
      scheduleSave();
    }
  })();

  // Answer the app's own API requests; everything else goes to the network as usual.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!/^(\.\/)?api\//.test(url)) return realFetch(input, init);
    try {
      await ready;
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Deneme veritabanı açılamadı: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const method = (init.method || 'GET').toUpperCase();
    let body = {};
    if (init.body) { try { body = JSON.parse(init.body); } catch { body = {}; } }
    const [status, data] = dispatch(method, '/' + url.replace(/^\.\//, ''), body);
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  };

  window.MUHASEBE_DEMO = { reset: resetDemo, ready };

  // Small "demo" tag with a reset button.
  function tag() {
    const box = document.createElement('div');
    box.className = 'demo-tag';
    box.innerHTML = '<span>Deneme sürümü · veriler bu cihazda</span><button type="button">Sıfırla</button>';
    let armed = false;
    box.querySelector('button').addEventListener('click', (e) => {
      if (!armed) {
        armed = true;
        e.target.textContent = 'Emin misin? Tekrar dokun';
        setTimeout(() => { armed = false; e.target.textContent = 'Sıfırla'; }, 4000);
        return;
      }
      resetDemo();
    });
    document.body.appendChild(box);
  }
  if (document.body) tag();
  else document.addEventListener('DOMContentLoaded', tag);
})();
