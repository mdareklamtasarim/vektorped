/* VektörPad, CorelDRAW 2026 look and behaviour: features part.
   Commands of CorelDRAW's menus and right-click menu that VektörPad did not have, registered in VP.actions
   under 'c_' + slug of Corel's Turkish caption (VP.cSlug). Commands that VektörPad already had get a 'c_'
   alias with Corel's caption, so a menu built from Corel's captions finds every command.
   Contents: view modes (wireframe, normal, enhanced, pixels), focus mode, outline to object, symmetry,
   paste in view / paste special, fit objects to path, page commands with dialogs, page numbering settings,
   page border / bleed / printable area / pixel and baseline grids, alignment and dynamic guides, object
   hints, overprint flags and simulation, text dialogs (tabs, columns, bullets, drop cap, formatting codes),
   table split, templates, recent documents, revert, send (share sheet), pointillizer, grommets. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const H = UI.h;
  const esc = H.esc;
  const S = VP.settings;
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const $ = (s, r = document) => r.querySelector(s);
  const hasSel = () => VP.sel.length > 0;
  const zoom = () => (paper.view ? paper.view.zoom : 1);
  const num = (v, d = 2) => VP.num(v, d);

  /* =============== ids =============== */
  const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  const slug = (s) => String(s).toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => TR[c]).replace(/[^a-z0-9]/g, '');
  VP.cSlug = slug;
  VP.cId = (caption) => 'c_' + slug(caption);
  const C = {}; // id -> caption of everything this file registers
  const def = (caption, spec) => {
    const id = 'c_' + slug(caption);
    A[id] = Object.assign({ label: caption }, spec);
    C[id] = caption;
    return id;
  };
  // Corel caption for a command VektörPad already has
  const alias = (caption, target, extra) => {
    const id = 'c_' + slug(caption);
    const t = A[target];
    if (!t || A[id]) return null;
    const a = { label: caption, alias: target, run: (...r) => A[target].run(...r) };
    if (t.icon) a.icon = t.icon;
    if (t.kbd) a.kbd = t.kbd;
    if (t.enabled) a.enabled = () => !A[target].enabled || A[target].enabled();
    if (t.checked) a.checked = () => A[target].checked();
    A[id] = Object.assign(a, extra || {});
    C[id] = caption;
    return id;
  };
  const savePrefs = () => VP.io && VP.io.savePrefs && VP.io.savePrefs();
  const redraw = () => {
    if (!paper.project) return;
    VP.drawOverlay();
    paper.view._needsUpdate = true;
    paper.view.update();
  };
  const info = (title, html) =>
    UI.modal('<h2>' + esc(title) + '</h2>' + html + '<div class="actions"><button class="btn primary" data-x="ok">Tamam</button></div>', (root, close) => root.addEventListener('click', (e) => e.target.closest('[data-x]') && close()));
  // small dialog helper: fields [{k, label, type:'num'|'sel'|'chk'|'text', value, unit, items}], onOk(values)
  const dialog = (title, fields, onOk, opts = {}) => {
    const row = (f) => {
      if (f.type === 'html') return f.html;
      if (f.type === 'chk') return '<div class="row"><label class="field c-chk"><input type="checkbox" data-k="' + f.k + '"' + (f.value ? ' checked' : '') + '><span>' + esc(f.label) + '</span></label></div>';
      if (f.type === 'sel') return '<div class="row"><label class="field wide"><span>' + esc(f.label) + '</span><select data-k="' + f.k + '">' + f.items.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(f.value) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label></div>';
      if (f.type === 'seg') return '<div class="row"><span class="opt-label">' + esc(f.label) + '</span><span class="seg" data-seg="' + f.k + '">' + f.items.map(([v, l]) => '<button type="button" data-v="' + esc(v) + '" class="' + (String(v) === String(f.value) ? 'on' : '') + '">' + esc(l) + '</button>').join('') + '</span></div>';
      const im = f.type === 'num' ? ' inputmode="decimal"' : '';
      return '<div class="row"><label class="field wide"><span>' + esc(f.label) + '</span><input data-k="' + f.k + '" value="' + esc(f.value == null ? '' : f.value) + '"' + im + ' spellcheck="false" style="width:' + (f.w || (f.type === 'num' ? 90 : 220)) + 'px">' + (f.unit ? '<span class="unit">' + esc(f.unit) + '</span>' : '') + '</label></div>';
    };
    UI.modal(
      '<h2>' + esc(title) + '</h2><div class="c-dlg">' + fields.map(row).join('') + '</div>' + (opts.note ? '<p class="sec-note">' + opts.note + '</p>' : '') +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">' + esc(opts.ok || 'Tamam') + '</button></div>',
      (root, close) => {
        root.addEventListener('click', (e) => {
          const sb = e.target.closest('[data-seg] button');
          if (sb) {
            sb.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === sb));
            return;
          }
          const b = e.target.closest('[data-x]');
          if (!b) return;
          if (b.dataset.x !== 'yes') return close();
          const vals = {};
          fields.forEach((f) => {
            if (!f.k) return;
            if (f.type === 'seg') {
              const on = root.querySelector('[data-seg="' + f.k + '"] .on');
              vals[f.k] = on ? on.dataset.v : f.value;
              return;
            }
            const el = root.querySelector('[data-k="' + f.k + '"]');
            if (!el) return;
            if (f.type === 'chk') vals[f.k] = el.checked;
            else if (f.type === 'num') vals[f.k] = VP.parseNum(el.value);
            else vals[f.k] = el.value;
          });
          if (onOk(vals) !== false) close();
        });
        root.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target.tagName === 'INPUT') root.querySelector('[data-x="yes"]').click();
        });
        setTimeout(() => {
          const f = root.querySelector('input:not([type=checkbox]),select');
          if (f && !VP.coarse) f.focus();
        }, 30);
      }
    );
  };
  const userItems = (fn) => VP.userLayers().forEach((L) => L.getItems({ recursive: true, match: () => true }).forEach(fn));

  /* ======================================================================
     VIEW STATE: view modes, focus mode, overprint simulation (one draw hook)
     ====================================================================== */
  const V = (VP.cview = { mode: S.c_viewMode || 'enhanced', focus: null, simOP: false });
  const WIRE = () => new paper.Color('#1d1d1b');
  const inUser = (it) => {
    const L = it.getLayer && it.getLayer();
    return !!(L && !VP.isSys(L) && L !== VP.uiLayer && L !== VP.bgLayer);
  };
  // focus helpers
  const focusAlive = () => {
    const f = V.focus;
    if (!f) return false;
    if (f.root) return !!(f.root.parent && f.root.isInserted && f.root.isInserted());
    return f.set.some((it) => it.parent && it.isInserted && it.isInserted());
  };
  const dimmed = (it) => {
    const f = V.focus;
    const p = it._parent;
    if (!p) return false;
    if (f.root) {
      if (it === f.root || p === f.root) return false;
      if (!(p instanceof paper.Layer ? !VP.isSys(p) : p.isAncestor(f.root))) return false;
      return !it.isAncestor(f.root);
    }
    if (!(p instanceof paper.Layer) || VP.isSys(p)) return false;
    return !f.set.includes(it);
  };
  const IP = paper.Item.prototype;
  const draw0 = IP.draw;
  IP.draw = function (ctx, param, psm) {
    if (!V.focus && !V.simOP) return draw0.call(this, ctx, param, psm);
    let op = null;
    let bm = null;
    try {
      if (V.focus && !param.clip && dimmed(this)) {
        op = this._opacity;
        this._opacity = op * 0.28;
      }
      const d = this._data;
      if (V.simOP && d && (d.c_opFill || d.c_opLine || d.c_opBmp) && !param.clip) {
        bm = this._blendMode;
        this._blendMode = 'multiply';
      }
      return draw0.call(this, ctx, param, psm);
    } finally {
      if (op != null) this._opacity = op;
      if (bm != null) this._blendMode = bm;
    }
  };
  // wireframe: every path and text is drawn as a hairline, bitmaps as a box
  const wireStyle = {
    hasFill: () => false,
    hasStroke: () => true,
    getDashArray: () => [],
    getShadowColor: () => null,
    hasShadow: () => false
  };
  [paper.Path, paper.CompoundPath, paper.PointText, paper.Shape].forEach((K) => {
    if (!K) return;
    const orig = K.prototype._draw;
    K.prototype._draw = function (ctx, param, vm, sm) {
      if (V.mode !== 'wire' || param.clip || !inUser(this)) return orig.call(this, ctx, param, vm, sm);
      const st = this._style;
      const m = ctx.getTransform ? ctx.getTransform() : { a: zoom(), b: 0 };
      const sc = Math.hypot(m.a, m.b) || 1;
      const col = WIRE();
      const keys = Object.assign({}, wireStyle, { getStrokeColor: () => col, getStrokeWidth: () => 1 / sc, getStrokeScaling: () => true });
      const data = this._data;
      Object.keys(keys).forEach((k) => (st[k] = keys[k]));
      this._data = null;
      try {
        return orig.call(this, ctx, param, vm, sm);
      } finally {
        this._data = data;
        Object.keys(keys).forEach((k) => delete st[k]);
      }
    };
  });

  // Render underline for PointText if data.underline is set
  {
    const origPtDraw = paper.PointText.prototype._draw;
    paper.PointText.prototype._draw = function (ctx, param, vm, sm) {
      const res = origPtDraw.call(this, ctx, param, vm, sm);
      if (this._data && this._data.underline && !param.clip) {
        ctx.save();
        const b = this.bounds;
        const fs = this.fontSize || 12;
        const uY = b.bottom - fs * 0.1;
        const lw = Math.max(1, fs * 0.07);
        ctx.lineWidth = lw;
        ctx.strokeStyle = (this.fillColor && this.fillColor.toCSS && this.fillColor.toCSS(true)) || '#000000';
        ctx.beginPath();
        ctx.moveTo(b.left, uY);
        ctx.lineTo(b.right, uY);
        ctx.stroke();
        ctx.restore();
      }
      return res;
    };
  }
  {
    const R = paper.Raster.prototype;
    const orig = R._draw;
    R._draw = function (ctx, param, vm, sm) {
      if (V.mode === 'normal' && inUser(this) && !param.clip) {
        const s0 = this._smoothing;
        this._smoothing = typeof s0 === 'string' ? 'off' : false;
        try {
          return orig.call(this, ctx, param, vm, sm);
        } finally {
          this._smoothing = s0;
        }
      }
      if (V.mode !== 'wire' || !inUser(this) || param.clip) return orig.call(this, ctx, param, vm, sm);
      const m = ctx.getTransform ? ctx.getTransform() : { a: zoom(), b: 0 };
      const sc = Math.hypot(m.a, m.b) || 1;
      const s = this.getSize();
      ctx.save();
      ctx.lineWidth = 1 / sc;
      ctx.strokeStyle = WIRE().toCSS(true);
      ctx.strokeRect(-s.width / 2, -s.height / 2, s.width, s.height);
      ctx.beginPath();
      ctx.moveTo(-s.width / 2, -s.height / 2);
      ctx.lineTo(s.width / 2, s.height / 2);
      ctx.moveTo(s.width / 2, -s.height / 2);
      ctx.lineTo(-s.width / 2, s.height / 2);
      ctx.stroke();
      ctx.restore();
    };
  }
  // pixel view: the canvas is drawn at one canvas pixel per document pixel (96 dpi) and enlarged without smoothing
  const applyPixel = () => {
    const v = paper.view;
    if (!v) return;
    const cv = v.element;
    const dpr = window.devicePixelRatio || 1;
    let pr = dpr;
    if (V.mode === 'pixel') pr = clamp(96 / (72 * v.zoom), 0.02, dpr);
    if (Math.abs((v._pixelRatio || dpr) - pr) > 1e-4) {
      v._pixelRatio = pr;
      const sz = v.getViewSize();
      // resizing the canvas resets its context; paper scales it again by the new ratio
      v._setElementSize(sz.width, sz.height);
      cv.style.width = sz.width + 'px';
      cv.style.height = sz.height + 'px';
    }
    cv.style.imageRendering = V.mode === 'pixel' && pr < dpr ? 'pixelated' : '';
    redraw();
  };
  VP.on('view', () => V.mode === 'pixel' && applyPixel());
  window.addEventListener('resize', () => V.mode === 'pixel' && setTimeout(applyPixel, 60));
  const setMode = (m) => {
    const was = V.mode;
    V.mode = m;
    S.c_viewMode = m;
    savePrefs();
    if (was === 'pixel' || m === 'pixel') applyPixel();
    redraw();
    UI.schedule && UI.schedule('top', 'status');
    VP.toast({ wire: 'Tel ızgara görünümü · Nesneler yalnız anahatlarıyla', normal: 'Normal görünüm · Biteşlemler yumuşatılmadan', enhanced: 'Gelişmiş görünüm', pixel: 'Piksel görünümü · 96 dpi piksel olarak' }[m]);
  };
  def('Tel Izgara', { checked: () => V.mode === 'wire', run: () => setMode('wire') });
  def('Normal', { checked: () => V.mode === 'normal', run: () => setMode('normal') });
  def('Gelişmiş', { checked: () => V.mode === 'enhanced', run: () => setMode('enhanced') });
  def('Piksel', { checked: () => V.mode === 'pixel', run: () => setMode('pixel') });

  /* =============== focus mode (Odağa Getir) =============== */
  const isSel0 = VP.isSelectable;
  const top0 = VP.topLevel;
  const all0 = VP.allSelectable;
  VP.isSelectable = (it) => {
    if (!isSel0(it)) return false;
    if (!V.focus) return true;
    if (!focusAlive()) {
      exitFocus(true);
      return true;
    }
    const f = V.focus;
    if (f.root) return f.root.isAncestor(it);
    return f.set.includes(top0(it));
  };
  VP.topLevel = (it) => {
    const f = V.focus;
    if (f && f.root && it && f.root.isAncestor(it)) {
      while (it.parent && it.parent !== f.root) it = it.parent;
      return it;
    }
    return top0(it);
  };
  VP.allSelectable = () => {
    const f = V.focus;
    if (!f || !focusAlive()) return all0();
    if (f.root) return f.root.children.filter((c) => c.visible && !c.locked && !c.clipMask && !(c.data && (c.data.c_symAxis || c.data.c_symMirror || c.data.pcEditGuide)));
    return all0().filter((it) => f.set.includes(it));
  };
  const banner = () => {
    let b = $('#c-focus-bar');
    if (!V.focus) {
      if (b) b.remove();
      return;
    }
    if (!b) {
      b = document.createElement('div');
      b.id = 'c-focus-bar';
      b.setAttribute('role', 'status');
      const host = $('#canvas-wrap') || document.body;
      host.appendChild(b);
      b.addEventListener('click', (e) => e.target.closest('button') && exitFocus());
    }
    b.innerHTML = '<span>' + esc(V.focus.title) + '</span><button type="button" class="btn">' + esc(V.focus.btnLabel || 'Odak Modundan Çık') + '</button>';
  };
  const enterFocus = (spec) => {
    V.focus = spec;
    if (spec.pcGroup) {
      VP.cFocus.isEditingPC = true;
      VP.cFocus.activePC = spec.pcGroup;
    }
    VP.clearSelection();
    if (spec.root) {
      const kids = VP.allSelectable();
      if (kids.length) VP.setSelection(kids);
    } else VP.setSelection(spec.set.slice());
    banner();
    redraw();
    UI.schedule && UI.schedule('prop', 'bar');
  };
  const exitFocus = (silent) => {
    if (!V.focus) return;
    const f = V.focus;
    if (f.onExit) f.onExit();
    V.focus = null;
    VP.cFocus.isEditingPC = false;
    VP.cFocus.activePC = null;
    banner();
    const back = f.pcGroup || (f.root ? top0(f.root) : null);
    if (!silent) {
      if (back && back.parent) VP.setSelection([back]);
      else VP.drawOverlay();
    }
    redraw();
    UI.schedule && UI.schedule('prop', 'bar');
  };
  VP.cFocus = { enter: enterFocus, exit: exitFocus };
  def('Odağa Getir', {
    icon: 'eye',
    enabled: hasSel,
    run: () => {
      const s = VP.sel.slice();
      if (s.length === 1 && s[0].data && s[0].data.c_sym) {
        const src = s[0].children.find((c) => c.data && c.data.c_symSrc);
        if (src) return enterFocus({ root: src, title: 'Simetri düzenleniyor · Yansıma kendiliğinden güncellenir' });
      }
      if (s.length === 1 && s[0] instanceof paper.Group && !(VP.fx && VP.fx.isFx(s[0])) && s[0].children.length) {
        return enterFocus({ root: s[0], title: 'Odak modu · ' + VP.describe(s[0]) + ' içindeki nesneler düzenleniyor' });
      }
      enterFocus({ set: s, title: 'Odak modu · Yalnız ' + s.length + ' nesne düzenlenebilir' });
    }
  });
  def('Odak Modundan Çık', { kbd: 'Shift+Esc', enabled: () => !!V.focus, run: () => exitFocus() });
  VP.on('page', () => exitFocus(true));
  VP.on('doc', () => exitFocus(true));
  const restore0 = VP.restore;
  VP.restore = function (s) {
    const r = restore0.apply(this, arguments);
    if (V.focus && !focusAlive()) exitFocus(true);
    return r;
  };

  /* =============== overprint flags and simulation =============== */
  const flagToggle = (key, test, what) => ({
    enabled: () => VP.sel.some(test),
    checked: () => VP.sel.length > 0 && VP.sel.filter(test).every((it) => it.data && it.data[key]),
    run: () => {
      const items = VP.sel.filter(test);
      const on = !items.every((it) => it.data[key]);
      items.forEach((it) => {
        if (on) it.data[key] = true;
        else delete it.data[key];
      });
      VP.commit();
      redraw();
      VP.toast(what + (on ? ' üzerine yazdırılacak' : ' üzerine yazdırma kapalı') + (V.simOP ? '' : ' · Görmek için Görünüm › Üzerine Yazdırmaları Simüle Et'));
    }
  });
  const hasFill = (it) => !(it instanceof paper.Raster);
  def('Dolguyu Üzerine Yazdır', flagToggle('c_opFill', hasFill, 'Dolgu'));
  def('Anahattı Üzerine Yazdır', flagToggle('c_opLine', hasFill, 'Anahat'));
  def('Biteşlemi Üzerine Yazdır', flagToggle('c_opBmp', (it) => it instanceof paper.Raster, 'Biteşlem'));
  def('Üzerine Yazdırmaları Simüle Et', {
    checked: () => V.simOP,
    run: () => {
      V.simOP = !V.simOP;
      redraw();
    }
  });

  /* ======================================================================
     OBJECT COMMANDS
     ====================================================================== */
  /* ---------- outline to object ---------- */
  const rot90 = (v) => Pt(-v.y, v.x);
  const strip = (pts, h) => {
    // pts: [{p, n}] sampled along a piece; returns a closed polygon
    const left = pts.map((q) => q.p.add(q.n.multiply(h)));
    const right = pts.map((q) => q.p.subtract(q.n.multiply(h))).reverse();
    return new paper.Path({ segments: left.concat(right), closed: true, insert: false });
  };
  const samplePiece = (path, s0, s1) => {
    const L = s1 - s0;
    const out = [];
    // tangents are read just inside the piece, so a corner at either end does not turn the strip
    const eps = Math.min(1e-3, L / 4);
    const push = (s) => {
      const p = path.getPointAt(s);
      const t = path.getTangentAt(clamp(s, s0 + eps, s1 - eps));
      if (p && t) out.push({ p, n: rot90(t.normalize()) });
    };
    // straight curves need only their ends, curved ones a sample every ~0.6 pt (max 400)
    const n = clamp(Math.ceil(L / 0.6), 1, 400);
    const straight = path.curves.every((c) => c.isStraight());
    if (straight) {
      push(s0);
      push(s1);
      return out;
    }
    for (let i = 0; i <= n; i++) push(s0 + (L * i) / n);
    return out;
  };
  const joinPiece = (P, ta, tb, h, join, miter) => {
    if (join === 'round') return new paper.Path.Circle({ center: P, radius: h, insert: false });
    const na = rot90(ta);
    const nb = rot90(tb);
    const turn = ta.getDirectedAngle(tb);
    if (Math.abs(turn) < 0.5) return null;
    const s = turn > 0 ? -1 : 1; // outer side
    const Aa = P.add(na.multiply(h * s));
    const Bb = P.add(nb.multiply(h * s));
    const pts = [P, Aa];
    if (join === 'miter') {
      const phi = 180 - Math.abs(turn); // interior angle
      const ratio = 1 / Math.sin(((phi / 2) * Math.PI) / 180);
      if (ratio <= (miter || 10)) {
        const dir = Aa.subtract(P).add(Bb.subtract(P)).normalize();
        const len = h / Math.cos(((Math.abs(turn) / 2) * Math.PI) / 180);
        pts.push(P.add(dir.multiply(len)));
      }
    }
    pts.push(Bb);
    return new paper.Path({ segments: pts, closed: true, insert: false });
  };
  const capPiece = (P, t, h, cap) => {
    if (cap === 'round') return new paper.Path.Circle({ center: P, radius: h, insert: false });
    if (cap === 'square') {
      const n = rot90(t);
      return new paper.Path({ segments: [P.add(n.multiply(h)), P.add(n.multiply(h)).add(t.multiply(h)), P.subtract(n.multiply(h)).add(t.multiply(h)), P.subtract(n.multiply(h))], closed: true, insert: false });
    }
    return null;
  };
  const uniteAll = (parts) => {
    parts = parts.filter(Boolean);
    if (!parts.length) return null;
    let acc = parts[0];
    for (let i = 1; i < parts.length; i++) {
      try {
        const r = acc.unite(parts[i], { insert: false });
        if (r) acc = r;
      } catch (e) {
        /* skip a piece the boolean engine cannot handle */
      }
    }
    return acc;
  };
  // the area covered by the stroke of a single open or closed Path
  const strokeArea = (path, w, cap, join, miter, dash) => {
    const h = w / 2;
    const L = path.length;
    if (!(L > 0) || !(h > 0)) return null;
    const parts = [];
    const pieces = [];
    if (dash && dash.length && dash.some((x) => x > 0)) {
      const pat = dash.length % 2 ? dash.concat(dash) : dash.slice();
      let s = 0;
      let i = 0;
      let guard = 0;
      while (s < L && guard++ < 4000) {
        const on = pat[i % pat.length] * 1;
        const off = pat[(i + 1) % pat.length] * 1;
        const e = Math.min(L, s + Math.max(on, 0.01));
        pieces.push([s, e, true]);
        s = e + off;
        i += 2;
      }
    } else pieces.push([0, L, !path.closed]);
    pieces.forEach(([s0, s1, open]) => {
      // split the piece at corners so each strip follows one smooth run
      const offs = [s0];
      path.segments.forEach((sg, k) => {
        if (!path.closed && (k === 0 || k === path.segments.length - 1)) return;
        const o = path.getOffsetOf(sg.point);
        if (o == null || o <= s0 + 1e-6 || o >= s1 - 1e-6) return;
        const tin = sg.handleIn.isZero() ? (sg.previous ? sg.point.subtract(sg.previous.point) : null) : sg.handleIn.multiply(-1);
        const tout = sg.handleOut.isZero() ? (sg.next ? sg.next.point.subtract(sg.point) : null) : sg.handleOut;
        if (tin && tout && !tin.isZero() && !tout.isZero() && Math.abs(tin.getDirectedAngle(tout)) > 0.5) {
          offs.push(o);
          parts.push(joinPiece(sg.point, tin.normalize(), tout.normalize(), h, join, miter));
        }
      });
      offs.push(s1);
      offs.sort((a, b) => a - b);
      for (let k = 0; k < offs.length - 1; k++) {
        const pts = samplePiece(path, offs[k], offs[k + 1]);
        if (pts.length >= 2) parts.push(strip(pts, h));
      }
      if (open) {
        const p0 = path.getPointAt(s0);
        const t0 = path.getTangentAt(Math.min(L, s0 + 1e-3));
        const p1 = path.getPointAt(s1);
        const t1 = path.getTangentAt(Math.max(0, s1 - 1e-3));
        if (p0 && t0) parts.push(capPiece(p0, t0.normalize().multiply(-1), h, cap));
        if (p1 && t1) parts.push(capPiece(p1, t1.normalize(), h, cap));
      }
    });
    // closed path without dashes: the joint at the first node
    if (path.closed && !(dash && dash.length) && path.segments.length > 1) {
      const sg = path.firstSegment;
      const tin = sg.handleIn.isZero() ? sg.point.subtract(path.lastSegment.point) : sg.handleIn.multiply(-1);
      const tout = sg.handleOut.isZero() ? sg.next.point.subtract(sg.point) : sg.handleOut;
      if (!tin.isZero() && !tout.isZero()) parts.push(joinPiece(sg.point, tin.normalize(), tout.normalize(), h, join, miter));
    }
    return uniteAll(parts);
  };
  const outlineOf = (it) => {
    const w = it.strokeWidth || 0;
    if (!it.strokeColor || !(w > 0)) return null;
    const d = it.data || {};
    const pos = d.strokePos || 'center';
    const paths = it instanceof paper.CompoundPath ? it.children : [it];
    const closedShape = it instanceof paper.CompoundPath || it.closed;
    const ww = pos !== 'center' && closedShape ? w * 2 : w;
    let area = uniteAll(paths.map((p) => strokeArea(p, ww, it.strokeCap, it.strokeJoin, it.miterLimit, it.dashArray)));
    if (!area) return null;
    if (pos !== 'center' && closedShape) {
      const body = it.clone({ insert: false });
      body.strokeColor = null;
      try {
        area = pos === 'inside' ? area.intersect(body, { insert: false }) : area.subtract(body, { insert: false });
      } catch (e) { /* keep the centred outline */ }
    }
    if (it instanceof paper.Path && d.arrows && VP.outline && VP.outline.arrowGeo) {
      const heads = [];
      VP.outline.arrowGeo(it).forEach((g) => {
        const p = new paper.Path({ segments: g.pts, closed: !!g.fill, insert: false });
        heads.push(g.fill ? p : strokeArea(p, w, 'round', 'round', 10, null));
      });
      area = uniteAll([area].concat(heads));
    }
    return area;
  };
  const outlineToObject = () => {
    const leaves = [];
    const visit = (it) => {
      if (VP.fx && VP.fx.isFx(it)) return;
      if (it instanceof paper.Path || it instanceof paper.CompoundPath) {
        if (!it.clipMask) leaves.push(it);
      } else if (it instanceof paper.Group) it.children.forEach(visit);
    };
    VP.sel.forEach(visit);
    const made = [];
    let skipped = 0;
    leaves.forEach((it) => {
      const area = outlineOf(it);
      if (!area) {
        skipped++;
        return;
      }
      area.fillColor = it.strokeColor.clone();
      area.strokeColor = null;
      area.opacity = it.opacity;
      area.blendMode = it.blendMode;
      area.data = { label: 'Anahat nesnesi' };
      area.insertAbove(it);
      made.push(area);
      // the original keeps its fill, without the outline; an object that had only an outline is replaced
      if (it.fillColor && it.fillColor.alpha !== 0) {
        it.strokeColor = null;
        if (it.data) ['arrows', 'nib', 'strokePos', 'behindFill'].forEach((k) => delete it.data[k]);
      } else it.remove();
    });
    if (!made.length) return VP.toast(VP.sel.some((it) => it instanceof paper.PointText) ? 'Metin için önce Eğriye Çevir (Ctrl+Q) kullanın' : 'Seçimde anahattı olan eğri yok');
    VP.setSelection(made.map((m) => VP.topLevel(m)).filter((x, i, a) => a.indexOf(x) === i));
    VP.commit();
    VP.toast(made.length + ' anahat nesneye dönüştürüldü' + (skipped ? ' · ' + skipped + ' nesnede anahat yoktu' : ''));
  };
  VP.cOutlineToObject = outlineToObject;
  VP.cStrokeArea = strokeArea;
  def('Anahattı Nesneye Dönüştür', { kbd: 'Ctrl+Shift+Q', icon: 'curves', enabled: hasSel, run: outlineToObject });

  /* ---------- fit objects to path ---------- */
  const fitToPath = () => {
    const sel = VP.sel.slice();
    let path = null;
    for (let i = sel.length - 1; i >= 0; i--) {
      if (sel[i] instanceof paper.Path && sel[i].length > 0) {
        path = sel[i];
        break;
      }
    }
    if (!path) {
      const cands = sel.filter((it) => it instanceof paper.CompoundPath && it.children.length);
      if (cands.length) path = cands[cands.length - 1].children[0];
    }
    if (!path) return VP.toast('Nesnelerle birlikte bir eğri de seçin (eğri yol olarak kullanılır)');
    const owner = sel.find((it) => it === path || it.isAncestor(path));
    const objs = sel.filter((it) => it !== owner).sort((a, b) => a.bounds.center.x - b.bounds.center.x || a.bounds.center.y - b.bounds.center.y);
    if (!objs.length) return VP.toast('Yola yerleştirilecek nesneleri de seçin');
    dialog('Nesneleri Yola Sığdır', [
      { k: 'rot', type: 'chk', label: 'Nesneleri yolun yönüne döndür', value: true },
      { k: 'spread', type: 'seg', label: 'Yerleşim', value: 'even', items: [['even', 'Eşit aralıkla'], ['keep', 'Baştan, sırayla']] }
    ], (v) => {
      const L = path.length;
      const n = objs.length;
      let pos = 0;
      objs.forEach((it, i) => {
        let s;
        if (v.spread === 'keep') {
          const w = it.bounds.width;
          s = Math.min(L, pos + w / 2);
          pos += w + VP.toPT(1);
        } else s = path.closed ? (L * i) / n : n === 1 ? L / 2 : (L * i) / (n - 1);
        const p = path.getPointAt(Math.min(L, s));
        const t = path.getTangentAt(Math.min(L - 1e-3, Math.max(1e-3, s)));
        if (!p) return;
        VP.T.move([it], p.subtract(it.bounds.center));
        if (v.rot && t) VP.T.rotate([it], t.angle - (VP.itemAngle(it) || 0), p);
      });
      VP.setSelection(objs);
      VP.commit();
      VP.toast(n + ' nesne yola yerleştirildi');
    }, { ok: 'Uygula' });
  };
  def('Nesneleri Yola Sığdır', { enabled: () => VP.sel.length > 1, run: fitToPath });

  /* ---------- arrange to front / back of page ---------- */
  const toPage = (front) => {
    const ls = VP.userLayers().filter((L) => !L.locked);
    if (!ls.length) return;
    const L = front ? ls[ls.length - 1] : ls[0];
    const items = VP.zSort(VP.sel);
    if (front) items.forEach((it) => L.addChild(it));
    else items.slice().reverse().forEach((it) => L.insertChild(0, it));
    VP.commit();
  };
  def('Sayfanın Önüne', { kbd: 'Ctrl+Home', enabled: hasSel, icon: 'toFront', run: () => toPage(true) });
  def('Sayfanın Arkasına', { kbd: 'Ctrl+End', enabled: hasSel, icon: 'toBack', run: () => toPage(false) });

  /* ---------- hide / lock submenus ---------- */
  def('Seçili Olmayanları Gizle', {
    enabled: hasSel,
    run: () => {
      let n = 0;
      VP.allSelectable().forEach((it) => {
        if (!VP.sel.includes(it)) {
          it.visible = false;
          n++;
        }
      });
      if (n) VP.commit();
      VP.toast(n ? n + ' nesne gizlendi · Göstermek için Nesne › Gizle › Tüm Nesneleri Göster' : 'Gizlenecek başka nesne yok');
    }
  });
  def('Seçili Olmayanları Kilitle', {
    enabled: hasSel,
    run: () => {
      let n = 0;
      VP.allSelectable().forEach((it) => {
        if (!VP.sel.includes(it)) {
          it.locked = true;
          n++;
        }
      });
      if (n) VP.commit();
      VP.toast(n ? n + ' nesne kilitlendi' : 'Kilitlenecek başka nesne yok');
    }
  });

  /* ---------- align to pixel grid ---------- */
  def('Piksel Izgarasıyla Hizala', {
    enabled: hasSel,
    run: () => {
      const px = 72 / 96;
      VP.sel.forEach((it) => {
        const b = it.bounds;
        const x0 = Math.round(b.left / px) * px;
        const y0 = Math.round(b.top / px) * px;
        const x1 = Math.max(x0 + px, Math.round(b.right / px) * px);
        const y1 = Math.max(y0 + px, Math.round(b.bottom / px) * px);
        if (b.width > 1e-6 && b.height > 1e-6) VP.T.scale([it], (x1 - x0) / b.width, (y1 - y0) / b.height, b.topLeft);
        VP.T.move([it], Pt(x0, y0).subtract(it.bounds.topLeft));
      });
      VP.commit();
      VP.toast('Seçim piksel ızgarasına hizalandı (96 dpi)');
    }
  });

  /* ---------- symmetry (live mirror) ---------- */
  const reflectMatrix = (a, b) => {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const c2 = Math.cos(2 * ang);
    const s2 = Math.sin(2 * ang);
    const tx = a.x - (c2 * a.x + s2 * a.y);
    const ty = a.y - (s2 * a.x - c2 * a.y);
    return new paper.Matrix(c2, s2, s2, -c2, tx, ty);
  };
  const symRebuild = (g) => {
    const src = g.children.find((c) => c.data && c.data.c_symSrc);
    const axis = g.children.find((c) => c.data && c.data.c_symAxis);
    if (!src || !axis || axis.segments.length < 2) return;
    g.children.filter((c) => c.data && c.data.c_symMirror).forEach((c) => c.remove());
    const m = src.clone({ insert: false });
    VP.deepData(m);
    m.data = { c_symMirror: true };
    m.getItems({ match: (i) => i.data && i.data.param }).forEach((i) => delete i.data.param);
    m.transform(reflectMatrix(axis.firstSegment.point, axis.lastSegment.point));
    m.locked = true;
    m.insertAbove(src);
  };
  const symAll = () => {
    if (!paper.project) return;
    VP.userLayers().forEach((L) => L.getItems({ match: (i) => i.data && i.data.c_sym && i instanceof paper.Group }).forEach((g) => {
      try {
        symRebuild(g);
      } catch (e) { /* never block a commit */ }
    }));
  };
  const commit0 = VP.commit;
  VP.commit = function () {
    symAll();
    return commit0.apply(this, arguments);
  };
  def('Yeni Simetri Oluştur', {
    kbd: 'Alt+S',
    enabled: hasSel,
    run: () => {
      const items = VP.zSort(VP.sel);
      const b = VP.selBounds(items);
      const top = items[items.length - 1];
      const g = new paper.Group({ insert: false });
      g.insertAbove(top);
      const src = new paper.Group({ insert: false });
      src.data = { c_symSrc: true };
      src.addChildren(items);
      const axis = new paper.Path.Line({ from: Pt(b.right, b.top), to: Pt(b.right, b.bottom), insert: false });
      axis.data = { c_symAxis: true };
      axis.visible = false;
      g.addChildren([src, axis]);
      g.data = { c_sym: true, label: 'Simetri' };
      symRebuild(g);
      VP.setSelection([g]);
      VP.commit();
      VP.toast('Simetri oluşturuldu · Düzenlemek için Odağa Getir (çift dokunma) · Yansıma kendiliğinden güncellenir');
    }
  });
  const oneSym = () => (VP.sel.length === 1 && VP.sel[0].data && VP.sel[0].data.c_sym ? VP.sel[0] : null);
  def('Simetriyi Düzenle', { enabled: () => !!oneSym(), run: () => A.c_odagagetir.run() });
  def('Simetriyi Ayır', {
    enabled: () => !!oneSym(),
    run: () => {
      const g = oneSym();
      g.children.slice().forEach((c) => {
        if (c.data && c.data.c_symAxis) c.remove();
        else if (c.data && c.data.c_symMirror) {
          c.locked = false;
          delete c.data.c_symMirror;
        } else if (c.data) delete c.data.c_symSrc;
      });
      delete g.data.c_sym;
      g.data.label = null;
      delete g.data.label;
      VP.setSelection([g]);
      VP.commit();
      VP.toast('Simetri bağlantısı koptu · Nesneler normal grup oldu');
    }
  });

  /* ---------- hyperlinks (İnternet Bağlantıları) ---------- */
  def('İnternet Bağlantıları', {
    enabled: () => VP.sel.length === 1,
    checked: () => !!(VP.sel.length === 1 && VP.sel[0].data && VP.sel[0].data.url),
    run: async () => {
      const it = VP.sel[0];
      const v = await UI.prompt({ title: 'İnternet bağlantısı', label: 'Adres (boş bırakınca kaldırılır)', value: (it.data && it.data.url) || 'https://', ok: 'Uygula' });
      if (v == null) return;
      const u = v.trim();
      if (!u || u === 'https://') delete it.data.url;
      else if (!/^(https?:|mailto:|tel:)/i.test(u)) return VP.toast('Adres http://, https://, mailto: veya tel: ile başlamalı');
      else it.data.url = u;
      VP.commit();
      VP.toast(it.data.url ? 'Bağlantı eklendi · SVG dışa aktarmada tıklanabilir' : 'Bağlantı kaldırıldı');
    }
  });
  if (VP.io && VP.io.exportHooks) {
    // (SVG/PDF export keeps data.url only as metadata; the link is written by the SVG builder of the io module if it supports it)
  }

  /* ======================================================================
     EDIT COMMANDS
     ====================================================================== */
  const pasteJSON = (list, at) => {
    VP.ensureLayer();
    const items = list.map((json) => VP.activeLayer.importJSON(json));
    if (!items.length) return [];
    const b = VP.selBounds(items);
    if (at) VP.T.move(items, at.subtract(b.center));
    VP.setSelection(items);
    VP.commit();
    return items;
  };
  def('Görünümde Yapıştır', {
    kbd: 'Ctrl+Shift+V',
    enabled: () => VP.clipboard.length > 0,
    run: () => {
      if (!VP.clipboard.length) return VP.toast('Panoda nesne yok');
      pasteJSON(VP.clipboard, paper.view.center);
    }
  });
  def('Yerinde Yapıştır', {
    enabled: () => VP.clipboard.length > 0,
    run: () => pasteJSON(VP.clipboard, null)
  });
  const pasteText = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t) return VP.toast('Panoda metin yok');
      const lines = t.replace(/\r/g, '');
      let item;
      if (lines.length > 80 && VP.tx && VP.tx.createParagraph) {
        try {
          const w = Math.min(VP.page().w * 0.8, VP.toPT(150));
          const c = paper.view.center;
          item = VP.tx.createParagraph(new paper.Rectangle(c.x - w / 2, c.y - VP.toPT(30), w, VP.toPT(60)), lines);
        } catch (e) {
          item = null;
        }
      }
      if (!item) {
        item = VP.createText(paper.view.center, lines);
        item.position = paper.view.center;
      }
      VP.setSelection([item]);
      VP.commit();
    } catch (e) {
      VP.toast('Panoya erişilemedi · Tarayıcı izin vermedi');
    }
  };
  const pasteImage = async () => {
    try {
      if (!navigator.clipboard.read) throw new Error('read');
      const list = await navigator.clipboard.read();
      for (const ci of list) {
        const type = ci.types.find((t) => /^image\//.test(t));
        if (type) {
          const blob = await ci.getType(type);
          const file = new File([blob], 'pano.' + type.split('/')[1], { type });
          await VP.io.handleImport(file);
          return;
        }
        if (ci.types.includes('image/svg+xml')) {
          const blob = await ci.getType('image/svg+xml');
          await VP.io.handleImport(new File([blob], 'pano.svg', { type: 'image/svg+xml' }));
          return;
        }
      }
      VP.toast('Panoda resim yok');
    } catch (e) {
      VP.toast('Panodaki resim okunamadı · Tarayıcı izin vermedi');
    }
  };
  def('Özel Yapıştır…', {
    run: () => {
      UI.modal(
        '<h2>Özel Yapıştır</h2><p>Pano içeriğinin hangi biçimde yapıştırılacağını seçin.</p><div class="c-list">' +
          '<button class="pop-item" data-p="obj"' + (VP.clipboard.length ? '' : ' disabled') + '><span>VektörPad nesneleri (' + VP.clipboard.length + ')</span></button>' +
          '<button class="pop-item" data-p="view"' + (VP.clipboard.length ? '' : ' disabled') + '><span>VektörPad nesneleri, görünümün ortasına</span></button>' +
          '<button class="pop-item" data-p="place"' + (VP.clipboard.length ? '' : ' disabled') + '><span>VektörPad nesneleri, kopyalandığı yere</span></button>' +
          '<button class="pop-item" data-p="text"><span>Biçimlendirilmemiş metin (sistem panosu)</span></button>' +
          '<button class="pop-item" data-p="img"><span>Resim veya SVG (sistem panosu)</span></button>' +
          '</div><div class="actions"><button class="btn" data-p="no">Vazgeç</button></div>',
        (root, close) => root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-p]');
          if (!b || b.disabled) return;
          close();
          const k = b.dataset.p;
          if (k === 'obj') A.paste.run();
          else if (k === 'view') A.c_gorunumdeyapistir.run();
          else if (k === 'place') A.c_yerindeyapistir.run();
          else if (k === 'text') pasteText();
          else if (k === 'img') pasteImage();
        })
      );
    }
  });
  // Edit › Select All ▸ Nodes
  def('Düğümler', {
    enabled: () => VP.sel.length === 1 && VP.isPathItem(VP.sel[0]),
    run: () => {
      const it = VP.sel[0];
      if (VP.toolId !== 'node') VP.setTool('node');
      const T = VP.tools.node;
      if (T.target !== it && T.pick) T.pick(it);
      if (T.allSegs) {
        T.segs = new Set(T.allSegs());
        VP.drawOverlay();
        VP.emit('selection');
        VP.toast(T.segs.size + ' düğüm seçildi');
      }
    }
  });
  def('Kılavuzlar', {
    run: () => {
      const g = (VP.page().guides || []).length;
      VP.toast(g ? 'Kılavuz çizgileri sürükleyerek taşıyın, cetvele bırakarak silin (' + g + ' kılavuz)' : 'Bu sayfada kılavuz çizgi yok');
    }
  });

  /* ======================================================================
     VIEW COMMANDS
     ====================================================================== */
  const zoomAll = () => {
    const items = VP.allSelectable();
    if (!items.length) return VP.fitPage();
    const b = VP.selBounds(items);
    VP.zoomToRect(b.expand(Math.max(b.width, b.height) * 0.04 + VP.toPT(2)));
  };
  def('Tümünü Sığdır', { kbd: 'F4', icon: 'fit', run: zoomAll });
  def('Büyüt', { kbd: 'Ctrl++', run: () => VP.zoomAt(2) });
  def('Küçült', { kbd: 'Ctrl+-', run: () => VP.zoomAt(0.5) });
  def('Sayfaya Yakınlaştır', { kbd: 'Shift+F4', icon: 'page', run: () => VP.fitPage() });
  def('Sadece Seçili Nesneyi Önizle', {
    enabled: hasSel,
    run: () => {
      const b = VP.selBounds();
      const dpr = window.devicePixelRatio || 1;
      let res = 72 * Math.min((innerWidth * dpr * 0.9) / Math.max(1, b.width), (innerHeight * dpr * 0.85) / Math.max(1, b.height));
      res = Math.min(res, 2400);
      while ((b.width * res / 72) * (b.height * res / 72) > 16e6) res *= 0.8;
      const g = new paper.Group({ insert: false });
      VP.zSort(VP.sel).forEach((it) => g.addChild(it.clone({ insert: false })));
      let url;
      try {
        url = g.rasterize(res, false).toDataURL();
      } catch (e) {
        return VP.toast('Önizleme oluşturulamadı');
      }
      const el = document.createElement('div');
      el.className = 'fs-preview';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Seçili nesnenin önizlemesi');
      el.innerHTML = '<img alt="Seçili nesnenin önizlemesi" src="' + url + '" style="background:transparent"><div class="fs-note">Sadece seçili nesne · Kapatmak için dokunun veya Esc</div>';
      const close = () => {
        el.remove();
        document.removeEventListener('keydown', onKey, true);
      };
      const onKey = (e) => {
        if (e.key === 'Escape' || e.key === 'F9') {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      };
      el.addEventListener('click', close);
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(el);
    }
  });

  /* ---------- page border, bleed, printable area, pixel and baseline grids ---------- */
  const pref = (k, dflt) => (S[k] === undefined ? dflt : !!S[k]);
  const togglePref = (k, dflt, after) => () => {
    S[k] = !pref(k, dflt);
    savePrefs();
    if (after) after();
    VP.drawPage();
    VP.drawOverlay();
    UI.schedule && UI.schedule('top');
  };
  const drawPage0 = VP.drawPage;
  VP.drawPage = function () {
    const r = drawPage0.apply(this, arguments);
    const L = VP.bgLayer;
    if (!L || !paper.project) return r;
    const p = VP.page();
    const pageRect = L.children.find((c) => c instanceof paper.Path && c.bounds.width === p.w && c.bounds.height === p.h && c.name !== 'grid');
    if (pageRect && !pref('c_pageBorder', true)) pageRect.shadowColor = null;
    L.children.filter((c) => c.name === 'c-pagemarks').forEach((c) => c.remove());
    const g = new paper.Group({ name: 'c-pagemarks', insert: false });
    const line = (rect, color, dash) => g.addChild(new paper.Path.Rectangle({ rectangle: rect, strokeColor: color, strokeWidth: 1, strokeScaling: false, dashArray: dash, insert: false }));
    if (pref('c_pageBorder', true) && pageRect) line(new paper.Rectangle(0, 0, p.w, p.h), new paper.Color(0, 0, 0, 0.35), null);
    if (pref('c_bleed', false)) {
      const bl = VP.toPT((VP.doc.ext && VP.doc.ext.c_bleedMM) || 3);
      line(new paper.Rectangle(-bl, -bl, p.w + bl * 2, p.h + bl * 2), new paper.Color('#d0021b'), [4, 3]);
    }
    if (pref('c_printable', false)) {
      const m = VP.toPT(5);
      line(new paper.Rectangle(m, m, p.w - m * 2, p.h - m * 2), new paper.Color('#7a7a7a'), [2, 2]);
    }
    if (pref('c_baseline', false)) {
      const step = (VP.doc.ext && VP.doc.ext.c_baselinePt) || 14;
      const col = new paper.Color(0.4, 0.75, 0.95, 0.75);
      for (let y = step; y < p.h; y += step) g.addChild(new paper.Path.Line({ from: [0, y], to: [p.w, y], strokeColor: col, strokeWidth: 1, strokeScaling: false, insert: false }));
    }
    if (g.children.length) L.addChild(g);
    return r;
  };
  VP.overlayHooks = VP.overlayHooks || [];
  // pixel grid, drawn when one document pixel is at least 6 screen pixels
  VP.overlayHooks.push((L) => {
    if (!pref('c_pixelGrid', false)) return;
    const z = zoom();
    const px = 72 / 96;
    if (px * z < 6) return;
    const vb = paper.view.bounds;
    const g = new paper.Group({ insert: false });
    const col = new paper.Color(0.5, 0.5, 0.5, 0.35);
    const x0 = Math.floor(vb.left / px) * px;
    const y0 = Math.floor(vb.top / px) * px;
    for (let x = x0; x <= vb.right; x += px) g.addChild(new paper.Path.Line({ from: [x, vb.top], to: [x, vb.bottom], strokeColor: col, strokeWidth: 1 / z, insert: false }));
    for (let y = y0; y <= vb.bottom; y += px) g.addChild(new paper.Path.Line({ from: [vb.left, y], to: [vb.right, y], strokeColor: col, strokeWidth: 1 / z, insert: false }));
    L.insertChild(0, g);
  });
  def('Sayfa Kenarlığı', { checked: () => pref('c_pageBorder', true), run: togglePref('c_pageBorder', true) });
  def('Taşma Payı', { checked: () => pref('c_bleed', false), run: togglePref('c_bleed', false) });
  def('Yazdırılabilir Alan', { checked: () => pref('c_printable', false), run: togglePref('c_printable', false) });
  def('Piksel Izgarası', { checked: () => pref('c_pixelGrid', false), run: togglePref('c_pixelGrid', false, () => pref('c_pixelGrid', false) && zoom() * 0.75 < 6 && VP.toast('Piksel ızgarası yakınlaştırınca görünür (%800 ve üzeri)')) });
  def('Taban Çizgisi Izgarası', { checked: () => pref('c_baseline', false), run: togglePref('c_baseline', false) });

  /* ---------- alignment guides and dynamic guides ---------- */
  const G = { lines: [], dyn: [], dynItems: [] };
  const keyX = (b) => [b.left, b.center.x, b.right];
  const keyY = (b) => [b.top, b.center.y, b.bottom];
  const others = () => {
    const out = [];
    VP.allSelectable().forEach((it) => {
      if (VP.sel.includes(it)) return;
      out.push(it.bounds);
    });
    const p = VP.page();
    out.push(new paper.Rectangle(0, 0, p.w, p.h));
    return out;
  };
  const snap0 = VP.snapPt;
  VP.snapPt = (pt) => {
    let q = snap0(pt);
    const tool = VP.tools && VP.tools[VP.toolId];
    const tol = (VP.coarse ? 10 : 7) / zoom();
    // View › Snap To › Pixels, Page
    if (pref('c_snapPixels', false)) {
      const px = 72 / 96;
      q = Pt(Math.round(q.x / px) * px, Math.round(q.y / px) * px);
    }
    if (pref('c_snapPage', false) && VP.toolId !== 'select') {
      const p = VP.page();
      const near = (v, list) => list.reduce((b, x) => (Math.abs(x - v) < tol && (b == null || Math.abs(x - v) < Math.abs(b - v)) ? x : b), null);
      const nx = near(q.x, [0, p.w / 2, p.w]);
      const ny = near(q.y, [0, p.h / 2, p.h]);
      q = Pt(nx != null ? nx : q.x, ny != null ? ny : q.y);
    }
    if (VP.toolId === 'select' && tool && tool.op && tool.op.type === 'move' && pref('c_alignGuides', false) && VP.sel.length) {
      const b0 = VP.selBounds();
      const w = b0.width;
      const h = b0.height;
      const rects = others();
      let best = { x: null, y: null };
      [0, w / 2, w].forEach((ox) => rects.forEach((r) => keyX(r).forEach((x) => {
        const d = x - (q.x + ox);
        if (Math.abs(d) < tol && (!best.x || Math.abs(d) < Math.abs(best.x.d))) best.x = { d, x, r };
      })));
      [0, h / 2, h].forEach((oy) => rects.forEach((r) => keyY(r).forEach((y) => {
        const d = y - (q.y + oy);
        if (Math.abs(d) < tol && (!best.y || Math.abs(d) < Math.abs(best.y.d))) best.y = { d, y, r };
      })));
      q = Pt(q.x + (best.x ? best.x.d : 0), q.y + (best.y ? best.y.d : 0));
      const nb = new paper.Rectangle(q.x, q.y, w, h);
      G.lines = [];
      if (best.x) G.lines.push([Pt(best.x.x, Math.min(nb.top, best.x.r.top)), Pt(best.x.x, Math.max(nb.bottom, best.x.r.bottom))]);
      if (best.y) G.lines.push([Pt(Math.min(nb.left, best.y.r.left), best.y.y), Pt(Math.max(nb.right, best.y.r.right), best.y.y)]);
      return q;
    }
    if (VP.toolId !== 'select' && VP.toolId !== 'hand' && VP.toolId !== 'zoom' && pref('c_dynGuides', false)) {
      let bx = null;
      let by = null;
      others().forEach((r) => {
        [r.topLeft, r.topCenter, r.topRight, r.leftCenter, r.center, r.rightCenter, r.bottomLeft, r.bottomCenter, r.bottomRight].forEach((p) => {
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          if (Math.abs(dx) < tol && (!bx || Math.abs(dx) < Math.abs(bx.d))) bx = { d: dx, p };
          if (Math.abs(dy) < tol && (!by || Math.abs(dy) < Math.abs(by.d))) by = { d: dy, p };
        });
      });
      q = Pt(q.x + (bx ? bx.d : 0), q.y + (by ? by.d : 0));
      G.dyn = [];
      if (bx) G.dyn.push([bx.p, Pt(bx.p.x, q.y)]);
      if (by) G.dyn.push([by.p, Pt(q.x, by.p.y)]);
      G.dynT = Date.now();
      drawDyn();
    }
    return q;
  };
  const guideLine = (a, b, color) => {
    const z = zoom();
    const ext = b.subtract(a).normalize(8 / z);
    return new paper.Path.Line({ from: a.subtract(ext.isZero() ? Pt(0, 0) : ext), to: b.add(ext.isZero() ? Pt(0, 0) : ext), strokeColor: color, strokeWidth: 1 / z, dashArray: [4 / z, 3 / z], insert: false });
  };
  const drawDyn = () => {
    G.dynItems.forEach((i) => i.remove());
    G.dynItems = [];
    const L = VP.uiLayer;
    if (!L || !G.dyn.length) return;
    const col = new paper.Color('#00a2e8');
    G.dyn.forEach(([a, b]) => {
      const ln = guideLine(a, b, col);
      L.addChild(ln);
      G.dynItems.push(ln);
    });
  };
  VP.overlayHooks.push((L) => {
    const tool = VP.tools && VP.tools.select;
    const moving = VP.toolId === 'select' && tool && tool.op && tool.op.type === 'move' && tool.op.moved;
    if (!moving) G.lines = [];
    const col = new paper.Color('#e8009c');
    G.lines.forEach(([a, b]) => L.addChild(guideLine(a, b, col)));
    G.dynItems = [];
    if (G.dyn.length && Date.now() - (G.dynT || 0) < 1500) drawDyn();
  });
  document.addEventListener('pointerup', () => {
    if (G.dyn.length) {
      G.dyn = [];
      setTimeout(drawDyn, 0);
    }
    if (G.lines.length) {
      G.lines = [];
      setTimeout(() => VP.drawOverlay(), 0);
    }
  }, true);
  def('Pikseller', { checked: () => pref('c_snapPixels', false), run: togglePref('c_snapPixels', false, () => VP.toast(pref('c_snapPixels', false) ? 'Piksellere yakala açık (96 dpi)' : 'Piksellere yakala kapalı')) });
  def('Sayfaya Yapış', { checked: () => pref('c_snapPage', false), run: togglePref('c_snapPage', false, () => VP.toast(pref('c_snapPage', false) ? 'Sayfa kenarlarına ve ortasına yakala açık' : 'Sayfaya yakala kapalı')) });
  def('Hizalama Kılavuzları', { kbd: 'Alt+Shift+A', checked: () => pref('c_alignGuides', false), run: togglePref('c_alignGuides', false, () => VP.toast(pref('c_alignGuides', false) ? 'Hizalama kılavuzları açık · Taşırken diğer nesnelerin kenar ve ortalarına hizalanır' : 'Hizalama kılavuzları kapalı')) });
  def('Dinamik Kılavuzlar', { kbd: 'Alt+Shift+D', checked: () => pref('c_dynGuides', false), run: togglePref('c_dynGuides', false, () => VP.toast(pref('c_dynGuides', false) ? 'Dinamik kılavuzlar açık · Çizerken nesnelerin önemli noktalarıyla aynı hizaya yakalar' : 'Dinamik kılavuzlar kapalı')) });

  /* ---------- object hints (tooltips over objects) ---------- */
  let tip = null;
  const hideTip = () => tip && (tip.hidden = true);
  const fillText = (it) => {
    const f = VP.getFill ? VP.getFill(it) : null;
    const s = VP.getStroke ? VP.getStroke(it) : null;
    const col = (c) => (c && c.color ? c.color : c && c.type ? c.type : c || 'yok');
    const parts = [];
    if (f) parts.push('Dolgu: ' + (typeof f === 'string' ? f : col(f)));
    if (s) parts.push('Anahat: ' + (typeof s === 'string' ? s : (s.color || 'yok') + (s.width ? ' · ' + num(VP.toMM(s.width), 2) + ' mm' : '')));
    return parts.join('  ');
  };
  const onHover = (e) => {
    if (!pref('c_objHints', false) || e.buttons || (e.pointerType === 'touch')) return hideTip();
    const cv = $('#canvas');
    if (!cv || !paper.view) return;
    const r = cv.getBoundingClientRect();
    const pt = paper.view.viewToProject(Pt(e.clientX - r.left, e.clientY - r.top));
    const it = VP.hitItem(pt);
    if (!it) return hideTip();
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'c-objtip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    let extra = '';
    try {
      extra = fillText(it);
    } catch (err) {
      extra = '';
    }
    const b = it.bounds;
    tip.innerHTML = '<b>' + esc(VP.describe(it)) + '</b><span>' + num(VP.toMM(b.width), 1) + ' × ' + num(VP.toMM(b.height), 1) + ' mm' + (it.layer ? ' · ' + esc(it.layer.name || '') : '') + '</span>' + (extra ? '<span>' + esc(extra) + '</span>' : '');
    tip.hidden = false;
    tip.style.left = Math.min(innerWidth - 240, e.clientX + 14) + 'px';
    tip.style.top = Math.min(innerHeight - 70, e.clientY + 18) + 'px';
  };
  document.addEventListener('pointermove', (e) => {
    if (e.target && e.target.id === 'canvas') onHover(e);
    else hideTip();
  }, { passive: true });
  document.addEventListener('pointerdown', hideTip, true);
  def('Nesne İpuçları', { checked: () => pref('c_objHints', false), run: togglePref('c_objHints', false, () => VP.toast(pref('c_objHints', false) ? 'Nesne ipuçları açık · Fare veya Apple Pencil’i nesnenin üzerinde tutun' : 'Nesne ipuçları kapalı')) });

  /* ---------- page navigator and scroll bars ---------- */
  const applyChrome = () => {
    const pt = $('#page-tabs');
    if (pt) pt.style.display = pref('c_pageNav', true) ? '' : 'none';
    document.documentElement.dataset.cScrollbars = pref('c_scrollbars', true) ? 'on' : 'off';
    setTimeout(() => UI.onResize && UI.onResize(), 0);
  };
  def('Belge Gezinme Aracı', { checked: () => pref('c_pageNav', true), run: togglePref('c_pageNav', true, applyChrome) });
  def('Kaydırma Çubukları', { checked: () => pref('c_scrollbars', true), run: togglePref('c_scrollbars', true, applyChrome) });
  VP.on('doc', applyChrome);

  /* ======================================================================
     LAYOUT (PAGE) COMMANDS
     ====================================================================== */
  const pageOpts = () => VP.doc.pages.map((p, i) => [i, i + 1 + '. ' + p.name]);
  def('Sayfa Ekle…', {
    icon: 'plus',
    run: () => dialog('Sayfa Ekle', [
      { k: 'n', type: 'num', label: 'Eklenecek sayfa sayısı', value: 1 },
      { k: 'where', type: 'seg', label: 'Yer', value: 'after', items: [['before', 'Önce'], ['after', 'Sonra']] },
      { k: 'ref', type: 'sel', label: 'Mevcut sayfa', value: VP.doc.active, items: pageOpts() },
      { k: 'w', type: 'num', label: 'Genişlik', value: num(VP.toMM(VP.page().w), 1), unit: 'mm' },
      { k: 'h', type: 'num', label: 'Yükseklik', value: num(VP.toMM(VP.page().h), 1), unit: 'mm' }
    ], (v) => {
      const n = clamp(Math.round(v.n) || 1, 1, 100);
      if (!(v.w > 1 && v.h > 1)) return VP.toast('Geçerli bir sayfa boyutu girin'), false;
      VP.storePage();
      VP.makeThumb();
      const ref = +v.ref;
      const at = v.where === 'before' ? ref : ref + 1;
      const made = [];
      for (let i = 0; i < n; i++) made.push(VP.newPage(VP.doc.pages.length + 1 + i, v.w, v.h));
      VP.doc.pages.splice(at, 0, ...made);
      VP.loadPage(at);
      VP.commit();
      VP.toast(n + ' sayfa eklendi');
    }, { ok: 'Ekle' })
  });
  def('Sayfayı Çoğalt…', {
    icon: 'duplicate',
    run: () => dialog('Sayfayı Çoğalt', [
      { k: 'where', type: 'seg', label: 'Yer', value: 'after', items: [['before', 'Seçili sayfadan önce'], ['after', 'Seçili sayfadan sonra']] },
      { k: 'what', type: 'seg', label: 'Kopyala', value: 'all', items: [['layers', 'Yalnız katmanları'], ['all', 'Katmanları ve içeriklerini']] }
    ], (v) => {
      VP.storePage();
      const i = VP.doc.active;
      const src = VP.doc.pages[i];
      let layers = src.layers.slice();
      if (v.what === 'layers') {
        layers = layers.map((json) => {
          const L = new paper.Layer({ insert: false });
          L.importJSON(json);
          L.removeChildren();
          const out = L.exportJSON({ asString: true, precision: 4 });
          L.remove();
          return out;
        });
      }
      const copy = Object.assign({}, src, { id: VP.uid(), name: src.name + ' (kopya)', layers, thumb: v.what === 'layers' ? null : src.thumb });
      const at = v.where === 'before' ? i : i + 1;
      VP.doc.pages.splice(at, 0, copy);
      VP.loadPage(at);
      VP.commit();
      VP.toast('Sayfa çoğaltıldı');
    }, { ok: 'Çoğalt' })
  });
  def('Sayfayı Sil…', {
    icon: 'trash',
    enabled: () => VP.doc.pages.length > 1,
    run: () => dialog('Sayfayı Sil', [
      { k: 'from', type: 'num', label: 'Silinecek sayfa', value: VP.doc.active + 1 },
      { k: 'to', type: 'num', label: 'Bu sayfaya kadar (dahil)', value: VP.doc.active + 1 }
    ], (v) => {
      const N = VP.doc.pages.length;
      const a = clamp(Math.round(v.from) || 1, 1, N) - 1;
      const b = clamp(Math.round(v.to) || a + 1, a + 1, N) - 1;
      if (b - a + 1 >= N) return VP.toast('Belgede en az bir sayfa kalmalı'), false;
      VP.storePage();
      VP.doc.pages.splice(a, b - a + 1);
      VP.loadPage(Math.min(a, VP.doc.pages.length - 1));
      VP.commit();
      VP.toast(b - a + 1 + ' sayfa silindi');
    }, { ok: 'Sil' })
  });

  /* ---------- page numbering ---------- */
  const ROM = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  const roman = (n) => {
    let s = '';
    ROM.forEach(([v, r]) => {
      while (n >= v) {
        s += r;
        n -= v;
      }
    });
    return s;
  };
  const alpha = (n) => {
    let s = '';
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  };
  const numCfg = () => Object.assign({ start: 1, from: 0, style: '1' }, (VP.doc.ext && VP.doc.ext.c_pageNum) || {});
  const fmtPage = (index) => {
    const c = numCfg();
    if (index < c.from) return '';
    const n = c.start + index - c.from;
    if (n < 1 && c.style !== '1') return String(n);
    switch (c.style) {
      case 'I': return roman(n);
      case 'i': return roman(n).toLowerCase();
      case 'A': return alpha(n);
      case 'a': return alpha(n).toLowerCase();
      case '01': return (n < 10 ? '0' : '') + n;
      case '-1-': return '- ' + n + ' -';
      default: return String(n);
    }
  };
  VP.cFmtPage = fmtPage;
  const updateFields = () => {
    if (!paper.project) return;
    VP.userLayers().forEach((L) => L.getItems({ match: (it) => it.data && it.data.pageField }).forEach((t) => {
      const s = fmtPage(VP.doc.active);
      if (t.content !== s) t.content = s;
    }));
  };
  VP.on('page', updateFields);
  VP.on('doc', updateFields);
  if (VP.io) {
    VP.io.exportHooks = VP.io.exportHooks || [];
    VP.io.exportHooks.push((tmp, index) => tmp.getItems({ match: (it) => it.data && it.data.pageField }).forEach((it) => (it.content = fmtPage(index))));
  }
  def('Sayfa Numarası Ayarları…', {
    run: () => {
      const c = numCfg();
      dialog('Sayfa Numarası Ayarları', [
        { k: 'start', type: 'num', label: 'Başlangıç numarası', value: c.start },
        { k: 'from', type: 'sel', label: 'Başlangıç sayfası', value: c.from, items: pageOpts() },
        { k: 'style', type: 'sel', label: 'Stil', value: c.style, items: [['1', '1, 2, 3…'], ['01', '01, 02, 03…'], ['-1-', '- 1 -, - 2 -…'], ['I', 'I, II, III…'], ['i', 'i, ii, iii…'], ['A', 'A, B, C…'], ['a', 'a, b, c…']] }
      ], (v) => {
        const ext = VP.ext();
        ext.c_pageNum = { start: Math.round(isFinite(v.start) ? v.start : 1), from: +v.from || 0, style: v.style };
        updateFields();
        VP.commit();
        VP.toast('Sayfa numarası ayarları uygulandı');
      }, { ok: 'Uygula' });
    }
  });
  const makeNumText = (p, i) => {
    const t = VP.createText(Pt(p.w / 2, p.h - VP.toPT(8)), fmtPage(i) || ' ');
    t.justification = 'center';
    t.fontSize = 10;
    t.fillColor = '#1d1d1b';
    t.data.pageField = true;
    t.data.label = 'Sayfa numarası';
    return t;
  };
  const numberPages = (want, what) => {
    VP.storePage();
    let n = 0;
    VP.doc.pages.forEach((p, i) => {
      if (!want(i)) return;
      n++;
      if (i === VP.doc.active) {
        makeNumText(p, i);
        return;
      }
      if (!p.layers || !p.layers.length) {
        const L0 = new paper.Layer({ name: 'Katman 1', insert: false });
        p.layers = [L0.exportJSON({ asString: true, precision: 4 })];
        L0.remove();
      }
      const idx = clamp(p.activeLayer || 0, 0, p.layers.length - 1);
      const L = new paper.Layer({ insert: false });
      L.importJSON(p.layers[idx]);
      const t = makeNumText(p, i);
      t.remove();
      L.addChild(t);
      p.layers = p.layers.slice();
      p.layers[idx] = L.exportJSON({ asString: true, precision: 4 });
      L.remove();
    });
    VP.commit();
    VP.toast(n ? n + ' sayfaya ' + what + 'sayfa numarası eklendi · Ayarlar: Mizanpaj › Sayfa Numarası Ayarları' : 'Uygun sayfa yok');
  };
  alias('Etkin Katmana Sayfa Numarası Ekle', 'insertPageNum');
  def('Tüm Sayfalara Sayfa Numarası Ekle', { run: () => numberPages(() => true, '') });
  def('Tüm Tek Sayfalara Sayfa Numarası Ekle', { run: () => numberPages((i) => (i + 1) % 2 === 1, 'tek ') });
  def('Tüm Çift Sayfalara Sayfa Numarası Ekle', { enabled: () => VP.doc.pages.length > 1, run: () => numberPages((i) => (i + 1) % 2 === 0, 'çift ') });

  def('Sayfa Düzeni…', {
    icon: 'page',
    run: () => dialog('Sayfa Düzeni', [
      { k: 'layout', type: 'sel', label: 'Düzen', value: S.facing ? 'book' : 'full', items: [['full', 'Tam sayfa'], ['book', 'Kitap (karşılıklı sayfalar)']] },
      { k: 'units', type: 'html', html: '<p class="sec-note">Kitapçık, broşür ve katlamalı kart düzenleri için Dosya › Yazdır › Sayfa yerleşimi kullanılır.</p>' }
    ], (v) => {
      const want = v.layout === 'book';
      if (!!S.facing !== want && A.facingPages) A.facingPages.run();
    }, { ok: 'Uygula' })
  });
  def('Çerçeve ve Gromet…', {
    run: () => dialog('Çerçeve ve Gromet', [
      { k: 'd', type: 'num', label: 'Gromet çapı', value: 10, unit: 'mm' },
      { k: 'm', type: 'num', label: 'Kenardan uzaklık', value: 15, unit: 'mm' },
      { k: 's', type: 'num', label: 'En fazla aralık', value: 300, unit: 'mm' },
      { k: 'frame', type: 'chk', label: 'Kesim çerçevesi de çiz (sayfa kenarı)', value: true }
    ], (v) => {
      const p = VP.page();
      const d = VP.toPT(v.d);
      const m = VP.toPT(v.m);
      const gap = VP.toPT(v.s);
      if (!(d > 0) || !(m >= 0) || !(gap > d) || m * 2 >= Math.min(p.w, p.h)) return VP.toast('Değerleri kontrol edin'), false;
      const L = new paper.Layer({ name: 'Gromet', insert: false });
      const idx = paper.project.layers.indexOf(VP.userLayers().slice(-1)[0]) + 1;
      paper.project.insertLayer(idx, L);
      VP.keepSysOrder();
      const pts = [];
      const edge = (a, b) => {
        const len = a.getDistance(b);
        const k = Math.max(1, Math.ceil(len / gap));
        for (let i = 0; i < k; i++) pts.push(a.add(b.subtract(a).multiply(i / k)));
      };
      const c = [Pt(m, m), Pt(p.w - m, m), Pt(p.w - m, p.h - m), Pt(m, p.h - m)];
      for (let i = 0; i < 4; i++) edge(c[i], c[(i + 1) % 4]);
      const g = new paper.Group({ insert: false });
      pts.forEach((q) => g.addChild(new paper.Path.Circle({ center: q, radius: d / 2, strokeColor: '#1d1d1b', strokeWidth: 0.75, fillColor: null, insert: false })));
      g.data = { label: 'Grometler (' + pts.length + ')' };
      L.addChild(g);
      if (v.frame) {
        const f = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(0, 0, p.w, p.h), strokeColor: '#e6007e', strokeWidth: 0.5, insert: false });
        f.data = { label: 'Çerçeve' };
        L.addChild(f);
      }
      VP.setActiveLayer(L);
      VP.setSelection([g]);
      VP.commit();
      VP.toast(pts.length + ' gromet “Gromet” katmanına eklendi');
    }, { ok: 'Oluştur' })
  });

  /* ======================================================================
     FILE COMMANDS
     ====================================================================== */
  const TPL = 'vektorpad.c.templates.v1';
  const RECENT = 'vektorpad.c.recent.v1';
  const readLS = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || '[]') || [];
    } catch (e) {
      return [];
    }
  };
  const writeLS = (k, list) => {
    for (let n = list.length; n >= 0; n--) {
      try {
        localStorage.setItem(k, JSON.stringify(list.slice(0, n)));
        return n;
      } catch (e) { /* too big: keep fewer */ }
    }
    return 0;
  };
  const docCopy = () => {
    VP.storePage();
    return JSON.parse(JSON.stringify(VP.doc));
  };
  const openAsNew = (doc, name) => {
    const d = JSON.parse(JSON.stringify(doc));
    d.name = name || (VP.docs && VP.docs.nextName ? VP.docs.nextName() : 'Adsız');
    if (VP.docs && VP.docs.add && !(VP.docs.pristine && VP.docs.pristine())) VP.docs.add(d);
    else VP.io.loadDoc(d);
  };
  def('Şablon olarak kaydet…', {
    run: async () => {
      const n = await UI.prompt({ title: 'Şablon olarak kaydet', label: 'Şablon adı', value: VP.doc.name || 'Şablon', ok: 'Kaydet' });
      if (!n || !n.trim()) return;
      const doc = docCopy();
      doc.pages.forEach((p) => (p.thumb = p.thumb || null));
      const list = readLS(TPL).filter((t) => t.name !== n.trim());
      list.unshift({ name: n.trim(), at: Date.now(), doc });
      const kept = writeLS(TPL, list.slice(0, 12));
      if (!kept) VP.toast('Şablon tarayıcıda saklanamadı (çok büyük) · Dosya olarak indiriliyor');
      VP.io.saveFile(n.trim().replace(/[\\/:*?"<>|]+/g, '-') + '.sablon.vektorpad.json', JSON.stringify({ app: 'VektorPad', v: 1, template: true, doc }));
    }
  });
  const pickFile = (accept, fn) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (f) fn(f);
    });
    document.body.appendChild(inp);
    inp.click();
  };
  def('Şablondan Yeni Oluştur…', {
    icon: 'file',
    run: () => {
      const list = readLS(TPL);
      UI.modal(
        '<h2>Şablondan Yeni Oluştur</h2>' + (list.length ? '<div class="c-list">' + list.map((t, i) => '<button class="pop-item" data-t="' + i + '"><span>' + esc(t.name) + '</span><span class="kbd">' + esc(new Date(t.at).toLocaleDateString('tr-TR')) + ' · ' + t.doc.pages.length + ' sayfa</span></button>').join('') + '</div>' : '<p>Kayıtlı şablon yok. Dosya › Şablon olarak kaydet ile bir belgeyi şablon yapın veya şablon dosyası seçin.</p>') +
          '<div class="actions"><button class="btn" data-t="no">Vazgeç</button>' + (list.length ? '<button class="btn" data-t="del">Şablonları temizle</button>' : '') + (A.openCdr ? '<button class="btn" data-t="cdr">CorelDRAW şablonu (.cdrt)…</button>' : '') + '<button class="btn primary" data-t="file">Şablon dosyası…</button></div>',
        (root, close) => root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-t]');
          if (!b) return;
          const k = b.dataset.t;
          close();
          if (k === 'no') return;
          if (k === 'del') {
            writeLS(TPL, []);
            return VP.toast('Şablonlar temizlendi');
          }
          if (k === 'cdr') return A.openCdr.run();
          if (k === 'file') {
            return pickFile('.json,application/json', async (f) => {
              try {
                const o = JSON.parse(await f.text());
                if (!VP.io.valid(o)) throw new Error('bad');
                openAsNew(o.doc);
              } catch (err) {
                VP.toast('Bu dosya bir VektörPad şablonu değil');
              }
            });
          }
          openAsNew(list[+k].doc);
        })
      );
    }
  });
  // recent documents: a copy of every saved or opened document is kept in the browser
  const remember = () => {
    try {
      const doc = docCopy();
      const list = readLS(RECENT).filter((r) => r.name !== doc.name);
      list.unshift({ name: doc.name, at: Date.now(), doc });
      writeLS(RECENT, list.slice(0, 6));
    } catch (e) { /* optional */ }
  };
  if (VP.io) {
    const sv = VP.io.save;
    VP.io.save = async function () {
      const r = await sv.apply(this, arguments);
      if (r) {
        remember();
        saved.set(curEntry(), JSON.stringify(docCopy()));
      }
      return r;
    };
    const ld = VP.io.loadDoc;
    VP.io.loadDoc = function () {
      const r = ld.apply(this, arguments);
      setTimeout(() => {
        remember();
        saved.set(curEntry(), JSON.stringify(docCopy()));
      }, 0);
      return r;
    };
  }
  def('Son Kullanılanları Aç', {
    enabled: () => readLS(RECENT).length > 0,
    run: () => {
      const list = readLS(RECENT);
      const anchor = UI._lastAnchor && UI._lastAnchor.isConnected ? UI._lastAnchor : $('#menubar') || document.body;
      UI.popover(anchor, '<div class="pop-head">Son Kullanılanları Aç</div>' + list.map((r, i) => '<button class="pop-item" role="menuitem" data-pick="' + i + '"><span>' + (i + 1) + ' ' + esc(r.name) + '</span><span class="kbd">' + esc(new Date(r.at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })) + '</span></button>').join(''), (i) => {
        const r = list[+i];
        if (r) openAsNew(r.doc, r.name);
      });
    }
  });
  // revert to the last saved version
  const saved = new WeakMap();
  const curEntry = () => (VP.docs && VP.docs.list ? VP.docs.list[VP.docs.active] : VP) || VP;
  def('Geri Al', {
    enabled: () => saved.has(curEntry()),
    run: async () => {
      const s = saved.get(curEntry());
      if (!s) return VP.toast('Bu belgenin kaydedilmiş sürümü yok');
      if (!(await UI.confirm({ title: 'Kaydedilmiş sürüme dönülsün mü?', text: 'Son kayıttan sonraki tüm değişiklikler kaybolur.', ok: 'Geri Al', danger: true }))) return;
      const doc = JSON.parse(s);
      VP.doc = doc;
      VP.loadPage(clamp(doc.active || 0, 0, doc.pages.length - 1));
      VP.refreshShadows();
      VP.resetHistory();
      VP.emit('doc');
      const e = curEntry();
      if (e && 'dirty' in e) {
        e.dirty = false;
        VP.docs.render && VP.docs.render();
      }
      VP.toast('Belge son kaydedilen sürüme döndü');
    }
  });
  // Send: hands the page to the iPad share sheet (Mail, Messages, AirDrop…)
  const capture = async (fn) => {
    const io = VP.io;
    const orig = io.saveFile;
    let got = null;
    io.saveFile = async (name, data) => {
      got = { name, data };
      return true;
    };
    try {
      await fn();
    } finally {
      io.saveFile = orig;
    }
    return got;
  };
  def('Gönder', {
    run: () => dialog('Gönder', [
      { k: 'fmt', type: 'seg', label: 'Biçim', value: 'pdf', items: [['pdf', 'PDF'], ['png', 'PNG'], ['svg', 'SVG'], ['vp', 'VektörPad']] }
    ], async (v) => {
      VP.toast('Dosya hazırlanıyor…');
      const io = VP.io;
      const got = await capture(() => (v.fmt === 'pdf' ? io.exportPDF(true) : v.fmt === 'png' ? io.exportPNG(150) : v.fmt === 'svg' ? io.exportSVG() : io.save.call(io)));
      if (!got) return VP.toast('Dosya hazırlanamadı');
      const type = { pdf: 'application/pdf', png: 'image/png', svg: 'image/svg+xml', vp: 'application/json' }[v.fmt];
      const blob = got.data instanceof Blob ? got.data : new Blob([got.data], { type });
      const file = new File([blob], got.name, { type });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        UI.modal('<h2>Gönder</h2><p>' + esc(file.name) + ' hazır.</p><div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Gönder…</button></div>', (root, close) => root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-x]');
          if (!b) return;
          close();
          if (b.dataset.x === 'yes') navigator.share({ files: [file], title: file.name }).catch((err) => err && err.name !== 'AbortError' && VP.toast('Paylaşılamadı'));
        }));
      } else {
        io.saveFile(got.name, blob);
        VP.toast('Bu tarayıcıda paylaşım yok · Dosya indirildi');
      }
    }, { ok: 'Hazırla' })
  });
  def('Web…', { run: () => VP.io.exportPNG(96) });
  def('Office…', { run: () => VP.io.exportPNG(300) });
  def('Şunun İçin Ver', {
    run: () => {
      const anchor = UI._lastAnchor && UI._lastAnchor.isConnected ? UI._lastAnchor : $('#menubar') || document.body;
      UI.popover(anchor, '<div class="pop-head">Şunun İçin Ver</div>' + UI.menuHTML(['c_web', 'c_office']), (id) => UI.run(id));
    }
  });

  /* ======================================================================
     TEXT COMMANDS
     ====================================================================== */
  const curPara = () => {
    const g = VP.sel.length === 1 ? VP.sel[0] : VP.tx && VP.tx.editing && VP.tx.editing();
    return g && VP.tx.is(g, 'paragraph') ? g : null;
  };
  const paraOp = (fn) => (v) => {
    const g = curPara();
    if (!g) return;
    fn(g.data.effect, v);
    VP.fx.rebuild(g);
    VP.commit();
  };
  const needPara = () => !!curPara();
  def('Sekmeler…', {
    enabled: needPara,
    run: () => {
      const fx = curPara().data.effect;
      dialog('Sekme Ayarları', [
        { k: 'tabs', type: 'text', label: 'Sekme durakları (mm, noktalı virgülle)', value: (fx.tabs || []).map((x) => num(VP.toMM(x), 1)).join('; '), w: 200 },
        { k: 'step', type: 'num', label: 'Varsayılan sekme aralığı', value: num(VP.toMM(fx.tabStep || VP.toPT(12.7)), 1), unit: 'mm' }
      ], paraOp((f, v) => {
        f.tabs = String(v.tabs).split(/[;\s]+/).map((s) => VP.parseNum(s)).filter((x) => x > 0).sort((a, b) => a - b).map((x) => VP.toPT(x));
        if (!f.tabs.length) delete f.tabs;
        if (v.step > 0) f.tabStep = VP.toPT(v.step);
      }), { ok: 'Uygula', note: 'Metinde sekme için Tab karakteri kullanın.' });
    }
  });
  def('Sütunlar…', {
    enabled: needPara,
    run: () => {
      const fx = curPara().data.effect;
      dialog('Sütun Ayarları', [
        { k: 'cols', type: 'num', label: 'Sütun sayısı', value: fx.cols || 1 },
        { k: 'gut', type: 'num', label: 'Sütun aralığı', value: num(VP.toMM(fx.gutter || VP.toPT(5)), 1), unit: 'mm' }
      ], paraOp((f, v) => {
        f.cols = clamp(Math.round(v.cols) || 1, 1, 12);
        if (v.gut >= 0) f.gutter = VP.toPT(v.gut);
      }), { ok: 'Uygula', note: 'Sütunlar eşit genişlikte; çerçeve genişliği korunur.' });
    }
  });
  def('Maddeler ve Numaralandırma…', {
    enabled: needPara,
    run: () => {
      const fx = curPara().data.effect;
      const b = fx.bullet || {};
      dialog('Maddeler ve Numaralandırma', [
        { k: 'type', type: 'sel', label: 'Madde işareti / numara', value: b.type || 'none', items: (VP.text2 && VP.text2.BULLETS) || [['none', 'Yok'], ['dot', '• Nokta'], ['num', '1. Sayı']] },
        { k: 'hang', type: 'num', label: 'Asılı girinti', value: num(VP.toMM(b.hang != null ? b.hang : fx.font.size * 1.5), 1), unit: 'mm' }
      ], paraOp((f, v) => {
        f.bullet = Object.assign({}, f.bullet || {}, { type: v.type });
        if (v.hang >= 0) f.bullet.hang = VP.toPT(v.hang);
      }), { ok: 'Uygula' });
    }
  });
  def('Büyük Harf…', {
    enabled: needPara,
    run: () => {
      const fx = curPara().data.effect;
      const d = fx.dropCap || {};
      dialog('Büyük İlk Harf', [
        { k: 'lines', type: 'sel', label: 'Bırakılan satır sayısı', value: d.lines || 0, items: [[0, 'Yok'], [2, '2 satır'], [3, '3 satır'], [4, '4 satır'], [5, '5 satır']] },
        { k: 'all', type: 'chk', label: 'Her paragrafın ilk harfi', value: !!d.all }
      ], paraOp((f, v) => {
        f.dropCap = Object.assign({}, f.dropCap || {}, { lines: +v.lines || 0, all: !!v.all });
      }), { ok: 'Uygula' });
    }
  });
  // Text › Convert (artistic ↔ paragraph)
  def('Dönüştür', {
    kbd: 'Ctrl+F8',
    enabled: () => VP.sel.length === 1 && (VP.sel[0] instanceof paper.PointText || VP.tx.is(VP.sel[0], 'paragraph')),
    run: () => UI.run(VP.sel[0] instanceof paper.PointText ? 'txToPara' : 'txToArtistic')
  });
  // Text › Insert Formatting Code
  const CODES = [[' ', 'Em boşluğu'], [' ', 'En boşluğu'], [' ', '¼ Em boşluğu'], [' ', 'Bölünemez boşluk'], ['—', 'Em tire'], ['–', 'En tire'], ['‑', 'Bölünemez tire'], ['­', 'İsteğe bağlı tire'], ['\t', 'Sekme'], ['\n', 'Satır sonu']];
  const insertCode = (ch) => {
    const ta = document.querySelector('#text-editor textarea, #text-editor [contenteditable], textarea.tx-editor') || (document.activeElement && document.activeElement.tagName === 'TEXTAREA' ? document.activeElement : null);
    if (ta && ta.tagName === 'TEXTAREA' && ta.offsetParent !== null) {
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + ch + ta.value.slice(e);
      ta.selectionStart = ta.selectionEnd = s + ch.length;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      return;
    }
    const t = VP.sel.length === 1 ? VP.sel[0] : null;
    if (t instanceof paper.PointText) {
      t.content += ch;
      VP.commit();
      return VP.toast('Metnin sonuna eklendi');
    }
    if (t && VP.tx.is(t, 'paragraph')) {
      t.data.effect.text += ch;
      VP.fx.rebuild(t);
      VP.commit();
      return VP.toast('Metnin sonuna eklendi');
    }
    VP.toast('Önce bir metni düzenlemeye başlayın');
  };
  def('Biçimlendirme Kodu Ekle', {
    run: () => {
      const anchor = UI._lastAnchor && UI._lastAnchor.isConnected ? UI._lastAnchor : $('#menubar') || document.body;
      UI.popover(anchor, '<div class="pop-head">Biçimlendirme Kodu Ekle</div>' + CODES.map(([c, l], i) => '<button class="pop-item" role="menuitem" data-pick="' + i + '"><span>' + esc(l) + '</span></button>').join(''), (i) => insertCode(CODES[+i][0]));
    }
  });

  /* ======================================================================
     TABLE: split cells into rows / columns
     ====================================================================== */
  const curTable = () => VP.sel.find((it) => VP.tx.is(it, 'table'));
  const oneCell = (g) => {
    const rg = VP.tx.selRange ? VP.tx.selRange(g) : null;
    return rg || { r0: 0, c0: 0, r1: 0, c1: 0 };
  };
  const splitCells = (rows) => {
    const g = curTable();
    if (!g) return VP.toast('Önce tablo aracıyla bir hücre seçin');
    const fx = g.data.effect;
    const rg = oneCell(g);
    const merged = fx.merges.find((m) => m.r === rg.r0 && m.c === rg.c0);
    if ((rg.r1 !== rg.r0 || rg.c1 !== rg.c0) && !merged) return VP.toast('Tek bir hücre seçin');
    dialog(rows ? 'Satırlara Böl' : 'Sütunlara Böl', [{ k: 'n', type: 'num', label: rows ? 'Satır sayısı' : 'Sütun sayısı', value: 2 }], (v) => {
      const n = clamp(Math.round(v.n) || 2, 2, 20);
      if (merged) {
        // a merged cell is split back first when it spans enough rows/columns
        const span = rows ? merged.rs : merged.cs;
        if (span >= n) {
          VP.tx.tbl.split(fx, { r0: merged.r, c0: merged.c, r1: merged.r + merged.rs - 1, c1: merged.c + merged.cs - 1 });
          VP.fx.rebuild(g);
          VP.commit();
          return;
        }
      }
      const r = rg.r0;
      const c = rg.c0;
      if (rows) {
        const h = fx.rowH[r];
        for (let i = 1; i < n; i++) VP.tx.tbl.insertRow(fx, r + 1, r);
        for (let i = 0; i < n; i++) fx.rowH[r + i] = h / n;
        for (let cc = 0; cc < fx.colW.length; cc++) {
          if (cc === c) continue;
          const m = fx.merges.find((x) => x.c <= cc && cc < x.c + x.cs && x.r <= r && r < x.r + x.rs);
          if (m) {
            if (m.r + m.rs - 1 === r) m.rs += n - 1;
            continue;
          }
          fx.merges.push({ r, c: cc, rs: n, cs: 1 });
        }
      } else {
        const w = fx.colW[c];
        for (let i = 1; i < n; i++) VP.tx.tbl.insertCol(fx, c + 1, c);
        for (let i = 0; i < n; i++) fx.colW[c + i] = w / n;
        for (let rr = 0; rr < fx.rowH.length; rr++) {
          if (rr === r) continue;
          const m = fx.merges.find((x) => x.r <= rr && rr < x.r + x.rs && x.c <= c && c < x.c + x.cs);
          if (m) {
            if (m.c + m.cs - 1 === c) m.cs += n - 1;
            continue;
          }
          fx.merges.push({ r: rr, c, rs: 1, cs: n });
        }
      }
      fx.eff = null;
      VP.fx.rebuild(g);
      VP.commit();
      VP.toast('Hücre ' + n + (rows ? ' satıra' : ' sütuna') + ' bölündü');
    }, { ok: 'Böl' });
  };
  def('Satırlara Böl…', { enabled: () => !!curTable(), run: () => splitCells(true) });
  def('Sütunlara Böl…', { enabled: () => !!curTable(), run: () => splitCells(false) });

  /* ======================================================================
     EFFECTS / BITMAPS
     ====================================================================== */
  def('Pointillizer', {
    enabled: hasSel,
    run: () => dialog('Pointillizer', [
      { k: 'size', type: 'num', label: 'Nokta aralığı', value: 3, unit: 'mm' },
      { k: 'dot', type: 'num', label: 'Nokta boyutu', value: 90, unit: '%' },
      { k: 'keep', type: 'chk', label: 'Özgün nesneleri koru', value: false }
    ], (v) => {
      const step = VP.toPT(v.size);
      if (!(step > 0.3)) return VP.toast('Nokta aralığı çok küçük'), false;
      const b = VP.selBounds();
      const cols = Math.ceil(b.width / step);
      const rows = Math.ceil(b.height / step);
      if (cols * rows > 40000) return VP.toast('Çok fazla nokta oluşur · Aralığı büyütün'), false;
      const g0 = new paper.Group({ insert: false });
      VP.zSort(VP.sel).forEach((it) => g0.addChild(it.clone({ insert: false })));
      const res = 72 / step;
      let ras;
      try {
        ras = g0.rasterize(res, false);
      } catch (e) {
        return VP.toast('Nesneler noktalara çevrilemedi'), false;
      }
      const W = ras.width;
      const Hh = ras.height;
      const data = ras.getImageData(new paper.Rectangle(0, 0, W, Hh)).data;
      const out = new paper.Group({ insert: false });
      const r = (step / 2) * clamp(v.dot / 100 || 0.9, 0.1, 1.5);
      const rb = ras.bounds;
      for (let y = 0; y < Hh; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const a = data[i + 3] / 255;
          if (a < 0.08) continue;
          const c = new paper.Color(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, a);
          out.addChild(new paper.Path.Circle({ center: Pt(rb.left + (x + 0.5) * (rb.width / W), rb.top + (y + 0.5) * (rb.height / Hh)), radius: r, fillColor: c, insert: false }));
        }
      }
      if (!out.children.length) return VP.toast('Noktalanacak renk bulunamadı'), false;
      out.data = { label: 'Pointillizer (' + out.children.length + ' nokta)' };
      const top = VP.zSort(VP.sel).slice(-1)[0];
      out.insertAbove(top);
      if (!v.keep) VP.sel.forEach((it) => it.remove());
      VP.setSelection([out]);
      VP.commit();
      VP.toast(out.children.length + ' nokta oluşturuldu');
    }, { ok: 'Uygula' })
  });
  // Object › Copy Effect: shadow, contour or lens of one selected object is copied to the other
  const fxKind = (it) => (it.data && it.data.effect && ['contour', 'lens'].includes(it.data.effect.type) ? it.data.effect.type : it.data && it.data.shadow ? 'shadow' : null);
  def('Efekti Kopyala', {
    enabled: () => VP.sel.length === 2 && VP.sel.some(fxKind),
    run: () => {
      const src = VP.sel.slice().reverse().find(fxKind);
      const dst = VP.sel.find((it) => it !== src);
      const kind = fxKind(src);
      if (kind === 'shadow') {
        VP.setShadow([dst], VP.getShadow(src));
        VP.setSelection([dst]);
        VP.commit();
        return VP.toast('Gölge kopyalandı');
      }
      if (VP.fx.isFx(dst)) return VP.toast('Hedef nesnede zaten bir efekt var · Önce Efekti Temizle');
      const sfx = JSON.parse(JSON.stringify(src.data.effect));
      const g = kind === 'contour' ? VP.fx.contour(dst) : VP.fx.lens(dst, sfx.kind);
      if (!g || !g.data || !g.data.effect) return;
      ['made'].forEach((k) => delete sfx[k]);
      Object.assign(g.data.effect, sfx);
      VP.fx.rebuild(g);
      VP.setSelection([g]);
      VP.commit();
      VP.toast((kind === 'contour' ? 'Kontur' : 'Mercek') + ' efekti kopyalandı');
    }
  });
  def('Görüntüyü Düzelt…', {
    enabled: () => VP.sel.length === 1 && VP.sel[0] instanceof paper.Raster,
    run: () => dialog('Görüntüyü Düzelt', [{ k: 'a', type: 'num', label: 'Döndürme açısı', value: 0, unit: '°' }], (v) => {
      if (!isFinite(v.a) || Math.abs(v.a) > 45) return VP.toast('−45° ile 45° arasında bir açı girin'), false;
      const it = VP.sel[0];
      VP.T.rotate([it], v.a, it.bounds.center);
      VP.commit();
      VP.toast('Görüntü ' + num(v.a, 1) + '° döndürüldü · Kenarları kırpmak için Biteşlemi Kırp');
    }, { ok: 'Uygula', note: 'Eğik taranmış veya çekilmiş görüntüyü düzeltir.' })
  });

  /* ======================================================================
     TOOLS / WINDOW / HELP
     ====================================================================== */
  def('Ayarları Varsayılan Olarak Kaydet…', {
    run: async () => {
      if (!(await UI.confirm({ title: 'Ayarlar varsayılan olarak kaydedilsin mi?', text: 'Geçerli dolgu, anahat, yazı tipi ve araç ayarları ile görünüm seçenekleri yeni çizimlerde kullanılır.', ok: 'Kaydet' }))) return;
      savePrefs();
      VP.toast('Ayarlar varsayılan olarak kaydedildi');
    }
  });
  def('Pencereyi Tazele', {
    kbd: 'Ctrl+W',
    run: () => {
      VP.drawPage();
      VP.drawGuides && VP.drawGuides();
      VP.refreshShadows && VP.refreshShadows();
      UI.drawRulers && UI.drawRulers();
      UI.onResize && UI.onResize();
      if (V.mode === 'pixel') applyPixel();
      redraw();
      UI.schedule && UI.schedule('top', 'prop', 'status');
    }
  });
  def('Hızlı Başlangıç Kılavuzu…', {
    run: () => info('Hızlı Başlangıç Kılavuzu', '<dl class="help-grid">' +
      '<dt>Belge</dt><dd>Dosya › Yeni (Ctrl+N) ile sayfa boyutunu seçin; her belge kendi sekmesinde açılır.</dd>' +
      '<dt>Çizim</dt><dd>Soldaki araç kutusundan dörtgen, elips, çokgen, serbest el veya kalem aracını seçip sayfada sürükleyin.</dd>' +
      '<dt>Seçim</dt><dd>Seçim aracıyla nesneye dokunun; ikinci dokunuşta döndürme ve eğme tutamaçları çıkar. Basılı tutmak sağ tık menüsünü açar.</dd>' +
      '<dt>Renk</dt><dd>Sağdaki paletten bir renge dokunmak dolguyu, anahat hedefini seçip dokunmak anahattı boyar.</dd>' +
      '<dt>Düzenleme</dt><dd>Şekil aracı (F10) düğümleri düzenler; Nesne › Eğriye Çevir (Ctrl+Q) şekilleri serbest eğri yapar.</dd>' +
      '<dt>Görünüm</dt><dd>İki parmakla yakınlaştırıp kaydırın; F4 tüm nesnelere, Shift+F4 sayfaya sığdırır.</dd>' +
      '<dt>Kaydetme</dt><dd>Çalışma otomatik saklanır; Dosya › Kaydet belge dosyası, Dosya › Dosya Ver PDF, PNG, SVG üretir.</dd></dl>')
  });
  def('Kullanıcı Kılavuzu…', { run: () => UI.help() });

  /* ======================================================================
     CAPTION ALIASES for commands VektörPad already has
     ====================================================================== */
  [
    // Dosya
    ['Yeni…', 'new'], ['Aç…', 'open'], ['Kapat', 'docClose'], ['Tümünü Kapat', 'docCloseAll'], ['Kaydet…', 'save'], ['Farklı Kaydet…', 'saveAs'],
    ['Dosya Al…', 'import'], ['Dosya Ver…', 'export'], ['Verme Penceresi', 'export'], ['PDF\'ye Yayınla', 'exportPdf'], ['Yazdır…', 'print'], ['Yazdırma Önizlemesi…', 'printPreview'],
    ['Belge Özellikleri…', 'docProps'],
    // Düzen
    ['Yeniden Uygula', 'redo'], ['Yinele', 'repeat'], ['Kes', 'cut'], ['Kopyala', 'copy'], ['Özellikleri Kopyalanacak Nesne…', 'copyProps'], ['Yapıştır', 'paste'],
    ['Sil', 'delete'], ['Çoğalt', 'duplicate'], ['Klonla', 'clone'], ['Bul ve Değiştir', 'findReplace'], ['Çoğaltarak Yerleştir', 'stepRepeat'],
    // Görünüm
    ['Tam ekran önizleme', 'fullPreview'], ['Çoklu Sayfa Görünümü', 'pageSorter'], ['Cetveller', 'rulers'], ['Belge Izgarası', 'grid'],
    // Mizanpaj
    ['Sayfa İsmini Değiştir…', 'renamePage'], ['Sayfaya Git…', 'gotoPage'], ['Sayfa Yönünü Değiştir', 'orientToggle'], ['Belge Seçenekleri…', 'options'],
    ['Sayfa Boyutu…', 'pageSetup'], ['Sayfa Zemini…', 'pageBg'],
    // Nesne
    ['Sınır', 'createBoundary'], ['Dönüşümleri Temizle', 'clearTransform'], ['Efekti Temizle', 'fxClear'], ['Birleştir', 'combine'], ['Ayır', 'breakApart'],
    ['Eğriye Çevir', 'toCurves'], ['Biteşleme Dönüştür…', 'toBitmap'], ['Eğrileri Birleştir', 'joinCurves'], ['Özellikler', 'dockProps'], ['Nesneler', 'dockObjects'],
    ['Sayfalar', 'dockPages'], ['Gizle', 'hide'], ['Kilitle', 'lock'], ['Tüm Nesneleri Göster', 'showAll'], ['Tüm Nesnelerin Kilidini Aç', 'unlockAll'],
    ['Katmanın Önüne', 'toFront'], ['Katmanın Arkasına', 'toBack'], ['Bir İleri', 'forward'], ['Bir Geri', 'backward'], ['Bu Nesnenin Önüne…', 'inFrontOf'],
    ['Bu Nesnenin Arkasına…', 'behindOf'], ['Sırayı Tersine Çevir', 'reverseOrder'], ['Grupla', 'group'], ['Grubu Çöz', 'ungroup'], ['Tüm Grupları Çöz', 'ungroupAll'],
    ['Kaynak', 'weld'], ['Kırp', 'trim'], ['Kesişim', 'intersect'], ['Basitleştir', 'simplify'], ['Önü Eksi Arka', 'frontMinusBack'], ['Arkası Eksi Ön', 'backMinusFront'],
    ['Böl', 'divide'], ['Yatay Çevir', 'flipH'], ['Dikey Çevir', 'flipV'], ['Hizala ve Dağıt…', 'dockAlign'], ['Dönüştür…', 'dockTransform'],
    ['Çerçevenin İçine Yerleştir…', 'fxPowerclip'], ['İçeri PowerClip…', 'fxPowerclip'], ['Yeni Sembol Oluştur', 'toSymbol'], ['Sembol Bağlantısını Kopar', 'breakSymbol'],
    ['Sola Hizala', 'alignL'], ['Sağa Hizala', 'alignR'], ['Üste Hizala', 'alignT'], ['Alta Hizala', 'alignB'], ['Yatay Olarak Ortala', 'alignCH'], ['Dikey Olarak Ortala', 'alignCV'],
    // Efektler
    ['Harman', 'fxBlend'], ['Kontur', 'fxContour'], ['Zarf', 'fxEnvelope'], ['Derinlik', 'fxExtrude'], ['Lens', 'fxLens'], ['Perspektif Ekle', 'fxPerspective'],
    // Biteşlemler
    ['Görüntü Ayarlama Lab…', 'bmpAdjust'], ['Biteşlemi Kırp', 'bmpCrop'], ['Yeniden Örnekle…', 'bmpResample'], ['Biteşlemi Şişir', 'bmpExpand'], ['Hızlı Vektörleştirme', 'traceQuick'],
    ['Çizgisel Vektörleştirme', 'traceCenter'], ['Yüzeysel Vektörleştirme', 'traceOutline'], ['Biteşlem Maskesi', 'bmpColorMask'],
    // Metin
    ['Metin İstatistikleri…', 'textStats'], ['Metni Düzenle…', 'txEditText'], ['Metni Eğriye Yerleştir', 'txFitPath'], ['Metni Düzelt', 'txUnpath'], ['Tireleme Kullan', 'hyphenation'],
    ['Yazım Denetimi…', 'spellCheck'], ['Hızlı Düzelt…', 'quickCorrect'], ['Kişi Değiştir…', 'changeCase'], ['Büyük/Küçük Harf Değiştir…', 'changeCase'], ['Metin', 'dockText'],
    ['Görsel Karakterler', 'insertGlyph'], ['Metni Çerçeveye Sığdır', 'txFitText'], ['Çerçeveyi Metne Uydur', 'txFitFrame'],
    // Tablo
    ['Yeni Tablo Oluştur…', 'txNewTable'], ['Metni Tabloya Dönüştür…', 'textToTable'], ['Tabloyu Metne Dönüştür…', 'tableToText'], ['Hücreleri Birleştir', 'tMerge'], ['Hücreleri Ayır', 'tSplit'],
    ['Üstteki Satır', 'tRowAbove'], ['Alttaki Satır', 'tRowBelow'], ['Soldaki Sütun', 'tColLeft'], ['Sağdaki Sütun', 'tColRight'], ['Satır', 'tSelRow'], ['Sütun', 'tSelCol'],
    ['Tablo', 'tSelAll'], ['Satırları Dağıt', 'tDistRows'], ['Sütunları Dağıt', 'tDistCols'],
    // Araçlar, Pencere, Yardım
    ['Seçenekler', 'options'], ['Betikler', 'dockScripts'], ['Pencereyi Kapat', 'docClose'], ['Çalışma Arayüzü', 'workspace'], ['Karşılama Ekranı', 'welcomeScreen'],
    ['Ürün Yardımı…', 'help'], ['Öğren', 'dockHints'], ['Yenilikler?…', 'whatsNew'], ['Yenilikler', 'whatsNew'], ['CorelDRAW Hakkında…', 'about'],
    ['Renk Paletleri', 'dockPalettes'], ['Perspektifi Temizle', 'fxClear'], ['Arka planı kaldır', 'bmpColorMask'],
    // other spellings of the same Corel captions
    ['Geliştirilmiş', 'c_gelismis'], ['Yalnızca Seçili Nesneyi Önizle', 'c_sadecesecilinesneyionizle'], ['Son Kullanılanı Aç', 'c_sonkullanilanlariac'],
    ['Tüm Sayfalara', 'c_tumsayfalarasayfanumarasiekle'], ['Tüm Tek Sayfalara', 'c_tumteksayfalarasayfanumarasiekle'], ['Tüm Çift Sayfalara', 'c_tumciftsayfalarasayfanumarasiekle'],
    ['Etkin Katmana', 'insertPageNum'], ['Kılavuz Çizgileri', 'c_kilavuzlar'], ['Sayfa Sil…', 'c_sayfayisil'], ['Kaydırma çubukları', 'c_kaydirmacubuklari']
  ].forEach(([cap, id]) => alias(cap, id));
  // Corel shortcut captions for aliases whose VektörPad shortcut differs
  const setKbd = (cap, k) => A['c_' + slug(cap)] && (A['c_' + slug(cap)].kbd = k);
  setKbd('Yeniden Uygula', 'Ctrl+Shift+Z');
  setKbd('Yinele', 'Ctrl+R');
  setKbd('Çoğaltarak Yerleştir', 'Ctrl+Shift+D');
  setKbd('Pencereyi Kapat', 'Ctrl+F4');
  setKbd('Kontur', 'Ctrl+F9');
  setKbd('Zarf', 'Ctrl+F7');
  setKbd('Lens', 'Alt+F3');
  setKbd('Metni Düzenle…', 'Ctrl+Shift+T');
  setKbd('Dönüştür', 'Ctrl+F8');
  setKbd('Görsel Karakterler', 'Ctrl+F11');
  setKbd('Metin', 'Ctrl+T');
  setKbd('Özellikler', 'Alt+Enter');
  setKbd('Cetveller', 'Alt+Shift+R');
  setKbd('Tam ekran önizleme', 'F9');
  // Artistic media is a tool, not an action
  A.c_artistikmedya = { label: 'Artistik Medya', icon: 'brush', run: () => VP.setTool('brush') };
  C.c_artistikmedya = 'Artistik Medya';
  // "Tümünü Seç ▸" items not covered above
  A.c_tumunusecnesneler = Object.assign({}, A.selectAll, { label: 'Nesneler' });
  A.c_tumunusecmetin = Object.assign({}, A.selectAllText || A.selectAll, { label: 'Metin' });

  /* ======================================================================
     KEYBOARD (Corel shortcuts of the new commands)
     ====================================================================== */
  document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (document.querySelector('.modal-wrap')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    let id = null;
    if (e.key === 'Escape' && e.shiftKey) id = 'c_odakmodundancik';
    else if (e.key === 'Escape' && V.focus && !VP.sel.length && !(UI._pop)) id = 'c_odakmodundancik';
    else if (mod && e.shiftKey && k === 'q') id = 'c_anahattinesneyedonustur';
    else if (mod && e.shiftKey && k === 'v') id = 'c_gorunumdeyapistir';
    else if (mod && e.shiftKey && k === 'd') id = 'stepRepeat';
    else if (mod && e.shiftKey && k === 'z') id = 'redo';
    else if (mod && !e.shiftKey && k === 'r') id = 'repeat';
    else if (mod && e.key === 'Home') id = 'c_sayfaninonune';
    else if (mod && e.key === 'End') id = 'c_sayfaninarkasina';
    else if (mod && e.key === 'F8') id = 'c_donustur';
    else if (!mod && !e.altKey && !e.shiftKey && e.key === 'F8') {
      e.preventDefault();
      e.stopImmediatePropagation();
      return VP.setTool('text');
    }
    else if (e.shiftKey && !mod && !e.altKey && e.key === 'F3') id = 'changeCase';
    else if (mod && e.shiftKey && (k === 't' || e.code === 'KeyT')) id = 'txEditText';
    else if (mod && !e.shiftKey && (k === 't' || e.code === 'KeyT')) id = 'textProps';
    else if (mod && !e.shiftKey && (k === 'b' || e.code === 'KeyB') && VP.sel.some((it) => it instanceof paper.PointText || (VP.tx && VP.tx.is && VP.tx.is(it, 'paragraph')))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return UI.act('bold');
    }
    else if (mod && !e.shiftKey && (k === 'i' || e.code === 'KeyI') && VP.sel.some((it) => it instanceof paper.PointText || (VP.tx && VP.tx.is && VP.tx.is(it, 'paragraph')))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return UI.act('italic');
    }
    else if (mod && !e.shiftKey && (k === 'u' || e.code === 'KeyU') && VP.sel.some((it) => it instanceof paper.PointText || (VP.tx && VP.tx.is && VP.tx.is(it, 'paragraph')))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return UI.act('underline');
    }
    else if (mod && !e.shiftKey && (k === 'j' || e.code === 'KeyJ') && VP.sel.some((it) => it instanceof paper.PointText || (VP.tx && VP.tx.is && VP.tx.is(it, 'paragraph')))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return UI.act('just:justify');
    }
    else if (mod && !e.shiftKey && (k === 'l' || e.code === 'KeyL') && VP.sel.some((it) => it instanceof paper.PointText || (VP.tx && VP.tx.is && VP.tx.is(it, 'paragraph')))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return UI.act('just:left');
    }
    else if (mod && !e.shiftKey && (k === 'e' || e.code === 'KeyE') && VP.sel.some((it) => it instanceof paper.PointText || (VP.tx && VP.tx.is && VP.tx.is(it, 'paragraph')))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return UI.act('just:center');
    }
    else if (mod && !e.shiftKey && (k === 'r' || e.code === 'KeyR') && VP.sel.some((it) => it instanceof paper.PointText || (VP.tx && VP.tx.is && VP.tx.is(it, 'paragraph')))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return UI.act('just:right');
    }
    else if (e.altKey && e.shiftKey && k === 'a') id = 'c_hizalamakilavuzlari';
    else if (e.altKey && e.shiftKey && k === 'd') id = 'c_dinamikkilavuzlar';
    else if (e.altKey && e.shiftKey && k === 'r') id = 'rulers';
    else if (e.altKey && !e.shiftKey && !mod && (k === 's' || e.code === 'KeyS')) id = 'c_yenisimetriolustur';
    else if (!mod && !e.altKey && e.key === 'F4') id = e.shiftKey ? 'c_sayfayayakinlastir' : 'c_tumunusigdir';
    if (!id || !A[id]) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    UI.run(id);
  }, true);
  // double tap / double click on a group or symmetry with the select tool opens focus mode (as in Corel)
  const cvDbl = (e) => {
    if (VP.toolId !== 'select' || V.focus || VP.sel.length !== 1) return;
    const it = VP.sel[0];
    if (it instanceof paper.PointText) {
      e.preventDefault();
      return UI.editText(it);
    }
    if (VP.tx && VP.tx.isTx && VP.tx.isTx(it)) {
      e.preventDefault();
      return VP.tx.edit(it);
    }
    if (VP.fx && VP.fx.of && VP.fx.of(it) && VP.fx.of(it).type === 'powerclip') {
      e.preventDefault();
      VP.fx.pcEdit(it);
      return;
    }
    if (!(it.data && it.data.c_sym)) return;
    e.preventDefault();
    A.c_odagagetir.run();
  };
  document.addEventListener('dblclick', (e) => e.target && e.target.id === 'canvas' && cvDbl(e));

  // first start: apply stored view settings when the app is ready
  VP.on('doc', () => {
    if (V.mode === 'pixel') applyPixel();
  });
  VP.cFeatures = { ids: C, slug };
})();
