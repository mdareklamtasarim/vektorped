// Offline support: remembers the last answer of every page's data (cache) and keeps
// changes made without a connection in a queue (outbox) that is sent in order once
// the server can be reached again.
//
// New records made offline get a temporary negative id. When the queue is sent, the
// real id from the server replaces the temporary one in every later queued change.

const DB_NAME = 'muhasebe-offline';
let dbPromise = null;
const memory = { cache: new Map(), outbox: new Map(), meta: new Map() }; // used when IndexedDB is unavailable

function openIdb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          d.createObjectStore('cache');
          d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
          d.createObjectStore('meta');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function store(name, mode, fn) {
  const d = await openIdb();
  if (!d) return fn(null);
  return new Promise((resolve, reject) => {
    const tx = d.transaction(name, mode);
    let result;
    Promise.resolve(fn(tx.objectStore(name))).then((r) => { result = r; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

const idb = {
  get: (name, key) => store(name, 'readonly', (s) => (s ? req(s.get(key)) : memory[name].get(key))),
  put: (name, value, key) => store(name, 'readwrite', (s) => {
    if (s) return req(key === undefined ? s.put(value) : s.put(value, key));
    if (name === 'outbox' && value.seq === undefined) value.seq = memory.outbox.size ? Math.max(...memory.outbox.keys()) + 1 : 1;
    memory[name].set(key ?? value.seq, value);
    return key ?? value.seq;
  }),
  del: (name, key) => store(name, 'readwrite', (s) => (s ? req(s.delete(key)) : memory[name].delete(key))),
  all: (name) => store(name, 'readonly', (s) => (s ? req(s.getAll()) : [...memory[name].values()])),
  keys: (name) => store(name, 'readonly', (s) => (s ? req(s.getAllKeys()) : [...memory[name].keys()])),
};

// ---- state & listeners --------------------------------------------------------
export const state = {
  online: true, // last request reached the server
  cacheAt: null, // when the data on screen was saved, if it came from the cache
  pending: 0,
  failed: 0,
  syncing: false,
  needsLogin: false,
};
let outboxSnapshot = [];
const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch { /* listener errors must not break sync */ }
  }
}
async function refreshOutbox() {
  try {
    outboxSnapshot = (await idb.all('outbox')).sort((a, b) => a.seq - b.seq);
  } catch {
    outboxSnapshot = [];
  }
  state.pending = outboxSnapshot.filter((o) => o.status !== 'failed').length;
  state.failed = outboxSnapshot.filter((o) => o.status === 'failed').length;
  emit();
}
export const outbox = () => outboxSnapshot;
export function setOnline(on, cacheAt = null) {
  const changed = state.online !== on || state.cacheAt !== cacheAt;
  state.online = on;
  state.cacheAt = on ? null : cacheAt;
  if (changed) emit();
}

// ---- cache -------------------------------------------------------------------------
const basePath = (p) => p.split('?')[0];
export async function saveCache(path, data) {
  try { await idb.put('cache', { data, at: Date.now() }, path); } catch { /* storage full or blocked */ }
}
export async function readCache(path) {
  try {
    const exact = await idb.get('cache', path);
    if (exact) return exact;
    // Same page with other filters is better than nothing.
    const base = basePath(path);
    let best = null;
    for (const key of await idb.keys('cache')) {
      if (basePath(key) !== base) continue;
      const c = await idb.get('cache', key);
      if (c && (!best || c.at > best.at)) best = c;
    }
    return best;
  } catch {
    return null;
  }
}
export async function forget(path) {
  try { await idb.del('cache', path); } catch { /* ignore */ }
}

// ---- queue -------------------------------------------------------------------------
let lastTmp = 0;
function tmpId() {
  let t = -(Date.now() * 100);
  if (t >= lastTmp) t = lastTmp - 1;
  lastTmp = t;
  return t;
}
const newOpId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
export { newOpId };

// Creates (POST to a collection) get a temporary id so later changes can refer to them.
const CREATES = /^(products|parties|invoices|accounts|transactions|stock-moves|users)$/;

export async function enqueue(method, path, body, opId) {
  const op = {
    opId: opId || newOpId(),
    method, path, body: body ?? {},
    tmpId: method === 'POST' && CREATES.test(path) ? tmpId() : null,
    status: 'pending',
    error: null,
    createdAt: Date.now(),
  };
  op.seq = await idb.put('outbox', op);
  await refreshOutbox();
  return op;
}
export const hasQueued = () => outboxSnapshot.some((o) => o.status !== 'failed');

export async function retry(seq) {
  const op = await idb.get('outbox', seq);
  if (!op) return;
  op.status = 'pending';
  op.error = null;
  await idb.put('outbox', op);
  await refreshOutbox();
}
export async function discard(seq) {
  await idb.del('outbox', seq);
  await refreshOutbox();
}

// Swap temporary ids for real ones in the path and in any *_id field of the body.
function substitute(op, map) {
  const missing = [];
  const swap = (v) => {
    if (typeof v === 'number' && v < 0) {
      if (map[v] === undefined) missing.push(v);
      return map[v];
    }
    return v;
  };
  const walk = (v, key) => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, x] of Object.entries(v)) {
        if (!k.startsWith('_')) out[k] = walk(x, k); // _fields are display-only hints
      }
      return out;
    }
    return key && key.endsWith('_id') ? swap(Number(v) < 0 ? Number(v) : v) : v;
  };
  const path = op.path.replace(/(^|\/)(-\d+)(?=\/|$|\?)/g, (m, slash, n) => `${slash}${swap(Number(n))}`);
  const body = walk(op.body);
  if (missing.length) throw new Error('Bağlı olduğu yeni kayıt (cari, ürün veya hesap) gönderilemediği için bu değişiklik gönderilemedi.');
  return { path, body };
}

