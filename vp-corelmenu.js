/* File and Layout menus laid out like CorelDRAW 2026 (Turkish): same order, names and submenus.
   Features that the desktop app keeps elsewhere stay reachable from the closest Corel submenu. */
(() => {
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const IO = VP.io;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const relabel = (id, label, extra) => {
    if (A[id]) Object.assign(A[id], { label }, extra || {});
  };

  /* ---------- labels as in the Turkish CorelDRAW menus ---------- */
  relabel('new', 'Yeni…', { kbd: 'Ctrl+N' });
  relabel('newFromTemplate', 'Şablondan Yeni Oluştur…');
  relabel('open', 'Aç…', { kbd: 'Ctrl+O' });
  relabel('recentDocs', 'Son Kullanılanı Aç ▸');
  relabel('docClose', 'Kapat');
  relabel('docCloseAll', 'Tümünü Kapat');
  relabel('save', 'Kaydet…', { kbd: 'Ctrl+S' });
  relabel('saveAs', 'Farklı Kaydet…', { kbd: 'Ctrl+Shift+S' });
  relabel('saveTemplate', 'Şablon olarak kaydet…');
  relabel('revertDoc', 'Geri Al');
  relabel('import', 'Dosya Al…', { kbd: 'Ctrl+I' });
  relabel('export', 'Dosya Ver…', { kbd: 'Ctrl+E' });
  relabel('exportPdf', 'PDF’ye Yayınla');
  relabel('print', 'Yazdır…', { kbd: 'Ctrl+P' });
  relabel('printPreview', 'Yazdırma Önizlemesi…');
  relabel('docProps', 'Belge Özellikleri…');
  relabel('saveCorel', 'CorelDRAW sürümü için…');
  relabel('exportJpg', 'JPG…');
  relabel('exportEps', 'EPS…');
  relabel('exportDxf', 'DXF (CAD)…');
  relabel('printMerge', 'Birleştirerek Yazdırma oluştur/yükle…');
  relabel('addPage', 'Sayfa Ekle…');
  relabel('dupPage', 'Sayfayı Çoğalt…');
  relabel('renamePage', 'Sayfa İsmini Değiştir…');
  relabel('delPage', 'Sayfayı Sil…');
  relabel('gotoPage', 'Sayfaya Git…');
  relabel('pageNumSettings', 'Sayfa Numarası Ayarları…');
  relabel('orientToggle', 'Sayfa Yönünü Değiştir');
  relabel('pageSetup', 'Sayfa Boyutu…');
  relabel('pageBg', 'Sayfa Zemini…');
  relabel('insertPageNum', 'Aktif Katmana');

  // "Aç" opens .cdr too: iPad's picker greys out unknown types, so accept every file here
  if (A.open && A.openCdr) A.open.run = A.openCdr.run;

  /* ---------- export presets ---------- */
  const exportWith = (o) => {
    VP.settings.lastExport = Object.assign({}, VP.settings.lastExport || {}, o);
    UI.run('export');
  };

  /* ---------- send (share sheet) ---------- */
  const shareDoc = async () => {
    const name = IO.safeName() + '.vektorpad.json';
    const data = IO.serialize();
    const file = typeof File !== 'undefined' ? new File([data], name, { type: 'application/json' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: VP.doc.name || name });
      } catch (e) {
        if (e && e.name !== 'AbortError') VP.toast('Paylaşılamadı');
      }
      return;
    }
    VP.toast('Bu cihazda paylaşım yok · Belge dosya olarak kaydediliyor');
    IO.saveFile(name, data);
  };

  /* ---------- camera capture (Görüntü Yakala) ---------- */
  const capture = () => {
    const f = document.createElement('input');
    f.type = 'file';
    f.accept = 'image/*';
    f.setAttribute('capture', 'environment');
    f.addEventListener('change', () => {
      if (f.files && f.files[0]) IO.handleImport(f.files[0]);
    });
    f.click();
  };

  /* ---------- quit ---------- */
  const quit = async () => {
    if (!(await UI.confirm({ title: 'Çıkılsın mı?', text: 'Açık belgelerin tümü kapatılır. Kaydedilmemiş değişiklikler için önce Kaydet’i kullanın.', ok: 'Çık' }))) return;
    if (A.docCloseAll) UI.run('docCloseAll');
    if (A.welcomeScreen) UI.run('welcomeScreen');
  };

  /* ---------- page numbers on all / odd / even pages ---------- */
  const PARITY = { all: 'Tüm sayfalar', odd: 'Tek sayfalar', even: 'Çift sayfalar' };
  // master layers are placed after the page fields are refreshed, so refresh them here too
  const showParity = (root, index) => {
    root.getItems({ match: (it) => it.data && it.data.pageField }).forEach((t) => {
      t.content = VP.pageLabel ? VP.pageLabel(index) : String(index + 1);
      const p = t.data.pageParity;
      if (p) t.visible = p === 'all' || (p === 'odd' ? index % 2 === 0 : index % 2 === 1);
    });
  };
  const pageNumAll = (parity) => {
    const p = VP.page();
    const keep = VP.activeLayer;
    VP.addLayer();
    const L = VP.activeLayer;
    L.name = 'Sayfa numarası (' + PARITY[parity].toLowerCase() + ')';
    const t = VP.createText(new paper.Point(p.w / 2, p.h - VP.toPT(8)), VP.pageLabel ? VP.pageLabel(VP.doc.active) : String(VP.doc.active + 1));
    t.justification = 'center';
    t.fontSize = 10;
    t.fillColor = '#1d1d1b';
    t.data.pageField = true;
    t.data.pageParity = parity;
    t.data.label = 'Sayfa numarası';
    showParity(L, VP.doc.active);
    VP.setSelection([t]);
    if (VP.docx && VP.docx.toggleMaster) VP.docx.toggleMaster(L);
    if (keep && keep !== L && keep.parent) VP.setActiveLayer(keep);
    VP.commit();
    VP.toast('Sayfa numarası eklendi · ' + PARITY[parity]);
  };
  const lp0 = VP.loadPage;
  if (lp0) {
    VP.loadPage = function (i, opts) {
      const r = lp0.apply(this, arguments);
      try {
        showParity(paper.project, VP.doc.active);
      } catch (e) {
        /* page not ready */
      }
      return r;
    };
  }
  IO.exportHooks = IO.exportHooks || [];
  IO.exportHooks.push((proj, index) => showParity(proj, index));

  /* ---------- Sayfa Düzeni ---------- */
  const pageLayout = () => {
    const S = VP.settings;
    UI.modal(
      '<h2>Sayfa Düzeni</h2>' +
        '<div class="sec"><span class="opt-label">Düzen</span><select id="pl-kind" style="height:32px"><option value="full">Tam Sayfa</option><option value="booklet">Kitapçık</option></select></div>' +
        '<div class="sec"><label class="field"><input type="checkbox" id="pl-facing"' + (S.facing ? ' checked' : '') + '><span style="text-transform:none">Karşılıklı sayfalar</span></label></div>' +
        '<p class="sec-note">Kitapçık düzeni, yazdırırken sayfaları kitapçık sırasına dizer (Yazdır › Yerleşim).</p>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Tamam</button></div>',
      (root, close) => {
        const last = S.lastExport || {};
        root.querySelector('#pl-kind').value = last.nup === 'booklet' ? 'booklet' : 'full';
        root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-x]');
          if (!b) return;
          if (b.dataset.x === 'yes') {
            const facing = root.querySelector('#pl-facing').checked;
            if (!!S.facing !== facing && A.facingPages) UI.run('facingPages');
            const kind = root.querySelector('#pl-kind').value;
            S.lastExport = Object.assign({}, S.lastExport || {}, { nup: kind === 'booklet' ? 'booklet' : '1' });
            IO.savePrefs();
          }
          close();
        });
      }
    );
  };

  /* ---------- Belge Seçenekleri ---------- */
  const docOptions = () => {
    const rows = [
      ['pageSetup', 'Sayfa Boyutu'],
      ['k_pageLayout', 'Sayfa Düzeni'],
      ['pageBg', 'Sayfa Zemini'],
      ['drawScale', 'Çizim ölçeği'],
      ['docProps', 'Belge Özellikleri']
    ].filter(([id]) => A[id]);
    UI.modal(
      '<h2>Belge Seçenekleri</h2><div style="display:flex;flex-direction:column;gap:6px">' +
        rows.map(([id, l]) => '<button class="btn" style="justify-content:flex-start" data-id="' + id + '">' + esc(l) + '…</button>').join('') +
        '</div><div class="actions"><button class="btn primary" data-x="no">Kapat</button></div>',
      (root, close) => {
        root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-id],[data-x]');
          if (!b) return;
          close();
          if (b.dataset.id) UI.run(b.dataset.id);
        });
      }
    );
  };

  /* ---------- Çerçeve ve Gromet (banner frame and eyelet marks) ---------- */
  const grommets = () => {
    const S = VP.settings;
    const o = Object.assign({ dia: 10, inset: 20, gap: 500, frame: true, frameW: 0.5 }, S.grommet || {});
    UI.modal(
      '<h2>Çerçeve ve Gromet</h2>' +
        '<div class="row"><label class="field"><span>Gromet çapı</span><input id="gr-dia" value="' + o.dia + '" inputmode="decimal" style="width:60px"><span class="unit">mm</span></label>' +
        '<label class="field"><span>Kenardan uzaklık</span><input id="gr-inset" value="' + o.inset + '" inputmode="decimal" style="width:60px"><span class="unit">mm</span></label></div>' +
        '<div class="row"><label class="field"><span>En fazla aralık</span><input id="gr-gap" value="' + o.gap + '" inputmode="decimal" style="width:60px"><span class="unit">mm</span></label></div>' +
        '<div class="row"><label class="field"><input type="checkbox" id="gr-frame"' + (o.frame ? ' checked' : '') + '><span style="text-transform:none">Sayfa kenarına çerçeve</span></label>' +
        '<label class="field"><span>Kalınlık</span><input id="gr-fw" value="' + o.frameW + '" inputmode="decimal" style="width:48px"><span class="unit">mm</span></label></div>' +
        '<p class="sec-note">Gromet işaretleri köşelere ve aralarına eşit aralıkla, ayrı bir katmana yerleştirilir.</p>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Ekle</button></div>',
      (root, close) => {
        root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-x]');
          if (!b) return;
          if (b.dataset.x === 'yes') {
            const num = (id, d) => {
              const v = VP.parseNum(root.querySelector(id).value);
              return v > 0 ? v : d;
            };
            o.dia = num('#gr-dia', 10);
            o.inset = num('#gr-inset', 20);
            o.gap = num('#gr-gap', 500);
            o.frameW = num('#gr-fw', 0.5);
            o.frame = root.querySelector('#gr-frame').checked;
            S.grommet = Object.assign({}, o);
            IO.savePrefs();
            addGrommets(o);
          }
          close();
        });
      }
    );
  };
  const addGrommets = (o) => {
    const p = VP.page();
    const T = VP.toPT;
    const keep = VP.activeLayer;
    VP.addLayer();
    const L = VP.activeLayer;
    L.name = 'Çerçeve ve Gromet';
    const items = [];
    if (o.frame) {
      const w = T(o.frameW);
      const r = new paper.Path.Rectangle(new paper.Rectangle(w / 2, w / 2, p.w - w, p.h - w));
      r.strokeColor = '#1d1d1b';
      r.strokeWidth = w;
      r.fillColor = null;
      r.name = 'Çerçeve';
      items.push(r);
    }
    const ins = T(o.inset);
    const x0 = ins, y0 = ins, x1 = p.w - ins, y1 = p.h - ins;
    const pts = [];
    const along = (a, b, fixed, horiz) => {
      const len = b - a;
      const n = Math.max(1, Math.ceil(len / T(o.gap)));
      for (let k = 0; k <= n; k++) {
        const v = a + (len * k) / n;
        pts.push(horiz ? [v, fixed] : [fixed, v]);
      }
    };
    if (x1 > x0 && y1 > y0) {
      along(x0, x1, y0, true);
      along(x0, x1, y1, true);
      along(y0, y1, x0, false);
      along(y0, y1, x1, false);
    }
    const seen = new Set();
    const rad = T(o.dia) / 2;
    pts.forEach(([x, y]) => {
      const key = Math.round(x) + ',' + Math.round(y);
      if (seen.has(key)) return;
      seen.add(key);
      const c = new paper.Path.Circle(new paper.Point(x, y), rad);
      c.strokeColor = '#1d1d1b';
      c.strokeWidth = T(0.25);
      c.fillColor = null;
      items.push(c);
    });
    const g = new paper.Group(items.filter((it) => it.strokeColor));
    g.name = 'Gromet';
    L.addChild(g);
    VP.setSelection([g]);
    if (keep && keep !== L && keep.parent) VP.setActiveLayer(keep);
    VP.commit();
    VP.toast((seen.size) + ' gromet işareti eklendi');
  };

  /* ---------- new actions ---------- */
  Object.assign(A, {
    k_capture: { label: 'Yakala…', icon: 'image', run: capture },
    k_exportOffice: { label: 'Ofis için Ver…', run: () => exportWith({ fmt: 'png', dpi: 300, bg: 'white', area: VP.sel.length ? 'sel' : 'page' }) },
    k_exportWeb: { label: 'Web…', run: () => exportWith({ fmt: 'png', dpi: 72, bg: 'clear', area: VP.sel.length ? 'sel' : 'page' }) },
    k_exAddSel: { label: 'Seçimi Ekle', icon: 'plus', enabled: () => VP.sel.length > 0, run: () => UI.run('exportAddSel') },
    k_exAddPage: {
      label: 'Geçerli Sayfayı Ekle', icon: 'page', run: () => {
        const L = (VP.doc.ext = VP.doc.ext || {}).exportList = (VP.doc.ext.exportList || []);
        const i = VP.doc.active;
        if (!L.some((e) => e.kind === 'page' && e.page === i)) L.push({ id: 'x' + Math.random().toString(36).slice(2, 8), kind: 'page', page: i, name: IO.safeName() + (VP.doc.pages.length > 1 ? '-' + (i + 1) : ''), fmt: 'png', dpi: 150, on: true });
        VP.commit();
        UI.openDock('export');
        UI.renderDock(true);
        VP.toast('Sayfa dışa aktarma listesine eklendi');
      }
    },
    k_exAddAll: {
      label: 'Tüm Sayfaları Ekle', icon: 'pages', run: () => {
        UI.openDock('export');
        if (VP.work && VP.work.addPages) VP.work.addPages();
        VP.toast('Tüm sayfalar dışa aktarma listesine eklendi');
      }
    },
    k_send: { label: 'Posta alıcısı…', icon: 'export', run: shareDoc },
    k_exit: { label: 'Çık', kbd: 'Alt+F4', run: quit },
    k_pnAll: { label: 'Tüm Sayfalara', run: () => pageNumAll('all') },
    k_pnOdd: { label: 'Tüm Tek Sayfalara', run: () => pageNumAll('odd') },
    k_pnEven: { label: 'Tüm Çift Sayfalara', enabled: () => VP.doc.pages.length > 1, run: () => pageNumAll('even') },
    k_docOptions: { label: 'Belge Seçenekleri…', icon: 'gear', run: docOptions },
    k_pageLayout: { label: 'Sayfa Düzeni…', run: pageLayout },
    k_grommet: { label: 'Çerçeve ve Gromet…', run: grommets }
  });

  /* ---------- the menus ---------- */
  const sub = (label, ids) => 'sub:' + label + '|' + ids.filter((id) => A[id]).join(',');
  const build = () => {
    const M = UI.MENUS;
    M.file = [
      'new', 'newFromTemplate', 'open', 'recentDocs', '|',
      'docClose', 'docCloseAll', '|',
      'save', 'saveAs', 'saveTemplate', 'revertDoc', '|',
      sub('Görüntü Yakala', ['k_capture']),
      'import', 'export',
      sub('Şunun İçin Ver', ['k_exportOffice', 'k_exportWeb', 'saveCorel', 'exportJpg', 'exportEps', 'exportDxf']),
      sub('Verme Penceresi', ['k_exAddSel', 'k_exAddPage', 'k_exAddAll']),
      sub('Gönder', ['k_send']),
      'exportPdf', '|',
      sub('Birleştirerek Yazdırma', ['printMerge']), '|',
      'print', 'printPreview', '|',
      'docProps', '|',
      'k_exit'
    ];
    M.layout = [
      'addPage', 'dupPage', 'renamePage', 'delPage', 'gotoPage', '|',
      sub('Sayfa Numarası Ekle', ['insertPageNum', 'k_pnAll', 'k_pnOdd', 'k_pnEven']),
      'pageNumSettings', '|',
      'orientToggle', '|',
      'k_docOptions', 'pageSetup', 'k_pageLayout', 'pageBg', '|',
      'k_grommet'
    ];
  };
  build();
  // later modules may still push into these menus on load; put the Corel layout back afterwards
  addEventListener('load', () => setTimeout(build, 50));

  /* ---------- document tabs as in Corel: sized to their names, "+" for a new document ---------- */
  const K = 'html[data-cd][data-skin="classic"][data-skin]';
  const css = document.createElement('style');
  css.textContent =
    K + ' .doc-tabs { align-items: center; gap: 4px; padding: 3px 4px; }' +
    K + ' .doc-tabs > .doc-tab { max-width: none !important; min-width: 0 !important; height: 22px; border-radius: 3px; padding: 0 2px 0 10px; gap: 6px; flex: none; }' +
    K + ' .doc-tabs > .doc-tab:not(.welcome-tab) > svg { display: none; }' +
    K + ' .doc-tabs .doc-name { width: auto; min-width: 0; padding: 0 2px; border: 0; background: transparent; height: 20px; }' +
    K + ' .doc-tabs .doc-close { width: 20px; height: 20px; font-size: 15px; }' +
    K + ' .doc-tabs .doc-tab-name { max-width: 220px; font-size: 12px; }' +
    '.doc-add { display: none; }' +
    K + ' .doc-add { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 22px; height: 22px; border: 0; border-radius: 3px; background: var(--cd-field); color: #d6d6d6; font-size: 17px; line-height: 1; cursor: pointer; }' +
    K + ' .doc-add:hover { background: #4a4a4a; color: #fff; }' +
    '@media (pointer: coarse) {' + K + ' .doc-tabs > .doc-tab, ' + K + ' .doc-add { height: 34px; } ' + K + ' .doc-add { width: 34px; } ' + K + ' .doc-tabs .doc-close { width: 30px; height: 30px; } }';
  document.head.appendChild(css);
  let meter = null;
  const fitName = () => {
    const dn = document.getElementById('doc-name');
    if (!dn) return;
    meter = meter || document.createElement('canvas').getContext('2d');
    meter.font = getComputedStyle(dn).font;
    dn.style.width = Math.ceil(meter.measureText(dn.value || ' ').width) + 6 + 'px';
  };
  const placeAdd = () => {
    const bar = document.querySelector('.doc-tabs');
    if (!bar) return;
    let b = bar.querySelector('.doc-add');
    if (!b) {
      b = document.createElement('button');
      b.className = 'doc-add';
      b.title = 'Yeni belge';
      b.setAttribute('aria-label', 'Yeni belge');
      b.textContent = '+';
      b.addEventListener('click', () => UI.run('new'));
    }
    bar.appendChild(b);
    fitName();
  };
  if (VP.docs && VP.docs.render) {
    const r0 = VP.docs.render;
    VP.docs.render = function () {
      const r = r0.apply(this, arguments);
      placeAdd();
      return r;
    };
  }
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'doc-name') fitName();
  });
  addEventListener('load', () => setTimeout(placeAdd, 60));
})();
