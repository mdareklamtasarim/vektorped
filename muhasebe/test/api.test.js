'use strict';
// End-to-end API tests against a real server with an in-memory database.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');

let server;
let base;

before(async () => {
  ({ server } = createApp({ dbFile: ':memory:', log: { error() {} } }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

// A tiny client that keeps its own session cookie.
function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data };
  };
  return {
    cookie: () => cookie,
    get: (p) => call('GET', p),
    post: (p, b = {}) => call('POST', p, b),
    put: (p, b = {}) => call('PUT', p, b),
    del: (p) => call('DELETE', p),
  };
}

const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};

const admin = client();
const ids = {};

test('first-run setup creates the admin and only works once', async () => {
  assert.equal(ok(await admin.get('/api/auth/state')).needsSetup, true);
  assert.equal((await admin.get('/api/products')).status, 401);
  ok(await admin.post('/api/auth/setup', { username: 'yonetici', name: 'Yönetici', password: 'gizli-sifre-1', company: 'Deneme Reklam' }));
  const state = ok(await admin.get('/api/auth/state'));
  assert.equal(state.needsSetup, false);
  assert.equal(state.user.role, 'admin');
  assert.equal(state.company, 'Deneme Reklam');
  const again = await client().post('/api/auth/setup', { username: 'x', name: 'X', password: '12345678' });
  assert.equal(again.status, 409);
});

test('login rejects wrong passwords and accepts the right one', async () => {
  const c = client();
  assert.equal((await c.post('/api/auth/login', { username: 'yonetici', password: 'yanlis' })).status, 401);
  ok(await c.post('/api/auth/login', { username: 'YONETICI', password: 'gizli-sifre-1' }));
  assert.equal(ok(await c.get('/api/auth/state')).user.username, 'yonetici');
});

test('writes need a JSON body and a matching origin', async () => {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(res.status, 415);
  const res2 = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}',
  });
  assert.equal(res2.status, 403);
  const res3 = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: '{}',
  });
  assert.equal(res3.status, 403);
  // Behind a proxy the Host may differ from the page's address; the browser's own same-origin flag decides.
  const res4 = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', Origin: 'https://pc.tail1234.ts.net' },
    body: JSON.stringify({ username: 'yok', password: 'yanlis-sifre' }),
  });
  assert.equal(res4.status, 401);
});

test('products, parties and accounts can be created', async () => {
  ids.vinyl = ok(await admin.post('/api/products', {
    name: 'Folyo Beyaz', unit: 'm²', buy_price: 40, sell_price: 75, vat_rate: 20, critical_level: 10,
  })).id;
  ids.ink = ok(await admin.post('/api/products', { code: 'MUR-01', name: 'Mürekkep', unit: 'Lt', buy_price: 900, sell_price: 1500 })).id;
  const dup = await admin.post('/api/products', { code: 'mur-01', name: 'Kopya' });
  assert.equal(dup.status, 400);
  const list = ok(await admin.get('/api/products'));
  assert.equal(list.length, 2);
  assert.equal(list.find((p) => p.id === ids.vinyl).code, 'STK00001');

  ids.customer = ok(await admin.post('/api/parties', { name: 'ABC Market', kind: 'customer', opening_balance: 100 })).id;
  ids.supplier = ok(await admin.post('/api/parties', { name: 'Tedarik AŞ', kind: 'supplier' })).id;
  ids.cash = ok(await admin.get('/api/accounts'))[0].id;
  ids.bank = ok(await admin.post('/api/accounts', { name: 'Ziraat', kind: 'bank', opening_balance: 1000 })).id;
});

test('purchase invoice adds stock, sets cost and creates a payable', async () => {
  const inv = ok(await admin.post('/api/invoices', {
    type: 'purchase', party_id: ids.supplier, date: '2026-10-01', no: 'TED-555',
    lines: [
      { product_id: ids.vinyl, qty: 100, unit_price: 42, vat_rate: 20 },
      { product_id: ids.ink, qty: 2, unit_price: 1000, discount_rate: 10, vat_rate: 20 },
    ],
  }));
  ids.purchase = inv.id;
  const detail = ok(await admin.get(`/api/invoices/${inv.id}`));
  // 4200 + 1800 net, 20% VAT
  assert.equal(detail.subtotal, 6200);
  assert.equal(detail.discount_total, 200);
  assert.equal(detail.vat_total, 1200);
  assert.equal(detail.total, 7200);
  const vinyl = ok(await admin.get(`/api/products/${ids.vinyl}`));
  assert.equal(vinyl.stock, 100);
  assert.equal(vinyl.avg_cost, 42);
  const ink = ok(await admin.get(`/api/products/${ids.ink}`));
  assert.equal(ink.avg_cost, 900);
  const supplier = ok(await admin.get(`/api/parties/${ids.supplier}`));
  assert.equal(supplier.balance, -7200);
});

