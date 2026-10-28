/* VektörPad startup: canvas, pointer & gesture input, keyboard, sample drawing. */
(function () {
  'use strict';
  const VP = window.VP;
  const $ = (s) => document.querySelector(s);
  VP.keys = { space: false, shift: false };

  /* ---------- sample drawing (marked as an example) ---------- */
  VP.makeSample = () => {
    VP.doc = VP.newDoc('Örnek çizim');
    VP.loadPage(0);
    const P = (x, y) => new paper.Point(VP.toPT(x), VP.toPT(y));
    const mmv = VP.toPT;
    const bg = VP.activeLayer;
    bg.name = 'Arka plan';
    const card = VP.createParam({ kind: 'rect', cx: mmv(105), cy: mmv(148.5), w: mmv(182), h: mmv(269), r: mmv(6), angle: 0 });
    card.strokeColor = null;
    VP.setFill([card], { type: 'linear', color: '#0f2f5c', color2: '#1d7f86', angle: 90 });
    card.data.label = 'Arka plan kartı';

    const draw = new paper.Layer({ name: 'Çizim', insert: false });
    paper.project.addLayer(draw);
    VP.keepSysOrder();
    VP.setActiveLayer(draw);

    const sun = VP.createParam({ kind: 'ellipse', cx: mmv(138), cy: mmv(92), w: mmv(64), h: mmv(64), angle: 0 });
    sun.strokeColor = null;
    VP.setFill([sun], { type: 'radial', color: '#ffe066', color2: '#f08c2e', angle: 0 });
    VP.setShadow([sun], { on: true, color: '#f7b733', alpha: 0.55, blur: mmv(6), dx: 0, dy: 0 });
    sun.data.label = 'Güneş';

    const m1 = new paper.Path({ segments: [P(14, 214), P(62, 150), P(96, 196), P(130, 132), P(196, 214)], closed: true });
    const m2 = new paper.Path({ segments: [P(14, 214), P(40, 186), P(70, 214)], closed: true });
    const mountains = m1.unite(m2, { insert: false });
    m1.remove();
    m2.remove();
    draw.addChild(mountains);
    mountains.fillColor = new paper.Color('#0b1f3d');
    mountains.data.label = 'Dağlar (kaynakla birleşmiş)';
    const ridge = new paper.Path({ segments: [P(14, 236), P(52, 206), P(88, 226), P(126, 196), P(196, 236)], closed: true });
    ridge.fillColor = new paper.Color('#16406b');
    ridge.data.label = 'Ön tepe';
    const ground = VP.createParam({ kind: 'rect', cx: mmv(105), cy: mmv(261), w: mmv(186), h: mmv(52), r: 0, angle: 0 });
    ground.strokeColor = null;
    ground.fillColor = new paper.Color('#0a1a33');
    ground.data.label = 'Zemin';
    const clip = VP.createParam({ kind: 'rect', cx: mmv(105), cy: mmv(148.5), w: mmv(182), h: mmv(269), r: mmv(6), angle: 0 });
    const groundCut = ground.intersect(clip, { insert: false });
    ground.remove();
    clip.remove();
    groundCut.fillColor = new paper.Color('#0a1a33');
    groundCut.data.label = 'Zemin';
    draw.addChild(groundCut);

    [[40, 48, 3.2], [70, 30, 2.2], [176, 40, 2.6], [30, 108, 1.8], [96, 62, 1.6]].forEach(([x, y, r], i) => {
      const s = VP.createParam({ kind: 'polygon', cx: mmv(x), cy: mmv(y), w: mmv(r * 2), h: mmv(r * 2), sides: 5, star: true, inner: 0.42, angle: 0 });
      s.strokeColor = null;
      s.fillColor = new paper.Color('#ffffff');
      s.opacity = i % 2 ? 0.7 : 0.95;
    });
    const spiral = VP.createParam({ kind: 'spiral', cx: mmv(52), cy: mmv(92), w: mmv(26), h: mmv(26), turns: 3, angle: 0 });
    spiral.fillColor = null;
    spiral.strokeColor = new paper.Color('#9fe3dc');
    spiral.strokeWidth = 1.2;
    spiral.opacity = 0.75;
    spiral.data.label = 'Rüzgâr';

    const txt = new paper.Layer({ name: 'Yazı', insert: false });
    paper.project.addLayer(txt);
    VP.keepSysOrder();
    VP.setActiveLayer(txt);
    const title = new paper.PointText({ point: P(105, 168 - 20), content: 'VektörPad', justification: 'center', fontFamily: 'Fira Sans', fontWeight: 'bold', fontSize: 54, fillColor: '#ffffff', insert: false });
    title.point = P(105, 252);
    txt.addChild(title);
    const sub = new paper.PointText({ point: P(105, 263), content: 'iPad için vektör çizim atölyesi', justification: 'center', fontFamily: 'Fira Sans', fontSize: 15, fillColor: '#9fe3dc', insert: false });
    txt.addChild(sub);
    // prepress strip: process colours and a registration mark
    const cmyk = [['#00a0e3', 'C'], ['#e5007e', 'M'], ['#ffed00', 'Y'], ['#1d1d1b', 'K']];
    cmyk.forEach(([c, l], i) => {
      const sq = VP.createParam({ kind: 'rect', cx: mmv(24 + i * 8), cy: mmv(270), w: mmv(6), h: mmv(6), r: 0, angle: 0 });
      sq.fillColor = new paper.Color(c);
      sq.strokeColor = new paper.Color('#ffffff');
      sq.strokeWidth = 0.4;
      sq.data.label = 'Proses rengi ' + l;
      const t = new paper.PointText({ point: P(24 + i * 8, 278.5), content: l, justification: 'center', fontFamily: 'Fira Sans', fontSize: 6.5, fillColor: '#cfe3f5', insert: false });
      txt.addChild(t);
    });
    const reg = new paper.Group({ insert: false });
    reg.addChild(new paper.Path.Circle({ center: P(186, 271), radius: mmv(2.6), strokeColor: '#ffffff', strokeWidth: 0.5, insert: false }));
    reg.addChild(new paper.Path.Line({ from: P(181, 271), to: P(191, 271), strokeColor: '#ffffff', strokeWidth: 0.5, insert: false }));
    reg.addChild(new paper.Path.Line({ from: P(186, 266), to: P(186, 276), strokeColor: '#ffffff', strokeWidth: 0.5, insert: false }));
    reg.data.label = 'Kayıt işareti';
    txt.addChild(reg);
    const note = new paper.PointText({ point: P(105, 289.5), content: 'Örnek çizim · Dosya › Yeni ile boş sayfa açın', justification: 'center', fontFamily: 'Fira Sans', fontSize: 7, fillColor: '#6b7a8c', insert: false });
    txt.addChild(note);

    VP.setActiveLayer(draw);
    VP.storePage();
    VP.fitPage();
    VP.clearSelection();
    VP.resetHistory();
    VP.io.autosave();
    VP.emit('doc');
  };

  /* ---------- pointer input ---------- */
  const bindCanvas = (cv) => {
    const ptrs = new Map();
    let gesture = null;
    let active = false;
    let activeId = null;
    const tap = { t: 0, x: 0, y: 0, n: 0 };
    const vptOf = (e) => {
      const r = cv.getBoundingClientRect();
      return new paper.Point(e.clientX - r.left, e.clientY - r.top);
    };
    const mk = (e, vpt) => ({
      point: paper.view.viewToProject(vpt),
      vpt,
      pointerType: e.pointerType,
      pressure: e.pressure || 0.5,
      shift: e.shiftKey || VP.keys.shift,
      alt: e.altKey,
      ctrl: e.ctrlKey || e.metaKey,
      isTouch: e.pointerType === 'touch',
      tapCount: tap.n
    });
    const two = () => Array.from(ptrs.values()).slice(0, 2);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      e.preventDefault();
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
      if (VP.ui.textItem) {
        VP.ui.commitText();
        if (VP.toolId === 'text') return;
      }
      VP.ui.closePop();
      const vpt = vptOf(e);
      ptrs.set(e.pointerId, { vpt, type: e.pointerType });
      if (ptrs.size === 2) {
        if (active) {
          const t = VP.tool();
          if (t.cancel) t.cancel();
          active = false;
        }
        const [a, b] = two();
        gesture = { type: 'pinch', dist: a.vpt.getDistance(b.vpt), mid: a.vpt.add(b.vpt).divide(2) };
        return;
      }
      if (ptrs.size > 2) return;
      const tool = VP.tool();
      const meta = VP.TOOL_META[VP.toolId] || {};
      if (e.button === 1 || VP.keys.space || (VP.settings.pencilOnly && e.pointerType === 'touch' && meta.drawing)) {
        gesture = { type: 'pan', last: vpt };
        return;
      }
      const now = performance.now();
      if (now - tap.t < 380 && vpt.getDistance(new paper.Point(tap.x, tap.y)) < 26) tap.n++;
      else tap.n = 1;
      tap.t = now;
      tap.x = vpt.x;
      tap.y = vpt.y;
      active = true;
      activeId = e.pointerId;
      tool.down(mk(e, vpt));
    });
    cv.addEventListener('pointermove', (e) => {
      const vpt = vptOf(e);
      if (ptrs.has(e.pointerId)) ptrs.get(e.pointerId).vpt = vpt;
      if (gesture && gesture.type === 'pinch') {
        if (ptrs.size < 2) return;
        const [a, b] = two();
        const dist = a.vpt.getDistance(b.vpt);
        const mid = a.vpt.add(b.vpt).divide(2);
        if (gesture.dist > 0) VP.zoomAt(dist / gesture.dist, mid);
        VP.panBy(mid.x - gesture.mid.x, mid.y - gesture.mid.y);
        gesture.dist = dist;
        gesture.mid = mid;
        return;
      }
      if (gesture && gesture.type === 'pan') {
        VP.panBy(vpt.x - gesture.last.x, vpt.y - gesture.last.y);
        gesture.last = vpt;
        return;
      }
      if (gesture) return;
      const ev = mk(e, vpt);
      VP.ui.setPos(ev.point);
      if (active && e.pointerId === activeId) {
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
        if (evs && evs.length > 1 && (VP.toolId === 'freehand' || VP.toolId === 'brush')) {
          evs.forEach((ce) => VP.tool().move(mk(ce, vptOf(ce))));
        } else VP.tool().move(ev);
      } else if (!active && e.pointerType === 'mouse' && VP.tool().hover) VP.tool().hover(ev);
    });
    const end = (e) => {
      const had = ptrs.delete(e.pointerId);
      if (gesture) {
        if (ptrs.size === 0) gesture = null;
        return;
      }
      if (!had) return;
      if (active && e.pointerId === activeId) {
        active = false;
        activeId = null;
        const ev = mk(e, vptOf(e));
        if (e.type === 'pointercancel') {
          const t = VP.tool();
          if (t.cancel) t.cancel();
        } else VP.tool().up(ev);
      }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const vpt = vptOf(e);
        if (e.ctrlKey || e.metaKey) VP.zoomAt(Math.exp(-e.deltaY * 0.012), vpt);
        else VP.panBy(-e.deltaX, -e.deltaY);
      },
      { passive: false }
    );
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
  };

  /* ---------- keyboard ---------- */
  const bindKeys = () => {
    const toolKeys = {};
    Object.keys(VP.TOOL_META).forEach((id) => {
      const k = VP.TOOL_META[id].key;
      if (k) toolKeys[k.toLowerCase()] = id;
    });
    document.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
      if (document.querySelector('.modal-wrap')) return;
      VP.keys.shift = e.shiftKey;
      if (e.key === ' ') {
        VP.keys.space = true;
        e.preventDefault();
        return;
      }
      const tool = VP.tool();
      if (tool.key && tool.key(e)) {
        e.preventDefault();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const run = (id) => {
        e.preventDefault();
        VP.ui.run(id);
      };
      if (mod) {
        if (k === 'z') return run(e.shiftKey ? 'redo' : 'undo');
        if (k === 'y') return run('redo');
        if (k === 'c') return run('copy');
        if (k === 'x') return run('cut');
        if (k === 'v') return run('paste');
        if (k === 'd') return run('duplicate');
        if (k === 'a') return run('selectAll');
        if (k === 'g') return run(e.shiftKey ? 'ungroup' : 'group');
        if (k === 'u') return run('ungroup');
        if (k === 'l') return run('combine');
        if (k === 'k') return run('breakApart');
        if (k === 'q') return run('toCurves');
        if (k === 's') return run('save');
        if (k === 'o') return run('open');
        if (k === 'i') return run('import');
        if (k === 'e') return run('export');
        if (k === 'n') return run('new');
        if (k === '=' || k === '+') {
          e.preventDefault();
          return VP.zoomAt(1.25);
        }
        if (k === '-') {
          e.preventDefault();
          return VP.zoomAt(0.8);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') return run('delete');
      if (e.key === 'Escape') {
        if (VP.ui._pop) return VP.ui.closePop();
        if (tool.busy && tool.busy() && tool.cancel) return tool.cancel();
        if (VP.toolId !== 'select') return VP.setTool('select');
        return VP.clearSelection();
      }
      if (e.key.startsWith('Arrow') && VP.sel.length) {
        e.preventDefault();
        const s = VP.toPT(e.shiftKey ? VP.settings.superNudgeMM || 10 : VP.settings.nudgeMM || 1);
        const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
        VP.T.move(VP.sel, new paper.Point(d[0], d[1]));
        clearTimeout(VP._nudgeT);
        VP.drawOverlay();
        VP.emit('transform');
        VP._nudgeT = setTimeout(() => VP.commit(), 300);
        return;
      }
      if (e.key === 'PageUp') return run(e.shiftKey ? 'toFront' : 'forward');
      if (e.key === 'PageDown') return run(e.shiftKey ? 'toBack' : 'backward');
      if (e.key === 'F4') return run('fit');
      if (e.key === '+' || e.key === '=') return VP.zoomAt(1.25);
      if (e.key === '-') return VP.zoomAt(0.8);
      if (toolKeys[k]) {
        e.preventDefault();
        VP.setTool(toolKeys[k]);
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === ' ') VP.keys.space = false;
      VP.keys.shift = e.shiftKey;
    });
  };

  /* ---------- startup ---------- */
  const start = () => {
    if (!window.paper) {
      document.getElementById('st-info').textContent = 'Çizim kütüphanesi yüklenemedi · İnternet bağlantısını kontrol edip sayfayı yenileyin';
      return;
    }
    VP.coarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    VP.readColors();
    const cv = $('#canvas');
    cv.setAttribute('hidpi', 'on');
    cv.setAttribute('data-paper-hidpi', 'on');
    paper.setup(cv);
    paper.settings.insertItems = true;
    VP.bgLayer = new paper.Layer({ name: '__bg' });
    VP.bgLayer.data.sys = true;
    VP.uiLayer = new paper.Layer({ name: '__ui' });
    VP.uiLayer.data.sys = true;
    VP.shadowZoomFactor = () => 1;

    const prefs = VP.io.loadPrefs();
    VP.ui.init();
    if (prefs && prefs.dock) VP.ui.dockTab = prefs.dock;
    if (innerWidth <= 640) $('#dock').hidden = true;

    const wrap = $('#canvas-wrap');
    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      const v = paper.view;
      const c = v.center;
      v.viewSize = new paper.Size(w, h);
      v.center = c;
      if (!VP.viewTouched && VP.doc) VP.fitPage();
      VP.viewChanged();
    };
    VP.ui.onResize = resize;
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
    else addEventListener('resize', resize);

    // touch and keys are bound first, so the app stays usable even if the saved document fails to open
    bindCanvas(cv);
    bindKeys();
    let saved = null;
    try {
      saved = VP.io.loadAutosave();
    } catch (e) {
      saved = null;
    }
    VP.hadSavedDoc = !!saved;
    let opened = false;
    if (saved) {
      try {
        VP.doc = { name: saved.name, active: Math.min(saved.active || 0, saved.pages.length - 1), pages: saved.pages, ext: saved.ext || {} };
        VP.loadPage(VP.doc.active);
        VP.refreshShadows();
        VP.resetHistory();
        opened = true;
      } catch (e) {
        console.error(e);
        // keep the document that failed to open, then start clean
        try {
          localStorage.setItem(VP.io.KEY + '.backup', localStorage.getItem(VP.io.KEY));
        } catch (err) { /* storage full */ }
        try {
          VP.userLayers().forEach((l) => l.remove());
        } catch (err) { /* ignore */ }
        VP.doc = VP.newDoc('Adsız çizim');
        VP.loadPage(0);
        VP.resetHistory();
        opened = true;
        setTimeout(() => VP.ui.toast('Kayıtlı belge açılamadı · Yedeği saklandı, boş belge açıldı'), 600);
      }
    }
    if (!opened) {
      VP.makeSample();
      VP.ui.toast('Örnek bir çizimle açıldı · Dosya › Yeni ile boş belge başlatın');
    }
    try {
      VP.setTool('select');
      VP.emit('doc');
    } catch (e) {
      console.error(e);
    }

    const reTheme = () => {
      VP.readColors();
      VP.drawPage();
      VP.drawOverlay();
      VP.ui.drawRulers();
    };
    const mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', reTheme);
    else if (mq.addListener) mq.addListener(reTheme);
    new MutationObserver(reTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        paper.project.getItems({ class: paper.PointText }).forEach((t) => (t.content = t.content));
        paper.view.update();
        VP.ui.drawRulers();
      });
    }
    addEventListener('pagehide', () => VP.io.autosave());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && VP.io.autosave());
  };
  // an unexpected error is shown (once) instead of leaving the app silently stuck
  let shownErr = 0;
  const showErr = (msg) => {
    if (/ResizeObserver|^Script error|AbortError|NotAllowedError/i.test(String(msg))) return;
    if (shownErr++ > 0) return;
    const el = document.getElementById('st-info');
    if (el) el.textContent = 'Hata: ' + msg;
    if (VP.ui && VP.ui.toast) VP.ui.toast('Beklenmeyen bir hata oldu · Sayfayı yenileyin · ' + String(msg).slice(0, 80));
  };
  addEventListener('error', (e) => showErr((e.error && e.error.message) || e.message || 'bilinmeyen'));
  addEventListener('unhandledrejection', (e) => showErr((e.reason && e.reason.message) || String(e.reason)));
  const safeStart = () => {
    try {
      start();
    } catch (e) {
      console.error(e);
      showErr(e.message);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeStart);
  else safeStart();
})();
