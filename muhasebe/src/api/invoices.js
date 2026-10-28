'use strict';
// Sales / purchase invoices and returns. Saving an invoice also writes its stock
// movements and, when paid on the spot, the matching cash/bank entry.
const { HttpError, badRequest, notFound, text, optText, num, money, id, date, oneOf, range, toTL } = require('../http');
const { INVOICE_TYPES, round3 } = require('../queries');

const TYPES = Object.keys(INVOICE_TYPES);

// All amounts in kuruş. Rounding happens per line, the way the printed invoice shows it.
function calcLine(qty, unitPrice, discountRate, vatRate) {
  const gross = Math.round(qty * unitPrice);
  const discount = Math.round((gross * discountRate) / 100);
  const net = gross - discount;
  const vat = Math.round((net * vatRate) / 100);
  return { gross, discount, net, vat, total: net + vat };
}

function readLines(db, lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw badRequest('Faturada en az bir satır olmalı.');
  if (lines.length > 500) throw badRequest('Bir faturada en fazla 500 satır olabilir.');
  return lines.map((l, i) => {
    const n = i + 1;
    const productId = id(l.product_id, `${n}. satır ürünü`, { required: false });
    let product = null;
    if (productId) {
      product = db.get('SELECT id, name, unit FROM products WHERE id = :id', { id: productId });
      if (!product) throw badRequest(`${n}. satırdaki ürün bulunamadı.`);
    }
    const description = text(l.description || (product && product.name), `${n}. satır açıklaması`, { required: true, max: 300 });
    const qty = num(l.qty, `${n}. satır miktarı`, { min: 0.001, max: 1e9 });
    const unitPrice = money(l.unit_price, `${n}. satır birim fiyatı`, { min: 0 });
    const discountRate = num(l.discount_rate, `${n}. satır iskontosu`, { min: 0, max: 100, required: false, decimals: 2 });
    const vatRate = num(l.vat_rate, `${n}. satır KDV oranı`, { min: 0, max: 100, required: false, decimals: 2 });
    return {
      line_no: n,
      product_id: productId,
      description,
      qty,
      unit: optText(l.unit || (product && product.unit), `${n}. satır birimi`, 20),
      unit_price: unitPrice,
      discount_rate: discountRate,
      vat_rate: vatRate,
      ...calcLine(qty, unitPrice, discountRate, vatRate),
    };
  });
}

