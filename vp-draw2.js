/* VektörPad drawing tools, second set: freehand pick, 3-point rectangle/ellipse, complex star, graph paper,
   common shapes, smart drawing, artistic media modes and sprayer, sketch, LiveSketch, variable outline,
   freehand knife, virtual segment delete and the attributes eyedropper. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const D = (VP.draw2 = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);
  const T = VP.tools;
  const d = VP.defaults;
  Object.assign(VP.defaults, {
    cstarSides: 9, cstarStep: 2, graphRows: 4, graphCols: 4, perfectCat: 'basic', perfectShape: 'heart',
    smartTol: 5, brushMode: 'preset', brushPreset: 'taper', nibAngle: 45, sprayShape: 'leaf', spraySize: 6, spraySpacing: 5,
    sprayVar: 40, sprayRotate: 'path', sprayColors: 'current', sketchLines: 3, sketchJitter: 30, liveDelay: 2, knifeMode: 'line',
    attrFill: true, attrStroke: true, attrOpacity: true, attrShadow: true, attrText: true
  }, VP.defaults);
  const style = (p, kind) => {
    VP.applyDefaultStyle(p, kind);
    return p;
  };
  const addItem = (it) => {
    VP.ensureLayer();
    VP.activeLayer.addChild(it);
    return it;
  };
  const marquee = (L, rect) => {
    if (!rect) return;
    const s = 1 / zoom();
    L.addChild(new paper.Path.Rectangle({ rectangle: rect, strokeColor: acc(), strokeWidth: s, dashArray: [4 * s, 3 * s], insert: false }));
  };
  const rdp = (pts, eps) => {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [s, e] = st.pop();
      const a = pts[s];
      const ab = pts[e].subtract(a);
      const L = ab.length;
      let idx = -1;
      let md = eps;
      for (let i = s + 1; i < e; i++) {
        const dd = L < 1e-9 ? pts[i].getDistance(a) : Math.abs(ab.cross(pts[i].subtract(a))) / L;
        if (dd > md) {
          md = dd;
          idx = i;
        }
      }
      if (idx > 0) {
        keep[idx] = 1;
        st.push([s, idx], [idx, e]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  };
  D.rdp = rdp;

  /* =============== freehand pick (lasso) =============== */
  T.lassoTool = {
    cursor: 'crosshair',
    pts: null,
    busy() { return !!this.pts; },
    down(e) {
      this.pts = [e.point];
    },
    move(e) {
      if (!this.pts) return;
      if (e.point.getDistance(this.pts[this.pts.length - 1]) * zoom() > 3) this.pts.push(e.point);
      VP.drawOverlay();
    },
    up(e) {
      const pts = this.pts;
      this.pts = null;
      if (!pts || pts.length < 3) {
        const hit = VP.hitItem(e.point);
        VP.setSelection(hit ? [hit] : []);
        return;
      }
      const lasso = new paper.Path({ segments: pts, closed: true, insert: false });
      const inside = (it) => {
        const b = it.bounds;
        if (e.alt) return lasso.contains(b.center) || [b.topLeft, b.topRight, b.bottomLeft, b.bottomRight].some((p) => lasso.contains(p));
        return [b.topLeft, b.topRight, b.bottomLeft, b.bottomRight, b.center].every((p) => lasso.contains(p));
      };
      let picked = VP.allSelectable().filter(inside);
      if (e.shift || VP.settings.multi) picked = VP.sel.concat(picked.filter((it) => !VP.sel.includes(it)));
      VP.setSelection(picked);
      VP.toast(picked.length ? picked.length + ' nesne seçildi' : 'Çizilen alanın içinde tamamen kalan nesne yok · Alt: değenleri seç');
    },
    cancel() {
      this.pts = null;
      VP.drawOverlay();
    },
    overlayAfter(L) {
      if (!this.pts) return;
      const s = 1 / zoom();
      const p = new paper.Path({ segments: this.pts, closed: true, insert: false });
      p.strokeColor = acc();
      p.strokeWidth = s;
      p.dashArray = [4 * s, 3 * s];
      const f = acc();
      f.alpha = 0.08;
      p.fillColor = f;
      L.addChild(p);
    }
  };

  /* =============== 3-point rectangle and ellipse =============== */
  const threePoint = (kind) => ({
    cursor: 'crosshair',
    item: null,
    op: null,
    busy() { return !!this.item; },
    down(e) {
      const p = VP.snapPt(e.point);
      if (this.item && this.base) {
        this.op = 'height';
        this.setHeight(p);
        return;
      }
      this.base = { a: p, b: p };
      this.op = 'base';
    },
    setHeight(p) {
      const { a, b } = this.base;
      const u = b.subtract(a).normalize();
      const n = u.rotate(90);
      const hgt = p.subtract(a).dot(n);
      const prm = this.item.data.param;
      const c = a.add(b).divide(2).add(n.multiply(hgt / 2));
      prm.cx = c.x;
      prm.cy = c.y;
      prm.h = Math.max(0.5, Math.abs(hgt));
      VP.rebuildParam(this.item);
      VP.drawOverlay();
    },
    move(e) {
      const p = VP.snapPt(e.point);
      if (this.op === 'base') {
        this.base.b = p;
        VP.drawOverlay();
      } else if (this.op === 'height') this.setHeight(p);
    },
    up(e) {
      const op = this.op;
      this.op = null;
      if (op === 'base') {
        const { a, b } = this.base;
        if (a.getDistance(b) * zoom() < 6) {
          this.base = null;
          const hit = VP.hitItem(e.point);
          VP.setSelection(hit ? [hit] : []);
          return;
        }
        const c = a.add(b).divide(2);
        const prm = { kind, cx: c.x, cy: c.y, w: a.getDistance(b), h: 0.5, angle: b.subtract(a).angle };
        if (kind === 'rect') prm.r = 0;
        VP.setSelection([]);
        this.item = VP.createParam(prm);
        VP.toast('Şimdi yüksekliği belirlemek için dokunun veya sürükleyin');
        return;
      }
      if (op === 'height') {
        this.setHeight(VP.snapPt(e.point));
        const it = this.item;
        this.item = null;
        this.base = null;
        VP.setSelection([it]);
        VP.commit();
      }
    },
    cancel() {
      if (this.item) this.item.remove();
      this.item = null;
      this.base = null;
      this.op = null;
      VP.drawOverlay();
    },
    deactivate() {
      if (this.item) this.cancel();
    },
    overlayAfter(L) {
      if (!this.base || this.item) return;
      const s = 1 / zoom();
      L.addChild(new paper.Path.Line({ from: this.base.a, to: this.base.b, strokeColor: acc(), strokeWidth: 1.5 * s, insert: false }));
    }
  });
  T.rect3Tool = threePoint('rect');
  T.ellipse3Tool = threePoint('ellipse');

  /* =============== drag-a-box shape tools (complex star, graph paper, common shapes) =============== */
  const boxTool = (make) => ({
    cursor: 'crosshair',
    op: null,
    busy() { return !!this.op; },
    down(e) {
      this.op = { a: VP.snapPt(e.point), b: null, raw: e.point };
    },
    move(e) {
      if (!this.op) return;
      let b = VP.snapPt(e.point);
      if (VP.defaults.equal !== !!e.ctrl) {
        const dv = b.subtract(this.op.a);
        const m = Math.max(Math.abs(dv.x), Math.abs(dv.y));
        b = this.op.a.add(Pt(Math.sign(dv.x || 1) * m, Math.sign(dv.y || 1) * m));
      }
      this.op.b = b;
      VP.drawOverlay();
    },
    up(e) {
      const op = this.op;
      this.op = null;
      VP.drawOverlay();
      if (!op || !op.b) {
        const hit = VP.hitItem(e.point);
        VP.setSelection(hit ? [hit] : []);
        return;
      }
      const r = new paper.Rectangle(op.a, op.b);
      if (r.width * zoom() < 4 || r.height * zoom() < 4) return;
      const it = make(r);
      if (!it) return;
      VP.setSelection([it]);
      VP.commit();
    },
    cancel() {
      this.op = null;
      VP.drawOverlay();
    },
    overlayAfter(L) {
      if (this.op && this.op.b) marquee(L, new paper.Rectangle(this.op.a, this.op.b));
    }
  });
  T.cstarTool = boxTool((r) => VP.createParam({ kind: 'cstar', cx: r.center.x, cy: r.center.y, w: r.width, h: r.height, angle: 0, sides: VP.defaults.cstarSides, step: VP.defaults.cstarStep }));
  T.graphTool = boxTool((r) => {
    const rows = clamp(Math.round(VP.defaults.graphRows), 1, 99);
    const cols = clamp(Math.round(VP.defaults.graphCols), 1, 99);
    const g = new paper.Group({ insert: false });
    const cw = r.width / cols;
    const ch = r.height / rows;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const p = VP.buildParamPath({ kind: 'rect', cx: r.left + cw * (j + 0.5), cy: r.top + ch * (i + 0.5), w: cw, h: ch, r: 0, angle: 0 });
        p.data.param = { kind: 'rect', cx: r.left + cw * (j + 0.5), cy: r.top + ch * (i + 0.5), w: cw, h: ch, r: 0, angle: 0 };
        style(p, 'closed');
        g.addChild(p);
      }
    }
    g.data.label = 'Kâğıt ızgarası (' + rows + ' × ' + cols + ')';
    return addItem(g);
  });
  T.perfectTool = boxTool((r) => {
    const id = VP.defaults.perfectShape;
    const def = VP.perfect.find(id);
    return VP.createParam({ kind: 'perfect', shape: id, adj: def && def[1] != null ? def[1] : null, cx: r.center.x, cy: r.center.y, w: r.width, h: r.height, angle: 0 });
  });

  /* =============== smart drawing =============== */
  // Recognises a freehand stroke as a line, rectangle, ellipse, triangle or polygon.
  D.recognize = (pts, tolLevel) => {
    const b = new paper.Path({ segments: pts, insert: false }).bounds;
    const diag = Math.max(1e-6, Math.sqrt(b.width * b.width + b.height * b.height));
    const closed = pts[0].getDistance(pts[pts.length - 1]) < diag * 0.18;
    const eps = diag * (0.025 + tolLevel * 0.012);
    if (!closed) {
      const simp = rdp(pts, eps);
      if (simp.length <= 2) return { type: 'line', a: pts[0], b: pts[pts.length - 1] };
      return { type: 'curve' };
    }
    const loop = pts.slice(0, -1).concat([pts[0]]);
    // principal axes for rotated shapes
    let mx = 0;
    let my = 0;
    loop.forEach((p) => {
      mx += p.x;
      my += p.y;
    });
    mx /= loop.length;
    my /= loop.length;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    loop.forEach((p) => {
      sxx += (p.x - mx) ** 2;
      syy += (p.y - my) ** 2;
      sxy += (p.x - mx) * (p.y - my);
    });
    const ang = (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI;
    const c = Pt(mx, my);
    const loc = loop.map((p) => p.subtract(c).rotate(-ang));
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    loc.forEach((p) => {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    });
    const rx = (x1 - x0) / 2 || 1;
    const ry = (y1 - y0) / 2 || 1;
    const cc = Pt((x0 + x1) / 2, (y0 + y1) / 2);
    const ellErr = loc.reduce((s, p) => s + Math.abs(Math.hypot((p.x - cc.x) / rx, (p.y - cc.y) / ry) - 1), 0) / loc.length;
    const rectErr = loc.reduce((s, p) => s + Math.min(Math.abs(Math.abs(p.x - cc.x) - rx) / rx, Math.abs(Math.abs(p.y - cc.y) - ry) / ry), 0) / loc.length;
    const center = c.add(cc.rotate(ang));
    const simp = rdp(loop, eps * 1.4);
    const corners = simp.length - 1;
    const tol = 0.05 + tolLevel * 0.012;
    if (rectErr < tol && rectErr < ellErr) return { type: 'rect', cx: center.x, cy: center.y, w: rx * 2, h: ry * 2, angle: ang };
    if (ellErr < tol * 1.6 && corners > 4) return { type: 'ellipse', cx: center.x, cy: center.y, w: rx * 2, h: ry * 2, angle: ang };
    if (corners === 3) return { type: 'poly', pts: simp.slice(0, 3) };
    if (corners >= 4 && corners <= 8) return { type: 'poly', pts: simp.slice(0, corners) };
    if (ellErr < tol * 2.4) return { type: 'ellipse', cx: center.x, cy: center.y, w: rx * 2, h: ry * 2, angle: ang };
    return { type: 'closedCurve' };
  };
  T.smartDraw = {
    cursor: 'crosshair',
    path: null,
    busy() { return !!this.path; },
    down(e) {
      this.path = new paper.Path({ segments: [e.point], strokeColor: acc(), strokeWidth: 1.5 / zoom() });
      this.last = e.vpt;
    },
    move(e) {
      if (!this.path || e.vpt.getDistance(this.last) < 2) return;
      this.last = e.vpt;
      this.path.add(e.point);
    },
    up() {
      const p = this.path;
      this.path = null;
      if (!p) return;
      const pts = p.segments.map((s) => s.point);
      p.remove();
      if (pts.length < 3) return;
      const r = D.recognize(pts, VP.defaults.smartTol);
      let out;
      const names = { line: 'Çizgi', rect: 'Dörtgen', ellipse: 'Elips', poly: 'Çokgen', curve: 'Eğri', closedCurve: 'Kapalı eğri' };
      if (r.type === 'rect' || r.type === 'ellipse') out = VP.createParam(Object.assign({ kind: r.type, r: 0 }, r));
      else if (r.type === 'line') out = addItem(style(new paper.Path({ segments: [r.a, r.b], insert: false }), 'open'));
      else if (r.type === 'poly') out = addItem(style(new paper.Path({ segments: r.pts, closed: true, insert: false }), 'closed'));
      else {
        const c = new paper.Path({ segments: pts, closed: r.type === 'closedCurve', insert: false });
        c.simplify(2.5 / zoom());
        out = addItem(style(c, r.type === 'closedCurve' ? 'closed' : 'open'));
      }
      if (r.type === 'poly') names.poly = ['', '', '', 'Üçgen', 'Dörtgen', 'Beşgen', 'Altıgen', 'Yedigen', 'Sekizgen'][r.pts.length] || 'Çokgen';
      VP.setSelection([out]);
      VP.commit();
      VP.ui.showHint('Tanınan şekil: ' + names[r.type]);
    },
    cancel() {
      if (this.path) this.path.remove();
      this.path = null;
    }
  };

  /* =============== artistic media: preset, calligraphy, sprayer, pressure =============== */
  const PRESETS = {
    taper: ['Sivri uçlu', (t) => Math.pow(Math.sin(Math.PI * t), 0.7)],
    teardrop: ['Damla', (t) => Math.min(1, (1 - t) * 1.2) * Math.min(1, t * 8)],
    reverse: ['Ters damla', (t) => Math.min(1, t * 1.2) * Math.min(1, (1 - t) * 8)],
    flat: ['Düz', (t) => Math.min(1, t * 10, (1 - t) * 10)],
    pulse: ['Dalgalı', (t) => (0.55 + 0.45 * Math.sin(t * Math.PI * 6)) * Math.min(1, t * 8, (1 - t) * 8)],
    nib: ['Kalem ucu', (t) => (0.3 + 0.7 * Math.sin(Math.PI * t))]
  };
  D.BRUSH_PRESETS = PRESETS;
  const outline = (pts, w) => {
    const n = pts.length;
    const L = [];
    const R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      let tg = b.subtract(a);
      if (tg.isZero()) tg = Pt(1, 0);
      const nrm = tg.normalize().rotate(90);
      L.push(pts[i].add(nrm.multiply(Math.max(0.05, w[i]) / 2)));
      R.push(pts[i].subtract(nrm.multiply(Math.max(0.05, w[i]) / 2)));
    }
    const out = new paper.Path({ segments: L.concat(R.reverse()), closed: true, insert: false });
    out.smooth({ type: 'catmull-rom' });
    out.simplify(0.25 / zoom());
    return out;
  };
  D.outline = outline;
  const STAMPS = {
    leaf: ['Yaprak', 'M0 -50C30 -30 30 30 0 50C-30 30 -30 -30 0 -50Z M0 -45V45'],
    star: ['Yıldız', 'M0 -50L12 -16L48 -15L19 6L29 40L0 20L-29 40L-19 6L-48 -15L-12 -16Z'],
    dot: ['Nokta', 'M-40 0A40 40 0 1 0 40 0A40 40 0 1 0 -40 0Z'],
    heart: ['Kalp', 'M0 40C-30 20 -50 5 -50 -15C-50 -32 -37 -42 -24 -42C-12 -42 -4 -34 0 -26C4 -34 12 -42 24 -42C37 -42 50 -32 50 -15C50 5 30 20 0 40Z'],
    flower: ['Çiçek', null],
    confetti: ['Konfeti', 'M-50 -12H50V12H-50Z'],
    bubble: ['Baloncuk', 'M-45 0A45 45 0 1 0 45 0A45 45 0 1 0 -45 0Z M-30 -12A16 16 0 0 1 -12 -30']
  };
  D.STAMPS = STAMPS;
  const PALS = {
    current: null,
    rainbow: ['#e30613', '#ef7d00', '#ffed00', '#3aaa35', '#00a0e3', '#2d2e83', '#662483'],
    autumn: ['#7d4e24', '#c49a6c', '#ef7d00', '#e30613', '#f9b200', '#a3195b'],
    ocean: ['#00a19a', '#0069b4', '#a6d8f0', '#2d2e83', '#00a0e3'],
    spring: ['#3aaa35', '#c8d400', '#f39fc5', '#fff7b2', '#00843d']
  };
  const rng = (seed) => () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const stamp = (id) => {
    if (id === 'flower') {
      let f = new paper.Path.Circle({ center: [0, 0], radius: 14, insert: false });
      for (let i = 0; i < 6; i++) {
        const pt = new paper.Path.Ellipse({ rectangle: new paper.Rectangle(-12, -50, 24, 40), insert: false });
        pt.rotate(i * 60, Pt(0, 0));
        f = f.unite(pt, { insert: false });
      }
      return f;
    }
    return new paper.CompoundPath({ pathData: STAMPS[id][1], insert: false });
  };
  const spray = (pts) => {
    const g = new paper.Group({ insert: false });
    const path = new paper.Path({ segments: pts, insert: false });
    if (pts.length > 2) path.smooth({ type: 'catmull-rom' });
    const len = path.length;
    const size = VP.toPT(VP.defaults.spraySize);
    const gap = Math.max(VP.toPT(0.5), VP.toPT(VP.defaults.spraySpacing));
    const vari = clamp(VP.defaults.sprayVar, 0, 100) / 100;
    const pal = PALS[VP.defaults.sprayColors];
    const base = VP.defaults.fill || VP.defaults.stroke || '#3aaa35';
    const rnd = rng(Math.floor(len * 13) + 7);
    const proto = stamp(VP.defaults.sprayShape);
    for (let s = 0, i = 0; s <= len + 1e-6; s += gap, i++) {
      const p = path.getPointAt(Math.min(s, len));
      const tg = path.getTangentAt(Math.min(s, len));
      if (!p) continue;
      const it = proto.clone({ insert: false });
      const k = (size / 100) * (1 - vari / 2 + rnd() * vari);
      it.scale(k, Pt(0, 0));
      const rot = VP.defaults.sprayRotate === 'random' ? rnd() * 360 : (tg ? tg.angle : 0) + 90;
      it.rotate(rot, Pt(0, 0));
      it.translate(p);
      it.fillColor = pal ? pal[Math.floor(rnd() * pal.length)] : base;
      it.fillRule = 'evenodd';
      it.strokeColor = VP.defaults.sprayShape === 'leaf' || VP.defaults.sprayShape === 'bubble' ? new paper.Color(0, 0, 0, 0.25) : null;
      it.strokeWidth = 0.4;
      g.addChild(it);
    }
    g.data.label = 'Püskürtme: ' + STAMPS[VP.defaults.sprayShape][0].toLocaleLowerCase('tr') + ' (' + g.children.length + ')';
    return g;
  };
  const brush = T.brush;
  const brushUp0 = brush.up;
  brush.up = function () {
    const mode = VP.defaults.brushMode;
    if (mode === 'pressure' || !this.samples) return brushUp0.call(this);
    const S = this.samples;
    this.samples = null;
    if (this.preview) this.preview.remove();
    this.preview = null;
    const W = VP.toPT(VP.defaults.brushWidth);
    const minStep = Math.max(W * 0.2, 1 / zoom());
    const pts = [S[0].p];
    for (let i = 1; i < S.length; i++) if (S[i].p.getDistance(pts[pts.length - 1]) >= minStep) pts.push(S[i].p);
    if (pts.length < 2) pts.push(S[S.length - 1].p.add(Pt(0.5, 0)));
    let out;
    if (mode === 'sprayer') out = spray(pts);
    else {
      const n = pts.length;
      let acc0 = 0;
      const lens = [0];
      for (let i = 1; i < n; i++) lens.push((acc0 += pts[i].getDistance(pts[i - 1])));
      const total = acc0 || 1;
      const nib = (VP.defaults.nibAngle * Math.PI) / 180;
      const prof = (PRESETS[VP.defaults.brushPreset] || PRESETS.taper)[1];
      let w = pts.map((p, i) => {
        if (mode === 'calligraphy') {
          const a = pts[Math.max(0, i - 1)];
          const b = pts[Math.min(n - 1, i + 1)];
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          return W * (0.12 + 0.88 * Math.abs(Math.sin(ang - nib)));
        }
        return W * prof(lens[i] / total);
      });
      w = w.map((v, i) => (w[Math.max(0, i - 1)] + v * 2 + w[Math.min(n - 1, i + 1)]) / 4);
      out = outline(pts, w);
      out.fillColor = new paper.Color(this.ink());
      out.strokeColor = null;
      out.data.brush = true;
    }
    addItem(out);
    VP.setSelection([out]);
    VP.commit();
  };

  /* =============== sketch: several loose strokes =============== */
  T.sketchTool = {
    cursor: 'crosshair',
    path: null,
    busy() { return !!this.path; },
    down(e) {
      this.path = new paper.Path({ segments: [e.point], strokeColor: VP.defaults.stroke || '#1d1d1b', strokeWidth: 0.6, opacity: 0.6 });
      this.last = e.vpt;
    },
    move(e) {
      if (!this.path || e.vpt.getDistance(this.last) < 2) return;
      this.last = e.vpt;
      this.path.add(e.point);
    },
    up() {
      const p = this.path;
      this.path = null;
      if (!p) return;
      if (p.segments.length < 3) return p.remove();
      p.simplify(1.5 / zoom());
      const g = new paper.Group({ insert: false });
      const n = clamp(Math.round(VP.defaults.sketchLines), 1, 8);
      const jit = (clamp(VP.defaults.sketchJitter, 0, 100) / 100) * VP.toPT(1.6);
      const rnd = rng(Math.floor(p.length * 31) + 3);
      for (let k = 0; k < n; k++) {
        const c = new paper.Path({ insert: false });
        const L = p.length;
        const steps = Math.max(6, Math.round(L / VP.toPT(3)));
        const s0 = k ? rnd() * 0.06 * L : 0;
        const s1 = L - (k ? rnd() * 0.06 * L : 0);
        let off = (rnd() - 0.5) * jit;
        for (let i = 0; i <= steps; i++) {
          const s = s0 + ((s1 - s0) * i) / steps;
          const q = p.getPointAt(s);
          const nrm = p.getNormalAt(s);
          off = off * 0.7 + (rnd() - 0.5) * jit * 0.6;
          if (q && nrm) c.add(q.add(nrm.multiply(k ? off : off * 0.3)));
        }
        c.smooth({ type: 'catmull-rom' });
        c.strokeColor = VP.defaults.stroke || '#1d1d1b';
        c.strokeWidth = Math.max(0.3, VP.defaults.strokeWidth * (k ? 0.6 : 1));
        c.strokeCap = 'round';
        c.opacity = k ? 0.75 : 1;
        g.addChild(c);
      }
      p.remove();
      g.data.label = 'Karalama';
      addItem(g);
      VP.setSelection([g]);
      VP.commit();
    },
    cancel() {
      if (this.path) this.path.remove();
      this.path = null;
    }
  };

  /* =============== LiveSketch: overlapping strokes merge into one smooth curve =============== */
  T.liveSketch = {
    cursor: 'crosshair',
    path: null,
    lastCurve: null,
    lastTime: 0,
    busy() { return !!this.path; },
    down(e) {
      this.path = new paper.Path({ segments: [e.point], strokeColor: acc(), strokeWidth: 1.2 / zoom(), opacity: 0.8 });
      this.last = e.vpt;
    },
    move(e) {
      if (!this.path || e.vpt.getDistance(this.last) < 2) return;
      this.last = e.vpt;
      this.path.add(e.point);
    },
    up() {
      const p = this.path;
      this.path = null;
      if (!p) return;
      const pts = p.segments.map((s) => s.point);
      p.remove();
      if (pts.length < 3) return;
      const D0 = 18 / zoom();
      const prev = this.lastCurve && this.lastCurve.parent && performance.now() - this.lastTime < VP.defaults.liveDelay * 1000 ? this.lastCurve : null;
      let target = prev;
      if (target) {
        const near = pts.filter((q) => target.getNearestPoint(q).getDistance(q) < D0).length;
        if (near < Math.min(4, pts.length / 4)) target = null;
      }
      if (!target) {
        const c = new paper.Path({ segments: pts, insert: false });
        c.simplify(2 / zoom());
        style(c, 'open');
        addItem(c);
        c.data.liveSketch = true;
        this.lastCurve = c;
      } else {
        // samples of the old curve, pulled towards the new stroke where they overlap, plus any new ends
        const L = target.length;
        const step = 2 / zoom();
        const old = [];
        for (let s = 0; s <= L; s += step) old.push(target.getPointAt(s));
        const inside = (q) => target.getNearestPoint(q).getDistance(q) < D0;
        const merged = old.map((o) => {
          let best = null;
          let bd = D0;
          pts.forEach((q) => {
            const dd = q.getDistance(o);
            if (dd < bd) {
              bd = dd;
              best = q;
            }
          });
          return best ? o.add(best).divide(2) : o;
        });
        const startNearEnd = target.lastSegment.point.getDistance(pts[0]) < target.firstSegment.point.getDistance(pts[0]);
        const tail = pts.filter((q) => !inside(q));
        let all;
        if (startNearEnd) all = merged.concat(tail);
        else all = tail.concat(merged);
        const c = new paper.Path({ segments: all, insert: false });
        c.simplify(2 / zoom());
        target.segments = c.segments;
      }
      this.lastTime = performance.now();
      VP.setSelection([this.lastCurve]);
      VP.commit();
    },
    cancel() {
      if (this.path) this.path.remove();
      this.path = null;
    }
  };

  /* =============== variable outline (live) =============== */
  FX.NAMES.varline = 'Değişken anahat';
  VP.KIND_NAMES.varline = 'Değişken anahat';
  const vSrc = (g) => g.children.find((c) => c.data.effectSrc);
  const widthAt = (stops, t) => {
    const s = stops.slice().sort((a, b) => a.t - b.t);
    if (t <= s[0].t) return s[0].w;
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i].t) {
        const u = (t - s[i - 1].t) / (s[i].t - s[i - 1].t || 1);
        const k = u * u * (3 - 2 * u);
        return s[i - 1].w + (s[i].w - s[i - 1].w) * k;
      }
    }
    return s[s.length - 1].w;
  };
  D.buildVar = (g) => {
    const fx = g.data.effect;
    const src = vSrc(g);
    if (!src) return;
    g.children.slice().forEach((c) => c !== src && c.remove());
    src.visible = false;
    const L = src.length;
    if (!(L > 0.5)) return;
    const n = clamp(Math.round(L / 1.5), 12, 500);
    const pts = [];
    const w = [];
    for (let i = 0; i <= n; i++) {
      const s = (L * i) / n;
      pts.push(src.getPointAt(Math.min(s, L)));
      w.push(widthAt(fx.stops, i / n));
    }
    let shape;
    if (src.closed) {
      pts.pop();
      w.pop();
      const nn = pts.length;
      const outer = [];
      const inner = [];
      for (let i = 0; i < nn; i++) {
        const tg = pts[(i + 1) % nn].subtract(pts[(i - 1 + nn) % nn]).normalize();
        const nrm = tg.rotate(90);
        outer.push(pts[i].add(nrm.multiply(w[i] / 2)));
        inner.push(pts[i].subtract(nrm.multiply(w[i] / 2)));
      }
      shape = new paper.CompoundPath({ children: [new paper.Path({ segments: outer, closed: true, insert: false }), new paper.Path({ segments: inner, closed: true, insert: false })], insert: false });
      shape.fillRule = 'evenodd';
      shape.children.forEach((c) => {
        c.smooth({ type: 'catmull-rom' });
        c.simplify(0.15);
      });
    } else shape = outline(pts, w);
    shape.fillColor = fx.color;
    shape.strokeColor = null;
    shape.data.varShape = true;
    g.addChild(shape);
  };
  D.makeVar = (path) => {
    if (!(path instanceof paper.Path) || FX.isFx(path)) return VP.toast('Değişken anahat tek bir eğriye uygulanır');
    const col = path.strokeColor ? VP.hex(path.strokeColor) : '#1d1d1b';
    const w0 = Math.max(path.strokeWidth || 1, 0.5);
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.insertAbove(path);
    delete path.data.param;
    path.data.effectSrc = true;
    g.addChild(path);
    g.data.effect = { type: 'varline', color: col, stops: [{ t: 0, w: w0 }, { t: 0.5, w: w0 * 3 }, { t: 1, w: w0 }] };
    D.buildVar(g);
    VP.setSelection([g]);
    VP.commit();
    VP.toast('Değişken anahat · Eğri üzerinde dokunup sürükleyin: o noktada kalınlık değişir');
    return g;
  };
  FX.TYPES.varline = {
    tool: 'varOutline',
    build: (g) => D.buildVar(g),
    probe(g) {
      const p = new paper.Path.Line({ from: [0, 0], to: [10, 0], insert: false });
      p.fillColor = g.data.effect.color;
      p.strokeColor = g.data.effect.color;
      return p;
    },
    restyle(g, fn) {
      const p = FX.TYPES.varline.probe(g);
      const f0 = VP.hex(p.fillColor);
      fn([p]);
      const f = p.fillColor ? VP.hex(p.fillColor) : null;
      const s = p.strokeColor ? VP.hex(p.strokeColor) : null;
      g.data.effect.color = f && f !== f0 ? f : s || f || g.data.effect.color;
      D.buildVar(g);
    },
    describe: (g) => 'Değişken anahat (' + g.data.effect.stops.length + ' kalınlık noktası)',
    bake(g) {
      const s = vSrc(g);
      if (s) s.remove();
    },
    bakeMsg: 'Değişken anahat, dolgulu şekle dönüştürüldü',
    clear(g) {
      const s = vSrc(g);
      if (!s) {
        g.remove();
        return [];
      }
      s.visible = true;
      s.strokeColor = g.data.effect.color;
      delete s.data.effectSrc;
      s.transform(g.matrix);
      s.insertAbove(g);
      g.remove();
      return [s];
    },
    clearMsg: 'Değişken anahat kaldırıldı',
    dblTap(g) {
      VP.setSelection([g]);
      VP.setTool('varOutline');
    },
    fields: (g) => '<span class="pb-label">Değişken anahat</span>' + H.colorField('Renk', 'dvColor', g.data.effect.color) + H.btn('dvEven', 'Eşit kalınlık', 'Bütün noktaları aynı kalınlığa getir') + H.btn('fxMenu', 'Efekt ▾', 'Ayır veya kaldır'),
    panel: (g) => '<div class="row">' + H.colorField('Renk', 'dvColor', g.data.effect.color) + H.btn('dvEven', 'Eşit kalınlık', 'Bütün noktaları aynı kalınlığa getir') + '</div><p class="sec-note">Değişken anahat aracıyla eğrinin üzerinde sürükleyerek kalınlık noktası ekleyin; noktaya çift dokunun: silinir.</p>'
  };
  T.varOutline = {
    cursor: 'crosshair',
    op: null,
    busy() { return !!(this.op && this.op.changed); },
    target() {
      const g = VP.sel.length === 1 ? VP.sel[0] : null;
      return FX.of(g) && FX.of(g).type === 'varline' ? g : null;
    },
    down(e) {
      const g = this.target();
      if (g) {
        const src = vSrc(g);
        const lp = g.globalToLocal(e.point);
        const loc = src.getNearestLocation(lp);
        const tol = (VP.coarse ? 26 : 14) / zoom();
        const fx = g.data.effect;
        const near = loc && loc.point.getDistance(lp) < Math.max(tol, widthAt(fx.stops, loc.offset / src.length) / 2 + tol / 2);
        if (near) {
          const t = loc.offset / src.length;
          let stop = fx.stops.find((s) => Math.abs(s.t - t) * src.length < tol);
          if (stop && e.tapCount >= 2 && fx.stops.length > 2) {
            fx.stops = fx.stops.filter((s) => s !== stop);
            D.buildVar(g);
            VP.commit();
            return;
          }
          if (!stop) {
            stop = { t, w: widthAt(fx.stops, t) };
            fx.stops.push(stop);
          }
          this.op = { g, stop, changed: false };
          return;
        }
      }
      const hit = VP.hitItem(e.point);
      if (!hit) return VP.clearSelection();
      if (FX.of(hit) && FX.of(hit).type === 'varline') return VP.setSelection([hit]);
      if (hit instanceof paper.Path && !FX.isFx(hit)) D.makeVar(hit);
      else VP.toast('Değişken anahat için bir eğriye dokunun');
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      const src = vSrc(op.g);
      const lp = op.g.globalToLocal(e.point);
      const q = src.getPointAt(op.stop.t * src.length);
      op.stop.w = Math.max(0.2, lp.getDistance(q) * 2);
      op.changed = true;
      D.buildVar(op.g);
      VP.drawOverlay();
    },
    up() {
      const op = this.op;
      this.op = null;
      if (op) VP.commit();
    },
    cancel() {
      if (this.op && this.op.changed) VP.undoLive();
      this.op = null;
    },
    overlayAfter(L) {
      const g = this.target();
      if (!g) return;
      const src = vSrc(g);
      const s = 1 / zoom();
      L.addChild(new paper.Path({ segments: src.segments.map((sg) => new paper.Segment(g.localToGlobal(sg.point), sg.handleIn, sg.handleOut)), closed: src.closed, strokeColor: acc(), strokeWidth: s, dashArray: [4 * s, 3 * s], insert: false }));
      g.data.effect.stops.forEach((st) => {
        const p = g.localToGlobal(src.getPointAt(st.t * src.length));
        L.addChild(new paper.Path.Circle({ center: p, radius: 5 * s, fillColor: '#ffffff', strokeColor: acc(), strokeWidth: 1.5 * s, insert: false }));
      });
    }
  };

  /* =============== freehand knife =============== */
  const sliver = (pts) => {
    let shape = null;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dd = b.subtract(a);
      if (dd.length < 1e-6) continue;
      const u = dd.normalize();
      const n = u.rotate(90).multiply(0.012);
      const q = new paper.Path({ segments: [a.subtract(u.multiply(0.05)).add(n), b.add(u.multiply(0.05)).add(n), b.add(u.multiply(0.05)).subtract(n), a.subtract(u.multiply(0.05)).subtract(n)], closed: true, insert: false });
      shape = shape ? shape.unite(q, { insert: false }) : q;
    }
    return shape;
  };
  const knife = T.knifeTool;
  const kd = knife.down;
  const km = knife.move;
  const ku = knife.up;
  const ko = knife.overlayAfter;
  knife.down = function (e) {
    if (VP.defaults.knifeMode !== 'free') return kd.call(this, e);
    this.free = [e.point];
  };
  knife.move = function (e) {
    if (!this.free) return km.call(this, e);
    if (e.point.getDistance(this.free[this.free.length - 1]) * zoom() > 3) this.free.push(e.point);
    VP.drawOverlay();
  };
  knife.up = function (e) {
    if (!this.free) return ku.call(this, e);
    const pts = rdp(this.free, 0.8 / zoom());
    this.free = null;
    VP.drawOverlay();
    if (pts.length < 2) return;
    const cut = sliver(pts);
    const line = new paper.Path({ segments: pts, insert: false });
    const targets = (VP.sel.filter((it) => VP.isPathItem(it) && !FX.isFx(it)).length ? VP.sel : VP.allSelectable()).filter((it) => VP.isPathItem(it) && !FX.isFx(it) && it.bounds.intersects(line.bounds));
    let pieces = 0;
    const out = [];
    targets.forEach((it) => {
      if (it.getIntersections(line).length < 2 || (it instanceof paper.Path && !it.closed)) return;
      let res;
      try {
        res = it.subtract(cut, { insert: false });
      } catch (err) {
        return;
      }
      const kids = res instanceof paper.CompoundPath ? res.children.slice() : [res];
      if (kids.length < 2) return;
      const groups = [];
      kids.sort((a, b) => Math.abs(b.area) - Math.abs(a.area)).forEach((k) => {
        const owner = groups.find((gg) => gg.o.clockwise !== k.clockwise && gg.o.contains(k.interiorPoint));
        if (owner) owner.h.push(k);
        else groups.push({ o: k, h: [] });
      });
      if (groups.length < 2) return;
      groups.forEach((gg) => {
        const p = gg.h.length ? new paper.CompoundPath({ children: [gg.o.clone({ insert: false }), ...gg.h.map((h) => h.clone({ insert: false }))], insert: false }) : gg.o.clone({ insert: false });
        p.fillColor = it.fillColor;
        p.strokeColor = it.strokeColor;
        p.strokeWidth = it.strokeWidth;
        p.opacity = it.opacity;
        p.data = JSON.parse(JSON.stringify(it.data || {}));
        delete p.data.param;
        p.insertAbove(it);
        out.push(p);
      });
      it.remove();
      pieces += groups.length;
    });
    if (!pieces) return VP.toast('Bıçak çizgisi bir şeklin içinden tamamen geçmeli');
    VP.setSelection(out);
    VP.commit();
    VP.toast('Kesildi: ' + pieces + ' parça');
  };
  knife.overlayAfter = function (L) {
    if (!this.free) return ko.call(this, L);
    const s = 1 / zoom();
    L.addChild(new paper.Path({ segments: this.free, strokeColor: '#d6362b', strokeWidth: 1.6 * s, dashArray: [6 * s, 4 * s], insert: false }));
  };

  /* =============== virtual segment delete =============== */
  D.virtualDelete = (pt) => {
    const hit = VP.hitItem(pt);
    if (!hit || !VP.isPathItem(hit) || FX.isFx(hit)) return VP.toast('Silmek istediğiniz eğri parçasına dokunun');
    const loops = hit instanceof paper.CompoundPath ? hit.children : [hit];
    let L = loops[0];
    let bd = Infinity;
    loops.forEach((l) => {
      const q = l.getNearestPoint(pt);
      const dd = q ? q.getDistance(pt) : Infinity;
      if (dd < bd) {
        bd = dd;
        L = l;
      }
    });
    const others = [];
    VP.allSelectable().forEach((it) => {
      if (it === hit || !it.bounds.intersects(L.bounds)) return;
      (it instanceof paper.CompoundPath ? it.children : it instanceof paper.Path ? [it] : []).forEach((c) => others.push(c));
    });
    loops.forEach((l) => l !== L && others.push(l));
    const offs = [];
    others.forEach((o) => L.getIntersections(o).forEach((x) => offs.push(x.offset)));
    L.getIntersections().forEach((x) => offs.push(x.offset));
    const len = L.length;
    const uniq = offs.filter((o) => o > 0.01 && o < len - 0.01).sort((a, b) => a - b).filter((o, i, a) => !i || o - a[i - 1] > 0.05);
    const style0 = { fill: hit.fillColor, stroke: hit.strokeColor, w: hit.strokeWidth, cap: hit.strokeCap, join: hit.strokeJoin, op: hit.opacity };
    const finish = (pieces) => {
      pieces.forEach((p) => {
        p.fillColor = null;
        p.strokeColor = style0.stroke || new paper.Color('#1d1d1b');
        p.strokeWidth = style0.w || 1;
        p.strokeCap = style0.cap;
        p.strokeJoin = style0.join;
        p.opacity = style0.op;
        p.insertAbove(hit);
      });
      if (L === hit || loops.length === 1) hit.remove();
      else L.remove();
      VP.setSelection(pieces);
      VP.commit();
    };
    if (!uniq.length) {
      if (loops.length === 1) {
        hit.remove();
        VP.setSelection([]);
      } else L.remove();
      VP.commit();
      return VP.toast('Kesişmeyen eğri tümüyle silindi');
    }
    delete hit.data.param;
    const tap = L.getOffsetOf(L.getNearestPoint(pt));
    const work = L.clone({ insert: false });
    if (work.closed) {
      let a = uniq[uniq.length - 1];
      let b = uniq[0];
      for (let i = 0; i < uniq.length; i++) {
        if (uniq[i] > tap) {
          b = uniq[i];
          a = i ? uniq[i - 1] : uniq[uniq.length - 1];
          break;
        }
      }
      // open the loop at the far end of the deleted piece, then cut the piece off its tail
      work.splitAt(b);
      const aa = (a - b + len) % len || len;
      const tail = work.splitAt(aa);
      if (tail) tail.remove();
      return finish([work]);
    }
    let a = null;
    let b = null;
    uniq.forEach((o) => {
      if (o < tap) a = o;
      else if (b == null) b = o;
    });
    const pieces = [];
    const rest = b != null ? work.splitAt(b) : null;
    const mid = a != null ? work.splitAt(a) : work;
    if (a != null) pieces.push(work);
    if (rest) pieces.push(rest);
    if (mid && mid !== work) mid.remove();
    return finish(pieces);
  };
  T.virtualDel = {
    cursor: 'crosshair',
    busy() { return false; },
    down() {},
    move() {},
    up(e) {
      D.virtualDelete(e.point);
    },
    cancel() {}
  };

  /* =============== attributes eyedropper =============== */
  T.attrEyedropper = {
    cursor: 'copy',
    sample: null,
    busy() { return false; },
    deactivate() { this.sample = null; },
    down() {},
    move() {},
    up(e) {
      const hit = VP.hitItem(e.point);
      if (!hit) {
        this.sample = null;
        UI.schedule('prop');
        return VP.toast('Nitelik örneği bırakıldı');
      }
      if (!this.sample) {
        const lf = VP.leafItems([hit])[0] || hit;
        this.sample = { fill: VP.getFill(hit), stroke: VP.getStroke(hit), opacity: hit.opacity, blend: hit.blendMode, shadow: hit.data.shadow ? Object.assign({}, hit.data.shadow) : null, text: lf instanceof paper.PointText ? { family: lf.fontFamily, size: lf.fontSize, weight: lf.fontWeight } : null };
        UI.schedule('prop');
        return VP.toast('Nitelikler alındı · Şimdi uygulanacak nesnelere dokunun');
      }
      const s = this.sample;
      const o = VP.defaults;
      if (o.attrFill && !(hit instanceof paper.Raster)) VP.setFill([hit], s.fill);
      if (o.attrStroke && !(hit instanceof paper.Raster)) VP.setStroke([hit], s.stroke.on ? { on: true, color: s.stroke.color, width: s.stroke.width, dash: s.stroke.dash, cap: s.stroke.cap, join: s.stroke.join } : { on: false });
      if (o.attrOpacity) {
        hit.opacity = s.opacity;
        hit.blendMode = s.blend;
      }
      if (o.attrShadow) VP.setShadow([hit], s.shadow ? Object.assign({ on: true }, s.shadow) : { on: false });
      if (o.attrText && s.text) {
        VP.leafItems([hit]).filter((t) => t instanceof paper.PointText).forEach((t) => {
          t.fontFamily = s.text.family;
          t.fontSize = s.text.size;
          t.fontWeight = s.text.weight;
        });
      }
      VP.commit();
    },
    cancel() {}
  };

  /* =============== meta, property bar =============== */
  Object.assign(VP.TOOL_META, {
    lassoTool: { label: 'Serbest seçim', icon: 'lassoTool', key: '', hint: 'Seçmek istediğiniz nesnelerin çevresini çizin · Alt: çizgiye değenleri de seç' },
    rect3Tool: { label: '3 noktalı dörtgen', icon: 'rect3Tool', key: '', drawing: true, hint: 'Bir kenarı sürükleyerek çizin, sonra yüksekliği belirlemek için dokunun veya sürükleyin' },
    ellipse3Tool: { label: '3 noktalı elips', icon: 'ellipse3Tool', key: '', drawing: true, hint: 'Bir ekseni sürükleyerek çizin, sonra diğer ekseni belirlemek için dokunun veya sürükleyin' },
    cstarTool: { label: 'Karmaşık yıldız', icon: 'cstarTool', key: '', drawing: true, hint: 'Sürükleyerek çizin · Uç sayısı ve keskinlik özellik çubuğunda' },
    graphTool: { label: 'Kâğıt ızgarası', icon: 'graphTool', key: '', drawing: true, hint: 'Sürükleyerek ızgara çizin · Satır ve sütun özellik çubuğunda' },
    perfectTool: { label: 'Hazır şekiller', icon: 'perfectTool', key: '', drawing: true, hint: 'Özellik çubuğundan şekli seçin, sonra sürükleyerek çizin · Ayar özellik çubuğunda' },
    smartDraw: { label: 'Akıllı çizim', icon: 'smartDraw', key: '', drawing: true, hint: 'Elle bir şekil çizin: dörtgen, elips, üçgen, çokgen veya çizgi olarak tanınır' },
    sketchTool: { label: 'Karalama', icon: 'sketchTool', key: '', drawing: true, hint: 'Elle çizin: birkaç gevşek çizgiden oluşan karalama görünümü' },
    liveSketch: { label: 'LiveSketch', icon: 'liveSketch', key: '', drawing: true, hint: 'Çizgileri üst üste çizin: kısa süre içinde çizilen yakın çizgiler tek eğride birleşir' },
    varOutline: { label: 'Değişken anahat', icon: 'varOutline', key: '', hint: 'Bir eğriye dokunun, sonra üzerinde sürükleyin: o noktada kalınlık değişir · Noktaya çift dokunun: silinir' },
    virtualDel: { label: 'Sanal segment silme', icon: 'virtualDel', key: '', hint: 'Bir eğrinin iki kesişme arasındaki parçasına dokunun: o parça silinir' },
    attrEyedropper: { label: 'Nitelik damlalığı', icon: 'attrEyedropper', key: '', hint: 'Önce örnek nesneye, sonra niteliklerin uygulanacağı nesnelere dokunun · Boş yere dokunun: örneği bırak' }
  });
  VP.TOOL_META.brush.label = 'Artistik medya';
  VP.TOOL_META.brush.hint = 'Sürükleyerek çizin · Ön ayar, Püskürtme, Kaligrafi ve Basınç modları özellik çubuğunda';
  const seg = (items, cur, prefix) => '<span class="seg">' + items.map(([v, l]) => '<button data-act="' + prefix + v + '" class="' + (String(v) === String(cur) ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const sel = (label, name, map, cur) => '<label class="field"><span>' + esc(label) + '</span><select data-pf="' + name + '">' + Object.keys(map).map((k) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(Array.isArray(map[k]) ? map[k][0] : map[k]) + '</option>').join('') + '</select></label>';
  const SHAPE_CATS = () => Object.keys(VP.perfect.CATS).map((k) => [k, VP.perfect.CATS[k][0].replace(' şekilleri', '').replace(' şekiller', '')]);
  const pbx = VP.tx.propbar;
  VP.tx.propbar = () => {
    const id = VP.toolId;
    const dd = VP.defaults;
    if (id === 'cstarTool') return '<span class="pb-title">Karmaşık yıldız</span>' + H.field('Uç', 'd2Sides', dd.cstarSides, '') + H.field('Keskinlik', 'd2Step', dd.cstarStep, '');
    if (id === 'graphTool') return '<span class="pb-title">Kâğıt ızgarası</span>' + H.field('Satır', 'd2Rows', dd.graphRows, '') + H.field('Sütun', 'd2Cols', dd.graphCols, '');
    if (id === 'perfectTool') {
      const def = VP.perfect.find(dd.perfectShape);
      return '<span class="pb-title">Hazır şekiller</span>' + seg(SHAPE_CATS(), dd.perfectCat, 'd2Cat:') + H.btn('d2ShapeMenu', VP.perfect.icon(dd.perfectShape).replace('width="34" height="34"', 'width="22" height="22"') + esc(def ? def[0] : '') + ' ▾', 'Şekil seç');
    }
    if (id === 'smartDraw') return '<span class="pb-title">Akıllı çizim</span>' + H.range('Tanıma', 'd2Tol', dd.smartTol, 0, 10) + '<span class="pb-label">Yüksek değer: daha kolay tanır</span>';
    if (id === 'brush') {
      let h = '<span class="pb-title">Artistik medya</span>' + seg([['preset', 'Ön ayar'], ['sprayer', 'Püskürtme'], ['calligraphy', 'Kaligrafi'], ['pressure', 'Basınç']], dd.brushMode, 'd2Mode:');
      if (dd.brushMode === 'preset') h += sel('Çizgi', 'd2Preset', PRESETS, dd.brushPreset);
      if (dd.brushMode === 'calligraphy') h += H.field('Uç açısı', 'd2Nib', dd.nibAngle, '°');
      if (dd.brushMode === 'sprayer') return h + sel('Nesne', 'd2Stamp', STAMPS, dd.sprayShape) + H.field('Boyut', 'd2SSize', VP.num(dd.spraySize, 1)) + H.field('Aralık', 'd2SGap', VP.num(dd.spraySpacing, 1)) + H.field('Çeşitlilik', 'd2SVar', dd.sprayVar, '%') + seg([['path', 'Yola göre'], ['random', 'Rastgele']], dd.sprayRotate, 'd2SRot:') + sel('Renk', 'd2SCol', { current: 'Geçerli renk', rainbow: 'Gökkuşağı', autumn: 'Sonbahar', ocean: 'Okyanus', spring: 'İlkbahar' }, dd.sprayColors);
      return h + H.field('Genişlik', 'brushWidth', VP.num(dd.brushWidth, 1)) + (dd.brushMode === 'pressure' ? H.tog('pressure', ic('pencil', 'sm') + 'Basınç', dd.pressure, 'Apple Pencil baskısını kullan') : '');
    }
    if (id === 'sketchTool') return '<span class="pb-title">Karalama</span>' + H.field('Çizgi', 'd2Lines', dd.sketchLines, '') + H.range('Dağınıklık', 'd2Jit', dd.sketchJitter, 0, 100);
    if (id === 'liveSketch') return '<span class="pb-title">LiveSketch</span>' + H.field('Birleştirme süresi', 'd2Delay', VP.num(dd.liveDelay, 1), 'sn') + '<span class="pb-label">Yakın çizgiler bu süre içinde birleşir</span>';
    if (id === 'knifeTool') return '<span class="pb-title">Bıçak</span>' + seg([['line', '2 noktalı'], ['free', 'Serbest']], dd.knifeMode, 'd2Knife:') + '<span class="pb-label">' + (VP.sel.length ? 'Yalnızca seçili şekiller kesilir' : 'Çizginin geçtiği şekiller kesilir') + '</span>';
    if (id === 'attrEyedropper') {
      const t = (k, l) => H.tog('d2Attr:' + k, l, !!dd[k], l);
      return '<span class="pb-title">Nitelik damlalığı</span>' + t('attrFill', 'Dolgu') + t('attrStroke', 'Anahat') + t('attrOpacity', 'Saydamlık') + t('attrShadow', 'Gölge') + t('attrText', 'Metin') + '<span class="pb-label">' + (T.attrEyedropper.sample ? 'Örnek alındı · Nesnelere dokunun' : 'Önce örnek nesneye dokunun') + '</span>';
    }
    return pbx();
  };
  // perfect shape and complex star settings on the selection bar
  UI.selExtras = UI.selExtras || [];
  UI.selExtras.push((s, one) => {
    const p = one && one.data && one.data.param;
    if (!p) return '';
    if (p.kind === 'cstar') return H.sep + H.field('Uç', 'd2Sides', p.sides, '') + H.field('Keskinlik', 'd2Step', p.step, '');
    if (p.kind === 'perfect') {
      const def = VP.perfect.find(p.shape);
      return H.sep + H.btn('d2ShapeMenu', VP.perfect.icon(p.shape).replace('width="34" height="34"', 'width="22" height="22"') + esc(def ? def[0] : '') + ' ▾', 'Şekli değiştir') + (def && def[1] != null ? H.range('Ayar', 'd2Adj', Math.round((p.adj == null ? def[1] : p.adj) * 100), 0, 100) : '');
    }
    return '';
  });
  const param1 = (kind) => {
    const it = VP.sel.length === 1 ? VP.sel[0] : null;
    return it && it.data.param && it.data.param.kind === kind ? it : null;
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => {
    if (!/^d2/.test(n)) return pf0(n, r, el);
    const v = VP.parseNum(r);
    const dd = VP.defaults;
    const live = el && el.nextElementSibling && el.type === 'range';
    if (live) el.nextElementSibling.textContent = Math.round(v);
    switch (n) {
      case 'd2Sides': {
        const it = param1('cstar');
        if (!(v >= 5)) return true;
        if (it) {
          it.data.param.sides = clamp(Math.round(v), 5, 60);
          VP.rebuildParam(it);
          VP.commit();
        } else dd.cstarSides = clamp(Math.round(v), 5, 60);
        return true;
      }
      case 'd2Step': {
        const it = param1('cstar');
        if (!(v >= 1)) return true;
        if (it) {
          it.data.param.step = clamp(Math.round(v), 1, 30);
          VP.rebuildParam(it);
          VP.commit();
        } else dd.cstarStep = clamp(Math.round(v), 1, 30);
        return true;
      }
      case 'd2Adj': {
        const it = param1('perfect');
        if (!it) return true;
        it.data.param.adj = clamp(v / 100, 0, 1);
        VP.rebuildParam(it);
        if (!el || !el.dataset.live || UI._rangeDone) VP.commit();
        VP.drawOverlay();
        return true;
      }
      case 'd2Rows': if (v >= 1) dd.graphRows = clamp(Math.round(v), 1, 99); return true;
      case 'd2Cols': if (v >= 1) dd.graphCols = clamp(Math.round(v), 1, 99); return true;
      case 'd2Tol': dd.smartTol = clamp(v, 0, 10); return true;
      case 'd2Preset': if (PRESETS[r]) dd.brushPreset = r; return true;
      case 'd2Nib': if (isFinite(v)) dd.nibAngle = VP.norm(v); return true;
      case 'd2Stamp': if (STAMPS[r]) dd.sprayShape = r; return true;
      case 'd2SSize': if (v > 0) dd.spraySize = clamp(v, 0.5, 100); return true;
      case 'd2SGap': if (v > 0) dd.spraySpacing = clamp(v, 0.3, 100); return true;
      case 'd2SVar': if (v >= 0) dd.sprayVar = clamp(v, 0, 100); return true;
      case 'd2SCol': if (r in PALS) dd.sprayColors = r; return true;
      case 'd2Lines': if (v >= 1) dd.sketchLines = clamp(Math.round(v), 1, 8); return true;
      case 'd2Jit': dd.sketchJitter = clamp(v, 0, 100); return true;
      case 'd2Delay': if (v > 0) dd.liveDelay = clamp(v, 0.3, 10); return true;
      default: return true;
    }
  };
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => {
    const [k, arg] = id.split(':');
    const dd = VP.defaults;
    switch (k) {
      case 'd2Cat':
        dd.perfectCat = arg;
        dd.perfectShape = Object.keys(VP.perfect.CATS[arg][1])[0];
        return true;
      case 'd2ShapeMenu': {
        const it = param1('perfect');
        const cat = it ? Object.keys(VP.perfect.CATS).find((c) => VP.perfect.CATS[c][1][it.data.param.shape]) : dd.perfectCat;
        const shapes = VP.perfect.CATS[cat][1];
        UI.popover(el, '<div style="display:grid;grid-template-columns:repeat(5,52px);gap:4px">' + Object.keys(shapes).map((s) => '<button class="pop-item" style="min-height:52px;justify-content:center;padding:0" data-pick="' + s + '" title="' + esc(shapes[s][0]) + '" aria-label="' + esc(shapes[s][0]) + '">' + VP.perfect.icon(s) + '</button>').join('') + '</div>', (s) => {
          if (it) {
            const def = VP.perfect.find(s);
            it.data.param.shape = s;
            it.data.param.adj = def[1];
            VP.rebuildParam(it);
            VP.commit();
          } else dd.perfectShape = s;
          UI.schedule('prop');
        });
        return true;
      }
      case 'd2Mode':
        dd.brushMode = arg;
        return true;
      case 'd2SRot':
        dd.sprayRotate = arg;
        return true;
      case 'd2Knife':
        dd.knifeMode = arg;
        return true;
      case 'd2Attr':
        dd[arg] = !dd[arg];
        return true;
      case 'dvEven': {
        const g = VP.sel[0];
        if (FX.of(g) && FX.of(g).type === 'varline') {
          const w = g.data.effect.stops.reduce((s, x) => s + x.w, 0) / g.data.effect.stops.length;
          g.data.effect.stops.forEach((x) => (x.w = w));
          D.buildVar(g);
          VP.commit();
        }
        return true;
      }
      default:
        return act0(id, el);
    }
  };
  const pf1 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => {
    if (n === 'dvColor') {
      const g = VP.sel[0];
      const hex = UI.normHex(r);
      if (hex && FX.of(g) && FX.of(g).type === 'varline') {
        g.data.effect.color = hex;
        D.buildVar(g);
        VP.commit();
      }
      return true;
    }
    return pf1(n, r, el);
  };
})();
