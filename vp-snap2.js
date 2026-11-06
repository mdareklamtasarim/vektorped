/* VektörPad snapping and dynamic guides as in the desktop program (written for this app):
   - Snap modes added to Snap to: page (corners, edge middles, centre), segment midpoints, intersections of
     objects, whole pixels; a snap threshold; a small marker names what the pointer snapped to.
   - Dynamic guides: lines at 0°, 45°, 90° and 135° (and 30°/60° steps when chosen) run out from the snap
     points of nearby objects; the pointer snaps onto them and the distance and angle are shown.
   - Bleed: a document bleed amount shown as a dashed frame around the page (View › Show bleed). */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const S = VP.settings;
  const A = VP.actions;
  const $ = (q) => document.querySelector(q);
  const Pt = (x, y) => new paper.Point(x, y);
  const zoom = () => paper.view.zoom;
  const tolPx = () => S.snapTol || (VP.coarse ? 12 : 8);
  const ext = () => (VP.ext ? VP.ext() : {});
  let hint = null;

  const nearbyItems = (pt, r) => {
    const out = [];
    VP.userLayers().forEach((L) => {
      if (!L.visible) return;
      L.children.forEach((it) => {
        if (!it.visible || VP.sel.includes(it) || (VP.snapExclude && VP.snapExclude.includes(it))) return;
        if (it.bounds.expand(r * 2).contains(pt)) out.push(it);
      });
    });
    return out.slice(0, 16);
  };
  const pathsOf = (it) => {
    const out = [];
    const walk = (x) => {
      if (x instanceof paper.Path) out.push(x);
      else if (x.children && !(x instanceof paper.PointText)) x.children.forEach(walk);
    };
    walk(it);
    return out.filter((p) => p.segments.length <= 300);
  };
  const candidates = (pt, tol) => {
    const c = [];
    const add = (p, label) => p && c.push({ p, label, d: p.getDistance(pt) });
    if (S.snapPage) {
      const r = VP.pageRect();
      [[r.topLeft, 'sayfa köşesi'], [r.topRight, 'sayfa köşesi'], [r.bottomLeft, 'sayfa köşesi'], [r.bottomRight, 'sayfa köşesi'], [r.topCenter, 'sayfa kenarı ortası'], [r.bottomCenter, 'sayfa kenarı ortası'], [r.leftCenter, 'sayfa kenarı ortası'], [r.rightCenter, 'sayfa kenarı ortası'], [r.center, 'sayfa ortası']].forEach(([p, l]) => add(p, l));
      // along the page edges
      if (Math.abs(pt.x - r.left) < tol) add(Pt(r.left, pt.y), 'sayfa kenarı');
      if (Math.abs(pt.x - r.right) < tol) add(Pt(r.right, pt.y), 'sayfa kenarı');
      if (Math.abs(pt.y - r.top) < tol) add(Pt(pt.x, r.top), 'sayfa kenarı');
      if (Math.abs(pt.y - r.bottom) < tol) add(Pt(pt.x, r.bottom), 'sayfa kenarı');
    }
    if (S.snapMid || S.snapInter) {
      const items = nearbyItems(pt, tol);
      if (S.snapMid) items.forEach((it) => pathsOf(it).forEach((p) => p.curves.forEach((cv) => {
        const m = cv.getPointAtTime(0.5);
        if (m.getDistance(pt) < tol * 3) add(m, 'orta nokta');
      })));
      if (S.snapInter && items.length > 0) {
        const ps = [];
        items.forEach((it) => pathsOf(it).forEach((p) => ps.push(p)));
        for (let i = 0; i < ps.length && i < 24; i++) {
          for (let j = i + 1; j < ps.length && j < 24; j++) {
            if (!ps[i].bounds.intersects(ps[j].bounds)) continue;
            try {
              ps[i].getIntersections(ps[j]).forEach((x) => x.point.getDistance(pt) < tol * 2 && add(x.point, 'kesişim'));
            } catch (e) { /* skip */ }
          }
        }
      }
    }
    if (S.snapPixels) {
      const px = 0.75;
      add(Pt(Math.round(pt.x / px) * px, Math.round(pt.y / px) * px), 'piksel');
    }
    return c;
  };
  // dynamic guides from object snap points
  const dynamic = (pt, tol) => {
    if (!S.dynGuides) return null;
    const angles = S.dynStep === 30 ? [0, 30, 60, 90, 120, 150] : [0, 45, 90, 135];
    const anchors = [];
    nearbyItems(pt, 400 / zoom()).forEach((it) => {
      const b = it.bounds;
      [b.topLeft, b.topRight, b.bottomLeft, b.bottomRight, b.center, b.topCenter, b.bottomCenter, b.leftCenter, b.rightCenter].forEach((p) => anchors.push(p));
    });
    let best = null;
    anchors.forEach((a) => {
      const v = pt.subtract(a);
      if (v.length < tol * 2) return;
      angles.forEach((ang) => {
        const dir = Pt(1, 0).rotate(ang);
        const proj = a.add(dir.multiply(v.dot(dir)));
        const d = proj.getDistance(pt);
        if (d < tol && (!best || d < best.d)) best = { p: proj, d, a, ang };
      });
    });
    return best;
  };
  const snap0 = VP.snapPt;
  VP.snapPt = function (pt) {
    let q = snap0.apply(this, arguments);
    const tol = tolPx() / zoom();
    hint = null;
    const base = q.getDistance(pt) > 1e-6 ? { p: q, d: q.getDistance(pt) } : null;
    let best = base && base.d < tol ? base : null;
    candidates(pt, tol).forEach((c) => {
      if (c.d < tol && (!best || c.d < best.d - 1e-6)) best = c;
    });
    if (best && best !== base) {
      q = best.p.clone();
      hint = { p: q, label: best.label, t: performance.now() };
    } else if (best) hint = { p: q, label: '', t: performance.now() };
    if (!best || best === base) {
      const dg = dynamic(pt, tol);
      if (dg) {
        q = dg.p;
        const dist = VP.units ? VP.units.fmt(VP.toMM(dg.p.getDistance(dg.a)), 2) + ' ' + VP.units.label() : VP.num(VP.toMM(dg.p.getDistance(dg.a)), 2) + ' mm';
        hint = { p: q, label: dist + ' · ' + Math.round(((dg.p.subtract(dg.a).angle % 360) + 360) % 360 === 0 ? 0 : (360 - dg.p.subtract(dg.a).angle) % 360) + '°', t: performance.now(), guide: dg };
      }
    }
    return q;
  };
  VP.overlayHooks = VP.overlayHooks || [];
  VP.overlayHooks.push((L) => {
    if (!hint || performance.now() - hint.t > 800) return;
    const s = 1 / zoom();
    const col = new paper.Color('#1e78ff');
    if (hint.guide) {
      const g = hint.guide;
      const dir = hint.p.subtract(g.a).normalize();
      L.addChild(new paper.Path.Line({ from: g.a.subtract(dir.multiply(2000 * s)), to: g.a.add(dir.multiply(4000 * s)), strokeColor: col, strokeWidth: s, dashArray: [4 * s, 3 * s], insert: false }));
    }
    if (hint.label) {
      L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(hint.p.subtract(Pt(3.5 * s, 3.5 * s)), new paper.Size(7 * s, 7 * s)), strokeColor: col, strokeWidth: 1.2 * s, insert: false }));
      L.addChild(new paper.PointText({ point: hint.p.add(Pt(8 * s, -8 * s)), content: hint.label, fontFamily: 'Fira Sans', fontSize: 11 * s, fillColor: col, insert: false }));
    }
  });

  /* ---------- bleed ---------- */
  VP.overlayHooks.push((L) => {
    if (!S.showBleed) return;
    const s = 1 / zoom();
    const bl = VP.toPT(ext().bleed == null ? 3 : ext().bleed);
    if (!(bl > 0)) return;
    L.insertChild(0, new paper.Path.Rectangle({ rectangle: VP.pageRect().expand(bl * 2), strokeColor: '#e0342b', strokeWidth: s, dashArray: [4 * s, 3 * s], insert: false }));
  });

  /* ---------- commands and the Snap to list ---------- */
  const tog = (key, label, after) => ({ label, checked: () => !!S[key], run: () => { S[key] = !S[key]; try { VP.io.savePrefs(); } catch (e) { /* optional */ } UI.renderTop && UI.renderTop(); if (after) after(); VP.drawOverlay(); } });
  Object.assign(A, {
    snapPage: tog('snapPage', 'Sayfaya yakala'),
    snapMid: tog('snapMid', 'Orta noktalara yakala'),
    snapInter: tog('snapInter', 'Kesişimlere yakala'),
    snapPixels: tog('snapPixels', 'Piksellere yakala'),
    dynGuides: Object.assign(tog('dynGuides', 'Dinamik kılavuzlar'), { kbd: 'Alt+Shift+D' }),
    showBleed: tog('showBleed', 'Taşma payını göster'),
    bleedSet: {
      label: 'Taşma payı…',
      run: async () => {
        const v = await UI.prompt({ title: 'Taşma payı', label: 'Sayfanın her kenarında taşma payı (mm)', value: VP.num(ext().bleed == null ? 3 : ext().bleed, 2) });
        const n = VP.parseNum(v);
        if (isFinite(n) && n >= 0) {
          ext().bleed = n;
          S.showBleed = true;
          VP.dirty && VP.dirty();
          VP.drawOverlay();
        }
      }
    },
    snapTolerance: {
      label: 'Yakalama eşiği…',
      run: async () => {
        const v = await UI.prompt({ title: 'Yakalama eşiği', label: 'Ekranda kaç piksel yaklaşınca yakalasın', value: String(tolPx()) });
        const n = VP.parseNum(v);
        if (n >= 2 && n <= 60) {
          S.snapTol = n;
          try {
            VP.io.savePrefs();
          } catch (e) { /* optional */ }
        }
      }
    }
  });
  const SNAP_LIST = ['snap', 'snapGuides', 'snapObjects', 'snapPage', 'snapMid', 'snapInter', 'snapPixels', '|', 'dynGuides', 'alignGuides', '|', 'snapTolerance'];
  const btn = $('#btn-snap');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      UI.popover(btn, '<div class="pop-head">Yakala</div>' + UI.menuHTML(SNAP_LIST.filter((x) => x === '|' || A[x])), (id) => UI.run(id));
    }, true);
  }
  const rt0 = UI.renderTop;
  UI.renderTop = function () {
    const r = rt0.apply(this, arguments);
    const b = $('#btn-snap');
    if (b) {
      const n = ['snap', 'snapGuides', 'snapObjects', 'snapPage', 'snapMid', 'snapInter', 'snapPixels', 'dynGuides'].filter((k) => S[k]).length;
      const t = b.querySelector('.sb-snap-n, span');
      const lab = b.lastChild && b.lastChild.nodeType === 3 ? b.lastChild : null;
      if (lab) lab.textContent = lab.textContent.replace(/\(\d+\)/, '(' + n + ')');
      else if (t && /\(\d+\)/.test(t.textContent)) t.textContent = t.textContent.replace(/\(\d+\)/, '(' + n + ')');
      b.classList.toggle('on', n > 0);
    }
    return r;
  };
  const V = UI.MENUS.view;
  if (V && !V.includes('snapPage')) {
    const i = V.indexOf('snapObjects');
    V.splice(i >= 0 ? i + 1 : V.length, 0, 'snapPage', 'snapMid', 'snapInter', 'snapPixels', 'dynGuides', 'snapTolerance', '|', 'showBleed', 'bleedSet');
  }
  addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'D' || e.key === 'd') && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      UI.run('dynGuides');
      VP.toast(S.dynGuides ? 'Dinamik kılavuzlar açık' : 'Dinamik kılavuzlar kapalı');
    }
  }, true);
})();
