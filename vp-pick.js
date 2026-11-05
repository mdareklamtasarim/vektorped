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
    const out = [];
    (res || []).forEach((r) => {
      const t = topLevel(r.item);
      if (t && !out.includes(t)) out.push(t);
    });
    return out;
  };
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

  /* ---------- handles just outside the selection ---------- */
  const draw0 = VP.drawSelectionOverlay;
  VP.drawSelectionOverlay = function (L) {
    if (!classic() || !VP.sel.length) return draw0.call(this, L);
    const sb0 = VP.selBounds;
    const before = L.children.length;
    const off = (VP.coarse ? 5 : 4) / zoom();
    try {
      const b = sb0().expand(off * 2);
      VP.selBounds = (items) => (items && items !== VP.sel ? sb0(items) : b.clone());
      draw0.call(this, L);
    } finally {
      VP.selBounds = sb0;
    }
    const added = L.children.slice(before);
    const child = VP.sel.some((it) => it.parent && !(it.parent instanceof paper.Layer));
    const hsMax = 14 / zoom();
    added.forEach((c) => {
      // no frame line around each object of a multiple selection
      if (c.dashArray && c.dashArray.length && c.opacity < 1) return c.remove();
      // objects inside a group: round handles
      if (child && c instanceof paper.Path && c.segments.length === 4 && c.closed && c.fillColor && Math.abs(c.bounds.width - c.bounds.height) < 1e-6 && c.bounds.width < hsMax) {
        const r = new paper.Path.Circle({ center: c.bounds.center, radius: c.bounds.width / 2, fillColor: c.fillColor, strokeColor: c.strokeColor, strokeWidth: c.strokeWidth, insert: false });
        c.replaceWith(r);
      }
    });
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