test('sale invoice with on-the-spot payment', async () => {
  const inv = ok(await admin.post('/api/invoices', {
    type: 'sale', party_id: ids.customer, date: '2026-10-05', due_date: '2026-10-20',
    payment_account_id: ids.cash,
    lines: [
      { product_id: ids.vinyl, qty: 95, unit_price: 75, vat_rate: 20 },
      { description: 'Montaj hizmeti', qty: 1, unit_price: 500, vat_rate: 20 },
    ],
  }));
  ids.sale = inv.id;
  assert.equal(inv.no, 'SF2026000001');
  const detail = ok(await admin.get(`/api/invoices/${inv.id}`));
  assert.equal(detail.total, 9150); // (7125 + 500) * 1.2
  assert.equal(detail.payments.length, 1);
  const vinyl = ok(await admin.get(`/api/products/${ids.vinyl}`));
  assert.equal(vinyl.stock, 5);
  assert.equal(vinyl.critical, true);
  const customer = ok(await admin.get(`/api/parties/${ids.customer}`));
  assert.equal(customer.balance, 100); // opening only, invoice was paid
  const cash = ok(await admin.get(`/api/accounts/${ids.cash}`));
  assert.equal(cash.balance, 9150);
});

test('editing an invoice rewrites stock and the linked payment', async () => {
  const detail = ok(await admin.get(`/api/invoices/${ids.sale}`));
  ok(await admin.put(`/api/invoices/${ids.sale}`, {
    party_id: ids.customer, date: detail.date, due_date: detail.due_date, no: detail.no,
    lines: [{ product_id: ids.vinyl, qty: 50, unit_price: 75, vat_rate: 20 }],
  }));
  assert.equal(ok(await admin.get(`/api/products/${ids.vinyl}`)).stock, 50);
  assert.equal(ok(await admin.get(`/api/accounts/${ids.cash}`)).balance, 4500);
});

test('collections, payments, expenses and transfers', async () => {
  ok(await admin.post('/api/invoices', {
    type: 'sale', party_id: ids.customer, date: '2026-10-06',
    lines: [{ product_id: ids.ink, qty: 1, unit_price: 1500, vat_rate: 20 }],
  }));
  assert.equal(ok(await admin.get(`/api/parties/${ids.customer}`)).balance, 1900);
  ok(await admin.post('/api/transactions', { kind: 'collection', account_id: ids.bank, party_id: ids.customer, amount: 900, date: '2026-10-07' }));
  assert.equal(ok(await admin.get(`/api/parties/${ids.customer}`)).balance, 1000);
  ok(await admin.post('/api/transactions', { kind: 'payment', account_id: ids.bank, party_id: ids.supplier, amount: 1200.5, date: '2026-10-08' }));
  assert.equal(ok(await admin.get(`/api/parties/${ids.supplier}`)).balance, -5999.5);
  ok(await admin.post('/api/transactions', { kind: 'expense', account_id: ids.cash, amount: 250, category: 'Kira', date: '2026-10-09' }));
  const t = ok(await admin.post('/api/transactions', { kind: 'transfer', account_id: ids.cash, to_account_id: ids.bank, amount: 1000, date: '2026-10-10' }));
  assert.equal(t.ids.length, 2);
  assert.equal(ok(await admin.get(`/api/accounts/${ids.cash}`)).balance, 3250);
  assert.equal(ok(await admin.get(`/api/accounts/${ids.bank}`)).balance, 1000 + 900 - 1200.5 + 1000);
  ok(await admin.del(`/api/transactions/${t.id}`));
  assert.equal(ok(await admin.get(`/api/accounts/${ids.cash}`)).balance, 4250);
  const bad = await admin.post('/api/transactions', { kind: 'collection', account_id: ids.bank, amount: 5, date: '2026-10-07' });
  assert.equal(bad.status, 400);
});

test('party statement carries the balance forward', async () => {
  const s = ok(await admin.get(`/api/parties/${ids.customer}?from=2026-10-06&to=2026-10-31`)).statement;
  assert.equal(s.carried, 100); // opening 100 + sale 4500 - collection 4500 on 10-05
  assert.equal(s.rows.length, 2);
  assert.equal(s.closing, 1000);
  const early = ok(await admin.get(`/api/parties/${ids.customer}?to=2026-10-05`)).statement;
  assert.equal(early.closing, 100);
});

test('manual stock moves and stock count', async () => {
  ok(await admin.post('/api/stock-moves', { product_id: ids.vinyl, kind: 'out', qty: 3, date: '2026-10-11', note: 'Fire' }));
  assert.equal(ok(await admin.get(`/api/products/${ids.vinyl}`)).stock, 47);
  const counted = ok(await admin.post('/api/stock-moves', { product_id: ids.vinyl, kind: 'count', qty: 45.5, date: '2026-10-12' }));
  assert.equal(counted.stock, 45.5);
  const invMove = ok(await admin.get(`/api/products/${ids.vinyl}`)).moves.find((m) => m.invoice_id);
  assert.equal((await admin.del(`/api/stock-moves/${invMove.id}`)).status, 400);
});