let sender = null; // (method, path, body, opId) => Promise; set by core
let afterSync = () => {};
export function configure({ send, onSynced }) {
  if (send) sender = send;
  if (onSynced) afterSync = onSynced;
}

let flushing = null;
export function flush() {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}
async function doFlush() {
  await refreshOutbox();
  if (!sender || !hasQueued()) return 0;
  state.syncing = true;
  emit();
  let sent = 0;
  try {
    const map = (await idb.get('meta', 'idmap')) || {};
    for (const op of outboxSnapshot) {
      if (op.status === 'failed') continue;
      let call;
      try {
        call = substitute(op, map);
      } catch (err) {
        await idb.put('outbox', { ...op, status: 'failed', error: err.message });
        continue;
      }
      try {
        const r = await sender(op.method, call.path, call.body, op.opId);
        if (op.tmpId && r && r.id) {
          map[op.tmpId] = r.id;
          await idb.put('meta', map, 'idmap');
        }
        await idb.del('outbox', op.seq);
        sent++;
        state.needsLogin = false;
      } catch (err) {
        if (err.status === 0) break; // still offline: keep the rest for later
        if (err.status === 401) {
          state.needsLogin = true;
          break;
        }
        await idb.put('outbox', { ...op, status: 'failed', error: err.message });
      }
    }
  } finally {
    state.syncing = false;
    await refreshOutbox();
  }
  if (sent) afterSync(sent);
  return sent;
}

// ---- show queued records in lists until they are sent ----------------------------------
const tl = (v) => Number(v) || 0;
function invoiceTotals(lines = []) {
  let net = 0;
  let vat = 0;
  for (const l of lines) {
    const gross = Math.round(tl(l.qty) * Math.round(tl(l.unit_price) * 100));
    const n = gross - Math.round((gross * tl(l.discount_rate)) / 100);
    net += n;
    vat += Math.round((n * tl(l.vat_rate)) / 100);
  }
  return { subtotal: net / 100, vat_total: vat / 100, total: (net + vat) / 100 };
}

