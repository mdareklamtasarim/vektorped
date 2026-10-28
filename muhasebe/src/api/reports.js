'use strict';
// Dashboard and reports. All sums are done in kuruş and converted at the end.
const { range, toTL, num } = require('../http');
const { STOCK_SQL, AVG_COST_SQL, PARTY_BALANCE_SQL, ACCOUNT_BALANCE_SQL, round3 } = require('../queries');

function today() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// Net sales/purchases (after returns), VAT, cash flows and gross profit for a period.
function summary(db, from, to) {
  const inv = {};
  for (const row of db.all(
    `SELECT type, COUNT(*) AS n, SUM(total - vat_total) AS net, SUM(vat_total) AS vat, SUM(total) AS total
       FROM invoices WHERE status = 'active' AND date BETWEEN :from AND :to GROUP BY type`,
    { from, to },
  )) inv[row.type] = row;
  const g = (t, k) => (inv[t] ? inv[t][k] || 0 : 0);

  const tx = {};
  for (const row of db.all(
    `SELECT kind, SUM(amount) AS total FROM transactions
      WHERE date BETWEEN :from AND :to AND kind <> 'transfer' GROUP BY kind`,
    { from, to },
  )) tx[row.kind] = row.total || 0;

  const profit = profitRows(db, from, to);
  const cost = profit.reduce((s, r) => s + r.costK, 0);
  const salesNet = g('sale', 'net') - g('sale_return', 'net');

  return {
    from, to,
    sales: { count: g('sale', 'n'), net: toTL(g('sale', 'net')), vat: toTL(g('sale', 'vat')), total: toTL(g('sale', 'total')) },
    sale_returns: { count: g('sale_return', 'n'), net: toTL(g('sale_return', 'net')), vat: toTL(g('sale_return', 'vat')), total: toTL(g('sale_return', 'total')) },
    purchases: { count: g('purchase', 'n'), net: toTL(g('purchase', 'net')), vat: toTL(g('purchase', 'vat')), total: toTL(g('purchase', 'total')) },
    purchase_returns: { count: g('purchase_return', 'n'), net: toTL(g('purchase_return', 'net')), vat: toTL(g('purchase_return', 'vat')), total: toTL(g('purchase_return', 'total')) },
    net_sales: toTL(salesNet),
    net_purchases: toTL(g('purchase', 'net') - g('purchase_return', 'net')),
    // Hesaplanan KDV (sales) and indirilecek KDV (purchases), each net of returns.
    vat_output: toTL(g('sale', 'vat') - g('sale_return', 'vat')),
    vat_input: toTL(g('purchase', 'vat') - g('purchase_return', 'vat')),
    vat_payable: toTL(g('sale', 'vat') - g('sale_return', 'vat') - g('purchase', 'vat') + g('purchase_return', 'vat')),
    collections: toTL(tx.collection || 0),
    payments: toTL(tx.payment || 0),
    income: toTL(tx.income || 0),
    expense: toTL(tx.expense || 0),
    cost_of_sales: toTL(cost),
    gross_profit: toTL(salesNet - cost),
    // Gross profit plus other income minus expenses (excludes depreciation, tax etc.).
    operating_result: toTL(salesNet - cost + (tx.income || 0) - (tx.expense || 0)),
  };
}

// Per-product sales and cost. Cost uses each product's weighted average purchase cost,
// falling back to the purchase price on its stock card.
function profitRows(db, from, to) {
  const rows = db.all(
    `SELECT l.product_id, COALESCE(p.code, '') AS code, COALESCE(p.name, l.description) AS name,
            COALESCE(p.unit, l.unit) AS unit,
            SUM(CASE i.type WHEN 'sale' THEN l.qty ELSE -l.qty END) AS qty,
            SUM(CASE i.type WHEN 'sale' THEN l.net ELSE -l.net END) AS revenue,
            COALESCE(c.avg_cost, p.buy_price, 0) AS unit_cost
       FROM invoice_lines l
       JOIN invoices i ON i.id = l.invoice_id
       LEFT JOIN products p ON p.id = l.product_id
       LEFT JOIN (${AVG_COST_SQL}) c ON c.product_id = l.product_id
      WHERE i.status = 'active' AND i.type IN ('sale','sale_return') AND i.date BETWEEN :from AND :to
      GROUP BY COALESCE(l.product_id, 'x' || l.description)
      ORDER BY revenue DESC`,
    { from, to },
  );
  return rows.map((r) => {
    // Lines without a product (services) carry no stock cost.
    const costK = r.product_id ? Math.round(r.qty * r.unit_cost) : 0;
    return { ...r, costK };
  });
}