test('reports add up', async () => {
  const s = ok(await admin.get('/api/reports/summary?from=2026-10-01&to=2026-10-31'));
  assert.equal(s.net_sales, 3750 + 1500);
  assert.equal(s.vat_output, 1050);
  assert.equal(s.vat_input, 1200);
  assert.equal(s.vat_payable, -150);
  assert.equal(s.cost_of_sales, 50 * 42 + 900);
  assert.equal(s.gross_profit, 5250 - 3000);
  assert.equal(s.expense, 250);
  const profit = ok(await admin.get('/api/reports/profit?from=2026-10-01&to=2026-10-31'));
  assert.equal(profit.find((p) => p.product_id === ids.vinyl).profit, 3750 - 2100);
  const dash = ok(await admin.get('/api/reports/dashboard'));
  assert.ok(Array.isArray(dash.critical));
  assert.equal(dash.receivable, 1000);
  assert.equal(dash.payable, 5999.5);
  const monthly = ok(await admin.get('/api/reports/monthly?year=2026'));
  assert.equal(monthly.months[9].net_sales, 5250);
  ok(await admin.get('/api/reports/stock-value'));
  ok(await admin.get('/api/reports/balances'));
  ok(await admin.get('/api/reports/categories'));
});

test('cancelling an invoice removes its stock and payment effect', async () => {
  ok(await admin.post(`/api/invoices/${ids.sale}/cancel`));
  const vinyl = ok(await admin.get(`/api/products/${ids.vinyl}`));
  assert.equal(vinyl.stock, 95.5);
  assert.equal(ok(await admin.get(`/api/accounts/${ids.cash}`)).balance, -250);
  assert.equal((await admin.put(`/api/invoices/${ids.sale}`, {})).status, 400);
  assert.equal((await admin.post(`/api/invoices/${ids.sale}/cancel`)).status, 409);
});

test('roles: viewer can read but not write; only admin manages users', async () => {
  ok(await admin.post('/api/users', { username: 'izleyici', name: 'İzleyici', password: 'izleyici-1', role: 'viewer' }));
  ok(await admin.post('/api/users', { username: 'personel', name: 'Personel', password: 'personel-1', role: 'user' }));
  const viewer = client();
  ok(await viewer.post('/api/auth/login', { username: 'izleyici', password: 'izleyici-1' }));
  ok(await viewer.get('/api/products'));
  assert.equal((await viewer.post('/api/products', { name: 'X' })).status, 403);
  const staff = client();
  ok(await staff.post('/api/auth/login', { username: 'personel', password: 'personel-1' }));
  ok(await staff.post('/api/products', { name: 'Personel ürünü' }));
  assert.equal((await staff.get('/api/users')).status, 403);
  assert.equal((await staff.del(`/api/invoices/${ids.sale}`)).status, 403);
  const me = ok(await admin.get('/api/auth/state')).user;
  assert.equal((await admin.put(`/api/users/${me.id}`, { role: 'user' })).status, 400);
});

test('products with history cannot be deleted', async () => {
  assert.equal((await admin.del(`/api/products/${ids.vinyl}`)).status, 400);
});

test('backup downloads a SQLite file and audit log records actions', async () => {
  const r = await admin.get('/api/backup');
  assert.equal(r.status, 200);
  assert.equal(Buffer.from(r.data).subarray(0, 15).toString(), 'SQLite format 3');
  const log = ok(await admin.get('/api/audit'));
  assert.ok(log.some((e) => e.action === 'cancel' && e.entity === 'invoice'));
});

test('logout ends the session', async () => {
  const c = client();
  ok(await c.post('/api/auth/login', { username: 'yonetici', password: 'gizli-sifre-1' }));
  ok(await c.post('/api/auth/logout'));
  assert.equal((await c.get('/api/products')).status, 401);
});

test('static files are served and paths cannot escape public/', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const esc = await fetch(`${base}/..%2Fpackage.json`);
  assert.notEqual(esc.status, 200);
});

test('a change sent twice with the same operation id is saved once', async () => {
  const send = (opId) => fetch(`${base}/api/parties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin.cookie(), 'X-Op-Id': opId },
    body: JSON.stringify({ name: 'Çevrimdışı Müşteri' }),
  }).then(async (r) => ({ status: r.status, replayed: r.headers.get('x-op-replayed'), data: await r.json() }));
  const first = await send('op-12345678-aaaa');
  const second = await send('op-12345678-aaaa');
  assert.equal(first.status, 200);
  assert.equal(second.replayed, '1');
  assert.equal(second.data.id, first.data.id);
  const list = ok(await admin.get('/api/parties?q=Çevrimdışı'));
  assert.equal(list.length, 1);
  assert.equal((await send('bad id!')).status, 400);
});

test('daily backups are written once per day and old ones pruned', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { openDb } = require('../src/db');
  const { scheduleBackups } = require('../src/server');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yedek-'));
  for (const d of ['2020-01-01', '2020-01-02', '2020-01-03']) fs.writeFileSync(path.join(dir, `muhasebe-${d}.db`), 'x');
  const db = openDb(':memory:');
  const timer = scheduleBackups(db, dir, 2, { log() {}, error() {} });
  clearInterval(timer);
  const files = fs.readdirSync(dir).sort();
  assert.equal(files.length, 2);
  assert.equal(files[0], 'muhasebe-2020-01-03.db');
  assert.match(files[1], /^muhasebe-\d{4}-\d{2}-\d{2}\.db$/);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
