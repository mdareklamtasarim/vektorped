// Customers & suppliers: list with balances, card with statement (ekstre).
import {
  html, raw, setHtml, get, post, put, del, qs, fmtTL, fmtMoney, fmtDate, field, moneyAttr, formDialog,
  confirmDialog, toast, toastError, nums, canWrite, isAdmin, emptyRow, balanceText, downloadCsv, options,
  PARTY_KINDS, INVOICE_TYPES, TX_KINDS, bindFilters, rangeBar, bindRangeBar, session,
} from '../core.js';
import { transactionDialog } from './finance.js';

export async function partiesView(root, ctx) {
  const q = ctx.query;
  const parties = await get(`parties${qs({ q: q.q, kind: q.tur, balance: q.bakiye, active: q.pasif ? 'all' : '' })}`);
  const receivable = parties.reduce((s, p) => s + (p.balance > 0 ? p.balance : 0), 0);
  const payable = parties.reduce((s, p) => s + (p.balance < 0 ? -p.balance : 0), 0);

  setHtml(root, html`
    <div class="page">
      <div class="page-head">
        <div><h1>Cariler</h1><p class="muted">${parties.length} cari · alacak ${fmtTL(receivable)} · borç ${fmtTL(payable)}</p></div>
        <div class="actions">
          <button class="btn ghost" data-act="csv">CSV</button>
          ${canWrite() ? html`<button class="btn primary" data-act="new">+ Yeni cari</button>` : ''}
        </div>
      </div>
      <form class="filters" data-filters>
        <input type="search" name="q" value="${q.q || ''}" placeholder="Unvan, kod, telefon veya vergi no ara" aria-label="Ara">
        <select name="tur" aria-label="Tür">${options({ '': 'Tüm cariler', customer: 'Müşteriler', supplier: 'Tedarikçiler' }, q.tur || '')}</select>
        <select name="bakiye" aria-label="Bakiye">${options({ '': 'Tüm bakiyeler', debt: 'Borçlu olanlar', credit: 'Alacaklı olanlar' }, q.bakiye || '')}</select>
        <label class="check"><input type="checkbox" name="pasif" ${q.pasif ? raw('checked') : ''}> Pasifler</label>
      </form>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Kod</th><th>Unvan</th><th>Tür</th><th>Telefon</th><th class="num">Bakiye</th></tr></thead>
          <tbody>
            ${parties.length ? parties.map((p) => html`
              <tr class="link ${p.active ? '' : 'inactive'}" data-href="#/cariler/${p.id}">
                <td class="mono">${p.code}</td>
                <td>${p.name}${p.active ? '' : html` <span class="badge">pasif</span>`}</td>
                <td>${PARTY_KINDS[p.kind]}</td>
                <td>${p.phone || ''}</td>
                <td class="num">${balanceText(p.balance)}</td>
              </tr>`) : emptyRow(5, q.q ? 'Aramaya uyan cari yok.' : 'Henüz cari yok.')}
          </tbody>
        </table>
      </div>
    </div>`);

  bindFilters(root, ctx, (f) => ({ q: f.get('q'), tur: f.get('tur'), bakiye: f.get('bakiye'), pasif: f.get('pasif') ? '1' : '' }));
  root.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-href]');
    if (row) location.hash = row.dataset.href;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'new') {
      const r = await partyDialog(null, { kind: q.tur || 'customer' });
      if (r) ctx.go(`/cariler/${r.id}`);
    }
    if (act === 'csv') {
      downloadCsv('cariler.csv', ['Kod', 'Unvan', 'Tür', 'Vergi dairesi', 'Vergi/TC no', 'Telefon', 'E-posta', 'Adres', 'Bakiye (+borçlu / -alacaklı)'],
        parties.map((p) => [p.code, p.name, PARTY_KINDS[p.kind], p.tax_office, p.tax_no, p.phone, p.email, p.address, p.balance]));
    }
  });
}

