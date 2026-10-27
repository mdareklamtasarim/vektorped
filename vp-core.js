/* VektörPad core: document model, pages, layers, history, selection, transforms, shaping. */
(function () {
  'use strict';
  const VP = (window.VP = window.VP || {});
  const MM = (VP.MM = 72 / 25.4); // points per millimetre

  /* ---------- small helpers ---------- */
  VP.toMM = (pt) => pt / MM;
  VP.toPT = (mm) => mm * MM;
  VP.num = (v, d = 2) => {
    if (!isFinite(v)) return '';
    const f = Math.pow(10, d);
    return String(Math.round(v * f) / f).replace('.', ',');
  };
  VP.parseNum = (s) => {
    if (typeof s === 'number') return s;
    // iPad keyboards may type a typographic minus or dash instead of "-"
    const n = parseFloat(String(s).replace(/[−‒–—﹣－]/g, '-').replace(',', '.').replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : NaN;
  };
  VP.uid = () => Math.random().toString(36).slice(2, 9);
  VP.norm = (a) => {
    let x = a % 360;
    if (x > 180) x -= 360;
    if (x <= -180) x += 360;
    return Math.abs(x) < 1e-9 ? 0 : x;
  };
  VP.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const handlers = {};
  VP.on = (evt, fn) => (handlers[evt] = handlers[evt] || []).push(fn);
  VP.emit = (evt, arg) => (handlers[evt] || []).forEach((fn) => fn(arg));
  VP.toast = (msg) => console.log('[VP]', msg); // replaced by the UI

  /* ---------- constants ---------- */
  VP.PAGE_PRESETS = [
    { id: 'A4', label: 'A4', w: 210, h: 297 },
    { id: 'A3', label: 'A3', w: 297, h: 420 },
    { id: 'A5', label: 'A5', w: 148, h: 210 },
    { id: 'Letter', label: 'Letter', w: 215.9, h: 279.4 },
    { id: 'Kartvizit', label: 'Kartvizit 85×55', w: 85, h: 55 },
    { id: 'Kare', label: 'Kare 200×200', w: 200, h: 200 },
    { id: 'Afis', label: 'Afiş 50×70 cm', w: 500, h: 700 }
  ];
  VP.FONTS = ['Fira Sans', 'Fira Mono', 'Bricolage Grotesque', 'Playfair Display', 'Oswald', 'Caveat', 'Georgia', 'Times New Roman', 'Arial', 'Courier New'];
  VP.DASHES = { solid: null, dash: [6, 3], dot: [0.01, 2.5], dashdot: [6, 3, 0.01, 3], long: [14, 5] };
  VP.DASH_LABELS = [['solid', 'Düz'], ['dash', 'Kesik'], ['dot', 'Noktalı'], ['dashdot', 'Kesik-nokta'], ['long', 'Uzun kesik']];
  VP.BLENDS = [
    ['normal', 'Normal'], ['multiply', 'Çarp'], ['screen', 'Ekran'], ['overlay', 'Kaplama'],
    ['darken', 'Koyulaştır'], ['lighten', 'Açıklaştır'], ['color-dodge', 'Renk soldur'], ['color-burn', 'Renk yak'],
    ['hard-light', 'Sert ışık'], ['soft-light', 'Yumuşak ışık'], ['difference', 'Fark'], ['exclusion', 'Dışlama'],
    ['hue', 'Ton'], ['saturation', 'Doygunluk'], ['color', 'Renk'], ['luminosity', 'Parlaklık']
  ];

  VP.settings = { grid: false, snap: false, gridMM: 5, rulers: true, pencilOnly: false, keepRatio: true, alignTo: 'selection', multi: false };
  VP.defaults = {
    fill: null, stroke: '#1d1d1b', strokeWidth: 0.75, dash: 'solid', cap: 'round', join: 'round',
    fontFamily: 'Fira Sans', fontSize: 24, bold: false, italic: false, justification: 'left',
    brushWidth: 3, pressure: true, smoothing: 4,
    rectRadius: 0, polySides: 5, polyStar: false, polyInner: 0.45, spiralTurns: 3,
    fromCenter: false, equal: false
  };

  /* ---------- document ---------- */
  VP.newPage = (n, wmm = 210, hmm = 297) => ({ id: VP.uid(), name: 'Sayfa ' + n, w: VP.toPT(wmm), h: VP.toPT(hmm), layers: [], activeLayer: 0, thumb: null });
  // ext: document-wide data of other modules (styles, symbols, master layers, comments)
  VP.newDoc = (name) => ({ name: name || 'Adsız çizim', active: 0, pages: [VP.newPage(1)], ext: {} });
  VP.ext = () => (VP.doc.ext = VP.doc.ext || {});
  VP.page = () => VP.doc.pages[VP.doc.active];

  /* ---------- layers ---------- */
  VP.isSys = (l) => !!(l && l.data && l.data.sys);
  VP.userLayers = () => paper.project.layers.filter((l) => !VP.isSys(l));
  VP.activeLayer = null;
  VP.keepSysOrder = () => {
    if (VP.bgLayer) VP.bgLayer.sendToBack();
    if (VP.guideLayer) VP.guideLayer.bringToFront();
    if (VP.uiLayer) VP.uiLayer.bringToFront();
  };
  VP.ensureLayer = () => {
    let ls = VP.userLayers();
    if (!ls.length) {
      const L = new paper.Layer({ name: 'Katman 1', insert: false });
      paper.project.addLayer(L);
      VP.keepSysOrder();
      ls = [L];
    }
    if (!VP.activeLayer || !VP.activeLayer.parent && !paper.project.layers.includes(VP.activeLayer) || VP.isSys(VP.activeLayer)) {
      VP.activeLayer = ls[ls.length - 1];
    }
    if (!paper.project.layers.includes(VP.activeLayer)) VP.activeLayer = ls[ls.length - 1];
    VP.activeLayer.activate();
    return VP.activeLayer;
  };
  VP.setActiveLayer = (layer) => {
    VP.activeLayer = layer;
    if (layer) layer.activate();
    VP.emit('layers');
  };
  VP.addLayer = () => {
    const ls = VP.userLayers();
    const L = new paper.Layer({ name: 'Katman ' + (ls.length + 1), insert: false });
    const idx = VP.activeLayer ? paper.project.layers.indexOf(VP.activeLayer) + 1 : paper.project.layers.length;
    paper.project.insertLayer(idx, L);
    VP.keepSysOrder();
    VP.setActiveLayer(L);
    VP.commit();
  };
  VP.deleteLayer = (L) => {
    const ls = VP.userLayers();
    if (ls.length <= 1) return VP.toast('Sayfada en az bir katman kalmalı');
    const i = ls.indexOf(L);
    VP.sel = VP.sel.filter((it) => it.layer !== L);
    L.remove();
    const rest = VP.userLayers();
    VP.setActiveLayer(rest[Math.max(0, Math.min(i - 1, rest.length - 1))]);
    VP.commit();
  };
  VP.moveLayer = (L, dir) => {
    const ls = VP.userLayers();
    const i = ls.indexOf(L);
    const j = i + dir;
    if (j < 0 || j >= ls.length) return;
    if (dir > 0) L.insertAbove(ls[j]);
    else L.insertBelow(ls[j]);
    VP.keepSysOrder();
    VP.commit();
  };

  /* ---------- pages ---------- */
  VP.storePage = () => {
    const p = VP.page();
    const ls = VP.userLayers();
    p.layers = ls.map((l) => l.exportJSON({ asString: true, precision: 4 }));
    p.activeLayer = Math.max(0, ls.indexOf(VP.activeLayer));
  };
  VP.loadPage = (i, opts = {}) => {
    VP.sel = [];
    VP.handleMode = 'scale';
    VP.doc.active = VP.clamp(i, 0, VP.doc.pages.length - 1);
    VP.userLayers().forEach((l) => l.remove());
    const p = VP.page();
    const created = [];
    if (!p.layers || !p.layers.length) {
      const L = new paper.Layer({ name: 'Katman 1', insert: false });
      paper.project.addLayer(L);
      created.push(L);
    } else {
      p.layers.forEach((json) => {
        const L = new paper.Layer({ insert: false });
        L.importJSON(json);
        paper.project.addLayer(L);
        created.push(L);
      });
    }
    VP.keepSysOrder();
    VP.activeLayer = created[Math.min(p.activeLayer || 0, created.length - 1)] || created[created.length - 1];
    VP.activeLayer.activate();
    VP.drawPage();
    if (!opts.keepView) VP.fitPage();
    VP.drawOverlay();
    VP.emit('page');
    VP.emit('selection');
  };
  VP.gotoPage = (i) => {
    if (i === VP.doc.active || i < 0 || i >= VP.doc.pages.length) return;
    VP.storePage();
    VP.makeThumb();
    VP.loadPage(i);
    VP.dirty();
  };
  VP.addPage = () => {
    VP.storePage();
    VP.makeThumb();
    const cur = VP.page();
    const p = VP.newPage(VP.doc.pages.length + 1, VP.toMM(cur.w), VP.toMM(cur.h));
    VP.doc.pages.splice(VP.doc.active + 1, 0, p);
    VP.loadPage(VP.doc.active + 1);
    VP.commit();
  };
  VP.duplicatePage = (i = VP.doc.active) => {
    VP.storePage();
    const src = VP.doc.pages[i];
    const copy = Object.assign({}, src, { id: VP.uid(), name: src.name + ' (kopya)', layers: src.layers.slice() });
    VP.doc.pages.splice(i + 1, 0, copy);
    VP.loadPage(i + 1);
    VP.commit();
  };
  VP.deletePage = (i = VP.doc.active) => {
    if (VP.doc.pages.length <= 1) return VP.toast('Belgede en az bir sayfa kalmalı');
    VP.storePage();
    VP.doc.pages.splice(i, 1);
    VP.loadPage(Math.min(i, VP.doc.pages.length - 1));
    VP.commit();
  };
  VP.movePage = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= VP.doc.pages.length) return;
    VP.storePage();
    const arr = VP.doc.pages;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    if (VP.doc.active === i) VP.doc.active = j;
    else if (VP.doc.active === j) VP.doc.active = i;
    VP.commit();
    VP.emit('page');
  };
  VP.setPageSize = (wmm, hmm) => {
    if (!(wmm > 1 && hmm > 1)) return;
    const p = VP.page();
    p.w = VP.toPT(wmm);
    p.h = VP.toPT(hmm);
    VP.drawPage();
    VP.fitPage();
    VP.commit();
    VP.emit('page');
  };

  /* ---------- page background, grid ---------- */
  VP.drawPage = () => {
    const L = VP.bgLayer;
    if (!L) return;
    L.removeChildren();
    const p = VP.page();
    const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(0, 0, p.w, p.h), insert: false });
    r.fillColor = p.bg || '#ffffff';
    r.shadowColor = new paper.Color(0, 0, 0, 0.26);
    r.shadowBlur = 14;
    r.shadowOffset = new paper.Point(0, 3);
    L.addChild(r);
    VP.drawGrid();
  };
  VP.drawGrid = () => {
    const L = VP.bgLayer;
    if (!L) return;
    const old = L.children.find((c) => c.name === 'grid');
    if (old) old.remove();
    if (!VP.settings.grid) return;
    const p = VP.page();
    const z = paper.view.zoom;
    let g = VP.toPT(VP.settings.gridMM || 5);
    let step = 1;
    while (g * step * z < 7) step *= 2;
    const gs = g * step;
    const grp = new paper.Group({ name: 'grid', insert: false });
    const c1 = new paper.Color(VP.colors.accent || '#1461b2');
    c1.alpha = 0.16;
    const c2 = new paper.Color(VP.colors.accent || '#1461b2');
    c2.alpha = 0.32;
    let n = 0;
    for (let x = 0; x <= p.w + 0.01; x += gs, n++) {
      grp.addChild(new paper.Path.Line({ from: [x, 0], to: [x, p.h], strokeColor: n % 5 === 0 ? c2 : c1, strokeWidth: 1 / z, insert: false }));
    }
    n = 0;
    for (let y = 0; y <= p.h + 0.01; y += gs, n++) {
      grp.addChild(new paper.Path.Line({ from: [0, y], to: [p.w, y], strokeColor: n % 5 === 0 ? c2 : c1, strokeWidth: 1 / z, insert: false }));
    }
    L.addChild(grp);
  };
  VP.snapPt = (pt) => {
    if (!VP.settings.snap) return pt;
    const g = VP.toPT(VP.settings.gridMM || 5);
    return new paper.Point(Math.round(pt.x / g) * g, Math.round(pt.y / g) * g);
  };

  /* ---------- view ---------- */
  VP.ZMIN = 0.05;
  VP.ZMAX = 64;
  VP.viewChanged = () => {
    if (VP._vcRaf) return;
    VP._vcRaf = requestAnimationFrame(() => {
      VP._vcRaf = 0;
      if (VP.settings.grid) VP.drawGrid();
      VP.drawOverlay();
      VP.emit('view');
    });
  };
  VP.fitPage = () => {
    const v = paper.view;
    const p = VP.page();
    const vs = v.viewSize;
    if (!vs.width || !vs.height) return;
    const pad = Math.min(48, Math.min(vs.width, vs.height) * 0.08);
    const z = Math.min((vs.width - pad * 2) / p.w, (vs.height - pad * 2) / p.h);
    v.zoom = VP.clamp(z, VP.ZMIN, VP.ZMAX);
    v.center = new paper.Point(p.w / 2, p.h / 2);
    VP.viewTouched = false;
    VP.viewChanged();
  };
  VP.zoomAt = (factor, viewPt) => {
    const v = paper.view;
    VP.viewTouched = true;
    const nz = VP.clamp(v.zoom * factor, VP.ZMIN, VP.ZMAX);
    factor = nz / v.zoom;
    if (Math.abs(factor - 1) < 1e-6) return;
    const center = viewPt ? v.viewToProject(viewPt) : v.center;
    v.scale(factor, center);
    VP.viewChanged();
  };
  VP.setZoom = (z) => VP.zoomAt(z / paper.view.zoom, null);
  VP.panBy = (dxView, dyView) => {
    const v = paper.view;
    if (dxView || dyView) VP.viewTouched = true;
    v.translate(new paper.Point(dxView / v.zoom, dyView / v.zoom));
    VP.viewChanged();
  };
  VP.zoomToRect = (rect) => {
    const v = paper.view;
    const vs = v.viewSize;
    if (rect.width < 1 || rect.height < 1) return;
    v.zoom = VP.clamp(Math.min(vs.width / rect.width, vs.height / rect.height) * 0.9, VP.ZMIN, VP.ZMAX);
    v.center = rect.center;
    VP.viewTouched = true;
    VP.viewChanged();
  };

  /* ---------- selection ---------- */
  VP.sel = [];
  VP.handleMode = 'scale';
  VP.isSelectable = (it) => {
    let x = it;
    while (x) {
      if (x === VP.uiLayer || x === VP.bgLayer || (x instanceof paper.Layer && VP.isSys(x))) return false;
      if (x.visible === false) return false;
      if (x.locked) return false;
      x = x.parent;
    }
    return true;
  };
  VP.topLevel = (it) => {
    while (it && it.parent && !(it.parent instanceof paper.Layer)) it = it.parent;
    return it;
  };
  VP.pruneSel = () => {
    VP.sel = VP.sel.filter((it) => it && it.parent && it.layer && !VP.isSys(it.layer) && paper.project.layers.includes(it.layer));
  };
  VP.pivot = null;
  VP.setSelection = (items) => {
    VP.sel = (items || []).filter(Boolean);
    VP.handleMode = 'scale';
    VP.pivot = null;
    VP.drawOverlay();
    VP.emit('selection');
  };
  VP.clearSelection = () => VP.setSelection([]);
  VP.toggleSel = (it) => {
    const i = VP.sel.indexOf(it);
    if (i >= 0) VP.sel.splice(i, 1);
    else VP.sel.push(it);
    VP.handleMode = 'scale';
    VP.drawOverlay();
    VP.emit('selection');
  };
  VP.selBounds = (items = VP.sel) => {
    let b = null;
    items.forEach((it) => {
      const ib = it.bounds;
      b = b ? b.unite(ib) : ib.clone();
    });
    return b;
  };
  VP.hitItem = (pt, opts = {}) => {
    const tol = (opts.tol || (VP.coarse ? 10 : 6)) / paper.view.zoom;
    const res = paper.project.hitTest(pt, {
      fill: true, stroke: true, segments: false, curves: false, pixel: true, tolerance: tol,
      match: (r) => VP.isSelectable(r.item) && (!opts.exclude || !opts.exclude.includes(VP.topLevel(r.item)))
    });
    if (!res) return null;
    return opts.deep ? res.item : VP.topLevel(res.item);
  };
  VP.allSelectable = () => {
    const out = [];
    VP.userLayers().forEach((l) => {
      if (!l.visible || l.locked) return;
      l.children.forEach((c) => {
        if (c.visible && !c.locked) out.push(c);
      });
    });
    return out;
  };
  VP.selectAll = () => VP.setSelection(VP.allSelectable());

  /* ---------- overlay (selection frame & handles) ---------- */
  VP.colors = { accent: '#1461b2', accentFg: '#ffffff', panel: '#ffffff' };
  VP.readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    VP.colors = { accent: g('--accent', '#1461b2'), accentFg: g('--accent-fg', '#fff'), panel: g('--panel', '#fff'), fg: g('--fg', '#111'), muted: g('--muted', '#666'), line: g('--line', '#ccc') };
  };
  VP.handleSizePx = () => (VP.coarse ? 13 : 9);
  VP.handlesOf = (b) => [
    { id: 'tl', p: b.topLeft, kind: 'corner' }, { id: 'tc', p: b.topCenter, kind: 'edge' },
    { id: 'tr', p: b.topRight, kind: 'corner' }, { id: 'mr', p: b.rightCenter, kind: 'edge' },
    { id: 'br', p: b.bottomRight, kind: 'corner' }, { id: 'bc', p: b.bottomCenter, kind: 'edge' },
    { id: 'bl', p: b.bottomLeft, kind: 'corner' }, { id: 'ml', p: b.leftCenter, kind: 'edge' }
  ];
  VP.rotKnob = (b) => b.topCenter.subtract(new paper.Point(0, (VP.coarse ? 34 : 26) / paper.view.zoom));
  VP.hitHandle = (pt) => {
    VP.pruneSel();
    if (!VP.sel.length) return null;
    const b = VP.selBounds();
    const z = paper.view.zoom;
    const tol = (VP.coarse ? 22 : 11) / z;
    if (VP.handleMode !== 'rotate') {
      const k = VP.rotKnob(b);
      if (k.getDistance(pt) <= tol) return { id: 'rot', kind: 'rot', p: k };
    } else {
      const c = VP.pivot || b.center;
      if (c.getDistance(pt) <= tol * 0.9) return { id: 'pivot', kind: 'pivot', p: c };
    }
    let best = null;
    VP.handlesOf(b).forEach((h) => {
      const d = h.p.getDistance(pt);
      if (d <= tol && (!best || d < best.d || (h.kind === 'corner' && best.kind !== 'corner' && d <= best.d + 2 / z))) best = Object.assign({ d }, h);
    });
    return best;
  };
  VP.drawOverlay = () => {
    const L = VP.uiLayer;
    if (!L) return;
    L.removeChildren();
    const tool = VP.tools && VP.tools[VP.toolId];
    if (tool && tool.overlay && tool.overlay(L) === true) return;
    VP.drawSelectionOverlay(L);
    if (tool && tool.overlayAfter) tool.overlayAfter(L);
    (VP.overlayHooks || []).forEach((fn) => fn(L));
  };
  VP.drawSelectionOverlay = (L) => {
    VP.pruneSel();
    if (!VP.sel.length) return;
    const z = paper.view.zoom;
    const s = 1 / z;
    const acc = new paper.Color(VP.colors.accent);
    const b = VP.selBounds();
    if (VP.sel.length > 1) {
      VP.sel.forEach((it) => {
        L.addChild(new paper.Path.Rectangle({ rectangle: it.bounds, strokeColor: acc, strokeWidth: s, dashArray: [3 * s, 3 * s], opacity: 0.7, insert: false }));
      });
    }
    L.addChild(new paper.Path.Rectangle({ rectangle: b, strokeColor: acc, strokeWidth: 1.25 * s, insert: false }));
    const hs = VP.handleSizePx() * s;
    const white = new paper.Color(VP.colors.accentFg === '#08111f' ? '#0b1220' : '#ffffff');
    if (VP.handleMode === 'rotate') {
      VP.handlesOf(b).forEach((h) => {
        let shape;
        if (h.kind === 'corner') {
          shape = new paper.Path.Circle({ center: h.p, radius: hs * 0.62, insert: false });
        } else {
          shape = new paper.Path.RegularPolygon({ center: h.p, sides: 4, radius: hs * 0.7, insert: false });
        }
        shape.fillColor = acc;
        shape.strokeColor = white;
        shape.strokeWidth = 1.2 * s;
        L.addChild(shape);
      });
      // rotation centre: draggable, the middle of the selection unless moved
      const c = VP.pivot || b.center;
      L.addChild(new paper.Path.Circle({ center: c, radius: 5 * s, strokeColor: acc, strokeWidth: 1.4 * s, insert: false }));
      L.addChild(new paper.Path.Line({ from: c.subtract([9 * s, 0]), to: c.add([9 * s, 0]), strokeColor: acc, strokeWidth: 1.2 * s, insert: false }));
      L.addChild(new paper.Path.Line({ from: c.subtract([0, 9 * s]), to: c.add([0, 9 * s]), strokeColor: acc, strokeWidth: 1.2 * s, insert: false }));
    } else {
      const k = VP.rotKnob(b);
      L.addChild(new paper.Path.Line({ from: b.topCenter, to: k, strokeColor: acc, strokeWidth: 1.1 * s, insert: false }));
      L.addChild(new paper.Path.Circle({ center: k, radius: hs * 0.62, fillColor: white, strokeColor: acc, strokeWidth: 1.4 * s, insert: false }));
      VP.handlesOf(b).forEach((h) => {
        L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(h.p.subtract(hs / 2), new paper.Size(hs, hs)), fillColor: white, strokeColor: acc, strokeWidth: 1.4 * s, insert: false }));
      });
    }
  };

  /* ---------- parametric shapes (rectangle, ellipse, polygon/star, spiral) ---------- */
  VP.buildParamPath = (p) => {
    const w = Math.max(Math.abs(p.w), 0.01);
    const h = Math.max(Math.abs(p.h), 0.01);
    let path;
    if (p.kind === 'rect') {
      const r = Math.max(0, Math.min(p.r || 0, w / 2, h / 2));
      path = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(-w / 2, -h / 2, w, h), radius: r, insert: false });
    } else if (p.kind === 'ellipse') {
      path = new paper.Path.Ellipse({ rectangle: new paper.Rectangle(-w / 2, -h / 2, w, h), insert: false });
    } else if (p.kind === 'polygon') {
      const n = Math.max(3, Math.round(p.sides || 5));
      const k = p.star ? n * 2 : n;
      const segs = [];
      for (let i = 0; i < k; i++) {
        const a = ((-90 + (i * 360) / k) * Math.PI) / 180;
        const f = p.star && i % 2 === 1 ? VP.clamp(p.inner || 0.5, 0.05, 0.95) : 1;
        segs.push(new paper.Point((Math.cos(a) * w * f) / 2, (Math.sin(a) * h * f) / 2));
      }
      path = new paper.Path({ segments: segs, closed: true, insert: false });
    } else if (p.kind === 'spiral') {
      const turns = Math.max(0.5, p.turns || 3);
      const steps = Math.ceil(turns * 20);
      const segs = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const th = t * turns * 2 * Math.PI;
        segs.push(new paper.Point((Math.cos(th) * t * w) / 2, (Math.sin(th) * t * h) / 2));
      }
      path = new paper.Path({ segments: segs, insert: false });
      path.smooth({ type: 'catmull-rom' });
    }
    if (p.angle) path.rotate(p.angle, new paper.Point(0, 0));
    path.translate(new paper.Point(p.cx, p.cy));
    return path;
  };
  VP.rebuildParam = (item) => {
    const np = VP.buildParamPath(item.data.param);
    item.segments = np.segments;
    item.closed = np.closed;
  };
  VP.paramKinds = { rect: 'Dörtgen', ellipse: 'Elips', polygon: 'Çokgen', spiral: 'Spiral' };
  VP.createParam = (param) => {
    VP.ensureLayer();
    const path = VP.buildParamPath(param);
    path.data.param = param;
    VP.applyDefaultStyle(path, param.kind === 'spiral' ? 'open' : 'closed');
    VP.activeLayer.addChild(path);
    return path;
  };
  // Children of groups that keep their own matrix (live effects) are not moved by the group's transform.
  const walkParams = (item, fn) => {
    if (item.data && item.data.param) fn(item, item.data.param);
    if (item.children && item.applyMatrix !== false) item.children.slice().forEach((c) => walkParams(c, fn));
  };
  VP.walkParams = walkParams;
  const paramScaled = (item, p, sx, sy, anchor) => {
    const nc = anchor.add(new paper.Point(p.cx, p.cy).subtract(anchor).multiply(new paper.Point(sx, sy)));
    p.cx = nc.x;
    p.cy = nc.y;
    const a = (((p.angle || 0) % 180) + 180) % 180;
    const ax = Math.abs(sx);
    const ay = Math.abs(sy);
    const neg = sx < 0 || sy < 0;
    if (neg && (p.kind === 'polygon' || p.kind === 'spiral')) {
      delete item.data.param;
      return;
    }
    if (neg && (p.kind === 'perfect' || p.kind === 'cstar')) {
      if (sx < 0) p.fx = !p.fx;
      if (sy < 0) p.fy = !p.fy;
    }
    if (neg) p.angle = VP.norm(-(p.angle || 0));
    if (a < 1e-6 || Math.abs(a - 180) < 1e-6) {
      p.w *= ax;
      p.h *= ay;
    } else if (Math.abs(a - 90) < 1e-6) {
      p.w *= ay;
      p.h *= ax;
    } else if (Math.abs(ax - ay) < 1e-9) {
      p.w *= ax;
      p.h *= ay;
    } else {
      delete item.data.param;
      return;
    }
    if (p.kind === 'rect' && p.r) VP.rebuildParam(item);
  };

  /* ---------- transforms that keep parametric data in sync ---------- */
  VP.T = {
    move(items, d) {
      items.forEach((it) => {
        it.translate(d);
        walkParams(it, (x, p) => {
          p.cx += d.x;
          p.cy += d.y;
        });
      });
    },
    rotate(items, deg, pivot) {
      items.forEach((it) => {
        it.rotate(deg, pivot);
        it.data.rot = VP.norm((it.data.rot || 0) + deg);
        walkParams(it, (x, p) => {
          const c = new paper.Point(p.cx, p.cy).rotate(deg, pivot);
          p.cx = c.x;
          p.cy = c.y;
          p.angle = VP.norm((p.angle || 0) + deg);
        });
      });
    },
    scale(items, sx, sy, anchor) {
      if (!isFinite(sx) || !isFinite(sy) || Math.abs(sx) < 1e-6 || Math.abs(sy) < 1e-6) return;
      items.forEach((it) => {
        // text frames and tables resize and reflow instead of stretching
        if (VP.fx && VP.fx.reflowScale && VP.fx.reflowScale(it, sx, sy, anchor)) return;
        it.scale(sx, sy, anchor);
        walkParams(it, (x, p) => paramScaled(x, p, sx, sy, anchor));
      });
    },
    skew(items, kx, ky, center) {
      items.forEach((it) => {
        it.skew(kx, ky, center);
        walkParams(it, (x) => delete x.data.param);
      });
    }
  };
  VP.itemAngle = (it) => (it.data && it.data.param ? it.data.param.angle || 0 : (it.data && it.data.rot) || 0);

  /* ---------- styles ---------- */
  VP.applyDash = (item) => {
    const pat = VP.DASHES[(item.data && item.data.dash) || 'solid'];
    const w = Math.max(item.strokeWidth || 1, 0.5);
    item.dashArray = pat ? pat.map((v) => v * w) : [];
  };
  VP.applyDefaultStyle = (item, kind) => {
    const d = VP.defaults;
    item.fillColor = kind === 'open' ? null : d.fill ? new paper.Color(d.fill) : null;
    item.strokeColor = d.stroke ? new paper.Color(d.stroke) : null;
    item.strokeWidth = d.strokeWidth;
    item.strokeCap = d.cap;
    item.strokeJoin = d.join;
    item.data.dash = d.dash;
    VP.applyDash(item);
  };
  VP.hex = (c) => {
    if (!c) return null;
    if (c.type === 'gradient') return VP.hex(c.gradient.stops[0].color);
    const cc = c.clone();
    cc.alpha = 1;
    return cc.toCSS(true);
  };
  const isFxGroup = (it) => !!(it && it.data && it.data.effect && VP.fx);
  VP.leafItems = (items) => {
    const out = [];
    const walk = (it) => {
      if (it instanceof paper.Group && !(it instanceof paper.Layer) && !isFxGroup(it)) it.children.forEach(walk);
      else out.push(it);
    };
    items.forEach(walk);
    return out;
  };
  const probe = (it) => {
    let leaf = VP.leafItems([it])[0] || it;
    while (isFxGroup(leaf)) leaf = VP.leafItems([VP.fx.probe(leaf)])[0];
    return leaf;
  };
  VP.getFill = (it) => {
    const leaf = probe(it);
    const c = leaf.fillColor;
    if (!c) return { type: 'none', color: '#ffffff', color2: '#1461b2', angle: 0, alpha: 1 };
    if (c.type === 'gradient') {
      const st = c.gradient.stops;
      const v = c.destination.subtract(c.origin);
      return { type: c.gradient.radial ? 'radial' : 'linear', color: VP.hex(st[0].color), color2: VP.hex(st[st.length - 1].color), angle: Math.round(v.angle), alpha: 1 };
    }
    return { type: 'solid', color: VP.hex(c), color2: '#ffffff', angle: 0, alpha: c.alpha };
  };
  VP.setFill = (items, spec) => {
    VP.leafItems(items).forEach((it) => {
      if (isFxGroup(it)) return VP.fx.restyle(it, (list) => VP.setFill(list, spec));
      if (it instanceof paper.Raster) return;
      if (spec.type === 'none') it.fillColor = null;
      else if (spec.type === 'solid') {
        const c = new paper.Color(spec.color);
        c.alpha = spec.alpha == null ? 1 : spec.alpha;
        it.fillColor = c;
      } else {
        const b = it.bounds;
        const ctr = b.center;
        let origin;
        let dest;
        if (spec.type === 'linear') {
          const a = ((spec.angle || 0) * Math.PI) / 180;
          const dir = new paper.Point(Math.cos(a), Math.sin(a));
          const len = Math.abs(b.width * dir.x) + Math.abs(b.height * dir.y);
          origin = ctr.subtract(dir.multiply(len / 2));
          dest = ctr.add(dir.multiply(len / 2));
        } else {
          origin = ctr;
          dest = ctr.add(new paper.Point(Math.max(b.width, b.height) / 2, 0));
        }
        it.fillColor = { gradient: { stops: [[spec.color, 0], [spec.color2, 1]], radial: spec.type === 'radial' }, origin, destination: dest };
      }
    });
  };
  VP.getStroke = (it) => {
    const leaf = probe(it);
    return {
      on: !!leaf.strokeColor && leaf.strokeWidth > 0,
      color: VP.hex(leaf.strokeColor) || '#1d1d1b',
      width: leaf.strokeWidth || 0,
      dash: (leaf.data && leaf.data.dash) || 'solid',
      cap: leaf.strokeCap || 'butt',
      join: leaf.strokeJoin || 'miter'
    };
  };
  VP.setStroke = (items, spec) => {
    VP.leafItems(items).forEach((it) => {
      if (isFxGroup(it)) return VP.fx.restyle(it, (list) => VP.setStroke(list, spec));
      if (it instanceof paper.Raster) return;
      if ('on' in spec && !spec.on) it.strokeColor = null;
      if (spec.color && spec.on !== false) it.strokeColor = new paper.Color(spec.color);
      if (spec.width != null) it.strokeWidth = spec.width;
      if (spec.cap) it.strokeCap = spec.cap;
      if (spec.join) it.strokeJoin = spec.join;
      if (spec.dash) it.data.dash = spec.dash;
      VP.applyDash(it);
    });
  };
  VP.getShadow = (it) => {
    const s = it.data && it.data.shadow;
    return s ? Object.assign({ on: true }, s) : { on: false, color: '#000000', alpha: 0.35, blur: 8, dx: 4, dy: 4 };
  };
  VP.applyShadowProps = (it) => {
    const s = it.data && it.data.shadow;
    if (!s) {
      it.shadowColor = null;
      it.shadowBlur = 0;
      it.shadowOffset = new paper.Point(0, 0);
      return;
    }
    const c = new paper.Color(s.color);
    c.alpha = s.alpha;
    it.shadowColor = c;
    const k = VP.shadowZoomFactor ? VP.shadowZoomFactor() : 1;
    it.shadowBlur = s.blur * k;
    it.shadowOffset = new paper.Point(s.dx * k, s.dy * k);
  };
  VP.setShadow = (items, spec) => {
    items.forEach((it) => {
      if (!spec.on) delete it.data.shadow;
      else it.data.shadow = { color: spec.color, alpha: spec.alpha, blur: spec.blur, dx: spec.dx, dy: spec.dy };
      VP.applyShadowProps(it);
    });
  };
  VP.refreshShadows = () => {
    VP.userLayers().forEach((l) =>
      l.getItems({ match: (it) => it.data && it.data.shadow }).forEach(VP.applyShadowProps)
    );
  };

  /* ---------- text ---------- */
  VP.textWeight = (bold, italic) => (italic ? 'italic ' : '') + (bold ? 'bold' : 'normal');
  VP.isBold = (t) => /bold|[6-9]00/.test(String(t.fontWeight));
  VP.isItalic = (t) => /italic/.test(String(t.fontWeight));
  VP.createText = (point, content) => {
    VP.ensureLayer();
    const d = VP.defaults;
    const t = new paper.PointText({
      point, content,
      fillColor: new paper.Color(d.fill || '#1d1d1b'),
      fontFamily: d.fontFamily, fontSize: d.fontSize,
      fontWeight: VP.textWeight(d.bold, d.italic),
      justification: d.justification, insert: false
    });
    VP.activeLayer.addChild(t);
    return t;
  };
  VP.otFonts = {};
  VP.getOTFont = (bold) => {
    const key = bold ? 'bold' : 'regular';
    if (!VP.otFonts[key] && window.opentype && window.VP_FONTS && window.VP_FONTS[key]) {
      const bin = atob(window.VP_FONTS[key]);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      VP.otFonts[key] = opentype.parse(buf.buffer);
    }
    return VP.otFonts[key];
  };
  VP.textToPath = (t) => {
    if (!/fira sans/i.test(t.fontFamily || '')) return null;
    const font = VP.getOTFont(VP.isBold(t));
    if (!font) return null;
    const size = t.fontSize;
    const lead = t.leading || size * 1.2;
    let d = '';
    String(t.content).split(/\r?\n/).forEach((ln, i) => {
      if (!ln) return;
      const adv = font.getAdvanceWidth(ln, size);
      let x = 0;
      if (t.justification === 'center') x = -adv / 2;
      else if (t.justification === 'right') x = -adv;
      d += font.getPath(ln, x, i * lead, size).toPathData(3) + ' ';
    });
    const cp = new paper.CompoundPath({ pathData: d.trim() || 'M0,0', insert: false });
    cp.transform(t.matrix);
    cp.fillColor = t.fillColor;
    cp.strokeColor = t.strokeColor;
    cp.strokeWidth = t.strokeWidth;
    cp.opacity = t.opacity;
    cp.blendMode = t.blendMode;
    cp.data = JSON.parse(JSON.stringify(t.data || {}));
    cp.insertAbove(t);
    t.remove();
    VP.applyShadowProps(cp);
    return cp;
  };

  /* ---------- describing items ---------- */
  VP.kindOf = (it) => {
    if (isFxGroup(it)) return it.data.effect.type;
    if (it.data && it.data.param) return it.data.param.kind === 'polygon' && it.data.param.star ? 'star' : it.data.param.kind;
    if (it instanceof paper.PointText) return 'text';
    if (it instanceof paper.Raster) return 'image';
    if (it instanceof paper.Group) return 'group';
    if (it instanceof paper.CompoundPath) return 'compound';
    if (it instanceof paper.Path) return it.closed ? 'closed' : 'path';
    return 'path';
  };
  VP.KIND_NAMES = { blend: 'Harmanlama', contour: 'Kontur', envelope: 'Zarf', perspective: 'Perspektif', extrude: 'Derinlik', lens: 'Mercek', powerclip: 'PowerClip', rect: 'Dörtgen', ellipse: 'Elips', polygon: 'Çokgen', star: 'Yıldız', spiral: 'Spiral', text: 'Metin', image: 'Resim', group: 'Grup', compound: 'Bileşik eğri', closed: 'Kapalı eğri', path: 'Eğri' };
  VP.describe = (it) => {
    if (it.data && it.data.label) return it.data.label;
    if (isFxGroup(it)) return VP.fx.describe(it);
    const k = VP.kindOf(it);
    if (k === 'text') {
      const c = String(it.content || '').replace(/\s+/g, ' ').trim();
      return 'Metin: “' + (c.length > 18 ? c.slice(0, 18) + '…' : c) + '”';
    }
    if (k === 'group') return 'Grup (' + it.children.length + ')';
    return VP.KIND_NAMES[k] || 'Nesne';
  };

  /* ---------- clipboard & editing ---------- */
  VP.deepData = (it) => {
    it.data = JSON.parse(JSON.stringify(it.data || {}));
    if (it.children) it.children.forEach(VP.deepData);
  };
  VP.cloneItem = (it) => {
    const c = it.clone();
    VP.deepData(c);
    return c;
  };
  VP.clipboard = [];
  VP.copy = () => {
    if (!VP.sel.length) return;
    VP.clipboard = VP.zSort(VP.sel).map((it) => it.exportJSON({ asString: true }));
    VP.toast(VP.sel.length + ' nesne kopyalandı');
  };
  VP.cut = () => {
    if (!VP.sel.length) return;
    VP.copy();
    VP.deleteSel();
  };
  VP.paste = () => {
    if (!VP.clipboard.length) return VP.toast('Panoda nesne yok');
    VP.ensureLayer();
    const off = new paper.Point(VP.toPT(5), VP.toPT(5));
    const items = VP.clipboard.map((json) => VP.activeLayer.importJSON(json));
    VP.T.move(items, off);
    VP.clipboard = items.map((it) => it.exportJSON({ asString: true }));
    VP.setSelection(items);
    VP.commit();
  };
  VP.duplicate = () => {
    if (!VP.sel.length) return;
    const off = new paper.Point(VP.toPT(5), VP.toPT(5));
    const copies = VP.zSort(VP.sel).map((it) => {
      const c = VP.cloneItem(it);
      c.insertAbove(it);
      return c;
    });
    VP.T.move(copies, off);
    VP.setSelection(copies);
    VP.commit();
  };
  VP.deleteSel = () => {
    if (!VP.sel.length) return;
    VP.sel.forEach((it) => it.remove());
    VP.setSelection([]);
    VP.commit();
  };
  VP.stepRepeat = (n, dxmm, dymm) => {
    if (!VP.sel.length || !(n >= 1)) return;
    const src = VP.zSort(VP.sel);
    let last = src;
    const all = [];
    for (let i = 0; i < Math.min(n, 200); i++) {
      last = last.map((it) => {
        const c = VP.cloneItem(it);
        c.insertAbove(it);
        return c;
      });
      VP.T.move(last, new paper.Point(VP.toPT(dxmm), VP.toPT(dymm)));
      all.push(...last);
    }
    VP.setSelection(all);
    VP.commit();
  };

  /* ---------- ordering ---------- */
  VP.zSort = (items) =>
    items.slice().sort((a, b) => {
      if (a === b) return 0;
      if (a.layer !== b.layer) {
        const ls = paper.project.layers;
        return ls.indexOf(a.layer) - ls.indexOf(b.layer);
      }
      return a.isAbove(b) ? 1 : -1;
    });
  VP.arrange = (kind) => {
    if (!VP.sel.length) return;
    const items = VP.zSort(VP.sel);
    if (kind === 'front') items.forEach((it) => it.bringToFront());
    else if (kind === 'back') items.slice().reverse().forEach((it) => it.sendToBack());
    else if (kind === 'forward') {
      items.slice().reverse().forEach((it) => {
        const n = it.nextSibling;
        if (n && !VP.sel.includes(n)) it.insertAbove(n);
      });
    } else if (kind === 'backward') {
      items.forEach((it) => {
        const p = it.previousSibling;
        if (p && !VP.sel.includes(p)) it.insertBelow(p);
      });
    }
    VP.commit();
  };

  /* ---------- grouping, combining ---------- */
  VP.group = () => {
    if (VP.sel.length < 2) return VP.toast('Gruplamak için en az iki nesne seçin');
    const items = VP.zSort(VP.sel);
    const top = items[items.length - 1];
    const g = new paper.Group({ insert: false });
    g.insertAbove(top);
    g.addChildren(items);
    VP.setSelection([g]);
    VP.commit();
  };
  VP.ungroup = (all) => {
    const groups = VP.sel.filter((it) => it instanceof paper.Group);
    if (!groups.length) return VP.toast('Seçimde grup yok');
    const out = VP.sel.filter((it) => !(it instanceof paper.Group));
    const explode = (g) => {
      if (isFxGroup(g)) VP.fx.bake(g);
      if (g.applyMatrix === false) g.applyMatrix = true;
      const kids = g.removeChildren();
      g.parent.insertChildren(g.index, kids);
      g.remove();
      kids.forEach((k) => {
        if (all && k instanceof paper.Group) explode(k);
        else out.push(k);
      });
    };
    groups.forEach(explode);
    VP.setSelection(out);
    VP.commit();
  };
  VP.isPathItem = (it) => it instanceof paper.Path || it instanceof paper.CompoundPath;
  const copyLook = (dst, src) => {
    dst.fillColor = src.fillColor;
    dst.strokeColor = src.strokeColor;
    dst.strokeWidth = src.strokeWidth;
    dst.strokeCap = src.strokeCap;
    dst.strokeJoin = src.strokeJoin;
    dst.dashArray = src.dashArray;
    dst.opacity = src.opacity;
    dst.blendMode = src.blendMode;
    dst.data = JSON.parse(JSON.stringify(src.data || {}));
    delete dst.data.param;
    delete dst.data.label;
    VP.applyShadowProps(dst);
  };
  VP.combine = () => {
    const items = VP.zSort(VP.sel);
    if (items.length < 2) return VP.toast('Birleştirmek için en az iki eğri seçin');
    if (!items.every(VP.isPathItem)) return VP.toast('Önce metin ve grupları eğriye dönüştürün');
    const cp = new paper.CompoundPath({ insert: false });
    items.forEach((it) => {
      if (it instanceof paper.CompoundPath) it.children.forEach((c) => cp.addChild(c.clone({ insert: false })));
      else cp.addChild(it.clone({ insert: false }));
    });
    copyLook(cp, items[0]);
    cp.insertAbove(items[items.length - 1]);
    items.forEach((it) => it.remove());
    VP.setSelection([cp]);
    VP.commit();
  };
  VP.breakApart = () => {
    const comps = VP.sel.filter((it) => it instanceof paper.CompoundPath);
    if (!comps.length) return VP.toast('Parçalamak için bileşik eğri seçin');
    const out = VP.sel.filter((it) => !(it instanceof paper.CompoundPath));
    comps.forEach((cp) => {
      cp.children.slice().forEach((c) => {
        const p = c.clone({ insert: false });
        copyLook(p, cp);
        p.insertAbove(cp);
        out.push(p);
      });
      cp.remove();
    });
    VP.setSelection(out);
    VP.commit();
  };

  /* ---------- shaping (boolean operations) ---------- */
  VP.shape = (op) => {
    const items = VP.zSort(VP.sel);
    if (items.length < 2) return VP.toast('Şekillendirme için en az iki nesne seçin');
    if (!items.every(VP.isPathItem)) return VP.toast('Metin, resim ve gruplarda önce “Eğriye dönüştür” veya “Grubu çöz” kullanın');
    const bottom = items[0];
    const top = items[items.length - 1];
    let acc = bottom.clone({ insert: false });
    const others = items.slice(1);
    try {
      others.forEach((it) => {
        if (op === 'weld') acc = acc.unite(it, { insert: false });
        else if (op === 'trim') acc = acc.subtract(it, { insert: false });
        else if (op === 'intersect') acc = acc.intersect(it, { insert: false });
        else if (op === 'exclude') acc = acc.exclude(it, { insert: false });
      });
    } catch (e) {
      return VP.toast('Bu şekillerle işlem yapılamadı');
    }
    if (!acc || acc.isEmpty() || !acc.bounds.width) {
      return VP.toast(op === 'intersect' ? 'Seçili nesneler kesişmiyor' : 'Sonuç boş çıktı');
    }
    copyLook(acc, bottom);
    if (op === 'intersect') {
      acc.insertAbove(top);
    } else {
      acc.insertAbove(bottom);
      if (op === 'trim') bottom.remove();
      else items.forEach((it) => it.remove());
    }
    VP.setSelection([acc]);
    VP.commit();
    const names = { weld: 'Kaynak', trim: 'Kırp', intersect: 'Kesişim', exclude: 'Dışla' };
    VP.toast(names[op] + ' uygulandı');
  };

  /* ---------- convert to curves ---------- */
  VP.convertToCurves = () => {
    if (!VP.sel.length) return;
    let skipped = 0;
    let changed = 0;
    const out = [];
    const conv = (it) => {
      if (it instanceof paper.PointText) {
        const p = VP.textToPath(it);
        if (p) {
          changed++;
          return p;
        }
        skipped++;
        return it;
      }
      if (it instanceof paper.Group) {
        if (isFxGroup(it)) {
          VP.fx.bake(it);
          changed++;
        }
        it.children.slice().forEach(conv);
        return it;
      }
      if (it.data && it.data.param) {
        delete it.data.param;
        changed++;
      }
      return it;
    };
    VP.sel.forEach((it) => out.push(conv(it)));
    VP.setSelection(out);
    if (changed) VP.commit();
    if (skipped) VP.toast('Yalnızca Fira Sans yazı tipindeki metinler eğriye dönüştürülebilir');
    else if (changed) VP.toast('Eğriye dönüştürüldü');
  };

  /* ---------- align & distribute ---------- */
  VP.pageRect = () => new paper.Rectangle(0, 0, VP.page().w, VP.page().h);
  VP.align = (edge) => {
    const items = VP.sel;
    if (!items.length) return;
    const ref = VP.settings.alignTo === 'page' || items.length === 1 ? VP.pageRect() : VP.selBounds(items);
    items.forEach((it) => {
      const b = it.bounds;
      let dx = 0;
      let dy = 0;
      if (edge === 'l') dx = ref.left - b.left;
      if (edge === 'ch') dx = ref.center.x - b.center.x;
      if (edge === 'r') dx = ref.right - b.right;
      if (edge === 't') dy = ref.top - b.top;
      if (edge === 'cv') dy = ref.center.y - b.center.y;
      if (edge === 'b') dy = ref.bottom - b.bottom;
      VP.T.move([it], new paper.Point(dx, dy));
    });
    VP.commit();
  };
  VP.distribute = (axis, mode) => {
    const items = VP.sel.slice();
    if (items.length < 3) return VP.toast('Dağıtmak için en az üç nesne seçin');
    const key = axis === 'h' ? 'x' : 'y';
    const size = axis === 'h' ? 'width' : 'height';
    items.sort((a, b) => a.bounds.center[key] - b.bounds.center[key]);
    if (mode === 'space') {
      const first = items[0].bounds;
      const last = items[items.length - 1].bounds;
      const total = (axis === 'h' ? last.right - first.left : last.bottom - first.top) - items.reduce((s, it) => s + it.bounds[size], 0);
      const gap = total / (items.length - 1);
      let pos = axis === 'h' ? first.right + gap : first.bottom + gap;
      items.slice(1, -1).forEach((it) => {
        const b = it.bounds;
        const cur = axis === 'h' ? b.left : b.top;
        VP.T.move([it], axis === 'h' ? new paper.Point(pos - cur, 0) : new paper.Point(0, pos - cur));
        pos += b[size] + gap;
      });
    } else {
      const c0 = items[0].bounds.center[key];
      const c1 = items[items.length - 1].bounds.center[key];
      const step = (c1 - c0) / (items.length - 1);
      items.forEach((it, i) => {
        const d = c0 + step * i - it.bounds.center[key];
        VP.T.move([it], axis === 'h' ? new paper.Point(d, 0) : new paper.Point(0, d));
      });
    }
    VP.commit();
  };
  VP.flip = (axis) => {
    if (!VP.sel.length) return;
    const c = VP.selBounds().center;
    VP.T.scale(VP.sel, axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1, c);
    VP.commit();
  };
  VP.rotateSel = (deg) => {
    if (!VP.sel.length || !deg) return;
    VP.T.rotate(VP.sel, deg, VP.pivot || VP.selBounds().center);
    VP.commit();
  };
  VP.setSelGeom = (g) => {
    if (!VP.sel.length) return;
    let b = VP.selBounds();
    if (g.w != null || g.h != null) {
      let sx = g.w != null && b.width > 0 ? g.w / b.width : 1;
      let sy = g.h != null && b.height > 0 ? g.h / b.height : 1;
      if (VP.settings.keepRatio) {
        if (g.w != null) sy = sx;
        else sx = sy;
      }
      VP.T.scale(VP.sel, sx, sy, b.topLeft);
      b = VP.selBounds();
    }
    const dx = g.x != null ? g.x - b.left : 0;
    const dy = g.y != null ? g.y - b.top : 0;
    if (dx || dy) VP.T.move(VP.sel, new paper.Point(dx, dy));
    VP.commit();
  };

  /* ---------- history ---------- */
  VP.hist = { stack: [], i: -1, max: 80 };
  VP.snapshot = () => {
    VP.storePage();
    return { name: VP.doc.name, active: VP.doc.active, pages: VP.doc.pages.map((p) => Object.assign({}, p, { layers: p.layers.slice() })), ext: JSON.stringify(VP.doc.ext || {}) };
  };
  VP.commit = () => {
    const s = VP.snapshot();
    VP.hist.stack.length = VP.hist.i + 1;
    VP.hist.stack.push(s);
    if (VP.hist.stack.length > VP.hist.max) VP.hist.stack.shift();
    VP.hist.i = VP.hist.stack.length - 1;
    VP.dirty();
    VP.drawOverlay();
    VP.emit('change');
  };
  VP.resetHistory = () => {
    VP.hist.stack = [VP.snapshot()];
    VP.hist.i = 0;
    VP.emit('change');
  };
  VP.restore = (s) => {
    VP.doc = { name: s.name, active: s.active, pages: s.pages.map((p) => Object.assign({}, p, { layers: p.layers.slice() })), ext: JSON.parse(s.ext || '{}') };
    VP.loadPage(VP.doc.active, { keepView: true });
    VP.refreshShadows();
    VP.dirty();
    VP.emit('change');
  };
  VP.undo = () => {
    if (VP.tools && VP.tools[VP.toolId] && VP.tools[VP.toolId].busy && VP.tools[VP.toolId].busy()) VP.tools[VP.toolId].cancel();
    if (VP.hist.i <= 0) return VP.toast('Geri alınacak işlem yok');
    VP.hist.i--;
    VP.restore(VP.hist.stack[VP.hist.i]);
  };
  VP.redo = () => {
    if (VP.hist.i >= VP.hist.stack.length - 1) return VP.toast('Yinelenecek işlem yok');
    VP.hist.i++;
    VP.restore(VP.hist.stack[VP.hist.i]);
  };
  VP.canUndo = () => VP.hist.i > 0;
  VP.canRedo = () => VP.hist.i < VP.hist.stack.length - 1;

  /* ---------- page rendering helpers (thumbnails, PNG) ---------- */
  VP.composePageGroup = (opts = {}) => {
    const p = VP.page();
    const g = new paper.Group({ insert: false });
    g.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(0, 0, p.w, p.h), insert: false }));
    if (opts.white !== false || p.bg) g.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(0, 0, p.w, p.h), fillColor: p.bg || '#ffffff', insert: false }));
    VP.userLayers().forEach((l) => {
      if (!l.visible) return;
      l.children.forEach((c) => {
        if (c.visible) g.addChild(c.clone({ insert: false }));
      });
    });
    g.clipped = true;
    return g;
  };
  VP.makeThumb = () => {
    try {
      const p = VP.page();
      const res = (72 * 112) / Math.max(p.w, p.h);
      const g = VP.composePageGroup({ res });
      const r = g.rasterize(res, false);
      p.thumb = r.toDataURL();
    } catch (e) {
      /* thumbnails are optional */
    }
  };

  VP.dirty = () => {
    VP._thumbDirty = true;
    VP.emit('dirty');
  };
})();
