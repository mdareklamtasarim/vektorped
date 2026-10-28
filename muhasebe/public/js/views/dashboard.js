// Panel: today's and this month's figures, balances, critical stock and overdue invoices.
import { html, setHtml, get, fmtTL, fmtQty, fmtDate, INVOICE_TYPES, canWrite, emptyRow, session } from '../core.js';
import { transactionDialog } from './finance.js';

export async function dashboardView(root, ctx) {
  const d = await get('reports/dashboard');
  const m = d.month;
  const stat = (label, value, sub, cls = '') =>
    html`<div class="stat ${cls}"><span>${label}</span><strong>${value}</strong>${sub ? html`<small>${sub}</small>` : ''}</div>`;

  setHtml(root, html`
    <div class="page">
      <div class="page-head">
        <div><h1>Panel</h1><p class="muted">Merhaba ${session.user.name}, işte bugünkü durum.</p></div>
        ${canWrite() ? html`<div class="actions">
          <a class="btn primary" href="#/faturalar/yeni?tur=sale">+ Satış faturası</a>
          <a class="btn" href="#/faturalar/yeni?tur=purchase">+ Alış faturası</a>
          <button class="btn" data-tx="collection">Tahsilat</button>
          <button class="btn" data-tx="payment">Ödeme</button>
        </div>` : ''}
      </div>

      <div class="stats">
        ${stat('Bugünkü satış', fmtTL(d.today.net_sales), `${d.today.sales.count} fatura · KDV hariç`)}
        ${stat('Bu ayki satış', fmtTL(m.net_sales), 'KDV hariç, iadeler düşülmüş')}
        ${stat('Bu ayki brüt kâr', fmtTL(m.gross_profit), `Gider sonrası: ${fmtTL(m.operating_result)}`, m.gross_profit < 0 ? 'neg' : '')}
        ${stat('Kasa + Banka', fmtTL(d.cash_total), `${d.accounts.length} hesap`)}
        ${stat('Alacaklarımız', fmtTL(d.receivable), 'Müşterilerin borcu', 'pos')}
        ${stat('Borçlarımız', fmtTL(d.payable), 'Tedarikçilere borç', 'neg')}
      </div>

      <div class="grid-2">
        <section class="card">
          <header><h2>Hesap bakiyeleri</h2><a href="#/kasa">Tümü</a></header>
          <table class="table compact"><tbody>
            ${d.accounts.length ? d.accounts.map((a) => html`
              <tr class="link" data-href="#/kasa/${a.id}"><td>${a.name} <small class="muted">${a.kind === 'cash' ? 'Kasa' : 'Banka'}</small></td>
              <td class="num ${a.balance < 0 ? 'neg' : ''}">${fmtTL(a.balance)}</td></tr>`) : emptyRow(2)}
          </tbody></table>
        </section>

        <section class="card">
          <header><h2>Kritik stok</h2><a href="#/stok?kritik=1">Tümü</a></header>
          <table class="table compact"><tbody>
            ${d.critical.length ? d.critical.map((p) => html`
              <tr class="link" data-href="#/stok/${p.id}"><td>${p.name} <small class="muted">${p.code}</small></td>
              <td class="num neg">${fmtQty(p.stock)} ${p.unit}</td>
              <td class="num muted">min ${fmtQty(p.critical_level)}</td></tr>`) : emptyRow(3, 'Kritik seviyede ürün yok.')}
          </tbody></table>
        </section>

        <section class="card">
          <header><h2>Vadesi geçen satışlar</h2><a href="#/raporlar?tab=balances">Cari bakiyeler</a></header>
          <table class="table compact"><tbody>
            ${d.overdue.length ? d.overdue.map((i) => html`
              <tr class="link" data-href="#/faturalar/${i.id}"><td>${i.party_name}<br><small class="muted">${i.no} · vade ${fmtDate(i.due_date)}</small></td>
              <td class="num">${fmtTL(i.total)}<br><small class="muted">cari bakiye ${fmtTL(i.balance)}</small></td></tr>`) : emptyRow(2, 'Vadesi geçen fatura yok.')}
          </tbody></table>
        </section>

        <section class="card">
          <header><h2>Son faturalar</h2><a href="#/faturalar">Tümü</a></header>
          <table class="table compact"><tbody>
            ${d.recent.length ? d.recent.map((i) => html`
              <tr class="link ${i.status === 'cancelled' ? 'cancelled' : ''}" data-href="#/faturalar/${i.id}">
              <td>${i.party_name}<br><small class="muted">${INVOICE_TYPES[i.type].short} · ${i.no} · ${fmtDate(i.date)}</small></td>
              <td class="num">${fmtTL(i.total)}</td></tr>`) : emptyRow(2, 'Henüz fatura yok.')}
          </tbody></table>
        </section>
      </div>

      <section class="card">
        <header><h2>Bu ay özeti</h2><a href="#/raporlar">Raporlar</a></header>
        <div class="kv-grid">
          <div><span>Satış (KDV hariç)</span><strong>${fmtTL(m.sales.net)}</strong></div>
          <div><span>Satış iadesi</span><strong>${fmtTL(m.sale_returns.net)}</strong></div>
          <div><span>Alış (KDV hariç)</span><strong>${fmtTL(m.purchases.net)}</strong></div>
          <div><span>Satılan malın maliyeti</span><strong>${fmtTL(m.cost_of_sales)}</strong></div>
          <div><span>Diğer gelir</span><strong>${fmtTL(m.income)}</strong></div>
          <div><span>Giderler</span><strong>${fmtTL(m.expense)}</strong></div>
          <div><span>Tahsilat</span><strong>${fmtTL(m.collections)}</strong></div>
          <div><span>Ödeme</span><strong>${fmtTL(m.payments)}</strong></div>
          <div><span>Ödenecek KDV</span><strong>${fmtTL(m.vat_payable)}</strong></div>
        </div>
      </section>
    </div>`);

  root.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-href]');
    if (row) location.hash = row.dataset.href;
    const tx = e.target.closest('[data-tx]');
    if (tx && (await transactionDialog({ kind: tx.dataset.tx }))) ctx.reload();
  });
}
