/* VektörPad document features: master layers (shared by every page), facing pages, comments (tool and
   docker), the object manager as a tree, the page tool (drag the page edges) and workspace presets. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const TX = VP.tx;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const A = VP.actions;
  const T = VP.tools;
  const DC = (VP.docx = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);

  /* =============== master layers =============== */
  // Layers marked as master are copied to every page: the live copy is stored in the document on every
  // save point and put back into each page when it is opened (and when pages are exported).
  const isMaster = (L) => !!(L && L.data && L.data.master);
  const capture = () => {
    const ls = VP.userLayers();
    const ms = ls.filter(isMaster);
    const ext = VP.ext();
    if (!ms.length && !ext.masters) return;
    ext.masters = ms.map((L) => ({ json: L.exportJSON({ asString: true, precision: 4 }), index: ls.indexOf(L) }));
    if (!ms.length && ext._hadMasters === false) delete ext.masters;
  };
  const sp0 = VP.storePage;
  VP.storePage = () => {
    if (!DC._loading) capture();
    sp0();
  };
  const placeMasters = () => {
    const ms = VP.ext().masters;
    if (!ms) return;
    VP.userLayers().filter(isMaster).forEach((L) => L.remove());
    ms.forEach((m) => {
      const L = new paper.Layer({ insert: false });
      L.importJSON(m.json);
      const ls = VP.userLayers();
      if (!ls.length) paper.project.addLayer(L);
      else if (m.index >= ls.length) L.insertAbove(ls[ls.length - 1]);
      else L.insertBelow(ls[m.index]);
    });
    VP.keepSysOrder();
    if (!VP.userLayers().includes(VP.activeLayer)) VP.activeLayer = VP.userLayers().filter((L) => !isMaster(L)).pop() || VP.userLayers().pop();
  };
  const lp0 = VP.loadPage;
  VP.loadPage = (i, opts) => {
    DC._loading = true;
    try {
      lp0(i, opts);
      placeMasters();
    } finally {
      DC._loading = false;
    }
    VP.drawPage();
  };
  DC.toggleMaster = (L) => {
    L = L || VP.activeLayer;
    if (!L) return;
    L.data.master = !isMaster(L);
    if (!L.data.master) delete L.data.master;
    if (isMaster(L) && !/^Ana:/.test(L.name || '')) L.name = 'Ana: ' + (L.name || 'Katman');
    if (!isMaster(L)) L.name = String(L.name || '').replace(/^Ana:\s*/, '');
    VP.commit();
    VP.toast(isMaster(L) ? 'Ana katman: bu katman tüm sayfalarda görünür' : 'Katman artık yalnızca bu sayfada');
  };
  VP.io.exportHooks = VP.io.exportHooks || [];
  VP.io.exportHooks.unshift((proj, index, opts) => {
    const ms = VP.ext().masters;
    if (!ms || (opts && opts.layersJSON)) return;
    proj.layers.filter(isMaster).forEach((L) => L.remove());
    ms.forEach((m) => {
      const L = new paper.Layer({ insert: false });
      L.importJSON(m.json);
      if (!L.visible) return;
      const ls = proj.layers;
      if (!ls.length || m.index >= ls.length) proj.addLayer(L);
      else proj.insertLayer(m.index, L);
    });
  });

  /* =============== facing pages =============== */
  DC.partner = (i) => {
    const n = VP.doc.pages.length;
    if (n < 2) return -1;
    if (i === 0) return -1;
    const j = i % 2 === 1 ? i + 1 : i - 1;
    return j > 0 && j < n ? j : -1;
  };
  const dp0 = VP.drawPage;
  VP.drawPage = () => {
    dp0();
    if (!VP.settings.facing || !VP.bgLayer) return;
    const i = VP.doc.active;
    const j = DC.partner(i);
    if (j < 0) return;
    const p = VP.page();
    const q = VP.doc.pages[j];
    const left = j < i;
    const ox = left ? -q.w : p.w;
    const g = new paper.Group({ insert: false, name: 'facing' });
    const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(ox, 0, q.w, q.h), fillColor: q.bg || '#ffffff', insert: false });
    r.shadowColor = new paper.Color(0, 0, 0, 0.2);
    r.shadowBlur = 10;
    g.addChild(r);
    const content = new paper.Group({ insert: false });
    const ms = VP.ext().masters;
    try {
      (q.layers || []).forEach((json) => {
        const L = new paper.Layer({ insert: false });
        L.importJSON(json);
        if (!L.visible || (ms && isMaster(L))) return;
        content.addChildren(L.removeChildren());
      });
      (ms || []).forEach((m) => {
        const L = new paper.Layer({ insert: false });
        L.importJSON(m.json);
        if (L.visible) content.addChildren(L.removeChildren());
      });
    } catch (e) {
      console.error(e);
    }
    content.translate(Pt(ox, 0));
    const clip = new paper.Group({ insert: false });
    clip.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(ox, 0, q.w, q.h), insert: false }));
    clip.addChild(content);
    clip.clipped = true;
    g.addChild(clip);
    g.addChild(new paper.Path.Line({ from: [left ? 0 : p.w, 0], to: [left ? 0 : p.w, Math.max(p.h, q.h)], strokeColor: new paper.Color(0, 0, 0, 0.18), strokeWidth: 1, insert: false }));
    g.data.facing = j;
    VP.bgLayer.insertChild(0, g);
  };
  DC.toggleFacing = () => {
    VP.settings.facing = !VP.settings.facing;
    VP.io.savePrefs();
    VP.drawPage();
    if (VP.settings.facing) {
      const v = paper.view;
      const j = DC.partner(VP.doc.active);
      const p = VP.page();
      if (j >= 0) {
        const q = VP.doc.pages[j];
        const both = new paper.Rectangle(0, 0, p.w, p.h).unite(new paper.Rectangle(j < VP.doc.active ? -q.w : p.w, 0, q.w, q.h));
        const vs = v.viewSize;
        v.zoom = clamp(Math.min((vs.width - 80) / both.width, (vs.height - 80) / both.height), VP.ZMIN, VP.ZMAX);
        v.center = both.center;
        VP.viewChanged();
      } else VP.toast('Bu sayfanın karşısında sayfa yok · İlk sayfa tek başına sağda durur');
    } else VP.fitPage();
    VP.toast('Karşılıklı sayfalar ' + (VP.settings.facing ? 'açık' : 'kapalı'));
  };
  VP.on('page', () => VP.settings.facing && VP.drawPage());

  /* =============== comments =============== */
  const comments = (p = VP.page()) => p.comments || [];
  const setComments = (arr, p = VP.page()) => {
    p.comments = arr;
  };
  DC.addComment = async (pt) => {
    const text = await UI.prompt({ title: 'Yorum ekle', label: 'Yorum', value: '', ok: 'Ekle' });
    if (!text || !text.trim()) return;
    const c = { id: VP.uid(), x: pt.x, y: pt.y, text: text.trim(), author: VP.settings.author || 'Ben', time: new Date().toISOString(), done: false };
    setComments(comments().concat([c]));
    VP.commit();
    UI.schedule('dock');
    VP.drawOverlay();
  };
  DC.editComment = (id) => {
    const c = comments().find((x) => x.id === id);
    if (!c) return;
    UI.modal(
      '<h2>Yorum</h2><p class="sec-note">' + esc(c.author) + ' · ' + new Date(c.time).toLocaleString('tr-TR') + '</p>' +
        '<textarea id="cm-t" style="width:100%;min-height:110px;font:15px/1.45 \'Fira Sans\',sans-serif;padding:8px;border-radius:8px;border:1px solid var(--line)" lang="tr" spellcheck="true">' + esc(c.text) + '</textarea>' +
        '<div class="actions"><button class="btn danger" data-x="del">Sil</button><button class="btn" data-x="done">' + (c.done ? 'Yeniden aç' : 'Çözüldü') + '</button><button class="btn" data-x="no">Kapat</button><button class="btn primary" data-x="yes">Kaydet</button></div>',
      (root, close) => {
        root.addEventListener('click', (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          const k = x.dataset.x;
          if (k !== 'no') {
            const t = root.querySelector('#cm-t').value.trim();
            let arr = comments().map((o) => (o.id === id ? Object.assign({}, o, k === 'yes' ? { text: t || o.text } : k === 'done' ? { done: !o.done } : {}) : o));
            if (k === 'del') arr = arr.filter((o) => o.id !== id);
            setComments(arr);
            VP.commit();
            UI.schedule('dock');
            VP.drawOverlay();
          }
          close();
        });
      }
    );
  };
  const pinAt = (pt) => {
    if (VP.settings.hideComments) return null;
    const r = 13 / zoom();
    return comments().slice().reverse().find((c) => Pt(c.x, c.y).getDistance(pt) <= r * 1.3) || null;
  };
  VP.overlayHooks = VP.overlayHooks || [];
  VP.overlayHooks.push((L) => {
    if (VP.settings.hideComments) return;
    const cs = comments();
    if (!cs.length) return;
    const s = 1 / zoom();
    cs.forEach((c, i) => {
      const p = Pt(c.x, c.y);
      const col = c.done ? new paper.Color('#3aaa35') : new paper.Color('#f9b200');
      const b = new paper.Path({ segments: [p, p.add(Pt(-4 * s, -9 * s)), p.add(Pt(-12 * s, -9 * s)), p.add(Pt(-12 * s, -27 * s)), p.add(Pt(12 * s, -27 * s)), p.add(Pt(12 * s, -9 * s)), p.add(Pt(4 * s, -9 * s))], closed: true, fillColor: col, strokeColor: '#1d1d1b', strokeWidth: 1.2 * s, insert: false });
      L.addChild(b);
      L.addChild(new paper.PointText({ point: p.add(Pt(0, -14 * s)), content: String(i + 1), justification: 'center', fontFamily: 'Fira Sans', fontWeight: 'bold', fontSize: 11 * s, fillColor: '#1d1d1b', insert: false }));
    });
  });
  T.commentTool = {
    cursor: 'crosshair',
    busy() { return false; },
    down(e) {
      const c = pinAt(e.point.add(Pt(0, 0)));
      if (c) return DC.editComment(c.id);
      const c2 = comments().slice().reverse().find((x) => {
        const p = Pt(x.x, x.y);
        const s = 1 / zoom();
        return new paper.Rectangle(p.add(Pt(-12 * s, -27 * s)), p.add(Pt(12 * s, 0))).contains(e.point);
      });
      if (c2) return DC.editComment(c2.id);
      DC.addComment(e.point);
    },
    move() {},
    up() {},
    cancel() {}
  };
  const commentsPanel = () => {
    const cs = comments();
    let h = '<div class="sec"><div class="sec-h"><h3>Yorumlar · ' + esc(VP.page().name) + '</h3><button class="btn" data-act="zdCmTool">' + ic('plus', 'sm') + 'Yorum</button></div>';
    h += '<div class="row"><label class="field wide"><span>Yazar</span><input data-pf="zdAuthor" value="' + esc(VP.settings.author || 'Ben') + '" style="width:120px"></label><button class="btn' + (VP.settings.hideComments ? '' : ' on') + '" data-act="zdCmShow">' + (VP.settings.hideComments ? 'Gizli' : 'Görünür') + '</button></div>';
    if (!cs.length) h += '<p class="sec-note">Bu sayfada yorum yok · Yorum aracıyla sayfaya dokunarak not bırakın. Yorumlar dışa aktarılmaz.</p>';
    cs.forEach((c, i) => {
      h += '<div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:6px;border-top:1px solid var(--line);padding-top:6px"><b style="min-width:20px;text-align:center;border-radius:4px;background:' + (c.done ? '#3aaa35' : '#f9b200') + ';color:#1d1d1b">' + (i + 1) + '</b>' +
        '<span style="flex:1;min-width:0;cursor:pointer" data-act="zdCmGo:' + c.id + '"><span style="display:block;white-space:pre-wrap;' + (c.done ? 'text-decoration:line-through;opacity:.6' : '') + '">' + esc(c.text) + '</span><small style="opacity:.6">' + esc(c.author) + ' · ' + new Date(c.time).toLocaleDateString('tr-TR') + '</small></span>' +
        '<button class="row-btn" data-act="zdCmEdit:' + c.id + '" aria-label="Düzenle">' + ic('text', 'sm') + '</button></div>';
    });
    const others = VP.doc.pages.reduce((a, p, i) => a + (i === VP.doc.active ? 0 : (p.comments || []).filter((c) => !c.done).length), 0);
    if (others) h += '<p class="sec-note">Diğer sayfalarda ' + others + ' açık yorum var.</p>';
    return h + '</div>';
  };

  /* =============== object manager (tree) =============== */
  const open = new Set();
  const itemAt = (path) => {
    const parts = path.split('.').map(Number);
    let it = VP.userLayers()[parts[0]];
    for (let k = 1; k < parts.length && it; k++) it = it.children[parts[k]];
    return it;
  };
  const expandable = (it) => it instanceof paper.Group && !FX.isFx(it) && it.children.length > 0;
  const objectsTree = () => {
    const ls = VP.userLayers();
    let h = '<div class="sec"><div class="sec-h"><h3>Nesne yöneticisi</h3><button class="btn" data-act="addLayer">' + ic('plus', 'sm') + 'Katman</button></div><div class="list">';
    const rowFor = (it, path, depth, li, ci) => {
      const sel = VP.sel.includes(it);
      const exp = expandable(it);
      const isOpen = open.has(it.id);
      const top = depth === 1;
      const act = top ? 'data-li="' + li + '" data-ci="' + ci + '"' : '';
      let r = '<div class="obj-row' + (sel ? ' sel' : '') + '" ' + act + ' style="padding-left:' + (6 + depth * 12) + 'px">' +
        (exp ? '<button class="row-btn" data-act="zdTree:' + path + '" aria-label="' + (isOpen ? 'Daralt' : 'Genişlet') + '" style="width:22px">' + ic(isOpen ? 'chevDown' : 'chevRight', 'sm') + '</button>' : '<span style="width:22px;display:inline-block"></span>') +
        '<span class="obj-kind">' + ic('kind_' + VP.kindOf(it), 'sm') + '</span>' +
        '<span class="row-name" data-act="' + (top ? 'objSel' : 'zdSel:' + path) + '">' + esc(VP.describe(it)) + (it.data && it.data.symbolId ? ' <small style="opacity:.6">◇</small>' : '') + '</span>' +
        '<button class="row-btn' + (it.visible ? '' : ' off') + '" data-act="' + (top ? 'objVis' : 'zdVis:' + path) + '" aria-label="Göster veya gizle">' + ic(it.visible ? 'eye' : 'eyeOff', 'sm') + '</button>' +
        '<button class="row-btn' + (it.locked ? '' : ' off') + '" data-act="' + (top ? 'objLock' : 'zdLock:' + path) + '" aria-label="Kilitle">' + ic(it.locked ? 'lock' : 'unlock', 'sm') + '</button></div>';
      if (exp && isOpen) it.children.slice().reverse().forEach((c) => (r += rowFor(c, path + '.' + it.children.indexOf(c), depth + 1)));
      return r;
    };
    ls.slice().reverse().forEach((L) => {
      const li = ls.indexOf(L);
      const active = L === VP.activeLayer;
      h += '<div class="layer-row' + (active ? ' active' : '') + '" data-li="' + li + '">' +
        '<button class="row-btn' + (L.visible ? '' : ' off') + '" data-act="layerVis" title="Göster/gizle" aria-label="Katmanı göster veya gizle">' + ic(L.visible ? 'eye' : 'eyeOff', 'sm') + '</button>' +
        '<span class="row-name" data-act="layerActivate">' + ic('layers', 'sm obj-kind') + ' ' + esc(L.name || 'Katman') + (isMaster(L) ? ' <small style="color:var(--accent)">ANA</small>' : '') + ' <small style="opacity:.55">(' + L.children.length + ')</small></span>' +
        '<button class="row-btn' + (L.locked ? '' : ' off') + '" data-act="layerLock" aria-label="Katmanı kilitle">' + ic(L.locked ? 'lock' : 'unlock', 'sm') + '</button>' +
        '<button class="row-btn" data-act="zdLayerMenu:' + li + '" aria-label="Katman seçenekleri">' + ic('menu', 'sm') + '</button></div>';
      L.children.slice().reverse().forEach((it) => {
        const ci = L.children.indexOf(it);
        h += rowFor(it, li + '.' + ci, 1, li, ci);
      });
    });
    h += '</div><p class="sec-note">Üstteki katman en öndedir · ▸ ile grupların içini açın · ANA katmanlar her sayfada görünür</p></div>';
    return h;
  };

  /* =============== page tool =============== */
  T.pageTool = {
    cursor: 'default',
    op: null,
    busy() { return !!(this.op && this.op.changed); },
    handles() {
      const p = VP.page();
      return [{ k: 'r', p: Pt(p.w, p.h / 2) }, { k: 'b', p: Pt(p.w / 2, p.h) }, { k: 'rb', p: Pt(p.w, p.h) }];
    },
    down(e) {
      const tol = (VP.coarse ? 24 : 12) / zoom();
      const h = this.handles().find((x) => x.p.getDistance(e.point) <= tol);
      if (h) {
        const p = VP.page();
        this.op = { k: h.k, w0: p.w, h0: p.h, start: e.point, changed: false };
        return;
      }
      // a tap on the facing page opens it
      const j = DC.partner(VP.doc.active);
      if (VP.settings.facing && j >= 0) {
        const p = VP.page();
        const q = VP.doc.pages[j];
        const r = new paper.Rectangle(j < VP.doc.active ? -q.w : p.w, 0, q.w, q.h);
        if (r.contains(e.point)) return VP.gotoPage(j);
      }
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      const p = VP.page();
      const d = e.point.subtract(op.start);
      const snap = (v) => (VP.settings.snap ? Math.round(VP.toMM(v)) : VP.toMM(v));
      if (op.k !== 'b') p.w = VP.toPT(Math.max(5, snap(op.w0 + d.x)));
      if (op.k !== 'r') p.h = VP.toPT(Math.max(5, snap(op.h0 + d.y)));
      op.changed = true;
      VP.drawPage();
      VP.drawOverlay();
      UI.schedule('prop', 'status');
    },
    up() {
      const op = this.op;
      this.op = null;
      if (op && op.changed) {
        VP.commit();
        VP.emit('page');
      }
    },
    cancel() {
      if (this.op && this.op.changed) VP.undoLive();
      this.op = null;
    },
    overlayAfter(L) {
      const s = 1 / zoom();
      const p = VP.page();
      L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(0, 0, p.w, p.h), strokeColor: acc(), strokeWidth: 1.5 * s, dashArray: [6 * s, 4 * s], insert: false }));
      this.handles().forEach((h) => L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(h.p.subtract((VP.coarse ? 8 : 6) * s), new paper.Size((VP.coarse ? 16 : 12) * s, (VP.coarse ? 16 : 12) * s)), fillColor: '#ffffff', strokeColor: acc(), strokeWidth: 1.5 * s, insert: false })));
      L.addChild(new paper.PointText({ point: Pt(p.w / 2, -8 * s), content: VP.num(VP.toMM(p.w), 1) + ' × ' + VP.num(VP.toMM(p.h), 1) + ' mm', justification: 'center', fontFamily: 'Fira Sans', fontSize: 12 * s, fillColor: acc(), insert: false }));
    }
  };

  /* =============== workspaces =============== */
  DC.WS = {
    default: { name: 'Varsayılan', bars: { std: true, prop: true, tools: true, status: true, palette: true, docpal: true }, dock: 'props', touch: false },
    touch: { name: 'Dokunmatik (büyük düğmeler)', bars: { std: true, prop: true, tools: true, status: false, palette: true, docpal: false }, dock: null, touch: true },
    lite: { name: 'Sade', bars: { std: false, prop: true, tools: true, status: false, palette: true, docpal: false }, dock: null, touch: false },
    illustration: { name: 'İllüstrasyon', bars: { std: true, prop: true, tools: true, status: true, palette: true, docpal: true }, dock: 'props', touch: false },
    layout: { name: 'Sayfa düzeni', bars: { std: true, prop: true, tools: true, status: true, palette: true, docpal: false }, dock: 'pages', touch: false, facing: true },
    focus: { name: 'Odak (yalnız çizim)', bars: { std: false, prop: false, tools: true, status: false, palette: false, docpal: false }, dock: null, touch: false }
  };
  const css = document.createElement('style');
  css.textContent = 'body.ws-touch .btn,body.ws-touch .pop-item{min-height:40px}body.ws-touch #toolbox .tool,body.ws-touch #toolbox button{min-width:46px;min-height:46px}body.ws-touch .swatch{width:30px;height:30px}body.ws-touch .row-btn{min-width:36px;min-height:36px}';
  document.head.appendChild(css);
  DC.applyWS = (id, quiet) => {
    const w = DC.WS[id];
    if (!w) return;
    VP.settings.workspace = id;
    VP.settings.bars = Object.assign({}, w.bars);
    UI.applyBars();
    document.body.classList.toggle('ws-touch', !!w.touch);
    const dock = document.getElementById('dock');
    if (w.dock) UI.openDock(w.dock);
    else if (dock && !dock.hidden) UI.toggleDock();
    if (!!w.facing !== !!VP.settings.facing && (w.facing || id === 'default')) DC.toggleFacing();
    VP.io.savePrefs();
    if (UI.fitToolbox) UI.fitToolbox();
    if (!quiet) VP.toast('Çalışma alanı: ' + w.name);
  };
  setTimeout(() => {
    if (VP.settings.workspace && DC.WS[VP.settings.workspace] && DC.WS[VP.settings.workspace].touch) document.body.classList.add('ws-touch');
  }, 0);

  /* =============== handlers =============== */
  DC.act = (id, el) => {
    const i = id.indexOf(':');
    const k = i < 0 ? id : id.slice(0, i);
    const arg = i < 0 ? '' : id.slice(i + 1);
    switch (k) {
      case 'zdTree': {
        const it = itemAt(arg);
        if (it) open.has(it.id) ? open.delete(it.id) : open.add(it.id);
        UI.renderDock(true);
        return true;
      }
      case 'zdSel': {
        const it = itemAt(arg);
        if (!it) return true;
        if (!it.visible || it.locked) return VP.toast('Gizli veya kilitli nesne seçilemez'), true;
        if (VP.toolId !== 'select' && VP.toolId !== 'node') VP.setTool('select');
        VP.setSelection([it]);
        UI.renderDock(true);
        return true;
      }
      case 'zdVis':
      case 'zdLock': {
        const it = itemAt(arg);
        if (!it) return true;
        if (k === 'zdVis') it.visible = !it.visible;
        else it.locked = !it.locked;
        VP.sel = VP.sel.filter((x) => x.visible && !x.locked);
        VP.commit();
        UI.renderDock(true);
        return true;
      }
      case 'zdLayerMenu': {
        const L = VP.userLayers()[+arg];
        if (!L) return true;
        const html = '<button class="pop-item" data-pick="master">' + (isMaster(L) ? 'Ana katman olmaktan çıkar' : 'Ana katman yap (tüm sayfalarda)') + '</button><button class="pop-item" data-pick="more">Diğer seçenekler…</button>';
        UI.popover(el, html, (p) => {
          if (p === 'master') DC.toggleMaster(L);
          else {
            const row = document.querySelector('#dock-body .layer-row[data-li="' + arg + '"] [data-act^="zdLayerMenu"]');
            UI.dockAct('layerMenu', row || el);
          }
        });
        return true;
      }
      case 'zdCmTool': VP.setTool('commentTool'); VP.toast('Yorum bırakmak için sayfaya dokunun'); return true;
      case 'zdCmShow':
        VP.settings.hideComments = !VP.settings.hideComments;
        VP.io.savePrefs();
        VP.drawOverlay();
        UI.renderDock(true);
        return true;
      case 'zdCmEdit': DC.editComment(arg); return true;
      case 'zdCmGo': {
        const c = comments().find((x) => x.id === arg);
        if (c) {
          paper.view.center = Pt(c.x, c.y);
          VP.viewChanged();
        }
        return true;
      }
      default:
        return false;
    }
  };
  const act0 = TX.act;
  TX.act = (id, el) => (/^zd/.test(id) ? DC.act(id, el) : act0(id, el));
  const pf0 = TX.propField;
  TX.propField = (n, r, el) => {
    if (n === 'zdAuthor') {
      VP.settings.author = String(r || '').trim() || 'Ben';
      VP.io.savePrefs();
      return true;
    }
    if (n === 'zdPageW' || n === 'zdPageH') {
      const v = VP.parseNum(r);
      const p = VP.page();
      if (v > 1) VP.setPageSize(n === 'zdPageW' ? v : VP.toMM(p.w), n === 'zdPageH' ? v : VP.toMM(p.h));
      return true;
    }
    return pf0(n, r, el);
  };
  const pb0 = TX.propbar;
  TX.propbar = () => {
    if (VP.toolId === 'pageTool') {
      const p = VP.page();
      return '<span class="pb-title">Sayfa aracı</span>' + H.field('En', 'zdPageW', VP.num(VP.toMM(p.w), 1)) + H.field('Boy', 'zdPageH', VP.num(VP.toMM(p.h), 1)) +
        H.btn('pagePresetMenu', 'Hazır boyut ▾', 'Hazır sayfa boyutları') + H.tog('facingPages', 'Karşılıklı', !!VP.settings.facing, 'Karşılıklı sayfalar') + '<span class="pb-label">Kenar tutamaçlarını sürükleyin</span>';
    }
    if (VP.toolId === 'commentTool') return '<span class="pb-title">Yorum</span><span class="pb-label">Not bırakmak için sayfaya dokunun · Bir yoruma dokunarak düzenleyin</span>' + H.btn('dockComments', 'Yorumlar', 'Yorumlar paneli');
    return pb0();
  };
  UI.panels = UI.panels || {};
  UI.panels.objects = objectsTree;
  UI.panels.comments = commentsPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'comments')) UI.DOCKERS.push(['comments', 'Yorumlar']);
  VP.on('page', () => UI.dockTab === 'comments' && UI.renderDock(true));

  Object.assign(VP.TOOL_META, {
    pageTool: { label: 'Sayfa', icon: 'pages', key: '', hint: 'Sayfanın sağ ve alt kenarını sürükleyerek boyutlandırın · Karşı sayfaya dokunarak ona geçin' },
    commentTool: { label: 'Yorum', icon: 'comment', key: '', hint: 'Sayfaya dokunun: yorum ekle · Bir yoruma dokunun: düzenle, çözüldü işaretle veya sil' }
  });
  Object.assign(A, {
    facingPages: { label: 'Karşılıklı sayfalar', checked: () => !!VP.settings.facing, run: DC.toggleFacing },
    masterLayer: { label: 'Etkin katmanı ana katman yap', checked: () => isMaster(VP.activeLayer), run: () => DC.toggleMaster() },
    dockComments: { label: 'Yorumlar', icon: 'text', run: () => UI.openDock('comments') },
    commentTool: { label: 'Yorum ekle', icon: 'text', run: () => VP.setTool('commentTool') },
    pageToolAct: { label: 'Sayfa aracı', icon: 'pages', run: () => VP.setTool('pageTool') },
    pagePresetMenu: {
      label: 'Hazır sayfa boyutu…',
      run: () => {
        const anchor = document.querySelector('[data-act="pagePresetMenu"]') || document.body;
        UI.popover(anchor, VP.PAGE_PRESETS.map((o) => '<button class="pop-item" data-pick="' + o.id + '">' + esc(o.label || o.id) + '</button>').join(''), (id) => {
          const o = VP.PAGE_PRESETS.find((x) => x.id === id);
          const p = VP.page();
          if (o) VP.setPageSize(p.w > p.h ? o.h : o.w, p.w > p.h ? o.w : o.h);
        });
      }
    },
    workspace: {
      label: 'Çalışma alanı ▸',
      run: () => {
        const anchor = document.querySelector('.menu-btn[data-menu="window"]') || document.getElementById('btn-menu-all') || document.body;
        const cur = VP.settings.workspace || 'default';
        UI.popover(anchor, Object.keys(DC.WS).map((k) => '<button class="pop-item" data-pick="' + k + '"><span>' + esc(DC.WS[k].name) + '</span>' + (k === cur ? '<span class="check">✓</span>' : '') + '</button>').join(''), (k) => DC.applyWS(k));
      }
    }
  });
  const M = UI.MENUS;
  if (M.window && !M.window.includes('workspace')) M.window.unshift('workspace', '|');
  if (M.window && !M.window.includes('dockComments')) M.window.push('dockComments');
  if (M.layout && !M.layout.includes('facingPages')) M.layout.push('|', 'facingPages', 'masterLayer', 'pageToolAct');
  if (M.view && !M.view.includes('commentTool')) M.view.push('|', 'commentTool');
})();
