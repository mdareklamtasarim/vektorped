/* VektörPad, CorelDRAW 2026 look and behaviour: dock part.
   Docker frame (title row with collapse and close), the vertical docker tab strip with icons and a "+" button,
   the Özellikler docker with section icon tabs and a Corel-style Anahat section, the Nesneler docker as a
   page / layer / object tree, and the Öğren docker (VektörPad's hints). Existing actions are reused:
   data-act goes to UI.dockAct, data-dk to UI.dockField, data-pf to UI.propField; data-cd is handled here. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP && VP.ui;
  if (!UI || !UI.renderDock) return;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const A = VP.actions || {};
  const S = () => VP.settings || (VP.settings = {});

  /* ---------- icons: shared set first (another part may add Corel-like ones), our own drawings as fallback ---------- */
  const OWN = {
    cdLearn: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.6v4.1c1.6 1.5 3.4 2.2 5.5 2.2s3.9-.7 5.5-2.2v-4.1"/><path d="M21.5 9.5v5"/>',
    cdProps: '<path d="M10 3l4.6 7.4L10 19l-4.6-8.6z"/><path d="M10 3v7.2"/><circle cx="10" cy="11.4" r="1.2"/><path d="M18.5 12.5c1 1.4 1.6 2.4 1.6 3.1a1.6 1.6 0 01-3.2 0c0-.7.6-1.7 1.6-3.1z"/>',
    cdObjects: '<path d="M12 4l8.5 4.2L12 12.4 3.5 8.2z"/><path d="M3.5 12L12 16.2l8.5-4.2"/><path d="M3.5 15.8L12 20l8.5-4.2"/>',
    cdCollapse: '<path d="M4.5 6.5l6 5.5-6 5.5zM12.5 6.5l6 5.5-6 5.5z" fill="currentColor" stroke="none"/>',
    cdFx: '<path d="M12.6 4.6c-1.5-.5-2.7.2-3.1 1.9L7 18.6c-.4 1.7-1.4 2.2-2.7 1.9"/><path d="M5.8 9.6h6"/><path d="M13.6 11l5 7.6M18.6 11l-5 7.6"/>',
    cdArt: '<path d="M18.5 3.5l2 2-8.7 8.7-2-2z"/><path d="M9.6 12.4c-2.4-.2-4 1.2-4.3 3.6-.2 1.6-1 2.6-2.3 3.2 3.4.8 7.4-.1 8-3.6"/>',
    cdBitmap: '<rect x="3.5" y="4.5" width="17" height="15" rx="1"/><path d="M3.5 16l5-5 4 4 3-3 5 5"/><circle cx="15.5" cy="8.6" r="1.4"/>',
    cdSingle: '<rect x="3.5" y="4.5" width="17" height="15" rx="1"/><path d="M7.5 13.5a4.5 4.5 0 019 0"/>',
    cdAuto: '<rect x="3.5" y="4.5" width="17" height="15" rx="1"/><path d="M10 14l5-5M11 9h4v4"/>',
    cdTip: '<path d="M5 3.5l9.2 5.8-4.2 1.1-2 4z" fill="currentColor" stroke="none"/><path d="M15.2 13.4a2.3 2.3 0 114.2 1.3c-.7.8-1.9 1.2-1.9 2.4"/><circle cx="17.5" cy="20" r=".6" fill="currentColor"/>',
    cdLeft: '<path d="M19.5 12H5M10 7l-5 5 5 5"/>',
    cdRight: '<path d="M4.5 12H19M14 7l5 5-5 5"/>',
    cdStretch: '<path d="M3.5 12h17M7 8.5L3.5 12 7 15.5M17 8.5l3.5 3.5-3.5 3.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
    cdAngle: '<path d="M4 19.5h16M4 19.5L16 6.5"/><path d="M10.5 19.5a6.5 6.5 0 00-2-4.7"/>',
    cdReset: '<path d="M19 12.5a7 7 0 11-2.1-5"/><path d="M19.2 3.8v4.1h-4.1"/>',
    cdGuide: '<path d="M3.5 7.5h17M8.5 3.5v17"/>',
    cdDesk: '<rect x="4.5" y="4.5" width="15" height="15"/><path d="M4.5 9h15M4.5 15h15M9 4.5v15M15 4.5v15" stroke-dasharray="1.5 2"/>',
    cdGrid: '<path d="M4 8.5h16M4 15.5h16M8.5 4v16M15.5 4v16"/>',
    cdNewLayer: '<path d="M11 4l8.5 4.2L11 12.4 2.5 8.2z"/><path d="M2.5 12l8.5 4.2 3-1.5"/><path d="M18.5 13.5v7M15 17h7"/>',
    eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="7.5" rx="1"/><path d="M7 14h10v6.5H7z"/>'
  };
  // name may list alternatives: 'fillBucket|fillTool' uses the first one that exists
  const icon = (name, cls, fb) => {
    const V = window.VPIcon;
    const alts = String(name).split('|');
    if (alts.length > 1) name = alts.find((n) => (V && V.has && V.has(n)) || OWN[n]) || alts[alts.length - 1];
    if (V && V.has && V.has(name)) return V(name, cls);
    if (OWN[name]) return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + OWN[name] + '</svg>';
    return V ? V(fb || name, cls) : '';
  };
  const svg = (body, cls) => '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';

  /* ---------- open dockers (tab strip), like Corel's default workspace ---------- */
  const DEFAULT_OPEN = ['hints', 'props', 'objects'];
  const known = (k) => UI.DOCKERS.some(([d]) => d === k);
  const label = (k) => (UI.DOCKERS.find(([d]) => d === k) || [k, k])[1];
  const openList = () => {
    const s = S();
    if (!Array.isArray(s.cdDockers)) {
      s.cdDockers = DEFAULT_OPEN.filter(known);
      // first start with the Corel look: the Öğren docker is in front, as in Corel's default workspace
      if (known('hints')) UI.dockTab = 'hints';
    }
    s.cdDockers = s.cdDockers.filter(known);
    return s.cdDockers;
  };
  const addOpen = (k) => {
    const l = openList();
    if (k && known(k) && !l.includes(k)) l.push(k);
  };
  const TAB_ICON = { hints: 'cdLearn', props: 'cdProps', objects: 'cdObjects', pages: 'pages', align: 'alignL', corners: 'cornerRound', transform: 'rotate', step: 'stepRepeat', text: 'text', fonts: 'text', styles: 'styles', palettes: 'grid', symbols: 'symbol', scripts: 'code', cut: 'ecCut', comments: 'comment' };
  // Corel's names for the dockers that VektörPad calls differently
  const relabel = () => {
    const h = UI.DOCKERS.find(([k]) => k === 'hints');
    if (h) h[1] = 'Öğren';
  };
  relabel();

  UI.renderDockTabs = () => {
    relabel();
    const dock = $('#dock');
    const open = !dock.hidden;
    if (open) addOpen(UI.dockTab);
    const tabs = openList().map((k) => {
      const on = open && k === UI.dockTab;
      const l = label(k);
      return '<button class="dtab cd-tab' + (on ? ' on' : '') + '" data-tab="' + k + '" role="tab" aria-selected="' + on + '" title="' + esc(l) + '">' + icon(TAB_ICON[k] || 'panels', 'sm') + '<span class="cd-tab-l">' + esc(l) + '</span></button>';
    }).join('');
    $('#dock-tabs').innerHTML = tabs + '<button class="cd-tab-add" data-cd-add="1" title="Yerleşik panel ekle" aria-label="Yerleşik panel ekle">' + icon('plus', 'sm') + '</button>';
  };

  const od0 = UI.openDock;
  UI.openDock = (tab) => {
    addOpen(tab || UI.dockTab);
    od0(tab);
  };
  const td0 = UI.toggleDock;
  UI.toggleDock = () => {
    td0();
    if (!$('#dock').hidden) addOpen(UI.dockTab);
  };
  // ✕ closes the docker (its tab goes away); the next open docker comes to the front
  const closeDocker = () => {
    const l = openList();
    const i = l.indexOf(UI.dockTab);
    if (i >= 0) l.splice(i, 1);
    if (!l.length) {
      VP.io.savePrefs();
      $('#dock').hidden = false;
      return UI.toggleDock();
    }
    UI.dockTab = l[Math.max(0, i - 1)];
    od0(UI.dockTab);
  };

  /* frame: ⏩ (collapse to the tab strip) and ✕ (close) in the title row */
  const ensureFrame = () => {
    const head = $('#dock .dock-head');
    if (!head || head.querySelector('#cd-collapse')) return;
    const close = $('#btn-dock-close');
    const b = document.createElement('button');
    b.className = 'icon-btn cd-head-btn';
    b.id = 'cd-collapse';
    b.title = 'Yerleşik paneli daralt';
    b.setAttribute('aria-label', 'Yerleşik paneli daralt');
    b.innerHTML = icon('cdCollapse', 'sm');
    head.insertBefore(b, close);
    if (close) {
      close.classList.add('cd-head-btn');
      close.title = 'Kapat';
      close.setAttribute('aria-label', 'Yerleşik paneli kapat');
      close.innerHTML = icon('close', 'sm');
    }
  };
  ensureFrame();
  const dockEl = $('#dock');
  // capture on the docker so the old "close = fold away" handler on the ✕ button does not run
  dockEl.addEventListener('click', (e) => {
    if (e.target.closest('#cd-collapse')) {
      e.stopPropagation();
      return UI.toggleDock();
    }
    if (e.target.closest('#btn-dock-close')) {
      e.stopPropagation();
      return closeDocker();
    }
  }, true);
  $('#dock-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cd-add]');
    if (!b) return;
    const l = openList();
    UI.popover(b, '<div class="pop-head">Yerleşik paneller</div>' + UI.DOCKERS.map(([k, n]) => '<button class="pop-item' + (l.includes(k) ? ' on' : '') + '" data-pick="' + k + '">' + icon(TAB_ICON[k] || 'panels', 'sm') + ' ' + esc(n) + (l.includes(k) ? ' ✓' : '') + '</button>').join(''), (k) => UI.openDock(k));
  });

  /* ---------- helpers ---------- */
  const leafPaths = () => (VP.sel.length ? VP.leafItems(VP.sel).filter((it) => (it instanceof paper.Path || it instanceof paper.CompoundPath) && !(VP.fx && VP.fx.isFx(it))) : []);
  const UNITS = [['mm', 'milimetre', 'mm'], ['pt', 'punto', 'pt'], ['in', 'inç', '"'], ['px', 'piksel', 'px']];
  const unit = () => (UNITS.some(([k]) => k === S().cdUnit) ? S().cdUnit : 'mm');
  const fromPt = (pt, u) => (u === 'mm' ? VP.toMM(pt) : u === 'in' ? pt / 72 : u === 'px' ? (pt * 96) / 72 : pt);
  const toPt = (v, u) => (u === 'mm' ? VP.toPT(v) : u === 'in' ? v * 72 : u === 'px' ? (v * 72) / 96 : v);
  const fmtW = (pt) => {
    const u = unit();
    const short = UNITS.find(([k]) => k === u)[2];
    return VP.num(fromPt(pt, u), u === 'in' ? 3 : u === 'mm' ? 3 : 2) + ' ' + short;
  };
  // Corel shows the miter limit as an angle; paper.js keeps it as a ratio
  const ratioToDeg = (r) => (r > 1 ? (2 * Math.asin(1 / r) * 180) / Math.PI : 180);
  const degToRatio = (d) => 1 / Math.sin((VP.clamp(d, 0.5, 179) * Math.PI) / 360);
  const dashArr = { solid: '', dash: '6 3', dot: '1 3', dashdot: '6 3 1 3', long: '10 4' };
  const linePreview = (k, w) => '<svg class="cd-line-svg" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true"><path d="M2 5H118" stroke="currentColor" stroke-width="' + (w || 1.6) + '" fill="none"' + (dashArr[k] ? ' stroke-dasharray="' + dashArr[k] + '"' : '') + '/></svg>';
  const spin = (attr, value, step, dis, aria, min, max) =>
    '<span class="cd-spin' + (dis ? ' dis' : '') + '"><input ' + attr + ' value="' + esc(value) + '" data-step="' + step + '"' + (min != null ? ' data-min="' + min + '"' : '') + (max != null ? ' data-max="' + max + '"' : '') + ' inputmode="decimal" enterkeyhint="done" aria-label="' + esc(aria) + '"' + (dis ? ' disabled' : '') + '>' +
    '<span class="cd-spin-b"><button data-cd="spin:1" tabindex="-1" aria-label="Artır"' + (dis ? ' disabled' : '') + '>' + svg('<path d="M7 14l5-5 5 5"/>', 'sm') + '</button><button data-cd="spin:-1" tabindex="-1" aria-label="Azalt"' + (dis ? ' disabled' : '') + '>' + svg('<path d="M7 10l5 5 5-5"/>', 'sm') + '</button></span></span>';
  const check = (on, attrs, text, dis) => '<button class="cd-check' + (on ? ' on' : '') + '" ' + attrs + ' role="checkbox" aria-checked="' + !!on + '"' + (dis ? ' disabled' : '') + '><i></i><span>' + text + '</span></button>';
  const tri = (items, cur, prefix, dis) => '<span class="cd-tri">' + items.map(([v, body, l]) => '<button class="cd-ib' + (v === cur ? ' on' : '') + '" data-act="' + prefix + v + '" title="' + esc(l) + '" aria-label="' + esc(l) + '" aria-pressed="' + (v === cur) + '"' + (dis ? ' disabled' : '') + '>' + svg(body) + '</button>').join('') + '</span>';

  const JOIN_I = {
    miter: '<path d="M6 21V6h15" stroke-width="5.5" stroke-linejoin="miter" stroke-linecap="butt" opacity=".5"/><path d="M6 21V6h15" stroke-width="1.2"/>',
    round: '<path d="M6 21V6h15" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="butt" opacity=".5"/><path d="M6 21V6h15" stroke-width="1.2"/>',
    bevel: '<path d="M6 21V6h15" stroke-width="5.5" stroke-linejoin="bevel" stroke-linecap="butt" opacity=".5"/><path d="M6 21V6h15" stroke-width="1.2"/>'
  };
  const CAP_I = {
    butt: '<path d="M3 12h11" stroke-width="7" stroke-linecap="butt" opacity=".5"/><path d="M3 12h11M14 5v14" stroke-width="1.2"/>',
    round: '<path d="M3 12h11" stroke-width="7" stroke-linecap="round" opacity=".5"/><path d="M3 12h11M14 5v14" stroke-width="1.2"/>',
    square: '<path d="M3 12h11" stroke-width="7" stroke-linecap="square" opacity=".5"/><path d="M3 12h11M14 5v14" stroke-width="1.2"/>'
  };
  const POS_I = {
    outside: '<path d="M4 21V4h17" stroke-width="4" stroke-linejoin="miter" opacity=".5"/><path d="M6.5 21V6.5H21" stroke-width="1.2"/>',
    center: '<path d="M6.5 21V6.5H21" stroke-width="4" stroke-linejoin="miter" opacity=".5"/><path d="M6.5 21V6.5H21" stroke-width="1.2"/>',
    inside: '<path d="M9 21V9h12" stroke-width="4" stroke-linejoin="miter" opacity=".5"/><path d="M6.5 21V6.5H21" stroke-width="1.2"/>'
  };

  /* ---------- Özellikler: the Anahat (outline) section ---------- */
  const outlineSection = () => {
    const items = VP.sel;
    const has = items.length > 0;
    const isImg = has && items.every((i) => i instanceof paper.Raster);
    const d = VP.defaults;
    const st = has && !isImg ? VP.getStroke(items[0]) : { on: !!d.stroke, color: d.stroke || '#1d1d1b', width: d.strokeWidth, dash: d.dash || 'solid', cap: d.cap || 'butt', join: d.join || 'miter' };
    const ps = leafPaths();
    const p = ps[0];
    const pd = (p && p.data) || {};
    const dis = isImg;
    const noSel = !p;
    const adv = S().cdOlAdv !== false;
    const a = pd.arrows || {};
    const openPath = p instanceof paper.Path && !p.closed;
    const nib = pd.nib || { stretch: 100, angle: 0 };
    const deg = ratioToDeg(p && p.miterLimit ? p.miterLimit : 10);
    const share = !!S().cdArrowShare;
    const arrowSel = (name, cur) => '<span class="cd-combo"><select data-pf="' + name + '" aria-label="' + (name === 'olStart' ? 'Başlangıç ok başı' : 'Bitiş ok başı') + '"' + (openPath ? '' : ' disabled') + '>' +
      ((VP.outline && VP.outline.ARROWS) || [['none', 'Yok']]).map(([k, l]) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + (k === 'none' ? '—' : esc(l)) + '</option>').join('') + '</select></span>';
    let h = '<div class="sec cd-ol">';
    h += '<div class="sec-h"><h3>Yüzeysel</h3></div>';
    if (isImg) h += '<p class="sec-note">Resim nesnesi · Anahat uygulanmaz</p>';
    // colour button ▾
    h += '<div class="cd-r"><span class="cd-color' + (st.on ? '' : ' none') + '"><label class="cd-swatch" title="Anahat rengi" style="--c:' + esc(st.on ? st.color : 'transparent') + '"><input type="color" data-dk="stroke" value="' + esc(st.color || '#1d1d1b') + '" aria-label="Anahat rengi"' + (dis ? ' disabled' : '') + '></label><button class="cd-dd" data-cd="colorMenu" aria-label="Anahat rengi seçenekleri"' + (dis ? ' disabled' : '') + '>' + icon('chevDown', 'sm') + '</button></span></div>';
    // width combo + units combo
    h += '<div class="cd-r"><span class="cd-combo cd-w"><input data-cdf="strokeW" value="' + esc(st.on ? fmtW(st.width) : 'Yok') + '" inputmode="decimal" enterkeyhint="done" aria-label="Anahat genişliği"' + (dis ? ' disabled' : '') + '><button class="cd-dd" data-cd="widthMenu" aria-label="Hazır genişlikler"' + (dis ? ' disabled' : '') + '>' + icon('chevDown', 'sm') + '</button></span>' +
      '<span class="cd-combo cd-u"><select data-cdf="unit" aria-label="Birim">' + UNITS.map(([k, l]) => '<option value="' + k + '"' + (k === unit() ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></span></div>';
    // line style ▾ and "…"
    h += '<div class="cd-r"><button class="cd-combo cd-line" data-cd="dashMenu" aria-label="Çizgi stili"' + (dis ? ' disabled' : '') + '>' + linePreview(st.dash) + icon('chevDown', 'sm') + '</button><button class="cd-more" data-cd="dashMenu" title="Çizgi stilleri" aria-label="Çizgi stilleri"' + (dis ? ' disabled' : '') + '>•••</button></div>';
    h += '<button class="cd-fold" data-cd="olAdv" aria-expanded="' + adv + '" title="' + (adv ? 'Ayrıntıları gizle' : 'Ayrıntıları göster') + '">' + icon(adv ? 'chevUp' : 'chevDown', 'sm') + '</button>';
    if (adv) {
      h += '<div class="cd-grid">';
      h += '<span class="cd-lab">Dirsek Limiti:</span>' + spin('data-cdf="miter"', VP.num(deg, 1), 1, noSel, 'Dirsek limiti', 0.5, 179);
      h += '<span class="cd-lab">Köşeler:</span>' + tri([['miter', JOIN_I.miter, 'Sivri köşeler'], ['round', JOIN_I.round, 'Yuvarlatılmış köşeler'], ['bevel', JOIN_I.bevel, 'Kesik köşeler']], st.join, 'join:', dis);
      h += '<span class="cd-lab">Çizgi uçları:</span>' + tri([['butt', CAP_I.butt, 'Düz uçlar'], ['round', CAP_I.round, 'Yuvarlak uçlar'], ['square', CAP_I.square, 'Kare uçlar']], st.cap, 'cap:', dis);
      h += '<span class="cd-lab">Konum:</span>' + tri([['outside', POS_I.outside, 'Dış anahat'], ['center', POS_I.center, 'Ortalanmış anahat'], ['inside', POS_I.inside, 'İç anahat']], pd.strokePos || 'center', 'olPos:', noSel);
      h += '</div>';
    }
    h += '</div>';
    // Okbaşları
    h += '<div class="sec cd-ol"><div class="sec-h"><h3>Okbaşları</h3></div>' +
      '<div class="cd-r cd-arrow">' + icon('cdLeft', 'sm cd-mut') + arrowSel('olStart', a.s || 'none') + '<button class="cd-more" data-cd="arrowMenu" title="Ok başı seçenekleri" aria-label="Ok başı seçenekleri"' + (openPath ? '' : ' disabled') + '>•••</button></div>' +
      '<div class="cd-r cd-arrow">' + icon('cdRight', 'sm cd-mut') + arrowSel('olEnd', a.e || 'none') + '<button class="cd-more" data-cd="arrowMenu" title="Ok başı seçenekleri" aria-label="Ok başı seçenekleri"' + (openPath ? '' : ' disabled') + '>•••</button></div>' +
      '<div class="cd-r cd-ind">' + check(share, 'data-cd="arrowShare"', 'Nitelikleri Paylaş') + '</div>' +
      (has && !openPath && !isImg ? '<p class="sec-note">Ok başları açık eğrilere uygulanır.</p>' : '') + '</div>';
    // Değişken Anahat (drawn with the Variable outline tool)
    const vo = VP.TOOL_META && VP.TOOL_META.varOutline;
    h += '<div class="sec cd-ol"><div class="sec-h"><h3>Değişken Anahat</h3>' + (vo ? '<button class="cd-ib" data-cd="tool:varOutline" title="Değişken anahat aracı" aria-label="Değişken anahat aracı">' + icon('varOutline', 'sm') + '</button>' : '') + '</div>' +
      '<div class="cd-vruler" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="cd-grid cd-off"><span class="cd-lab">Konum:</span><span class="cd-ro">0,0 %</span><span class="cd-lab">Kenar 1:</span><span class="cd-ro">0,0 mm</span><span class="cd-lab">Kenar 2:</span><span class="cd-ro">0,0 mm</span><span class="cd-lab">Toplam:</span><span class="cd-ro">0,0 mm</span></div>' +
      '<div class="cd-r cd-ind">' + check(false, 'data-cd="none"', 'Genişliği Vuruşla Ölçeklendir', true) + '</div>' +
      '<p class="sec-note">Kalınlığı eğri boyunca değiştirmek için değişken anahat aracını kullanın.</p></div>';
    // Kaligrafi
    const st2 = Math.round(nib.stretch);
    const ang = nib.angle || 0;
    h += '<div class="sec cd-ol"><div class="sec-h"><h3>Kaligrafi</h3><button class="cd-ib" data-cd="nibReset" title="Varsayılana dön" aria-label="Kaligrafiyi varsayılana döndür"' + (noSel ? ' disabled' : '') + '>' + icon('cdReset', 'sm') + '</button></div>' +
      '<div class="cd-cal"><div class="cd-cal-f">' +
      '<div class="cd-r">' + icon('cdStretch', 'sm cd-mut') + spin('data-pf="olStretch"', String(st2), 5, noSel, 'Uç genişliği (%)', 1, 100) + '</div>' +
      '<div class="cd-r">' + icon('cdAngle', 'sm cd-mut') + spin('data-pf="olAngle"', VP.num(ang, 1), 5, noSel, 'Uç açısı (°)', -360, 360) + '</div></div>' +
      '<span class="cd-nib" title="Uç biçimi"><svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="20" rx="13" ry="' + Math.max(1, (13 * st2) / 100).toFixed(1) + '" transform="rotate(' + (-ang).toFixed(1) + ' 20 20)"/></svg></span></div>' +
      '<div class="cd-checks">' +
      check(!!pd.behindFill, 'data-act="olBehind"', 'Dolgunun arkasında', noSel) +
      check(false, 'data-cd="none"', 'Nesne ile ölçekle', true) +
      check(false, 'data-cd="none"', 'Anahattı üzerine yaz', true) + '</div></div>';
    if (!has) h += '<p class="sec-note cd-pad">Seçim yok · Bu ayarlar yeni çizilen nesnelere uygulanır.</p>';
    return h;
  };

  /* ---------- Özellikler: section icon tabs over VektörPad's existing property sections ---------- */
  const SECS = [
    ['outline', 'nib|outlinePen', 'Anahat'],
    ['fill', 'fillBucket|fillTool', 'Dolgu'],
    ['transp', 'transparency|transpTool', 'Şeffaflık'],
    ['fx', 'fx|cdFx', 'Efektler'],
    ['shape', 'circleTab|ellipse', 'Nesne'],
    ['art', 'artisticMedia|cdArt', 'Sanatsal medya'],
    ['bitmap', 'summary|cdBitmap', 'Biteşlem']
  ];
  const FILL_T = ['Dolgu', 'Renk durakları', 'Özel dolgu'];
  const FX_T = ['Gölge', 'Efektler', 'Harmanlama seçenekleri', 'Renk eşlemi', 'Zarf modu'];
  const classify = (t) => {
    if (FILL_T.includes(t) || /dolgu/i.test(t)) return 'fill';
    if (/şeffaf|saydam/i.test(t)) return 'transp';
    if (t === 'Anahat' || t === 'Anahat kalemi') return 'drop';
    const names = VP.fx && VP.fx.NAMES ? Object.values(VP.fx.NAMES) : [];
    if (FX_T.includes(t) || names.includes(t) || /gölge|efekt/i.test(t)) return 'fx';
    if (/resim|biteşlem|bitmap/i.test(t)) return 'bitmap';
    return 'shape';
  };
  const KIND_I = { ellipse: 'circleTab|ellipse', rect: 'rect', text: 'text', polygon: 'polygon', star: 'star', image: 'cdBitmap', group: 'group', spiral: 'spiral' };
  const shapeInfo = () => {
    const it = VP.sel[0];
    if (!it) return ['circleTab|ellipse', 'Nesne'];
    const k = VP.kindOf(it);
    const name = VP.sel.length > 1 ? 'Nesneler' : (VP.KIND_NAMES && VP.KIND_NAMES[k]) || VP.describe(it);
    return [KIND_I[k] || (window.VPIcon && VPIcon.has('kind_' + k) ? 'kind_' + k : 'circleTab|ellipse'), name];
  };
  const curSec = () => (SECS.some(([k]) => k === S().cdSec) ? S().cdSec : 'outline');
  const menuButtons = (keys) => keys.filter((k) => typeof k === 'string' && A[k] && !/^h:|^\|$/.test(k)).slice(0, 14).map((k) => {
    const a = A[k];
    const l = typeof a.label === 'function' ? a.label() : a.label;
    let en = true;
    try { en = !a.enabled || a.enabled(); } catch (e) { en = true; }
    return '<button class="btn cd-wide" data-act="' + k + '"' + (en ? '' : ' disabled') + '>' + (a.icon ? icon(a.icon, 'sm') : '') + esc(l) + '</button>';
  }).join('');

  const buildProps = (body) => {
    const st = body.scrollTop;
    const items = VP.sel;
    const isImg = items.length && items.every((i) => i instanceof paper.Raster);
    // with "follow the selection" on, leave a section that does not apply to the selection
    if (S().cdSecAuto !== false) {
      if (isImg && (S().cdSec === 'outline' || S().cdSec === 'fill' || !S().cdSec)) S().cdSec = 'bitmap';
      else if (!isImg && S().cdSec === 'bitmap') S().cdSec = 'outline';
    }
    const buckets = { outline: [], fill: [], transp: [], fx: [], shape: [], art: [], bitmap: [] };
    let first = true;
    let info = null;
    [...body.children].forEach((n) => {
      if (n.classList.contains('props-nav')) return n.remove();
      if (n.classList.contains('sec')) {
        const h = n.querySelector('.sec-h h3');
        const c = classify(h ? h.textContent.trim() : '');
        if (c === 'drop') n.remove();
        else buckets[c].push(n);
      } else if (first && n.classList.contains('sec-note')) info = n;
      else if (/Resim nesnesi/.test(n.textContent)) buckets.bitmap.push(n);
      else buckets.shape.push(n);
      if (n.classList.contains('sec-note') || n.classList.contains('sec')) first = false;
    });
    const [shIcon, shName] = shapeInfo();
    const single = S().cdSecSingle !== false;
    const auto = S().cdSecAuto !== false;
    const cur = curSec();
    const wrap = document.createElement('div');
    wrap.className = 'cd-props' + (single ? ' single' : '');
    wrap.dataset.sec = cur;
    wrap.innerHTML = '<div class="cd-pnav" role="tablist" aria-label="Özellik bölümleri">' + SECS.map(([k, ico, l]) => {
      const name = k === 'shape' ? shName : l;
      return '<button class="cd-ib' + (k === cur ? ' on' : '') + '" data-cd="sec:' + k + '" role="tab" aria-selected="' + (k === cur) + '" title="' + esc(name) + '" aria-label="' + esc(name) + '">' + icon(k === 'shape' ? shIcon : ico, 'sm', 'ellipse') + '</button>';
    }).join('') + '<span class="cd-sp"></span>' +
      '<button class="cd-ib' + (single ? ' on' : '') + '" data-cd="single" title="Yalnızca seçili bölümü göster" aria-label="Yalnızca seçili bölümü göster" aria-pressed="' + single + '">' + icon('cdSingle', 'sm') + '</button>' +
      '<button class="cd-ib' + (auto ? ' on' : '') + '" data-cd="auto" title="Seçime uymayan bölümden çık (resim seçilince Biteşlem)" aria-label="Bölümü seçime göre değiştir" aria-pressed="' + auto + '">' + icon('cdAuto', 'sm') + '</button></div>';
    const box = (k, title) => {
      const d = document.createElement('div');
      d.className = 'cd-psec';
      d.dataset.sec = k;
      d.innerHTML = '<div class="cd-psec-h">' + esc(title) + '</div>';
      wrap.appendChild(d);
      return d;
    };
    const empty = (d, txt) => d.insertAdjacentHTML('beforeend', '<p class="sec-note cd-pad">' + txt + '</p>');
    // Anahat
    box('outline', 'Anahat').insertAdjacentHTML('beforeend', outlineSection());
    // Dolgu, Şeffaflık, Efektler: VektörPad's own sections
    const FIRST = ['Dolgu', 'Saydamlık', 'Gölge'];
    const rank = (n) => {
      const h = n.querySelector && n.querySelector('.sec-h h3');
      const i = FIRST.indexOf(h ? h.textContent.trim() : '');
      return i < 0 ? 9 : i;
    };
    [['fill', 'Dolgu'], ['transp', 'Şeffaflık'], ['fx', 'Efektler']].forEach(([k, t]) => {
      const d = box(k, t);
      buckets[k].slice().sort((x, y) => rank(x) - rank(y)).forEach((n) => d.appendChild(n));
      if (!buckets[k].length) empty(d, items.length ? 'Seçili nesne için ' + t.toLowerCase() + ' ayarı yok.' : 'Önce bir nesne seçin.');
    });
    // object (shape) properties
    const sd = box('shape', shName);
    if (info) sd.appendChild(info);
    buckets.shape.forEach((n) => sd.appendChild(n));
    if (items.length && items.some((i) => VP.kindOf(i) === 'text') && UI.DOCKERS.some(([k]) => k === 'text')) sd.insertAdjacentHTML('beforeend', '<div class="sec"><div class="row"><button class="btn cd-wide" data-cd="open:text">' + icon('text', 'sm') + 'Metin özellikleri…</button></div></div>');
    if (items.length && !buckets.shape.length) empty(sd, 'Konum, boyut, döndürme ve köşe ayarları özellik çubuğundadır.');
    // Sanatsal medya
    const am = VP.TOOL_META && VP.TOOL_META.brush;
    box('art', 'Sanatsal medya').insertAdjacentHTML('beforeend', '<div class="sec"><div class="row"><button class="btn cd-wide" data-cd="tool:brush">' + icon('cdArt', 'sm') + esc((am && am.label) || 'Sanatsal medya') + ' aracı</button></div>' + (am && am.hint ? '<p class="sec-note">' + esc(am.hint).split(' · ').join('<br>') + '</p>' : '') + '</div>');
    // Biteşlem
    const bd = box('bitmap', 'Biteşlem');
    buckets.bitmap.forEach((n) => bd.appendChild(n));
    const bm = (UI.MENUS && UI.MENUS.bitmaps) || [];
    bd.insertAdjacentHTML('beforeend', '<div class="sec"><div class="cd-btns">' + menuButtons(bm) + '</div>' + (isImg ? '' : '<p class="sec-note">Biteşlem komutları için bir resim seçin veya nesneyi biteşleme dönüştürün.</p>') + '</div>');
    body.innerHTML = '';
    body.appendChild(wrap);
    body.scrollTop = st;
  };

  const showSec = (k) => {
    S().cdSec = k;
    VP.io.savePrefs();
    const wrap = $('#dock-body .cd-props');
    if (!wrap) return;
    wrap.dataset.sec = k;
    wrap.querySelectorAll('.cd-pnav [data-cd^="sec:"]').forEach((b) => {
      const on = b.dataset.cd === 'sec:' + k;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
    const body = $('#dock-body');
    if (wrap.classList.contains('single')) body.scrollTop = 0;
    else {
      const s = wrap.querySelector('.cd-psec[data-sec="' + k + '"]');
      const nav = wrap.querySelector('.cd-pnav');
      if (s) body.scrollTop = s.offsetTop - (nav ? nav.offsetHeight : 0);
    }
  };
  UI.cdShowProps = (k) => {
    UI.openDock('props');
    if (k) showSec(k);
  };

  /* ---------- Nesneler: Sayfa / Katman / nesne tree ---------- */
  const fold = new Set(); // collapsed nodes
  const openGroups = new Set();
  const isMaster = (L) => !!(L && L.data && L.data.master);
  const thumb = (it) => {
    const k = VP.kindOf(it);
    if (it instanceof paper.Raster || k === 'image') return '<span class="cd-th">' + icon('cdBitmap', 'sm') + '</span>';
    try {
      const b = it.strokeBounds;
      if (b && b.width > 0 && b.height > 0 && !(it instanceof paper.PointText)) {
        const pad = Math.max(b.width, b.height) * 0.04;
        const s = it.exportSVG({ asString: true, precision: 1 });
        if (s && s.length < 60000) return '<span class="cd-th"><svg viewBox="' + [b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad].map((v) => v.toFixed(1)).join(' ') + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + s + '</svg></span>';
      }
    } catch (e) { /* fall back to the kind icon */ }
    return '<span class="cd-th">' + icon('kind_' + k, 'sm', 'kind_path') + '</span>';
  };
  const vbtn = (act, on, what) => '<button class="cd-rb' + (on ? '' : ' off') + '" data-act="' + act + '" title="' + (on ? 'Gizle' : 'Göster') + '" aria-label="' + what + ' göster veya gizle" aria-pressed="' + !on + '">' + icon(on ? 'eye' : 'eyeOff', 'sm') + '</button>';
  const lbtn = (act, locked, what) => '<button class="cd-rb' + (locked ? ' off' : '') + '" data-act="' + act + '" title="' + (locked ? 'Kilidi aç' : 'Kilitle') + '" aria-label="' + what + ' kilitle veya kilidini aç" aria-pressed="' + !!locked + '">' + icon(locked ? 'lock' : 'unlock', 'sm') + '</button>';
  const caret = (key, open, aria) => '<button class="cd-car" data-cd="fold:' + key + '" aria-expanded="' + open + '" aria-label="' + esc(aria) + '">' + svg(open ? '<path d="M5 8h14l-7 9z" fill="currentColor" stroke="none"/>' : '<path d="M8 5v14l9-7z" fill="currentColor" stroke="none"/>', 'sm') + '</button>';
  let thumbs = 0;
  const objRow = (it, path, depth, li, ci) => {
    const sel = VP.sel.includes(it);
    const exp = it instanceof paper.Group && !(VP.fx && VP.fx.isFx(it)) && it.children.length > 0;
    const op = openGroups.has(it.id);
    const top = depth === 1;
    const name = VP.describe(it);
    let r = '<div class="cd-row cd-obj' + (sel ? ' sel' : '') + (it.visible ? '' : ' hid') + '" ' + (top ? 'data-li="' + li + '" data-ci="' + ci + '" ' : '') + 'data-path="' + path + '" data-name="' + esc(name.toLowerCase()) + '" style="--d:' + depth + '">' +
      (exp ? '<button class="cd-car" data-cd="tree:' + it.id + '" aria-expanded="' + op + '" aria-label="' + (op ? 'Daralt' : 'Genişlet') + '">' + svg(op ? '<path d="M5 8h14l-7 9z" fill="currentColor" stroke="none"/>' : '<path d="M8 5v14l9-7z" fill="currentColor" stroke="none"/>', 'sm') + '</button>' : '<span class="cd-car"></span>') +
      '<span class="cd-hit" data-act="' + (top ? 'objSel' : 'zdSel:' + path) + '">' + (thumbs++ < 160 ? thumb(it) : '<span class="cd-th">' + icon('kind_' + VP.kindOf(it), 'sm', 'kind_path') + '</span>') + '<span class="cd-name">' + esc(name) + '</span></span>' +
      '<span class="cd-acts">' + vbtn(top ? 'objVis' : 'zdVis:' + path, it.visible, 'Nesneyi') + lbtn(top ? 'objLock' : 'zdLock:' + path, it.locked, 'Nesneyi') + '</span></div>';
    if (exp && op) it.children.slice().reverse().forEach((c) => (r += objRow(c, path + '.' + it.children.indexOf(c), depth + 1)));
    return r;
  };
  const layerRows = (L, ls) => {
    const li = ls.indexOf(L);
    const key = 'L' + L.id;
    const op = !fold.has(key);
    const active = L === VP.activeLayer;
    let h = '<div class="cd-row cd-layer' + (active ? ' active' : '') + (L.visible ? '' : ' hid') + '" data-li="' + li + '" data-name="' + esc(String(L.name || '').toLowerCase()) + '">' + caret(key, op, op ? 'Katmanı daralt' : 'Katmanı genişlet') +
      '<span class="cd-hit" data-act="layerActivate" title="Etkin katman yap">' + icon('cdObjects', 'sm cd-mut') + '<span class="cd-name">' + esc(L.name || 'Katman') + '</span></span>' +
      '<span class="cd-acts">' + vbtn('layerVis', L.visible, 'Katmanı') + lbtn('layerLock', L.locked, 'Katmanı') + '<button class="cd-rb" data-act="zdLayerMenu:' + li + '" title="Katman seçenekleri" aria-label="Katman seçenekleri">' + icon('menu', 'sm') + '</button></span>' +
      '<i class="cd-bar" style="background:' + esc((L.data && L.data.color) || '#000000') + '"></i></div>';
    if (op) L.children.slice().reverse().forEach((it) => (h += objRow(it, li + '.' + L.children.indexOf(it), 1, li, L.children.indexOf(it))));
    return h;
  };
  const fixedRow = (ico, name, act, on, color, title) => '<div class="cd-row cd-fixed' + (act && !on ? ' hid' : '') + '" style="--d:1" data-name="' + esc(name.toLowerCase()) + '"><span class="cd-car"></span><span class="cd-hit"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + icon(ico, 'sm cd-mut') + '<span class="cd-name">' + esc(name) + '</span></span>' +
    '<span class="cd-acts">' + (act ? vbtn(act, on, name) : '') + '</span><i class="cd-bar" style="background:' + color + '"></i></div>';
  const checked = (k) => {
    try { return !!(A[k] && A[k].checked && A[k].checked()); } catch (e) { return false; }
  };
  const objectsPanel = () => {
    thumbs = 0;
    const ls = VP.userLayers();
    const page = VP.page ? VP.page() : null;
    const pname = (page && page.name) || 'Sayfa ' + ((VP.doc && VP.doc.active) + 1 || 1);
    const AL = VP.activeLayer;
    const q = UI._cdSearch || '';
    let h = '<div class="cd-objs">';
    h += '<div class="cd-search">' + icon('search', 'sm cd-mut') + '<input type="search" data-cdf="search" value="' + esc(q) + '" placeholder="Ara" aria-label="Nesnelerde ara" enterkeyhint="search"></div>';
    h += '<div class="cd-otb"><button class="cd-ib" data-act="addLayer" title="Yeni katman" aria-label="Yeni katman">' + icon('cdNewLayer', 'sm') + '</button>' +
      '<button class="cd-otb-cur" data-cd="layerPick" title="Etkin katman" aria-label="Etkin katmanı seç">' + icon('cdObjects', 'sm') + '<b>' + esc(pname) + '</b><span>' + esc((AL && AL.name) || '') + '</span></button>' +
      '<button class="cd-ib" data-cd="objGear" title="Seçenekler" aria-label="Nesneler seçenekleri">' + icon('gear', 'sm') + '</button></div>';
    h += '<div class="cd-tree" role="tree">';
    const pk = 'page';
    const pop = !fold.has(pk);
    h += '<div class="cd-row cd-group">' + caret(pk, pop, 'Sayfayı daralt') + '<span class="cd-hit"><b>' + esc(pname) + '</b></span></div>';
    if (pop) {
      h += fixedRow('cdGuide', 'Kılavuzlar', A.guides ? 'guides' : '', checked('guides'), '#1f3cff', 'Bu sayfanın kılavuz çizgileri');
      ls.filter((L) => !isMaster(L)).reverse().forEach((L) => (h += layerRows(L, ls)));
    }
    const mk = 'master';
    const mop = !fold.has(mk);
    h += '<div class="cd-row cd-group">' + caret(mk, mop, 'Ana sayfayı daralt') + '<span class="cd-hit">Ana Sayfa</span></div>';
    if (mop) {
      ls.filter(isMaster).reverse().forEach((L) => (h += layerRows(L, ls)));
      h += fixedRow('cdGuide', 'Kılavuzlar (tüm sayfalar)', A.guides ? 'guides' : '', checked('guides'), '#1f3cff', 'Kılavuz çizgileri');
      h += fixedRow('cdDesk', 'Masaüstü', '', true, '#000000', 'Sayfanın dışındaki çizim alanı');
      h += fixedRow('cdGrid', 'Belge ızgarası', A.grid ? 'grid' : '', checked('grid'), '#c8c8c8', 'Belge ızgarası');
    }
    h += '</div></div>';
    return h;
  };
  const applySearch = () => {
    const q = (UI._cdSearch || '').trim().toLowerCase();
    document.querySelectorAll('#dock-body .cd-tree .cd-row').forEach((r) => {
      const n = r.dataset.name;
      r.classList.toggle('cd-nomatch', !!q && n != null && !r.classList.contains('cd-group') && !r.classList.contains('cd-layer') && !n.includes(q));
    });
  };
  UI.panels = UI.panels || {};
  UI.panels.objects = objectsPanel;

  /* ---------- Öğren: VektörPad's hints in Corel's Learn docker frame ---------- */
  const hints0 = UI.panels.hints;
  const TOPICS = [['Çizgiler', 'freehand'], ['Bağlantı çizgileri', 'connStraight'], ['Boyut çizgileri', 'dimParallel'], ['Şekiller', 'rect'], ['Nesneleri seçme', 'select'], ['Nesneleri şekillendirme', 'node'], ['Metin', 'text'], ['Nesneleri doldurma', 'sec:fill'], ['Nesnelerin anahattını belirleme', 'sec:outline'], ['Özel efektler', 'sec:fx'], ['Şeffaflık', 'sec:transp']];
  if (hints0) {
    UI.panels.hints = () => {
      const m = (VP.TOOL_META && VP.TOOL_META[VP.toolId]) || { label: VP.toolId, icon: 'select', hint: '' };
      let tips = '';
      try {
        const t = document.createElement('template');
        t.innerHTML = hints0();
        const s = [...t.content.querySelectorAll('.sec')].find((x) => /Biliyor/.test((x.querySelector('h3') || {}).textContent || ''));
        if (s) tips = '<h3>Biliyor muydunuz?</h3><ul>' + [...s.querySelectorAll('.sec-note')].map((p) => '<li>' + esc(p.textContent.replace(/^•\s*/, '')) + '</li>').join('') + '</ul>';
      } catch (e) { tips = ''; }
      let h = '<div class="cd-learn"><div class="cd-learn-top"><button class="cd-learn-tile on" data-cd="tool:select" title="İpuçları" aria-label="İpuçları">' + icon('cdTip') + '</button><small>İpuçları</small></div><div class="cd-learn-body">';
      h += '<h2>' + esc(m.label) + '</h2>';
      const parts = String(m.hint || 'Konuları görüntülemek için bir araçla eylem gerçekleştirin veya aşağıdaki listede yer alan konulardan birini seçin.').split(' · ');
      h += '<ul>' + parts.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>';
      if (m.key) h += '<p>Kısayol: <b>' + esc(m.key) + '</b></p>';
      if (VP.sel.length) h += '<p class="cd-mut">' + esc(VP.sel.length === 1 ? VP.describe(VP.sel[0]) + ' seçili' : VP.sel.length + ' nesne seçili') + ' · Ayarlar özellik çubuğunda ve Özellikler panelinde.</p>';
      h += '<h3>Ana sayfa</h3><ul class="cd-links">' + TOPICS.filter(([, k]) => /^sec:/.test(k) || (VP.TOOL_META && VP.TOOL_META[k])).map(([l, k]) => '<li><button class="cd-link" data-cd="' + (/^sec:/.test(k) ? 'learnSec:' + k.slice(4) : 'tool:' + k) + '">' + esc(l) + '</button></li>').join('') + '</ul>';
      h += tips + '</div></div>';
      return h;
    };
  }

  /* ---------- renderDock: frame, then Özellikler sections ---------- */
  const rd0 = UI.renderDock;
  UI.renderDock = (force) => {
    ensureFrame();
    rd0(force);
    const dock = $('#dock');
    dock.dataset.cdTab = UI.dockTab;
    if (dock.hidden) return;
    const body = $('#dock-body');
    if (UI.dockTab === 'props' && !body.querySelector(':scope > .cd-props')) buildProps(body);
    if (UI.dockTab === 'objects') applySearch();
  };

  /* ---------- events for data-cd controls and our own fields ---------- */
  const body = $('#dock-body');
  const items = () => (VP.sel.length ? VP.sel : null);
  const setWidthPt = (pt) => {
    const its = items();
    const d = VP.defaults;
    if (its) {
      if (pt <= 0) VP.setStroke(its, { on: false });
      else {
        const s0 = VP.getStroke(its[0]);
        VP.setStroke(its, { on: true, width: pt, color: s0.on ? s0.color : d.stroke || '#1d1d1b' });
      }
      VP.commit();
    } else if (pt > 0) {
      d.strokeWidth = pt;
      if (!d.stroke) d.stroke = '#1d1d1b';
      VP.emit('defaults');
    } else {
      d.stroke = null;
      VP.emit('defaults');
    }
    VP.io.savePrefs();
    UI.schedule('dock', 'prop', 'status', 'palette');
  };
  const setStrokeColor = (hex) => {
    if (hex === 'none') return setWidthPt(0);
    UI.dockField('stroke', hex, null, false);
    UI.schedule('dock', 'prop');
  };
  const WIDTHS = [['hair', 'Saç teli', 0.216], [0.1], [0.2], [0.25], [0.5], [0.75], [1], [1.5], [2], [2.5]];
  const handleCd = (b, e) => {
    const id = b.dataset.cd;
    const i = id.indexOf(':');
    const k = i < 0 ? id : id.slice(0, i);
    const arg = i < 0 ? '' : id.slice(i + 1);
    switch (k) {
      case 'sec': return showSec(arg);
      case 'single':
        S().cdSecSingle = S().cdSecSingle === false;
        VP.io.savePrefs();
        return UI.renderDock(true);
      case 'auto':
        S().cdSecAuto = S().cdSecAuto === false;
        VP.io.savePrefs();
        return UI.renderDock(true);
      case 'olAdv':
        S().cdOlAdv = S().cdOlAdv === false;
        VP.io.savePrefs();
        return UI.renderDock(true);
      case 'spin': {
        const box = b.closest('.cd-spin');
        const inp = box && box.querySelector('input');
        if (!inp || inp.disabled) return;
        const step = +inp.dataset.step || 1;
        let v = (VP.parseNum(inp.value) || 0) + step * +arg;
        if (inp.dataset.min != null) v = Math.max(+inp.dataset.min, v);
        if (inp.dataset.max != null) v = Math.min(+inp.dataset.max, v);
        inp.value = VP.num(v, 2);
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      case 'colorMenu': {
        const sw = [...document.querySelectorAll('#palette .swatch[data-color^="#"]')].map((s) => s.dataset.color).filter((c, j, a) => a.indexOf(c) === j).slice(0, 48);
        const html = '<button class="pop-item" data-pick="none">' + icon('close', 'sm') + ' Anahat yok</button><div class="cd-popsw">' + sw.map((c) => '<button data-pick="' + esc(c) + '" style="background:' + esc(c) + '" title="' + esc(c) + '" aria-label="' + esc(c) + '"></button>').join('') + '</div><div class="pop-sep"></div><button class="pop-item" data-pick="custom">Diğer renk…</button>';
        UI.popover(b, html, (p) => {
          if (p === 'custom') {
            const inp = body.querySelector('.cd-swatch input[type="color"]');
            if (inp) inp.click();
            return;
          }
          setStrokeColor(p);
        });
        return;
      }
      case 'widthMenu': {
        const html = '<button class="pop-item" data-pick="0">Yok</button>' + WIDTHS.map(([v, l, pt]) => '<button class="pop-item" data-pick="' + (pt || VP.toPT(v)) + '">' + esc(l ? l : fmtW(VP.toPT(v))) + '</button>').join('');
        UI.popover(b, html, (p) => setWidthPt(+p));
        return;
      }
      case 'dashMenu': {
        const html = VP.DASH_LABELS.map(([v, l]) => '<button class="pop-item cd-dash-item" data-pick="' + v + '">' + linePreview(v, 2) + '<span>' + esc(l) + '</span></button>').join('');
        UI.popover(b, html, (p) => {
          UI.dockField('dash', p, null, false);
          UI.schedule('dock', 'prop');
        });
        return;
      }
      case 'arrowMenu': {
        const p = leafPaths()[0];
        const size = (p && p.data.arrows && p.data.arrows.size) || 4;
        const html = '<div class="pop-head">Ok boyutu</div>' + [2, 3, 4, 6, 8, 12].map((n) => '<button class="pop-item' + (n === size ? ' on' : '') + '" data-pick="size:' + n + '">× ' + n + '</button>').join('') + '<div class="pop-sep"></div><button class="pop-item" data-pick="swap">Okları değiştir</button>';
        UI.popover(b, html, (pk) => {
          if (pk === 'swap') return UI.dockAct('olSwap', b);
          UI.propField('olSize', pk.slice(5), b);
        });
        return;
      }
      case 'arrowShare':
        S().cdArrowShare = !S().cdArrowShare;
        VP.io.savePrefs();
        return UI.renderDock(true);
      case 'nibReset':
        UI.propField('olStretch', '100', b);
        UI.propField('olAngle', '0', b);
        return;
      case 'tool':
        if (VP.TOOL_META && VP.TOOL_META[arg]) VP.setTool(arg);
        return;
      case 'open': return UI.openDock(arg);
      case 'learnSec': return UI.cdShowProps(arg);
      case 'fold':
        fold.has(arg) ? fold.delete(arg) : fold.add(arg);
        return UI.renderDock(true);
      case 'tree': {
        const n = +arg;
        openGroups.has(n) ? openGroups.delete(n) : openGroups.add(n);
        return UI.renderDock(true);
      }
      case 'layerPick': {
        const ls = VP.userLayers();
        UI.popover(b, '<div class="pop-head">Etkin katman</div>' + ls.slice().reverse().map((L) => '<button class="pop-item' + (L === VP.activeLayer ? ' on' : '') + '" data-pick="' + ls.indexOf(L) + '">' + esc(L.name || 'Katman') + (isMaster(L) ? ' (ana)' : '') + '</button>').join(''), (p) => {
          const L = ls[+p];
          if (L) {
            VP.setActiveLayer(L);
            UI.schedule('dock', 'status');
          }
        });
        return;
      }
      case 'objGear': {
        const li = VP.userLayers().indexOf(VP.activeLayer);
        const opt = [['addLayer', 'Yeni katman'], li >= 0 ? ['zdLayerMenu:' + li, 'Etkin katman seçenekleri…'] : null, A.masterLayer ? ['masterLayer', 'Etkin katmanı ana katman yap / çıkar'] : null, A.showAll ? ['showAll', 'Tüm nesneleri göster'] : null, A.unlockAll ? ['unlockAll', 'Tüm nesnelerin kilidini aç'] : null, ['expandAll', 'Tüm grupları daralt']].filter(Boolean);
        UI.popover(b, opt.map(([a, l]) => '<button class="pop-item" data-pick="' + a + '">' + esc(l) + '</button>').join(''), (p) => {
          if (p === 'expandAll') {
            openGroups.clear();
            return UI.renderDock(true);
          }
          UI.dockAct(p, b);
        });
        return;
      }
      default:
        void e;
    }
  };
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cd]');
    if (b && body.contains(b)) {
      if (b.disabled) return;
      e.preventDefault();
      return handleCd(b, e);
    }
    // Nesneler: Shift or Ctrl adds an object to the selection, like Corel
    const hit = e.target.closest('.cd-obj .cd-hit');
    if (hit && (e.shiftKey || e.ctrlKey || e.metaKey) && hit.dataset.act === 'objSel') {
      const row = hit.closest('[data-li]');
      const L = VP.userLayers()[+row.dataset.li];
      const it = L && L.children[+row.dataset.ci];
      if (it && it.visible && !it.locked && L.visible && !L.locked) {
        e.stopImmediatePropagation();
        VP.toggleSel(it);
        UI.schedule('dock', 'prop', 'status');
      }
    }
  }, true);
  // checkbox buttons that use existing actions (data-act) keep working through UI.dockAct; ours (data-cd) are above
  body.addEventListener('dblclick', async (e) => {
    const hit = e.target.closest('.cd-obj .cd-hit, .cd-layer .cd-hit');
    if (!hit) return;
    const row = hit.closest('.cd-row');
    const ls = VP.userLayers();
    let it = null;
    if (row.classList.contains('cd-layer')) it = ls[+row.dataset.li];
    else {
      const parts = String(row.dataset.path || '').split('.').map(Number);
      it = ls[parts[0]];
      for (let j = 1; j < parts.length && it; j++) it = it.children[parts[j]];
    }
    if (!it || !UI.prompt) return;
    const layer = row.classList.contains('cd-layer');
    const n = await UI.prompt({ title: layer ? 'Katmanı yeniden adlandır' : 'Nesneyi yeniden adlandır', label: 'Ad', value: layer ? it.name : VP.describe(it) });
    if (n == null) return;
    if (layer) {
      if (n.trim()) it.name = n.trim();
    } else if (n.trim()) it.data.label = n.trim();
    else delete it.data.label;
    VP.commit();
    UI.renderDock(true);
  });
  body.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.cd-layer');
    if (!row) return;
    e.preventDefault();
    UI.dockAct('zdLayerMenu:' + row.dataset.li, row.querySelector('[data-act^="zdLayerMenu"]') || row);
  });
  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.cdf === 'search') {
      UI._cdSearch = t.value;
      applySearch();
    }
  });
  body.addEventListener('change', (e) => {
    const t = e.target;
    const f = t.dataset.cdf;
    if (t.dataset.pf === 'olStart' && S().cdArrowShare) setTimeout(() => UI.propField('olEnd', t.value, t), 0);
    if (!f) return;
    UI._dockTyping = false;
    if (f === 'strokeW') {
      const raw = String(t.value).trim();
      if (/^yok$/i.test(raw)) return setWidthPt(0);
      const v = VP.parseNum(raw);
      if (!(v >= 0)) return UI.renderDock(true);
      // a unit typed after the number wins (e.g. "1 pt")
      const m = raw.match(/(mm|pt|px|in|inç|")\s*$/i);
      const u = m ? ({ inç: 'in', '"': 'in' }[m[1].toLowerCase()] || m[1].toLowerCase()) : unit();
      return setWidthPt(toPt(v, u));
    }
    if (f === 'unit') {
      S().cdUnit = t.value;
      VP.io.savePrefs();
      return UI.renderDock(true);
    }
    if (f === 'miter') {
      const v = VP.parseNum(t.value);
      const ps = leafPaths();
      if (!(v > 0) || !ps.length) return UI.renderDock(true);
      const r = degToRatio(v);
      ps.forEach((p) => (p.miterLimit = r));
      VP.commit();
      return UI.schedule('dock');
    }
  });

  /* keep the Öğren docker in step with the tool, like Corel's Learn docker */
  VP.on && VP.on('tool', () => UI.dockTab === 'hints' && !$('#dock').hidden && UI.schedule('dock'));
})();
