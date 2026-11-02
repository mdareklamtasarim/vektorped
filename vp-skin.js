/* VektörPad "desktop suite" dark look, matched to measured screen colours of the desktop program's dark
   theme: one chrome tone for every bar (#262626), fields and idle tabs one step lighter (#3d3d3d), active
   tabs / pressed tools in deep blue (#1f4370), near-black rulers, a white desktop and page with a thin grey
   drop shadow, docker tabs with an icon above the vertical label, a two-column colour palette and plain
   section headings in the dockers. Only colours, sizes and arrangement are matched; all artwork is our own. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const S = VP.settings;
  const root = document.documentElement;

  const CSS = `
html[data-cd][data-skin="classic"][data-skin] {
  --bg: #262626; --panel: #262626; --panel-2: #3d3d3d; --line: #171717;
  --fg: #d6d6d6; --muted: #9a9a9a; --accent: #4f8fd6; --accent-fg: #ffffff;
  --accent-soft: #1f4370; --paste: #ffffff; --ruler: #1f1f1f;
  --cd-on: #1f4370; --cd-on-fg: #e8eef7; --cd-hover: #3d3d3d; --cd-field: #3d3d3d; --cd-sep: #171717;
  color-scheme: dark;
}
html[data-cd][data-skin="classic"][data-skin] body { background: #262626; }
/* menu bar: a slightly lighter row, as in the desktop program */
html[data-cd][data-skin="classic"][data-skin] #menubar { background: #404040; border-bottom-color: var(--cd-sep); }
html[data-cd][data-skin="classic"][data-skin] .menu-btn { color: #cfcfcf; }
html[data-cd][data-skin="classic"][data-skin] .menu-btn:hover, html[data-cd][data-skin="classic"][data-skin] .menu-btn[aria-expanded="true"] { background: #505050; color: #fff; }
html[data-cd][data-skin="classic"][data-skin] #stdbar, html[data-cd][data-skin="classic"][data-skin] #propbar { background: #262626; border-bottom: 1px solid var(--cd-sep); }
/* hover is grey, pressed / active is deep blue */
html[data-cd][data-skin="classic"][data-skin] .icon-btn:hover, html[data-cd][data-skin="classic"][data-skin] .tool-btn:hover, html[data-cd][data-skin="classic"][data-skin] .btn:hover, html[data-cd][data-skin="classic"][data-skin] .pop-item:hover,
html[data-cd][data-skin="classic"][data-skin] .dtab:hover, html[data-cd][data-skin="classic"][data-skin] .row-btn:hover, html[data-cd][data-skin="classic"][data-skin] .props-nav button:hover { background: var(--cd-hover); color: #fff; }
html[data-cd][data-skin="classic"][data-skin] .icon-btn.on, html[data-cd][data-skin="classic"][data-skin] .tool-btn.on, html[data-cd][data-skin="classic"][data-skin] .btn.on, html[data-cd][data-skin="classic"][data-skin] .seg button.on {
  background: var(--cd-on); color: var(--cd-on-fg); box-shadow: none; border-color: var(--cd-on);
}
html[data-cd][data-skin="classic"][data-skin] .btn { background: var(--cd-field); border-color: var(--cd-field); color: #d6d6d6; }
html[data-cd][data-skin="classic"][data-skin] .btn.primary { background: #2a5a96; border-color: #2a5a96; color: #fff; }
html[data-cd][data-skin="classic"][data-skin] .seg { border-color: var(--cd-field); }
html[data-cd][data-skin="classic"][data-skin] .seg button { background: #2f2f2f; border-right-color: #262626; color: #cfcfcf; }
/* fields: outlined on the bars, filled in the dockers */
html[data-cd][data-skin="classic"][data-skin] #propbar .field, html[data-cd][data-skin="classic"][data-skin] #stdbar .field { background: transparent; border: 1px solid var(--cd-field); }
html[data-cd][data-skin="classic"][data-skin] #zoom-label { background: transparent; border: 1px solid var(--cd-field); color: #d6d6d6; }
html[data-cd][data-skin="classic"][data-skin] .dock-body .field, html[data-cd][data-skin="classic"][data-skin] .modal .field, html[data-cd][data-skin="classic"][data-skin] .color-in { background: var(--cd-field); border-color: var(--cd-field); }
html[data-cd][data-skin="classic"][data-skin] .field input, html[data-cd][data-skin="classic"][data-skin] .field select { color: #dedede; }
html[data-cd][data-skin="classic"][data-skin] .field select option { background: #2b2b2b; color: #dedede; }
html[data-cd][data-skin="classic"][data-skin] .pb-label, html[data-cd][data-skin="classic"][data-skin] .field > span, html[data-cd][data-skin="classic"][data-skin] .unit { color: #9a9a9a; }
/* tool box: no separators, deep blue pressed tool */
html[data-cd][data-skin="classic"][data-skin] #toolbox { background: #262626; border-right: 1px solid var(--cd-sep); }
html[data-cd][data-skin="classic"][data-skin] .tool-sep { height: 4px; background: transparent; margin: 0; }
html[data-cd][data-skin="classic"][data-skin] .tool-btn { color: #d0d0d0; }
/* document tabs */
html[data-cd][data-skin="classic"][data-skin] .doc-tabs { background: #262626; padding: 3px 4px 0; gap: 3px; border-bottom: 0; }
html[data-cd][data-skin="classic"][data-skin] .doc-tab { background: var(--cd-field); border: 0; border-radius: 4px 4px 0 0; color: #a9a9a9; top: 0; }
html[data-cd][data-skin="classic"][data-skin] .doc-tab.on { background: var(--cd-on); color: var(--cd-on-fg); box-shadow: none; }
html[data-cd][data-skin="classic"][data-skin] .doc-tab .doc-name { color: inherit; }
html[data-cd][data-skin="classic"][data-skin] .doc-tab.doc-other:hover { background: #4a4a4a; color: #e0e0e0; }
html[data-cd][data-skin="classic"][data-skin] .doc-close { color: inherit; opacity: .7; }
/* rulers */
html[data-cd][data-skin="classic"][data-skin] #ruler-top, html[data-cd][data-skin="classic"][data-skin] #ruler-left, html[data-cd][data-skin="classic"][data-skin] #ruler-corner { background: #1f1f1f; border-color: var(--cd-sep); color: #8a8a8a; }
/* drawing window: white desktop, dark frame */
html[data-cd][data-skin="classic"][data-skin] #docwin { background: #ffffff; }
html[data-cd][data-skin="classic"][data-skin] #stage { background: #ffffff; }
/* page navigator, document palette, status bar */
html[data-cd][data-skin="classic"][data-skin] .page-nav { background: #262626; border-top: 1px solid var(--cd-sep); }
html[data-cd][data-skin="classic"][data-skin] .page-tab { background: transparent; border: 0; color: #a9a9a9; border-radius: 3px; }
html[data-cd][data-skin="classic"][data-skin] .page-tab.on { background: var(--cd-on); color: var(--cd-on-fg); box-shadow: none; }
html[data-cd][data-skin="classic"][data-skin] .pn-btn { color: #bdbdbd; }
html[data-cd][data-skin="classic"][data-skin] #docpal { background: #262626; border-top: 1px solid var(--cd-sep); }
html[data-cd][data-skin="classic"][data-skin] #docpal .dp-label { color: #8a8a8a; font-style: italic; }
html[data-cd][data-skin="classic"][data-skin] #statusbar { background: #262626; border-top: 1px solid var(--cd-sep); color: #a0a0a0; }
html[data-cd][data-skin="classic"][data-skin] .st-info, html[data-cd][data-skin="classic"][data-skin] .st-pos { color: #9a9a9a; }
html[data-cd][data-skin="classic"][data-skin] .st-chip { color: #b8b8b8; }
/* dockers: plain bold title, plain section headings with a caret, thin rules between sections */
html[data-cd][data-skin="classic"][data-skin] #dock { background: #262626; border-left: 1px solid var(--cd-sep); }
html[data-cd][data-skin="classic"][data-skin] .dock-head { background: #262626; border-bottom: 0; }
html[data-cd][data-skin="classic"][data-skin] .dock-title { font-weight: 700; color: #c4c6c5; font-size: 12.5px; }
html[data-cd][data-skin="classic"][data-skin] .dock-title::after { content: ""; }
html[data-cd][data-skin="classic"][data-skin] .dock-body { gap: 8px; }
html[data-cd][data-skin="classic"][data-skin] .sec { border-top: 1px solid #333; padding-top: 6px; }
html[data-cd][data-skin="classic"][data-skin] .sec:first-child { border-top: 0; padding-top: 0; }
html[data-cd][data-skin="classic"][data-skin] .sec-h { background: transparent; border: 0; margin: 0; padding: 2px 0; min-height: 0; }
html[data-cd][data-skin="classic"][data-skin] .sec-h h3 { color: #c2c2ca; font-weight: 700; font-size: 12px; }
html[data-cd][data-skin="classic"][data-skin] .sec-h h3::before { content: "⌃ "; color: #9a9a9a; font-size: 11px; }
html[data-cd][data-skin="classic"][data-skin] .sec-note { color: #8f8f8f; }
html[data-cd][data-skin="classic"][data-skin] .list, html[data-cd][data-skin="classic"][data-skin] .layer-row, html[data-cd][data-skin="classic"][data-skin] .obj-row { border-color: #333; background: #262626; }
html[data-cd][data-skin="classic"][data-skin] .layer-row { background: #2d2d2d; }
html[data-cd][data-skin="classic"][data-skin] .obj-row.sel { background: var(--cd-on); }
html[data-cd][data-skin="classic"][data-skin] .props-nav { background: #262626; border-bottom-color: #333; }
/* docker tabs: icon above a small vertical label, grey idle / blue active, on the far right */
html[data-cd][data-skin="classic"][data-skin] #dock-tabs { background: #262626; border-left: 1px solid var(--cd-sep); gap: 3px; padding-top: 2px; width: 22px; }
html[data-cd][data-skin="classic"][data-skin] .dtab { background: var(--cd-field); border: 0; border-radius: 3px; width: 20px; margin: 0 1px; padding: 6px 0 8px; font-size: 10.5px; color: #b4b4b4; display: flex; align-items: center; gap: 4px; }
html[data-cd][data-skin="classic"][data-skin] .dtab.on { background: var(--cd-on); color: var(--cd-on-fg); box-shadow: none; font-weight: 400; }
html[data-cd][data-skin="classic"][data-skin] .dtab .dti { writing-mode: horizontal-tb; display: inline-grid; place-items: center; width: 16px; height: 16px; }
html[data-cd][data-skin="classic"][data-skin] .dtab .dti svg { width: 14px; height: 14px; }
/* colour palette: two narrow columns of small squares */
@media (min-width: 641px) {
  html[data-cd][data-skin="classic"][data-skin] #palette { display: grid; grid-template-columns: 12px 12px; grid-auto-rows: 12px; gap: 1px; align-content: start; padding: 3px 3px; background: #262626; border-left: 1px solid var(--cd-sep); }
  html[data-cd][data-skin="classic"][data-skin] #palette .swatch { width: 12px; height: 12px; border: 0; border-radius: 0; }
  html[data-cd][data-skin="classic"][data-skin] #palette .pal-target { grid-column: 1 / -1; width: 25px; height: 22px; margin: 0 0 3px; }
  html[data-cd][data-skin="classic"][data-skin] #palette .pal-sep { grid-column: 1 / -1; height: 1px; margin: 2px 0; background: #3d3d3d; }
  html[data-cd][data-skin="classic"][data-skin] #palette .swatch.none, html[data-cd][data-skin="classic"][data-skin] #palette .swatch.add { grid-column: 1 / -1; width: 25px; }
}
@media (min-width: 641px) and (pointer: coarse) {
  html[data-cd][data-skin="classic"][data-skin] #palette { grid-template-columns: 16px 16px; grid-auto-rows: 15px; }
  html[data-cd][data-skin="classic"][data-skin] #palette .swatch { width: 16px; height: 15px; }
  html[data-cd][data-skin="classic"][data-skin] #palette .pal-target, html[data-cd][data-skin="classic"][data-skin] #palette .swatch.none, html[data-cd][data-skin="classic"][data-skin] #palette .swatch.add { width: 33px; }
  html[data-cd][data-skin="classic"][data-skin] #dock-tabs { width: 28px; }
  html[data-cd][data-skin="classic"][data-skin] .dtab { width: 26px; font-size: 11px; }
}
/* menus and dialogs */
html[data-cd][data-skin="classic"][data-skin] .popover { background: #2b2b2b; border-color: #171717; }
html[data-cd][data-skin="classic"][data-skin] .pop-item { color: #d6d6d6; }
html[data-cd][data-skin="classic"][data-skin] .pop-sep { background: #3d3d3d; }
html[data-cd][data-skin="classic"][data-skin] .modal { background: #2b2b2b; border-color: #171717; color: #d6d6d6; }
html[data-cd][data-skin="classic"][data-skin] .modal p { color: #a6a6a6; }
html[data-cd][data-skin="classic"][data-skin] #toast { background: #3d3d3d; color: #eee; }
html[data-cd][data-skin="classic"][data-skin] #welcome { background: #2d2d2d; }
html[data-cd][data-skin="classic"][data-skin] #welcome nav { background: #262626; border-right-color: var(--cd-sep); }
html[data-cd][data-skin="classic"][data-skin] #welcome nav button.on { background: var(--cd-on); box-shadow: none; color: var(--cd-on-fg); }
html[data-cd][data-skin="classic"][data-skin] #welcome .wl-card { background: #262626; border-color: #3d3d3d; }
html[data-cd][data-skin="classic"][data-skin] #welcome .wl-card:hover { background: #333; border-color: #4f8fd6; }

/* compact sizes, close to the desktop program (fine pointer); touch screens keep finger-sized targets */
html[data-cd][data-skin="classic"][data-skin] body { font-size: 12px; }
html[data-cd][data-skin="classic"][data-skin] #menubar { height: 24px; }
html[data-cd][data-skin="classic"][data-skin] .menu-btn { font-size: 12px; min-height: 22px; padding: 2px 8px; }
html[data-cd][data-skin="classic"][data-skin] #stdbar { min-height: 30px; }
html[data-cd][data-skin="classic"][data-skin] #propbar { min-height: 32px; font-size: 11.5px; }
html[data-cd][data-skin="classic"][data-skin] .icon-btn { width: 28px; height: 26px; }
html[data-cd][data-skin="classic"][data-skin] svg.i { width: 17px; height: 17px; }
html[data-cd][data-skin="classic"][data-skin] svg.i.sm { width: 14px; height: 14px; }
html[data-cd][data-skin="classic"][data-skin] .btn, html[data-cd][data-skin="classic"][data-skin] .field { height: 24px; font-size: 11.5px; }
html[data-cd][data-skin="classic"][data-skin] .field input { font-size: 11.5px; }
html[data-cd][data-skin="classic"][data-skin] .seg button { height: 22px; font-size: 11.5px; min-width: 26px; }
html[data-cd][data-skin="classic"][data-skin] #zoom-label { height: 22px; font-size: 11.5px; }
html[data-cd][data-skin="classic"][data-skin] .sb-snap { height: 24px; }
html[data-cd][data-skin="classic"][data-skin] .tool-btn { width: 28px; height: 26px; }
html[data-cd][data-skin="classic"][data-skin] #toolbox.two-col { grid-template-columns: 28px 28px; grid-auto-rows: 26px; }
html[data-cd][data-skin="classic"][data-skin] .doc-tab { height: 21px; font-size: 11.5px; }
html[data-cd][data-skin="classic"][data-skin] .doc-name { font-size: 11.5px; }
html[data-cd][data-skin="classic"][data-skin] #stage { grid-template-columns: 16px minmax(0, 1fr); grid-template-rows: 16px minmax(0, 1fr); }
html[data-cd][data-skin="classic"][data-skin] #stage.no-rulers { grid-template-columns: 0 minmax(0, 1fr); grid-template-rows: 0 minmax(0, 1fr); }
html[data-cd][data-skin="classic"][data-skin] .page-nav { min-height: 22px; }
html[data-cd][data-skin="classic"][data-skin] .pn-btn { height: 20px; width: 22px; }
html[data-cd][data-skin="classic"][data-skin] .page-tab { height: 18px; font-size: 11px; }
html[data-cd][data-skin="classic"][data-skin] #docpal { min-height: 20px; }
html[data-cd][data-skin="classic"][data-skin] #statusbar { min-height: 22px; font-size: 11px; }
html[data-cd][data-skin="classic"][data-skin] #dock { width: 250px; font-size: 11.5px; }
html[data-cd][data-skin="classic"][data-skin] .dock-head { height: 24px; }
html[data-cd][data-skin="classic"][data-skin] .dock-body { padding: 6px 8px; }
html[data-cd][data-skin="classic"][data-skin] .sec-note { font-size: 11px; }
html[data-cd][data-skin="classic"][data-skin] .pop-item { min-height: 24px; font-size: 12px; }
html[data-cd][data-skin="classic"][data-skin] .layer-row, html[data-cd][data-skin="classic"][data-skin] .obj-row { min-height: 24px; }
html[data-cd][data-skin="classic"][data-skin] .row-btn { width: 22px; height: 22px; }
@media (pointer: coarse) {
  html[data-cd][data-skin="classic"][data-skin] #menubar { height: 30px; }
  html[data-cd][data-skin="classic"][data-skin] .menu-btn { font-size: 13px; min-height: 28px; }
  html[data-cd][data-skin="classic"][data-skin] #stdbar { min-height: 36px; }
  html[data-cd][data-skin="classic"][data-skin] #propbar { min-height: 38px; font-size: 12.5px; }
  html[data-cd][data-skin="classic"][data-skin] .icon-btn { width: 36px; height: 32px; }
  html[data-cd][data-skin="classic"][data-skin] svg.i { width: 19px; height: 19px; }
  html[data-cd][data-skin="classic"][data-skin] .btn, html[data-cd][data-skin="classic"][data-skin] .field { height: 30px; font-size: 12.5px; }
  html[data-cd][data-skin="classic"][data-skin] .seg button { height: 28px; font-size: 12.5px; min-width: 32px; }
  html[data-cd][data-skin="classic"][data-skin] #zoom-label { height: 28px; }
  html[data-cd][data-skin="classic"][data-skin] .tool-btn { width: 38px; height: 34px; }
  html[data-cd][data-skin="classic"][data-skin] #toolbox.two-col { grid-template-columns: 38px 38px; grid-auto-rows: 34px; }
  html[data-cd][data-skin="classic"][data-skin] .doc-tab { height: 26px; font-size: 12.5px; }
  html[data-cd][data-skin="classic"][data-skin] #stage { grid-template-columns: 18px minmax(0, 1fr); grid-template-rows: 18px minmax(0, 1fr); }
  html[data-cd][data-skin="classic"][data-skin] .page-nav { min-height: 28px; }
  html[data-cd][data-skin="classic"][data-skin] .pn-btn { height: 26px; width: 28px; }
  html[data-cd][data-skin="classic"][data-skin] .page-tab { height: 22px; font-size: 12px; }
  html[data-cd][data-skin="classic"][data-skin] #statusbar { min-height: 26px; font-size: 12px; }
  html[data-cd][data-skin="classic"][data-skin] #dock { width: 260px; font-size: 12.5px; }
  html[data-cd][data-skin="classic"][data-skin] .dock-head { height: 30px; }
  html[data-cd][data-skin="classic"][data-skin] .pop-item { min-height: 34px; font-size: 13px; }
  html[data-cd][data-skin="classic"][data-skin] .row-btn { width: 28px; height: 28px; }
}
`;
  const st = document.createElement('style');
  st.id = 'vp-skin-cd';
  st.textContent = CSS;
  document.head.appendChild(st);

  // on when the desktop look is in use and the theme is dark
  const sync = () => {
    const classic = root.dataset.skin === 'classic';
    const t = S.theme || 'auto';
    const dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const on = classic && dark;
    if (on === (root.dataset.cd === '1')) return;
    if (on) root.dataset.cd = '1';
    else delete root.dataset.cd;
    try {
      VP.readColors();
      if (paper.project) {
        VP.drawPage();
        VP.drawOverlay();
      }
      if (UI.drawRulers) UI.drawRulers();
    } catch (e) { /* not ready yet */ }
  };
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-skin', 'data-theme'] });
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', sync);
  }
  VP.on('doc', sync);

  // the page: thin light edge and a short grey drop shadow, as on a white desktop
  const dp0 = VP.drawPage;
  VP.drawPage = function () {
    const r = dp0.apply(this, arguments);
    if (root.dataset.cd !== '1' || !VP.bgLayer) return r;
    const p = VP.page();
    const rect = VP.bgLayer.children.find((c) => c instanceof paper.Path && Math.abs(c.bounds.width - p.w) < 0.5 && Math.abs(c.bounds.height - p.h) < 0.5 && Math.abs(c.bounds.x) < 0.5);
    if (rect) {
      rect.shadowColor = new paper.Color('#c1c1c1');
      rect.shadowBlur = 0;
      rect.shadowOffset = new paper.Point(3, 3);
      rect.strokeColor = new paper.Color('#e3e5e4');
      rect.strokeWidth = 1;
      rect.strokeScaling = false;
    }
    return r;
  };

  // docker tabs get a small icon above their label
  const ICONS = { props: 'fillTool', objects: 'layers', pages: 'pages', align: 'alignL', transform: 'rotate', step: 'duplicate', text: 'text', fonts: 'text', styles: 'palette', palettes: 'palette', symbols: 'star', comments: 'text', scripts: 'code', cut: 'ecCut', coords: 'grid', export: 'export', undo: 'undo', shaping: 'weld', guides: 'guides', color: 'palette', assets: 'star', odata: 'grid', links: 'link', hints: 'help' };
  const decorate = () => {
    if (root.dataset.cd !== '1') return;
    document.querySelectorAll('#dock-tabs .dtab').forEach((b) => {
      if (b.querySelector('.dti')) return;
      const k = b.dataset.tab;
      const name = ICONS[k];
      if (!name || !window.VPIcon || !window.VPIcon.has(name)) return;
      const s = document.createElement('span');
      s.className = 'dti';
      s.innerHTML = window.VPIcon(name, 'sm');
      b.insertBefore(s, b.firstChild);
    });
  };
  if (UI.renderDockTabs) {
    const rt0 = UI.renderDockTabs;
    UI.renderDockTabs = function () {
      const r = rt0.apply(this, arguments);
      decorate();
      return r;
    };
  }
  new MutationObserver(() => decorate()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-cd'] });

  // once: the dark desktop look becomes the default (a light theme can still be chosen under Tools › Theme)
  const start = () => {
    if (!S.cdLook27) {
      S.cdLook27 = true;
      if (!S.theme || S.theme === 'auto') {
        S.theme = 'dark';
        root.dataset.theme = 'dark';
      }
      try {
        VP.io.savePrefs();
      } catch (e) { /* optional */ }
    }
    sync();
    decorate();
    if (UI.renderDock) UI.renderDock(true);
  };
  if (document.readyState === 'complete') setTimeout(start, 0);
  else addEventListener('load', () => setTimeout(start, 0));
})();
