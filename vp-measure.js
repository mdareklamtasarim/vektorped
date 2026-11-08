/* VektörPad dimension lines and connectors.
   Both are live Groups (applyMatrix=false, data.effect) whose end points can be linked to objects:
   when a linked object moves, the dimension re-measures and the connector follows. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const mm = H.mm;
  const M = (VP.measure = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const P = (a) => Pt(a[0], a[1]);
  const A2 = (p) => [p.x, p.y];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);

  Object.assign(FX.NAMES, { dimension: 'Ölçü', connector: 'Bağlantı' });
  Object.assign(VP.KIND_NAMES, { dimension: 'Ölçü', connector: 'Bağlantı' });
  const typeOf = (it) => {
    const fx = FX.of(it);
    return fx ? fx.type : null;
  };
  M.is = (it) => typeOf(it) === 'dimension' || typeOf(it) === 'connector';
  const DIM_KINDS = { parallel: 'Paralel ölçü', hv: 'Yatay/dikey ölçü', angular: 'Açısal ölçü', callout: 'Not çizgisi' };
  const CONN_KINDS = { straight: 'Düz', right: 'Dik açılı', round: 'Dik açılı yuvarlatılmış' };

  /* =============== links to objects =============== */
  const uidOf = (it) => {
    if (!it.data.uid) it.data.uid = VP.uid();
    return it.data.uid;
  };
  const linkable = (it) => it && it.visible && !it.locked && !M.is(it) && !(it.data && it.data.hitOnly);
  // Nearest snap feature (bounding-box point or node) of an object near pt.
  M.anchorAt = (pt, opts = {}) => {
    const tol = (VP.coarse ? 14 : 9) / zoom();
    let best = null;
    let bd = tol;
    VP.allSelectable().forEach((it) => {
      if (!linkable(it) || (opts.exclude && opts.exclude.includes(it))) return;
      const b = it.bounds;
      if (!b.expand(tol * 2).contains(pt)) return;
      [0, 0.5, 1].forEach((u) => [0, 0.5, 1].forEach((v) => {
        const p = Pt(b.left + b.width * u, b.top + b.height * v);
        const d = p.getDistance(pt);
        if (d < bd) {
          bd = d;
          best = { pt: p, it, link: { k: 'box', u, v } };
        }
      }));
      if (it instanceof paper.Path && it.segments.length <= 400) {
        it.segments.forEach((s, i) => {
          const d = s.point.getDistance(pt);
          if (d < bd) {
            bd = d;
            best = { pt: s.point.clone(), it, link: { k: 'seg', i } };
          }
        });
      }
    });
    if (best) best.link.id = uidOf(best.it);
    return best;
  };
  // The top object under pt, for connectors (they attach to the object, not to a point).
  M.objectAt = (pt) => {
    const hit = VP.hitItem(pt);
    return linkable(hit) ? hit : null;
  };
  const objMap = () => {
    const m = new Map();
    VP.userLayers().forEach((L) => L.children.forEach((it) => it.data && it.data.uid && !m.has(it.data.uid) && m.set(it.data.uid, it)));
    return m;
  };
  const resolve = (link, map) => {
    const it = link && map.get(link.id);
    if (!it || !it.parent) return null;
    if (link.k === 'seg') {
      const s = it.segments && it.segments[link.i];
      return s ? s.point.clone() : it.bounds.center;
    }
    if (link.k === 'box') {
      const b = it.bounds;
      return Pt(b.left + b.width * link.u, b.top + b.height * link.v);
    }
    return it.bounds.center;
  };
  const items = () => {
    const out = [];
    VP.userLayers().forEach((L) => L.getItems({ match: (it) => M.is(it) }).forEach((g) => out.push(g)));
    return out;
  };
  // Pulls linked end points to their objects; returns true when something moved.
  M.updateLinks = () => {
    const list = items();
    if (!list.length) return false;
    const map = objMap();
    let any = false;
    list.forEach((g) => {
      const fx = g.data.effect;
      let changed = false;
      ['a', 'b', 'c'].forEach((k) => {
        const L = fx['l' + k];
        if (!L || L.k === 'auto') return;
        const gp = resolve(L, map);
        if (!gp) {
          fx['l' + k] = null;
          return;
        }
        const lp = g.globalToLocal(gp);
        if (!fx[k] || Math.abs(fx[k][0] - lp.x) > 1e-4 || Math.abs(fx[k][1] - lp.y) > 1e-4) {
          fx[k] = A2(lp);
          changed = true;
        }
      });
      if (fx.type === 'connector' && (fx.la || fx.lb)) changed = true;
      if (changed) {
        build(g, map);
        any = true;
      }
    });
    return any;
  };
  let linkRaf = 0;
  VP.on('transform', () => {
    if (linkRaf) return;
    linkRaf = requestAnimationFrame(() => {
      linkRaf = 0;
      if (M.updateLinks()) VP.drawOverlay();
    });
  });
  const commit0 = VP.commit;
  VP.commit = function () {
    M.updateLinks();
    return commit0.apply(this, arguments);
  };

  /* =============== drawing helpers =============== */
  const headSize = (fx) => Math.max(3, (fx.size || 8) * 0.45 + (fx.lw || 0.5) * 1.5);
  const head = (fx, tip, dir, col, style) => {
    // dir points from the tip back along the line
    const s = headSize(fx);
    style = style || fx.arrows || 'arrow';
    if (style === 'none') return null;
    if (style === 'dot') return new paper.Path.Circle({ center: tip, radius: s * 0.28, fillColor: col, insert: false });
    if (style === 'tick') {
      const t = dir.rotate(45).multiply(s * 0.55);
      return new paper.Path.Line({ from: tip.subtract(t), to: tip.add(t), strokeColor: col, strokeWidth: Math.max(fx.lw || 0.5, 0.6) * 1.6, insert: false });
    }
    const n = dir.rotate(90).multiply(s * 0.36);
    const back = tip.add(dir.multiply(s));
    return new paper.Path({ segments: [tip, back.add(n), back.subtract(n)], closed: true, fillColor: col, insert: false });
  };
  const label = (fx, val, unit) => (fx.pre || '') + VP.num(val, fx.prec == null ? 1 : fx.prec) + (unit && fx.units !== false ? unit : '') + (fx.suf || '');
  const textAt = (fx, s, at, angle, col, just = 'center') => {
    const t = new paper.PointText({ point: at, content: s, justification: just, fontFamily: fx.font || 'Fira Sans', fontSize: fx.size || 8, fillColor: col, insert: false });
    if (angle) t.rotate(angle, at);
    return t;
  };
  const readable = (ang) => {
    let a = ((ang % 360) + 360) % 360;
    if (a > 90 && a <= 270) a -= 180;
    if (a > 180) a -= 360;
    return a;
  };
  const lineSet = (segs, fx, col) => {
    const kids = segs.map((s) => new paper.Path({ segments: s, insert: false }));
    const cp = new paper.CompoundPath({ children: kids, insert: false });
    cp.fillColor = null;
    cp.strokeColor = col;
    cp.strokeWidth = fx.lw || 0.5;
    cp.strokeCap = 'butt';
    return cp;
  };

  /* =============== DIMENSIONS =============== */
  const buildDim = (g) => {
    const fx = g.data.effect;
    g.removeChildren();
    const col = new paper.Color(fx.color || '#1d1d1b');
    const A = P(fx.a);
    const B = P(fx.b);
    const gap = 1.5;
    const over = 2.5;
    const segs = [];
    const add = (...x) => x.forEach((it) => it && g.addChild(it));
    if (fx.kind === 'angular') {
      const V = P(fx.c);
      const va = A.subtract(V);
      const vb = B.subtract(V);
      if (va.length < 1e-6 || vb.length < 1e-6) return;
      let a0 = va.angle;
      let sweep = vb.angle - a0;
      sweep = ((sweep % 360) + 360) % 360;
      if (sweep > 180) {
        a0 = vb.angle;
        sweep = 360 - sweep;
      }
      const r = Math.max(4, fx.offset || 20);
      const ptAt = (deg) => V.add(Pt(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)).multiply(r));
      const arc = [];
      const n = Math.max(8, Math.ceil(sweep / 4));
      for (let i = 0; i <= n; i++) arc.push(ptAt(a0 + (sweep * i) / n));
      segs.push(arc);
      // rays reach the arc when it lies beyond the measured legs
      [va, vb].forEach((v) => {
        if (fx.ext !== false && r > v.length) segs.push([V.add(v.normalize(v.length + gap)), V.add(v.normalize(r + over))]);
      });
      add(lineSet(segs, fx, col));
      const p0 = ptAt(a0);
      const p1 = ptAt(a0 + sweep);
      add(head(fx, p0, Pt(Math.cos(((a0 + 90) * Math.PI) / 180), Math.sin(((a0 + 90) * Math.PI) / 180)), col));
      add(head(fx, p1, Pt(Math.cos(((a0 + sweep - 90) * Math.PI) / 180), Math.sin(((a0 + sweep - 90) * Math.PI) / 180)), col));
      const mid = a0 + sweep / 2;
      const md = Pt(Math.cos((mid * Math.PI) / 180), Math.sin((mid * Math.PI) / 180));
      const tp = V.add(md.multiply(r + (fx.size || 8) * 0.9));
      const t = textAt(fx, label(fx, sweep, '°'), tp, 0, col);
      t.position = tp;
      add(t);
      fx.value = sweep;
      return;
    }
    if (fx.kind === 'callout') {
      const s = fx.size || 8;
      const right = B.x >= A.x;
      const sh = B.add(Pt(right ? s * 1.2 : -s * 1.2, 0));
      segs.push([A, B, sh]);
      add(lineSet(segs, fx, col));
      const d = B.subtract(A);
      if (d.length > 1e-6) add(head(fx, A, d.normalize(), col));
      const t = textAt(fx, fx.text || ' ', sh.add(Pt(right ? s * 0.4 : -s * 0.4, s * 0.35)), 0, col, right ? 'left' : 'right');
      add(t);
      return;
    }
    // linear: parallel or horizontal/vertical
    let a1;
    let b1;
    let val;
    if (fx.kind === 'hv') {
      if (fx.axis === 'v') {
        const x = A.x + (fx.offset || 0);
        a1 = Pt(x, A.y);
        b1 = Pt(x, B.y);
        val = Math.abs(B.y - A.y);
      } else {
        const y = A.y + (fx.offset || 0);
        a1 = Pt(A.x, y);
        b1 = Pt(B.x, y);
        val = Math.abs(B.x - A.x);
      }
    } else {
      const d = B.subtract(A);
      if (d.length < 1e-6) return;
      const n = d.normalize().rotate(-90);
      a1 = A.add(n.multiply(fx.offset || 0));
      b1 = B.add(n.multiply(fx.offset || 0));
      val = d.length;
    }
    fx.value = VP.toMM(val);
    const ext = (from, to) => {
      const v = to.subtract(from);
      if (v.length < gap + 0.5) return;
      const u = v.normalize();
      segs.push([from.add(u.multiply(gap)), to.add(u.multiply(over))]);
    };
    if (fx.ext !== false) {
      ext(A, a1);
      ext(B, b1);
    }
    segs.push([a1, b1]);
    add(lineSet(segs, fx, col));
    const dl = b1.subtract(a1);
    if (dl.length > 1e-6) {
      const u = dl.normalize();
      add(head(fx, a1, u, col));
      add(head(fx, b1, u.multiply(-1), col));
    }
    const ang = readable(dl.length > 1e-6 ? dl.angle : 0);
    const up = Pt(Math.cos((ang * Math.PI) / 180), Math.sin((ang * Math.PI) / 180)).rotate(-90);
    const mid = a1.add(b1).divide(2);
    add(textAt(fx, label(fx, VP.toMM(val), ' mm'), mid.add(up.multiply((fx.size || 8) * 0.35 + 1)), ang, col));
  };

  /* =============== CONNECTORS =============== */
  const side = (b, other, horiz) => (horiz ? (other.x >= b.center.x ? b.rightCenter : b.leftCenter) : other.y >= b.center.y ? b.bottomCenter : b.topCenter);
  const buildConn = (g, map) => {
    const fx = g.data.effect;
    map = map || objMap();
    g.removeChildren();
    const col = new paper.Color(fx.color || '#1d1d1b');
    const objA = fx.la ? map.get(fx.la.id) : null;
    const objB = fx.lb ? map.get(fx.lb.id) : null;
    if (fx.la && !objA) fx.la = null;
    if (fx.lb && !objB) fx.lb = null;
    // reference points in page space
    let ga = objA ? objA.bounds.center : g.localToGlobal(P(fx.a));
    let gb = objB ? objB.bounds.center : g.localToGlobal(P(fx.b));
    const horiz = Math.abs(gb.x - ga.x) >= Math.abs(gb.y - ga.y);
    if (objA) ga = side(objA.bounds, gb, horiz);
    if (objB) gb = side(objB.bounds, ga, horiz);
    if (objA && objB && fx.kind === 'straight') {
      // straight lines leave from the side facing the other object
      ga = side(objA.bounds, objB.bounds.center, horiz);
      gb = side(objB.bounds, objA.bounds.center, horiz);
    }
    const a = g.globalToLocal(ga);
    const b = g.globalToLocal(gb);
    fx.a = A2(a);
    fx.b = A2(b);
    let pts;
    if (fx.kind === 'straight') pts = [a, b];
    else if (horiz) {
      const mx = (a.x + b.x) / 2;
      pts = [a, Pt(mx, a.y), Pt(mx, b.y), b];
    } else {
      const my = (a.y + b.y) / 2;
      pts = [a, Pt(a.x, my), Pt(b.x, my), b];
    }
    pts = pts.filter((p, i) => i === 0 || p.getDistance(pts[i - 1]) > 1e-6);
    const path = new paper.Path({ insert: false });
    if (fx.kind === 'round' && pts.length > 2) {
      path.add(pts[0]);
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        const din = p.subtract(pts[i - 1]);
        const dout = pts[i + 1].subtract(p);
        const r = Math.min(fx.radius || VP.toPT(4), din.length / 2, dout.length / 2);
        path.lineTo(p.subtract(din.normalize(r)));
        path.quadraticCurveTo(p, p.add(dout.normalize(r)));
      }
      path.lineTo(pts[pts.length - 1]);
    } else pts.forEach((p) => path.add(p));
    path.strokeColor = col;
    path.strokeWidth = fx.lw || 1;
    path.strokeJoin = 'round';
    path.fillColor = null;
    path.data.connLine = true;
    g.addChild(path);
    const n = pts.length;
    if (n >= 2) {
      const hs = { size: 8, lw: fx.lw || 1 };
      if (fx.arrowEnd) {
        const h = head(hs, pts[n - 1], pts[n - 2].subtract(pts[n - 1]).normalize(), col, 'arrow');
        if (h) g.addChild(h);
      }
      if (fx.arrowStart) {
        const h = head(hs, pts[0], pts[1].subtract(pts[0]).normalize(), col, 'arrow');
        if (h) g.addChild(h);
      }
    }
  };

  const build = (g, map) => (g.data.effect.type === 'connector' ? buildConn(g, map) : buildDim(g));
  M.build = build;
  const newGroup = (fx) => {
    VP.ensureLayer();
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.data.effect = fx;
    VP.activeLayer.addChild(g);
    return g;
  };
  M.createDim = (kind, a, b, extra = {}) => {
    // parallel dimensions sit on the left-hand side of A→B (above a left-to-right line); h/v ones above or left
    const fx = Object.assign({ type: 'dimension', kind, a: A2(a), b: A2(b), offset: (kind === 'hv' ? -1 : 1) * VP.toPT(8), prec: 1, units: true, size: 8, color: '#1d1d1b', lw: 0.5, arrows: 'arrow', ext: true, pre: '', suf: '' }, extra);
    const g = newGroup(fx);
    buildDim(g);
    return g;
  };
  M.createConn = (kind, a, b, la, lb) => {
    const fx = { type: 'connector', kind, a: A2(a), b: A2(b), la: la ? { id: uidOf(la), k: 'auto' } : null, lb: lb ? { id: uidOf(lb), k: 'auto' } : null, radius: VP.toPT(4), arrowEnd: true, arrowStart: false, color: '#1d1d1b', lw: 1 };
    const g = newGroup(fx);
    buildConn(g);
    return g;
  };

  /* =============== effect-framework registration =============== */
  const restyle = (g, fn) => {
    const fx = g.data.effect;
    const p = new paper.Path.Line({ from: [0, 0], to: [10, 0], insert: false });
    const c = new paper.Color(fx.color || '#1d1d1b');
    p.strokeColor = c;
    p.fillColor = c.clone();
    p.strokeWidth = fx.lw;
    const before = { s: VP.hex(p.strokeColor), f: VP.hex(p.fillColor), w: p.strokeWidth };
    fn([p]);
    const s = p.strokeColor ? VP.hex(p.strokeColor) : null;
    const f = p.fillColor ? VP.hex(p.fillColor) : null;
    if (s && s !== before.s) fx.color = s;
    else if (f && f !== before.f) fx.color = f;
    if (p.strokeWidth > 0 && p.strokeWidth !== before.w) fx.lw = p.strokeWidth;
    build(g);
  };
  const probe = (g) => {
    const fx = g.data.effect;
    const p = new paper.Path.Line({ from: [0, 0], to: [10, 0], insert: false });
    p.strokeColor = new paper.Color(fx.color || '#1d1d1b');
    p.fillColor = new paper.Color(fx.color || '#1d1d1b');
    p.strokeWidth = fx.lw;
    return p;
  };
  // Scaling moves the free end points; text and line weights stay crisp.
  const scale = (g, sx, sy, anchor) => {
    const fx = g.data.effect;
    ['a', 'b', 'c'].forEach((k) => {
      if (!fx[k] || fx['l' + k]) return;
      const gp = g.localToGlobal(P(fx[k]));
      fx[k] = A2(g.globalToLocal(anchor.add(gp.subtract(anchor).multiply(Pt(sx, sy)))));
    });
    if (fx.type === 'dimension' && fx.offset) fx.offset *= fx.kind === 'hv' ? (fx.axis === 'v' ? Math.abs(sx) : Math.abs(sy)) : Math.sqrt(Math.abs(sx * sy));
    build(g);
    return true;
  };
  const describeDim = (g) => {
    const fx = g.data.effect;
    if (fx.kind === 'callout') return 'Not: “' + String(fx.text || '').slice(0, 16) + '”';
    if (fx.kind === 'angular') return 'Açısal ölçü: ' + VP.num(fx.value || 0, fx.prec) + '°';
    return (fx.kind === 'hv' ? (fx.axis === 'v' ? 'Dikey' : 'Yatay') : 'Paralel') + ' ölçü: ' + VP.num(fx.value || 0, fx.prec) + ' mm';
  };
  FX.TYPES.dimension = {
    tool: 'dimParallel',
    build: (g) => buildDim(g),
    probe,
    restyle,
    scale,
    describe: describeDim,
    bakeMsg: 'Ölçü, düz nesne grubuna dönüştürüldü',
    clear(g) {
      FX.bake(g);
      return [g];
    },
    clearMsg: 'Ölçü, düz nesne grubuna dönüştürüldü',
    dblTap(g) {
      const fx = g.data.effect;
      if (fx.kind === 'callout') return M.editCallout(g);
      VP.setSelection([g]);
      VP.setTool(fx.kind === 'angular' ? 'dimAngular' : fx.kind === 'hv' ? 'dimHV' : 'dimParallel');
    },
    fields: (g) => dimFields(g),
    panel: (g) => dimPanel(g)
  };
  FX.TYPES.connector = {
    tool: 'connStraight',
    build: (g) => buildConn(g),
    probe,
    restyle,
    scale,
    describe: (g) => CONN_KINDS[g.data.effect.kind] + ' bağlantı' + (g.data.effect.la && g.data.effect.lb ? '' : ' (serbest uç)'),
    bakeMsg: 'Bağlantı, düz nesne grubuna dönüştürüldü',
    clear(g) {
      FX.bake(g);
      return [g];
    },
    clearMsg: 'Bağlantı, düz nesne grubuna dönüştürüldü',
    dblTap(g) {
      VP.setSelection([g]);
      VP.setTool({ straight: 'connStraight', right: 'connRight', round: 'connRound' }[g.data.effect.kind]);
    },
    fields: (g) => connFields(g),
    panel: (g) => connPanel(g)
  };
  M.editCallout = (g, isNew) => {
    const fx = g.data.effect;
    VP.setSelection([g]);
    VP.tx.openEditor({
      target: g,
      title: 'Not metni',
      note: 'Enter: yeni satır',
      get: () => fx.text || '',
      set: (v) => {
        fx.text = v;
        buildDim(g);
      },
      bounds: () => g.bounds,
      done: (v, changed) => {
        if (!g.parent) return;
        if (!String(v).trim() && isNew) {
          g.remove();
          VP.setSelection([]);
          return;
        }
        if (changed || isNew) VP.commit();
      }
    });
  };

  /* =============== tools =============== */
  const T = VP.tools;
  const selOf = (pred) => (VP.sel.length === 1 && pred(VP.sel[0]) ? VP.sel[0] : null);
  const handlePts = (g) => {
    const fx = g.data.effect;
    const out = [];
    const G = (a) => g.localToGlobal(P(a));
    if (fx.type === 'connector') {
      out.push({ k: 'a', p: G(fx.a) }, { k: 'b', p: G(fx.b) });
      return out;
    }
    if (fx.kind === 'angular') {
      out.push({ k: 'c', p: G(fx.c) }, { k: 'a', p: G(fx.a) }, { k: 'b', p: G(fx.b) });
      const V = P(fx.c);
      const va = P(fx.a).subtract(V);
      const vb = P(fx.b).subtract(V);
      const mid = va.normalize().add(vb.normalize());
      const dir = mid.length > 1e-6 ? mid.normalize() : va.normalize().rotate(90);
      out.push({ k: 'off', p: g.localToGlobal(V.add(dir.multiply(fx.offset || 20))) });
      return out;
    }
    out.push({ k: 'a', p: G(fx.a) }, { k: 'b', p: G(fx.b) });
    if (fx.kind === 'callout') return out;
    const A = P(fx.a);
    const B = P(fx.b);
    let m;
    if (fx.kind === 'hv') m = fx.axis === 'v' ? Pt(A.x + fx.offset, (A.y + B.y) / 2) : Pt((A.x + B.x) / 2, A.y + fx.offset);
    else m = A.add(B).divide(2).add(B.subtract(A).normalize().rotate(-90).multiply(fx.offset || 0));
    out.push({ k: 'off', p: g.localToGlobal(m) });
    return out;
  };
  const handleAt = (g, pt) => {
    const tol = (VP.coarse ? 22 : 11) / zoom();
    let best = null;
    let bd = tol;
    handlePts(g).forEach((h) => {
      const d = h.p.getDistance(pt);
      if (d < bd) {
        bd = d;
        best = h;
      }
    });
    return best;
  };
  const drawHandles = (L, g) => {
    const s = 1 / zoom();
    const r = (VP.coarse ? 7 : 5) * s;
    L.addChild(new paper.Path.Rectangle({ rectangle: g.bounds.expand(4 * s), strokeColor: acc(), strokeWidth: s, dashArray: [4 * s, 3 * s], opacity: 0.6, insert: false }));
    const fx = g.data.effect;
    handlePts(g).forEach((h) => {
      const linked = !!fx['l' + h.k];
      const shape = h.k === 'off' ? new paper.Path.RegularPolygon({ center: h.p, sides: 4, radius: r * 1.25, insert: false }) : new paper.Path.Circle({ center: h.p, radius: r, insert: false });
      shape.fillColor = linked ? acc() : new paper.Color('#ffffff');
      shape.strokeColor = acc();
      shape.strokeWidth = 1.4 * s;
      L.addChild(shape);
    });
  };
  // Snaps an end point to a nearby object feature (dimension) or object (connector).
  const pick = (pt, conn, exclude) => {
    if (conn) {
      const it = M.objectAt(pt);
      if (it && !(exclude && exclude.includes(it))) return { pt: it.bounds.center, obj: it };
      return { pt: VP.snapPt(pt) };
    }
    const a = M.anchorAt(pt, { exclude });
    return a ? { pt: a.pt, link: a.link } : { pt: VP.snapPt(pt) };
  };
  const dragHandle = (g, h, pt) => {
    const fx = g.data.effect;
    const conn = fx.type === 'connector';
    if (h.k === 'off') {
      const lp = g.globalToLocal(pt);
      if (fx.kind === 'angular') fx.offset = Math.max(4, lp.getDistance(P(fx.c)));
      else if (fx.kind === 'hv') fx.offset = fx.axis === 'v' ? lp.x - fx.a[0] : lp.y - fx.a[1];
      else {
        const A = P(fx.a);
        const n = P(fx.b).subtract(A).normalize().rotate(-90);
        fx.offset = lp.subtract(A).dot(n) - (0);
      }
      build(g);
      return;
    }
    const r = pick(pt, conn, [g]);
    if (conn) {
      fx['l' + h.k] = r.obj ? { id: uidOf(r.obj), k: 'auto' } : null;
      if (!r.obj) fx[h.k] = A2(g.globalToLocal(r.pt));
    } else {
      fx['l' + h.k] = r.link || null;
      fx[h.k] = A2(g.globalToLocal(r.pt));
    }
    build(g);
  };
  const drawPreview = (L, pts, closed) => {
    const s = 1 / zoom();
    const p = new paper.Path({ segments: pts, closed: !!closed, strokeColor: acc(), strokeWidth: 1.4 * s, dashArray: [5 * s, 3 * s], insert: false });
    L.addChild(p);
    pts.forEach((q) => L.addChild(new paper.Path.Circle({ center: q, radius: 3.5 * s, fillColor: acc(), insert: false })));
  };
  const snapMark = (L, pt) => {
    if (!pt) return;
    const s = 1 / zoom();
    L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(pt.subtract(5 * s), new paper.Size(10 * s, 10 * s)), strokeColor: '#d6362b', strokeWidth: 1.5 * s, insert: false }));
  };

  /* dimension tools: drag from point to point; drag the square handle to move the dimension line */
  const dimTool = (kind) => ({
    cursor: 'crosshair',
    op: null,
    busy() { return !!(this.op && this.op.changed); },
    target() { return selOf((it) => typeOf(it) === 'dimension'); },
    deactivate() {
      this.op = null;
      this.ang = null;
    },
    down(e) {
      const g = this.target();
      if (g) {
        const h = handleAt(g, e.point);
        if (h) {
          this.op = { type: 'handle', g, h, changed: false };
          return;
        }
      }
      if (kind === 'segment') {
        this.op = { type: 'tap', pt: e.point };
        return;
      }
      if (kind === 'angular' && this.ang) {
        this.op = { type: 'ang', pt: e.point };
        return;
      }
      const r = pick(e.point, false);
      this.op = { type: 'new', a: r, b: r, raw: e.point, moved: false };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (op.type === 'handle') {
        dragHandle(op.g, op.h, e.point);
        op.changed = true;
        VP.drawOverlay();
        return;
      }
      if (op.type === 'new') {
        if (!op.moved && op.raw.getDistance(e.point) * zoom() < 6) return;
        op.moved = true;
        op.b = pick(e.point, false);
        VP.drawOverlay();
      }
      if (op.type === 'ang') {
        op.cur = pick(e.point, false);
        VP.drawOverlay();
      }
    },
    up(e) {
      const op = this.op;
      this.op = null;
      if (!op) return;
      if (op.type === 'handle') {
        if (op.changed) VP.commit();
        return;
      }
      if (op.type === 'tap') return this.segmentAt(op.pt);
      if (kind === 'angular') return this.angularStep(op, e);
      if (!op.moved) {
        const hit = VP.hitItem(e.point);
        VP.setSelection(hit && typeOf(hit) === 'dimension' ? [hit] : []);
        return;
      }
      const A = op.a.pt;
      const B = op.b.pt;
      if (A.getDistance(B) * zoom() < 6) return VP.drawOverlay();
      const extra = { la: op.a.link || null, lb: op.b.link || null };
      if (kind === 'hv') extra.axis = Math.abs(B.x - A.x) >= Math.abs(B.y - A.y) ? 'h' : 'v';
      if (kind === 'callout') {
        const g = M.createDim('callout', A, B, Object.assign(extra, { text: '', lb: null, arrows: 'arrow' }));
        return M.editCallout(g, true);
      }
      const g = M.createDim(kind === 'hv' ? 'hv' : 'parallel', A, B, extra);
      VP.setSelection([g]);
      VP.commit();
      VP.toast('Ölçü eklendi · Kare tutamaçla ölçü çizgisini taşıyın' + (extra.la || extra.lb ? ' · Nesneye bağlandı' : ''));
    },
    angularStep(op) {
      // first a drag from the vertex along one leg (or two taps), then a tap on the second leg
      if (op.type === 'new') {
        if (op.moved && op.a.pt.getDistance(op.b.pt) * zoom() >= 6) {
          this.ang = { c: op.a, a: op.b };
          VP.toast('Şimdi ikinci kolun ucuna dokunun');
        } else {
          this.ang = { c: op.a };
          VP.toast('Köşe seçildi · Şimdi birinci kolun ucuna dokunun');
        }
        VP.drawOverlay();
        return;
      }
      const r = op.cur || pick(op.pt, false);
      const st = this.ang;
      if (!st.a) {
        st.a = r;
        VP.toast('Şimdi ikinci kolun ucuna dokunun');
        VP.drawOverlay();
        return;
      }
      this.ang = null;
      const V = st.c.pt;
      const rad = 0.6 * Math.min(st.a.pt.getDistance(V), r.pt.getDistance(V));
      const g = M.createDim('angular', st.a.pt, r.pt, { c: A2(V), lc: st.c.link || null, la: st.a.link || null, lb: r.link || null, offset: Math.max(rad, VP.toPT(6)), prec: 1 });
      VP.setSelection([g]);
      VP.commit();
      VP.toast('Açı ölçüldü: ' + VP.num(g.data.effect.value, 1) + '°');
    },
    segmentAt(pt) {
      const hit = VP.hitItem(pt);
      if (!hit || !(hit instanceof paper.Path || hit instanceof paper.CompoundPath)) return VP.toast('Ölçmek için bir eğrinin kenarına dokunun');
      const loc = hit.getNearestLocation(pt);
      if (!loc || !loc.curve) return;
      const c = loc.curve;
      const a = c.point1;
      const b = c.point2;
      const top = hit instanceof paper.Path ? hit : null;
      const extra = {};
      if (top) {
        const id = uidOf(top);
        extra.la = { id, k: 'seg', i: c.segment1.index };
        extra.lb = { id, k: 'seg', i: c.segment2.index };
      }
      const n = b.subtract(a).normalize().rotate(-90);
      const out = a.add(b).divide(2).subtract(hit.bounds.center).dot(n) >= 0 ? 1 : -1;
      const g = M.createDim('parallel', a, b, Object.assign(extra, { offset: out * VP.toPT(6) }));
      VP.setSelection([g]);
      VP.commit();
      VP.toast('Kenar ölçüldü: ' + VP.num(g.data.effect.value, 1) + ' mm');
    },
    cancel() {
      if (this.op && this.op.type === 'handle' && this.op.changed) VP.undoLive();
      this.op = null;
      this.ang = null;
      VP.drawOverlay();
    },
    overlay(L) {
      const op = this.op;
      if (op && op.type === 'new' && op.moved) {
        snapMark(L, op.a.link ? op.a.pt : null);
        snapMark(L, op.b.link ? op.b.pt : null);
        if (kind === 'hv') {
          const A = op.a.pt;
          const B = op.b.pt;
          drawPreview(L, Math.abs(B.x - A.x) >= Math.abs(B.y - A.y) ? [A, Pt(B.x, A.y)] : [A, Pt(A.x, B.y)]);
        } else drawPreview(L, [op.a.pt, op.b.pt]);
        return true;
      }
      if (this.ang) {
        const pts = [this.ang.a ? this.ang.a.pt : null, this.ang.c.pt, op && op.cur ? op.cur.pt : null].filter(Boolean);
        drawPreview(L, pts);
        return true;
      }
      const g = this.target();
      if (g) {
        drawHandles(L, g);
        return true;
      }
      return false;
    }
  });
  T.dimParallel = dimTool('parallel');
  T.dimHV = dimTool('hv');
  T.dimAngular = dimTool('angular');
  T.dimSegment = dimTool('segment');
  T.dimCallout = dimTool('callout');

  /* connector tools: drag from one object to another */
  const connTool = (kind) => ({
    cursor: 'crosshair',
    op: null,
    busy() { return !!(this.op && this.op.changed); },
    target() { return selOf((it) => typeOf(it) === 'connector'); },
    down(e) {
      const g = this.target();
      if (g) {
        const h = handleAt(g, e.point);
        if (h) {
          this.op = { type: 'handle', g, h, changed: false };
          return;
        }
      }
      const r = pick(e.point, true);
      this.op = { type: 'new', a: r, b: r, raw: e.point, moved: false };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (op.type === 'handle') {
        dragHandle(op.g, op.h, e.point);
        op.changed = true;
        VP.drawOverlay();
        return;
      }
      if (!op.moved && op.raw.getDistance(e.point) * zoom() < 6) return;
      op.moved = true;
      op.b = pick(e.point, true, op.a.obj ? [op.a.obj] : null);
      op.end = e.point;
      VP.drawOverlay();
    },
    up(e) {
      const op = this.op;
      this.op = null;
      if (!op) return;
      if (op.type === 'handle') {
        if (op.changed) VP.commit();
        return;
      }
      if (!op.moved) {
        const hit = VP.hitItem(e.point);
        VP.setSelection(hit && typeOf(hit) === 'connector' ? [hit] : []);
        return;
      }
      if (op.a.obj && op.b.obj === op.a.obj) return VP.drawOverlay();
      if (!op.a.obj && !op.b.obj && op.a.pt.getDistance(op.b.pt) * zoom() < 8) return VP.drawOverlay();
      const g = M.createConn(kind, op.a.pt, op.b.pt, op.a.obj || null, op.b.obj || null);
      VP.setSelection([g]);
      VP.commit();
      VP.toast(op.a.obj && op.b.obj ? 'Bağlantı eklendi · Nesneleri taşıyınca çizgi takip eder' : 'Bağlantı eklendi · Uçları bir nesneye sürükleyerek bağlayın');
    },
    cancel() {
      if (this.op && this.op.type === 'handle' && this.op.changed) VP.undoLive();
      this.op = null;
      VP.drawOverlay();
    },
    overlay(L) {
      const op = this.op;
      if (op && op.type === 'new' && op.moved) {
        const s = 1 / zoom();
        [op.a.obj, op.b.obj].forEach((o) => o && L.addChild(new paper.Path.Rectangle({ rectangle: o.bounds.expand(3 * s), strokeColor: acc(), strokeWidth: 1.5 * s, insert: false })));
        drawPreview(L, [op.a.pt, op.b.obj ? op.b.pt : op.end]);
        return true;
      }
      const g = this.target();
      if (g) {
        drawHandles(L, g);
        return true;
      }
      return false;
    }
  });
  T.connStraight = connTool('straight');
  T.connRight = connTool('right');
  T.connRound = connTool('round');

  Object.assign(VP.TOOL_META, {
    dimParallel: { label: 'Paralel ölçü', icon: 'dimParallel', key: '', hint: 'İki nokta arasında sürükleyin · Nesne köşelerine ve düğümlerine yapışır · Kare tutamaç: ölçü çizgisini taşı' },
    dimHV: { label: 'Yatay/dikey ölçü', icon: 'dimHV', key: '', hint: 'İki nokta arasında sürükleyin · Yön, sürükleme yönünden seçilir · Kare tutamaç: ölçü çizgisini taşı' },
    dimAngular: { label: 'Açısal ölçü', icon: 'dimAngular', key: '', hint: 'Köşeden birinci kola sürükleyin, sonra ikinci kolun ucuna dokunun' },
    dimSegment: { label: 'Segment ölçüsü', icon: 'dimSegment', key: '', hint: 'Bir eğrinin kenarına dokunun: o kenarın uzunluğu ölçülür' },
    dimCallout: { label: 'Not çizgisi', icon: 'dimCallout', key: '', hint: 'Gösterilecek noktadan nota doğru sürükleyin, sonra notu yazın' },
    connStraight: { label: 'Düz bağlantı', icon: 'connStraight', key: '', hint: 'Bir nesneden diğerine sürükleyin · Nesneler taşınınca çizgi takip eder' },
    connRight: { label: 'Dik açılı bağlantı', icon: 'connRight', key: '', hint: 'Bir nesneden diğerine sürükleyin · Çizgi dik açılarla ilerler' },
    connRound: { label: 'Yuvarlatılmış bağlantı', icon: 'connRound', key: '', hint: 'Bir nesneden diğerine sürükleyin · Köşeler yuvarlatılır' }
  });

  /* =============== property bar & inspector =============== */
  const seg = (items, cur, prefix) => '<span class="seg">' + items.map(([v, l]) => '<button data-act="' + prefix + v + '" class="' + (String(v) === String(cur) ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const textField = (label, name, value) => '<label class="field wide"><span>' + esc(label) + '</span><input data-pf="' + name + '" value="' + esc(value || '') + '" enterkeyhint="done" autocomplete="off" spellcheck="false" style="width:70px"></label>';
  const ARROWS = [['arrow', 'Ok'], ['tick', 'Çizgi'], ['dot', 'Nokta'], ['none', 'Yok']];
  const dimFields = (g) => {
    const fx = g.data.effect;
    let h = '<span class="pb-label">' + esc(DIM_KINDS[fx.kind] || 'Ölçü') + '</span>';
    if (fx.kind !== 'callout') {
      h += '<span class="pb-label">Ondalık</span>' + seg([[0, '0'], [1, '0,0'], [2, '0,00']], fx.prec, 'msPrec:');
      h += H.tog('msUnits', fx.kind === 'angular' ? '°' : 'mm', fx.units !== false, 'Birimi göster') + textField('Ön ek', 'msPre', fx.pre) + textField('Son ek', 'msSuf', fx.suf);
    }
    if (fx.kind === 'hv') h += seg([['h', 'Yatay'], ['v', 'Dikey']], fx.axis, 'msAxis:');
    h += H.sep + H.field('Yazı', 'msSize', VP.num(fx.size, 1), 'pt') + H.field('Çizgi', 'msLw', mm(fx.lw, 2)) + '<span class="pb-label">Uç</span>' + seg(ARROWS, fx.arrows, 'msArrows:');
    if (fx.kind !== 'callout') h += H.tog('msExt', 'Uzantı çizgileri', fx.ext !== false, 'Uzantı çizgilerini göster');
    if (fx.kind === 'callout') h += H.btn('msEdit', ic('text', 'sm') + 'Notu düzenle', 'Not metnini düzenle');
    if (fx.la || fx.lb || fx.lc) h += H.btn('msUnlink', 'Bağlantıyı kopar', 'Ölçü artık nesneyi izlemesin');
    return h + H.btn('txConvMenu', 'Dönüştür ▾', 'Düz nesne grubuna çevir');
  };
  const connFields = (g) => {
    const fx = g.data.effect;
    return '<span class="pb-label">Bağlantı</span>' + seg([['straight', 'Düz'], ['right', 'Dik açılı'], ['round', 'Yuvarlatılmış']], fx.kind, 'msConnKind:') +
      (fx.kind === 'round' ? H.field('Köşe', 'msRadius', mm(fx.radius, 1)) : '') + H.sep +
      H.field('Kalınlık', 'msLw', mm(fx.lw, 2)) + H.tog('msArrowStart', 'Baş oku', !!fx.arrowStart, 'Başlangıçta ok') + H.tog('msArrowEnd', 'Son ok', !!fx.arrowEnd, 'Bitişte ok') +
      (fx.la || fx.lb ? H.btn('msUnlink', 'Bağlantıyı kopar', 'Uçları nesnelerden ayır') : '') + H.btn('txConvMenu', 'Dönüştür ▾', 'Düz nesne grubuna çevir');
  };
  const dimPanel = (g) => {
    const fx = g.data.effect;
    let h = '<p class="sec-note">' + esc(describeDim(g)) + (fx.la || fx.lb || fx.lc ? ' · nesneye bağlı' : '') + '</p>';
    if (fx.kind !== 'callout') {
      h += '<div class="row"><span class="pb-label">Ondalık</span>' + seg([[0, '0'], [1, '0,0'], [2, '0,00']], fx.prec, 'msPrec:') + H.tog('msUnits', 'Birim', fx.units !== false, 'Birimi göster') + '</div>';
      h += '<div class="row">' + textField('Ön ek', 'msPre', fx.pre) + textField('Son ek', 'msSuf', fx.suf) + '</div>';
    }
    if (fx.kind === 'hv') h += '<div class="row">' + seg([['h', 'Yatay'], ['v', 'Dikey']], fx.axis, 'msAxis:') + '</div>';
    h += '<div class="row">' + H.dfieldPf('Yazı', 'msSize', VP.num(fx.size, 1), 'pt') + H.dfieldPf('Çizgi', 'msLw', mm(fx.lw, 2)) + '</div>';
    h += '<div class="row"><span class="pb-label">Uç</span>' + seg(ARROWS, fx.arrows, 'msArrows:') + '</div>';
    if (fx.kind !== 'callout') h += '<div class="row">' + H.tog('msExt', 'Uzantı çizgileri', fx.ext !== false, 'Uzantı çizgilerini göster') + '</div>';
    h += '<div class="row">' + (fx.kind === 'callout' ? H.btn('msEdit', 'Notu düzenle', 'Not metnini düzenle') : '') + (fx.la || fx.lb || fx.lc ? H.btn('msUnlink', 'Bağlantıyı kopar', 'Ölçü nesneyi izlemesin') : '') + '</div>';
    return h + '<p class="sec-note">Palet rengi ölçünün çizgi, ok ve yazısını boyar. Bağlı uçlar dolu daire olarak görünür.</p>';
  };
  const connPanel = (g) => {
    const fx = g.data.effect;
    return '<div class="row">' + seg([['straight', 'Düz'], ['right', 'Dik açılı'], ['round', 'Yuvarlatılmış']], fx.kind, 'msConnKind:') + '</div>' +
      (fx.kind === 'round' ? '<div class="row">' + H.dfieldPf('Köşe', 'msRadius', mm(fx.radius, 1)) + '</div>' : '') +
      '<div class="row">' + H.dfieldPf('Kalınlık', 'msLw', mm(fx.lw, 2)) + '</div>' +
      '<div class="row">' + H.tog('msArrowStart', 'Baş oku', !!fx.arrowStart, 'Başlangıçta ok') + H.tog('msArrowEnd', 'Son ok', !!fx.arrowEnd, 'Bitişte ok') + '</div>' +
      (fx.la || fx.lb ? '<div class="row">' + H.btn('msUnlink', 'Bağlantıyı kopar', 'Uçları nesnelerden ayır') + '</div>' : '') +
      '<p class="sec-note">' + (fx.la && fx.lb ? 'İki ucu da nesneye bağlı; nesneler taşınınca çizgi takip eder.' : 'Serbest uçları bağlantı aracıyla bir nesneye sürükleyerek bağlayın.') + '</p>';
  };
  const target = () => (VP.sel.length === 1 && M.is(VP.sel[0]) ? VP.sel[0] : null);
  const doneG = (g) => {
    build(g);
    VP.commit();
    VP.drawOverlay();
  };
  M.propField = (name, raw) => {
    const g = target();
    if (!g) return true;
    const fx = g.data.effect;
    const v = VP.parseNum(raw);
    switch (name) {
      case 'msPre': fx.pre = String(raw).slice(0, 20); break;
      case 'msSuf': fx.suf = String(raw).slice(0, 20); break;
      case 'msSize': if (v > 0) fx.size = clamp(v, 2, 200); else return true; break;
      case 'msLw': if (v >= 0) fx.lw = Math.max(0.05, VP.toPT(v)); else return true; break;
      case 'msRadius': if (v >= 0) fx.radius = VP.toPT(v); else return true; break;
      default: return true;
    }
    doneG(g);
    return true;
  };
  M.act = (id) => {
    const g = target();
    if (!g) return true;
    const fx = g.data.effect;
    const [k, arg] = id.split(':');
    switch (k) {
      case 'msPrec': fx.prec = +arg; break;
      case 'msUnits': fx.units = fx.units === false; break;
      case 'msAxis': fx.axis = arg; break;
      case 'msArrows': fx.arrows = arg; break;
      case 'msExt': fx.ext = fx.ext === false; break;
      case 'msConnKind': fx.kind = arg; break;
      case 'msArrowStart': fx.arrowStart = !fx.arrowStart; break;
      case 'msArrowEnd': fx.arrowEnd = !fx.arrowEnd; break;
      case 'msUnlink':
        fx.la = fx.lb = fx.lc = null;
        VP.toast('Bağlantı koparıldı');
        break;
      case 'msEdit': return M.editCallout(g), true;
      default: return true;
    }
    doneG(g);
    return true;
  };
  // chain into the text module's property-bar hooks
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^ms/.test(n) ? M.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^ms/.test(id) ? M.act(id, el) : act0(id, el));
  const tb0 = VP.tx.toolBar;
  VP.tx.toolBar = (id) => {
    const m = VP.TOOL_META[id];
    if (/^dim|^conn/.test(id)) return '<span class="pb-title">' + esc(m.label) + '</span><span class="pb-label">' + esc(m.hint) + '</span>';
    return tb0(id);
  };
  // the text module's convert menu also serves dimensions and connectors
  const txAct = VP.tx.act;
  VP.tx.act = (id, el) => {
    if (id === 'txConvMenu' && target()) {
      UI.popover(el, '<button class="pop-item" data-pick="bake">Düz nesne grubuna dönüştür</button>', () => FX.separate(target()));
      return true;
    }
    return txAct(id, el);
  };
})();
