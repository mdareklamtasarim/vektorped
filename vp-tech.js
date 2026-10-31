/* VektörPad drawing aids and objects:
   - Alignment guides: while an object is moved, its edges and centre snap to the edges and centres of other
     objects and the page, and the lines they line up on are shown.
   - Symmetry: a live group that mirrors (or repeats around a centre) what is drawn inside it; edit mode
     lets you draw one half and see the rest appear.
   - Bevel: a live effect that lights the edges of a shape (soft or chamfered).
   - QR codes and barcodes (Code 128, EAN-13, EAN-8, UPC-A) as live vector objects.
   All written for this app. */
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
  const C = VP.codes;
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
  const TC = (VP.tech = {});
  const seg = (items, cur, prefix, title) => '<span class="seg"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + items.map(([v, l]) => '<button data-act="' + prefix + v + '" class="' + (String(v) === String(cur) ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const select = (label, name, items, cur) => '<label class="field"><span>' + esc(label) + '</span><select data-pf="' + name + '" aria-label="' + esc(label) + '">' + items.map(([k, l]) => '<option value="' + k + '"' + (String(k) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>';
  const row = (x, panel) => (panel ? '<div class="row">' + x + '</div>' : x);
  const fieldOf = (panel) => (panel ? H.dfieldPf : H.field);
  const endBtns = (panel) => (panel ? '<div class="row"><button class="btn" data-act="fxSeparate">Ayır</button><button class="btn danger" data-act="fxClear">Kaldır</button></div>' : H.btn('fxMenu', 'Efekt ▾', 'Efekti ayır veya kaldır'));
  const def = (k, v) => {
    if (S[k] === undefined) S[k] = v;
  };
  def('alignGuides', true);
  Object.assign(
    VP.defaults,
    { bvStyle: 'soft', bvWidth: VP.toPT(2.5), bvAngle: -135, bvInt: 0.55, bvLight: '#ffffff', bvDark: '#000000', qrEcl: 'M', bcKind: 'code128', symMode: 'mirror', symN: 6 },
    VP.defaults
  );
  Object.assign(FX.NAMES, { bevel: 'Eğim', symmetry: 'Simetri', code: 'Kod' });
  Object.assign(VP.KIND_NAMES || (VP.KIND_NAMES = {}), { bevel: 'Eğim', symmetry: 'Simetri', code: 'Kod' });
  const src = (g) => g.children.find((c) => c.data.effectSrc);
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
    if (VP.applyShadowProps) VP.applyShadowProps(s);
    return [s];
  };
  const placeNew = (g) => {
    VP.ensureLayer();
    VP.activeLayer.addChild(g);
  };

  // drawing tools (used by symmetry editing and perspective drawing)
  const PROJ_TOOLS = new Set(['freehand', 'line', 'pen', 'bsplineTool', 'polylineTool', 'curve3Tool', 'brush', 'rect', 'ellipse', 'polygon', 'star', 'spiral', 'rect3Tool', 'ellipse3Tool', 'cstarTool', 'graphTool', 'perfectTool', 'sketchTool', 'smartDraw']);
  TC.projectable = (id) => PROJ_TOOLS.has(id) && !!T[id];
  const tool0 = VP.tool;

  /* ======================================================================
     ALIGNMENT GUIDES
     ====================================================================== */
  TC.guides = [];
  const alignTargets = () => {
    const xs = [];
    const ys = [];
    const p = VP.page();
    const pageB = new paper.Rectangle(0, 0, p.w, p.h);
    [[0, pageB], [p.w / 2, pageB], [p.w, pageB]].forEach(([x, b]) => xs.push({ v: x, b, page: true }));
    [[0, pageB], [p.h / 2, pageB], [p.h, pageB]].forEach(([y, b]) => ys.push({ v: y, b, page: true }));
    VP.allSelectable().forEach((it) => {
      if (VP.sel.includes(it) || (it.data && it.data.hitOnly)) return;
      const b = it.bounds;
      if (!b.width && !b.height) return;
      [b.left, b.center.x, b.right].forEach((x) => xs.push({ v: x, b }));
      [b.top, b.center.y, b.bottom].forEach((y) => ys.push({ v: y, b }));
    });
    return { xs, ys };
  };
  const findAlign = (vals, targets, tol) => {
    let best = null;
    vals.forEach((v) => targets.forEach((t) => {
      const d = t.v - v;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d) - 1e-9 || (Math.abs(Math.abs(d) - Math.abs(best.d)) < 1e-9 && !t.page && best.t.page))) best = { d, t };
    }));
    return best;
  };
  const selMove0 = T.select.move;
  T.select.move = function (e) {
    const r = selMove0.call(this, e);
    const op = this.op;
    if (!(S.alignGuides && op && op.type === 'move' && op.moved && VP.sel.length)) {
      if (TC.guides.length) TC.guides = [];
      return r;
    }
    if (!op.alignT) op.alignT = alignTargets();
    const tol = (VP.coarse ? 9 : 6) / zoom();
    const b = VP.selBounds();
    const ax = findAlign([b.left, b.center.x, b.right], op.alignT.xs, tol);
    const ay = findAlign([b.top, b.center.y, b.bottom], op.alignT.ys, tol);
    const d = Pt(ax ? ax.d : 0, ay ? ay.d : 0);
    if (d.x || d.y) VP.T.move(VP.sel, d);
    const nb = VP.selBounds();
    const gl = [];
    // every feature that lines up after the snap gets a guide
    const eps = 0.01;
    if (ax) {
      [nb.left, nb.center.x, nb.right].forEach((x) => op.alignT.xs.forEach((t) => {
        if (Math.abs(t.v - x) < eps) gl.push({ o: 'v', v: x, a: Math.min(nb.top, t.b.top), b: Math.max(nb.bottom, t.b.bottom), page: t.page });
      }));
    }
    if (ay) {
      [nb.top, nb.center.y, nb.bottom].forEach((y) => op.alignT.ys.forEach((t) => {
        if (Math.abs(t.v - y) < eps) gl.push({ o: 'h', v: y, a: Math.min(nb.left, t.b.left), b: Math.max(nb.right, t.b.right), page: t.page });
      }));
    }
    TC.guides = gl;
    VP.drawOverlay();
    return r;
  };
  const clearGuides = () => {
    if (!TC.guides.length) return;
    TC.guides = [];
    VP.drawOverlay();
  };
  const selUp0 = T.select.up;
  T.select.up = function (e) {
    TC.guides = [];
    return selUp0.call(this, e);
  };
  const selCancel0 = T.select.cancel;
  T.select.cancel = function () {
    TC.guides = [];
    return selCancel0.call(this);
  };
  VP.overlayHooks = VP.overlayHooks || [];
  VP.overlayHooks.push((L) => {
    if (!TC.guides.length || VP.toolId !== 'select') return;
    const s = 1 / zoom();
    const col = new paper.Color('#e0218a');
    const seen = new Set();
    TC.guides.forEach((g) => {
      const key = g.o + Math.round(g.v * 100);
      if (seen.has(key)) return;
      seen.add(key);
      const pad = 8 * s;
      const from = g.o === 'v' ? Pt(g.v, g.a - pad) : Pt(g.a - pad, g.v);
      const to = g.o === 'v' ? Pt(g.v, g.b + pad) : Pt(g.b + pad, g.v);
      L.addChild(new paper.Path.Line({ from, to, strokeColor: col, strokeWidth: 1 * s, dashArray: g.page ? [4 * s, 3 * s] : [], insert: false }));
    });
  });

  /* ======================================================================
     SYMMETRY
     ====================================================================== */
  const symSrc = (g) => g.children.find((c) => c.data.symSrc);
  const symMirror = (g) => g.children.find((c) => c.data.symMirror);
  TC.symTransforms = (fx) => {
    const c = Pt(fx.cx, fx.cy);
    const flipV = new paper.Matrix().scale(-1, 1, c);
    const flipH = new paper.Matrix().scale(1, -1, c);
    if (fx.mode === 'mirror') {
      if (fx.axis === 'h') return [flipH];
      if (fx.axis === 'both') return [flipV, flipH, new paper.Matrix().rotate(180, c)];
      return [flipV];
    }
    const n = clamp(Math.round(fx.n || 6), 2, 36);
    const out = [];
    for (let k = 1; k < n; k++) out.push(new paper.Matrix().rotate((360 * k) / n, c));
    if (fx.reflect) {
      for (let k = 0; k < n; k++) out.push(new paper.Matrix().rotate((360 * k) / n, c).append(flipV));
    }
    return out;
  };
  // items mirrored in edit mode: everything above the symmetry group on its layer
  const editItems = (g) => {
    if (!g.parent) return [];
    return g.parent.children.slice(g.index + 1).filter((it) => it.visible !== false && !(it.data && it.data.hitOnly));
  };
  TC.buildSym = (g, live) => {
    const fx = g.data.effect;
    let m = symMirror(g);
    if (m) m.removeChildren();
    else {
      m = new paper.Group({ insert: false });
      m.data.symMirror = true;
      g.addChild(m);
    }
    let s = symSrc(g);
    if (!s) {
      s = new paper.Group({ insert: false });
      s.data.symSrc = true;
      g.insertChild(0, s);
    }
    const items = fx.editing ? editItems(g) : s.children;
    const toLocal = fx.editing ? g.matrix.inverted() : null;
    const mats = TC.symTransforms(fx);
    const budget = live ? 4000 : 1e9;
    let used = 0;
    items.forEach((it) => {
      const base = it.clone({ insert: false });
      if (toLocal) base.transform(toLocal);
      used += (base.segments ? base.segments.length : 20) * mats.length;
      if (used > budget) return;
      mats.forEach((mt) => {
        const c = base.clone({ insert: false });
        c.transform(mt);
        m.addChild(c);
      });
    });
    m.locked = !!fx.editing;
  };
  TC.editingSym = () => {
    let found = null;
    VP.userLayers().forEach((L) => L.children.forEach((c) => {
      const fx = FX.of(c);
      if (!found && fx && fx.type === 'symmetry' && fx.editing) found = c;
    }));
    return found;
  };
  TC.symCreate = () => {
    const items = VP.sel.filter((it) => !(FX.of(it) && FX.of(it).type === 'symmetry'));
    const g = new paper.Group({ insert: false, applyMatrix: false });
    const s = new paper.Group({ insert: false });
    s.data.symSrc = true;
    const fx = { type: 'symmetry', mode: D.symMode, axis: 'v', n: D.symN, reflect: false, cx: 0, cy: 0 };
    if (items.length) {
      const b = VP.selBounds();
      const sorted = items.slice().sort((a, b2) => (a.isBelow(b2) ? -1 : 1));
      g.insertAbove(sorted[sorted.length - 1]);
      sorted.forEach((it) => s.addChild(it));
      if (fx.mode === 'mirror') {
        fx.cx = b.right;
        fx.cy = b.center.y;
      } else {
        fx.cx = b.center.x;
        fx.cy = b.bottom + b.height * 0.25;
      }
    } else {
      placeNew(g);
      const p = VP.page();
      fx.cx = p.w / 2;
      fx.cy = p.h / 2;
    }
    g.addChild(s);
    g.data.effect = fx;
    TC.buildSym(g);
    if (!items.length) return TC.symEdit(g);
    VP.setSelection([g]);
    VP.commit();
    VP.toast('Simetri oluşturuldu · Çift dokunun: simetriyi düzenle');
  };
  TC.symEdit = (g) => {
    g = g || fxOne('symmetry');
    if (!g) return VP.toast('Önce bir simetri nesnesi seçin');
    const cur = TC.editingSym();
    if (cur && cur !== g) TC.symFinish(cur, true);
    const fx = g.data.effect;
    const L = g.layer;
    g.bringToFront();
    const s = symSrc(g);
    const kids = s ? s.removeChildren() : [];
    kids.forEach((k) => {
      k.transform(g.matrix);
      L.addChild(k);
    });
    fx.editing = true;
    g.locked = true;
    if (L && L !== VP.activeLayer) VP.setActiveLayer(L);
    TC.buildSym(g);
    VP.setSelection(kids.length ? kids : []);
    if (!kids.length || (!TC.projectable(VP.toolId) && VP.toolId !== 'select')) VP.setTool('freehand');
    VP.commit();
    VP.toast('Simetri düzenleniyor · Çizin, aynası anında görünür · Bitirmek için Bitti');
    startLoop();
  };
  TC.symFinish = (g, quiet) => {
    g = g || TC.editingSym();
    if (!g) return;
    const fx = g.data.effect;
    const items = editItems(g);
    let s = symSrc(g);
    if (!s) {
      s = new paper.Group({ insert: false });
      s.data.symSrc = true;
      g.insertChild(0, s);
    }
    const inv = g.matrix.inverted();
    items.forEach((it) => {
      it.transform(inv);
      s.addChild(it);
    });
    fx.editing = false;
    g.locked = false;
    TC.buildSym(g);
    if (!s.children.length) {
      g.remove();
      VP.clearSelection();
      VP.commit();
      if (!quiet) VP.toast('Simetri boş olduğu için kaldırıldı');
      return;
    }
    if (VP.toolId !== 'select') VP.setTool('select');
    VP.setSelection([g]);
    VP.commit();
    if (!quiet) VP.toast('Simetri düzenleme bitti');
  };
  // live mirror while a stroke is being drawn in edit mode
  let loopOn = false;
  let frame = 0;
  const startLoop = () => {
    if (loopOn) return;
    loopOn = true;
    const tick = () => {
      const g = TC.editingSym();
      if (!g) {
        loopOn = false;
        return;
      }
      const t = tool0();
      if (t && t.busy && t.busy() && ++frame % 2 === 0) TC.buildSym(g, true);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  VP.on('change', () => {
    if (TC.editingSym()) startLoop();
  });
  VP.on('page', () => {
    if (TC.editingSym()) startLoop();
  });
  VP.overlayHooks.push((L) => {
    const g = TC.editingSym();
    if (!g) return;
    const fx = g.data.effect;
    const s = 1 / zoom();
    const c = g.matrix.transform(Pt(fx.cx, fx.cy));
    const col = acc();
    const p = VP.page();
    const len = Math.max(p.w, p.h) * 1.5;
    const ln = (a, b) => L.addChild(new paper.Path.Line({ from: a, to: b, strokeColor: col, strokeWidth: 1.2 * s, dashArray: [6 * s, 4 * s], opacity: 0.8, insert: false }));
    const rot = g.matrix.rotation || 0;
    if (fx.mode === 'mirror') {
      if (fx.axis !== 'h') ln(c.add(Pt(0, -len).rotate(rot)), c.add(Pt(0, len).rotate(rot)));
      if (fx.axis !== 'v') ln(c.add(Pt(-len, 0).rotate(rot)), c.add(Pt(len, 0).rotate(rot)));
    } else {
      const n = clamp(Math.round(fx.n || 6), 2, 36);
      for (let k = 0; k < n; k++) ln(c, c.add(Pt(0, -len).rotate(rot + (360 * k) / n)));
    }
    L.addChild(new paper.Path.Circle({ center: c, radius: (VP.coarse ? 9 : 6) * s, fillColor: '#ffffff', strokeColor: col, strokeWidth: 1.6 * s, insert: false }));
  });
  // dragging the centre in edit mode (Pick tool)
  const selDown0 = T.select.down;
  T.select.down = function (e) {
    const g = TC.editingSym();
    if (g) {
      const fx = g.data.effect;
      const c = g.matrix.transform(Pt(fx.cx, fx.cy));
      if (c.getDistance(e.point) * zoom() < (VP.coarse ? 22 : 12)) {
        this.op = { type: 'symCenter', g, changed: false };
        return;
      }
    }
    return selDown0.call(this, e);
  };
  const selMove1 = T.select.move;
  T.select.move = function (e) {
    const op = this.op;
    if (op && op.type === 'symCenter') {
      const p = op.g.matrix.inverted().transform(VP.snapPt(e.point));
      op.g.data.effect.cx = p.x;
      op.g.data.effect.cy = p.y;
      op.changed = true;
      TC.buildSym(op.g, true);
      VP.drawOverlay();
      return;
    }
    return selMove1.call(this, e);
  };
  const selUp1 = T.select.up;
  T.select.up = function (e) {
    const op = this.op;
    if (op && op.type === 'symCenter') {
      this.op = null;
      if (op.changed) {
        TC.buildSym(op.g);
        VP.commit();
      }
      UI.schedule('prop');
      return;
    }
    return selUp1.call(this, e);
  };
  const symFields = (g, panel) => {
    const fx = g.data.effect;
    const f = fieldOf(panel);
    let h = panel ? '' : '<span class="pb-label">Simetri</span>';
    h += row(seg([['mirror', 'Ayna'], ['radial', 'Döner']], fx.mode, 'tcSymMode:'), panel);
    if (fx.mode === 'mirror') h += row(seg([['v', '| Dikey'], ['h', '— Yatay'], ['both', '+ İkisi']], fx.axis, 'tcSymAxis:', 'Ayna ekseni'), panel);
    else h += row(f('Kopya', 'tcSymN', fx.n, '') + H.tog('tcSymReflect', 'Yansıt', !!fx.reflect, 'Her dilimi ayrıca aynala (kaleydoskop)'), panel);
    const c = g.matrix.transform(Pt(fx.cx, fx.cy));
    h += row(f('Merkez X', 'tcSymCx', mm(c.x, 1)) + f('Y', 'tcSymCy', mm(c.y, 1)), panel);
    h += row(fx.editing ? H.btn('tcSymFinish', 'Bitti', 'Düzenlemeyi bitir', 'primary') : H.btn('tcSymEdit', ic('node', 'sm') + 'Düzenle', 'Simetriyi düzenle (çift dokunma)'), panel);
    if (panel) h += '<p class="sec-note">Düzenleme modunda çizdiğiniz her şey aynalanır. Merkez noktasını Seçim aracıyla sürükleyebilirsiniz.</p>';
    return h + endBtns(panel);
  };
  FX.TYPES.symmetry = {
    build: (g) => TC.buildSym(g),
    probe: (g) => {
      const s = symSrc(g);
      return (s && VP.leafItems ? VP.leafItems(s.children)[0] : null) || g;
    },
    restyle(g, fn) {
      const s = symSrc(g);
      if (s && s.children.length) fn(VP.leafItems ? VP.leafItems(s.children) : s.children);
      TC.buildSym(g);
    },
    describe: (g) => {
      const fx = g.data.effect;
      return fx.mode === 'mirror' ? 'Simetri (ayna)' : 'Simetri (' + fx.n + ' kopya)';
    },
    bake(g) {
      const s = symSrc(g);
      if (s) delete s.data.symSrc;
      const m = symMirror(g);
      if (m) {
        delete m.data.symMirror;
        m.locked = false;
      }
    },
    clear(g) {
      const s = symSrc(g);
      const kids = s ? s.removeChildren() : [];
      kids.forEach((k) => {
        k.transform(g.matrix);
        k.insertBelow(g);
      });
      g.remove();
      return kids;
    },
    clearMsg: 'Simetri kaldırıldı · Özgün nesneler kaldı',
    bakeMsg: 'Simetri ayrıldı · Artık normal bir grup',
    dblTap: (g) => TC.symEdit(g),
    fields: (g) => symFields(g, false),
    panel: (g) => symFields(g, true)
  };

  /* ======================================================================
     BEVEL
     ====================================================================== */
  // the filled area of an item as one path item, in the item's parent coordinates
  const areaOf = (item) => {
    if ((item instanceof paper.Path && item.closed) || item instanceof paper.CompoundPath) {
      const g = item.clone({ insert: false });
      g.data = {};
      return g;
    }
    const loops = [];
    const walk = (it) => {
      if (it instanceof paper.PointText) {
        const cp = VP.textToPath(it.clone({ insert: false }));
        if (cp) walk(cp);
        return;
      }
      if (it instanceof paper.CompoundPath) return it.children.forEach((p) => loops.push(p.clone({ insert: false })));
      if (it instanceof paper.Path) {
        if (it.closed || it.segments.length > 2) {
          const q = it.clone({ insert: false });
          if (it.matrix && !it.matrix.isIdentity()) q.transform(it.matrix);
          q.closed = true;
          loops.push(q);
        }
        return;
      }
      if (it instanceof paper.Raster) return loops.push(new paper.Path.Rectangle({ rectangle: it.bounds, insert: false }));
      if (it.children) it.children.forEach(walk);
    };
    walk(item);
    if (!loops.length) return null;
    if (item instanceof paper.PointText || loops.length > 40) return new paper.CompoundPath({ children: loops, fillRule: 'nonzero', insert: false });
    let u = loops[0];
    for (let i = 1; i < loops.length; i++) u = u.unite(loops[i], { insert: false });
    return u;
  };
  // Lights the rim of a shape by the direction each edge faces: the rim (width w, inside the outline) is cut
  // into thin quads along the outline; each quad is shaded by how much its outward normal faces the light.
  // "Pah" is one flat facet; "Yumuşak" is a rounded rim (several rings that flatten towards the inside).
  TC.buildBevel = (g) => {
    const fx = g.data.effect;
    const s = src(g);
    g.children.slice().forEach((c) => c !== s && c.remove());
    if (!s) return;
    const area = areaOf(s);
    if (!area) return;
    area.fillColor = null;
    area.strokeColor = null;
    const loops = (area instanceof paper.CompoundPath ? area.children : [area]).filter((l) => l.closed !== false && l.length > 0.5);
    if (!loops.length) return;
    const w = Math.max(0.1, fx.width);
    const Ldir = Pt(1, 0).rotate(fx.angle);
    const soft = fx.style !== 'chamfer';
    const rings = soft ? 5 : 1;
    const LEVELS = 10;
    const per = loops.reduce((t, l) => t + l.length, 0);
    const step = clamp(per / 900, 0.35, 3);
    const buckets = new Map();
    const push = (key, quad) => {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(quad);
    };
    const probe = Math.min(0.4, w * 0.15);
    loops.forEach((l) => {
      const n = Math.max(12, Math.ceil(l.length / step));
      const P = [];
      for (let i = 0; i < n; i++) {
        const off = (l.length * i) / n;
        const pt = l.getPointAt(off);
        let nm = l.getNormalAt(off);
        if (!pt || !nm) continue;
        if (area.contains(pt.add(nm.multiply(probe)))) nm = nm.negate();
        P.push([pt, nm]);
      }
      // smooth the normals a little so corners turn over a few quads
      const N = P.map(([, nm], i) => {
        const a2 = P[(i - 1 + P.length) % P.length][1];
        const c2 = P[(i + 1) % P.length][1];
        const v = nm.multiply(2).add(a2).add(c2);
        return v.length > 1e-6 ? v.normalize() : nm;
      });
      for (let r = 0; r < rings; r++) {
        const r0 = (w * r) / rings;
        const r1 = (w * (r + 1)) / rings;
        const slope = soft ? Math.cos((Math.PI / 2) * ((r + 0.5) / rings)) : 1;
        for (let i = 0; i < P.length; i++) {
          const j = (i + 1) % P.length;
          const [pa] = P[i];
          const [pb] = P[j];
          const nm = N[i].add(N[j]).normalize();
          const shade = nm.dot(Ldir) * slope;
          const lev = Math.round(Math.abs(shade) * LEVELS);
          if (!lev) continue;
          const q = new paper.Path({ segments: [pa.subtract(N[i].multiply(r0)), pb.subtract(N[j].multiply(r0)), pb.subtract(N[j].multiply(r1)), pa.subtract(N[i].multiply(r1))], closed: true, insert: false });
          if (Math.abs(q.area) < 1e-7) continue;
          q.clockwise = true;
          push((shade > 0 ? 'L' : 'D') + lev, q);
        }
      }
    });
    const out = new paper.Group({ insert: false });
    out.data.bevelFx = true;
    const clip = area.clone({ insert: false });
    clip.clipMask = true;
    out.addChild(clip);
    const a = clamp(fx.intensity, 0, 1);
    [...buckets.keys()].sort().forEach((key) => {
      const lev = +key.slice(1);
      const col = new paper.Color(key[0] === 'L' ? fx.light : fx.dark);
      col.alpha = clamp(a * (lev / LEVELS) * (key[0] === 'L' ? 1 : 0.9), 0, 1);
      out.addChild(new paper.CompoundPath({ children: buckets.get(key), fillRule: 'nonzero', fillColor: col, insert: false }));
    });
    out.clipped = true;
    out.insertAbove(s);
  };
  TC.makeBevel = (item) => {
    const fx0 = FX.of(item);
    if (fx0 && fx0.type === 'bevel') return item;
    if (FX.isFx(item)) {
      VP.toast('Eğim için önce efekti ayırın');
      return null;
    }
    const g = wrap(item, { type: 'bevel', style: D.bvStyle, width: D.bvWidth, steps: 8, angle: D.bvAngle, intensity: D.bvInt, light: D.bvLight, dark: D.bvDark });
    TC.buildBevel(g);
    return g;
  };
  const LIGHTS = [[-135, '↖ Sol üst'], [-90, '↑ Üst'], [-45, '↗ Sağ üst'], [180, '← Sol'], [0, '→ Sağ'], [135, '↙ Sol alt'], [90, '↓ Alt'], [45, '↘ Sağ alt']];
  const bevelFields = (g, panel) => {
    const fx = g.data.effect;
    const f = fieldOf(panel);
    let h = panel ? '' : '<span class="pb-label">Eğim</span>';
    h += row(seg([['soft', 'Yumuşak'], ['chamfer', 'Pah']], fx.style, 'tcBvStyle:'), panel);
    h += row(f('Genişlik', 'tcBvWidth', mm(fx.width, 1)) + select('Işık', 'tcBvAngle', LIGHTS, fx.angle), panel);
    h += row(H.range('Şiddet', 'tcBvInt', Math.round(fx.intensity * 100), 0, 100), panel);
    h += row(H.colorField('Işık', 'tcBvLight', fx.light) + H.colorField('Gölge', 'tcBvDark', fx.dark), panel);
    return h + endBtns(panel);
  };
  FX.TYPES.bevel = {
    build: (g) => TC.buildBevel(g),
    probe: (g) => src(g),
    restyle(g, fn) {
      fn([src(g)]);
      TC.buildBevel(g);
    },
    describe: (g) => 'Eğim (' + (g.data.effect.style === 'chamfer' ? 'pah' : 'yumuşak') + ')',
    clear: (g) => unwrapSrc(g),
    clearMsg: 'Eğim kaldırıldı',
    bakeMsg: 'Eğim ayrıldı · Işık ve gölge ayrı şekiller oldu',
    fields: (g) => bevelFields(g, false),
    panel: (g) => bevelFields(g, true)
  };

  /* ======================================================================
     QR CODES AND BARCODES
     ====================================================================== */
  const BC_KINDS = [['code128', 'Code 128'], ['ean13', 'EAN-13'], ['ean8', 'EAN-8'], ['upca', 'UPC-A']];
  const ECLS = [['L', 'L · %7'], ['M', 'M · %15'], ['Q', 'Q · %25'], ['H', 'H · %30']];
  const codeErr = (e, kind) => {
    const m = (e && e.message) || '';
    if (m === 'too_long') return 'Metin QR kod için çok uzun';
    if (m === 'chars') return 'Code 128 yalnızca standart ASCII karakterleri kodlar (Türkçe harfler olmaz)';
    if (m === 'check') return 'Son hane (kontrol hanesi) hatalı';
    if (m === 'len13') return 'EAN-13 için 12 veya 13 rakam girin';
    if (m === 'len8') return 'EAN-8 için 7 veya 8 rakam girin';
    if (m === 'len12') return 'UPC-A için 11 veya 12 rakam girin';
    return (kind === 'qr' ? 'QR kod' : 'Barkod') + ' oluşturulamadı';
  };
  TC.encode = (fx) => {
    if (fx.kind === 'qr') return C.qr(fx.text, fx.ecl);
    return C[fx.kind](fx.text);
  };
  TC.buildCode = (g) => {
    const fx = g.data.effect;
    let enc;
    try {
      enc = TC.encode(fx);
    } catch (e) {
      return;
    }
    g.removeChildren();
    const m = fx.module;
    const col = new paper.Color(fx.color || '#000000');
    const rects = [];
    let W;
    let Hh;
    if (fx.kind === 'qr') {
      const q = fx.quiet ? 4 : 0;
      W = Hh = (enc.size + q * 2) * m;
      enc.modules.forEach((rowM, y) => {
        let x = 0;
        while (x < enc.size) {
          if (!rowM[x]) {
            x++;
            continue;
          }
          let e = x;
          while (e < enc.size && rowM[e]) e++;
          rects.push(new paper.Path.Rectangle({ rectangle: new paper.Rectangle((x + q) * m, (y + q) * m, (e - x) * m, m), insert: false }));
          x = e;
        }
      });
    } else {
      const q = fx.quiet ? enc.quiet : 0;
      let x = q;
      const total = enc.runs.reduce((a, r) => a + r[1], 0);
      W = (total + q * 2) * m;
      const bh = fx.height;
      const guardExtra = enc.guards && fx.showText ? m * 5 : 0;
      let pos = 0;
      enc.runs.forEach(([dark, len]) => {
        if (dark) {
          const isGuard = enc.guards && enc.guards.some(([a, b]) => pos >= a && pos + len <= b);
          rects.push(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(x * m, 0, len * m, bh + (isGuard ? guardExtra : 0)), insert: false }));
        }
        x += len;
        pos += len;
      });
      Hh = bh + (fx.showText ? m * 11 : 0);
    }
    if (fx.bg) g.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(0, 0, W, Hh), fillColor: fx.bg, insert: false }));
    const cp = new paper.CompoundPath({ children: rects, fillColor: col, insert: false });
    cp.data.codeBars = true;
    g.addChild(cp);
    if (fx.kind !== 'qr' && fx.showText) {
      const fs = m * 9;
      const y = fx.height + m * 9.5;
      const q = fx.quiet ? enc.quiet : 0;
      const txt = (s, cx, just) => {
        const t = new paper.PointText({ point: Pt(cx, y), content: s, fontFamily: 'Fira Sans', fontSize: fs, fillColor: col, justification: just || 'center', insert: false });
        g.addChild(t);
      };
      const d = enc.text;
      if (fx.kind === 'ean13') {
        txt(d[0], (q - 1.5) * m, 'right');
        txt(d.slice(1, 7), (q + 3 + 21) * m);
        txt(d.slice(7), (q + 50 + 21) * m);
      } else if (fx.kind === 'ean8') {
        txt(d.slice(0, 4), (q + 3 + 14) * m);
        txt(d.slice(4), (q + 36 + 14) * m);
      } else if (fx.kind === 'upca') {
        txt(d[0], (q - 1.5) * m, 'right');
        txt(d.slice(1, 6), (q + 10 + 17.5) * m);
        txt(d.slice(6, 11), (q + 50 + 17.5) * m);
        txt(d[11], (q + 96.5) * m, 'left');
      } else txt(d, W / 2);
    }
  };
  TC.insertCode = (kind, text, extra) => {
    const fx = Object.assign({
      type: 'code', kind, text,
      ecl: D.qrEcl,
      module: kind === 'qr' ? VP.toPT(1) : VP.toPT(0.33),
      height: VP.toPT(22),
      showText: true,
      quiet: true,
      color: '#000000',
      bg: '#ffffff'
    }, extra || {});
    try {
      TC.encode(fx);
    } catch (e) {
      VP.toast(codeErr(e, kind));
      return null;
    }
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.data.effect = fx;
    TC.buildCode(g);
    placeNew(g);
    const p = VP.page();
    g.position = paper.view.bounds.intersects(new paper.Rectangle(0, 0, p.w, p.h)) ? paper.view.center : Pt(p.w / 2, p.h / 2);
    VP.setSelection([g]);
    VP.commit();
    return g;
  };
  // dialog to type the content (new code or editing one)
  TC.codeDialog = (g, kind) => {
    const fx = g ? g.data.effect : null;
    kind = fx ? fx.kind : kind;
    const isQR = kind === 'qr';
    const val = fx ? fx.text : isQR ? 'https://' : kind === 'code128' ? 'VEKTORPAD-001' : '';
    const kinds = isQR ? '' : '<div class="row"><span class="opt-label">Tür</span>' + seg(BC_KINDS, kind, 'k:') + '</div>';
    const html = '<h2>' + (isQR ? 'QR kod' : 'Barkod') + (fx ? ' düzenle' : ' ekle') + '</h2>' + kinds +
      '<label class="opt-label" for="tc-code-in">' + (isQR ? 'İçerik (bağlantı, metin, telefon, e-posta…)' : 'Veri') + '</label>' +
      (isQR ? '<textarea id="tc-code-in" rows="3" style="width:100%;font:15px var(--font-ui);padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);color:var(--fg);-webkit-user-select:text;user-select:text">' + esc(val) + '</textarea>'
        : '<input id="tc-code-in" value="' + esc(val) + '" style="width:100%;font:16px var(--font-num);padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);color:var(--fg);-webkit-user-select:text;user-select:text" autocomplete="off">') +
      '<p class="sec-note" id="tc-code-note"></p>' +
      '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">' + (fx ? 'Uygula' : 'Ekle') + '</button></div>';
    UI.modal(html, (root, close) => {
      let k = kind;
      const inp = root.querySelector('#tc-code-in');
      const note = root.querySelector('#tc-code-note');
      const NOTES = { qr: 'Türkçe karakterler UTF-8 olarak kodlanır.', code128: 'Harf, rakam ve işaretler (ASCII). Uzun rakam dizileri otomatik sıkıştırılır.', ean13: '12 rakam girin; 13. kontrol hanesi hesaplanır.', ean8: '7 rakam girin; 8. kontrol hanesi hesaplanır.', upca: '11 rakam girin; 12. kontrol hanesi hesaplanır.' };
      const check = () => {
        try {
          const enc = TC.encode({ kind: k, text: inp.value, ecl: fx ? fx.ecl : D.qrEcl });
          note.textContent = NOTES[k] + (k === 'qr' ? ' · Sürüm ' + enc.version + ' (' + enc.size + '×' + enc.size + ')' : enc.text && k !== 'code128' ? ' · Kodlanacak: ' + enc.text : '');
          note.style.color = '';
          return true;
        } catch (e) {
          note.textContent = codeErr(e, k);
          note.style.color = 'var(--danger)';
          return false;
        }
      };
      inp.addEventListener('input', check);
      check();
      setTimeout(() => {
        try {
          inp.focus();
          inp.select && inp.select();
        } catch (e) { /* ignore */ }
      }, 50);
      root.addEventListener('click', (e) => {
        const kb = e.target.closest('[data-act^="k:"]');
        if (kb) {
          k = kb.dataset.act.slice(2);
          root.querySelectorAll('[data-act^="k:"]').forEach((b) => b.classList.toggle('on', b === kb));
          if (!fx && k !== 'code128' && !/^\d*$/.test(inp.value)) inp.value = k === 'ean13' ? '869000000000' : k === 'ean8' ? '1234567' : '03600029145';
          check();
          return;
        }
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'no') return close();
        if (!check()) return;
        close();
        if (fx) {
          fx.text = inp.value;
          if (k !== fx.kind) fx.kind = k;
          TC.buildCode(g);
          VP.commit();
          VP.drawOverlay();
        } else {
          if (k !== 'qr') D.bcKind = k;
          const made = TC.insertCode(k, inp.value);
          if (made) VP.toast((k === 'qr' ? 'QR kod' : 'Barkod') + ' eklendi · Çift dokunun: içeriği düzenle');
        }
        UI.schedule('prop', 'dock');
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (!isQR || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          root.querySelector('[data-x="yes"]').click();
        }
      });
    });
  };
  const codeFields = (g, panel) => {
    const fx = g.data.effect;
    const f = fieldOf(panel);
    const isQR = fx.kind === 'qr';
    let h = panel ? '' : '<span class="pb-label">' + (isQR ? 'QR kod' : (BC_KINDS.find((k) => k[0] === fx.kind) || [0, 'Barkod'])[1]) + '</span>';
    h += row(H.btn('tcCodeEdit', ic('text', 'sm') + '“' + esc(String(fx.text).slice(0, 18)) + (String(fx.text).length > 18 ? '…' : '') + '”', 'İçeriği düzenle'), panel);
    if (isQR) h += row(select('Hata düzeltme', 'tcQrEcl', ECLS, fx.ecl), panel);
    else h += row(f('Yükseklik', 'tcBcH', mm(fx.height, 1)) + H.tog('tcBcText', 'Yazı', !!fx.showText, 'Okunabilir metni göster'), panel);
    h += row(f(isQR ? 'Modül' : 'Çizgi', 'tcCodeMod', mm(fx.module, 2)) + H.tog('tcCodeQuiet', 'Boşluk', !!fx.quiet, 'Kenar boşluğu (okuyucular için önerilir)'), panel);
    h += row(H.colorField('Renk', 'tcCodeColor', fx.color) + H.colorField('Zemin', 'tcCodeBg', fx.bg || '#ffffff') + H.tog('tcCodeNoBg', 'Saydam', !fx.bg, 'Zemin yok'), panel);
    if (panel) h += '<p class="sec-note">' + (isQR ? 'Baskıda modül en az 0,4 mm olsun; koyu renk açık zemin üzerinde en iyi okunur.' : 'Çizgi genişliği 0,26–0,66 mm arası önerilir (EAN için 0,33 mm = %100).') + '</p>';
    return h + (panel ? '<div class="row"><button class="btn" data-act="fxSeparate">Eğriye dönüştür</button></div>' : H.btn('fxMenu', 'Nesne ▾', 'Normal gruba dönüştür'));
  };
  FX.TYPES.code = {
    build: (g) => TC.buildCode(g),
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
      TC.buildCode(g);
    },
    describe: (g) => (g.data.effect.kind === 'qr' ? 'QR kod' : 'Barkod'),
    clear(g) {
      delete g.data.effect;
      g.applyMatrix = true;
      return [g];
    },
    clearMsg: 'Artık normal bir grup',
    bakeMsg: 'Kod normal şekillere dönüştü',
    dblTap: (g) => TC.codeDialog(g),
    fields: (g) => codeFields(g, false),
    panel: (g) => codeFields(g, true)
  };

  /* ======================================================================
     property bar and docker controls
     ====================================================================== */
  const rebuild = (g) => {
    FX.rebuild(g);
    VP.commit();
    VP.drawOverlay();
  };
  TC.propField = (name, raw) => {
    const v = VP.parseNum(raw);
    const bv = fxOne('bevel');
    const sy = fxOne('symmetry') || TC.editingSym();
    const cd = fxOne('code');
    switch (name) {
      case 'tcBvWidth': if (bv && v > 0) { bv.data.effect.width = VP.toPT(v); D.bvWidth = bv.data.effect.width; rebuild(bv); } return true;
      case 'tcBvAngle': if (bv) { bv.data.effect.angle = +raw; D.bvAngle = +raw; rebuild(bv); } return true;
      case 'tcBvInt': if (bv && isFinite(v)) { bv.data.effect.intensity = clamp(v / 100, 0, 1); D.bvInt = bv.data.effect.intensity; rebuild(bv); } return true;
      case 'tcBvLight': if (bv) { bv.data.effect.light = raw; rebuild(bv); } return true;
      case 'tcBvDark': if (bv) { bv.data.effect.dark = raw; rebuild(bv); } return true;
      case 'tcSymN': if (sy && v >= 2) { sy.data.effect.n = clamp(Math.round(v), 2, 36); D.symN = sy.data.effect.n; rebuild(sy); } return true;
      case 'tcSymCx':
      case 'tcSymCy':
        if (sy && isFinite(v)) {
          const fx = sy.data.effect;
          const c = sy.matrix.transform(Pt(fx.cx, fx.cy));
          if (name === 'tcSymCx') c.x = VP.toPT(v);
          else c.y = VP.toPT(v);
          const l = sy.matrix.inverted().transform(c);
          fx.cx = l.x;
          fx.cy = l.y;
          rebuild(sy);
        }
        return true;
      case 'tcQrEcl': if (cd) { cd.data.effect.ecl = raw; D.qrEcl = raw; rebuild(cd); } return true;
      case 'tcBcH': if (cd && v > 0) { cd.data.effect.height = VP.toPT(v); rebuild(cd); } return true;
      case 'tcCodeMod': if (cd && v > 0) { cd.data.effect.module = VP.toPT(clamp(v, 0.05, 20)); rebuild(cd); } return true;
      case 'tcCodeColor': if (cd) { cd.data.effect.color = raw; rebuild(cd); } return true;
      case 'tcCodeBg': if (cd) { cd.data.effect.bg = raw; rebuild(cd); } return true;
      default: return true;
    }
  };
  TC.act = (id, el) => {
    const [k, arg] = id.split(':');
    const bv = fxOne('bevel');
    const sy = fxOne('symmetry') || TC.editingSym();
    const cd = fxOne('code');
    switch (k) {
      case 'tcBvStyle': if (bv) { bv.data.effect.style = arg; D.bvStyle = arg; rebuild(bv); } return true;
      case 'tcSymMode': if (sy) { sy.data.effect.mode = arg; D.symMode = arg; rebuild(sy); } return true;
      case 'tcSymAxis': if (sy) { sy.data.effect.axis = arg; rebuild(sy); } return true;
      case 'tcSymReflect': if (sy) { sy.data.effect.reflect = !sy.data.effect.reflect; rebuild(sy); } return true;
      case 'tcSymEdit': TC.symEdit(sy); return true;
      case 'tcSymFinish': TC.symFinish(); return true;
      case 'tcCodeEdit': if (cd) TC.codeDialog(cd); return true;
      case 'tcBcText': if (cd) { cd.data.effect.showText = !cd.data.effect.showText; rebuild(cd); } return true;
      case 'tcCodeQuiet': if (cd) { cd.data.effect.quiet = !cd.data.effect.quiet; rebuild(cd); } return true;
      case 'tcCodeNoBg': if (cd) { cd.data.effect.bg = cd.data.effect.bg ? null : '#ffffff'; rebuild(cd); } return true;
      default: return false;
    }
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^tc/.test(n) ? TC.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^tc/.test(id) ? TC.act(id, el) : act0(id, el));

  // the symmetry edit bar goes in front of whatever the property bar shows
  const renderPB0 = UI.renderPropbar;
  UI.renderPropbar = () => {
    renderPB0();
    const pb = document.querySelector('#propbar');
    if (!pb) return;
    let pre = '';
    const g = TC.editingSym();
    if (g) pre += '<span class="pb-title" style="color:var(--accent)">Simetri düzenleniyor</span>' + H.btn('tcSymFinish', 'Bitti', 'Simetri düzenlemeyi bitir', 'primary') + '<span class="pb-sep"></span>';
    if (pre && !pb.querySelector('[data-tc-pre]')) pb.insertAdjacentHTML('afterbegin', '<span data-tc-pre style="display:contents">' + pre + '</span>');
  };
  VP.on('tool', () => UI.schedule('prop'));

  /* ======================================================================
     history: the symmetry being edited is rebuilt before each snapshot
     ====================================================================== */
  const commit0 = VP.commit;
  VP.commit = function () {
    const g = TC.editingSym();
    if (g) TC.buildSym(g);
    return commit0.apply(this, arguments);
  };

  /* ======================================================================
     actions, menus, tools
     ====================================================================== */
  const applySel = (make, name) => () => {
    if (!VP.sel.length) return VP.toast('Önce nesne seçin');
    const res = VP.sel.slice().map((it) => make(it) || it);
    VP.setSelection(res);
    VP.commit();
    VP.toast(name + ' uygulandı');
  };
  const toggle = (k, msgOn, msgOff, after) => () => {
    S[k] = !S[k];
    VP.io.savePrefs();
    if (after) after();
    VP.toast(S[k] ? msgOn : msgOff);
    UI.schedule('prop', 'top');
  };
  Object.assign(A, {
    alignGuides: { label: 'Hizalama kılavuzları', icon: 'alignGuides', checked: () => !!S.alignGuides, run: toggle('alignGuides', 'Hizalama kılavuzları açık', 'Hizalama kılavuzları kapalı') },
    symNew: { label: 'Yeni simetri', icon: 'symmetry', run: () => TC.symCreate() },
    symEdit: { label: 'Simetriyi düzenle', icon: 'node', run: () => TC.symEdit(), enabled: () => !!fxOne('symmetry') },
    symFinish: { label: 'Simetri düzenlemeyi bitir', run: () => TC.symFinish(), enabled: () => !!TC.editingSym() },
    fxBevel: { label: 'Eğim', icon: 'bevel', run: applySel(TC.makeBevel, 'Eğim'), enabled: () => VP.sel.length > 0 },
    insertQR: { label: 'QR kod ekle…', icon: 'qr', run: () => TC.codeDialog(null, 'qr') },
    insertBarcode: { label: 'Barkod ekle…', icon: 'barcode', run: () => TC.codeDialog(null, D.bcKind || 'code128') }
  });
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => x !== '|' && !x.startsWith('h:') && M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };
  ins('view', 'snapObjects', ['alignGuides']);
  ins('effects', 'fxPerspective', ['fxBevel']);
  ins('object', 'createBoundary', ['|', 'h:Ekle', 'insertQR', 'insertBarcode', '|', 'h:Simetri', 'symNew', 'symEdit', 'symFinish']);

  // a symmetry being edited is finished before the document is saved or another page is opened
  ['save', 'saveAs', 'export', 'exportPdf'].forEach((id) => {
    const a = A[id];
    if (!a || a._tc) return;
    const run0 = a.run;
    a.run = function () {
      if (TC.editingSym()) TC.symFinish(null, true);
      return run0.apply(this, arguments);
    };
    a._tc = true;
  });
  // Escape ends symmetry editing
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && TC.editingSym() && !(tool0().busy && tool0().busy()) && !document.querySelector('.modal-wrap')) TC.symFinish();
  });
})();
