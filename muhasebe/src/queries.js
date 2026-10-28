'use strict';
// SQL fragments and sign rules shared by several modules.

// Current stock per product.
const STOCK_SQL = 'SELECT product_id, SUM(qty) AS qty FROM stock_moves GROUP BY product_id';

// Weighted average purchase cost (kuruş per unit) from stock that came in with a known cost.
const AVG_COST_SQL = `
  SELECT product_id, SUM(qty * unit_cost) / SUM(qty) AS avg_cost
    FROM stock_moves
   WHERE qty > 0 AND unit_cost IS NOT NULL
   GROUP BY product_id`;

// How each invoice type moves stock and the customer/supplier balance.
// stock: +1 goods come in, -1 goods go out.
// party: +1 the party owes us more (borç), -1 we owe the party more (alacak).
const INVOICE_TYPES = {
  sale: { stock: -1, party: 1, label: 'Satış Faturası', prefixKey: 'sale_prefix' },
  purchase: { stock: 1, party: -1, label: 'Alış Faturası', prefixKey: 'purchase_prefix' },
  sale_return: { stock: 1, party: -1, label: 'Satış İade Faturası', prefixKey: 'sale_return_prefix' },
  purchase_return: { stock: -1, party: 1, label: 'Alış İade Faturası', prefixKey: 'purchase_return_prefix' },
};

// Party balance effect of cash/bank movements: a collection lowers what they owe,
// a payment we make raises it (or lowers our debt).
const TX_PARTY_SIGN = { collection: -1, payment: 1 };

// Signed balance effect of every invoice and payment per party, in kuruş.
// Positive balance = the party owes us; negative = we owe the party.
const PARTY_MOVES_SQL = `
  SELECT party_id,
         CASE type WHEN 'sale' THEN total WHEN 'purchase_return' THEN total ELSE -total END AS amount
    FROM invoices WHERE status = 'active'
  UNION ALL
  SELECT party_id, CASE kind WHEN 'collection' THEN -amount ELSE amount END AS amount
    FROM transactions WHERE party_id IS NOT NULL AND kind IN ('collection','payment')`;

const PARTY_BALANCE_SQL = `
  SELECT p.id AS party_id, p.opening_balance + COALESCE(SUM(m.amount), 0) AS balance
    FROM parties p LEFT JOIN (${PARTY_MOVES_SQL}) m ON m.party_id = p.id
   GROUP BY p.id`;

const ACCOUNT_BALANCE_SQL = `
  SELECT a.id AS account_id, a.opening_balance + COALESCE(SUM(t.direction * t.amount), 0) AS balance
    FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
   GROUP BY a.id`;

const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

module.exports = {
  STOCK_SQL, AVG_COST_SQL, INVOICE_TYPES, TX_PARTY_SIGN, PARTY_BALANCE_SQL, ACCOUNT_BALANCE_SQL, round3,
};
