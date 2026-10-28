// Cash & bank: account balances, money movements and account statements.
import {
  html, raw, setHtml, get, post, put, del, qs, fmtTL, fmtMoney, fmtDate, field, moneyAttr, formDialog,
  confirmDialog, toast, toastError, nums, canWrite, isAdmin, emptyRow, today, downloadCsv, options,
  TX_KINDS, rangeBar, bindRangeBar, session,
} from '../core.js';

const EXPENSE_CATEGORIES = ['Kira', 'Elektrik', 'Su', 'Doğalgaz', 'İnternet / Telefon', 'Personel maaşı', 'SGK primi',
  'Vergi / harç', 'Yakıt', 'Kargo', 'Sarf malzeme', 'Bakım / onarım', 'Banka masrafı', 'Muhasebe ücreti', 'Yemek', 'Diğer'];
const INCOME_CATEGORIES = ['Faiz geliri', 'Kira geliri', 'Hizmet geliri', 'Diğer'];

// One dialog for every kind of money movement. Returns a truthy value when saved.
export async function transactionDialog({ kind, partyId, accountId, tx } = {}) {
  kind = tx ? tx.kind : kind;
  const needsParty = kind === 'collection' || kind === 'payment';
  const [accounts, parties, cats] = await Promise.all([
    get('accounts'),
    needsParty ? get(`parties${qs({ kind: kind === 'collection' ? 'customer' : 'supplier' })}`) : [],
    kind === 'income' || kind === 'expense' ? get('transactions/categories') : null,
  ]);
  if (!accounts.length) throw new Error('Önce Kasa & Banka sayfasından bir hesap ekleyin.');
  const wantParty = tx ? tx.party_id : partyId;
  if (needsParty && wantParty && !parties.some((p) => p.id === wantParty)) {
    // The party may be of the "other" kind or inactive; fetch it so it can still be chosen.
    parties.push(await get(`parties/${wantParty}`));
  }
  const label = (p) => `${p.name} (${p.code})`;
  const byLabel = new Map(parties.map((p) => [label(p), p]));
  const pre = parties.find((p) => p.id === wantParty);
  const catList = kind === 'expense'
    ? [...new Set([...(cats?.expense || []), ...EXPENSE_CATEGORIES])]
    : [...new Set([...(cats?.income || []), ...INCOME_CATEGORIES])];
  const accOptions = (sel) => accounts.map((a) => html`<option value="${a.id}" ${a.id === sel ? raw('selected') : ''}>${a.name} · ${fmtTL(a.balance)}</option>`);
  const titles = {
    collection: 'Tahsilat (cariden para girişi)',
    payment: 'Ödeme (cariye para çıkışı)',
    income: 'Gelir kaydı',
    expense: 'Gider kaydı',
    transfer: 'Virman (hesaplar arası transfer)',
  };

  return formDialog({
    title: tx ? `${TX_KINDS[kind].label} düzenle` : titles[kind],
    body: html`
      <div class="form-grid two">
        ${needsParty ? field('Cari', html`<input name="party" list="tx-party-list" required autocomplete="off" value="${pre ? label(pre) : ''}" placeholder="Cari ara…">
          <datalist id="tx-party-list">${parties.map((p) => html`<option value="${label(p)}">Bakiye ${fmtTL(p.balance)}</option>`)}</datalist>`, { cls: 'span-2' }) : ''}
        ${field(kind === 'transfer' ? 'Çıkış hesabı' : 'Hesap', html`<select name="account_id">${accOptions(tx ? tx.account_id : accountId || accounts[0].id)}</select>`)}
        ${kind === 'transfer' ? field('Giriş hesabı', html`<select name="to_account_id">${accOptions(accounts.find((a) => a.id !== (accountId || accounts[0].id))?.id)}</select>`) : ''}
        ${field('Tarih', html`<input type="date" name="date" value="${tx ? tx.date : today()}" required>`)}
        ${field('Tutar (₺)', html`<input name="amount" required value="${tx ? fmtMoney(tx.amount) : ''}" ${raw(moneyAttr)}>`)}
        ${kind === 'income' || kind === 'expense' ? field('Kategori', html`<input name="category" list="tx-cat-list" required value="${tx?.category || ''}" maxlength="80">
          <datalist id="tx-cat-list">${catList.map((c) => html`<option value="${c}">`)}</datalist>`) : ''}
        ${field('Açıklama', html`<input name="description" value="${tx?.description || ''}" maxlength="300">`, { cls: 'span-2' })}
      </div>`,
    onSubmit: async (d) => {
      nums(d, ['amount']);
      if (needsParty) {
        const p = byLabel.get(String(d.party || '').trim());
        if (!p) throw new Error('Listeden bir cari seçin.');
        d.party_id = p.id;
      }
      delete d.party;
      d.account_id = Number(d.account_id);
      if (d.to_account_id) d.to_account_id = Number(d.to_account_id);
      if (tx) {
        await put(`transactions/${tx.id}`, d);
        toast('İşlem güncellendi.');
      } else {
        await post('transactions', { ...d, kind });
        toast(`${TX_KINDS[kind].label} kaydedildi.`);
      }
      return true;
    },
  });
}

