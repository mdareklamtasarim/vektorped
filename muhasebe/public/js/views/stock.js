// Stock: product list, product card with movements, manual stock in/out and counts.
import {
  html, raw, setHtml, get, post, put, del, qs, fmtTL, fmtMoney, fmtQty, fmtDate, field, moneyAttr, formDialog,
  confirmDialog, toast, toastError, nums, canWrite, isAdmin, emptyRow, today, downloadCsv, INVOICE_TYPES, bindFilters, saved, queued, pendingBadge,
} from '../core.js';

const MOVE_KINDS = { invoice: 'Fatura', in: 'Giriş', out: 'Çıkış', count: 'Sayım farkı' };
const UNITS = ['Adet', 'm²', 'm', 'Kg', 'Lt', 'Paket', 'Kutu', 'Rulo', 'Takım', 'Saat'];

export async function productsView(root, ctx) {
  const q = ctx.query;
  const products = await get(`products${qs({ q: q.q, critical: q.kritik, active: q.pasif ? 'all' : '' })}`);
  const totalValue = products.reduce((s, p) => s + Math.max(p.stock, 0) * p.avg_cost, 0);

  setHtml(root, html`
    <div class="page">
      <div class="page-head">
        <div><h1>Stok</h1><p class="muted">${products.length} ürün · stok değeri ${fmtTL(totalValue)}</p></div>
        <div class="actions">
          <button class="btn ghost" data-act="csv">CSV</button>
          ${canWrite() ? html`<button class="btn primary" data-act="new">+ Yeni ürün</button>` : ''}
        </div>
      </div>
      <form class="filters" data-filters>
        <input type="search" name="q" value="${q.q || ''}" placeholder="Ad, kod, kategori veya barkod ara" aria-label="Ara">
        <label class="check"><input type="checkbox" name="kritik" ${q.kritik ? raw('checked') : ''}> Sadece kritik</label>
        <label class="check"><input type="checkbox" name="pasif" ${q.pasif ? raw('checked') : ''}> Pasifleri göster</label>
      </form>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Kod</th><th>Ürün</th><th>Kategori</th><th class="num">Stok</th>
            <th class="num">Ort. maliyet</th><th class="num">Satış fiyatı</th><th class="num">KDV</th></tr></thead>
          <tbody>
            ${products.length ? products.map((p) => html`
              <tr class="${p.pending ? 'pending' : 'link'} ${p.active ? '' : 'inactive'}" ${p.pending ? '' : raw(`data-href="#/stok/${p.id}"`)}>
                <td class="mono">${p.code}</td>
                <td>${p.name}${p.active ? '' : html` <span class="badge">pasif</span>`}${pendingBadge(p)}</td>
                <td>${p.category || ''}</td>
                <td class="num ${p.stock < 0 || p.critical ? 'neg' : ''}">${fmtQty(p.stock)} ${p.unit}</td>
                <td class="num">${fmtMoney(p.avg_cost)}</td>
                <td class="num">${fmtMoney(p.sell_price)}</td>
                <td class="num">%${p.vat_rate}</td>
              </tr>`) : emptyRow(7, q.q ? 'Aramaya uyan ürün yok.' : 'Henüz ürün yok. "Yeni ürün" ile başlayın.')}
          </tbody>
        </table>
      </div>
    </div>`);

  bindFilters(root, ctx, (f) => ({ q: f.get('q'), kritik: f.get('kritik') ? '1' : '', pasif: f.get('pasif') ? '1' : '' }));

  root.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-href]');
    if (row) location.hash = row.dataset.href;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'new') {
      const r = await productDialog();
      if (r) (queued(r) ? ctx.reload() : ctx.go(`/stok/${r.id}`));
    }
    if (act === 'csv') {
      downloadCsv('stok-listesi.csv',
        ['Kod', 'Ürün', 'Kategori', 'Birim', 'Stok', 'Ort. maliyet', 'Alış fiyatı', 'Satış fiyatı', 'KDV %', 'Kritik seviye', 'Barkod'],
        products.map((p) => [p.code, p.name, p.category, p.unit, p.stock, p.avg_cost, p.buy_price, p.sell_price, p.vat_rate, p.critical_level, p.barcode]));
    }
  });
}

