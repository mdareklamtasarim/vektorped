// Shared helpers: safe HTML templating, API client, formatting, dialogs and toasts.
import * as offline from './offline.js';

export { offline };

// ---- HTML templating (everything interpolated is escaped unless it is already Safe) ----
export class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
function render(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Safe(out);
}
export const raw = (s) => new Safe(String(s));

export function el(markup) {
  const t = document.createElement('template');
  t.innerHTML = render(markup).trim();
  return t.content.firstElementChild;
}
export function setHtml(node, markup) {
  node.innerHTML = render(markup);
  return node;
}

// ---- API ---------------------------------------------------------------------
export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

// One request to the server. Status 0 means the server could not be reached.
async function send(method, path, body, opId) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body ?? {});
  }
  if (opId) opts.headers['X-Op-Id'] = opId;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl && setTimeout(() => ctrl.abort(), method === 'GET' ? 10000 : 15000);
  if (ctrl) opts.signal = ctrl.signal;
  let res;
  try {
    res = await fetch(`api/${path}`, opts);
  } catch {
    offline.setOnline(false, offline.state.cacheAt);
    throw new ApiError('Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.', 0);
  } finally {
    if (timer) clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  // A proxy or captive Wi-Fi page answering instead of our server counts as offline.
  if (!data && res.status >= 500) {
    offline.setOnline(false, offline.state.cacheAt);
    throw new ApiError('Sunucuya ulaşılamadı.', 0);
  }
  offline.setOnline(true);
  if (res.status === 401 && !path.startsWith('auth/')) onUnauthorized();
  if (!res.ok) throw new ApiError((data && data.error) || `Hata (${res.status})`, res.status);
  return data;
}

// Paths that must reach the server right away and are never queued.
const NEVER_QUEUE = /^(auth\/|backup)/;

// GET: live data when the server answers, otherwise the last saved copy.
// Writes: sent right away when possible; otherwise queued and sent later.
// opts.live: never fall back to saved data (e.g. the next free invoice number).
export async function api(method, path, body, opts = {}) {
  if (method === 'GET') {
    try {
      const data = await send('GET', path);
      offline.saveCache(path, data);
      return offline.overlay(path, data);
    } catch (err) {
      if (err.status !== 0 || opts.live) throw err;
      const cached = await offline.readCache(path);
      if (!cached) throw new ApiError('Bağlantı yok ve bu sayfa bu cihazda daha önce açılmamış.', 0);
      offline.setOnline(false, cached.at);
      return offline.overlay(path, cached.data);
    }
  }
  if (NEVER_QUEUE.test(path)) return send(method, path, body);
  const opId = offline.newOpId();
  // Keep the order of changes: while older ones wait, new ones wait behind them.
  if (!offline.hasQueued()) {
    try {
      return await send(method, path, body, opId);
    } catch (err) {
      if (err.status !== 0) throw err;
    }
  }
  const op = await offline.enqueue(method, path, body, opId);
  offline.flush();
  return { ok: true, offline: true, id: op.tmpId, ids: op.tmpId ? [op.tmpId] : [], no: 'bekliyor' };
}
export const get = (p, o) => api('GET', p, undefined, o);
export const post = (p, b) => api('POST', p, b);
export const put = (p, b) => api('PUT', p, b);
export const del = (p) => api('DELETE', p);
export const queued = (r) => !!(r && r.offline);
export const OFFLINE_SAVED = 'Bağlantı yok: değişiklik bu cihazda saklandı, bağlantı gelince gönderilecek.';

offline.configure({ send });

export function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
}

