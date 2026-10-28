'use strict';
// Cash and bank accounts, and money movements: collections, payments,
// other income / expenses and transfers between accounts.
const crypto = require('node:crypto');
const { badRequest, notFound, text, optText, money, id, date, oneOf, bool, range, toTL } = require('../http');
const { ACCOUNT_BALANCE_SQL } = require('../queries');

const TX_KINDS = ['collection', 'payment', 'income', 'expense', 'transfer'];
const DIRECTION = { collection: 1, payment: -1, income: 1, expense: -1 };

function accountOut(a) {
  return { ...a, opening_balance: toTL(a.opening_balance), balance: toTL(a.balance ?? 0) };
}

function readAccount(body) {
  return {
    name: text(body.name, 'Hesap adı', { required: true, max: 80 }),
    kind: oneOf(body.kind || 'cash', 'Hesap türü', ['cash', 'bank']),
    iban: optText(body.iban, 'IBAN', 40),
    opening_balance: money(body.opening_balance, 'Açılış bakiyesi', { required: false, min: -1e11 }),
    active: body.active === undefined ? 1 : bool(body.active) ? 1 : 0,
  };
}

function txOut(t) {
  return { ...t, amount: toTL(t.amount) };
}

const TX_SELECT = `
  SELECT t.id, t.account_id, a.name AS account_name, t.date, t.kind, t.direction, t.amount, t.party_id,
         p.name AS party_name, t.invoice_id, i.no AS invoice_no, t.category, t.description, t.transfer_group,
         u.name AS user_name, t.created_at
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN parties p ON p.id = t.party_id
    LEFT JOIN invoices i ON i.id = t.invoice_id
    LEFT JOIN users u ON u.id = t.created_by`;

function readCommon(db, body, kind) {
  const out = {
    date: date(body.date, 'Tarih'),
    amount: money(body.amount, 'Tutar', { min: 0.01 }),
    description: optText(body.description, 'Açıklama', 300),
    category: null,
    party_id: null,
  };
  if (kind === 'collection' || kind === 'payment') {
    out.party_id = id(body.party_id, 'Cari');
    if (!db.get('SELECT 1 AS x FROM parties WHERE id = :id', { id: out.party_id })) throw badRequest('Cari bulunamadı.');
  }
  if (kind === 'income' || kind === 'expense') {
    out.category = text(body.category, 'Kategori', { required: true, max: 80 });
  }
  return out;
}

function requireAccount(db, accountId, label = 'Hesap') {
  if (!db.get('SELECT 1 AS x FROM accounts WHERE id = :id', { id: accountId })) throw badRequest(`${label} bulunamadı.`);
}