export async function productDialog(p = null) {
  // Offline the next free code is unknown; the server assigns one when it is left empty.
  const code = p ? p.code : await get('products/next-code', { live: true }).then((r) => r.code, () => '');
  return formDialog({
    title: p ? 'Ürünü düzenle' : 'Yeni ürün',
    wide: true,
    body: html`
      <div class="form-grid">
        ${field('Stok kodu', html`<input name="code" value="${code}" maxlength="40" placeholder="Otomatik">`, code ? {} : { hint: 'Boş bırakılırsa otomatik verilir.' })}
        ${field('Ürün adı', html`<input name="name" value="${p?.name || ''}" required maxlength="200">`, { cls: 'span-2' })}
        ${field('Birim', html`<input name="unit" value="${p?.unit || 'Adet'}" list="unit-list" required maxlength="20">
          <datalist id="unit-list">${UNITS.map((u) => html`<option value="${u}">`)}</datalist>`)}
        ${field('Kategori', html`<input name="category" value="${p?.category || ''}" maxlength="80">`)}
        ${field('Barkod', html`<input name="barcode" value="${p?.barcode || ''}" maxlength="60">`)}
        ${field('Alış fiyatı (KDV hariç)', html`<input name="buy_price" value="${p ? fmtMoney(p.buy_price) : ''}" ${raw(moneyAttr)}>`)}
        ${field('Satış fiyatı (KDV hariç)', html`<input name="sell_price" value="${p ? fmtMoney(p.sell_price) : ''}" ${raw(moneyAttr)}>`)}
        ${field('KDV %', html`<input name="vat_rate" value="${p ? p.vat_rate : 20}" inputmode="decimal" list="vat-list">
          <datalist id="vat-list"><option value="0"><option value="1"><option value="10"><option value="20"></datalist>`)}
        ${field('Kritik stok seviyesi', html`<input name="critical_level" value="${p ? p.critical_level : ''}" inputmode="decimal">`,
          { hint: 'Stok bu seviyeye düşünce uyarı verilir.' })}
        ${field('Not', html`<textarea name="note" rows="2" maxlength="1000">${p?.note || ''}</textarea>`, { cls: 'span-2' })}
        ${p ? html`<label class="check span-3"><input type="checkbox" name="active" ${p.active ? raw('checked') : ''}> Aktif (pasif ürünler listelerde gizlenir)</label>` : ''}
      </div>`,
    onSubmit: async (d) => {
      nums(d, ['buy_price', 'sell_price', 'vat_rate', 'critical_level']);
      if (p) {
        saved(await put(`products/${p.id}`, d), 'Ürün güncellendi.');
        return { id: p.id };
      }
      const r = await post('products', d);
      saved(r, 'Ürün eklendi.');
      return r;
    },
  });
}

function stockMoveDialog(p, kind) {
  const titles = { in: 'Stok girişi', out: 'Stok çıkışı', count: 'Sayım sonucu gir' };
  return formDialog({
    title: `${titles[kind]} · ${p.name}`,
    body: html`
      ${kind === 'count' ? html`<p class="muted">Şu anki stok: <strong>${fmtQty(p.stock)} ${p.unit}</strong>. Saydığınız miktarı girin; fark otomatik kaydedilir.</p>` : ''}
      <div class="form-grid two">
        ${field('Tarih', html`<input type="date" name="date" value="${today()}" required>`)}
        ${field(kind === 'count' ? `Sayılan miktar (${p.unit})` : `Miktar (${p.unit})`, html`<input name="qty" inputmode="decimal" required>`)}
        ${kind === 'in' ? field('Birim maliyet (KDV hariç)', html`<input name="unit_cost" value="${fmtMoney(p.buy_price)}" ${raw(moneyAttr)}>`) : ''}
        ${field('Açıklama', html`<input name="note" maxlength="300" placeholder="${kind === 'out' ? 'Örn. fire, numune, kendi kullanım' : ''}">`, { cls: 'span-2' })}
      </div>`,
    onSubmit: async (d) => {
      nums(d, ['qty', 'unit_cost']);
      const r = await post('stock-moves', { ...d, kind, product_id: p.id });
      if (queued(r)) saved(r);
      else toast(`Kaydedildi. Yeni stok: ${fmtQty(r.stock)} ${p.unit}`);
      return r;
    },
  });
}

