/* VektörPad fill tools: interactive (gradient) fill, transparency, mesh fill and smart fill. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const F = (VP.fill = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const P = (a) => Pt(a[0], a[1]);
  const A2 = (p) => [p.x, p.y];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);
  const T = VP.tools;
  const plain = (it) => it && (VP.isPathItem(it) || it instanceof paper.PointText) && !FX.isFx(it);
  const solidOf = (c) => {
    if (!c) return null;
    const s = c.type === 'gradient' ? c.gradient.stops[0].color : c;
    const x = s.clone();
    x.alpha = 1;
    return x;
  };
  const grad = (it) => (it && it.fillColor && it.fillColor.type === 'gradient' ? it.fillColor : null);
  const handleTol = () => (VP.coarse ? 22 : 11) / zoom();
  const drawHandle = (L, p, fill, on, s) => {
    const r = (VP.coarse ? 8 : 6) * s;
    const h = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(p.subtract(r), new paper.Size(r * 2, r * 2)), insert: false });
    h.fillColor = fill;
    h.strokeColor = on ? '#d6362b' : acc();
    h.strokeWidth = (on ? 2.5 : 1.5) * s;
    L.addChild(h);
  };

  /* =============== gradients =============== */
  const setGrad = (it, c0, c1, o, d, radial) => {
    it.fillColor = new paper.Color({ gradient: { stops: [[c0, 0], [c1, 1]], radial: !!radial }, origin: o, destination: d });
  };
  const stopsOf = (it) => {
    const g = grad(it);
    if (g) return g.gradient.stops.map((s) => s.color.clone());
    const base = solidOf(it.fillColor) || new paper.Color('#ffffff');
    const lum = base.convert('gray').gray;
    return [base, new paper.Color(lum > 0.5 ? '#1d1d1b' : '#ffffff')];
  };

  /* Interactive fill: drag across an object to give it a gradient; drag the end squares to move it. */
  T.fillTool = {
    cursor: 'crosshair',
    op: null,
    stop: null,
    busy() { return !!(this.op && this.op.changed); },
    target() { return VP.sel.length === 1 && plain(VP.sel[0]) ? VP.sel[0] : null; },
    deactivate() {
      this.op = null;
      this.stop = null;
    },
    handles(it) {
      const g = grad(it);
      return g ? [{ i: 0, p: g.origin }, { i: 1, p: g.destination }] : [];
    },
    down(e) {
      const t = this.target();
      if (t) {
        const h = this.handles(t).find((x) => x.p.getDistance(e.point) <= handleTol());
        if (h) {
          this.op = { type: 'handle', it: t, i: h.i, changed: false, raw: e.point };
          return;
        }
      }
      const hit = VP.hitItem(e.point);
      if (!hit) {
        this.stop = null;
        return VP.clearSelection();
      }
      if (!plain(hit)) return VP.toast('Etkileşimli dolgu düz şekil ve metinlerde çalışır · Grupları önce çözün');
      if (hit !== t) {
        VP.setSelection([hit]);
        this.stop = null;
      }
      this.op = { type: 'new', it: hit, start: VP.snapPt(e.point), raw: e.point, changed: false, radial: grad(hit) && grad(hit).gradient.radial };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      const p = VP.snapPt(e.point);
      if (!op.changed && op.raw.getDistance(e.point) * zoom() < 6) return;
      if (op.type === 'handle') {
        const g = grad(op.it);
        const st = stopsOf(op.it);
        setGrad(op.it, st[0], st[st.length - 1], op.i === 0 ? p : g.origin, op.i === 1 ? p : g.destination, g.gradient.radial);
      } else {
        const st = stopsOf(op.it);
        setGrad(op.it, st[0], st[st.length - 1], op.start, p, op.radial);
      }
      op.changed = true;
      VP.drawOverlay();
    },
    up() {
      const op = this.op;
      this.op = null;
      if (!op) return;
      if (op.changed) return VP.commit();
      if (op.type === 'handle') {
        this.stop = op.i;
        VP.drawOverlay();
        UI.schedule('prop');
        VP.toast((op.i === 0 ? 'Başlangıç' : 'Bitiş') + ' rengi seçildi · Paletten bir renge dokunun');
      }
    },
    cancel() {
      if (this.op && this.op.changed) VP.undoLive();
      this.op = null;
    },
    overlayAfter(L) {
      const t = this.target();
      const g = grad(t);
      if (!g) return;
      const s = 1 / zoom();
      L.addChild(new paper.Path.Line({ from: g.origin, to: g.destination, strokeColor: acc(), strokeWidth: 1.4 * s, dashArray: [5 * s, 3 * s], insert: false }));
      const st = g.gradient.stops;
      drawHandle(L, g.origin, st[0].color, this.stop === 0, s);
      drawHandle(L, g.destination, st[st.length - 1].color, this.stop === 1, s);
    }
  };
  F.setStopColor = (it, i, hex) => {
    const g = grad(it);
    if (!g) return false;
    const st = stopsOf(it);
    st[i === 0 ? 0 : st.length - 1] = new paper.Color(hex);
    setGrad(it, st[0], st[st.length - 1], g.origin, g.destination, g.gradient.radial);
    return true;
  };
  F.setFillType = (it, type) => {
    const b = it.bounds;
    const st = stopsOf(it);
    if (type === 'none') it.fillColor = null;
    else if (type === 'solid') it.fillColor = solidOf(it.fillColor) || new paper.Color('#ffffff');
    else if (type === 'linear') setGrad(it, st[0], st[st.length - 1], b.leftCenter, b.rightCenter, false);
    else if (type === 'radial') setGrad(it, st[0], st[st.length - 1], b.center, b.center.add(Pt(Math.max(b.width, b.height) / 2, 0)), true);
  };

  /* =============== transparency =============== */
  // data.transp = {type: none|uniform|linear|radial, t0, t1} in percent transparency.
  const applyTransp = (it, o, d) => {
    const tr = it.data.transp || { type: 'none', t0: 0, t1: 100 };
    it.opacity = tr.type === 'uniform' ? 1 - clamp(tr.t0, 0, 100) / 100 : 1;
    const g = grad(it);
    const st = stopsOf(it).map((c) => {
      const x = c.clone();
      x.alpha = 1;
      return x;
    });
    if (tr.type === 'none' || tr.type === 'uniform') {
      // drop any see-through gradient; a one-colour gradient goes back to a flat fill
      if (g && st[0].equals(st[st.length - 1])) it.fillColor = st[0];
      else if (g) setGrad(it, st[0], st[st.length - 1], g.origin, g.destination, g.gradient.radial);
      return;
    }
    const b = it.bounds;
    const c0 = st[0];
    const c1 = g ? st[st.length - 1] : st[0].clone();
    c0.alpha = 1 - clamp(tr.t0, 0, 100) / 100;
    c1.alpha = 1 - clamp(tr.t1, 0, 100) / 100;
    const radial = tr.type === 'radial';
    o = o || (g ? g.origin : radial ? b.center : b.leftCenter);
    d = d || (g ? g.destination : radial ? b.center.add(Pt(Math.max(b.width, b.height) / 2, 0)) : b.rightCenter);
    setGrad(it, c0, c1, o, d, radial);
  };
  F.applyTransp = applyTransp;
  T.transpTool = {
    cursor: 'crosshair',
    op: null,
    busy() { return !!(this.op && this.op.changed); },
    target() { return VP.sel.length === 1 && plain(VP.sel[0]) ? VP.sel[0] : null; },
    down(e) {
      const t = this.target();
      if (t && grad(t) && t.data.transp && t.data.transp.type !== 'uniform') {
        const g = grad(t);
        const h = [g.origin, g.destination].findIndex((p) => p.getDistance(e.point) <= handleTol());
        if (h >= 0) {
          this.op = { type: 'handle', it: t, i: h, raw: e.point, changed: false };
          return;
        }
      }
      const hit = VP.hitItem(e.point);
      if (!hit) return VP.clearSelection();
      if (!plain(hit)) return VP.toast('Şeffaflık aracı düz şekil ve metinlerde çalışır · Düz şeffaflık için Özellikler › Opaklık');
      if (hit !== t) VP.setSelection([hit]);
      this.op = { type: 'new', it: hit, start: VP.snapPt(e.point), raw: e.point, changed: false };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (!op.changed && op.raw.getDistance(e.point) * zoom() < 6) return;
      const p = VP.snapPt(e.point);
      const it = op.it;
      if (op.type === 'handle') {
        const g = grad(it);
        applyTransp(it, op.i === 0 ? p : g.origin, op.i === 1 ? p : g.destination);
      } else {
        const tr = it.data.transp && it.data.transp.type !== 'none' && it.data.transp.type !== 'uniform' ? it.data.transp : { type: 'linear', t0: 0, t1: 100 };
        it.data.transp = Object.assign({}, tr);
        applyTransp(it, op.start, p);
      }
      op.changed = true;
      VP.drawOverlay();
    },
    up() {
      const op = this.op;
      this.op = null;
      if (op && op.changed) {
        VP.commit();
        UI.schedule('prop');
      }
    },
    cancel() {
      if (this.op && this.op.changed) VP.undoLive();
      this.op = null;
    },
    overlayAfter(L) {
      const t = this.target();
      const g = grad(t);
      if (!g || !t.data.transp || t.data.transp.type === 'uniform' || t.data.transp.type === 'none') return;
      const s = 1 / zoom();
      L.addChild(new paper.Path.Line({ from: g.origin, to: g.destination, strokeColor: acc(), strokeWidth: 1.4 * s, dashArray: [5 * s, 3 * s], insert: false }));
      const tr = t.data.transp;
      drawHandle(L, g.origin, new paper.Color(1 - tr.t0 / 100), false, s);
      drawHandle(L, g.destination, new paper.Color(1 - tr.t1 / 100), false, s);
    }
  };

  /* =============== MESH FILL =============== */
  FX.NAMES.mesh = 'Ağ dolgu';
  VP.KIND_NAMES.mesh = 'Ağ dolgu';
  const meshSrc = (g) => g.children.find((c) => c.data.effectSrc);
  const meshRect = (src) => src.bounds;
  const defaultNodes = (r, rows, cols, color) => {
    const n = [];
    for (let i = 0; i <= rows; i++) {
      const row = [];
      for (let j = 0; j <= cols; j++) row.push({ p: [r.left + (r.width * j) / cols, r.top + (r.height * i) / rows], c: color });
      n.push(row);
    }
    return n;
  };
  const lerpC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgb = (hex) => {
    const c = new paper.Color(hex).convert('rgb');
    return [c.red * 255, c.green * 255, c.blue * 255];
  };
  F.buildMesh = (g) => {
    const fx = g.data.effect;
    const src = meshSrc(g);
    if (!src) return;
    g.children.slice().forEach((c) => c !== src && c.remove());
    const r = meshRect(src);
    const all = fx.nodes.flat();
    let minx = r.left;
    let miny = r.top;
    let maxx = r.right;
    let maxy = r.bottom;
    all.forEach((n) => {
      minx = Math.min(minx, n.p[0]);
      miny = Math.min(miny, n.p[1]);
      maxx = Math.max(maxx, n.p[0]);
      maxy = Math.max(maxy, n.p[1]);
    });
    const W = maxx - minx;
    const Hh = maxy - miny;
    if (!(W > 0.5 && Hh > 0.5)) return;
    const res = Math.min(3, 640 / Math.max(W, Hh));
    const cw = Math.max(2, Math.ceil(W * res));
    const ch = Math.max(2, Math.ceil(Hh * res));
    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext('2d');
    const rows = fx.nodes.length - 1;
    const cols = fx.nodes[0].length - 1;
    const sub = Math.max(4, Math.min(16, Math.round(48 / Math.max(rows, cols))));
    const tx = (p) => [(p[0] - minx) * res, (p[1] - miny) * res];
    // each cell is split into small quads; position and colour are interpolated across the cell
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const n00 = fx.nodes[i][j];
        const n01 = fx.nodes[i][j + 1];
        const n10 = fx.nodes[i + 1][j];
        const n11 = fx.nodes[i + 1][j + 1];
        const c00 = rgb(n00.c);
        const c01 = rgb(n01.c);
        const c10 = rgb(n10.c);
        const c11 = rgb(n11.c);
        const pos = (u, v) => {
          const a = lerpC([...n00.p, 0], [...n01.p, 0], u);
          const b = lerpC([...n10.p, 0], [...n11.p, 0], u);
          return tx(lerpC(a, b, v));
        };
        for (let a = 0; a < sub; a++) {
          for (let b = 0; b < sub; b++) {
            const u0 = b / sub;
            const u1 = (b + 1) / sub;
            const v0 = a / sub;
            const v1 = (a + 1) / sub;
            // smoothstep-shaped weights give softer transitions between nodes
            const um = (u0 + u1) / 2;
            const vm = (v0 + v1) / 2;
            const su = um * um * (3 - 2 * um);
            const sv = vm * vm * (3 - 2 * vm);
            const col = lerpC(lerpC(c00, c01, su), lerpC(c10, c11, su), sv);
            const css = 'rgb(' + col.map((x) => Math.round(clamp(x, 0, 255))).join(',') + ')';
            const q = [pos(u0, v0), pos(u1, v0), pos(u1, v1), pos(u0, v1)];
            ctx.beginPath();
            ctx.moveTo(q[0][0], q[0][1]);
            for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]);
            ctx.closePath();
            ctx.fillStyle = css;
            ctx.strokeStyle = css;
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();
          }
        }
      }
    }
    const ras = new paper.Raster({ insert: false });
    ras.setImage(cv);
    ras.scale(1 / res);
    ras.position = Pt(minx + W / 2, miny + Hh / 2);
    const mask = src.clone({ insert: false });
    mask.data = {};
    mask.fillColor = '#000000';
    mask.strokeColor = null;
    mask.shadowColor = null;
    const clip = new paper.Group({ insert: false });
    clip.addChild(mask);
    clip.addChild(ras);
    clip.clipped = true;
    clip.data.meshClip = true;
    clip.insertBelow(src);
  };
  F.mesh = (item, rows = 2, cols = 2) => {
    if (!item || !VP.isPathItem(item) || FX.isFx(item) || (item instanceof paper.Path && !item.closed)) return VP.toast('Ağ dolgu kapalı bir şekle uygulanır');
    const base = solidOf(item.fillColor) || new paper.Color('#ffffff');
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.insertAbove(item);
    g.data.effect = { type: 'mesh', origFill: item.fillColor ? item.exportJSON({ asString: true }) : null, nodes: defaultNodes(item.bounds, rows, cols, base.toCSS(true)) };
    g.addChild(item);
    item.data.effectSrc = true;
    item.fillColor = null;
    F.buildMesh(g);
    VP.setSelection([g]);
    VP.commit();
    VP.toast('Ağ dolgu eklendi · Bir düğüme dokunun, sonra paletten renk seçin · Düğümü sürükleyerek rengi kaydırın');
    return g;
  };
  // Changes the grid size, sampling the old colours so the look is kept.
  F.regrid = (g, rows, cols) => {
    const fx = g.data.effect;
    const old = fx.nodes;
    const R = old.length - 1;
    const C = old[0].length - 1;
    const r = meshRect(meshSrc(g));
    const nodes = defaultNodes(r, rows, cols, '#ffffff');
    nodes.forEach((row, i) => row.forEach((n, j) => {
      const v = (i / rows) * R;
      const u = (j / cols) * C;
      const i0 = Math.min(R - 1, Math.floor(v));
      const j0 = Math.min(C - 1, Math.floor(u));
      const fv = v - i0;
      const fu = u - j0;
      const c = lerpC(lerpC(rgb(old[i0][j0].c), rgb(old[i0][j0 + 1].c), fu), lerpC(rgb(old[i0 + 1][j0].c), rgb(old[i0 + 1][j0 + 1].c), fu), fv);
      n.c = new paper.Color(c[0] / 255, c[1] / 255, c[2] / 255).toCSS(true);
    }));
    fx.nodes = nodes;
    F.buildMesh(g);
  };
  FX.TYPES.mesh = {
    tool: 'meshTool',
    build: (g) => F.buildMesh(g),
    probe(g) {
      const src = meshSrc(g);
      const p = src.clone({ insert: false });
      p.fillColor = g.data.effect.nodes[0][0].c;
      return p;
    },
    restyle(g, fn) {
      const fx = g.data.effect;
      const src = meshSrc(g);
      const p = src.clone({ insert: false });
      const sel = T.meshTool.node && VP.toolId === 'meshTool' ? T.meshTool.node : null;
      p.fillColor = sel ? fx.nodes[sel[0]][sel[1]].c : fx.nodes[0][0].c;
      const before = VP.hex(p.fillColor);
      fn([p]);
      const after = p.fillColor ? VP.hex(p.fillColor) : null;
      if (after && after !== before) {
        if (sel) fx.nodes[sel[0]][sel[1]].c = after;
        else fx.nodes.forEach((row) => row.forEach((n) => (n.c = after)));
      }
      src.strokeColor = p.strokeColor;
      src.strokeWidth = p.strokeWidth;
      src.dashArray = p.dashArray;
      src.data.dash = p.data.dash;
      F.buildMesh(g);
    },
    describe: (g) => 'Ağ dolgu (' + (g.data.effect.nodes.length - 1) + ' × ' + (g.data.effect.nodes[0].length - 1) + ')',
    bake(g) {
      const src = meshSrc(g);
      if (src && !src.strokeColor) src.remove();
    },
    bakeMsg: 'Ağ dolgu ayrıldı · Renk alanı artık kırpılmış bir resim',
    clear(g) {
      const fx = g.data.effect;
      const src = meshSrc(g);
      if (!src) {
        g.remove();
        return [];
      }
      if (fx.origFill) {
        const h = new paper.Group({ insert: false });
        src.fillColor = h.importJSON(fx.origFill).fillColor;
      } else src.fillColor = fx.nodes[0][0].c;
      delete src.data.effectSrc;
      src.transform(g.matrix);
      src.insertAbove(g);
      g.remove();
      return [src];
    },
    clearMsg: 'Ağ dolgu kaldırıldı',
    dblTap(g) {
      VP.setSelection([g]);
      VP.setTool('meshTool');
    },
    fields: (g) => meshFields(g),
    panel: (g) => meshFields(g, true)
  };
  T.meshTool = {
    cursor: 'crosshair',
    op: null,
    node: null,
    busy() { return !!(this.op && this.op.changed); },
    target() {
      const g = VP.sel.length === 1 ? VP.sel[0] : null;
      return FX.of(g) && FX.of(g).type === 'mesh' ? g : null;
    },
    deactivate() {
      this.op = null;
      this.node = null;
    },
    nodeAt(g, pt) {
      const fx = g.data.effect;
      let best = null;
      let bd = handleTol();
      fx.nodes.forEach((row, i) => row.forEach((n, j) => {
        const d = g.localToGlobal(P(n.p)).getDistance(pt);
        if (d < bd) {
          bd = d;
          best = [i, j];
        }
      }));
      return best;
    },
    down(e) {
      const g = this.target();
      if (g) {
        const n = this.nodeAt(g, e.point);
        if (n) {
          this.node = n;
          this.op = { g, n, raw: e.point, changed: false };
          VP.drawOverlay();
          UI.schedule('prop');
          return;
        }
      }
      const hit = VP.hitItem(e.point);
      if (!hit) {
        this.node = null;
        return VP.clearSelection();
      }
      if (FX.of(hit) && FX.of(hit).type === 'mesh') {
        this.node = null;
        return VP.setSelection([hit]);
      }
      this.node = [1, 1];
      F.mesh(hit, VP.defaults.meshRows || 2, VP.defaults.meshCols || 2);
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (!op.changed && op.raw.getDistance(e.point) * zoom() < 4) return;
      const lp = op.g.globalToLocal(VP.snapPt(e.point));
      op.g.data.effect.nodes[op.n[0]][op.n[1]].p = A2(lp);
      op.changed = true;
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        if (op.g.parent) F.buildMesh(op.g);
        VP.drawOverlay();
      });
    },
    up() {
      const op = this.op;
      this.op = null;
      if (op && op.changed) {
        if (this._raf) {
          cancelAnimationFrame(this._raf);
          this._raf = 0;
        }
        F.buildMesh(op.g);
        VP.commit();
      }
    },
    cancel() {
      if (this.op && this.op.changed) VP.undoLive();
      this.op = null;
    },
    overlay(L) {
      const g = this.target();
      if (!g) return false;
      const fx = g.data.effect;
      const s = 1 / zoom();
      const G = (n) => g.localToGlobal(P(n.p));
      fx.nodes.forEach((row, i) => row.forEach((n, j) => {
        if (j < row.length - 1) L.addChild(new paper.Path.Line({ from: G(n), to: G(row[j + 1]), strokeColor: acc(), strokeWidth: s, opacity: 0.7, insert: false }));
        if (i < fx.nodes.length - 1) L.addChild(new paper.Path.Line({ from: G(n), to: G(fx.nodes[i + 1][j]), strokeColor: acc(), strokeWidth: s, opacity: 0.7, insert: false }));
      }));
      fx.nodes.forEach((row, i) => row.forEach((n, j) => {
        const on = this.node && this.node[0] === i && this.node[1] === j;
        const r = (VP.coarse ? 7 : 5) * s * (on ? 1.3 : 1);
        L.addChild(new paper.Path.Circle({ center: G(n), radius: r, fillColor: n.c, strokeColor: on ? '#d6362b' : acc(), strokeWidth: (on ? 2.5 : 1.4) * s, insert: false }));
      }));
      return true;
    }
  };
  const meshFields = (g, panel) => {
    const fx = g.data.effect;
    const n = T.meshTool.node && VP.toolId === 'meshTool' ? T.meshTool.node : null;
    const col = n ? fx.nodes[n[0]][n[1]].c : fx.nodes[0][0].c;
    const f = panel ? H.dfieldPf : H.field;
    const wrap = (x) => (panel ? '<div class="row">' + x + '</div>' : x);
    return (panel ? '' : '<span class="pb-label">Ağ dolgu</span>') +
      wrap(f('Satır', 'flMeshRows', fx.nodes.length - 1, '') + f('Sütun', 'flMeshCols', fx.nodes[0].length - 1, '')) +
      wrap(H.colorField(n ? 'Düğüm' : 'Tüm düğümler', 'flMeshColor', col) + (n ? '' : '<span class="pb-label">Renk vermek için düğüme dokunun</span>')) +
      wrap(H.btn('flMeshEdit', ic('node', 'sm') + 'Düğümleri düzenle', 'Ağ dolgu aracına geç') + H.btn('fxMenu', 'Efekt ▾', 'Ayır veya kaldır')) +
      (panel ? '<p class="sec-note">Düğüm rengi paletten de verilir. Düğümü sürükleyince renk alanı kayar.</p>' : '');
  };

  /* =============== SMART FILL =============== */
  // Fills the area under the tap that is enclosed by overlapping shapes.
  const closedShapes = () => {
    const out = [];
    const walk = (it, m) => {
      if (!it.visible || (it.data && it.data.hitOnly)) return;
      if (FX.isFx(it) || it instanceof paper.Raster || it instanceof paper.PointText) return;
      if (it instanceof paper.CompoundPath || (it instanceof paper.Path && it.closed)) {
        const c = it.clone({ insert: false });
        if (m) c.transform(m);
        out.push(c);
        return;
      }
      if (it.children) it.children.forEach((k) => walk(k, it.applyMatrix ? m : m ? m.clone().append(it.matrix) : it.matrix));
    };
    VP.userLayers().forEach((L) => L.visible && L.children.forEach((it) => walk(it, null)));
    return out;
  };
  F.smartFill = (pt) => {
    const shapes = closedShapes();
    const inside = shapes.filter((s) => s.contains(pt));
    if (!inside.length) return VP.toast('Dokunduğunuz yer kapalı bir alanın içinde değil');
    let region = inside[0];
    try {
      for (let i = 1; i < inside.length; i++) region = region.intersect(inside[i], { insert: false });
      shapes.filter((s) => !inside.includes(s) && s.bounds.intersects(region.bounds)).forEach((s) => {
        region = region.subtract(s, { insert: false });
      });
    } catch (e) {
      return VP.toast('Bu alan doldurulamadı');
    }
    // keep only the piece under the tap when the region falls apart
    if (region instanceof paper.CompoundPath && region.children.length > 1) {
      const parts = region.children.filter((c) => c.contains(pt) || c.clockwise === region.children[0].clockwise);
      const hit = parts.find((c) => c.contains(pt));
      if (hit) {
        const holes = region.children.filter((c) => c !== hit && hit.bounds.contains(c.bounds));
        region = holes.length ? new paper.CompoundPath({ children: [hit.clone({ insert: false }), ...holes.map((h) => h.clone({ insert: false }))], insert: false }) : hit.clone({ insert: false });
      }
    }
    if (!region || region.isEmpty() || Math.abs(region.area) < 0.5) return VP.toast('Bu alan doldurulamadı');
    const d = VP.defaults;
    region.fillColor = new paper.Color(d.smartFill || d.fill || '#a6d8f0');
    region.strokeColor = d.smartStroke ? new paper.Color(d.stroke || '#1d1d1b') : null;
    region.strokeWidth = d.strokeWidth;
    region.data = { label: 'Akıllı dolgu' };
    VP.ensureLayer();
    VP.activeLayer.addChild(region);
    VP.setSelection([region]);
    VP.commit();
    return region;
  };
  T.smartFill = {
    cursor: 'cell',
    busy() { return false; },
    down() {},
    move() {},
    up(e) {
      F.smartFill(e.point);
    },
    cancel() {}
  };

  Object.assign(VP.TOOL_META, {
    fillTool: { label: 'Etkileşimli dolgu', icon: 'fillTool', key: 'G', hint: 'Bir nesnenin üzerinde sürükleyin: geçişli dolgu · Uç karelerini sürükleyin · Uca dokunup paletten renk seçin' },
    meshTool: { label: 'Ağ dolgu', icon: 'meshTool', key: 'M', hint: 'Kapalı bir şekle dokunun · Düğüme dokunun, paletten renk seçin · Düğümü sürükleyin' },
    transpTool: { label: 'Şeffaflık', icon: 'transpTool', key: '', hint: 'Bir nesnenin üzerinde sürükleyin: opaktan saydama geçiş · Tür ve oranlar özellik çubuğunda' },
    smartFill: { label: 'Akıllı dolgu', icon: 'smartFill', key: '', hint: 'Örtüşen şekillerin oluşturduğu bir alana dokunun: o alan yeni bir şekil olarak doldurulur' }
  });
  Object.assign(VP.defaults, { meshRows: 2, meshCols: 2, smartFill: '#a6d8f0', smartStroke: false }, VP.defaults);

  /* =============== property bar =============== */
  const seg = (items, cur, prefix) => '<span class="seg">' + items.map(([v, l]) => '<button data-act="' + prefix + v + '" class="' + (v === cur ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const fillType = (it) => {
    const c = it.fillColor;
    if (!c) return 'none';
    if (c.type === 'gradient') return c.gradient.radial ? 'radial' : 'linear';
    return 'solid';
  };
  F.propbar = () => {
    const id = VP.toolId;
    const one = VP.sel.length === 1 ? VP.sel[0] : null;
    if (id === 'fillTool') {
      if (!one || !plain(one)) return '<span class="pb-title">Etkileşimli dolgu</span><span class="pb-label">Bir nesneye dokunun veya üzerinde sürükleyin</span>';
      const st = stopsOf(one);
      const t = fillType(one);
      return '<span class="pb-title">Etkileşimli dolgu</span>' + seg([['none', 'Yok'], ['solid', 'Düz'], ['linear', 'Doğrusal'], ['radial', 'Dairesel']], t, 'flType:') +
        (t === 'linear' || t === 'radial' ? H.sep + H.colorField('Başlangıç', 'flC0', VP.hex(st[0])) + H.colorField('Bitiş', 'flC1', VP.hex(st[st.length - 1])) + H.btn('flSwap', 'Renkleri değiştir', 'Başlangıç ve bitiş renklerini değiştir') : t === 'solid' ? H.colorField('Renk', 'flC0', VP.hex(one.fillColor)) : '') +
        '<span class="pb-label">Sürükle: yön ve uzunluk</span>';
    }
    if (id === 'transpTool') {
      if (!one || !plain(one)) return '<span class="pb-title">Şeffaflık</span><span class="pb-label">Bir nesneye dokunun veya üzerinde sürükleyin</span>';
      const tr = one.data.transp || { type: one.opacity < 1 ? 'uniform' : 'none', t0: Math.round((1 - one.opacity) * 100), t1: 100 };
      return '<span class="pb-title">Şeffaflık</span>' + seg([['none', 'Yok'], ['uniform', 'Düz'], ['linear', 'Doğrusal'], ['radial', 'Dairesel']], tr.type, 'flTr:') +
        (tr.type === 'uniform' ? H.field('Saydamlık', 'flT0', Math.round(tr.t0), '%') : tr.type !== 'none' ? H.field('Başlangıç', 'flT0', Math.round(tr.t0), '%') + H.field('Bitiş', 'flT1', Math.round(tr.t1), '%') : '') +
        '<span class="pb-label">Anahat saydamlıktan etkilenmez (Düz hariç)</span>';
    }
    if (id === 'meshTool') {
      const g = T.meshTool.target();
      if (!g) return '<span class="pb-title">Ağ dolgu</span>' + H.field('Satır', 'flNewRows', VP.defaults.meshRows, '') + H.field('Sütun', 'flNewCols', VP.defaults.meshCols, '') + '<span class="pb-label">Kapalı bir şekle dokunun</span>';
      return '<span class="pb-title">Ağ dolgu</span>' + meshFields(g);
    }
    if (id === 'smartFill') {
      const d = VP.defaults;
      return '<span class="pb-title">Akıllı dolgu</span>' + H.colorField('Dolgu', 'flSmartFill', d.smartFill) + H.tog('flSmartStroke', 'Anahat', !!d.smartStroke, 'Yeni şekle anahat ver') + '<span class="pb-label">Kapalı bir alanın içine dokunun</span>';
    }
    return null;
  };
  const pb0 = VP.tx.propbar;
  VP.tx.propbar = () => F.propbar() || pb0();
  const target = () => (VP.sel.length === 1 ? VP.sel[0] : null);
  const meshTarget = () => {
    const g = target();
    return FX.of(g) && FX.of(g).type === 'mesh' ? g : null;
  };
  F.propField = (name, raw) => {
    const v = VP.parseNum(raw);
    const hex = UI.normHex(raw);
    const d = VP.defaults;
    const it = target();
    switch (name) {
      case 'flNewRows': if (v >= 1) d.meshRows = clamp(Math.round(v), 1, 12); return true;
      case 'flNewCols': if (v >= 1) d.meshCols = clamp(Math.round(v), 1, 12); return true;
      case 'flSmartFill': if (hex) d.smartFill = hex; return true;
      case 'flC0':
      case 'flC1':
        if (!it || !hex) return true;
        if (grad(it)) F.setStopColor(it, name === 'flC0' ? 0 : 1, hex);
        else it.fillColor = hex;
        break;
      case 'flT0':
      case 'flT1':
        if (!it || !(v >= 0)) return true;
        it.data.transp = Object.assign({ type: 'uniform', t0: 0, t1: 100 }, it.data.transp || {});
        it.data.transp[name === 'flT0' ? 't0' : 't1'] = clamp(v, 0, 100);
        applyTransp(it);
        break;
      case 'flMeshRows':
      case 'flMeshCols': {
        const g = meshTarget();
        if (!g || !(v >= 1)) return true;
        const fx = g.data.effect;
        F.regrid(g, name === 'flMeshRows' ? clamp(Math.round(v), 1, 12) : fx.nodes.length - 1, name === 'flMeshCols' ? clamp(Math.round(v), 1, 12) : fx.nodes[0].length - 1);
        T.meshTool.node = null;
        break;
      }
      case 'flMeshColor': {
        const g = meshTarget();
        if (!g || !hex) return true;
        const n = T.meshTool.node && VP.toolId === 'meshTool' ? T.meshTool.node : null;
        if (n) g.data.effect.nodes[n[0]][n[1]].c = hex;
        else g.data.effect.nodes.forEach((row) => row.forEach((x) => (x.c = hex)));
        F.buildMesh(g);
        break;
      }
      default:
        return false;
    }
    VP.commit();
    VP.drawOverlay();
    return true;
  };
  F.act = (id) => {
    const [k, arg] = id.split(':');
    const it = target();
    switch (k) {
      case 'flType':
        if (!it) return true;
        F.setFillType(it, arg);
        break;
      case 'flSwap': {
        const g = it && grad(it);
        if (!g) return true;
        const st = stopsOf(it);
        setGrad(it, st[st.length - 1], st[0], g.origin, g.destination, g.gradient.radial);
        break;
      }
      case 'flTr':
        if (!it) return true;
        it.data.transp = Object.assign({ t0: arg === 'uniform' ? 50 : 0, t1: 100 }, it.data.transp || {}, { type: arg });
        if (arg === 'uniform' && !(it.data.transp.t0 > 0)) it.data.transp.t0 = 50;
        applyTransp(it);
        break;
      case 'flSmartStroke':
        VP.defaults.smartStroke = !VP.defaults.smartStroke;
        return true;
      case 'flMeshEdit':
        VP.setTool('meshTool');
        return true;
      default:
        return false;
    }
    VP.commit();
    VP.drawOverlay();
    return true;
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^fl/.test(n) ? F.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^fl/.test(id) ? F.act(id, el) : act0(id, el));

  // The palette paints the picked gradient end or mesh node while those tools are active.
  const apply0 = UI.applyColor;
  UI.applyColor = (hex, targetKind) => {
    if (targetKind === 'fill' && hex) {
      const it = target();
      if (VP.toolId === 'fillTool' && T.fillTool.stop != null && it && grad(it)) {
        F.setStopColor(it, T.fillTool.stop, hex);
        VP.commit();
        VP.drawOverlay();
        return;
      }
      const g = meshTarget();
      if (VP.toolId === 'meshTool' && g && T.meshTool.node) {
        const n = T.meshTool.node;
        g.data.effect.nodes[n[0]][n[1]].c = hex;
        F.buildMesh(g);
        VP.commit();
        VP.drawOverlay();
        return;
      }
    }
    return apply0(hex, targetKind);
  };

  Object.assign(VP.actions, {
    fxMesh: { label: 'Ağ dolgu', icon: 'meshTool', run: () => VP.sel[0] && F.mesh(VP.sel[0]) && VP.setTool('meshTool'), enabled: () => VP.sel.length === 1 && VP.isPathItem(VP.sel[0]) && !FX.isFx(VP.sel[0]) }
  });
  const fx = UI.MENUS.effects;
  if (!fx.includes('fxMesh')) fx.splice(fx.indexOf('fxPowerclip') + 1, 0, 'fxMesh');
})();
