/* VektörPad tools. Each tool gets {point, vpt, pointerType, pressure, shift, alt, ctrl, isTouch, tapCount}. */
(function () {
  'use strict';
  const VP = window.VP;
  const Pt = (x, y) => new paper.Point(x, y);
  const zoom = () => paper.view.zoom;
  const tolPx = () => (VP.coarse ? 16 : 8);
  const acc = () => new paper.Color(VP.colors.accent);

  VP.TOOL_META = {
    select: { label: 'Seçim', icon: 'select', key: 'V', hint: 'Dokun: seç · Sürükle: taşı · Seçili nesneye tekrar dokun: döndür/eğ tutamaçları · Çift dokun: düğüm veya metin düzenle' },
    node: { label: 'Şekil (düğüm düzenleme)', icon: 'node', key: 'A', hint: 'Düğüme dokun: seç · Sürükle: taşı · Çizgiye çift dokun: düğüm ekle · Düğüme çift dokun: sil · Çizgiyi sürükle: eğ' },
    freehand: { label: 'Serbest çizim', icon: 'freehand', key: 'F', drawing: true, hint: 'Sürükleyerek çizin · Uçlar birleşirse eğri kapanır · Yumuşatma özellik çubuğunda' },
    brush: { label: 'Artistik fırça', icon: 'brush', key: 'I', drawing: true, hint: 'Apple Pencil baskısıyla kalınlaşan fırça · Mürekkep rengi: anahat rengi' },
    pen: { label: 'Bézier kalem', icon: 'pen', key: 'P', drawing: true, hint: 'Dokun: köşe noktası · Sürükle: eğri noktası · İlk noktaya dokun: kapat · Çift dokun veya Enter: bitir' },
    line: { label: '2 noktalı çizgi', icon: 'line', key: 'L', drawing: true, hint: 'Sürükleyerek düz çizgi çizin · Shift: 15° adımlar' },
    rect: { label: 'Dörtgen', icon: 'rect', key: 'R', drawing: true, hint: 'Sürükleyerek dörtgen çizin · Köşe yarıçapı özellik çubuğunda · Ctrl: kare, Shift: merkezden' },
    ellipse: { label: 'Elips', icon: 'ellipse', key: 'E', drawing: true, hint: 'Sürükleyerek elips çizin · Ctrl: daire, Shift: merkezden' },
    polygon: { label: 'Çokgen', icon: 'polygon', key: 'Y', drawing: true, hint: 'Sürükleyerek çokgen çizin · Kenar sayısı özellik çubuğunda' },
    star: { label: 'Yıldız', icon: 'star', key: 'S', drawing: true, hint: 'Sürükleyerek yıldız çizin · Uç sayısı ve keskinlik özellik çubuğunda' },
    spiral: { label: 'Spiral', icon: 'spiral', key: '', drawing: true, hint: 'Sürükleyerek spiral çizin · Tur sayısı özellik çubuğunda' },
    text: { label: 'Metin', icon: 'text', key: 'T', drawing: true, hint: 'Sayfaya dokunup yazın · Var olan metne dokunun: düzenle' },
    eyedropper: { label: 'Damlalık', icon: 'eyedropper', key: 'D', hint: 'Bir nesneye dokunun: dolgu ve anahat alınır · Seçim varsa ona uygulanır' },
    hand: { label: 'Kaydırma', icon: 'hand', key: 'H', hint: 'Sürükleyerek görünümü kaydırın · İki parmak: kaydır ve yakınlaştır' },
    zoom: { label: 'Yakınlaştırma', icon: 'zoom', key: 'Z', hint: 'Dokun: yakınlaştır · Alt+dokun: uzaklaştır · Alan çizin: o alana yakınlaştır' }
  };

  const T = (VP.tools = {});
  VP.tool = () => T[VP.toolId] || T.select;
  const handlePoint = (b, id) =>
    ({ tl: b.topLeft, tc: b.topCenter, tr: b.topRight, mr: b.rightCenter, br: b.bottomRight, bc: b.bottomCenter, bl: b.bottomLeft, ml: b.leftCenter })[id];
  const OPP = { tl: 'br', tc: 'bc', tr: 'bl', mr: 'ml', br: 'tl', bc: 'tc', bl: 'tr', ml: 'mr' };
  const drawMarquee = (L, rect) => {
    if (!rect) return;
    const s = 1 / zoom();
    const r = new paper.Path.Rectangle({ rectangle: rect, insert: false });
    r.strokeColor = acc();
    r.strokeWidth = s;
    r.dashArray = [4 * s, 3 * s];
    const f = acc();
    f.alpha = 0.08;
    r.fillColor = f;
    L.addChild(r);
  };

  /* ===================== SELECT ===================== */
  T.select = {
    cursor: 'default',
    op: null,
    busy() { return !!this.op && this.op.type !== 'none'; },
    cancel() {
      if (this.op && this.op.changed) VP.undoLive();
      this.op = null;
      VP.drawOverlay();
    },
    down(e) {
      const h = VP.hitHandle(e.point);
      if (h) return this.startHandle(h, e);
      const hit = VP.hitItem(e.point);
      const additive = e.shift || VP.settings.multi;
      if (hit) {
        if (additive) {
          VP.toggleSel(hit);
          this.op = { type: 'none' };
          return;
        }
        const wasSel = VP.sel.includes(hit);
        if (!wasSel) VP.setSelection([hit]);
        this.op = { type: 'move', start: e.point, moved: false, wasSel, hit, origin: VP.selBounds().topLeft };
        return;
      }
      if (!additive && VP.sel.length) VP.clearSelection();
      this.op = { type: 'marquee', start: e.point, rect: null, additive };
    },
    startHandle(h, e) {
      const b = VP.selBounds();
      if (h.kind === 'pivot') {
        this.op = { type: 'pivot', changed: false };
        return;
      }
      if (h.kind === 'rot' || (VP.handleMode === 'rotate' && h.kind === 'corner')) {
        const c = VP.handleMode === 'rotate' && VP.pivot ? VP.pivot : b.center;
        this.op = { type: 'rotate', center: c, startAng: e.point.subtract(c).angle, applied: 0, changed: false };
        return;
      }
      if (VP.handleMode === 'rotate' && h.kind === 'edge') {
        this.op = { type: 'skew', h: h.id, b: b.clone(), start: e.point, applied: 0, changed: false };
        return;
      }
      this.op = { type: 'scale', h: h.id, kind: h.kind, anchor: handlePoint(b, OPP[h.id]), b0: b.clone(), sx: 1, sy: 1, changed: false };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (op.type === 'pivot') {
        VP.pivot = VP.snapObjectPoint ? VP.snapObjectPoint(e.point) || VP.snapPt(e.point) : VP.snapPt(e.point);
        VP.drawOverlay();
        return;
      }
      if (op.type === 'move') {
        const total = e.point.subtract(op.start);
        if (!op.moved && total.length * zoom() < (e.isTouch ? 7 : 3)) return;
        op.moved = true;
        let target = op.origin.add(total);
        if (e.shift) {
          if (Math.abs(total.x) > Math.abs(total.y)) target.y = op.origin.y;
          else target.x = op.origin.x;
        }
        target = VP.snapPt(target);
        const d = target.subtract(VP.selBounds().topLeft);
        if (d.x || d.y) VP.T.move(VP.sel, d);
        op.changed = true;
        VP.drawOverlay();
        VP.emit('transform');
      } else if (op.type === 'marquee') {
        op.rect = new paper.Rectangle(op.start, e.point);
        VP.drawOverlay();
      } else if (op.type === 'scale') {
        const p = VP.snapPt(e.point);
        const h0 = handlePoint(op.b0, op.h);
        const from = h0.subtract(op.anchor);
        const to = p.subtract(op.anchor);
        let sx = 1;
        let sy = 1;
        if (op.h === 'tc' || op.h === 'bc') sy = from.y ? to.y / from.y : 1;
        else if (op.h === 'ml' || op.h === 'mr') sx = from.x ? to.x / from.x : 1;
        else {
          sx = from.x ? to.x / from.x : 1;
          sy = from.y ? to.y / from.y : 1;
          if (VP.settings.keepRatio !== !!e.shift) {
            const m = Math.max(Math.abs(sx), Math.abs(sy));
            sx = (sx < 0 ? -1 : 1) * m;
            sy = (sy < 0 ? -1 : 1) * m;
          }
        }
        const minS = 0.002;
        if (Math.abs(sx) < minS) sx = sx < 0 ? -minS : minS;
        if (Math.abs(sy) < minS) sy = sy < 0 ? -minS : minS;
        VP.T.scale(VP.sel, sx / op.sx, sy / op.sy, op.anchor);
        op.sx = sx;
        op.sy = sy;
        op.changed = true;
        VP.drawOverlay();
        VP.emit('transform');
      } else if (op.type === 'rotate') {
        let ang = e.point.subtract(op.center).angle - op.startAng;
        if (e.shift || VP.settings.snap) ang = Math.round(ang / 15) * 15;
        const delta = ang - op.applied;
        if (Math.abs(delta) > 1e-6) {
          VP.T.rotate(VP.sel, delta, op.center);
          op.applied = ang;
          op.changed = true;
          VP.drawOverlay();
          VP.emit('transform');
        }
      } else if (op.type === 'skew') {
        const d = e.point.subtract(op.start);
        const b = op.b;
        let t;
        if (op.h === 'tc') t = -d.x / (b.height / 2);
        else if (op.h === 'bc') t = d.x / (b.height / 2);
        else if (op.h === 'mr') t = d.y / (b.width / 2);
        else t = -d.y / (b.width / 2);
        t = VP.clamp(t, -6, 6);
        const dt = t - op.applied;
        if (Math.abs(dt) > 1e-6) {
          const deg = (Math.atan(dt) * 180) / Math.PI;
          if (op.h === 'tc' || op.h === 'bc') VP.T.skew(VP.sel, deg, 0, b.center);
          else VP.T.skew(VP.sel, 0, deg, b.center);
          op.applied = t;
          op.changed = true;
          VP.drawOverlay();
          VP.emit('transform');
        }
      }
    },
    up(e) {
      const op = this.op;
      this.op = null;
      if (!op) return;
      if (op.type === 'pivot') return VP.drawOverlay();
      if (op.type === 'move') {
        if (op.moved) return VP.commit();
        if (e.tapCount >= 2) return this.dblTap(op.hit, e.point);
        if (op.wasSel && VP.sel.length === 1) {
          VP.handleMode = VP.handleMode === 'rotate' ? 'scale' : 'rotate';
          VP.drawOverlay();
          VP.emit('selection');
        }
        return;
      }
      if (op.type === 'marquee') {
        if (op.rect && op.rect.width * zoom() > 4 && op.rect.height * zoom() > 4) {
          const all = VP.allSelectable();
          let picked = all.filter((it) => op.rect.contains(it.bounds));
          if (e.alt) picked = all.filter((it) => op.rect.intersects(it.bounds));
          if (op.additive) picked = VP.sel.concat(picked.filter((it) => !VP.sel.includes(it)));
          VP.setSelection(picked);
        } else VP.drawOverlay();
        return;
      }
      if (op.changed) VP.commit();
      else VP.drawOverlay();
    },
    dblTap(item, point) {
      if (!item) return;
      if (item instanceof paper.PointText) return VP.ui.editText(item);
      const ext = VP.fx && VP.fx.ext && VP.fx.ext(item);
      if (ext && ext.dblTap) return ext.dblTap(item, point);
      if (VP.fx && VP.fx.isFx(item)) {
        VP.setSelection([item]);
        VP.setTool(VP.fx.toolFor(item));
      } else if (VP.isPathItem(item)) {
        VP.setSelection([item]);
        VP.setTool('node');
      } else if (item instanceof paper.Group) {
        VP.toast('Grubun içindeki nesnelere ulaşmak için Nesne › Grubu çöz');
      }
    },
    overlayAfter(L) {
      if (this.op && this.op.type === 'marquee') drawMarquee(L, this.op.rect);
    },
    overlay(L) {
      if (this.op && this.op.type === 'marquee' && !VP.sel.length) {
        drawMarquee(L, this.op.rect);
        return true;
      }
      return false;
    }
  };
  // Restores the last committed state after an interrupted live drag.
  VP.undoLive = () => {
    if (VP.hist.i >= 0) VP.restore(VP.hist.stack[VP.hist.i]);
  };

  /* ===================== NODE (shape tool) ===================== */
  const isSmooth = (s) => {
    const a = s.handleIn;
    const b = s.handleOut;
    if (a.isZero() || b.isZero()) return false;
    return Math.abs(Math.abs(a.getDirectedAngle(b)) - 180) < 4;
  };
  T.node = {
    cursor: 'default',
    target: null,
    segs: new Set(),
    op: null,
    types: new WeakMap(),
    busy() { return !!this.op && !!this.op.changed; },
    activate() {
      this.pick(VP.sel.length === 1 ? VP.sel[0] : null);
    },
    deactivate() {
      this.target = null;
      this.segs = new Set();
      this.op = null;
    },
    pick(item) {
      let t = item;
      if (t && !VP.isPathItem(t)) {
        if (t instanceof paper.PointText) VP.toast('Metnin düğümlerini düzenlemek için önce Eğriye dönüştürün');
        t = null;
      }
      if (t && t.data.param) {
        delete t.data.param;
        VP.toast('Şekil düğüm düzenleme için eğriye dönüştürüldü');
        VP.commit();
      }
      this.target = t;
      this.segs = new Set();
      if (t) {
        if (VP.sel.length !== 1 || VP.sel[0] !== t) VP.setSelection([t]);
      }
      VP.drawOverlay();
      VP.emit('selection');
    },
    paths() {
      const t = this.target;
      if (!t || !t.parent) return [];
      return t instanceof paper.CompoundPath ? t.children : [t];
    },
    allSegs() {
      const out = [];
      this.paths().forEach((p) => p.segments.forEach((s) => out.push(s)));
      return out;
    },
    segAt(pt) {
      const tol = tolPx() / zoom();
      let best = null;
      let bd = tol;
      this.allSegs().forEach((s) => {
        const d = s.point.getDistance(pt);
        if (d <= bd) {
          bd = d;
          best = s;
        }
      });
      return best;
    },
    handleAt(pt) {
      const tol = tolPx() / zoom();
      let best = null;
      let bd = tol;
      this.segs.forEach((s) => {
        ['In', 'Out'].forEach((w) => {
          const h = s['handle' + w];
          if (h.isZero()) return;
          const d = s.point.add(h).getDistance(pt);
          if (d <= bd) {
            bd = d;
            best = { seg: s, which: w };
          }
        });
      });
      return best;
    },
    down(e) {
      const t = this.target;
      if (t && t.parent) {
        const h = this.handleAt(e.point);
        if (h) {
          this.op = { type: 'handle', seg: h.seg, which: h.which, changed: false };
          return;
        }
        const s = this.segAt(e.point);
        if (s) {
          if (e.shift || VP.settings.multi) {
            if (this.segs.has(s)) this.segs.delete(s);
            else this.segs.add(s);
          } else if (!this.segs.has(s)) this.segs = new Set([s]);
          this.op = { type: 'points', last: e.point, start: e.point, changed: false, seg: s };
          VP.drawOverlay();
          VP.emit('selection');
          return;
        }
        const loc = t.getNearestLocation(e.point);
        if (loc && loc.point.getDistance(e.point) <= tolPx() / zoom()) {
          this.op = { type: 'curve', loc, last: e.point, changed: false };
          return;
        }
      }
      const hit = VP.hitItem(e.point);
      if (hit && hit !== t) {
        if (VP.isPathItem(hit)) {
          this.pick(hit);
          this.op = null;
          return;
        }
      }
      this.op = { type: 'marquee', start: e.point, rect: null };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (op.type === 'points') {
        const p = VP.snapPt(e.point);
        if (!op.changed && e.point.subtract(op.start).length * zoom() < (e.isTouch ? 6 : 2)) return;
        const anchor = VP.settings.snap ? op.seg.point : op.last;
        const d = (VP.settings.snap ? p : e.point).subtract(anchor);
        this.segs.forEach((s) => (s.point = s.point.add(d)));
        op.last = e.point;
        op.changed = true;
        VP.drawOverlay();
      } else if (op.type === 'handle') {
        const s = op.seg;
        const v = e.point.subtract(s.point);
        const isIn = op.which === 'In';
        const otherKey = isIn ? 'handleOut' : 'handleIn';
        const type = this.types.get(s) || (isSmooth(s) ? 'smooth' : 'cusp');
        if (isIn) s.handleIn = v;
        else s.handleOut = v;
        const other = s[otherKey];
        if (type === 'symmetric') s[otherKey] = v.negate();
        else if (type === 'smooth' && !other.isZero()) s[otherKey] = v.normalize(-other.length);
        op.changed = true;
        VP.drawOverlay();
      } else if (op.type === 'curve') {
        const d = e.point.subtract(op.last);
        op.last = e.point;
        if (!op.changed && e.point.subtract(op.loc.point).length * zoom() < (e.isTouch ? 6 : 2)) return;
        const c = op.loc.curve;
        if (!c) return;
        const t = VP.clamp(op.loc.time, 0.08, 0.92);
        const f = 1 / (3 * t * (1 - t) * ((1 - t) * (1 - t) + t * t));
        c.segment1.handleOut = c.segment1.handleOut.add(d.multiply((1 - t) * f));
        c.segment2.handleIn = c.segment2.handleIn.add(d.multiply(t * f));
        op.changed = true;
        VP.drawOverlay();
      } else if (op.type === 'marquee') {
        op.rect = new paper.Rectangle(op.start, e.point);
        VP.drawOverlay();
      }
    },
    up(e) {
      const op = this.op;
      this.op = null;
      if (!op) return;
      if (op.type === 'curve' && !op.changed) {
        if (e.tapCount >= 2) this.addAt(op.loc);
        else {
          this.segs = new Set();
          VP.drawOverlay();
          VP.emit('selection');
        }
        return;
      }
      if (op.type === 'points' && !op.changed) {
        if (e.tapCount >= 2) this.deleteNodes();
        return;
      }
      if (op.type === 'marquee') {
        if (op.rect && op.rect.width * zoom() > 4) {
          this.segs = new Set(this.allSegs().filter((s) => op.rect.contains(s.point)));
        } else if (!VP.hitItem(e.point)) {
          if (this.segs.size) this.segs = new Set();
          else if (this.target) {
            this.target = null;
            VP.clearSelection();
          }
        }
        VP.drawOverlay();
        VP.emit('selection');
        return;
      }
      if (op.changed) VP.commit();
    },
    cancel() {
      if (this.op && this.op.changed) VP.undoLive();
      this.op = null;
      VP.drawOverlay();
    },
    key(ev) {
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && this.segs.size) {
        this.deleteNodes();
        return true;
      }
      return false;
    },
    addAt(loc) {
      if (!loc || !loc.curve) return;
      const nc = loc.curve.divideAtTime(loc.time);
      if (nc) this.segs = new Set([nc.segment1]);
      VP.commit();
      VP.emit('selection');
    },
    addNodes() {
      if (!this.segs.size) return VP.toast('Önce bir düğüm seçin');
      const added = [];
      Array.from(this.segs).forEach((s) => {
        const c = s.curve;
        if (c) {
          const nc = c.divideAtTime(0.5);
          if (nc) added.push(nc.segment1);
        }
      });
      this.segs = new Set(added);
      VP.commit();
      VP.emit('selection');
    },
    deleteNodes() {
      let n = 0;
      Array.from(this.segs).forEach((s) => {
        const p = s.path;
        if (p && p.segments.length > 2) {
          s.remove();
          n++;
        }
      });
      this.segs = new Set();
      if (n) VP.commit();
      else VP.toast('Bir eğride en az iki düğüm kalmalı');
      VP.emit('selection');
    },
    setType(type) {
      if (!this.segs.size) return VP.toast('Önce bir düğüm seçin');
      this.segs.forEach((s) => {
        this.types.set(s, type);
        if (type === 'cusp') return;
        if (s.handleIn.isZero() || s.handleOut.isZero()) {
          s.smooth();
        }
        if (s.handleIn.isZero() && s.handleOut.isZero()) return;
        const dir = s.handleOut.normalize().subtract(s.handleIn.normalize()).normalize();
        let li = s.handleIn.length;
        let lo = s.handleOut.length;
        if (type === 'symmetric') li = lo = (li + lo) / 2;
        s.handleOut = dir.multiply(lo);
        s.handleIn = dir.multiply(-li);
      });
      VP.commit();
    },
    toLine() {
      this.segs.forEach((s) => {
        s.handleOut = Pt(0, 0);
        if (s.next) s.next.handleIn = Pt(0, 0);
      });
      VP.commit();
    },
    toCurve() {
      this.segs.forEach((s) => {
        const n = s.next;
        if (!n) return;
        if (s.handleOut.isZero() && n.handleIn.isZero()) {
          const v = n.point.subtract(s.point).divide(3);
          s.handleOut = v;
          n.handleIn = v.negate();
        }
      });
      VP.commit();
    },
    toggleClosed() {
      const paths = this.segs.size ? Array.from(new Set(Array.from(this.segs).map((s) => s.path))) : this.paths();
      paths.forEach((p) => (p.closed = !p.closed));
      VP.commit();
    },
    overlay(L) {
      const t = this.target;
      if (!t || !t.parent) {
        this.target = null;
        return false;
      }
      const s = 1 / zoom();
      const a = acc();
      const ol = t.clone({ insert: false });
      ol.fillColor = null;
      ol.strokeColor = a;
      ol.strokeWidth = s;
      ol.dashArray = [];
      ol.shadowColor = null;
      ol.opacity = 1;
      ol.blendMode = 'normal';
      L.addChild(ol);
      const hs = (VP.coarse ? 11 : 8) * s;
      const white = new paper.Color('#ffffff');
      this.segs.forEach((g) => {
        ['In', 'Out'].forEach((w) => {
          const h = g['handle' + w];
          if (h.isZero()) return;
          const hp = g.point.add(h);
          L.addChild(new paper.Path.Line({ from: g.point, to: hp, strokeColor: a, strokeWidth: s, insert: false }));
          L.addChild(new paper.Path.Circle({ center: hp, radius: hs * 0.45, fillColor: a, insert: false }));
        });
      });
      this.allSegs().forEach((g) => {
        const on = this.segs.has(g);
        const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(g.point.subtract(hs / 2), new paper.Size(hs, hs)), insert: false });
        r.fillColor = on ? a : white;
        r.strokeColor = a;
        r.strokeWidth = 1.2 * s;
        if (g.index === 0 && !g.path.closed) r.rotate(45);
        L.addChild(r);
      });
      if (this.op && this.op.type === 'marquee') drawMarquee(L, this.op.rect);
      return true;
    }
  };

  /* ===================== FREEHAND ===================== */
  T.freehand = {
    cursor: 'crosshair',
    path: null,
    busy() { return !!this.path; },
    down(e) {
      VP.ensureLayer();
      const d = VP.defaults;
      this.path = new paper.Path({ strokeColor: d.stroke || '#1d1d1b', strokeWidth: d.strokeWidth || 1, strokeCap: 'round', strokeJoin: 'round' });
      this.path.add(e.point);
      this.last = e.vpt;
    },
    move(e) {
      if (!this.path || e.vpt.getDistance(this.last) < 1.5) return;
      this.last = e.vpt;
      this.path.add(e.point);
    },
    up() {
      const p = this.path;
      this.path = null;
      if (!p) return;
      if (p.segments.length < 2 || p.length * zoom() < 3) {
        p.remove();
        return;
      }
      p.simplify((0.6 + VP.defaults.smoothing * 1.6) / zoom());
      const closeDist = p.firstSegment.point.getDistance(p.lastSegment.point) * zoom();
      if (closeDist < (VP.coarse ? 16 : 10) && p.length * zoom() > 60) {
        p.closed = true;
        if (VP.defaults.fill) p.fillColor = new paper.Color(VP.defaults.fill);
      }
      p.data.dash = VP.defaults.dash;
      VP.applyDash(p);
      VP.setSelection([p]);
      VP.commit();
    },
    cancel() {
      if (this.path) this.path.remove();
      this.path = null;
    }
  };

  /* ===================== BRUSH (pressure-sensitive artistic media) ===================== */
  T.brush = {
    cursor: 'crosshair',
    samples: null,
    preview: null,
    busy() { return !!this.samples; },
    ink() {
      return VP.defaults.stroke || VP.defaults.fill || '#1d1d1b';
    },
    down(e) {
      VP.ensureLayer();
      const W = VP.toPT(VP.defaults.brushWidth);
      this.usePressure = VP.defaults.pressure && e.pointerType === 'pen';
      this.samples = [{ p: e.point, pr: e.pressure || 0.5 }];
      this.preview = new paper.Path({ strokeColor: this.ink(), strokeWidth: W * (this.usePressure ? 0.7 : 1), strokeCap: 'round', strokeJoin: 'round', opacity: 0.75 });
      this.preview.add(e.point);
      this.last = e.vpt;
    },
    move(e) {
      if (!this.samples || e.vpt.getDistance(this.last) < 2) return;
      this.last = e.vpt;
      this.samples.push({ p: e.point, pr: e.pressure || 0.5 });
      this.preview.add(e.point);
    },
    up() {
      const S = this.samples;
      this.samples = null;
      if (this.preview) this.preview.remove();
      this.preview = null;
      if (!S) return;
      const W = VP.toPT(VP.defaults.brushWidth);
      const minStep = Math.max(W * 0.22, 1 / zoom());
      const pts = [S[0]];
      for (let i = 1; i < S.length; i++) if (S[i].p.getDistance(pts[pts.length - 1].p) >= minStep) pts.push(S[i]);
      let out;
      if (pts.length < 3) {
        out = new paper.Path.Circle({ center: S[0].p, radius: W / 2 });
      } else {
        const n = pts.length;
        let w = pts.map((s) => W * (this.usePressure ? 0.2 + 0.95 * VP.clamp(s.pr, 0, 1) : 1));
        w = w.map((v, i) => (w[Math.max(0, i - 1)] + v * 2 + w[Math.min(n - 1, i + 1)]) / 4);
        const taper = [0.35, 0.65, 0.88];
        taper.forEach((k, i) => {
          if (i < n) w[i] *= k;
          if (n - 1 - i >= 0) w[n - 1 - i] *= k;
        });
        const Lp = [];
        const Rp = [];
        for (let i = 0; i < n; i++) {
          const a = pts[Math.max(0, i - 1)].p;
          const b = pts[Math.min(n - 1, i + 1)].p;
          let tg = b.subtract(a);
          if (tg.isZero()) tg = Pt(1, 0);
          const nrm = tg.normalize().rotate(90);
          Lp.push(pts[i].p.add(nrm.multiply(w[i] / 2)));
          Rp.push(pts[i].p.subtract(nrm.multiply(w[i] / 2)));
        }
        const t0 = pts[0].p.subtract(pts[1].p).normalize(w[0] / 2);
        const t1 = pts[n - 1].p.subtract(pts[n - 2].p).normalize(w[n - 1] / 2);
        const segs = Lp.concat([pts[n - 1].p.add(t1)], Rp.reverse(), [pts[0].p.add(t0)]);
        out = new paper.Path({ segments: segs, closed: true });
        out.smooth({ type: 'catmull-rom' });
        out.simplify(0.25 / zoom());
      }
      out.fillColor = new paper.Color(this.ink());
      out.strokeColor = null;
      out.data.brush = true;
      VP.setSelection([out]);
      VP.commit();
    },
    cancel() {
      if (this.preview) this.preview.remove();
      this.preview = null;
      this.samples = null;
    }
  };

  /* ===================== BÉZIER PEN ===================== */
  T.pen = {
    cursor: 'crosshair',
    path: null,
    drag: null,
    hoverPt: null,
    busy() { return !!this.drag; },
    deactivate() { this.finish(); },
    down(e) {
      const p = VP.snapPt(e.point);
      if (this.path && e.tapCount >= 2) {
        this.finish();
        return;
      }
      if (!this.path) {
        VP.ensureLayer();
        const d = VP.defaults;
        this.path = new paper.Path({ strokeColor: d.stroke || '#1d1d1b', strokeWidth: d.strokeWidth || 1, strokeCap: d.cap, strokeJoin: d.join });
        this.path.data.dash = d.dash;
        VP.applyDash(this.path);
        this.path.add(p);
        this.drag = this.path.lastSegment;
        VP.clearSelection();
        VP.emit('tool');
      } else {
        const first = this.path.firstSegment;
        if (this.path.segments.length >= 2 && first.point.getDistance(p) * zoom() <= tolPx() + 4) {
          this.path.closed = true;
          if (VP.defaults.fill) this.path.fillColor = new paper.Color(VP.defaults.fill);
          this.drag = first;
          this.closing = true;
        } else {
          this.path.add(p);
          this.drag = this.path.lastSegment;
        }
      }
      this.dragStart = p;
      VP.drawOverlay();
    },
    move(e) {
      if (!this.drag) return;
      const v = e.point.subtract(this.drag.point);
      if (v.length * zoom() < 3) return;
      this.drag.handleOut = v;
      this.drag.handleIn = v.negate();
      VP.drawOverlay();
    },
    hover(e) {
      this.hoverPt = this.path ? VP.snapPt(e.point) : null;
      if (this.path) VP.drawOverlay();
    },
    up() {
      this.drag = null;
      if (this.closing) {
        this.closing = false;
        this.finish();
        return;
      }
      VP.drawOverlay();
      VP.emit('tool');
    },
    removeLast() {
      if (!this.path) return;
      if (this.path.segments.length <= 1) return this.cancelPath();
      this.path.lastSegment.remove();
      VP.drawOverlay();
    },
    cancelPath() {
      if (this.path) this.path.remove();
      this.path = null;
      this.drag = null;
      VP.drawOverlay();
      VP.emit('tool');
    },
    finish() {
      const p = this.path;
      this.path = null;
      this.drag = null;
      this.hoverPt = null;
      if (!p) return;
      while (p.segments.length > 2 && p.lastSegment.point.getDistance(p.lastSegment.previous.point) * zoom() < 2) p.lastSegment.remove();
      if (p.segments.length < 2) {
        p.remove();
        VP.drawOverlay();
        VP.emit('tool');
        return;
      }
      VP.setSelection([p]);
      VP.commit();
      VP.emit('tool');
    },
    cancel() {
      this.drag = null;
    },
    key(ev) {
      if (!this.path) return false;
      if (ev.key === 'Enter' || ev.key === 'Escape') {
        this.finish();
        return true;
      }
      if (ev.key === 'Backspace' || ev.key === 'Delete') {
        this.removeLast();
        return true;
      }
      return false;
    },
    overlay(L) {
      if (!this.path) return false;
      const s = 1 / zoom();
      const a = acc();
      const segs = this.path.segments;
      const hs = (VP.coarse ? 10 : 7) * s;
      if (this.hoverPt && !this.drag) {
        L.addChild(new paper.Path.Line({ from: this.path.lastSegment.point, to: this.hoverPt, strokeColor: a, strokeWidth: s, dashArray: [4 * s, 3 * s], insert: false }));
      }
      segs.forEach((g, i) => {
        if (i === segs.length - 1 || g === this.drag) {
          ['In', 'Out'].forEach((w) => {
            const h = g['handle' + w];
            if (h.isZero()) return;
            L.addChild(new paper.Path.Line({ from: g.point, to: g.point.add(h), strokeColor: a, strokeWidth: s, insert: false }));
            L.addChild(new paper.Path.Circle({ center: g.point.add(h), radius: hs * 0.45, fillColor: a, insert: false }));
          });
        }
        const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(g.point.subtract(hs / 2), new paper.Size(hs, hs)), insert: false });
        r.fillColor = i === 0 ? a : new paper.Color('#ffffff');
        r.strokeColor = a;
        r.strokeWidth = 1.2 * s;
        L.addChild(r);
      });
      return true;
    }
  };

  /* ===================== LINE ===================== */
  T.line = {
    cursor: 'crosshair',
    path: null,
    busy() { return !!this.path; },
    down(e) {
      VP.ensureLayer();
      const d = VP.defaults;
      const p = VP.snapPt(e.point);
      this.start = p;
      this.path = new paper.Path({ segments: [p, p], strokeColor: d.stroke || '#1d1d1b', strokeWidth: d.strokeWidth || 1, strokeCap: d.cap });
      this.path.data.dash = d.dash;
      VP.applyDash(this.path);
    },
    move(e) {
      if (!this.path) return;
      let p = VP.snapPt(e.point);
      if (e.shift) {
        const v = p.subtract(this.start);
        const ang = Math.round(v.angle / 15) * 15;
        p = this.start.add(Pt(v.length, 0).rotate(ang));
      }
      this.path.lastSegment.point = p;
    },
    up() {
      const p = this.path;
      this.path = null;
      if (!p) return;
      if (p.length * zoom() < 3) return p.remove();
      VP.setSelection([p]);
      VP.commit();
    },
    cancel() {
      if (this.path) this.path.remove();
      this.path = null;
    }
  };

  /* ===================== RECTANGLE / ELLIPSE / POLYGON / STAR / SPIRAL ===================== */
  const shapeTool = (kind, star) => ({
    cursor: 'crosshair',
    item: null,
    busy() { return !!this.item; },
    down(e) {
      const d = VP.defaults;
      this.start = VP.snapPt(e.point);
      const prm = { kind, cx: this.start.x, cy: this.start.y, w: 0.01, h: 0.01, angle: 0 };
      if (kind === 'rect') prm.r = VP.toPT(d.rectRadius || 0);
      if (kind === 'polygon') {
        prm.sides = d.polySides;
        prm.star = !!star;
        prm.inner = d.polyInner;
      }
      if (kind === 'spiral') prm.turns = d.spiralTurns;
      this.item = VP.createParam(prm);
    },
    move(e) {
      if (!this.item) return;
      const p = VP.snapPt(e.point);
      let dx = p.x - this.start.x;
      let dy = p.y - this.start.y;
      const equal = VP.defaults.equal !== !!e.ctrl;
      const center = VP.defaults.fromCenter !== !!e.shift;
      if (equal) {
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        dx = (dx < 0 ? -1 : 1) * m;
        dy = (dy < 0 ? -1 : 1) * m;
      }
      const prm = this.item.data.param;
      if (center) {
        prm.cx = this.start.x;
        prm.cy = this.start.y;
        prm.w = Math.abs(dx) * 2;
        prm.h = Math.abs(dy) * 2;
      } else {
        prm.cx = this.start.x + dx / 2;
        prm.cy = this.start.y + dy / 2;
        prm.w = Math.abs(dx);
        prm.h = Math.abs(dy);
      }
      VP.rebuildParam(this.item);
      VP.emit('transform');
    },
    up(e) {
      const it = this.item;
      this.item = null;
      if (!it) return;
      const prm = it.data.param;
      if (prm.w * zoom() < 4 && prm.h * zoom() < 4) {
        it.remove();
        const hit = VP.hitItem(e.point);
        VP.setSelection(hit ? [hit] : []);
        return;
      }
      prm.w = Math.max(prm.w, 0.5);
      prm.h = Math.max(prm.h, 0.5);
      VP.rebuildParam(it);
      VP.setSelection([it]);
      VP.commit();
    },
    cancel() {
      if (this.item) this.item.remove();
      this.item = null;
    }
  });
  T.rect = shapeTool('rect');
  T.ellipse = shapeTool('ellipse');
  T.polygon = shapeTool('polygon', false);
  T.star = shapeTool('polygon', true);
  T.spiral = shapeTool('spiral');

  /* ===================== TEXT ===================== */
  T.text = {
    cursor: 'text',
    busy() { return false; },
    down(e) {
      const hit = VP.hitItem(e.point);
      if (hit instanceof paper.PointText) {
        VP.setSelection([hit]);
        VP.ui.editText(hit);
        return;
      }
      const t = VP.createText(VP.snapPt(e.point), '');
      VP.setSelection([t]);
      VP.ui.editText(t, true);
    },
    move() {},
    up() {},
    cancel() {}
  };

  /* ===================== EYEDROPPER ===================== */
  T.eyedropper = {
    cursor: 'copy',
    busy() { return false; },
    down(e) {
      const hit = VP.hitItem(e.point, { deep: true });
      if (!hit) return VP.toast('Renk almak için bir nesneye dokunun');
      const fill = VP.getFill(hit);
      const st = VP.getStroke(hit);
      const top = VP.topLevel(hit);
      const targets = VP.sel.filter((it) => it !== top);
      if (targets.length) {
        if (!(hit instanceof paper.Raster)) {
          VP.setFill(targets, fill);
          VP.setStroke(targets, st.on ? { on: true, color: st.color, width: st.width, dash: st.dash } : { on: false });
        }
        VP.commit();
        VP.toast('Nitelikler seçili nesnelere uygulandı');
      } else {
        VP.defaults.fill = fill.type === 'none' ? null : fill.color;
        VP.defaults.stroke = st.on ? st.color : null;
        if (st.on && st.width) VP.defaults.strokeWidth = st.width;
        VP.emit('defaults');
        VP.toast('Renkler alındı · Yeni nesneler bunları kullanacak');
      }
    },
    move() {},
    up() {},
    cancel() {}
  };

  /* ===================== HAND & ZOOM ===================== */
  T.hand = {
    cursor: 'grab',
    last: null,
    busy() { return false; },
    down(e) { this.last = e.vpt; },
    move(e) {
      if (!this.last) return;
      VP.panBy(e.vpt.x - this.last.x, e.vpt.y - this.last.y);
      this.last = e.vpt;
    },
    up() { this.last = null; },
    cancel() { this.last = null; }
  };
  T.zoom = {
    cursor: 'zoom-in',
    op: null,
    busy() { return false; },
    down(e) { this.op = { start: e.point, startV: e.vpt, rect: null }; },
    move(e) {
      if (!this.op) return;
      this.op.rect = new paper.Rectangle(this.op.start, e.point);
      VP.drawOverlay();
    },
    up(e) {
      const op = this.op;
      this.op = null;
      if (!op) return;
      if (op.rect && op.rect.width * zoom() > 12 && op.rect.height * zoom() > 12) VP.zoomToRect(op.rect);
      else VP.zoomAt(e.alt ? 0.5 : 2, e.vpt);
      VP.drawOverlay();
    },
    cancel() { this.op = null; },
    overlayAfter(L) {
      if (this.op) drawMarquee(L, this.op.rect);
    }
  };

  VP.toolId = 'select';
  VP.setTool = (id) => {
    if (!T[id]) return;
    if (VP.ui && VP.ui.textItem) VP.ui.commitText();
    const cur = T[VP.toolId];
    if (cur && cur.deactivate && VP.toolId !== id) cur.deactivate();
    VP.toolId = id;
    const t = T[id];
    if (t.activate) t.activate();
    const cv = document.getElementById('canvas');
    if (cv) cv.style.cursor = t.cursor || 'crosshair';
    VP.drawOverlay();
    VP.emit('tool');
    if (VP.ui && VP.ui.showHint) VP.ui.showHint(VP.TOOL_META[id].hint);
  };
})();
