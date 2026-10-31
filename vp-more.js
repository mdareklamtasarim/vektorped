/* VektörPad, more desktop drawing suite features (written for this app):
   - Non-destructive effects: bitmap effects kept as an editable stack on any object (vector or bitmap);
     the object stays editable and the effects are drawn on top of it.
   - Linked paragraph frames: text that does not fit flows on into the next frame.
   - Convert outline to object: an outline becomes a filled shape of the same width.
   - Undo docker: the list of steps; tap one to go back (or forward) to it.
   - Shaping docker: weld, trim, intersect and the others, with "leave original source / target objects".
   - Copy effect from / clone effect from: take an effect from another object (a clone stays linked).
   - Paste special: as an object, in place, as a bitmap, as curves, or plain text / an image from the
     system clipboard. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const mm = H.mm;
  const A = VP.actions;
  const T = VP.tools;
  const TX = VP.tx;
  const IM = VP.imgfx;
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const one = () => (VP.sel.length === 1 ? VP.sel[0] : null);
  const fxOne = (type) => {
    const g = one();
    const fx = FX.of(g);
    return fx && fx.type === type ? g : null;
  };
  const MO = (VP.more = {});
  const topItems = () => {
    const out = [];
    VP.userLayers().forEach((L) => L.children.forEach((c) => out.push(c)));
    return out;
  };
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => x !== '|' && !x.startsWith('h:') && !x.startsWith('sub:') && M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };
  const uidOf = (it) => it.data.uid || (it.data.uid = VP.uid());
  const byUid = (uid) => {
    let f = null;
    VP.userLayers().forEach((L) => L.getItems({ match: (it) => !f && it.data && it.data.uid === uid }).forEach((it) => (f = f || it)));
    return f;
  };
  const src = (g) => g.children.find((c) => c.data.effectSrc);

  /* ======================================================================
     NON-DESTRUCTIVE EFFECTS
     ====================================================================== */
  FX.NAMES.nfx = 'Efektler';
  if (VP.KIND_NAMES) VP.KIND_NAMES.nfx = 'Efektler';
  const E = () => (IM && IM.EFFECTS) || {};
  const defaults = (key) => Object.assign({}, ...(E()[key] ? E()[key].params : []).map((q) => ({ [q.k]: q.v })));
  // renders the source with the stack of effects into one bitmap (in the group's own coordinates)
  MO.buildNfx = (g, draft) => {
    const fx = g.data.effect;
    const s = src(g);
    g.children.slice().forEach((c) => c !== s && c.remove());
    if (!s) return;
    const active = (fx.stack || []).filter((e) => e.on !== false && E()[e.key]);
    s.visible = !active.length;
    if (!active.length) return;
    const c = s.clone({ insert: false });
    c.visible = true;
    delete c.data.effectSrc;
    const b = c.strokeBounds;
    if (!(b.width > 0 && b.height > 0)) return;
    let res = clamp(+fx.dpi || 150, 36, 600) * (draft ? 0.5 : 1);
    const pad = Math.max(b.width, b.height) * 0.12;
    const area = b.expand(pad * 2);
    while ((area.width * res / 72) * (area.height * res / 72) > 5e6 && res > 24) res *= 0.8;
    const holder = new paper.Group({ insert: false });
    holder.addChild(new paper.Path.Rectangle({ rectangle: area, fillColor: null, strokeColor: null, insert: false }));
    holder.addChild(c);
    let r;
    try {
      r = holder.rasterize(res, false);
    } catch (e) {
      return;
    }
    const cv = r.canvas;
    let id = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    for (const e of active) {
      try {
        const out = E()[e.key].run(id, Object.assign(defaults(e.key), e.p || {}));
        if (out && out.width) id = out;
      } catch (err) {
        console.warn('effect skipped', e.key, err);
      }
    }
    const oc = document.createElement('canvas');
    oc.width = id.width;
    oc.height = id.height;
    oc.getContext('2d').putImageData(id, 0, 0);
    const ras = new paper.Raster({ insert: false });
    ras.setImage(oc);
    ras.fitBounds(r.bounds);
    ras.data.nfxOut = true;
    g.addChild(ras);
  };
  MO.makeNfx = (item, key, p) => {
    let g = FX.of(item) && FX.of(item).type === 'nfx' ? item : null;
    if (!g) {
      g = new paper.Group({ insert: false, applyMatrix: false });
      g.insertAbove(item);
      g.addChild(item);
      item.data.effectSrc = true;
      g.data.effect = { type: 'nfx', stack: [], dpi: 150 };
    }
    g.data.effect.stack.push({ key, p: p || defaults(key), on: true });
    MO.buildNfx(g);
    return g;
  };
  const unwrap = (g) => {
    const s = src(g);
    g.children.slice().forEach((c) => c !== s && c.remove());
    if (!s) {
      g.remove();
      return [];
    }
    s.visible = true;
    delete s.data.effectSrc;
    s.transform(g.matrix);
    s.insertAbove(g);
    g.remove();
    return [s];
  };
  const nfxPanel = (g, panel) => {
    const fx = g.data.effect;
    const st = fx.stack || [];
    if (!panel) return '<span class="pb-label">Efektler (' + st.length + ')</span>' + H.btn('nfxAdd', ic('plus', 'sm') + 'Efekt', 'Efekt ekle') + H.btn('nfxDock', 'Düzenle', 'Özellikler panelinde efekt listesi') + H.btn('fxMenu', 'Efekt ▾', 'Biteşleme uygula veya kaldır');
    let h = '<p class="sec-note">Nesne düzenlenebilir kalır; efektler üstte sırayla uygulanır (üstteki önce).</p>';
    st.forEach((e, i) => {
      const def = E()[e.key];
      h += '<div class="row" style="flex-wrap:nowrap;gap:2px;' + (e.on === false ? 'opacity:.5' : '') + '">' +
        '<button class="row-btn" data-act="nfxOn:' + i + '" title="Göster/gizle" aria-pressed="' + (e.on !== false) + '">' + (e.on === false ? '☐' : '☑') + '</button>' +
        '<button class="btn" style="flex:1;justify-content:flex-start;min-width:0;overflow:hidden" data-act="nfxEdit:' + i + '" title="Ayarları düzenle">' + esc(def ? def.label : e.key) + '</button>' +
        '<button class="row-btn" data-act="nfxUp:' + i + '" title="Yukarı" aria-label="Yukarı"' + (i ? '' : ' disabled') + '>↑</button>' +
        '<button class="row-btn" data-act="nfxDown:' + i + '" title="Aşağı" aria-label="Aşağı"' + (i < st.length - 1 ? '' : ' disabled') + '>↓</button>' +
        '<button class="row-btn" data-act="nfxDel:' + i + '" title="Kaldır" aria-label="Kaldır">' + ic('trash', 'sm') + '</button></div>';
    });
    h += '<div class="row"><button class="btn" data-act="nfxAdd">' + ic('plus', 'sm') + 'Efekt ekle</button>' +
      '<label class="field"><span>Çözünürlük</span><select data-pf="nfxDpi">' + [72, 150, 300].map((d) => '<option value="' + d + '"' + (+fx.dpi === d ? ' selected' : '') + '>' + d + ' dpi</option>').join('') + '</select></label></div>' +
      '<div class="row"><button class="btn" data-act="fxSeparate">Biteşleme uygula</button><button class="btn danger" data-act="fxClear">Hepsini kaldır</button></div>';
    return h;
  };
  FX.TYPES.nfx = {
    build: (g) => MO.buildNfx(g),
    probe: (g) => src(g) || g,
    restyle(g, fn) {
      const s = src(g);
      if (s) {
        s.visible = true;
        fn([s]);
      }
      MO.buildNfx(g);
    },
    describe: (g) => {
      const st = g.data.effect.stack || [];
      return st.length === 1 && E()[st[0].key] ? E()[st[0].key].label : st.length + ' efekt';
    },
    bake(g) {
      const s = src(g);
      if (s && g.children.length > 1) s.remove();
      else if (s) {
        s.visible = true;
        delete s.data.effectSrc;
      }
    },
    clear: (g) => unwrap(g),
    clearMsg: 'Efektler kaldırıldı · Nesne olduğu gibi',
    bakeMsg: 'Efektler biteşleme uygulandı',
    dblTap: (g) => {
      const s = src(g);
      if (s && FX.ext(s) && FX.ext(s).dblTap) return FX.ext(s).dblTap(s);
      VP.setSelection([g]);
      UI.openDock('props');
    },
    fields: (g) => nfxPanel(g, false),
    panel: (g) => nfxPanel(g, true)
  };
  // parameter dialog for one effect of the stack; the object itself shows the result while sliders move
  MO.editEffect = (g, i, isNew) => {
    const fx = g.data.effect;
    const e = fx.stack[i];
    const def = E()[e.key];
    if (!def) return;
    const before = JSON.stringify(e.p || {});
    e.p = Object.assign(defaults(e.key), e.p || {});
    if (!def.params.length) {
      MO.buildNfx(g);
      VP.commit();
      return;
    }
    const ctl = (q) => {
      const v = e.p[q.k];
      if (q.type === 'bool') return '<label class="field"><span>' + esc(q.l) + '</span><input type="checkbox" data-bk="' + q.k + '"' + (v ? ' checked' : '') + '></label>';
      if (q.type === 'color') return '<label class="field"><span>' + esc(q.l) + '</span><input type="color" data-bk="' + q.k + '" value="' + esc(v) + '" style="width:34px;height:26px;border:0;padding:0;background:transparent"></label>';
      if (q.type === 'select') return '<label class="field"><span>' + esc(q.l) + '</span><select data-bk="' + q.k + '">' + q.opts.map(([k, l]) => '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>';
      return '<label class="range"><span class="pb-label">' + esc(q.l) + '</span><input type="range" data-bk="' + q.k + '" min="' + q.min + '" max="' + q.max + '" step="' + (q.step || 1) + '" value="' + v + '"><output>' + v + (q.unit || '') + '</output></label>';
    };
    UI.modal('<h2>' + esc(def.label) + '</h2><p class="sec-note">Nesnede canlı önizlenir · Sonradan Özellikler panelinden yeniden düzenlenebilir</p>' + def.params.map(ctl).join('') +
      '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Tamam</button></div>', (root, close) => {
      let raf = 0;
      const soon = () => raf || (raf = requestAnimationFrame(() => {
        raf = 0;
        MO.buildNfx(g, true);
      }));
      const read = (el) => {
        const q = def.params.find((x) => x.k === el.dataset.bk);
        e.p[q.k] = q.type === 'bool' ? el.checked : q.type === 'color' || q.type === 'select' ? el.value : +el.value;
        if (el.nextElementSibling && el.nextElementSibling.tagName === 'OUTPUT') el.nextElementSibling.textContent = el.value + (q.unit || '');
        soon();
      };
      root.addEventListener('input', (ev) => ev.target.closest('[data-bk]') && read(ev.target.closest('[data-bk]')));
      root.addEventListener('change', (ev) => ev.target.closest('[data-bk]') && read(ev.target.closest('[data-bk]')));
      root.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'no') {
          if (isNew) fx.stack.splice(i, 1);
          else e.p = JSON.parse(before);
          if (isNew && !fx.stack.length) {
            unwrap(g);
            VP.commit();
          } else MO.buildNfx(g);
          close();
          UI.schedule('dock', 'prop');
          return;
        }
        close();
        MO.buildNfx(g);
        VP.commit();
        UI.schedule('dock', 'prop');
      });
    });
  };
  MO.addMenu = (el) => {
    const cats = (IM && IM.CATS) || [];
    UI.popover(el, cats.map(([k, l]) => '<button class="pop-item" data-pick="' + k + '"><span>' + esc(l) + ' ▸</span></button>').join(''), (cat) => {
      const ids = Object.keys(E()).filter((k) => E()[k].cat === cat);
      UI.popover(el, '<div class="pop-head">' + esc((cats.find((c) => c[0] === cat) || [0, ''])[1]) + '</div>' + ids.map((k) => '<button class="pop-item" data-pick="' + k + '">' + esc(E()[k].label) + '</button>').join(''), (key) => MO.addEffect(key));
    });
  };
  MO.addEffect = (key) => {
    const it = one();
    if (!it) return VP.toast('Efekt eklemek için bir nesne seçin');
    const cur = FX.of(it);
    if (cur && cur.type !== 'nfx' && FX.ext(it) && ['paragraph', 'table'].includes(cur.type)) {
      /* text frames can carry effects too */
    }
    const g = MO.makeNfx(it, key);
    VP.setSelection([g]);
    MO.editEffect(g, g.data.effect.stack.length - 1, true);
  };

  /* ======================================================================
     LINKED PARAGRAPH FRAMES
     ====================================================================== */
  const isPara = (it) => FX.of(it) && FX.of(it).type === 'paragraph';
  const restOf = (g) => {
    const fx = g.data.effect;
    if (fx._rest != null) return fx._rest;
    if (!fx.overflow) return '';
    const m = TX.measurer(fx.font);
    const cols = Math.max(1, Math.round(fx.cols || 1));
    const gut = cols > 1 ? Math.max(0, fx.gutter || 0) : 0;
    const colW = Math.max(fx.font.size * 0.6, (fx.w - gut * (cols - 1)) / cols);
    const lines = TX.breakLines(fx.text, colW, m);
    const k = Math.max(0, lines.length - fx.overflow);
    return lines.slice(k).map((ln, i, arr) => ln.text + (i < arr.length - 1 ? (ln.last ? '\n' : ' ') : '')).join('');
  };
  const bp0 = TX.buildPara;
  let chainDepth = 0;
  TX.buildPara = (g) => {
    const fx = g.data.effect;
    if (fx && fx._rest != null) delete fx._rest;
    bp0(g);
    if (!fx || !fx.next || chainDepth > 40) return;
    const nx = byUid(fx.next);
    if (!nx || !isPara(nx) || nx === g) {
      delete fx.next;
      return;
    }
    const rest = restOf(g);
    fx.linkedOverflow = fx.overflow;
    fx.overflow = 0;
    const nfx = nx.data.effect;
    nfx.flowFrom = uidOf(g);
    nfx.text = rest;
    chainDepth++;
    try {
      FX.rebuild(nx);
    } finally {
      chainDepth--;
    }
  };
  const headOf = (g) => {
    let h = g;
    for (let k = 0; k < 40; k++) {
      const f = h.data.effect.flowFrom && byUid(h.data.effect.flowFrom);
      if (!f || !isPara(f) || f.data.effect.next !== uidOf(h)) break;
      h = f;
    }
    return h;
  };
  MO.link = () => {
    const ps = VP.sel.filter(isPara);
    if (ps.length < 2) return VP.toast('Bağlamak için iki (veya daha çok) paragraf metin çerçevesi seçin');
    // reading order: top to bottom, then left to right
    ps.sort((a, b) => (Math.abs(a.bounds.top - b.bounds.top) > 4 ? a.bounds.top - b.bounds.top : a.bounds.left - b.bounds.left));
    for (let i = 0; i < ps.length - 1; i++) {
      const a = ps[i].data.effect;
      const b = ps[i + 1].data.effect;
      // the following frames' own text joins the story
      if (b.text && b.text.trim() && !b.flowFrom) a.text = (a.text || '') + '\n' + b.text;
      a.next = uidOf(ps[i + 1]);
      b.flowFrom = uidOf(ps[i]);
    }
    FX.rebuild(headOf(ps[0]));
    VP.commit();
    VP.toast(ps.length + ' çerçeve bağlandı · Sığmayan metin sonraki çerçeveye akar');
  };
  MO.unlink = () => {
    const ps = VP.sel.filter(isPara);
    if (!ps.length) return;
    ps.forEach((g) => {
      const fx = g.data.effect;
      if (fx.next) {
        const nx = byUid(fx.next);
        if (nx) delete nx.data.effect.flowFrom;
        // what flowed on comes back to this frame's story
        delete fx.next;
      }
      if (fx.flowFrom) {
        const pv = byUid(fx.flowFrom);
        if (pv && pv.data.effect.next === uidOf(g)) delete pv.data.effect.next;
        delete fx.flowFrom;
      }
      FX.rebuild(g);
    });
    VP.commit();
    VP.toast('Çerçeve bağlantısı koparıldı');
  };
  // editing a following frame edits the whole story in the first frame
  const edit0 = TX.edit;
  if (edit0) {
    TX.edit = function (g, ...rest) {
      if (g && isPara(g) && g.data.effect.flowFrom) {
        const h = headOf(g);
        if (h !== g) {
          VP.toast('Bağlı metin ilk çerçevede düzenlenir');
          return edit0.call(this, h, ...rest);
        }
      }
      return edit0.call(this, g, ...rest);
    };
  }
  VP.overlayHooks = VP.overlayHooks || [];
  VP.overlayHooks.push((L) => {
    const s = 1 / paper.view.zoom;
    const col = new paper.Color(VP.colors.accent);
    const seen = new Set();
    VP.sel.filter(isPara).forEach((g0) => {
      let g = headOf(g0);
      for (let k = 0; k < 40 && g && !seen.has(g); k++) {
        seen.add(g);
        const nx = g.data.effect.next && byUid(g.data.effect.next);
        if (!nx) break;
        const a = g.bounds.bottomRight;
        const b = nx.bounds.topLeft;
        L.addChild(new paper.Path.Line({ from: a, to: b, strokeColor: col, strokeWidth: 1.4 * s, dashArray: [5 * s, 3 * s], insert: false }));
        L.addChild(new paper.Path.Circle({ center: b, radius: 4 * s, fillColor: col, insert: false }));
        g = nx;
      }
    });
  });

  /* ======================================================================
     CONVERT OUTLINE TO OBJECT
     ====================================================================== */
  const outlineShape = (p) => {
    const w = p.strokeWidth || 0;
    if (!(w > 0) || !p.strokeColor) return null;
    const h = w / 2;
    const loops = p instanceof paper.CompoundPath ? p.children : [p];
    const parts = [];
    loops.forEach((l) => {
      const q = l.clone({ insert: false });
      q.transform(p.matrix);
      if (q.closed) {
        const outer = FX.offsetItem(q, h);
        const inner = FX.offsetItem(q, -h);
        if (!outer) return;
        parts.push(inner ? outer.subtract(inner, { insert: false }) : outer);
        return;
      }
      // open path: both sides of the line and round or flat ends
      const L = q.length;
      if (!(L > 0)) return;
      const n = Math.max(8, Math.ceil(L / Math.max(0.3, Math.min(w / 2, L / 400))));
      const left = [];
      const right = [];
      for (let i = 0; i <= n; i++) {
        const s = (L * i) / n;
        const pt = q.getPointAt(Math.min(s, L));
        const nm = q.getNormalAt(Math.min(s, L));
        if (!pt || !nm) continue;
        left.push(pt.add(nm.multiply(h)));
        right.push(pt.subtract(nm.multiply(h)));
      }
      const cap = (c, from, round) => {
        // from: unit vector pointing out of the line end
        const pts = [];
        if (round) {
          for (let k = 1; k < 12; k++) pts.push(c.add(from.rotate(-90 + (180 * k) / 12).multiply(h)));
        } else if (p.strokeCap === 'square') {
          pts.push(c.add(from.rotate(-90).multiply(h)).add(from.multiply(h)), c.add(from.rotate(90).multiply(h)).add(from.multiply(h)));
        }
        return pts;
      };
      const round = p.strokeCap === 'round';
      const endDir = q.getTangentAt(L) || Pt(1, 0);
      const startDir = (q.getTangentAt(0) || Pt(1, 0)).negate();
      const pts = left.concat(cap(q.getPointAt(L), endDir, round).reverse(), right.reverse(), cap(q.getPointAt(0), startDir, round).reverse());
      let poly = new paper.Path({ segments: pts, closed: true, insert: false });
      try {
        poly = poly.resolveCrossings();
        poly.reorient(true, true);
      } catch (e) { /* keep as it is */ }
      parts.push(poly);
    });
    if (!parts.length) return null;
    let out = parts[0];
    for (let i = 1; i < parts.length; i++) out = out.unite(parts[i], { insert: false });
    out.fillColor = p.strokeColor.clone();
    out.strokeColor = null;
    out.opacity = p.opacity;
    return out;
  };
  MO.outlineToObject = () => {
    const items = VP.sel.filter((it) => (it instanceof paper.Path || it instanceof paper.CompoundPath) && it.strokeColor && it.strokeWidth > 0);
    if (!items.length) return VP.toast('Anahatlı bir eğri veya şekil seçin');
    const made = [];
    items.forEach((it) => {
      let o;
      try {
        o = outlineShape(it);
      } catch (e) {
        o = null;
      }
      if (!o) return;
      o.insertAbove(it);
      made.push(o);
      if (it.fillColor && it.fillColor.alpha !== 0) {
        it.strokeColor = null;
        delete it.data.param;
      } else it.remove();
    });
    if (!made.length) return VP.toast('Anahat şekle dönüştürülemedi');
    VP.setSelection(made);
    VP.commit();
    VP.toast(made.length + ' anahat nesneye dönüştürüldü' + (items.some((i) => i.data && i.data.dash && i.data.dash !== 'solid') ? ' · Kesik çizgiler düz şekle döner' : ''));
  };

  /* ======================================================================
     UNDO DOCKER
     ====================================================================== */
  let pending = null;
  const run0 = UI.run;
  UI.run = (id) => {
    if (A[id] && typeof id === 'string' && !/^(undo|redo|hsGo)/.test(id)) pending = A[id].label.replace(/…$/, '');
    try {
      return run0(id);
    } finally {
      setTimeout(() => (pending = null), 0);
    }
  };
  const pf0 = UI.propField;
  UI.propField = function (name) {
    if (!pending) pending = 'Özellik değişikliği';
    try {
      return pf0.apply(this, arguments);
    } finally {
      setTimeout(() => (pending = null), 0);
    }
  };
  const commitL = VP.commit;
  VP.commit = function () {
    const r = commitL.apply(this, arguments);
    const s = VP.hist.stack[VP.hist.i];
    if (s && !s.label) {
      let lab = pending;
      if (!lab) {
        const m = VP.TOOL_META[VP.toolId];
        lab = VP.toolId === 'select' ? 'Dönüştürme' : m ? m.label : 'Değişiklik';
      }
      s.label = lab;
      s.time = Date.now();
    }
    UI.panels && UI.dockTab === 'undo' && UI.schedule('dock');
    return r;
  };
  const reset0 = VP.resetHistory;
  VP.resetHistory = function () {
    const r = reset0.apply(this, arguments);
    if (VP.hist.stack[0]) VP.hist.stack[0].label = 'Belge açıldı';
    return r;
  };
  ['undo', 'redo'].forEach((k) => {
    const f = VP[k];
    VP[k] = function () {
      const r = f.apply(this, arguments);
      if (UI.dockTab === 'undo') UI.schedule('dock');
      return r;
    };
  });
  MO.goto = (k) => {
    const h = VP.hist;
    if (k < 0 || k >= h.stack.length || k === h.i) return;
    h.i = k;
    VP.restore(h.stack[k]);
    UI.schedule('dock', 'top');
  };
  const undoPanel = () => {
    const h = VP.hist;
    let html = '<div class="sec"><div class="sec-h"><h3>Geri alma</h3></div><p class="sec-note">Bir adıma dokunun: belge o duruma döner. Sonraki adımlar soluk görünür ve yinelenebilir.</p><div class="list">';
    for (let k = h.stack.length - 1; k >= 0; k--) {
      const s = h.stack[k];
      const cur = k === h.i;
      const fut = k > h.i;
      html += '<button class="obj-row' + (cur ? ' sel' : '') + '" data-act="hsGo:' + k + '" style="width:100%;border:0;border-bottom:1px solid var(--line);text-align:left;padding-left:10px;' + (fut ? 'opacity:.45;' : '') + '">' +
        '<span class="row-name">' + (cur ? '▶ ' : '') + esc(s.label || (k ? 'Adım ' + k : 'Başlangıç')) + '</span>' +
        (s.time ? '<small style="color:var(--muted);font-family:var(--font-num)">' + new Date(s.time).toTimeString().slice(0, 5) + '</small>' : '') + '</button>';
    }
    return html + '</div></div>';
  };
  UI.panels = UI.panels || {};
  UI.panels.undo = undoPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'undo')) UI.DOCKERS.push(['undo', 'Geri alma']);

  /* ======================================================================
     SHAPING DOCKER
     ====================================================================== */
  const OPS = [['weld', 'Kaynak', 'weld'], ['trim', 'Kırp', 'trim'], ['intersect', 'Kesişim', 'intersect'], ['exclude', 'Dışla', 'exclude'], ['simplify', 'Basitleştir', 'trim'], ['frontMinusBack', 'Önü eksi arka', 'trim'], ['backMinusFront', 'Arkası eksi ön', 'trim'], ['divide', 'Böl', 'intersect']];
  const SH = (MO.shaping = { op: 'weld', keepSrc: false, keepTgt: false });
  MO.shape = () => {
    const items = VP.zSort(VP.sel);
    if (items.length < 2) return VP.toast('En az iki nesne seçin · Hedef en alttaki nesnedir');
    const target = items[0];
    const copies = items.map((it) => ({ it, c: it.clone({ insert: false }), tgt: it === target }));
    const a = A[SH.op];
    if (!a || (a.enabled && !a.enabled())) return VP.toast('Bu işlem seçime uygulanamıyor');
    const n0 = VP.hist.i;
    pending = OPS.find((o) => o[0] === SH.op)[1];
    // the shaping commands save a step; the docker's choices are folded into the same step
    const c0 = VP.commit;
    let committed = false;
    VP.commit = function () {
      committed = true;
    };
    try {
      a.run();
    } finally {
      VP.commit = c0;
    }
    if (!committed) return;
    void n0;
    const result = VP.sel.slice();
    copies.forEach(({ it, c, tgt }) => {
      const keep = tgt ? SH.keepTgt : SH.keepSrc;
      const there = !!it.parent;
      if (keep && !there) {
        const ref = result[0] && result[0].parent ? result[0] : null;
        if (ref) c.insertBelow(ref);
        else VP.activeLayer.addChild(c);
      } else if (!keep && there && !result.includes(it)) it.remove();
    });
    VP.setSelection(result.filter((r) => r.parent));
    VP.commit();
  };
  const shapingPanel = () => {
    let h = '<div class="sec"><div class="sec-h"><h3>Şekillendirme</h3></div><div class="grid-btns" style="grid-template-columns:repeat(2,1fr)">' +
      OPS.map(([k, l, i]) => '<button class="btn' + (SH.op === k ? ' on' : '') + '" data-act="shOp:' + k + '">' + ic(i, 'sm') + esc(l) + '</button>').join('') + '</div>';
    h += '<div class="row"><button class="btn' + (SH.keepSrc ? ' on' : '') + '" data-act="shKeep:src" aria-pressed="' + SH.keepSrc + '">' + (SH.keepSrc ? '☑' : '☐') + ' Kaynak nesneler kalsın</button></div>' +
      '<div class="row"><button class="btn' + (SH.keepTgt ? ' on' : '') + '" data-act="shKeep:tgt" aria-pressed="' + SH.keepTgt + '">' + (SH.keepTgt ? '☑' : '☐') + ' Hedef nesne kalsın</button></div>' +
      '<p class="sec-note">Hedef, seçimdeki en alttaki nesnedir; diğerleri kaynaktır. Sonuç hedefin dolgusunu ve anahatını alır.</p>' +
      '<button class="btn primary" data-act="shRun"' + (VP.sel.length > 1 ? '' : ' disabled') + '>' + esc(OPS.find((o) => o[0] === SH.op)[1]) + ' uygula</button></div>';
    return h;
  };
  UI.panels.shaping = shapingPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'shaping')) UI.DOCKERS.push(['shaping', 'Şekillendirme']);

  /* ======================================================================
     COPY / CLONE EFFECT FROM
     ====================================================================== */
  const POS_KEYS = ['vp', 'cx', 'cy', 'hx', 'hy'];
  const GEO_KEYS = ['rect', 'nodes', 'quad', 'source', 'made', 'untouched'];
  const NOT_EFFECTS = ['paragraph', 'textpath', 'table', 'dimension', 'connector', 'code', 'impact', 'symmetry', 'blend', 'powerclip', 'nfx'];
  const mapRel = (p, r0, r1) => [r1.x + ((p[0] - r0.x) / (r0.width || 1)) * r1.width, r1.y + ((p[1] - r0.y) / (r0.height || 1)) * r1.height];
  MO.copyEffect = (from, to, clone) => {
    const fx0 = FX.of(from);
    if (from.data.shadow && !fx0) {
      to.data.shadow = JSON.parse(JSON.stringify(from.data.shadow));
      if (VP.applyShadowProps) VP.applyShadowProps(to);
      return to;
    }
    if (!fx0) return null;
    if (fx0.type === 'nfx') {
      const g = MO.makeNfx(to, fx0.stack[0].key, fx0.stack[0].p);
      g.data.effect.stack = JSON.parse(JSON.stringify(fx0.stack));
      g.data.effect.dpi = fx0.dpi;
      MO.buildNfx(g);
      if (clone) g.data.fxClone = uidOf(from);
      return g;
    }
    if (NOT_EFFECTS.includes(fx0.type)) return null;
    if (FX.isFx(to)) return null;
    if (fx0.type === 'envelope' || fx0.type === 'perspective') {
      const prevSel = VP.sel;
      const c0 = VP.commit;
      VP.commit = () => {};
      let g;
      try {
        g = FX.addWarp(to, fx0.type);
      } finally {
        VP.commit = c0;
      }
      if (!g) return null;
      const fx = g.data.effect;
      const r0 = new paper.Rectangle(fx0.rect[0], fx0.rect[1], fx0.rect[2], fx0.rect[3]);
      const r1 = new paper.Rectangle(fx.rect[0], fx.rect[1], fx.rect[2], fx.rect[3]);
      const key = fx0.type === 'envelope' ? 'nodes' : 'quad';
      Object.keys(fx0[key]).forEach((k) => (fx[key][k] = mapRel(fx0[key][k], r0, r1)));
      if (fx0.mode) fx.mode = fx0.mode;
      FX.buildWarp(g);
      if (clone) g.data.fxClone = uidOf(from);
      void prevSel;
      return g;
    }
    const s0 = src(from);
    if (!s0) return null;
    const fx = JSON.parse(JSON.stringify(fx0));
    GEO_KEYS.forEach((k) => delete fx[k]);
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.insertAbove(to);
    g.addChild(to);
    to.data.effectSrc = true;
    // positions follow the target (vanishing point, centre…)
    const d = to.bounds.center.subtract(from.matrix.transform(s0.bounds.center));
    POS_KEYS.forEach((k) => {
      if (Array.isArray(fx[k]) && fx[k].length === 2) fx[k] = [fx[k][0] + d.x, fx[k][1] + d.y];
    });
    if (typeof fx.cx === 'number') fx.cx += d.x;
    if (typeof fx.cy === 'number') fx.cy += d.y;
    if (typeof fx.hx === 'number') fx.hx += d.x;
    if (typeof fx.hy === 'number') fx.hy += d.y;
    if (fx0.rect) {
      const b = to.bounds;
      fx.rect = [b.x, b.y, b.width, b.height];
    }
    g.data.effect = fx;
    try {
      FX.rebuild(g);
    } catch (e) {
      unwrap(g);
      return null;
    }
    if (clone) g.data.fxClone = uidOf(from);
    return g;
  };
  // clones follow their master's settings
  MO.syncClones = () => {
    let n = 0;
    topItems().forEach((g) => {
      if (!g.data || !g.data.fxClone) return;
      const m = byUid(g.data.fxClone);
      const fm = FX.of(m);
      const fx = FX.of(g);
      if (!fm || !fx || fm.type !== fx.type) return;
      let changed = false;
      Object.keys(fm).forEach((k) => {
        if (GEO_KEYS.includes(k) || POS_KEYS.includes(k)) return;
        const a = JSON.stringify(fm[k]);
        if (a !== JSON.stringify(fx[k])) {
          fx[k] = JSON.parse(a);
          changed = true;
        }
      });
      if (changed) {
        FX.rebuild(g);
        n++;
      }
    });
    return n;
  };
  const commitS = VP.commit;
  VP.commit = function () {
    try {
      MO.syncClones();
    } catch (e) { /* never blocks saving */ }
    return commitS.apply(this, arguments);
  };
  MO.pick = null;
  MO.startPick = (clone) => {
    if (!VP.sel.length) return VP.toast('Önce efektin uygulanacağı nesneleri seçin');
    MO.pick = { clone, targets: VP.sel.slice() };
    VP.toast((clone ? 'Klonlanacak' : 'Kopyalanacak') + ' efektin bulunduğu nesneye dokunun · Esc: vazgeç');
  };
  addEventListener('pointerdown', (e) => {
    if (!MO.pick) return;
    const cv = document.querySelector('#canvas');
    if (e.target !== cv) {
      if (!e.target.closest || !e.target.closest('.popover,.modal-wrap')) MO.pick = null;
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const pt = paper.view.viewToProject(Pt(e.clientX - r.left, e.clientY - r.top));
    const hit = VP.hitItem(pt);
    const pk = MO.pick;
    MO.pick = null;
    if (!hit || pk.targets.includes(hit)) return VP.toast('Efekt alınmadı');
    if (!FX.isFx(hit) && !hit.data.shadow) return VP.toast('Bu nesnede kopyalanabilir efekt yok');
    const out = [];
    pk.targets.forEach((t) => {
      if (!t.parent) return;
      const g = MO.copyEffect(hit, t, pk.clone);
      if (g) out.push(g);
    });
    if (!out.length) return VP.toast('Bu efekt seçili nesnelere kopyalanamadı (önce mevcut efektleri ayırın)');
    VP.setSelection(out);
    pending = pk.clone ? 'Efekt klonlandı' : 'Efekt kopyalandı';
    VP.commit();
    VP.toast((FX.of(hit) ? FX.describe(hit) : 'Gölge') + (pk.clone ? ' klonlandı · Ana nesne değişince kopyalar da değişir' : ' kopyalandı'));
  }, true);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && MO.pick) {
      MO.pick = null;
      VP.toast('Vazgeçildi');
    }
  });

  /* ======================================================================
     PASTE SPECIAL
     ====================================================================== */
  MO.pasteSpecial = () => {
    const has = VP.clipboard.length > 0;
    const opts = [
      ['obj', 'Nesne olarak (düzenlenebilir)', has],
      ['place', 'Yerinde yapıştır (aynı konuma)', has],
      ['curves', 'Eğri olarak (metinler ve efektler şekle döner)', has],
      ['bitmap', 'Biteşlem olarak (resim)', has],
      ['text', 'Düz metin olarak (sistem panosundan)', !!(navigator.clipboard && navigator.clipboard.readText)],
      ['image', 'Resim olarak (sistem panosundan)', !!(navigator.clipboard && navigator.clipboard.read)]
    ];
    UI.modal('<h2>Özel yapıştır</h2><p>' + (has ? 'Panoda ' + VP.clipboard.length + ' nesne var.' : 'Uygulama panosu boş; sistem panosundan metin veya resim yapıştırabilirsiniz.') + '</p>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' + opts.map(([k, l, ok]) => '<button class="btn" style="justify-content:flex-start" data-ps="' + k + '"' + (ok ? '' : ' disabled') + '>' + esc(l) + '</button>').join('') + '</div>' +
      '<div class="actions"><button class="btn" data-x="no">Vazgeç</button></div>', (root, close) => {
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-x]')) return close();
        const b = e.target.closest('[data-ps]');
        if (!b) return;
        close();
        await MO.pasteAs(b.dataset.ps);
      });
    });
  };
  const pasteItems = (offset) => {
    VP.ensureLayer();
    const items = VP.clipboard.map((json) => VP.activeLayer.importJSON(json));
    if (offset) VP.T.move(items, Pt(VP.toPT(5), VP.toPT(5)));
    return items;
  };
  MO.pasteAs = async (how) => {
    pending = 'Özel yapıştır';
    if (how === 'obj') return VP.paste();
    if (how === 'place') {
      const items = pasteItems(false);
      VP.setSelection(items);
      return VP.commit();
    }
    if (how === 'curves') {
      const items = pasteItems(true);
      const out = items.map((it) => {
        if (FX.isFx(it)) {
          FX.bake(it);
        }
        return it;
      });
      VP.setSelection(out);
      if (A.toCurves && (!A.toCurves.enabled || A.toCurves.enabled())) {
        const c0 = VP.commit;
        VP.commit = () => {};
        try {
          A.toCurves.run();
        } finally {
          VP.commit = c0;
        }
      }
      return VP.commit();
    }
    if (how === 'bitmap') {
      const items = pasteItems(true);
      const g = new paper.Group({ insert: false });
      items.forEach((it) => g.addChild(it.clone({ insert: false })));
      let r;
      try {
        r = g.rasterize(150, false);
      } catch (e) {
        items.forEach((it) => it.remove());
        return VP.toast('Biteşlem oluşturulamadı');
      }
      r.insertAbove(items[items.length - 1]);
      items.forEach((it) => it.remove());
      VP.setSelection([r]);
      VP.commit();
      return VP.toast('Biteşlem olarak yapıştırıldı (150 dpi)');
    }
    if (how === 'text') {
      let s = '';
      try {
        s = await navigator.clipboard.readText();
      } catch (e) {
        return VP.toast('Sistem panosu okunamadı (izin verilmedi)');
      }
      if (!s.trim()) return VP.toast('Sistem panosunda metin yok');
      VP.ensureLayer();
      const d = VP.defaults;
      const c = paper.view.center;
      if (s.length > 80 || s.includes('\n')) {
        const w = Math.min(VP.page().w * 0.7, VP.toPT(150));
        const g = TX.createParagraph(new paper.Rectangle(c.x - w / 2, c.y - 40, w, 80), s, { autoH: true });
        VP.setSelection([g]);
      } else {
        const t = new paper.PointText({ point: c, content: s, fontFamily: d.fontFamily || 'Fira Sans', fontSize: d.fontSize || 24, fillColor: d.fill || '#1d1d1b' });
        VP.activeLayer.addChild(t);
        VP.setSelection([t]);
      }
      VP.commit();
      return VP.toast('Metin yapıştırıldı');
    }
    if (how === 'image') {
      try {
        const its = await navigator.clipboard.read();
        for (const ci of its) {
          const type = ci.types.find((t) => /^image\//.test(t));
          if (!type) continue;
          const blob = await ci.getType(type);
          const url = await new Promise((res) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(blob);
          });
          VP.ensureLayer();
          const r = new paper.Raster({ source: url, insert: false });
          r.onLoad = () => {
            VP.activeLayer.addChild(r);
            const p = VP.page();
            if (r.bounds.width > p.w * 0.8) r.scale((p.w * 0.8) / r.bounds.width);
            r.position = paper.view.center;
            VP.setSelection([r]);
            VP.commit();
            VP.toast('Resim yapıştırıldı');
          };
          return;
        }
        VP.toast('Sistem panosunda resim yok');
      } catch (e) {
        VP.toast('Sistem panosu okunamadı (izin verilmedi)');
      }
    }
  };

  /* ======================================================================
     property bar / docker hooks, actions, menus
     ====================================================================== */
  MO.act = (id, el) => {
    const [k, arg] = id.split(':');
    const g = fxOne('nfx');
    switch (k) {
      case 'nfxAdd': MO.addMenu(el); return true;
      case 'nfxDock': UI.openDock('props'); return true;
      case 'nfxOn':
        if (g) {
          const e = g.data.effect.stack[+arg];
          e.on = e.on === false;
          MO.buildNfx(g);
          VP.commit();
        }
        return true;
      case 'nfxEdit': if (g) MO.editEffect(g, +arg, false); return true;
      case 'nfxUp':
      case 'nfxDown':
        if (g) {
          const st = g.data.effect.stack;
          const i = +arg;
          const j = k === 'nfxUp' ? i - 1 : i + 1;
          if (j >= 0 && j < st.length) {
            [st[i], st[j]] = [st[j], st[i]];
            MO.buildNfx(g);
            VP.commit();
          }
        }
        return true;
      case 'nfxDel':
        if (g) {
          g.data.effect.stack.splice(+arg, 1);
          if (!g.data.effect.stack.length) VP.setSelection(unwrap(g));
          else MO.buildNfx(g);
          VP.commit();
        }
        return true;
      case 'hsGo': MO.goto(+arg); return true;
      case 'shOp': SH.op = arg; UI.renderDock(true); return true;
      case 'shKeep': if (arg === 'src') SH.keepSrc = !SH.keepSrc; else SH.keepTgt = !SH.keepTgt; UI.renderDock(true); return true;
      case 'shRun': MO.shape(); return true;
      default: return false;
    }
  };
  MO.propField = (name, raw) => {
    if (name === 'nfxDpi') {
      const g = fxOne('nfx');
      if (g) {
        g.data.effect.dpi = clamp(+raw || 150, 36, 600);
        MO.buildNfx(g);
        VP.commit();
      }
    }
    return true;
  };
  const tpf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^nfx/.test(n) ? MO.propField(n, r, el) : tpf0(n, r, el));
  const tact0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^(nfx|hsGo|sh(Op|Keep|Run))/.test(id) ? MO.act(id, el) : tact0(id, el));
  Object.assign(A, {
    nfxAddA: { label: 'Efekt ekle (tahribatsız)…', icon: 'bmpfx', enabled: () => VP.sel.length === 1, run: () => MO.addMenu(document.querySelector('.menu-btn[data-menu="effects"]') || document.querySelector('#btn-menu-all') || document.body) },
    txLink: { label: 'Çerçeveleri bağla', enabled: () => VP.sel.filter(isPara).length >= 2, run: () => MO.link() },
    txUnlink: { label: 'Çerçeve bağlantısını kopar', enabled: () => VP.sel.some((g) => isPara(g) && (g.data.effect.next || g.data.effect.flowFrom)), run: () => MO.unlink() },
    outlineToObj: { label: 'Anahattı nesneye dönüştür', icon: 'outlinePen', kbd: 'Ctrl+Shift+Q', enabled: () => VP.sel.some((it) => it.strokeColor && it.strokeWidth > 0), run: () => MO.outlineToObject() },
    dockUndo: { label: 'Geri alma paneli', icon: 'undo', run: () => UI.openDock('undo') },
    dockShaping: { label: 'Şekillendirme paneli', icon: 'weld', run: () => UI.openDock('shaping') },
    fxCopyFrom: { label: 'Efekti kopyala (şuradan)…', enabled: () => VP.sel.length > 0, run: () => MO.startPick(false) },
    fxCloneFrom: { label: 'Efekti klonla (şuradan)…', enabled: () => VP.sel.length > 0, run: () => MO.startPick(true) },
    pasteSpecial: { label: 'Özel yapıştır…', run: () => MO.pasteSpecial() }
  });
  ins('edit', 'paste', ['pasteSpecial']);
  ins('effects', null, ['|', 'nfxAddA', 'fxCopyFrom', 'fxCloneFrom']);
  ins('text', null, ['|', 'txLink', 'txUnlink']);
  ins('object', 'toCurves', ['outlineToObj']);
  ins('object', null, ['dockShaping']);
  ins('window', 'dockCoords', ['dockUndo', 'dockShaping']);
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'Q' || e.key === 'q') && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
      e.preventDefault();
      UI.run('outlineToObj');
    }
  });
})();
