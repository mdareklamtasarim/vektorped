/* VektörPad shape tool on rectangles, polygons and stars: the shape keeps its settings.
   Rectangle: drag a corner node to round all corners. Polygon/star: drag an outer node to resize and
   turn the shape symmetrically, drag an inner node (star) to change its sharpness. "Convert to curves"
   on the property bar switches to free node editing. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const H = UI.h;
  const N = VP.tools.node;
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const tol = () => (VP.coarse ? 22 : 11) / zoom();
  const editable = (t) => !!(t && t.data && t.data.param && (t.data.param.kind === 'rect' || t.data.param.kind === 'polygon'));
  // node handles of a parametric shape, in page coordinates
  const handles = (t) => {
    const p = t.data.param;
    const c = Pt(p.cx, p.cy);
    const rot = p.angle || 0;
    const G = (q) => q.rotate(rot, Pt(0, 0)).add(c);
    const out = [];
    if (p.kind === 'rect') {
      const hw = Math.abs(p.w) / 2;
      const hh = Math.abs(p.h) / 2;
      const r = Math.min(p.r || 0, hw, hh);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], k) => out.push({ type: 'corner', k, sx, sy, p: G(Pt(sx * hw - sx * r, sy * hh)) }));
    } else {
      const n = Math.max(3, Math.round(p.sides || 5));
      const k = p.star ? n * 2 : n;
      for (let i = 0; i < k; i++) {
        const a = ((-90 + (i * 360) / k) * Math.PI) / 180;
        const inner = p.star && i % 2 === 1;
        const f = inner ? clamp(p.inner || 0.5, 0.05, 0.95) : 1;
        out.push({ type: inner ? 'inner' : 'outer', i, a, p: G(Pt((Math.cos(a) * p.w * f) / 2, (Math.sin(a) * p.h * f) / 2)) });
      }
    }
    return out;
  };
  const pick0 = N.pick;
  N.pick = function (item) {
    if (editable(item)) {
      this.target = item;
      this.pm = item;
      this.segs = new Set();
      if (VP.sel.length !== 1 || VP.sel[0] !== item) VP.setSelection([item]);
      VP.drawOverlay();
      VP.emit('selection');
      return;
    }
    this.pm = null;
    return pick0.call(this, item);
  };
  const down0 = N.down;
  N.down = function (e) {
    const t = this.pm;
    if (t && t.parent && t.data.param) {
      let best = null;
      let bd = tol();
      handles(t).forEach((h) => {
        const d = h.p.getDistance(e.point);
        if (d <= bd) {
          bd = d;
          best = h;
        }
      });
      if (best) {
        this.op = { type: 'param', h: best, p0: Object.assign({}, t.data.param), start: e.point, changed: false };
        this.pmSel = best;
        VP.drawOverlay();
        return;
      }
      const hit = VP.hitItem(e.point);
      if (hit && hit !== t) return down0.call(this, e);
      if (hit === t) {
        this.op = null;
        return;
      }
      this.pm = null;
    }
    return down0.call(this, e);
  };
  const move0 = N.move;
  N.move = function (e) {
    const op = this.op;
    if (!op || op.type !== 'param') return move0.call(this, e);
    const t = this.pm;
    if (!t || !t.parent) return;
    if (!op.changed && op.start.getDistance(e.point) * zoom() < (e.isTouch ? 5 : 2)) return;
    const p = t.data.param;
    const p0 = op.p0;
    const c = Pt(p0.cx, p0.cy);
    const q = e.point.subtract(c).rotate(-(p0.angle || 0), Pt(0, 0));
    if (op.h.type === 'corner') {
      const hw = Math.abs(p0.w) / 2;
      const hh = Math.abs(p0.h) / 2;
      const C = Pt(op.h.sx * hw, op.h.sy * hh);
      p.r = clamp(Math.abs(q.x - C.x), 0, Math.min(hw, hh));
    } else if (op.h.type === 'outer') {
      const v0 = op.h.p.subtract(c);
      const v = e.point.subtract(c);
      const k = v.length / (v0.length || 1);
      p.w = p0.w * k;
      p.h = p0.h * k;
      p.angle = VP.norm((p0.angle || 0) + v.angle - v0.angle);
    } else {
      const a = op.h.a;
      const ro = Math.hypot((Math.cos(a) * p0.w) / 2, (Math.sin(a) * p0.h) / 2) || 1;
      p.inner = clamp(q.length / ro, 0.05, 0.95);
    }
    VP.rebuildParam(t);
    op.changed = true;
    VP.drawOverlay();
    UI.schedule('prop');
  };
  const up0 = N.up;
  N.up = function (e) {
    const op = this.op;
    if (op && op.type === 'param') {
      this.op = null;
      if (op.changed) VP.commit();
      return;
    }
    return up0.call(this, e);
  };
  const ov0 = N.overlay;
  N.overlay = function (L) {
    const t = this.pm;
    if (!(VP.toolId === 'node' && t && t.parent && t.data.param)) return ov0 ? ov0.call(this, L) : false;
    const s = 1 / zoom();
    const acc = new paper.Color(VP.colors.accent);
    const o = t.clone({ insert: false });
    o.fillColor = null;
    o.strokeColor = acc;
    o.strokeWidth = s;
    o.dashArray = [];
    o.shadowColor = null;
    o.opacity = 1;
    o.data = {};
    L.addChild(o);
    const hs = (VP.coarse ? 9 : 7) * s;
    handles(t).forEach((h) => {
      const on = this.pmSel && this.pmSel.type === h.type && (h.k === this.pmSel.k || h.i === this.pmSel.i);
      const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(h.p.subtract(hs / 2), new paper.Size(hs, hs)), insert: false });
      if (h.type === 'inner') r.rotate(45);
      r.fillColor = on ? acc : new paper.Color('#ffffff');
      r.strokeColor = h.type === 'inner' ? new paper.Color('#d6362b') : acc;
      r.strokeWidth = 1.3 * s;
      L.addChild(r);
    });
    return true;
  };
  const deact0 = N.deactivate;
  N.deactivate = function () {
    this.pm = null;
    this.pmSel = null;
    return deact0.call(this);
  };
  // property bar in this mode
  const pb0 = VP.tx.propbar;
  VP.tx.propbar = () => {
    const t = N.pm;
    if (VP.toolId === 'node' && t && t.parent && t.data.param) {
      const p = t.data.param;
      const what = p.kind === 'rect' ? 'Dörtgen · Köşe düğümünü sürükleyin: köşeleri yuvarlat' : p.star ? 'Yıldız · Dış düğüm: boyut ve açı · İç düğüm (kırmızı): keskinlik' : 'Çokgen · Düğümü sürükleyin: boyut ve açı (simetrik)';
      return '<span class="pb-title">Şekil</span><span class="pb-label">' + H.esc(what) + '</span>' + H.sep +
        (p.kind === 'rect' ? H.field('Köşe', 'rectR', VP.num(VP.toMM(p.r || 0), 1)) : H.field(p.star ? 'Uç' : 'Kenar', 'polySides', p.sides, '') + (p.star ? H.range('Keskinlik', 'polyInner', Math.round((1 - p.inner) * 100), 5, 95) : '')) +
        H.sep + H.btn('nToCurves', 'Eğriye dönüştür', 'Serbest düğüm düzenleme için eğriye çevir');
    }
    return pb0();
  };
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => {
    if (id === 'nToCurves') {
      const t = N.pm;
      if (t && t.data.param) {
        delete t.data.param;
        N.pm = null;
        VP.commit();
        pick0.call(N, t);
        VP.toast('Eğriye dönüştürüldü · Düğümleri serbestçe düzenleyebilirsiniz');
      }
      return true;
    }
    return act0(id, el);
  };
})();