export async function partyDialog(p = null, defaults = {}) {
  const code = p ? p.code : (await get('parties/next-code')).code;
  const opening = p ? p.opening_balance : 0;
  return formDialog({
    title: p ? 'Cariyi düzenle' : 'Yeni cari',
    wide: true,
    body: html`
      <div class="form-grid">
        ${field('Cari kodu', html`<input name="code" value="${code}" required maxlength="40">`)}
        ${field('Unvan / Ad soyad', html`<input name="name" value="${p?.name || defaults.name || ''}" required maxlength="200">`, { cls: 'span-2' })}
        ${field('Tür', html`<select name="kind">${options(PARTY_KINDS, p?.kind || defaults.kind || 'customer')}</select>`)}
        ${field('Vergi dairesi', html`<input name="tax_office" value="${p?.tax_office || ''}" maxlength="80">`)}
        ${field('Vergi no / TC kimlik no', html`<input name="tax_no" value="${p?.tax_no || ''}" inputmode="numeric" maxlength="20">`)}
        ${field('Telefon', html`<input name="phone" type="tel" value="${p?.phone || ''}" maxlength="40">`)}
        ${field('E-posta', html`<input name="email" type="email" value="${p?.email || ''}" maxlength="120">`, { cls: 'span-2' })}
        ${field('Adres', html`<textarea name="address" rows="2" maxlength="500">${p?.address || ''}</textarea>`, { cls: 'span-3' })}
        ${field('Açılış bakiyesi', html`<input name="opening_amount" value="${opening ? fmtMoney(Math.abs(opening)) : ''}" ${raw(moneyAttr)}>`,
          { hint: 'Programa geçmeden önceki bakiye.' })}
        ${field('Açılış bakiyesi yönü', html`<select name="opening_side">${options({ debt: 'Cari bize borçlu', credit: 'Biz cariye borçluyuz' }, opening < 0 ? 'credit' : 'debt')}</select>`)}
        ${field('Not', html`<input name="note" value="${p?.note || ''}" maxlength="1000">`)}
        ${p ? html`<label class="check span-3"><input type="checkbox" name="active" ${p.active ? raw('checked') : ''}> Aktif</label>` : ''}
      </div>`,
    onSubmit: async (d) => {
      nums(d, ['opening_amount']);
      d.opening_balance = (d.opening_amount || 0) * (d.opening_side === 'credit' ? -1 : 1);
      delete d.opening_amount;
      delete d.opening_side;
      if (p) {
        await put(`parties/${p.id}`, d);
        toast('Cari güncellendi.');
        return { id: p.id };
      }
      const r = await post('parties', d);
      toast('Cari eklendi.');
      return r;
    },
  });
}

const DOC_LABEL = (r) => (r.source === 'invoice' ? INVOICE_TYPES[r.kind].short : TX_KINDS[r.kind].label);

