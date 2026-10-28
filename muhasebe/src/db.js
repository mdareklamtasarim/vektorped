'use strict';
// SQLite database: schema, migrations and small query helpers.
// Money is stored as integer kuruş (1 TL = 100) so sums never pick up float errors.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','user','viewer')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Adet',
    category TEXT,
    barcode TEXT,
    buy_price INTEGER NOT NULL DEFAULT 0,
    sell_price INTEGER NOT NULL DEFAULT 0,
    vat_rate REAL NOT NULL DEFAULT 20,
    critical_level REAL NOT NULL DEFAULT 0,
    note TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE parties (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('customer','supplier','both')),
    tax_office TEXT,
    tax_no TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    note TEXT,
    opening_balance INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('sale','purchase','sale_return','purchase_return')),
    no TEXT NOT NULL,
    party_id INTEGER NOT NULL REFERENCES parties(id),
    date TEXT NOT NULL,
    due_date TEXT,
    note TEXT,
    subtotal INTEGER NOT NULL DEFAULT 0,
    discount_total INTEGER NOT NULL DEFAULT 0,
    vat_total INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    UNIQUE (type, no)
  );
  CREATE INDEX invoices_party ON invoices(party_id);
  CREATE INDEX invoices_date ON invoices(date);

  CREATE TABLE invoice_lines (
    id INTEGER PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    product_id INTEGER REFERENCES products(id),
    description TEXT NOT NULL,
    qty REAL NOT NULL,
    unit TEXT,
    unit_price INTEGER NOT NULL,
    discount_rate REAL NOT NULL DEFAULT 0,
    vat_rate REAL NOT NULL DEFAULT 0,
    gross INTEGER NOT NULL,
    discount INTEGER NOT NULL,
    net INTEGER NOT NULL,
    vat INTEGER NOT NULL,
    total INTEGER NOT NULL
  );
  CREATE INDEX invoice_lines_invoice ON invoice_lines(invoice_id);
  CREATE INDEX invoice_lines_product ON invoice_lines(product_id);

  CREATE TABLE stock_moves (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('invoice','in','out','count')),
    qty REAL NOT NULL,
    unit_cost INTEGER,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
    note TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX stock_moves_product ON stock_moves(product_id, date);
  CREATE INDEX stock_moves_invoice ON stock_moves(invoice_id);

  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    kind TEXT NOT NULL CHECK (kind IN ('cash','bank')),
    iban TEXT,
    opening_balance INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('collection','payment','income','expense','transfer')),
    direction INTEGER NOT NULL CHECK (direction IN (1,-1)),
    amount INTEGER NOT NULL CHECK (amount > 0),
    party_id INTEGER REFERENCES parties(id),
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    category TEXT,
    description TEXT,
    transfer_group TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX transactions_account ON transactions(account_id, date);
  CREATE INDEX transactions_party ON transactions(party_id);
  CREATE INDEX transactions_invoice ON transactions(invoice_id);

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT INTO settings (key, value) VALUES
    ('company_name', 'Firmam'),
    ('company_address', ''),
    ('company_phone', ''),
    ('company_tax_office', ''),
    ('company_tax_no', ''),
    ('sale_prefix', 'SF'),
    ('purchase_prefix', 'AF'),
    ('sale_return_prefix', 'SIF'),
    ('purchase_return_prefix', 'AIF');
  INSERT INTO accounts (name, kind) VALUES ('Merkez Kasa', 'cash');
  `,
];

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

// node:sqlite rejects undefined and booleans as parameters; normalise them.
function clean(params) {
  if (params == null) return {};
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  return out;
}

// Thin wrapper so handlers can write db.all(sql, {a: 1}) without preparing by hand.
function wrap(raw) {
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  let depth = 0;
  const api = {
    raw,
    all: (sql, p) => stmt(sql).all(clean(p)).map(plain),
    get: (sql, p) => plain(stmt(sql).get(clean(p))),
    run: (sql, p) => {
      const r = stmt(sql).run(clean(p));
      return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
    exec: (sql) => raw.exec(sql),
    // Runs fn inside one transaction. Nested calls join the outer transaction.
    tx(fn) {
      if (depth > 0) return fn();
      raw.exec('BEGIN IMMEDIATE');
      depth++;
      try {
        const result = fn();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      } finally {
        depth--;
      }
    },
    setting(key) {
      const row = api.get('SELECT value FROM settings WHERE key = :key', { key });
      return row ? row.value : null;
    },
    close: () => raw.close(),
  };
  return api;
}

function plain(row) {
  return row ? { ...row } : row;
}

module.exports = {
  openDb: (file) => wrap(open(file)),
};
