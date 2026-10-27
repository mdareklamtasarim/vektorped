/* VektörPad object commands, second set: corners (fillet, scallop, chamfer), more shaping (simplify,
   front minus back, back minus front, divide), ordering relative to another object, reverse order,
   clones, repeat last command, move/copy to layer, parallel curves, align to grid, clear transformations,
   close, join and reverse curves. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const A = VP.actions;
  const H = UI.h;
  const esc = H.esc;
  const O = (VP.objops = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const $ = (s) => document.querySelector(s);
  const hasSel = () => VP.sel.length > 0;
  const plainPaths = () => VP.sel.filter((it) => VP.isPathItem(it) && !FX.isFx(it));
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
    delete dst.data.bspline;
    VP.applyShadowProps(dst);
    return dst;
  };
  const loops = (it) => (it instanceof paper.CompoundPath ? it.children.slice() : [it]);

  /* =============== corners =============== */
  const cornerPath = (path, type, R) => {
    const segs = path.segments;
    const n = segs.length;
    const out = [];
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const s = segs[i];
      const hasPrev = path.closed || i > 0;
      const hasNext = path.closed || i < n - 1;
      const prev = segs[(i - 1 + n) % n];
      const next = segs[(i + 1) % n];
      const straight = hasPrev && hasNext && s.handleIn.isZero() && s.handleOut.isZero() && prev.handleOut.isZero() && next.handleIn.isZero();
      if (!straight) {
        out.push(new paper.Segment(s.point, s.handleIn, s.handleOut));
        continue;
      }
      const v1 = prev.point.subtract(s.point);
      const v2 = next.point.subtract(s.point);
      if (v1.length < 1e-6 || v2.length < 1e-6) {
        out.push(new paper.Segment(s.point));
        continue;
      }
      const u1 = v1.normalize();
      const u2 = v2.normalize();
      const phi = Math.acos(clamp(u1.dot(u2), -1, 1));
      if (phi > Math.PI - 0.035) {
        out.push(new paper.Segment(s.point));
        continue;
      }
      // distance from the corner to where the new edge starts on each side
      let t = type === 'fillet' ? R / Math.tan(phi / 2) : R;
      t = Math.min(t, v1.length * 0.5, v2.length * 0.5);
      const P1 = s.point.add(u1.multiply(t));
      const P2 = s.point.add(u2.multiply(t));
      changed++;
      if (type === 'chamfer') {
        out.push(new paper.Segment(P1), new paper.Segment(P2));
      } else if (type === 'fillet') {
        const r = t * Math.tan(phi / 2);
        const k = (4 / 3) * Math.tan((Math.PI - phi) / 4) * r;
        out.push(new paper.Segment(P1, null, u1.multiply(-k)), new paper.Segment(P2, u2.multiply(-k), null));
      } else {
        const k = (4 / 3) * Math.tan(phi / 4) * t;
        const d1 = u2.subtract(u1.multiply(u1.dot(u2))).normalize();
        const d2 = u1.subtract(u2.multiply(u1.dot(u2))).normalize();
        out.push(new paper.Segment(P1, null, d1.multiply(k)), new paper.Segment(P2, d2.multiply(k), null));
      }
    }
    if (changed) {
      path.segments = out;
    }
    return changed;
  };
  O.corners = (type, mm) => {
    const items = plainPaths();
    if (!items.length) return VP.toast('Köşe işlemleri için eğri veya şekil seçin');
    const R = VP.toPT(mm);
    let n = 0;
    items.forEach((it) => {
      delete it.data.param;
      loops(it).forEach((p) => (n += cornerPath(p, type, R)));
    });
    if (!n) return VP.toast('Seçimde düz kenarlı köşe yok · Köşe işlemleri düz kenarların birleştiği köşelere uygulanır');
    VP.commit();
    VP.toast(n + ' köşe ' + { fillet: 'yuvarlatıldı', scallop: 'oyuldu', chamfer: 'pahlandı' }[type]);
  };
  const cornersDialog = () => {
    const st = { type: VP.defaults.cornerType || 'fillet', mm: VP.defaults.cornerMM || 4 };
    UI.modal(
      '<h2>Köşeler</h2><div class="row"><span class="seg" id="cr-type">' + [['fillet', 'Yuvarlat'], ['scallop', 'Oy'], ['chamfer', 'Pah kır']].map(([v, l]) => '<button data-t="' + v + '" class="' + (st.type === v ? 'on' : '') + '">' + l + '</button>').join('') + '</span></div>' +
        '<div class="row"><label class="field"><span>' + 'Yarıçap / mesafe' + '</span><input id="cr-r" value="' + VP.num(st.mm, 2) + '" inputmode="decimal"><span class="unit">mm</span></label></div>' +
        '<p>Seçili eğrilerin düz kenarlarının birleştiği köşelere uygulanır. Parametrik şekiller eğriye dönüşür.</p>' +
        '<div class="actions"><button class="btn" data-x="no">Kapat</button><button class="btn primary" data-x="yes">Uygula</button></div>',
      (root, close) => root.addEventListener('click', (e) => {
        const t = e.target.closest('[data-t]');
        if (t) {
          st.type = t.dataset.t;
          root.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b === t));
          return;
        }
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'yes') {
          const v = VP.parseNum(root.querySelector('#cr-r').value);
          if (v > 0) {
            VP.defaults.cornerType = st.type;
            VP.defaults.cornerMM = v;
            O.corners(st.type, v);
            O.last = { id: 'cornersRepeat' };
          }
        }
        close();
      })
    );
  };

  /* =============== more shaping =============== */
  const union = (list) => list.reduce((acc, p) => (acc ? acc.unite(p, { insert: false }) : p.clone({ insert: false })), null);
  const replaceWith = (old, res) => {
    if (!res || res.isEmpty()) {
      old.remove();
      return null;
    }
    look(res, old);
    res.insertAbove(old);
    old.remove();
    return res;
  };
  O.shape2 = (op) => {
    const items = VP.zSort(plainPaths());
    if (items.length < 2) return VP.toast('Bu işlem için en az iki eğri veya şekil seçin');
    if (items.length !== VP.sel.length) return VP.toast('Metin, resim ve gruplarda önce “Eğriye dönüştür” veya “Grubu çöz” kullanın');
    const out = [];
    try {
      if (op === 'simplify') {
        // each object loses the parts hidden by objects above it
        items.forEach((it, i) => {
          const above = items.slice(i + 1).filter((o) => o.bounds.intersects(it.bounds));
          if (!above.length) return out.push(it);
          const r = replaceWith(it, it.subtract(union(above), { insert: false }));
          if (r) out.push(r);
        });
      } else if (op === 'frontMinusBack') {
        const top = items[items.length - 1];
        const r = replaceWith(top, top.subtract(union(items.slice(0, -1)), { insert: false }));
        items.slice(0, -1).forEach((it) => it.remove());
        if (r) out.push(r);
      } else if (op === 'backMinusFront') {
        const bot = items[0];
        const r = replaceWith(bot, bot.subtract(union(items.slice(1)), { insert: false }));
        items.slice(1).forEach((it) => it.remove());
        if (r) out.push(r);
      } else if (op === 'divide') {
        // every overlap becomes its own piece
        let pieces = [];
        items.forEach((s) => {
          const next = [];
          pieces.forEach((pc) => {
            const inter = pc.shape.intersect(s, { insert: false });
            const diff = pc.shape.subtract(s, { insert: false });
            if (inter && !inter.isEmpty() && Math.abs(inter.area) > 0.01) next.push({ shape: inter, src: s });
            if (diff && !diff.isEmpty() && Math.abs(diff.area) > 0.01) next.push({ shape: diff, src: pc.src });
          });
          const rest = pieces.length ? s.subtract(union(pieces.map((p) => p.shape)), { insert: false }) : s.clone({ insert: false });
          if (rest && !rest.isEmpty() && Math.abs(rest.area) > 0.01) next.push({ shape: rest, src: s });
          pieces = next;
        });
        const top = items[items.length - 1];
        pieces.forEach((pc) => {
          look(pc.shape, pc.src);
          pc.shape.insertAbove(top);
          out.push(pc.shape);
        });
        items.forEach((it) => it.remove());
      }
    } catch (e) {
      return VP.toast('Bu şekillerle işlem yapılamadı');
    }
    VP.setSelection(out);
    VP.commit();
    VP.toast({ simplify: 'Basitleştirildi', frontMinusBack: 'Önü eksi arka uygulandı', backMinusFront: 'Arkası eksi ön uygulandı', divide: 'Bölündü: ' + out.length + ' parça' }[op]);
  };

  /* =============== ordering =============== */
  // The next tap on the page picks an object instead of using the tool.
  O.pickOnce = (msg, cb) => {
    VP.toast(msg);
    const cv = $('#canvas');
    const h = (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      cv.removeEventListener('pointerdown', h, true);
      const r = cv.getBoundingClientRect();
      cb(VP.hitItem(paper.view.viewToProject(Pt(e.clientX - r.left, e.clientY - r.top))));
    };
    cv.addEventListener('pointerdown', h, true);
  };
  O.relOrder = (where) => {
    const items = VP.zSort(VP.sel);
    if (!items.length) return;
    O.pickOnce(where === 'front' ? 'Seçimin önüne geleceği nesneye dokunun' : 'Seçimin arkasına gideceği nesneye dokunun', (t) => {
      if (!t || items.includes(t)) return VP.toast('Seçim dışında bir nesneye dokunun');
      let ref = t;
      if (where === 'front') {
        items.forEach((it) => {
          it.insertAbove(ref);
          ref = it;
        });
      } else {
        items.slice().reverse().forEach((it) => {
          it.insertBelow(ref);
          ref = it;
        });
      }
      VP.commit();
    });
  };
  O.reverseOrder = () => {
    const items = VP.zSort(VP.sel);
    if (items.length < 2) return VP.toast('Sırayı tersine çevirmek için en az iki nesne seçin');
    const marks = items.map((it) => {
      const m = new paper.Group({ insert: false });
      m.insertAbove(it);
      return m;
    });
    items.forEach((it, i) => it.insertBelow(marks[items.length - 1 - i]));
    marks.forEach((m) => m.remove());
    VP.commit();
  };

  /* =============== clones =============== */
  const uidOf = (it) => {
    if (!it.data.uid) it.data.uid = VP.uid();
    return it.data.uid;
  };
  O.clone = () => {
    const items = VP.zSort(VP.sel);
    if (!items.length) return;
    const off = VP.toPT(5);
    const out = items.map((m) => {
      const c = VP.cloneItem(m);
      c.data.cloneOf = uidOf(m);
      delete c.data.uid;
      c.data.cloneM = [1, 0, 0, 1, off, off];
      c.data.cloneSrc = m.exportJSON({ asString: true, precision: 4 });
      c.translate(Pt(off, off));
      c.insertAbove(m);
      return c;
    });
    VP.setSelection(out);
    VP.commit();
    VP.toast('Klon oluşturuldu · Ana nesnedeki değişiklikler klona yansır');
  };
  const masters = () => {
    const m = new Map();
    VP.userLayers().forEach((L) => L.getItems({ match: (it) => it.data && it.data.uid }).forEach((it) => !m.has(it.data.uid) && m.set(it.data.uid, it)));
    return m;
  };
  // Rebuilds clones whose master changed since the last commit.
  O.syncClones = () => {
    const clones = [];
    VP.userLayers().forEach((L) => L.getItems({ match: (it) => it.data && it.data.cloneOf }).forEach((c) => clones.push(c)));
    if (!clones.length) return;
    const map = masters();
    clones.forEach((c) => {
      const m = map.get(c.data.cloneOf);
      if (!m) {
        delete c.data.cloneOf;
        return;
      }
      const src = m.exportJSON({ asString: true, precision: 4 });
      if (src === c.data.cloneSrc) return;
      const n = VP.cloneItem(m);
      const keep = { cloneOf: c.data.cloneOf, cloneM: c.data.cloneM, cloneSrc: src, label: c.data.label };
      n.data = Object.assign({}, n.data, keep);
      delete n.data.uid;
      if (!keep.label) delete n.data.label;
      n.transform(new paper.Matrix(c.data.cloneM));
      n.insertAbove(c);
      const i = VP.sel.indexOf(c);
      if (i >= 0) VP.sel[i] = n;
      c.remove();
    });
  };
  const commit0 = VP.commit;
  VP.commit = function () {
    try {
      O.syncClones();
    } catch (e) { /* a broken clone never blocks saving */ }
    return commit0.apply(this, arguments);
  };
  // clones remember their own placement
  const trackClone = (items, M) => {
    items.forEach((it) => {
      if (it.data && it.data.cloneOf && it.data.cloneM) {
        const cm = new paper.Matrix(it.data.cloneM);
        const r = M.clone().append(cm);
        it.data.cloneM = [r.a, r.b, r.c, r.d, r.tx, r.ty];
      }
    });
  };
  const T0 = Object.assign({}, VP.T);
  VP.T.move = (items, d) => {
    T0.move(items, d);
    trackClone(items, new paper.Matrix().translate(d));
  };
  VP.T.rotate = (items, deg, pivot) => {
    T0.rotate(items, deg, pivot);
    trackClone(items, new paper.Matrix().rotate(deg, pivot));
  };
  VP.T.scale = (items, sx, sy, anchor) => {
    T0.scale(items, sx, sy, anchor);
    if (isFinite(sx) && isFinite(sy) && Math.abs(sx) > 1e-6 && Math.abs(sy) > 1e-6) trackClone(items, new paper.Matrix().scale(sx, sy, anchor));
  };
  VP.T.skew = (items, kx, ky, center) => {
    T0.skew(items, kx, ky, center);
    trackClone(items, new paper.Matrix().skew(kx, ky, center));
  };
  const kind0 = VP.describe;
  VP.describe = (it) => (it && it.data && it.data.cloneOf && !it.data.label ? 'Klon: ' + kind0(it) : kind0(it));

  /* =============== repeat last command =============== */
  const NO_REPEAT = /^(undo|redo|repeat|select|deselect|dock|bar|theme|help|about|whatsNew|shortcuts|fit|zoom|fullscreen|open|save|new|import|export|sample|docProps|options|guides|snap|rulers|grid|pencilOnly|fullPreview|pageSorter|gotoPage|resetWorkspace|textProps|copy|cut|paste|traceOutline|separations|tSel)/;
  const run0 = UI.run;
  UI.run = (id) => {
    const r = run0(id);
    if (A[id] && !NO_REPEAT.test(id)) O.last = { id };
    return r;
  };
  O.repeat = () => {
    if (!O.last) return VP.toast('Tekrarlanacak işlem yok');
    if (O.last.id === 'cornersRepeat') return O.corners(VP.defaults.cornerType, VP.defaults.cornerMM);
    run0(O.last.id);
  };

  /* =============== layers =============== */
  const layerMenu = (copy) => {
    const ls = VP.userLayers().filter((L) => !VP.sel.length || VP.sel.some((it) => it.layer !== L));
    if (!ls.length) return VP.toast('Başka katman yok · Nesneler panelinden katman ekleyin');
    const anchor = $('.menu-btn[data-menu="object"]').offsetParent ? $('.menu-btn[data-menu="object"]') : $('#btn-menu-all');
    UI.popover(anchor, ls.slice().reverse().map((L) => '<button class="pop-item" data-pick="' + VP.userLayers().indexOf(L) + '">' + esc(L.name) + '</button>').join(''), (i) => {
      const L = VP.userLayers()[+i];
      const items = VP.zSort(VP.sel);
      const out = items.map((it) => {
        const x = copy ? VP.cloneItem(it) : it;
        L.addChild(x);
        return x;
      });
      VP.setActiveLayer(L);
      VP.setSelection(out);
      VP.commit();
      VP.toast(out.length + ' nesne “' + L.name + '” katmanına ' + (copy ? 'kopyalandı' : 'taşındı'));
    });
  };

  /* =============== parallel curves =============== */
  const openOffset = (path, d) => {
    const L = path.length;
    const n = clamp(Math.round(L / 1.2), 8, 600);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const s = (L * i) / n;
      const p = path.getPointAt(s);
      const nr = path.getNormalAt(s);
      if (p && nr) pts.push(p.add(nr.multiply(d)));
    }
    const out = new paper.Path({ segments: pts, insert: false });
    out.simplify(0.3);
    return out;
  };
  O.parallel = (mm, count, side) => {
    const items = plainPaths();
    if (!items.length) return VP.toast('Paralel eğri için eğri veya şekil seçin');
    const out = [];
    items.forEach((it) => {
      for (let i = 1; i <= count; i++) {
        const dists = side === 'both' ? [1, -1] : side === 'in' ? [-1] : [1];
        dists.forEach((sg) => {
          const d = VP.toPT(mm) * i * sg;
          let res = null;
          if (it instanceof paper.Path && !it.closed) res = openOffset(it, d);
          else res = FX.offsetItem(it, d);
          if (!res) return;
          res.fillColor = null;
          res.strokeColor = it.strokeColor || new paper.Color('#1d1d1b');
          res.strokeWidth = it.strokeWidth || 0.75;
          res.insertAbove(it);
          out.push(res);
        });
      }
    });
    if (!out.length) return VP.toast('Bu mesafeyle paralel eğri oluşmadı · Mesafeyi küçültün');
    VP.setSelection(out);
    VP.commit();
    VP.toast(out.length + ' paralel eğri oluşturuldu');
  };
  const parallelDialog = () => {
    const st = { side: 'out' };
    UI.modal(
      '<h2>Paralel eğri</h2><div class="row"><label class="field"><span>Mesafe</span><input id="pc-d" value="' + VP.num(VP.defaults.parMM || 3, 2) + '" inputmode="decimal"><span class="unit">mm</span></label>' +
        '<label class="field"><span>Kopya</span><input id="pc-n" value="' + (VP.defaults.parN || 1) + '" inputmode="numeric"></label></div>' +
        '<div class="row"><span class="opt-label">Taraf</span><span class="seg">' + [['out', 'Dış / sol'], ['in', 'İç / sağ'], ['both', 'Her iki taraf']].map(([v, l]) => '<button data-s="' + v + '" class="' + (v === st.side ? 'on' : '') + '">' + l + '</button>').join('') + '</span></div>' +
        '<p>Seçili eğrilerin belirli mesafede kopyalarını çizer (yol, çerçeve, kontur çizgileri için).</p>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Oluştur</button></div>',
      (root, close) => root.addEventListener('click', (e) => {
        const s = e.target.closest('[data-s]');
        if (s) {
          st.side = s.dataset.s;
          root.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b === s));
          return;
        }
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'yes') {
          const dm = VP.parseNum(root.querySelector('#pc-d').value);
          const n = clamp(Math.round(VP.parseNum(root.querySelector('#pc-n').value) || 1), 1, 20);
          if (dm > 0) {
            VP.defaults.parMM = dm;
            VP.defaults.parN = n;
            O.parallel(dm, n, st.side);
          }
        }
        close();
      })
    );
  };

  /* =============== curves: close, join, reverse; grid; clear transformations =============== */
  O.closePaths = () => {
    let n = 0;
    plainPaths().forEach((it) => loops(it).forEach((p) => {
      if (!p.closed) {
        p.closed = true;
        n++;
      }
    }));
    if (!n) return VP.toast('Seçimde açık eğri yok');
    VP.commit();
  };
  O.joinCurves = () => {
    let paths = VP.sel.filter((it) => it instanceof paper.Path && !it.closed && !FX.isFx(it));
    if (paths.length < 2) return VP.toast('Birleştirmek için en az iki açık eğri seçin');
    const base = paths[0];
    delete base.data.param;
    paths = paths.slice(1);
    let guard = 0;
    while (paths.length && guard++ < 200) {
      let best = null;
      let bd = Infinity;
      paths.forEach((p) => {
        const c = [
          [base.lastSegment.point.getDistance(p.firstSegment.point), p, false, false],
          [base.lastSegment.point.getDistance(p.lastSegment.point), p, true, false],
          [base.firstSegment.point.getDistance(p.lastSegment.point), p, false, true],
          [base.firstSegment.point.getDistance(p.firstSegment.point), p, true, true]
        ];
        c.forEach((x) => {
          if (x[0] < bd) {
            bd = x[0];
            best = x;
          }
        });
      });
      const [, p, rev, front] = best;
      if (rev) p.reverse();
      if (front) base.insertSegments(0, p.segments.map((s) => new paper.Segment(s.point, s.handleIn, s.handleOut)).filter((s, i, arr) => !(i === arr.length - 1 && s.point.getDistance(base.firstSegment.point) < 0.01)));
      else base.addSegments(p.segments.map((s) => new paper.Segment(s.point, s.handleIn, s.handleOut)).filter((s, i) => !(i === 0 && s.point.getDistance(base.lastSegment.point) < 0.01)));
      p.remove();
      paths = paths.filter((x) => x !== p);
    }
    if (base.firstSegment.point.getDistance(base.lastSegment.point) < VP.toPT(0.3)) {
      base.lastSegment.remove();
      base.closed = true;
    }
    VP.setSelection([base]);
    VP.commit();
    VP.toast('Eğriler birleştirildi');
  };
  O.reversePaths = () => {
    const items = plainPaths();
    if (!items.length) return;
    items.forEach((it) => {
      delete it.data.param;
      loops(it).forEach((p) => p.reverse());
    });
    VP.commit();
    VP.toast('Eğri yönü ters çevrildi');
  };
  O.alignGrid = () => {
    if (!VP.sel.length) return;
    const g = VP.toPT(VP.settings.gridMM || 5);
    VP.sel.forEach((it) => {
      const tl = it.bounds.topLeft;
      VP.T.move([it], Pt(Math.round(tl.x / g) * g - tl.x, Math.round(tl.y / g) * g - tl.y));
    });
    VP.commit();
    VP.toast('Izgaraya hizalandı');
  };
  O.clearTransform = () => {
    let n = 0;
    VP.sel.forEach((it) => {
      const p = it.data && it.data.param;
      if (p && (p.angle || p.fx || p.fy)) {
        p.angle = 0;
        p.fx = p.fy = false;
        VP.rebuildParam(it);
        it.data.rot = 0;
        n++;
      } else if (it.applyMatrix === false || it instanceof paper.PointText || it instanceof paper.Raster) {
        const c = it.bounds.center;
        const M = it.matrix;
        const sx = Math.sqrt(M.a * M.a + M.b * M.b);
        if (it instanceof paper.Raster) it.matrix = new paper.Matrix(sx, 0, 0, sx, M.tx, M.ty);
        else it.matrix = new paper.Matrix(1, 0, 0, 1, M.tx, M.ty);
        it.position = c;
        it.data.rot = 0;
        n++;
      }
    });
    if (!n) return VP.toast('Seçimde geri alınabilir dönüşüm yok · Eğriler dönüşümleri kalıcı olarak taşır');
    VP.commit();
    VP.toast('Dönüşümler temizlendi');
  };

  /* =============== actions & menus =============== */
  Object.assign(A, {
    repeat: { label: 'Tekrarla', kbd: 'Ctrl+R', run: () => O.repeat(), enabled: () => !!O.last },
    clone: { label: 'Klonla', icon: 'duplicate', run: () => O.clone(), enabled: hasSel },
    unclone: { label: 'Klon bağlantısını kopar', run: () => {
      VP.sel.forEach((it) => {
        delete it.data.cloneOf;
        delete it.data.cloneM;
        delete it.data.cloneSrc;
      });
      VP.commit();
    }, enabled: () => VP.sel.some((it) => it.data && it.data.cloneOf) },
    selectMaster: { label: 'Ana nesneyi seç', run: () => {
      const c = VP.sel.find((it) => it.data && it.data.cloneOf);
      const m = c && masters().get(c.data.cloneOf);
      if (m) VP.setSelection([m]);
    }, enabled: () => VP.sel.some((it) => it.data && it.data.cloneOf) },
    corners: { label: 'Köşeler (yuvarlat, oy, pah)…', icon: 'cornerTool', run: cornersDialog, enabled: hasSel },
    simplify: { label: 'Basitleştir', run: () => O.shape2('simplify'), enabled: () => VP.sel.length > 1 },
    frontMinusBack: { label: 'Önü eksi arka', run: () => O.shape2('frontMinusBack'), enabled: () => VP.sel.length > 1 },
    backMinusFront: { label: 'Arkası eksi ön', run: () => O.shape2('backMinusFront'), enabled: () => VP.sel.length > 1 },
    divide: { label: 'Böl', run: () => O.shape2('divide'), enabled: () => VP.sel.length > 1 },
    inFrontOf: { label: 'Şunun önüne…', run: () => O.relOrder('front'), enabled: hasSel },
    behindOf: { label: 'Şunun arkasına…', run: () => O.relOrder('back'), enabled: hasSel },
    reverseOrder: { label: 'Sırayı tersine çevir', run: () => O.reverseOrder(), enabled: () => VP.sel.length > 1 },
    toLayer: { label: 'Katmana taşı…', icon: 'layers', run: () => layerMenu(false), enabled: hasSel },
    copyToLayer: { label: 'Katmana kopyala…', run: () => layerMenu(true), enabled: hasSel },
    parallelCurve: { label: 'Paralel eğri…', run: parallelDialog, enabled: hasSel },
    closePath: { label: 'Eğriyi kapat', run: () => O.closePaths(), enabled: hasSel },
    joinCurves: { label: 'Eğrileri birleştir', run: () => O.joinCurves(), enabled: () => VP.sel.length > 1 },
    reversePath: { label: 'Eğri yönünü ters çevir', run: () => O.reversePaths(), enabled: hasSel },
    alignGrid: { label: 'Izgaraya hizala', icon: 'grid', run: () => O.alignGrid(), enabled: hasSel },
    clearTransform: { label: 'Dönüşümleri temizle', run: () => O.clearTransform(), enabled: hasSel }
  });
  const M = UI.MENUS;
  const ins = (menu, after, ids) => {
    const i = M[menu].indexOf(after);
    M[menu].splice(i >= 0 ? i + 1 : M[menu].length, 0, ...ids.filter((x) => !M[menu].includes(x)));
  };
  ins('edit', 'redo', ['repeat']);
  ins('edit', 'duplicate', ['clone']);
  ins('object', 'exclude', ['simplify', 'frontMinusBack', 'backMinusFront', 'divide']);
  ins('object', 'toBack', ['inFrontOf', 'behindOf', 'reverseOrder']);
  ins('object', 'toCurves', ['|', 'h:Eğriler', 'closePath', 'joinCurves', 'reversePath', 'parallelCurve', 'corners', '|', 'h:Klon', 'clone', 'selectMaster', 'unclone']);
  ins('object', 'dockTransform', ['clearTransform', 'alignGrid']);
  ins('object', 'showAll', ['|', 'toLayer', 'copyToLayer']);

  // Ctrl+R repeats
  document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.querySelector('.modal-wrap')) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      e.stopImmediatePropagation();
      O.repeat();
    }
  }, true);
})();
