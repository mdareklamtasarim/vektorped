// App shell: sign-in / first-run screens, navigation and hash routing.
import {
  html, raw, setHtml, get, post, session, toast, toastError, setUnauthorizedHandler, ROLES, formDialog, field,
  restoreFocus, setNavigator, offline, presetRange, qs, setHtml as fill, fmtDateTime, confirmDialog,
} from './core.js';
import { dashboardView } from './views/dashboard.js';
import { productsView, productView } from './views/stock.js';
import { partiesView, partyView } from './views/parties.js';
import { invoicesView, invoiceView, invoiceFormView } from './views/invoices.js';
import { financeView, accountView } from './views/finance.js';
import { reportsView } from './views/reports.js';
import { settingsView } from './views/settings.js';

const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  box: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14.7c1.9.7 3.1 2.5 3.5 5.3"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h7"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="15" r="1.2"/><path d="M6 6l9-3 2 3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
};
export const icon = (name) => raw(`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`);

const NAV = [
  { path: '/', label: 'Panel', icon: 'home' },
  { path: '/stok', label: 'Stok', icon: 'box' },
  { path: '/cariler', label: 'Cariler', icon: 'users' },
  { path: '/faturalar', label: 'Faturalar', icon: 'doc' },
  { path: '/kasa', label: 'Kasa & Banka', icon: 'wallet' },
  { path: '/raporlar', label: 'Raporlar', icon: 'chart' },
  { path: '/ayarlar', label: 'Ayarlar', icon: 'gear' },
];

const ROUTES = [
  [/^\/$/, dashboardView],
  [/^\/stok$/, productsView],
  [/^\/stok\/(\d+)$/, productView],
  [/^\/cariler$/, partiesView],
  [/^\/cariler\/(\d+)$/, partyView],
  [/^\/faturalar$/, invoicesView],
  [/^\/faturalar\/yeni$/, invoiceFormView],
  [/^\/faturalar\/(\d+)$/, invoiceView],
  [/^\/faturalar\/(\d+)\/duzenle$/, invoiceFormView],
  [/^\/kasa$/, financeView],
  [/^\/kasa\/(\d+)$/, accountView],
  [/^\/raporlar$/, reportsView],
  [/^\/ayarlar$/, settingsView],
];

const root = document.getElementById('root');

// Memory routing: when the page runs where #/ addresses aren't kept (the demo), the current
// address lives here instead of in location.hash.
const memoryRouting = !!window.MUHASEBE_DEMO;
let memoryHash = '#/';
const currentHash = () => (memoryRouting ? memoryHash : location.hash);
function setHash(target) {
  if (memoryRouting) {
    memoryHash = target;
    route();
  } else if (location.hash === target) {
    route();
  } else {
    location.hash = target;
  }
}
setNavigator(setHash);
if (memoryRouting) {
  // In-app links (href="#/...") are followed here instead of by the browser.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    setHash(a.getAttribute('href'));
  });
}

function parseHash() {
  const h = currentHash().replace(/^#/, '') || '/';
  const [path, search = ''] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(search)) };
}

export function go(path, query = {}) {
  const s = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  const target = `#${path}${s ? `?${s}` : ''}`;
  setHash(target);
}

let renderToken = 0;
async function route() {
  if (!session.user) return;
  const { path, query } = parseHash();
  const match = ROUTES.map(([re, view]) => [re.exec(path), view]).find(([m]) => m);
  document.querySelectorAll('.nav a').forEach((a) => {
    const p = a.dataset.path;
    a.classList.toggle('active', p === '/' ? path === '/' : path.startsWith(p));
  });
  document.body.classList.remove('nav-open');
  const view = document.getElementById('view');
  const token = ++renderToken;
  const container = document.createElement('div');
  container.className = 'view';
  if (!match) {
    setHtml(container, html`<div class="page"><h1>Sayfa bulunamadı</h1><p><a href="#/">Panele dön</a></p></div>`);
    view.replaceChildren(container);
    return;
  }
  const [m, viewFn] = match;
  view.classList.add('loading');
  try {
    await viewFn(container, {
      params: m.slice(1),
      query,
      path,
      go,
      setQuery: (q) => go(path, q),
      reload: () => route(),
    });
    if (token !== renderToken) return;
    const samePage = view.dataset.path === path;
    view.dataset.path = path;
    view.replaceChildren(container);
    if (!samePage) window.scrollTo(0, 0);
    restoreFocus(container);
  } catch (err) {
    if (token !== renderToken) return;
    if (err.status === 401) return;
    setHtml(container, html`<div class="page"><div class="notice err">${err.message}</div><p><a href="#/">Panele dön</a></p></div>`);
    view.replaceChildren(container);
  } finally {
    if (token === renderToken) view.classList.remove('loading');
  }
}