function register(r) {
  r.get('/api/reports/dashboard', ({ db }) => {
    const t = today();
    const month = `${t.slice(0, 7)}-01`;
    const balances = db.get(
      `SELECT SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END) AS receivable,
              SUM(CASE WHEN balance < 0 THEN -balance ELSE 0 END) AS payable
         FROM (${PARTY_BALANCE_SQL})`,
    );
    const accounts = db.all(
      `SELECT a.id, a.name, a.kind, b.balance FROM accounts a JOIN (${ACCOUNT_BALANCE_SQL}) b ON b.account_id = a.id
        WHERE a.active = 1 ORDER BY a.kind, a.name`,
    );
    const critical = db.all(
      `SELECT p.id, p.code, p.name, p.unit, p.critical_level, COALESCE(s.qty, 0) AS stock
         FROM products p LEFT JOIN (${STOCK_SQL}) s ON s.product_id = p.id
        WHERE p.active = 1 AND p.critical_level > 0 AND COALESCE(s.qty, 0) <= p.critical_level
        ORDER BY p.name LIMIT 50`,
    ).map((p) => ({ ...p, stock: round3(p.stock) }));
    const overdue = db.all(
      `SELECT i.id, i.no, i.type, i.date, i.due_date, i.total, pa.id AS party_id, pa.name AS party_name, b.balance
         FROM invoices i JOIN parties pa ON pa.id = i.party_id
         JOIN (${PARTY_BALANCE_SQL}) b ON b.party_id = pa.id
        WHERE i.status = 'active' AND i.type = 'sale' AND i.due_date IS NOT NULL AND i.due_date < :t AND b.balance > 0
        ORDER BY i.due_date LIMIT 20`,
      { t },
    ).map((i) => ({ ...i, total: toTL(i.total), balance: toTL(i.balance) }));
    const recent = db.all(
      `SELECT i.id, i.no, i.type, i.date, i.total, i.status, pa.name AS party_name
         FROM invoices i JOIN parties pa ON pa.id = i.party_id ORDER BY i.id DESC LIMIT 8`,
    ).map((i) => ({ ...i, total: toTL(i.total) }));
    return {
      today: summary(db, t, t),
      month: summary(db, month, t),
      receivable: toTL(balances.receivable || 0),
      payable: toTL(balances.payable || 0),
      cash_total: toTL(accounts.reduce((s, a) => s + a.balance, 0)),
      accounts: accounts.map((a) => ({ ...a, balance: toTL(a.balance) })),
      critical,
      overdue,
      recent,
    };
  });

  r.get('/api/reports/summary', ({ db, query }) => {
    const { from, to } = range(query);
    return summary(db, from, to);
  });

  r.get('/api/reports/profit', ({ db, query }) => {
    const { from, to } = range(query);
    return profitRows(db, from, to).map((x) => ({
      product_id: x.product_id, code: x.code, name: x.name, unit: x.unit, qty: round3(x.qty),
      revenue: toTL(x.revenue), cost: toTL(x.costK), profit: toTL(x.revenue - x.costK),
      margin: x.revenue ? Math.round(((x.revenue - x.costK) / x.revenue) * 1000) / 10 : null,
    }));
  });

  r.get('/api/reports/stock-value', ({ db }) =>
    db.all(
      `SELECT p.id, p.code, p.name, p.unit, p.category, COALESCE(s.qty, 0) AS qty,
              COALESCE(c.avg_cost, p.buy_price) AS unit_cost, p.sell_price
         FROM products p
         LEFT JOIN (${STOCK_SQL}) s ON s.product_id = p.id
         LEFT JOIN (${AVG_COST_SQL}) c ON c.product_id = p.id
        WHERE p.active = 1 ORDER BY p.name`,
    ).map((p) => {
      const qty = round3(p.qty);
      return {
        id: p.id, code: p.code, name: p.name, unit: p.unit, category: p.category, qty,
        unit_cost: toTL(Math.round(p.unit_cost)), value: toTL(Math.round(Math.max(qty, 0) * p.unit_cost)),
        sale_value: toTL(Math.round(Math.max(qty, 0) * p.sell_price)),
      };
    }));

  r.get('/api/reports/balances', ({ db }) =>
    db.all(
      `SELECT p.id, p.code, p.name, p.kind, p.phone, b.balance
         FROM parties p JOIN (${PARTY_BALANCE_SQL}) b ON b.party_id = p.id
        WHERE b.balance <> 0 ORDER BY b.balance DESC`,
    ).map((p) => ({ ...p, balance: toTL(p.balance) })));

  r.get('/api/reports/categories', ({ db, query }) => {
    const { from, to } = range(query);
    return db.all(
      `SELECT kind, COALESCE(category, '-') AS category, COUNT(*) AS n, SUM(amount) AS total
         FROM transactions WHERE kind IN ('income','expense') AND date BETWEEN :from AND :to
        GROUP BY kind, category ORDER BY kind, total DESC`,
      { from, to },
    ).map((x) => ({ ...x, total: toTL(x.total) }));
  });

  r.get('/api/reports/monthly', ({ db, query }) => {
    const year = num(query.year, 'Yıl', { min: 2000, max: 2100, required: false, def: Number(today().slice(0, 4)), decimals: 0 });
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const s = summary(db, `${year}-${mm}-01`, `${year}-${mm}-31`);
      months.push({
        month: m, net_sales: s.net_sales, net_purchases: s.net_purchases, income: s.income, expense: s.expense,
        gross_profit: s.gross_profit, collections: s.collections, payments: s.payments, vat_payable: s.vat_payable,
      });
    }
    return { year, months };
  });
}

module.exports = { register, summary };
