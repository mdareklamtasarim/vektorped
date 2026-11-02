/* VektörPad, the last desktop-program differences (written for this app):
   - Bring into focus: work on the selection alone; everything else fades and cannot be picked.
   - Frame type: turn a closed shape into an empty PowerClip frame (shown with a cross), place a picture
     in it, or remove the frame.
   - Wrap connector line: right-angle and rounded connector lines go around objects marked this way.
   - Object hinting: a tip with the name, layer, size, fill and outline of the object under the pointer.
   - Desktop layer on the master page: shown on every page, never printed or exported. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const S = VP.settings;
  const A = VP.actions;
  const FX = VP.fx;
  const esc = UI.h.esc;
  const Pt = (x, y) => new paper.Point(x, y);
  const $ = (q) => document.querySelector(q);
  const K7 = (VP.k7 = {});
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => x !== '|' && !x.startsWith('h:') && !x.startsWith('sub:') && M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };
  const userItem = (it) => !!(it && it.layer && !VP.isSys(it.layer));

  /* ================= Bring into focus ================= */
  let focus = null;
  const inFocus = (it) => {
    for (let p = it; p && !(p instanceof paper.Layer); p = p.parent) if (focus.includes(p)) return true;
    return false;
  };
  const banner = () => {
    let b = $('#k7-focus');
    if (!focus) return b && b.remove();
    if (!b) {
      b = document.createElement('div');
      b.id = 'k7-focus';
      const wrap = $('#canvas-wrap');
      if (wrap) wrap.appendChild(b);
      b.addEventListener('click', (e) => e.target.closest('[data-k7exit]') && K7.exitFocus());
    }
    b.innerHTML = '<span>Odak modu · ' + focus.length + ' nesne</span><button class="btn primary" data-k7exit="1">Odaktan çık</button>';
  };
  K7.focus = () => {
    if (!VP.sel.length) return VP.toast('Önce odaklanmak istediğiniz nesneleri seçin');
    focus = VP.sel.slice();
    banner();
    VP.drawOverlay();
    VP.toast('Odak modu: yalnızca seçili nesneler düzenlenebilir · Esc ile çıkın');
  };
  K7.exitFocus = () => {
    if (!focus) return;
    focus = null;
    banner();
    VP.drawOverlay();
  };
  K7.inFocusMode = () => !!focus;
  VP.overlayHooks = VP.overlayHooks || [];
  VP.overlayHooks.push((L) => {
    if (!focus) return;
    focus = focus.filter((it) => it.parent && it.layer && it.layer.project === paper.project);
    if (!focus.length) {
      focus = null;
      setTimeout(banner, 0);
      return;
    }
    const veilCol = getComputedStyle(document.documentElement).getPropertyValue('--paste').trim() || '#ffffff';
    const veil = new paper.Path.Rectangle({ rectangle: paper.view.bounds.expand(paper.view.bounds.width), fillColor: veilCol, opacity: 0.82, insert: false });
    L.insertChild(0, veil);
    let k = 1;
    VP.zSort(focus).forEach((it) => {
      try {
        const c = it.clone({ insert: false, deep: true });
        c.locked = true;
        L.insertChild(k++, c);
      } catch (e) { /* skip */ }
    });
  });
  const hit0 = VP.hitItem;
  VP.hitItem = function () {
    const r = hit0.apply(this, arguments);
    if (focus && r && !inFocus(r)) return null;
    return r;
  };
  const ss0 = VP.setSelection;
  VP.setSelection = function (items) {
    if (focus && Array.isArray(items)) arguments[0] = items.filter((it) => inFocus(it));
    return ss0.apply(this, arguments);
  };
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && focus && !(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) K7.exitFocus();
  });
  VP.on('page', () => K7.exitFocus());
  VP.on('doc', () => K7.exitFocus());

  /* ================= Frame type ================= */
  const closedShape = (it) => VP.isPathItem(it) && !FX.isFx(it) && (it instanceof paper.CompoundPath || it.closed);
  let pendingFrame = null;
  let pendingTimer = 0;
  K7.placeInFrame = () => {
    const f = VP.sel[0];
    if (!f || !f.data.pcEmpty) return;
    pendingFrame = f;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => (pendingFrame = null), 120000);
    VP.io.importFile();
  };
  VP.on('change', () => {
    const f = pendingFrame;
    if (!f || !VP.sel.length || VP.sel.includes(f)) return;
    pendingFrame = null;
    if (!f.parent) return;
    const items = VP.sel.slice();
    setTimeout(() => {
      try {
        delete f.data.pcEmpty;
        FX.powerclip(items, f);
        const g = VP.sel[0];
        if (g && FX.of(g) && FX.of(g).type === 'powerclip' && FX.pcArrange) FX.pcArrange(g, 'fill');
        VP.toast('Çerçeveye yerleştirildi');
      } catch (e) {
        VP.toast('Çerçeveye yerleştirilemedi');
      }
    }, 0);
  });
  VP.overlayHooks.push((L) => {
    const s = 1 / paper.view.zoom;
    VP.userLayers().forEach((Ly) => {
      if (!Ly.visible) return;
      Ly.getItems({ match: (it) => it.data && it.data.pcEmpty && it.visible && !(it.parent && FX.of(it.parent)) }).forEach((it) => {
        const b = it.bounds;
        [[b.topLeft, b.bottomRight], [b.topRight, b.bottomLeft]].forEach(([p, q]) => L.addChild(new paper.Path.Line({ from: p, to: q, strokeColor: '#8a8a8a', strokeWidth: s, dashArray: [4 * s, 3 * s], insert: false })));
      });
    });
  });

  /* ================= Wrap connector line ================= */
  const connectors = () => paper.project.getItems({ match: (it) => it.data && it.data.effect && it.data.effect.type === 'connector' });
  K7.rebuildConnectors = () => connectors().forEach((g) => {
    try {
      FX.rebuild(g);
    } catch (e) { /* skip */ }
  });
  VP.connAvoid = (pts, g, objA, objB) => {
    if (pts.length < 2) return null;
    const m = VP.toPT(3);
    const a = pts[0];
    const b = pts[pts.length - 1];
    let obs = paper.project.getItems({ match: (it) => it.data && it.data.connWrap && it.visible && userItem(it) && it !== objA && it !== objB && it !== g });
    if (!obs.length) return null;
    obs = obs.map((it) => {
      const r = it.strokeBounds;
      return new paper.Rectangle(g.globalToLocal(r.topLeft), g.globalToLocal(r.bottomRight)).expand(m * 2);
    });
    const mid = new paper.Rectangle(a, b);
    obs.sort((r1, r2) => r1.center.getDistance(mid.center) - r2.center.getDistance(mid.center));
    obs = obs.slice(0, 6);
    const hits = (p, q) => obs.some((r) => {
      if (Math.abs(p.y - q.y) < 1e-6) return p.y > r.top && p.y < r.bottom && Math.max(p.x, q.x) > r.left && Math.min(p.x, q.x) < r.right;
      if (Math.abs(p.x - q.x) < 1e-6) return p.x > r.left && p.x < r.right && Math.max(p.y, q.y) > r.top && Math.min(p.y, q.y) < r.bottom;
      return new paper.Rectangle(p, q).intersects(r);
    });
    const ok = (route) => route.every((p, i) => i === 0 || !hits(route[i - 1], p));
    if (ok(pts)) return null;
    const xs = [(a.x + b.x) / 2];
    const ys = [(a.y + b.y) / 2];
    obs.forEach((r) => {
      xs.push(r.left, r.right);
      ys.push(r.top, r.bottom);
    });
    const len = (route) => route.reduce((s, p, i) => (i ? s + p.getDistance(route[i - 1]) : 0), 0) + route.length * m;
    let best = null;
    let bestL = Infinity;
    const tryR = (route) => {
      if (!ok(route)) return;
      const l = len(route);
      if (l < bestL) {
        bestL = l;
        best = route;
      }
    };
    // keep the way the line leaves and enters the objects (outwards from the side it is attached to)
    const firstH = Math.abs(pts[1].y - a.y) < 1e-6 && Math.abs(pts[1].x - a.x) > 1e-6;
    const lastH = Math.abs(pts[pts.length - 2].y - b.y) < 1e-6 && Math.abs(pts[pts.length - 2].x - b.x) > 1e-6;
    const ca = objA ? g.globalToLocal(objA.bounds.center) : null;
    const cb = objB ? g.globalToLocal(objB.bounds.center) : null;
    const outA = (v, axis) => !ca || (axis === 'x' ? (v - a.x) * Math.sign(a.x - ca.x || 1) >= m * 0.9 : (v - a.y) * Math.sign(a.y - ca.y || 1) >= m * 0.9);
    const outB = (v, axis) => !cb || (axis === 'x' ? (v - b.x) * Math.sign(b.x - cb.x || 1) >= m * 0.9 : (v - b.y) * Math.sign(b.y - cb.y || 1) >= m * 0.9);
    xs.push(a.x + Math.sign(ca ? a.x - ca.x || 1 : 1) * m * 2, b.x + Math.sign(cb ? b.x - cb.x || 1 : 1) * m * 2);
    ys.push(a.y + Math.sign(ca ? a.y - ca.y || 1 : 1) * m * 2, b.y + Math.sign(cb ? b.y - cb.y || 1 : 1) * m * 2);
    if (firstH && lastH) {
      xs.forEach((x) => outA(x, 'x') && outB(x, 'x') && tryR([a, Pt(x, a.y), Pt(x, b.y), b]));
      xs.forEach((x1) => outA(x1, 'x') && ys.forEach((y) => xs.forEach((x2) => outB(x2, 'x') && tryR([a, Pt(x1, a.y), Pt(x1, y), Pt(x2, y), Pt(x2, b.y), b]))));
    } else if (!firstH && !lastH) {
      ys.forEach((y) => outA(y, 'y') && outB(y, 'y') && tryR([a, Pt(a.x, y), Pt(b.x, y), b]));
      ys.forEach((y1) => outA(y1, 'y') && xs.forEach((x) => ys.forEach((y2) => outB(y2, 'y') && tryR([a, Pt(a.x, y1), Pt(x, y1), Pt(x, y2), Pt(b.x, y2), b]))));
    }
    if (!best) {
      xs.forEach((x) => tryR([a, Pt(x, a.y), Pt(x, b.y), b]));
      ys.forEach((y) => tryR([a, Pt(a.x, y), Pt(b.x, y), b]));
      xs.forEach((x1) => ys.forEach((y) => xs.forEach((x2) => tryR([a, Pt(x1, a.y), Pt(x1, y), Pt(x2, y), Pt(x2, b.y), b]))));
      ys.forEach((y1) => xs.forEach((x) => ys.forEach((y2) => tryR([a, Pt(a.x, y1), Pt(x, y1), Pt(x, y2), Pt(b.x, y2), b]))));
    }
    return best;
  };
  K7.toggleWrap = () => {
    const items = VP.sel.filter((it) => !(it.data.effect && it.data.effect.type === 'connector'));
    if (!items.length) return VP.toast('Bağlantı çizgilerinin etrafından dolaşacağı nesneleri seçin');
    const on = !items.every((it) => it.data.connWrap);
    items.forEach((it) => {
      if (on) it.data.connWrap = true;
      else delete it.data.connWrap;
    });
    K7.rebuildConnectors();
    VP.commit();
    VP.toast(on ? 'Bağlantı çizgileri bu nesnelerin etrafından dolaşır' : 'Bağlantı çizgisini sarma kapatıldı');
  };
  // connectors follow moved obstacles
  VP.on('change', () => {
    if (!paper.project) return;
    const any = paper.project.getItems({ match: (it) => it.data && it.data.connWrap }).length;
    if (!any || K7._rb) return;
    K7._rb = true;
    try {
      K7.rebuildConnectors();
    } finally {
      K7._rb = false;
    }
  });

  /* ================= Object hinting ================= */
  let tip = null;
  let last = 0;
  const cv = () => VP.panels2 && VP.panels2.conv;
  const colText = (hex) => {
    const c = cv();
    if (!hex) return 'Yok';
    if (!c) return hex;
    const n = parseInt(hex.slice(1), 16);
    const k = c.rgb2cmyk((n >> 16) & 255, (n >> 8) & 255, n & 255);
    return 'C' + k[0] + ' M' + k[1] + ' Y' + k[2] + ' K' + k[3];
  };
  const hideTip = () => tip && (tip.hidden = true);
  const showTip = (e) => {
    if (!S.objHints || VP.coarse && e.pointerType !== 'mouse') return;
    const now = performance.now();
    if (now - last < 60) return;
    last = now;
    const c = $('#canvas');
    const r = c.getBoundingClientRect();
    const pt = paper.view.viewToProject(Pt(e.clientX - r.left, e.clientY - r.top));
    const it = VP.hitItem(pt);
    if (!it) return hideTip();
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'k7-tip';
      document.body.appendChild(tip);
    }
    const f = VP.getFill(it);
    const s = VP.getStroke(it);
    const b = it.bounds;
    tip.innerHTML = '<b>' + esc(VP.describe(it)) + '</b> · ' + esc(it.layer ? it.layer.name : '') +
      '<br>' + VP.num(VP.toMM(b.width), 2) + ' × ' + VP.num(VP.toMM(b.height), 2) + ' mm' +
      '<br>Dolgu: ' + esc(f.type === 'none' ? 'Yok' : f.type === 'solid' ? colText(f.color) : 'Geçişli / özel') +
      '<br>Anahat: ' + esc(s.on && s.color ? colText(s.color) + ' · ' + (s.width <= VP.toPT(0.08) ? 'Saç teli' : VP.num(VP.toMM(s.width), 2) + ' mm') : 'Yok');
    tip.hidden = false;
    tip.style.left = Math.min(innerWidth - 230, e.clientX + 16) + 'px';
    tip.style.top = Math.min(innerHeight - 90, e.clientY + 18) + 'px';
  };
  const bindTips = () => {
    const c = $('#canvas');
    if (!c || c._k7) return;
    c._k7 = true;
    c.addEventListener('pointermove', (e) => (e.buttons ? hideTip() : showTip(e)));
    c.addEventListener('pointerleave', hideTip);
    c.addEventListener('pointerdown', hideTip);
  };

  /* ================= Desktop layer ================= */
  K7.desktopLayer = () => {
    let L = VP.userLayers().find((x) => x.data && x.data.desktop);
    if (L) {
      VP.setActiveLayer(L);
      return VP.toast('Masaüstü katmanı etkin');
    }
    VP.addLayer();
    L = VP.activeLayer;
    if (VP.docx && VP.docx.toggleMaster && !(L.data && L.data.master)) VP.docx.toggleMaster(L);
    L.name = 'Masaüstü';
    L.data.desktop = true;
    L.data.noPrint = true;
    VP.commit();
    UI.schedule('dock', 'status');
    VP.toast('Masaüstü katmanı: her sayfada görünür, yazdırılmaz ve dışa aktarılmaz');
  };

  /* ================= letter spacing in paragraph text ================= */
  // line breaking measures the extra space letter spacing adds, where the browser draws it
  const canSpace = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;
  if (VP.tx && VP.tx.measurer && canSpace) {
    const ms0 = VP.tx.measurer;
    VP.tx.measurer = (f) => {
      const m = ms0(f);
      if (!f || !f.track) return m;
      const add = (f.track / 1000) * f.size;
      const m2 = (s) => m(s) + add * Array.from(String(s)).length;
      m2.asc = m.asc;
      m2.desc = m.desc;
      return m2;
    };
  }

  /* ================= commands and menus ================= */
  Object.assign(A, {
    k7Focus: { label: 'Odağa getir', icon: 'search', enabled: () => VP.sel.length > 0 && !focus, run: () => K7.focus() },
    k7FocusExit: { label: 'Odaktan çık', enabled: () => !!focus, run: () => K7.exitFocus() },
    k7FrameEmpty: { label: 'Boş PowerClip çerçevesi oluştur', icon: 'powerclip', enabled: () => VP.sel.length > 0 && VP.sel.every(closedShape) && VP.sel.some((it) => !it.data.pcEmpty), run: () => { VP.sel.forEach((it) => (it.data.pcEmpty = true)); VP.commit(); VP.toast('Boş çerçeve · Resim yerleştirmek için sağ tık › Çerçeve türü › Çerçeveye resim yerleştir'); } },
    k7FramePlace: { label: 'Çerçeveye resim yerleştir…', icon: 'image', enabled: () => VP.sel.length === 1 && !!VP.sel[0].data.pcEmpty, run: () => K7.placeInFrame() },
    k7FrameNone: { label: 'Çerçeve yok', enabled: () => VP.sel.some((it) => it.data.pcEmpty), run: () => { VP.sel.forEach((it) => delete it.data.pcEmpty); VP.commit(); } },
    k7ConnWrap: { label: 'Bağlayıcı çizgiyi sar', icon: 'connRight', checked: () => VP.sel.length > 0 && VP.sel.every((it) => it.data.connWrap), enabled: () => VP.sel.length > 0, run: () => K7.toggleWrap() },
    k7Hints: { label: 'Nesne ipucu', checked: () => !!S.objHints, run: () => { S.objHints = !S.objHints; if (!S.objHints) hideTip(); try { VP.io.savePrefs(); } catch (e) { /* optional */ } VP.toast(S.objHints ? 'Nesne ipucu açık · İşaretçiyi bir nesnenin üzerinde tutun' : 'Nesne ipucu kapalı'); } },
    k7Desktop: { label: 'Masaüstü katmanı', icon: 'layers', run: () => K7.desktopLayer() }
  });
  ins('view', 'zoomSel', ['k7Focus', 'k7FocusExit']);
  ins('view', 'pencilOnly', ['k7Hints']);
  ins('object', 'pcFill', ['sub:Çerçeve türü|k7FrameEmpty,k7FramePlace,k7FrameNone', 'k7ConnWrap']);
  ins('layout', null, ['|', 'k7Desktop']);

  const css = document.createElement('style');
  css.textContent = [
    '#k7-focus{position:absolute;z-index:6;left:50%;top:8px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:4px 6px 4px 12px;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.25);font-size:12px}',
    '#k7-tip{position:fixed;z-index:9999;max-width:220px;padding:6px 8px;background:#1f1f1f;color:#e6e6e6;border:1px solid #444;border-radius:4px;font-size:11px;line-height:1.45;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.35)}'
  ].join('\n');
  document.head.appendChild(css);

  const start = () => bindTips();
  if (document.readyState === 'complete') setTimeout(start, 50);
  else addEventListener('load', () => setTimeout(start, 50));
})();
