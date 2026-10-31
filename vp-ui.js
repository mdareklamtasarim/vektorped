/* VektörPad interface: menus, toolbox, property bar, docked panels, palette, status bar, dialogs. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = (VP.ui = {});
  const $ = (s, r = document) => r.querySelector(s);
  const ic = (n, c) => window.VPIcon(n, c);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const mm = (pt, d = 2) => VP.num(VP.toMM(pt), d);
  const approx = (a, b) => Math.abs(a - b) < 0.6;

  UI.dockTab = 'props';
  UI.palTarget = 'fill';
  UI.recent = [];
  UI.textItem = null;

  /* ================= toast, hint ================= */
  UI.toast = (msg) => {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(UI._tt);
    UI._tt = setTimeout(() => (t.hidden = true), 2800);
  };
  VP.toast = UI.toast;
  UI.showHint = (txt) => {
    const h = $('#hint');
    h.textContent = txt || '';
    h.hidden = !txt;
    clearTimeout(UI._ht);
    UI._ht = setTimeout(() => (h.hidden = true), 6500);
  };

  /* ================= popover ================= */
  UI.closePop = () => {
    if (!UI._pop) return;
    UI._pop.remove();
    UI._scrim.remove();
    if (UI._popAnchor) UI._popAnchor.setAttribute('aria-expanded', 'false');
    UI._pop = null;
  };
  UI.popover = (anchor, html, onPick, side) => {
    UI.closePop();
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      UI.closePop();
    });
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.setAttribute('role', 'menu');
    pop.innerHTML = html;
    document.body.append(scrim, pop);
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    let left;
    let top;
    if (side === 'right') {
      left = r.right + 6;
      top = r.top;
    } else {
      left = r.left;
      top = r.bottom + 4;
    }
    if (left + pw > innerWidth - 8) left = Math.max(8, innerWidth - pw - 8);
    if (top + ph > innerHeight - 8) top = Math.max(8, (side === 'right' ? innerHeight - ph - 8 : r.top - ph - 4));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b || b.disabled) return;
      UI.closePop();
      onPick(b.dataset.pick, b);
    });
    UI._pop = pop;
    UI._scrim = scrim;
    UI._popAnchor = anchor;
    UI._lastAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    const first = pop.querySelector('button:not([disabled])');
    if (first && !VP.coarse) first.focus({ preventScroll: true });
  };
  const menuHTML = (ids) =>
    ids
      .map((id) => {
        if (id === '|') return '<div class="pop-sep"></div>';
        if (id.startsWith('h:')) return '<div class="pop-head">' + esc(id.slice(2)) + '</div>';
        // "sub:Label|id1,id2" opens a submenu
        if (id.startsWith('sub:')) {
          const [label, list] = id.slice(4).split('|');
          const ids2 = (list || '').split(',').filter((x) => A[x]);
          if (!ids2.length) return '';
          const any = ids2.some((x) => !A[x].enabled || A[x].enabled());
          return '<button class="pop-item" role="menuitem" data-pick="' + esc(id) + '"' + (any ? '' : ' disabled') + '><span>' + esc(label) + '</span><span class="kbd">▸</span></button>';
        }
        const a = A[id];
        if (!a) return '';
        const dis = a.enabled && !a.enabled() ? ' disabled' : '';
        const chk = a.checked ? a.checked() : null;
        const right = chk != null ? (chk ? '<span class="check">✓</span>' : '') : a.kbd ? '<span class="kbd">' + esc(a.kbd) + '</span>' : '';
        return '<button class="pop-item" role="menuitem" data-pick="' + id + '"' + dis + '>' + (a.icon ? ic(a.icon, 'sm') : '') + '<span>' + esc(a.label) + '</span>' + right + '</button>';
      })
      .join('');
  UI.menuHTML = menuHTML;

  /* ================= modal ================= */
  UI.modal = (html, bind) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(wrap);
    const close = () => {
      wrap.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === wrap) close();
    });
    if (bind) bind(wrap.firstChild, close);
    return { root: wrap.firstChild, close };
  };
  UI.confirm = ({ title, text, ok = 'Tamam', danger = false }) =>
    new Promise((resolve) => {
      UI.modal(
        '<h2>' + esc(title) + '</h2>' + (text ? '<p>' + esc(text) + '</p>' : '') +
          '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" data-x="yes">' + esc(ok) + '</button></div>',
        (root, close) => {
          root.addEventListener('click', (e) => {
            const b = e.target.closest('[data-x]');
            if (!b) return;
            close();
            resolve(b.dataset.x === 'yes');
          });
          setTimeout(() => root.querySelector('[data-x="yes"]').focus(), 30);
        }
      );
    });
  UI.prompt = ({ title, label, value = '', ok = 'Kaydet' }) =>
    new Promise((resolve) => {
      UI.modal(
        '<h2>' + esc(title) + '</h2><label class="field wide" style="height:40px"><span>' + esc(label) + '</span><input id="prompt-in" value="' + esc(value) + '" style="width:100%" spellcheck="false"></label>' +
          '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">' + esc(ok) + '</button></div>',
        (root, close) => {
          const inp = root.querySelector('#prompt-in');
          const done = (yes) => {
            close();
            resolve(yes ? inp.value : null);
          };
          root.addEventListener('click', (e) => {
            const b = e.target.closest('[data-x]');
            if (b) done(b.dataset.x === 'yes');
          });
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') done(true);
          });
          setTimeout(() => {
            inp.focus();
            inp.select();
          }, 30);
        }
      );
    });

  /* ================= actions ================= */
  const hasSel = () => VP.sel.length > 0;
  const sel2 = () => VP.sel.length > 1;
  const A = (VP.actions = {
    new: { label: 'Yeni belge', kbd: 'Ctrl+N', icon: 'file', run: () => UI.confirmNew() },
    open: { label: 'Aç…', kbd: 'Ctrl+O', icon: 'import', run: () => VP.io.open() },
    save: { label: 'Kaydet', kbd: 'Ctrl+S', icon: 'save', run: () => VP.io.save() },
    import: { label: 'İçe aktar (SVG, resim)…', kbd: 'Ctrl+I', icon: 'image', run: () => VP.io.importFile() },
    export: { label: 'Dışa aktar (SVG, PNG, PDF)…', kbd: 'Ctrl+E', icon: 'export', run: () => UI.exportDialog() },
    sample: {
      label: 'Örnek çizimi aç',
      run: async () => {
        if (await UI.confirm({ title: 'Örnek çizim açılsın mı?', text: 'Açık belge, örnekle değiştirilir. Saklamak istiyorsanız önce Dosya › Kaydet kullanın.', ok: 'Örneği aç' })) VP.makeSample();
      }
    },
    undo: { label: 'Geri al', kbd: 'Ctrl+Z', icon: 'undo', run: () => VP.undo(), enabled: () => VP.canUndo() },
    redo: { label: 'Yinele', kbd: 'Ctrl+Y', icon: 'redo', run: () => VP.redo(), enabled: () => VP.canRedo() },
    cut: { label: 'Kes', kbd: 'Ctrl+X', run: () => VP.cut(), enabled: hasSel },
    copy: { label: 'Kopyala', kbd: 'Ctrl+C', run: () => VP.copy(), enabled: hasSel },
    paste: { label: 'Yapıştır', kbd: 'Ctrl+V', run: () => VP.paste(), enabled: () => VP.clipboard.length > 0 },
    duplicate: { label: 'Çoğalt', kbd: 'Ctrl+D', icon: 'duplicate', run: () => VP.duplicate(), enabled: hasSel },
    delete: { label: 'Sil', kbd: 'Del', icon: 'trash', run: () => VP.deleteSel(), enabled: hasSel },
    selectAll: { label: 'Tümünü seç', kbd: 'Ctrl+A', run: () => { VP.setTool('select'); VP.selectAll(); } },
    deselect: { label: 'Seçimi kaldır', kbd: 'Esc', run: () => VP.clearSelection(), enabled: hasSel },
    stepRepeat: { label: 'Adım ve tekrar…', icon: 'stepRepeat', run: () => UI.openDock('step'), enabled: hasSel },
    group: { label: 'Grupla', kbd: 'Ctrl+G', icon: 'group', run: () => VP.group(), enabled: sel2 },
    ungroup: { label: 'Grubu çöz', kbd: 'Ctrl+U', icon: 'ungroup', run: () => VP.ungroup(false), enabled: () => VP.sel.some((i) => i instanceof paper.Group) },
    ungroupAll: { label: 'Tüm grupları çöz', run: () => VP.ungroup(true), enabled: () => VP.sel.some((i) => i instanceof paper.Group) },
    combine: { label: 'Birleştir', kbd: 'Ctrl+L', icon: 'combine', run: () => VP.combine(), enabled: sel2 },
    breakApart: { label: 'Parçala', kbd: 'Ctrl+K', icon: 'breakApart', run: () => VP.breakApart(), enabled: () => VP.sel.some((i) => i instanceof paper.CompoundPath) },
    toCurves: { label: 'Eğriye dönüştür', kbd: 'Ctrl+Q', icon: 'curves', run: () => VP.convertToCurves(), enabled: hasSel },
    weld: { label: 'Kaynak (birleşim)', icon: 'weld', run: () => VP.shape('weld'), enabled: sel2 },
    trim: { label: 'Kırp (alttakinden çıkar)', icon: 'trim', run: () => VP.shape('trim'), enabled: sel2 },
    intersect: { label: 'Kesişim', icon: 'intersect', run: () => VP.shape('intersect'), enabled: sel2 },
    exclude: { label: 'Dışla (örtüşmeyi çıkar)', icon: 'exclude', run: () => VP.shape('exclude'), enabled: sel2 },
    toFront: { label: 'En öne', kbd: 'Shift+PgUp', icon: 'toFront', run: () => VP.arrange('front'), enabled: hasSel },
    forward: { label: 'Bir öne', kbd: 'PgUp', run: () => VP.arrange('forward'), enabled: hasSel },
    backward: { label: 'Bir arkaya', kbd: 'PgDn', run: () => VP.arrange('backward'), enabled: hasSel },
    toBack: { label: 'En arkaya', kbd: 'Shift+PgDn', icon: 'toBack', run: () => VP.arrange('back'), enabled: hasSel },
    flipH: { label: 'Yatay çevir', icon: 'flipH', run: () => VP.flip('h'), enabled: hasSel },
    flipV: { label: 'Dikey çevir', icon: 'flipV', run: () => VP.flip('v'), enabled: hasSel },
    rot90: { label: '90° döndür', icon: 'rotate', run: () => VP.rotateSel(90), enabled: hasSel },
    lock: {
      label: 'Kilitle',
      icon: 'lock',
      run: () => {
        VP.sel.forEach((it) => (it.locked = true));
        VP.clearSelection();
        VP.commit();
        UI.toast('Kilitlendi · Kilidi açmak için Nesneler paneli');
      },
      enabled: hasSel
    },
    hide: {
      label: 'Gizle',
      icon: 'eyeOff',
      run: () => {
        VP.sel.forEach((it) => (it.visible = false));
        VP.clearSelection();
        VP.commit();
        UI.toast('Gizlendi · Göstermek için Nesneler paneli');
      },
      enabled: hasSel
    },
    fxBlend: { label: 'Harmanla', icon: 'blend', run: () => VP.fx.blend(VP.sel), enabled: () => VP.sel.length === 2 },
    fxContour: { label: 'Kontur ekle', icon: 'contour', run: () => VP.fx.contour(VP.sel[0]), enabled: () => VP.sel.length === 1 && !VP.fx.isFx(VP.sel[0]) },
    fxEnvelope: {
      label: 'Zarf ekle',
      icon: 'envelope',
      run: () => {
        if (VP.fx.addWarp(VP.sel[0], 'envelope')) VP.setTool('envelopeTool');
      },
      enabled: () => VP.sel.length === 1
    },
    fxPerspective: {
      label: 'Perspektif ekle',
      icon: 'perspective',
      run: () => {
        if (VP.fx.addWarp(VP.sel[0], 'perspective')) VP.setTool('perspectiveTool');
      },
      enabled: () => VP.sel.length === 1
    },
    fxExtrude: {
      label: 'Derinlik ekle',
      icon: 'extrude',
      run: () => {
        if (VP.fx.extrude(VP.sel[0])) VP.setTool('extrudeTool');
      },
      enabled: () => VP.sel.length === 1 && !VP.fx.isFx(VP.sel[0])
    },
    fxLens: { label: 'Mercek yap', icon: 'lens', run: () => VP.fx.lens(VP.sel[0]), enabled: () => VP.sel.length === 1 && !VP.fx.isFx(VP.sel[0]) },
    fxPowerclip: {
      label: 'PowerClip içine yerleştir…',
      icon: 'powerclip',
      run: () => {
        VP.setTool('powerclipTool');
      },
      enabled: hasSel
    },
    fxPowerclip2: {
      label: 'PowerClip: üstteki, alttakinin içine',
      icon: 'powerclip',
      run: () => {
        const s = VP.zSort(VP.sel);
        VP.fx.powerclip([s[1]], s[0]);
      },
      enabled: () => VP.sel.length === 2
    },
    pcCenter: { label: 'İçeriği ortala', run: () => VP.fx.pcArrange(VP.sel[0], 'center') },
    pcFit: { label: 'İçeriği sığdır', run: () => VP.fx.pcArrange(VP.sel[0], 'fit') },
    pcFill: { label: 'Kabı doldur', run: () => VP.fx.pcArrange(VP.sel[0], 'fill') },
    fxSeparate: { label: 'Efekti ayır (normal gruba çevir)', run: () => VP.fx.separate(), enabled: () => VP.sel.some((i) => VP.fx.isFx(i)) },
    fxClear: { label: 'Efekti kaldır (aslına döndür)', run: () => VP.fx.clear(), enabled: () => VP.sel.some((i) => VP.fx.isFx(i)) },
    fit: { label: 'Sayfaya sığdır', kbd: 'F4', icon: 'fit', run: () => VP.fitPage() },
    zoom100: { label: 'Gerçek boyut (%100)', run: () => VP.setZoom(96 / 72) },
    zoomSel: { label: 'Seçime yakınlaştır', kbd: 'Shift+F2', run: () => VP.sel.length && VP.zoomToRect(VP.selBounds().expand(VP.toPT(4))), enabled: hasSel },
    grid: { label: 'Izgarayı göster', icon: 'grid', checked: () => VP.settings.grid, run: () => UI.toggleSetting('grid') },
    snap: { label: 'Izgaraya yapış', icon: 'magnet', checked: () => VP.settings.snap, run: () => UI.toggleSetting('snap') },
    rulers: { label: 'Cetveller', checked: () => VP.settings.rulers, run: () => UI.toggleSetting('rulers') },
    pencilOnly: { label: 'Yalnızca Apple Pencil ile çiz', icon: 'pencil', checked: () => VP.settings.pencilOnly, run: () => UI.toggleSetting('pencilOnly') },
    help: { label: 'Yardım ve kısayollar', icon: 'help', run: () => UI.help() }
  });
  UI.run = (id) => {
    if (typeof id === 'string' && id.startsWith('sub:')) {
      const [label, list] = id.slice(4).split('|');
      const anchor = UI._lastAnchor && UI._lastAnchor.isConnected ? UI._lastAnchor : document.querySelector('#btn-menu-all') || document.body;
      return UI.popover(anchor, '<div class="pop-head">' + esc(label) + '</div>' + menuHTML(list.split(',')), (x) => UI.run(x));
    }
    const a = A[id];
    if (!a) return;
    if (a.enabled && !a.enabled()) return;
    a.run();
  };
  UI.toggleSetting = (k) => {
    VP.settings[k] = !VP.settings[k];
    if (k === 'grid') VP.drawGrid();
    if (k === 'rulers') {
      UI.drawRulers();
      setTimeout(() => UI.onResize && UI.onResize(), 0);
    }
    if (k === 'pencilOnly') UI.toast(VP.settings.pencilOnly ? 'Parmakla kaydırma, kalemle çizim' : 'Parmakla da çizilebilir');
    VP.io.savePrefs();
    UI.schedule('prop', 'status');
  };
  // Menu bar in the order of a desktop drawing suite. Items whose action is missing are skipped.
  const MENUS = (UI.MENUS = {
    file: ['new', 'open', '|', 'save', 'saveAs', '|', 'import', 'export', 'exportPdf', '|', 'docProps', '|', 'sample'],
    edit: ['undo', 'redo', '|', 'cut', 'copy', 'paste', 'delete', '|', 'duplicate', 'stepRepeat', '|', 'selectAll', 'selectAllText', 'deselect', '|', 'findReplace', '|', 'copyProps'],
    view: ['fullPreview', 'pageSorter', '|', 'fit', 'zoom100', 'zoomSel', '|', 'rulers', 'grid', 'guides', 'clearGuides', '|', 'h:Yakala', 'snap', 'snapGuides', 'snapObjects', '|', 'pencilOnly'],
    layout: ['addPage', 'dupPage', 'renamePage', 'delPage', 'gotoPage', '|', 'insertPageNum', '|', 'orientToggle', 'pageSetup', 'pageBg'],
    object: ['h:Oluştur', 'createBoundary', '|', 'h:PowerClip', 'fxPowerclip', 'fxPowerclip2', 'pcCenter', 'pcFit', 'pcFill', '|', 'h:Hizala ve dağıt', 'alignL', 'alignCH', 'alignR', 'alignT', 'alignCV', 'alignB', 'distH', 'distV', 'dockAlign', '|', 'h:Sırala', 'toFront', 'forward', 'backward', 'toBack', '|', 'h:Grupla ve birleştir', 'group', 'ungroup', 'ungroupAll', 'combine', 'breakApart', '|', 'h:Şekillendir', 'weld', 'trim', 'intersect', 'exclude', '|', 'toCurves', '|', 'h:Dönüştürmeler', 'flipH', 'flipV', 'rot90', 'dockTransform', '|', 'lock', 'unlockAll', 'hide', 'showAll'],
    effects: ['fxBlend', 'fxContour', 'fxEnvelope', 'fxExtrude', 'fxLens', 'fxPerspective', 'fxPowerclip', '|', 'shadowToggle', '|', 'fxSeparate', 'fxClear'],
    bitmaps: ['toBitmap', '|', 'h:Mod', 'bmpGray', 'bmpBW', 'bmpInvert', '|', 'bmpAdjust'],
    text: ['textProps', 'insertGlyph', '|', 'txFitPath', 'txUnpath', 'txPathTool', '|', 'txToPara', 'txToArtistic', '|', 'h:Paragraf çerçevesi', 'txFitText', 'txFitFrame', '|', 'changeCase', '|', 'txEditText', 'toCurves'],
    table: ['txNewTable', 'textToTable', 'tableToText', '|', 'h:Ekle', 'tRowAbove', 'tRowBelow', 'tColLeft', 'tColRight', '|', 'h:Seç', 'tSelRow', 'tSelCol', 'tSelAll', '|', 'h:Sil', 'tDelRow', 'tDelCol', 'tDelTable', '|', 'h:Dağıt', 'tDistRows', 'tDistCols', '|', 'tMerge', 'tSplit'],
    tools: ['options', '|', 'h:Tema', 'themeAuto', 'themeLight', 'themeDark', '|', 'pencilOnly', 'resetWorkspace'],
    window: ['h:Yerleşik paneller', 'dockProps', 'dockObjects', 'dockPages', 'dockAlign', 'dockTransform', 'dockStep', '|', 'h:Araç çubukları', 'barStd', 'barProp', 'barTools', 'barStatus', '|', 'h:Renk paletleri', 'barPalette', 'barDocPal', '|', 'fullscreen'],
    help: ['help', 'shortcuts', '|', 'whatsNew', 'about']
  });
  const MENU_NAMES = (UI.MENU_NAMES = { file: 'Dosya', edit: 'Düzen', view: 'Görünüm', layout: 'Mizanpaj', object: 'Nesne', effects: 'Efektler', bitmaps: 'Biteşlemler', text: 'Metin', table: 'Tablo', tools: 'Araçlar', window: 'Pencere', help: 'Yardım' });

  /* ================= refresh scheduling ================= */
  UI._dirty = new Set();
  UI.schedule = (...parts) => {
    parts.forEach((p) => UI._dirty.add(p));
    if (UI._raf) return;
    UI._raf = requestAnimationFrame(() => {
      UI._raf = 0;
      const d = UI._dirty;
      UI._dirty = new Set();
      if (d.has('tools')) UI.renderToolbox();
      if (d.has('prop')) UI.renderPropbar();
      if (d.has('dock')) UI.renderDock();
      if (d.has('status')) UI.renderStatus();
      if (d.has('palette')) {
        UI.renderPalette();
        UI.renderDocPal();
      }
      if (d.has('top')) UI.renderTop();
      if (d.has('rulers')) UI.drawRulers();
    });
  };

  /* ================= top bar ================= */
  UI.renderTop = () => {
    $('#btn-undo').disabled = !VP.canUndo();
    $('#btn-redo').disabled = !VP.canRedo();
    $('#zoom-label').textContent = Math.round(paper.view.zoom * 100) + '%';
    const dn = $('#doc-name');
    if (document.activeElement !== dn) dn.value = VP.doc.name;
    $('#btn-dock').classList.toggle('on', !$('#dock').hidden);
    $('#win-title').textContent = VP.doc.name + ' · VektörPad 26';
    document.querySelectorAll('#stdbar [data-cmd]').forEach((b) => {
      const a = A[b.dataset.cmd];
      if (a && a.checked) {
        const on = !!a.checked();
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
      }
    });
    const s = VP.settings;
    const snaps = [s.snap, s.snapGuides, s.snapObjects].filter(Boolean).length;
    const sb = $('#btn-snap');
    if (sb) {
      sb.innerHTML = ic('magnet', 'sm') + '<span>Yakala' + (snaps ? ' (' + snaps + ')' : '') + ' ▾</span>';
      sb.classList.toggle('on', snaps > 0);
    }
  };

  /* ================= toolbox ================= */
  // Tool box in the familiar desktop order: pick, shape, zoom, curves, artistic media, shapes, text/table,
  // dimensions, connectors, interactive effects, eyedropper. Groups open as flyouts on long press.
  // Same grouping and order as the desktop suite's tool box: pick | shape | crop, zoom | curves, drawing,
  // rectangle, ellipse, shapes | text | dimensions, connectors | effects, transparency | eyedropper, fill |
  // smart fill | outline (a flyout of outline widths, not a tool).
  const GROUPS = [['select', 'lassoTool', 'freeXform'], ['node', 'smoothTool', 'smearTool', 'twirlTool', 'attractTool', 'repelTool', 'roughenTool'], '|', ['cropTool', 'knifeTool', 'eraserTool', 'virtualDel'], ['zoom', 'hand', 'pageTool'], '|', ['freehand', 'line', 'pen', 'bsplineTool', 'polylineTool', 'curve3Tool'], ['brush', 'liveSketch', 'smartDraw', 'sketchTool', 'varOutline', 'impactTool'], ['rect', 'rect3Tool'], ['ellipse', 'ellipse3Tool'], ['polygon', 'star', 'cstarTool', 'spiral', 'graphTool', 'perfectTool'], '|', ['text', 'tableTool', 'textPathTool'], '|', ['dimParallel', 'dimHV', 'dimAngular', 'dimSegment', 'dimCallout', 'commentTool'], ['connStraight', 'connRight', 'connRound', 'anchorTool'], '|', ['shadowTool', 'innerShadowTool', 'blockShadowTool', 'blendTool', 'contourTool', 'distortTool', 'envelopeTool', 'extrudeTool', 'perspectiveTool', 'lensTool', 'powerclipTool'], ['transpTool'], '|', ['eyedropper', 'attrEyedropper'], ['fillTool', 'meshTool'], '|', ['smartFill'], '|', 'outline'];
  UI.groupCur = {};
  UI.renderToolbox = () => {
    $('#toolbox').innerHTML = GROUPS.map((g, gi) => {
      if (g === '|') return '<div class="tool-sep"></div>';
      if (g === 'outline') return '<button class="tool-btn" data-outline="1" title="Anahat" aria-label="Anahat (genişlik ve kalem)">' + ic('outlinePen') + '<span class="flyout-mark"></span></button>';
      const on = g.includes(VP.toolId);
      const id = on ? VP.toolId : UI.groupCur[gi] || g[0];
      const m = VP.TOOL_META[id];
      return '<button class="tool-btn' + (on ? ' on' : '') + '" data-group="' + gi + '" data-tool="' + id + '" title="' + esc(m.label + (m.key ? ' (' + m.key + ')' : '')) + '" aria-label="' + esc(m.label) + '" aria-pressed="' + on + '">' + ic(m.icon) + (g.length > 1 ? '<span class="flyout-mark"></span>' : '') + '</button>';
    }).join('');
    UI.fitToolbox();
  };
  // Two columns of tools when one column does not fit the height (not on phones, where it scrolls sideways).
  UI.fitToolbox = () => {
    const tb = $('#toolbox');
    if (!tb || tb.hidden) return;
    const was = tb.classList.contains('two-col');
    tb.classList.remove('two-col');
    if (innerWidth > 640 && tb.scrollHeight > tb.clientHeight + 1) tb.classList.add('two-col');
    if (was !== tb.classList.contains('two-col')) setTimeout(() => UI.onResize && UI.onResize(), 0);
  };
  addEventListener('resize', () => UI.fitToolbox && UI.fitToolbox());
  const openFlyout = (btn) => {
    const g = GROUPS[+btn.dataset.group];
    const html = g.map((id) => {
      const m = VP.TOOL_META[id];
      return '<button class="pop-item' + (id === VP.toolId ? ' on' : '') + '" data-pick="' + id + '">' + ic(m.icon, 'sm') + '<span>' + esc(m.label) + '</span>' + (m.key ? '<span class="kbd">' + m.key + '</span>' : '') + '</button>';
    }).join('');
    UI.popover(btn, html, (id) => {
      UI.groupCur[+btn.dataset.group] = id;
      VP.setTool(id);
    }, innerWidth > 640 ? 'right' : undefined);
  };
  const bindToolbox = () => {
    const tb = $('#toolbox');
    let timer = 0;
    let fired = false;
    tb.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.tool-btn');
      if (!b || b.dataset.outline) return;
      fired = false;
      clearTimeout(timer);
      if (GROUPS[+b.dataset.group].length > 1) {
        timer = setTimeout(() => {
          fired = true;
          openFlyout(b);
        }, 420);
      }
    });
    tb.addEventListener('pointerup', () => clearTimeout(timer));
    tb.addEventListener('pointerleave', () => clearTimeout(timer));
    tb.addEventListener('contextmenu', (e) => e.preventDefault());
    tb.addEventListener('click', (e) => {
      const b = e.target.closest('.tool-btn');
      if (b && b.dataset.outline) return UI.outlineFlyout && UI.outlineFlyout(b);
      if (!b || fired) return;
      const g = GROUPS[+b.dataset.group];
      if (g.length > 1 && g.includes(VP.toolId)) return openFlyout(b);
      VP.setTool(b.dataset.tool);
    });
  };

  /* ================= palette ================= */
  const PALETTE = [
    ['#ffffff', 'Beyaz'], ['#ededed', '%10 Siyah'], ['#c6c6c6', '%30 Siyah'], ['#9d9d9c', '%50 Siyah'], ['#706f6f', '%70 Siyah'], ['#1d1d1b', 'Siyah · K100'],
    ['#00a0e3', 'Camgöbeği · C100'], ['#e5007e', 'Macenta · M100'], ['#ffed00', 'Sarı · Y100'],
    ['#e30613', 'Kırmızı · M100 Y100'], ['#ef7d00', 'Turuncu · M60 Y100'], ['#f9b200', 'Kehribar · M35 Y100'],
    ['#c8d400', 'Limon · C30 Y100'], ['#3aaa35', 'Yeşil · C75 Y100'], ['#00843d', 'Koyu yeşil · C90 Y100 K10'],
    ['#00a19a', 'Turkuaz · C85 Y45'], ['#0069b4', 'Mavi · C100 M50'], ['#2d2e83', 'Lacivert · C100 M90'],
    ['#662483', 'Mor · C75 M100'], ['#a3195b', 'Bordo · C30 M100 K20'], ['#f39fc5', 'Pembe · M45'],
    ['#a6d8f0', 'Açık mavi · C35'], ['#fff7b2', 'Krem · Y35'], ['#c49a6c', 'Kum · C25 M40 Y60'], ['#7d4e24', 'Kahverengi · C30 M70 Y100 K30']
  ];
  UI.PALETTE = PALETTE;
  const chipCss = (hex) => (hex ? 'background:' + hex : '');
  const curColors = () => {
    if (VP.sel.length) {
      const f = VP.getFill(VP.sel[0]);
      const s = VP.getStroke(VP.sel[0]);
      return { fill: f.type === 'none' ? null : f.color, stroke: s.on ? s.color : null };
    }
    return { fill: VP.defaults.fill, stroke: VP.defaults.stroke };
  };
  UI.updatePalTarget = () => {
    const t = $('#palette [data-pal="target"]');
    if (!t) return;
    const c = curColors();
    const tf = UI.palTarget === 'fill';
    t.classList.toggle('target-stroke', !tf);
    t.title = 'Palet hedefi: ' + (tf ? 'Dolgu' : 'Anahat') + ' · Değiştirmek için dokunun';
    t.setAttribute('aria-label', 'Palet hedefi: ' + (tf ? 'dolgu' : 'anahat'));
    const f = t.querySelector('.fill-chip');
    const s = t.querySelector('.stroke-chip');
    f.className = 'fill-chip' + (tf ? ' tchip-on' : '') + (c.fill ? '' : ' swatch none');
    f.style.background = c.fill || '';
    s.className = 'stroke-chip' + (tf ? '' : ' tchip-on');
    s.style.borderColor = c.stroke || 'var(--line)';
  };
  UI.renderPalette = (full) => {
    const key = UI.recent.join(',');
    if (!full && UI._palKey === key && $('#palette [data-pal="target"]')) return UI.updatePalTarget();
    UI._palKey = key;
    let h = '<button class="pal-target" data-pal="target"><span class="fill-chip"></span><span class="stroke-chip"></span></button>';
    h += '<button class="swatch none" data-color="none" title="Renk yok" aria-label="Renk yok"></button>';
    h += (UI.curPalette ? UI.curPalette() : PALETTE).map(([col, name]) => '<button class="swatch" data-color="' + col + '" style="background:' + col + '" title="' + esc(name) + '" aria-label="' + esc(name) + '"></button>').join('');
    if (UI.recent.length) {
      h += '<div class="pal-sep"></div>' + UI.recent.map((col) => '<button class="swatch" data-color="' + col + '" style="background:' + col + '" title="Son kullanılan ' + col + '" aria-label="Son kullanılan renk ' + col + '"></button>').join('');
    }
    h += '<div class="pal-sep"></div><button class="swatch add" data-color="custom" title="Özel renk" aria-label="Özel renk">' + ic('plus', 'sm') + '</button>';
    $('#palette').innerHTML = h;
    UI.updatePalTarget();
  };
  // Document palette: the solid colours used on the current page, in order of first use.
  UI.renderDocPal = () => {
    const el = $('#docpal');
    if (!el || el.hidden) return;
    const seen = [];
    const add = (c) => {
      if (!c || c.type === 'gradient' || c.alpha === 0) return;
      const h = VP.hex(c);
      if (h && !seen.includes(h)) seen.push(h);
    };
    const walk = (it) => {
      if (seen.length >= 30 || (it.data && it.data.hitOnly)) return;
      if (it.children && !(it instanceof paper.CompoundPath)) return it.children.forEach(walk);
      if (it instanceof paper.Raster) return;
      add(it.fillColor);
      add(it.strokeColor);
    };
    VP.userLayers().forEach((L) => L.children.forEach(walk));
    const key = seen.join(',');
    if (UI._dpKey === key && el.firstChild) return;
    UI._dpKey = key;
    el.innerHTML = '<span class="dp-label">Belge paleti</span>' + (seen.length ? seen.map((c) => '<button class="swatch" data-color="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="Belgedeki renk ' + c + '"></button>').join('') : '<span class="dp-empty">Sayfada kullanılan renkler burada görünür</span>');
  };
  UI.addRecent = (hex) => {
    if (!hex || PALETTE.some((p) => p[0] === hex)) return;
    UI.recent = [hex].concat(UI.recent.filter((c) => c !== hex)).slice(0, 8);
  };
  UI.applyColor = (hex, target) => {
    const items = VP.sel;
    if (items.length) {
      if (target === 'fill') {
        const imgs = items.every((it) => it instanceof paper.Raster);
        if (imgs) return UI.toast('Resimlere dolgu uygulanmaz');
        VP.setFill(items, hex ? { type: 'solid', color: hex, alpha: 1 } : { type: 'none' });
      } else VP.setStroke(items, hex ? { on: true, color: hex, width: VP.getStroke(items[0]).width || VP.defaults.strokeWidth } : { on: false });
      VP.commit();
    } else {
      if (target === 'fill') VP.defaults.fill = hex;
      else VP.defaults.stroke = hex;
      VP.io.savePrefs();
      VP.emit('defaults');
      UI.toast('Yeni nesnelerin ' + (target === 'fill' ? 'dolgusu' : 'anahattı') + ': ' + (hex || 'yok'));
    }
  };
  const bindPalette = (pal = $('#palette')) => {
    let timer = 0;
    let fired = false;
    pal.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const b = e.target.closest('[data-color]');
      if (b && b.dataset.color !== 'custom') {
        fired = true;
        UI.applyColor(b.dataset.color === 'none' ? null : b.dataset.color, UI.palTarget === 'fill' ? 'stroke' : 'fill');
      }
    });
    pal.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-color]');
      fired = false;
      clearTimeout(timer);
      if (!b || b.dataset.color === 'custom' || e.button === 2) return;
      timer = setTimeout(() => {
        fired = true;
        UI.applyColor(b.dataset.color === 'none' ? null : b.dataset.color, UI.palTarget === 'fill' ? 'stroke' : 'fill');
      }, 480);
    });
    const stop = () => clearTimeout(timer);
    pal.addEventListener('pointerup', stop);
    pal.addEventListener('pointerleave', stop);
    pal.addEventListener('click', (e) => {
      const t = e.target.closest('[data-pal="target"]');
      if (t) {
        UI.palTarget = UI.palTarget === 'fill' ? 'stroke' : 'fill';
        UI.updatePalTarget();
        UI.toast('Palet şimdi ' + (UI.palTarget === 'fill' ? 'dolguyu' : 'anahattı') + ' boyuyor · Uzun basış diğerini boyar');
        return;
      }
      const b = e.target.closest('[data-color]');
      if (!b || fired) return;
      const col = b.dataset.color;
      if (col === 'custom') return UI.customColor();
      UI.applyColor(col === 'none' ? null : col, UI.palTarget);
    });
  };
  UI.customColor = () => {
    const c = curColors();
    const start = (UI.palTarget === 'fill' ? c.fill : c.stroke) || '#1461b2';
    UI.modal(
      '<h2>Özel renk</h2><div class="row"><input type="color" id="cc-in" value="' + start + '" style="width:72px;height:56px;border:0;padding:0;background:transparent">' +
        '<label class="field"><span>HEX</span><input id="cc-hex" value="' + start + '" spellcheck="false" style="width:90px"></label></div>' +
        '<p>Seçili nesnelere uygulanır; seçim yoksa yeni nesnelerin rengi olur.</p>' +
        '<div class="actions"><button class="btn" data-x="no">Kapat</button><button class="btn" data-x="stroke">Anahata uygula</button><button class="btn primary" data-x="fill">Dolguya uygula</button></div>',
      (root, close) => {
        const ci = root.querySelector('#cc-in');
        const hx = root.querySelector('#cc-hex');
        ci.addEventListener('input', () => (hx.value = ci.value));
        hx.addEventListener('change', () => {
          const v = UI.normHex(hx.value);
          if (v) ci.value = v;
        });
        root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-x]');
          if (!b) return;
          if (b.dataset.x !== 'no') {
            const v = UI.normHex(hx.value) || ci.value;
            UI.addRecent(v);
            UI.applyColor(v, b.dataset.x);
          }
          close();
          UI.renderPalette();
        });
      }
    );
  };
  UI.normHex = (v) => {
    const m = String(v || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return '#' + h.toLowerCase();
  };

  /* ================= property bar ================= */
  const field = (label, name, value, unit = 'mm', cls = '') =>
    '<label class="field ' + cls + '"><span>' + esc(label) + '</span><input data-pf="' + name + '" value="' + esc(value) + '" inputmode="decimal" enterkeyhint="done" aria-label="' + esc(label) + '" autocomplete="off">' + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</label>';
  const sep = '<span class="pb-sep"></span>';
  const btn = (act, inner, title, cls = '') => '<button class="btn ' + cls + '" data-act="' + act + '" title="' + esc(title || '') + '" aria-label="' + esc(title || '') + '">' + inner + '</button>';
  const ibtn = (act, icon, title, on) => '<button class="btn icon-only' + (on ? ' on' : '') + '" data-act="' + act + '" title="' + esc(title) + '" aria-label="' + esc(title) + '"' + (on != null ? ' aria-pressed="' + !!on + '"' : '') + '>' + ic(icon, 'sm') + '</button>';
  const tog = (act, inner, on, title) => '<button class="btn' + (on ? ' on' : '') + '" data-act="' + act + '" aria-pressed="' + !!on + '" title="' + esc(title || '') + '">' + inner + '</button>';
  const range = (label, name, val, min, max, step = 1) =>
    '<label class="range"><span class="pb-label">' + esc(label) + '</span><input type="range" data-pf="' + name + '" data-live="1" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" aria-label="' + esc(label) + '"><output>' + val + '</output></label>';
  const fontSel = (cur) =>
    '<label class="field"><span>Yazı tipi</span><select data-pf="font" aria-label="Yazı tipi">' + VP.FONTS.map((f) => '<option' + (f === cur ? ' selected' : '') + ' style="font-family:\'' + f + '\'">' + esc(f) + '</option>').join('') + (VP.FONTS.includes(cur) ? '' : '<option selected>' + esc(cur) + '</option>') + '</select></label>';
  const multiTog = () => ibtn('multi', 'multi', 'Çoklu seçim (dokunarak ekle/çıkar)', VP.settings.multi);
  const textControls = (t) => {
    const fam = t ? t.fontFamily : VP.defaults.fontFamily;
    const size = t ? t.fontSize : VP.defaults.fontSize;
    const b = t ? VP.isBold(t) : VP.defaults.bold;
    const i = t ? VP.isItalic(t) : VP.defaults.italic;
    const j = t ? t.justification : VP.defaults.justification;
    return fontSel(fam) + field('Boyut', 'fontSize', VP.num(size, 1), 'pt') +
      tog('bold', '<b>K</b>', b, 'Kalın') + tog('italic', '<i>İ</i>', i, 'İtalik') +
      '<span class="seg">' + ['left', 'center', 'right'].map((k, n) => '<button data-act="just:' + k + '" class="' + (j === k ? 'on' : '') + '" title="' + ['Sola', 'Ortaya', 'Sağa'][n] + ' hizala">' + ic(['alignL', 'alignCH', 'alignR'][n], 'sm') + '</button>').join('') + '</span>';
  };
  const pageControls = () => {
    const p = VP.page();
    const w = VP.toMM(p.w);
    const h = VP.toMM(p.h);
    const pre = VP.PAGE_PRESETS.find((x) => (approx(x.w, w) && approx(x.h, h)) || (approx(x.w, h) && approx(x.h, w)));
    return '<span class="pb-label">Sayfa</span><label class="field"><select data-pf="pagePreset" aria-label="Sayfa boyutu">' +
      VP.PAGE_PRESETS.map((o) => '<option value="' + o.id + '"' + (pre && pre.id === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') +
      '<option value="custom"' + (pre ? '' : ' selected') + '>Özel</option></select></label>' +
      field('En', 'pageW', mm(p.w, 1)) + field('Boy', 'pageH', mm(p.h, 1)) +
      '<span class="seg"><button data-act="orient:p" class="' + (p.h >= p.w ? 'on' : '') + '" title="Dikey">Dikey</button><button data-act="orient:l" class="' + (p.w > p.h ? 'on' : '') + '" title="Yatay">Yatay</button></span>';
  };
  const strokeW = () => field('Anahat', 'strokeW', VP.num(VP.toMM(VP.defaults.strokeWidth), 2));
  const selFx = (type) => {
    const g = VP.sel.length === 1 && VP.fx.isFx(VP.sel[0]) ? VP.sel[0] : null;
    return g && (!type || g.data.effect.type === type) ? g : null;
  };
  const colorField = (label, name, hex) =>
    '<label class="field"><span>' + esc(label) + '</span><input type="color" data-pf="' + name + '" value="' + esc(hex || '#ffffff') + '" aria-label="' + esc(label) + '" style="width:34px;height:26px;border:0;padding:0;background:transparent"></label>';
  const dirSeg = (cur) => '<span class="seg">' + [['outside', 'Dış'], ['inside', 'İç']].map(([v, l]) => '<button data-act="fxDir:' + v + '" class="' + (cur === v ? 'on' : '') + '" title="' + l + ' kontur">' + l + '</button>').join('') + '</span>';
  const fxFields = (g) => {
    const fx = g.data.effect;
    const ext = VP.fx.ext(g);
    if (ext && ext.fields) return ext.fields(g);
    let h = '<span class="pb-label">' + esc(VP.fx.NAMES[fx.type]) + '</span>';
    if (fx.type === 'blend') h += field('Adım', 'fxSteps', fx.steps, '') + range('Hızlanma', 'fxAccel', Math.round((fx.accel || 0) * 100), -100, 100);
    if (fx.type === 'contour') h += dirSeg(fx.dir) + field('Adım', 'fxSteps', fx.steps, '') + field('Aralık', 'fxOffset', mm(fx.offset, 1)) + colorField('Bitiş', 'fxEnd', fx.endFill);
    if (fx.type === 'envelope' || fx.type === 'perspective') h += btn('fxPresets', 'Hazır ▾', 'Hazır biçimler') + btn('fxEdit', ic('node', 'sm') + 'Düğümler', 'Düğümleri sürükleyerek düzenle');
    if (fx.type === 'extrude') h += extrudeControls(fx) + btn('fxEdit', ic('extrude', 'sm') + 'Kaçış noktası', 'Kaçış noktasını sürükle');
    if (fx.type === 'lens') h += lensControls(fx);
    if (fx.type === 'powerclip') h += btn('pcCenter', 'Ortala', 'İçeriği kabın ortasına al') + btn('pcFit', 'Sığdır', 'İçeriği kaba sığdır') + btn('pcFill', 'Doldur', 'İçerik kabı tamamen doldursun') + btn('fxEdit', ic('hand', 'sm') + 'İçeriği taşı', 'Sürükleyerek içeriği kaydır');
    return h + btn('fxMenu', 'Efekt ▾', 'Efekti ayır veya kaldır');
  };
  const modeSeg = (cur) => '<span class="seg">' + [['perspective', 'Perspektif'], ['parallel', 'Paralel']].map(([v, l]) => '<button data-act="fxMode:' + v + '" class="' + (cur === v ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const extrudeControls = (fx) =>
    modeSeg(fx.mode) +
    (fx.mode === 'parallel' ? '' : range('Derinlik', 'fxDepth', Math.round(fx.depth * 100), 3, 95)) +
    tog('fxShade', 'Gölgeli', fx.shade, 'Yanlara ışık-gölge geçişi') +
    colorField('Yan', 'fxSide', fx.side || VP.hex(new paper.Color(0.45, 0.45, 0.45))) +
    (fx.side ? btn('fxSideAuto', 'Otomatik', 'Yan rengi nesnenin renginden türet') : '');
  const lensControls = (fx) => {
    const spec = VP.fx.LENS[fx.kind] || {};
    let h = '<label class="field"><span>Tür</span><select data-pf="fxLensKind" aria-label="Mercek türü">' + Object.keys(VP.fx.LENS).map((k) => '<option value="' + k + '"' + (k === fx.kind ? ' selected' : '') + '>' + esc(VP.fx.LENS[k].label) + '</option>').join('') + '</select></label>';
    if (spec.rate != null) h += range(spec.rateLabel, 'fxRate', Math.round(fx.rate * spec.scale), Math.round(spec.min * spec.scale), Math.round(spec.max * spec.scale));
    if (spec.color) h += colorField('Renk', 'fxLensColor', fx.color);
    return h;
  };
  const shapeToggles = () => tog('fromCenter', 'Merkezden', VP.defaults.fromCenter, 'Merkezden çiz (Shift)') + tog('equal', 'Eşit en-boy', VP.defaults.equal, 'Kare / daire (Ctrl)') + sep + strokeW();

  const selBar = () => {
    const s = VP.sel;
    const b = VP.selBounds();
    const one = s.length === 1 ? s[0] : null;
    const prm = one && one.data && one.data.param;
    const isText = one instanceof paper.PointText;
    let h = multiTog() + '<span class="pb-title">' + esc(one ? VP.describe(one) : s.length + ' nesne') + '</span>';
    h += field('X', 'x', mm(b.left)) + field('Y', 'y', mm(b.top)) + sep + field('En', 'w', mm(b.width)) +
      ibtn('ratio', VP.settings.keepRatio ? 'link' : 'unlink', VP.settings.keepRatio ? 'Oran korunuyor' : 'Oran serbest', VP.settings.keepRatio) +
      field('Boy', 'h', mm(b.height)) + field('Açı', 'angle', VP.num(one ? VP.itemAngle(one) : 0, 1), '°');
    if (prm) {
      h += sep;
      if (prm.kind === 'rect') h += field('Köşe', 'rectR', mm(prm.r || 0));
      if (prm.kind === 'polygon') {
        h += field(prm.star ? 'Uç' : 'Kenar', 'polySides', prm.sides, '');
        if (prm.star) h += range('Keskinlik', 'polyInner', Math.round((1 - prm.inner) * 100), 5, 95);
        h += tog('starToggle', 'Yıldız', prm.star, 'Yıldız / çokgen');
      }
      if (prm.kind === 'spiral') h += field('Tur', 'spiralTurns', VP.num(prm.turns, 1), '');
    }
    if (isText) h += sep + textControls(one) + ibtn('txToPara', 'paragraph', 'Paragraf metnine dönüştür') + ibtn('txPathTool', 'textpath', 'Yola yerleştir: sonra eğriye dokunun');
    if (s.length === 2 && s.some((i) => i instanceof paper.PointText) && s.some((i) => VP.fx.isShape(i))) h += sep + btn('txFitPath', ic('textpath', 'sm') + 'Yola yerleştir', 'Metni eğrinin üzerine yerleştir', 'primary');
    (UI.selExtras || []).forEach((f) => (h += f(s, one) || ''));
    if (one && VP.fx.isFx(one)) h += sep + fxFields(one);
    else if (VP.toolId === 'blendTool' && s.length === 2) h += sep + btn('fxBlend', ic('blend', 'sm') + 'Harmanla', 'Seçili iki nesneyi harmanla', 'primary');
    else h += sep + btn('fxAddMenu', ic('blend', 'sm') + 'Efekt ▾', 'Harmanlama, kontur, zarf, perspektif');
    h += sep + ibtn('flipH', 'flipH', 'Yatay çevir') + ibtn('flipV', 'flipV', 'Dikey çevir') + ibtn('rot90', 'rotate', '90° döndür');
    h += sep;
    if (s.length > 1) h += btn('shapeMenu', ic('weld', 'sm') + 'Şekillendir', 'Kaynak, kırp, kesişim, dışla');
    if (s.length > 1) h += ibtn('group', 'group', 'Grupla (Ctrl+G)');
    if (s.some((i) => i instanceof paper.Group)) h += ibtn('ungroup', 'ungroup', 'Grubu çöz (Ctrl+U)');
    if (s.some((i) => (i.data && i.data.param) || i instanceof paper.PointText || i instanceof paper.Group)) h += ibtn('toCurves', 'curves', 'Eğriye dönüştür (Ctrl+Q)');
    h += ibtn('toFront', 'toFront', 'En öne') + ibtn('toBack', 'toBack', 'En arkaya');
    h += sep + ibtn('duplicate', 'duplicate', 'Çoğalt (Ctrl+D)') + ibtn('delete', 'trash', 'Sil');
    return h;
  };
  const nodeBar = () => {
    const n = VP.tools.node;
    if (!n.target) return '<span class="pb-title">Şekil aracı</span><span class="pb-label">Düzenlemek istediğiniz eğriye dokunun</span>';
    const c = n.segs.size;
    return multiTog() + '<span class="pb-title">Düğümler</span><span class="pb-label">' + c + ' seçili</span>' + sep +
      btn('nAdd', ic('plus', 'sm') + 'Ekle', 'Seçili düğümden sonra düğüm ekle') + btn('nDel', ic('minus', 'sm') + 'Sil', 'Seçili düğümleri sil') + sep +
      btn('nCusp', 'Köşe', 'Tutamaçlar bağımsız') + btn('nSmooth', 'Düzgün', 'Tutamaçlar aynı doğrultuda') + btn('nSym', 'Simetrik', 'Tutamaçlar eşit uzunlukta') + sep +
      btn('nLine', 'Düz çizgi', 'Segmenti düz çizgiye çevir') + btn('nCurve', 'Eğri', 'Segmenti eğriye çevir') + sep +
      btn('nClose', 'Aç / kapat', 'Eğriyi aç veya kapat');
  };
  const toolBar = (id) => {
    const d = VP.defaults;
    switch (id) {
      case 'select':
        return multiTog() + pageControls() + sep + tog('grid', ic('grid', 'sm') + 'Izgara', VP.settings.grid, 'Izgarayı göster') + tog('snap', ic('magnet', 'sm') + 'Yapış', VP.settings.snap, 'Izgaraya yapış') + field('Aralık', 'gridMM', VP.num(VP.settings.gridMM, 1));
      case 'rect':
        return '<span class="pb-title">Dörtgen</span>' + field('Köşe', 'rectR', VP.num(d.rectRadius, 1)) + shapeToggles();
      case 'ellipse':
        return '<span class="pb-title">Elips</span>' + shapeToggles();
      case 'polygon':
        return '<span class="pb-title">Çokgen</span>' + field('Kenar', 'polySides', d.polySides, '') + shapeToggles();
      case 'star':
        return '<span class="pb-title">Yıldız</span>' + field('Uç', 'polySides', d.polySides, '') + range('Keskinlik', 'polyInner', Math.round((1 - d.polyInner) * 100), 5, 95) + shapeToggles();
      case 'spiral':
        return '<span class="pb-title">Spiral</span>' + field('Tur', 'spiralTurns', VP.num(d.spiralTurns, 1), '') + shapeToggles();
      case 'freehand':
        return '<span class="pb-title">Serbest çizim</span>' + range('Yumuşatma', 'smoothing', d.smoothing, 0, 10) + sep + strokeW();
      case 'brush':
        return '<span class="pb-title">Artistik fırça</span>' + field('Genişlik', 'brushWidth', VP.num(d.brushWidth, 1)) + tog('pressure', ic('pencil', 'sm') + 'Basınç', d.pressure, 'Apple Pencil baskısını kullan') +
          '<span class="st-chip"><i style="background:' + esc(d.stroke || d.fill || '#1d1d1b') + '"></i>Mürekkep</span>';
      case 'pen': {
        const p = VP.tools.pen.path;
        if (p) return '<span class="pb-title">Bézier kalem</span><span class="pb-label">' + p.segments.length + ' nokta</span>' + btn('penFinish', 'Bitir', 'Eğriyi bitir (Enter)', 'primary') + btn('penUndo', 'Son noktayı sil', 'Son noktayı sil (Backspace)') + btn('penCancel', 'İptal', 'Eğriyi iptal et');
        return '<span class="pb-title">Bézier kalem</span>' + strokeW() + '<span class="pb-label">Dokun: köşe · Sürükle: eğri</span>';
      }
      case 'line':
        return '<span class="pb-title">2 noktalı çizgi</span>' + strokeW();
      case 'text':
        return '<span class="pb-title">Metin</span>' + textControls(null) + '<span class="pb-label">Dokun: metin · Sürükle: paragraf</span>';
      case 'eyedropper':
        return '<span class="pb-title">Damlalık</span><span class="pb-label">Bir nesneye dokunun</span>';
      case 'blendTool':
        return '<span class="pb-title">Harmanlama</span>' + field('Adım', 'fxSteps', d.blendSteps, '') + range('Hızlanma', 'fxAccel', Math.round(d.blendAccel * 100), -100, 100) + '<span class="pb-label">İki nesneye sırayla dokunun</span>';
      case 'contourTool':
        return '<span class="pb-title">Kontur</span>' + dirSeg(d.contourDir) + field('Adım', 'fxSteps', d.contourSteps, '') + field('Aralık', 'fxOffset', VP.num(d.contourOffset, 1)) + colorField('Bitiş', 'fxEnd', d.contourEnd) + '<span class="pb-label">Kapalı bir şekle dokunun</span>';
      case 'envelopeTool':
        return '<span class="pb-title">Zarf</span><span class="pb-label">Bükmek istediğiniz nesneye dokunun · Düğümleri sürükleyin</span>';
      case 'perspectiveTool':
        return '<span class="pb-title">Perspektif</span><span class="pb-label">Bir nesneye dokunun · 4 köşeyi sürükleyin</span>';
      case 'extrudeTool':
        return '<span class="pb-title">Derinlik</span>' + modeSeg(d.extrudeMode) + (d.extrudeMode === 'parallel' ? '' : range('Derinlik', 'fxDepth', Math.round(d.extrudeDepth * 100), 3, 95)) + tog('fxShade', 'Gölgeli', d.extrudeShade, 'Yanlara ışık-gölge geçişi') + '<span class="pb-label">Bir şekle dokunun</span>';
      case 'lensTool':
        return '<span class="pb-title">Mercek</span><label class="field"><span>Tür</span><select data-pf="fxLensKind" aria-label="Mercek türü">' + Object.keys(VP.fx.LENS).map((k) => '<option value="' + k + '"' + (k === d.lensKind ? ' selected' : '') + '>' + esc(VP.fx.LENS[k].label) + '</option>').join('') + '</select></label><span class="pb-label">Mercek olacak kapalı şekle dokunun</span>';
      case 'powerclipTool': {
        const p = VP.tools.powerclipTool.pending;
        return '<span class="pb-title">PowerClip</span><span class="pb-label">' + (p ? p.length + ' nesne içerik olarak seçildi · Şimdi kaba dokunun' : 'Önce içeriğe, sonra kaba dokunun') + '</span>';
      }
      case 'hand':
      case 'zoom':
        return '<span class="pb-title">' + esc(VP.TOOL_META[id].label) + '</span>' + ibtn('zoomOut', 'zoomOut', 'Uzaklaştır') + ibtn('zoomIn', 'zoomIn', 'Yakınlaştır') + btn('fit', ic('fit', 'sm') + 'Sayfaya sığdır', 'Sayfaya sığdır') + btn('zoom100', '%100', 'Gerçek boyut');
      default:
        return (VP.tx && VP.tx.toolBar(id)) || '';
    }
  };
  UI.renderPropbar = () => {
    const pb = $('#propbar');
    if (pb.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && UI._pbTyping) return;
    let h;
    const ov = !UI.textItem && VP.tx ? VP.tx.propbar() : null;
    if (ov) h = ov;
    else if (UI.textItem) h = '<span class="pb-title">Metin yazılıyor</span>' + textControls(UI.textItem) + sep + btn('textDone', 'Bitti', 'Metni bitir', 'primary');
    else if (VP.toolId === 'node') h = nodeBar();
    else if (VP.toolId === 'powerclipTool' && VP.tools.powerclipTool.pending) h = toolBar('powerclipTool');
    else if (VP.sel.length && !(VP.toolId === 'pen' && VP.tools.pen.path) && !['hand', 'zoom'].includes(VP.toolId)) h = selBar();
    else h = toolBar(VP.toolId);
    pb.innerHTML = h;
  };
  const selParams = () => VP.sel.filter((it) => it.data && it.data.param);
  const selTexts = () => VP.sel.filter((it) => it instanceof paper.PointText).concat(UI.textItem && !VP.sel.includes(UI.textItem) ? [UI.textItem] : []);
  const applyTextProp = (fn) => {
    const ts = selTexts();
    if (ts.length) {
      ts.forEach(fn);
      if (UI.textItem) UI.syncTextEditor();
      else VP.commit();
    }
    return ts.length;
  };
  UI.propField = (name, raw, el) => {
    if (VP.tx && VP.tx.propField(name, raw, el)) {
      VP.io.savePrefs();
      return UI.schedule('prop', 'status', 'dock');
    }
    const v = VP.parseNum(raw);
    const d = VP.defaults;
    switch (name) {
      case 'x': if (isFinite(v)) VP.setSelGeom({ x: VP.toPT(v) }); break;
      case 'y': if (isFinite(v)) VP.setSelGeom({ y: VP.toPT(v) }); break;
      case 'w': if (v > 0) VP.setSelGeom({ w: VP.toPT(v) }); break;
      case 'h': if (v > 0) VP.setSelGeom({ h: VP.toPT(v) }); break;
      case 'angle':
        if (isFinite(v)) {
          const cur = VP.sel.length === 1 ? VP.itemAngle(VP.sel[0]) : 0;
          VP.rotateSel(VP.norm(v - cur));
        }
        break;
      case 'rectR': {
        const ps = selParams().filter((it) => it.data.param.kind === 'rect');
        if (ps.length && isFinite(v)) {
          ps.forEach((it) => {
            it.data.param.r = Math.max(0, VP.toPT(v));
            VP.rebuildParam(it);
          });
          VP.commit();
        } else if (isFinite(v)) d.rectRadius = Math.max(0, v);
        break;
      }
      case 'polySides': {
        const n = Math.round(VP.clamp(v, 3, 64));
        const ps = selParams().filter((it) => it.data.param.kind === 'polygon');
        if (ps.length && isFinite(n)) {
          ps.forEach((it) => {
            it.data.param.sides = n;
            VP.rebuildParam(it);
          });
          VP.commit();
        } else if (isFinite(n)) d.polySides = n;
        break;
      }
      case 'polyInner': {
        const inner = 1 - VP.clamp(v, 5, 95) / 100;
        if (el && el.nextElementSibling) el.nextElementSibling.textContent = Math.round(v);
        const ps = selParams().filter((it) => it.data.param.kind === 'polygon' && it.data.param.star);
        if (ps.length) {
          ps.forEach((it) => {
            it.data.param.inner = inner;
            VP.rebuildParam(it);
          });
          if (!el || !el.dataset.live || UI._rangeDone) VP.commit();
        } else d.polyInner = inner;
        break;
      }
      case 'spiralTurns': {
        const t = VP.clamp(v, 0.5, 30);
        const ps = selParams().filter((it) => it.data.param.kind === 'spiral');
        if (ps.length && isFinite(t)) {
          ps.forEach((it) => {
            it.data.param.turns = t;
            VP.rebuildParam(it);
          });
          VP.commit();
        } else if (isFinite(t)) d.spiralTurns = t;
        break;
      }
      case 'font':
        if (document.fonts) document.fonts.load('24px "' + raw + '"').then(() => paper.view.update && paper.view.update()).catch(() => {});
        if (!applyTextProp((t) => (t.fontFamily = raw))) d.fontFamily = raw;
        break;
      case 'fontSize':
        if (v > 0 && !applyTextProp((t) => (t.fontSize = v))) d.fontSize = v;
        break;
      case 'pagePreset': {
        const o = VP.PAGE_PRESETS.find((x) => x.id === raw);
        if (o) {
          const p = VP.page();
          const land = p.w > p.h;
          VP.setPageSize(land ? o.h : o.w, land ? o.w : o.h);
        }
        break;
      }
      case 'pageW': if (v > 1) VP.setPageSize(v, VP.toMM(VP.page().h)); break;
      case 'pageH': if (v > 1) VP.setPageSize(VP.toMM(VP.page().w), v); break;
      case 'gridMM':
        if (v > 0.1) {
          VP.settings.gridMM = v;
          VP.drawGrid();
          VP.io.savePrefs();
        }
        break;
      case 'strokeW':
        if (v >= 0) d.strokeWidth = VP.toPT(v);
        break;
      case 'smoothing':
        d.smoothing = VP.clamp(v, 0, 10);
        if (el && el.nextElementSibling) el.nextElementSibling.textContent = d.smoothing;
        break;
      case 'brushWidth':
        if (v > 0) d.brushWidth = v;
        break;
      case 'fxSteps': {
        const n = Math.round(VP.clamp(v, 1, 200));
        if (!isFinite(n)) break;
        const g = selFx();
        if (g && (g.data.effect.type === 'blend' || g.data.effect.type === 'contour')) {
          VP.fx.update(g, { steps: g.data.effect.type === 'contour' ? Math.min(n, 40) : n });
          VP.commit();
        } else if (VP.toolId === 'contourTool') d.contourSteps = Math.min(n, 40);
        else d.blendSteps = n;
        break;
      }
      case 'fxAccel': {
        const a = VP.clamp(v, -100, 100) / 100;
        if (el && el.nextElementSibling) el.nextElementSibling.textContent = Math.round(v);
        const g = selFx('blend');
        if (g) {
          VP.fx.update(g, { accel: a });
          if (!el || !el.dataset.live || UI._rangeDone) VP.commit();
        } else d.blendAccel = a;
        break;
      }
      case 'fxOffset': {
        if (!(v > 0)) break;
        const g = selFx('contour');
        if (g) {
          VP.fx.update(g, { offset: VP.toPT(v) });
          VP.commit();
          if (!g.data.effect.made) UI.toast('Bu aralıkla kontur oluşmadı · Aralığı küçültün');
        } else d.contourOffset = v;
        break;
      }
      case 'fxEnd': {
        const hex = UI.normHex(raw);
        if (!hex) break;
        const g = selFx('contour');
        if (g) {
          VP.fx.update(g, { endFill: hex });
          VP.commit();
        } else d.contourEnd = hex;
        break;
      }
      case 'fxDepth': {
        const dep = VP.clamp(v, 3, 95) / 100;
        if (el && el.nextElementSibling) el.nextElementSibling.textContent = Math.round(v);
        const g = selFx('extrude');
        if (g) {
          VP.fx.update(g, { depth: dep });
          if (!el || !el.dataset.live || UI._rangeDone) VP.commit();
        } else d.extrudeDepth = dep;
        break;
      }
      case 'fxSide': {
        const hex = UI.normHex(raw);
        const g = selFx('extrude');
        if (g && hex) {
          VP.fx.update(g, { side: hex });
          VP.commit();
        }
        break;
      }
      case 'fxLensKind': {
        const g = selFx('lens');
        if (g) {
          VP.fx.setLensKind(g, raw);
          VP.commit();
        } else d.lensKind = raw;
        break;
      }
      case 'fxRate': {
        const g = selFx('lens');
        if (!g) break;
        const spec = VP.fx.LENS[g.data.effect.kind];
        if (!spec || spec.rate == null) break;
        const rate = VP.clamp(v / spec.scale, spec.min, spec.max);
        if (el && el.nextElementSibling) el.nextElementSibling.textContent = Math.round(v);
        VP.fx.update(g, { rate });
        if (!el || !el.dataset.live || UI._rangeDone) VP.commit();
        break;
      }
      case 'fxLensColor': {
        const hex = UI.normHex(raw);
        const g = selFx('lens');
        if (g && hex) {
          VP.fx.update(g, { color: hex });
          VP.commit();
        }
        break;
      }
    }
    VP.io.savePrefs();
    UI.schedule('prop', 'status', 'dock');
  };
  UI.act = (id, el) => {
    const d = VP.defaults;
    if (VP.tx && VP.tx.act(id, el)) {
      VP.io.savePrefs();
      return UI.schedule('prop', 'status', 'dock', 'palette');
    }
    if (id.startsWith('just:')) {
      const j = id.slice(5);
      if (!applyTextProp((t) => (t.justification = j))) d.justification = j;
      return UI.schedule('prop');
    }
    if (id.startsWith('fxDir:')) {
      const dir = id.slice(6);
      const g = selFx('contour');
      if (g) {
        VP.fx.update(g, { dir });
        VP.commit();
        if (!g.data.effect.made) UI.toast('Bu aralıkla kontur oluşmadı · Aralığı küçültün');
      } else d.contourDir = dir;
      VP.io.savePrefs();
      return UI.schedule('prop', 'status', 'dock');
    }
    if (id.startsWith('fxMode:')) {
      const mode = id.slice(7);
      const g = selFx('extrude');
      if (g) {
        VP.fx.update(g, { mode });
        VP.commit();
      } else d.extrudeMode = mode;
      VP.io.savePrefs();
      return UI.schedule('prop', 'status', 'dock');
    }
    if (id === 'fxShade' || id === 'fxSideAuto') {
      const g = selFx('extrude');
      if (g) {
        VP.fx.update(g, id === 'fxShade' ? { shade: !g.data.effect.shade } : { side: null });
        VP.commit();
      } else if (id === 'fxShade') d.extrudeShade = !d.extrudeShade;
      VP.io.savePrefs();
      return UI.schedule('prop', 'dock');
    }
    if (id === 'fxMenu') return UI.popover(el, menuHTML(['fxSeparate', 'fxClear']), (pid) => UI.run(pid));
    if (id === 'fxAddMenu') return UI.popover(el, menuHTML(['fxBlend', 'fxContour', 'fxEnvelope', 'fxPerspective', 'fxExtrude', 'fxLens', 'fxPowerclip', 'fxPowerclip2']), (pid) => UI.run(pid));
    if (id === 'fxEdit') {
      const g = selFx();
      if (g) VP.setTool(VP.fx.toolFor(g));
      return;
    }
    if (id === 'fxPresets') {
      const g = selFx();
      if (!g) return;
      const env = g.data.effect.type === 'envelope';
      const items = env
        ? [['flat', 'Düz (sıfırla)'], ['arch', 'Kemer'], ['archDown', 'Ters kemer'], ['bulge', 'Şişkin'], ['pinch', 'Sıkıştır'], ['taper', 'Yamuk'], ['flag', 'Bayrak']]
        : [['flat', 'Düz (sıfırla)'], ['one', 'Tek nokta · üst daralır'], ['floor', 'Zemin · alt daralır'], ['left', 'Sağa kaçan'], ['right', 'Sola kaçan']];
      return UI.popover(el, items.map(([k, l]) => '<button class="pop-item" data-pick="' + k + '">' + esc(l) + '</button>').join(''), (k) => (env ? VP.fx.envPreset(g, k) : VP.fx.perspPreset(g, k)));
    }
    if (id.startsWith('orient:')) {
      const p = VP.page();
      const land = id.endsWith('l');
      const w = VP.toMM(p.w);
      const h = VP.toMM(p.h);
      if (land !== w > h) VP.setPageSize(h, w);
      return;
    }
    switch (id) {
      case 'multi':
        VP.settings.multi = !VP.settings.multi;
        UI.toast(VP.settings.multi ? 'Çoklu seçim açık · Dokunduğunuz nesneler seçime eklenir' : 'Çoklu seçim kapalı');
        break;
      case 'ratio': VP.settings.keepRatio = !VP.settings.keepRatio; VP.io.savePrefs(); break;
      case 'grid': case 'snap': return UI.toggleSetting(id);
      case 'fromCenter': d.fromCenter = !d.fromCenter; break;
      case 'equal': d.equal = !d.equal; break;
      case 'pressure': d.pressure = !d.pressure; break;
      case 'starToggle':
        selParams().filter((it) => it.data.param.kind === 'polygon').forEach((it) => {
          it.data.param.star = !it.data.param.star;
          VP.rebuildParam(it);
        });
        VP.commit();
        break;
      case 'bold':
        if (!applyTextProp((t) => (t.fontWeight = VP.textWeight(!VP.isBold(t), VP.isItalic(t))))) d.bold = !d.bold;
        break;
      case 'italic':
        if (!applyTextProp((t) => (t.fontWeight = VP.textWeight(VP.isBold(t), !VP.isItalic(t))))) d.italic = !d.italic;
        break;
      case 'shapeMenu':
        return UI.popover(el, menuHTML(['weld', 'trim', 'intersect', 'exclude', '|', 'combine', 'breakApart']), (pid) => UI.run(pid));
      case 'penFinish': VP.tools.pen.finish(); break;
      case 'penUndo': VP.tools.pen.removeLast(); break;
      case 'penCancel': VP.tools.pen.cancelPath(); break;
      case 'nAdd': VP.tools.node.addNodes(); break;
      case 'nDel': VP.tools.node.deleteNodes(); break;
      case 'nCusp': VP.tools.node.setType('cusp'); break;
      case 'nSmooth': VP.tools.node.setType('smooth'); break;
      case 'nSym': VP.tools.node.setType('symmetric'); break;
      case 'nLine': VP.tools.node.toLine(); break;
      case 'nCurve': VP.tools.node.toCurve(); break;
      case 'nClose': VP.tools.node.toggleClosed(); break;
      case 'zoomIn': VP.zoomAt(1.25); break;
      case 'zoomOut': VP.zoomAt(0.8); break;
      case 'textDone': UI.commitText(); break;
      default:
        if (A[id]) return UI.run(id);
    }
    VP.io.savePrefs();
    UI.schedule('prop', 'status');
  };
  const bindPropbar = () => {
    const pb = $('#propbar');
    pb.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) UI.act(b.dataset.act, b);
    });
    pb.addEventListener('focusin', (e) => {
      if (e.target.tagName === 'INPUT') UI._pbTyping = true;
    });
    pb.addEventListener('focusout', () => (UI._pbTyping = false));
    pb.addEventListener('change', (e) => {
      const t = e.target;
      if (!t.dataset.pf) return;
      UI._pbTyping = false;
      UI._rangeDone = true;
      UI.propField(t.dataset.pf, t.value, t);
      UI._rangeDone = false;
    });
    pb.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.live) UI.propField(t.dataset.pf, t.value, t);
    });
    pb.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
    });
  };

  /* ================= dock ================= */
  UI.openDock = (tab) => {
    $('#dock').hidden = false;
    if (tab) UI.dockTab = tab;
    UI.renderDock(true);
    UI.renderTop();
    VP.io.savePrefs();
    setTimeout(() => UI.onResize && UI.onResize(), 0);
  };
  UI.toggleDock = () => {
    const d = $('#dock');
    d.hidden = !d.hidden;
    UI.renderDock(true);
    UI.renderTop();
    setTimeout(() => UI.onResize && UI.onResize(), 0);
  };
  // Window › Toolbars: show or hide the workspace bars.
  UI.applyBars = () => {
    const b = Object.assign({ std: true, prop: true, tools: true, status: true, palette: true, docpal: true }, VP.settings.bars || {});
    VP.settings.bars = b;
    $('#stdbar').hidden = !b.std;
    $('#propbar').hidden = !b.prop;
    $('#toolbox').hidden = !b.tools;
    $('#statusbar').hidden = !b.status;
    $('#palette').hidden = !b.palette;
    $('#docpal').hidden = !b.docpal;
    if (b.docpal) {
      UI._dpKey = null;
      UI.renderDocPal();
    }
    setTimeout(() => UI.onResize && UI.onResize(), 0);
  };
  UI.DOCKERS = [['props', 'Özellikler'], ['objects', 'Nesneler'], ['pages', 'Sayfalar'], ['align', 'Hizala ve Dağıt'], ['transform', 'Dönüştür'], ['step', 'Adım ve Tekrar']];
  UI.renderDockTabs = () => {
    const open = !$('#dock').hidden;
    $('#dock-tabs').innerHTML = UI.DOCKERS.map(([k, l]) => {
      const on = open && k === UI.dockTab;
      return '<button class="dtab' + (on ? ' on' : '') + '" data-tab="' + k + '" role="tab" aria-selected="' + on + '" title="' + esc(l) + '">' + esc(l) + '</button>';
    }).join('');
  };
  UI.renderDock = (force) => {
    const dock = $('#dock');
    if (!UI.DOCKERS.some(([k]) => k === UI.dockTab)) UI.dockTab = UI.dockTab === 'arrange' ? 'align' : 'props';
    UI.renderDockTabs();
    $('#dock-title').textContent = UI.DOCKERS.find(([k]) => k === UI.dockTab)[1];
    if (dock.hidden) return;
    const body = $('#dock-body');
    if (!force && UI._dockTyping && body.contains(document.activeElement)) return;
    const st = body.scrollTop;
    // other modules add (or replace) docker panels here
    if (UI.panels && UI.panels[UI.dockTab]) body.innerHTML = UI.panels[UI.dockTab]();
    else if (UI.dockTab === 'props') body.innerHTML = propsPanel();
    else if (UI.dockTab === 'objects') body.innerHTML = objectsPanel();
    else if (UI.dockTab === 'align') body.innerHTML = alignPanel();
    else if (UI.dockTab === 'transform') body.innerHTML = transformPanel();
    else if (UI.dockTab === 'step') body.innerHTML = stepPanel();
    else body.innerHTML = pagesPanel();
    body.scrollTop = st;
  };
  const colorIn = (k, hex, label) =>
    '<span class="color-in"><input type="color" data-dk="' + k + '" value="' + esc(hex || '#000000') + '" aria-label="' + esc(label) + '"><input type="text" data-dk="' + k + 'Hex" value="' + esc(hex || '') + '" aria-label="' + esc(label) + ' HEX" spellcheck="false"></span>';
  const dfield = (label, k, value, unit = 'mm') =>
    '<label class="field"><span>' + esc(label) + '</span><input data-dk="' + k + '" value="' + esc(value) + '" inputmode="decimal" enterkeyhint="done" aria-label="' + esc(label) + '">' + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</label>';
  const segB = (items, cur, prefix) => '<span class="seg">' + items.map(([v, l]) => '<button data-act="' + prefix + v + '" class="' + (v === cur ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const propsPanel = () => {
    const items = VP.sel;
    const has = items.length > 0;
    const it = items[0];
    const isImg = has && items.every((i) => i instanceof paper.Raster);
    const ffx = has && items.length === 1 && VP.fx.of(it) && VP.fx.of(it).type === 'fillfx' ? VP.fx.of(it) : null;
    const fill = ffx ? { type: ffx.kind, color: ffx.c0, color2: ffx.c1 || '#ffffff', angle: ffx.angle || 0, alpha: 1 } : has ? VP.getFill(it) : { type: VP.defaults.fill ? 'solid' : 'none', color: VP.defaults.fill || '#ffffff', color2: '#1461b2', angle: 90, alpha: 1 };
    const st = has ? VP.getStroke(it) : { on: !!VP.defaults.stroke, color: VP.defaults.stroke || '#1d1d1b', width: VP.defaults.strokeWidth, dash: VP.defaults.dash, cap: VP.defaults.cap, join: VP.defaults.join };
    let h = '<p class="sec-note">' + (has ? (items.length > 1 ? items.length + ' nesne seçili · Değişiklikler hepsine uygulanır' : esc(VP.describe(it)) + ' seçili') : 'Seçim yok · Bu ayarlar yeni çizilen nesnelere uygulanır') + '</p>';
    if (!isImg) {
      // conical, square, pattern and texture fills work on closed shapes only
      const special = has && items.every((i) => (VP.fx.of(i) && VP.fx.of(i).type === 'fillfx') || (VP.isPathItem(i) && !VP.fx.isFx(i) && !(i instanceof paper.Path && !i.closed)));
      const types = has ? [['none', 'Yok'], ['solid', 'Düz'], ['linear', 'Doğrusal'], ['radial', 'Dairesel']].concat(special ? [['conical', 'Konik'], ['square', 'Kare'], ['pattern', 'Desen'], ['texture', 'Doku']] : []) : [['none', 'Yok'], ['solid', 'Düz']];
      h += '<div class="sec"><div class="sec-h"><h3>Dolgu</h3></div><div class="fill-types">' + types.map(([v, l]) => '<button class="btn' + (v === fill.type ? ' on' : '') + '" data-act="fill:' + v + '" aria-pressed="' + (v === fill.type) + '">' + l + '</button>').join('') + '</div>';
      if (ffx) h += '<p class="sec-note">' + esc(VP.fx.describe(it)) + ' · Ayarları aşağıda “Özel dolgu” bölümünde</p>';
      if (fill.type === 'solid') h += '<div class="row">' + colorIn('fill', fill.color, 'Dolgu rengi') + '</div>';
      if (fill.type === 'linear' || fill.type === 'radial') {
        h += '<div class="row">' + colorIn('fill', fill.color, 'Başlangıç rengi') + colorIn('fill2', fill.color2, 'Bitiş rengi') + '</div>';
        h += '<div class="row">' + (fill.type === 'linear' ? dfield('Açı', 'fillAngle', VP.num(fill.angle, 0), '°') : '') + '<button class="btn" data-act="fillReverse">Renkleri değiştir</button></div>';
      }
      h += '</div>';
      h += '<div class="sec"><div class="sec-h"><h3>Anahat</h3><button class="btn' + (st.on ? ' on' : '') + '" data-act="strokeOn" aria-pressed="' + st.on + '">' + (st.on ? 'Açık' : 'Kapalı') + '</button></div>';
      if (st.on) {
        h += '<div class="row">' + colorIn('stroke', st.color, 'Anahat rengi') + dfield('Kalınlık', 'strokeW', VP.num(VP.toMM(st.width), 2)) + '</div>';
        h += '<div class="row"><label class="field"><span>Çizgi</span><select data-dk="dash">' + VP.DASH_LABELS.map(([v, l]) => '<option value="' + v + '"' + (v === st.dash ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>';
        h += '<div class="row"><span class="pb-label">Uç</span>' + segB([['butt', 'Düz'], ['round', 'Yuvarlak'], ['square', 'Kare']], st.cap, 'cap:') + '</div>';
        h += '<div class="row"><span class="pb-label">Köşe</span>' + segB([['miter', 'Sivri'], ['round', 'Yuvarlak'], ['bevel', 'Kesik']], st.join, 'join:') + '</div>';
      }
      h += '</div>';
    } else {
      h += '<p class="sec-note">Resim nesnesi · Dolgu ve anahat uygulanmaz</p>';
    }
    (UI.propsExtras || []).forEach((f) => (h += f(items, it) || ''));
    if (has) {
      const op = Math.round((it.opacity == null ? 1 : it.opacity) * 100);
      h += '<div class="sec"><div class="sec-h"><h3>Saydamlık</h3></div><label class="range"><span class="pb-label">Opaklık</span><input type="range" data-dk="opacity" min="0" max="100" value="' + op + '" aria-label="Opaklık"><output>' + op + '%</output></label>' +
        '<label class="field"><span>Karışım</span><select data-dk="blend">' + VP.BLENDS.map(([v, l]) => '<option value="' + v + '"' + ((it.blendMode || 'normal') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>';
      const sh = VP.getShadow(it);
      h += '<div class="sec"><div class="sec-h"><h3>Gölge</h3><button class="btn' + (sh.on ? ' on' : '') + '" data-act="shadowOn" aria-pressed="' + sh.on + '">' + (sh.on ? 'Açık' : 'Kapalı') + '</button></div>';
      if (sh.on) {
        const sa = Math.round(sh.alpha * 100);
        h += '<div class="row">' + colorIn('sh', sh.color, 'Gölge rengi') + '</div>' +
          '<label class="range"><span class="pb-label">Opaklık</span><input type="range" data-dk="shAlpha" min="0" max="100" value="' + sa + '" aria-label="Gölge opaklığı"><output>' + sa + '%</output></label>' +
          '<div class="row">' + dfield('Yumuşaklık', 'shBlur', VP.num(VP.toMM(sh.blur), 1)) + '</div>' +
          '<div class="row">' + dfield('X', 'shDx', VP.num(VP.toMM(sh.dx), 1)) + dfield('Y', 'shDy', VP.num(VP.toMM(sh.dy), 1)) + '</div>';
      }
      h += '</div>';
    }
    const ext = items.length === 1 && VP.fx.ext(it);
    if (ext && ext.panel) {
      h += '<div class="sec"><div class="sec-h"><h3>' + esc(VP.fx.NAMES[it.data.effect.type]) + '</h3></div>' + ext.panel(it) + '</div>';
    } else if (has) {
      h += '<div class="sec"><div class="sec-h"><h3>Efektler</h3></div>';
      const g = items.length === 1 && VP.fx.isFx(it) ? it : null;
      if (g) {
        const fx = g.data.effect;
        h += '<p class="sec-note">' + esc(VP.fx.describe(g)) + '</p>';
        if (fx.type === 'blend') {
          h += '<div class="row">' + dfieldPf('Adım', 'fxSteps', fx.steps, '') + '</div>' +
            '<label class="range"><span class="pb-label">Hızlanma</span><input type="range" data-pf="fxAccel" data-live="1" min="-100" max="100" value="' + Math.round((fx.accel || 0) * 100) + '" aria-label="Hızlanma"><output>' + Math.round((fx.accel || 0) * 100) + '</output></label>' +
            '<p class="sec-note">Renk ve şekil, alttaki başlangıç nesnesinden üstteki bitiş nesnesine geçer.</p>';
        }
        if (fx.type === 'contour') {
          h += '<div class="row">' + dirSeg(fx.dir) + '</div><div class="row">' + dfieldPf('Adım', 'fxSteps', fx.steps, '') + dfieldPf('Aralık', 'fxOffset', mm(fx.offset, 1)) + '</div>' +
            '<div class="row">' + colorField('Bitiş dolgusu', 'fxEnd', fx.endFill) + '</div>';
        }
        if (fx.type === 'envelope' || fx.type === 'perspective') {
          h += '<div class="row"><button class="btn" data-act="fxPresets">Hazır biçimler ▾</button><button class="btn" data-act="fxEdit">' + ic('node', 'sm') + 'Düğümleri düzenle</button></div>';
          if (fx.untouched) h += '<p class="sec-note">Fira Sans dışındaki metinler ve resimler bükülmez.</p>';
        }
        if (fx.type === 'extrude') {
          h += '<div class="row">' + extrudeControls(fx) + '</div><div class="row"><button class="btn" data-act="fxEdit">' + ic('extrude', 'sm') + 'Kaçış noktasını sürükle</button></div>';
        }
        if (fx.type === 'lens') {
          h += '<div class="row">' + lensControls(fx) + '</div><p class="sec-note">Mercek, altındaki nesneleri canlı gösterir; onları taşıdığınızda güncellenir. Resimlerin rengi değişmez.</p>';
        }
        if (fx.type === 'powerclip') {
          h += '<div class="grid-btns"><button class="btn" data-act="pcCenter">Ortala</button><button class="btn" data-act="pcFit">Sığdır</button><button class="btn" data-act="pcFill">Doldur</button></div>' +
            '<div class="row"><button class="btn" data-act="fxEdit">' + ic('hand', 'sm') + 'İçeriği taşı</button></div><p class="sec-note">Kaldır: içerik kaptan çıkarılır.</p>';
        }
        h += '<div class="row"><button class="btn" data-act="fxSeparate">Ayır</button><button class="btn danger" data-act="fxClear">Kaldır</button></div>';
      } else {
        const one = items.length === 1;
        h += '<div class="grid-btns" style="grid-template-columns:repeat(2,1fr)">' +
          '<button class="btn" data-act="fxBlend"' + (items.length === 2 ? '' : ' disabled') + '>' + ic('blend', 'sm') + 'Harmanla</button>' +
          '<button class="btn" data-act="fxContour"' + (one ? '' : ' disabled') + '>' + ic('contour', 'sm') + 'Kontur</button>' +
          '<button class="btn" data-act="fxEnvelope"' + (one ? '' : ' disabled') + '>' + ic('envelope', 'sm') + 'Zarf</button>' +
          '<button class="btn" data-act="fxPerspective"' + (one ? '' : ' disabled') + '>' + ic('perspective', 'sm') + 'Perspektif</button>' +
          '<button class="btn" data-act="fxExtrude"' + (one ? '' : ' disabled') + '>' + ic('extrude', 'sm') + 'Derinlik</button>' +
          '<button class="btn" data-act="fxLens"' + (one ? '' : ' disabled') + '>' + ic('lens', 'sm') + 'Mercek</button>' +
          '<button class="btn" data-act="fxPowerclip2"' + (items.length === 2 ? '' : ' disabled') + '>' + ic('powerclip', 'sm') + 'PowerClip</button>' +
          '<button class="btn" data-act="fxPowerclip">' + ic('powerclip', 'sm') + 'Kaba yerleştir…</button></div>' +
          '<p class="sec-note">Harmanlama ve hızlı PowerClip için iki nesne (üstteki alttakinin içine), diğerleri için tek nesne seçin. “Kaba yerleştir” ile seçimi, sonra dokunduğunuz şeklin içine koyarsınız.</p>';
      }
      h += '</div>';
    }
    return h;
  };
  const dfieldPf = (label, k, value, unit = 'mm') =>
    '<label class="field"><span>' + esc(label) + '</span><input data-pf="' + k + '" value="' + esc(value) + '" inputmode="decimal" enterkeyhint="done" aria-label="' + esc(label) + '">' + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</label>';
  const objectsPanel = () => {
    const ls = VP.userLayers();
    let h = '<div class="sec"><div class="sec-h"><h3>Katmanlar ve nesneler</h3><button class="btn" data-act="addLayer">' + ic('plus', 'sm') + 'Katman</button></div><div class="list">';
    ls.slice().reverse().forEach((L) => {
      const li = ls.indexOf(L);
      const active = L === VP.activeLayer;
      h += '<div class="layer-row' + (active ? ' active' : '') + '" data-li="' + li + '">' +
        '<button class="row-btn' + (L.visible ? '' : ' off') + '" data-act="layerVis" title="Göster/gizle" aria-label="Katmanı göster veya gizle">' + ic(L.visible ? 'eye' : 'eyeOff', 'sm') + '</button>' +
        '<span class="row-name" data-act="layerActivate" title="Yeni nesneler bu katmana çizilir">' + ic('layers', 'sm obj-kind') + ' ' + esc(L.name || 'Katman') + '</span>' +
        '<button class="row-btn' + (L.locked ? '' : ' off') + '" data-act="layerLock" title="Kilitle" aria-label="Katmanı kilitle">' + ic(L.locked ? 'lock' : 'unlock', 'sm') + '</button>' +
        '<button class="row-btn" data-act="layerMenu" title="Katman seçenekleri" aria-label="Katman seçenekleri">' + ic('menu', 'sm') + '</button></div>';
      L.children.slice().reverse().forEach((it) => {
        const ci = L.children.indexOf(it);
        const sel = VP.sel.includes(it);
        h += '<div class="obj-row' + (sel ? ' sel' : '') + '" data-li="' + li + '" data-ci="' + ci + '">' +
          '<span class="obj-kind">' + ic('kind_' + VP.kindOf(it), 'sm') + '</span>' +
          '<span class="row-name" data-act="objSel">' + esc(VP.describe(it)) + '</span>' +
          '<button class="row-btn' + (it.visible ? '' : ' off') + '" data-act="objVis" aria-label="Nesneyi göster veya gizle">' + ic(it.visible ? 'eye' : 'eyeOff', 'sm') + '</button>' +
          '<button class="row-btn' + (it.locked ? '' : ' off') + '" data-act="objLock" aria-label="Nesneyi kilitle">' + ic(it.locked ? 'lock' : 'unlock', 'sm') + '</button></div>';
      });
    });
    h += '</div><p class="sec-note">Üstteki katman en öndedir · Kilitli ve gizli nesneler seçilemez</p></div>';
    return h;
  };
  const alignPanel = () => {
    const a = VP.settings.alignTo;
    let h = '<div class="sec"><div class="sec-h"><h3>Hizala</h3>' + segB([['selection', 'Seçime'], ['page', 'Sayfaya']], a, 'alignTo:') + '</div>' +
      '<div class="grid-btns">' + [['l', 'alignL', 'Sol'], ['ch', 'alignCH', 'Orta'], ['r', 'alignR', 'Sağ'], ['t', 'alignT', 'Üst'], ['cv', 'alignCV', 'Merkez'], ['b', 'alignB', 'Alt']].map(([k, i, l]) => '<button class="btn" data-act="align:' + k + '" title="' + l + '">' + ic(i, 'sm') + l + '</button>').join('') + '</div>' +
      '<p class="sec-note">Tek nesne her zaman sayfaya hizalanır</p></div>';
    h += '<div class="sec"><div class="sec-h"><h3>Dağıt</h3></div><div class="grid-btns" style="grid-template-columns:repeat(2,1fr)">' +
      [['h', 'distH', 'Yatay merkez'], ['v', 'distV', 'Dikey merkez'], ['hs', 'distH', 'Yatay aralık'], ['vs', 'distV', 'Dikey aralık']].map(([k, i, l]) => '<button class="btn" data-act="dist:' + k + '">' + ic(i, 'sm') + l + '</button>').join('') + '</div></div>';
    return h;
  };
  const transformPanel = () =>
    '<div class="sec"><div class="sec-h"><h3>Döndür</h3></div><div class="row">' + dfield('Açı', 'tRot', '15', '°') + '<button class="btn" data-act="tRotApply">Uygula</button></div></div>' +
    '<div class="sec"><div class="sec-h"><h3>Ölçek ve yansıt</h3></div><div class="row">' + dfield('Ölçek', 'tScale', '100', '%') + '<button class="btn" data-act="tScaleApply">Uygula</button></div>' +
    '<div class="row"><button class="btn" data-act="flipH">' + ic('flipH', 'sm') + 'Yatay yansıt</button><button class="btn" data-act="flipV">' + ic('flipV', 'sm') + 'Dikey yansıt</button></div></div>' +
    '<div class="sec"><div class="sec-h"><h3>Eğ</h3></div><div class="row">' + dfield('Eğ X', 'tSkx', '0', '°') + dfield('Eğ Y', 'tSky', '0', '°') + '<button class="btn" data-act="tSkewApply">Uygula</button></div></div>' +
    '<p class="sec-note">Konum ve boyut için özellik çubuğundaki X, Y, En, Boy alanlarını kullanın.</p>';
  const stepPanel = () =>
    '<div class="sec"><div class="sec-h"><h3>Adım ve tekrar</h3></div>' +
    '<div class="row">' + dfield('Kopya', 'srN', '3', '') + '</div>' +
    '<div class="row">' + dfield('Yatay', 'srX', '10') + dfield('Dikey', 'srY', '0') + '</div>' +
    '<div class="row"><button class="btn primary" data-act="srApply">' + ic('stepRepeat', 'sm') + 'Kopyala</button></div>' +
    '<p class="sec-note">Seçimin kopyaları, verilen aralıkla art arda yerleştirilir.</p></div>';
  const pagesPanel = () => {
    if (VP._thumbDirty) {
      VP.storePage();
      VP.makeThumb();
      VP._thumbDirty = false;
    }
    let h = '<div class="sec"><div class="sec-h"><h3>Sayfalar</h3><button class="btn" data-act="addPage">' + ic('plus', 'sm') + 'Sayfa</button></div>';
    VP.doc.pages.forEach((p, i) => {
      const on = i === VP.doc.active;
      h += '<div class="page-card' + (on ? ' active' : '') + '" data-pi="' + i + '" role="button" tabindex="0" data-act="gotoPage">' +
        '<span class="page-thumb">' + (p.thumb ? '<img src="' + p.thumb + '" alt="">' : '') + '</span>' +
        '<span class="page-meta"><b>' + (i + 1) + '. ' + esc(p.name) + '</b><small>' + mm(p.w, 0) + ' × ' + mm(p.h, 0) + ' mm</small></span>' +
        '<span class="row" style="flex-wrap:nowrap;gap:2px"><button class="row-btn" data-act="pageUp" aria-label="Yukarı taşı">' + ic('chevUp', 'sm') + '</button><button class="row-btn" data-act="pageDown" aria-label="Aşağı taşı">' + ic('chevDown', 'sm') + '</button></span></div>';
    });
    h += '<div class="row"><button class="btn" data-act="renamePage">Yeniden adlandır</button><button class="btn" data-act="dupPage">' + ic('duplicate', 'sm') + 'Çoğalt</button><button class="btn danger" data-act="delPage">' + ic('trash', 'sm') + 'Sil</button></div></div>';
    h += '<div class="sec"><div class="sec-h"><h3>Etkin sayfanın boyutu</h3></div><div class="row" style="flex-wrap:wrap">' + pageControls() + '</div></div>';
    return h;
  };
  const targetsOrNull = () => (VP.sel.length ? VP.sel : null);
  UI.dockField = (k, raw, el, live) => {
    const items = targetsOrNull();
    const v = VP.parseNum(raw);
    const d = VP.defaults;
    const hex = UI.normHex(raw);
    const fillSpec = () => (items ? VP.getFill(items[0]) : { type: 'solid', color: d.fill || '#ffffff' });
    const done = () => (live ? UI.softCommit() : VP.commit());
    switch (k) {
      case 'fill':
      case 'fillHex':
        if (!hex) return;
        if (items) {
          const s = fillSpec();
          s.color = hex;
          if (s.type === 'none') s.type = 'solid';
          VP.setFill(items, s);
          done();
        } else {
          d.fill = hex;
          VP.emit('defaults');
        }
        UI.addRecent(hex);
        break;
      case 'fill2':
      case 'fill2Hex':
        if (!hex || !items) return;
        {
          const s = fillSpec();
          s.color2 = hex;
          VP.setFill(items, s);
          done();
        }
        break;
      case 'fillAngle':
        if (!items || !isFinite(v)) return;
        {
          const s = fillSpec();
          s.angle = v;
          VP.setFill(items, s);
          VP.commit();
        }
        break;
      case 'stroke':
      case 'strokeHex':
        if (!hex) return;
        if (items) {
          VP.setStroke(items, { on: true, color: hex });
          done();
        } else {
          d.stroke = hex;
          VP.emit('defaults');
        }
        UI.addRecent(hex);
        break;
      case 'strokeW':
        if (!(v >= 0)) return;
        if (items) {
          VP.setStroke(items, { width: VP.toPT(v) });
          VP.commit();
        } else d.strokeWidth = VP.toPT(v);
        break;
      case 'dash':
        if (items) {
          VP.setStroke(items, { dash: raw });
          VP.commit();
        } else d.dash = raw;
        break;
      case 'opacity':
        if (!items) return;
        items.forEach((it) => (it.opacity = VP.clamp(v, 0, 100) / 100));
        if (el && el.nextElementSibling) el.nextElementSibling.textContent = Math.round(v) + '%';
        done();
        break;
      case 'blend':
        if (!items) return;
        items.forEach((it) => (it.blendMode = raw));
        VP.commit();
        break;
      case 'sh':
      case 'shHex':
      case 'shAlpha':
      case 'shBlur':
      case 'shDx':
      case 'shDy': {
        if (!items) return;
        const sh = VP.getShadow(items[0]);
        if (k === 'sh' || k === 'shHex') {
          if (!hex) return;
          sh.color = hex;
        }
        if (k === 'shAlpha') {
          sh.alpha = VP.clamp(v, 0, 100) / 100;
          if (el && el.nextElementSibling) el.nextElementSibling.textContent = Math.round(v) + '%';
        }
        if (k === 'shBlur' && v >= 0) sh.blur = VP.toPT(v);
        if (k === 'shDx' && isFinite(v)) sh.dx = VP.toPT(v);
        if (k === 'shDy' && isFinite(v)) sh.dy = VP.toPT(v);
        sh.on = true;
        VP.setShadow(items, sh);
        done();
        break;
      }
      case 'layerName':
        break;
    }
    VP.io.savePrefs();
    UI.schedule('palette', 'status');
  };
  UI.softCommit = () => {
    clearTimeout(UI._sc);
    UI._sc = setTimeout(() => VP.commit(), 450);
  };
  UI.dockAct = async (id, el) => {
    const items = targetsOrNull();
    const d = VP.defaults;
    const [key, arg] = id.split(':');
    const row = el.closest('[data-li]');
    const L = row ? VP.userLayers()[+row.dataset.li] : null;
    const obj = row && row.dataset.ci != null && L ? L.children[+row.dataset.ci] : null;
    const card = el.closest('[data-pi]');
    const pi = card ? +card.dataset.pi : VP.doc.active;
    switch (key) {
      case 'fill': {
        if (!items) {
          d.fill = arg === 'none' ? null : d.fill || '#ffffff';
          VP.emit('defaults');
          break;
        }
        // conical, square, pattern and texture fills are handled by the special-fill module
        if (VP.fillfx && VP.fillfx.handleKind(items, arg)) break;
        const its = targetsOrNull() || items;
        const cur = VP.getFill(its[0]);
        const s = Object.assign({}, cur, { type: arg });
        if (arg !== 'none' && cur.type === 'none') s.color = '#ffffff';
        if ((arg === 'linear' || arg === 'radial') && !(cur.type === 'linear' || cur.type === 'radial')) {
          s.color = cur.type === 'solid' ? cur.color : '#ffffff';
          s.color2 = VP.colors.accent && VP.colors.accent.startsWith('#') ? VP.colors.accent : '#1461b2';
          s.angle = 90;
        }
        VP.setFill(its, s);
        VP.commit();
        break;
      }
      case 'fillReverse': {
        if (!items) break;
        const s = VP.getFill(items[0]);
        [s.color, s.color2] = [s.color2, s.color];
        VP.setFill(items, s);
        VP.commit();
        break;
      }
      case 'strokeOn': {
        if (!items) {
          d.stroke = d.stroke ? null : '#1d1d1b';
          VP.emit('defaults');
          break;
        }
        const s = VP.getStroke(items[0]);
        VP.setStroke(items, s.on ? { on: false } : { on: true, color: s.color || '#1d1d1b', width: s.width || d.strokeWidth });
        VP.commit();
        break;
      }
      case 'cap':
        if (items) {
          VP.setStroke(items, { cap: arg });
          VP.commit();
        } else d.cap = arg;
        break;
      case 'join':
        if (items) {
          VP.setStroke(items, { join: arg });
          VP.commit();
        } else d.join = arg;
        break;
      case 'shadowOn': {
        if (!items) break;
        const sh = VP.getShadow(items[0]);
        sh.on = !sh.on;
        if (sh.on && !items[0].data.shadow) Object.assign(sh, { color: '#000000', alpha: 0.35, blur: VP.toPT(2.5), dx: VP.toPT(1.5), dy: VP.toPT(1.5) });
        VP.setShadow(items, sh);
        VP.commit();
        break;
      }
      case 'alignTo':
        VP.settings.alignTo = arg;
        VP.io.savePrefs();
        break;
      case 'align':
        VP.align(arg);
        break;
      case 'dist':
        if (arg === 'h' || arg === 'v') VP.distribute(arg, 'center');
        else VP.distribute(arg[0], 'space');
        break;
      case 'tRotApply':
        VP.rotateSel(VP.parseNum($('[data-dk="tRot"]').value) || 0);
        break;
      case 'tScaleApply': {
        const s = (VP.parseNum($('[data-dk="tScale"]').value) || 100) / 100;
        if (VP.sel.length && s > 0) {
          VP.T.scale(VP.sel, s, s, VP.selBounds().center);
          VP.commit();
        }
        break;
      }
      case 'tSkewApply': {
        const kx = VP.parseNum($('[data-dk="tSkx"]').value) || 0;
        const ky = VP.parseNum($('[data-dk="tSky"]').value) || 0;
        if (VP.sel.length && (kx || ky)) {
          VP.T.skew(VP.sel, VP.clamp(kx, -80, 80), VP.clamp(ky, -80, 80), VP.selBounds().center);
          VP.commit();
        }
        break;
      }
      case 'srApply':
        if (!VP.sel.length) return UI.toast('Önce bir nesne seçin');
        VP.stepRepeat(Math.round(VP.parseNum($('[data-dk="srN"]').value) || 1), VP.parseNum($('[data-dk="srX"]').value) || 0, VP.parseNum($('[data-dk="srY"]').value) || 0);
        break;
      case 'addLayer':
        VP.addLayer();
        break;
      case 'layerVis':
        L.visible = !L.visible;
        VP.pruneSel();
        VP.sel = VP.sel.filter((it) => it.layer.visible);
        VP.commit();
        break;
      case 'layerLock':
        L.locked = !L.locked;
        VP.sel = VP.sel.filter((it) => !it.layer.locked);
        VP.commit();
        break;
      case 'layerActivate':
        VP.setActiveLayer(L);
        UI.toast('Etkin katman: ' + L.name);
        break;
      case 'layerMenu': {
        const html = '<button class="pop-item" data-pick="rename">Yeniden adlandır</button><button class="pop-item" data-pick="up">Yukarı taşı</button><button class="pop-item" data-pick="down">Aşağı taşı</button><button class="pop-item" data-pick="selall">Katmandaki tümünü seç</button><div class="pop-sep"></div><button class="pop-item" data-pick="del" style="color:var(--danger)">Katmanı sil</button>';
        UI.popover(el, html, async (pick) => {
          if (pick === 'rename') {
            const n = await UI.prompt({ title: 'Katmanı yeniden adlandır', label: 'Ad', value: L.name });
            if (n && n.trim()) {
              L.name = n.trim();
              VP.commit();
            }
          } else if (pick === 'up') VP.moveLayer(L, 1);
          else if (pick === 'down') VP.moveLayer(L, -1);
          else if (pick === 'selall') {
            VP.setTool('select');
            VP.setSelection(L.children.filter((c) => c.visible && !c.locked));
          } else if (pick === 'del') {
            if (!L.children.length || (await UI.confirm({ title: '“' + L.name + '” silinsin mi?', text: 'Katmandaki ' + L.children.length + ' nesne de silinir.', ok: 'Sil', danger: true }))) VP.deleteLayer(L);
          }
        });
        return;
      }
      case 'objSel':
        if (!obj) break;
        if (!obj.visible || obj.locked || !L.visible || L.locked) return UI.toast('Gizli veya kilitli nesne seçilemez');
        VP.setActiveLayer(L);
        if (VP.toolId !== 'select' && VP.toolId !== 'node') VP.setTool('select');
        if (VP.settings.multi) VP.toggleSel(obj);
        else VP.setSelection([obj]);
        break;
      case 'objVis':
        obj.visible = !obj.visible;
        VP.sel = VP.sel.filter((it) => it !== obj || obj.visible);
        VP.commit();
        break;
      case 'objLock':
        obj.locked = !obj.locked;
        VP.sel = VP.sel.filter((it) => it !== obj || !obj.locked);
        VP.commit();
        break;
      case 'gotoPage':
        VP.gotoPage(pi);
        break;
      case 'pageUp':
        VP.movePage(pi, -1);
        break;
      case 'pageDown':
        VP.movePage(pi, 1);
        break;
      case 'addPage':
        VP.addPage();
        break;
      case 'dupPage':
        VP.duplicatePage();
        break;
      case 'delPage':
        if (VP.doc.pages.length <= 1) return UI.toast('Belgede en az bir sayfa kalmalı');
        if (await UI.confirm({ title: '“' + VP.page().name + '” silinsin mi?', text: 'Bu sayfadaki tüm nesneler silinir.', ok: 'Sayfayı sil', danger: true })) VP.deletePage();
        break;
      case 'renamePage': {
        const n = await UI.prompt({ title: 'Sayfayı yeniden adlandır', label: 'Ad', value: VP.page().name });
        if (n && n.trim()) {
          VP.page().name = n.trim();
          VP.commit();
          VP.emit('page');
        }
        break;
      }
      default:
        if (key === 'orient' || key === 'just' || /^(fx|tx|ms|fl|sh|ff|cv|d2|dv|ob|e2|ol|bx|tq|tk|zs|zy|zd|sc[A-Z])/.test(key) || A[key]) return UI.act(id, el);
    }
    VP.io.savePrefs();
    UI.schedule('dock', 'prop', 'status', 'palette');
  };
  const bindDock = () => {
    // A docker tab opens that docker; tapping the open one again folds the docker away.
    $('#dock-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      if (!$('#dock').hidden && UI.dockTab === b.dataset.tab) return UI.toggleDock();
      UI.openDock(b.dataset.tab);
    });
    $('#dock-title').addEventListener('click', (e) => {
      UI.popover(e.currentTarget, UI.DOCKERS.map(([k, l]) => '<button class="pop-item' + (k === UI.dockTab ? ' on' : '') + '" data-pick="' + k + '">' + esc(l) + '</button>').join(''), (k) => UI.openDock(k));
    });
    $('#btn-dock-close').addEventListener('click', () => UI.toggleDock());
    const body = $('#dock-body');
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.tagName === 'SPAN' && b.dataset.act === 'objSel') e.stopPropagation();
      UI.dockAct(b.dataset.act, b);
    });
    body.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.act === 'gotoPage') {
        e.preventDefault();
        UI.dockAct('gotoPage', e.target);
      }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
    });
    body.addEventListener('focusin', (e) => {
      if (/INPUT|SELECT/.test(e.target.tagName)) UI._dockTyping = true;
    });
    body.addEventListener('focusout', () => {
      UI._dockTyping = false;
    });
    body.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.pf && t.dataset.live) return UI.propField(t.dataset.pf, t.value, t);
      if (!t.dataset.dk) return;
      if (t.type === 'color' || t.type === 'range') UI.dockField(t.dataset.dk, t.value, t, true);
    });
    body.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.pf) {
        UI._dockTyping = false;
        UI._rangeDone = true;
        UI.propField(t.dataset.pf, t.value, t);
        UI._rangeDone = false;
        return;
      }
      if (!t.dataset.dk) return;
      if (t.type === 'color' || t.type === 'range') {
        UI._dockTyping = false;
        clearTimeout(UI._sc);
        VP.commit();
        return;
      }
      UI.dockField(t.dataset.dk, t.value, t, false);
    });
  };

  /* ================= status bar ================= */
  UI.renderStatus = () => {
    const pages = VP.doc.pages;
    const n = pages.length;
    const a = VP.doc.active;
    const pn = (k, icon, label, dis) => '<button class="pn-btn" data-page="' + k + '" title="' + label + '" aria-label="' + label + '"' + (dis ? ' disabled' : '') + '>' + ic(icon, 'sm') + '</button>';
    // page navigator at the bottom-left of the drawing window
    $('#page-tabs').innerHTML = pn('first', 'chevFirst', 'İlk sayfa', a === 0) + pn('prev', 'chevLeft', 'Önceki sayfa', a === 0) +
      '<span class="pn-count">' + (a + 1) + ' / ' + n + '</span>' +
      pn('next', 'chevRight', 'Sonraki sayfa', a === n - 1) + pn('last', 'chevLast', 'Son sayfa', a === n - 1) + pn('add', 'plus', 'Sayfa ekle') + '<span class="pn-sep"></span>' +
      pages.map((p, i) => '<button class="page-tab' + (i === a ? ' on' : '') + '" data-page="' + i + '" title="' + esc(p.name) + '">' + esc(p.name) + '</button>').join('');
    let info;
    if (VP.sel.length) {
      const b = VP.selBounds();
      const one = VP.sel.length === 1 ? VP.sel[0] : null;
      info = (one ? VP.describe(one) + ' · ' + (one.layer ? one.layer.name : '') : VP.sel.length + ' nesne seçili') + ' · ' + mm(b.width, 1) + ' × ' + mm(b.height, 1) + ' mm';
    } else {
      info = VP.TOOL_META[VP.toolId].label + ' · ' + VP.page().name + ' · Etkin katman: ' + (VP.activeLayer ? VP.activeLayer.name : '—');
    }
    $('#st-info').textContent = info;
    const c = curColors();
    const sw = VP.sel.length ? VP.getStroke(VP.sel[0]) : { on: !!VP.defaults.stroke, width: VP.defaults.strokeWidth };
    // fill and outline indicators, as in a desktop suite's status bar
    $('#st-chips').innerHTML = '<button class="st-chip" data-st="fill" title="Dolgu · Özellikler panelini aç"><i class="' + (c.fill ? '' : 'swatch none') + '" style="' + chipCss(c.fill) + '"></i>Dolgu <small>' + (c.fill ? esc(c.fill) : 'Yok') + '</small></button>' +
      '<button class="st-chip" data-st="stroke" title="Anahat · Özellikler panelini aç"><i style="background:transparent;border:3px solid ' + (c.stroke || 'var(--line)') + '"></i>Anahat <small>' + (sw.on && c.stroke ? esc(c.stroke) + ' · ' + mm(sw.width, 2) + ' mm' : 'Yok') + '</small></button>';
  };
  UI.setPos = (pt) => {
    $('#st-pos').textContent = 'x ' + mm(pt.x, 1) + '  y ' + mm(pt.y, 1) + ' mm';
  };

  /* ================= rulers ================= */
  UI.drawRulers = () => {
    const stage = $('#stage');
    stage.classList.toggle('no-rulers', !VP.settings.rulers);
    if (!VP.settings.rulers) return;
    const v = paper.view;
    if (!v) return;
    const z = v.zoom;
    const vb = v.bounds;
    const pxmm = z * VP.MM;
    const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
    const minor = steps.find((s) => s * pxmm >= 6) || 2000;
    const major = steps.find((s) => s >= minor * 5 && s * pxmm >= 48) || minor * 10;
    const cs = getComputedStyle(document.documentElement);
    const fg = cs.getPropertyValue('--muted').trim() || '#666';
    const dpr = window.devicePixelRatio || 1;
    const prep = (cv) => {
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
      return { ctx, w, h };
    };
    const lab = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
    {
      const { ctx, w, h } = prep($('#ruler-top'));
      const a = Math.floor(VP.toMM(vb.left) / minor) * minor;
      const b = VP.toMM(vb.right);
      ctx.beginPath();
      for (let m = a; m <= b; m += minor) {
        const x = Math.round((VP.toPT(m) - vb.left) * z) + 0.5;
        const isMaj = Math.abs(m / major - Math.round(m / major)) < 1e-6;
        const isHalf = Math.abs((m * 2) / major - Math.round((m * 2) / major)) < 1e-6;
        const len = isMaj ? h * 0.62 : isHalf ? h * 0.38 : h * 0.22;
        ctx.moveTo(x, h);
        ctx.lineTo(x, h - len);
        if (isMaj) ctx.fillText(lab(m), x + 3, 10);
      }
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    {
      const { ctx, w, h } = prep($('#ruler-left'));
      const a = Math.floor(VP.toMM(vb.top) / minor) * minor;
      const b = VP.toMM(vb.bottom);
      ctx.beginPath();
      for (let m = a; m <= b; m += minor) {
        const y = Math.round((VP.toPT(m) - vb.top) * z) + 0.5;
        const isMaj = Math.abs(m / major - Math.round(m / major)) < 1e-6;
        const isHalf = Math.abs((m * 2) / major - Math.round((m * 2) / major)) < 1e-6;
        const len = isMaj ? w * 0.62 : isHalf ? w * 0.38 : w * 0.22;
        ctx.moveTo(w, y);
        ctx.lineTo(w - len, y);
        if (isMaj) {
          ctx.save();
          ctx.translate(10, y + 3);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(lab(m), 0, 0);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };

  /* ================= text editor ================= */
  UI.editText = (t, isNew) => {
    if (UI.textItem && UI.textItem !== t) UI.commitText();
    const ta = $('#text-editor');
    UI.textItem = t;
    UI.textIsNew = !!isNew;
    UI.textOrig = t.content;
    ta.value = t.content;
    t.visible = false;
    ta.hidden = false;
    UI.syncTextEditor();
    VP.drawOverlay();
    UI.schedule('prop');
    setTimeout(() => {
      ta.focus();
      if (!isNew) ta.select();
    }, 20);
  };
  UI.syncTextEditor = () => {
    const t = UI.textItem;
    if (!t) return;
    const ta = $('#text-editor');
    const v = paper.view;
    const sc = Math.abs(t.matrix.scaling.y) || 1;
    const fs = t.fontSize * sc * v.zoom;
    const asc = fs * 0.92;
    const p = v.projectToView(t.point);
    ta.style.fontFamily = '"' + t.fontFamily + '", sans-serif';
    ta.style.fontSize = fs + 'px';
    ta.style.fontWeight = VP.isBold(t) ? '700' : '400';
    ta.style.fontStyle = VP.isItalic(t) ? 'italic' : 'normal';
    ta.style.textAlign = t.justification;
    ta.style.color = VP.hex(t.fillColor) || '#111';
    ta.style.lineHeight = (t.leading / t.fontSize).toFixed(3);
    const lines = ta.value.split('\n');
    ta.rows = Math.max(1, lines.length);
    ta.style.height = 'auto';
    ta.style.width = '10px';
    const w = Math.max(120, ta.scrollWidth + 12);
    ta.style.width = w + 'px';
    ta.style.height = ta.scrollHeight + 4 + 'px';
    let left = p.x - 6;
    if (t.justification === 'center') left = p.x - w / 2;
    if (t.justification === 'right') left = p.x - w + 6;
    ta.style.left = left + 'px';
    ta.style.top = p.y - asc - 4 + 'px';
  };
  UI.commitText = () => {
    const t = UI.textItem;
    if (!t) return;
    const ta = $('#text-editor');
    const val = ta.value.replace(/\s+$/, '');
    UI.textItem = null;
    ta.hidden = true;
    ta.blur();
    t.visible = true;
    if (!val.trim()) {
      t.remove();
      VP.setSelection([]);
      if (!UI.textIsNew) VP.commit();
    } else {
      t.content = val;
      VP.setSelection([t]);
      if (val !== UI.textOrig || UI.textIsNew) VP.commit();
      else VP.drawOverlay();
    }
    UI.schedule('prop', 'dock', 'status');
  };
  UI.cancelText = () => {
    const t = UI.textItem;
    if (!t) return;
    $('#text-editor').value = UI.textOrig;
    if (UI.textIsNew) $('#text-editor').value = '';
    UI.commitText();
  };

  /* ================= dialogs ================= */
  UI.confirmNew = async () => {
    if (await UI.confirm({ title: 'Yeni belge açılsın mı?', text: 'Açık çizim otomatik kayıttan silinir. Saklamak istiyorsanız önce Dosya › Kaydet kullanın.', ok: 'Yeni belge' })) {
      VP.io.loadDoc(VP.newDoc());
      UI.toast('Yeni A4 belge açıldı');
    }
  };
  UI.exportDialog = () => {
    const st = { fmt: UI._expFmt || 'pdf', dpi: 150, bg: 'white', pages: 'all' };
    const n = VP.doc.pages.length;
    const render = (root) => {
      root.innerHTML =
        '<h2>Dışa aktar</h2>' +
        '<div class="sec"><span class="opt-label">Biçim</span><span class="seg" data-g="fmt">' + [['pdf', 'PDF'], ['svg', 'SVG'], ['png', 'PNG']].map(([v, l]) => '<button data-v="' + v + '" class="' + (st.fmt === v ? 'on' : '') + '">' + l + '</button>').join('') + '</span></div>' +
        (st.fmt === 'png'
          ? '<div class="sec"><span class="opt-label">Çözünürlük</span><span class="seg" data-g="dpi">' + [72, 150, 300].map((v) => '<button data-v="' + v + '" class="' + (st.dpi === v ? 'on' : '') + '">' + v + ' dpi</button>').join('') + '</span></div>' +
            '<div class="sec"><span class="opt-label">Arka plan</span><span class="seg" data-g="bg"><button data-v="white" class="' + (st.bg === 'white' ? 'on' : '') + '">Beyaz</button><button data-v="clear" class="' + (st.bg === 'clear' ? 'on' : '') + '">Şeffaf</button></span></div>'
          : '') +
        (st.fmt === 'pdf'
          ? '<div class="sec"><span class="opt-label">Sayfalar</span><span class="seg" data-g="pages"><button data-v="all" class="' + (st.pages === 'all' ? 'on' : '') + '">Tüm sayfalar (' + n + ')</button><button data-v="one" class="' + (st.pages === 'one' ? 'on' : '') + '">Yalnızca bu sayfa</button></span></div>' +
            '<p>Metinler Fira Sans yazı tipiyle gömülür. Gölgeler ve karışım modları PDF’e aktarılmaz.</p>'
          : '') +
        (st.fmt === 'svg' ? '<p>Etkin sayfa, milimetre ölçüleriyle SVG olarak kaydedilir. Gölgeler SVG filtresi olur.</p>' : '') +
        (st.fmt === 'png' ? '<p>Etkin sayfa resim olarak kaydedilir.</p>' : '') +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="go">' + ic('export', 'sm') + 'Dışa aktar</button></div>';
    };
    UI.modal('', (root, close) => {
      render(root);
      root.addEventListener('click', async (e) => {
        const sb = e.target.closest('[data-v]');
        if (sb) {
          const g = sb.parentElement.dataset.g;
          st[g] = g === 'dpi' ? +sb.dataset.v : sb.dataset.v;
          UI._expFmt = st.fmt;
          render(root);
          return;
        }
        const x = e.target.closest('[data-x]');
        if (!x) return;
        if (x.dataset.x === 'no') return close();
        x.disabled = true;
        x.textContent = 'Hazırlanıyor…';
        try {
          if (st.fmt === 'svg') await VP.io.exportSVG();
          else if (st.fmt === 'png') await VP.io.exportPNG(st.dpi, st.bg === 'clear');
          else await VP.io.exportPDF(st.pages === 'all');
        } catch (err) {
          console.error(err);
          UI.toast('Dışa aktarma başarısız oldu');
        }
        close();
      });
    });
  };
  UI.help = () => {
    const rows = [
      ['Çalışma alanı', 'Üstte menü, standart çubuk ve özellik çubuğu · Solda araç kutusu · Sağda paneller, panel sekmeleri ve renk paleti · Altta sayfa gezgini, belge paleti ve durum çubuğu'],
      ['Panel sekmeleri', 'Sağ kenardaki dikey sekmeler paneli açar · Açık sekmeye tekrar dokunun: kapanır'],
      ['Kılavuz çizgi', 'Cetvelden sayfaya sürükleyin · Taşımak için Seçim aracıyla sürükleyin · Cetvele geri sürükleyin: silinir'],
      ['Ölçü araçları', 'İki noktayı sürükleyerek ölçün · Nesne köşelerine yapışır ve nesne taşınınca güncellenir'],
      ['Bağlantı araçları', 'Bir nesneden diğerine sürükleyin · Nesneler taşınınca çizgi takip eder'],
      ['Etkileşimli dolgu (G)', 'Nesne üzerinde sürükleyin: geçişli dolgu · Uç karesine dokunup paletten renk seçin'],
      ['Ağ dolgu (M)', 'Kapalı şekle dokunun · Düğüme dokunun, renk seçin · Düğümü sürükleyin'],
      ['Şeffaflık', 'Nesne üzerinde sürükleyin: opaktan saydama · Düz/doğrusal/dairesel özellik çubuğunda'],
      ['Akıllı dolgu', 'Örtüşen şekillerin oluşturduğu alana dokunun: o alan yeni şekil olur'],
      ['Kırpma / Bıçak / Silgi (X)', 'Alan çizip içine dokunun: kırp · Şeklin içinden çizgi çekin: böl · Üzerinden geçin: sil'],
      ['Biteşlem izleme', 'Resmi seçin › Biteşlemi izle · Logo, klipart, fotoğraf, çizim ve merkez çizgi ön ayarları'],
      ['Özel dolgular', 'Özellikler › Dolgu: Konik, Kare, Desen, Doku · Konik/kare merkezini etkileşimli dolgu aracıyla sürükleyin'],
      ['Şekillendirme fırçaları', 'Şekil aracına uzun basın: yumuşatma, bulaştırma, girdap, çekme, itme, pürüz · Boyut ve güç özellik çubuğunda'],
      ['Eğri araçları', 'Serbest çizime uzun basın: B-spline, çoklu çizgi, 3 noktalı eğri · Çift dokun veya Enter: bitir'],
      ['Baskı ayrımları', 'Dosya › Baskı ayrımları: C, M, Y, K plakaları, kesim ve kayıt işaretli PDF'],
      ['Bir parmak', 'Seçili araçla çizim veya seçim'],
      ['İki parmak', 'Kaydır ve sıkıştırarak yakınlaştır'],
      ['Çift dokunma', 'Eğride: düğüm düzenleme · Metinde: yazıyı düzenle'],
      ['Seçiliye dokunma', 'Döndürme ve eğme tutamaçlarına geçer'],
      ['Palet: dokun / uzun bas', 'Dolgu (veya anahat) / diğerini boyar'],
      ['Araç: uzun bas', 'Aynı gruptaki diğer araçları açar'],
      ['Harmanlama aracı', 'İki nesneye sırayla dokunun · Adım ve hızlanma özellik çubuğunda'],
      ['Kontur aracı', 'Kapalı şekle dokunun · Dış/iç, adım, aralık ve bitiş rengi'],
      ['Zarf / Perspektif', 'Nesneye dokunun, düğümleri sürükleyin · Hazır biçimler için “Hazır ▾”'],
      ['Derinlik aracı', 'Şekle dokunun · × işaretli kaçış noktasını sürükleyin'],
      ['Mercek aracı', 'Kapalı şekle dokunun · Altındaki nesneler mercek türüne göre görünür'],
      ['PowerClip', 'İçeriğe, sonra kaba dokunun · Üzerinde sürükleyin: içerik kayar'],
      ['Efekte çift dokunma', 'O efektin aracına geçer · Nesne › Efekti ayır / kaldır'],
      ['Metin aracı: sürükle', 'Paragraf çerçevesi · Sütun, iki yana yaslama ve satır aralığı özellik çubuğunda'],
      ['Paragraf kenarları', 'Kenar tutamacı çerçeveyi boyutlandırır, metin yeniden akar · Oranlı köşe yazıyı da büyütür'],
      ['Yola metin', 'Metin ve eğriyi seçip “Yola yerleştir” · Ya da aracı seçip eğriye dokunun'],
      ['Tablo aracı', 'Sürükle: tablo · Hücreye dokun: seç, tekrar dokun: yaz · Tab: sonraki hücre · Çizgiyi sürükle: boyut'],
      ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele'],
      ['Ctrl+C, X, V, D', 'Kopyala, kes, yapıştır, çoğalt'],
      ['Ctrl+G / Ctrl+U', 'Grupla / grubu çöz'],
      ['Ctrl+L / Ctrl+K', 'Birleştir / parçala'],
      ['Ctrl+Q', 'Eğriye dönüştür'],
      ['Ok tuşları', '1 mm kaydır (Shift: 10 mm)'],
      ['PgUp / PgDn', 'Bir öne / bir arkaya'],
      ['F4', 'Sayfaya sığdır'],
      ['V A F I P L R E Y S T D H Z', 'Araçlar: seçim, şekil, serbest, fırça, kalem, çizgi, dörtgen, elips, çokgen, yıldız, metin, damlalık, kaydırma, yakınlaştırma'],
      ['Boşluk + sürükle', 'Geçici kaydırma']
    ];
    UI.modal(
      '<h2>VektörPad kullanımı</h2><p>iPad’de Safari ile açıp Paylaş › Ana Ekrana Ekle ile uygulama gibi kullanabilirsiniz. Çalışmanız bu tarayıcıda otomatik saklanır; kalıcı kopya için Dosya › Kaydet kullanın.</p>' +
        '<dl class="help-grid">' + rows.map(([a, b]) => '<dt>' + esc(a) + '</dt><dd>' + esc(b) + '</dd>').join('') + '</dl>' +
        '<p>Yazı tipi lisansı: Fira Sans, SIL Open Font License 1.1.</p><div class="actions"><button class="btn primary" data-x="ok">Tamam</button></div>',
      (root, close) => root.addEventListener('click', (e) => e.target.closest('[data-x]') && close())
    );
  };

  // Building blocks shared with vp-text.js
  UI.h = { esc, ic, mm, sep, field, btn, ibtn, tog, range, colorField, dfieldPf, menuHTML };

  /* ================= init ================= */
  UI.init = () => {
    document.querySelectorAll('[data-icon]').forEach((b) => (b.innerHTML = ic(b.dataset.icon)));
    $('#btn-undo').addEventListener('click', () => VP.undo());
    $('#btn-redo').addEventListener('click', () => VP.redo());
    $('#btn-zoom-in').addEventListener('click', () => VP.zoomAt(1.25));
    $('#btn-zoom-out').addEventListener('click', () => VP.zoomAt(0.8));
    $('#btn-fit').addEventListener('click', () => VP.fitPage());
    $('#btn-help').addEventListener('click', () => UI.help());
    $('#btn-dock').addEventListener('click', () => UI.toggleDock());
    $('#zoom-label').addEventListener('click', (e) => {
      const html = [25, 50, 100, 200, 400, 800].map((z) => '<button class="pop-item" data-pick="' + z + '">' + z + '%</button>').join('') + '<div class="pop-sep"></div>' + menuHTML(['fit', 'zoomSel', 'zoom100']);
      UI.popover(e.currentTarget, html, (p) => (A[p] ? UI.run(p) : VP.setZoom(+p / 100)));
    });
    document.querySelectorAll('.menu-btn').forEach((b) =>
      b.addEventListener('click', () => UI.popover(b, menuHTML(MENUS[b.dataset.menu]), (id) => UI.run(id)))
    );
    $('#btn-menu-all').addEventListener('click', (e) => {
      const html = Object.keys(MENUS).map((k) => '<div class="pop-head">' + MENU_NAMES[k] + '</div>' + menuHTML(MENUS[k].filter((x) => !x.startsWith('h:')))).join('<div class="pop-sep"></div>');
      UI.popover(e.currentTarget, html, (id) => UI.run(id));
    });
    const dn = $('#doc-name');
    dn.addEventListener('change', () => {
      VP.doc.name = dn.value.trim() || 'Adsız çizim';
      VP.dirty();
    });
    dn.addEventListener('keydown', (e) => e.key === 'Enter' && dn.blur());
    $('#page-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]');
      if (!b) return;
      const v = b.dataset.page;
      if (v === 'add') VP.addPage();
      else if (v === 'prev') VP.gotoPage(VP.doc.active - 1);
      else if (v === 'next') VP.gotoPage(VP.doc.active + 1);
      else if (v === 'first') VP.gotoPage(0);
      else if (v === 'last') VP.gotoPage(VP.doc.pages.length - 1);
      else VP.gotoPage(+v);
    });
    // standard toolbar and document tab buttons run actions by id
    document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => UI.run(b.dataset.cmd)));
    $('#btn-snap').addEventListener('click', (e) => UI.popover(e.currentTarget, menuHTML(['snap', 'snapGuides', 'snapObjects', 'alignGuides']), (id) => UI.run(id)));
    $('#st-chips').addEventListener('click', (e) => {
      if (e.target.closest('[data-st]')) UI.openDock('props');
    });
    bindPalette($('#docpal'));
    $('#file-open').addEventListener('change', (e) => {
      VP.io.handleOpen(e.target.files[0]);
      e.target.value = '';
    });
    $('#file-import').addEventListener('change', (e) => {
      VP.io.handleImport(e.target.files[0]);
      e.target.value = '';
    });
    const ta = $('#text-editor');
    ta.addEventListener('input', () => {
      if (UI.textItem) {
        UI.textItem.content = ta.value;
        UI.syncTextEditor();
      }
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        UI.cancelText();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        UI.commitText();
      }
      e.stopPropagation();
    });
    bindToolbox();
    bindPalette();
    bindPropbar();
    bindDock();
    VP.on('selection', () => UI.schedule('prop', 'dock', 'status', 'palette'));
    VP.on('change', () => UI.schedule('prop', 'dock', 'status', 'palette', 'top'));
    VP.on('transform', () => UI.schedule('prop', 'status'));
    VP.on('tool', () => UI.schedule('prop', 'tools', 'status'));
    VP.on('page', () => UI.schedule('prop', 'dock', 'status', 'rulers', 'top'));
    VP.on('layers', () => UI.schedule('dock', 'status'));
    VP.on('defaults', () => UI.schedule('prop', 'dock', 'palette', 'status'));
    VP.on('view', () => {
      UI.schedule('rulers', 'top');
      if (UI.textItem) UI.syncTextEditor();
    });
    VP.on('doc', () => UI.schedule('prop', 'dock', 'status', 'palette', 'top', 'tools'));
    UI.schedule('tools', 'prop', 'dock', 'status', 'palette', 'top', 'rulers');
  };
})();
