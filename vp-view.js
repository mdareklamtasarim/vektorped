/* VektörPad view and precision set (desktop drawing suite features, written for this app):
   - View modes: simple wireframe, wireframe, draft, enhanced (normal look) and pixels, drawn by a small
     addition to the drawing engine (the document itself is not changed).
   - Pixel view at the document resolution, with a pixel grid at high zoom.
   - Multipage view: every page side by side; tap another page to work on it.
   - Coordinates docker: create rectangles, ellipses, polygons, stars and lines from typed values, or
     change the selected one.
   - Drawing scale (e.g. 1:50 in metres): rulers, the pointer position and dimension lines show real-world
     sizes. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const A = VP.actions;
  const S = VP.settings;
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const $ = (s) => document.querySelector(s);
  const VW = (VP.view2 = {});
  const def = (k, v) => {
    if (S[k] === undefined) S[k] = v;
  };
  def('viewMode', 'enhanced');
  def('pixelGrid', true);
  def('multiPage', false);
  const redraw = () => {
    if (paper.view) {
      paper.view._needsUpdate = true;
      paper.view.requestUpdate();
    }
  };

  /* ======================================================================
     VIEW MODES
     ====================================================================== */
  const MODES = [['swire', 'Basit tel kafes'], ['wire', 'Tel kafes'], ['draft', 'Taslak'], ['enhanced', 'Gelişmiş'], ['pixels', 'Piksel']];
  VW.MODES = MODES;
  // only the artwork changes look; page, grid, guides and handles stay as they are
  const isArt = (it) => {
    const L = it.layer;
    if (!L) return false;
    if (!VP.isSys(L)) return true;
    for (let p = it.parent; p && p !== L; p = p.parent) if (p.data && p.data.artPreview) return true;
    return false;
  };
  // in simple wireframe the steps an effect makes are hidden; only the objects that control it show
  const GEN = new Set(['contour', 'extrude', 'blockShadow', 'pshadow', 'innerShadow', 'bevel', 'lens']);
  const generated = (it) => {
    for (let c = it; c && c.parent && !(c instanceof paper.Layer); c = c.parent) {
      const d = c.data || {};
      if (d.blendSteps || d.symMirror || d.bevelFx || d.bsShadow || d.extrudeSide || d.lensContent) return true;
      const fx = c.parent.data && c.parent.data.effect;
      if (fx && GEN.has(fx.type) && !d.effectSrc) return true;
    }
    return false;
  };
  const wireMode = () => S.viewMode === 'wire' || S.viewMode === 'swire';
  const WIRE = '#1d1d1b';
  const hairline = (ctx, param) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.setLineDash([]);
    ctx.lineWidth = Math.max(1, (param.pixelRatio || 1) * 0.9);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = WIRE;
    ctx.stroke();
    ctx.restore();
  };
  const avgColor = (c) => {
    const st = c.gradient && c.gradient.stops;
    if (!st || !st.length) return c.toCSS(true);
    let r = 0, g = 0, b = 0, a = 0;
    st.forEach((s) => {
      const k = s.color;
      r += k.red;
      g += k.green;
      b += k.blue;
      a += k.alpha == null ? 1 : k.alpha;
    });
    const n = st.length;
    return 'rgba(' + Math.round((r / n) * 255) + ',' + Math.round((g / n) * 255) + ',' + Math.round((b / n) * 255) + ',' + (a / n).toFixed(3) + ')';
  };
  [paper.Path, paper.CompoundPath, paper.Shape].forEach((K) => {
    if (!K || !K.prototype._draw) return;
    const orig = K.prototype._draw;
    K.prototype._draw = function (ctx, param, vm, sm) {
      const m = S.viewMode;
      if (m === 'enhanced' || m === 'pixels' || param.clip || param.dontFinish || !isArt(this)) return orig.call(this, ctx, param, vm, sm);
      if (wireMode()) {
        if (m === 'swire' && generated(this)) return;
        orig.call(this, ctx, param.extend({ dontFinish: true }), vm, sm);
        return hairline(ctx, param);
      }
      // draft: gradient and pattern fills as one flat colour, no shadows
      const st = this.getStyle();
      const fc = st.getFillColor();
      ctx.shadowColor = 'rgba(0,0,0,0)';
      if (!(fc && fc.gradient)) return orig.call(this, ctx, param, vm, sm);
      orig.call(this, ctx, param.extend({ dontFinish: true }), vm, sm);
      ctx.fillStyle = avgColor(fc);
      ctx.fill(st.getFillRule ? st.getFillRule() : 'nonzero');
      const sc = st.getStrokeColor();
      if (sc && st.getStrokeWidth() > 0) {
        ctx.lineWidth = st.getStrokeWidth();
        ctx.strokeStyle = sc.gradient ? avgColor(sc) : sc.toCSS(true);
        ctx.lineJoin = st.getStrokeJoin();
        ctx.lineCap = st.getStrokeCap();
        ctx.stroke();
      }
    };
  });
  {
    const PT = paper.PointText.prototype;
    const orig = PT._draw;
    PT._draw = function (ctx, param, vm) {
      if (!wireMode() || !isArt(this)) return orig.call(this, ctx, param, vm);
      if (S.viewMode === 'swire' && generated(this)) return;
      if (!this._content) return;
      const st = this._style;
      ctx.font = st.getFontStyle();
      ctx.textAlign = st.getJustification();
      const t = ctx.getTransform();
      const sc = Math.hypot(t.a, t.b) || 1;
      ctx.lineWidth = Math.max(1, (param.pixelRatio || 1) * 0.9) / sc;
      ctx.strokeStyle = WIRE;
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.setLineDash([]);
      const lead = st.getLeading();
      (this._lines || [String(this._content)]).forEach((ln) => {
        ctx.strokeText(ln, 0, 0);
        ctx.translate(0, lead);
      });
    };
  }
  {
    const R = paper.Raster.prototype;
    const orig = R._draw;
    R._draw = function (ctx, param, vm) {
      const m = S.viewMode;
      if (!isArt(this) || param.clip) return orig.call(this, ctx, param, vm);
      if (m === 'draft' || m === 'pixels') {
        const was = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        orig.call(this, ctx, param, vm);
        ctx.imageSmoothingEnabled = was;
        return;
      }
      if (!wireMode()) return orig.call(this, ctx, param, vm);
      const s = this.getSize();
      ctx.beginPath();
      ctx.rect(-s.width / 2, -s.height / 2, s.width, s.height);
      ctx.moveTo(-s.width / 2, -s.height / 2);
      ctx.lineTo(s.width / 2, s.height / 2);
      ctx.moveTo(s.width / 2, -s.height / 2);
      ctx.lineTo(-s.width / 2, s.height / 2);
      hairline(ctx, param);
    };
  }

  /* ---------- pixel view ---------- */
  VW.dpi = () => clamp(+((VP.doc && VP.doc.ext && VP.doc.ext.dpi) || 96), 36, 1200);
  let small = null;
  const pixelate = (ctx, T) => {
    const k = (T.a * 72) / VW.dpi(); // device pixels per document pixel
    const cv = ctx.canvas;
    const W = cv.width;
    const Hh = cv.height;
    if (k <= 1.05 || !W || !Hh) return;
    const ox = T.e - Math.ceil(T.e / k) * k; // first pixel column at or left of the canvas edge (≤ 0)
    const oy = T.f - Math.ceil(T.f / k) * k;
    const cols = Math.ceil((W - ox) / k) + 1;
    const rows = Math.ceil((Hh - oy) / k) + 1;
    if (!small) small = document.createElement('canvas');
    if (small.width !== cols || small.height !== rows) {
      small.width = cols;
      small.height = rows;
    }
    const sc = small.getContext('2d');
    sc.clearRect(0, 0, cols, rows);
    sc.imageSmoothingEnabled = true;
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(cv, 0, 0, W, Hh, -ox / k, -oy / k, W / k, Hh / k);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, cols, rows, ox, oy, cols * k, rows * k);
    if (S.pixelGrid && k >= 8) {
      ctx.beginPath();
      for (let x = ox; x <= W; x += k) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, Hh);
      }
      for (let y = oy; y <= Hh; y += k) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(W, Math.round(y) + 0.5);
      }
      ctx.strokeStyle = 'rgba(120,120,120,0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  };
  const pdraw0 = paper.Project.prototype.draw;
  paper.Project.prototype.draw = function (ctx, matrix, pr) {
    if (S.viewMode !== 'pixels' || this !== paper.project || !VP.uiLayer) return pdraw0.call(this, ctx, matrix, pr);
    const top = [VP.guideLayer, VP.uiLayer].filter(Boolean);
    const mk = () => new paper.Base({ offset: new paper.Point(0, 0), pixelRatio: pr, viewMatrix: matrix.isIdentity() ? null : matrix, matrices: [new paper.Matrix()], updateMatrix: true });
    this._updateVersion++;
    ctx.save();
    matrix.applyToContext(ctx);
    const T = ctx.getTransform();
    let param = mk();
    this._children.forEach((c) => !top.includes(c) && c.draw(ctx, param));
    ctx.restore();
    try {
      pixelate(ctx, T);
    } catch (e) { /* a view that cannot be read back is shown as it is */ }
    ctx.save();
    matrix.applyToContext(ctx);
    param = mk();
    top.forEach((c) => c.draw(ctx, param));
    ctx.restore();
  };
  VW.setMode = (m) => {
    if (!MODES.some(([k]) => k === m)) m = 'enhanced';
    S.viewMode = m;
    VP.io.savePrefs();
    redraw();
    UI.schedule('top', 'status');
    const name = MODES.find(([k]) => k === m)[1];
    if (m === 'pixels') VP.toast('Piksel görünümü · ' + VW.dpi() + ' dpi (belge çözünürlüğü) · Yakınlaştırınca pikseller görünür');
    else VP.toast('Görünüm: ' + name);
  };
  const stInfo0 = UI.renderStatus;
  if (stInfo0) {
    UI.renderStatus = function () {
      const r = stInfo0.apply(this, arguments);
      const el = $('#st-info');
      if (el && S.viewMode !== 'enhanced') {
        const n = MODES.find(([k]) => k === S.viewMode);
        if (n && !el.textContent.includes(n[1])) el.textContent = n[1] + ' görünümü · ' + el.textContent;
      }
      return r;
    };
  }

  /* ======================================================================
     MULTIPAGE VIEW
     ====================================================================== */
  const GAP = () => VP.toPT(12);
  // where each page sits, relative to the active page's own origin
  VW.pagePos = () => {
    const pages = VP.doc.pages;
    const xs = [];
    let x = 0;
    pages.forEach((p, i) => {
      xs.push(x);
      x += p.w + GAP();
    });
    const a = xs[VP.doc.active] || 0;
    return pages.map((p, i) => ({ i, x: xs[i] - a, y: 0, w: p.w, h: p.h }));
  };
  const cache = new Map();
  const pageArt = (i) => {
    const q = VP.doc.pages[i];
    const c = cache.get(i);
    if (c && c.layers === q.layers && c.bg === q.bg) return c.g.clone({ insert: false });
    const content = new paper.Group({ insert: false });
    try {
      (q.layers || []).forEach((json) => {
        const L = new paper.Layer({ insert: false });
        L.importJSON(json);
        if (!L.visible || (L.data && L.data.master)) return;
        content.addChildren(L.removeChildren());
      });
      const ms = VP.ext && VP.ext().masters;
      (ms || []).forEach((m) => {
        const L = new paper.Layer({ insert: false });
        L.importJSON(m.json);
        if (L.visible) content.addChildren(L.removeChildren());
      });
    } catch (e) {
      console.error(e);
    }
    content.getItems({ match: (it) => it.data && it.data.hitOnly }).forEach((it) => it.remove());
    content.getItems({ match: (it) => it.data && it.data.pageField }).forEach((t) => (t.content = VP.pageLabel ? VP.pageLabel(i) : String(i + 1)));
    cache.set(i, { layers: q.layers, bg: q.bg, g: content });
    return content.clone({ insert: false });
  };
  const label = (txt, x, y, on) => new paper.PointText({ point: Pt(x, y), content: txt, fontFamily: 'Fira Sans', fontSize: 9 / Math.max(0.2, zoom()) > 40 ? 40 : 9 / Math.max(0.2, zoom()), fillColor: on ? VP.colors.accent : VP.colors.muted || '#666', justification: 'left', insert: false });
  const dp0 = VP.drawPage;
  VP.drawPage = () => {
    dp0();
    if (!S.multiPage || !VP.bgLayer || VP.doc.pages.length < 2) return;
    VP.bgLayer.children.filter((c) => c.name === 'facing').forEach((c) => c.remove());
    const pos = VW.pagePos();
    const all = new paper.Group({ insert: false, name: 'multipage' });
    pos.forEach((r) => {
      const q = VP.doc.pages[r.i];
      const on = r.i === VP.doc.active;
      all.addChild(label('Sayfa ' + (r.i + 1) + (q.name && q.name !== 'Sayfa ' + (r.i + 1) ? ' · ' + q.name : ''), r.x, -6 / zoom(), on));
      if (on) return;
      const g = new paper.Group({ insert: false });
      g.data.mpPage = r.i;
      const rect = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(r.x, r.y, r.w, r.h), fillColor: q.bg || '#ffffff', insert: false });
      rect.shadowColor = new paper.Color(0, 0, 0, 0.3);
      rect.shadowBlur = 0;
      rect.shadowOffset = Pt(4, 4);
      rect.strokeColor = new paper.Color(0, 0, 0, 0.35);
      rect.strokeWidth = 1;
      rect.strokeScaling = false;
      g.addChild(rect);
      const art = pageArt(r.i);
      art.translate(Pt(r.x, r.y));
      const clip = new paper.Group({ insert: false });
      clip.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(r.x, r.y, r.w, r.h), insert: false }));
      clip.addChild(art);
      clip.clipped = true;
      clip.data.artPreview = true;
      g.addChild(clip);
      all.addChild(g);
    });
    VP.bgLayer.insertChild(0, all);
  };
  VW.fitAll = () => {
    const pos = VW.pagePos();
    let b = null;
    pos.forEach((r) => {
      const rr = new paper.Rectangle(r.x, r.y, r.w, r.h);
      b = b ? b.unite(rr) : rr;
    });
    if (!b) return;
    const v = paper.view;
    const vs = v.viewSize;
    v.zoom = clamp(Math.min((vs.width - 60) / b.width, (vs.height - 70) / b.height), VP.ZMIN, VP.ZMAX);
    v.center = b.center;
    VP.viewChanged();
  };
  VW.toggleMulti = () => {
    S.multiPage = !S.multiPage;
    VP.io.savePrefs();
    VP.drawPage();
    if (S.multiPage) {
      if (VP.doc.pages.length < 2) VP.toast('Çoklu sayfa görünümü açık · Belgede tek sayfa var (Mizanpaj › Sayfa ekle)');
      else {
        VW.fitAll();
        VP.toast('Çoklu sayfa görünümü · Başka bir sayfada çalışmak için ona dokunun');
      }
    } else {
      VP.fitPage();
      VP.toast('Tek sayfa görünümü');
    }
    redraw();
  };
  // a tap on another page makes it the active page, without moving the view
  VW.pageAt = (pt) => {
    if (!S.multiPage || VP.doc.pages.length < 2) return -1;
    const r = VW.pagePos().find((q) => q.i !== VP.doc.active && new paper.Rectangle(q.x, q.y, q.w, q.h).contains(pt));
    return r ? r.i : -1;
  };
  VW.switchTo = (i) => {
    const r = VW.pagePos()[i];
    if (!r) return;
    const off = Pt(r.x, r.y);
    VP.storePage();
    if (VP.makeThumb) VP.makeThumb();
    VP.loadPage(i, { keepView: true });
    paper.view.center = paper.view.center.subtract(off);
    VP.viewChanged();
    VP.dirty();
    UI.schedule('status', 'dock', 'prop');
  };
  const bindCanvas = () => {
    const cv = $('#canvas');
    if (!cv || cv._vwBound) return;
    cv._vwBound = true;
    cv.addEventListener('pointerdown', (e) => {
      if (!S.multiPage || e.button === 2) return;
      const r = cv.getBoundingClientRect();
      const pt = paper.view.viewToProject(Pt(e.clientX - r.left, e.clientY - r.top));
      const p = VP.page();
      if (new paper.Rectangle(0, 0, p.w, p.h).contains(pt)) return;
      const i = VW.pageAt(pt);
      if (i >= 0) VW.switchTo(i);
    }, true);
  };
  VP.on('page', () => S.multiPage && VP.drawPage());
  VP.on('doc', () => S.multiPage && VP.drawPage());
  VP.on('view', () => {
    // page labels keep their screen size
    if (S.multiPage && VP.doc.pages.length > 1 && Math.abs(zoom() - (VW._lz || 0)) / zoom() > 0.25) {
      VW._lz = zoom();
      VP.drawPage();
    }
  });

  /* ======================================================================
     DRAWING SCALE
     ====================================================================== */
  const UNITS = { mm: 1, cm: 10, m: 1000, km: 1e6, in: 25.4, ft: 304.8 };
  const UNIT_NAMES = { mm: 'mm', cm: 'cm', m: 'm', km: 'km', in: 'inç', ft: 'fit' };
  VW.unitLabel = () => UNIT_NAMES[VW.scale().unit];
  VW.scaleText = () => {
    const s = VW.scale();
    const f = (n) => VP.num(n, n % 1 ? 2 : 0);
    return f(s.page) + ':' + f(s.world) + (s.unit !== 'mm' ? ' (' + UNIT_NAMES[s.unit] + ')' : '');
  };
  // shared with the dimension tool
  VP.dimLen = (mmv) => (VW.scaled() ? { v: VW.toWorld(mmv), u: ' ' + VW.unitLabel() } : { v: mmv, u: ' mm' });
  const setPos0 = UI.setPos;
  UI.setPos = (pt) => {
    if (!VW.scaled()) return setPos0(pt);
    const n = (v) => VP.num(VW.toWorld(VP.toMM(v)), 2);
    const el = $('#st-pos');
    if (el) el.textContent = 'x ' + n(pt.x) + '  y ' + n(pt.y) + ' ' + VW.unitLabel();
  };
  const nice = [];
  for (let e = -4; e <= 7; e++) [1, 2, 5].forEach((m) => nice.push(m * Math.pow(10, e)));
  const rul0 = UI.drawRulers;
  UI.drawRulers = () => {
    const corner = $('#ruler-corner');
    if (!VW.scaled()) {
      if (corner) {
        corner.textContent = 'mm';
        corner.title = 'Cetvel birimi: mm';
      }
      return rul0();
    }
    rul0();
    if (!S.rulers || !paper.view) return;
    if (corner) {
      corner.textContent = VW.unitLabel();
      corner.title = 'Çizim ölçeği ' + VW.scaleText();
    }
    const v = paper.view;
    const z = v.zoom;
    const vb = v.bounds;
    const wpp = VW.toWorld(VP.toMM(1)); // world units per point
    const pxPerW = z / wpp;
    const minor = nice.find((s) => s * pxPerW >= 6) || nice[nice.length - 1];
    const major = nice.find((s) => s >= minor * 5 && s * pxPerW >= 48) || minor * 10;
    const cs = getComputedStyle(document.documentElement);
    const fg = cs.getPropertyValue('--muted').trim() || '#666';
    const dpr = window.devicePixelRatio || 1;
    const prep = (cv) => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = fg;
      ctx.fillStyle = fg;
      ctx.lineWidth = 1;
      ctx.font = '9.5px "Fira Mono", ui-monospace, monospace';
      return { ctx, w, h };
    };
    const lab = (n) => VP.num(Math.round(n * 1000) / 1000, Math.abs(n) < 10 && n % 1 ? 2 : 0);
    const run = (cv, lo, hi, horiz) => {
      const { ctx, w, h } = prep(cv);
      const a = Math.floor((lo * wpp) / minor) * minor;
      const b = hi * wpp;
      ctx.beginPath();
      for (let m = a; m <= b + 1e-9; m += minor) {
        const p = Math.round((m / wpp - lo) * z) + 0.5;
        const isMaj = Math.abs(m / major - Math.round(m / major)) < 1e-6;
        const isHalf = Math.abs((m * 2) / major - Math.round((m * 2) / major)) < 1e-6;
        const len = (horiz ? h : w) * (isMaj ? 0.62 : isHalf ? 0.38 : 0.22);
        if (horiz) {
          ctx.moveTo(p, h);
          ctx.lineTo(p, h - len);
          if (isMaj) ctx.fillText(lab(m), p + 3, 10);
        } else {
          ctx.moveTo(w, p);
          ctx.lineTo(w - len, p);
          if (isMaj) {
            ctx.save();
            ctx.translate(10, p + 3);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'right';
            ctx.fillText(lab(m), 0, 0);
            ctx.restore();
          }
        }
      }
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    run($('#ruler-top'), vb.left, vb.right, true);
    run($('#ruler-left'), vb.top, vb.bottom, false);
  };
  const PRESETS = [[1, 1], [1, 2], [1, 5], [1, 10], [1, 20], [1, 25], [1, 50], [1, 100], [1, 200], [1, 500], [1, 1000], [1, 5000], [2, 1], [5, 1], [10, 1]];
  VW.scaleDialog = () => {
    const s = VW.scale();
    const ratio = s.world / s.page; // real mm per page mm
    const curP = PRESETS.find(([a, b]) => Math.abs(b / a - ratio) < 1e-9);
    const cur = curP ? curP[0] + ':' + curP[1] : 'custom';
    const presetOpts = PRESETS.map(([a, b]) => '<option value="' + a + ':' + b + '"' + (cur === a + ':' + b ? ' selected' : '') + '>' + a + ':' + b + (a === 1 && b === 1 ? ' (gerçek boyut)' : '') + '</option>').join('') + '<option value="custom"' + (cur === 'custom' ? ' selected' : '') + '>Özel</option>';
    const unitOpts = Object.keys(UNITS).map((u) => '<option value="' + u + '"' + (u === s.unit ? ' selected' : '') + '>' + UNIT_NAMES[u] + '</option>').join('');
    const inp = (k, v) => '<input data-sc="' + k + '" value="' + esc(VP.num(v, v % 1 ? 3 : 0)) + '" inputmode="decimal" style="width:80px;font:15px var(--font-num);padding:6px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);color:var(--fg);-webkit-user-select:text;user-select:text">';
    UI.modal('<h2>Çizim ölçeği</h2><p>Cetveller, imleç konumu ve ölçü çizgileri gerçek boyutları gösterir. Nesnelerin sayfadaki boyutu değişmez.</p>' +
      '<label class="field"><span>Hazır ölçek</span><select data-sc="preset">' + presetOpts + '</select></label>' +
      '<div class="row"><span class="opt-label">Sayfa</span>' + inp('page', s.page) + '<span class="opt-label">mm =</span>' + inp('world', s.worldU) + '<label class="field"><span>Birim</span><select data-sc="unit">' + unitOpts + '</select></label></div>' +
      '<p class="sec-note" data-sc="note"></p>' +
      '<div class="actions"><button class="btn" data-x="reset">Gerçek boyut</button><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Tamam</button></div>', (root, close) => {
      const g = (k) => root.querySelector('[data-sc="' + k + '"]');
      const note = () => {
        const a = VP.parseNum(g('page').value);
        const b = VP.parseNum(g('world').value);
        const u = g('unit').value;
        g('note').textContent = a > 0 && b > 0 ? 'Ölçek 1:' + VP.num((b * UNITS[u]) / a, 2) + ' · A4 sayfanın eni gerçekte ' + VP.num((210 * b) / a, 2) + ' ' + UNIT_NAMES[u] : 'Sıfırdan büyük değerler girin';
      };
      // a preset is a ratio: 1:50 means 1 mm on the page is 50 mm (5 cm, 0,05 m) in reality
      const fromPreset = () => {
        const v = g('preset').value;
        if (v === 'custom') return;
        const [a, b] = v.split(':').map(Number);
        g('page').value = VP.num(a, 0);
        g('world').value = VP.num(b / UNITS[g('unit').value], 6);
        note();
      };
      g('preset').addEventListener('change', fromPreset);
      ['page', 'world'].forEach((k) => g(k).addEventListener('input', () => {
        g('preset').value = 'custom';
        note();
      }));
      g('unit').addEventListener('change', () => (g('preset').value === 'custom' ? note() : fromPreset()));
      note();
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'no') return close();
        VP.doc.ext = VP.doc.ext || {};
        if (b.dataset.x === 'reset') delete VP.doc.ext.scale;
        else {
          const pa = VP.parseNum(g('page').value);
          const wo = VP.parseNum(g('world').value);
          if (!(pa > 0 && wo > 0)) return;
          VP.doc.ext.scale = { page: pa, world: wo * UNITS[g('unit').value], unit: g('unit').value };
        }
        close();
        afterScale();
      });
    });
  };
  // stored as page mm : world mm, shown in the chosen unit
  VW.scale = () => {
    const s = (VP.doc && VP.doc.ext && VP.doc.ext.scale) || null;
    if (!s) return { page: 1, world: 1, unit: 'mm', worldU: 1 };
    const unit = UNITS[s.unit] ? s.unit : 'mm';
    return { page: +s.page || 1, world: +s.world || 1, unit, worldU: (+s.world || 1) / UNITS[unit] };
  };
  VW.toWorld = (mmv) => {
    const s = VW.scale();
    return (mmv * (s.world / s.page)) / UNITS[s.unit];
  };
  VW.scaled = () => {
    const s = VW.scale();
    return Math.abs(s.world / s.page - 1) > 1e-9 || s.unit !== 'mm';
  };
  VW.scaleText = () => {
    const s = VW.scale();
    return VP.num(s.page, s.page % 1 ? 2 : 0) + ' mm = ' + VP.num(s.worldU, s.worldU % 1 ? 2 : 0) + ' ' + UNIT_NAMES[s.unit];
  };
  const afterScale = () => {
    // dimension lines re-measure with the new scale
    VP.userLayers().forEach((L) => L.getItems({ match: (it) => FX.of(it) && FX.of(it).type === 'dimension' }).forEach((g) => FX.rebuild(g)));
    VP.commit();
    UI.drawRulers();
    UI.schedule('status', 'prop');
    VP.toast(VW.scaled() ? 'Çizim ölçeği: ' + VW.scaleText() : 'Gerçek boyut (1:1, mm)');
  };
  VP.on('doc', () => UI.drawRulers && UI.drawRulers());
  VP.on('page', () => UI.drawRulers && UI.drawRulers());

  /* ======================================================================
     COORDINATES DOCKER
     ====================================================================== */
  const CO = (VW.co = { kind: 'rect', ref: 'tl', x: VP.toPT(20), y: VP.toPT(20), w: VP.toPT(40), h: VP.toPT(25), r: 0, sides: 5, angle: 0, len: VP.toPT(50) });
  const KINDS = [['rect', 'Dikdörtgen', 'rect'], ['ellipse', 'Elips', 'ellipse'], ['polygon', 'Çokgen', 'polygon'], ['star', 'Yıldız', 'star'], ['line', 'Çizgi', 'line']];
  const REFS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
  const refUV = (r) => [r[1] === 'l' ? 0 : r[1] === 'r' ? 1 : 0.5, r[0] === 't' ? 0 : r[0] === 'b' ? 1 : 0.5];
  const mmf = (v, d = 2) => VP.num(VP.toMM(v), d);
  // read the selected object into the fields
  let selKey = '';
  const fromSel = () => {
    const it = VP.sel.length === 1 ? VP.sel[0] : null;
    if (!it) {
      selKey = '';
      return false;
    }
    const key = it.id + ':' + it.bounds.toString() + ':' + CO.ref;
    if (key === selKey) return true;
    selKey = key;
    const p = it.data && it.data.param;
    const [u, v] = refUV(CO.ref);
    if (p && ['rect', 'ellipse', 'polygon'].includes(p.kind)) {
      CO.kind = p.kind === 'polygon' ? (p.star ? 'star' : 'polygon') : p.kind;
      CO.w = Math.abs(p.w);
      CO.h = Math.abs(p.h);
      CO.x = p.cx - CO.w / 2 + CO.w * u;
      CO.y = p.cy - CO.h / 2 + CO.h * v;
      CO.angle = p.angle || 0;
      if (p.kind === 'rect') CO.r = p.r || 0;
      if (p.kind === 'polygon') CO.sides = p.sides;
      return true;
    }
    if (it instanceof paper.Path && it.segments.length === 2 && !it.closed) {
      CO.kind = 'line';
      const a = it.firstSegment.point;
      const b = it.lastSegment.point;
      CO.x = a.x;
      CO.y = a.y;
      CO.len = a.getDistance(b);
      CO.angle = VP.norm ? VP.norm(-b.subtract(a).angle) : -b.subtract(a).angle;
      return true;
    }
    const b = it.bounds;
    CO.w = b.width;
    CO.h = b.height;
    CO.x = b.left + b.width * u;
    CO.y = b.top + b.height * v;
    return true;
  };
  const coPanel = () => {
    const linked = fromSel();
    const one = VP.sel.length === 1 ? VP.sel[0] : null;
    let h = '<div class="sec"><div class="sec-h"><h3>Nesne</h3></div><div class="row">' + KINDS.map(([k, l, i]) => '<button class="btn icon-only' + (CO.kind === k ? ' on' : '') + '" data-act="coKind:' + k + '" title="' + l + '" aria-label="' + l + '">' + ic(i, 'sm') + '</button>').join('') + '</div>' +
      '<p class="sec-note">' + (one ? (linked ? 'Seçili nesnenin değerleri · “Değiştir” ile uygulayın' : 'Seçili nesne') : 'Değerleri girip “Nesne oluştur”a dokunun') + '</p></div>';
    h += '<div class="sec"><div class="sec-h"><h3>Konum</h3></div>';
    if (CO.kind !== 'line') {
      h += '<div class="row"><span class="pb-label">Başvuru noktası</span><span style="display:inline-grid;grid-template-columns:repeat(3,22px);gap:2px">' + REFS.map((r) => '<button data-act="coRef:' + r + '" title="Başvuru noktası" style="width:22px;height:22px;padding:0;border:1px solid var(--line);border-radius:3px;background:' + (CO.ref === r ? 'var(--accent)' : 'var(--panel-2)') + '"></button>').join('') + '</span></div>';
    }
    h += '<div class="row">' + H.dfieldPf('X', 'coX', mmf(CO.x)) + H.dfieldPf('Y', 'coY', mmf(CO.y)) + '</div></div>';
    h += '<div class="sec"><div class="sec-h"><h3>Boyut</h3></div>';
    if (CO.kind === 'line') h += '<div class="row">' + H.dfieldPf('Uzunluk', 'coLen', mmf(CO.len)) + H.dfieldPf('Açı', 'coAngle', VP.num(CO.angle, 1), '°') + '</div>';
    else {
      h += '<div class="row">' + H.dfieldPf('Genişlik', 'coW', mmf(CO.w)) + H.dfieldPf('Yükseklik', 'coH', mmf(CO.h)) + '</div>';
      h += '<div class="row">' + H.dfieldPf('Açı', 'coAngle', VP.num(CO.angle, 1), '°') + (CO.kind === 'rect' ? H.dfieldPf('Köşe', 'coR', mmf(CO.r, 1)) : '') + (CO.kind === 'polygon' || CO.kind === 'star' ? H.dfieldPf(CO.kind === 'star' ? 'Uç' : 'Kenar', 'coSides', CO.sides, '') : '') + '</div>';
    }
    if (VW.scaled()) h += '<p class="sec-note">Değerler sayfa milimetresidir · Gerçek boyut: ' + esc(CO.kind === 'line' ? VP.num(VW.toWorld(VP.toMM(CO.len)), 2) : VP.num(VW.toWorld(VP.toMM(CO.w)), 2) + ' × ' + VP.num(VW.toWorld(VP.toMM(CO.h)), 2)) + ' ' + esc(VW.unitLabel()) + ' (' + esc(VW.scaleText()) + ')</p>';
    h += '</div><div class="row"><button class="btn primary" data-act="coCreate">' + ic('plus', 'sm') + 'Nesne oluştur</button>' + (one ? '<button class="btn" data-act="coApply">Değiştir</button>' : '') + '</div>';
    return h;
  };
  UI.panels = UI.panels || {};
  UI.panels.coords = coPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'coords')) UI.DOCKERS.push(['coords', 'Koordinatlar']);
  const build = () => {
    const d = VP.defaults;
    if (CO.kind === 'line') {
      const a = Pt(CO.x, CO.y);
      const b = a.add(Pt(CO.len, 0).rotate(-CO.angle));
      const p = new paper.Path({ segments: [a, b], strokeColor: d.stroke || '#1d1d1b', strokeWidth: d.strokeWidth || 1, strokeCap: d.cap, insert: false });
      p.data.dash = d.dash;
      if (VP.applyDash) VP.applyDash(p);
      return p;
    }
    const [u, v] = refUV(CO.ref);
    const w = Math.max(0.5, CO.w);
    const hh = Math.max(0.5, CO.h);
    const prm = { kind: CO.kind === 'star' ? 'polygon' : CO.kind, cx: CO.x - w * u + w / 2, cy: CO.y - hh * v + hh / 2, w, h: hh, angle: CO.angle || 0 };
    if (CO.kind === 'rect') prm.r = CO.r || 0;
    if (CO.kind === 'polygon' || CO.kind === 'star') {
      prm.sides = clamp(Math.round(CO.sides || 5), 3, 100);
      prm.star = CO.kind === 'star';
      prm.inner = d.polyInner || 0.5;
    }
    const it = VP.createParam(prm);
    it.remove();
    return it;
  };
  VW.coCreate = () => {
    VP.ensureLayer();
    const it = build();
    VP.activeLayer.addChild(it);
    VP.setSelection([it]);
    VP.commit();
    VP.toast(KINDS.find(([k]) => k === CO.kind)[1] + ' oluşturuldu');
  };
  VW.coApply = () => {
    const old = VP.sel.length === 1 ? VP.sel[0] : null;
    if (!old) return VP.toast('Önce bir nesne seçin');
    const p = old.data && old.data.param;
    const sameParam = p && ((CO.kind === 'rect' && p.kind === 'rect') || (CO.kind === 'ellipse' && p.kind === 'ellipse') || ((CO.kind === 'polygon' || CO.kind === 'star') && p.kind === 'polygon'));
    if (sameParam || (CO.kind === 'line' && old instanceof paper.Path && old.segments.length === 2)) {
      const it = build();
      it.style = old.style;
      it.opacity = old.opacity;
      it.blendMode = old.blendMode;
      Object.assign(it.data, old.data, it.data.param ? { param: it.data.param } : {});
      it.insertAbove(old);
      old.remove();
      VP.setSelection([it]);
    } else {
      // any other object: move and size it by its bounding box
      const [u, v] = refUV(CO.ref);
      const b = old.bounds;
      if (b.width > 0 && b.height > 0 && CO.kind !== 'line') old.scale(Math.max(0.5, CO.w) / b.width, Math.max(0.5, CO.h) / b.height, b.topLeft);
      const nb = old.bounds;
      old.translate(Pt(CO.x - (nb.left + nb.width * u), CO.y - (nb.top + nb.height * v)));
      VP.setSelection([old]);
    }
    VP.commit();
  };
  VW.propField = (name, raw) => {
    const v = VP.parseNum(raw);
    if (!isFinite(v)) return true;
    const P = (x) => VP.toPT(x);
    switch (name) {
      case 'coX': CO.x = P(v); break;
      case 'coY': CO.y = P(v); break;
      case 'coW': if (v > 0) CO.w = P(v); break;
      case 'coH': if (v > 0) CO.h = P(v); break;
      case 'coR': if (v >= 0) CO.r = P(v); break;
      case 'coLen': if (v > 0) CO.len = P(v); break;
      case 'coAngle': CO.angle = v; break;
      case 'coSides': if (v >= 3) CO.sides = Math.round(v); break;
      default: return true;
    }
    return true;
  };
  VW.act = (id) => {
    const [k, arg] = id.split(':');
    switch (k) {
      case 'coKind': CO.kind = arg; if (VP.sel.length) VP.clearSelection(); return true;
      case 'coRef': CO.ref = arg; return true;
      case 'coCreate': VW.coCreate(); return true;
      case 'coApply': VW.coApply(); return true;
      default: return false;
    }
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^co[A-Z]/.test(n) ? VW.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^co[A-Z]/.test(id) ? VW.act(id, el) : act0(id, el));

  /* ======================================================================
     actions and menus
     ====================================================================== */
  MODES.forEach(([k, l]) => {
    A['vm_' + k] = { label: l, checked: () => S.viewMode === k, run: () => VW.setMode(k) };
  });
  Object.assign(A, {
    pixelGrid: { label: 'Piksel ızgarası', checked: () => !!S.pixelGrid, run: () => { S.pixelGrid = !S.pixelGrid; VP.io.savePrefs(); redraw(); VP.toast(S.pixelGrid ? 'Piksel ızgarası açık · Piksel görünümünde çok yakınlaşınca görünür' : 'Piksel ızgarası kapalı'); } },
    multiPage: { label: 'Çoklu sayfa görünümü', icon: 'pages', checked: () => !!S.multiPage, run: () => VW.toggleMulti() },
    drawScale: { label: 'Çizim ölçeği…', icon: 'ruler', run: () => VW.scaleDialog() },
    dockCoords: { label: 'Koordinatlar', icon: 'grid', run: () => UI.openDock('coords') }
  });
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => x !== '|' && !x.startsWith('h:') && !x.startsWith('sub:') && M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };
  ins('view', null, ['|', 'h:Görünüm modu'].concat(MODES.map(([k]) => 'vm_' + k)).concat(['pixelGrid', '|', 'multiPage']));
  // keep the view menu short: modes at the very top, as in the desktop suite
  {
    const M = UI.MENUS.view;
    const ids = ['h:Görünüm modu'].concat(MODES.map(([k]) => 'vm_' + k), ['pixelGrid']);
    const at = M.indexOf('h:Görünüm modu');
    if (at > 0) {
      M.splice(at - 1, ids.length + 1);
      M.unshift(...ids, '|');
    }
  }
  ins('layout', 'pageSetup', ['drawScale']);
  ins('window', 'dockStep', ['dockCoords']);
  // the classic skin's Window menu lists the dockers by name; the new docker joins it
  const st0 = () => {
    bindCanvas();
    if (S.multiPage) VP.drawPage();
    UI.drawRulers && UI.drawRulers();
  };
  if (document.readyState === 'complete') setTimeout(st0, 0);
  else addEventListener('load', () => setTimeout(st0, 0));
})();
