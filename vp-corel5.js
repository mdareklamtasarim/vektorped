/* VektörPad Objects docker laid out like the desktop program (written for this app): a search box, a
   page tree (current page with its guides and layers; other pages one tap away), the master page with
   guides for all pages, master layers and the document grid; per layer show, lock, print/export and a
   layer colour; a bottom bar for new layer, new master layer and delete, and a row size slider.
   Layers switched off for printing are left out of every export. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const S = VP.settings;
  const FX = VP.fx;
  const A = VP.actions;
  const esc = UI.h.esc;
  const ic = UI.h.ic;
  const svg = (body) => '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  const I = {
    page: '<rect x="5" y="3" width="14" height="18"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    layers: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>',
    guides: '<path d="M4 8h16M14 3v18" stroke-dasharray="2.5 1.5"/>',
    grid: '<path d="M4 8h16M4 16h16M8 4v16M16 4v16"/>',
    print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1"/><path d="M7 14h10v6H7z"/>',
    noPrint: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1"/><path d="M7 14h10v6H7z"/><path d="M3 3l18 18"/>',
    newMaster: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/><path d="M18 2v6M15 5h6"/>',
    newLayer: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/><path d="M12 7v4M10 9h4"/>',
    viewPage: '<rect x="4" y="3" width="12" height="16"/><path d="M8 7h4M8 11h4"/><path d="M18 8v13H8"/>',
    viewLayer: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/><path d="M3 19l9 4 9-4" opacity=".5"/>'
  };
  const isMaster = (L) => !!(L && L.data && L.data.master);
  const openSet = new Set(['page', 'master']);
  const itemsOpen = (VP.k5open = new Set());
  const expandable = (it) => it instanceof paper.Group && !FX.isFx(it) && it.children.length > 0;
  const q = () => String(S.objQ || '').trim().toLocaleLowerCase('tr');
  const matches = (it) => {
    const s = q();
    if (!s) return true;
    if (String(VP.describe(it) || '').toLocaleLowerCase('tr').includes(s)) return true;
    return expandable(it) && it.children.some(matches);
  };
  const caret = (key, isOpen, path) =>
    '<button class="row-btn k5-car" data-act="' + (path ? 'zdTree:' + path : 'k5Open:' + key) + '" aria-label="' + (isOpen ? 'Daralt' : 'Genişlet') + '">' + ic(isOpen ? 'chevDown' : 'chevRight', 'sm') + '</button>';
  const sp = '<span class="k5-car"></span>';
  const rowSize = () => ['k5-s', 'k5-m', 'k5-l'][Math.max(0, Math.min(2, S.objRow == null ? 0 : S.objRow))];
  const objRow = (it, path, depth, li, ci) => {
    if (!matches(it)) return '';
    const sel = VP.sel.includes(it);
    const exp = expandable(it);
    const isOpen = exp && (itemsOpen.has(it.id) || !!q() || (VP.k5treeOpen && VP.k5treeOpen(it)));
    const top = depth === 1;
    const at = top ? 'data-li="' + li + '" data-ci="' + ci + '"' : '';
    let r = '<div class="obj-row k5-row' + (sel ? ' sel' : '') + '" ' + at + ' style="padding-left:' + (8 + depth * 14) + 'px">' +
      (exp ? caret(null, isOpen, path) : sp) +
      '<span class="obj-kind">' + ic('kind_' + VP.kindOf(it), 'sm') + '</span>' +
      '<span class="row-name" data-act="' + (top ? 'objSel' : 'zdSel:' + path) + '">' + esc(VP.describe(it)) + '</span>' +
      '<button class="row-btn' + (it.visible ? '' : ' off') + '" data-act="' + (top ? 'objVis' : 'zdVis:' + path) + '" aria-label="Göster veya gizle">' + ic(it.visible ? 'eye' : 'eyeOff', 'sm') + '</button>' +
      '<button class="row-btn' + (it.locked ? '' : ' off') + '" data-act="' + (top ? 'objLock' : 'zdLock:' + path) + '" aria-label="Kilitle">' + ic(it.locked ? 'lock' : 'unlock', 'sm') + '</button></div>';
    if (exp && isOpen) {
      if (!itemsOpen.has(it.id) && !q()) itemsOpen.add(it.id);
      it.children.slice().reverse().forEach((c) => (r += objRow(c, path + '.' + it.children.indexOf(c), depth + 1)));
    }
    return r;
  };
  const layerRow = (L, li, depth) => {
    const active = L === VP.activeLayer;
    const key = 'xL' + L.id;
    const showObjs = S.objView !== 'layers';
    const isOpen = showObjs && (!openSet.has(key) || !!q());
    const col = (L.data && L.data.color) || '#3b82f6';
    const noPrint = !!(L.data && L.data.noPrint);
    let r = '<div class="layer-row k5-row' + (active ? ' active' : '') + '" data-li="' + li + '" style="padding-left:' + (8 + depth * 14) + 'px">' +
      (showObjs && L.children.length ? caret(key, isOpen) : sp) +
      '<span class="obj-kind">' + svg(I.layers) + '</span>' +
      '<span class="row-name" data-act="layerActivate" title="Yeni nesneler bu katmana çizilir">' + (active ? '<b>' : '') + esc(L.name || 'Katman') + (active ? '</b>' : '') + (isMaster(L) ? ' <small class="k5-tag">ANA</small>' : '') + ' <small class="k5-n">' + L.children.length + '</small></span>' +
      '<button class="row-btn' + (L.visible ? '' : ' off') + '" data-act="layerVis" aria-label="Katmanı göster veya gizle" title="Göster / gizle">' + ic(L.visible ? 'eye' : 'eyeOff', 'sm') + '</button>' +
      '<button class="row-btn' + (L.locked ? '' : ' off') + '" data-act="layerLock" aria-label="Katmanı kilitle" title="Kilitle">' + ic(L.locked ? 'lock' : 'unlock', 'sm') + '</button>' +
      '<button class="row-btn' + (noPrint ? ' off' : '') + '" data-act="k5Print:' + li + '" aria-label="Yazdır ve dışa aktar" title="' + (noPrint ? 'Yazdırılmaz, dışa aktarılmaz' : 'Yazdırılır ve dışa aktarılır') + '">' + svg(noPrint ? I.noPrint : I.print) + '</button>' +
      '<label class="k5-sw" title="Katman rengi" style="background:' + esc(col) + '"><input type="color" data-pf="k5Color:' + li + '" value="' + esc(col) + '" aria-label="Katman rengi"></label>' +
      '<button class="row-btn" data-act="zdLayerMenu:' + li + '" aria-label="Katman seçenekleri">' + ic('menu', 'sm') + '</button></div>';
    if (isOpen) L.children.slice().reverse().forEach((it) => (r += objRow(it, li + '.' + L.children.indexOf(it), depth + 1, li, L.children.indexOf(it))));
    return r;
  };
  const sysRow = (icon, name, depth, on, act, title) =>
    '<div class="layer-row k5-row k5-sys" style="padding-left:' + (8 + depth * 14) + 'px">' + sp + '<span class="obj-kind">' + svg(icon) + '</span><span class="row-name">' + esc(name) + '</span>' +
    '<button class="row-btn' + (on ? '' : ' off') + '" data-act="' + act + '" aria-label="' + esc(title) + '" title="' + esc(title) + '">' + ic(on ? 'eye' : 'eyeOff', 'sm') + '</button></div>';
  const panel = () => {
    const ls = VP.userLayers();
    const pageName = VP.page().name || 'Sayfa ' + (VP.doc.active + 1);
    const view = S.objView || 'page';
    let h = '<div class="k5-search"><input type="search" data-pf="k5Q" value="' + esc(S.objQ || '') + '" placeholder="Ara" aria-label="Nesne ara" enterkeyhint="search"></div>';
    h += '<div class="k5-head">' +
      '<button class="btn icon-only' + (view === 'page' ? ' on' : '') + '" data-act="k5View:page" title="Sayfa görünümü (nesnelerle)" aria-pressed="' + (view === 'page') + '">' + svg(I.viewPage) + '</button>' +
      '<button class="btn icon-only' + (view === 'layers' ? ' on' : '') + '" data-act="k5View:layers" title="Katman yöneticisi görünümü" aria-pressed="' + (view === 'layers') + '">' + svg(I.viewLayer) + '</button>' +
      '<span class="k5-cur"><b>' + esc(pageName) + '</b> · ' + esc((VP.activeLayer && VP.activeLayer.name) || '') + '</span>' +
      '<button class="btn icon-only" data-act="k5Menu" title="Seçenekler" aria-label="Seçenekler">' + ic('gear', 'sm') + '</button></div>';
    h += '<div class="list k5-tree ' + rowSize() + '">';
    // other pages before the current one
    const pages = VP.doc.pages;
    const pageRow = (i, cur) => {
      const nm = pages[i].name || 'Sayfa ' + (i + 1);
      return '<div class="layer-row k5-row k5-page' + (cur ? ' cur' : '') + '" style="padding-left:6px">' + (cur ? caret('page', openSet.has('page')) : sp) +
        '<span class="obj-kind">' + svg(I.page) + '</span><span class="row-name" data-act="k5Page:' + i + '"><b>' + esc(nm) + '</b></span></div>';
    };
    pages.forEach((p, i) => {
      if (i !== VP.doc.active) {
        if (view === 'page') h += pageRow(i, false);
        return;
      }
      h += pageRow(i, true);
      if (openSet.has('page')) {
        h += sysRow(I.guides, 'Kılavuzlar', 1, !!S.guides, 'k5Guides', 'Kılavuzları göster / gizle');
        ls.slice().reverse().forEach((L) => {
          if (!isMaster(L)) h += layerRow(L, ls.indexOf(L), 1);
        });
      }
    });
    h += '<div class="layer-row k5-row k5-page" style="padding-left:6px">' + caret('master', openSet.has('master')) + '<span class="obj-kind">' + svg(I.page) + '</span><span class="row-name"><b>Ana sayfa</b></span></div>';
    if (openSet.has('master')) {
      h += sysRow(I.guides, 'Kılavuzlar (tüm sayfalar)', 1, !!S.guides, 'k5Guides', 'Kılavuzları göster / gizle');
      ls.slice().reverse().forEach((L) => {
        if (isMaster(L)) h += layerRow(L, ls.indexOf(L), 1);
      });
      h += sysRow(I.grid, 'Belge ızgarası', 1, !!S.grid, 'k5Grid', 'Izgarayı göster / gizle');
    }
    h += '</div>';
    if (q()) h += '<p class="sec-note">Arama: “' + esc(S.objQ) + '” · Temizlemek için kutuyu boşaltın</p>';
    h += '<div class="k5-foot">' +
      '<button class="btn icon-only" data-act="addLayer" title="Yeni katman" aria-label="Yeni katman">' + svg(I.newLayer) + '</button>' +
      '<button class="btn icon-only" data-act="k5NewMaster" title="Yeni ana katman (tüm sayfalarda)" aria-label="Yeni ana katman">' + svg(I.newMaster) + '</button>' +
      '<button class="btn icon-only" data-act="k5DelLayer" title="Etkin katmanı sil" aria-label="Etkin katmanı sil"' + (ls.length > 1 ? '' : ' disabled') + '>' + ic('trash', 'sm') + '</button>' +
      '<span style="flex:1"></span><input type="range" class="k5-size" data-pf="k5Row" data-live="1" min="0" max="2" step="1" value="' + (S.objRow || 0) + '" aria-label="Satır boyutu" title="Satır boyutu"></div>';
    return h;
  };
  UI.panels.objects = panel;

  // layers switched off for printing stay out of every export
  VP.io.exportHooks = VP.io.exportHooks || [];
  VP.io.exportHooks.unshift((tmp) => tmp.layers.slice().forEach((L) => L.data && L.data.noPrint && L.remove()));

  const save = () => {
    try {
      VP.io.savePrefs();
    } catch (e) { /* optional */ }
  };
  const act = async (id, el) => {
    const i = id.indexOf(':');
    const k = i < 0 ? id : id.slice(0, i);
    const arg = i < 0 ? '' : id.slice(i + 1);
    const ls = VP.userLayers();
    switch (k) {
      case 'k5Open':
        openSet.has(arg) ? openSet.delete(arg) : openSet.add(arg);
        break;
      case 'k5View':
        S.objView = arg;
        save();
        break;
      case 'k5Page':
        if (+arg !== VP.doc.active) VP.gotoPage(+arg);
        break;
      case 'k5Guides':
        if (A.guides) A.guides.run();
        break;
      case 'k5Grid':
        UI.toggleSetting('grid');
        break;
      case 'k5Print': {
        const L = ls[+arg];
        if (!L) break;
        L.data.noPrint = !L.data.noPrint;
        if (!L.data.noPrint) delete L.data.noPrint;
        VP.commit();
        VP.toast(L.data.noPrint ? '“' + L.name + '” yazdırılmayacak ve dışa aktarılmayacak' : '“' + L.name + '” yazdırılır');
        break;
      }
      case 'k5NewMaster': {
        VP.addLayer();
        const L = VP.activeLayer;
        if (L && VP.docx && VP.docx.toggleMaster && !isMaster(L)) VP.docx.toggleMaster(L);
        break;
      }
      case 'k5DelLayer': {
        const L = VP.activeLayer;
        if (!L || ls.length < 2) break;
        if (!L.children.length || (await UI.confirm({ title: '“' + L.name + '” silinsin mi?', text: 'Katmandaki ' + L.children.length + ' nesne de silinir.', ok: 'Sil', danger: true }))) VP.deleteLayer(L);
        break;
      }
      case 'k5Menu': {
        const html = '<button class="pop-item" data-pick="new">Yeni katman</button><button class="pop-item" data-pick="master">Yeni ana katman</button><div class="pop-sep"></div>' +
          '<button class="pop-item" data-pick="showAll">Tüm katmanları göster</button><button class="pop-item" data-pick="unlockAll">Tüm katmanların kilidini aç</button>' +
          '<button class="pop-item" data-pick="expand">Tümünü genişlet</button><button class="pop-item" data-pick="collapse">Tümünü daralt</button>';
        UI.popover(el, html, (p) => {
          if (p === 'new') VP.addLayer();
          else if (p === 'master') act('k5NewMaster', el);
          else if (p === 'showAll' || p === 'unlockAll') {
            VP.userLayers().forEach((L) => (p === 'showAll' ? (L.visible = true) : (L.locked = false)));
            VP.commit();
          } else if (p === 'expand') {
            VP.userLayers().forEach((L) => openSet.delete('xL' + L.id));
            openSet.add('page');
            openSet.add('master');
          } else if (p === 'collapse') {
            VP.userLayers().forEach((L) => openSet.add('xL' + L.id));
            itemsOpen.clear();
          }
          UI.schedule('dock');
        });
        return true;
      }
      default:
        return false;
    }
    UI.schedule('dock', 'prop', 'status');
    return true;
  };
  const da0 = UI.dockAct;
  UI.dockAct = function (id, el) {
    if (/^k5[A-Z]/.test(id)) return act(id, el);
    if (id.startsWith('zdTree:')) {
      // remember open groups here too, so the tree keeps them after a refresh
      const parts = id.slice(7).split('.').map(Number);
      let it = VP.userLayers()[parts[0]];
      for (let j = 1; j < parts.length && it; j++) it = it.children[parts[j]];
      if (it) itemsOpen.has(it.id) ? itemsOpen.delete(it.id) : itemsOpen.add(it.id);
      UI.schedule('dock');
      return;
    }
    return da0.apply(this, arguments);
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, raw, el) => {
    if (n === 'k5Q') {
      S.objQ = String(raw || '');
      return true;
    }
    if (n === 'k5Row') {
      S.objRow = Math.max(0, Math.min(2, Math.round(+raw || 0)));
      save();
      const t = document.querySelector('#dock-body .k5-tree');
      if (t) t.className = 'list k5-tree ' + rowSize();
      return true;
    }
    if (n.startsWith('k5Color:')) {
      const L = VP.userLayers()[+n.slice(8)];
      const hex = UI.normHex ? UI.normHex(raw) : raw;
      if (L && hex) {
        L.data.color = hex;
        VP.commit();
      }
      return true;
    }
    return pf0(n, raw, el);
  };
  // search filters as you type
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.pf === 'k5Q') {
      S.objQ = t.value;
      clearTimeout(VP._k5t);
      VP._k5t = setTimeout(() => {
        const pos = t.selectionStart;
        UI.renderDock(true);
        const n = document.querySelector('#dock-body [data-pf="k5Q"]');
        if (n) {
          n.focus();
          try {
            n.setSelectionRange(pos, pos);
          } catch (er) { /* ignore */ }
        }
      }, 180);
    }
  });

  const css = document.createElement('style');
  css.textContent = [
    '.k5-search input{width:100%;box-sizing:border-box;height:24px;border:1px solid var(--line);background:var(--panel-2);color:var(--fg);padding:0 8px;border-radius:3px;font-size:12px}',
    '.k5-head{display:flex;align-items:center;gap:2px;margin:6px 0 4px}',
    '#dock-body .k5-head .btn.icon-only,#dock-body .k5-foot .btn.icon-only{width:26px!important;min-width:0!important;height:24px;padding:0!important;justify-content:center}',
    '.k5-cur{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--muted);padding:0 6px}',
    '.k5-cur b{color:var(--fg)}',
    '.k5-tree .k5-row{min-height:22px;gap:2px}',
    '.k5-tree.k5-m .k5-row{min-height:28px}.k5-tree.k5-l .k5-row{min-height:36px;font-size:13px}',
    '#dock-body .k5-row .row-btn{width:21px;min-width:21px;padding:0}',
    '.k5-car{width:18px!important;min-width:18px;display:inline-grid;place-items:center;flex:none}',
    '.k5-page{background:color-mix(in srgb,var(--panel-2) 70%,transparent)}',
    '.k5-sys .row-name{color:var(--muted)}',
    '.k5-tag{color:var(--accent);font-size:9.5px}',
    '.k5-n{opacity:.5;font-size:10px}',
    '.k5-sw{position:relative;width:5px;height:16px;border-radius:1px;flex:none;margin:0 3px;cursor:pointer;overflow:hidden}',
    '.k5-sw input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}',
    '.k5-foot{display:flex;align-items:center;gap:2px;margin-top:8px;padding-top:6px;border-top:1px solid var(--line)}',
    '.k5-size{width:80px}',
    '@media (pointer:coarse){.k5-search input{height:32px}.k5-tree .k5-row{min-height:34px}#dock-body .k5-head .btn.icon-only,#dock-body .k5-foot .btn.icon-only{width:34px!important;height:32px}.k5-sw{width:10px;height:22px}}'
  ].join('\n');
  document.head.appendChild(css);
})();
