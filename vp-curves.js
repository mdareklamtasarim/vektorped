/* VektörPad shaping brushes (smooth, smear, twirl, attract, repel, roughen) and curve tools
   (B-spline, polyline, 3-point curve). */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const ic = H.ic;
  const C = (VP.curves = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const P = (a) => Pt(a[0], a[1]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);
  const T = VP.tools;
  const editable = (it) => it && VP.isPathItem(it) && !FX.isFx(it) && it.visible && !it.locked;
  const loops = (it) => (it instanceof paper.CompoundPath ? it.children.slice() : [it]);
  Object.assign(VP.defaults, { shapeMM: 10, shapeStrength: 50, twirlCW: true }, VP.defaults);

  /* =============== shaping brushes =============== */
  // Adds nodes on the curves under the brush so the brush has something to move.
  const densify = (path, c, r, spacing) => {
    const box = new paper.Rectangle(c.subtract(r * 1.2), new paper.Size(r * 2.4, r * 2.4));
    for (let i = path.curves.length - 1; i >= 0; i--) {
      const cv = path.curves[i];
      if (!cv.bounds.intersects(box) || cv.length <= spacing) continue;
      const n = Math.min(60, Math.ceil(cv.length / spacing));
      for (let k = n - 1; k >= 1; k--) cv.divideAtTime(k / (k + 1));
    }
  };
  const falloff = (d, r) => (d >= r ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * d) / r));
  const BRUSHES = {
    smoothTool: { label: 'Yumuşatma', icon: 'smoothTool', hint: 'Seçili eğrinin girintili çıkıntılı yerlerinin üzerinden geçin: kenar yumuşar', live: false },
    smearTool: { label: 'Bulaştırma', icon: 'smearTool', hint: 'Seçili şeklin kenarından sürükleyin: kenar o yöne uzar veya içeri çekilir', live: false },
    twirlTool: { label: 'Girdap', icon: 'twirlTool', hint: 'Seçili şeklin kenarına basılı tutun: kenar burgu yapar · Yön özellik çubuğunda', live: true },
    attractTool: { label: 'Çekme', icon: 'attractTool', hint: 'Basılı tutun: fırça içindeki düğümler merkeze çekilir', live: true },
    repelTool: { label: 'İtme', icon: 'repelTool', hint: 'Basılı tutun: fırça içindeki düğümler dışarı itilir', live: true },
    roughenTool: { label: 'Pürüz', icon: 'roughenTool', hint: 'Seçili eğrinin kenarı boyunca sürükleyin: pürüzlü dişler oluşur', live: false }
  };
  const brush = (kind) => ({
    cursor: 'crosshair',
    op: null,
    busy() { return !!(this.op && this.op.changed); },
    radius() { return VP.toPT(VP.defaults.shapeMM || 10) / 2; },
    strength() { return clamp((VP.defaults.shapeStrength || 50) / 100, 0.05, 1); },
    targets(pt) {
      const sel = VP.sel.filter(editable);
      if (sel.length) return sel;
      const hit = VP.hitItem(pt);
      if (editable(hit)) {
        VP.setSelection([hit]);
        return [hit];
      }
      return [];
    },
    down(e) {
      const ts = this.targets(e.point);
      if (!ts.length) {
        this.op = null;
        return VP.toast(VP.sel.length ? 'Bu araç eğri ve şekillerde çalışır · Metin ve grupları önce eğriye dönüştürün' : 'Önce düzenlenecek eğriyi seçin veya üzerine dokunun');
      }
      ts.forEach((t) => {
        delete t.data.param;
        delete t.data.bspline;
      });
      this.op = { ts, p: e.point, last: e.point, start: e.point, changed: false, done: new WeakSet(), sign: 1 };
      if (kind === 'smearTool') {
        // smear grabs the outline under the brush and drags it along
        const r = this.radius();
        const k = this.strength();
        this.op.grab = [];
        ts.forEach((t) => loops(t).forEach((path) => {
          if (!path.bounds.expand(r).contains(e.point)) return;
          densify(path, e.point, r, r / 5);
          path.segments.forEach((s) => {
            const f = falloff(s.point.getDistance(e.point), r * 1.4);
            if (f > 0) this.op.grab.push({ s, w: f * (0.5 + 0.5 * k), p0: s.point.clone() });
          });
        }));
        return;
      }
      if (BRUSHES[kind].live) {
        let last = performance.now();
        const tick = () => {
          if (!this.op) return;
          const now = performance.now();
          this.apply(this.op.p, null, Math.min(0.1, (now - last) / 1000));
          last = now;
          this.op.raf = requestAnimationFrame(tick);
        };
        this.op.raf = requestAnimationFrame(tick);
      } else this.apply(e.point, null, 0);
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      const d = e.point.subtract(op.last);
      op.p = e.point;
      if (op.grab) {
        const total = e.point.subtract(op.start);
        op.grab.forEach((g) => (g.s.point = g.p0.add(total.multiply(g.w))));
        if (op.grab.length) op.changed = true;
        VP.emit('transform');
      } else if (!BRUSHES[kind].live) this.apply(e.point, d, 0);
      op.last = e.point;
      VP.drawOverlay();
    },
    apply(c, delta, dt) {
      const op = this.op;
      const r = this.radius();
      const k = this.strength();
      op.ts.forEach((t) => loops(t).forEach((path) => {
        if (!path.bounds.expand(r).contains(c)) return;
        if (kind === 'roughenTool') return this.roughen(path, c, r, k);
        if (kind !== 'smoothTool') densify(path, c, r, r / 4);
        const segs = path.segments;
        const n = segs.length;
        const moves = [];
        segs.forEach((s, i) => {
          const d = s.point.getDistance(c);
          const f = falloff(d, r);
          if (!f) return;
          if (kind === 'smoothTool') {
            if (!path.closed && (i === 0 || i === n - 1)) return;
            const a = segs[(i - 1 + n) % n].point;
            const b = segs[(i + 1) % n].point;
            const w = f * k * 0.35;
            moves.push([s, a.add(b).divide(2).subtract(s.point).multiply(w), 1 - w * 0.6]);
          } else if (kind === 'smearTool' && delta) moves.push([s, delta.multiply(f * (0.4 + 0.6 * k)), 1]);
          else if (kind === 'twirlTool') {
            const ang = (VP.defaults.twirlCW ? 1 : -1) * 220 * k * dt * f;
            s.point = s.point.rotate(ang, c);
            s.handleIn = s.handleIn.rotate(ang);
            s.handleOut = s.handleOut.rotate(ang);
          } else if (kind === 'attractTool' || kind === 'repelTool') {
            const v = c.subtract(s.point);
            if (v.length < 1e-6) return;
            const step = Math.min(v.length * 0.9, r * 1.6 * k * dt * f);
            moves.push([s, v.normalize(kind === 'attractTool' ? step : -step), 1]);
          }
        });
        moves.forEach(([s, m, hs]) => {
          s.point = s.point.add(m);
          if (hs !== 1) {
            s.handleIn = s.handleIn.multiply(hs);
            s.handleOut = s.handleOut.multiply(hs);
          }
        });
        if (moves.length || kind === 'twirlTool') op.changed = true;
      }));
      if (op.changed) {
        VP.drawOverlay();
        VP.emit('transform');
      }
    },
    roughen(path, c, r, k) {
      const op = this.op;
      const spacing = Math.max(VP.toPT(0.6), r / 3);
      densify(path, c, r, spacing);
      const amp = r * 0.35 * k;
      path.segments.forEach((s) => {
        if (op.done.has(s) || s.point.getDistance(c) > r) return;
        const loc = path.getLocationOf(s.point);
        const nrm = loc ? path.getNormalAt(loc.offset) : null;
        if (!nrm) return;
        op.sign = -op.sign;
        s.point = s.point.add(nrm.multiply(amp * op.sign));
        s.handleIn = Pt(0, 0);
        s.handleOut = Pt(0, 0);
        op.done.add(s);
        op.changed = true;
      });
    },
    up() {
      const op = this.op;
      this.op = null;
      if (!op) return;
      if (op.raf) cancelAnimationFrame(op.raf);
      if (op.changed) VP.commit();
      VP.drawOverlay();
    },
    cancel() {
      const op = this.op;
      if (op && op.raf) cancelAnimationFrame(op.raf);
      if (op && op.changed) VP.undoLive();
      this.op = null;
      VP.drawOverlay();
    },
    hover(e) {
      this.hoverPt = e.point;
      VP.drawOverlay();
    },
    overlayAfter(L) {
      const p = (this.op && this.op.p) || this.hoverPt;
      if (!p) return;
      const s = 1 / zoom();
      L.addChild(new paper.Path.Circle({ center: p, radius: this.radius(), strokeColor: acc(), strokeWidth: 1.2 * s, dashArray: [4 * s, 3 * s], insert: false }));
    }
  });
  Object.keys(BRUSHES).forEach((k) => {
    T[k] = brush(k);
  });

  /* =============== B-spline =============== */
  // Uniform cubic B-spline (ends clamped when open) converted to Bézier segments.
  C.bsplinePath = (pts, closed) => {
    const path = new paper.Path({ insert: false, closed: !!closed });
    const n = pts.length;
    if (n < 2) return path;
    if (n === 2 && !closed) {
      path.addSegments([P(pts[0]), P(pts[1])]);
      return path;
    }
    const Q = closed ? pts.map(P) : [P(pts[0]), P(pts[0])].concat(pts.map(P), [P(pts[n - 1]), P(pts[n - 1])]);
    const m = Q.length;
    const at = (i) => Q[((i % m) + m) % m];
    const spans = closed ? m : m - 3;
    const first = closed ? 0 : 1;
    for (let s = 0; s < spans; s++) {
      const i = first + s;
      const a = at(i - 1);
      const b = at(i);
      const c = at(i + 1);
      const d = at(i + 2);
      const b0 = a.add(b.multiply(4)).add(c).divide(6);
      const b1 = b.multiply(2).add(c).divide(3);
      const b2 = b.add(c.multiply(2)).divide(3);
      const b3 = b.add(c.multiply(4)).add(d).divide(6);
      if (s === 0) path.add(new paper.Segment(b0, null, b1.subtract(b0)));
      else path.lastSegment.handleOut = b1.subtract(b0);
      if (closed && s === spans - 1) path.firstSegment.handleIn = b2.subtract(b3);
      else path.add(new paper.Segment(b3, b2.subtract(b3), null));
    }
    return path;
  };
  const rebuildB = (path) => {
    const d = path.data.bspline;
    const np = C.bsplinePath(d.pts, d.closed);
    path.segments = np.segments;
    path.closed = !!d.closed;
  };
  C.rebuildB = rebuildB;
  // Keep the control points in step when a B-spline is moved, rotated, scaled or skewed.
  const withB = (items, M) => {
    const walk = (it) => {
      if (it.data && it.data.bspline) it.data.bspline.pts = it.data.bspline.pts.map((p) => {
        const q = M.transform(P(p));
        return [q.x, q.y];
      });
      if (it.children && it.applyMatrix !== false) it.children.forEach(walk);
    };
    items.forEach(walk);
  };
  const T0 = Object.assign({}, VP.T);
  VP.T.move = (items, d) => {
    T0.move(items, d);
    withB(items, new paper.Matrix().translate(d));
  };
  VP.T.rotate = (items, deg, pivot) => {
    T0.rotate(items, deg, pivot);
    withB(items, new paper.Matrix().rotate(deg, pivot));
  };
  VP.T.scale = (items, sx, sy, anchor) => {
    T0.scale(items, sx, sy, anchor);
    if (isFinite(sx) && isFinite(sy) && Math.abs(sx) > 1e-6 && Math.abs(sy) > 1e-6) withB(items, new paper.Matrix().scale(sx, sy, anchor));
  };
  VP.T.skew = (items, kx, ky, center) => {
    T0.skew(items, kx, ky, center);
    withB(items, new paper.Matrix().skew(kx, ky, center));
  };
  // node editing turns a B-spline into an ordinary curve
  const pick0 = T.node.pick;
  T.node.pick = function (item) {
    if (item && item.data && item.data.bspline) {
      delete item.data.bspline;
      VP.toast('B-spline, düğüm düzenleme için normal eğriye dönüştürüldü');
    }
    return pick0.call(this, item);
  };
  const newPath = (kind) => {
    VP.ensureLayer();
    const p = new paper.Path({ insert: false });
    VP.applyDefaultStyle(p, 'open');
    VP.activeLayer.addChild(p);
    p.data.kind = kind;
    return p;
  };
  const closeTol = () => (VP.coarse ? 16 : 9) / zoom();

  /* B-spline tool: tap control points; double tap, Enter or “Bitir” to finish; tap the first point to close.
     With a B-spline selected and nothing being drawn, its control points can be dragged. */
  T.bsplineTool = {
    cursor: 'crosshair',
    path: null,
    op: null,
    busy() { return !!this.path || !!(this.op && this.op.changed); },
    editTarget() {
      const it = VP.sel.length === 1 ? VP.sel[0] : null;
      return !this.path && it && it.data && it.data.bspline ? it : null;
    },
    down(e) {
      const ed = this.editTarget();
      if (ed) {
        const tol = closeTol() * 1.2;
        const i = ed.data.bspline.pts.findIndex((p) => P(p).getDistance(e.point) <= tol);
        if (i >= 0) {
          this.op = { type: 'move', it: ed, i, changed: false };
          return;
        }
      }
      const p = VP.snapPt(e.point);
      if (!this.path) {
        VP.setSelection([]);
        this.path = newPath('bspline');
        this.path.data.bspline = { pts: [[p.x, p.y]], closed: false };
        this.op = { type: 'add', i: 0 };
        UI.schedule('prop');
        return;
      }
      const d = this.path.data.bspline;
      if (d.pts.length >= 3 && P(d.pts[0]).getDistance(e.point) <= closeTol()) {
        d.closed = true;
        rebuildB(this.path);
        return this.finish();
      }
      if (e.tapCount >= 2) {
        // the first tap of the double tap already added a point here
        if (d.pts.length > 2) d.pts.pop();
        rebuildB(this.path);
        return this.finish();
      }
      d.pts.push([p.x, p.y]);
      rebuildB(this.path);
      this.op = { type: 'add', i: d.pts.length - 1 };
      VP.drawOverlay();
      UI.schedule('prop');
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      const p = VP.snapPt(e.point);
      const it = op.type === 'move' ? op.it : this.path;
      if (!it) return;
      it.data.bspline.pts[op.i] = [p.x, p.y];
      rebuildB(it);
      op.changed = true;
      VP.drawOverlay();
    },
    up() {
      const op = this.op;
      this.op = null;
      if (op && op.type === 'move' && op.changed) VP.commit();
    },
    finish() {
      const p = this.path;
      this.path = null;
      this.op = null;
      if (!p) return;
      if (p.data.bspline.pts.length < 2) {
        p.remove();
        VP.drawOverlay();
        UI.schedule('prop');
        return;
      }
      if (p.closed) VP.applyDefaultStyle(p, 'closed');
      VP.setSelection([p]);
      VP.commit();
      VP.toast('B-spline çizildi · Kontrol noktalarını B-spline aracıyla sürükleyebilirsiniz');
    },
    removeLast() {
      const p = this.path;
      if (!p) return;
      const d = p.data.bspline;
      d.pts.pop();
      if (!d.pts.length) return this.cancel();
      rebuildB(p);
      VP.drawOverlay();
      UI.schedule('prop');
    },
    cancel() {
      if (this.path) this.path.remove();
      if (this.op && this.op.type === 'move' && this.op.changed) VP.undoLive();
      this.path = null;
      this.op = null;
      VP.drawOverlay();
      UI.schedule('prop');
    },
    deactivate() {
      if (this.path) this.finish();
    },
    key(e) {
      if (!this.path) return false;
      if (e.key === 'Enter') {
        this.finish();
        return true;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        this.removeLast();
        return true;
      }
      return false;
    },
    overlayAfter(L) {
      const it = this.path || this.editTarget();
      if (!it || !it.data.bspline) return;
      const s = 1 / zoom();
      const pts = it.data.bspline.pts.map(P);
      L.addChild(new paper.Path({ segments: pts, closed: !!it.data.bspline.closed, strokeColor: acc(), strokeWidth: s, dashArray: [4 * s, 3 * s], opacity: 0.8, insert: false }));
      pts.forEach((p, i) => L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(p.subtract(4.5 * s), new paper.Size(9 * s, 9 * s)), fillColor: i === 0 && this.path ? acc() : '#ffffff', strokeColor: acc(), strokeWidth: 1.4 * s, insert: false })));
    }
  };

  /* Polyline: taps add straight segments, drags add freehand stretches. */
  T.polylineTool = {
    cursor: 'crosshair',
    path: null,
    op: null,
    busy() { return !!this.path; },
    down(e) {
      const p = VP.snapPt(e.point);
      if (this.path) {
        if (this.path.segments.length >= 3 && this.path.firstSegment.point.getDistance(e.point) <= closeTol()) {
          this.path.closed = true;
          return this.finish();
        }
        if (e.tapCount >= 2) {
          const n = this.path.segments.length;
          if (n > 2 && this.path.segments[n - 1].point.getDistance(this.path.segments[n - 2].point) * zoom() < 30) this.path.lastSegment.remove();
          return this.finish();
        }
      } else {
        VP.setSelection([]);
        this.path = newPath('polyline');
        this.path.add(p);
      }
      this.op = { start: e.point, raw: e.point, moved: false, base: this.path.segments.length };
      UI.schedule('prop');
    },
    move(e) {
      const op = this.op;
      if (!op || !this.path) return;
      if (!op.moved && op.raw.getDistance(e.point) * zoom() < 7) return;
      op.moved = true;
      const last = this.path.lastSegment.point;
      if (last.getDistance(e.point) * zoom() >= 3) this.path.add(e.point);
      VP.drawOverlay();
    },
    up(e) {
      const op = this.op;
      this.op = null;
      if (!op || !this.path) return;
      if (!op.moved) {
        const p = VP.snapPt(e.point);
        if (this.path.segments.length === 1 && this.path.firstSegment.point.getDistance(p) < 1e-6) return;
        this.path.add(p);
      } else {
        // thin the freehand stretch a little; its corners stay
        const segs = this.path.segments.slice(op.base);
        if (segs.length > 4) {
          const keep = [segs[0]];
          segs.forEach((s) => {
            if (s.point.getDistance(keep[keep.length - 1].point) * zoom() >= 6) keep.push(s);
          });
          segs.forEach((s) => !keep.includes(s) && s !== segs[segs.length - 1] && s.remove());
        }
      }
      VP.drawOverlay();
      UI.schedule('prop');
    },
    finish() {
      const p = this.path;
      this.path = null;
      this.op = null;
      if (!p) return;
      if (p.segments.length < 2) {
        p.remove();
        VP.drawOverlay();
        UI.schedule('prop');
        return;
      }
      if (p.closed) VP.applyDefaultStyle(p, 'closed');
      VP.setSelection([p]);
      VP.commit();
    },
    removeLast() {
      if (!this.path) return;
      if (this.path.segments.length <= 1) return this.cancel();
      this.path.lastSegment.remove();
      VP.drawOverlay();
      UI.schedule('prop');
    },
    cancel() {
      if (this.path) this.path.remove();
      this.path = null;
      this.op = null;
      VP.drawOverlay();
      UI.schedule('prop');
    },
    deactivate() {
      if (this.path) this.finish();
    },
    key(e) {
      if (!this.path) return false;
      if (e.key === 'Enter') {
        this.finish();
        return true;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        this.removeLast();
        return true;
      }
      return false;
    },
    overlayAfter(L) {
      if (!this.path || !this.path.firstSegment) return;
      const s = 1 / zoom();
      const f = this.path.firstSegment.point;
      L.addChild(new paper.Path.Circle({ center: f, radius: 5 * s, fillColor: acc(), insert: false }));
    }
  };

  /* 3-point curve: drag between the end points, then drag (or tap) where the curve should pass. */
  T.curve3Tool = {
    cursor: 'crosshair',
    path: null,
    op: null,
    busy() { return !!this.path; },
    bend(c) {
      const p = this.path;
      const a = p.firstSegment.point;
      const b = p.lastSegment.point;
      // a quadratic through c at its middle, written as a cubic
      const q = c.multiply(2).subtract(a.add(b).divide(2));
      p.firstSegment.handleOut = q.subtract(a).multiply(2 / 3);
      p.lastSegment.handleIn = q.subtract(b).multiply(2 / 3);
    },
    down(e) {
      const p = VP.snapPt(e.point);
      if (this.path && this.path.segments.length === 2) {
        this.op = { type: 'bend' };
        this.bend(p);
        VP.drawOverlay();
        return;
      }
      VP.setSelection([]);
      this.path = newPath('curve3');
      this.path.addSegments([p, p.clone()]);
      this.op = { type: 'chord', raw: e.point };
    },
    move(e) {
      const op = this.op;
      if (!op || !this.path) return;
      const p = VP.snapPt(e.point);
      if (op.type === 'chord') this.path.lastSegment.point = p;
      else this.bend(p);
      VP.drawOverlay();
    },
    up(e) {
      const op = this.op;
      this.op = null;
      if (!op || !this.path) return;
      if (op.type === 'chord') {
        if (this.path.firstSegment.point.getDistance(this.path.lastSegment.point) * zoom() < 8) return this.cancel();
        VP.toast('Şimdi eğrinin geçeceği yere dokunun veya sürükleyin');
        UI.schedule('prop');
        return;
      }
      this.bend(VP.snapPt(e.point));
      const p = this.path;
      this.path = null;
      VP.setSelection([p]);
      VP.commit();
      UI.schedule('prop');
    },
    cancel() {
      if (this.path) this.path.remove();
      this.path = null;
      this.op = null;
      VP.drawOverlay();
      UI.schedule('prop');
    },
    deactivate() {
      if (this.path) this.cancel();
    },
    overlayAfter(L) {
      if (!this.path || this.path.segments.length < 2) return;
      const s = 1 / zoom();
      [this.path.firstSegment.point, this.path.lastSegment.point].forEach((p) => L.addChild(new paper.Path.Circle({ center: p, radius: 4 * s, fillColor: acc(), insert: false })));
    }
  };

  Object.assign(VP.TOOL_META, {
    smoothTool: { label: BRUSHES.smoothTool.label, icon: 'smoothTool', key: '', hint: BRUSHES.smoothTool.hint },
    smearTool: { label: BRUSHES.smearTool.label, icon: 'smearTool', key: '', hint: BRUSHES.smearTool.hint },
    twirlTool: { label: BRUSHES.twirlTool.label, icon: 'twirlTool', key: '', hint: BRUSHES.twirlTool.hint },
    attractTool: { label: BRUSHES.attractTool.label, icon: 'attractTool', key: '', hint: BRUSHES.attractTool.hint },
    repelTool: { label: BRUSHES.repelTool.label, icon: 'repelTool', key: '', hint: BRUSHES.repelTool.hint },
    roughenTool: { label: BRUSHES.roughenTool.label, icon: 'roughenTool', key: '', hint: BRUSHES.roughenTool.hint },
    bsplineTool: { label: 'B-spline', icon: 'bsplineTool', key: '', drawing: true, hint: 'Kontrol noktalarına dokunun · Çift dokun, Enter veya Bitir: tamamla · İlk noktaya dokun: kapat' },
    polylineTool: { label: 'Çoklu çizgi', icon: 'polylineTool', key: '', drawing: true, hint: 'Dokun: düz kenar · Sürükle: serbest çizim · Çift dokun, Enter veya Bitir: tamamla · İlk noktaya dokun: kapat' },
    curve3Tool: { label: '3 noktalı eğri', icon: 'curve3Tool', key: '', drawing: true, hint: 'İki uç arasında sürükleyin, sonra eğrinin geçeceği yere dokunun veya sürükleyin' }
  });

  /* =============== property bar =============== */
  const pbx = VP.tx.propbar;
  VP.tx.propbar = () => {
    const id = VP.toolId;
    const d = VP.defaults;
    if (BRUSHES[id]) {
      const m = VP.TOOL_META[id];
      return '<span class="pb-title">' + m.label + '</span>' + H.field('Boyut', 'cvSize', VP.num(d.shapeMM, 1)) + H.range('Güç', 'cvStrength', Math.round(d.shapeStrength), 5, 100) +
        (id === 'twirlTool' ? '<span class="seg"><button data-act="cvTwirl:cw" class="' + (d.twirlCW ? 'on' : '') + '">Saat yönü</button><button data-act="cvTwirl:ccw" class="' + (d.twirlCW ? '' : 'on') + '">Ters yön</button></span>' : '') +
        '<span class="pb-label">' + (VP.sel.some(editable) ? VP.sel.filter(editable).length + ' eğri düzenlenecek' : 'Önce bir eğri seçin veya üzerine dokunun') + '</span>';
    }
    if (id === 'bsplineTool' || id === 'polylineTool') {
      const t = T[id];
      const n = t.path ? (id === 'bsplineTool' ? t.path.data.bspline.pts.length : t.path.segments.length) : 0;
      if (t.path) return '<span class="pb-title">' + VP.TOOL_META[id].label + '</span><span class="pb-label">' + n + ' nokta</span>' + H.btn('cvFinish', 'Bitir', 'Eğriyi bitir (Enter)', 'primary') + H.btn('cvUndo', 'Son noktayı sil', 'Son noktayı sil (Backspace)') + H.btn('cvCancel', 'İptal', 'Eğriyi iptal et');
      if (id === 'bsplineTool' && t.editTarget()) return '<span class="pb-title">B-spline</span><span class="pb-label">Kontrol noktalarını sürükleyin · Yeni çizmek için boş yere dokunun</span>' + H.btn('cvClose', t.editTarget().data.bspline.closed ? 'Aç' : 'Kapat', 'B-spline’ı aç veya kapat');
    }
    return pbx();
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => {
    const v = VP.parseNum(r);
    if (n === 'cvSize') {
      if (v > 0) VP.defaults.shapeMM = clamp(v, 0.5, 200);
      return true;
    }
    if (n === 'cvStrength') {
      if (v > 0) VP.defaults.shapeStrength = clamp(v, 5, 100);
      if (el && el.nextElementSibling) el.nextElementSibling.textContent = Math.round(v);
      return true;
    }
    return pf0(n, r, el);
  };
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => {
    const t = T[VP.toolId];
    switch (id) {
      case 'cvTwirl:cw':
      case 'cvTwirl:ccw':
        VP.defaults.twirlCW = id.endsWith(':cw');
        return true;
      case 'cvFinish':
        if (t && t.finish) t.finish();
        return true;
      case 'cvUndo':
        if (t && t.removeLast) t.removeLast();
        return true;
      case 'cvCancel':
        if (t && t.cancel) t.cancel();
        return true;
      case 'cvClose': {
        const it = T.bsplineTool.editTarget();
        if (it) {
          it.data.bspline.closed = !it.data.bspline.closed;
          rebuildB(it);
          VP.commit();
        }
        return true;
      }
      default:
        return act0(id, el);
    }
  };
  VP.KIND_NAMES.bspline = 'B-spline';
  const kind0 = VP.kindOf;
  VP.kindOf = (it) => (it && it.data && it.data.bspline ? 'bspline' : kind0(it));
})();
