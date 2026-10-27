/* VektörPad outline pen extras, multi-colour gradients and pattern/texture transparency.
   - Outline pen: arrowheads, calligraphic nib (stretch and angle), outline behind fill, outline position
     (outside, centre, inside). Paths keep their ordinary stroke data; the look is drawn on screen by a small
     addition to the drawing engine and turned into real shapes when exporting (SVG, PDF).
   - Gradients with any number of colour stops (interactive fill tool and Properties docker).
   - Transparency by conical, square, pattern and texture masks (a live effect that renders the object).
   - PDF export: soft shadows become images under their objects (PDF has no blur). */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const mm = H.mm;
  const T = VP.tools;
  const OL = (VP.outline = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);
  const one = () => (VP.sel.length === 1 ? VP.sel[0] : null);
  const live = (el) => !el || !el.dataset.live || UI._rangeDone;

  /* =============== geometry =============== */
  OL.ARROWS = [['none', 'Yok'], ['arrow', 'Dolu ok'], ['stealth', 'Sivri ok'], ['open', 'Açık ok'], ['circle', 'Daire'], ['square', 'Kare'], ['diamond', 'Baklava'], ['bar', 'Dik çizgi']];
  const circlePts = (c, r) => {
    const out = [];
    for (let i = 0; i < 24; i++) out.push(c.add(Pt(r, 0).rotate(i * 15)));
    return out;
  };
  // shapes for one end: [{pts, fill} | {pts, stroke, closed}]
  const headAt = (type, P, dir, sw, size) => {
    const L = Math.max(sw * size, sw * 3, 1.5);
    const W = L * 0.8;
    const n = Pt(-dir.y, dir.x);
    const Tp = P.add(dir.multiply(sw * 1.6));
    const B = Tp.subtract(dir.multiply(L));
    switch (type) {
      case 'arrow': return [{ pts: [Tp, B.add(n.multiply(W / 2)), B.subtract(n.multiply(W / 2))], fill: true }];
      case 'stealth': return [{ pts: [Tp, B.add(n.multiply(W / 2)), Tp.subtract(dir.multiply(L * 0.7)), B.subtract(n.multiply(W / 2))], fill: true }];
      case 'open': {
        const t = P.add(dir.multiply(sw * 0.3));
        const b = t.subtract(dir.multiply(L));
        return [{ pts: [b.add(n.multiply(W / 2)), t, b.subtract(n.multiply(W / 2))], stroke: true }];
      }
      case 'circle': return [{ pts: circlePts(P, W * 0.42), fill: true }];
      case 'square': {
        const a = dir.multiply(W * 0.36);
        const b = n.multiply(W * 0.36);
        return [{ pts: [P.add(a).add(b), P.add(a).subtract(b), P.subtract(a).subtract(b), P.subtract(a).add(b)], fill: true }];
      }
      case 'diamond': return [{ pts: [P.add(dir.multiply(L * 0.5)), P.add(n.multiply(W * 0.45)), P.subtract(dir.multiply(L * 0.5)), P.subtract(n.multiply(W * 0.45))], fill: true }];
      case 'bar': return [{ pts: [P.add(n.multiply(W / 2)), P.subtract(n.multiply(W / 2))], stroke: true }];
      default: return [];
    }
  };
  OL.arrowGeo = (p) => {
    const a = p.data.arrows;
    if (!a || p.closed || p.segments.length < 2) return [];
    const sw = p.strokeWidth || 1;
    const size = a.size || 4;
    const L = p.length;
    if (!(L > 0)) return [];
    let out = [];
    if (a.s && a.s !== 'none') {
      const t = p.getTangentAt(Math.min(L, 0.01));
      if (t) out = out.concat(headAt(a.s, p.firstSegment.point, t.multiply(-1).normalize(), sw, size));
    }
    if (a.e && a.e !== 'none') {
      const t = p.getTangentAt(Math.max(0, L - 0.01));
      if (t) out = out.concat(headAt(a.e, p.lastSegment.point, t.normalize(), sw, size));
    }
    return out;
  };
  // calligraphic outline: loops of points (an elliptical nib swept along the path)
  OL.nibGeo = (p) => {
    const nib = p.data.nib;
    const w = (p.strokeWidth || 1) / 2;
    const a = w;
    const b = Math.max(0.05, (w * clamp(nib.stretch, 1, 100)) / 100);
    const ang = ((nib.angle || 0) * Math.PI) / 180;
    const u = Pt(Math.cos(ang), Math.sin(ang));
    const v = Pt(-u.y, u.x);
    const L = p.length;
    if (!(L > 0)) return [];
    const n = clamp(Math.ceil(L / Math.max(0.4, w * 0.35)), 8, 3000);
    const left = [];
    const right = [];
    for (let i = 0; i <= n; i++) {
      const off = p.closed && i === n ? 0 : (L * i) / n;
      const q = p.getPointAt(off);
      const nn = p.getNormalAt(off);
      if (!q || !nn) continue;
      const h = Math.sqrt(a * a * nn.dot(u) ** 2 + b * b * nn.dot(v) ** 2);
      left.push(q.add(nn.multiply(h)));
      right.push(q.subtract(nn.multiply(h)));
    }
    if (p.closed) return [left, right];
    return [left.concat(right.reverse())];
  };
  const special = (it) => {
    const d = it._data;
    return !!(d && (d.arrows || d.nib || d.behindFill || (d.strokePos && d.strokePos !== 'center')));
  };
  OL.special = special;

  /* =============== screen drawing =============== */
  const tracePts = (ctx, pts, close) => {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (close) ctx.closePath();
  };
  const without = (st, key, fn) => {
    st[key] = () => false;
    try {
      fn();
    } finally {
      delete st[key];
    }
  };
  const cacheGeo = (it, key, make) => {
    const ver = (it._version || 0) + '|' + it.strokeWidth + '|' + JSON.stringify(it._data[key]) + '|' + it.closed;
    it._olCache = it._olCache || {};
    const c = it._olCache[key];
    if (c && c.ver === ver) return c.geo;
    const geo = make(it);
    it._olCache[key] = { ver, geo };
    return geo;
  };
  const drawSpecial = function (orig, ctx, param, vm, sm) {
    const st = this._style;
    const hasStroke = st.hasStroke();
    const d = this._data;
    const args = [ctx, param, vm, sm];
    if (!hasStroke) return orig.apply(this, args);
    const isPath = this instanceof paper.Path;
    const pos = d.strokePos || 'center';
    const nib = d.nib && isPath && d.nib.stretch < 100 ? d.nib : null;
    const behind = d.behindFill || pos === 'outside';
    const strokeStyle = () => st.getStrokeColor().toCanvasStyle(ctx, this._matrix);
    const path2d = () => new Path2D(this.getPathData());
    if (nib) {
      const loops = cacheGeo(this, 'nib', OL.nibGeo);
      const drawNib = () => {
        if (!loops.length) return;
        this._setStyles(ctx, param, vm);
        ctx.beginPath();
        loops.forEach((l) => l.length > 1 && tracePts(ctx, l, true));
        ctx.fillStyle = strokeStyle();
        ctx.fill('evenodd');
      };
      if (behind) drawNib();
      without(st, 'hasStroke', () => orig.apply(this, args));
      if (!behind) drawNib();
    } else if (pos === 'inside' && (this.closed || this instanceof paper.CompoundPath)) {
      without(st, 'hasStroke', () => orig.apply(this, args));
      const p2 = path2d();
      ctx.save();
      ctx.clip(p2, st.getFillRule());
      this._setStyles(ctx, param, vm);
      ctx.lineWidth = st.getStrokeWidth() * 2;
      ctx.stroke(p2);
      ctx.restore();
    } else if (behind) {
      const p2 = path2d();
      ctx.save();
      without(st, 'hasFill', () => this._setStyles(ctx, param, vm));
      ctx.lineWidth = st.getStrokeWidth() * (pos === 'outside' ? 2 : 1);
      ctx.stroke(p2);
      ctx.restore();
      without(st, 'hasStroke', () => orig.apply(this, args));
    } else orig.apply(this, args);
    if (d.arrows && isPath) {
      const geo = cacheGeo(this, 'arrows', OL.arrowGeo);
      if (geo.length) {
        this._setStyles(ctx, param, vm);
        const col = strokeStyle();
        ctx.setLineDash && ctx.setLineDash([]);
        geo.forEach((g) => {
          ctx.beginPath();
          tracePts(ctx, g.pts, !!g.fill);
          if (g.fill) {
            ctx.fillStyle = col;
            ctx.fill();
          } else {
            ctx.strokeStyle = col;
            ctx.lineWidth = st.getStrokeWidth();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
          }
        });
      }
    }
  };
  [paper.Path, paper.CompoundPath].forEach((K) => {
    const orig = K.prototype._draw;
    K.prototype._draw = function (ctx, param, vm, sm) {
      if (param.dontFinish || param.clip || !special(this)) return orig.call(this, ctx, param, vm, sm);
      // a problem in the extra look never stops the drawing of the page
      try {
        ctx.save();
        drawSpecial.call(this, orig, ctx, param, vm, sm);
        ctx.restore();
      } catch (e) {
        ctx.restore();
        if (!K._warned) {
          K._warned = true;
          console.warn('outline extras skipped', e);
        }
        return orig.call(this, ctx, param, vm, sm);
      }
    };
  });

  /* =============== export: real shapes =============== */
  const flatten = (it) => {
    const d = it.data;
    const col = it.strokeColor;
    const sw = it.strokeWidth;
    const made = [];
    const pos = d.strokePos || 'center';
    if (it instanceof paper.Path && d.arrows && col) {
      OL.arrowGeo(it).forEach((g) => {
        const p = new paper.Path({ segments: g.pts, closed: !!g.fill, insert: false });
        if (g.fill) p.fillColor = col;
        else {
          p.strokeColor = col;
          p.strokeWidth = sw;
          p.strokeCap = 'round';
          p.strokeJoin = 'round';
        }
        p.transform(it.matrix);
        made.push(['above', p]);
      });
    }
    const behind = d.behindFill || pos === 'outside';
    if (it instanceof paper.Path && d.nib && d.nib.stretch < 100 && col) {
      const loops = OL.nibGeo(it);
      const cp = new paper.CompoundPath({ children: loops.map((l) => new paper.Path({ segments: l, closed: true, insert: false })), fillRule: 'evenodd', insert: false });
      cp.fillColor = col;
      cp.transform(it.matrix);
      made.push([behind ? 'below' : 'above', cp]);
      it.strokeColor = null;
    } else if (col && pos === 'inside' && (it.closed || it instanceof paper.CompoundPath)) {
      const g = new paper.Group({ insert: false });
      const m = it.clone({ insert: false });
      m.data = {};
      m.strokeColor = null;
      m.fillColor = '#000000';
      const s = it.clone({ insert: false });
      s.data = {};
      s.fillColor = null;
      s.strokeWidth = sw * 2;
      g.addChildren([m, s]);
      g.clipped = true;
      made.push(['above', g]);
      it.strokeColor = null;
    } else if (col && behind) {
      const s = it.clone({ insert: false });
      s.data = {};
      s.fillColor = null;
      s.strokeWidth = sw * (pos === 'outside' ? 2 : 1);
      made.push(['below', s]);
      it.strokeColor = null;
    }
    ['arrows', 'nib', 'behindFill', 'strokePos'].forEach((k) => delete d[k]);
    let above = it;
    made.forEach(([where, p]) => {
      if (where === 'below') p.insertBelow(it);
      else {
        p.insertAbove(above);
        above = p;
      }
    });
  };
  VP.io.exportHooks = VP.io.exportHooks || [];
  VP.io.exportHooks.push((proj, index, opts) => {
    proj.getItems({ match: (it) => (it instanceof paper.Path || it instanceof paper.CompoundPath) && special(it) }).forEach(flatten);
    // PDF has no blur filters: soft shadows go in as images under their objects
    if (opts && opts.pdf && VP.fx2) {
      proj.getItems({ match: (it) => it.data && it.data.shadow }).forEach((it) => {
        const s = it.data.shadow;
        const sil = VP.fx2.silhouette(it, s.color);
        const r = s.blur > 0.3 ? VP.fx2.softRaster(sil, s.blur) : sil;
        if (!r) return;
        r.translate(Pt(s.dx, s.dy));
        r.opacity = s.alpha;
        r.insertBelow(it);
      });
    }
  });

  /* =============== multi-colour gradients =============== */
  const grad = (it) => (it && it.fillColor && it.fillColor.type === 'gradient' ? it.fillColor : null);
  const stopsArr = (c) => c.gradient.stops.map((s) => [s.color.clone(), s.offset == null ? 0 : s.offset]);
  const midsOf = (it) => {
    const g = grad(it);
    return g && g.gradient.stops.length > 2 ? stopsArr(g).slice(1, -1) : null;
  };
  const setStops = (it, stops, g) => {
    g = g || grad(it);
    stops = stops.slice().sort((a, b) => a[1] - b[1]);
    it.fillColor = new paper.Color({ gradient: { stops, radial: g.gradient.radial }, origin: g.origin, destination: g.destination, highlight: g.highlight });
  };
  const withMids = (it, mids) => {
    const g = grad(it);
    if (!g || !mids) return;
    const st = stopsArr(g);
    setStops(it, [st[0], ...mids, st[st.length - 1]], g);
  };
  OL.withMids = withMids;
  const sf0 = VP.setFill;
  VP.setFill = (items, spec) => {
    const saved = new Map();
    if (spec.type === 'linear' || spec.type === 'radial') VP.leafItems(items).forEach((it) => {
      const m = midsOf(it);
      if (m) saved.set(it, m);
    });
    sf0(items, spec);
    saved.forEach((m, it) => withMids(it, m));
  };
  const F = VP.fill;
  const ssc0 = F.setStopColor;
  F.setStopColor = (it, i, hex) => {
    const m = midsOf(it);
    const r = ssc0(it, i, hex);
    withMids(it, m);
    return r;
  };
  const FT = T.fillTool;
  const lerpC = (a, b, t) => new paper.Color(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t, a.alpha + (b.alpha - a.alpha) * t);
  const colorAt = (st, t) => {
    for (let i = 1; i < st.length; i++) {
      if (t <= st[i][1]) {
        const [c0, o0] = st[i - 1];
        const [c1, o1] = st[i];
        return lerpC(c0.convert('rgb'), c1.convert('rgb'), clamp((t - o0) / (o1 - o0 || 1), 0, 1));
      }
    }
    return st[st.length - 1][0].clone();
  };
  OL.addStop = (it, t) => {
    const g = grad(it);
    if (!g) return -1;
    const st = stopsArr(g);
    if (t == null) {
      // the middle of the widest gap
      let best = 0;
      for (let i = 1; i < st.length; i++) if (st[i][1] - st[i - 1][1] > st[best + 1][1] - st[best][1]) best = i - 1;
      t = (st[best][1] + st[best + 1][1]) / 2;
    }
    t = clamp(t, 0.01, 0.99);
    st.push([colorAt(st, t), t]);
    setStops(it, st, g);
    return stopsArr(grad(it)).findIndex((s) => Math.abs(s[1] - t) < 1e-9);
  };
  const projT = (g, p) => {
    const v = g.destination.subtract(g.origin);
    const L2 = v.x * v.x + v.y * v.y || 1;
    return clamp(p.subtract(g.origin).dot(v) / L2, 0, 1);
  };
  const fdown0 = FT.down;
  const fmove0 = FT.move;
  const fup0 = FT.up;
  const fov0 = FT.overlayAfter;
  FT.down = function (e) {
    const t = this.target();
    const g = grad(t);
    if (g && !FX.isFx(t)) {
      const st = stopsArr(g);
      const tol = (VP.coarse ? 22 : 11) / zoom();
      for (let i = 1; i < st.length - 1; i++) {
        const p = g.origin.add(g.destination.subtract(g.origin).multiply(st[i][1]));
        if (p.getDistance(e.point) <= tol) {
          this.midStop = i;
          this.stop = null;
          this.op = { type: 'mid', it: t, i, raw: e.point, changed: false };
          VP.drawOverlay();
          UI.schedule('prop');
          return;
        }
      }
      // double tap on the gradient line adds a colour stop
      const tt = projT(g, e.point);
      const onLine = g.origin.add(g.destination.subtract(g.origin).multiply(tt)).getDistance(e.point) <= tol && tt > 0.03 && tt < 0.97;
      const now = Date.now();
      if (onLine && this._lastTap && now - this._lastTap.t < 400 && this._lastTap.p.getDistance(e.point) < tol) {
        this._lastTap = null;
        this.midStop = OL.addStop(t, tt);
        this.stop = null;
        VP.commit();
        VP.drawOverlay();
        UI.schedule('prop', 'dock');
        VP.toast('Renk durağı eklendi · Paletten renk seçin, sürükleyerek kaydırın');
        return;
      }
      this._lastTap = onLine ? { t: now, p: e.point } : null;
    }
    this.midStop = null;
    const m = t ? midsOf(t) : null;
    this._mids = m;
    return fdown0.call(this, e);
  };
  FT.move = function (e) {
    const op = this.op;
    if (op && op.type === 'mid') {
      if (!op.changed && op.raw.getDistance(e.point) * zoom() < 4) return;
      const g = grad(op.it);
      if (!g) return;
      const st = stopsArr(g);
      st[op.i][1] = clamp(projT(g, e.point), 0.01, 0.99);
      const moved = st[op.i];
      setStops(op.it, st, g);
      op.i = stopsArr(grad(op.it)).findIndex((s) => s[1] === moved[1]);
      this.midStop = op.i;
      op.changed = true;
      VP.drawOverlay();
      return;
    }
    const it = op && op.it;
    const m = it ? midsOf(it) || this._mids : null;
    fmove0.call(this, e);
    if (it && m) withMids(it, m);
  };
  FT.up = function (e) {
    const op = this.op;
    if (op && op.type === 'mid') {
      this.op = null;
      if (op.changed) VP.commit();
      UI.schedule('prop', 'dock');
      return;
    }
    return fup0.call(this, e);
  };
  FT.overlayAfter = function (L) {
    fov0.call(this, L);
    const t = this.target();
    const g = grad(t);
    if (!g || FX.isFx(t)) return;
    const st = g.gradient.stops;
    const s = 1 / zoom();
    for (let i = 1; i < st.length - 1; i++) {
      const p = g.origin.add(g.destination.subtract(g.origin).multiply(st[i].offset));
      const on = this.midStop === i;
      L.addChild(new paper.Path.Circle({ center: p, radius: (VP.coarse ? 8 : 6) * s, fillColor: st[i].color, strokeColor: on ? '#d6362b' : acc(), strokeWidth: (on ? 2.5 : 1.5) * s, insert: false }));
    }
  };
  const fact0 = F.act;
  F.act = (id, el) => {
    const it = one();
    if (id === 'flSwap' && it && midsOf(it)) {
      const g = grad(it);
      setStops(it, stopsArr(g).map(([c, o]) => [c, 1 - o]), g);
      VP.commit();
      VP.drawOverlay();
      return true;
    }
    const m = it ? midsOf(it) : null;
    const r = fact0(id, el);
    if (m && id.startsWith('flType:') && grad(it)) {
      withMids(it, m);
      VP.commit();
    }
    return r;
  };
  const ac0 = UI.applyColor;
  UI.applyColor = (hex, kind) => {
    const it = one();
    if (kind === 'fill' && hex && VP.toolId === 'fillTool' && FT.midStop != null && grad(it) && FT.midStop < grad(it).gradient.stops.length - 1) {
      const st = stopsArr(grad(it));
      st[FT.midStop][0] = new paper.Color(hex);
      setStops(it, st);
      VP.commit();
      VP.drawOverlay();
      return;
    }
    return ac0(hex, kind);
  };

  /* =============== transparency masks (live effect) =============== */
  const Q = VP.fillfx;
  FX.NAMES.transpfx = VP.KIND_NAMES.transpfx = 'Desenli şeffaflık';
  const TK = { conical: 'Konik', square: 'Kare', pattern: 'Desen', texture: 'Doku' };
  const TDEF = {
    conical: { angle: 0, mirror: true },
    square: { angle: 0 },
    pattern: { pattern: 'stripes', size: VP.toPT(4), lw: 0.5, angle: 45 },
    texture: { texture: 'clouds', size: VP.toPT(18), detail: 5, seed: 7, angle: 0 }
  };
  const tsrc = (g) => g.children.find((c) => c.data.effectSrc);
  OL.buildTfx = (g) => {
    const fx = g.data.effect;
    const s = tsrc(g);
    if (!s) return;
    g.children.slice().forEach((c) => c !== s && c.remove());
    s.visible = true;
    const c = s.clone({ insert: false });
    s.visible = false;
    const b = c.strokeBounds;
    if (!(b.width > 0.3 && b.height > 0.3)) return;
    const dpi = clamp((72 * 1400) / Math.max(b.width, b.height, 1), 36, 300);
    let ras;
    let mr;
    try {
      ras = c.rasterize(dpi, false);
      const box = ras.bounds;
      const mfx = Object.assign({ cx: 0.5, cy: 0.5 }, fx, { c0: '#000000', c1: '#ffffff' });
      const content = fx.kind === 'pattern' ? Q.patternContent(mfx, box) : Q.imageContent(mfx, box);
      const mg = new paper.Group({ insert: false });
      mg.addChild(new paper.Path.Rectangle({ rectangle: box, fillColor: '#ffffff', insert: false }));
      mg.addChild(content);
      mr = mg.rasterize(dpi, false);
    } catch (e) {
      console.error(e);
      return;
    }
    const W = ras.width;
    const Hh = ras.height;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = Hh;
    const ctx = cv.getContext('2d');
    ctx.drawImage(mr.canvas, 0, 0, W, Hh);
    const md = ctx.getImageData(0, 0, W, Hh).data;
    const id = ras.getImageData(new paper.Rectangle(0, 0, W, Hh));
    const d = id.data;
    const t0 = clamp(fx.t0, 0, 100);
    const t1 = clamp(fx.t1, 0, 100);
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.299 * md[i] + 0.587 * md[i + 1] + 0.114 * md[i + 2]) / 255;
      d[i + 3] *= 1 - (t0 + (t1 - t0) * l) / 100;
    }
    ras.setImageData(id, Pt(0, 0));
    ras.data = { tfxRaster: true };
    ras.insertAbove(s);
    fx.ms = [g.matrix.scaling.x, g.matrix.scaling.y];
  };
  OL.applyTfx = (items, kind) => {
    const res = [];
    items.forEach((it) => {
      const fx0 = FX.of(it);
      if (fx0 && fx0.type === 'transpfx') {
        if (fx0.kind !== kind) Object.assign(fx0, TDEF[kind], { kind });
        OL.buildTfx(it);
        res.push(it);
        return;
      }
      if (FX.isFx(it) || it instanceof paper.Raster && false) {
        res.push(it);
        return;
      }
      if (it.data.transp) {
        delete it.data.transp;
        VP.fill.applyTransp(it);
      }
      const g = new paper.Group({ insert: false, applyMatrix: false });
      g.insertAbove(it);
      g.addChild(it);
      it.data.effectSrc = true;
      g.data.effect = Object.assign({ type: 'transpfx', kind, t0: 0, t1: 100, cx: 0.5, cy: 0.5 }, TDEF[kind]);
      OL.buildTfx(g);
      res.push(g);
    });
    VP.setSelection(res);
    VP.commit();
    return res;
  };
  const tfxClear = (g) => {
    const s = tsrc(g);
    g.children.slice().forEach((c) => c !== s && c.remove());
    if (!s) {
      g.remove();
      return [];
    }
    s.visible = true;
    delete s.data.effectSrc;
    s.transform(g.matrix);
    s.insertAbove(g);
    g.remove();
    return [s];
  };
  const tfxFields = (g, panel) => {
    const fx = g.data.effect;
    const f = panel ? H.dfieldPf : H.field;
    const row = (x) => (panel ? '<div class="row">' + x + '</div>' : x);
    const sel = (label, name, map, cur) => '<label class="field"><span>' + esc(label) + '</span><select data-pf="' + name + '">' + Object.keys(map).map((k) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(map[k]) + '</option>').join('') + '</select></label>';
    let h = panel ? '' : '<span class="pb-label">' + TK[fx.kind] + ' şeffaflık</span>';
    h += row('<span class="seg">' + Object.keys(TK).map((k) => '<button data-act="olTk:' + k + '" class="' + (k === fx.kind ? 'on' : '') + '">' + TK[k] + '</button>').join('') + '</span>');
    if (fx.kind === 'pattern') h += row(sel('Desen', 'olTPat', Q.PATTERNS, fx.pattern));
    if (fx.kind === 'texture') h += row(sel('Doku', 'olTTex', Q.TEXTURES, fx.texture));
    h += row(f('Başlangıç', 'olT0', Math.round(fx.t0), '%') + f('Bitiş', 'olT1', Math.round(fx.t1), '%') + f('Açı', 'olTAng', VP.num(fx.angle || 0, 0), '°'));
    if (fx.kind === 'pattern' || fx.kind === 'texture') h += row(f('Boyut', 'olTSize', mm(fx.size, 1)) + (fx.kind === 'texture' ? H.btn('olTSeed', 'Yeni desen', 'Rastgele yeni doku') : f('Kalınlık', 'olTLw', Math.round(fx.lw * 100), '%')));
    h += row(H.btn('olTSwap', 'Ters çevir', 'Saydam ve opak bölgeleri değiştir') + '<span class="pb-label">Saydamlık yüzdesi · 0 opak, 100 saydam</span>');
    return h + (panel ? '<div class="row"><button class="btn" data-act="fxSeparate">Ayır</button><button class="btn danger" data-act="fxClear">Kaldır</button></div>' : H.btn('fxMenu', 'Efekt ▾', 'Ayır veya kaldır'));
  };
  FX.TYPES.transpfx = {
    tool: 'transpTool',
    build: (g) => OL.buildTfx(g),
    probe: (g) => tsrc(g) || g,
    restyle(g, fn) {
      fn([tsrc(g)]);
      OL.buildTfx(g);
    },
    describe: (g) => TK[g.data.effect.kind] + ' şeffaflık',
    bake(g) {
      const s = tsrc(g);
      if (s) s.remove();
    },
    bakeMsg: 'Şeffaflık ayrıldı · Nesne artık bir biteşlem',
    clear: tfxClear,
    clearMsg: 'Şeffaflık kaldırıldı',
    dblTap(g) {
      VP.setSelection([g]);
      VP.setTool('transpTool');
    },
    fields: (g) => tfxFields(g, false),
    panel: (g) => tfxFields(g, true)
  };
  // after a resize the mask is redrawn at full quality
  const cm0 = VP.commit;
  VP.commit = function () {
    try {
      VP.userLayers().forEach((L) => L.getItems({ match: (it) => it.data && it.data.effect && it.data.effect.type === 'transpfx' }).forEach((g) => {
        const fx = g.data.effect;
        const sc = g.matrix.scaling;
        if (fx.ms && (Math.abs(sc.x / fx.ms[0] - 1) > 0.04 || Math.abs(sc.y / fx.ms[1] - 1) > 0.04)) {
          const s = tsrc(g);
          if (s) {
            s.transform(g.matrix);
            g.matrix = new paper.Matrix();
            OL.buildTfx(g);
          }
        }
      }));
    } catch (e) {
      console.error(e);
    }
    return cm0.apply(this, arguments);
  };
  // transparency tool: drag on a mask transparency to set its centre and angle
  const TT = T.transpTool;
  const tdown0 = TT.down;
  const tmove0 = TT.move;
  const tup0 = TT.up;
  TT.down = function (e) {
    const hit = VP.hitItem(e.point);
    const fx = FX.of(hit);
    if (fx && fx.type === 'transpfx') {
      if (VP.sel.length !== 1 || VP.sel[0] !== hit) VP.setSelection([hit]);
      this.op = { type: 'tfx', g: hit, start: e.point, changed: false };
      return;
    }
    return tdown0.call(this, e);
  };
  TT.move = function (e) {
    const op = this.op;
    if (op && op.type === 'tfx') {
      if (!op.changed && op.start.getDistance(e.point) * zoom() < 6) return;
      const fx = op.g.data.effect;
      const s = tsrc(op.g);
      const b = s.bounds;
      const ls = op.g.globalToLocal(op.start);
      const le = op.g.globalToLocal(e.point);
      if (fx.kind === 'conical' || fx.kind === 'square') {
        fx.cx = clamp((ls.x - b.left) / (b.width || 1), -0.5, 1.5);
        fx.cy = clamp((ls.y - b.top) / (b.height || 1), -0.5, 1.5);
      }
      fx.angle = Math.round(le.subtract(ls).angle);
      op.changed = true;
      VP.drawOverlay();
      return;
    }
    return tmove0.call(this, e);
  };
  TT.up = function (e) {
    const op = this.op;
    if (op && op.type === 'tfx') {
      this.op = null;
      if (op.changed) {
        OL.buildTfx(op.g);
        VP.commit();
        UI.schedule('prop', 'dock');
      }
      return;
    }
    return tup0.call(this, e);
  };

  /* =============== property bar, docker =============== */
  const arrowSel = (label, name, cur) => '<label class="field"><span>' + esc(label) + '</span><select data-pf="' + name + '" aria-label="' + esc(label) + '">' + OL.ARROWS.map(([k, l]) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>';
  const strokePaths = (items) => VP.leafItems(items || VP.sel).filter((it) => (it instanceof paper.Path || it instanceof paper.CompoundPath) && !FX.isFx(it));
  const fpb0 = VP.fill.propbar;
  VP.fill.propbar = () => {
    const h = fpb0();
    const it = one();
    if (VP.toolId === 'fillTool' && it && grad(it) && !FX.isFx(it)) {
      const ms = FT.midStop;
      const st = grad(it).gradient.stops;
      let x = H.sep + H.btn('olStopAdd', ic('plus', 'sm') + 'Durak', 'Renk durağı ekle (çizgiye çift dokunmak da ekler)');
      if (ms != null && ms > 0 && ms < st.length - 1) x += H.colorField('Durak', 'olStopC', VP.hex(st[ms].color)) + H.field('Konum', 'olStopP', Math.round(st[ms].offset * 100), '%') + H.btn('olStopDel', ic('minus', 'sm') + 'Sil', 'Seçili durağı sil');
      return (h || '') + x;
    }
    if (VP.toolId === 'transpTool') {
      const fx = FX.of(it);
      if (fx && fx.type === 'transpfx') return '<span class="pb-title">Şeffaflık</span>' + tfxFields(it, false);
      if (it && h) return h + H.sep + Object.keys(TK).map((k) => H.btn('olTApply:' + k, TK[k], TK[k] + ' şeffaflık')).join('');
    }
    return h;
  };
  UI.selExtras = UI.selExtras || [];
  UI.selExtras.push((s, it) => {
    if (!(it instanceof paper.Path) || it.closed || FX.isFx(it) || !it.strokeColor) return '';
    const a = it.data.arrows || {};
    return H.sep + arrowSel('Baş', 'olStart', a.s || 'none') + arrowSel('Uç', 'olEnd', a.e || 'none');
  });
  UI.propsExtras = UI.propsExtras || [];
  UI.propsExtras.push((items, it) => {
    if (!items.length) return '';
    let h = '';
    const ps = strokePaths(items);
    const p = ps[0];
    if (p && p.strokeColor) {
      const d = p.data;
      const a = d.arrows || {};
      const nib = d.nib || { stretch: 100, angle: 0 };
      h += '<div class="sec"><div class="sec-h"><h3>Anahat kalemi</h3></div>';
      if (p instanceof paper.Path && !p.closed) h += '<div class="row">' + arrowSel('Başlangıç oku', 'olStart', a.s || 'none') + '</div><div class="row">' + arrowSel('Bitiş oku', 'olEnd', a.e || 'none') + '</div><div class="row">' + H.dfieldPf('Ok boyutu', 'olSize', VP.num(a.size || 4, 1), '×') + '<button class="btn" data-act="olSwap">Okları değiştir</button></div>';
      h += '<div class="row"><span class="pb-label">Konum</span><span class="seg">' + [['outside', 'Dış'], ['center', 'Orta'], ['inside', 'İç']].map(([k, l]) => '<button data-act="olPos:' + k + '" class="' + ((d.strokePos || 'center') === k ? 'on' : '') + '">' + l + '</button>').join('') + '</span></div>';
      h += '<div class="row"><button class="btn' + (d.behindFill ? ' on' : '') + '" data-act="olBehind" aria-pressed="' + !!d.behindFill + '">Dolgunun arkasında</button></div>';
      h += '<div class="row">' + H.dfieldPf('Kaligrafi genişliği', 'olStretch', Math.round(nib.stretch), '%') + H.dfieldPf('Uç açısı', 'olAngle', VP.num(nib.angle || 0, 0), '°') + '</div>';
      h += '<p class="sec-note">Kaligrafi: %100 normal anahat; küçük değerler yassı uç verir ve kalınlık yöne göre değişir.</p></div>';
    }
    const g = items.length === 1 ? grad(it) : null;
    if (g && !FX.isFx(it)) {
      const st = g.gradient.stops;
      h += '<div class="sec"><div class="sec-h"><h3>Renk durakları</h3><button class="btn" data-act="olStopAdd">' + ic('plus', 'sm') + 'Durak</button></div>';
      h += '<div style="height:16px;border-radius:4px;margin:4px 0 8px;background:linear-gradient(90deg,' + st.map((s) => VP.hex(s.color) + ' ' + Math.round(s.offset * 100) + '%').join(',') + ')"></div>';
      st.forEach((s, i) => {
        const end = i === 0 || i === st.length - 1;
        h += '<div class="row">' + H.colorField(i === 0 ? 'Başlangıç' : end ? 'Bitiş' : i + '. durak', 'olSC' + i, VP.hex(s.color)) + (end ? '' : H.dfieldPf('Konum', 'olSP' + i, Math.round(s.offset * 100), '%') + '<button class="btn" data-act="olSD:' + i + '">' + ic('minus', 'sm') + '</button>') + '</div>';
      });
      h += '</div>';
    }
    if (items.length === 1 && !FX.isFx(it) && !(it instanceof paper.Raster)) {
      h += '<div class="sec"><div class="sec-h"><h3>Desenli şeffaflık</h3></div><div class="grid-btns" style="grid-template-columns:repeat(4,1fr)">' + Object.keys(TK).map((k) => '<button class="btn" data-act="olTApply:' + k + '">' + TK[k] + '</button>').join('') + '</div></div>';
    }
    return h;
  });

  const setArrows = (fn) => {
    const ps = strokePaths().filter((p) => p instanceof paper.Path);
    ps.forEach((p) => {
      const a = Object.assign({ s: 'none', e: 'none', size: 4 }, p.data.arrows || {});
      fn(a);
      if (a.s === 'none' && a.e === 'none') delete p.data.arrows;
      else p.data.arrows = a;
    });
    if (ps.length) VP.commit();
  };
  OL.propField = (name, raw, el) => {
    const v = VP.parseNum(raw);
    const hex = UI.normHex(raw);
    const it = one();
    if (name === 'olStart' || name === 'olEnd') {
      setArrows((a) => (a[name === 'olStart' ? 's' : 'e'] = raw));
      return true;
    }
    if (name === 'olSize' && v > 0) {
      setArrows((a) => (a.size = clamp(v, 1, 30)));
      return true;
    }
    if (name === 'olStretch' || name === 'olAngle') {
      const ps = strokePaths().filter((p) => p instanceof paper.Path);
      if (!isFinite(v)) return true;
      ps.forEach((p) => {
        const nib = Object.assign({ stretch: 100, angle: 0 }, p.data.nib || {});
        if (name === 'olStretch') nib.stretch = clamp(v, 1, 100);
        else nib.angle = VP.norm(v);
        if (nib.stretch >= 100) delete p.data.nib;
        else p.data.nib = nib;
      });
      if (ps.length) VP.commit();
      return true;
    }
    if (/^olSC\d+$/.test(name) || name === 'olStopC') {
      const g = grad(it);
      if (!g || !hex) return true;
      const i = name === 'olStopC' ? FT.midStop : +name.slice(4);
      const st = stopsArr(g);
      if (!st[i]) return true;
      st[i][0] = new paper.Color(hex);
      setStops(it, st, g);
      VP.commit();
      return true;
    }
    if (/^olSP\d+$/.test(name) || name === 'olStopP') {
      const g = grad(it);
      if (!g || !isFinite(v)) return true;
      const i = name === 'olStopP' ? FT.midStop : +name.slice(4);
      const st = stopsArr(g);
      if (!st[i] || i === 0 || i === st.length - 1) return true;
      st[i][1] = clamp(v / 100, 0.01, 0.99);
      const moved = st[i];
      setStops(it, st, g);
      if (name === 'olStopP') FT.midStop = stopsArr(grad(it)).findIndex((s) => s[1] === moved[1]);
      VP.commit();
      return true;
    }
    if (/^olT/.test(name)) {
      const fx = FX.of(it);
      if (!fx || fx.type !== 'transpfx') return true;
      if (name === 'olTPat' && Q.PATTERNS[raw]) fx.pattern = raw;
      if (name === 'olTTex' && Q.TEXTURES[raw]) fx.texture = raw;
      if (name === 'olT0' && isFinite(v)) fx.t0 = clamp(v, 0, 100);
      if (name === 'olT1' && isFinite(v)) fx.t1 = clamp(v, 0, 100);
      if (name === 'olTAng' && isFinite(v)) fx.angle = VP.norm(v);
      if (name === 'olTSize' && v > 0) fx.size = VP.toPT(clamp(v, 0.3, 500));
      if (name === 'olTLw' && v > 0) fx.lw = clamp(v / 100, 0.05, 0.95);
      OL.buildTfx(it);
      if (live(el)) VP.commit();
      return true;
    }
    return false;
  };
  OL.act = (id) => {
    const [k, arg] = id.split(':');
    const it = one();
    switch (k) {
      case 'olSwap':
        setArrows((a) => ([a.s, a.e] = [a.e, a.s]));
        return true;
      case 'olPos':
        strokePaths().forEach((p) => {
          if (arg === 'center') delete p.data.strokePos;
          else p.data.strokePos = arg;
        });
        VP.commit();
        return true;
      case 'olBehind': {
        const ps = strokePaths();
        const on = !ps.every((p) => p.data.behindFill);
        ps.forEach((p) => (on ? (p.data.behindFill = true) : delete p.data.behindFill));
        VP.commit();
        return true;
      }
      case 'olStopAdd':
        if (grad(it)) {
          FT.midStop = OL.addStop(it);
          VP.commit();
          VP.drawOverlay();
        } else VP.toast('Önce doğrusal veya dairesel bir geçiş verin');
        return true;
      case 'olStopDel':
      case 'olSD': {
        const g = grad(it);
        const i = k === 'olSD' ? +arg : FT.midStop;
        if (!g || i == null) return true;
        const st = stopsArr(g);
        if (i <= 0 || i >= st.length - 1) return true;
        st.splice(i, 1);
        setStops(it, st, g);
        FT.midStop = null;
        VP.commit();
        VP.drawOverlay();
        return true;
      }
      case 'olTApply':
        if (VP.sel.length) OL.applyTfx(VP.sel.slice(), arg);
        return true;
      case 'olTk': {
        const fx = FX.of(it);
        if (fx && fx.type === 'transpfx') OL.applyTfx([it], arg);
        return true;
      }
      case 'olTSeed':
      case 'olTSwap': {
        const fx = FX.of(it);
        if (!fx || fx.type !== 'transpfx') return true;
        if (k === 'olTSeed') fx.seed = 1 + Math.floor(Math.random() * 9999);
        else [fx.t0, fx.t1] = [fx.t1, fx.t0];
        OL.buildTfx(it);
        VP.commit();
        return true;
      }
      default:
        return false;
    }
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^ol/.test(n) ? OL.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^ol/.test(id) ? OL.act(id, el) : act0(id, el));
  Object.assign(VP.actions, {
    outlinePen: { label: 'Anahat kalemi…', icon: 'calligraphy', run: () => UI.openDock('props') }
  });
  const om = UI.MENUS.object;
  if (om && !om.includes('outlinePen')) om.push('|', 'outlinePen');
})();
