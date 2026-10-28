'use strict';
// Customers and suppliers (cari hesaplar) and their statements.
const { badRequest, notFound, text, optText, money, id, oneOf, bool, range, toTL } = require('../http');
const { PARTY_BALANCE_SQL } = require('../queries');

const KINDS = ['customer', 'supplier', 'both'];

function readParty(body) {
  const email = optText(body.email, 'E-posta', 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('E-posta adresi geçersiz.');
  return {
    code: text(body.code, 'Cari kodu', { required: true, max: 40 }),
    name: text(body.name, 'Unvan', { required: true, max: 200 }),
    kind: oneOf(body.kind || 'customer', 'Cari türü', KINDS),
    tax_office: optText(body.tax_office, 'Vergi dairesi', 80),
    tax_no: optText(body.tax_no, 'Vergi / TC no', 20),
    phone: optText(body.phone, 'Telefon', 40),
    email,
    address: optText(body.address, 'Adres', 500),
    note: optText(body.note, 'Not', 1000),
    // Signed: positive = they owe us, negative = we owe them.
    opening_balance: money(body.opening_balance, 'Açılış bakiyesi', { required: false, min: -1e11 }),
    active: body.active === undefined ? 1 : bool(body.active) ? 1 : 0,
  };
}

function partyOut(p) {
  return { ...p, opening_balance: toTL(p.opening_balance), balance: toTL(p.balance ?? 0) };
}

function nextPartyCode(db) {
  const row = db.get("SELECT code FROM parties WHERE code GLOB 'CR[0-9]*' ORDER BY CAST(substr(code, 3) AS INTEGER) DESC LIMIT 1");
  const n = row ? Number(row.code.slice(2)) + 1 : 1;
  return `CR${String(n).padStart(5, '0')}`;
}

// Every invoice and payment of a party as debit (borç) / credit (alacak) rows.
const STATEMENT_SQL = `
  SELECT * FROM (
    SELECT 'invoice' AS source, i.id AS ref_id, i.date, i.type AS kind, i.no AS doc_no,
           COALESCE(i.note, '') AS description,
           CASE WHEN i.type IN ('sale','purchase_return') THEN i.total ELSE 0 END AS debit,
           CASE WHEN i.type IN ('purchase','sale_return') THEN i.total ELSE 0 END AS credit,
           i.created_at
      FROM invoices i WHERE i.party_id = :id AND i.status = 'active'
    UNION ALL
    SELECT 'transaction', t.id, t.date, t.kind, a.name, COALESCE(t.description, ''),
           CASE WHEN t.kind = 'payment' THEN t.amount ELSE 0 END,
           CASE WHEN t.kind = 'collection' THEN t.amount ELSE 0 END,
           t.created_at
      FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.party_id = :id AND t.kind IN ('collection','payment')
  ) ORDER BY date, created_at, CASE source WHEN 'invoice' THEN 0 ELSE 1 END, ref_id`;

function statement(db, partyId, opening, from, to) {
  let balance = opening;
  let carried = opening;
  const rows = [];
  for (const r of db.all(STATEMENT_SQL, { id: partyId })) {
    if (r.date > to) break;
    balance += r.debit - r.credit;
    if (r.date < from) {
      carried = balance;
      continue;
    }
    rows.push({ ...r, debit: toTL(r.debit), credit: toTL(r.credit), balance: toTL(balance) });
  }
  return { carried: toTL(carried), rows, closing: toTL(balance) };
}

function register(r) {
  r.get('/api/parties', ({ db, query }) => {
    const where = [];
    const p = {};
    const q = String(query.q || '').trim();
    if (q) {
      where.push('(p.name LIKE :like OR p.code LIKE :like OR p.tax_no = :q OR p.phone LIKE :like)');
      p.like = `%${q}%`;
      p.q = q;
    }
    if (query.kind === 'customer') where.push("p.kind IN ('customer','both')");
    if (query.kind === 'supplier') where.push("p.kind IN ('supplier','both')");
    if (query.active !== 'all') where.push('p.active = 1');
    if (query.balance === 'debt') where.push('b.balance > 0');
    if (query.balance === 'credit') where.push('b.balance < 0');
    return db.all(
      `SELECT p.*, b.balance FROM parties p JOIN (${PARTY_BALANCE_SQL}) b ON b.party_id = p.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.name`,
      p,
    ).map(partyOut);
  });

  r.get('/api/parties/next-code', ({ db }) => ({ code: nextPartyCode(db) }));

  r.get('/api/parties/:id', ({ db, params, query }) => {
    const partyId = id(params.id, 'Cari');
    const row = db.get(
      `SELECT p.*, b.balance FROM parties p JOIN (${PARTY_BALANCE_SQL}) b ON b.party_id = p.id WHERE p.id = :id`,
      { id: partyId },
    );
    if (!row) throw notFound();
    const { from, to } = range(query);
    return { ...partyOut(row), statement: statement(db, partyId, row.opening_balance, from, to) };
  });

  r.post('/api/parties', (ctx) => {
    const { db, body } = ctx;
    const data = readParty({ ...body, code: body.code || nextPartyCode(db) });
    if (db.get('SELECT 1 AS x FROM parties WHERE code = :c', { c: data.code })) throw badRequest('Bu cari kodu kullanılıyor.');
    const { id: newId } = db.run(
      `INSERT INTO parties (code, name, kind, tax_office, tax_no, phone, email, address, note, opening_balance, active)
       VALUES (:code, :name, :kind, :tax_office, :tax_no, :phone, :email, :address, :note, :opening_balance, :active)`,
      data,
    );
    ctx.audit('create', 'party', newId, data.name);
    return { id: newId };
  });

  r.put('/api/parties/:id', (ctx) => {
    const { db, body, params } = ctx;
    const partyId = id(params.id, 'Cari');
    if (!db.get('SELECT 1 AS x FROM parties WHERE id = :id', { id: partyId })) throw notFound();
    const data = readParty(body);
    if (db.get('SELECT 1 AS x FROM parties WHERE code = :c AND id <> :id', { c: data.code, id: partyId })) {
      throw badRequest('Bu cari kodu kullanılıyor.');
    }
    db.run(
      `UPDATE parties SET code = :code, name = :name, kind = :kind, tax_office = :tax_office, tax_no = :tax_no,
              phone = :phone, email = :email, address = :address, note = :note,
              opening_balance = :opening_balance, active = :active
        WHERE id = :id`,
      { ...data, id: partyId },
    );
    ctx.audit('update', 'party', partyId, data.name);
    return { ok: true };
  });

  r.delete('/api/parties/:id', { access: 'admin' }, (ctx) => {
    const { db, params } = ctx;
    const partyId = id(params.id, 'Cari');
    const used = db.get(
      `SELECT (SELECT COUNT(*) FROM invoices WHERE party_id = :id)
            + (SELECT COUNT(*) FROM transactions WHERE party_id = :id) AS n`,
      { id: partyId },
    ).n;
    if (used > 0) throw badRequest('Bu carinin faturası veya ödemesi var, silinemez. Bunun yerine pasif yapabilirsiniz.');
    const { changes } = db.run('DELETE FROM parties WHERE id = :id', { id: partyId });
    if (!changes) throw notFound();
    ctx.audit('delete', 'party', partyId);
    return { ok: true };
  });
}

module.exports = { register };