function accountDialog(a = null) {
  return formDialog({
    title: a ? 'Hesabı düzenle' : 'Yeni kasa / banka hesabı',
    body: html`
      <div class="form-grid two">
        ${field('Hesap adı', html`<input name="name" value="${a?.name || ''}" required maxlength="80" placeholder="Örn. Merkez Kasa, Ziraat TL">`, { cls: 'span-2' })}
        ${field('Tür', html`<select name="kind">${options({ cash: 'Kasa', bank: 'Banka' }, a?.kind || 'cash')}</select>`)}
        ${field('Açılış bakiyesi (₺)', html`<input name="opening_balance" value="${a ? fmtMoney(a.opening_balance) : ''}" ${raw(moneyAttr)}>`)}
        ${field('IBAN', html`<input name="iban" value="${a?.iban || ''}" maxlength="40" autocapitalize="characters">`, { cls: 'span-2' })}
        ${a ? html`<label class="check span-2"><input type="checkbox" name="active" ${a.active ? raw('checked') : ''}> Aktif</label>` : ''}
      </div>`,
    onSubmit: async (d) => {
      nums(d, ['opening_balance']);
      if (a) await put(`accounts/${a.id}`, d);
      else await post('accounts', d);
      toast(a ? 'Hesap güncellendi.' : 'Hesap eklendi.');
      return true;
    },
  });
}

const txRow = (t, { showAccount = true, showBalance = false, w = false } = {}) => html`
  <tr>
    <td>${fmtDate(t.date)}</td>
    <td>${TX_KINDS[t.kind].label}</td>
    ${showAccount ? html`<td>${t.account_name}</td>` : ''}
    <td>${t.party_id ? html`<a href="#/cariler/${t.party_id}">${t.party_name}</a>` : t.category || ''}
      ${t.invoice_id ? html` · <a href="#/faturalar/${t.invoice_id}">${t.invoice_no}</a>` : ''}
      ${t.description ? html`<br><small class="muted">${t.description}</small>` : ''}</td>
    <td class="num pos">${t.direction > 0 ? fmtMoney(t.amount) : ''}</td>
    <td class="num neg">${t.direction < 0 ? fmtMoney(t.amount) : ''}</td>
    ${showBalance ? html`<td class="num">${fmtMoney(t.balance)}</td>` : ''}
    <td class="num nowrap">${w ? html`
      ${t.transfer_group ? '' : html`<button class="icon-btn sm" data-edit-tx="${t.id}" title="Düzenle" aria-label="Düzenle">✎</button>`}
      <button class="icon-btn sm" data-del-tx="${t.id}" title="Sil" aria-label="Sil">✕</button>` : ''}</td>
  </tr>`;