export function overlay(path, data) {
  if (!Array.isArray(data) || !outboxSnapshot.length) return data;
  const base = basePath(path);
  const params = new URLSearchParams(path.split('?')[1] || '');
  const creates = outboxSnapshot.filter((o) => o.method === 'POST' && o.path === base && o.tmpId);
  if (!creates.length) return data;
  const partyName = (id) => {
    const p = outboxSnapshot.find((o) => o.tmpId === id);
    return p ? p.body.name : '';
  };
  const extra = creates.map((o) => {
    const b = o.body;
    const common = { id: o.tmpId, pending: true, pendingError: o.status === 'failed' ? o.error : null };
    switch (base) {
      case 'products':
        return {
          ...common, code: b.code || 'yeni', name: b.name, unit: b.unit || 'Adet', category: b.category || '',
          barcode: b.barcode || '', buy_price: tl(b.buy_price), sell_price: tl(b.sell_price), vat_rate: tl(b.vat_rate ?? 20),
          critical_level: tl(b.critical_level), stock: 0, avg_cost: tl(b.buy_price), critical: false, active: 1,
        };
      case 'parties':
        return {
          ...common, code: b.code || 'yeni', name: b.name, kind: b.kind || 'customer', phone: b.phone || '',
          tax_no: b.tax_no || '', balance: tl(b.opening_balance), opening_balance: tl(b.opening_balance), active: 1,
        };
      case 'accounts':
        return { ...common, name: b.name, kind: b.kind || 'cash', balance: tl(b.opening_balance), active: 1 };
      case 'invoices': {
        const t = invoiceTotals(b.lines);
        return {
          ...common, type: b.type, no: b.no || 'bekliyor', date: b.date, due_date: b.due_date || null,
          party_id: b.party_id, party_name: b.party_id < 0 ? partyName(b.party_id) : (b._party_name || ''),
          subtotal: t.subtotal, discount_total: 0, vat_total: t.vat_total, total: t.total, status: 'active',
        };
      }
      case 'transactions':
        return {
          ...common, kind: b.kind, date: b.date, amount: tl(b.amount),
          direction: { collection: 1, income: 1, payment: -1, expense: -1, transfer: -1 }[b.kind] || 1,
          account_name: b._account_name || '', party_name: b._party_name || (b.party_id < 0 ? partyName(b.party_id) : ''),
          category: b.category || '', description: b.description || '',
        };
      default:
        return null;
    }
  }).filter(Boolean);
  // Respect the simple list filters so a pending sale doesn't show up under purchases.
  const filtered = extra.filter((x) => {
    if (base === 'invoices' && params.get('type')) return params.get('type').split(',').includes(x.type);
    if (base === 'parties' && params.get('kind') === 'customer') return x.kind !== 'supplier';
    if (base === 'parties' && params.get('kind') === 'supplier') return x.kind !== 'customer';
    if (base === 'transactions' && params.get('kind')) return x.kind === params.get('kind');
    return true;
  });
  return [...filtered.reverse(), ...data];
}

// A short Turkish description of a queued change, for the sync panel.
const ENTITY = {
  products: 'ürün', parties: 'cari', invoices: 'fatura', accounts: 'hesap', transactions: 'kasa/banka işlemi',
  'stock-moves': 'stok hareketi', settings: 'ayarlar', users: 'kullanıcı',
};
const INVOICE = { sale: 'Satış faturası', purchase: 'Alış faturası', sale_return: 'Satış iade faturası', purchase_return: 'Alış iade faturası' };
const TX = { collection: 'Tahsilat', payment: 'Ödeme', income: 'Gelir', expense: 'Gider', transfer: 'Virman' };
const money = (n) => `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tl(n))} ₺`;
export function describe(op) {
  const [res, , action] = op.path.split('/');
  const b = op.body || {};
  if (op.method === 'POST' && res === 'invoices' && !action) {
    return `${INVOICE[b.type] || 'Fatura'} · ${b._party_name || (b.party_id < 0 ? 'yeni cari' : '')} · ${money(invoiceTotals(b.lines).total)}`;
  }
  if (op.method === 'POST' && res === 'transactions') return `${TX[b.kind] || 'İşlem'} · ${money(b.amount)}${b._party_name ? ` · ${b._party_name}` : ''}`;
  if (op.method === 'POST' && action === 'cancel') return 'Fatura iptali';
  if (op.method === 'POST' && res === 'stock-moves') return `Stok ${b.kind === 'in' ? 'girişi' : b.kind === 'out' ? 'çıkışı' : 'sayımı'} · ${b.qty}`;
  const what = ENTITY[res] || res;
  if (op.method === 'POST') return `Yeni ${what}${b.name ? ` · ${b.name}` : ''}`;
  if (op.method === 'PUT') return `${what[0].toLocaleUpperCase('tr')}${what.slice(1)} değişikliği${b.name ? ` · ${b.name}` : ''}`;
  if (op.method === 'DELETE') return `${what[0].toLocaleUpperCase('tr')}${what.slice(1)} silme`;
  return `${op.method} ${op.path}`;
}

export async function init() {
  await refreshOutbox();
}
