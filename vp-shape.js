/* VektörPad crop group tools: crop, knife and eraser. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const S = (VP.shapeTools = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);
  const T = VP.tools;
  const cuttable = (it) => it && VP.isPathItem(it) && !FX.isFx(it);
  const look = (dst, src) => {
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
    delete dst.data.uid;
    VP.applyShadowProps(dst);
    return dst;
  };
  const isOpen = (it) => it instanceof paper.Path && !it.closed;
  // Splits a compound result into separate shapes, each outer loop with the holes inside it.
  const separate = (cp) => {
    if (!(cp instanceof paper.CompoundPath)) return [cp];
    const kids = cp.children.slice().sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const groups = [];
    kids.forEach((k) => {
      const owner = groups.find((g) => g.outer.clockwise !== k.clockwise && g.outer.contains(k.interiorPoint));
      if (owner) owner.holes.push(k);
      else groups.push({ outer: k, holes: [] });
    });
    return groups.map((g) => (g.holes.length ? new paper.CompoundPath({ children: [g.outer.clone({ insert: false }), ...g.holes.map((h) => h.clone({ insert: false }))], insert: false }) : g.outer.clone({ insert: false })));
  };
  const targetsNear = (bounds) => {
    const sel = VP.sel.filter(cuttable);
    if (sel.length) return sel;
    return VP.allSelectable().filter((it) => cuttable(it) && it.bounds.intersects(bounds));
  };

  /* =============== CROP =============== */
  S.crop = (rect) => {
    const items = VP.sel.length ? VP.sel.slice() : VP.allSelectable();
    if (!items.length) return VP.toast('Kırpılacak nesne yok');
    const box = new paper.Path.Rectangle({ rectangle: rect, insert: false });
    let removed = 0;
    let clipped = 0;
    const out = [];
    items.forEach((it) => {
      const b = it.bounds;
      if (!b.intersects(rect)) {
        it.remove();
        removed++;
        return;
      }
      if (rect.contains(b)) return out.push(it);
      try {
        if (cuttable(it)) {
          const res = isOpen(it) ? it.intersect(box, { trace: false, insert: false }) : it.intersect(box, { insert: false });
          if (!res || res.isEmpty()) {
            it.remove();
            removed++;
            return;
          }
          look(res, it);
          res.insertAbove(it);
          it.remove();
          out.push(res);
          clipped++;
          return;
        }
      } catch (e) { /* falls back to a clip group */ }
      const g = new paper.Group({ insert: false });
      g.insertAbove(it);
      const mask = box.clone({ insert: false });
      mask.fillColor = '#000000';
      g.addChild(mask);
      g.addChild(it);
      g.clipped = true;
      g.data.label = 'Kırpılmış ' + (VP.KIND_NAMES[VP.kindOf(it)] || 'nesne').toLocaleLowerCase('tr');
      out.push(g);
      clipped++;
    });
    VP.setSelection(out);
    VP.commit();
    VP.toast('Kırpıldı · ' + clipped + ' nesne kesildi' + (removed ? ', ' + removed + ' nesne alan dışında kaldığı için silindi' : ''));
  };
  T.cropTool = {
    cursor: 'crosshair',
    op: null,
    rect: null,
    busy() { return !!this.op; },
    deactivate() {
      this.rect = null;
      this.op = null;
    },
    down(e) {
      if (this.rect && this.rect.contains(e.point) && e.tapCount >= 1) {
        this.op = { type: 'tap', raw: e.point };
        return;
      }
      this.op = { type: 'new', start: VP.snapPt(e.point), raw: e.point, moved: false };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (op.type === 'tap') {
        if (op.raw.getDistance(e.point) * zoom() > 6) this.op = { type: 'new', start: VP.snapPt(op.raw), raw: op.raw, moved: true };
        else return;
      }
      if (!this.op.moved && this.op.raw.getDistance(e.point) * zoom() < 6) return;
      this.op.moved = true;
      this.rect = new paper.Rectangle(this.op.start, VP.snapPt(e.point));
      VP.drawOverlay();
    },
    up() {
      const op = this.op;
      this.op = null;
      if (!op) return;
      if (op.type === 'tap') return this.apply();
      if (!op.moved) {
        this.rect = null;
        VP.drawOverlay();
      } else VP.toast('Kırpmak için alanın içine dokunun veya özellik çubuğunda “Kırp”');
      UI.schedule('prop');
    },
    apply() {
      const r = this.rect;
      this.rect = null;
      if (r && r.width > 0.5 && r.height > 0.5) S.crop(r);
      VP.drawOverlay();
      UI.schedule('prop');
    },
    cancel() {
      this.op = null;
      this.rect = null;
      VP.drawOverlay();
    },
    overlayAfter(L) {
      const r = this.rect;
      if (!r) return;
      const s = 1 / zoom();
      const vb = paper.view.bounds;
      const shade = new paper.CompoundPath({ children: [new paper.Path.Rectangle({ rectangle: vb, insert: false }), new paper.Path.Rectangle({ rectangle: r, insert: false })], fillRule: 'evenodd', insert: false });
      shade.fillColor = new paper.Color(0, 0, 0, 0.32);
      L.addChild(shade);
      L.addChild(new paper.Path.Rectangle({ rectangle: r, strokeColor: acc(), strokeWidth: 1.5 * s, dashArray: [6 * s, 4 * s], insert: false }));
    }
  };

  /* =============== KNIFE =============== */
  S.cut = (a, b) => {
    const seg = new paper.Path.Line({ from: a, to: b, insert: false });
    const u = b.subtract(a).normalize();
    const n = u.rotate(90).multiply(0.01);
    // a hair-thin sliver along the cut separates the pieces without a visible gap
    const sliver = new paper.Path({ segments: [a.subtract(u.multiply(0.5)).add(n), b.add(u.multiply(0.5)).add(n), b.add(u.multiply(0.5)).subtract(n), a.subtract(u.multiply(0.5)).subtract(n)], closed: true, insert: false });
    const targets = targetsNear(seg.bounds.expand(1));
    let pieces = 0;
    const out = [];
    targets.forEach((it) => {
      const hits = it.getIntersections(seg);
      if (!hits.length) return;
      if (isOpen(it)) {
        const offs = hits.map((h) => it.getOffsetOf(h.point)).filter((o) => o > 0.01 && o < it.length - 0.01).sort((x, y) => y - x);
        if (!offs.length) return;
        const parts = [it];
        offs.forEach((o) => {
          const rest = it.splitAt(o);
          if (rest) parts.push(rest);
        });
        parts.forEach((p) => {
          if (p !== it) look(p, it);
          out.push(p);
        });
        pieces += parts.length;
        return;
      }
      if (hits.length < 2) return;
      let res;
      try {
        res = it.subtract(sliver, { insert: false });
      } catch (e) {
        return;
      }
      const parts = separate(res);
      if (parts.length < 2) return;
      parts.forEach((p) => {
        look(p, it);
        p.insertAbove(it);
        out.push(p);
      });
      it.remove();
      pieces += parts.length;
    });
    if (!pieces) return VP.toast('Bıçak çizgisi bir şeklin içinden tamamen geçmeli');
    VP.setSelection(out);
    VP.commit();
    VP.toast('Kesildi: ' + pieces + ' parça');
  };
  T.knifeTool = {
    cursor: 'crosshair',
    op: null,
    busy() { return !!this.op; },
    down(e) {
      this.op = { a: VP.snapPt(e.point), b: null, raw: e.point };
    },
    move(e) {
      if (!this.op) return;
      let p = VP.snapPt(e.point);
      if (e.shift) {
        const d = p.subtract(this.op.a);
        const ang = Math.round(d.angle / 15) * 15;
        p = this.op.a.add(Pt(d.length, 0).rotate(ang));
      }
      this.op.b = p;
      VP.drawOverlay();
    },
    up() {
      const op = this.op;
      this.op = null;
      VP.drawOverlay();
      if (!op || !op.b || op.a.getDistance(op.b) * zoom() < 8) return;
      S.cut(op.a, op.b);
    },
    cancel() {
      this.op = null;
      VP.drawOverlay();
    },
    overlayAfter(L) {
      if (!this.op || !this.op.b) return;
      const s = 1 / zoom();
      L.addChild(new paper.Path.Line({ from: this.op.a, to: this.op.b, strokeColor: '#d6362b', strokeWidth: 1.6 * s, dashArray: [6 * s, 4 * s], insert: false }));
    }
  };

  /* =============== ERASER =============== */
  const eraserShape = (pts, r) => {
    const keep = [pts[0]];
    pts.forEach((p) => {
      if (p.getDistance(keep[keep.length - 1]) >= r * 0.5) keep.push(p);
    });
    if (keep[keep.length - 1] !== pts[pts.length - 1]) keep.push(pts[pts.length - 1]);
    const parts = keep.map((p) => new paper.Path.Circle({ center: p, radius: r, insert: false }));
    for (let i = 1; i < keep.length; i++) {
      const a = keep[i - 1];
      const b = keep[i];
      const d = b.subtract(a);
      if (d.length < 1e-6) continue;
      const n = d.normalize().rotate(90).multiply(r);
      parts.push(new paper.Path({ segments: [a.add(n), b.add(n), b.subtract(n), a.subtract(n)], closed: true, insert: false }));
    }
    // unite pairwise so each step stays small
    let list = parts;
    while (list.length > 1) {
      const next = [];
      for (let i = 0; i < list.length; i += 2) next.push(i + 1 < list.length ? list[i].unite(list[i + 1], { insert: false }) : list[i]);
      list = next;
    }
    return list[0];
  };
  S.erase = (pts, r) => {
    if (pts.length < 1) return;
    const shape = eraserShape(pts, r);
    const targets = targetsNear(shape.bounds);
    let changed = 0;
    let skipped = 0;
    const out = [];
    targets.forEach((it) => {
      if (!it.bounds.intersects(shape.bounds)) return;
      let res;
      try {
        res = isOpen(it) ? it.subtract(shape, { trace: false, insert: false }) : it.subtract(shape, { insert: false });
      } catch (e) {
        skipped++;
        return;
      }
      if (!res) return;
      const before = Math.abs(it.area || 0) + (it.length || 0);
      const after = Math.abs(res.area || 0) + (res.length || 0);
      if (Math.abs(before - after) < 1e-3) return;
      if (res.isEmpty()) {
        it.remove();
        changed++;
        return;
      }
      look(res, it);
      res.insertAbove(it);
      it.remove();
      out.push(res);
      changed++;
    });
    if (!changed) return VP.toast(VP.sel.length ? 'Seçili nesnelerde silinecek bir yer yok' : 'Silgi eğri ve şekilleri siler · Metinleri önce eğriye dönüştürün');
    VP.setSelection(out);
    VP.commit();
  };
  T.eraserTool = {
    cursor: 'crosshair',
    pts: null,
    busy() { return !!this.pts; },
    radius() { return VP.toPT(VP.defaults.eraserMM || 4) / 2; },
    down(e) {
      this.pts = [e.point];
    },
    move(e) {
      if (!this.pts) return;
      this.pts.push(e.point);
      VP.drawOverlay();
    },
    up() {
      const pts = this.pts;
      this.pts = null;
      VP.drawOverlay();
      if (pts && pts.length) S.erase(pts, this.radius());
    },
    cancel() {
      this.pts = null;
      VP.drawOverlay();
    },
    overlayAfter(L) {
      if (!this.pts || !this.pts.length) return;
      const p = new paper.Path({ segments: this.pts, insert: false });
      p.strokeColor = new paper.Color(0.84, 0.21, 0.17, 0.35);
      p.strokeWidth = this.radius() * 2;
      p.strokeCap = 'round';
      p.strokeJoin = 'round';
      L.addChild(p);
    }
  };

  Object.assign(VP.TOOL_META, {
    cropTool: { label: 'Kırpma', icon: 'cropTool', key: '', hint: 'Bir alan çizin, sonra içine dokunun: seçili nesneler (seçim yoksa sayfadaki tümü) bu alana kırpılır' },
    knifeTool: { label: 'Bıçak', icon: 'knifeTool', key: '', hint: 'Bir şeklin içinden tamamen geçen bir çizgi çekin: şekil ikiye bölünür · Shift: 15° adımlar' },
    eraserTool: { label: 'Silgi', icon: 'eraserTool', key: 'X', hint: 'Silmek istediğiniz yerin üzerinden geçin · Seçim varsa yalnızca seçili nesneler silinir · Genişlik özellik çubuğunda' }
  });
  Object.assign(VP.defaults, { eraserMM: 4 }, VP.defaults);

  /* property bar */
  const pbx = VP.tx.propbar;
  VP.tx.propbar = () => {
    if (VP.toolId === 'cropTool') return '<span class="pb-title">Kırpma</span>' + (T.cropTool.rect ? H.btn('shCrop', 'Kırp', 'Alanın dışını kırp', 'primary') + H.btn('shCropCancel', 'İptal', 'Kırpma alanını kaldır') : '') + '<span class="pb-label">' + (VP.sel.length ? VP.sel.length + ' seçili nesne kırpılacak' : 'Seçim yok: sayfadaki tüm nesneler kırpılacak') + '</span>';
    if (VP.toolId === 'knifeTool') return '<span class="pb-title">Bıçak</span><span class="pb-label">' + (VP.sel.length ? 'Yalnızca seçili şekiller kesilir' : 'Çizginin geçtiği şekiller kesilir') + ' · Shift: 15° adımlar</span>';
    if (VP.toolId === 'eraserTool') return '<span class="pb-title">Silgi</span>' + H.field('Genişlik', 'shEraser', VP.num(VP.defaults.eraserMM, 1)) + '<span class="pb-label">' + (VP.sel.length ? 'Yalnızca seçili nesneler silinir' : 'Geçtiğiniz eğri ve şekiller silinir') + '</span>';
    return pbx();
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => {
    if (n === 'shEraser') {
      const v = VP.parseNum(r);
      if (v > 0) VP.defaults.eraserMM = Math.min(100, v);
      return true;
    }
    return pf0(n, r, el);
  };
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => {
    if (id === 'shCrop') {
      T.cropTool.apply();
      return true;
    }
    if (id === 'shCropCancel') {
      T.cropTool.cancel();
      UI.schedule('prop');
      return true;
    }
    return act0(id, el);
  };
})();