function register(r) {
  // ---- accounts --------------------------------------------------------
  r.get('/api/accounts', ({ db, query }) =>
    db.all(
      `SELECT a.*, b.balance FROM accounts a JOIN (${ACCOUNT_BALANCE_SQL}) b ON b.account_id = a.id
        ${query.active === 'all' ? '' : 'WHERE a.active = 1'} ORDER BY a.kind, a.name`,
    ).map(accountOut));

  r.get('/api/accounts/:id', ({ db, params, query }) => {
    const accountId = id(params.id, 'Hesap');
    const acc = db.get(
      `SELECT a.*, b.balance FROM accounts a JOIN (${ACCOUNT_BALANCE_SQL}) b ON b.account_id = a.id WHERE a.id = :id`,
      { id: accountId },
    );
    if (!acc) throw notFound();
    const { from, to } = range(query);
    let balance = acc.opening_balance;
    let carried = balance;
    const rows = [];
    for (const t of db.all(`${TX_SELECT} WHERE t.account_id = :id ORDER BY t.date, t.created_at, t.id`, { id: accountId })) {
      if (t.date > to) break;
      balance += t.direction * t.amount;
      if (t.date < from) {
        carried = balance;
        continue;
      }
      rows.push({ ...txOut(t), balance: toTL(balance) });
    }
    return { ...accountOut(acc), statement: { carried: toTL(carried), rows, closing: toTL(balance) } };
  });

  r.post('/api/accounts', (ctx) => {
    const { db, body } = ctx;
    const data = readAccount(body);
    if (db.get('SELECT 1 AS x FROM accounts WHERE name = :n', { n: data.name })) throw badRequest('Bu isimde bir hesap var.');
    const { id: newId } = db.run(
      'INSERT INTO accounts (name, kind, iban, opening_balance, active) VALUES (:name, :kind, :iban, :opening_balance, :active)',
      data,
    );
    ctx.audit('create', 'account', newId, data.name);
    return { id: newId };
  });

  r.put('/api/accounts/:id', (ctx) => {
    const { db, body, params } = ctx;
    const accountId = id(params.id, 'Hesap');
    if (!db.get('SELECT 1 AS x FROM accounts WHERE id = :id', { id: accountId })) throw notFound();
    const data = readAccount(body);
    if (db.get('SELECT 1 AS x FROM accounts WHERE name = :n AND id <> :id', { n: data.name, id: accountId })) {
      throw badRequest('Bu isimde bir hesap var.');
    }
    db.run(
      `UPDATE accounts SET name = :name, kind = :kind, iban = :iban, opening_balance = :opening_balance, active = :active
        WHERE id = :id`,
      { ...data, id: accountId },
    );
    ctx.audit('update', 'account', accountId, data.name);
    return { ok: true };
  });

  r.delete('/api/accounts/:id', { access: 'admin' }, (ctx) => {
    const { db, params } = ctx;
    const accountId = id(params.id, 'Hesap');
    if (db.get('SELECT 1 AS x FROM transactions WHERE account_id = :id LIMIT 1', { id: accountId })) {
      throw badRequest('Bu hesapta hareket var, silinemez. Bunun yerine pasif yapabilirsiniz.');
    }
    const { changes } = db.run('DELETE FROM accounts WHERE id = :id', { id: accountId });
    if (!changes) throw notFound();
    ctx.audit('delete', 'account', accountId);
    return { ok: true };
  });

  // ---- transactions ----------------------------------------------------
  r.get('/api/transactions', ({ db, query }) => {
    const { from, to } = range(query);
    const where = ['t.date BETWEEN :from AND :to'];
    const p = { from, to };
    if (query.account_id) {
      where.push('t.account_id = :acc');
      p.acc = id(query.account_id, 'Hesap');
    }
    if (query.party_id) {
      where.push('t.party_id = :party');
      p.party = id(query.party_id, 'Cari');
    }
    if (TX_KINDS.includes(query.kind)) {
      where.push('t.kind = :kind');
      p.kind = query.kind;
    }
    return db.all(`${TX_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.date DESC, t.id DESC LIMIT 2000`, p).map(txOut);
  });

  r.get('/api/transactions/categories', ({ db }) => ({
    income: db.all("SELECT DISTINCT category FROM transactions WHERE kind = 'income' AND category IS NOT NULL ORDER BY category").map((x) => x.category),
    expense: db.all("SELECT DISTINCT category FROM transactions WHERE kind = 'expense' AND category IS NOT NULL ORDER BY category").map((x) => x.category),
  }));

  r.post('/api/transactions', (ctx) => {
    const { db, body, user } = ctx;
    const kind = oneOf(body.kind, 'İşlem türü', TX_KINDS);
    const accountId = id(body.account_id, 'Hesap');
    const ids = db.tx(() => {
      requireAccount(db, accountId);
      const c = readCommon(db, body, kind);
      const insert = (accId, dir, group) => db.run(
        `INSERT INTO transactions (account_id, date, kind, direction, amount, party_id, category, description, transfer_group, created_by)
         VALUES (:a, :d, :k, :dir, :amt, :p, :cat, :desc, :g, :u)`,
        {
          a: accId, d: c.date, k: kind, dir, amt: c.amount, p: c.party_id, cat: c.category,
          desc: c.description, g: group, u: user.id,
        },
      ).id;
      if (kind === 'transfer') {
        const toId = id(body.to_account_id, 'Hedef hesap');
        if (toId === accountId) throw badRequest('Virman için iki farklı hesap seçilmeli.');
        requireAccount(db, toId, 'Hedef hesap');
        const group = crypto.randomUUID();
        return [insert(accountId, -1, group), insert(toId, 1, group)];
      }
      return [insert(accountId, DIRECTION[kind], null)];
    });
    ctx.audit('create', 'transaction', ids[0], `${kind} ${body.amount}`);
    return { id: ids[0], ids };
  });

  r.put('/api/transactions/:id', (ctx) => {
    const { db, body, params } = ctx;
    const txId = id(params.id, 'İşlem');
    db.tx(() => {
      const t = db.get('SELECT * FROM transactions WHERE id = :id', { id: txId });
      if (!t) throw notFound();
      if (t.transfer_group) throw badRequest('Virman düzenlenemez; silip yeniden girin.');
      const accountId = id(body.account_id ?? t.account_id, 'Hesap');
      requireAccount(db, accountId);
      const c = readCommon(db, body, t.kind);
      db.run(
        `UPDATE transactions SET account_id = :a, date = :d, amount = :amt, party_id = :p, category = :cat, description = :desc
          WHERE id = :id`,
        { a: accountId, d: c.date, amt: c.amount, p: c.party_id, cat: c.category, desc: c.description, id: txId },
      );
    });
    ctx.audit('update', 'transaction', txId);
    return { ok: true };
  });

  r.delete('/api/transactions/:id', (ctx) => {
    const { db, params } = ctx;
    const txId = id(params.id, 'İşlem');
    const t = db.get('SELECT * FROM transactions WHERE id = :id', { id: txId });
    if (!t) throw notFound();
    if (t.transfer_group) db.run('DELETE FROM transactions WHERE transfer_group = :g', { g: t.transfer_group });
    else db.run('DELETE FROM transactions WHERE id = :id', { id: txId });
    ctx.audit('delete', 'transaction', txId, `${t.kind} ${toTL(t.amount)}`);
    return { ok: true };
  });
}

module.exports = { register };