async function handleTxClick(e, rows, ctx) {
  const editId = e.target.closest('[data-edit-tx]')?.dataset.editTx;
  const delId = e.target.closest('[data-del-tx]')?.dataset.delTx;
  try {
    if (editId) {
      const tx = rows.find((t) => String(t.id) === editId);
      if (await transactionDialog({ tx })) ctx.reload();
    }
    if (delId) {
      const tx = rows.find((t) => String(t.id) === delId);
      const extra = tx.transfer_group ? ' Virmanın iki tarafı da silinir.' : tx.invoice_id ? ' Fatura ödenmemiş görünecek.' : '';
      if (await confirmDialog(`${TX_KINDS[tx.kind].label} (${fmtTL(tx.amount)}) silinsin mi?${extra}`, { confirmLabel: 'Sil' })) {
        await del(`transactions/${delId}`);
        toast('İşlem silindi.');
        ctx.reload();
      }
    }
  } catch (err) {
    toastError(err);
  }
}

export async function financeView(root, ctx) {
  const q = ctx.query;
  const { range, markup: rangeMarkup } = rangeBar(q);
  const [accounts, txs] = await Promise.all([
    get(`accounts${qs({ active: q.pasif ? 'all' : '' })}`),
    get(`transactions${qs({ ...range, kind: q.tur })}`),
  ]);
  const w = canWrite();
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const inSum = txs.filter((t) => t.direction > 0 && t.kind !== 'transfer').reduce((s, t) => s + t.amount, 0);
  const outSum = txs.filter((t) => t.direction < 0 && t.kind !== 'transfer').reduce((s, t) => s + t.amount, 0);

  setHtml(root, html`
    <div class="page">
      <div class="page-head">
        <div><h1>Kasa & Banka</h1><p class="muted">Toplam ${fmtTL(total)}</p></div>
        ${w ? html`<div class="actions">
          <button class="btn primary" data-tx="collection">Tahsilat</button>
          <button class="btn" data-tx="payment">Ödeme</button>
          <button class="btn" data-tx="income">Gelir</button>
          <button class="btn" data-tx="expense">Gider</button>
          <button class="btn" data-tx="transfer">Virman</button>
          <button class="btn ghost" data-act="new-account">+ Hesap</button>
        </div>` : ''}
      </div>
      <div class="stats">
        ${accounts.map((a) => html`<a class="stat link ${a.balance < 0 ? 'neg' : ''} ${a.active ? '' : 'inactive'}" href="#/kasa/${a.id}">
          <span>${a.kind === 'cash' ? 'Kasa' : 'Banka'}</span><strong>${fmtTL(a.balance)}</strong><small>${a.name}</small></a>`)}
      </div>
      <section class="card">
        <header><h2>Hareketler</h2>
          <form class="filters inline" data-filters>
            <select name="tur" aria-label="İşlem türü">${options({ '': 'Tüm işlemler', ...Object.fromEntries(Object.entries(TX_KINDS).map(([k, v]) => [k, v.label])) }, q.tur || '')}</select>
            ${rangeMarkup}
            <button class="btn ghost sm" type="button" data-act="csv">CSV</button>
          </form>
        </header>
        <p class="muted small">Dönem: giriş ${fmtTL(inSum)} · çıkış ${fmtTL(outSum)} (virmanlar hariç)</p>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Tarih</th><th>İşlem</th><th>Hesap</th><th>Cari / kategori</th><th class="num">Giriş</th><th class="num">Çıkış</th><th></th></tr></thead>
            <tbody>${txs.length ? txs.map((t) => txRow(t, { w })) : emptyRow(7, 'Bu dönemde hareket yok.')}</tbody>
          </table>
        </div>
      </section>
    </div>`);

  bindRangeBar(root, q, ctx.setQuery);
  root.querySelector('[data-filters] [name=tur]').addEventListener('change', (e) => ctx.setQuery({ ...q, tur: e.target.value }));
  root.addEventListener('click', async (e) => {
    const kind = e.target.closest('[data-tx]')?.dataset.tx;
    const act = e.target.closest('[data-act]')?.dataset.act;
    try {
      if (kind && (await transactionDialog({ kind }))) ctx.reload();
      if (act === 'new-account' && (await accountDialog())) ctx.reload();
      if (act === 'csv') {
        downloadCsv('kasa-banka-hareketleri.csv', ['Tarih', 'İşlem', 'Hesap', 'Cari', 'Kategori', 'Belge', 'Açıklama', 'Giriş', 'Çıkış'],
          txs.map((t) => [fmtDate(t.date), TX_KINDS[t.kind].label, t.account_name, t.party_name, t.category, t.invoice_no, t.description,
            t.direction > 0 ? t.amount : '', t.direction < 0 ? t.amount : '']));
      }
    } catch (err) {
      toastError(err);
    }
    await handleTxClick(e, txs, ctx);
  });
}

