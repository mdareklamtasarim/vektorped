// Invoices: list, entry form with live totals, and a printable invoice page.
import {
  html, raw, setHtml, el, get, post, put, del, qs, fmtTL, fmtMoney, fmtQty, fmtDate, fmtDateTime, field, moneyAttr,
  confirmDialog, toast, toastError, parseNum, canWrite, isAdmin, emptyRow, today, downloadCsv, options,
  INVOICE_TYPES, bindFilters, rangeBar, bindRangeBar, session, esc, saved, queued, pendingBadge,
} from '../core.js';
import { partyDialog } from './parties.js';

const TABS = {
  sale: { label: 'Satış', type: 'sale' },
  purchase: { label: 'Alış', type: 'purchase' },
  iade: { label: 'İadeler', type: 'sale_return,purchase_return' },
  tumu: { label: 'Tümü', type: '' },
};

export async function invoicesView(root, ctx) {
  const q = ctx.query;
  const tab = TABS[q.tur] ? q.tur : 'sale';
  const { range, markup: rangeMarkup } = rangeBar(q);
  const list = await get(`invoices${qs({ type: TABS[tab].type, q: q.q, status: q.durum, ...range })}`);
  const active = list.filter((i) => i.status === 'active');
  const sum = (k) => active.reduce((s, i) => s + i[k], 0);

  setHtml(root, html`
    <div class="page">
      <div class="page-head">
        <div><h1>Faturalar</h1><p class="muted">${active.length} fatura · KDV hariç ${fmtTL(sum('total') - sum('vat_total'))} · toplam ${fmtTL(sum('total'))}</p></div>
        ${canWrite() ? html`<div class="actions">
          <a class="btn primary" href="#/faturalar/yeni?tur=sale">+ Satış</a>
          <a class="btn" href="#/faturalar/yeni?tur=purchase">+ Alış</a>
          <a class="btn ghost" href="#/faturalar/yeni?tur=sale_return">Satış iade</a>
          <a class="btn ghost" href="#/faturalar/yeni?tur=purchase_return">Alış iade</a>
        </div>` : ''}
      </div>
      <nav class="tabs">${Object.entries(TABS).map(([k, t]) => html`<a href="#/faturalar${qs({ ...q, tur: k })}" class="${k === tab ? 'active' : ''}">${t.label}</a>`)}</nav>
      <form class="filters" data-filters>
        <input type="search" name="q" value="${q.q || ''}" placeholder="Fatura no veya cari ara" aria-label="Ara">
        <select name="durum" aria-label="Durum">${options({ '': 'Tüm durumlar', active: 'Geçerli', cancelled: 'İptal' }, q.durum || '')}</select>
        ${rangeMarkup}
        <button class="btn ghost" type="button" data-act="csv">CSV</button>
      </form>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Tarih</th><th>No</th><th>Tür</th><th>Cari</th><th>Vade</th><th class="num">KDV hariç</th><th class="num">KDV</th><th class="num">Toplam</th></tr></thead>
          <tbody>
            ${list.length ? list.map((i) => html`
              <tr class="${i.pending ? 'pending' : 'link'} ${i.status === 'cancelled' ? 'cancelled' : ''}" ${i.pending ? '' : raw(`data-href="#/faturalar/${i.id}"`)}>
                <td>${fmtDate(i.date)}</td>
                <td class="mono">${i.pending ? '' : i.no}${i.status === 'cancelled' ? html` <span class="badge">iptal</span>` : ''}${pendingBadge(i)}</td>
                <td>${INVOICE_TYPES[i.type].short}</td>
                <td>${i.party_name}</td>
                <td>${fmtDate(i.due_date)}</td>
                <td class="num">${fmtMoney(i.total - i.vat_total)}</td>
                <td class="num">${fmtMoney(i.vat_total)}</td>
                <td class="num"><strong>${fmtMoney(i.total)}</strong></td>
              </tr>`) : emptyRow(8, 'Bu dönemde fatura yok.')}
          </tbody>
        </table>
      </div>
    </div>`);

  bindFilters(root, ctx, (f) => ({ ...q, q: f.get('q'), durum: f.get('durum') }));
  bindRangeBar(root, q, ctx.setQuery);
  root.addEventListener('click', (e) => {
    const row = e.target.closest('[data-href]');
    if (row) location.hash = row.dataset.href;
    if (e.target.closest('[data-act=csv]')) {
      downloadCsv('faturalar.csv', ['Tarih', 'No', 'Tür', 'Cari', 'Vade', 'Ara toplam', 'İskonto', 'KDV', 'Toplam', 'Durum'],
        list.map((i) => [fmtDate(i.date), i.no, INVOICE_TYPES[i.type].short, i.party_name, fmtDate(i.due_date),
          i.subtotal, i.discount_total, i.vat_total, i.total, i.status === 'active' ? 'Geçerli' : 'İptal']));
    }
  });
}