function shell() {
  const u = session.user;
  setHtml(root, html`
    <div class="app">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark">₺</span>
          <span class="brand-text"><strong>${session.company || 'Muhasebe'}</strong><small>Ön muhasebe & stok</small></span>
        </div>
        <nav class="nav">
          ${NAV.map((n) => html`<a href="#${n.path}" data-path="${n.path}">${icon(n.icon)}<span>${n.label}</span></a>`)}
        </nav>
        <button class="sync-pill" data-sync type="button"></button>
        <div class="user-box">
          <div><strong>${u.name}</strong><small>${ROLES[u.role]}</small></div>
          <button class="btn ghost sm" id="logout">Çıkış</button>
        </div>
      </aside>
      <div class="scrim" id="scrim"></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn" id="menu" aria-label="Menü">☰</button>
          <strong>${session.company || 'Muhasebe'}</strong>
          <button class="sync-pill" data-sync type="button"></button>
        </header>
        <div class="net-banner" id="net-banner" hidden></div>
        <main id="view"></main>
      </div>
    </div>`);
  document.getElementById('menu').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.getElementById('scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
  document.querySelectorAll('[data-sync]').forEach((b) => b.addEventListener('click', syncDialog));
  renderNetState();
  document.getElementById('logout').addEventListener('click', async () => {
    if (offline.state.pending && !(await confirmDialog(
      `${offline.state.pending} değişiklik henüz gönderilmedi. Bu cihazda saklanmaya devam eder ve tekrar giriş yapınca gönderilir. Çıkış yapılsın mı?`,
      { confirmLabel: 'Çıkış yap', danger: false },
    ))) return;
    await offline.forget('auth/state');
    try { await post('auth/logout'); } catch { /* signed out anyway */ }
    if (!memoryRouting) location.hash = '';
    location.reload();
  });
}

function authScreen({ setup }) {
  setHtml(root, html`
    <div class="auth">
      <form class="auth-card" novalidate>
        <div class="brand big"><span class="brand-mark">₺</span>
          <span class="brand-text"><strong>${setup ? 'İlk kurulum' : session.company || 'Muhasebe'}</strong>
          <small>Ön muhasebe & stok takibi</small></span></div>
        ${setup ? html`
          <p class="muted">Programı ilk kez açıyorsunuz. Firma adını ve yönetici hesabını oluşturun.</p>
          ${field('Firma adı', html`<input name="company" required maxlength="120" autocomplete="organization">`)}
          ${field('Adınız soyadınız', html`<input name="name" required maxlength="80" autocomplete="name">`)}` : ''}
        ${field('Kullanıcı adı', html`<input name="username" required maxlength="40" autocomplete="username" autocapitalize="off" spellcheck="false">`)}
        ${field('Şifre', html`<input name="password" type="password" required autocomplete="${setup ? 'new-password' : 'current-password'}">`,
          setup ? { hint: 'En az 8 karakter.' } : {})}
        <p class="form-error" hidden></p>
        <button class="btn primary block" type="submit">${setup ? 'Kurulumu tamamla' : 'Giriş yap'}</button>
      </form>
    </div>`);
  const form = root.querySelector('form');
  const err = form.querySelector('.form-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button');
    btn.disabled = true;
    err.hidden = true;
    try {
      await post(setup ? 'auth/setup' : 'auth/login', data);
      await start();
      if (setup) toast('Kurulum tamamlandı. Hoş geldiniz!');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
    }
  });
  form.querySelector('input').focus();
}

let offlineReady = null;
async function start() {
  if (!offlineReady) offlineReady = offline.init();
  await offlineReady;
  let state;
  try {
    state = await get('auth/state');
  } catch (err) {
    setHtml(root, html`<div class="auth"><div class="auth-card"><div class="notice err">${err.message}</div>
      <button class="btn primary block" id="retry">Tekrar dene</button></div></div>`);
    document.getElementById('retry').addEventListener('click', start);
    return;
  }
  session.user = state.user;
  session.company = state.company || '';
  document.title = `${session.company || 'Muhasebe'} · Ön Muhasebe`;
  if (state.needsSetup) return authScreen({ setup: true });
  if (!state.user) return authScreen({ setup: false });
  shell();
  route();
  offline.flush().then(() => prefetch());
}

// ---- offline: status pill, banner, sync panel, background refresh -----------------
function renderNetState() {
  const st = offline.state;
  let text;
  let cls;
  if (st.syncing) { text = 'Gönderiliyor…'; cls = 'busy'; }
  else if (st.failed) { text = `${st.failed} değişiklik gönderilemedi`; cls = 'bad'; }
  else if (st.pending) { text = `${st.pending} değişiklik bekliyor`; cls = 'wait'; }
  else if (!st.online) { text = 'Çevrimdışı'; cls = 'off'; }
  else { text = 'Çevrimiçi'; cls = 'on'; }
  document.querySelectorAll('[data-sync]').forEach((b) => {
    b.className = `sync-pill ${cls}`;
    b.textContent = text;
    b.title = 'Bağlantı ve bekleyen değişiklikler';
  });
  const banner = document.getElementById('net-banner');
  if (banner) {
    banner.hidden = st.online;
    banner.textContent = st.online ? '' : `Bağlantı yok. ${st.cacheAt ? `Bu cihazda ${fmtDateTime(new Date(st.cacheAt).toISOString().slice(0, 19).replace('T', ' '))} tarihinde kaydedilen bilgiler gösteriliyor. ` : ''}Yaptığın değişiklikler saklanır ve bağlantı gelince gönderilir.`;
  }
}
offline.onChange(renderNetState);

