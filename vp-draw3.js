/* VektörPad drawing set 3 (desktop drawing suite features, written for this app):
   - Perspective drawing: 1-, 2- and 3-point perspective grids with draggable vanishing points; the drawing
     tools draw straight onto the floor or a wall, and each object becomes a live perspective effect.
   - Impact tool: radial (burst) or parallel (speed) lines as a live, editable object.
   - Fit objects to path: lay selected objects along a curve (even or fixed spacing, turned with the curve).
   - Wrap paragraph text: objects marked to wrap push paragraph text aside (around their outline or box). */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const mm = H.mm;
  const A = VP.actions;
  const T = VP.tools;
  const S = VP.settings;
  const D = VP.defaults;
  const TX = VP.tx;
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);
  const one = () => (VP.sel.length === 1 ? VP.sel[0] : null);
  const fxOne = (type) => {
    const g = one();
    const fx = FX.of(g);
    return fx && fx.type === type ? g : null;
  };
  const D3 = (VP.draw3 = {});
  const seg = (items, cur, prefix, title) => '<span class="seg"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + items.map(([v, l]) => '<button data-act="' + prefix + v + '" class="' + (String(v) === String(cur) ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const row = (x, panel) => (panel ? '<div class="row">' + x + '</div>' : x);
  const fieldOf = (panel) => (panel ? H.dfieldPf : H.field);
  const topItems = () => {
    const out = [];
    VP.userLayers().forEach((L) => L.children.forEach((c) => out.push(c)));
    return out;
  };
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => x !== '|' && !x.startsWith('h:') && !x.startsWith('sub:') && M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };
  Object.assign(VP.defaults, { imStyle: 'radial', imCount: 48, imColor: '#1d1d1b' }, VP.defaults);

  /* ======================================================================
     PERSPECTIVE DRAWING
     ====================================================================== */
  const PD = (D3.persp = { on: false });
  const P = (a) => Pt(a[0], a[1]);
  const A2 = (p) => [p.x, p.y];
  const lerp = (a, b, t) => a.add(b.subtract(a).multiply(t));
  const meet = (p1, p2, p3, p4) => {
    // intersection of line p1p2 with line p3p4
    const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(d) < 1e-9) return lerp(p1, p2, 0.5);
    const a = p1.x * p2.y - p1.y * p2.x;
    const b = p3.x * p4.y - p3.y * p4.x;
    return Pt((a * (p3.x - p4.x) - (p1.x - p2.x) * b) / d, (a * (p3.y - p4.y) - (p1.y - p2.y) * b) / d);
  };
  PD.defaults = (type) => {
    const p = VP.page();
    const w = p.w;
    const h = p.h;
    return {
      type: type || 2, plane: 'ground', hy: h * 0.38,
      vp: [w * 0.5, h * 0.38], vl: [-w * 0.35, h * 0.38], vr: [w * 1.35, h * 0.38], vv: [w * 0.5, -h * 1.3],
      o: type === 1 ? [w * 0.18, h * 0.86] : [w * 0.5, h * 0.88],
      fw: w * 0.64, t: 0.55, a: 0.45, wh: h * 0.42
    };
  };
  PD.grid = () => {
    VP.doc.ext = VP.doc.ext || {};
    let g = VP.doc.ext.persp;
    if (!g || !g.o) g = VP.doc.ext.persp = PD.defaults(2);
    return g;
  };
  // the four corners (tl, tr, br, bl) of each plane
  PD.planes = (g = PD.grid()) => {
    const O = P(g.o);
    const out = {};
    if (g.type === 1) {
      const V = Pt(g.vp[0], g.hy);
      const O2 = O.add(Pt(g.fw, 0));
      const B1 = lerp(O, V, g.t);
      const B2 = lerp(O2, V, g.t);
      const Ot = O.subtract(Pt(0, g.wh));
      const O2t = O2.subtract(Pt(0, g.wh));
      const B1t = lerp(Ot, V, g.t);
      const B2t = lerp(O2t, V, g.t);
      out.ground = [B1, B2, O2, O];
      out.left = [Ot, B1t, B1, O];
      out.right = [B2t, O2t, O2, B2];
      out.handles = { o: O, fw: O2, t: B1, wh: Ot, vp: V };
      out.vps = [V];
    } else {
      const VL = Pt(g.vl[0], g.hy);
      const VR = Pt(g.vr[0], g.hy);
      const Ar = lerp(O, VR, g.a);
      const Bl = lerp(O, VL, g.a);
      const C = meet(Ar, VL, Bl, VR);
      let Ot;
      let Art;
      let Blt;
      if (g.type === 3) {
        const VV = P(g.vv);
        const k = clamp(g.wh / Math.max(1, O.y - VV.y), 0.02, 0.95);
        Ot = lerp(O, VV, k);
        Art = meet(Ot, VR, Ar, VV);
        Blt = meet(Ot, VL, Bl, VV);
        out.vps = [VL, VR, VV];
      } else {
        Ot = O.subtract(Pt(0, g.wh));
        Art = lerp(Ot, VR, g.a);
        Blt = lerp(Ot, VL, g.a);
        out.vps = [VL, VR];
      }
      out.ground = [Bl, C, Ar, O];
      out.left = [Blt, Ot, O, Bl];
      out.right = [Ot, Art, Ar, O];
      out.handles = { o: O, a: Ar, wh: Ot, vl: VL, vr: VR };
      if (g.type === 3) out.handles.vv = P(g.vv);
    }
    return out;
  };
  // unit square → quad, and back
  PD.homog = (q) => {
    const m = FX.perspMapper({ tl: A2(q[0]), tr: A2(q[1]), br: A2(q[2]), bl: A2(q[3]) });
    return (u, v) => P(m(u, v));
  };
  const SQ = 1000; // plane space: the plane is a 1000 × 1000 square
  PD.inverse = (q) => {
    // solve numerically: Newton steps on the forward map (robust and short)
    const f = PD.homog(q);
    return (pt) => {
      let u = 0.5;
      let v = 0.5;
      for (let k = 0; k < 30; k++) {
        const p0 = f(u, v);
        const e = 1e-4;
        const pu = f(u + e, v).subtract(p0).divide(e);
        const pv = f(u, v + e).subtract(p0).divide(e);
        const r = pt.subtract(p0);
        const det = pu.x * pv.y - pu.y * pv.x;
        if (Math.abs(det) < 1e-12) break;
        const du = (r.x * pv.y - r.y * pv.x) / det;
        const dv = (pu.x * r.y - pu.y * r.x) / det;
        u = clamp(u + du, -3, 4);
        v = clamp(v + dv, -3, 4);
        if (Math.abs(du) + Math.abs(dv) < 1e-7) break;
      }
      return Pt(u * SQ, v * SQ);
    };
  };
  const plane = () => PD.planes()[PD.grid().plane] || PD.planes().ground;
  const drawTool = (id) => VP.tech && VP.tech.projectable ? VP.tech.projectable(id) : ['rect', 'ellipse', 'polygon', 'star', 'line', 'freehand', 'pen'].includes(id);
  // turns an object drawn in plane space into a live perspective effect on the grid
  PD.toPersp = (it) => {
    const q = plane();
    const f = PD.homog(q);
    const r = it.bounds.clone();
    if (!(r.width > 0.01 || r.height > 0.01)) return it;
    if (r.width < 0.5) r.width = 0.5;
    if (r.height < 0.5) r.height = 0.5;
    const c = (x, y) => A2(f(x / SQ, y / SQ));
    it.visible = true;
    delete it._vpPD;
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.insertAbove(it);
    g.data.effect = { type: 'perspective', source: it.exportJSON({ asString: true }), rect: [r.x, r.y, r.width, r.height], quad: { tl: c(r.left, r.top), tr: c(r.right, r.top), br: c(r.right, r.bottom), bl: c(r.left, r.bottom) } };
    g.data.perspPlane = PD.grid().plane;
    if (pdKnown) pdKnown.add(g);
    it.remove();
    FX.buildWarp(g);
    return g;
  };
  let pdKnown = null;
  let pdMark = null;
  const pdWrapped = new WeakMap();
  const pdHandle = (pt) => {
    const hs = PD.planes().handles;
    const tol = (VP.coarse ? 22 : 12) / zoom();
    let best = null;
    Object.keys(hs).forEach((k) => {
      const d = hs[k].getDistance(pt);
      if (d < tol && (!best || d < best.d)) best = { k, d };
    });
    return best && best.k;
  };
  const dragHandle = (k, pt) => {
    const g = PD.grid();
    if (k === 'o') g.o = A2(pt);
    else if (k === 'vp') {
      g.vp = A2(pt);
      g.hy = pt.y;
    } else if (k === 'vl' || k === 'vr') {
      g[k] = A2(pt);
      g.hy = pt.y;
    } else if (k === 'vv') g.vv = A2(pt);
    else if (k === 'wh') g.wh = clamp(g.o[1] - pt.y, 5, 5000);
    else if (k === 'fw') g.fw = clamp(pt.x - g.o[0], 5, 5000);
    else if (k === 't') {
      const O = P(g.o);
      const V = Pt(g.vp[0], g.hy);
      const d = V.subtract(O);
      g.t = clamp(pt.subtract(O).dot(d) / (d.dot(d) || 1), 0.05, 0.95);
    } else if (k === 'a') {
      const O = P(g.o);
      const V = Pt(g.vr[0], g.hy);
      const d = V.subtract(O);
      g.a = clamp(pt.subtract(O).dot(d) / (d.dot(d) || 1), 0.05, 0.95);
    }
  };
  const pdWrap = (t) => {
    if (pdWrapped.has(t)) return pdWrapped.get(t);
    const mapEv = (e) => (e && e.point ? Object.assign({}, e, { point: PD.inverse(plane())(e.point) }) : e);
    const mark = () => {
      if (!pdKnown) return;
      topItems().forEach((it) => {
        if (pdKnown.has(it)) return;
        it._vpPD = true;
        it.visible = false;
        pdKnown.add(it);
      });
    };
    const call = (name, e) => {
      if (name === 'down') {
        const k = pdHandle(e.point);
        if (k) {
          PD.drag = { k, changed: false };
          return;
        }
      }
      if (PD.drag) {
        if (name === 'move') {
          dragHandle(PD.drag.k, e.point);
          PD.drag.changed = true;
          VP.drawOverlay();
        } else if (name === 'up') {
          const ch = PD.drag.changed;
          PD.drag = null;
          if (ch) VP.commit();
          VP.drawOverlay();
        }
        return;
      }
      if (!drawTool(VP.toolId) || !t[name]) return t[name] ? t[name](e) : undefined;
      if (name === 'down' && !(t.busy && t.busy())) pdKnown = new Set(topItems());
      PD._inPlane = true;
      pdMark = mark;
      let r;
      try {
        r = t[name](mapEv(e));
      } finally {
        PD._inPlane = false;
        pdMark = null;
      }
      mark();
      VP.drawOverlay();
      return r;
    };
    const px = new Proxy(t, {
      get(target, key) {
        if (key === 'down' || key === 'move' || key === 'up') return (e) => call(key, e);
        if (key === 'busy') return () => !!PD.drag || !!(target.busy && target.busy());
        if (key === 'cancel') return () => {
          PD.drag = null;
          return target.cancel && target.cancel();
        };
        const v = target[key];
        return typeof v === 'function' ? v.bind(target) : v;
      },
      set(target, key, val) {
        target[key] = val;
        return true;
      }
    });
    pdWrapped.set(t, px);
    return px;
  };
  const toolBase = VP.tool;
  VP.tool = () => {
    const t = toolBase();
    return PD.on ? pdWrap(t) : t;
  };
  const snapBase = VP.snapPt;
  VP.snapPt = (pt) => (PD._inPlane ? pt : snapBase(pt));
  const commit0 = VP.commit;
  VP.commit = function () {
    if (pdMark) pdMark();
    const made = [];
    topItems().forEach((it) => {
      if (it._vpPD) made.push(PD.toPersp(it));
    });
    if (made.length) {
      VP.sel = VP.sel.filter((s) => s.parent);
      VP.setSelection(made.filter((g) => g && g.parent));
    }
    return commit0.apply(this, arguments);
  };
  // grid, vanishing points and the drawing being made
  VP.overlayHooks = VP.overlayHooks || [];
  VP.overlayHooks.push((L) => {
    if (!PD.on) return;
    const s = 1 / zoom();
    const g = PD.grid();
    const pl = PD.planes(g);
    const col = acc();
    const faint = col.clone();
    faint.alpha = 0.35;
    const p = VP.page();
    const line = (a, b, c, w, dash) => L.addChild(new paper.Path.Line({ from: a, to: b, strokeColor: c, strokeWidth: (w || 1) * s, dashArray: dash ? [5 * s, 4 * s] : [], insert: false }));
    line(Pt(-p.w * 2, g.hy), Pt(p.w * 3, g.hy), faint, 1, true);
    ['ground', 'left', 'right'].forEach((k) => {
      const q = pl[k];
      const on = k === g.plane;
      const f = PD.homog(q);
      const n = on ? 8 : 0;
      for (let i = 1; i < n; i++) {
        line(f(i / n, 0), f(i / n, 1), faint, 0.8);
        line(f(0, i / n), f(1, i / n), faint, 0.8);
      }
      const poly = new paper.Path({ segments: q, closed: true, strokeColor: on ? col : faint, strokeWidth: (on ? 1.6 : 1) * s, insert: false });
      if (on) {
        poly.fillColor = col.clone();
        poly.fillColor.alpha = 0.06;
      }
      L.addChild(poly);
    });
    // lines to the vanishing points from the plane corners
    pl.vps.forEach((v) => [pl.ground[2], pl.ground[3], pl.left[0], pl.right[1]].forEach((c) => c && line(c, v, faint, 0.6, true)));
    Object.keys(pl.handles).forEach((k) => {
      const h = pl.handles[k];
      const isVP = k.length === 2 || k === 'vp';
      const r = (VP.coarse ? 8 : 6) * s;
      L.addChild(isVP
        ? new paper.Path.Circle({ center: h, radius: r, fillColor: '#ffffff', strokeColor: '#d6362b', strokeWidth: 1.6 * s, insert: false })
        : new paper.Path.Rectangle({ rectangle: new paper.Rectangle(h.subtract(r * 0.8), new paper.Size(r * 1.6, r * 1.6)), fillColor: '#ffffff', strokeColor: col, strokeWidth: 1.4 * s, insert: false }));
    });
    // what the tool is drawing, shown on the plane
    const f = PD.homog(pl[g.plane] || pl.ground);
    topItems().forEach((it) => {
      if (!it._vpPD) return;
      const c = it.clone({ insert: false });
      c.visible = true;
      try {
        FX.warpTree(c, (q) => f(q.x / SQ, q.y / SQ), 2 / Math.max(0.2, zoom()) * 3);
      } catch (e) {
        return;
      }
      L.addChild(c);
    });
  });
  PD.set = (on, type) => {
    if (on) {
      const g = PD.grid();
      if (type && type !== g.type) Object.assign(g, PD.defaults(type), { plane: g.plane });
      PD.on = true;
      if (!drawTool(VP.toolId)) VP.setTool('rect');
      VP.toast(PD.grid().type + ' noktalı perspektif · Çizdiğiniz şekiller seçili düzleme oturur · Kırmızı noktaları sürükleyin');
    } else {
      PD.on = false;
      VP.toast('Perspektif çizim kapalı');
    }
    VP.drawOverlay();
    UI.schedule('prop');
  };
  // perspective bar in front of the property bar
  const PLANE_NAMES = { ground: 'Zemin', left: 'Sol duvar', right: 'Sağ duvar' };
  const renderPB0 = UI.renderPropbar;
  UI.renderPropbar = () => {
    renderPB0();
    if (!PD.on) return;
    const pb = document.querySelector('#propbar');
    if (!pb || pb.querySelector('[data-pd-pre]')) return;
    const g = PD.grid();
    const h = '<span class="pb-title" style="color:var(--accent)">' + ic('perspDraw', 'sm') + ' Perspektif</span>' +
      seg([[1, '1 nokta'], [2, '2 nokta'], [3, '3 nokta']], g.type, 'pdType:', 'Kaçış noktası sayısı') +
      seg(Object.keys(PLANE_NAMES).map((k) => [k, PLANE_NAMES[k]]), g.plane, 'pdPlane:', 'Çizim düzlemi') +
      H.btn('pdReset', 'Sıfırla', 'Izgarayı sayfaya göre yeniden kur') + H.btn('pdOff', 'Kapat', 'Perspektif çizimden çık', 'primary') + '<span class="pb-sep"></span>';
    pb.insertAdjacentHTML('afterbegin', '<span data-pd-pre style="display:contents">' + h + '</span>');
  };

  /* ======================================================================
     IMPACT TOOL
     ====================================================================== */
  // small seeded random numbers, so a live object rebuilds the same way
  const rnd = (seed) => {
    let s = (seed * 2654435761) >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
  };
  D3.buildImpact = (g) => {
    const fx = g.data.effect;
    g.removeChildren();
    const R = rnd(fx.seed || 1);
    const parts = [];
    const wedge = (a, b, w0, w1) => {
      const d = b.subtract(a);
      if (d.length < 0.05) return;
      const n = d.normalize().rotate(90);
      const q = new paper.Path({ segments: [a.add(n.multiply(w0 / 2)), b.add(n.multiply(w1 / 2)), b.subtract(n.multiply(w1 / 2)), a.subtract(n.multiply(w0 / 2))], closed: true, insert: false });
      q.clockwise = true;
      parts.push(q);
    };
    const n = clamp(Math.round(fx.count), 2, 600);
    const lv = clamp(fx.lenVar, 0, 1);
    const sv = clamp(fx.spaceVar, 0, 1);
    if (fx.style === 'radial') {
      const span = clamp(fx.span, 1, 360);
      const start = fx.angle - span / 2;
      for (let i = 0; i < n; i++) {
        const t = span >= 360 ? (i + (R() - 0.5) * sv) / n : n > 1 ? (i + (R() - 0.5) * sv) / (n - 1) : 0.5;
        const ang = ((start + t * span) * Math.PI) / 180;
        const dir = Pt(Math.cos(ang) * fx.rx, Math.sin(ang) * fx.ry);
        const ri = clamp(fx.inner, 0, 0.98);
        const extra = R() * lv;
        const a = dir.multiply(ri + (1 - ri) * extra * 0.6);
        const b = dir.multiply(1 - extra * (1 - ri) * 0.4);
        const wv = 1 - R() * clamp(fx.widthVar, 0, 1) * 0.8;
        wedge(a, b, fx.w0 * wv, fx.w1 * wv);
      }
    } else {
      const w = fx.rx * 2;
      const h = fx.ry * 2;
      for (let i = 0; i < n; i++) {
        const y = -h / 2 + ((i + 0.5 + (R() - 0.5) * sv) / n) * h;
        const x0 = -w / 2 + R() * lv * w * 0.45;
        const x1 = w / 2 - R() * lv * w * 0.45;
        const wv = 1 - R() * clamp(fx.widthVar, 0, 1) * 0.8;
        wedge(Pt(x0, y), Pt(x1, y), fx.w0 * wv, fx.w1 * wv);
      }
    }
    const cp = new paper.CompoundPath({ children: parts, fillRule: 'nonzero', fillColor: fx.color, insert: false });
    if (fx.style !== 'radial' && fx.angle) cp.rotate(fx.angle, Pt(0, 0));
    cp.translate(Pt(fx.cx, fx.cy));
    g.addChild(cp);
  };
  D3.makeImpact = (center, rx, ry, style) => {
    const fx = {
      type: 'impact', style: style || D.imStyle, cx: center.x, cy: center.y, rx: Math.max(2, rx), ry: Math.max(2, ry),
      count: D.imCount, inner: 0.45, span: 360, angle: style === 'parallel' ? 0 : -90, lenVar: 0.5, spaceVar: 0.6, widthVar: 0.4,
      w0: VP.toPT(0.6), w1: VP.toPT(2.2), color: D.imColor, seed: 1 + Math.floor(Math.random() * 9999)
    };
    if (fx.style === 'parallel') {
      fx.w0 = VP.toPT(0.3);
      fx.w1 = VP.toPT(1.4);
      fx.angle = 0;
      fx.count = Math.min(fx.count, 22);
    }
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.data.effect = fx;
    D3.buildImpact(g);
    return g;
  };
  T.impactTool = {
    cursor: 'crosshair',
    op: null,
    busy() { return !!this.op; },
    down(e) {
      VP.ensureLayer();
      this.op = { start: VP.snapPt(e.point), g: null };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      const p = VP.snapPt(e.point);
      const d = p.subtract(op.start);
      if (d.length * zoom() < 4) return;
      const radial = D.imStyle !== 'parallel';
      const c = radial ? op.start : op.start.add(d.divide(2));
      const rx = radial ? d.length : Math.abs(d.x) / 2;
      const ry = radial ? (e.shift ? Math.abs(d.y) || d.length : d.length) : Math.max(2, Math.abs(d.y) / 2);
      if (!op.g) {
        op.g = D3.makeImpact(c, rx, ry, radial ? 'radial' : 'parallel');
        VP.activeLayer.addChild(op.g);
      } else {
        Object.assign(op.g.data.effect, { cx: c.x, cy: c.y, rx: Math.max(2, rx), ry: Math.max(2, ry) });
        D3.buildImpact(op.g);
      }
    },
    up() {
      const op = this.op;
      this.op = null;
      if (!op || !op.g) return;
      VP.setSelection([op.g]);
      VP.commit();
    },
    cancel() {
      if (this.op && this.op.g) this.op.g.remove();
      this.op = null;
    }
  };
  const impactFields = (g, panel) => {
    const fx = g.data.effect;
    const f = fieldOf(panel);
    let h = panel ? '' : '<span class="pb-label">Etki</span>';
    h += row(seg([['radial', 'Işınsal'], ['parallel', 'Paralel']], fx.style, 'imStyle:'), panel);
    h += row(f('Çizgi', 'imCount', fx.count, '') + (fx.style === 'radial' ? f('Yay', 'imSpan', VP.num(fx.span, 0), '°') : '') + f('Açı', 'imAngle', VP.num(fx.angle, 0), '°'), panel);
    h += row((fx.style === 'radial' ? H.range('İç boşluk', 'imInner', Math.round(fx.inner * 100), 0, 95) : '') + H.range('Uzunluk farkı', 'imLenVar', Math.round(fx.lenVar * 100), 0, 100), panel);
    h += row(H.range('Aralık farkı', 'imSpaceVar', Math.round(fx.spaceVar * 100), 0, 100) + H.range('Kalınlık farkı', 'imWidthVar', Math.round(fx.widthVar * 100), 0, 100), panel);
    h += row(f('Baş', 'imW0', mm(fx.w0, 2)) + f('Son', 'imW1', mm(fx.w1, 2)) + H.colorField('Renk', 'imColor', fx.color) + H.btn('imShuffle', 'Karıştır', 'Çizgileri yeniden rastgele dağıt'), panel);
    return h + (panel ? '<div class="row"><button class="btn" data-act="fxSeparate">Eğriye dönüştür</button></div>' : H.btn('fxMenu', 'Nesne ▾', 'Normal gruba dönüştür'));
  };
  FX.NAMES.impact = 'Etki';
  if (VP.KIND_NAMES) VP.KIND_NAMES.impact = 'Etki';
  FX.TYPES.impact = {
    tool: 'impactTool',
    build: (g) => D3.buildImpact(g),
    probe: (g) => {
      const t = new paper.Path.Rectangle({ rectangle: g.bounds, insert: false });
      t.fillColor = g.data.effect.color;
      return t;
    },
    restyle(g, fn) {
      const t = new paper.Path.Rectangle({ rectangle: g.bounds, insert: false });
      t.fillColor = g.data.effect.color;
      fn([t]);
      if (t.fillColor) g.data.effect.color = VP.hex(t.fillColor);
      D3.buildImpact(g);
    },
    describe: (g) => (g.data.effect.style === 'radial' ? 'Etki (ışınsal)' : 'Etki (paralel)'),
    clear(g) {
      delete g.data.effect;
      g.applyMatrix = true;
      return [g];
    },
    clearMsg: 'Artık normal bir grup',
    bakeMsg: 'Etki çizgileri normal şekle dönüştü',
    dblTap(g) {
      VP.setSelection([g]);
      UI.openDock('props');
    },
    fields: (g) => impactFields(g, false),
    panel: (g) => impactFields(g, true)
  };

  /* ======================================================================
     FIT OBJECTS TO PATH
     ====================================================================== */
  D3.fitDialog = () => {
    const path = VP.sel.slice().reverse().find((it) => (it instanceof paper.Path || it instanceof paper.CompoundPath) && !FX.isFx(it));
    const objs = VP.sel.filter((it) => it !== path);
    if (!path || !objs.length) return VP.toast('Nesneleri ve üzerine dizilecekleri bir eğriyi birlikte seçin');
    const st = D3.fitOpts || (D3.fitOpts = { mode: 'even', gap: VP.toPT(10), rotate: true, at: 'center', offset: 0, start: 0 });
    const html = '<h2>Nesneleri yola sığdır</h2><p>' + objs.length + ' nesne, seçili eğrinin üzerine dizilir.</p>' +
      '<div class="row"><span class="opt-label">Dağılım</span>' + seg([['even', 'Eşit aralık'], ['gap', 'Sabit aralık']], st.mode, 'm:') + '</div>' +
      '<div class="row"><label class="field"><span>Aralık</span><input data-f="gap" value="' + esc(mm(st.gap, 1)) + '" inputmode="decimal"><span class="unit">mm</span></label><label class="field"><span>Başlangıç</span><input data-f="start" value="' + esc(mm(st.start, 1)) + '" inputmode="decimal"><span class="unit">mm</span></label><label class="field"><span>Uzaklık</span><input data-f="offset" value="' + esc(mm(st.offset, 1)) + '" inputmode="decimal"><span class="unit">mm</span></label></div>' +
      '<div class="row"><span class="opt-label">Yola göre konum</span>' + seg([['center', 'Ortası'], ['bottom', 'Altı'], ['top', 'Üstü']], st.at, 'a:') + '</div>' +
      '<div class="row">' + seg([['1', 'Eğriyle döndür'], ['0', 'Dik tut']], st.rotate ? '1' : '0', 'r:') + '</div>' +
      '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Uygula</button></div>';
    UI.modal(html, (root, close) => {
      root.addEventListener('click', (e) => {
        const sb = e.target.closest('[data-act]');
        if (sb) {
          const [k, v] = sb.dataset.act.split(':');
          if (k === 'm') st.mode = v;
          if (k === 'a') st.at = v;
          if (k === 'r') st.rotate = v === '1';
          sb.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === sb));
          return;
        }
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'no') return close();
        const num = (k) => VP.parseNum(root.querySelector('[data-f="' + k + '"]').value);
        if (num('gap') >= 0) st.gap = VP.toPT(num('gap'));
        if (isFinite(num('start'))) st.start = VP.toPT(num('start'));
        if (isFinite(num('offset'))) st.offset = VP.toPT(num('offset'));
        close();
        D3.fitToPath(path, objs, st);
      });
    });
  };
  D3.fitToPath = (path, objs, st) => {
    const base = path instanceof paper.CompoundPath ? path.children.reduce((a, b) => (b.length > (a ? a.length : -1) ? b : a), null) : path;
    if (!base || !(base.length > 0.1)) return VP.toast('Eğri çok kısa');
    const L = base.length;
    // left-to-right order of the objects as they are now
    const list = objs.slice().sort((a, b) => a.bounds.center.x - b.bounds.center.x || a.bounds.center.y - b.bounds.center.y);
    const n = list.length;
    const sizes = list.map((o) => o.bounds.width);
    let pos = [];
    if (st.mode === 'gap') {
      let s = st.start + sizes[0] / 2;
      list.forEach((o, i) => {
        pos.push(s);
        s += sizes[i] / 2 + st.gap + (sizes[i + 1] || 0) / 2;
      });
    } else if (base.closed) pos = list.map((o, i) => st.start + (L * i) / n);
    else pos = list.map((o, i) => (n === 1 ? L / 2 : st.start + ((L - st.start) * i) / (n - 1)));
    let skipped = 0;
    list.forEach((o, i) => {
      let s = pos[i];
      if (base.closed) s = ((s % L) + L) % L;
      if (s < 0 || s > L) {
        skipped++;
        return;
      }
      const p = base.getPointAt(Math.min(L, Math.max(0, s)));
      const t = base.getTangentAt(Math.min(L, Math.max(0, s)));
      if (!p || !t) return;
      const nrm = t.rotate(-90);
      const b = o.bounds;
      const anchor = st.at === 'bottom' ? b.bottomCenter : st.at === 'top' ? b.topCenter : b.center;
      o.translate(p.add(nrm.multiply(st.offset)).subtract(anchor));
      if (st.rotate) o.rotate(t.angle, p.add(nrm.multiply(st.offset)));
    });
    VP.setSelection(list.concat([path]));
    VP.commit();
    VP.toast(n - skipped + ' nesne yola dizildi' + (skipped ? ' · ' + skipped + ' tanesi eğriye sığmadı' : ''));
  };

  /* ======================================================================
     WRAP PARAGRAPH TEXT
     ====================================================================== */
  const WRAP = { contour: 'Kontur', box: 'Çerçeve' };
  D3.wrappers = () => topItems().filter((it) => it.visible && it.data && it.data.wrap && it.data.wrap.mode);
  // outline of a wrapping object as polygons in page coordinates
  const polysOf = (it) => {
    const out = [];
    const off = it.data.wrap.offset || 0;
    if (it.data.wrap.mode === 'box' || it instanceof paper.Raster) {
      const b = it.bounds.expand(off * 2);
      out.push([b.topLeft, b.topRight, b.bottomRight, b.bottomLeft]);
      return { polys: out, off: 0 };
    }
    const c = it.clone({ insert: false });
    const walk = (x) => {
      if (x instanceof paper.PointText) {
        const cp = VP.textToPath(x);
        if (cp) walk(cp);
        else {
          const b = x.bounds;
          out.push([b.topLeft, b.topRight, b.bottomRight, b.bottomLeft]);
        }
        return;
      }
      if (x.data && x.data.hitOnly) return;
      if (x instanceof paper.CompoundPath) return x.children.forEach(walk);
      if (x instanceof paper.Path) {
        const pts = [];
        const step = Math.max(1, x.length / 200);
        for (let s = 0; s < x.length; s += step) pts.push(x.getPointAt(s));
        if (pts.length > 1) out.push(pts);
        return;
      }
      if (x instanceof paper.Raster) {
        const b = x.bounds;
        out.push([b.topLeft, b.topRight, b.bottomRight, b.bottomLeft]);
        return;
      }
      if (x.children) x.children.slice().forEach(walk);
    };
    walk(c);
    return { polys: out, off };
  };
  // the x range a polygon covers between y0 and y1
  const bandRange = (poly, y0, y1) => {
    let lo = Infinity;
    let hi = -Infinity;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const ya = a.y;
      const yb = b.y;
      if ((ya < y0 && yb < y0) || (ya > y1 && yb > y1)) continue;
      const pts = [];
      if (ya >= y0 && ya <= y1) pts.push(a.x);
      if (yb >= y0 && yb <= y1) pts.push(b.x);
      if (ya !== yb) {
        [y0, y1].forEach((y) => {
          const t = (y - ya) / (yb - ya);
          if (t >= 0 && t <= 1) pts.push(a.x + (b.x - a.x) * t);
        });
      }
      pts.forEach((x) => {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      });
    }
    return lo <= hi ? [lo, hi] : null;
  };
  const obstaclesFor = (g) => {
    const inv = g.matrix.inverted();
    const fx = g.data.effect;
    const frame = new paper.Rectangle(fx.x, fx.y, fx.w, fx.h);
    const res = [];
    D3.wrappers().forEach((it) => {
      if (it === g) return;
      const { polys, off } = polysOf(it);
      const local = polys.map((pl) => pl.map((p) => inv.transform(p)));
      let b = null;
      local.forEach((pl) => pl.forEach((p) => {
        b = b ? b.include(p) : new paper.Rectangle(p, p);
      }));
      if (!b || !b.expand(off * 2 + 2).intersects(frame)) return;
      res.push({ polys: local, off });
    });
    return res;
  };
  const wrapLayout = (g, obs) => {
    const fx = g.data.effect;
    const texts = g.children.filter((c) => c instanceof paper.PointText);
    const proto = texts[0];
    if (!proto) return;
    const style = proto.clone({ insert: false });
    texts.forEach((t) => t.remove());
    const m = TX.measurer(fx.font);
    const cols = Math.max(1, Math.round(fx.cols || 1));
    const gut = cols > 1 ? Math.max(0, fx.gutter || 0) : 0;
    const colW = Math.max(fx.font.size * 0.6, (fx.w - gut * (cols - 1)) / cols);
    const lh = fx.font.size * (fx.lead || 1.2);
    const half = (lh - (m.asc + m.desc)) / 2;
    const minW = Math.max(m('mm') * 1.2, fx.font.size * 1.5);
    const free = (x0, x1, y0, y1) => {
      let iv = [[x0, x1]];
      obs.forEach((o) => o.polys.forEach((pl) => {
        const r = bandRange(pl, y0 - o.off, y1 + o.off);
        if (!r) return;
        const a = r[0] - o.off;
        const b = r[1] + o.off;
        const next = [];
        iv.forEach(([s, e]) => {
          if (b <= s || a >= e) next.push([s, e]);
          else {
            if (a > s) next.push([s, a]);
            if (b < e) next.push([b, e]);
          }
        });
        iv = next;
      }));
      return iv.filter(([s, e]) => e - s >= minW);
    };
    const place = (words, x, w, base, last) => {
      const txt = words.join(' ');
      const width = m(txt);
      const mk = (s, px) => {
        const t = style.clone({ insert: false });
        t.content = s;
        t.justification = 'left';
        t.point = Pt(px, base);
        g.addChild(t);
      };
      if (fx.align === 'justify' && !last && words.length > 1) {
        const ws = words.map((q) => m(q));
        const gap = (w - ws.reduce((a, b) => a + b, 0)) / (words.length - 1);
        let px = x;
        words.forEach((q, k) => {
          mk(q, px);
          px += ws[k] + gap;
        });
        return;
      }
      let px = x;
      if (fx.align === 'center') px = x + (w - width) / 2;
      else if (fx.align === 'right') px = x + w - width;
      mk(txt, px);
    };
    const paras = String(fx.text || '').replace(/\r\n?/g, '\n').split('\n').map((p) => p.split(/[ \t]+/).filter(Boolean));
    let col = 0;
    let y = 0;
    let over = 0;
    const eps = 1e-6;
    outer: for (let pi = 0; pi < paras.length; pi++) {
      const words = paras[pi].slice();
      if (!words.length) {
        y += lh + (fx.paraSpace || 0);
        continue;
      }
      let guard = 0;
      while (words.length) {
        if (++guard > 4000) break;
        if (y + lh > fx.h + eps) {
          col++;
          y = 0;
        }
        if (col >= cols) {
          over = words.length + paras.slice(pi + 1).reduce((a, p) => a + p.length, 0);
          // the exact text that did not fit (linked frames continue with it)
          fx._rest = [words.join(' ')].concat(paras.slice(pi + 1).map((p) => p.join(' '))).join('\n');
          break outer;
        }
        const x0 = fx.x + col * (colW + gut);
        const top = fx.y + y;
        const ivs = free(x0, x0 + colW, top, top + lh);
        const base = top + half + m.asc;
        ivs.forEach(([s, e]) => {
          if (!words.length) return;
          const w = e - s;
          const line = [];
          while (words.length) {
            const cand = line.concat([words[0]]).join(' ');
            if (m(cand) <= w) line.push(words.shift());
            else break;
          }
          if (!line.length && Math.abs(w - colW) < 1e-6) {
            // a word longer than a full line is split between letters
            let piece = '';
            const chars = Array.from(words[0]);
            let k = 0;
            for (; k < chars.length && m(piece + chars[k]) <= w; k++) piece += chars[k];
            if (!piece) piece = chars[k++] || '';
            words[0] = chars.slice(k).join('');
            if (!words[0]) words.shift();
            line.push(piece);
          }
          if (line.length) place(line, s, w, base, !words.length);
        });
        y += lh;
      }
      y += fx.paraSpace || 0;
    }
    if (!over) fx._rest = '';
    fx.overflow = over ? Math.max(1, Math.ceil(over / 6)) : 0;
    fx._wrapped = true;
  };
  const bp0 = TX.buildPara;
  TX.buildPara = (g) => {
    bp0(g);
    const fx = g.data.effect;
    if (!fx || !g.parent) {
      if (fx) fx._wrapped = false;
      return;
    }
    const obs = obstaclesFor(g);
    if (!obs.length) {
      fx._wrapped = false;
      return;
    }
    try {
      wrapLayout(g, obs);
    } catch (e) {
      console.warn('wrap skipped', e);
    }
  };
  const paragraphs = () => topItems().filter((it) => FX.of(it) && FX.of(it).type === 'paragraph');
  D3.reflow = () => {
    let n = 0;
    const ws = D3.wrappers();
    paragraphs().forEach((g) => {
      const fx = g.data.effect;
      const b = g.bounds;
      const near = ws.some((w) => w !== g && w.bounds.expand(((w.data.wrap.offset || 0) + 2) * 2).intersects(b));
      if (near || fx._wrapped) {
        FX.rebuild(g);
        n++;
      }
    });
    return n;
  };
  const commit1 = VP.commit;
  VP.commit = function () {
    try {
      D3.reflow();
    } catch (e) { /* text layout problems never block saving */ }
    return commit1.apply(this, arguments);
  };
  let rf = 0;
  VP.on('transform', () => {
    if (rf || !D3.wrappers().length) return;
    rf = requestAnimationFrame(() => {
      rf = 0;
      if (D3.reflow()) VP.drawOverlay();
    });
  });
  D3.setWrap = (mode) => {
    const items = VP.sel.filter((it) => !(FX.of(it) && FX.of(it).type === 'paragraph'));
    if (!items.length) return VP.toast('Metni etrafından akıtacak nesneyi seçin (paragraf metni dışında)');
    items.forEach((it) => {
      if (mode === 'none') delete it.data.wrap;
      else it.data.wrap = { mode, offset: (it.data.wrap && it.data.wrap.offset) || VP.toPT(2) };
    });
    VP.commit();
    VP.toast(mode === 'none' ? 'Metin sarma kapalı' : 'Paragraf metni ' + (mode === 'box' ? 'çerçevenin' : 'nesnenin konturunun') + ' etrafından akar');
    UI.schedule('prop', 'dock');
  };
  D3.wrapOffset = async () => {
    const items = VP.sel.filter((it) => it.data && it.data.wrap);
    if (!items.length) return VP.toast('Önce metin saran bir nesne seçin');
    const v = await UI.prompt({ title: 'Metin uzaklığı', label: 'Nesne ile metin arası (mm)', value: mm(items[0].data.wrap.offset || 0, 1), ok: 'Uygula' });
    const n = VP.parseNum(v);
    if (!(n >= 0)) return;
    items.forEach((it) => (it.data.wrap.offset = VP.toPT(n)));
    VP.commit();
  };

  /* ======================================================================
     property bar / docker hooks, actions, menus, tools
     ====================================================================== */
  D3.propField = (name, raw) => {
    const g = fxOne('impact');
    const v = VP.parseNum(raw);
    if (!g) return true;
    const fx = g.data.effect;
    switch (name) {
      case 'imCount': if (v >= 2) fx.count = Math.round(clamp(v, 2, 600)); D.imCount = fx.count; break;
      case 'imSpan': if (v > 0) fx.span = clamp(v, 1, 360); break;
      case 'imAngle': if (isFinite(v)) fx.angle = v; break;
      case 'imInner': if (isFinite(v)) fx.inner = clamp(v / 100, 0, 0.95); break;
      case 'imLenVar': if (isFinite(v)) fx.lenVar = clamp(v / 100, 0, 1); break;
      case 'imSpaceVar': if (isFinite(v)) fx.spaceVar = clamp(v / 100, 0, 1); break;
      case 'imWidthVar': if (isFinite(v)) fx.widthVar = clamp(v / 100, 0, 1); break;
      case 'imW0': if (v >= 0) fx.w0 = VP.toPT(v); break;
      case 'imW1': if (v >= 0) fx.w1 = VP.toPT(v); break;
      case 'imColor': fx.color = raw; D.imColor = raw; break;
      default: return true;
    }
    D3.buildImpact(g);
    VP.commit();
    VP.drawOverlay();
    return true;
  };
  D3.act = (id) => {
    const [k, arg] = id.split(':');
    const g = fxOne('impact');
    switch (k) {
      case 'imStyle':
        D.imStyle = arg;
        if (g) {
          const fx = g.data.effect;
          fx.style = arg;
          fx.angle = arg === 'radial' ? -90 : 0;
          if (arg === 'radial') fx.ry = fx.rx = Math.max(fx.rx, fx.ry);
          D3.buildImpact(g);
          VP.commit();
        }
        return true;
      case 'imShuffle':
        if (g) {
          g.data.effect.seed = 1 + Math.floor(Math.random() * 9999);
          D3.buildImpact(g);
          VP.commit();
        }
        return true;
      case 'pdType': PD.set(true, +arg); VP.commit(); return true;
      case 'pdPlane': PD.grid().plane = arg; VP.drawOverlay(); return true;
      case 'pdReset': {
        const g2 = PD.grid();
        Object.assign(g2, PD.defaults(g2.type), { plane: g2.plane });
        VP.commit();
        VP.drawOverlay();
        return true;
      }
      case 'pdOff': PD.set(false); return true;
      default: return false;
    }
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^im[A-Z]/.test(n) ? D3.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^(im|pd)[A-Z]/.test(id) ? D3.act(id, el) : act0(id, el));
  const tb0 = VP.tx.toolBar;
  VP.tx.toolBar = (id) => {
    if (id === 'impactTool') return '<span class="pb-title">Etki</span>' + seg([['radial', 'Işınsal'], ['parallel', 'Paralel']], D.imStyle, 'imStyle:') + '<span class="pb-label">' + esc(VP.TOOL_META.impactTool.hint) + '</span>';
    return tb0(id);
  };
  Object.assign(VP.TOOL_META, {
    impactTool: { label: 'Etki', icon: 'impact', key: '', drawing: true, hint: 'Işınsal: merkezden dışa sürükleyin (Shift: elips) · Paralel: alanı çapraz sürükleyin' }
  });
  Object.assign(A, {
    pdOn1: { label: '1 noktalı perspektif', icon: 'perspDraw', checked: () => PD.on && PD.grid().type === 1, run: () => PD.set(true, 1) },
    pdOn2: { label: '2 noktalı perspektif', icon: 'perspDraw', checked: () => PD.on && PD.grid().type === 2, run: () => PD.set(true, 2) },
    pdOn3: { label: '3 noktalı perspektif', icon: 'perspDraw', checked: () => PD.on && PD.grid().type === 3, run: () => PD.set(true, 3) },
    pdOffA: { label: 'Perspektif çizimi kapat', enabled: () => PD.on, run: () => PD.set(false) },
    impactToolA: { label: 'Etki aracı', icon: 'impact', run: () => VP.setTool('impactTool') },
    fitObjPath: { label: 'Nesneleri yola sığdır…', icon: 'fitPath', run: () => D3.fitDialog(), enabled: () => VP.sel.length >= 2 },
    wrapContour: { label: 'Kontur boyunca', checked: () => !!(one() && one().data.wrap && one().data.wrap.mode === 'contour'), run: () => D3.setWrap('contour'), enabled: () => VP.sel.length > 0 },
    wrapBox: { label: 'Çerçeve boyunca', checked: () => !!(one() && one().data.wrap && one().data.wrap.mode === 'box'), run: () => D3.setWrap('box'), enabled: () => VP.sel.length > 0 },
    wrapNone: { label: 'Sarma yok', checked: () => !!(one() && !(one().data.wrap && one().data.wrap.mode)), run: () => D3.setWrap('none'), enabled: () => VP.sel.length > 0 },
    wrapOffset: { label: 'Metin uzaklığı…', run: () => D3.wrapOffset(), enabled: () => VP.sel.some((it) => it.data && it.data.wrap) }
  });
  ins('view', 'multiPage', ['|', 'h:Perspektif çizim', 'pdOn1', 'pdOn2', 'pdOn3', 'pdOffA']);
  ins('object', null, ['|', 'fitObjPath', 'sub:Paragraf metnini sar|wrapContour,wrapBox,wrapNone,wrapOffset']);
  ins('effects', 'fxBevel', ['impactToolA']);
  ins('text', null, ['|', 'sub:Paragraf metnini sar|wrapContour,wrapBox,wrapNone,wrapOffset']);
  VP.on('doc', () => {
    if (PD.on) VP.drawOverlay();
  });
})();
