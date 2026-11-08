/* VektörPad context menu: a long press (finger or Apple Pencil) with the Pick tool, or a right click,
   opens the commands for the object under it, in the order of CorelDRAW 2026's object right-click menu
   (Eğriye Çevir … Özellikler). VektörPad's own useful extras (Yapıştır, Grupla, Şekillendir, Hizala,
   Bıçak izi oluştur, text and table commands) appear where they apply. Cut, copy and paste are always shown.
   The menu is drawn by VP.cmenu (vp-c-menus.js), the same engine as the menu bar. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;

  const isText = (it) => it instanceof paper.PointText || !!(VP.tx && VP.tx.isTx && VP.tx.isTx(it));
  const usable = (id) => !!A[id] && (!A[id].enabled || !!A[id].enabled());
  const isPC = () => VP.sel.length === 1 && VP.fx && VP.fx.of && VP.fx.of(VP.sel[0]) && VP.fx.of(VP.sel[0]).type === 'powerclip';

  // an artistic (point) text is edited in place, like a double tap
  A.ctxEditArt = {
    label: 'Metni düzenle',
    icon: 'text',
    run: () => UI.editText(VP.sel[0]),
    enabled: () => VP.sel.length === 1 && VP.sel[0] instanceof paper.PointText
  };

  /* entries for a selection, top to bottom (Corel screenshot 22). when(): shown only when it applies. */
  const objectMenu = () => {
    const { I, X, S, SEP, SUB } = VP.cmenu;
    const when = (...ids) => () => ids.some(usable);
    const multi = () => VP.sel.length > 1;
    const hasText = () => VP.sel.some(isText);
    return [
      // text first, like Corel's text right-click menu
      I('Metni Düzenle…', ['ctxEditArt', 'txEditText'], 'Ctrl+Shift+T', 'text', { when: () => hasText() && (usable('ctxEditArt') || usable('txEditText')) }),
      X('textProps', 'Metin Özellikleri', 'Ctrl+T', 'text', { when: hasText }),
      I('Dönüştür', ['txToPara', 'txToArtistic'], 'Ctrl+F8', 'paragraph', { when: () => hasText() && (usable('txToPara') || usable('txToArtistic')) }),
      X('txFitPath', 'Metni Eğriye Yerleştir', '', 'textpath', { when: () => hasText() && usable('txFitPath') }),
      X('txUnpath', 'Metni Düzelt', '', '', { when: () => hasText() && usable('txUnpath') }),
      X('txFitText', 'Metni Çerçeveye Sığdır', '', '', { when: () => hasText() && usable('txFitText') }),
      X('txFitFrame', 'Çerçeveyi Metne Uydur', '', '', { when: () => hasText() && usable('txFitFrame') }),
      S('Tablo', [X('tRowAbove'), X('tRowBelow'), X('tColLeft'), X('tColRight'), SEP, X('tMerge'), X('tSplit'), X('tDistRows'), X('tDistCols'), SEP, X('tDelRow'), X('tDelCol'), X('tableToText'), X('tDelTable')], 'table', {
        when: when('tRowAbove', 'tMerge', 'tableToText')
      }),
      SEP,
      I('Eğriye Çevir', 'toCurves', 'Ctrl+Q', 'curves'),
      I('Odağa Getir'),
      I('Birleştir', 'combine', 'Ctrl+L', 'combine', { when: multi }),
      I('Ayır', 'breakApart', 'Ctrl+K', 'breakApart'),
      I('Nesneleri Grupla', 'group', 'Ctrl+G', 'group', { when: multi }),
      I('Nesnelerin Grubunu Çöz', 'ungroup', 'Ctrl+U', 'ungroup', { when: when('ungroup') }),
      I('Tüm Nesnelerin Grubunu Çöz', 'ungroupAll', '', '', { when: when('ungroupAll') }),
      SEP,
      I('Kes', 'cut', 'Ctrl+X', 'cut'),
      I('Kopyala', 'copy', 'Ctrl+C', 'copy'),
      I('Yapıştır', 'paste', 'Ctrl+V', 'paste'),
      I('Sil', 'delete', 'Sil', 'trash'),
      SEP,
      S('Sırala', SUB.arrange),
      S('Hizala', SUB.align, '', { when: multi }),
      S('Şekillendir', SUB.shaping, '', { when: multi }),
      SEP,
      I('Gizle', 'hide', '', 'eyeOff'),
      I('Kilitle', 'lock', '', 'lock'),
      SEP,
      I('İçeri PowerClip Yerleştir…', 'fxPowerclip', '', 'powerclip'),
      S('PowerClip', [
        I('PowerClip’i Düzenle', 'pcEdit', 'Ctrl+Tık', 'editText'),
        I('PowerClip İçeriğini Seç', 'pcSelectContent', 'Alt+Tık', 'select'),
        I('İçeriği Çıkar', 'pcExtract', '', 'ungroup'),
        I('İçeriği PowerClip’e Kilitle', 'pcLockToggle', '', 'lock'),
        SEP,
        I('İçeriği Ortala', 'pcCenter'),
        I('İçeriği Orantılı Sığdır', 'pcFit'),
        I('Çerçeveyi Orantılı Doldur', 'pcFill'),
        I('Çerçeveyi Dolduracak Şekilde Uzat', 'pcStretch')
      ], 'powerclip', { when: isPC }),
      I('PowerClip Düzenlemeyi Bitir', 'pcFinish', 'Shift+Esc', 'ok', { when: () => !!(VP.cFocus && VP.cFocus.isEditingPC) }),
      S('Çerçeve Türü', []),
      SEP,
      I('Yeni Simetri Oluştur', 0, 'Alt+S'),
      SEP,
      S('AI Üretir', []),
      SEP,
      I('Yeni Sembol Oluştur', 'toSymbol', '', 'symbol'),
      X('breakSymbol', null, '', '', { when: when('breakSymbol') }),
      X('selectMaster', null, '', '', { when: when('selectMaster') }),
      X('unclone', null, '', '', { when: when('unclone') }),
      SEP,
      I('İnternet Bağlantısı', 'c_internetbaglantilari'),
      SEP,
      S('Nesne Stilleri', SUB.objStyles),
      S('Renk Stilleri', SUB.colorStyles),
      SEP,
      I('Paragraf Metni Sarmalansın', ['c_paragrafmetnisarmalansin', 'c_paragrafmetnisarmalanir'], '', 'wrapText'),
      I('Sarma Bağlantı Çizgisi', 0, '', 'textWrap'),
      SEP,
      I('Dolguyu Üzerine Yazdır'),
      I('Anahattı Üzerine Yazdır'),
      I('Nesne İpuçları'),
      I('Piksel Izgarasıyla Hizala', 0, '', 'magnet'),
      SEP,
      X('fxSeparate', 'Efekti Ayır', '', 'fx', { when: when('fxSeparate') }),
      X('ecCut', 'Bıçak izi oluştur', '', 'ecCut'),
      SEP,
      I('Özellikler', 'dockProps', 'Alt+Enter')
    ];
  };
  /* entries for an empty spot on the page */
  const pageMenu = () => {
    const { I, X, S, SEP } = VP.cmenu;
    return [
      I('Geri Al', 'undo', 'Ctrl+Z', 'undo'),
      I('Yeniden Uygula', 'redo', 'Ctrl+Shift+Z', 'redo'),
      I('Yinele', 'repeat', 'Ctrl+R'),
      SEP,
      I('Yapıştır', 'paste', 'Ctrl+V', 'paste'),
      S('Tümünü Seç', [I('Nesneler', 'selectAll', 'Ctrl+A'), I('Metin', 'selectAllText'), I('Kılavuzlar'), I('Düğümler')]),
      SEP,
      I('Dosya Al…', 'import', 'Ctrl+I', 'import'),
      SEP,
      S('Görünüm', [I('Tel Izgara', 0, '', '', { radio: 1 }), I('Normal', 0, '', '', { radio: 1 }), I('Geliştirilmiş', 0, '', '', { radio: 1, chk0: 1 }), I('Piksel', 0, '', '', { radio: 1 }), SEP, I('Tam ekran önizleme', 'fullPreview', 'F9', 'preview'), I('Tümünü Sığdır', 'fit', 'F4', 'fit'), X('zoom100')]),
      S('Izgara', [I('Belge Izgarası', 'grid'), I('Piksel Izgarası'), I('Taban Çizgisi Izgarası')]),
      I('Cetveller', 'rulers', 'Alt+Shift+R'),
      I('Kılavuzlar', 'guides'),
      S('Yapış', [I('Pikseller'), I('Belge Izgarası', 'snap'), I('Kılavuzlar', 'snapGuides'), I('Nesneler', 'snapObjects'), I('Sayfa', 'c_sayfayayapis')]),
      SEP,
      I('Sayfa Ekle…', 'addPage', '', 'addPage'),
      I('Sayfa Boyutu…', 'pageSetup', '', 'page'),
      I('Sayfa Zemini…', 'pageBg', '', 'pageFrame'),
      SEP,
      I('Tüm Nesneleri Göster', 'showAll', '', 'eye', { when: () => usable('showAll') }),
      I('Tüm Nesnelerin Kilidini Aç', 'unlockAll', '', 'unlock', { when: () => usable('unlockAll') }),
      SEP,
      I('Özellikler', 'dockProps', 'Alt+Enter'),
      I('Nesneler', 'dockObjects')
    ];
  };

  // a fixed 1-pixel spot the menu opens beside (anchor for anything that opens later)
  let spot = null;
  const spotAt = (x, y) => {
    if (!spot) {
      spot = document.createElement('div');
      spot.style.cssText = 'position:fixed;width:1px;height:1px;pointer-events:none';
      document.body.appendChild(spot);
    }
    spot.style.left = Math.round(x) + 'px';
    spot.style.top = Math.round(y) + 'px';
    return spot;
  };

  const CX = (VP.ctx = { lastOpen: 0, objectMenu, pageMenu });
  // x, y: screen position. point: drawing position to pick the object under it (right click);
  // left out after a long press, where the Pick tool has already selected it.
  CX.open = (x, y, point) => {
    if (UI.textItem) UI.commitText();
    if (point) {
      const hit = VP.hitItem(point);
      if (hit && !VP.sel.includes(hit)) VP.setSelection([hit]);
      else if (!hit && VP.sel.length) VP.clearSelection();
    }
    VP.drawOverlay();
    CX.lastOpen = performance.now();
    const anchor = spotAt(x, y);
    if (VP.cmenu) {
      VP.cmenu.openAt(VP.sel.length ? objectMenu() : pageMenu(), x + 2, y + 2, anchor);
      return;
    }
    // fallback without the menu engine: a flat list
    const ids = VP.sel.length ? ['toCurves', 'breakApart', '|', 'cut', 'copy', 'paste', 'delete', '|', 'group', 'ungroup', '|', 'hide', 'lock', '|', 'dockProps'] : ['undo', 'redo', '|', 'paste', 'selectAll', '|', 'dockProps'];
    UI.popover(anchor, UI.menuHTML(ids), (id) => UI.run(id), 'right');
  };
})();
