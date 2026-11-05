/* VektörPad Pick tool, made to behave like the desktop program (written for this app).
   - Ctrl+click picks an object inside a group; Alt+click picks the object behind (each click digs deeper).
   - A second click on any selection (also several objects) switches to rotate/skew handles and back.
   - While moving, scaling, rotating or skewing: the original stays visible and the change shows as a blue
     outline; Space, + or a right click leaves a copy behind. Ctrl keeps a move straight and rotation in 15° steps,
     Shift scales from the centre.
   - Dragging an object with the right mouse button opens: move here, copy here, PowerClip inside, copy fill,
     outline or all properties here.
   - Handles sit just outside the selection, with no frame line; objects inside a group show round handles.
   - Double-clicking the Pick tool selects everything; Tab / Shift+Tab step through the objects; Ctrl+arrow
     nudges half a step. The status bar reads like the desktop program. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const S = VP.settings;
  const FX = VP.fx;
  const T = VP.tools;
  const esc = UI.h.esc;
  const Pt = (x, y) => new paper.Point(x, y);
  const $ = (q) => document.querySelector(q);
  const classic = () => document.documentElement.dataset.skin === 'classic';
  const zoom = () => paper.view.zoom;
  const sel = T.select;
  if (!sel) return;
  const PK = (VP.pick = {});
  const isFxPart = (it) => it && it.parent && !(it.parent instanceof paper.Layer) && (FX.isFx(it.parent) || FX.of(it.parent));
  const topLevel = (it) => VP.topLevel(it);
  const TRANSFORMS = ['move', 'scale', 'rotate', 'skew'];
  const acc = () => new paper.Color(VP.colors.accent || '#1461b2');

  /* ---------- object inside a group (Ctrl+click) and object behind (Alt+click) ---------- */
  const childAt = (pt) => {
    let it = VP.hitItem(pt, { deep: true });
    if (!it) return null;
    // parts of live effects (blends, text frames, PowerClips) stay together
    while (isFxPart(it)) it = it.parent;
    let top = it;
    for (let p = it; p && !(p instanceof paper.Layer); p = p.parent) if (FX.isFx(p)) top = p;
    return top;
  };
  const allAt = (pt) => {
    const tol = (VP.coarse ? 10 : 6) / zoom();
    const res = paper.project.hitTestAll(pt, { fill: true, stroke: true, segments: false, curves: false, pixel: true, tolerance: tol, match: (r) => VP.isSelectable(r.item) });
    const hits = [];
    (res || []).forEach((r) => {
      const t = topLevel(r.item);
      if (t && !hits.includes(t)) hits.push(t);
    });
    if (!PK.filledOn()) return hits;
    const all = VP.allSelectable();
    const out = [];
    for (let i = all.length - 1; i >= 0; i--) if (hits.includes(all[i]) || leafAt(all[i], pt)) out.push(all[i]);
    return out;
  };
  /* ---------- objects count as filled: a click inside an empty shape picks it ---------- */
  const tolPx = () => (VP.coarse ? 10 : 6) / zoom();
  const leafAt = (it, pt) => {
    if (!it.visible || !it.bounds.expand(tolPx() * 2).contains(pt)) return null;
    if (it instanceof paper.Group) {
      if (it.clipped && it.children[0]) return it.children[0].contains && it.children[0].contains(pt) ? it : null;
      for (let i = it.children.length - 1; i >= 0; i--) {
        const r = leafAt(it.children[i], pt);
        if (r) return r;
      }
      return null;
    }
    if (it instanceof paper.CompoundPath) return it.contains(pt) ? it : null;
    if (it instanceof paper.Path) return it.closed && it.contains(pt) ? it : null;
    if (it instanceof paper.PointText || it instanceof paper.Raster) return it.bounds.contains(pt) ? it : null;
    return null;
  };
  PK.filledOn = () => S.treatFilled !== false;
  const filledTools = ['select', 'node'];
  const filledAt = (pt, opts) => {
    const all = VP.allSelectable().filter((it) => !(opts && opts.exclude && opts.exclude.includes(it)));
    for (let i = all.length - 1; i >= 0; i--) {
      const leaf = leafAt(all[i], pt);
      if (leaf) return opts && opts.deep ? leaf : all[i];
    }
    return null;
  };
  const hit0 = VP.hitItem;
  VP.hitItem = function (pt, opts) {
    const r = hit0.apply(this, arguments);
    if (r || !PK.filledOn() || !filledTools.includes(VP.toolId)) return r;
    return filledAt(pt, opts || {});
  };
  PK.filledAt = filledAt;
  VP.actions.pkFilled = {
    label: 'Tüm nesneleri dolu kabul et',
    checked: () => PK.filledOn(),
    run: () => {
      S.treatFilled = !PK.filledOn();
      try {
        VP.io.savePrefs();
      } catch (e) { /* optional */ }
      VP.toast(S.treatFilled ? 'İçi boş nesneler de içinden tıklanarak seçilir' : 'İçi boş nesneler yalnızca anahatından seçilir');
    }
  };
  {
    const M = UI.MENUS.view;
    if (M && !M.includes('pkFilled')) M.splice(M.includes('pencilOnly') ? M.indexOf('pencilOnly') + 1 : M.length, 0, 'pkFilled');
  }

  const moveOp = (hit, e, wasSel) => ({ type: 'move', start: e.point, moved: false, wasSel, hit, origin: VP.selBounds().topLeft });

  const down0 = sel.down;
  sel.down = function (e) {
    if (VP.hitHandle(e.point)) {
      const r = down0.call(this, e);
      // Shift scales from the centre, as in the desktop program
      if (this.op && this.op.type === 'scale' && e.shift && classic()) {
        this.op.anchor = this.op.b0.center;
        this.op.fromCenter = true;
      }
      return r;
    }
    if (e.ctrl && !e.alt) {
      const c = childAt(e.point);
      if (c && c !== topLevel(c)) {
        const wasSel = VP.sel.includes(c);
        if (e.shift) VP.toggleSel(c);
        else if (!wasSel) VP.setSelection([c]);
        this.op = e.shift ? { type: 'none' } : moveOp(c, e, wasSel);
        return;
      }
    }
    if (e.alt && !e.ctrl) {
      const list = allAt(e.point);
      if (list.length) {
        const i = list.findIndex((it) => VP.sel.includes(it));
        const next = i < 0 ? list[0] : list[(i + 1) % list.length];
        VP.setSelection([next]);
        this.op = moveOp(next, e, false);
        this.op.dig = true;
        if (list.length > 1) VP.toast('Alttaki nesne: ' + VP.describe(next));
        return;
      }
    }
    return down0.call(this, e);
  };

  /* ---------- original stays visible, copy on demand ---------- */
  const snap = (op) => {
    if (op._snap || !TRANSFORMS.includes(op.type)) return;
    op._snap = VP.sel.map((it) => ({ it, clone: it.clone({ insert: false, deep: true }), parent: it.parent, index: it.index }));
  };
  const move0 = sel.move;
  sel.move = function (e) {
    const op = this.op;
    if (op && TRANSFORMS.includes(op.type)) {
      snap(op);
      if (e.ctrl && (op.type === 'move' || op.type === 'rotate')) e = Object.assign({}, e, { shift: true });
      else if (op.fromCenter) e = Object.assign({}, e, { shift: false });
    }
    return move0.call(this, e);
  };
  const leaveCopy = (op) => {
    if (!op || !op._snap) return 0;
    let n = 0;
    op._snap.forEach((s) => {
      if (!s.parent || !s.it.parent) return;
      const c = s.clone;
      if (VP.deepData) VP.deepData(c);
      if (c.data) delete c.data.uid;
      c.insertBelow(s.it);
      n++;
    });
    return n;
  };
  const up0 = sel.up;
  sel.up = function (e) {
    const op = this.op;
    // repeated Alt+clicks dig further; they are never a double click
    if (op && op.dig && !op.moved) {
      this.op = null;
      VP.drawOverlay();
      UI.schedule && UI.schedule('status');
      return;
    }
    // a second click on several selected objects switches handles too
    if (op && op.type === 'move' && !op.moved && op.wasSel && VP.sel.length > 1 && !(e.tapCount >= 2) && !e.shift) {
      this.op = null;
      VP.handleMode = VP.handleMode === 'rotate' ? 'scale' : 'rotate';
      VP.drawOverlay();
      VP.emit('selection');
      UI.schedule && UI.schedule('status');
      return;
    }
    if (op && op.leaveCopy && (op.moved || op.changed)) {
      const n = leaveCopy(op);
      if (n) VP.toast('Kopya bırakıldı');
    }
    const r = up0.call(this, e);
    UI.schedule && UI.schedule('status');
    return r;
  };
  const cancel0 = sel.cancel;
  sel.cancel = function () {
    return cancel0.apply(this, arguments);
  };
  const activeOp = () => VP.toolId === 'select' && sel.op && TRANSFORMS.includes(sel.op.type) && (sel.op.moved || sel.op.changed) ? sel.op : null;
  const markCopy = () => {
    const op = activeOp();
    if (!op) return false;
    if (!op.leaveCopy) {
      op.leaveCopy = true;
      VP.toast('Bırakınca kopya kalacak');
    }
    return true;
  };
  addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === '+') && markCopy()) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  /* ---------- drawing: ghost of the original and blue outline ---------- */
  const outlineOf = (it, s, out, budget) => {
    if (!it.visible || (it.data && (it.data.hitOnly || it.data.paraFrame))) return;
    if (budget.n-- <= 0) return;
    if (it instanceof paper.Group && !(it instanceof paper.Layer)) {
      if (it.clipped && it.children[0]) {
        outlineOf(it.children[0], s, out, budget);
        return;
      }
      it.children.forEach((c) => outlineOf(c, s, out, budget));
      return;
    }
    let c;
    if (it instanceof paper.Path || it instanceof paper.CompoundPath) {
      c = it.clone({ insert: false });
      c.fillColor = null;
      c.dashArray = [];
      c.shadowColor = null;
      c.opacity = 1;
      c.blendMode = 'normal';
    } else c = new paper.Path.Rectangle({ rectangle: it.bounds, insert: false });
    c.strokeColor = acc();
    c.strokeWidth = s;
    c.strokeScaling = true;
    out.push(c);
  };
  VP.overlayHooks = VP.overlayHooks || [];
  VP.overlayHooks.push((L) => {
    if (!classic()) return;
    const s = 1 / zoom();
    const op = activeOp();
    if (op && op._snap) {
      let k = 0;
      op._snap.forEach((g) => {
        try {
          const c = g.clone.clone({ insert: false });
          c.locked = true;
          L.insertChild(k++, c);
        } catch (e) { /* skip */ }
      });
      const outs = [];
      const budget = { n: 400 };
      VP.sel.forEach((it) => outlineOf(it, s, outs, budget));
      outs.forEach((o) => L.addChild(o));
    }
    if (rd && rd.dragging) {
      const outs = [];
      const budget = { n: 400 };
      VP.sel.forEach((it) => outlineOf(it, s, outs, budget));
      outs.forEach((o) => {
        o.translate(rd.delta);
        L.addChild(o);
      });
    }
  });

  /* ---------- selection marks, measured from the desktop program ---------- */
  // scale handles: solid black squares just outside the box; rotate mode: thin dark arcs at the corners,
  // small double arrows at the edge middles and a ring with a dot at the centre; object nodes: small
  // hollow squares. On a dark desk the colours turn light.
  const desk = () => {
    try {
      return new paper.Color(getComputedStyle(document.documentElement).getPropertyValue('--paste').trim() || '#ffffff').gray > 0.5;
    } catch (e) {
      return true;
    }
  };
  const C = (light, a, b) => new paper.Color(light ? a : b);
  const nodePoints = (it) => {
    const p = it.data && it.data.param;
    if (p && p.kind === 'rect') {
      const m = new paper.Matrix().translate(p.cx, p.cy).rotate(p.angle || 0);
      const w = Math.abs(p.w) / 2;
      const h = Math.abs(p.h) / 2;
      return [Pt(-w, -h), Pt(w, -h), Pt(w, h), Pt(-w, h)].map((q) => m.transform(q));
    }
    if (p && p.kind === 'ellipse') return [new paper.Matrix().translate(p.cx, p.cy).rotate(p.angle || 0).transform(Pt(0, -Math.abs(p.h) / 2))];
    const out = [];
    const add = (path) => path.segments && path.segments.forEach((sg) => out.length < 160 && out.push(sg.point));
    if (it instanceof paper.Path) add(it);
    else if (it instanceof paper.CompoundPath) it.children.forEach(add);
    return out;
  };
  const draw0 = VP.drawSelectionOverlay;
  VP.drawSelectionOverlay = function (L) {
    if (!classic()) return draw0.call(this, L);
    VP.pruneSel();
    if (!VP.sel.length) return;
    const s = 1 / zoom();
    const k = VP.coarse ? 1.45 : 1;
    const light = desk();
    const ink = C(light, '#000000', '#f2f2f2');
    const dark = C(light, '#252525', '#e6e6e6');
    const b = VP.selBounds();
    const off = 4.5 * s * k;
    const child = VP.sel.some((it) => it.parent && !(it.parent instanceof paper.Layer));
    // nodes of a single selected object
    if (VP.sel.length === 1) {
      const pts = nodePoints(VP.sel[0]);
      const ns = 4 * s * k;
      pts.forEach((q) => L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(q.subtract(ns / 2), new paper.Size(ns, ns)), fillColor: C(light, '#ffffff', '#262626'), strokeColor: C(light, '#666666', '#b0b0b0'), strokeWidth: 1 * s, insert: false })));
    }
    const pos = {
      tl: b.topLeft.add(Pt(-off, -off)), tc: b.topCenter.add(Pt(0, -off)), tr: b.topRight.add(Pt(off, -off)), mr: b.rightCenter.add(Pt(off, 0)),
      br: b.bottomRight.add(Pt(off, off)), bc: b.bottomCenter.add(Pt(0, off)), bl: b.bottomLeft.add(Pt(-off, off)), ml: b.leftCenter.add(Pt(-off, 0))
    };
    if (VP.handleMode === 'rotate') {
      const R = 10 * s * k;
      const span = 32;
      [['tl', b.topLeft, -135], ['tr', b.topRight, -45], ['br', b.bottomRight, 45], ['bl', b.bottomLeft, 135]].forEach(([id, c, ang]) => {
        const P = (a) => c.add(Pt(R, 0).rotate(a));
        L.addChild(new paper.Path.Arc({ from: P(ang - span), through: P(ang), to: P(ang + span), strokeColor: dark, strokeWidth: 1.9 * s * k, strokeCap: 'round', insert: false }));
      });
      const arrow = (c, dir) => {
        const len = 4.2 * s * k;
        const hd = 2.2 * s * k;
        const n = Pt(-dir.y, dir.x);
        const a1 = c.subtract(dir.multiply(len));
        const a2 = c.add(dir.multiply(len));
        L.addChild(new paper.Path.Line({ from: a1, to: a2, strokeColor: ink, strokeWidth: 1.2 * s * k, insert: false }));
        [[a1, dir], [a2, dir.multiply(-1)]].forEach(([tip, d]) => L.addChild(new paper.Path({ segments: [tip, tip.add(d.multiply(hd)).add(n.multiply(hd)), tip.add(d.multiply(hd)).subtract(n.multiply(hd))], closed: true, fillColor: ink, insert: false })));
      };
      const so = 6 * s * k;
      arrow(b.topCenter.add(Pt(0, -so)), Pt(1, 0));
      arrow(b.bottomCenter.add(Pt(0, so)), Pt(1, 0));
      arrow(b.leftCenter.add(Pt(-so, 0)), Pt(0, 1));
      arrow(b.rightCenter.add(Pt(so, 0)), Pt(0, 1));
      const cc = VP.pivot || b.center;
      L.addChild(new paper.Path.Circle({ center: cc, radius: 4.3 * s * k, fillColor: C(light, '#ffffff', '#262626'), strokeColor: dark, strokeWidth: 1.4 * s * k, insert: false }));
      L.addChild(new paper.Path.Circle({ center: cc, radius: 1.3 * s * k, fillColor: dark, insert: false }));
      return;
    }
    const hs = 5 * s * k;
    Object.keys(pos).forEach((id) => {
      const q = pos[id];
      const shape = child
        ? new paper.Path.Circle({ center: q, radius: hs / 2 + 0.4 * s, insert: false })
        : new paper.Path.Rectangle({ rectangle: new paper.Rectangle(q.subtract(hs / 2), new paper.Size(hs, hs)), insert: false });
      shape.fillColor = ink;
      L.addChild(shape);
    });
    const c = b.center;
    const x = 2 * s * k;
    const xc = C(light, '#555555', '#bdbdbd');
    [[Pt(-x, -x), Pt(x, x)], [Pt(-x, x), Pt(x, -x)]].forEach(([p1, p2]) => L.addChild(new paper.Path.Line({ from: c.add(p1), to: c.add(p2), strokeColor: xc, strokeWidth: 1 * s * k, insert: false })));
  };
  // the marks sit a little outside the box: grab them there too
  const hh0 = VP.hitHandle;
  VP.hitHandle = function (pt) {
    const r = hh0.apply(this, arguments);
    if (r || !classic() || !VP.sel.length) return r;
    const s = 1 / zoom();
    const k = VP.coarse ? 1.45 : 1;
    const b = VP.selBounds();
    const off = (VP.handleMode === 'rotate' ? 9 : 4.5) * s * k;
    const tol = (VP.coarse ? 22 : 11) * s;
    let best = null;
    VP.handlesOf(b).forEach((h) => {
      const dir = h.p.subtract(b.center);
      const unit = Pt(Math.sign(Math.round(dir.x * 1000)), Math.sign(Math.round(dir.y * 1000)));
      const q = h.p.add(unit.normalize(off));
      const d = q.getDistance(pt);
      if (d <= tol && (!best || d < best.d)) best = Object.assign({ d }, h);
    });
    return best;
  };

  /* ---------- right-button drag ---------- */
  let rd = null;
  let suppressCtx = 0;
  let spot = null;
  const spotAt = (x, y) => {
    if (!spot) {
      spot = document.createElement('div');
      spot.style.cssText = 'position:fixed;width:1px;height:1px;pointer-events:none';
      document.body.appendChild(spot);
    }
    spot.style.left = Math.round(x) + 'px';
    spot.style.top = Math.round(y) + 'px';
    return spot;
  };
  const projAt = (e) => {
    const c = $('#canvas');
    const r = c.getBoundingClientRect();
    return paper.view.viewToProject(Pt(e.clientX - r.left, e.clientY - r.top));
  };
  const dropMenu = (x, y, delta, target) => {
    const items = VP.sel.slice();
    const opt = (k, l, dis) => '<button class="pop-item" data-pick="' + k + '"' + (dis ? ' disabled' : '') + '><span>' + esc(l) + '</span></button>';
    const html = opt('move', 'Buraya taşı') + opt('copy', 'Buraya kopyala') + '<div class="pop-sep"></div>' +
      opt('clip', 'PowerClip içine', !target) + opt('fill', 'Dolguyu buraya kopyala', !target) + opt('stroke', 'Anahatı buraya kopyala', !target) + opt('all', 'Tüm özellikleri buraya kopyala', !target) +
      '<div class="pop-sep"></div>' + opt('cancel', 'İptal');
    UI.popover(spotAt(x + 4, y), html, (k) => {
      const src = items[0];
      if (k === 'move') {
        VP.T.move(items, delta);
        VP.commit();
      } else if (k === 'copy') {
        const copies = VP.zSort(items).map((it) => {
          const c = VP.cloneItem(it);
          c.insertAbove(it);
          return c;
        });
        VP.T.move(copies, delta);
        VP.setSelection(copies);
        VP.commit();
      } else if (k === 'clip' && target) {
        FX.powerclip(items, target);
      } else if ((k === 'fill' || k === 'all') && target && src) {
        VP.setFill([target], VP.getFill(src));
        if (k === 'all') {
          VP.setStroke([target], VP.getStroke(src));
          target.opacity = src.opacity;
        }
        VP.commit();
      } else if (k === 'stroke' && target && src) {
        VP.setStroke([target], VP.getStroke(src));
        VP.commit();
      }
      VP.drawOverlay();
    }, 'right');
  };
  const bindRight = () => {
    const cv = $('#canvas');
    if (!cv || cv._pk) return;
    cv._pk = true;
    cv.addEventListener('pointerdown', (e) => {
      // right click while dragging with the left button: leave a copy
      if (e.button === 2 && markCopy()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        suppressCtx = performance.now() + 800;
        return;
      }
      if (e.button !== 2 || e.pointerType !== 'mouse' || VP.toolId !== 'select') return;
      const pt = projAt(e);
      const hit = VP.hitItem(pt);
      if (!hit) return;
      rd = { x: e.clientX, y: e.clientY, start: pt, hit, dragging: false, delta: Pt(0, 0), id: e.pointerId };
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (er) { /* ignore */ }
    }, true);
    cv.addEventListener('pointermove', (e) => {
      if (!rd) return;
      if (!rd.dragging && Math.hypot(e.clientX - rd.x, e.clientY - rd.y) > 5) {
        rd.dragging = true;
        if (!VP.sel.includes(rd.hit)) VP.setSelection([rd.hit]);
      }
      if (rd.dragging) {
        rd.delta = VP.snapPt(projAt(e)).subtract(VP.snapPt(rd.start));
        VP.drawOverlay();
      }
    }, true);
    const end = (e) => {
      if (!rd) return;
      const r = rd;
      rd = null;
      if (r.dragging) {
        suppressCtx = performance.now() + 800;
        const pt = projAt(e);
        const target = VP.hitItem(pt, { exclude: VP.sel });
        VP.drawOverlay();
        if (e.type === 'pointerup') dropMenu(e.clientX, e.clientY, r.delta, target);
      } else if (r.ctxPending && e.type === 'pointerup' && VP.ctx) {
        // no drag: the normal context menu, opened on release
        suppressCtx = performance.now() + 500;
        VP.ctx.open(e.clientX, e.clientY, projAt(e));
      }
    };
    cv.addEventListener('pointerup', end, true);
    cv.addEventListener('pointercancel', end, true);
    cv.addEventListener('contextmenu', (e) => {
      if (performance.now() < suppressCtx || (rd && rd.dragging) || activeOp()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (rd && !rd.dragging) {
        // systems that send the menu on button press: wait to see whether this becomes a drag
        e.preventDefault();
        e.stopImmediatePropagation();
        rd.ctxPending = true;
      }
    }, true);
  };

  // the same from the context menu (no Alt key on a touch screen): the object behind, under the selection
  PK.digAt = (pt) => {
    const list = allAt(pt);
    if (!list.length) return VP.toast('Burada başka nesne yok');
    const i = list.findIndex((it) => VP.sel.includes(it));
    const next = i < 0 ? list[0] : list[(i + 1) % list.length];
    VP.setSelection([next]);
    VP.toast(next === list[0] && i === list.length - 1 ? 'En üstteki nesneye dönüldü' : 'Alttaki nesne: ' + VP.describe(next));
  };
  let lastCtxPt = null;
  const wrapCtx = () => {
    if (!VP.ctx || !VP.ctx.open || VP.ctx._pk) return;
    VP.ctx._pk = true;
    const co = VP.ctx.open;
    VP.ctx.open = function (x, y, point) {
      lastCtxPt = point || (VP.sel.length ? VP.selBounds().center : null);
      return co.apply(this, arguments);
    };
  };
  VP.actions.pkDig = { label: 'Alttaki nesneyi seç', kbd: 'Alt+tık', enabled: () => VP.sel.length > 0, run: () => PK.digAt(lastCtxPt || VP.selBounds().center) };

  /* ---------- Pick tool button, Tab, Ctrl+arrow ---------- */
  // the first click may open the tool's flyout; the second lands on the screen behind it
  let lastTap = { t: 0, x: 0, y: 0 };
  document.addEventListener('pointerup', (e) => {
    const now = performance.now();
    const onBtn = e.target.closest && e.target.closest('#toolbox [data-tool="select"]');
    const again = now - lastTap.t < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 12;
    if (onBtn || again) {
      if (again) {
        lastTap.t = 0;
        setTimeout(() => {
          if (UI.closePop) UI.closePop();
          VP.setTool('select');
          VP.selectAll();
          VP.toast(VP.sel.length + ' nesne seçildi');
        }, 0);
        return;
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    } else lastTap.t = 0;
  }, true);
  const typing = (e) => e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || (e.target && e.target.isContentEditable) || UI.textItem;
  addEventListener('keydown', (e) => {
    if (typing(e) || VP.toolId !== 'select' || UI._pop) return;
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const all = VP.allSelectable();
      if (!all.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const cur = VP.sel.length ? all.indexOf(VP.sel[VP.sel.length - 1]) : -1;
      const n = all.length;
      const i = cur < 0 ? (e.shiftKey ? n - 1 : 0) : (cur + (e.shiftKey ? -1 : 1) + n) % n;
      VP.setSelection([all[i]]);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.startsWith('Arrow') && VP.sel.length) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const s = VP.toPT((S.nudgeMM || 1) / 2);
      const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
      VP.T.move(VP.sel, Pt(d[0], d[1]));
      VP.drawOverlay();
      VP.emit('transform');
      clearTimeout(PK._nt);
      PK._nt = setTimeout(() => VP.commit(), 300);
    }
  }, true);

  /* ---------- status bar ---------- */
  const rs0 = UI.renderStatus;
  UI.renderStatus = function () {
    const r = rs0.apply(this, arguments);
    if (!classic() || VP.toolId !== 'select') return r;
    const info = $('#st-info');
    if (!info) return r;
    const n = VP.sel.length;
    if (!n) {
      info.textContent = 'Döndürmek/eğmek için nesneye iki kez tıklayın · Araca çift tıklama tüm nesneleri seçer · Shift+tık: çoklu seçim · Alt+tık: alttakini seç · Ctrl+tık: grup içinden seç';
      return r;
    }
    const layers = Array.from(new Set(VP.sel.map((it) => (it.layer ? it.layer.name : ''))));
    const where = layers.length === 1 ? layers[0] + ' üzerinde' : layers.length + ' katman üzerinde';
    const what = n === 1 ? VP.describe(VP.sel[0]) + (VP.sel[0].parent && !(VP.sel[0].parent instanceof paper.Layer) ? ' (grup içinde)' : '') : n + ' nesne seçili';
    const next = VP.handleMode === 'rotate' ? 'Sonraki tık: taşı/boyutlandır' : 'Sonraki tık: döndür/eğ';
    info.textContent = what + ', ' + where + ' · ' + next + ' · Shift+tık: çoklu seçim · Alt+tık: alttakini seç';
    return r;
  };
  VP.on('selection', () => UI.schedule && UI.schedule('status'));

  const start = () => {
    bindRight();
    wrapCtx();
  };
  if (document.readyState === 'complete') setTimeout(start, 60);
  else addEventListener('load', () => setTimeout(start, 60));
})();
