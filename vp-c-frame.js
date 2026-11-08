/* VektörPad, CorelDRAW 2026 look and behaviour: frame part.
   The window frame: dark theme by default, the title bar, the standard toolbar's drop-down halves
   (Aç ▾, Geri al ▾, Yinele ▾), the "Yapış ▾" button, enabled states, and the "+" after the document tabs.
   All drawn here; no other program's artwork is used. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const S = VP.settings;
  const root = document.documentElement;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (w, h, body, extra) => '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true" fill="none" stroke="currentColor"' + (extra || '') + '>' + body + '</svg>';
  const CHEV = svg(8, 5, '<path d="M1 1l3 3 3-3" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>');
  const PLUS = svg(12, 12, '<path d="M6 1.5v9M1.5 6h9" stroke-width="1.5" stroke-linecap="round"/>');
  const FULL = svg(14, 14, '<rect x="2.5" y="2.5" width="9" height="9" stroke-width="1.1"/>');
  const UNFULL = svg(14, 14, '<rect x="2.5" y="4.5" width="7" height="7" stroke-width="1.1"/><path d="M4.5 4.5v-2h7v7h-2" stroke-width="1.1"/>');

  /* =============== theme: dark unless the person chose one =============== */
  // "themePicked" is stored with the settings once a theme is chosen (menu or Options). Until then the
  // window is dark, like the desktop suite. An earlier saved "Açık"/"Koyu" counts as a choice.
  let themeVal = S.theme;
  let loading = false;
  try {
    Object.defineProperty(S, 'theme', {
      enumerable: true,
      configurable: true,
      get: () => themeVal,
      set: (v) => {
        if (!loading && v !== themeVal) S.themePicked = true;
        themeVal = v;
      }
    });
  } catch (e) { /* keep the plain property */ }
  const decideTheme = (saved) => {
    const st = saved && saved.settings;
    const picked = !!(st && st.themePicked);
    const t = st && st.theme;
    if (!picked && t !== 'light' && t !== 'dark') {
      loading = true;
      S.theme = 'dark';
      loading = false;
    }
  };
  const savedPrefs = () => {
    try {
      return JSON.parse(localStorage.getItem((VP.io && VP.io.PREFS) || 'vektorpad.prefs.v1') || 'null');
    } catch (e) {
      return null;
    }
  };
  // early, so the first paint is already dark
  decideTheme(savedPrefs());
  if (S.theme === 'light' || S.theme === 'dark') root.dataset.theme = S.theme;
  const lp0 = VP.io.loadPrefs.bind(VP.io);
  VP.io.loadPrefs = () => {
    loading = true;
    let r;
    try {
      r = lp0();
    } finally {
      loading = false;
    }
    decideTheme(r);
    if (S.theme === 'light' || S.theme === 'dark') root.dataset.theme = S.theme;
    return r;
  };

  /* =============== title bar =============== */
  const docEntry = () => VP.docs && VP.docs.list && VP.docs.list[VP.docs.active];
  const updateTitle = () => {
    const name = (VP.doc && VP.doc.name) || 'Adsız çizim';
    const e = docEntry();
    const t = 'VektörPad - ' + name + (e && e.dirty ? '*' : '');
    const el = $('#tb-title');
    if (el && el.textContent !== t) el.textContent = t;
    if (document.title !== t) document.title = t;
  };
  const fullBtn = () => {
    const b = $('#tb-full');
    if (!b) return;
    const on = !!document.fullscreenElement;
    b.innerHTML = on ? UNFULL : FULL;
    b.title = on ? 'Tam ekrandan çık' : 'Tam ekran';
    b.setAttribute('aria-label', b.title);
  };
  const canFull = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);

  /* =============== standard toolbar =============== */
  const rt0 = UI.renderTop;
  UI.renderTop = () => {
    rt0();
    updateTitle();
    const sb = $('#btn-snap');
    if (sb) {
      const s = VP.settings;
      const n = [s.snap, s.snapGuides, s.snapObjects].filter(Boolean).length;
      const html = '<span>Yapış</span>' + CHEV;
      if (sb.innerHTML !== html) sb.innerHTML = html;
      sb.classList.remove('on');
      sb.title = 'Yapış' + (n ? ' (' + n + ' açık)' : ' (kapalı)');
    }
    // greyed out like the desktop suite when there is nothing to cut, copy or paste
    document.querySelectorAll('#stdbar [data-cmd]').forEach((b) => {
      const a = A[b.dataset.cmd];
      if (a && a.enabled) {
        let en = true;
        try {
          en = !!a.enabled();
        } catch (e) { /* keep enabled */ }
        b.disabled = !en;
      }
    });
    const ud = $('#btn-undo-drop');
    if (ud) ud.disabled = !VP.canUndo();
    const rd = $('#btn-redo-drop');
    if (rd) rd.disabled = !VP.canRedo();
  };
  const top = () => (UI.schedule ? UI.schedule('top') : UI.renderTop());
  VP.on('selection', top);
  VP.on('change', () => {
    updateTitle();
    top();
  });
  VP.on('doc', () => {
    updateTitle();
    top();
  });
  // Aç shows a folder and Dosya Al an arrow into a tray (in menus too), as in the desktop suite
  if (A.open) A.open.icon = 'open';
  if (A.import) A.import.icon = 'import';

  // steps of the history to jump back or forward (the desktop suite lists them by name; ours are counted)
  const jump = (to) => {
    const h = VP.hist;
    if (!h || to < 0 || to >= h.stack.length || to === h.i) return;
    const tool = VP.tools && VP.tools[VP.toolId];
    if (tool && tool.busy && tool.busy()) tool.cancel();
    h.i = to;
    VP.restore(h.stack[to]);
    top();
  };
  const histMenu = (btn, dir) => {
    const h = VP.hist;
    const n = dir < 0 ? h.i : h.stack.length - 1 - h.i;
    if (n <= 0) return;
    const word = dir < 0 ? 'Geri al' : 'Yinele';
    const items = [];
    for (let k = 1; k <= Math.min(n, 20); k++) items.push('<button class="pop-item" role="menuitem" data-pick="' + k + '"><span>' + word + ': ' + k + ' işlem</span></button>');
    if (n > 20) items.push('<button class="pop-item" role="menuitem" data-pick="' + n + '"><span>' + word + ': tümü (' + n + ')</span></button>');
    UI.popover(btn, items.join(''), (k) => jump(h.i + dir * +k));
  };
  const openMenu = (btn) => {
    const mh = UI.h && UI.h.menuHTML;
    let html = mh ? mh(['open', 'import'].filter((x) => A[x])) : '';
    const D = VP.docs;
    if (D && D.list && D.list.length > 1) {
      html += '<div class="pop-sep"></div><div class="pop-head">Açık belgeler</div>' +
        D.list.map((e, i) => '<button class="pop-item" role="menuitem" data-pick="doc:' + i + '"><span>' + esc(e.doc.name) + (i === D.active ? ' ✓' : '') + '</span></button>').join('');
    }
    UI.popover(btn, html, (id) => {
      if (String(id).startsWith('doc:')) {
        const i = +String(id).slice(4);
        if (D && D.activate && i !== D.active) D.activate(i);
        return;
      }
      UI.run(id);
    });
  };

  /* =============== document tabs: "+" =============== */
  const addPlus = () => {
    const bar = $('.doc-tabs');
    if (!bar || bar.querySelector('.doc-add')) return;
    const b = document.createElement('button');
    b.className = 'doc-add';
    b.title = 'Yeni belge (Ctrl+N)';
    b.setAttribute('aria-label', 'Yeni belge');
    b.innerHTML = PLUS;
    b.addEventListener('click', () => UI.run('new'));
    bar.appendChild(b);
  };

  /* =============== wiring =============== */
  const init = () => {
    const tb = $('#tb-full');
    if (tb) {
      if (!canFull) tb.hidden = true;
      fullBtn();
      tb.addEventListener('click', () => UI.run('fullscreen'));
      document.addEventListener('fullscreenchange', fullBtn);
    }
    [['#btn-open-drop', (b) => openMenu(b)], ['#btn-undo-drop', (b) => histMenu(b, -1)], ['#btn-redo-drop', (b) => histMenu(b, 1)]].forEach(([sel, fn]) => {
      const b = $(sel);
      if (!b) return;
      b.innerHTML = CHEV;
      // the menu opens under the pair (icon + arrow), as in the desktop suite
      b.addEventListener('click', () => fn(b.previousElementSibling || b));
    });
    addPlus();
    updateTitle();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