// ---- entry form ----------------------------------------------------------------
// Works in kuruş while typing so the totals match the server to the cent.
function lineCalc(l) {
  const qty = parseNum(l.qty) || 0;
  const price = Math.round((parseNum(l.unit_price) || 0) * 100);
  const disc = parseNum(l.discount_rate) || 0;
  const vatRate = parseNum(l.vat_rate) || 0;
  const gross = Math.round(qty * price);
  const discount = Math.round((gross * disc) / 100);
  const net = gross - discount;
  const vat = Math.round((net * vatRate) / 100);
  return { gross, discount, net, vat, total: net + vat };
}

const partyLabel = (p) => `${p.name} (${p.code})`;
const productLabel = (p) => `${p.code} · ${p.name}`;

export async function invoiceFormView(root, ctx) {
  const editId = ctx.params[0];
  if (!canWrite()) throw new Error('Fatura girmek için yetkiniz yok.');
  const [inv, parties, products, accounts] = await Promise.all([
    editId ? get(`invoices/${editId}`) : null,
    get('parties'),
    get('products'),
    get('accounts'),
  ]);
  if (inv && inv.status !== 'active') throw new Error('İptal edilmiş fatura düzenlenemez.');
  const type = inv ? inv.type : (INVOICE_TYPES[ctx.query.tur] ? ctx.query.tur : 'sale');
  const T = INVOICE_TYPES[type];
  const usesBuyPrice = type === 'purchase' || type === 'purchase_return';
  const partyById = new Map(parties.map((p) => [p.id, p]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const productByLabel = new Map(products.map((p) => [productLabel(p).toLocaleLowerCase('tr'), p]));
  // Let users pick by plain code or barcode too.
  for (const p of products) {
    productByLabel.set(p.code.toLocaleLowerCase('tr'), p);
    if (p.barcode) productByLabel.set(p.barcode.toLocaleLowerCase('tr'), p);
  }
  const preParty = inv ? inv.party : partyById.get(Number(ctx.query.cari));
  // Offline the next number is unknown; an empty number is filled in by the server when sent.
  const nextNo = inv ? inv.no : await get(`invoices/next-no${qs({ type, date: today() })}`, { live: true }).then((r) => r.no, () => '');
  const sorted = [...parties].sort((a, b) => {
    const want = T.party;
    const rank = (p) => (p.kind === want || p.kind === 'both' ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'tr');
  });

  const lineRow = (l = {}) => html`
    <tr class="line">
      <td class="c-product" data-label="Ürün"><input name="product" list="product-list" value="${l.product_id && productById.get(l.product_id) ? productLabel(productById.get(l.product_id)) : ''}" placeholder="Ürün ara (boş = hizmet)" aria-label="Ürün">
        <input type="hidden" name="product_id" value="${l.product_id || ''}"></td>
      <td class="c-desc" data-label="Açıklama"><input name="description" value="${l.description || ''}" maxlength="300" aria-label="Açıklama" placeholder="Açıklama"></td>
      <td class="c-qty" data-label="Miktar"><input name="qty" value="${l.qty != null ? fmtQty(l.qty) : '1'}" inputmode="decimal" aria-label="Miktar"></td>
      <td class="c-unit" data-label="Birim"><input name="unit" value="${l.unit || 'Adet'}" maxlength="20" aria-label="Birim"></td>
      <td class="c-price" data-label="Birim fiyat"><input name="unit_price" value="${l.unit_price != null ? fmtMoney(l.unit_price) : ''}" ${raw(moneyAttr)} aria-label="Birim fiyat"></td>
      <td class="c-disc" data-label="İsk. %"><input name="discount_rate" value="${l.discount_rate || ''}" inputmode="decimal" aria-label="İskonto %" placeholder="0"></td>
      <td class="c-vat" data-label="KDV %"><input name="vat_rate" value="${l.vat_rate ?? 20}" inputmode="decimal" list="vat-rates" aria-label="KDV %"></td>
      <td class="c-total num" data-label="Tutar" data-total>0,00</td>
      <td class="c-del"><button type="button" class="icon-btn sm" data-del-line aria-label="Satırı sil">✕</button></td>
    </tr>`;

  setHtml(root, html`
    <div class="page">
      <a class="back" href="${inv ? `#/faturalar/${inv.id}` : '#/faturalar'}">← ${inv ? 'Faturaya dön' : 'Faturalar'}</a>
      <div class="page-head"><h1>${inv ? `${T.label} düzenle` : `Yeni ${T.label.toLocaleLowerCase('tr')}`}</h1></div>
      <form class="invoice-form" novalidate>
        <section class="card">
          <div class="form-grid">
            <label class="field span-2"><span>Cari</span>
              <div class="input-row">
                <input name="party" list="party-list" required value="${preParty ? partyLabel(preParty) : ''}" placeholder="Cari ara…" autocomplete="off">
                <button type="button" class="btn ghost" data-act="new-party">+ Yeni</button>
              </div>
              <small class="hint" data-party-info></small>
            </label>
            ${field('Fatura no', html`<input name="no" value="${nextNo}" maxlength="40">`, { hint: usesBuyPrice ? 'Tedarikçinin fatura numarası.' : nextNo ? 'Boş bırakılırsa otomatik verilir.' : 'Bağlantı yok: numara gönderilirken otomatik verilecek.' })}
            ${field('Fatura tarihi', html`<input type="date" name="date" value="${inv ? inv.date : today()}" required>`)}
            ${field('Vade tarihi', html`<input type="date" name="due_date" value="${inv?.due_date || ''}">`)}
            ${field('Not', html`<input name="note" value="${inv?.note || ''}" maxlength="1000">`)}
          </div>
        </section>

        <section class="card">
          <header><h2>Kalemler</h2></header>
          <div class="table-wrap">
            <table class="table lines">
              <thead><tr><th>Ürün</th><th>Açıklama</th><th class="num">Miktar</th><th>Birim</th><th class="num">Birim fiyat</th>
                <th class="num">İsk. %</th><th class="num">KDV %</th><th class="num">Tutar</th><th></th></tr></thead>
              <tbody data-lines>${inv ? inv.lines.map(lineRow) : lineRow()}</tbody>
            </table>
          </div>
          <button type="button" class="btn ghost" data-act="add-line">+ Satır ekle</button>
          <p class="muted small">Fiyatlar KDV hariçtir. Ürün seçilmezse satır hizmet olarak kaydedilir ve stoğu etkilemez.</p>
        </section>

        <section class="card totals-card">
          <div class="totals" data-totals></div>
          ${!inv && accounts.length ? html`
            <div class="pay-now">
              <label class="check"><input type="checkbox" name="paid"> ${type === 'sale' || type === 'purchase_return' ? 'Ödeme hemen alındı' : 'Ödeme hemen yapıldı'}</label>
              <select name="payment_account_id" aria-label="Hesap" disabled>${accounts.map((a) => html`<option value="${a.id}">${a.name}</option>`)}</select>
            </div>` : ''}
          ${inv && inv.payments.length ? html`<p class="muted small">Bu faturayla alınan/yapılan ödeme yeni toplama göre güncellenir.</p>` : ''}
        </section>

        <p class="form-error" hidden></p>
        <div class="form-actions">
          <a class="btn ghost" href="${inv ? `#/faturalar/${inv.id}` : '#/faturalar'}">Vazgeç</a>
          <button type="submit" class="btn primary">${inv ? 'Değişiklikleri kaydet' : 'Faturayı kaydet'}</button>
        </div>
      </form>
      <datalist id="party-list">${sorted.map((p) => html`<option value="${partyLabel(p)}"></option>`)}</datalist>
      <datalist id="product-list">${products.map((p) => html`<option value="${productLabel(p)}">${fmtQty(p.stock)} ${p.unit} stokta</option>`)}</datalist>
      <datalist id="vat-rates"><option value="0"><option value="1"><option value="10"><option value="20"></datalist>
    </div>`);

  const form = root.querySelector('form');
  const tbody = form.querySelector('[data-lines]');
  const totalsBox = form.querySelector('[data-totals]');
  const partyInput = form.elements.party;
  const partyInfo = form.querySelector('[data-party-info]');
  const errBox = form.querySelector('.form-error');
  const partyMap = new Map(parties.map((p) => [partyLabel(p), p]));

  const findParty = () => partyMap.get(partyInput.value.trim()) || null;
  const showParty = () => {
    const p = findParty();
    partyInfo.textContent = p
      ? `${p.balance > 0 ? 'Borçlu' : p.balance < 0 ? 'Alacaklı' : 'Bakiye'}: ${fmtTL(Math.abs(p.balance))}${p.tax_no ? ` · VKN/TCKN ${p.tax_no}` : ''}`
      : partyInput.value ? 'Listeden bir cari seçin veya yeni ekleyin.' : '';
  };

  const recalc = () => {
    const t = { gross: 0, discount: 0, net: 0, vat: 0, total: 0 };
    const vatByRate = new Map();
    for (const tr of tbody.querySelectorAll('tr.line')) {
      const get1 = (n) => tr.querySelector(`[name=${n}]`).value;
      const c = lineCalc({ qty: get1('qty'), unit_price: get1('unit_price'), discount_rate: get1('discount_rate'), vat_rate: get1('vat_rate') });
      tr.querySelector('[data-total]').textContent = fmtMoney(c.total / 100);
      for (const k of Object.keys(t)) t[k] += c[k];
      const rate = parseNum(get1('vat_rate')) || 0;
      vatByRate.set(rate, (vatByRate.get(rate) || 0) + c.vat);
    }
    setHtml(totalsBox, html`
      <div><span>Ara toplam</span><strong>${fmtTL(t.gross / 100)}</strong></div>
      ${t.discount ? html`<div><span>İskonto</span><strong>−${fmtTL(t.discount / 100)}</strong></div>` : ''}
      <div><span>KDV matrahı</span><strong>${fmtTL(t.net / 100)}</strong></div>
      ${[...vatByRate].filter(([, v]) => v).sort((a, b) => a[0] - b[0]).map(([r, v]) => html`<div><span>KDV %${r}</span><strong>${fmtTL(v / 100)}</strong></div>`)}
      <div class="grand"><span>Genel toplam</span><strong>${fmtTL(t.total / 100)}</strong></div>`);
  };

  const pickProduct = (tr) => {
    const input = tr.querySelector('[name=product]');
    const hidden = tr.querySelector('[name=product_id]');
    const v = input.value.trim().toLocaleLowerCase('tr');
    const p = v ? productByLabel.get(v) : null;
    if (!v) {
      hidden.value = '';
      input.classList.remove('invalid');
      return;
    }
    if (!p) {
      hidden.value = '';
      input.classList.add('invalid');
      return;
    }
    input.classList.remove('invalid');
    if (String(p.id) === hidden.value) return;
    hidden.value = p.id;
    input.value = productLabel(p);
    tr.querySelector('[name=description]').value = p.name;
    tr.querySelector('[name=unit]').value = p.unit;
    tr.querySelector('[name=unit_price]').value = fmtMoney(usesBuyPrice ? p.buy_price : p.sell_price);
    tr.querySelector('[name=vat_rate]').value = p.vat_rate;
    recalc();
  };

  form.addEventListener('input', (e) => {
    if (e.target.name === 'party') showParty();
    if (e.target.name === 'product') {
      // Datalist picks arrive as an input event with the full label.
      const tr = e.target.closest('tr');
      if (productByLabel.has(e.target.value.trim().toLocaleLowerCase('tr'))) pickProduct(tr);
    }
    if (e.target.name === 'paid') form.elements.payment_account_id.disabled = !e.target.checked;
    recalc();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'product') pickProduct(e.target.closest('tr'));
  });
  form.addEventListener('click', async (e) => {
    if (e.target.closest('[data-act=add-line]')) {
      const tr = el(html`<table><tbody>${lineRow()}</tbody></table>`).querySelector('tr');
      tbody.append(tr);
      tr.querySelector('input').focus();
      recalc();
    }
    const delBtn = e.target.closest('[data-del-line]');
    if (delBtn) {
      if (tbody.querySelectorAll('tr.line').length > 1) delBtn.closest('tr').remove();
      else delBtn.closest('tr').querySelectorAll('input').forEach((i) => { i.value = ''; });
      recalc();
    }
    if (e.target.closest('[data-act=new-party]')) {
      const r = await partyDialog(null, { kind: T.party, name: partyInput.value });
      if (r) {
        const fresh = queued(r)
          ? { id: r.id, name: r.name, code: 'yeni', kind: r.kind, balance: 0 }
          : await get(`parties/${r.id}`);
        partyMap.set(partyLabel(fresh), fresh);
        root.querySelector('#party-list').append(el(html`<option value="${partyLabel(fresh)}"></option>`));
        partyInput.value = partyLabel(fresh);
        showParty();
      }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const btn = form.querySelector('button[type=submit]');
    try {
      const party = findParty();
      if (!party) throw new Error('Listeden bir cari seçin.');
      const lines = [];
      for (const [i, tr] of [...tbody.querySelectorAll('tr.line')].entries()) {
        const v = (n) => tr.querySelector(`[name=${n}]`).value;
        if (tr.querySelector('[name=product]').classList.contains('invalid')) throw new Error(`${i + 1}. satırdaki ürün listede yok.`);
        if (!v('product_id') && !v('description').trim() && !v('unit_price')) continue;
        const nums = ['qty', 'unit_price', 'discount_rate', 'vat_rate'].map((n) => parseNum(v(n)));
        if (nums.some((n) => Number.isNaN(n))) throw new Error(`${i + 1}. satırda geçersiz sayı var.`);
        lines.push({
          product_id: v('product_id') ? Number(v('product_id')) : null,
          description: v('description'),
          qty: nums[0],
          unit: v('unit'),
          unit_price: nums[1] ?? 0,
          discount_rate: nums[2] ?? 0,
          vat_rate: nums[3] ?? 0,
        });
      }
      if (!lines.length) throw new Error('En az bir kalem girin.');
      const f = form.elements;
      const body = {
        type, party_id: party.id, no: f.no.value, date: f.date.value, due_date: f.due_date.value, note: f.note.value, lines,
        _party_name: party.name,
      };
      if (f.paid && f.paid.checked) body.payment_account_id = Number(f.payment_account_id.value);
      btn.disabled = true;
      const r = inv ? await put(`invoices/${inv.id}`, body) : await post('invoices', body);
      if (queued(r)) {
        saved(r);
        ctx.go(inv ? `/faturalar/${inv.id}` : '/faturalar', inv ? {} : { tur: type === 'sale' || type === 'purchase' ? type : 'iade' });
      } else {
        toast(inv ? 'Fatura güncellendi.' : `Fatura kaydedildi: ${r.no}`);
        ctx.go(`/faturalar/${r.id}`);
      }
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
      btn.disabled = false;
    }
  });

  showParty();
  recalc();
}

// ---- printable invoice ------------------------------------------------------------
export async function invoiceView(root, ctx) {
  const [inv, settings] = await Promise.all([get(`invoices/${ctx.params[0]}`), get('settings')]);
  const T = INVOICE_TYPES[inv.type];
  const p = inv.party;
  const w = canWrite() && inv.status === 'active';
  const ourSide = html`<strong>${settings.company_name}</strong><br>
    ${settings.company_address ? raw(esc(settings.company_address).replace(/\n/g, '<br>')) : ''}
    ${settings.company_phone ? html`<br>Tel: ${settings.company_phone}` : ''}
    ${settings.company_tax_office ? html`<br>${settings.company_tax_office} V.D.` : ''}${settings.company_tax_no ? html`<br>VKN: ${settings.company_tax_no}` : ''}`;
  const theirSide = html`<strong>${p.name}</strong><br>
    ${p.address ? raw(esc(p.address).replace(/\n/g, '<br>')) : ''}
    ${p.phone ? html`<br>Tel: ${p.phone}` : ''}
    ${p.tax_office ? html`<br>${p.tax_office} V.D.` : ''}${p.tax_no ? html`<br>VKN/TCKN: ${p.tax_no}` : ''}`;
  const sellerIsUs = inv.type === 'sale' || inv.type === 'purchase_return';

  setHtml(root, html`
    <div class="page">
      <a class="back no-print" href="#/faturalar">← Faturalar</a>
      <div class="page-head no-print">
        <div><h1>${T.label} ${inv.status === 'cancelled' ? html`<span class="badge danger">İPTAL</span>` : ''}</h1>
          <p class="muted">${inv.no} · <a href="#/cariler/${p.id}">${p.name}</a></p></div>
        <div class="actions">
          <button class="btn primary" data-act="print">Yazdır / PDF</button>
          ${w ? html`<a class="btn" href="#/faturalar/${inv.id}/duzenle">Düzenle</a>
            <button class="btn ghost danger-text" data-act="cancel">İptal et</button>` : ''}
          ${isAdmin() ? html`<button class="btn ghost danger-text" data-act="delete">Sil</button>` : ''}
        </div>
      </div>

      <article class="invoice-sheet ${inv.status === 'cancelled' ? 'is-cancelled' : ''}">
        <header class="inv-head">
          <div class="inv-party"><small>${sellerIsUs ? 'Satıcı' : 'Alıcı'}</small><div>${ourSide}</div></div>
          <div class="inv-title">
            <h2>${T.label.toLocaleUpperCase('tr')}</h2>
            <table class="inv-meta"><tbody>
              <tr><th>Fatura no</th><td>${inv.no}</td></tr>
              <tr><th>Tarih</th><td>${fmtDate(inv.date)}</td></tr>
              ${inv.due_date ? html`<tr><th>Vade</th><td>${fmtDate(inv.due_date)}</td></tr>` : ''}
            </tbody></table>
          </div>
        </header>
        <div class="inv-party to"><small>${sellerIsUs ? 'Alıcı' : 'Satıcı'}</small><div>${theirSide}</div></div>

        <table class="inv-lines">
          <thead><tr><th>#</th><th>Açıklama</th><th class="num">Miktar</th><th class="num">Birim fiyat</th><th class="num">İsk.</th><th class="num">KDV</th><th class="num">Tutar</th></tr></thead>
          <tbody>
            ${inv.lines.map((l) => html`<tr>
              <td>${l.line_no}</td>
              <td>${l.description}</td>
              <td class="num">${fmtQty(l.qty)} ${l.unit || ''}</td>
              <td class="num">${fmtMoney(l.unit_price)}</td>
              <td class="num">${l.discount_rate ? `%${l.discount_rate}` : ''}</td>
              <td class="num">%${l.vat_rate}</td>
              <td class="num">${fmtMoney(l.net)}</td>
            </tr>`)}
          </tbody>
        </table>

        <div class="inv-foot">
          <div class="inv-note">${inv.note ? html`<strong>Not:</strong> ${inv.note}` : ''}</div>
          <table class="inv-totals"><tbody>
            <tr><th>Ara toplam</th><td>${fmtTL(inv.subtotal)}</td></tr>
            ${inv.discount_total ? html`<tr><th>İskonto</th><td>−${fmtTL(inv.discount_total)}</td></tr>` : ''}
            <tr><th>KDV matrahı</th><td>${fmtTL(inv.subtotal - inv.discount_total)}</td></tr>
            ${inv.vat_breakdown.filter((v) => v.vat).map((v) => html`<tr><th>KDV %${v.vat_rate}</th><td>${fmtTL(v.vat)}</td></tr>`)}
            <tr class="grand"><th>Genel toplam</th><td>${fmtTL(inv.total)}</td></tr>
          </tbody></table>
        </div>
        <p class="inv-disclaimer">Bu belge ${session.company || 'firma'} ön muhasebe kaydıdır; e-Fatura / e-Arşiv yerine geçmez.</p>
      </article>

      <section class="card no-print">
        <header><h2>Kayıt bilgisi</h2></header>
        <p class="small muted">Oluşturan: ${inv.created_by_name || '—'} · ${fmtDateTime(inv.created_at)}
          ${inv.updated_at ? html` · Son değişiklik: ${inv.updated_by_name || '—'} · ${fmtDateTime(inv.updated_at)}` : ''}</p>
        ${inv.payments.length ? html`<p class="small">Bu faturayla kaydedilen ödeme:
          ${inv.payments.map((t) => html`${fmtTL(t.amount)} (${t.account_name}, ${fmtDate(t.date)}) `)}</p>` : ''}
      </section>
    </div>`);

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    try {
      if (act === 'print') window.print();
      if (act === 'cancel') {
        const msg = `${inv.no} iptal edilsin mi? Stok ve cari etkisi geri alınır${inv.payments.length ? ', bu faturayla girilen ödeme de silinir' : ''}. Fatura kaydı "iptal" olarak kalır.`;
        if (await confirmDialog(msg, { confirmLabel: 'İptal et' })) {
          saved(await post(`invoices/${inv.id}/cancel`), 'Fatura iptal edildi.');
          ctx.reload();
        }
      }
      if (act === 'delete' && (await confirmDialog(`${inv.no} kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`, { confirmLabel: 'Kalıcı sil' }))) {
        saved(await del(`invoices/${inv.id}`), 'Fatura silindi.');
        ctx.go('/faturalar');
      }
    } catch (err) {
      toastError(err);
    }
  });
}
