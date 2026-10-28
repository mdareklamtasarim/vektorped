'use strict';
// Products (stock cards) and manual stock movements.
const { badRequest, notFound, text, optText, num, money, id, date, oneOf, bool, range, toTL } = require('../http');
const { STOCK_SQL, AVG_COST_SQL, round3 } = require('../queries');

function productOut(p) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    category: p.category,
    barcode: p.barcode,
    buy_price: toTL(p.buy_price),
    sell_price: toTL(p.sell_price),
    vat_rate: p.vat_rate,
    critical_level: p.critical_level,
    note: p.note,
    active: p.active,
    stock: round3(p.stock),
    avg_cost: p.avg_cost == null ? toTL(p.buy_price) : toTL(Math.round(p.avg_cost)),
    critical: p.critical_level > 0 && round3(p.stock) <= p.critical_level,
  };
}

const PRODUCT_SELECT = `
  SELECT p.*, COALESCE(s.qty, 0) AS stock, c.avg_cost
    FROM products p
    LEFT JOIN (${STOCK_SQL}) s ON s.product_id = p.id
    LEFT JOIN (${AVG_COST_SQL}) c ON c.product_id = p.id`;

function readProduct(body) {
  return {
    code: text(body.code, 'Stok kodu', { required: true, max: 40 }),
    name: text(body.name, 'Ürün adı', { required: true, max: 200 }),
    unit: text(body.unit || 'Adet', 'Birim', { required: true, max: 20 }),
    category: optText(body.category, 'Kategori', 80),
    barcode: optText(body.barcode, 'Barkod', 60),
    buy_price: money(body.buy_price, 'Alış fiyatı', { min: 0, required: false }),
    sell_price: money(body.sell_price, 'Satış fiyatı', { min: 0, required: false }),
    vat_rate: num(body.vat_rate, 'KDV oranı', { min: 0, max: 100, required: false, def: 20, decimals: 2 }),
    critical_level: num(body.critical_level, 'Kritik stok', { min: 0, required: false }),
    note: optText(body.note, 'Not', 1000),
    active: body.active === undefined ? 1 : bool(body.active) ? 1 : 0,
  };
}

function nextProductCode(db) {
  const row = db.get("SELECT code FROM products WHERE code GLOB 'STK[0-9]*' ORDER BY CAST(substr(code, 4) AS INTEGER) DESC LIMIT 1");
  const n = row ? Number(row.code.slice(3)) + 1 : 1;
  return `STK${String(n).padStart(5, '0')}`;
}

function currentStock(db, productId) {
  return round3(db.get('SELECT COALESCE(SUM(qty), 0) AS q FROM stock_moves WHERE product_id = :id', { id: productId }).q);
}

