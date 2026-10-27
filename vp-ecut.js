/* VektörPad plug-in "Kesim ve Montaj" for sign, label and print-and-cut work:
   die / cut lines (contour, rectangle, rounded, oval) with bridges, registration marks for cutting plotters,
   crop marks, step-and-repeat imposition that fills the sheet, nesting, weed box and weed lines, bleed,
   cut length and cost, and separate cut / print files. Lives in its own docker and the Plugins menu. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const FX = VP.fx;
  const esc = UI.h.esc;
  const ic = UI.h.ic;
  const PT = VP.toPT;
  const MMv = VP.toMM;
  const P = (x, y) => new paper.Point(x, y);
  const EC = (VP.ecut = {});
  const CUT = '#ec008c';
  const REG = '#1d1d1b';
  const DEF = {
    cutKind: 'contour', cutDir: 'out', cutOff: 2, cutRad: 3, cutMerge: false, cutHoles: false, bridges: 0, bridgeW: 1,
    markKind: 'square', markSize: 5, markOff: 5, markWhere: 'sel', markCount: 4, markMid: 0,
    cropLen: 4, cropOff: 2, cropEach: false,
    srMode: 'fill', srCols: 3, srRows: 3, srGapX: 3, srGapY: 3, srMargin: 10, srRotate: true, srCenter: true, srCrop: false,
    nestGap: 3, nestRotate: true, weedOff: 3, weedLines: true, bleed: 2, price: 0, incMarks: true
  };
  const S = () => {
    const s = (VP.settings.ecut = Object.assign({}, DEF, VP.settings.ecut || {}));
    // the distance is kept positive; the direction says outside or inside
    if (s.cutOff < 0) {
      s.cutOff = -s.cutOff;
      s.cutDir = 'in';
    }
    if (s.cutDir !== 'in') s.cutDir = 'out';
    return s;
  };
  const cutDist = (s) => PT(s.cutOff) * (s.cutDir === 'in' ? -1 : 1);
  EC.S = S;

  /* =============== helper layers =============== */
  const LAYERS = { cut: 'Bıçak izi', marks: 'Hizalama işaretleri' };
  EC.findLayer = (kind) => VP.userLayers().find((l) => l.data && l.data.ecut === kind) || null;
  EC.layer = (kind) => {
    let L = EC.findLayer(kind);
    if (L) return L;
    const keep = VP.activeLayer;
    L = new paper.Layer({ name: LAYERS[kind], insert: false });
    L.data.ecut = kind;
    paper.project.addLayer(L);
    VP.keepSysOrder();
    if (keep && paper.project.layers.includes(keep)) keep.activate();
    VP.emit('layers');
    return L;
  };
  const inEc = (it) => !!(it && it.layer && it.layer.data && it.layer.data.ecut);
  const work = () => VP.sel.filter((it) => !inEc(it));
  const style = (p, color, w) => {
    p.fillColor = null;
    p.strokeColor = new paper.Color(color || CUT);
    p.strokeWidth = w || 0.5;
    p.strokeJoin = 'round';
    p.strokeCap = 'round';
    return p;
  };
  const ids = (items) => items.map((it) => (it.data.ecId = it.data.ecId || VP.uid()));
  const linked = (items) => {
    const L = EC.findLayer('cut');
    if (!L) return [];
    const want = new Set(items.map((it) => it.data.ecId).filter(Boolean));
    return L.children.filter((c) => (c.data.ecFor || []).some((x) => want.has(x)));
  };

  /* =============== outlines of objects =============== */
  EC.shapesOf = (items) => {
    const holder = new paper.Group({ insert: false });
    items.forEach((it) => holder.addChild(it.clone({ insert: false })));
    const flat = (it) => {
      if (it instanceof paper.Group) it.applyMatrix = true;
      if (it.children) it.children.slice().forEach(flat);
    };
    flat(holder);
    const shapes = [];
    const walk = (it) => {
      if (!it.visible || (it.data && it.data.hitOnly)) return;
      if (it instanceof paper.PointText) {
        const cp = VP.textToPath(it);
        shapes.push(cp || new paper.Path.Rectangle({ rectangle: it.bounds, insert: false }));
        return;
      }
      if (it instanceof paper.Raster) return shapes.push(new paper.Path.Rectangle({ rectangle: it.bounds, insert: false }));
      if (it instanceof paper.Shape) return shapes.push(it.toPath(false));
      if (it instanceof paper.CompoundPath || (it instanceof paper.Path && it.closed)) return shapes.push(it);
      if (it instanceof paper.Path) {
        // an open line is cut along its stroke
        if (it.strokeColor && it.strokeWidth > 0 && it.length > 0) {
          const r = new paper.Path.Rectangle({ rectangle: it.strokeBounds, insert: false });
          shapes.push(r);
        }
        return;
      }
      if (it.children) it.children.slice().forEach(walk);
    };
    walk(holder);
    return shapes;
  };
  const unite = (shapes) => {
    let acc = shapes[0].clone({ insert: false });
    for (let i = 1; i < shapes.length; i++) {
      try {
        acc = acc.unite(shapes[i], { insert: false });
      } catch (e) { /* skip a shape that cannot be merged */ }
    }
    return acc;
  };
  // only the outer outlines (no holes, no islands inside holes)
  const outerOnly = (p) => {
    if (!(p instanceof paper.CompoundPath)) return p;
    const kids = p.children.slice().sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const kept = [];
    kids.forEach((k) => {
      const q = k.interiorPoint || k.bounds.center;
      if (!kept.some((o) => o.contains(q))) kept.push(k);
    });
    const out = kept.length === 1 ? kept[0].clone({ insert: false }) : new paper.CompoundPath({ children: kept.map((k) => k.clone({ insert: false })), insert: false });
    return out;
  };
  // fewer points on the offset polygon (Ramer–Douglas–Peucker); paper's simplify() distorts closed paths
  const rdp = (pts, eps) => {
    if (pts.length < 3) return pts;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const ab = b.subtract(a);
    const L = ab.length;
    let iMax = 0;
    let dMax = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = L < 1e-9 ? pts[i].getDistance(a) : Math.abs(ab.cross(pts[i].subtract(a))) / L;
      if (d > dMax) {
        dMax = d;
        iMax = i;
      }
    }
    if (dMax <= eps) return [a, b];
    const l = rdp(pts.slice(0, iMax + 1), eps);
    return l.slice(0, -1).concat(rdp(pts.slice(iMax), eps));
  };
  const smooth = (p) => {
    const parts = p instanceof paper.CompoundPath ? p.children : [p];
    parts.forEach((c) => {
      if (c.segments.length <= 12 || c.curves.some((cv) => !cv.isStraight())) return;
      const pts = c.segments.map((s) => s.point);
      // split the loop at its farthest point so both halves are open runs
      let far = 0;
      pts.forEach((q, i) => {
        if (q.getDistance(pts[0]) > pts[far].getDistance(pts[0])) far = i;
      });
      const r = rdp(pts.slice(0, far + 1), 0.08).slice(0, -1).concat(rdp(pts.slice(far).concat([pts[0]]), 0.08).slice(0, -1));
      if (r.length >= 3) c.segments = r;
    });
    return p;
  };
  const shapeLine = (kind, box, rad) => {
    if (kind === 'oval') return new paper.Path.Ellipse({ rectangle: box, insert: false });
    if (kind === 'round') return new paper.Path.Rectangle({ rectangle: box, radius: Math.min(rad, box.width / 2, box.height / 2), insert: false });
    return new paper.Path.Rectangle({ rectangle: box, insert: false });
  };

  /* =============== bridges (uncut tabs) =============== */
  const subPath = (c, a, b) => {
    const pts = [c.getPointAt(a)];
    let o = 0;
    c.curves.forEach((cv) => {
      const L = cv.length;
      const o0 = o;
      o += L;
      if (o <= a || o0 >= b) return;
      if (cv.isStraight()) {
        if (o < b && o > a) pts.push(cv.point2);
      } else {
        const n = Math.max(2, Math.ceil(L / 2));
        for (let j = 1; j <= n; j++) {
          const t = o0 + (L * j) / n;
          if (t > a && t < b) pts.push(c.getPointAt(t));
        }
      }
    });
    pts.push(c.getPointAt(b));
    return new paper.Path({ segments: pts.filter(Boolean), insert: false });
  };
  EC.bridges = (p, n, gw) => {
    const parts = p instanceof paper.CompoundPath ? p.children.slice() : [p];
    const out = [];
    parts.forEach((c) => {
      const L = c.length;
      if (!c.closed || L < n * gw * 4) return out.push(c.clone({ insert: false }));
      // start at the top-left-most point so the tabs land in predictable places
      for (let i = 0; i < n; i++) {
        const a = (L * i) / n + gw / 2;
        const b = (L * (i + 1)) / n - gw / 2;
        if (b > a) out.push(subPath(c, a, Math.min(b, L - 1e-6)));
      }
    });
    return out;
  };

  /* =============== die / cut lines =============== */
  EC.cutLine = () => {
    const items = work();
    if (!items.length) return VP.toast('Bıçak izi için önce nesneleri seçin');
    const s = S();
    const d = cutDist(s);
    const groups = s.cutMerge ? [items] : items.map((i) => [i]);
    const L = EC.layer('cut');
    const made = [];
    let tooBig = 0;
    groups.forEach((g) => {
      const forIds = ids(g);
      let p = null;
      if (s.cutKind === 'contour') {
        const shapes = EC.shapesOf(g);
        if (!shapes.length) return;
        let acc = unite(shapes);
        if (!s.cutHoles) acc = outerOnly(acc);
        p = Math.abs(d) > 0.01 ? FX.offsetItem(acc, d) : acc.clone({ insert: false });
        if (p && Math.abs(d) > 0.01) smooth(p);
        if (!p && d < 0) {
          tooBig++;
          return;
        }
        if (!p) p = shapeLine('rect', VP.selBounds(g).expand(d * 2), 0);
      } else {
        const box = VP.selBounds(g).expand(d * 2);
        if (box.width < 0.5 || box.height < 0.5) {
          tooBig++;
          return;
        }
        p = shapeLine(s.cutKind, box, PT(s.cutRad));
      }
      const pieces = s.bridges > 0 ? EC.bridges(p, Math.round(s.bridges), PT(s.bridgeW)) : [p];
      let res = pieces.length === 1 ? pieces[0] : new paper.Group({ children: pieces, insert: false });
      if (res instanceof paper.Group) res.children.forEach((c) => style(c));
      else style(res);
      res.name = 'Bıçak izi';
      res.data = { ecCut: true, ecFor: forIds };
      L.addChild(res);
      made.push(res);
    });
    if (!made.length) return VP.toast(tooBig ? 'İçe mesafe bu nesne için çok büyük · Daha küçük bir mesafe girin' : 'Seçimde kesilecek şekil bulunamadı');
    VP.setSelection(made);
    VP.commit();
    const len = made.reduce((a, m) => a + EC.lengthOf(m), 0);
    VP.toast(made.length + ' bıçak izi oluşturuldu (' + VP.num(s.cutOff, 2) + ' mm ' + (d < 0 ? 'içe' : 'dışa') + ') · Toplam ' + VP.num(MMv(len) / 1000, 2) + ' m' + (tooBig ? ' · ' + tooBig + ' nesne için mesafe çok büyük' : ''));
    return made;
  };
  EC.lengthOf = (it) => {
    if (it instanceof paper.Path) return it.length;
    if (it.children) return it.children.reduce((a, c) => a + EC.lengthOf(c), 0);
    return 0;
  };
  EC.clearLayer = (kind) => {
    const L = EC.findLayer(kind);
    if (!L || !L.children.length) return VP.toast((kind === 'cut' ? 'Bıçak izi' : 'Hizalama işareti') + ' yok');
    VP.sel = VP.sel.filter((it) => it.layer !== L);
    L.removeChildren();
    VP.setSelection(VP.sel);
    VP.commit();
    VP.toast(kind === 'cut' ? 'Bıçak izleri silindi' : 'Hizalama işaretleri silindi');
  };
  EC.toggleLayer = (kind) => {
    const L = EC.findLayer(kind);
    if (!L) return VP.toast('Bu sayfada ' + LAYERS[kind].toLowerCase() + ' katmanı yok');
    L.visible = !L.visible;
    VP.commit();
    VP.toast(LAYERS[kind] + (L.visible ? ' gösteriliyor' : ' gizlendi'));
  };
  EC.selectLayer = (kind) => {
    const L = EC.findLayer(kind);
    if (!L || !L.children.length) return VP.toast('Seçilecek nesne yok');
    VP.setSelection(L.children.slice());
  };

  /* =============== registration marks =============== */
  const mark = (kind, c, sz) => {
    const col = new paper.Color(REG);
    if (kind === 'circle') return new paper.Path.Circle({ center: c, radius: sz / 2, fillColor: col, insert: false });
    if (kind === 'cross') {
      const g = new paper.Group({ insert: false });
      g.addChild(new paper.Path.Circle({ center: c, radius: sz * 0.32, strokeColor: col, strokeWidth: 0.5, insert: false }));
      g.addChild(new paper.Path.Line({ from: c.add([-sz / 2, 0]), to: c.add([sz / 2, 0]), strokeColor: col, strokeWidth: 0.5, insert: false }));
      g.addChild(new paper.Path.Line({ from: c.add([0, -sz / 2]), to: c.add([0, sz / 2]), strokeColor: col, strokeWidth: 0.5, insert: false }));
      return g;
    }
    return new paper.Path.Rectangle({ rectangle: new paper.Rectangle(c.x - sz / 2, c.y - sz / 2, sz, sz), fillColor: col, insert: false });
  };
  // L-shaped corner marks point into the job
  const corner = (c, sz, sx, sy) => {
    const w = Math.max(sz * 0.18, 0.8);
    const p = new paper.Path({ segments: [c.add([sx * sz, 0]), c, c.add([0, sy * sz])], strokeColor: new paper.Color(REG), strokeWidth: w, strokeJoin: 'miter', strokeCap: 'butt', insert: false });
    return p;
  };
  EC.marks = () => {
    const s = S();
    const items = work();
    const usePage = s.markWhere === 'page' || !items.length;
    const box = usePage ? VP.pageRect() : VP.selBounds(items);
    const off = PT(s.markOff);
    const sz = PT(s.markSize);
    const L = EC.layer('marks');
    L.removeChildren();
    // centres of the corner marks: inside the page margin, or outside the selection
    const k = usePage ? off + sz / 2 : -(off + sz / 2);
    const tl = P(box.left + k, box.top + k);
    const tr = P(box.right - k, box.top + k);
    const br = P(box.right - k, box.bottom - k);
    const bl = P(box.left + k, box.bottom - k);
    const corners = s.markCount === 3 ? [tl, bl, br] : [tl, tr, br, bl];
    const g = new paper.Group({ insert: false });
    g.name = 'Hizalama işaretleri';
    corners.forEach((c) => {
      if (s.markKind === 'corner') {
        const sx = c.x < box.center.x ? 1 : -1;
        const sy = c.y < box.center.y ? 1 : -1;
        g.addChild(corner(c.add([-sx * sz / 2, -sy * sz / 2]), sz, sx, sy));
      } else g.addChild(mark(s.markKind, c, sz));
    });
    // extra marks down both long sides for long jobs
    const mid = PT(s.markMid || 0);
    if (mid > sz * 3) {
      const span = bl.y - tl.y;
      const n = Math.floor(span / mid);
      for (let i = 1; i <= n; i++) {
        const y = tl.y + (span * i) / (n + 1);
        g.addChild(mark(s.markKind === 'corner' ? 'square' : s.markKind, P(tl.x, y), sz));
        g.addChild(mark(s.markKind === 'corner' ? 'square' : s.markKind, P(tr.x, y), sz));
      }
    }
    g.data = { ecMarks: true, box: [box.x, box.y, box.width, box.height] };
    L.addChild(g);
    VP.commit();
    const outside = !VP.pageRect().contains(g.bounds);
    VP.toast(corners.length + ' köşe işareti eklendi' + (g.children.length > corners.length ? ' + ' + (g.children.length - corners.length) + ' ara işaret' : '') + (outside ? ' · Dikkat: işaretler sayfa dışına taşıyor' : ''));
    return g;
  };
  // crop marks around boxes
  EC.cropMarksFor = (boxes, into) => {
    const s = S();
    const len = PT(s.cropLen);
    const gap = PT(s.cropOff);
    const g = new paper.Group({ insert: false });
    g.name = 'Kesim işaretleri';
    const col = new paper.Color(REG);
    const line = (a, b) => g.addChild(new paper.Path.Line({ from: a, to: b, strokeColor: col, strokeWidth: 0.25, insert: false }));
    boxes.forEach((b) => {
      [[b.left, b.top, -1, -1], [b.right, b.top, 1, -1], [b.right, b.bottom, 1, 1], [b.left, b.bottom, -1, 1]].forEach(([x, y, sx, sy]) => {
        line(P(x + sx * gap, y), P(x + sx * (gap + len), y));
        line(P(x, y + sy * gap), P(x, y + sy * (gap + len)));
      });
    });
    g.data = { ecCrop: true };
    (into || EC.layer('marks')).addChild(g);
    return g;
  };
  EC.cropMarks = () => {
    const items = work();
    if (!items.length) return VP.toast('Kesim işareti için nesne seçin');
    EC.cropMarksFor(S().cropEach ? items.map((i) => i.bounds) : [VP.selBounds(items)]);
    VP.commit();
    VP.toast('Kesim işaretleri eklendi');
  };

  /* =============== step and repeat on the sheet =============== */
  const unitOf = (items) => {
    const base = items.filter((it) => !inEc(it));
    const extra = linked(base).filter((c) => !items.includes(c));
    return VP.zSort(items.concat(extra));
  };
  const fitCount = (W, H, w, h, gx, gy) => [Math.max(0, Math.floor((W + gx) / (w + gx))), Math.max(0, Math.floor((H + gy) / (h + gy)))];
  EC.plan = () => {
    const s = S();
    const items = VP.sel.length ? unitOf(VP.sel) : [];
    if (!items.length) return null;
    const b = VP.selBounds(items);
    const area = VP.pageRect().expand(-2 * PT(s.srMargin));
    const gx = PT(s.srGapX);
    const gy = PT(s.srGapY);
    let rot = false;
    let [cols, rows] = s.srMode === 'grid' ? [Math.max(1, s.srCols | 0), Math.max(1, s.srRows | 0)] : fitCount(area.width, area.height, b.width, b.height, gx, gy);
    if (s.srMode !== 'grid' && s.srRotate) {
      const [c2, r2] = fitCount(area.width, area.height, b.height, b.width, gx, gy);
      if (c2 * r2 > cols * rows) {
        cols = c2;
        rows = r2;
        rot = true;
      }
    }
    const w = rot ? b.height : b.width;
    const h = rot ? b.width : b.height;
    const used = (cols * rows * b.width * b.height) / (VP.page().w * VP.page().h);
    return { items, b, area, gx, gy, cols, rows, rot, w, h, used };
  };
  EC.impose = () => {
    const s = S();
    const pl = EC.plan();
    if (!pl) return VP.toast('Çoğaltmak için önce bir nesne (etiket, logo…) seçin');
    if (!pl.cols || !pl.rows) return VP.toast('Nesne bu kenar boşluğuyla sayfaya sığmıyor · Boşluğu küçültün ya da sayfayı büyütün');
    const { items, area, gx, gy, cols, rows, rot, w, h } = pl;
    if (rot) VP.T.rotate(items, 90, VP.selBounds(items).center);
    const totW = cols * w + (cols - 1) * gx;
    const totH = rows * h + (rows - 1) * gy;
    const x0 = s.srCenter ? area.left + (area.width - totW) / 2 : area.left;
    const y0 = s.srCenter ? area.top + (area.height - totH) / 2 : area.top;
    const b0 = VP.selBounds(items);
    VP.T.move(items, P(x0 - b0.left, y0 - b0.top));
    const all = items.slice();
    const boxes = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        boxes.push(new paper.Rectangle(x0 + c * (w + gx), y0 + r * (h + gy), w, h));
        if (!r && !c) continue;
        const copies = items.map((it) => {
          const k = VP.cloneItem(it);
          k.insertAbove(it);
          return k;
        });
        // copies of cut lines follow their own copied objects
        const map = {};
        copies.forEach((k, i) => {
          if (items[i].data.ecId) {
            const nid = VP.uid();
            map[items[i].data.ecId] = nid;
            k.data.ecId = nid;
          }
        });
        copies.forEach((k) => {
          if (k.data.ecFor) k.data.ecFor = k.data.ecFor.map((x) => map[x] || x);
        });
        VP.T.move(copies, P(c * (w + gx), r * (h + gy)));
        all.push(...copies);
      }
    }
    if (s.srCrop) EC.cropMarksFor(boxes);
    VP.setSelection(all.filter((it) => !inEc(it)));
    VP.commit();
    VP.toast(cols * rows + ' adet (' + cols + ' × ' + rows + ')' + (rot ? ' · 90° döndürülerek' : '') + ' · Sayfa kullanımı %' + Math.round(pl.used * 100));
    return all;
  };

  /* =============== nesting =============== */
  EC.nest = () => {
    const s = S();
    const base = work();
    if (base.length < 2) return VP.toast('Yerleştirme için en az iki nesne seçin');
    // an object travels with its cut line; objects that share a cut line travel together
    let units = base.map((it) => ({ items: [it], ids: new Set([it.data.ecId].filter(Boolean)) }));
    const cutL = EC.findLayer('cut');
    (cutL ? cutL.children : []).forEach((c) => {
      const f = c.data.ecFor || [];
      const hit = units.filter((u) => f.some((x) => u.ids.has(x)));
      if (!hit.length) return;
      const m = hit[0];
      hit.slice(1).forEach((u) => {
        m.items.push(...u.items);
        u.ids.forEach((x) => m.ids.add(x));
        units = units.filter((z) => z !== u);
      });
      m.items.push(c);
    });
    const gap = PT(s.nestGap);
    const area = VP.pageRect().expand(-2 * PT(s.srMargin));
    units.forEach((u) => {
      const b = VP.selBounds(u.items);
      // lay tall pieces on their side when that still fits the sheet width
      if (s.nestRotate && b.height > b.width * 1.05 && b.height <= area.width) VP.T.rotate(u.items, 90, b.center);
      u.b = VP.selBounds(u.items);
    });
    units.sort((a, b) => b.b.height - a.b.height || b.b.width - a.b.width);
    let x = area.left;
    let y = area.top;
    let shelf = 0;
    let over = 0;
    const outX = VP.pageRect().right + PT(20);
    let oy = area.top;
    units.forEach((u) => {
      const { width: w, height: h } = u.b;
      if (x > area.left && x + w > area.right + 0.01) {
        x = area.left;
        y += shelf + gap;
        shelf = 0;
      }
      let tx = x;
      let ty = y;
      if (y + h > area.bottom + 0.01 || w > area.width + 0.01) {
        // does not fit: parked to the right of the page
        tx = outX;
        ty = oy;
        oy += h + gap;
        over++;
      } else {
        x += w + gap;
        shelf = Math.max(shelf, h);
      }
      VP.T.move(u.items, P(tx - u.b.left, ty - u.b.top));
    });
    VP.setSelection(base);
    VP.commit();
    VP.toast(units.length - over + ' parça sayfaya yerleştirildi' + (over ? ' · ' + over + ' parça sığmadı, sayfanın sağına kondu' : ''));
  };

  /* =============== weeding =============== */
  const freeGaps = (spans, lo, hi) => {
    spans.sort((a, b) => a[0] - b[0]);
    const out = [];
    let end = lo;
    spans.forEach(([a, b]) => {
      if (a > end + 0.5 && end > lo) out.push((end + a) / 2);
      end = Math.max(end, b);
    });
    return out.filter((v) => v > lo && v < hi);
  };
  EC.weed = () => {
    const s = S();
    const items = work();
    const all = items.concat(linked(items));
    if (!all.length) return VP.toast('Ayıklama çerçevesi için nesneleri seçin');
    const box = VP.selBounds(all).expand(2 * PT(s.weedOff));
    const L = EC.layer('cut');
    const g = new paper.Group({ insert: false });
    g.name = 'Ayıklama';
    g.addChild(style(new paper.Path.Rectangle({ rectangle: box, insert: false })));
    let n = 0;
    if (s.weedLines && all.length > 1) {
      const bs = all.map((it) => it.bounds);
      freeGaps(bs.map((b) => [b.left, b.right]), box.left, box.right).forEach((x) => {
        g.addChild(style(new paper.Path.Line({ from: P(x, box.top), to: P(x, box.bottom), insert: false })));
        n++;
      });
      freeGaps(bs.map((b) => [b.top, b.bottom]), box.top, box.bottom).forEach((y) => {
        g.addChild(style(new paper.Path.Line({ from: P(box.left, y), to: P(box.right, y), insert: false })));
        n++;
      });
    }
    g.data = { ecCut: true, ecWeed: true, ecFor: ids(items) };
    L.addChild(g);
    VP.commit();
    VP.toast('Ayıklama çerçevesi eklendi' + (n ? ' · ' + n + ' ayıklama çizgisi' : ''));
  };

  /* =============== bleed =============== */
  const firstFill = (it) => {
    if (it.fillColor && it.fillColor.alpha > 0) return it.fillColor.clone();
    if (it.children) for (const c of it.children) {
      const f = firstFill(c);
      if (f) return f;
    }
    return null;
  };
  EC.bleed = () => {
    const s = S();
    const items = work();
    if (!items.length) return VP.toast('Taşma payı için nesneleri seçin');
    const d = PT(s.bleed);
    let n = 0;
    items.forEach((it) => {
      let made = null;
      if (it instanceof paper.Raster) {
        const b = it.bounds;
        made = VP.cloneItem(it);
        made.scale((b.width + 2 * d) / b.width, (b.height + 2 * d) / b.height, b.center);
        made.insertBelow(it);
      } else {
        const shapes = EC.shapesOf([it]);
        if (!shapes.length) return;
        const p = FX.offsetItem(outerOnly(unite(shapes)), d);
        if (!p) return;
        smooth(p);
        p.fillColor = firstFill(it) || new paper.Color('#ffffff');
        p.strokeColor = null;
        p.insertBelow(it);
        made = p;
      }
      made.name = 'Taşma payı';
      made.data.ecBleed = true;
      n++;
    });
    if (!n) return VP.toast('Taşma payı eklenemedi');
    VP.commit();
    VP.toast(n + ' nesneye ' + VP.num(s.bleed, 1) + ' mm taşma payı eklendi');
  };

  /* =============== cut info =============== */
  EC.info = () => {
    const L = EC.findLayer('cut');
    let len = 0;
    let n = 0;
    (L ? L.children : []).forEach((c) => {
      len += EC.lengthOf(c);
      n++;
    });
    const M = EC.findLayer('marks');
    const marks = M ? M.children.reduce((a, g) => a + (g.data.ecMarks ? g.children.length : 0), 0) : 0;
    return { n, m: MMv(len) / 1000, marks, visible: !L || L.visible };
  };

  /* =============== separate cut and print files =============== */
  const pageLayersJSON = (kinds) => VP.userLayers().filter((l) => kinds.includes((l.data && l.data.ecut) || 'art')).map((l) => {
    const c = l.clone({ insert: false });
    c.visible = true;
    return c.exportJSON({ asString: true });
  });
  EC.exportCut = async (fmt) => {
    const L = EC.findLayer('cut');
    if (!L || !L.children.length) return VP.toast('Bu sayfada bıçak izi yok · Önce "Bıçak izi oluştur"');
    VP.storePage();
    const io = VP.io;
    const i = VP.doc.active;
    const opts = { curves: true, layersJSON: pageLayersJSON(S().incMarks ? ['cut', 'marks'] : ['cut']), box: VP.pageRect() };
    const name = io.safeName() + '-kesim';
    try {
      if (fmt === 'dxf') {
        const s = io.buildSVG(i, Object.assign({ noSVG: true, onProject: (proj, box) => VP.files.dxf(proj, box) }, opts));
        return io.saveFile(name + '.dxf', new Blob([s], { type: 'application/dxf' }));
      }
      if (fmt === 'eps') {
        const s = io.buildSVG(i, Object.assign({ pdf: true, noSVG: true, onProject: (proj, box) => VP.files.eps(proj, box) }, opts));
        return io.saveFile(name + '.eps', new Blob([s], { type: 'application/postscript' }));
      }
      const svg = io.buildSVG(i, opts);
      return io.saveFile(name + '.svg', '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + new XMLSerializer().serializeToString(svg));
    } catch (e) {
      console.error(e);
      VP.toast('Kesim dosyası oluşturulamadı');
    }
  };
  // print file: everything except the cut lines (marks stay, the plotter's camera reads them)
  EC.exportPrint = async () => {
    const L = EC.findLayer('cut');
    if (!VP.files || !VP.files.pdf) return VP.toast('PDF dışa aktarma kullanılamıyor');
    if (!L) return VP.files.pdf({ area: 'page', range: 'one', curves: false, bleed: 0, marks: false, nup: '1', sheet: 'A4', title: '', author: '', subject: '', keywords: '', userPass: '', ownerPass: '' });
    const at = paper.project.layers.indexOf(L);
    const sel = VP.sel;
    L.remove();
    try {
      VP.storePage();
      await VP.files.pdf({ area: 'page', range: 'one', curves: false, bleed: 0, marks: false, nup: '1', sheet: 'A4', title: '', author: '', subject: '', keywords: '', userPass: '', ownerPass: '' });
    } finally {
      paper.project.insertLayer(at, L);
      VP.keepSysOrder();
      VP.storePage();
      VP.setSelection(sel);
    }
  };

  /* =============== docker panel =============== */
  const fld = (label, k, v, unit = 'mm') =>
    '<label class="field"><span>' + esc(label) + '</span><input data-dk="ec_' + k + '" value="' + esc(v) + '" inputmode="decimal" enterkeyhint="done" aria-label="' + esc(label) + '">' + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</label>';
  const seg = (k, items, cur) => '<span class="seg">' + items.map(([v, l]) => '<button data-act="ecSet:' + k + '=' + v + '" class="' + (String(v) === String(cur) ? 'on' : '') + '">' + esc(l) + '</button>').join('') + '</span>';
  const tog = (k, label, on) => '<button class="btn' + (on ? ' on' : '') + '" data-act="ecTog:' + k + '" aria-pressed="' + !!on + '">' + esc(label) + '</button>';
  const go = (act, icon, label, primary) => '<button class="btn' + (primary ? ' primary' : '') + '" data-act="' + act + '">' + (icon ? ic(icon, 'sm') : '') + esc(label) + '</button>';
  const sec = (title, body, note) => '<div class="sec ec-sec"><div class="sec-h"><h3>' + esc(title) + '</h3></div>' + (note ? '<p class="sec-note">' + note + '</p>' : '') + body + '</div>';
  const panel = () => {
    const s = S();
    const n = work().length;
    const inf = EC.info();
    const pl = n ? EC.plan() : null;
    let h = '<p class="sec-note">' + (n ? n + ' nesne seçili' : 'Önce kesilecek ya da çoğaltılacak nesneyi seçin') + ' · Kesim hatları <b style="color:' + CUT + '">macenta</b> renkte, ayrı katmanda</p>';
    h += sec('Bıçak izi', '<div class="row">' + seg('cutKind', [['contour', 'Kontur'], ['rect', 'Dikdörtgen'], ['round', 'Yuvarlak köşe'], ['oval', 'Oval']], s.cutKind) + '</div>' +
      '<div class="row">' + seg('cutDir', [['out', 'Dışa'], ['in', 'İçe']], s.cutDir) + fld('Mesafe', 'cutOff', VP.num(s.cutOff, 2)).replace('inputmode="decimal"', 'inputmode="text"') + (s.cutKind === 'round' ? fld('Köşe', 'cutRad', VP.num(s.cutRad, 1)) : '') + '</div>' +
      '<div class="row">' + tog('cutMerge', 'Hepsine tek hat', s.cutMerge) + (s.cutKind === 'contour' ? tog('cutHoles', 'İç boşlukları da kes', s.cutHoles) : '') + '</div>' +
      '<div class="row">' + fld('Köprü', 'bridges', s.bridges, 'adet') + fld('Köprü eni', 'bridgeW', VP.num(s.bridgeW, 1)) + '</div>' +
      '<div class="row">' + go('ecCut', 'ecCut', 'Bıçak izi oluştur', true) + '</div>' +
      '<div class="row">' + go('ecSelCut', '', 'Bıçak izlerini seç') + go('ecHideCut', '', inf.visible ? 'Gizle' : 'Göster') + go('ecClearCut', 'trash', 'Sil') + '</div>',
      'İçe seçilirse ya da mesafeye eksi (−2 gibi) yazılırsa hat nesnenin içinden geçer. Köprü: kesimde kopmaması için kesilmeden bırakılan küçük boşluklar.');
    h += sec('Hizalama işaretleri', '<div class="row">' + seg('markKind', [['square', 'Kare'], ['circle', 'Daire'], ['cross', 'Artı'], ['corner', 'Köşe L']], s.markKind) + '</div>' +
      '<div class="row">' + seg('markWhere', [['sel', 'Seçimin çevresi'], ['page', 'Sayfa kenarı']], s.markWhere) + seg('markCount', [[4, '4 köşe'], [3, '3 köşe']], s.markCount) + '</div>' +
      '<div class="row">' + fld('Boyut', 'markSize', VP.num(s.markSize, 1)) + fld('Uzaklık', 'markOff', VP.num(s.markOff, 1)) + '</div>' +
      '<div class="row">' + fld('Ara işaret her', 'markMid', VP.num(s.markMid, 0)) + '</div>' +
      '<div class="row">' + go('ecMarks', 'ecMarks', 'İşaretleri ekle', true) + go('ecClearMarks', 'trash', 'Sil') + '</div>',
      'Kesim plotterinin kamerası/sensörü bu işaretleri okuyarak baskıyla kesimi hizalar. Ara işaret 0 = yok.');
    h += sec('Çoğaltma (montaj)', '<div class="row">' + seg('srMode', [['fill', 'Sayfayı doldur'], ['grid', 'Satır × sütun']], s.srMode) + '</div>' +
      (s.srMode === 'grid' ? '<div class="row">' + fld('Sütun', 'srCols', s.srCols, '') + fld('Satır', 'srRows', s.srRows, '') + '</div>' : '') +
      '<div class="row">' + fld('Yatay aralık', 'srGapX', VP.num(s.srGapX, 1)) + fld('Dikey', 'srGapY', VP.num(s.srGapY, 1)) + '</div>' +
      '<div class="row">' + fld('Kenar boşluğu', 'srMargin', VP.num(s.srMargin, 1)) + '</div>' +
      '<div class="row">' + (s.srMode === 'fill' ? tog('srRotate', 'Döndürerek sığdır', s.srRotate) : '') + tog('srCenter', 'Ortala', s.srCenter) + tog('srCrop', 'Kesim işaretleri', s.srCrop) + '</div>' +
      (pl ? '<p class="sec-note">' + (pl.cols && pl.rows ? '<b>' + pl.cols * pl.rows + ' adet</b> (' + pl.cols + ' × ' + pl.rows + ')' + (pl.rot ? ' · 90° döndürülür' : '') + ' · Kullanım %' + Math.round(pl.used * 100) : 'Bu ayarlarla sayfaya sığmıyor') + (pl.items.length > n ? ' · Bıçak izi de çoğaltılır' : '') + '</p>' : '') +
      '<div class="row">' + go('ecImpose', 'ecImpose', 'Çoğalt', true) + '</div>');
    h += sec('Yerleştirme ve ayıklama', '<div class="row">' + fld('Parça arası', 'nestGap', VP.num(s.nestGap, 1)) + tog('nestRotate', 'Döndürmeye izin ver', s.nestRotate) + '</div>' +
      '<div class="row">' + go('ecNest', 'ecNest', 'Sayfaya yerleştir', false) + '</div>' +
      '<div class="row">' + fld('Ayıklama payı', 'weedOff', VP.num(s.weedOff, 1)) + tog('weedLines', 'Ayıklama çizgileri', s.weedLines) + '</div>' +
      '<div class="row">' + go('ecWeed', 'ecWeed', 'Ayıklama çerçevesi', false) + '</div>' +
      '<div class="row">' + fld('Taşma payı', 'bleed', VP.num(s.bleed, 1)) + go('ecBleed', '', 'Taşma ekle', false) + '</div>' +
      '<div class="row">' + fld('Kesim işareti boyu', 'cropLen', VP.num(s.cropLen, 1)) + fld('Uzaklık', 'cropOff', VP.num(s.cropOff, 1)) + '</div>' +
      '<div class="row">' + tog('cropEach', 'Her nesneye ayrı', s.cropEach) + go('ecCrop', '', 'Kesim işareti ekle', false) + '</div>',
      'Yerleştirme seçili parçaları sayfaya az fireyle dizer; bıçak izleri parçalarıyla birlikte taşınır. Ayıklama vinil kesimde fazlalığı sökmeyi kolaylaştırır.');
    const cost = s.price > 0 ? ' · Tutar ' + VP.num(inf.m * s.price, 2) + ' ₺' : '';
    h += sec('Kesim bilgisi ve dosyalar', '<p class="sec-note">Bu sayfada <b>' + inf.n + '</b> kesim hattı · Toplam kesim <b>' + VP.num(inf.m, 2) + ' m</b>' + cost + (inf.marks ? ' · ' + inf.marks + ' hizalama işareti' : '') + '</p>' +
      '<div class="row">' + fld('Metre fiyatı', 'price', VP.num(s.price, 2), '₺') + '</div>' +
      '<div class="row">' + tog('incMarks', 'Kesim dosyasına işaretleri kat', s.incMarks) + '</div>' +
      '<div class="row">' + go('ecExport:svg', 'export', 'Kesim SVG') + go('ecExport:dxf', '', 'Kesim DXF') + go('ecExport:eps', '', 'Kesim EPS') + '</div>' +
      '<div class="row">' + go('ecPrint', 'print', 'Baskı PDF (bıçak izi hariç)') + '</div>',
      'Kesim dosyasını plotter programınızda açın; baskı dosyasını matbaaya/yazıcıya gönderin.');
    return h;
  };
  UI.panels = UI.panels || {};
  UI.panels.cut = panel;
  if (!UI.DOCKERS.some(([k]) => k === 'cut')) UI.DOCKERS.push(['cut', 'Kesim ve Montaj']);
  VP.on('selection', () => UI.dockTab === 'cut' && UI.schedule('dock'));

  const NUMS = { cutOff: [-50, 100], cutRad: [0, 200], bridges: [0, 50], bridgeW: [0.1, 50], markSize: [1, 50], markOff: [0, 100], markMid: [0, 5000], cropLen: [1, 50], cropOff: [0, 50], srCols: [1, 200], srRows: [1, 200], srGapX: [-50, 500], srGapY: [-50, 500], srMargin: [0, 500], nestGap: [0, 200], weedOff: [0, 100], bleed: [0, 50], price: [0, 1e6] };
  const df0 = UI.dockField;
  UI.dockField = (k, raw, el, live) => {
    if (!/^ec_/.test(k)) return df0(k, raw, el, live);
    const key = k.slice(3);
    const v = VP.parseNum(raw);
    const r = NUMS[key];
    if (!r || !isFinite(v)) return;
    const s = S();
    if (key === 'cutOff') {
      // a minus sign means inside
      s.cutDir = v < 0 ? 'in' : /^\s*\+/.test(raw) ? 'out' : s.cutDir;
      s.cutOff = VP.clamp(Math.abs(v), 0, 100);
      VP.io.savePrefs();
      return UI.renderDock(true);
    }
    s[key] = VP.clamp(/^(bridges|srCols|srRows)$/.test(key) ? Math.round(v) : v, r[0], r[1]);
    VP.io.savePrefs();
    UI.schedule('dock');
  };
  const da0 = UI.dockAct;
  UI.dockAct = (id, el) => {
    if (!/^ec[A-Z]/.test(id)) return da0(id, el);
    const [key, arg] = id.split(/:(.*)/);
    const s = S();
    switch (key) {
      case 'ecSet': {
        const [k, v] = arg.split('=');
        s[k] = /^\d+$/.test(v) ? +v : v;
        break;
      }
      case 'ecTog':
        s[arg] = !s[arg];
        break;
      default:
        UI.run(key + (arg ? ':' + arg : ''));
        return;
    }
    VP.io.savePrefs();
    UI.renderDock(true);
  };

  /* =============== actions, menu, icons =============== */
  const hasWork = () => work().length > 0;
  Object.assign(A, {
    ecPanel: { label: 'Kesim ve Montaj paneli', icon: 'ecCut', run: () => UI.openDock('cut') },
    ecCut: { label: 'Bıçak izi oluştur', icon: 'ecCut', run: () => EC.cutLine(), enabled: hasWork },
    ecMarks: { label: 'Hizalama işaretleri ekle', icon: 'ecMarks', run: () => EC.marks() },
    ecImpose: { label: 'Çoğalt (sayfayı doldur)', icon: 'ecImpose', run: () => EC.impose(), enabled: () => VP.sel.length > 0 },
    ecNest: { label: 'Sayfaya yerleştir', icon: 'ecNest', run: () => EC.nest(), enabled: () => work().length > 1 },
    ecWeed: { label: 'Ayıklama çerçevesi', icon: 'ecWeed', run: () => EC.weed(), enabled: hasWork },
    ecBleed: { label: 'Taşma payı ekle', run: () => EC.bleed(), enabled: hasWork },
    ecCrop: { label: 'Kesim işareti ekle', run: () => EC.cropMarks(), enabled: hasWork },
    ecSelCut: { label: 'Bıçak izlerini seç', run: () => EC.selectLayer('cut') },
    ecHideCut: { label: 'Bıçak izlerini gizle/göster', run: () => EC.toggleLayer('cut') },
    ecClearCut: { label: 'Bıçak izlerini sil', run: () => EC.clearLayer('cut') },
    ecClearMarks: { label: 'Hizalama işaretlerini sil', run: () => EC.clearLayer('marks') },
    ecExport: { label: 'Kesim dosyası (SVG)', run: (fmt) => EC.exportCut(typeof fmt === 'string' ? fmt : 'svg') },
    ecExportDxf: { label: 'Kesim dosyası (DXF)', run: () => EC.exportCut('dxf') },
    ecPrint: { label: 'Baskı dosyası (PDF, bıçak izi hariç)', icon: 'print', run: () => EC.exportPrint() },
    ecInfo: {
      label: 'Kesim uzunluğu', run: () => {
        const inf = EC.info();
        const s = S();
        VP.toast(inf.n + ' kesim hattı · ' + VP.num(inf.m, 2) + ' m' + (s.price > 0 ? ' · ' + VP.num(inf.m * s.price, 2) + ' ₺' : ''));
      }
    }
  });
  // UI.run passes "id:arg" through to actions that take an argument
  const run0 = UI.run;
  UI.run = (id, ...rest) => {
    const m = /^(ec[A-Za-z]+):(.+)$/.exec(String(id));
    if (m && A[m[1]]) return A[m[1]].run(m[2]);
    return run0(id, ...rest);
  };
  UI.MENUS.plugins = ['h:Kesim ve Montaj', 'ecPanel', '|', 'ecCut', 'ecSelCut', 'ecHideCut', 'ecClearCut', '|', 'ecMarks', 'ecCrop', 'ecClearMarks', '|', 'ecImpose', 'ecNest', 'ecWeed', 'ecBleed', '|', 'ecInfo', 'ecExport', 'ecExportDxf', 'ecPrint'];
  UI.MENU_NAMES.plugins = 'Eklentiler';
  // keep Help last in the "all menus" list
  if (UI.MENUS.help) {
    const h = UI.MENUS.help;
    delete UI.MENUS.help;
    UI.MENUS.help = h;
  }
})();