// ---- formatting --------------------------------------------------------------
const moneyFmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });
export const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);
export const fmtTL = (n) => `${fmtMoney(n)} ₺`;
export const fmtQty = (n) => qtyFmt.format(Number(n) || 0);
export function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}.${m}.${y}`;
}
export function fmtDateTime(s) {
  if (!s) return '';
  // Server timestamps are UTC ("YYYY-MM-DD HH:MM:SS").
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}
// Accepts "1.234,56", "1234,56" and "1234.56".
export function parseNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/\s|₺/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
export function localDate(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export const today = () => localDate();

// Moves to an in-app address like "#/stok/3". The app may swap in memory routing
// (used when the page runs inside a host that doesn't keep #/ addresses).
let navigator_ = (href) => { location.hash = href; };
export function setNavigator(fn) { navigator_ = fn; }
export const navigate = (href) => navigator_(href);

// A signed customer/supplier balance in words.
export function balanceText(b) {
  const n = Number(b) || 0;
  if (Math.abs(n) < 0.005) return html`<span class="muted">0,00 ₺</span>`;
  return n > 0
    ? html`<span class="pos">${fmtTL(n)} <small>borçlu</small></span>`
    : html`<span class="neg">${fmtTL(-n)} <small>alacaklı</small></span>`;
}

export const INVOICE_TYPES = {
  sale: { label: 'Satış Faturası', short: 'Satış', party: 'customer' },
  purchase: { label: 'Alış Faturası', short: 'Alış', party: 'supplier' },
  sale_return: { label: 'Satış İade Faturası', short: 'Satış iade', party: 'customer' },
  purchase_return: { label: 'Alış İade Faturası', short: 'Alış iade', party: 'supplier' },
};
export const TX_KINDS = {
  collection: { label: 'Tahsilat', dir: 1 },
  payment: { label: 'Ödeme', dir: -1 },
  income: { label: 'Gelir', dir: 1 },
  expense: { label: 'Gider', dir: -1 },
  transfer: { label: 'Virman', dir: 0 },
};
export const PARTY_KINDS = { customer: 'Müşteri', supplier: 'Tedarikçi', both: 'Müşteri + Tedarikçi' };
export const ROLES = { admin: 'Yönetici', user: 'Kullanıcı', viewer: 'Sadece görüntüleme' };

// ---- session ---------------------------------------------------------------------
export const session = { user: null, company: '' };
export const canWrite = () => !!session.user && session.user.role !== 'viewer';
export const isAdmin = () => !!session.user && session.user.role === 'admin';

// ---- toasts ------------------------------------------------------------------
export function toast(message, kind = 'ok') {
  const host = document.getElementById('toasts');
  const t = el(html`<div class="toast ${kind}" role="status">${message}</div>`);
  host.append(t);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(() => t.classList.add('hide'), 3200);
  setTimeout(() => t.remove(), 3700);
}
export const toastError = (err) => toast(err && err.message ? err.message : String(err), 'err');
// Success message, or the "saved on this device" note when the change was queued offline.
export function saved(r, message) {
  if (queued(r)) toast(OFFLINE_SAVED, 'wait');
  else toast(message);
}
export const pendingBadge = (x) => (x && x.pending
  ? html` <span class="badge wait" title="${x.pendingError || 'Bağlantı gelince gönderilecek'}">${x.pendingError ? 'gönderilemedi' : 'bekliyor'}</span>`
  : '');

// ---- dialogs -----------------------------------------------------------------
// Opens a form in a modal. onSubmit(data, form) may throw to keep the dialog open.
export function formDialog({ title, body, submitLabel = 'Kaydet', danger = false, wide = false, onSubmit, onOpen }) {
  return new Promise((resolve) => {
    const dlg = el(html`
      <dialog class="dialog ${wide ? 'wide' : ''}">
        <form method="dialog" novalidate>
          <header><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Kapat">✕</button></header>
          <div class="dialog-body">${body}</div>
          <p class="form-error" hidden></p>
          <footer>
            <button type="button" class="btn ghost" data-close>Vazgeç</button>
            <button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${submitLabel}</button>
          </footer>
        </form>
      </dialog>`);
    document.body.append(dlg);
    const form = dlg.querySelector('form');
    const errBox = dlg.querySelector('.form-error');
    const close = (value) => {
      dlg.close();
      dlg.remove();
      resolve(value);
    };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(null)));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      errBox.hidden = true;
      try {
        const result = onSubmit ? await onSubmit(formData(form), form) : formData(form);
        close(result ?? true);
      } catch (err) {
        errBox.textContent = err.message || String(err);
        errBox.hidden = false;
        btn.disabled = false;
      }
    });
    dlg.showModal();
    if (onOpen) onOpen(form);
    const first = form.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus();
  });
}

export function confirmDialog(message, { title = 'Emin misiniz?', confirmLabel = 'Evet', danger = true } = {}) {
  return formDialog({
    title, submitLabel: confirmLabel, danger,
    body: html`<p class="confirm-text">${message}</p>`,
  }).then((r) => !!r);
}

export function formData(form) {
  const out = {};
  for (const elx of form.elements) {
    if (!elx.name || elx.disabled) continue;
    if (elx.type === 'checkbox') out[elx.name] = elx.checked;
    else if (elx.type === 'radio') { if (elx.checked) out[elx.name] = elx.value; }
    else out[elx.name] = elx.value;
  }
  return out;
}

// Numeric form fields go to the API as numbers; empty stays empty.
export function nums(data, keys) {
  for (const k of keys) {
    if (data[k] === undefined) continue;
    const n = parseNum(data[k]);
    if (Number.isNaN(n)) throw new Error('Sayı alanlarına geçerli bir değer girin.');
    data[k] = n;
  }
  return data;
}

// ---- small UI pieces -----------------------------------------------------------
export function field(label, input, { hint, cls = '' } = {}) {
  return html`<label class="field ${cls}"><span>${label}</span>${input}${hint ? html`<small class="hint">${hint}</small>` : ''}</label>`;
}
export const moneyAttr = 'inputmode="decimal" autocomplete="off"';

export function options(map, selected) {
  return Object.entries(map).map(([v, l]) => html`<option value="${v}" ${String(v) === String(selected) ? raw('selected') : ''}>${l}</option>`);
}

export function emptyRow(cols, text = 'Kayıt yok.') {
  return html`<tr class="empty"><td colspan="${cols}">${text}</td></tr>`;
}

// Date range presets used by lists and reports.
export function presetRange(key) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = (yy, mm, dd) => localDate(new Date(yy, mm, dd));
  switch (key) {
    case 'today': return { from: today(), to: today() };
    case 'month': return { from: d(y, m, 1), to: d(y, m + 1, 0) };
    case 'last-month': return { from: d(y, m - 1, 1), to: d(y, m, 0) };
    case 'quarter': { const q = Math.floor(m / 3) * 3; return { from: d(y, q, 1), to: d(y, q + 3, 0) }; }
    case 'year': return { from: d(y, 0, 1), to: d(y, 11, 31) };
    default: return { from: '', to: '' };
  }
}
export const PRESETS = { month: 'Bu ay', 'last-month': 'Geçen ay', quarter: 'Bu çeyrek', year: 'Bu yıl', all: 'Tümü', custom: 'Özel' };

export function rangeBar(q, { allowAll = true } = {}) {
  const preset = q.donem || 'month';
  const r = preset === 'custom' ? { from: q.from || '', to: q.to || '' } : presetRange(preset);
  const presets = allowAll ? PRESETS : Object.fromEntries(Object.entries(PRESETS).filter(([k]) => k !== 'all'));
  return {
    range: r,
    markup: html`
      <div class="range-bar">
        <select name="donem" aria-label="Dönem">${options(presets, preset)}</select>
        <input type="date" name="from" value="${r.from}" aria-label="Başlangıç" ${preset === 'custom' ? '' : raw('disabled')}>
        <input type="date" name="to" value="${r.to}" aria-label="Bitiş" ${preset === 'custom' ? '' : raw('disabled')}>
      </div>`,
  };
}
// Wire a range bar so that changes update the URL query (and re-render the view).
export function bindRangeBar(root, q, navigate) {
  const bar = root.querySelector('.range-bar');
  if (!bar) return;
  bar.addEventListener('change', () => {
    const donem = bar.querySelector('[name=donem]').value;
    const next = { ...q, donem };
    if (donem === 'custom') {
      next.from = bar.querySelector('[name=from]').value;
      next.to = bar.querySelector('[name=to]').value;
    } else {
      delete next.from;
      delete next.to;
    }
    navigate(next);
  });
}

// ---- CSV export (semicolon separated with BOM so Excel in Turkish opens it cleanly) ----
export function downloadCsv(filename, headers, rows) {
  const cell = (v) => {
    let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = `'${s}`;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [headers, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- filters that live in the URL --------------------------------------------------
// Re-rendering on each keystroke would lose the caret; remember the field and restore it.
let pendingFocus = null;
export function restoreFocus(root) {
  if (!pendingFocus) return;
  const input = root.querySelector(`[name="${pendingFocus}"]`);
  pendingFocus = null;
  if (!input) return;
  input.focus();
  const n = input.value.length;
  try { input.setSelectionRange(n, n); } catch { /* not a text field */ }
}
// form[data-filters]: every change rewrites the query (text fields after a short pause).
export function bindFilters(root, ctx, toQuery) {
  const form = root.querySelector('[data-filters]');
  if (!form) return;
  let timer;
  const apply = (name) => {
    if (name) pendingFocus = name;
    ctx.setQuery(toQuery(new FormData(form)));
  };
  form.addEventListener('input', (e) => {
    const t = e.target;
    const isText = t.type === 'search' || t.type === 'text';
    clearTimeout(timer);
    timer = setTimeout(() => apply(isText ? t.name : null), isText ? 400 : 0);
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); apply(null); });
}