function register(r) {
  r.get('/api/products', ({ db, query }) => {
    const q = String(query.q || '').trim();
    const where = [];
    const p = {};
    if (q) {
      where.push('(p.name LIKE :like OR p.code LIKE :like OR p.category LIKE :like OR p.barcode = :q)');
      p.like = `%${q}%`;
      p.q = q;
    }
    if (query.active !== 'all') where.push('p.active = 1');
    let rows = db.all(`${PRODUCT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.name`, p)
      .map(productOut);
    if (bool(query.critical)) rows = rows.filter((x) => x.critical);
    return rows;
  });

  r.get('/api/products/next-code', ({ db }) => ({ code: nextProductCode(db) }));

  r.get('/api/products/:id', ({ db, params }) => {
    const productId = id(params.id, 'Ürün');
    const row = db.get(`${PRODUCT_SELECT} WHERE p.id = :id`, { id: productId });
    if (!row) throw notFound();
    const moves = db.all(
      `SELECT m.id, m.date, m.kind, m.qty, m.unit_cost, m.note, m.invoice_id,
              i.no AS invoice_no, i.type AS invoice_type, pa.name AS party_name, u.name AS user_name
         FROM stock_moves m
         LEFT JOIN invoices i ON i.id = m.invoice_id
         LEFT JOIN parties pa ON pa.id = i.party_id
         LEFT JOIN users u ON u.id = m.created_by
        WHERE m.product_id = :id
        ORDER BY m.date DESC, m.id DESC LIMIT 500`,
      { id: productId },
    ).map((m) => ({ ...m, qty: round3(m.qty), unit_cost: toTL(m.unit_cost) }));
    return { ...productOut(row), moves };
  });

  r.post('/api/products', (ctx) => {
    const { db, body } = ctx;
    const data = readProduct({ ...body, code: body.code || nextProductCode(db) });
    if (db.get('SELECT 1 AS x FROM products WHERE code = :c', { c: data.code })) throw badRequest('Bu stok kodu kullanılıyor.');
    const { id: newId } = db.run(
      `INSERT INTO products (code, name, unit, category, barcode, buy_price, sell_price, vat_rate, critical_level, note, active)
       VALUES (:code, :name, :unit, :category, :barcode, :buy_price, :sell_price, :vat_rate, :critical_level, :note, :active)`,
      data,
    );
    ctx.audit('create', 'product', newId, data.name);
    return { id: newId };
  });

  r.put('/api/products/:id', (ctx) => {
    const { db, body, params } = ctx;
    const productId = id(params.id, 'Ürün');
    if (!db.get('SELECT 1 AS x FROM products WHERE id = :id', { id: productId })) throw notFound();
    const data = readProduct(body);
    if (db.get('SELECT 1 AS x FROM products WHERE code = :c AND id <> :id', { c: data.code, id: productId })) {
      throw badRequest('Bu stok kodu kullanılıyor.');
    }
    db.run(
      `UPDATE products SET code = :code, name = :name, unit = :unit, category = :category, barcode = :barcode,
              buy_price = :buy_price, sell_price = :sell_price, vat_rate = :vat_rate,
              critical_level = :critical_level, note = :note, active = :active
        WHERE id = :id`,
      { ...data, id: productId },
    );
    ctx.audit('update', 'product', productId, data.name);
    return { ok: true };
  });

  r.delete('/api/products/:id', { access: 'admin' }, (ctx) => {
    const { db, params } = ctx;
    const productId = id(params.id, 'Ürün');
    const used = db.get(
      `SELECT (SELECT COUNT(*) FROM stock_moves WHERE product_id = :id)
            + (SELECT COUNT(*) FROM invoice_lines WHERE product_id = :id) AS n`,
      { id: productId },
    ).n;
    if (used > 0) throw badRequest('Bu ürünün hareketleri var, silinemez. Bunun yerine pasif yapabilirsiniz.');
    const { changes } = db.run('DELETE FROM products WHERE id = :id', { id: productId });
    if (!changes) throw notFound();
    ctx.audit('delete', 'product', productId);
    return { ok: true };
  });

  // ---- manual stock movements ------------------------------------------
  // kind 'in' / 'out': quantity entered as a positive amount.
  // kind 'count': the counted quantity; the difference from current stock is recorded.
  r.post('/api/stock-moves', (ctx) => {
    const { db, body, user } = ctx;
    const productId = id(body.product_id, 'Ürün');
    const kind = oneOf(body.kind, 'Hareket türü', ['in', 'out', 'count']);
    const moveDate = date(body.date, 'Tarih');
    const note = optText(body.note, 'Açıklama', 300);
    const newId = db.tx(() => {
      const product = db.get('SELECT id, name, buy_price FROM products WHERE id = :id', { id: productId });
      if (!product) throw notFound('Ürün bulunamadı.');
      let qty;
      let unitCost = null;
      if (kind === 'count') {
        const counted = num(body.qty, 'Sayılan miktar', { min: 0 });
        qty = round3(counted - currentStock(db, productId));
        if (qty === 0) throw badRequest('Sayılan miktar mevcut stokla aynı, fark yok.');
      } else {
        const amount = num(body.qty, 'Miktar', { min: 0.001 });
        qty = kind === 'in' ? amount : -amount;
        if (kind === 'in') {
          unitCost = body.unit_cost === undefined || body.unit_cost === '' || body.unit_cost === null
            ? product.buy_price
            : money(body.unit_cost, 'Birim maliyet', { min: 0 });
        }
      }
      const { id: moveId } = db.run(
        `INSERT INTO stock_moves (product_id, date, kind, qty, unit_cost, note, created_by)
         VALUES (:p, :d, :k, :q, :c, :n, :u)`,
        { p: productId, d: moveDate, k: kind, q: qty, c: unitCost, n: note, u: user.id },
      );
      return moveId;
    });
    ctx.audit('create', 'stock_move', newId, `${kind} ${body.qty}`);
    return { id: newId, stock: currentStock(db, productId) };
  });

  r.delete('/api/stock-moves/:id', (ctx) => {
    const { db, params } = ctx;
    const moveId = id(params.id, 'Hareket');
    const move = db.get('SELECT * FROM stock_moves WHERE id = :id', { id: moveId });
    if (!move) throw notFound();
    if (move.invoice_id) throw badRequest('Faturadan gelen hareket buradan silinemez; faturayı düzenleyin veya iptal edin.');
    db.run('DELETE FROM stock_moves WHERE id = :id', { id: moveId });
    ctx.audit('delete', 'stock_move', moveId, `${move.kind} ${move.qty}`);
    return { ok: true };
  });

  r.get('/api/stock-moves', ({ db, query }) => {
    const { from, to } = range(query);
    return db.all(
      `SELECT m.id, m.date, m.kind, m.qty, m.unit_cost, m.note, m.invoice_id, p.id AS product_id,
              p.code, p.name, p.unit, i.no AS invoice_no, i.type AS invoice_type
         FROM stock_moves m
         JOIN products p ON p.id = m.product_id
         LEFT JOIN invoices i ON i.id = m.invoice_id
        WHERE m.date BETWEEN :from AND :to
        ORDER BY m.date DESC, m.id DESC LIMIT 1000`,
      { from, to },
    ).map((m) => ({ ...m, qty: round3(m.qty), unit_cost: toTL(m.unit_cost) }));
  });
}

module.exports = { register, productOut, PRODUCT_SELECT };
