/* VektörPad dockers laid out like the desktop program (written for this app):
   - Docker title gets a » button that folds the docker down to its tabs.
   - Corners docker: fillet, scallop or chamfer (with separate A and B distances) for the selected curves.
   - Align and Distribute docker: icon rows; align to the selection, the active (last selected) object, the
     page edge, the page centre, the grid or a given point; eight distribute modes to the selection, the page
     or a fixed spacing; text by first or last baseline; optional outline in the measure; pixel grid.
   - Transform docker: Position, Rotate, Scale and mirror, Size and Skew tabs, each with a nine-point anchor,
     a copies count and Apply. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const S = VP.settings;
  const A = VP.actions;
  const esc = UI.h.esc;
  const ic = UI.h.ic;
  const Pt = (x, y) => new paper.Point(x, y);
  const $ = (q) => document.querySelector(q);
  const K3 = (VP.k3 = {});
  const mmv = (pt, d = 3) => VP.num(VP.toMM(pt), d);

  const svg = (body, cls) => '<svg class="i ' + (cls || 'sm') + '" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  const rot = (body) => '<g transform="rotate(90 12 12)">' + body + '</g>';
  const I = {
    toSel: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="2 2"/><rect x="6" y="6" width="6" height="6"/><rect x="12" y="12" width="6" height="6"/>',
    toActive: '<rect x="11" y="11" width="9" height="9"/><rect x="4" y="4" width="9" height="9" fill="currentColor"/>',
    toPage: '<rect x="5" y="3" width="14" height="18"/><path d="M5 7h3M5 17h3M16 7h3M16 17h3"/>',
    toCenter: '<rect x="5" y="3" width="14" height="18"/><path d="M12 8v8M8 12h8"/>',
    toGrid: '<path d="M4 8h16M4 16h16M8 4v16M16 4v16"/>',
    toPoint: '<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="3.5"/>',
    dL: '<rect x="4" y="8" width="6" height="8"/><rect x="14" y="5" width="6" height="14"/><path d="M4 2v20M14 2v20" stroke-dasharray="2 1.6"/>',
    dC: '<rect x="4" y="8" width="6" height="8"/><rect x="14" y="5" width="6" height="14"/><path d="M7 2v20M17 2v20" stroke-dasharray="2 1.6"/>',
    dS: '<rect x="2.5" y="6" width="5" height="12"/><rect x="16.5" y="6" width="5" height="12"/><path d="M9 12h6M9 12l2-2M9 12l2 2M15 12l-2-2M15 12l-2 2"/>',
    dR: '<rect x="4" y="8" width="6" height="8"/><rect x="14" y="5" width="6" height="14"/><path d="M10 2v20M20 2v20" stroke-dasharray="2 1.6"/>',
    toExtent: '<rect x="3" y="6" width="18" height="12" stroke-dasharray="2 2"/><path d="M6 12h12M6 12l2-2M6 12l2 2M18 12l-2-2M18 12l-2 2"/>',
    toPageW: '<rect x="4" y="3" width="16" height="18"/><path d="M7 12h10M7 12l2-2M7 12l2 2M17 12l-2-2M17 12l-2 2"/>',
    toSpace: '<path d="M5 5v14M19 5v14M8 12h8M8 12l2-2M8 12l2 2M16 12l-2-2M16 12l-2 2"/>',
    txFirst: '<path d="M3 10h18" stroke-dasharray="2 1.6"/><path d="M7 10l3-7 3 7M8.2 7.5h3.6"/><path d="M6 19h11"/>',
    txLast: '<path d="M3 19h18" stroke-dasharray="2 1.6"/><path d="M6 8h11"/><path d="M7 19l3-7 3 7M8.2 16.5h3.6"/>',
    txBox: '<rect x="3" y="4" width="18" height="16" stroke-dasharray="2 2"/><path d="M8 16l4-9 4 9M9.6 13h4.8"/>',
    tPos: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    tRot: '<path d="M19 12a7 7 0 11-2.05-4.95"/><path d="M19 4v4h-4"/>',
    tScale: '<rect x="4" y="11" width="9" height="9"/><path d="M9 4h11v11" stroke-dasharray="2 1.6"/><path d="M13 11l7-7M15 4h5v5"/>',
    tSize: '<rect x="6" y="3" width="12" height="12"/><path d="M4 20h16M4 18v4M20 18v4"/>',
    tSkew: '<path d="M8 5h12l-4 14H4z"/>',
    fold: '<path d="M6 6l6 6-6 6M12 6l6 6-6 6"/>'
  };
  const ib = (act, icon, title, on, dis) =>
    '<button class="btn icon-only' + (on ? ' on' : '') + '" data-act="' + act + '" title="' + esc(title) + '" aria-label="' + esc(title) + '"' + (on != null ? ' aria-pressed="' + !!on + '"' : '') + (dis ? ' disabled' : '') + '>' + icon + '</button>';
  const fld = (label, name, value, unit, w) =>
    '<label class="field"><span>' + esc(label) + '</span><input data-pf="' + name + '" value="' + esc(value) + '" inputmode="decimal" enterkeyhint="done" aria-label="' + esc(label) + '"' + (w ? ' style="width:' + w + 'px"' : '') + '>' + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</label>';
  const check = (act, on, label) => '<button class="btn k3-check' + (on ? ' on' : '') + '" data-act="' + act + '" aria-pressed="' + !!on + '"><span class="k3-box">' + (on ? '✓' : '') + '</span>' + esc(label) + '</button>';
  const sec = (title, body) => '<div class="sec k3-sec"><div class="sec-h"><h3>' + esc(title) + '</h3></div>' + body + '</div>';
  const hasSel = () => VP.sel.length > 0;
  const redraw = () => UI.schedule('dock', 'prop', 'status');

  /* ================= docker title: » folds the docker ================= */
  const addFold = () => {
    const x = $('#btn-dock-close');
    if (!x || $('#btn-dock-fold')) return;
    const b = document.createElement('button');
    b.className = 'icon-btn';
    b.id = 'btn-dock-fold';
    b.title = 'Paneli daralt (sekmeler kalır)';
    b.setAttribute('aria-label', 'Paneli daralt');
    b.innerHTML = svg(I.fold);
    b.addEventListener('click', () => UI.toggleDock());
    x.before(b);
  };

  /* ================= Corners docker ================= */
  const CR = () => {
    S.crType = S.crType || VP.defaults.cornerType || 'fillet';
    if (S.crR == null) S.crR = VP.defaults.cornerMM || 3;
    if (S.crA == null) S.crA = 12.7;
    if (S.crB == null) S.crB = 12.7;
    if (S.crLock == null) S.crLock = true;
    return S;
  };
  const PREV = {
    fillet: '<path d="M6 54V30a24 24 0 0124-24h24"/>',
    scallop: '<path d="M6 54V30a24 24 0 0024-24h24"/>',
    chamfer: '<path d="M6 54V30L30 6h24"/>'
  };
  const cornersPanel = () => {
    const c = CR();
    const t = c.crType;
    const radio = (k, l) => '<button class="btn k3-radio' + (t === k ? ' on' : '') + '" data-act="k3CrType:' + k + '" aria-pressed="' + (t === k) + '"><span class="k3-dot"></span>' + l + '</button>';
    let h = '<div class="k3-crtop"><div class="k3-col">' + radio('fillet', 'Yuvarlat') + radio('scallop', 'Oy') + radio('chamfer', 'Pah kır') + '</div>' +
      '<svg class="k3-prev" viewBox="0 0 60 60" aria-hidden="true"><path d="M6 54V6h48" stroke-dasharray="2 2" opacity=".35"/>' + PREV[t] + '</svg></div>';
    h += '<div class="row">' + fld('Yarıçap', 'k3CrR', VP.num(c.crR, 2), 'mm').replace('class="field"', 'class="field' + (t === 'chamfer' ? ' k3-dim' : '') + '"').replace('<input ', t === 'chamfer' ? '<input disabled ' : '<input ') + '</div>';
    if (t === 'chamfer') {
      h += '<p class="sec-note" style="margin:6px 0 2px">Pah mesafesi</p><div class="k3-ab"><div class="k3-col">' + fld('A', 'k3CrA', VP.num(c.crA, 2), 'mm') + fld('B', 'k3CrB', VP.num(c.crB, 2), 'mm') + '</div>' +
        ib('k3CrLock', ic(c.crLock ? 'lock' : 'unlock', 'sm'), c.crLock ? 'A ve B birlikte' : 'A ve B ayrı', c.crLock) + '</div>';
    }
    h += '<div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="k3CrApply"' + (hasSel() ? '' : ' disabled') + '>Uygula</button></div>';
    h += '<p class="sec-note k3-info">ⓘ Dikdörtgenler canlı kalır, köşeleri yeniden ayarlanabilir. Diğer şekiller eğriye dönüştürülür; tekrar Uygula derseniz yuvarlamadan önceki halleri üzerinden yeniden uygulanır.</p>';
    return h;
  };
  // corners can be applied again and again: rectangles stay live (type and size are simply replaced);
  // other curves remember their shape from before rounding and are rounded again from that shape
  const segsOf = (path) => path.segments.map((g) => [g.point.x, g.point.y, g.handleIn.x, g.handleIn.y, g.handleOut.x, g.handleOut.y]);
  const shapeOf = (it) => (it instanceof paper.CompoundPath ? it.children.map((c) => ({ s: segsOf(c), c: c.closed })) : [{ s: segsOf(it), c: it.closed }]);
  // a fingerprint that survives moving the object
  const printOf = (it) => {
    const sh = shapeOf(it);
    const o = sh[0] && sh[0].s[0] ? [sh[0].s[0][0], sh[0].s[0][1]] : [0, 0];
    let h = 0;
    sh.forEach((l) => l.s.forEach((g) => g.forEach((v, i) => {
      const x = Math.round((i === 0 ? v - o[0] : i === 1 ? v - o[1] : v) * 100);
      h = (h * 31 + x) | 0;
    })));
    return sh.reduce((n, l) => n + l.s.length, 0) + ':' + h;
  };
  const firstPt = (it) => {
    const sh = shapeOf(it);
    return sh[0] && sh[0].s[0] ? [sh[0].s[0][0], sh[0].s[0][1]] : [0, 0];
  };
  // back to the shape before rounding, shifted by however far the object moved since it was rounded
  const restoreShape = (it, src) => {
    const now = firstPt(it);
    const was = it.data.cornerAt || now;
    const dx = now[0] - was[0];
    const dy = now[1] - was[1];
    const mk = (l) => new paper.Path({ segments: l.s.map((g) => new paper.Segment(Pt(g[0] + dx, g[1] + dy), Pt(g[2], g[3]), Pt(g[4], g[5]))), closed: l.c, insert: false });
    if (it instanceof paper.CompoundPath) {
      it.removeChildren();
      src.forEach((l) => it.addChild(mk(l)));
    } else {
      it.segments = mk(src[0]).segments;
      it.closed = src[0].c;
    }
    it.data.cornerSrc = shapeOf(it);
  };
  const isRect = (it) => it.data && it.data.param && it.data.param.kind === 'rect' && !FXx(it);
  const FXx = (it) => VP.fx && VP.fx.isFx && VP.fx.isFx(it);
  K3.applyCorners = () => {
    const c = CR();
    if (!VP.objops || !VP.objops.corners) return;
    VP.defaults.cornerType = c.crType;
    const R = c.crType === 'chamfer' ? c.crA : c.crR;
    VP.defaults.cornerMM = R;
    const asym = c.crType === 'chamfer' && !c.crLock && Math.abs(c.crA - c.crB) > 1e-6;
    // live rectangles: only the corner type and size change
    const rects = asym ? [] : VP.sel.filter(isRect);
    rects.forEach((it) => {
      const p = it.data.param;
      if (c.crType === 'fillet') delete p.ct;
      else p.ct = c.crType;
      delete p.rs;
      delete p._rmax;
      p.r = Math.max(0, VP.toPT(R));
      VP.rebuildParam(it);
    });
    const others = VP.sel.filter((it) => !rects.includes(it) && VP.isPathItem(it) && !FXx(it));
    others.forEach((it) => {
      const src = it.data.cornerSrc;
      if (src && it.data.cornerPrint && it.data.cornerPrint === printOf(it)) restoreShape(it, src);
      else it.data.cornerSrc = shapeOf(it);
    });
    if (others.length) {
      const keep = VP.sel.slice();
      VP.sel = others;
      if (c.crType === 'chamfer') VP.objops.corners('chamfer', c.crA, c.crLock ? c.crA : c.crB);
      else VP.objops.corners(c.crType, c.crR);
      VP.sel = keep;
      others.forEach((it) => {
        if (!it.parent) return;
        it.data.cornerPrint = printOf(it);
        it.data.cornerAt = firstPt(it);
      });
    } else if (rects.length) VP.commit();
    if (rects.length) VP.toast(rects.length + ' dikdörtgenin köşeleri: ' + { fillet: 'yuvarlak', scallop: 'oyuk', chamfer: 'pah' }[c.crType] + ' ' + VP.num(R, 2) + ' mm');
    UI.schedule('dock', 'prop');
  };

  /* ================= Align and Distribute ================= */
  const AL = () => {
    if (!S.alignTo) S.alignTo = 'selection';
    if (!S.diTo) S.diTo = 'selection';
    if (!S.alText) S.alText = 'bbox';
    return S;
  };
  const lines = (t) => String(t.content || '').split(/\r\n|\r|\n/).length;
  const boxOf = (it, vertical) => {
    let b = S.alOutline ? it.strokeBounds : it.bounds;
    if (vertical && it instanceof paper.PointText && AL().alText !== 'bbox' && !it.rotation) {
      const lead = it.leading || it.fontSize * 1.2;
      const y = it.point.y + (S.alText === 'last' ? (lines(it) - 1) * lead : 0);
      b = new paper.Rectangle(b.left, y, b.width, 0);
    }
    return b;
  };
  const unionBox = (items, vertical) => items.reduce((acc, it) => (acc ? acc.unite(boxOf(it, vertical)) : boxOf(it, vertical).clone()), null);
  K3.align = (edge) => {
    const items = VP.sel.slice();
    if (!items.length) return VP.toast('Önce nesne seçin');
    const to = AL().alignTo;
    const vertical = edge === 't' || edge === 'cv' || edge === 'b';
    const page = VP.pageRect();
    let ref = null;
    let skip = null;
    if (to === 'page') ref = page;
    else if (to === 'center') ref = new paper.Rectangle(page.center, new paper.Size(0, 0));
    else if (to === 'point') ref = new paper.Rectangle(Pt(VP.toPT(S.alX || 0), VP.toPT(S.alY || 0)), new paper.Size(0, 0));
    else if (to === 'active') {
      if (items.length === 1) ref = page;
      else {
        skip = items[items.length - 1];
        ref = boxOf(skip, vertical);
      }
    } else if (to !== 'grid') ref = items.length === 1 ? page : unionBox(items, vertical);
    const g = VP.toPT(S.gridMM || 5);
    const snap = (v) => Math.round(v / g) * g;
    items.forEach((it) => {
      if (it === skip) return;
      const b = boxOf(it, vertical);
      let dx = 0;
      let dy = 0;
      if (to === 'grid') {
        if (edge === 'l') dx = snap(b.left) - b.left;
        if (edge === 'ch') dx = snap(b.center.x) - b.center.x;
        if (edge === 'r') dx = snap(b.right) - b.right;
        if (edge === 't') dy = snap(b.top) - b.top;
        if (edge === 'cv') dy = snap(b.center.y) - b.center.y;
        if (edge === 'b') dy = snap(b.bottom) - b.bottom;
      } else {
        if (edge === 'l') dx = ref.left - b.left;
        if (edge === 'ch') dx = ref.center.x - b.center.x;
        if (edge === 'r') dx = ref.right - b.right;
        if (edge === 't') dy = ref.top - b.top;
        if (edge === 'cv') dy = ref.center.y - b.center.y;
        if (edge === 'b') dy = ref.bottom - b.bottom;
      }
      if (dx || dy) VP.T.move([it], Pt(dx, dy));
    });
    VP.commit();
  };
  // the menu and the property bar use the same rules
  VP.align = K3.align;

  // mode: l, ch, sh, r (across) or t, cv, sv, b (down)
  K3.distribute = (mode) => {
    const items = VP.sel.slice();
    const to = AL().diTo;
    const need = to === 'selection' ? 3 : 2;
    if (items.length < need) return VP.toast('Dağıtmak için en az ' + need + ' nesne seçin');
    const h = ['l', 'ch', 'sh', 'r'].includes(mode);
    const kind = { l: 'lo', t: 'lo', ch: 'c', cv: 'c', r: 'hi', b: 'hi', sh: 'sp', sv: 'sp' }[mode];
    const box = (it) => boxOf(it, !h);
    const lo = (b) => (h ? b.left : b.top);
    const hi = (b) => (h ? b.right : b.bottom);
    const size = (b) => (h ? b.width : b.height);
    const val = (b) => (kind === 'lo' ? lo(b) : kind === 'hi' ? hi(b) : (lo(b) + hi(b)) / 2);
    items.sort((a, b) => (lo(box(a)) + hi(box(a))) / 2 - (lo(box(b)) + hi(box(b))) / 2);
    const bs = items.map(box);
    const n = items.length;
    const move = (it, d) => d && VP.T.move([it], h ? Pt(d, 0) : Pt(0, d));
    if (kind === 'sp') {
      let start;
      let gap;
      const sum = bs.reduce((s, b) => s + size(b), 0);
      if (to === 'spacing') {
        gap = VP.toPT((h ? S.diH : S.diV) || 0);
        start = lo(bs[0]);
      } else if (to === 'page') {
        const P = VP.pageRect();
        gap = ((h ? P.width : P.height) - sum) / (n - 1);
        start = h ? P.left : P.top;
      } else {
        gap = (hi(bs[n - 1]) - lo(bs[0]) - sum) / (n - 1);
        start = lo(bs[0]);
      }
      let pos = start;
      items.forEach((it, i) => {
        move(it, pos - lo(bs[i]));
        pos += size(bs[i]) + gap;
      });
    } else {
      let a;
      let z;
      if (to === 'spacing') {
        const d = VP.toPT((h ? S.diH : S.diV) || 0);
        a = val(bs[0]);
        items.forEach((it, i) => move(it, a + d * i - val(bs[i])));
        return VP.commit();
      }
      if (to === 'page') {
        const P = VP.pageRect();
        const pl = h ? P.left : P.top;
        const ph = h ? P.right : P.bottom;
        const f = bs[0];
        const l = bs[n - 1];
        a = kind === 'lo' ? pl : kind === 'hi' ? pl + size(f) : pl + size(f) / 2;
        z = kind === 'lo' ? ph - size(l) : kind === 'hi' ? ph : ph - size(l) / 2;
      } else {
        a = val(bs[0]);
        z = val(bs[n - 1]);
      }
      const step = (z - a) / (n - 1);
      items.forEach((it, i) => move(it, a + step * i - val(bs[i])));
    }
    VP.commit();
  };
  // whole pixels at 96 pixels per inch (0.75 pt)
  K3.pixelGrid = () => {
    if (!VP.sel.length) return VP.toast('Önce nesne seçin');
    const px = 0.75;
    const r = (v) => Math.round(v / px) * px;
    VP.sel.forEach((it) => {
      const b = it.bounds;
      if (b.width > 0 && b.height > 0) {
        const w = Math.max(px, r(b.width));
        const hh = Math.max(px, r(b.height));
        if (Math.abs(w - b.width) > 1e-6 || Math.abs(hh - b.height) > 1e-6) VP.T.scale([it], w / b.width, hh / b.height, b.topLeft);
      }
      const b2 = it.bounds;
      VP.T.move([it], Pt(r(b2.left) - b2.left, r(b2.top) - b2.top));
    });
    VP.commit();
    VP.toast('Piksel ızgarasına hizalandı');
  };
  const alignPanel = () => {
    const s = AL();
    const n = VP.sel.length;
    let h = '<div class="k3-row">' +
      [['l', 'alignL', 'Sola hizala'], ['ch', 'alignCH', 'Yatay ortala'], ['r', 'alignR', 'Sağa hizala']].map(([k, i, l]) => ib('k3Al:' + k, ic(i, 'sm'), l, null, !n)).join('') +
      '<span class="k3-gap"></span>' +
      [['t', 'alignT', 'Üste hizala'], ['cv', 'alignCV', 'Dikey ortala'], ['b', 'alignB', 'Alta hizala']].map(([k, i, l]) => ib('k3Al:' + k, ic(i, 'sm'), l, null, !n)).join('') + '</div>';
    h += '<div class="k3-row"><span class="k3-lab">Şuna hizala:</span>' +
      [['selection', 'toSel', 'Seçim alanı'], ['active', 'toActive', 'Etkin nesne (son seçilen)'], ['page', 'toPage', 'Sayfa kenarı'], ['center', 'toCenter', 'Sayfa ortası'], ['grid', 'toGrid', 'Izgara'], ['point', 'toPoint', 'Belirtilen nokta']]
        .map(([k, i, l]) => ib('k3AlTo:' + k, svg(I[i]), l, s.alignTo === k)).join('') + '</div>';
    if (s.alignTo === 'point') h += '<div class="k3-col k3-ind">' + fld('X', 'k3AlX', VP.num(s.alX || 0, 3), 'mm') + fld('Y', 'k3AlY', VP.num(s.alY || 0, 3), 'mm') + '</div>';
    let d = '<div class="k3-row">' +
      [['l', 'dL', 'Sol kenarları dağıt'], ['ch', 'dC', 'Yatay merkezleri dağıt'], ['sh', 'dS', 'Yatay aralığı eşitle'], ['r', 'dR', 'Sağ kenarları dağıt']].map(([k, i, l]) => ib('k3Di:' + k, svg(I[i]), l)).join('') +
      '<span class="k3-gap"></span>' +
      [['t', 'dL', 'Üst kenarları dağıt'], ['cv', 'dC', 'Dikey merkezleri dağıt'], ['sv', 'dS', 'Dikey aralığı eşitle'], ['b', 'dR', 'Alt kenarları dağıt']].map(([k, i, l]) => ib('k3Di:' + k, svg(rot(I[i])), l)).join('') + '</div>';
    d += '<div class="k3-row"><span class="k3-lab">Şuna dağıt:</span>' +
      [['selection', 'toExtent', 'Seçim alanı'], ['page', 'toPageW', 'Sayfa alanı'], ['spacing', 'toSpace', 'Belirtilen aralık']].map(([k, i, l]) => ib('k3DiTo:' + k, svg(I[i]), l, s.diTo === k)).join('') + '</div>';
    if (s.diTo === 'spacing') d += '<div class="k3-col k3-ind">' + fld('Y', 'k3DiH', VP.num(s.diH || 5, 3), 'mm') + fld('D', 'k3DiV', VP.num(s.diV || 5, 3), 'mm') + '</div>';
    const t = '<div class="k3-row">' + [['first', 'txFirst', 'İlk satır tabanına göre'], ['last', 'txLast', 'Son satır tabanına göre'], ['bbox', 'txBox', 'Sınır kutusuna göre']].map(([k, i, l]) => ib('k3AlText:' + k, svg(I[i]), l, s.alText === k)).join('') + '</div>';
    return sec('Hizala', h) + sec('Dağıt', d) + sec('Metin', t) +
      '<div class="sec k3-sec">' + check('k3AlOutline', !!s.alOutline, 'Nesne anahattını kullan') + '</div>' +
      '<div class="row"><button class="btn" style="width:100%;justify-content:center" data-act="k3PixGrid"' + (n ? '' : ' disabled') + '>Piksel ızgarasına hizala</button></div>';
  };

  /* ================= Transform ================= */
  const TR = (VP.k3.tr = { tab: 'pos', rel: true, x: 0, y: 0, ang: 0, sx: 100, sy: 100, prop: true, mh: false, mv: false, w: null, hh: null, kx: 0, ky: 0, n: 0 });
  const ANCHORS = ['tl', 'tc', 'tr', 'ml', 'cc', 'mr', 'bl', 'bc', 'br'];
  const anchorOf = (b, a) => {
    const m = { tl: b.topLeft, tc: b.topCenter, tr: b.topRight, ml: b.leftCenter, cc: b.center, mr: b.rightCenter, bl: b.bottomLeft, bc: b.bottomCenter, br: b.bottomRight };
    return m[a] || b.center;
  };
  const anc = () => S.trAnc || 'cc';
  const anchorGrid = () => '<div class="k3-anc" role="group" aria-label="Referans noktası">' + ANCHORS.map((a) => '<button class="' + (a === anc() ? 'on' : '') + '" data-act="k3Anc:' + a + '" aria-label="Referans: ' + a + '" aria-pressed="' + (a === anc()) + '"></button>').join('') + '</div>';
  const transformPanel = () => {
    const b = hasSel() ? VP.selBounds() : null;
    const tabs = [['pos', 'tPos', 'Konum'], ['rot', 'tRot', 'Döndür'], ['scale', 'tScale', 'Ölçek ve yansıt'], ['size', 'tSize', 'Boyut'], ['skew', 'tSkew', 'Eğ']];
    let h = '<div class="k3-row k3-tabs">' + tabs.map(([k, i, l]) => ib('k3Tab:' + k, svg(I[i]), l, TR.tab === k)).join('') + '</div>';
    const name = tabs.find((t) => t[0] === TR.tab)[2];
    let body = '';
    if (TR.tab === 'pos') {
      let x = TR.x;
      let y = TR.y;
      if (!TR.rel && b) {
        const p = anchorOf(b, anc());
        x = VP.toMM(p.x);
        y = VP.toMM(p.y);
      }
      body = '<div class="k3-xf">' + anchorGrid() + '<div class="k3-col">' + fld('X', 'k3TrX', VP.num(x, 3), 'mm') + fld('Y', 'k3TrY', VP.num(y, 3), 'mm') + '</div></div>' + check('k3TrRel', TR.rel, 'Göreli konum');
    } else if (TR.tab === 'rot') {
      body = '<div class="k3-xf">' + anchorGrid() + '<div class="k3-col">' + fld('Açı', 'k3TrAng', VP.num(TR.ang, 2), '°') + '</div></div>';
    } else if (TR.tab === 'scale') {
      body = '<div class="k3-xf">' + anchorGrid() + '<div class="k3-col">' + fld('Y', 'k3TrSx', VP.num(TR.sx, 2), '%') + fld('D', 'k3TrSy', VP.num(TR.prop ? TR.sx : TR.sy, 2), '%') + '</div>' +
        '<div class="k3-col">' + ib('k3TrMh', ic('flipH', 'sm'), 'Yatay ayna', TR.mh) + ib('k3TrMv', ic('flipV', 'sm'), 'Dikey ayna', TR.mv) + '</div></div>' + check('k3TrProp', TR.prop, 'Orantılı');
    } else if (TR.tab === 'size') {
      const w = TR.w != null ? TR.w : b ? VP.toMM(b.width) : 0;
      const hh = TR.hh != null ? TR.hh : b ? VP.toMM(b.height) : 0;
      body = '<div class="k3-xf">' + anchorGrid() + '<div class="k3-col">' + fld('En', 'k3TrW', VP.num(w, 3), 'mm') + fld('Boy', 'k3TrH', VP.num(hh, 3), 'mm') + '</div></div>' + check('k3TrProp', TR.prop, 'Orantılı');
    } else {
      body = '<div class="k3-xf">' + anchorGrid() + '<div class="k3-col">' + fld('X', 'k3TrKx', VP.num(TR.kx, 2), '°') + fld('Y', 'k3TrKy', VP.num(TR.ky, 2), '°') + '</div></div>';
    }
    h += sec(name, body + '<div class="row">' + fld('Kopya', 'k3TrN', String(TR.n), '', 40) + '</div>' +
      '<div class="row" style="justify-content:center"><button class="btn primary" data-act="k3TrApply"' + (b ? '' : ' disabled') + '>Uygula</button></div>');
    return h;
  };
  K3.applyTransform = () => {
    if (!hasSel()) return;
    const a = anc();
    const one = (items) => {
      const b = VP.selBounds(items);
      const p = anchorOf(b, a);
      if (TR.tab === 'pos') {
        if (TR.rel) VP.T.move(items, Pt(VP.toPT(TR.x), VP.toPT(TR.y)));
        else VP.T.move(items, Pt(VP.toPT(TR.x) - p.x, VP.toPT(TR.y) - p.y));
      } else if (TR.tab === 'rot') {
        if (TR.ang) VP.T.rotate(items, TR.ang, a === 'cc' && VP.pivot && items === VP.sel ? VP.pivot : p);
      } else if (TR.tab === 'scale') {
        const sx = (TR.sx / 100) * (TR.mh ? -1 : 1);
        const sy = ((TR.prop ? TR.sx : TR.sy) / 100) * (TR.mv ? -1 : 1);
        if (sx && sy) VP.T.scale(items, sx, sy, p);
      } else if (TR.tab === 'size') {
        const w = TR.w != null ? VP.toPT(TR.w) : b.width;
        let hh = TR.hh != null ? VP.toPT(TR.hh) : b.height;
        if (TR.prop && TR.w != null && TR.hh == null) hh = (b.height * w) / b.width;
        if (w > 0 && hh > 0 && b.width > 0 && b.height > 0) VP.T.scale(items, w / b.width, hh / b.height, p);
      } else if (TR.kx || TR.ky) VP.T.skew(items, Math.max(-80, Math.min(80, TR.kx)), Math.max(-80, Math.min(80, TR.ky)), p);
    };
    const n = Math.max(0, Math.min(500, Math.round(TR.n || 0)));
    if (!n) one(VP.sel);
    else {
      let cur = VP.sel.slice();
      for (let i = 0; i < n; i++) {
        const dup = VP.zSort(cur).map((it) => {
          const c = VP.cloneItem(it);
          c.insertAbove(it);
          return c;
        });
        one(dup);
        cur = dup;
      }
      VP.setSelection(cur);
    }
    VP.commit();
    if (TR.tab === 'size') TR.w = TR.hh = null;
  };

  /* ================= fields and buttons ================= */
  const num = (raw, d) => {
    const v = VP.parseNum(raw);
    return isFinite(v) ? v : d;
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, raw, el) => {
    if (!/^k3[A-Z]/.test(n)) return pf0(n, raw, el);
    const c = CR();
    switch (n) {
      case 'k3CrR': c.crR = Math.max(0, num(raw, c.crR)); break;
      case 'k3CrA': c.crA = Math.max(0, num(raw, c.crA)); if (c.crLock) c.crB = c.crA; break;
      case 'k3CrB': c.crB = Math.max(0, num(raw, c.crB)); if (c.crLock) c.crA = c.crB; break;
      case 'k3AlX': S.alX = num(raw, S.alX || 0); break;
      case 'k3AlY': S.alY = num(raw, S.alY || 0); break;
      case 'k3DiH': S.diH = num(raw, S.diH || 0); break;
      case 'k3DiV': S.diV = num(raw, S.diV || 0); break;
      case 'k3TrX': TR.x = num(raw, TR.x); break;
      case 'k3TrY': TR.y = num(raw, TR.y); break;
      case 'k3TrAng': TR.ang = num(raw, TR.ang); break;
      case 'k3TrSx': TR.sx = num(raw, TR.sx); if (TR.prop) TR.sy = TR.sx; break;
      case 'k3TrSy': TR.sy = num(raw, TR.sy); if (TR.prop) TR.sx = TR.sy; break;
      case 'k3TrW': TR.w = Math.max(0, num(raw, 0)); if (TR.prop) TR.hh = null; break;
      case 'k3TrH': {
        TR.hh = Math.max(0, num(raw, 0));
        if (TR.prop && hasSel()) {
          const b = VP.selBounds();
          TR.w = b.height > 0 ? (VP.toMM(b.width) * TR.hh) / VP.toMM(b.height) : TR.w;
        }
        break;
      }
      case 'k3TrKx': TR.kx = num(raw, TR.kx); break;
      case 'k3TrKy': TR.ky = num(raw, TR.ky); break;
      case 'k3TrN': TR.n = Math.max(0, Math.round(num(raw, TR.n))); break;
      default: break;
    }
    return true;
  };
  const act = (id) => {
    const [k, arg] = id.split(':');
    const c = CR();
    switch (k) {
      case 'k3CrType': c.crType = arg; break;
      case 'k3CrLock': c.crLock = !c.crLock; if (c.crLock) c.crB = c.crA; break;
      case 'k3CrApply': K3.applyCorners(); break;
      case 'k3Al': K3.align(arg); break;
      case 'k3AlTo': S.alignTo = arg; break;
      case 'k3Di': K3.distribute(arg); break;
      case 'k3DiTo': S.diTo = arg; break;
      case 'k3AlText': S.alText = arg; break;
      case 'k3AlOutline': S.alOutline = !S.alOutline; break;
      case 'k3PixGrid': K3.pixelGrid(); break;
      case 'k3Tab': TR.tab = arg; break;
      case 'k3Anc': {
        S.trAnc = arg;
        // Position with relative position: the side picked moves the object by its own width or height,
        // so copies line up next to each other
        if (TR.tab === 'pos' && TR.rel && hasSel()) {
          const b = VP.selBounds();
          const fx = { l: -1, c: 0, r: 1 }[{ tl: 'l', ml: 'l', bl: 'l', tc: 'c', cc: 'c', bc: 'c', tr: 'r', mr: 'r', br: 'r' }[arg]];
          const fy = { t: -1, m: 0, b: 1 }[{ tl: 't', tc: 't', tr: 't', ml: 'm', cc: 'm', mr: 'm', bl: 'b', bc: 'b', br: 'b' }[arg]];
          TR.x = Math.round(VP.toMM(b.width) * fx * 1000) / 1000;
          TR.y = Math.round(VP.toMM(b.height) * fy * 1000) / 1000;
        }
        break;
      }
      case 'k3TrRel': TR.rel = !TR.rel; TR.x = TR.y = 0; break;
      case 'k3TrProp': TR.prop = !TR.prop; break;
      case 'k3TrMh': TR.mh = !TR.mh; break;
      case 'k3TrMv': TR.mv = !TR.mv; break;
      case 'k3TrApply': K3.applyTransform(); break;
      default: return false;
    }
    try {
      VP.io.savePrefs();
    } catch (e) { /* optional */ }
    redraw();
    return true;
  };
  const da0 = UI.dockAct;
  UI.dockAct = function (id, el) {
    if (/^k3[A-Z]/.test(id) && act(id)) return;
    return da0.apply(this, arguments);
  };
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^k3[A-Z]/.test(id) ? act(id) : act0(id, el));

  UI.panels = UI.panels || {};
  UI.panels.corners = cornersPanel;
  UI.panels.align = alignPanel;
  UI.panels.transform = transformPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'corners')) {
    const at = UI.DOCKERS.findIndex(([k]) => k === 'align');
    UI.DOCKERS.splice(at < 0 ? UI.DOCKERS.length : at, 0, ['corners', 'Köşeler']);
  }
  A.dockCorners = { label: 'Köşeler', icon: 'cornerTool', run: () => UI.openDock('corners'), checked: () => !$('#dock').hidden && UI.dockTab === 'corners' };

  /* ================= look ================= */
  const css = document.createElement('style');
  css.textContent = [
    '.k3-row{display:flex;flex-wrap:wrap;align-items:center;gap:2px;margin:4px 0}',
    '#dock-body .k3-row .btn.icon-only{width:25px!important;min-width:0!important;height:25px;padding:0!important;justify-content:center}','#dock-body .k3-row{gap:1px}',
    '.k3-row .btn.icon-only svg.i.sm{width:17px;height:17px}',
    '.k3-gap{width:5px}',
    '.k3-lab{font-size:11px;color:var(--muted);margin-right:2px;min-width:60px}',
    '.k3-col{display:flex;flex-direction:column;gap:3px}',
    '.k3-ind{margin:2px 0 6px 62px}',
    '.k3-ind .field input,.k3-xf .field input{width:70px}',
    '.btn.k3-check{background:none;border:0;padding:2px 0;gap:6px;height:auto;min-height:22px;font-size:11.5px}',
    '.k3-box{display:inline-grid;place-items:center;width:13px;height:13px;border:1px solid var(--muted);border-radius:2px;font-size:10px;line-height:1;color:var(--fg)}',
    '.btn.k3-check.on{background:none;color:var(--fg)}',
    '.btn.k3-radio{background:none;border:0;padding:2px 0;gap:6px;height:auto;min-height:22px;justify-content:flex-start;font-size:11.5px}',
    '.btn.k3-radio.on{background:none;color:var(--fg)}',
    '.k3-dot{width:11px;height:11px;border-radius:50%;border:1px solid var(--muted);display:inline-block;box-sizing:border-box}',
    '.k3-radio.on .k3-dot{border:3.5px solid var(--accent)}',
    '.k3-crtop{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin:4px 0 8px}',
    '.k3-prev{width:54px;height:54px;flex:none;background:#fff;border:1px solid var(--line);fill:none;stroke:#e0342b;stroke-width:2.2}',
    '.k3-ab{display:flex;align-items:center;gap:6px;margin-left:24px}',
    '.k3-info{margin-top:12px}',
    '.k3-xf{display:flex;align-items:center;gap:10px;margin:6px 0}',
    '.k3-anc{display:grid;grid-template-columns:repeat(3,11px);grid-template-rows:repeat(3,11px);gap:3px;flex:none}',
    '.k3-anc button{width:11px;height:11px;padding:0;border:1px solid var(--muted);background:transparent;border-radius:1px;min-height:0}',
    '.k3-anc button.on{background:var(--accent);border-color:var(--accent)}',
    '.k3-tabs{border-bottom:1px solid var(--line);padding-bottom:4px}',
    '#btn-dock-fold svg.i{width:14px;height:14px}',
    '#dock .btn.k3-check,#dock .btn.k3-radio,#dock .btn.k3-check.on,#dock .btn.k3-radio.on{background:transparent!important;box-shadow:none!important;border:0!important;color:var(--fg)}',
    '#dock .field.k3-dim{opacity:.45}',
    '@media (pointer:coarse){#dock-body .k3-row .btn.icon-only{width:30px!important;height:32px}.k3-anc{grid-template-columns:repeat(3,18px);grid-template-rows:repeat(3,18px);gap:4px}.k3-anc button{width:18px;height:18px}.btn.k3-check,.btn.k3-radio{min-height:32px}}'
  ].join('\n');
  document.head.appendChild(css);

  const start = () => {
    addFold();
    // the Corners docker joins the tabs once, as in the desktop program's default workspace
    if (!S.k3Corners27) {
      S.k3Corners27 = true;
      if (Array.isArray(S.dockOpen) && !S.dockOpen.includes('corners')) {
        const i = S.dockOpen.indexOf('align');
        S.dockOpen.splice(i < 0 ? S.dockOpen.length : i, 0, 'corners');
      }
      try {
        VP.io.savePrefs();
      } catch (e) { /* optional */ }
    }
    const W = UI.MENUS.window;
    if (W) {
      const i = W.findIndex((x) => typeof x === 'string' && x.startsWith('sub:Paneller|'));
      if (i >= 0 && !W[i].includes('dockT_corners')) W[i] = W[i].replace('dockT_align', 'dockT_corners,dockT_align');
    }
    if (VP.actions.dockT_corners == null && VP.actions.dockT_align) {
      VP.actions.dockT_corners = { label: 'Köşeler', run: () => UI.openDock('corners'), checked: () => (S.dockOpen || []).includes('corners') };
    }
    UI.renderDock(true);
  };
  if (document.readyState === 'complete') setTimeout(start, 30);
  else addEventListener('load', () => setTimeout(start, 30));
})();
