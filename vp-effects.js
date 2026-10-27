/* VektörPad live effects: blend, contour, envelope, perspective.
   An effect is a Group with applyMatrix=false and data.effect; its children live in the group's local space. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = (VP.fx = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  FX.NAMES = { blend: 'Harmanlama', contour: 'Kontur', envelope: 'Zarf', perspective: 'Perspektif', extrude: 'Derinlik', lens: 'Mercek', powerclip: 'PowerClip' };
  FX.of = (it) => (it && it.data && it.data.effect ? it.data.effect : null);
  FX.isFx = (it) => !!FX.of(it);
  FX.isShape = (it) => VP.isPathItem(it) && !FX.isFx(it);

  /* ---------- colour helpers ---------- */
  const solid = (c) => {
    if (!c) return null;
    const s = c.type === 'gradient' ? c.gradient.stops[0].color : c;
    return s.convert('rgb');
  };
  FX.lerpColor = (a, b, t) => {
    let c1 = solid(a);
    let c2 = solid(b);
    if (!c1 && !c2) return null;
    if (!c1) {
      c1 = c2.clone();
      c1.alpha = 0;
    }
    if (!c2) {
      c2 = c1.clone();
      c2.alpha = 0;
    }
    return new paper.Color(c1.red + (c2.red - c1.red) * t, c1.green + (c2.green - c1.green) * t, c1.blue + (c2.blue - c1.blue) * t, c1.alpha + (c2.alpha - c1.alpha) * t);
  };
  const lerpP = (a, b, t) => Pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  // Ramer–Douglas–Peucker: drops points within eps of the simplified line, keeps every real corner.
  const rdp = (pts, eps) => {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = 1;
    keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      const a = pts[s];
      const ab = pts[e].subtract(a);
      const L = ab.length;
      let idx = -1;
      let md = eps;
      for (let i = s + 1; i < e; i++) {
        const d = L < 1e-9 ? pts[i].getDistance(a) : Math.abs(ab.cross(pts[i].subtract(a))) / L;
        if (d > md) {
          md = d;
          idx = i;
        }
      }
      if (idx > 0) {
        keep[idx] = 1;
        stack.push([s, idx], [idx, e]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  };
  const cleanPoly = (pts, closed, eps = 0.06) => {
    if (pts.length < 4) return pts;
    if (!closed) return rdp(pts, eps);
    let far = 0;
    let fd = -1;
    pts.forEach((p, i) => {
      const d = p.getDistance(pts[0]);
      if (d > fd) {
        fd = d;
        far = i;
      }
    });
    const A = rdp(pts.slice(0, far + 1), eps);
    const B = rdp(pts.slice(far).concat([pts[0]]), eps);
    const out = A.concat(B.slice(1, -1));
    return out.length >= 3 ? out : pts;
  };
  const loopsOf = (it) => (it instanceof paper.CompoundPath ? it.children.slice() : [it]);

  /* ---------- BLEND ---------- */
  const bestShift = (A, B) => {
    const n = A.length;
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let i = 0; i < n && s < bd; i++) {
        const b = B[(i + k) % n];
        const dx = A[i].x - b.x;
        const dy = A[i].y - b.y;
        s += dx * dx + dy * dy;
      }
      if (s < bd) {
        bd = s;
        best = k;
      }
    }
    return best;
  };
  const rotate = (arr, k) => arr.slice(k).concat(arr.slice(0, k));
  const prepPair = (a, b) => {
    const closed = a.closed && b.closed;
    if (a.segments.length === b.segments.length && a.closed === b.closed && a.segments.length > 1) {
      const A = a.segments.map((s) => ({ p: s.point.clone(), i: s.handleIn.clone(), o: s.handleOut.clone() }));
      let B = b.segments.map((s) => ({ p: s.point.clone(), i: s.handleIn.clone(), o: s.handleOut.clone() }));
      if (closed) {
        if (a.clockwise !== b.clockwise) B = B.reverse().map((s) => ({ p: s.p, i: s.o, o: s.i }));
        B = rotate(B, bestShift(A.map((s) => s.p), B.map((s) => s.p)));
      } else if (A[0].p.getDistance(B[0].p) + A[A.length - 1].p.getDistance(B[B.length - 1].p) > A[0].p.getDistance(B[B.length - 1].p) + A[A.length - 1].p.getDistance(B[0].p)) {
        B = B.reverse().map((s) => ({ p: s.p, i: s.o, o: s.i }));
      }
      return (t) =>
        new paper.Path({
          segments: A.map((s, k) => new paper.Segment(lerpP(s.p, B[k].p, t), lerpP(s.i, B[k].i, t), lerpP(s.o, B[k].o, t))),
          closed: a.closed,
          insert: false
        });
    }
    const N = closed ? 200 : 120;
    const sample = (p) => {
      const L = p.length;
      const out = [];
      for (let k = 0; k < N; k++) out.push(p.getPointAt(closed ? (L * k) / N : (L * k) / (N - 1)) || p.lastSegment.point.clone());
      return out;
    };
    const A = sample(a);
    let B = sample(b);
    if (closed) {
      if (a.clockwise !== b.clockwise) B.reverse();
      B = rotate(B, bestShift(A, B));
    } else if (A[0].getDistance(B[0]) + A[N - 1].getDistance(B[N - 1]) > A[0].getDistance(B[N - 1]) + A[N - 1].getDistance(B[0])) B.reverse();
    return (t) => new paper.Path({ segments: cleanPoly(A.map((q, k) => lerpP(q, B[k], t)), closed), closed, insert: false });
  };
  const prepItems = (a, b) => {
    const la = loopsOf(a);
    const lb = loopsOf(b);
    let pairs;
    if (la.length === lb.length) pairs = la.map((x, i) => [x, lb[i]]);
    else {
      const big = (arr) => arr.slice().sort((p, q) => Math.abs(q.area) - Math.abs(p.area) || q.length - p.length)[0];
      pairs = [[big(la), big(lb)]];
    }
    const fns = pairs.map(([x, y]) => prepPair(x, y));
    return (t) => {
      if (fns.length === 1) return fns[0](t);
      const cp = new paper.CompoundPath({ insert: false });
      fns.forEach((f) => cp.addChild(f(t)));
      return cp;
    };
  };
  FX.blendEnds = (g) => {
    const kids = g.children.filter((c) => !c.data.blendSteps);
    return [kids[0], kids[kids.length - 1]];
  };
  FX.buildBlend = (g) => {
    const fx = g.data.effect;
    const [a, b] = FX.blendEnds(g);
    const old = g.children.find((c) => c.data.blendSteps);
    if (old) old.remove();
    if (!a || !b || a === b) return;
    const steps = clamp(Math.round(fx.steps || 8), 1, 200);
    const shapeAt = prepItems(a, b);
    const sg = new paper.Group({ insert: false });
    sg.data.blendSteps = true;
    const e = Math.pow(2, -(fx.accel || 0) * 1.6);
    for (let i = 1; i <= steps; i++) {
      const t = Math.pow(i / (steps + 1), e);
      const s = shapeAt(t);
      s.fillColor = FX.lerpColor(a.fillColor, b.fillColor, t);
      s.strokeColor = FX.lerpColor(a.strokeColor, b.strokeColor, t);
      s.strokeWidth = (a.strokeWidth || 0) + ((b.strokeWidth || 0) - (a.strokeWidth || 0)) * t;
      s.strokeCap = a.strokeCap;
      s.strokeJoin = a.strokeJoin;
      s.opacity = a.opacity + (b.opacity - a.opacity) * t;
      sg.addChild(s);
    }
    sg.insertAbove(a);
  };
  FX.blend = (items) => {
    items = VP.zSort(items || VP.sel);
    if (items.length !== 2) return VP.toast('Harmanlama için iki nesne seçin');
    if (!items.every(FX.isShape)) return VP.toast('Harmanlama eğrilerle çalışır · Metin ve grupları önce eğriye dönüştürün');
    const [a, b] = items;
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.insertAbove(b);
    g.addChildren([a, b]);
    g.data.effect = { type: 'blend', steps: VP.defaults.blendSteps, accel: VP.defaults.blendAccel };
    FX.buildBlend(g);
    VP.setSelection([g]);
    VP.commit();
    VP.toast('Harmanlama oluşturuldu · Adım sayısını özellik çubuğundan değiştirin');
    return g;
  };

  /* ---------- CONTOUR (path offsetting) ---------- */
  const offsetLoop = (pts, d) => {
    const n = pts.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const c = pts[(i + 2) % n];
      const t1 = b.subtract(a);
      if (t1.length < 1e-9) continue;
      const n1 = Pt(t1.y, -t1.x).normalize(d);
      out.push(a.add(n1), b.add(n1));
      const t2 = c.subtract(b);
      if (t2.length < 1e-9) continue;
      const n2 = Pt(t2.y, -t2.x).normalize(d);
      const ang = n1.getDirectedAngle(n2);
      if (Math.abs(ang) > 10) {
        const k = Math.ceil(Math.abs(ang) / 10);
        for (let j = 1; j < k; j++) out.push(b.add(n1.rotate((ang * j) / k)));
      }
    }
    return out;
  };
  FX.offsetItem = (item, d) => {
    if (!d) return item.clone({ insert: false });
    let base = item.clone({ insert: false });
    if (base instanceof paper.Path) {
      if (!base.closed) return null;
      base = new paper.CompoundPath({ children: [base], insert: false });
    }
    base.reorient(true, true);
    const per = base.children.reduce((s, c) => s + c.length, 0);
    const step = Math.max(per / 420, 0.3);
    const loops = [];
    base.children.forEach((ch) => {
      const pts = [];
      ch.curves.forEach((c) => {
        const n = Math.max(1, Math.ceil(c.length / step));
        for (let j = 0; j < n; j++) pts.push(c.getPointAtTime(j / n));
      });
      if (pts.length >= 3) loops.push(offsetLoop(pts, d));
    });
    if (!loops.length) return null;
    const raw = new paper.CompoundPath({ children: loops.map((l) => new paper.Path({ segments: l, closed: true, insert: false })), insert: false });
    let res;
    try {
      res = raw.resolveCrossings();
      res.reorient(true, true);
    } catch (e) {
      return null;
    }
    const kids = res instanceof paper.CompoundPath ? res.children.slice() : [res];
    const ad = Math.abs(d);
    const keep = kids.filter((k) => {
      if (Math.abs(k.area) < 1e-3) return false;
      const L = k.length;
      let good = 0;
      let tot = 0;
      for (let s = 0; s < 8; s++) {
        const q = k.getPointAt((L * (s + 0.5)) / 8);
        if (!q) continue;
        tot++;
        const np = item.getNearestPoint(q);
        const dist = np ? np.getDistance(q) : 0;
        const inside = item.contains(q);
        if (dist >= ad * 0.8 && (d < 0 ? inside : !inside)) good++;
      }
      return tot && good / tot >= 0.6;
    });
    if (!keep.length) return null;
    const parts = keep.map((k) => new paper.Path({ segments: cleanPoly(k.segments.map((s) => s.point), true, 0.05), closed: true, insert: false }));
    const out = parts.length === 1 ? parts[0] : new paper.CompoundPath({ children: parts, insert: false });
    if (out instanceof paper.CompoundPath) out.reorient(true, true);
    return out;
  };
  FX.contourSource = (g) => g.children.find((c) => c.data.effectSrc) || g.children[g.children.length - 1];
  FX.buildContour = (g) => {
    const fx = g.data.effect;
    const src = FX.contourSource(g);
    g.children.slice().forEach((c) => c !== src && c.remove());
    const n = clamp(Math.round(fx.steps || 3), 1, 40);
    const sign = fx.dir === 'inside' ? -1 : 1;
    const end = fx.endFill ? new paper.Color(fx.endFill) : null;
    const made = [];
    for (let i = 1; i <= n; i++) {
      const r = FX.offsetItem(src, sign * fx.offset * i);
      if (!r) break;
      const t = i / n;
      r.fillColor = end ? FX.lerpColor(src.fillColor, end, t) : src.fillColor ? solid(src.fillColor) : null;
      r.strokeColor = src.strokeColor;
      r.strokeWidth = src.strokeWidth;
      r.strokeJoin = 'round';
      made.push(r);
    }
    let prev = src;
    made.forEach((r) => {
      if (sign < 0) r.insertAbove(prev);
      else r.insertBelow(prev);
      prev = r;
    });
    fx.made = made.length;
  };
  FX.contour = (item) => {
    item = item || VP.sel[0];
    if (!item) return VP.toast('Kontur için bir nesne seçin');
    if (!FX.isShape(item) || (item instanceof paper.Path && !item.closed)) return VP.toast('Kontur kapalı eğrilerle çalışır · Metni önce eğriye dönüştürün');
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.insertAbove(item);
    g.addChild(item);
    item.data.effectSrc = true;
    g.data.effect = { type: 'contour', dir: VP.defaults.contourDir, steps: VP.defaults.contourSteps, offset: VP.toPT(VP.defaults.contourOffset), endFill: VP.defaults.contourEnd };
    FX.buildContour(g);
    if (!g.data.effect.made) VP.toast('Bu aralıkla kontur oluşmadı · Aralığı küçültün');
    else VP.toast('Kontur oluşturuldu');
    VP.setSelection([g]);
    VP.commit();
    return g;
  };

  /* ---------- ENVELOPE & PERSPECTIVE (warps) ---------- */
  const R = (fx) => new paper.Rectangle(fx.rect[0], fx.rect[1], fx.rect[2], fx.rect[3]);
  FX.defaultNodes = (r) => ({
    tl: [r.left, r.top], tm: [r.center.x, r.top], tr: [r.right, r.top], rm: [r.right, r.center.y],
    br: [r.right, r.bottom], bm: [r.center.x, r.bottom], bl: [r.left, r.bottom], lm: [r.left, r.center.y]
  });
  FX.defaultQuad = (r) => ({ tl: [r.left, r.top], tr: [r.right, r.top], br: [r.right, r.bottom], bl: [r.left, r.bottom] });
  const qb = (A, M, B, t) => {
    const cx = 2 * M[0] - (A[0] + B[0]) / 2;
    const cy = 2 * M[1] - (A[1] + B[1]) / 2;
    const m = 1 - t;
    return [m * m * A[0] + 2 * t * m * cx + t * t * B[0], m * m * A[1] + 2 * t * m * cy + t * t * B[1]];
  };
  FX.envMapper = (n) => (u, v) => {
    const T = qb(n.tl, n.tm, n.tr, u);
    const B = qb(n.bl, n.bm, n.br, u);
    const L = qb(n.tl, n.lm, n.bl, v);
    const Rr = qb(n.tr, n.rm, n.br, v);
    const k = (i) => (1 - v) * T[i] + v * B[i] + (1 - u) * L[i] + u * Rr[i] - ((1 - u) * (1 - v) * n.tl[i] + u * (1 - v) * n.tr[i] + (1 - u) * v * n.bl[i] + u * v * n.br[i]);
    return [k(0), k(1)];
  };
  FX.perspMapper = (q) => {
    const [x0, y0] = q.tl;
    const [x1, y1] = q.tr;
    const [x2, y2] = q.br;
    const [x3, y3] = q.bl;
    const sx = x0 - x1 + x2 - x3;
    const sy = y0 - y1 + y2 - y3;
    let a, b, c, d, e, f, g, h;
    if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
      a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; h = 0;
    } else {
      const dx1 = x1 - x2;
      const dx2 = x3 - x2;
      const dy1 = y1 - y2;
      const dy2 = y3 - y2;
      const det = dx1 * dy2 - dx2 * dy1 || 1e-9;
      g = (sx * dy2 - dx2 * sy) / det;
      h = (dx1 * sy - sx * dy1) / det;
      a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0;
      d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
    }
    return (u, v) => {
      const w = g * u + h * v + 1 || 1e-9;
      return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
    };
  };
  // Warps every path inside `root` through mapPt (point -> point). Fira Sans texts become outlines first.
  // Returns how many items (other texts, images) could not be warped.
  FX.warpTree = (root, mapPt, step) => {
    let untouched = 0;
    const warpPath = (p) => {
      const pts = [];
      p.curves.forEach((c) => {
        const n = Math.max(3, Math.ceil(c.length / step));
        for (let j = 0; j < n; j++) pts.push(c.getPointAtTime(j / n));
      });
      if (!p.closed && p.lastSegment) pts.push(p.lastSegment.point.clone());
      if (pts.length < 2) return;
      p.segments = cleanPoly(pts.map(mapPt), p.closed, 0.04);
    };
    const walk = (it) => {
      if (it instanceof paper.PointText) {
        const cp = it.parent ? VP.textToPath(it) : null;
        if (cp) cp.children.forEach(warpPath);
        else untouched++;
        return;
      }
      if (it instanceof paper.Raster) {
        untouched++;
        return;
      }
      if (it instanceof paper.CompoundPath) return it.children.forEach(warpPath);
      if (it instanceof paper.Path) return warpPath(it);
      if (it.children) it.children.slice().forEach(walk);
    };
    walk(root);
    return untouched;
  };
  FX.buildWarp = (g) => {
    const fx = g.data.effect;
    const r = R(fx);
    const map = fx.type === 'envelope' ? FX.envMapper(fx.nodes) : FX.perspMapper(fx.quad);
    const step = clamp(Math.max(r.width, r.height) / 500, 0.35, 1.2);
    const holder = new paper.Group({ insert: false });
    const item = holder.importJSON(fx.source);
    const untouched = FX.warpTree(
      item,
      (q) => {
        const m = map((q.x - r.x) / (r.width || 1), (q.y - r.y) / (r.height || 1));
        return Pt(m[0], m[1]);
      },
      step
    );
    g.removeChildren();
    // text sources are replaced by their outlines inside the holder, so take whatever the holder now contains
    if (item === holder) g.addChild(holder);
    else g.addChildren(holder.removeChildren());
    fx.untouched = untouched;
  };
  FX.addWarp = (item, type) => {
    item = item || VP.sel[0];
    if (!item) return VP.toast(FX.NAMES[type] + ' için bir nesne seçin');
    if (item instanceof paper.Raster) return VP.toast('Resimlere ' + FX.NAMES[type].toLowerCase() + ' uygulanamaz');
    // Work on a copy whose Fira Sans texts are already outlines, so the frame matches the real letter shapes.
    const holder = new paper.Group({ insert: false });
    let work = holder.importJSON(item.exportJSON({ asString: true }));
    const outline = (it) => {
      if (it instanceof paper.PointText) {
        const cp = VP.textToPath(it);
        return cp || it;
      }
      if (it.children) it.children.slice().forEach(outline);
      return it;
    };
    work = outline(work);
    const r = work.bounds.clone();
    if (r.width < 0.5 || r.height < 0.5) return VP.toast('Nesne çok ince · Önce en ve boy verin');
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.insertAbove(item);
    g.data.effect = { type, source: work.exportJSON({ asString: true }), rect: [r.x, r.y, r.width, r.height] };
    if (type === 'envelope') g.data.effect.nodes = FX.defaultNodes(r);
    else g.data.effect.quad = FX.defaultQuad(r);
    item.remove();
    FX.buildWarp(g);
    if (g.data.effect.untouched) VP.toast('Fira Sans dışındaki metinler ve resimler bükülmez');
    VP.setSelection([g]);
    VP.commit();
    return g;
  };
  FX.envPreset = (g, name) => {
    const fx = g.data.effect;
    const r = R(fx);
    const w = r.width;
    const h = r.height;
    const n = FX.defaultNodes(r);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (name === 'arch') { n.tm[1] -= h * 0.3; n.bm[1] -= h * 0.3; }
    if (name === 'archDown') { n.tm[1] += h * 0.3; n.bm[1] += h * 0.3; }
    if (name === 'bulge') { n.tm[1] -= h * 0.22; n.bm[1] += h * 0.22; n.lm[0] -= w * 0.12; n.rm[0] += w * 0.12; }
    if (name === 'pinch') { n.tm[1] += h * 0.22; n.bm[1] -= h * 0.22; n.lm[0] += w * 0.12; n.rm[0] -= w * 0.12; }
    if (name === 'taper') {
      n.tl[0] += w * 0.2;
      n.tr[0] -= w * 0.2;
      n.tm = mid(n.tl, n.tr);
      n.lm = mid(n.tl, n.bl);
      n.rm = mid(n.tr, n.br);
    }
    if (name === 'flag') { n.tm[1] -= h * 0.25; n.bm[1] -= h * 0.25; n.tr[1] += h * 0.12; n.br[1] += h * 0.12; n.rm = mid(n.tr, n.br); }
    fx.nodes = n;
    FX.buildWarp(g);
    VP.commit();
  };
  FX.perspPreset = (g, name) => {
    const fx = g.data.effect;
    const r = R(fx);
    const w = r.width;
    const h = r.height;
    const q = FX.defaultQuad(r);
    if (name === 'one') { q.tl[0] += w * 0.22; q.tr[0] -= w * 0.22; }
    if (name === 'floor') { q.bl[0] += w * 0.22; q.br[0] -= w * 0.22; }
    if (name === 'left') { q.tr[1] += h * 0.16; q.br[1] -= h * 0.16; }
    if (name === 'right') { q.tl[1] += h * 0.16; q.bl[1] -= h * 0.16; }
    fx.quad = q;
    FX.buildWarp(g);
    VP.commit();
  };

  /* ---------- EXTRUDE (depth) ---------- */
  const shadeColor = (c, k) => {
    const s = c.convert('rgb');
    return k < 1 ? new paper.Color(s.red * k, s.green * k, s.blue * k, s.alpha) : new paper.Color(s.red + (1 - s.red) * (k - 1), s.green + (1 - s.green) * (k - 1), s.blue + (1 - s.blue) * (k - 1), s.alpha);
  };
  FX.extrudeBack = (fx) => (p) => (fx.mode === 'parallel' ? Pt(p.x + fx.offset[0], p.y + fx.offset[1]) : Pt(fx.vp[0] + (p.x - fx.vp[0]) * (1 - fx.depth), fx.vp[1] + (p.y - fx.vp[1]) * (1 - fx.depth)));
  FX.buildExtrude = (g) => {
    const fx = g.data.effect;
    const src = FX.contourSource(g);
    g.children.slice().forEach((c) => c !== src && c.remove());
    const back = FX.extrudeBack(fx);
    const loops = loopsOf(src);
    const per = loops.reduce((s, l) => s + l.length, 0);
    const step = clamp(per / 700, 0.5, 4);
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
        const q = new paper.Path({ segments: [a, b, back(b), back(a)], closed: true, insert: false });
        if (Math.abs(q.area) < 1e-6) continue;
        q.clockwise = true;
        quads.push(q);
      }
    });
    if (!quads.length) return;
    const side = new paper.CompoundPath({ children: quads, fillRule: 'nonzero', insert: false });
    const base = fx.side ? new paper.Color(fx.side) : shadeColor(solid(src.fillColor) || new paper.Color('#8c8c8c'), 0.62);
    if (fx.shade) {
      const fc = src.bounds.center;
      side.fillColor = { gradient: { stops: [[shadeColor(base, 1.18), 0], [shadeColor(base, 0.5), 1]] }, origin: fc, destination: back(fc) };
    } else side.fillColor = base;
    side.strokeColor = null;
    side.data.extrudeSide = true;
    side.insertBelow(src);
  };
  FX.extrude = (item) => {
    item = item || VP.sel[0];
    if (!item) return VP.toast('Derinlik için bir nesne seçin');
    if (item instanceof paper.PointText) {
      const cp = VP.textToPath(item);
      if (!cp) return VP.toast('Yalnızca Fira Sans metinler derinlik alabilir · Önce eğriye dönüştürün');
      item = cp;
    }
    if (!FX.isShape(item)) return VP.toast('Derinlik eğrilerle çalışır · Grupları önce çözün');
    const b = item.bounds;
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.insertAbove(item);
    g.addChild(item);
    item.data.effectSrc = true;
    const m = Math.min(b.width, b.height);
    g.data.effect = {
      type: 'extrude', mode: VP.defaults.extrudeMode, depth: VP.defaults.extrudeDepth, shade: VP.defaults.extrudeShade, side: null,
      vp: [b.center.x + b.width * 0.9, b.center.y - b.height * 1.3], offset: [m * 0.16, -m * 0.16]
    };
    FX.buildExtrude(g);
    VP.setSelection([g]);
    VP.commit();
    VP.toast('Derinlik eklendi · Kaçış noktasını sürükleyebilirsiniz');
    return g;
  };

  /* ---------- LENS ---------- */
  FX.LENS = {
    magnify: { label: 'Büyüteç', rate: 2, min: 1.1, max: 6, scale: 10, rateLabel: 'Büyütme', unit: '×' },
    fisheye: { label: 'Balık gözü', rate: 1, min: 0.1, max: 3, scale: 10, rateLabel: 'Güç' },
    invert: { label: 'Ters çevir' },
    brighten: { label: 'Parlat / karart', rate: 0.4, min: -1, max: 1, scale: 100, rateLabel: 'Oran', unit: '%' },
    tint: { label: 'Renkli gri tonlama', color: true },
    colorAdd: { label: 'Renk ekle', rate: 0.5, min: 0, max: 1, scale: 100, rateLabel: 'Oran', unit: '%', color: true },
    colorLimit: { label: 'Renk sınırla', rate: 0.8, min: 0, max: 1, scale: 100, rateLabel: 'Oran', unit: '%', color: true },
    heat: { label: 'Isı haritası' },
    wireframe: { label: 'Tel kafes', color: true }
  };
  const HEAT = [[0, '#2b0a3d'], [0.2, '#3b4cc0'], [0.4, '#40b0a6'], [0.6, '#b5d334'], [0.8, '#f59f00'], [1, '#e8211a']].map(([o, c]) => [o, new paper.Color(c)]);
  const lum = (c) => 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue;
  const colorFn = (fx) => {
    const t = new paper.Color(fx.color || '#ffed00').convert('rgb');
    const k = fx.rate;
    const C = (r, g, b, a) => new paper.Color(clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1), a);
    switch (fx.kind) {
      case 'invert': return (c) => C(1 - c.red, 1 - c.green, 1 - c.blue, c.alpha);
      case 'brighten': return (c) => (k >= 0 ? C(c.red + (1 - c.red) * k, c.green + (1 - c.green) * k, c.blue + (1 - c.blue) * k, c.alpha) : C(c.red * (1 + k), c.green * (1 + k), c.blue * (1 + k), c.alpha));
      case 'tint': return (c) => {
        const l = lum(c);
        return C(t.red * l, t.green * l, t.blue * l, c.alpha);
      };
      case 'colorAdd': return (c) => C(c.red + t.red * k, c.green + t.green * k, c.blue + t.blue * k, c.alpha);
      case 'colorLimit': return (c) => C(c.red * (1 - k + t.red * k), c.green * (1 - k + t.green * k), c.blue * (1 - k + t.blue * k), c.alpha);
      case 'heat': return (c) => {
        const l = lum(c);
        let i = 1;
        while (i < HEAT.length - 1 && HEAT[i][0] < l) i++;
        const [o0, c0] = HEAT[i - 1];
        const [o1, c1] = HEAT[i];
        const f = clamp((l - o0) / (o1 - o0 || 1), 0, 1);
        return C(c0.red + (c1.red - c0.red) * f, c0.green + (c1.green - c0.green) * f, c0.blue + (c1.blue - c0.blue) * f, c.alpha);
      };
      default: return null;
    }
  };
  const mapColor = (c, fn) => {
    if (!c) return c;
    if (c.type === 'gradient') {
      return new paper.Color({
        gradient: { stops: c.gradient.stops.map((s) => [fn(s.color.convert('rgb')), s.offset]), radial: c.gradient.radial },
        origin: c.origin, destination: c.destination, highlight: c.highlight
      });
    }
    return fn(c.convert('rgb'));
  };
  const leavesDeep = (root) => {
    const out = [];
    const walk = (it) => {
      if (it instanceof paper.Group) it.children.forEach(walk);
      else out.push(it);
    };
    walk(root);
    return out;
  };
  FX.lensSource = (g) => g.children.find((c) => c.data.effectSrc);
  FX.buildLens = (g) => {
    const fx = g.data.effect;
    const src = FX.lensSource(g);
    if (!src) return;
    g.children.slice().forEach((c) => c !== src && c.remove());
    const lb = src.bounds;
    const top = VP.topLevel(g);
    const under = [];
    let done = false;
    VP.userLayers().forEach((L) => {
      if (done) return;
      L.children.forEach((it) => {
        if (done) return;
        if (it === top) {
          done = true;
          return;
        }
        if (L.visible && it.visible && it.bounds.intersects(lb)) under.push(it);
      });
    });
    const content = new paper.Group({ insert: false });
    const p = VP.page();
    content.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(0, 0, p.w, p.h), fillColor: '#ffffff', insert: false }));
    under.forEach((it) => content.addChild(it.clone({ insert: false })));
    const c = lb.center;
    if (fx.kind === 'magnify') content.scale(fx.rate, c);
    else if (fx.kind === 'fisheye') {
      const Rr = Math.max(lb.width, lb.height) / 2 || 1;
      const k = fx.rate;
      FX.warpTree(
        content,
        (q) => {
          const v = q.subtract(c);
          const r = v.length / Rr;
          if (r >= 1 || r < 1e-9) return q;
          return c.add(v.normalize((1 - Math.pow(1 - r, 1 + k)) * Rr));
        },
        clamp(Rr / 120, 0.4, 2)
      );
    } else if (fx.kind === 'wireframe') {
      const col = new paper.Color(fx.color || '#1d1d1b');
      leavesDeep(content).forEach((it) => {
        if (it instanceof paper.Raster) {
          const r = new paper.Path.Rectangle({ rectangle: it.bounds, insert: false });
          r.insertAbove(it);
          it.remove();
          it = r;
        }
        it.fillColor = null;
        it.strokeColor = col;
        it.strokeWidth = 0.6;
        it.dashArray = [];
        it.shadowColor = null;
        it.opacity = 1;
      });
      content.firstChild.remove();
    } else {
      const fn = colorFn(fx);
      if (fn) {
        leavesDeep(content).forEach((it) => {
          if (it instanceof paper.Raster) return;
          it.fillColor = mapColor(it.fillColor, fn);
          it.strokeColor = mapColor(it.strokeColor, fn);
          if (it.shadowColor) it.shadowColor = mapColor(it.shadowColor, fn);
        });
      }
    }
    const mask = src.clone({ insert: false });
    mask.data = {};
    mask.fillColor = '#000000';
    mask.strokeColor = null;
    mask.shadowColor = null;
    const clip = new paper.Group({ insert: false });
    clip.addChild(mask);
    clip.addChildren(content.removeChildren());
    clip.clipped = true;
    clip.data.lensContent = true;
    clip.insertBelow(src);
  };
  FX.lens = (item, kind) => {
    item = item || VP.sel[0];
    kind = kind || VP.defaults.lensKind;
    if (!item) return VP.toast('Mercek için kapalı bir şekil seçin');
    if (!FX.isShape(item) || (item instanceof paper.Path && !item.closed)) return VP.toast('Mercek kapalı bir şekil olmalı · Metni önce eğriye dönüştürün');
    const g = new paper.Group({ insert: false });
    g.insertAbove(item);
    g.addChild(item);
    item.data.effectSrc = true;
    const spec = FX.LENS[kind] || FX.LENS.magnify;
    const fill = solid(item.fillColor);
    g.data.effect = { type: 'lens', kind, rate: spec.rate == null ? 1 : spec.rate, color: fill ? VP.hex(fill) : '#ffed00', origFill: item.fillColor ? item.exportJSON({ asString: true }) : null };
    item.fillColor = null;
    if (!item.strokeColor) {
      item.strokeColor = new paper.Color(VP.colors.accent && VP.colors.accent.startsWith('#') ? VP.colors.accent : '#1461b2');
      item.strokeWidth = 0.75;
    }
    FX.buildLens(g);
    VP.setSelection([g]);
    VP.commit();
    VP.toast('Mercek eklendi: ' + spec.label);
    return g;
  };
  FX.setLensKind = (g, kind) => {
    const spec = FX.LENS[kind];
    if (!spec) return;
    g.data.effect.kind = kind;
    if (spec.rate != null) g.data.effect.rate = spec.rate;
    FX.buildLens(g);
  };
  FX.lensGroups = () => {
    const out = [];
    VP.userLayers().forEach((L) => L.getItems({ match: (it) => it.data && it.data.effect && it.data.effect.type === 'lens' }).forEach((g) => out.push(g)));
    return out;
  };
  FX.refreshLenses = () => {
    if (FX._refreshing) return;
    FX._refreshing = true;
    try {
      FX.lensGroups().forEach(FX.buildLens);
    } finally {
      FX._refreshing = false;
    }
  };
  let lensRaf = 0;
  const refreshSoon = () => {
    if (lensRaf || !FX.lensGroups().length) return;
    lensRaf = requestAnimationFrame(() => {
      lensRaf = 0;
      FX.refreshLenses();
    });
  };
  VP.on('change', () => FX.refreshLenses());
  VP.on('page', () => FX.refreshLenses());
  VP.on('transform', refreshSoon);

  /* ---------- POWERCLIP ---------- */
  FX.pcParts = (g) => ({
    frame: g.children.find((c) => c.data.pcFrame),
    clip: g.children.find((c) => c.data.pcClip),
    outline: g.children.find((c) => c.data.pcOutline)
  });
  FX.pcContents = (g) => {
    const clip = FX.pcParts(g).clip;
    return clip ? clip.children.filter((c) => !c.clipMask) : [];
  };
  FX.buildPowerclip = (g) => {
    const { frame, clip, outline } = FX.pcParts(g);
    if (!frame || !clip) return;
    const oldMask = clip.children.find((c) => c.clipMask);
    const mask = frame.clone({ insert: false });
    mask.data = {};
    mask.fillColor = '#000000';
    mask.strokeColor = null;
    mask.shadowColor = null;
    if (oldMask) oldMask.remove();
    clip.insertChild(0, mask);
    clip.clipped = true;
    if (outline) outline.remove();
    if (frame.strokeColor && frame.strokeWidth > 0) {
      const ol = frame.clone({ insert: false });
      ol.data = { pcOutline: true };
      ol.fillColor = null;
      ol.shadowColor = null;
      g.addChild(ol);
    }
  };
  FX.powerclip = (contents, frame) => {
    contents = (contents || []).filter((c) => c && c !== frame);
    if (!contents.length) return VP.toast('PowerClip için önce içerik seçin');
    if (frame instanceof paper.PointText) {
      const cp = VP.textToPath(frame);
      if (!cp) return VP.toast('Kap olarak yalnızca Fira Sans metin kullanılabilir · Önce eğriye dönüştürün');
      frame = cp;
    }
    if (!FX.isShape(frame) || (frame instanceof paper.Path && !frame.closed)) return VP.toast('Kap kapalı bir şekil olmalı');
    const g = new paper.Group({ insert: false });
    g.insertAbove(frame);
    g.addChild(frame);
    frame.data.pcFrame = true;
    const clip = new paper.Group({ insert: false });
    clip.data.pcClip = true;
    clip.addChildren(VP.zSort(contents));
    g.addChild(clip);
    g.data.effect = { type: 'powerclip' };
    FX.buildPowerclip(g);
    VP.setSelection([g]);
    VP.commit();
    VP.toast('PowerClip oluşturuldu · İçeriği taşımak için PowerClip aracıyla sürükleyin');
    return g;
  };
  FX.pcArrange = (g, how) => {
    if (!g || !FX.of(g) || FX.of(g).type !== 'powerclip') return VP.toast('Önce bir PowerClip seçin');
    const { frame } = FX.pcParts(g);
    const kids = FX.pcContents(g);
    if (!frame || !kids.length) return;
    const fb = frame.bounds;
    let cb = VP.selBounds(kids);
    if (how === 'fit' || how === 'fill') {
      const s = how === 'fit' ? Math.min(fb.width / cb.width, fb.height / cb.height) : Math.max(fb.width / cb.width, fb.height / cb.height);
      if (isFinite(s) && s > 0) VP.T.scale(kids, s, s, cb.center);
      cb = VP.selBounds(kids);
    }
    VP.T.move(kids, fb.center.subtract(cb.center));
    VP.commit();
  };

  /* ---------- generic ---------- */
  // Other modules (vp-text.js) register live object types here: {build, probe, restyle, bake, clear, describe, tool, scale}.
  FX.TYPES = FX.TYPES || {};
  FX.ext = (g) => {
    const fx = FX.of(g);
    return fx ? FX.TYPES[fx.type] || null : null;
  };
  FX.reflowScale = (it, sx, sy, anchor) => {
    const e = FX.ext(it);
    return !!(e && e.scale && e.scale(it, sx, sy, anchor));
  };
  FX.rebuild = (g) => {
    const fx = FX.of(g);
    if (!fx) return;
    const e = FX.ext(g);
    if (e) return e.build(g);
    if (fx.type === 'blend') FX.buildBlend(g);
    else if (fx.type === 'contour') FX.buildContour(g);
    else if (fx.type === 'extrude') FX.buildExtrude(g);
    else if (fx.type === 'lens') FX.buildLens(g);
    else if (fx.type === 'powerclip') FX.buildPowerclip(g);
    else FX.buildWarp(g);
  };
  FX.update = (g, patch) => {
    Object.assign(g.data.effect, patch);
    FX.rebuild(g);
  };
  /* Bake the effect into a plain group (keeps the look, drops the live link). */
  FX.bake = (g) => {
    if (!FX.of(g)) return g;
    const e = FX.ext(g);
    if (e && e.bake) e.bake(g);
    const steps = g.children.find((c) => c.data.blendSteps);
    if (steps) {
      const kids = steps.removeChildren();
      g.insertChildren(steps.index, kids);
      steps.remove();
    }
    g.children.forEach((c) => {
      ['effectSrc', 'extrudeSide', 'lensContent', 'pcFrame', 'pcClip', 'pcOutline'].forEach((k) => delete c.data[k]);
    });
    g.applyMatrix = true;
    delete g.data.effect;
    return g;
  };
  FX.separate = (g) => {
    g = g || VP.sel.find(FX.isFx);
    if (!g) return;
    const e = FX.ext(g);
    FX.bake(g);
    VP.setSelection([g]);
    VP.commit();
    VP.toast((e && e.bakeMsg) || 'Efekt ayrıldı · Artık normal bir grup');
  };
  /* Remove the effect and give back the original object(s). */
  FX.clear = (g) => {
    g = g || VP.sel.find(FX.isFx);
    if (!g) return;
    const fx = FX.of(g);
    const e = FX.ext(g);
    if (e && e.clear) {
      const res = e.clear(g);
      VP.setSelection(res || []);
      VP.commit();
      VP.toast(e.clearMsg || FX.NAMES[fx.type] + ' kaldırıldı');
      return;
    }
    let out = [];
    if (fx.type === 'envelope' || fx.type === 'perspective') {
      const holder = new paper.Group({ insert: false });
      let item = holder.importJSON(fx.source);
      if (item !== holder) item.remove();
      item.transform(g.matrix);
      item.insertAbove(g);
      g.remove();
      out = [item];
    } else if (fx.type === 'powerclip') {
      const { frame } = FX.pcParts(g);
      const kids = FX.pcContents(g);
      kids.slice().reverse().forEach((k) => k.insertAbove(g));
      if (frame) {
        delete frame.data.pcFrame;
        frame.insertAbove(g);
      }
      g.remove();
      out = (frame ? [frame] : []).concat(kids);
    } else if (fx.type === 'lens') {
      const src = FX.lensSource(g);
      g.children.slice().forEach((c) => c !== src && c.remove());
      if (src) {
        if (fx.origFill) {
          const h = new paper.Group({ insert: false });
          const orig = h.importJSON(fx.origFill);
          src.fillColor = orig.fillColor;
        }
        delete src.data.effectSrc;
        src.insertAbove(g);
      }
      g.remove();
      out = src ? [src] : [];
    } else {
      if (fx.type === 'blend') {
        const st = g.children.find((c) => c.data.blendSteps);
        if (st) st.remove();
      } else {
        const src = FX.contourSource(g);
        g.children.slice().forEach((c) => c !== src && c.remove());
      }
      g.applyMatrix = true;
      const kids = g.removeChildren();
      kids.forEach((k) => delete k.data.effectSrc);
      g.parent.insertChildren(g.index, kids);
      g.remove();
      out = kids;
    }
    VP.setSelection(out);
    VP.commit();
    VP.toast(FX.NAMES[fx.type] + ' kaldırıldı');
  };
  /* Representative child for reading fill/outline in the UI. */
  FX.probe = (g) => {
    const fx = FX.of(g);
    const e = FX.ext(g);
    if (e) return e.probe(g);
    if (fx.type === 'blend') return FX.blendEnds(g)[1];
    if (fx.type === 'contour' || fx.type === 'extrude') return FX.contourSource(g);
    if (fx.type === 'lens') {
      const src = FX.lensSource(g);
      const tmp = src.clone({ insert: false });
      tmp.fillColor = fx.color;
      return tmp;
    }
    if (fx.type === 'powerclip') return FX.pcParts(g).frame || g;
    return VP.leafItems(g.children)[0] || g;
  };
  /* Apply a style change to the effect's controlling object, then rebuild. */
  FX.restyle = (g, fn) => {
    const fx = FX.of(g);
    const e = FX.ext(g);
    if (e) return e.restyle(g, fn);
    if (fx.type === 'blend') {
      fn([FX.blendEnds(g)[1]]);
      if (!FX._blendTold) {
        VP.toast('Harmanlamanın bitiş nesnesi boyandı · Başlangıcı boyamak için efekti ayırın');
        FX._blendTold = true;
      }
    } else if (fx.type === 'contour' || fx.type === 'extrude') fn([FX.contourSource(g)]);
    else if (fx.type === 'powerclip') fn([FX.pcParts(g).frame]);
    else if (fx.type === 'lens') {
      const src = FX.lensSource(g);
      const tmp = src.clone({ insert: false });
      tmp.fillColor = fx.color;
      fn([tmp]);
      if (tmp.fillColor) fx.color = VP.hex(tmp.fillColor);
      src.strokeColor = tmp.strokeColor;
      src.strokeWidth = tmp.strokeWidth;
      src.dashArray = tmp.dashArray;
      src.data.dash = tmp.data.dash;
    } else {
      const holder = new paper.Group({ insert: false });
      const item = holder.importJSON(fx.source);
      fn([item]);
      fx.source = item.exportJSON({ asString: true });
    }
    FX.rebuild(g);
  };
  FX.describe = (g) => {
    const fx = FX.of(g);
    const e = FX.ext(g);
    if (e) return e.describe(g);
    if (fx.type === 'blend') return 'Harmanlama (' + fx.steps + ' adım)';
    if (fx.type === 'contour') return 'Kontur (' + (fx.dir === 'inside' ? 'iç' : 'dış') + ', ' + (fx.made != null ? fx.made : fx.steps) + ' adım)';
    if (fx.type === 'extrude') return 'Derinlik (' + (fx.mode === 'parallel' ? 'paralel' : 'perspektif') + ')';
    if (fx.type === 'lens') return 'Mercek: ' + ((FX.LENS[fx.kind] || {}).label || fx.kind);
    if (fx.type === 'powerclip') return 'PowerClip (' + FX.pcContents(g).length + ' nesne)';
    return FX.NAMES[fx.type];
  };

  /* ---------- tools ---------- */
  const T = VP.tools;
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);
  T.blendTool = {
    cursor: 'crosshair',
    first: null,
    busy() { return false; },
    activate() {
      this.first = null;
      if (VP.sel.length === 2) VP.toast('Seçili iki nesne için özellik çubuğunda “Harmanla”ya dokunun');
    },
    deactivate() { this.first = null; },
    down(e) {
      const hit = VP.hitItem(e.point);
      if (!hit) {
        this.first = null;
        VP.clearSelection();
        return;
      }
      if (FX.isFx(hit)) {
        this.first = null;
        VP.setSelection([hit]);
        return;
      }
      if (!this.first || !this.first.parent) {
        if (!FX.isShape(hit)) return VP.toast('Harmanlama eğrilerle çalışır · Metni önce eğriye dönüştürün');
        this.first = hit;
        VP.setSelection([hit]);
        VP.toast('Şimdi ikinci nesneye dokunun');
        return;
      }
      if (hit === this.first) return;
      const a = this.first;
      this.first = null;
      FX.blend([a, hit]);
    },
    move() {},
    up() {},
    cancel() { this.first = null; }
  };
  T.contourTool = {
    cursor: 'crosshair',
    busy() { return false; },
    down(e) {
      const hit = VP.hitItem(e.point);
      if (!hit) return VP.clearSelection();
      if (FX.isFx(hit)) return VP.setSelection([hit]);
      FX.contour(hit);
    },
    move() {},
    up() {},
    cancel() {}
  };
  const warpTool = (type) => ({
    cursor: 'default',
    drag: null,
    busy() { return !!(this.drag && this.drag.changed); },
    target() {
      const g = VP.sel.length === 1 ? VP.sel[0] : null;
      const fx = FX.of(g);
      return fx && fx.type === type ? g : null;
    },
    nodes(g) {
      const fx = g.data.effect;
      return type === 'envelope' ? fx.nodes : fx.quad;
    },
    handleAt(pt) {
      const g = this.target();
      if (!g) return null;
      const tol = (VP.coarse ? 22 : 11) / zoom();
      const nodes = this.nodes(g);
      let best = null;
      let bd = tol;
      Object.keys(nodes).forEach((k) => {
        const gp = g.localToGlobal(Pt(nodes[k][0], nodes[k][1]));
        const d = gp.getDistance(pt);
        if (d <= bd) {
          bd = d;
          best = k;
        }
      });
      return best;
    },
    down(e) {
      const k = this.handleAt(e.point);
      if (k) {
        this.drag = { key: k, changed: false };
        return;
      }
      const hit = VP.hitItem(e.point);
      if (!hit) return VP.clearSelection();
      const fx = FX.of(hit);
      if (fx && fx.type === type) return VP.setSelection([hit]);
      FX.addWarp(hit, type);
    },
    move(e) {
      if (!this.drag) return;
      const g = this.target();
      if (!g) return;
      const lp = g.globalToLocal(VP.snapPt(e.point));
      this.nodes(g)[this.drag.key] = [lp.x, lp.y];
      this.drag.changed = true;
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        if (g.parent) FX.buildWarp(g);
        VP.drawOverlay();
        VP.emit('transform');
      });
    },
    up() {
      const d = this.drag;
      this.drag = null;
      if (d && d.changed) {
        const g = this.target();
        if (this._raf) {
          cancelAnimationFrame(this._raf);
          this._raf = 0;
        }
        if (g) FX.buildWarp(g);
        VP.commit();
      }
    },
    cancel() {
      if (this.drag && this.drag.changed) VP.undoLive();
      this.drag = null;
    },
    overlay(L) {
      const g = this.target();
      if (!g) return false;
      const s = 1 / zoom();
      const a = acc();
      const n = this.nodes(g);
      const G = (p) => g.localToGlobal(Pt(p[0], p[1]));
      const outline = new paper.Path({ strokeColor: a, strokeWidth: 1.2 * s, dashArray: [5 * s, 3 * s], closed: true, insert: false });
      if (type === 'envelope') {
        const edge = (A, M, B) => {
          for (let i = 0; i < 16; i++) outline.add(G(qb(A, M, B, i / 16)));
        };
        edge(n.tl, n.tm, n.tr);
        edge(n.tr, n.rm, n.br);
        edge(n.br, n.bm, n.bl);
        edge(n.bl, n.lm, n.tl);
      } else ['tl', 'tr', 'br', 'bl'].forEach((k) => outline.add(G(n[k])));
      L.addChild(outline);
      const hs = (VP.coarse ? 13 : 9) * s;
      Object.keys(n).forEach((k) => {
        const p = G(n[k]);
        const isMid = k.length === 2 && /m/.test(k);
        const shape = isMid ? new paper.Path.Circle({ center: p, radius: hs * 0.55, insert: false }) : new paper.Path.Rectangle({ rectangle: new paper.Rectangle(p.subtract(hs / 2), new paper.Size(hs, hs)), insert: false });
        shape.fillColor = this.drag && this.drag.key === k ? a : new paper.Color('#ffffff');
        shape.strokeColor = a;
        shape.strokeWidth = 1.4 * s;
        L.addChild(shape);
      });
      return true;
    }
  });
  T.envelopeTool = warpTool('envelope');
  T.perspectiveTool = warpTool('perspective');

  /* Extrude tool: tap to add depth, drag the vanishing point (or the parallel offset handle). */
  T.extrudeTool = {
    cursor: 'default',
    drag: null,
    busy() { return !!(this.drag && this.drag.changed); },
    target() {
      const g = VP.sel.length === 1 ? VP.sel[0] : null;
      const fx = FX.of(g);
      return fx && fx.type === 'extrude' ? g : null;
    },
    handleLocal(g) {
      const fx = g.data.effect;
      if (fx.mode === 'parallel') {
        const c = FX.contourSource(g).bounds.center;
        return Pt(c.x + fx.offset[0], c.y + fx.offset[1]);
      }
      return Pt(fx.vp[0], fx.vp[1]);
    },
    down(e) {
      const g = this.target();
      if (g) {
        const hp = g.localToGlobal(this.handleLocal(g));
        if (hp.getDistance(e.point) <= (VP.coarse ? 24 : 12) / zoom()) {
          this.drag = { changed: false };
          return;
        }
      }
      const hit = VP.hitItem(e.point);
      if (!hit) return VP.clearSelection();
      if (FX.isFx(hit)) return VP.setSelection([hit]);
      FX.extrude(hit);
    },
    move(e) {
      const g = this.target();
      if (!this.drag || !g) return;
      const lp = g.globalToLocal(VP.snapPt(e.point));
      const fx = g.data.effect;
      if (fx.mode === 'parallel') {
        const c = FX.contourSource(g).bounds.center;
        fx.offset = [lp.x - c.x, lp.y - c.y];
      } else fx.vp = [lp.x, lp.y];
      this.drag.changed = true;
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        if (g.parent) FX.buildExtrude(g);
        VP.drawOverlay();
      });
    },
    up() {
      const d = this.drag;
      this.drag = null;
      if (d && d.changed) {
        const g = this.target();
        if (this._raf) {
          cancelAnimationFrame(this._raf);
          this._raf = 0;
        }
        if (g) FX.buildExtrude(g);
        VP.commit();
      }
    },
    cancel() {
      if (this.drag && this.drag.changed) VP.undoLive();
      this.drag = null;
    },
    overlay(L) {
      const g = this.target();
      if (!g) return false;
      const s = 1 / zoom();
      const a = acc();
      const c = g.localToGlobal(FX.contourSource(g).bounds.center);
      const h = g.localToGlobal(this.handleLocal(g));
      L.addChild(new paper.Path.Line({ from: c, to: h, strokeColor: a, strokeWidth: 1.1 * s, dashArray: [5 * s, 3 * s], insert: false }));
      const r = (VP.coarse ? 11 : 8) * s;
      L.addChild(new paper.Path.Circle({ center: h, radius: r, fillColor: '#ffffff', strokeColor: a, strokeWidth: 1.4 * s, insert: false }));
      L.addChild(new paper.Path.Line({ from: h.subtract([r * 0.6, r * 0.6]), to: h.add([r * 0.6, r * 0.6]), strokeColor: a, strokeWidth: 1.4 * s, insert: false }));
      L.addChild(new paper.Path.Line({ from: h.add([-r * 0.6, r * 0.6]), to: h.add([r * 0.6, -r * 0.6]), strokeColor: a, strokeWidth: 1.4 * s, insert: false }));
      L.addChild(new paper.Path.Rectangle({ rectangle: g.bounds, strokeColor: a, strokeWidth: s, opacity: 0.5, insert: false }));
      return true;
    }
  };
  T.lensTool = {
    cursor: 'crosshair',
    busy() { return false; },
    down(e) {
      const hit = VP.hitItem(e.point);
      if (!hit) return VP.clearSelection();
      if (FX.isFx(hit)) return VP.setSelection([hit]);
      FX.lens(hit, VP.defaults.lensKind);
    },
    move() {},
    up() {},
    cancel() {}
  };
  /* PowerClip tool: with content selected, tap the container. On a PowerClip, drag to move its content. */
  T.powerclipTool = {
    cursor: 'default',
    pending: null,
    op: null,
    busy() { return !!(this.op && this.op.changed); },
    activate() {
      this.pending = VP.sel.length && !(VP.sel.length === 1 && FX.of(VP.sel[0]) && FX.of(VP.sel[0]).type === 'powerclip') ? VP.sel.slice() : null;
      if (this.pending) VP.toast(this.pending.length + ' nesne içerik olarak alındı · Şimdi kap olacak kapalı şekle dokunun');
    },
    deactivate() {
      this.pending = null;
      this.op = null;
    },
    down(e) {
      // While content is waiting, look through it for the container underneath.
      if (this.pending) {
        this.pending = this.pending.filter((it) => it.parent);
        const frame = VP.hitItem(e.point, { exclude: this.pending });
        const contents = this.pending;
        this.pending = null;
        if (!frame) {
          VP.clearSelection();
          VP.toast('PowerClip iptal edildi · Kap olacak şekle dokunun');
          VP.emit('tool');
          return;
        }
        FX.powerclip(contents, frame);
        VP.emit('tool');
        return;
      }
      const hit = VP.hitItem(e.point);
      const cur = VP.sel.length === 1 && FX.of(VP.sel[0]) && FX.of(VP.sel[0]).type === 'powerclip' ? VP.sel[0] : null;
      if (cur && hit === cur) {
        this.op = { last: e.point, changed: false, g: cur };
        return;
      }
      if (!hit) {
        VP.clearSelection();
        return;
      }
      if (FX.of(hit) && FX.of(hit).type === 'powerclip') {
        this.pending = null;
        VP.setSelection([hit]);
        return;
      }
      this.pending = [hit];
      VP.setSelection([hit]);
      VP.emit('tool');
      VP.toast('İçerik seçildi · Şimdi kap olacak şekle dokunun');
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      const d = e.point.subtract(op.last);
      if (!op.changed && d.length * zoom() < 3) return;
      op.last = e.point;
      VP.T.move(FX.pcContents(op.g), d);
      op.changed = true;
      VP.drawOverlay();
    },
    up() {
      const op = this.op;
      this.op = null;
      if (op && op.changed) VP.commit();
    },
    cancel() {
      if (this.op && this.op.changed) VP.undoLive();
      this.op = null;
    },
    overlayAfter(L) {
      if (!this.pending) return;
      const s = 1 / zoom();
      this.pending.forEach((it) => {
        if (it.parent) L.addChild(new paper.Path.Rectangle({ rectangle: it.bounds, strokeColor: acc(), strokeWidth: 1.5 * s, dashArray: [6 * s, 4 * s], insert: false }));
      });
    }
  };

  Object.assign(VP.TOOL_META, {
    blendTool: { label: 'Harmanlama', icon: 'blend', key: '', hint: 'İlk nesneye, sonra ikinci nesneye dokunun · Adım sayısı özellik çubuğunda' },
    contourTool: { label: 'Kontur', icon: 'contour', key: '', hint: 'Kapalı bir şekle dokunun · Yön, adım ve aralık özellik çubuğunda' },
    envelopeTool: { label: 'Zarf', icon: 'envelope', key: '', hint: 'Bir nesneye dokunun, sonra 8 düğümü sürükleyerek bükün · Hazır şekiller özellik çubuğunda' },
    perspectiveTool: { label: 'Perspektif', icon: 'perspective', key: '', hint: 'Bir nesneye dokunun, sonra 4 köşeyi sürükleyin · Hazır perspektifler özellik çubuğunda' },
    extrudeTool: { label: 'Derinlik', icon: 'extrude', key: '', hint: 'Bir şekle dokunun · Kaçış noktasını (×) sürükleyin · Derinlik ve yan renk özellik çubuğunda' },
    lensTool: { label: 'Mercek', icon: 'lens', key: '', hint: 'Mercek olacak kapalı şekle dokunun · Altındaki nesneler mercekten görünür · Tür özellik çubuğunda' },
    powerclipTool: { label: 'PowerClip', icon: 'powerclip', key: '', hint: 'İçeriğe, sonra kaba dokunun · PowerClip üzerinde sürükleyin: içeriği taşı' }
  });
  Object.assign(
    VP.defaults,
    { blendSteps: 8, blendAccel: 0, contourDir: 'outside', contourSteps: 3, contourOffset: 3, contourEnd: '#ffffff', extrudeMode: 'perspective', extrudeDepth: 0.25, extrudeShade: true, lensKind: 'magnify' },
    VP.defaults
  );
  FX.toolFor = (g) => {
    const fx = FX.of(g);
    const e = FX.ext(g);
    if (e) return e.tool || null;
    return fx ? { envelope: 'envelopeTool', perspective: 'perspectiveTool', blend: 'blendTool', contour: 'contourTool', extrude: 'extrudeTool', lens: 'lensTool', powerclip: 'powerclipTool' }[fx.type] : null;
  };
})();