async function syncDialog() {
  const listMarkup = () => {
    const ops = offline.outbox();
    if (!ops.length) return html`<p class="muted">Bekleyen değişiklik yok. ${offline.state.online ? 'Tüm kayıtlar sunucuda.' : 'Bağlantı gelince yeni değişiklikler buradan gönderilir.'}</p>`;
    return html`<ul class="op-list">${ops.map((o) => html`
      <li class="${o.status === 'failed' ? 'failed' : ''}">
        <div><strong>${offline.describe(o)}</strong>
          <small class="muted">${new Date(o.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</small>
          ${o.error ? html`<small class="err-text">${o.error}</small>` : ''}</div>
        <div class="op-actions">
          ${o.status === 'failed' ? html`<button type="button" class="btn sm" data-retry="${o.seq}">Tekrar dene</button>` : ''}
          <button type="button" class="btn ghost sm danger-text" data-discard="${o.seq}">Sil</button>
        </div>
      </li>`)}</ul>`;
  };
  await formDialog({
    title: 'Bekleyen değişiklikler',
    submitLabel: 'Şimdi gönder',
    body: html`<div data-ops>${listMarkup()}</div>
      <p class="muted small">Bağlantı yokken yapılan değişiklikler bu cihazda sırayla saklanır ve sunucuya ulaşılınca otomatik gönderilir.</p>`,
    onOpen: (form) => {
      const box = form.querySelector('[data-ops]');
      const redraw = () => fill(box, listMarkup());
      const off = offline.onChange(redraw);
      form.closest('dialog').addEventListener('close', off);
      box.addEventListener('click', async (e) => {
        const r = e.target.closest('[data-retry]');
        const d = e.target.closest('[data-discard]');
        if (r) { await offline.retry(Number(r.dataset.retry)); offline.flush(); }
        if (d && (await confirmDialog('Bu değişiklik gönderilmeden silinsin mi? Geri alınamaz.', { confirmLabel: 'Sil' }))) {
          await offline.discard(Number(d.dataset.discard));
        }
      });
    },
    onSubmit: async () => {
      await offline.flush();
      if (offline.state.pending && !offline.state.online) throw new Error('Sunucuya hâlâ ulaşılamıyor. Bağlantı gelince otomatik gönderilecek.');
      if (offline.state.failed) throw new Error('Bazı değişiklikler gönderilemedi; ayrıntılar listede.');
      toast('Tüm değişiklikler gönderildi.');
    },
  });
}

// Save the pages most used on the go, so they open without a connection later.
let prefetching = false;
async function prefetch() {
  if (prefetching || !offline.state.online || !session.user) return;
  prefetching = true;
  const month = presetRange('month');
  const paths = [
    'auth/state', 'settings', 'reports/dashboard', 'products', 'parties', 'parties?kind=customer', 'parties?kind=supplier',
    'accounts', 'transactions/categories', `invoices${qs({ type: 'sale', ...month })}`, `transactions${qs(month)}`,
  ];
  try {
    for (const p of paths) {
      try { await get(p); } catch { break; }
    }
  } finally {
    prefetching = false;
  }
}

offline.configure({
  onSynced: (n) => {
    toast(`${n} değişiklik sunucuya gönderildi.`);
    route();
    prefetch();
  },
});
window.addEventListener('online', () => offline.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session.user) offline.flush().then(() => prefetch());
});
setInterval(() => {
  if (session.user && (offline.hasQueued() || !offline.state.online)) {
    // A cheap request tells us when the server is back; then send what waits.
    get('auth/state', { live: true }).then(() => offline.flush()).catch(() => {});
  }
}, 20000);

if ('serviceWorker' in navigator && window.isSecureContext && !memoryRouting) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

setUnauthorizedHandler(() => {
  if (!session.user) return;
  session.user = null;
  toast('Oturumunuz sona erdi, lütfen tekrar giriş yapın.', 'err');
  start();
});

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && e.reason.status === 401) return;
  toastError(e.reason);
});

// Change own password from anywhere (used by settings).
export async function changePasswordDialog() {
  await formDialog({
    title: 'Şifre değiştir',
    body: html`
      ${field('Mevcut şifre', html`<input type="password" name="current" required autocomplete="current-password">`)}
      ${field('Yeni şifre', html`<input type="password" name="next" required autocomplete="new-password">`, { hint: 'En az 8 karakter.' })}
      ${field('Yeni şifre (tekrar)', html`<input type="password" name="again" required autocomplete="new-password">`)}`,
    onSubmit: async (d) => {
      if (d.next !== d.again) throw new Error('Yeni şifreler aynı değil.');
      await post('auth/password', d);
      toast('Şifreniz değiştirildi.');
    },
  });
}

start();