function nextNo(db, type, docDate) {
  const prefix = (db.setting(INVOICE_TYPES[type].prefixKey) || '') + docDate.slice(0, 4);
  const rows = db.all('SELECT no FROM invoices WHERE type = :type AND no LIKE :like', { type, like: `${prefix}%` });
  let max = 0;
  for (const { no } of rows) {
    const rest = no.slice(prefix.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return prefix + String(max + 1).padStart(6, '0');
}

function writeLinesAndStock(db, invoiceId, type, docDate, lines, userId) {
  db.run('DELETE FROM invoice_lines WHERE invoice_id = :id', { id: invoiceId });
  db.run('DELETE FROM stock_moves WHERE invoice_id = :id', { id: invoiceId });
  const sign = INVOICE_TYPES[type].stock;
  for (const l of lines) {
    db.run(
      `INSERT INTO invoice_lines (invoice_id, line_no, product_id, description, qty, unit, unit_price,
              discount_rate, vat_rate, gross, discount, net, vat, total)
       VALUES (:invoice_id, :line_no, :product_id, :description, :qty, :unit, :unit_price,
              :discount_rate, :vat_rate, :gross, :discount, :net, :vat, :total)`,
      { invoice_id: invoiceId, ...l },
    );
    if (!l.product_id) continue;
    // Only purchases set the cost used for stock value and profit.
    const unitCost = type === 'purchase' ? Math.round(l.net / l.qty) : null;
    db.run(
      `INSERT INTO stock_moves (product_id, date, kind, qty, unit_cost, invoice_id, created_by)
       VALUES (:p, :d, 'invoice', :q, :c, :i, :u)`,
      { p: l.product_id, d: docDate, q: round3(sign * l.qty), c: unitCost, i: invoiceId, u: userId },
    );
  }
}

function totals(lines) {
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  return { subtotal: sum('gross'), discount_total: sum('discount'), vat_total: sum('vat'), total: sum('total') };
}

function readHeader(db, body, type) {
  const partyId = id(body.party_id, 'Cari');
  if (!db.get('SELECT 1 AS x FROM parties WHERE id = :id', { id: partyId })) throw badRequest('Cari bulunamadı.');
  const docDate = date(body.date, 'Fatura tarihi');
  const dueDate = date(body.due_date, 'Vade tarihi', { required: false });
  if (dueDate && dueDate < docDate) throw badRequest('Vade tarihi fatura tarihinden önce olamaz.');
  return {
    party_id: partyId,
    date: docDate,
    due_date: dueDate,
    note: optText(body.note, 'Not', 1000),
    no: text(body.no, 'Fatura no', { max: 40 }),
  };
}

function invoiceOut(inv) {
  return {
    ...inv,
    subtotal: toTL(inv.subtotal),
    discount_total: toTL(inv.discount_total),
    vat_total: toTL(inv.vat_total),
    total: toTL(inv.total),
    type_label: INVOICE_TYPES[inv.type].label,
  };
}

function register(r) {
  r.get('/api/invoices', ({ db, query }) => {
    const { from, to } = range(query);
    const where = ['i.date BETWEEN :from AND :to'];
    const p = { from, to };
    if (query.type) {
      const types = String(query.type).split(',').filter((t) => TYPES.includes(t));
      if (types.length) where.push(`i.type IN (${types.map((t) => `'${t}'`).join(',')})`);
    }
    if (query.party_id) {
      where.push('i.party_id = :party');
      p.party = id(query.party_id, 'Cari');
    }
    if (query.status === 'active' || query.status === 'cancelled') {
      where.push('i.status = :status');
      p.status = query.status;
    }
    const q = String(query.q || '').trim();
    if (q) {
      where.push('(i.no LIKE :like OR pa.name LIKE :like)');
      p.like = `%${q}%`;
    }
    return db.all(
      `SELECT i.id, i.type, i.no, i.date, i.due_date, i.subtotal, i.discount_total, i.vat_total, i.total, i.status,
              i.party_id, pa.name AS party_name
         FROM invoices i JOIN parties pa ON pa.id = i.party_id
        WHERE ${where.join(' AND ')}
        ORDER BY i.date DESC, i.id DESC LIMIT 2000`,
      p,
    ).map(invoiceOut);
  });

  r.get('/api/invoices/next-no', ({ db, query }) => {
    const type = oneOf(query.type, 'Fatura türü', TYPES);
    const docDate = date(query.date, 'Tarih', { required: false }) || new Date().toISOString().slice(0, 10);
    return { no: nextNo(db, type, docDate) };
  });

  r.get('/api/invoices/:id', ({ db, params }) => {
    const invoiceId = id(params.id, 'Fatura');
    const inv = db.get(
      `SELECT i.*, cu.name AS created_by_name, uu.name AS updated_by_name
         FROM invoices i
         LEFT JOIN users cu ON cu.id = i.created_by
         LEFT JOIN users uu ON uu.id = i.updated_by
        WHERE i.id = :id`,
      { id: invoiceId },
    );
    if (!inv) throw notFound();
    const party = db.get('SELECT * FROM parties WHERE id = :id', { id: inv.party_id });
    const lines = db.all('SELECT * FROM invoice_lines WHERE invoice_id = :id ORDER BY line_no', { id: invoiceId })
      .map((l) => ({
        ...l, qty: round3(l.qty), unit_price: toTL(l.unit_price), gross: toTL(l.gross), discount: toTL(l.discount),
        net: toTL(l.net), vat: toTL(l.vat), total: toTL(l.total),
      }));
    const payments = db.all(
      `SELECT t.id, t.date, t.kind, t.amount, a.name AS account_name
         FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.invoice_id = :id`,
      { id: invoiceId },
    ).map((t) => ({ ...t, amount: toTL(t.amount) }));
    // VAT breakdown per rate, as printed on the invoice.
    const vatBreakdown = db.all(
      `SELECT vat_rate, SUM(net) AS base, SUM(vat) AS vat FROM invoice_lines
        WHERE invoice_id = :id GROUP BY vat_rate ORDER BY vat_rate`,
      { id: invoiceId },
    ).map((v) => ({ vat_rate: v.vat_rate, base: toTL(v.base), vat: toTL(v.vat) }));
    return {
      ...invoiceOut(inv),
      party: { ...party, opening_balance: toTL(party.opening_balance) },
      lines,
      payments,
      vat_breakdown: vatBreakdown,
    };
  });

  r.post('/api/invoices', (ctx) => {
    const { db, body, user } = ctx;
    const type = oneOf(body.type, 'Fatura türü', TYPES);
    const accountId = id(body.payment_account_id, 'Ödeme hesabı', { required: false });
    const result = db.tx(() => {
      const h = readHeader(db, body, type);
      const lines = readLines(db, body.lines);
      const no = h.no || nextNo(db, type, h.date);
      if (db.get('SELECT 1 AS x FROM invoices WHERE type = :type AND no = :no', { type, no })) {
        throw badRequest(`${no} numaralı ${INVOICE_TYPES[type].label.toLocaleLowerCase('tr')} zaten var.`);
      }
      const t = totals(lines);
      const { id: invoiceId } = db.run(
        `INSERT INTO invoices (type, no, party_id, date, due_date, note, subtotal, discount_total, vat_total, total, created_by)
         VALUES (:type, :no, :party_id, :date, :due_date, :note, :subtotal, :discount_total, :vat_total, :total, :user)`,
        { type, ...h, no, ...t, user: user.id },
      );
      writeLinesAndStock(db, invoiceId, type, h.date, lines, user.id);
      if (accountId && t.total > 0) {
        if (!db.get('SELECT 1 AS x FROM accounts WHERE id = :id', { id: accountId })) throw badRequest('Ödeme hesabı bulunamadı.');
        // Money comes in when the party's debt goes up (sale), goes out otherwise.
        const incoming = INVOICE_TYPES[type].party === 1;
        db.run(
          `INSERT INTO transactions (account_id, date, kind, direction, amount, party_id, invoice_id, description, created_by)
           VALUES (:a, :d, :k, :dir, :amt, :p, :i, :desc, :u)`,
          {
            a: accountId, d: h.date, k: incoming ? 'collection' : 'payment', dir: incoming ? 1 : -1,
            amt: t.total, p: h.party_id, i: invoiceId, desc: `${no} nolu fatura ödemesi`, u: user.id,
          },
        );
      }
      return { id: invoiceId, no };
    });
    ctx.audit('create', 'invoice', result.id, result.no);
    return result;
  });

  r.put('/api/invoices/:id', (ctx) => {
    const { db, body, params, user } = ctx;
    const invoiceId = id(params.id, 'Fatura');
    const result = db.tx(() => {
      const inv = db.get('SELECT * FROM invoices WHERE id = :id', { id: invoiceId });
      if (!inv) throw notFound();
      if (inv.status !== 'active') throw badRequest('İptal edilmiş fatura düzenlenemez.');
      const h = readHeader(db, body, inv.type);
      const lines = readLines(db, body.lines);
      const no = h.no || inv.no;
      if (db.get('SELECT 1 AS x FROM invoices WHERE type = :type AND no = :no AND id <> :id', { type: inv.type, no, id: invoiceId })) {
        throw badRequest(`${no} numaralı fatura zaten var.`);
      }
      const t = totals(lines);
      db.run(
        `UPDATE invoices SET no = :no, party_id = :party_id, date = :date, due_date = :due_date, note = :note,
                subtotal = :subtotal, discount_total = :discount_total, vat_total = :vat_total, total = :total,
                updated_by = :user, updated_at = datetime('now')
          WHERE id = :id`,
        { ...h, no, ...t, user: user.id, id: invoiceId },
      );
      writeLinesAndStock(db, invoiceId, inv.type, h.date, lines, user.id);
      // A payment taken with the invoice follows its new total, party and date.
      const linked = db.all('SELECT id FROM transactions WHERE invoice_id = :id', { id: invoiceId });
      if (linked.length === 1) {
        db.run('UPDATE transactions SET amount = :amt, party_id = :p, date = :d WHERE id = :tid', {
          amt: t.total, p: h.party_id, d: h.date, tid: linked[0].id,
        });
      }
      return { id: invoiceId, no };
    });
    ctx.audit('update', 'invoice', invoiceId, result.no);
    return result;
  });

  // Cancelling keeps the record (and its number) but removes its effect on stock,
  // balances and the cash entry taken with it.
  r.post('/api/invoices/:id/cancel', (ctx) => {
    const { db, params, user } = ctx;
    const invoiceId = id(params.id, 'Fatura');
    const inv = db.tx(() => {
      const row = db.get('SELECT * FROM invoices WHERE id = :id', { id: invoiceId });
      if (!row) throw notFound();
      if (row.status === 'cancelled') throw new HttpError(409, 'Fatura zaten iptal edilmiş.');
      db.run("UPDATE invoices SET status = 'cancelled', updated_by = :u, updated_at = datetime('now') WHERE id = :id", { u: user.id, id: invoiceId });
      db.run('DELETE FROM stock_moves WHERE invoice_id = :id', { id: invoiceId });
      db.run('DELETE FROM transactions WHERE invoice_id = :id', { id: invoiceId });
      return row;
    });
    ctx.audit('cancel', 'invoice', invoiceId, inv.no);
    return { ok: true };
  });

  r.delete('/api/invoices/:id', { access: 'admin' }, (ctx) => {
    const { db, params } = ctx;
    const invoiceId = id(params.id, 'Fatura');
    const inv = db.tx(() => {
      const row = db.get('SELECT * FROM invoices WHERE id = :id', { id: invoiceId });
      if (!row) throw notFound();
      db.run('DELETE FROM transactions WHERE invoice_id = :id', { id: invoiceId });
      db.run('DELETE FROM invoices WHERE id = :id', { id: invoiceId });
      return row;
    });
    ctx.audit('delete', 'invoice', invoiceId, inv.no);
    return { ok: true };
  });
}

module.exports = { register, calcLine };
