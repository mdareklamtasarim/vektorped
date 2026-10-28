// Reports: period summary with VAT, profit by product, stock value, balances,
// income/expense categories and a monthly table.
import {
  html, setHtml, get, qs, fmtTL, fmtMoney, fmtQty, fmtDate, emptyRow, downloadCsv, rangeBar, bindRangeBar, balanceText,
  PARTY_KINDS, session,
  navigate,
} from '../core.js';

const TABS = {
  ozet: 'Özet & KDV',
  kar: 'Ürün kârlılığı',
  stok: 'Stok değeri',
  balances: 'Cari bakiyeler',
  kategori: 'Gelir / gider',
  aylik: 'Aylık',
};
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export async function reportsView(root, ctx) {
  const q = ctx.query;
  const tab = TABS[q.tab] ? q.tab : 'ozet';
  const usesRange = ['ozet', 'kar', 'kategori'].includes(tab);
  const { range, markup: rangeMarkup } = rangeBar(q);
  const year = Number(q.yil) || new Date().getFullYear();
  let body;
  let csv = null;

  if (tab === 'ozet') {
    const s = await get(`reports/summary${qs(range)}`);
    const row = (label, v, cls = '') => html`<tr class="${cls}"><td>${label}</td><td class="num">${fmtTL(v)}</td></tr>`;
    body = html`
      <div class="grid-2">
        <section class="card"><header><h2>Satış ve kârlılık</h2></header>
          <table class="table compact"><tbody>
            ${row(`Satışlar (${s.sales.count} fatura, KDV hariç)`, s.sales.net)}
            ${row(`Satış iadeleri (${s.sale_returns.count})`, -s.sale_returns.net)}
            ${row('Net satış', s.net_sales, 'strong')}
            ${row('Satılan malın maliyeti', -s.cost_of_sales)}
            ${row('Brüt kâr', s.gross_profit, 'strong')}
            ${row('Diğer gelirler', s.income)}
            ${row('Giderler', -s.expense)}
            ${row('Faaliyet sonucu', s.operating_result, `strong ${s.operating_result < 0 ? 'neg' : 'pos'}`)}
          </tbody></table>
          <p class="muted small">Maliyet, ürünlerin ağırlıklı ortalama alış maliyetinden hesaplanır. Amortisman, vergi vb. dahil değildir.</p>
        </section>
        <section class="card"><header><h2>KDV özeti</h2></header>
          <table class="table compact"><tbody>
            ${row('Hesaplanan KDV (satışlar − iadeler)', s.vat_output)}
            ${row('İndirilecek KDV (alışlar − iadeler)', s.vat_input)}
            ${row(s.vat_payable >= 0 ? 'Ödenecek KDV' : 'Devreden KDV', Math.abs(s.vat_payable), 'strong')}
          </tbody></table>
          <p class="muted small">Bilgi amaçlıdır; beyanname için mali müşavirinizle kontrol edin.</p>
        </section>
        <section class="card"><header><h2>Alışlar</h2></header>
          <table class="table compact"><tbody>
            ${row(`Alışlar (${s.purchases.count} fatura, KDV hariç)`, s.purchases.net)}
            ${row(`Alış iadeleri (${s.purchase_returns.count})`, -s.purchase_returns.net)}
            ${row('Net alış', s.net_purchases, 'strong')}
          </tbody></table>
        </section>
        <section class="card"><header><h2>Nakit akışı</h2></header>
          <table class="table compact"><tbody>
            ${row('Tahsilatlar', s.collections)}
            ${row('Diğer gelirler', s.income)}
            ${row('Ödemeler', -s.payments)}
            ${row('Giderler', -s.expense)}
            ${row('Net nakit akışı', s.collections + s.income - s.payments - s.expense, 'strong')}
          </tbody></table>
        </section>
      </div>`;
    csv = () => downloadCsv('ozet-rapor.csv', ['Kalem', 'Tutar'], [
      ['Dönem', `${fmtDate(s.from)} - ${fmtDate(s.to)}`], ['Satışlar (KDV hariç)', s.sales.net], ['Satış iadeleri', s.sale_returns.net],
      ['Net satış', s.net_sales], ['Satılan malın maliyeti', s.cost_of_sales], ['Brüt kâr', s.gross_profit],
      ['Diğer gelirler', s.income], ['Giderler', s.expense], ['Faaliyet sonucu', s.operating_result],
      ['Hesaplanan KDV', s.vat_output], ['İndirilecek KDV', s.vat_input], ['Ödenecek (+) / devreden (-) KDV', s.vat_payable],
      ['Net alış', s.net_purchases], ['Tahsilatlar', s.collections], ['Ödemeler', s.payments],
    ]);
  }

  if (tab === 'kar') {
    const rows = await get(`reports/profit${qs(range)}`);
    const tot = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, cost: a.cost + r.cost, profit: a.profit + r.profit }), { revenue: 0, cost: 0, profit: 0 });
    body = html`<section class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Kod</th><th>Ürün / hizmet</th><th class="num">Satılan</th><th class="num">Ciro (KDV hariç)</th><th class="num">Maliyet</th><th class="num">Brüt kâr</th><th class="num">Marj</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => html`<tr>
        <td class="mono">${r.code}</td>
        <td>${r.product_id ? html`<a href="#/stok/${r.product_id}">${r.name}</a>` : r.name}</td>
        <td class="num">${fmtQty(r.qty)} ${r.unit || ''}</td>
        <td class="num">${fmtMoney(r.revenue)}</td><td class="num">${fmtMoney(r.cost)}</td>
        <td class="num ${r.profit < 0 ? 'neg' : ''}">${fmtMoney(r.profit)}</td>
        <td class="num">${r.margin == null ? '' : `%${r.margin}`}</td></tr>`) : emptyRow(7, 'Bu dönemde satış yok.')}</tbody>
      <tfoot><tr><td colspan="3">Toplam</td><td class="num">${fmtMoney(tot.revenue)}</td><td class="num">${fmtMoney(tot.cost)}</td>
        <td class="num">${fmtMoney(tot.profit)}</td><td class="num">${tot.revenue ? `%${Math.round((tot.profit / tot.revenue) * 1000) / 10}` : ''}</td></tr></tfoot>
    </table></div></section>`;
    csv = () => downloadCsv('urun-karliligi.csv', ['Kod', 'Ürün', 'Miktar', 'Birim', 'Ciro', 'Maliyet', 'Brüt kâr', 'Marj %'],
      rows.map((r) => [r.code, r.name, r.qty, r.unit, r.revenue, r.cost, r.profit, r.margin]));
  }

  if (tab === 'stok') {
    const rows = await get('reports/stock-value');
    const tv = rows.reduce((a, r) => a + r.value, 0);
    const ts = rows.reduce((a, r) => a + r.sale_value, 0);
    body = html`<section class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Kod</th><th>Ürün</th><th>Kategori</th><th class="num">Stok</th><th class="num">Birim maliyet</th><th class="num">Maliyet değeri</th><th class="num">Satış değeri</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => html`<tr>
        <td class="mono">${r.code}</td><td><a href="#/stok/${r.id}">${r.name}</a></td><td>${r.category || ''}</td>
        <td class="num ${r.qty < 0 ? 'neg' : ''}">${fmtQty(r.qty)} ${r.unit}</td><td class="num">${fmtMoney(r.unit_cost)}</td>
        <td class="num">${fmtMoney(r.value)}</td><td class="num">${fmtMoney(r.sale_value)}</td></tr>`) : emptyRow(7)}</tbody>
      <tfoot><tr><td colspan="5">Toplam</td><td class="num">${fmtMoney(tv)}</td><td class="num">${fmtMoney(ts)}</td></tr></tfoot>
    </table></div><p class="muted small">Satış değeri KDV hariç liste fiyatıyla hesaplanır. Eksi stoklar değere katılmaz.</p></section>`;
    csv = () => downloadCsv('stok-degeri.csv', ['Kod', 'Ürün', 'Kategori', 'Stok', 'Birim', 'Birim maliyet', 'Maliyet değeri', 'Satış değeri'],
      rows.map((r) => [r.code, r.name, r.category, r.qty, r.unit, r.unit_cost, r.value, r.sale_value]));
  }

  if (tab === 'balances') {
    const rows = await get('reports/balances');
    const debt = rows.filter((r) => r.balance > 0);
    const credit = rows.filter((r) => r.balance < 0);
    const block = (title, list) => html`<section class="card"><header><h2>${title}</h2>
      <strong>${fmtTL(Math.abs(list.reduce((a, r) => a + r.balance, 0)))}</strong></header>
      <table class="table compact"><tbody>${list.length ? list.map((r) => html`<tr class="link" data-href="#/cariler/${r.id}">
        <td>${r.name}<br><small class="muted">${r.code} · ${PARTY_KINDS[r.kind]}${r.phone ? ` · ${r.phone}` : ''}</small></td>
        <td class="num">${balanceText(r.balance)}</td></tr>`) : emptyRow(2)}</tbody></table></section>`;
    body = html`<div class="grid-2">${block('Bize borçlu olanlar (alacaklarımız)', debt)}${block('Bizim borçlu olduklarımız', credit)}</div>`;
    csv = () => downloadCsv('cari-bakiyeler.csv', ['Kod', 'Unvan', 'Tür', 'Telefon', 'Bakiye (+borçlu / -alacaklı)'],
      rows.map((r) => [r.code, r.name, PARTY_KINDS[r.kind], r.phone, r.balance]));
  }

  if (tab === 'kategori') {
    const rows = await get(`reports/categories${qs(range)}`);
    const block = (kind, title) => {
      const list = rows.filter((r) => r.kind === kind);
      const total = list.reduce((a, r) => a + r.total, 0);
      return html`<section class="card"><header><h2>${title}</h2><strong>${fmtTL(total)}</strong></header>
        <table class="table compact"><tbody>${list.length ? list.map((r) => html`<tr><td>${r.category} <small class="muted">${r.n} işlem</small></td>
          <td class="num">${fmtMoney(r.total)}</td>
          <td class="num muted">%${total ? Math.round((r.total / total) * 1000) / 10 : 0}</td></tr>`) : emptyRow(3)}</tbody></table></section>`;
    };
    body = html`<div class="grid-2">${block('expense', 'Giderler')}${block('income', 'Diğer gelirler')}</div>`;
    csv = () => downloadCsv('gelir-gider.csv', ['Tür', 'Kategori', 'İşlem sayısı', 'Tutar'],
      rows.map((r) => [r.kind === 'income' ? 'Gelir' : 'Gider', r.category, r.n, r.total]));
  }

  if (tab === 'aylik') {
    const { months } = await get(`reports/monthly${qs({ year })}`);
    const sum = (k) => months.reduce((a, m) => a + m[k], 0);
    const cols = [['net_sales', 'Net satış'], ['net_purchases', 'Net alış'], ['gross_profit', 'Brüt kâr'], ['income', 'Gelir'],
      ['expense', 'Gider'], ['collections', 'Tahsilat'], ['payments', 'Ödeme'], ['vat_payable', 'KDV farkı']];
    body = html`<section class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Ay</th>${cols.map(([, l]) => html`<th class="num">${l}</th>`)}</tr></thead>
      <tbody>${months.map((m) => html`<tr><td>${MONTHS[m.month - 1]}</td>${cols.map(([k]) => html`<td class="num ${m[k] < 0 ? 'neg' : ''}">${fmtMoney(m[k])}</td>`)}</tr>`)}</tbody>
      <tfoot><tr><td>${year} toplam</td>${cols.map(([k]) => html`<td class="num">${fmtMoney(sum(k))}</td>`)}</tr></tfoot>
    </table></div></section>`;
    csv = () => downloadCsv(`aylik-${year}.csv`, ['Ay', ...cols.map(([, l]) => l)],
      months.map((m) => [MONTHS[m.month - 1], ...cols.map(([k]) => m[k])]));
  }

  setHtml(root, html`
    <div class="page">
      <div class="page-head">
        <div><h1>Raporlar</h1><p class="muted print-only">${session.company} · ${TABS[tab]}
          ${usesRange && range.from ? ` · ${fmtDate(range.from)} – ${fmtDate(range.to)}` : ''}${tab === 'aylik' ? ` · ${year}` : ''}</p></div>
        <div class="actions no-print">
          ${usesRange ? rangeMarkup : ''}
          ${tab === 'aylik' ? html`<div class="range-bar"><button class="btn ghost sm" data-year="${year - 1}">‹ ${year - 1}</button>
            <strong>${year}</strong><button class="btn ghost sm" data-year="${year + 1}">${year + 1} ›</button></div>` : ''}
          <button class="btn ghost" data-act="csv">CSV</button>
          <button class="btn ghost" data-act="print">Yazdır</button>
        </div>
      </div>
      <nav class="tabs no-print">${Object.entries(TABS).map(([k, l]) => html`<a href="#/raporlar${qs({ ...q, tab: k })}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</nav>
      ${body}
    </div>`);

  bindRangeBar(root, q, ctx.setQuery);
  root.addEventListener('click', (e) => {
    const row = e.target.closest('[data-href]');
    if (row) navigate(row.dataset.href);
    const y = e.target.closest('[data-year]');
    if (y) ctx.setQuery({ ...q, yil: y.dataset.year });
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'csv' && csv) csv();
    if (act === 'print') window.print();
  });
}