export async function partyView(root, ctx) {
  const q = ctx.query;
  const { range, markup: rangeMarkup } = rangeBar({ donem: 'all', ...q });
  const p = await get(`parties/${ctx.params[0]}${qs(range)}`);
  const s = p.statement;
  const w = canWrite();
  const isCustomer = p.kind !== 'supplier';
  const isSupplier = p.kind !== 'customer';

  setHtml(root, html`
    <div class="page">
      <a class="back no-print" href="#/cariler">← Cariler</a>
      <div class="page-head">
        <div>
          <h1>${p.name} ${p.active ? '' : html`<span class="badge">pasif</span>`}</h1>
          <p class="muted">${p.code} · ${PARTY_KINDS[p.kind]}${p.phone ? ` · ${p.phone}` : ''}${p.email ? ` · ${p.email}` : ''}</p>
        </div>
        <div class="actions no-print">
          ${w && isCustomer ? html`<a class="btn primary" href="#/faturalar/yeni?tur=sale&cari=${p.id}">+ Satış faturası</a>
            <button class="btn" data-tx="collection">Tahsilat</button>` : ''}
          ${w && isSupplier ? html`<a class="btn" href="#/faturalar/yeni?tur=purchase&cari=${p.id}">+ Alış faturası</a>
            <button class="btn" data-tx="payment">Ödeme</button>` : ''}
          ${w ? html`<button class="btn ghost" data-act="edit">Düzenle</button>` : ''}
          ${isAdmin() ? html`<button class="btn ghost danger-text" data-act="delete">Sil</button>` : ''}
        </div>
      </div>

      <div class="stats">
        <div class="stat ${p.balance > 0 ? 'pos' : p.balance < 0 ? 'neg' : ''}"><span>Güncel bakiye</span>
          <strong>${fmtTL(Math.abs(p.balance))}</strong>
          <small>${p.balance > 0 ? 'Cari bize borçlu' : p.balance < 0 ? 'Biz cariye borçluyuz' : 'Hesap kapalı'}</small></div>
        <div class="stat"><span>Vergi bilgisi</span><strong class="sm">${p.tax_office || '—'}</strong><small>${p.tax_no || ''}</small></div>
        <div class="stat"><span>Adres</span><strong class="sm">${p.address || '—'}</strong></div>
      </div>
      ${p.note ? html`<div class="notice">${p.note}</div>` : ''}

      <section class="card">
        <header><h2>Cari ekstre</h2>
          <div class="actions no-print">${rangeMarkup}
            <button class="btn ghost sm" data-act="csv">CSV</button>
            <button class="btn ghost sm" data-act="print">Yazdır</button></div>
        </header>
        <div class="print-only print-head"><strong>${session.company}</strong> · ${p.name} cari ekstresi
          ${range.from ? `· ${fmtDate(range.from)} – ${fmtDate(range.to)}` : ''}</div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Tarih</th><th>İşlem</th><th>Belge</th><th>Açıklama</th><th class="num">Borç</th><th class="num">Alacak</th><th class="num">Bakiye</th></tr></thead>
            <tbody>
              <tr class="carried"><td colspan="6">${range.from ? 'Devreden bakiye' : 'Açılış bakiyesi'}</td><td class="num">${balanceText(s.carried)}</td></tr>
              ${s.rows.length ? s.rows.map((r) => html`
                <tr class="${r.source === 'invoice' ? 'link' : ''}" ${r.source === 'invoice' ? raw(`data-href="#/faturalar/${r.ref_id}"`) : ''}>
                  <td>${fmtDate(r.date)}</td>
                  <td>${DOC_LABEL(r)}</td>
                  <td>${r.doc_no}</td>
                  <td>${r.description}</td>
                  <td class="num">${r.debit ? fmtMoney(r.debit) : ''}</td>
                  <td class="num">${r.credit ? fmtMoney(r.credit) : ''}</td>
                  <td class="num">${balanceText(r.balance)}</td>
                </tr>`) : emptyRow(7, 'Bu dönemde hareket yok.')}
            </tbody>
            <tfoot><tr><td colspan="4">Dönem toplamı / kapanış</td>
              <td class="num">${fmtMoney(s.rows.reduce((a, r) => a + r.debit, 0))}</td>
              <td class="num">${fmtMoney(s.rows.reduce((a, r) => a + r.credit, 0))}</td>
              <td class="num">${balanceText(s.closing)}</td></tr></tfoot>
          </table>
        </div>
        <p class="muted small">Borç: cariye kesilen satış faturaları ve yaptığımız ödemeler. Alacak: alış faturaları ve aldığımız tahsilatlar.</p>
      </section>
    </div>`);

  bindRangeBar(root, q, ctx.setQuery);
  root.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-href]');
    if (row) location.hash = row.dataset.href;
    const tx = e.target.closest('[data-tx]')?.dataset.tx;
    const act = e.target.closest('[data-act]')?.dataset.act;
    try {
      if (tx && (await transactionDialog({ kind: tx, partyId: p.id }))) ctx.reload();
      if (act === 'edit' && (await partyDialog(p))) ctx.reload();
      if (act === 'print') window.print();
      if (act === 'csv') {
        downloadCsv(`ekstre-${p.code}.csv`, ['Tarih', 'İşlem', 'Belge', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'],
          [['', 'Devir', '', '', '', '', s.carried], ...s.rows.map((r) => [fmtDate(r.date), DOC_LABEL(r), r.doc_no, r.description, r.debit, r.credit, r.balance])]);
      }
      if (act === 'delete' && (await confirmDialog(`"${p.name}" silinsin mi?`, { confirmLabel: 'Sil' }))) {
        await del(`parties/${p.id}`);
        toast('Cari silindi.');
        ctx.go('/cariler');
      }
    } catch (err) {
      toastError(err);
    }
  });
}