export async function productView(root, ctx) {
  const p = await get(`products/${ctx.params[0]}`);
  const w = canWrite();
  setHtml(root, html`
    <div class="page">
      <a class="back" href="#/stok">← Stok</a>
      <div class="page-head">
        <div>
          <h1>${p.name} ${p.active ? '' : html`<span class="badge">pasif</span>`}</h1>
          <p class="muted mono">${p.code}${p.barcode ? ` · ${p.barcode}` : ''}${p.category ? ` · ${p.category}` : ''}</p>
        </div>
        ${w ? html`<div class="actions">
          <button class="btn" data-act="in">+ Giriş</button>
          <button class="btn" data-act="out">− Çıkış</button>
          <button class="btn" data-act="count">Sayım</button>
          <button class="btn ghost" data-act="edit">Düzenle</button>
          ${isAdmin() ? html`<button class="btn ghost danger-text" data-act="delete">Sil</button>` : ''}
        </div>` : ''}
      </div>
      <div class="stats">
        <div class="stat ${p.stock < 0 || p.critical ? 'neg' : ''}"><span>Mevcut stok</span><strong>${fmtQty(p.stock)} ${p.unit}</strong>
          ${p.critical_level ? html`<small>Kritik seviye: ${fmtQty(p.critical_level)}</small>` : ''}</div>
        <div class="stat"><span>Ortalama maliyet</span><strong>${fmtTL(p.avg_cost)}</strong><small>Alış fiyatı: ${fmtTL(p.buy_price)}</small></div>
        <div class="stat"><span>Satış fiyatı</span><strong>${fmtTL(p.sell_price)}</strong><small>KDV %${p.vat_rate} hariç</small></div>
        <div class="stat"><span>Stok değeri</span><strong>${fmtTL(Math.max(p.stock, 0) * p.avg_cost)}</strong><small>maliyet üzerinden</small></div>
      </div>
      ${p.note ? html`<div class="notice">${p.note}</div>` : ''}
      <section class="card">
        <header><h2>Stok hareketleri</h2></header>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Tarih</th><th>Tür</th><th>Belge / açıklama</th><th class="num">Miktar</th><th class="num">Birim maliyet</th><th>Kullanıcı</th><th></th></tr></thead>
            <tbody>
              ${p.moves.length ? p.moves.map((m) => html`
                <tr>
                  <td>${fmtDate(m.date)}</td>
                  <td>${m.invoice_id ? INVOICE_TYPES[m.invoice_type].short : MOVE_KINDS[m.kind]}</td>
                  <td>${m.invoice_id ? html`<a href="#/faturalar/${m.invoice_id}">${m.invoice_no}</a> ${m.party_name || ''}` : m.note || ''}</td>
                  <td class="num ${m.qty < 0 ? 'neg' : 'pos'}">${m.qty > 0 ? '+' : ''}${fmtQty(m.qty)}</td>
                  <td class="num">${m.unit_cost == null ? '' : fmtMoney(m.unit_cost)}</td>
                  <td class="muted">${m.user_name || ''}</td>
                  <td class="num">${w && !m.invoice_id ? html`<button class="icon-btn sm" data-del-move="${m.id}" title="Hareketi sil" aria-label="Hareketi sil">✕</button>` : ''}</td>
                </tr>`) : emptyRow(7, 'Bu ürünün henüz hareketi yok.')}
            </tbody>
          </table>
        </div>
      </section>
    </div>`);

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    try {
      if (act === 'in' || act === 'out' || act === 'count') {
        if (await stockMoveDialog(p, act)) ctx.reload();
      } else if (act === 'edit') {
        if (await productDialog(p)) ctx.reload();
      } else if (act === 'delete') {
        if (await confirmDialog(`"${p.name}" silinsin mi? Bu işlem geri alınamaz.`, { confirmLabel: 'Sil' })) {
          saved(await del(`products/${p.id}`), 'Ürün silindi.');
          ctx.go('/stok');
        }
      }
      const moveId = e.target.closest('[data-del-move]')?.dataset.delMove;
      if (moveId && (await confirmDialog('Bu stok hareketi silinsin mi?', { confirmLabel: 'Sil' }))) {
        saved(await del(`stock-moves/${moveId}`), 'Hareket silindi.');
        ctx.reload();
      }
    } catch (err) {
      toastError(err);
    }
  });
}