export async function accountView(root, ctx) {
  const q = ctx.query;
  const { range, markup: rangeMarkup } = rangeBar(q);
  const a = await get(`accounts/${ctx.params[0]}${qs(range)}`);
  const s = a.statement;
  const w = canWrite();
  setHtml(root, html`
    <div class="page">
      <a class="back no-print" href="#/kasa">← Kasa & Banka</a>
      <div class="page-head">
        <div><h1>${a.name} ${a.active ? '' : html`<span class="badge">pasif</span>`}</h1>
          <p class="muted">${a.kind === 'cash' ? 'Kasa' : 'Banka'}${a.iban ? ` · ${a.iban}` : ''} · bakiye <strong>${fmtTL(a.balance)}</strong></p></div>
        <div class="actions no-print">
          ${w ? html`<button class="btn" data-tx="collection">Tahsilat</button><button class="btn" data-tx="payment">Ödeme</button>
            <button class="btn" data-tx="income">Gelir</button><button class="btn" data-tx="expense">Gider</button>
            <button class="btn" data-tx="transfer">Virman</button>
            <button class="btn ghost" data-act="edit">Düzenle</button>` : ''}
          ${isAdmin() ? html`<button class="btn ghost danger-text" data-act="delete">Sil</button>` : ''}
        </div>
      </div>
      <section class="card">
        <header><h2>Hesap ekstresi</h2><div class="actions no-print">${rangeMarkup}
          <button class="btn ghost sm" data-act="print">Yazdır</button></div></header>
        <div class="print-only print-head"><strong>${session.company}</strong> · ${a.name} hesap ekstresi
          ${range.from ? `· ${fmtDate(range.from)} – ${fmtDate(range.to)}` : ''}</div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Tarih</th><th>İşlem</th><th>Cari / kategori</th><th class="num">Giriş</th><th class="num">Çıkış</th><th class="num">Bakiye</th><th></th></tr></thead>
            <tbody>
              <tr class="carried"><td colspan="5">${range.from ? 'Devreden bakiye' : 'Açılış bakiyesi'}</td><td class="num">${fmtMoney(s.carried)}</td><td></td></tr>
              ${s.rows.length ? s.rows.map((t) => txRow(t, { showAccount: false, showBalance: true, w })) : emptyRow(7, 'Bu dönemde hareket yok.')}
            </tbody>
            <tfoot><tr><td colspan="5">Kapanış bakiyesi</td><td class="num">${fmtMoney(s.closing)}</td><td></td></tr></tfoot>
          </table>
        </div>
      </section>
    </div>`);

  bindRangeBar(root, q, ctx.setQuery);
  root.addEventListener('click', async (e) => {
    const kind = e.target.closest('[data-tx]')?.dataset.tx;
    const act = e.target.closest('[data-act]')?.dataset.act;
    try {
      if (kind && (await transactionDialog({ kind, accountId: a.id }))) ctx.reload();
      if (act === 'edit' && (await accountDialog(a))) ctx.reload();
      if (act === 'print') window.print();
      if (act === 'delete' && (await confirmDialog(`"${a.name}" hesabı silinsin mi?`, { confirmLabel: 'Sil' }))) {
        await del(`accounts/${a.id}`);
        toast('Hesap silindi.');
        ctx.go('/kasa');
      }
    } catch (err) {
      toastError(err);
    }
    await handleTxClick(e, s.rows, ctx);
  });
}
