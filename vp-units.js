/* VektörPad units of measure and ruler origin (written for this app).
   - Units: millimetres, centimetres, inches, points or pixels. The drawing is kept in points; every box
     that shows a length ("mm") in the property bar, dockers and dialogs is shown and read in the chosen
     unit, as are the rulers and the status bar. Chosen on the Pick tool's property bar (nothing selected)
     or in Tools › Options; kept with the document.
   - Ruler origin: drag from the ruler corner onto the page to put 0,0 there; double-tap the corner to reset.
   - Paste puts objects where they were copied (as in the desktop program); Duplicate uses the duplicate
     offset set on the property bar. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const S = VP.settings;
  const A = VP.actions;
  const $ = (q) => document.querySelector(q);
  const esc = UI.h.esc;
  const Pt = (x, y) => new paper.Point(x, y);
  const U = (VP.units = {});
  U.LIST = [['mm', 'mm', 'milimetre', 1, 2], ['cm', 'cm', 'santimetre', 10, 3], ['in', 'in', 'inç', 25.4, 3], ['pt', 'pt', 'punto', 25.4 / 72, 1], ['px', 'px', 'piksel', 25.4 / 96, 1]];
  const ext = () => (VP.ext ? VP.ext() : {});
  U.id = () => {
    const e = ext();
    const u = e.unit || S.unit || 'mm';
    return U.LIST.some((x) => x[0] === u) ? u : 'mm';
  };
  const row = () => U.LIST.find((x) => x[0] === U.id());
  U.label = () => row()[1];
  U.long = () => row()[2];
  U.f = () => row()[3]; // millimetres per unit
  U.dec = () => row()[4];
  U.origin = () => {
    const o = ext().origin;
    return o ? Pt(o[0], o[1]) : Pt(0, 0);
  };
  const scaled = () => VP.view2 && VP.view2.scaled && VP.view2.scaled();
  const plain = () => U.id() === 'mm' && U.origin().isZero();
  U.fmt = (mm, d) => VP.num(mm / U.f(), d == null ? U.dec() : d);
  U.set = (id) => {
    const e = ext();
    e.unit = id;
    S.unit = id;
    try {
      VP.io.savePrefs();
    } catch (er) { /* optional */ }
    VP.dirty && VP.dirty();
    refreshAll();
    VP.toast('Birim: ' + U.long());
  };

  /* ---------- length boxes everywhere ---------- */
  // absolute positions follow the ruler origin
  const ABS_X = ['x', 'k3AlX'];
  const ABS_Y = ['y', 'k3AlY'];
  const isMMField = (inp) => {
    const lab = inp.closest('.field, label');
    if (!lab) return false;
    const u = lab.querySelector('.unit');
    return !!(u && u.textContent.trim() === 'mm');
  };
  const convertIn = (inp) => {
    if (!inp || inp.dataset.vpU || inp.type === 'range' || inp.type === 'color' || inp.type === 'checkbox') return;
    if (scaled() || plain() || !isMMField(inp)) return;
    const v = VP.parseNum(inp.value);
    const lab = inp.closest('.field, label');
    const name = inp.dataset.pf || inp.dataset.dk || inp.id || '';
    let mm = v;
    const o = U.origin();
    if (ABS_X.includes(name)) mm -= VP.toMM(o.x);
    if (ABS_Y.includes(name)) mm -= VP.toMM(o.y);
    if (isFinite(v)) inp.value = U.fmt(mm);
    inp.dataset.vpU = ABS_X.includes(name) ? 'x' : ABS_Y.includes(name) ? 'y' : 'l';
    lab.querySelectorAll('.unit').forEach((u) => (u.textContent = U.label()));
  };
  const convertTree = (root) => {
    if (!root || !root.querySelectorAll || scaled() || plain()) return;
    root.querySelectorAll('input').forEach(convertIn);
  };
  // before any handler reads a typed value, it goes back to millimetres
  const back = (inp) => {
    const k = inp.dataset.vpU;
    if (!k) return;
    const v = VP.parseNum(inp.value);
    if (!isFinite(v)) return;
    let mm = v * U.f();
    const o = U.origin();
    if (k === 'x') mm += VP.toMM(o.x);
    if (k === 'y') mm += VP.toMM(o.y);
    inp.value = VP.num(mm, 4);
    delete inp.dataset.vpU;
    setTimeout(() => inp.isConnected && convertIn(inp), 0);
  };
  document.addEventListener('change', (e) => e.target && e.target.dataset && e.target.dataset.vpU && back(e.target), true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.vpU) back(e.target);
  }, true);
  // dialog "OK" buttons read their boxes on click: convert those boxes first
  document.addEventListener('click', (e) => {
    const m = e.target.closest && e.target.closest('.modal, .modal-wrap');
    if (!m || !e.target.closest('button')) return;
    m.querySelectorAll('input[data-vp-u]').forEach(back);
  }, true);
  let pending = false;
  const mo = new MutationObserver((list) => {
    if (pending) return;
    pending = true;
    Promise.resolve().then(() => {
      pending = false;
      list.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && (n.tagName === 'INPUT' ? convertIn(n) : convertTree(n))));
    });
  });

  /* ---------- status bar ---------- */
  const sp0 = UI.setPos;
  UI.setPos = function (pt) {
    if (scaled() || plain()) return sp0.apply(this, arguments);
    const o = U.origin();
    const el = $('#st-pos');
    if (el) el.textContent = 'x ' + U.fmt(VP.toMM(pt.x - o.x), 1) + '  y ' + U.fmt(VP.toMM(pt.y - o.y), 1) + ' ' + U.label();
  };
  const rs0 = UI.renderStatus;
  UI.renderStatus = function () {
    const r = rs0.apply(this, arguments);
    if (scaled() || U.id() === 'mm') return r;
    const info = $('#st-info');
    if (info) info.textContent = info.textContent.replace(/([\d.,]+) × ([\d.,]+) mm/, (m, a, b) => U.fmt(VP.parseNum(a)) + ' × ' + U.fmt(VP.parseNum(b)) + ' ' + U.label());
    return r;
  };

  /* ---------- rulers ---------- */
  const steps = [];
  for (let e = -3; e <= 6; e++) [1, 2, 5].forEach((m) => steps.push(m * Math.pow(10, e)));
  const dr0 = UI.drawRulers;
  UI.drawRulers = function () {
    const corner = $('#ruler-corner');
    const unitTag = $('#k6-unit');
    if (scaled()) return dr0.apply(this, arguments);
    if (plain()) {
      const r = dr0.apply(this, arguments);
      if (corner) corner.textContent = 'mm';
      if (unitTag) unitTag.textContent = 'milimetre';
      return r;
    }
    const stage = $('#stage');
    stage.classList.toggle('no-rulers', !S.rulers);
    if (corner) {
      corner.textContent = U.label();
      corner.title = 'Cetvel birimi: ' + U.long() + ' · Köşeden sürükleyin: sıfır noktası · Çift dokunun: sıfırla';
    }
    if (unitTag) unitTag.textContent = U.long();
    if (!S.rulers || !paper.view) return;
    const v = paper.view;
    const z = v.zoom;
    const vb = v.bounds;
    const ptPerU = VP.MM * U.f();
    const pxPerU = z * ptPerU;
    const minor = steps.find((st) => st * pxPerU >= 6) || steps[steps.length - 1];
    const major = steps.find((st) => st >= minor * 5 && st * pxPerU >= 48) || minor * 10;
    const cs = getComputedStyle(document.documentElement);
    const fg = cs.getPropertyValue('--muted').trim() || '#666';
    const dpr = window.devicePixelRatio || 1;
    const o = U.origin();
    const lab = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');
    const draw = (cv, horiz) => {
      if (!cv) return;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = fg;
      ctx.fillStyle = fg;
      ctx.lineWidth = 1;
      ctx.font = '9.5px "Fira Mono", ui-monospace, monospace';
      const o0 = horiz ? o.x : o.y;
      const lo = ((horiz ? vb.left : vb.top) - o0) / ptPerU;
      const hi = ((horiz ? vb.right : vb.bottom) - o0) / ptPerU;
      const start = horiz ? vb.left : vb.top;
      ctx.beginPath();
      for (let u = Math.floor(lo / minor) * minor; u <= hi; u += minor) {
        const p = Math.round((o0 + u * ptPerU - start) * z) + 0.5;
        const isMaj = Math.abs(u / major - Math.round(u / major)) < 1e-6;
        const isHalf = Math.abs((u * 2) / major - Math.round((u * 2) / major)) < 1e-6;
        const size = horiz ? h : w;
        const len = isMaj ? size * 0.62 : isHalf ? size * 0.38 : size * 0.22;
        if (horiz) {
          ctx.moveTo(p, h);
          ctx.lineTo(p, h - len);
          if (isMaj) ctx.fillText(lab(u), p + 3, 10);
        } else {
          ctx.moveTo(w, p);
          ctx.lineTo(w - len, p);
          if (isMaj) {
            ctx.save();
            ctx.translate(10, p + 3);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(lab(u), 0, 0);
            ctx.restore();
          }
        }
      }
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    draw($('#ruler-top'), true);
    draw($('#ruler-left'), false);
  };
  // ruler origin: drag from the corner
  const bindCorner = () => {
    const c = $('#ruler-corner');
    if (!c || c._vpU) return;
    c._vpU = true;
    c.style.touchAction = 'none';
    let lastTap = 0;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - lastTap < 380) {
        lastTap = 0;
        ext().origin = null;
        refreshAll();
        VP.toast('Sıfır noktası sayfanın sol üst köşesinde');
        return;
      }
      lastTap = now;
      c.setPointerCapture(e.pointerId);
      const up = (ev) => {
        c.removeEventListener('pointerup', up);
        const cv = $('#canvas');
        const r = cv.getBoundingClientRect();
        if (ev.clientX < r.left || ev.clientY < r.top || ev.clientX > r.right || ev.clientY > r.bottom) return;
        let p = paper.view.viewToProject(Pt(ev.clientX - r.left, ev.clientY - r.top));
        if (VP.snapPt) p = VP.snapPt(p);
        ext().origin = [p.x, p.y];
        VP.dirty && VP.dirty();
        refreshAll();
        VP.toast('Sıfır noktası taşındı · Köşeye çift dokunarak sıfırlayın');
      };
      c.addEventListener('pointerup', up);
    });
  };

  /* ---------- paste in place, duplicate offset ---------- */
  const dup = () => [S.dupX == null ? 5 : S.dupX, S.dupY == null ? 5 : S.dupY];
  VP.duplicate = () => {
    if (!VP.sel.length) return;
    const [dx, dy] = dup();
    const copies = VP.zSort(VP.sel).map((it) => {
      const c = VP.cloneItem(it);
      c.insertAbove(it);
      return c;
    });
    VP.T.move(copies, Pt(VP.toPT(dx), VP.toPT(dy)));
    VP.setSelection(copies);
    VP.commit();
  };
  VP.paste = () => {
    if (!VP.clipboard || !VP.clipboard.length) return VP.toast('Panoda nesne yok');
    VP.ensureLayer();
    const items = VP.clipboard.map((json) => VP.activeLayer.importJSON(json));
    VP.setSelection(items);
    VP.commit();
  };

  /* ---------- Pick tool bar with nothing selected: unit, nudge, duplicate offset ---------- */
  const rp0 = UI.renderPropbar;
  UI.renderPropbar = function () {
    const r = rp0.apply(this, arguments);
    const pb = $('#propbar');
    if (!pb || VP.toolId !== 'select' || VP.sel.length || pb.querySelector('.vpu-bar')) return r;
    const span = document.createElement('span');
    span.className = 'vpu-bar';
    span.innerHTML = '<span class="pb-sep"></span><label class="field" title="Ölçü birimi"><span>Birim</span><select data-vpunit="1" aria-label="Ölçü birimi">' +
      U.LIST.map(([id, l, long]) => '<option value="' + id + '"' + (id === U.id() ? ' selected' : '') + '>' + esc(long) + '</option>').join('') + '</select></label>' +
      '<label class="field" title="Ok tuşuyla kaydırma"><span>Kaydırma</span><input data-vpn="1" value="' + esc(U.fmt(S.nudgeMM || 1)) + '" inputmode="decimal" aria-label="Kaydırma uzaklığı"><span class="unit-u">' + esc(U.label()) + '</span></label>' +
      '<label class="field" title="Çoğaltma uzaklığı (yatay, dikey)"><span>Çoğaltma</span><input data-vpd="x" value="' + esc(U.fmt(dup()[0])) + '" inputmode="decimal" aria-label="Çoğaltma uzaklığı yatay" style="width:42px"><input data-vpd="y" value="' + esc(U.fmt(dup()[1])) + '" inputmode="decimal" aria-label="Çoğaltma uzaklığı dikey" style="width:42px"><span class="unit-u">' + esc(U.label()) + '</span></label>';
    pb.appendChild(span);
    return r;
  };
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || !t.dataset) return;
    if (t.dataset.vpunit) return U.set(t.value);
    const v = VP.parseNum(t.value);
    if (!isFinite(v)) return;
    if (t.dataset.vpn) S.nudgeMM = Math.max(0.001, v * U.f());
    else if (t.dataset.vpd === 'x') S.dupX = v * U.f();
    else if (t.dataset.vpd === 'y') S.dupY = v * U.f();
    else return;
    try {
      VP.io.savePrefs();
    } catch (er) { /* optional */ }
  });

  const refreshAll = () => {
    UI.drawRulers && UI.drawRulers();
    UI.schedule && UI.schedule('prop', 'dock', 'status');
  };
  A.unitMenu = {
    label: 'Ölçü birimi…',
    run: () => {
      const html = U.LIST.map(([id, l, long]) => '<button class="pop-item" data-pick="' + id + '"><span>' + esc(long) + ' (' + l + ')</span>' + (id === U.id() ? '<span class="check">✓</span>' : '') + '</button>').join('');
      UI.popover($('#ruler-corner') || document.body, '<div class="pop-head">Ölçü birimi</div>' + html, (id) => U.set(id));
    }
  };
  A.originReset = { label: 'Cetvel sıfır noktasını sıfırla', enabled: () => !U.origin().isZero(), run: () => { ext().origin = null; refreshAll(); } };
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };
  ins('view', 'rulers', ['unitMenu', 'originReset']);
  VP.on('doc', refreshAll);

  const start = () => {
    mo.observe(document.body, { childList: true, subtree: true });
    convertTree(document.body);
    bindCorner();
    refreshAll();
  };
  if (document.readyState === 'complete') setTimeout(start, 20);
  else addEventListener('load', () => setTimeout(start, 20));
})();
