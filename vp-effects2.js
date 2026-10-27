/* VektörPad effects, second set: interactive drop shadow (flat and perspective), inner shadow, block shadow,
   distortion (push and pull, zipper, twister), the six extrude types, envelope modes (straight line, single arc,
   double arc, unconstrained), blend along a path (with rotation and colour direction) and two more lens types
   (transparency, custom colour map). All are live effects that rebuild when their settings change. */
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
  const E2 = (VP.fx2 = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);
  const tolPx = () => (VP.coarse ? 22 : 11) / zoom();
  const src = (g) => g.children.find((c) => c.data.effectSrc);
  const one = () => (VP.sel.length === 1 ? VP.sel[0] : null);
  const fxOne = (type) => {
    const g = one();
    const fx = FX.of(g);
    return fx && fx.type === type ? g : null;
  };
  const seg = (items, cur, prefix) => '<span class="seg">' + items.map(([v, l]) => '<button data-act="' + prefix + v + '" class="' + (String(v) === String(cur) ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const select = (label, name, items, cur) => '<label class="field"><span>' + esc(label) + '</span><select data-pf="' + name + '" aria-label="' + esc(label) + '">' + items.map(([k, l]) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>';
  const row = (x, panel) => (panel ? '<div class="row">' + x + '</div>' : x);
  const fieldOf = (panel) => (panel ? H.dfieldPf : H.field);
  const endBtns = (panel) => (panel ? '<div class="row"><button class="btn" data-act="fxSeparate">Ayır</button><button class="btn danger" data-act="fxClear">Kaldır</button></div>' : H.btn('fxMenu', 'Efekt ▾', 'Efekti ayır veya kaldır'));
  const D = VP.defaults;
  Object.assign(
    VP.defaults,
    {
      shadowMode: 'flat', shColor: '#000000', shAlpha: 0.5, shBlur: VP.toPT(2.5), shFade: 0.6,
      ishColor: '#000000', ishAlpha: 0.6, ishBlur: VP.toPT(2), ishDx: VP.toPT(1.2), ishDy: VP.toPT(1.2),
      bsColor: '#1d1d1b', bsLen: VP.toPT(5), bsAngle: 45,
      distMode: 'push', distAmp: 40, distFreq: 6, distTurns: 1,
      extrudeKind: 'smallBack', envMode: 'single'
    },
    VP.defaults
  );
  const live = (el) => !el || !el.dataset.live || UI._rangeDone;
  const out = (el, txt) => el && el.nextElementSibling && el.nextElementSibling.tagName === 'OUTPUT' && (el.nextElementSibling.textContent = txt);
  // wraps an item as the source of a live effect group
  const wrap = (item, effect) => {
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.insertAbove(item);
    g.addChild(item);
    item.data.effectSrc = true;
    g.data.effect = effect;
    return g;
  };
  const unwrapSrc = (g) => {
    const s = src(g);
    g.children.slice().forEach((c) => c !== s && c.remove());
    if (!s) {
      g.remove();
      return [];
    }
    delete s.data.effectSrc;
    s.transform(g.matrix);
    s.insertAbove(g);
    g.remove();
    VP.applyShadowProps(s);
    return [s];
  };
  // every contour of an item as plain paths (texts become outlines), in the item's own coordinates
  const loopsOf = (item) => {
    const res = [];
    const holder = new paper.Group({ insert: false });
    const c = item.clone({ insert: false });
    holder.addChild(c);
    const walk = (it) => {
      if (it instanceof paper.PointText) {
        const cp = VP.textToPath(it);
        if (cp) walk(cp);
        return;
      }
      if (it instanceof paper.CompoundPath) return it.children.forEach((p) => res.push(p));
      if (it instanceof paper.Path) return res.push(it);
      if (it instanceof paper.Raster) return res.push(new paper.Path.Rectangle({ rectangle: it.bounds, insert: false }));
      if (it.children) it.children.slice().forEach(walk);
    };
    walk(c);
    return res;
  };
  // the filled area of an item as one path item
  const areaOf = (item) => {
    if ((item instanceof paper.Path && item.closed) || item instanceof paper.CompoundPath) {
      const g = item.clone({ insert: false });
      g.data = {};
      return g;
    }
    const loops = loopsOf(item).filter((p) => p.closed || p.segments.length > 2).map((p) => {
      const q = p.clone({ insert: false });
      q.closed = true;
      return q;
    });
    if (!loops.length) return null;
    if (item instanceof paper.PointText || loops.length > 40) return new paper.CompoundPath({ children: loops, fillRule: 'nonzero', insert: false });
    let u = loops[0];
    for (let i = 1; i < loops.length; i++) u = u.unite(loops[i], { insert: false });
    return u;
  };
  // a flat copy of an item in one colour
  const silhouette = (item, hex) => {
    const c = item.clone({ insert: false });
    const col = new paper.Color(hex);
    const walk = (it) => {
      if (it instanceof paper.Raster) {
        const r = new paper.Path.Rectangle({ rectangle: it.bounds, insert: false });
        r.fillColor = col;
        it.replaceWith(r);
        return;
      }
      if (it.children && !(it instanceof paper.CompoundPath)) return it.children.slice().forEach(walk);
      if (it.fillColor || it instanceof paper.PointText) it.fillColor = col;
      if (it.strokeColor) it.strokeColor = col;
      it.shadowColor = null;
      it.opacity = 1;
      it.blendMode = 'normal';
    };
    if (c.children && !(c instanceof paper.CompoundPath)) c.children.slice().forEach(walk);
    else walk(c);
    c.shadowColor = null;
    c.opacity = 1;
    c.data = {};
    return c;
  };
  E2.silhouette = silhouette;
  // a blurred bitmap of an item (soft shadows)
  E2.softRaster = (item, blur) => {
    const pad = blur * 2 + 2;
    const b = item.strokeBounds.expand(pad * 2);
    const grp = new paper.Group({ insert: false });
    grp.addChild(new paper.Path.Rectangle({ rectangle: b, insert: false }));
    grp.addChild(item);
    const dpi = clamp((72 * 900) / Math.max(b.width, b.height, 1), 24, 200);
    let r;
    try {
      r = grp.rasterize(dpi, false);
    } catch (e) {
      return null;
    }
    if (!r || !r.width) return null;
    const rect = new paper.Rectangle(0, 0, r.width, r.height);
    r.setImageData(VP.imgfx.blur(r.getImageData(rect), ((blur * dpi) / 72) / 2), Pt(0, 0));
    return r;
  };

  /* =============== perspective shadow =============== */
  FX.NAMES.pshadow = VP.KIND_NAMES.pshadow = 'Perspektif gölge';
  FX.NAMES.innerShadow = VP.KIND_NAMES.innerShadow = 'İç gölge';
  FX.NAMES.blockShadow = VP.KIND_NAMES.blockShadow = 'Blok gölge';
  FX.NAMES.distort = VP.KIND_NAMES.distort = 'Deformasyon';
  E2.buildPShadow = (g, fast) => {
    const fx = g.data.effect;
    const s = src(g);
    if (!s) return;
    g.children.slice().forEach((c) => c !== s && c.remove());
    const b = s.bounds;
    const hgt = b.height || 1;
    const bottom = b.bottom;
    const cx = b.center.x;
    const kx = (fx.hx - cx) / hgt;
    const ky = (bottom - fx.hy) / hgt;
    const sh = silhouette(s, fx.color);
    sh.transform(new paper.Matrix(1, 0, -kx, ky, kx * bottom, bottom * (1 - ky)));
    if (fx.fade > 0.01) {
      const c0 = new paper.Color(fx.color);
      const c1 = new paper.Color(fx.color);
      c1.alpha = 1 - clamp(fx.fade, 0, 1);
      const grad = { gradient: { stops: [[c0, 0], [c1, 1]] }, origin: Pt(cx, bottom), destination: Pt(fx.hx, fx.hy) };
      const paint = (it) => {
        if (it.children && !(it instanceof paper.CompoundPath)) return it.children.forEach(paint);
        if (it.fillColor) it.fillColor = grad;
        if (it.strokeColor) it.strokeColor = grad;
      };
      paint(sh);
    }
    let res = sh;
    if (!fast && fx.blur > 0.3) res = E2.softRaster(sh, fx.blur) || sh;
    res.opacity = clamp(fx.alpha, 0, 1);
    res.data = { pshadow: true };
    res.insertBelow(s);
  };
  E2.makePShadow = (item) => {
    const fx0 = FX.of(item);
    if (fx0 && fx0.type === 'pshadow') return item;
    if (item.data && item.data.shadow) VP.setShadow([item], { on: false });
    const b = item.bounds;
    const g = wrap(item, { type: 'pshadow', hx: b.center.x + b.height * 0.6, hy: b.bottom - b.height * 0.45, color: D.shColor, alpha: D.shAlpha, blur: D.shBlur, fade: D.shFade });
    E2.buildPShadow(g);
    return g;
  };
  const shadowFields = (g, panel) => {
    const fx = g.data.effect;
    const f = fieldOf(panel);
    let h = panel ? '' : '<span class="pb-label">Perspektif gölge</span>';
    h += row(H.colorField('Renk', 'e2ShColor', fx.color) + H.range('Opaklık', 'e2ShAlpha', Math.round(fx.alpha * 100), 0, 100) + f('Yumuşaklık', 'e2ShBlur', mm(fx.blur, 1)), panel);
    h += row(H.range('Solma', 'e2ShFade', Math.round(fx.fade * 100), 0, 100) + H.btn('e2ShPresets', 'Hazır ▾', 'Hazır gölgeler') + H.btn('e2ShTool', ic('shadowTool', 'sm') + 'Sürükle', 'Gölge aracıyla tutamacı sürükle'), panel);
    return h + endBtns(panel);
  };
  FX.TYPES.pshadow = {
    tool: 'shadowTool',
    build: (g) => E2.buildPShadow(g),
    probe: (g) => src(g),
    restyle(g, fn) {
      fn([src(g)]);
      E2.buildPShadow(g);
    },
    describe: () => 'Perspektif gölge',
    clear: (g) => unwrapSrc(g),
    clearMsg: 'Gölge kaldırıldı',
    bakeMsg: 'Gölge ayrıldı · Gölge ve nesne artık bir grup',
    dblTap(g) {
      VP.setSelection([g]);
      VP.setTool('shadowTool');
    },
    fields: (g) => shadowFields(g, false),
    panel: (g) => shadowFields(g, true)
  };

  /* =============== inner shadow =============== */
  E2.buildInner = (g) => {
    const fx = g.data.effect;
    const s = src(g);
    if (!s) return;
    g.children.slice().forEach((c) => c !== s && c.remove());
    const geo = areaOf(s);
    if (!geo || !(geo.bounds.width > 0.2)) return;
    const pad = Math.abs(fx.dx) + Math.abs(fx.dy) + fx.blur * 3 + 6;
    const big = new paper.Path.Rectangle({ rectangle: geo.bounds.expand(pad * 2), insert: false });
    const ring = big.subtract(geo, { insert: false });
    ring.fillColor = fx.color;
    ring.strokeColor = null;
    ring.data = { shadow: { color: fx.color, alpha: fx.alpha, blur: fx.blur, dx: fx.dx, dy: fx.dy } };
    VP.applyShadowProps(ring);
    const mask = geo.clone({ insert: false });
    mask.fillColor = '#000000';
    mask.strokeColor = null;
    const clip = new paper.Group({ insert: false });
    clip.addChild(mask);
    clip.addChild(ring);
    clip.clipped = true;
    clip.data.ishClip = true;
    clip.blendMode = fx.blend || 'multiply';
    clip.insertAbove(s);
  };
  E2.makeInner = (item) => {
    const fx0 = FX.of(item);
    if (fx0 && fx0.type === 'innerShadow') return item;
    if (FX.isFx(item)) {
      VP.toast('İç gölge için önce efekti ayırın');
      return null;
    }
    if (item instanceof paper.Raster || (item instanceof paper.Path && !item.closed)) {
      VP.toast('İç gölge kapalı şekil ve metinlerde çalışır');
      return null;
    }
    const g = wrap(item, { type: 'innerShadow', color: D.ishColor, alpha: D.ishAlpha, blur: D.ishBlur, dx: D.ishDx, dy: D.ishDy, blend: 'multiply' });
    E2.buildInner(g);
    return g;
  };
  const innerFields = (g, panel) => {
    const fx = g.data.effect;
    const f = fieldOf(panel);
    let h = panel ? '' : '<span class="pb-label">İç gölge</span>';
    h += row(H.colorField('Renk', 'e2IsColor', fx.color) + H.range('Opaklık', 'e2IsAlpha', Math.round(fx.alpha * 100), 0, 100) + f('Yumuşaklık', 'e2IsBlur', mm(fx.blur, 1)), panel);
    h += row(f('X', 'e2IsDx', mm(fx.dx, 1)) + f('Y', 'e2IsDy', mm(fx.dy, 1)) + select('Karışım', 'e2IsBlend', [['multiply', 'Çarp'], ['normal', 'Normal'], ['screen', 'Ekran'], ['overlay', 'Kaplama']], fx.blend || 'multiply'), panel);
    return h + endBtns(panel);
  };
  FX.TYPES.innerShadow = {
    tool: 'innerShadowTool',
    build: (g) => E2.buildInner(g),
    probe: (g) => src(g),
    restyle(g, fn) {
      fn([src(g)]);
      E2.buildInner(g);
    },
    describe: () => 'İç gölge',
    clear: (g) => unwrapSrc(g),
    clearMsg: 'İç gölge kaldırıldı',
    dblTap(g) {
      VP.setSelection([g]);
      VP.setTool('innerShadowTool');
    },
    fields: (g) => innerFields(g, false),
    panel: (g) => innerFields(g, true)
  };

  /* =============== block shadow =============== */
  E2.buildBlock = (g) => {
    const fx = g.data.effect;
    const s = src(g);
    if (!s) return;
    g.children.slice().forEach((c) => c !== s && c.remove());
    const v = Pt(fx.len, 0).rotate(fx.angle);
    if (v.length < 0.05) return;
    const loops = loopsOf(s);
    const per = loops.reduce((a, l) => a + l.length, 0);
    const step = clamp(per / 600, 0.5, 4);
    const quads = [];
    loops.forEach((l) => {
      const pts = [];
      l.curves.forEach((c) => {
        const n = Math.max(1, Math.ceil(c.length / step));
        for (let j = 0; j < n; j++) pts.push(c.getPointAtTime(j / n));
      });
      if (!l.closed && l.lastSegment) pts.push(l.lastSegment.point.clone());
      const n = pts.length;
      const last = l.closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (a.getDistance(b) < 1e-6) continue;
        const q = new paper.Path({ segments: [a, b, b.add(v), a.add(v)], closed: true, insert: false });
        if (Math.abs(q.area) < 1e-6) continue;
        q.clockwise = true;
        quads.push(q);
      }
    });
    const grp = new paper.Group({ insert: false });
    if (quads.length) grp.addChild(new paper.CompoundPath({ children: quads, fillRule: 'nonzero', fillColor: fx.color, insert: false }));
    const copy = new paper.CompoundPath({ children: loops.filter((l) => l.closed).map((l) => l.clone({ insert: false })), insert: false });
    copy.fillRule = s instanceof paper.CompoundPath && s.fillRule === 'evenodd' ? 'evenodd' : 'nonzero';
    copy.translate(v);
    copy.fillColor = fx.color;
    grp.addChild(copy);
    grp.data.bsShadow = true;
    grp.insertBelow(s);
  };
  E2.makeBlock = (item) => {
    const fx0 = FX.of(item);
    if (fx0 && fx0.type === 'blockShadow') return item;
    if (FX.isFx(item)) {
      VP.toast('Blok gölge için önce efekti ayırın');
      return null;
    }
    const g = wrap(item, { type: 'blockShadow', color: D.bsColor, len: D.bsLen, angle: D.bsAngle });
    E2.buildBlock(g);
    return g;
  };
  const blockFields = (g, panel) => {
    const fx = g.data.effect;
    const f = fieldOf(panel);
    let h = panel ? '' : '<span class="pb-label">Blok gölge</span>';
    h += row(H.colorField('Renk', 'e2BsColor', fx.color) + f('Derinlik', 'e2BsLen', mm(fx.len, 1)) + f('Yön', 'e2BsAngle', VP.num(fx.angle, 0), '°'), panel);
    return h + endBtns(panel);
  };
  FX.TYPES.blockShadow = {
    tool: 'blockShadowTool',
    build: (g) => E2.buildBlock(g),
    probe: (g) => src(g),
    restyle(g, fn) {
      fn([src(g)]);
      E2.buildBlock(g);
    },
    describe: () => 'Blok gölge',
    clear: (g) => unwrapSrc(g),
    clearMsg: 'Blok gölge kaldırıldı',
    bakeMsg: 'Blok gölge ayrıldı · Gölge ayrı bir şekil oldu',
    dblTap(g) {
      VP.setSelection([g]);
      VP.setTool('blockShadowTool');
    },
    fields: (g) => blockFields(g, false),
    panel: (g) => blockFields(g, true)
  };

  /* =============== shadow tools =============== */
  const handleLine = (L, a, b) => {
    const s = 1 / zoom();
    L.addChild(new paper.Path.Line({ from: a, to: b, strokeColor: acc(), strokeWidth: 1.3 * s, dashArray: [5 * s, 3 * s], insert: false }));
    L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(a.subtract(4 * s), new paper.Size(8 * s, 8 * s)), fillColor: '#ffffff', strokeColor: acc(), strokeWidth: 1.4 * s, insert: false }));
    L.addChild(new paper.Path.Circle({ center: b, radius: (VP.coarse ? 8 : 6) * s, fillColor: acc(), strokeColor: '#ffffff', strokeWidth: 1.4 * s, insert: false }));
  };
  const rafBuild = (tool, fn) => {
    if (tool._raf) return;
    tool._raf = requestAnimationFrame(() => {
      tool._raf = 0;
      fn();
      VP.drawOverlay();
    });
  };
  const stopRaf = (tool) => {
    if (tool._raf) cancelAnimationFrame(tool._raf);
    tool._raf = 0;
  };
  const flatDefault = () => ({ on: true, color: D.shColor, alpha: D.shAlpha, blur: D.shBlur, dx: VP.toPT(1.8), dy: VP.toPT(1.8) });
  T.shadowTool = {
    cursor: 'crosshair',
    op: null,
    busy() { return !!(this.op && this.op.changed); },
    down(e) {
      const hit = VP.hitItem(e.point);
      if (!hit) {
        this.op = null;
        return VP.clearSelection();
      }
      if (VP.sel.length !== 1 || VP.sel[0] !== hit) VP.setSelection([hit]);
      const fx = FX.of(hit);
      const persp = fx && fx.type === 'pshadow' ? true : fx ? false : !hit.data.shadow && D.shadowMode === 'persp';
      this.op = { it: hit, start: e.point, changed: false, persp, g: persp && fx ? hit : null, sh0: hit.data.shadow ? Object.assign({}, hit.data.shadow) : null };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (!op.changed && op.start.getDistance(e.point) * zoom() < 6) return;
      if (op.persp) {
        if (!op.g) {
          op.g = E2.makePShadow(op.it);
          VP.setSelection([op.g]);
        }
        const lp = op.g.globalToLocal(e.point);
        op.g.data.effect.hx = lp.x;
        op.g.data.effect.hy = lp.y;
        op.changed = true;
        return rafBuild(this, () => op.g.parent && E2.buildPShadow(op.g, true));
      }
      const v = e.point.subtract(op.start);
      const base = op.sh0 || flatDefault();
      VP.setShadow([op.it], Object.assign({}, base, { on: true, dx: (op.sh0 ? op.sh0.dx : 0) + v.x, dy: (op.sh0 ? op.sh0.dy : 0) + v.y }));
      op.changed = true;
      VP.drawOverlay();
    },
    up() {
      const op = this.op;
      this.op = null;
      stopRaf(this);
      if (!op) return;
      if (!op.changed) {
        if (FX.isFx(op.it) || op.it.data.shadow) return UI.schedule('prop');
        if (op.persp) VP.setSelection([E2.makePShadow(op.it)]);
        else VP.setShadow([op.it], flatDefault());
        VP.toast('Gölge eklendi · Gölgeyi sürükleyerek yönünü ayarlayın');
      } else if (op.g) E2.buildPShadow(op.g);
      VP.commit();
      UI.schedule('prop', 'dock');
    },
    cancel() {
      if (this.op && this.op.changed) VP.undoLive();
      this.op = null;
      stopRaf(this);
    },
    overlayAfter(L) {
      const it = one();
      if (!it) return;
      const fx = FX.of(it);
      if (fx && fx.type === 'pshadow') {
        const b = src(it).bounds;
        handleLine(L, it.localToGlobal(Pt(b.center.x, b.bottom)), it.localToGlobal(Pt(fx.hx, fx.hy)));
      } else if (it.data.shadow) {
        const c = it.bounds.center;
        handleLine(L, c, c.add(Pt(it.data.shadow.dx, it.data.shadow.dy)));
      }
    }
  };
  // inner and block shadow tools: tap to add, drag on the object to set the direction
  const dirTool = (type, make, setVec, getVec) => ({
    cursor: 'crosshair',
    op: null,
    busy() { return !!(this.op && this.op.changed); },
    down(e) {
      const hit = VP.hitItem(e.point);
      if (!hit) {
        this.op = null;
        return VP.clearSelection();
      }
      const fx = FX.of(hit);
      this.op = { it: hit, g: fx && fx.type === type ? hit : null, start: e.point, changed: false };
      if (VP.sel.length !== 1 || VP.sel[0] !== hit) VP.setSelection([hit]);
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (!op.changed && op.start.getDistance(e.point) * zoom() < 6) return;
      if (!op.g) {
        op.g = make(op.it);
        if (!op.g) {
          this.op = null;
          return;
        }
        VP.setSelection([op.g]);
        op.v0 = Pt(0, 0);
      }
      if (!op.v0) op.v0 = getVec(op.g.data.effect);
      if (!op.changed) op.v0 = Pt(0, 0);
      setVec(op.g.data.effect, e.point.subtract(op.start).divide(Math.sqrt(op.g.matrix.scaling.x * op.g.matrix.scaling.y) || 1));
      op.changed = true;
      rafBuild(this, () => op.g.parent && FX.rebuild(op.g));
    },
    up() {
      const op = this.op;
      this.op = null;
      stopRaf(this);
      if (!op) return;
      if (!op.changed) {
        if (op.g || FX.isFx(op.it)) return;
        const g = make(op.it);
        if (!g) return;
        VP.setSelection([g]);
        VP.toast(FX.NAMES[type] + ' eklendi · Nesne üzerinde sürükleyerek yönünü ayarlayın');
      } else FX.rebuild(op.g);
      VP.commit();
      UI.schedule('prop', 'dock');
    },
    cancel() {
      if (this.op && this.op.changed) VP.undoLive();
      this.op = null;
      stopRaf(this);
    },
    overlayAfter(L) {
      const g = fxOne(type);
      if (!g) return;
      const c = g.localToGlobal(src(g).bounds.center);
      const v = getVec(g.data.effect);
      handleLine(L, c, g.localToGlobal(src(g).bounds.center.add(v.length < 2 / zoom() ? Pt(2 / zoom(), 0) : v)));
    }
  });
  T.innerShadowTool = dirTool('innerShadow', E2.makeInner, (fx, v) => {
    fx.dx = v.x / 3;
    fx.dy = v.y / 3;
  }, (fx) => Pt(fx.dx * 3, fx.dy * 3));
  T.blockShadowTool = dirTool('blockShadow', E2.makeBlock, (fx, v) => {
    fx.len = v.length;
    fx.angle = Math.round(v.angle);
  }, (fx) => Pt(fx.len, 0).rotate(fx.angle));

  /* =============== distortion =============== */
  const rnd = (seed) => {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const eachPath = (root, fn) => {
    const walk = (it) => {
      if (it instanceof paper.PointText) {
        const cp = it.parent ? VP.textToPath(it) : null;
        if (cp) walk(cp);
        return;
      }
      if (it instanceof paper.CompoundPath) return it.children.slice().forEach(fn);
      if (it instanceof paper.Path) return fn(it);
      if (it.children) it.children.slice().forEach(walk);
    };
    walk(root);
  };
  const pushPull = (p, c, d) => {
    const segs = p.segments;
    const n = segs.length;
    if (n < 2) return;
    const S = segs.map((s) => ({ p: s.point.clone(), i: s.handleIn.clone(), o: s.handleOut.clone() }));
    S.forEach((s, i) => {
      const prev = i > 0 ? S[i - 1] : p.closed ? S[n - 1] : null;
      const next = i < n - 1 ? S[i + 1] : p.closed ? S[0] : null;
      const hin = s.i.isZero() && prev ? prev.p.subtract(s.p).divide(3) : s.i;
      const hout = s.o.isZero() && next ? next.p.subtract(s.p).divide(3) : s.o;
      const v = s.p.subtract(c);
      const dir = v.length > 1e-9 ? v.normalize() : Pt(0, 0);
      const sg = segs[i];
      sg.point = s.p.add(dir.multiply(d));
      sg.handleIn = prev ? hin.subtract(dir.multiply(d * 2.5)) : Pt(0, 0);
      sg.handleOut = next ? hout.subtract(dir.multiply(d * 2.5)) : Pt(0, 0);
    });
  };
  const zipper = (p, amp, freq, random, smooth, r) => {
    const pts = [];
    // teeth are spread evenly over the whole outline, so short corner curves do not bunch up
    const L = p.length;
    if (!(L > 0)) return;
    let n = Math.max(4, Math.round(clamp(freq, 1, 60) * 8));
    if (p.closed && n % 2) n++;
    for (let j = 0; j < n; j++) {
      const off = (L * j) / n;
      const q = p.getPointAt(off);
      const nn = p.getNormalAt(off);
      if (!q) continue;
      const a = amp * (random ? 0.3 + r() * 0.7 : 1) * (j % 2 ? 1 : -1);
      pts.push(nn ? q.add(nn.multiply(a)) : q);
    }
    if (!p.closed && p.lastSegment) pts.push(p.lastSegment.point.clone());
    if (pts.length < 2) return;
    p.segments = pts;
    if (smooth) p.smooth({ type: 'catmull-rom', factor: 0.5 });
  };
  E2.buildDistort = (g) => {
    const fx = g.data.effect;
    const r = new paper.Rectangle(fx.rect[0], fx.rect[1], fx.rect[2], fx.rect[3]);
    const c = Pt(fx.cx, fx.cy);
    const size = Math.max(r.width, r.height) || 1;
    const holder = new paper.Group({ insert: false });
    const item = holder.importJSON(fx.source);
    if (fx.mode === 'twister') {
      const Rmax = Math.max(c.getDistance(r.topLeft), c.getDistance(r.topRight), c.getDistance(r.bottomLeft), c.getDistance(r.bottomRight)) || 1;
      FX.warpTree(item, (q) => q.rotate((fx.turns * 360 * q.getDistance(c)) / Rmax, c), clamp(size / 400, 0.35, 1.5));
    } else if (fx.mode === 'zipper') {
      const rr = rnd(fx.seed || 5);
      const amp = (fx.amp / 100) * size * 0.08;
      eachPath(item, (p) => zipper(p, amp, fx.freq, fx.random, fx.smooth, rr));
    } else {
      const d = (fx.amp / 100) * (size / 2) * 0.5;
      eachPath(item, (p) => pushPull(p, c, d));
    }
    g.removeChildren();
    if (item === holder) g.addChild(holder);
    else g.addChildren(holder.removeChildren());
  };
  E2.makeDistort = (item) => {
    const fx0 = FX.of(item);
    if (fx0 && fx0.type === 'distort') return item;
    if (item instanceof paper.Raster) {
      VP.toast('Resimlere deformasyon uygulanamaz');
      return null;
    }
    if (FX.isFx(item)) {
      VP.toast('Deformasyon için önce efekti ayırın');
      return null;
    }
    const holder = new paper.Group({ insert: false });
    const work = holder.importJSON(item.exportJSON({ asString: true }));
    const r = work.bounds.clone();
    if (r.width < 0.5 && r.height < 0.5) return null;
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.insertAbove(item);
    g.data.effect = { type: 'distort', mode: D.distMode, amp: D.distAmp, freq: D.distFreq, turns: D.distTurns, smooth: false, random: false, seed: 5, cx: r.center.x, cy: r.center.y, source: work.exportJSON({ asString: true }), rect: [r.x, r.y, r.width, r.height] };
    item.remove();
    E2.buildDistort(g);
    return g;
  };
  const DMODES = [['push', 'İt / çek'], ['zipper', 'Fermuar'], ['twister', 'Burgu']];
  const distFields = (g, panel) => {
    const fx = g.data.effect;
    const f = fieldOf(panel);
    let h = panel ? '' : '<span class="pb-label">Deformasyon</span>';
    h += row(seg(DMODES, fx.mode, 'e2DMode:'), panel);
    if (fx.mode === 'push') h += row(H.range('Genlik', 'e2DAmp', Math.round(fx.amp), -100, 100) + '<span class="pb-label">+ it · − çek</span>', panel);
    if (fx.mode === 'zipper') h += row(H.range('Genlik', 'e2DAmp', Math.round(fx.amp), 0, 100) + f('Sıklık', 'e2DFreq', fx.freq, '') + H.tog('e2DRandom', 'Rastgele', fx.random, 'Genlik rastgele değişsin') + H.tog('e2DSmooth', 'Düzgün', fx.smooth, 'Sivri yerine yumuşak dalga'), panel);
    if (fx.mode === 'twister') h += row(f('Tur', 'e2DTurns', VP.num(fx.turns, 2), ''), panel);
    h += row(H.btn('e2DCenter', 'Ortala', 'Deformasyon merkezini nesnenin ortasına al') + H.btn('e2DTool', ic('distort', 'sm') + 'Sürükle', 'Deformasyon aracıyla düzenle'), panel);
    return h + endBtns(panel);
  };
  FX.TYPES.distort = {
    tool: 'distortTool',
    build: (g) => E2.buildDistort(g),
    probe: (g) => VP.leafItems(g.children)[0] || g,
    restyle(g, fn) {
      const holder = new paper.Group({ insert: false });
      const item = holder.importJSON(g.data.effect.source);
      fn([item]);
      g.data.effect.source = item.exportJSON({ asString: true });
      E2.buildDistort(g);
    },
    describe: (g) => 'Deformasyon: ' + DMODES.find((m) => m[0] === g.data.effect.mode)[1],
    clear(g) {
      const holder = new paper.Group({ insert: false });
      const item = holder.importJSON(g.data.effect.source);
      if (item !== holder) item.remove();
      item.transform(g.matrix);
      item.insertAbove(g);
      g.remove();
      return [item];
    },
    clearMsg: 'Deformasyon kaldırıldı',
    dblTap(g) {
      VP.setSelection([g]);
      VP.setTool('distortTool');
    },
    fields: (g) => distFields(g, false),
    panel: (g) => distFields(g, true)
  };
  T.distortTool = {
    cursor: 'crosshair',
    op: null,
    busy() { return !!(this.op && this.op.changed); },
    down(e) {
      const cur = fxOne('distort');
      if (cur) {
        const fx = cur.data.effect;
        if (cur.localToGlobal(Pt(fx.cx, fx.cy)).getDistance(e.point) <= tolPx()) {
          this.op = { type: 'center', g: cur, changed: false, start: e.point };
          return;
        }
      }
      const hit = VP.hitItem(e.point);
      if (!hit) {
        this.op = null;
        return VP.clearSelection();
      }
      if (VP.sel.length !== 1 || VP.sel[0] !== hit) VP.setSelection([hit]);
      const fx = FX.of(hit);
      this.op = { type: 'amp', it: hit, g: fx && fx.type === 'distort' ? hit : null, start: e.point, changed: false };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (!op.changed && op.start.getDistance(e.point) * zoom() < 6) return;
      if (!op.g) {
        op.g = E2.makeDistort(op.it);
        if (!op.g) {
          this.op = null;
          return;
        }
        VP.setSelection([op.g]);
      }
      const fx = op.g.data.effect;
      if (!op.changed) {
        op.amp0 = fx.amp;
        op.turns0 = fx.turns;
        op.last = null;
        op.sweep = 0;
      }
      const lp = op.g.globalToLocal(e.point);
      if (op.type === 'center') {
        fx.cx = lp.x;
        fx.cy = lp.y;
      } else {
        const ls = op.g.globalToLocal(op.start);
        const half = (Math.max(fx.rect[2], fx.rect[3]) || 1) / 2;
        if (fx.mode === 'twister') {
          const c = Pt(fx.cx, fx.cy);
          const a = lp.subtract(c).angle;
          if (op.last != null) {
            let da = a - op.last;
            if (da > 180) da -= 360;
            if (da < -180) da += 360;
            op.sweep += da;
          }
          op.last = a;
          fx.turns = Math.round((op.turns0 + op.sweep / 360) * 100) / 100;
        } else fx.amp = Math.round(clamp(op.amp0 + ((lp.x - ls.x) / half) * 100, fx.mode === 'push' ? -100 : 0, 100));
      }
      op.changed = true;
      rafBuild(this, () => op.g.parent && E2.buildDistort(op.g));
    },
    up() {
      const op = this.op;
      this.op = null;
      stopRaf(this);
      if (!op) return;
      if (!op.changed) {
        if (op.g || op.type === 'center' || FX.isFx(op.it)) return;
        const g = E2.makeDistort(op.it);
        if (!g) return;
        VP.setSelection([g]);
        VP.toast('Deformasyon uygulandı · Sağa-sola sürükleyerek gücünü, ◆ ile merkezini ayarlayın');
      } else E2.buildDistort(op.g);
      VP.commit();
      UI.schedule('prop', 'dock');
    },
    cancel() {
      if (this.op && this.op.changed) VP.undoLive();
      this.op = null;
      stopRaf(this);
    },
    overlayAfter(L) {
      const g = fxOne('distort');
      if (!g) return;
      const fx = g.data.effect;
      const s = 1 / zoom();
      const c = g.localToGlobal(Pt(fx.cx, fx.cy));
      const r = (VP.coarse ? 10 : 7) * s;
      L.addChild(new paper.Path({ segments: [c.add([0, -r]), c.add([r, 0]), c.add([0, r]), c.add([-r, 0])], closed: true, fillColor: '#ffffff', strokeColor: acc(), strokeWidth: 1.5 * s, insert: false }));
      L.addChild(new paper.Path.Rectangle({ rectangle: g.bounds, strokeColor: acc(), strokeWidth: s, opacity: 0.5, insert: false }));
    }
  };

  /* =============== extrude: the six types =============== */
  const K6 = {
    smallBack: { l: 'Küçük arka', mode: 'perspective', big: false, front: false },
    smallFront: { l: 'Küçük ön', mode: 'perspective', big: false, front: true },
    bigBack: { l: 'Büyük arka', mode: 'perspective', big: true, front: false },
    bigFront: { l: 'Büyük ön', mode: 'perspective', big: true, front: true },
    backParallel: { l: 'Arka paralel', mode: 'parallel', big: false, front: false },
    frontParallel: { l: 'Ön paralel', mode: 'parallel', big: false, front: true }
  };
  E2.K6 = K6;
  const norm6 = (fx) => {
    if (!K6[fx.kind6]) fx.kind6 = FX._newKind6 || (fx.mode === 'parallel' ? 'backParallel' : 'smallBack');
    const k = K6[fx.kind6];
    fx.mode = k.mode;
    fx.big = k.big;
    fx.front = k.front;
  };
  const eb0 = FX.extrudeBack;
  FX.extrudeBack = (fx) => eb0(fx.big && fx.mode !== 'parallel' ? Object.assign({}, fx, { depth: -fx.depth * 1.6 }) : fx);
  const be0 = FX.buildExtrude;
  FX.buildExtrude = (g) => {
    const fx = g.data.effect;
    norm6(fx);
    be0(g);
    if (!fx.front) return;
    const s = FX.contourSource(g);
    const side = g.children.find((c) => c.data.extrudeSide);
    if (!s || !side) return;
    side.insertAbove(s);
    const face = s.clone({ insert: false });
    delete face.data.effectSrc;
    face.data.extrudeFace = true;
    let m;
    if (fx.mode === 'parallel') m = new paper.Matrix().translate(fx.offset[0], fx.offset[1]);
    else {
      const f = fx.big ? 1 + fx.depth * 1.6 : 1 - fx.depth;
      m = new paper.Matrix().translate(fx.vp[0], fx.vp[1]).scale(f).translate(-fx.vp[0], -fx.vp[1]);
    }
    face.transform(m);
    face.insertAbove(side);
  };
  const ex0 = FX.extrude;
  FX.extrude = (item) => {
    FX._newKind6 = D.extrudeKind;
    try {
      return ex0(item);
    } finally {
      FX._newKind6 = null;
    }
  };
  const kindSel = (cur) => select('Tür', 'e2ExtKind', Object.keys(K6).map((k) => [k, K6[k].l]), cur);
  const extFields = (g, panel) => {
    const fx = g.data.effect;
    norm6(fx);
    let h = panel ? '' : '<span class="pb-label">Derinlik</span>';
    h += row(kindSel(fx.kind6) + (fx.mode === 'parallel' ? '' : H.range('Derinlik', 'fxDepth', Math.round(fx.depth * 100), 3, 95)), panel);
    h += row(H.tog('fxShade', 'Gölgeli', fx.shade, 'Yanlara ışık-gölge geçişi') + H.colorField('Yan', 'fxSide', fx.side || VP.hex(new paper.Color(0.45, 0.45, 0.45))) + (fx.side ? H.btn('fxSideAuto', 'Otomatik', 'Yan rengi nesnenin renginden türet') : '') + H.btn('fxEdit', ic('extrude', 'sm') + (fx.mode === 'parallel' ? 'Derinliği sürükle' : 'Kaçış noktası'), 'Tutamacı sürükle'), panel);
    return h + endBtns(panel);
  };
  FX.TYPES.extrude = {
    tool: 'extrudeTool',
    build: (g) => FX.buildExtrude(g),
    probe: (g) => FX.contourSource(g),
    restyle(g, fn) {
      fn([FX.contourSource(g)]);
      FX.buildExtrude(g);
    },
    describe: (g) => {
      norm6(g.data.effect);
      return 'Derinlik (' + K6[g.data.effect.kind6].l.toLowerCase() + ')';
    },
    fields: (g) => extFields(g, false),
    panel: (g) => extFields(g, true)
  };

  /* =============== envelope modes =============== */
  const EMODES = [['straight', 'Düz çizgi'], ['single', 'Tek yay'], ['double', 'Çift yay'], ['free', 'Serbest']];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const mid = (a, b) => lerp(a, b, 0.5);
  const cubic = (a, b, c, d, t) => {
    const m = 1 - t;
    return [m * m * m * a[0] + 3 * m * m * t * b[0] + 3 * m * t * t * c[0] + t * t * t * d[0], m * m * m * a[1] + 3 * m * m * t * b[1] + 3 * m * t * t * c[1] + t * t * t * d[1]];
  };
  const quadPt = (A, M, B, t) => {
    const cx = 2 * M[0] - (A[0] + B[0]) / 2;
    const cy = 2 * M[1] - (A[1] + B[1]) / 2;
    const m = 1 - t;
    return [m * m * A[0] + 2 * t * m * cx + t * t * B[0], m * m * A[1] + 2 * t * m * cy + t * t * B[1]];
  };
  // edge of the envelope from corner A to corner B (through mid key M, or handles h1/h2 when free)
  const EDGES = { t: ['tl', 'tm', 'tr', 't1', 't2'], r: ['tr', 'rm', 'br', 'r1', 'r2'], b: ['bl', 'bm', 'br', 'b1', 'b2'], l: ['tl', 'lm', 'bl', 'l1', 'l2'] };
  const edgeFn = (n, mode, e) => {
    const [a, m, b, h1, h2] = EDGES[e];
    const A0 = n[a];
    const B0 = n[b];
    if (mode === 'straight') return (t) => lerp(A0, B0, t);
    if (mode === 'free' && n[h1]) return (t) => cubic(A0, n[h1], n[h2], B0, t);
    if (mode === 'double') {
      const md = mid(A0, B0);
      const dx = n[m][0] - md[0];
      const dy = n[m][1] - md[1];
      return (t) => {
        const p = lerp(A0, B0, t);
        const s = Math.sin(2 * Math.PI * t);
        return [p[0] + dx * s, p[1] + dy * s];
      };
    }
    return (t) => quadPt(A0, n[m], B0, t);
  };
  const coons = (n, mode) => {
    const Tt = edgeFn(n, mode, 't');
    const Bb = edgeFn(n, mode, 'b');
    const Ll = edgeFn(n, mode, 'l');
    const Rr = edgeFn(n, mode, 'r');
    return (u, v) => {
      const t = Tt(u);
      const b = Bb(u);
      const l = Ll(v);
      const r = Rr(v);
      const k = (i) => (1 - v) * t[i] + v * b[i] + (1 - u) * l[i] + u * r[i] - ((1 - u) * (1 - v) * n.tl[i] + u * (1 - v) * n.tr[i] + (1 - u) * v * n.bl[i] + u * v * n.br[i]);
      return [k(0), k(1)];
    };
  };
  const ensureFree = (n) => {
    Object.keys(EDGES).forEach((e) => {
      const [a, m, b, h1, h2] = EDGES[e];
      if (n[h1]) return;
      const Q = [2 * n[m][0] - (n[a][0] + n[b][0]) / 2, 2 * n[m][1] - (n[a][1] + n[b][1]) / 2];
      n[h1] = lerp(n[a], Q, 2 / 3);
      n[h2] = lerp(n[b], Q, 2 / 3);
    });
  };
  const em0 = FX.envMapper;
  FX.envMapper = (n) => {
    const fx = FX._envFx;
    const mode = fx && fx.envMode;
    return !mode || mode === 'single' ? em0(n) : coons(n, mode);
  };
  const bw0 = FX.buildWarp;
  FX.buildWarp = (g) => {
    const fx = g.data.effect;
    if (fx.type === 'envelope' && !fx.envMode && FX._newEnvMode) fx.envMode = FX._newEnvMode;
    if (fx.envMode === 'free') ensureFree(fx.nodes);
    if (fx.envMode === 'straight') ['t', 'r', 'b', 'l'].forEach((e) => (fx.nodes[EDGES[e][1]] = mid(fx.nodes[EDGES[e][0]], fx.nodes[EDGES[e][2]])));
    FX._envFx = fx.type === 'envelope' ? fx : null;
    try {
      bw0(g);
    } finally {
      FX._envFx = null;
    }
  };
  const aw0 = FX.addWarp;
  FX.addWarp = (item, type) => {
    FX._newEnvMode = type === 'envelope' ? D.envMode : null;
    try {
      return aw0(item, type);
    } finally {
      FX._newEnvMode = null;
    }
  };
  const ep0 = FX.envPreset;
  FX.envPreset = (g, name) => {
    const fx = g.data.effect;
    const mode = fx.envMode;
    // presets are single-arc shapes; free mode rebuilds its handles from them
    if (mode === 'free' || mode === 'straight') fx.envMode = 'single';
    ['t1', 't2', 'r1', 'r2', 'b1', 'b2', 'l1', 'l2'].forEach((k) => delete fx.nodes[k]);
    ep0(g, name);
    if (mode && mode !== fx.envMode) {
      fx.envMode = mode;
      FX.buildWarp(g);
    }
  };
  E2.setEnvMode = (g, mode) => {
    const fx = g.data.effect;
    const n = fx.nodes;
    if (fx.envMode === 'free' && mode !== 'free') {
      // fold the handles back to a mid point on the curve
      Object.keys(EDGES).forEach((e) => {
        const [a, m, b, h1, h2] = EDGES[e];
        if (n[h1]) n[m] = cubic(n[a], n[h1], n[h2], n[b], 0.5);
      });
    }
    ['t1', 't2', 'r1', 'r2', 'b1', 'b2', 'l1', 'l2'].forEach((k) => mode !== 'free' && delete n[k]);
    fx.envMode = mode;
    FX.buildWarp(g);
  };
  // envelope tool: mode-aware handles
  const ET = T.envelopeTool;
  const CORNERS = ['tl', 'tr', 'br', 'bl'];
  const keyPos = (fx, k) => {
    const n = fx.nodes;
    const mode = fx.envMode || 'single';
    if (mode === 'double' && /m$/.test(k)) {
      const e = { tm: 't', rm: 'r', bm: 'b', lm: 'l' }[k];
      return edgeFn(n, 'double', e)(0.25);
    }
    return n[k];
  };
  const keysOf = (fx) => {
    const mode = fx.envMode || 'single';
    if (mode === 'straight') return CORNERS;
    if (mode === 'free') return CORNERS.concat(['t1', 't2', 'r1', 'r2', 'b1', 'b2', 'l1', 'l2']);
    return CORNERS.concat(['tm', 'rm', 'bm', 'lm']);
  };
  ET.handleAt = function (pt) {
    const g = this.target();
    if (!g) return null;
    const fx = g.data.effect;
    let best = null;
    let bd = tolPx();
    keysOf(fx).forEach((k) => {
      const p = keyPos(fx, k);
      if (!p) return;
      const d = g.localToGlobal(Pt(p[0], p[1])).getDistance(pt);
      if (d <= bd) {
        bd = d;
        best = k;
      }
    });
    return best;
  };
  ET.move = function (e) {
    if (!this.drag) return;
    const g = this.target();
    if (!g) return;
    const fx = g.data.effect;
    const n = fx.nodes;
    const mode = fx.envMode || 'single';
    const lp = g.globalToLocal(VP.snapPt(e.point));
    const k = this.drag.key;
    if (mode === 'double' && /m$/.test(k)) {
      const e2 = { tm: 't', rm: 'r', bm: 'b', lm: 'l' }[k];
      const [a, , b] = EDGES[e2];
      const q = lerp(n[a], n[b], 0.25);
      const md = mid(n[a], n[b]);
      n[k] = [md[0] + lp.x - q[0], md[1] + lp.y - q[1]];
    } else {
      const old = n[k].slice();
      n[k] = [lp.x, lp.y];
      if (mode === 'free' && CORNERS.includes(k)) {
        const dx = lp.x - old[0];
        const dy = lp.y - old[1];
        const adj = { tl: ['t1', 'l1'], tr: ['t2', 'r1'], br: ['r2', 'b2'], bl: ['b1', 'l2'] }[k];
        adj.forEach((h) => n[h] && (n[h] = [n[h][0] + dx, n[h][1] + dy]));
      }
    }
    this.drag.changed = true;
    rafBuild(this, () => {
      if (g.parent) FX.buildWarp(g);
      VP.emit('transform');
    });
  };
  const ov0 = ET.overlay;
  ET.overlay = function (L) {
    const g = this.target();
    if (!g) return ov0.call(this, L);
    const fx = g.data.effect;
    const mode = fx.envMode || 'single';
    const n = fx.nodes;
    const s = 1 / zoom();
    const a = acc();
    const G = (p) => g.localToGlobal(Pt(p[0], p[1]));
    const outline = new paper.Path({ strokeColor: a, strokeWidth: 1.2 * s, dashArray: [5 * s, 3 * s], closed: true, insert: false });
    const edge = (e, rev) => {
      const f = edgeFn(n, mode, e);
      for (let i = 0; i < 24; i++) outline.add(G(f(rev ? 1 - i / 24 : i / 24)));
    };
    edge('t');
    edge('r');
    edge('b', true);
    edge('l', true);
    L.addChild(outline);
    const hs = (VP.coarse ? 13 : 9) * s;
    if (mode === 'free') {
      [['tl', 't1'], ['tr', 't2'], ['tr', 'r1'], ['br', 'r2'], ['bl', 'b1'], ['br', 'b2'], ['tl', 'l1'], ['bl', 'l2']].forEach(([c, h]) => n[h] && L.addChild(new paper.Path.Line({ from: G(n[c]), to: G(n[h]), strokeColor: a, strokeWidth: s, insert: false })));
    }
    keysOf(fx).forEach((k) => {
      const p = G(keyPos(fx, k));
      const corner = CORNERS.includes(k);
      const shape = corner ? new paper.Path.Rectangle({ rectangle: new paper.Rectangle(p.subtract(hs / 2), new paper.Size(hs, hs)), insert: false }) : new paper.Path.Circle({ center: p, radius: hs * (mode === 'free' ? 0.42 : 0.55), insert: false });
      shape.fillColor = this.drag && this.drag.key === k ? a : new paper.Color('#ffffff');
      shape.strokeColor = a;
      shape.strokeWidth = 1.4 * s;
      L.addChild(shape);
    });
    return true;
  };

  /* =============== blend along a path, rotation, colour direction =============== */
  FX.blendEnds = (g) => {
    const kids = g.children.filter((c) => !c.data.blendSteps && !c.data.blendPath);
    return [kids[0], kids[kids.length - 1]];
  };
  const solidC = (c) => (!c ? null : c.type === 'gradient' ? c.gradient.stops[0].color : c);
  const hsbLerp = (a, b, t, dir) => {
    const A0 = a.convert('hsb');
    const B0 = b.convert('hsb');
    let h0 = A0.hue;
    let h1 = B0.hue;
    if (dir === 'cw' && h1 < h0) h1 += 360;
    if (dir === 'ccw' && h1 > h0) h1 -= 360;
    const c = new paper.Color({ hue: (((h0 + (h1 - h0) * t) % 360) + 360) % 360, saturation: A0.saturation + (B0.saturation - A0.saturation) * t, brightness: A0.brightness + (B0.brightness - A0.brightness) * t });
    c.alpha = a.alpha + (b.alpha - a.alpha) * t;
    return c;
  };
  const bb0 = FX.buildBlend;
  FX.buildBlend = (g) => {
    const fx = g.data.effect;
    const path = g.children.find((c) => c.data.blendPath);
    const [a, b] = FX.blendEnds(g);
    if (path && fx.fullPath && a && b && path.length > 0) {
      a.translate(path.getPointAt(0).subtract(a.bounds.center));
      b.translate(path.getPointAt(path.length).subtract(b.bounds.center));
    }
    bb0(g);
    const sg = g.children.find((c) => c.data.blendSteps);
    if (!sg || !a || !b) return;
    const n = sg.children.length;
    const e = Math.pow(2, -(fx.accel || 0) * 1.6);
    const ca = solidC(a.fillColor);
    const cb = solidC(b.fillColor);
    sg.children.forEach((s, i) => {
      const t = Math.pow((i + 1) / (n + 1), e);
      if (fx.colorDir && fx.colorDir !== 'direct' && ca && cb) s.fillColor = hsbLerp(ca, cb, t, fx.colorDir);
      if (fx.rot) s.rotate(fx.rot * t, s.bounds.center);
      if (path && path.length > 0) {
        const L = path.length * t;
        const target = path.getPointAt(L);
        s.translate(target.subtract(s.bounds.center));
        if (fx.alongRotate) {
          const tg = path.getTangentAt(L);
          if (tg) s.rotate(tg.angle, target);
        }
      }
    });
  };
  const clearFlags = (items) => items.forEach((it) => it && it.data && delete it.data.blendPath);
  const fc0 = FX.clear;
  FX.clear = (g) => {
    fc0(g);
    clearFlags(VP.sel);
  };
  const bk0 = FX.bake;
  FX.bake = (g) => {
    const r = bk0(g);
    if (g && g.children) clearFlags(g.children);
    return r;
  };
  E2.blendPath = (g) => {
    VP.objops.pickOnce('Harmanlamanın izleyeceği eğriye dokunun', (t) => {
      if (!t || t === g || FX.isFx(t) || !(t instanceof paper.Path)) return VP.toast('Bir eğriye (yol) dokunun');
      t.transform(g.matrix.inverted());
      t.data.blendPath = true;
      g.insertChild(0, t);
      g.data.effect.fullPath = true;
      FX.rebuild(g);
      VP.setSelection([g]);
      VP.commit();
      VP.toast('Harmanlama yola yerleştirildi');
    });
  };
  E2.blendDetach = (g) => {
    const p = g.children.find((c) => c.data.blendPath);
    if (!p) return;
    p.transform(g.matrix);
    delete p.data.blendPath;
    p.insertAbove(g);
    FX.rebuild(g);
    VP.commit();
  };
  const blendExtras = (g, panel) => {
    const fx = g.data.effect;
    const f = fieldOf(panel);
    const hasPath = g.children.some((c) => c.data.blendPath);
    let h = row(seg([['direct', 'Doğrudan'], ['cw', 'Saat yönü'], ['ccw', 'Ters yön']], fx.colorDir || 'direct', 'e2BCol:') + f('Döndür', 'e2BRot', VP.num(fx.rot || 0, 0), '°'), panel);
    h += row(hasPath
      ? H.tog('e2BFull', 'Tüm yol', !!fx.fullPath, 'Uçları yolun başına ve sonuna taşı') + H.tog('e2BAlong', 'Yola göre döndür', !!fx.alongRotate, 'Ara nesneler yolun yönüne dönsün') + H.btn('e2BDetach', 'Yoldan ayır', 'Yolu harmanlamadan çıkar')
      : H.btn('e2BPath', ic('textpath', 'sm') + 'Yol ata', 'Harmanlamayı bir eğri boyunca yerleştir'), panel);
    return h;
  };

  /* =============== more lens types =============== */
  Object.assign(FX.LENS, {
    transparency: { label: 'Saydamlık', rate: 0.5, min: 0, max: 1, scale: 100, rateLabel: 'Saydamlık', unit: '%', color: true },
    colorMap: { label: 'Özel renk eşlemi', color: true }
  });
  const mapC = (c, fn) => {
    if (!c) return c;
    if (c.type === 'gradient') return new paper.Color({ gradient: { stops: c.gradient.stops.map((s) => [fn(s.color.convert('rgb')), s.offset]), radial: c.gradient.radial }, origin: c.origin, destination: c.destination });
    return fn(c.convert('rgb'));
  };
  const bl0 = FX.buildLens;
  FX.buildLens = (g) => {
    bl0(g);
    const fx = g.data.effect;
    if (fx.kind !== 'transparency' && fx.kind !== 'colorMap') return;
    const clip = g.children.find((c) => c.data.lensContent);
    const s = FX.lensSource(g);
    if (!clip || !s) return;
    if (fx.kind === 'transparency') {
      const r = new paper.Path.Rectangle({ rectangle: s.bounds.expand(2), fillColor: fx.color || '#ffed00', insert: false });
      r.opacity = 1 - clamp(fx.rate, 0, 1);
      clip.addChild(r);
      return;
    }
    const c0 = new paper.Color(fx.color || '#1d1d5b');
    const c1 = new paper.Color(fx.color2 || '#ffe14d');
    const fn = (c) => {
      const l = 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue;
      const m = fx.mapMode === 'cw' || fx.mapMode === 'ccw' ? hsbLerp(c0, c1, l, fx.mapMode) : new paper.Color(c0.red + (c1.red - c0.red) * l, c0.green + (c1.green - c0.green) * l, c0.blue + (c1.blue - c0.blue) * l);
      m.alpha = c.alpha;
      return m;
    };
    const walk = (it) => {
      if (it.children && !(it instanceof paper.CompoundPath)) return it.children.forEach(walk);
      if (it.clipMask || it instanceof paper.Raster) return;
      it.fillColor = mapC(it.fillColor, fn);
      it.strokeColor = mapC(it.strokeColor, fn);
    };
    clip.children.slice(1).forEach(walk);
  };
  const lensExtras = (g, panel) => {
    const fx = g.data.effect;
    if (fx.kind !== 'colorMap') return '';
    return row(H.colorField('Bitiş rengi', 'e2LensC2', fx.color2 || '#ffe14d') + seg([['direct', 'Doğrudan'], ['cw', 'İleri gökkuşağı'], ['ccw', 'Ters gökkuşağı']], fx.mapMode || 'direct', 'e2LMap:'), panel);
  };

  /* =============== property bar and docker =============== */
  const shadowBar = () => {
    const it = one();
    const fx = FX.of(it);
    if (fx && fx.type === 'pshadow') return '<span class="pb-title">Gölge</span>' + seg([['flat', 'Düz'], ['persp', 'Perspektif']], 'persp', 'e2ShMode:') + shadowFields(it, false);
    let h = '<span class="pb-title">Gölge</span>' + seg([['flat', 'Düz'], ['persp', 'Perspektif']], it && it.data.shadow ? 'flat' : D.shadowMode, 'e2ShMode:');
    const sh = it && it.data.shadow ? VP.getShadow(it) : { color: D.shColor, alpha: D.shAlpha, blur: D.shBlur, dx: VP.toPT(1.8), dy: VP.toPT(1.8) };
    h += H.colorField('Renk', 'e2ShColor', sh.color) + H.range('Opaklık', 'e2ShAlpha', Math.round(sh.alpha * 100), 0, 100) + H.field('Yumuşaklık', 'e2ShBlur', mm(sh.blur, 1));
    if (it && it.data.shadow) h += H.field('X', 'e2ShDx', mm(sh.dx, 1)) + H.field('Y', 'e2ShDy', mm(sh.dy, 1));
    else if (D.shadowMode === 'persp') h += H.range('Solma', 'e2ShFade', Math.round(D.shFade * 100), 0, 100);
    h += H.btn('e2ShPresets', 'Hazır ▾', 'Hazır gölgeler');
    if (it && it.data.shadow) h += H.btn('e2ShOff', 'Kaldır', 'Gölgeyi kaldır');
    return h + (it ? '' : '<span class="pb-label">Bir nesneye dokunun veya üzerinde sürükleyin</span>');
  };
  const pb0 = VP.tx.propbar;
  VP.tx.propbar = () => {
    const id = VP.toolId;
    const it = one();
    const fx = FX.of(it);
    if (id === 'shadowTool') return shadowBar();
    if (id === 'innerShadowTool') return fx && fx.type === 'innerShadow' ? '<span class="pb-title">İç gölge</span>' + innerFields(it, false) : '<span class="pb-title">İç gölge</span>' + H.colorField('Renk', 'e2IsColor', D.ishColor) + H.range('Opaklık', 'e2IsAlpha', Math.round(D.ishAlpha * 100), 0, 100) + H.field('Yumuşaklık', 'e2IsBlur', mm(D.ishBlur, 1)) + '<span class="pb-label">Kapalı bir şekle veya metne dokunun · Üzerinde sürükleyin: yön</span>';
    if (id === 'blockShadowTool') return fx && fx.type === 'blockShadow' ? '<span class="pb-title">Blok gölge</span>' + blockFields(it, false) : '<span class="pb-title">Blok gölge</span>' + H.colorField('Renk', 'e2BsColor', D.bsColor) + H.field('Derinlik', 'e2BsLen', mm(D.bsLen, 1)) + H.field('Yön', 'e2BsAngle', VP.num(D.bsAngle, 0), '°') + '<span class="pb-label">Bir nesneye dokunun · Üzerinde sürükleyin: yön ve derinlik</span>';
    if (id === 'distortTool') {
      if (fx && fx.type === 'distort') return '<span class="pb-title">Deformasyon</span>' + distFields(it, false);
      return '<span class="pb-title">Deformasyon</span>' + seg(DMODES, D.distMode, 'e2DMode:') + '<span class="pb-label">Bir nesneye dokunun veya üzerinde sağa-sola sürükleyin</span>';
    }
    if (id === 'extrudeTool' && !VP.sel.length) return '<span class="pb-title">Derinlik</span>' + kindSel(D.extrudeKind) + (K6[D.extrudeKind].mode === 'parallel' ? '' : H.range('Derinlik', 'fxDepth', Math.round(D.extrudeDepth * 100), 3, 95)) + H.tog('fxShade', 'Gölgeli', D.extrudeShade, 'Yanlara ışık-gölge geçişi') + '<span class="pb-label">Bir şekle dokunun</span>';
    if (id === 'envelopeTool' && !VP.sel.length) return '<span class="pb-title">Zarf</span>' + seg(EMODES, D.envMode, 'e2Env:') + '<span class="pb-label">Bükmek istediğiniz nesneye dokunun · Düğümleri sürükleyin</span>';
    return pb0();
  };
  UI.selExtras = UI.selExtras || [];
  UI.selExtras.push((s, it) => {
    const fx = FX.of(it);
    if (!fx) return '';
    if (fx.type === 'envelope') return H.sep + seg(EMODES, fx.envMode || 'single', 'e2Env:');
    if (fx.type === 'blend') return H.sep + blendExtras(it, false);
    if (fx.type === 'lens') return lensExtras(it, false) ? H.sep + lensExtras(it, false) : '';
    return '';
  });
  UI.propsExtras = UI.propsExtras || [];
  UI.propsExtras.push((items, it) => {
    if (items.length !== 1) return '';
    const fx = FX.of(it);
    if (!fx) return '';
    if (fx.type === 'envelope') return '<div class="sec"><div class="sec-h"><h3>Zarf modu</h3></div><div class="row">' + seg(EMODES, fx.envMode || 'single', 'e2Env:') + '</div></div>';
    if (fx.type === 'blend') return '<div class="sec"><div class="sec-h"><h3>Harmanlama seçenekleri</h3></div>' + blendExtras(it, true) + '</div>';
    if (fx.type === 'lens' && fx.kind === 'colorMap') return '<div class="sec"><div class="sec-h"><h3>Renk eşlemi</h3></div>' + lensExtras(it, true) + '</div>';
    return '';
  });

  const shPresets = (el) => {
    const items = [['flatBR', 'Düz · sağ alt'], ['flatTL', 'Düz · sol üst'], ['small', 'Düz · küçük'], ['glow', 'Işıma'], ['persL', 'Perspektif · sola'], ['persR', 'Perspektif · sağa'], ['persFront', 'Perspektif · öne']];
    UI.popover(el, items.map(([k, l]) => '<button class="pop-item" data-pick="' + k + '">' + esc(l) + '</button>').join(''), (k) => {
      let it = one();
      if (!it) return VP.toast('Önce bir nesne seçin');
      const fx = FX.of(it);
      if (/^pers/.test(k)) {
        if (fx && fx.type !== 'pshadow') return VP.toast('Perspektif gölge için önce efekti ayırın');
        const g = E2.makePShadow(it);
        const b = src(g).bounds;
        const hh = b.height;
        Object.assign(g.data.effect, k === 'persL' ? { hx: b.center.x - hh * 0.7, hy: b.bottom - hh * 0.4 } : k === 'persR' ? { hx: b.center.x + hh * 0.7, hy: b.bottom - hh * 0.4 } : { hx: b.center.x + hh * 0.2, hy: b.bottom + hh * 0.35 });
        E2.buildPShadow(g);
        VP.setSelection([g]);
      } else {
        if (fx && fx.type === 'pshadow') it = unwrapSrc(it)[0];
        else if (fx) return VP.toast('Bu efektli nesneye düz gölge için Özellikler › Gölge kullanın');
        const m = VP.toPT;
        const spec = { flatBR: { dx: m(2), dy: m(2), blur: m(2.5), alpha: 0.45 }, flatTL: { dx: m(-2), dy: m(-2), blur: m(2.5), alpha: 0.45 }, small: { dx: m(0.8), dy: m(0.8), blur: m(1), alpha: 0.5 }, glow: { dx: 0, dy: 0, blur: m(6), alpha: 0.75 } }[k];
        VP.setShadow([it], Object.assign({ on: true, color: k === 'glow' && VP.colors.accent.startsWith('#') ? VP.colors.accent : D.shColor }, spec));
        VP.setSelection([it]);
      }
      VP.commit();
      UI.schedule('prop', 'dock');
    });
  };

  E2.propField = (name, raw, el) => {
    const v = VP.parseNum(raw);
    const hex = UI.normHex(raw);
    const it = one();
    const fx = FX.of(it);
    const rebuild = (g) => {
      FX.rebuild(g);
      if (live(el)) VP.commit();
      VP.drawOverlay();
    };
    // shadow
    if (/^e2Sh/.test(name)) {
      const k = name.slice(4);
      if (k === 'Alpha' || k === 'Fade') out(el, Math.round(v));
      if (fx && fx.type === 'pshadow') {
        const f = fx;
        if (k === 'Color' && hex) f.color = hex;
        if (k === 'Alpha' && isFinite(v)) f.alpha = clamp(v / 100, 0, 1);
        if (k === 'Blur' && v >= 0) f.blur = VP.toPT(v);
        if (k === 'Fade' && isFinite(v)) f.fade = clamp(v / 100, 0, 1);
        E2.buildPShadow(it, !live(el));
        if (live(el)) VP.commit();
        return true;
      }
      if (it && it.data.shadow && !fx) {
        const sh = VP.getShadow(it);
        if (k === 'Color' && hex) sh.color = hex;
        if (k === 'Alpha' && isFinite(v)) sh.alpha = clamp(v / 100, 0, 1);
        if (k === 'Blur' && v >= 0) sh.blur = VP.toPT(v);
        if (k === 'Dx' && isFinite(v)) sh.dx = VP.toPT(v);
        if (k === 'Dy' && isFinite(v)) sh.dy = VP.toPT(v);
        VP.setShadow([it], sh);
        if (live(el)) VP.commit();
        return true;
      }
      if (k === 'Color' && hex) D.shColor = hex;
      if (k === 'Alpha' && isFinite(v)) D.shAlpha = clamp(v / 100, 0, 1);
      if (k === 'Blur' && v >= 0) D.shBlur = VP.toPT(v);
      if (k === 'Fade' && isFinite(v)) D.shFade = clamp(v / 100, 0, 1);
      return true;
    }
    if (/^e2Is/.test(name)) {
      const k = name.slice(4);
      const g = fx && fx.type === 'innerShadow' ? it : null;
      const f = g ? g.data.effect : null;
      if (k === 'Alpha') out(el, Math.round(v));
      const set = (key, val) => (f ? (f[key] = val) : (D['ish' + key[0].toUpperCase() + key.slice(1)] = val));
      if (k === 'Color' && hex) set('color', hex);
      if (k === 'Alpha' && isFinite(v)) set('alpha', clamp(v / 100, 0, 1));
      if (k === 'Blur' && v >= 0) set('blur', VP.toPT(v));
      if (k === 'Dx' && isFinite(v)) set('dx', VP.toPT(v));
      if (k === 'Dy' && isFinite(v)) set('dy', VP.toPT(v));
      if (k === 'Blend' && f) f.blend = raw;
      if (g) rebuild(g);
      return true;
    }
    if (/^e2Bs/.test(name)) {
      const k = name.slice(4);
      const g = fx && fx.type === 'blockShadow' ? it : null;
      const f = g ? g.data.effect : null;
      if (k === 'Color' && hex) f ? (f.color = hex) : (D.bsColor = hex);
      if (k === 'Len' && v >= 0) f ? (f.len = VP.toPT(v)) : (D.bsLen = VP.toPT(v));
      if (k === 'Angle' && isFinite(v)) f ? (f.angle = VP.norm(v)) : (D.bsAngle = VP.norm(v));
      if (g) rebuild(g);
      return true;
    }
    if (/^e2D/.test(name)) {
      const g = fx && fx.type === 'distort' ? it : null;
      if (!g) return true;
      const f = g.data.effect;
      if (name === 'e2DAmp' && isFinite(v)) {
        f.amp = clamp(v, f.mode === 'push' ? -100 : 0, 100);
        out(el, Math.round(v));
      }
      if (name === 'e2DFreq' && v >= 1) f.freq = clamp(Math.round(v), 1, 60);
      if (name === 'e2DTurns' && isFinite(v)) f.turns = clamp(v, -20, 20);
      rebuild(g);
      return true;
    }
    if (name === 'e2ExtKind' && K6[raw]) {
      const g = fxOne('extrude');
      if (g) {
        g.data.effect.kind6 = raw;
        FX.buildExtrude(g);
        VP.commit();
      } else D.extrudeKind = raw;
      return true;
    }
    if (name === 'e2BRot' && isFinite(v)) {
      const g = fxOne('blend');
      if (g) {
        g.data.effect.rot = clamp(v, -3600, 3600);
        FX.rebuild(g);
        VP.commit();
      }
      return true;
    }
    if (name === 'e2LensC2' && hex) {
      const g = fxOne('lens');
      if (g) {
        g.data.effect.color2 = hex;
        FX.buildLens(g);
        VP.commit();
      }
      return true;
    }
    return false;
  };
  E2.act = (id, el) => {
    const [k, arg] = id.split(':');
    const it = one();
    const g = (type) => fxOne(type);
    switch (k) {
      case 'e2ShMode': {
        D.shadowMode = arg;
        const fx = FX.of(it);
        if (arg === 'persp' && it && it.data.shadow && !fx) {
          VP.setSelection([E2.makePShadow(it)]);
          VP.commit();
        } else if (arg === 'flat' && fx && fx.type === 'pshadow') {
          const s = unwrapSrc(it)[0];
          VP.setShadow([s], flatDefault());
          VP.setSelection([s]);
          VP.commit();
        }
        return true;
      }
      case 'e2ShPresets': shPresets(el); return true;
      case 'e2ShOff':
        if (it) {
          VP.setShadow([it], { on: false });
          VP.commit();
        }
        return true;
      case 'e2ShTool': VP.setTool('shadowTool'); return true;
      case 'e2DMode': {
        const d = g('distort');
        D.distMode = arg;
        if (d) {
          d.data.effect.mode = arg;
          if (arg === 'zipper' && d.data.effect.amp < 0) d.data.effect.amp = -d.data.effect.amp;
          E2.buildDistort(d);
          VP.commit();
        }
        return true;
      }
      case 'e2DRandom':
      case 'e2DSmooth': {
        const d = g('distort');
        if (d) {
          const key = k === 'e2DRandom' ? 'random' : 'smooth';
          d.data.effect[key] = !d.data.effect[key];
          if (key === 'random') d.data.effect.seed = 1 + Math.floor(Math.random() * 999);
          E2.buildDistort(d);
          VP.commit();
        }
        return true;
      }
      case 'e2DCenter': {
        const d = g('distort');
        if (d) {
          const r = d.data.effect.rect;
          d.data.effect.cx = r[0] + r[2] / 2;
          d.data.effect.cy = r[1] + r[3] / 2;
          E2.buildDistort(d);
          VP.commit();
        }
        return true;
      }
      case 'e2DTool': VP.setTool('distortTool'); return true;
      case 'e2Env': {
        const e = g('envelope');
        D.envMode = arg;
        if (e) {
          E2.setEnvMode(e, arg);
          VP.commit();
        }
        return true;
      }
      case 'e2BCol':
      case 'e2BFull':
      case 'e2BAlong': {
        const b = g('blend');
        if (!b) return true;
        const fx = b.data.effect;
        if (k === 'e2BCol') fx.colorDir = arg;
        if (k === 'e2BFull') fx.fullPath = !fx.fullPath;
        if (k === 'e2BAlong') fx.alongRotate = !fx.alongRotate;
        FX.rebuild(b);
        VP.commit();
        return true;
      }
      case 'e2BPath': if (g('blend')) E2.blendPath(g('blend')); return true;
      case 'e2BDetach': if (g('blend')) E2.blendDetach(g('blend')); return true;
      case 'e2LMap': {
        const l = g('lens');
        if (l) {
          l.data.effect.mapMode = arg;
          FX.buildLens(l);
          VP.commit();
        }
        return true;
      }
      default:
        return false;
    }
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^e2/.test(n) ? E2.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^e2/.test(id) ? E2.act(id, el) : act0(id, el));

  /* =============== actions, menus, tools =============== */
  const applySel = (make, name) => () => {
    if (!VP.sel.length) return VP.toast('Önce nesne seçin');
    const res = VP.sel.slice().map((it) => make(it) || it);
    VP.setSelection(res);
    VP.commit();
    VP.toast(name + ' uygulandı');
  };
  Object.assign(A, {
    fxDropShadow: { label: 'Gölge aracı', icon: 'shadowTool', run: () => VP.setTool('shadowTool') },
    fxPShadow: { label: 'Perspektif gölge', icon: 'pshadow', run: applySel(E2.makePShadow, 'Perspektif gölge'), enabled: () => VP.sel.length > 0 },
    fxInnerShadow: { label: 'İç gölge', icon: 'innerShadow', run: applySel(E2.makeInner, 'İç gölge'), enabled: () => VP.sel.length > 0 },
    fxBlockShadow: { label: 'Blok gölge', icon: 'blockShadow', run: applySel(E2.makeBlock, 'Blok gölge'), enabled: () => VP.sel.length > 0 },
    fxDistort: { label: 'Deformasyon', icon: 'distort', run: applySel(E2.makeDistort, 'Deformasyon'), enabled: () => VP.sel.length > 0 }
  });
  const M = UI.MENUS.effects;
  if (!M.includes('fxDistort')) {
    M.splice(M.indexOf('fxContour') + 1, 0, 'fxDistort');
    const si = M.indexOf('shadowToggle');
    M.splice(si + 1, 0, 'fxDropShadow', 'fxPShadow', 'fxInnerShadow', 'fxBlockShadow');
  }
  Object.assign(VP.TOOL_META, {
    shadowTool: { label: 'Gölge', icon: 'shadowTool', key: '', hint: 'Bir nesneye dokunun: gölge · Sürükleyin: gölgenin yönü · Perspektif mod özellik çubuğunda' },
    innerShadowTool: { label: 'İç gölge', icon: 'innerShadow', key: '', hint: 'Kapalı bir şekle dokunun · Üzerinde sürükleyin: iç gölgenin yönü' },
    blockShadowTool: { label: 'Blok gölge', icon: 'blockShadow', key: '', hint: 'Bir nesneye dokunun · Üzerinde sürükleyin: blok gölgenin yönü ve derinliği' },
    distortTool: { label: 'Deformasyon', icon: 'distort', key: '', hint: 'Bir nesneye dokunun veya sağa-sola sürükleyin · İt-çek, fermuar, burgu özellik çubuğunda · ◆ merkez' }
  });
})();
