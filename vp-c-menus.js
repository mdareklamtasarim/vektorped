/* VektörPad, CorelDRAW 2026 look and behaviour: menus part.
   The menu bar (Dosya … Yardım, plus VektörPad's own Eklentiler) with the items, order, separators,
   submenus, shortcuts, small icons and check marks of the desktop suite, drawn as cascading dark menus.
   A Corel item that VektörPad has no command for yet uses the id "c_" + slug of its caption (see slug());
   it is shown greyed out until VP.actions[id] exists (vp-c-features.js adds them).
   VP.cmenu is the menu engine; vp-ctx.js uses it for the right-click menu. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const esc = UI.h.esc;
  const icon = (n) => (n && window.VPIcon && (!window.VPIcon.has || window.VPIcon.has(n)) ? window.VPIcon(n, 'cm-svg') : '');
  const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  // "Sayfayı Çoğalt…" → c_sayfayicogalt
  const slug = (s) => 'c_' + String(s).toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => TR[c]).replace(/[^a-z0-9]/g, '');

  /* ---------- entry builders ---------- */
  // I(caption, id or [ids], shortcut, icon, extra): a command. Without id the c_ slug of the caption is used.
  const I = (t, id, k, ic, o) => Object.assign({ t, id: id || slug(t), k, ic }, o);
  // X(id, caption?, shortcut?, icon?): a VektörPad command kept in a Corel menu (caption defaults to its own label)
  const X = (id, t, k, ic, o) => Object.assign({ t, id, k, ic, x: 1 }, o);
  // S(caption, items or () => items, icon): a submenu. An empty submenu runs A[c_slug] when it exists, else it is greyed.
  const S = (t, sub, ic, o) => Object.assign({ t, sub, ic, id: slug(t) }, o);
  const SEP = '|';
  const clean = (l) => String(l || '').replace(/\s*▸\s*$/, '');

  /* ---------- dynamic submenus ---------- */
  const isRaster = () => VP.sel.some((it) => it instanceof paper.Raster);
  const bx = (cat) => () => {
    const IM = VP.imgfx;
    if (!IM || !IM.EFFECTS) return [];
    return Object.keys(IM.EFFECTS)
      .filter((k) => IM.EFFECTS[k].cat === cat)
      .map((k) => ({ t: IM.EFFECTS[k].label + (IM.EFFECTS[k].params && IM.EFFECTS[k].params.length ? '…' : ''), run: () => IM.dialog(k), en: isRaster }));
  };
  const workspaces = () => {
    const DC = VP.docx;
    if (!DC || !DC.WS) return [X('workspace')];
    return Object.keys(DC.WS).map((k) => ({ t: DC.WS[k].name, radio: 1, chk: () => (VP.settings.workspace || 'default') === k, run: () => DC.applyWS(k) }));
  };
  const openDocs = () => {
    const D = VP.docs;
    if (!D || !D.list) return [];
    return D.list.map((e, i) => {
      const doc = i === D.active ? VP.doc : e.doc;
      return { t: (doc.name || 'Adsız') + (e.dirty ? '*' : ''), radio: 1, chk: () => i === D.active, run: () => D.activate(i) };
    });
  };

  /* ---------- shared submenus (also used by the right-click menu) ---------- */
  const SUB = {
    arrange: () => [
      I('Sayfanın Önüne', 0, 'Ctrl+Home', 'toFront'), I('Sayfanın Arkasına', 0, 'Ctrl+End', 'toBack'),
      I('Katmanın Önüne', 'toFront', 'Shift+PgUp', 'toFrontOfLayer'), I('Katmanın Arkasına', 'toBack', 'Shift+PgDn', 'toBackOfLayer'),
      I('Bir İleri', 'forward', 'Ctrl+PgUp'), I('Bir Geri', 'backward', 'Ctrl+PgDn'),
      I('Bunun Önüne…', 'inFrontOf'), I('Bunun Arkasına…', 'behindOf'), SEP,
      I('Sırayı Tersine Çevir', 'reverseOrder'), SEP,
      X('toLayer'), X('copyToLayer')
    ],
    align: () => [
      I('Sola Hizala', 'alignL', 'L', 'alignL'), I('Sağa Hizala', 'alignR', 'R', 'alignR'), I('Üste Hizala', 'alignT', 'T', 'alignT'), I('Alta Hizala', 'alignB', 'B', 'alignB'),
      I('Yatay Olarak Merkezi Hizala', 'alignCH', 'E', 'alignCH'), I('Dikey Olarak Merkezi Hizala', 'alignCV', 'C', 'alignCV'), SEP,
      I('Yatay Olarak Dağıt', 'distH', '', 'distH'), I('Dikey Olarak Dağıt', 'distV', '', 'distV'), SEP,
      X('alignGrid'), SEP,
      I('Hizalama ve Dağıtım…', 'dockAlign', 'Ctrl+Shift+A')
    ],
    shaping: () => [
      I('Kaynak', 'weld', '', 'weld'), I('Kırp', 'trim', '', 'trim'), I('Kesişim', 'intersect', '', 'intersect'), I('Basitleştir', 'simplify'),
      I('Önü Eksi Arka', 'frontMinusBack'), I('Arkası Eksi Ön', 'backMinusFront'), I('Dışla', 'exclude', '', 'exclude'), I('Böl', 'divide'), SEP,
      I('Sınır', 'createBoundary')
    ],
    group: () => [I('Nesneleri Grupla', 'group', 'Ctrl+G', 'group'), I('Nesnelerin Grubunu Çöz', 'ungroup', 'Ctrl+U', 'ungroup'), I('Tüm Nesnelerin Grubunu Çöz', 'ungroupAll')],
    objStyles: () => [I('Seçimden Stil Oluştur…', 'styleFromSel'), SEP, I('Nesne Stilleri', 'dockStyles', 'Ctrl+F5', 'styles')],
    colorStyles: () => [I('Yeni Renk Stili…', 'colorStyleNew'), SEP, X('dockPalettes')],
    powerclip: () => [
      I('İçeri PowerClip Yerleştir…', 'fxPowerclip', '', 'powerclip'),
      X('fxPowerclip2'),
      SEP,
      I('PowerClip’i Düzenle', 'pcEdit', 'Ctrl+Tık / Çift Tık', 'editText'),
      I('PowerClip Düzenlemeyi Bitir', 'pcFinish', 'Shift+Esc', 'ok'),
      I('PowerClip İçeriğini Seç', 'pcSelectContent', 'Alt+Tık', 'select'),
      I('İçeriği Çıkar', 'pcExtract', '', 'ungroup'),
      I('İçeriği PowerClip’e Kilitle', 'pcLockToggle', '', 'lock'),
      SEP,
      I('İçeriği Ortala', 'pcCenter'),
      I('İçeriği Orantılı Sığdır', 'pcFit'),
      I('Çerçeveyi Orantılı Doldur', 'pcFill'),
      I('Çerçeveyi Dolduracak Şekilde Uzat', 'pcStretch')
    ]
  };

  /* ---------- the menu bar ---------- */
  const DEFS = {
    file: [
      I('Yeni…', 'new', 'Ctrl+N', 'newDoc'),
      I('Şablondan Yeni Oluştur…', 0, '', 'template'),
      I('Aç…', 'open', 'Ctrl+O', 'open'),
      I("Bulut'tan Aç…", 0, '', 'cloudOpen'),
      S('Son Kullanılanı Aç', []),
      X('openCdr'),
      X('recoverCdr'),
      SEP,
      I('Kapat', 'docClose', '', 'closeDoc'),
      I('Tümünü Kapat', 'docCloseAll', '', 'closeAll'),
      SEP,
      I('Kaydet…', 'save', 'Ctrl+S', 'save'),
      I('Farklı Kaydet…', 'saveAs', 'Ctrl+Shift+S', 'saveAs'),
      I("Bulut'a Kaydet…", 0, '', 'cloudSave'),
      I('Şablon olarak kaydet…', 0, '', 'saveTemplate'),
      X('saveCorel'),
      I('Geri Al', 'c_gerial'),
      SEP,
      S('Görüntü Yakala', []),
      I('Dosya Al…', 'import', 'Ctrl+I', 'import'),
      I('Dosya Ver…', 'export', 'Ctrl+E', 'export'),
      S('Şunun İçin Ver', [I('Office…'), I('Web…'), SEP, X('exportJpg'), X('exportEps'), X('exportDxf')]),
      S('Verme Penceresi', []),
      S('Gönder', []),
      I("PDF'ye Yayınla", 'exportPdf', '', 'pdf'),
      SEP,
      S('Birleştirerek Yazdırma', []),
      SEP,
      I('Yazdır…', 'print', 'Ctrl+P', 'print'),
      I('Yazdırma Önizlemesi…', 'printPreview', '', 'printPreview'),
      X('separations'),
      X('impose'),
      SEP,
      I('Belge Özellikleri…', 'docProps', '', 'docProps'),
      SEP,
      I('Çık', 0, 'Alt+F4', 'quit')
    ],
    edit: [
      I('Geri Al', 'undo', 'Ctrl+Z', 'undo'),
      I('Yeniden Uygula', 'redo', 'Ctrl+Shift+Z', 'redo'),
      I('Yinele', 'repeat', 'Ctrl+R'),
      SEP,
      I('Odağa Getir'),
      I('Odak Modundan Çık', 0, 'Shift+Esc'),
      SEP,
      I('Kes', 'cut', 'Ctrl+X', 'cut'),
      I('Kopyala', 'copy', 'Ctrl+C', 'copy'),
      I('Özellikleri Kopyalanacak Nesne…', 'copyProps', '', 'attrEyedropper'),
      I('Yapıştır', 'paste', 'Ctrl+V', 'paste'),
      I('Görünümde Yapıştır', 0, 'Ctrl+Shift+V', 'paste'),
      I('Yerinde Yapıştır', 'c_yerindeyapistir', '', 'paste'),
      I('Özel Yapıştır…', 0, '', 'paste'),
      I('Sil', 'delete', 'Sil', 'trash'),
      SEP,
      I('Çoğalt', 'duplicate', 'Ctrl+D', 'duplicate'),
      I('Klonla', 'clone'),
      SEP,
      S('Tümünü Seç', [I('Nesneler', 'selectAll', 'Ctrl+A'), I('Metin', 'selectAllText'), I('Kılavuzlar'), I('Düğümler'), SEP, X('deselect')]),
      SEP,
      I('Bul ve Değiştir', 'findReplace', 'Ctrl+F'),
      I('Çoğaltarak Yerleştir', 'stepRepeat', 'Ctrl+Shift+D')
    ],
    view: [
      I('Tel Izgara', 0, '', '', { radio: 1 }),
      I('Normal', 0, '', '', { radio: 1 }),
      I('Geliştirilmiş', 0, '', '', { radio: 1, chk0: 1 }),
      I('Piksel', 0, '', '', { radio: 1 }),
      SEP,
      I('Tam ekran önizleme', 'fullPreview', 'F9', 'preview'),
      I('Yalnızca Seçili Nesneyi Önizle', 0, '', 'preview'),
      I('Çıktı Sayfa Görünümü', 'pageSorter'),
      SEP,
      I('Büyüt', 0, 'Ctrl++', 'zoomIn'),
      I('Küçült', 0, 'Ctrl+-', 'zoomOut'),
      I('Tümünü Sığdır', 'c_tumunusigdir', 'F4', 'fit'),
      X('zoomSel'),
      X('zoom100'),
      SEP,
      I('Renkleri Prova Et'),
      I('Üzerine Yazdırmaları Simüle Et'),
      I('Karmaşık Efektleri Rasterleştir'),
      SEP,
      S('Sayfa', [I('Sayfa Kenarlığı'), I('Taşma Payı'), I('Yazdırılabilir Alan'), SEP, X('deskWhite')]),
      S('Izgara', [I('Belge Izgarası', 'grid'), I('Piksel Izgarası'), I('Taban Çizgisi Izgarası')]),
      I('Cetveller', 'rulers', 'Alt+Shift+R'),
      I('Kılavuzlar', 'guides'),
      X('clearGuides'),
      I('Hizalama Kılavuzları', 0, 'Alt+Shift+A'),
      I('Dinamik Kılavuzlar', 0, 'Alt+Shift+D'),
      SEP,
      S('Yapış', [I('Pikseller'), I('Belge Izgarası', 'snap'), I('Kılavuzlar', 'snapGuides'), I('Nesneler', 'snapObjects'), I('Sayfa', 'c_sayfayayapis')]),
      I('Ayır', 'snapOff', 'Alt+Q'),
      SEP,
      I('Belge Gezinme Aracı', 0, '', '', { chk0: 1 }),
      I('Kaydırma çubukları', 0, '', '', { chk0: 1 }),
      SEP,
      X('pencilOnly'),
      X('cdrPreview')
    ],
    layout: [
      I('Sayfa Ekle…', 'c_sayfaekle', '', 'addPage'),
      I('Sayfayı Çoğalt…', 'c_sayfayicogalt', '', 'addPage'),
      I('Sayfa İsmini Değiştir…', 'renamePage', '', 'page'),
      I('Sayfa Sil…', 'c_sayfayisil', '', 'page'),
      I('Sayfaya Git…', 'gotoPage', '', 'page'),
      SEP,
      S('Sayfa Numarası Ekle', [I('Etkin Katmana', 'insertPageNum'), I('Tüm Sayfalara'), I('Tüm Tek Sayfalara'), I('Tüm Çift Sayfalara')]),
      I('Sayfa Numarası Ayarları…', 0, '', 'pages'),
      SEP,
      I('Sayfa Yönünü Değiştir', 'orientToggle', '', 'landscape'),
      SEP,
      I('Belge Seçenekleri…', 0, '', 'options'),
      I('Sayfa Boyutu…', 'pageSetup', '', 'page'),
      I('Sayfa Düzeni…', 0, '', 'pages'),
      I('Sayfa Zemini…', 'pageBg', '', 'pageFrame'),
      SEP,
      I('Çerçeve ve Gromet…'),
      SEP,
      X('facingPages'),
      X('masterLayer'),
      X('pagePresetMenu'),
      X('fitPageToArt'),
      X('pageToolAct')
    ],
    object: [
      S('Oluştur', [I('Sınır', 'createBoundary')]),
      S('Ekle', [I('Barkod Ekle…', 'insertBarcode', '', 'barcode'), I('QR Kodu Ekle…', 'insertQRCode', '', 'qr')]),
      S('AI Üretir', []),
      SEP,
      S('Güçlü Kırpma', SUB.powerclip),
      S('Simetri', [I('Yeni Simetri Oluştur', 0, 'Alt+S'), I('Simetriyi Düzenle', 0), I('Simetriyi Ayır', 0)]),
      S('Sembol', [I('Yeni Sembol Oluştur', 'toSymbol', '', 'symbol'), I('Sembolü Nesnelere Dönüştür', 'breakSymbol'), SEP, I('Semboller', 'dockSymbols', 'Ctrl+F3')]),
      S('Değişim Düğme', []),
      SEP,
      I('Dönüşümleri Temizle', 'clearTransform', '', 'clearTransform'),
      SEP,
      S('Efekti Kopyala', []),
      S('Efekti Klonla', []),
      I('Efekti Temizle', 'fxClear', '', 'fx'),
      SEP,
      S('Hizalama ve Dağıtım', SUB.align),
      I('Nesneleri Yola Sığdır'),
      S('Sırala', SUB.arrange),
      S('Grup', SUB.group),
      SEP,
      S('Gizle', [I('Nesneyi Gizle', 'hide', '', 'eyeOff'), I('Seçili Olmayanları Gizle', 'c_seciliolmayanlarigizle'), I('Tüm Nesneleri Göster', 'showAll', '', 'eye')]),
      S('Kilitle', [I('Nesneyi Kilitle', 'lock', '', 'lock'), I('Seçili Olmayanları Kilitle', 'c_seciliolmayanlarikilitle'), I('Tüm Nesnelerin Kilidini Aç', 'unlockAll', '', 'unlock')]),
      SEP,
      S('Şekillendirme', SUB.shaping),
      I('Birleştir', 'combine', 'Ctrl+L', 'combine'),
      I('Ayır', 'breakApart', 'Ctrl+K', 'breakApart'),
      S('Perspektif', [I('Perspektif Ekle', 'fxPerspective', '', 'perspective'), I('Perspektifi Temizle')]),
      SEP,
      I('Eğriye Çevir', 'toCurves', 'Ctrl+Q', 'curves'),
      I('Biteşleme Dönüştür…', 'toBitmap', '', 'toBitmap'),
      I('Anahattı Nesneye Dönüştür', 0, 'Ctrl+Shift+Q', 'outlineToObject'),
      I('Eğrileri Birleştir', 'joinCurves'),
      X('closePath'), X('reversePath'), X('parallelCurve'), X('corners'),
      SEP,
      I('Dolguyu Üzerine Yazdır'),
      I('Anahattı Üzerine Yazdır'),
      I('Biteşlemi Üzerine Yazdır'),
      I('Nesne İpuçları'),
      SEP,
      X('outlinePen', null, 'F12', 'outlinePen'),
      X('selectMaster'), X('unclone'),
      SEP,
      I('Özellikler', 'dockProps', 'Alt+Enter'),
      I('Nesneler', 'dockObjects'),
      I('Sayfalar', 'dockPages')
    ],
    effects: [
      I('Düzleştirme Efektleri', 'fxSeparate', '', 'fx'),
      SEP,
      S('3D Efektler', []),
      S('Ayarla', bx('adjust')),
      S('Sanat Darbeleri', bx('art')),
      S('Bulanıklık', bx('blur')),
      S('Kamera', bx('camera')),
      S('Renk Dönüşümü', bx('color')),
      S('Kontur', bx('contour')),
      S('Düzeltme', []),
      S('Yaratıcı', bx('creative')),
      S('Özel', []),
      S('Deformasyon', bx('distort')),
      S('Gürültü', bx('noise')),
      S('Keskinleştir', bx('sharpen')),
      S('Doku', bx('texture')),
      S('Dönüşüm', []),
      SEP,
      I('Artistik Medya', 0, '', 'artisticMedia'),
      I('Bombe'),
      I('Harman', 'fxBlend', '', 'blend'),
      I('Kontur', 'fxContour', 'Ctrl+F9', 'contour'),
      I('Zarf', 'fxEnvelope', 'Ctrl+F7', 'envelope'),
      I('Derinlik', 'fxExtrude', '', 'extrude'),
      I('Lens', 'fxLens', 'Alt+F3', 'lens'),
      I('PhotoCocktail'),
      I('Pointillizer'),
      SEP,
      S('Gölge', [X('shadowToggle'), SEP, X('fxDropShadow', null, '', 'dropShadow'), X('fxPShadow'), X('fxInnerShadow'), X('fxBlockShadow')], 'shadow'),
      X('fxDistort', null, '', 'distort'),
      X('fxMesh'),
      X('fxPowerclip', null, '', 'powerclip')
    ],
    bitmaps: [
      I('Biteşleme Dönüştür…', 'toBitmap', '', 'toBitmap'),
      SEP,
      I('Görüntüyü Düzelt…', 0, '', 'bmpfx'),
      I('Görüntü Ayarlama Lab…', 0, '', 'bmpfx'),
      I('JPEG Artefaktlarını Kaldır', 0, '', 'bitmap'),
      SEP,
      I('Biteşlemi Düzenle…', 0, '', 'bitmap'),
      I('Arka planı kaldır', 0, '', 'bitmap'),
      I('Biteşlemi Kırp', 'bmpCrop', '', 'crop'),
      I('Yeniden Örnekle…', 'bmpResample', '', 'bitmap'),
      X('bmpTrim'), X('bmpUpscale'),
      S('Mod', [X('bmpGray'), X('bmpBW'), X('bmpPalette'), X('bmpDuotone'), SEP, X('bmpInvert')]),
      S('Biteşlemi Şişir', [I('Biteşlemi Şişir…', 'bmpExpand')]),
      SEP,
      I('Bağı Kopar'),
      I('Bağdan güncelle'),
      SEP,
      I('Hızlı Vektörleştirme', 'traceQuick', '', 'bitmap'),
      S('Çizgisel Vektörleştirme', [I('Teknik Çizim', 'traceCenter'), I('Çizgi Sanatı', 'traceLine')]),
      S('Yüzeysel Vektörleştirme', [X('traceOutline'), I('Logo', 'traceLogo')]),
      SEP,
      S('Eklentiler', []),
      SEP,
      I('Biteşlem Maskesi', 'bmpColorMask')
    ],
    text: [
      I('Sekmeler…', 0, '', 'alignL'),
      I('Sütunlar…', 0, '', 'paragraph'),
      I('Maddeler ve Numaralandırma…', 0, '', 'alignJ'),
      I('Büyük Harf…', 0, '', 'text'),
      I('Metin İstatistikleri…', 'textStats', '', 'summary'),
      SEP,
      I('Metni Düzenle…', ['txEditText', 'ctxEditArt'], 'Ctrl+Shift+T', 'text'),
      S('Biçimlendirme Kodu Ekle', []),
      SEP,
      I('Dönüştür', ['c_donustur', 'txToPara', 'txToArtistic'], 'Ctrl+F8', 'paragraph'),
      I('Yazdırılmayan karakterleri görüntüle'),
      SEP,
      S('Paragraf Metin Çerçevesi', [I('Metni Çerçeveye Sığdır', 'txFitText'), I('Çerçeveyi Metne Uydur', 'txFitFrame'), SEP, X('txNewPara')]),
      SEP,
      I('Metni Eğriye Yerleştir', 'txFitPath', '', 'textpath'),
      I('Metni Düzelt', 'txUnpath', '', 'textpath'),
      I('Taban Çizgisine Hizala', 0, 'Alt+F12', 'text'),
      I('Taban Çizgisi Izgarasına Hizala'),
      X('txPathTool'), X('txBake'),
      SEP,
      I('Tireleme Kullan', 'hyphenation'),
      S('Yazım Araçları', [I('Yazım Denetimi…', 'spellCheck', 'Ctrl+F12'), I('Hızlı Düzeltme…', 'quickCorrect'), X('spellAsYouType'), SEP, I('Büyük/Küçük Harf Değiştir…', 'changeCase', 'Shift+F3')]),
      SEP,
      I('Kodu Dönüştür…', 0, '', 'glyph'),
      I('Metni Web Uyumlu Yap'),
      SEP,
      I('Eşleştirme…', 0, '', 'text'),
      SEP,
      I('Metin', ['dockText', 'textProps'], 'Ctrl+T'),
      I('Görsel Karakterler', 'insertGlyph', 'Ctrl+F11'),
      X('paraFormat'), X('fontPlayground')
    ],
    table: [
      I('Yeni Tablo Oluştur…', 'txNewTable', '', 'table'),
      I('Metni Tabloya Dönüştür…', 'textToTable', '', 'table'),
      I('Tabloyu Metne Dönüştür…', 'tableToText', '', 'table'),
      SEP,
      S('Ekle', [I('Satır Yukarı', 'tRowAbove'), I('Satır Aşağı', 'tRowBelow'), I('Sol Sütun', 'tColLeft'), I('Sağ Sütun', 'tColRight')]),
      S('Seç', [I('Satır', 'tSelRow'), I('Sütun', 'tSelCol'), I('Tablo', 'tSelAll')]),
      S('Sil', [I('Satır', 'tDelRow'), I('Sütun', 'tDelCol'), I('Tablo', 'tDelTable')]),
      S('Dağıt', [I('Satırları Eşit Dağıt', 'tDistRows'), I('Sütunları Eşit Dağıt', 'tDistCols')]),
      SEP,
      I('Hücreleri Birleştir', 'tMerge', '', 'table'),
      I('Hücreleri Ayır', 'tSplit', '', 'table'),
      I('Satırlara Böl…', 0, '', 'table'),
      I('Sütunlara Böl…', 0, '', 'table')
    ],
    tools: [
      S('Seçenekler', [
        I('VektörPad…', 'options', 'Ctrl+J', 'options'), I('Belge…', 'c_belgesecenekleri'), I('Özelleştirme…'), SEP,
        S('Tema', [X('themeAuto'), X('themeLight'), X('themeDark')]),
        X('newDocAsk'), X('pencilOnly'), SEP, X('resetWorkspace')
      ]),
      I('Ayarları Varsayılan Olarak Kaydet…', 0, '', 'gear'),
      SEP,
      I('Renk Yönetimi…'),
      SEP,
      S('Betikler', [X('dockScripts', null, '', 'code'), X('macroRec'), X('runScript')])
    ],
    plugins: null, // VektörPad's own Kesim ve Montaj menu (UI.MENUS.plugins from vp-ecut.js), kept as it is
    window: [
      I('Yeni Pencere', 0, '', 'newDoc'),
      I('Pencereyi Tazele', 0, 'Ctrl+W'),
      I('Pencereyi Kapat', 'docClose', 'Ctrl+F4', 'closeDoc'),
      I('Tümünü Kapat', 'docCloseAll', '', 'closeAll'),
      SEP,
      I('Basamakla'),
      I('Yatay Döşe'),
      I('Dikey Döşe'),
      I('Pencereleri Birleştir'),
      I('Pencereyi Yerleştir'),
      SEP,
      S('Çalışma Arayüzü', workspaces),
      SEP,
      S('Pencereler', [
        I('Özellikler', 'dockProps', 'Alt+Enter'), I('Nesneler', 'dockObjects'), I('Sayfalar', 'dockPages'), I('Metin', 'dockText', 'Ctrl+T'),
        I('Hizalama ve Dağıtım', 'dockAlign', 'Ctrl+Shift+A'), I('Köşeler', 'dockCorners'), I('Dönüştür', 'dockTransform'), I('Çoğaltarak Yerleştir', 'dockStep'), SEP,
        I('Stiller', 'dockStyles'), I('Renk Paletleri', 'dockPalettes'), I('Semboller', 'dockSymbols'), I('Yorumlar', 'dockComments'), I('Öğren', 'dockHints'), I('Betikler', 'dockScripts'), SEP,
        X('ecPanel')
      ]),
      S('Araç Çubukları', [I('Standart', 'barStd'), I('Özellik Çubuğu', 'barProp'), I('Araç Kutusu', 'barTools'), I('Durum Çubuğu', 'barStatus'), SEP, X('fullscreen', null, '', 'fullscreen')]),
      S('Renk Paletleri', [I('Varsayılan CMYK Paleti', 'barPalette'), I('Belge Paleti', 'barDocPal'), SEP, X('dockPalettes')]),
      SEP,
      X('skinToggle'),
      X('deskWhite'),
      SEP,
      I('Karşılama Ekranı', 'welcomeScreen'),
      { dyn: openDocs }
    ],
    help: [
      I('Ürün Yardımı…', 'help', '', 'help'),
      SEP,
      I('Karşılama Ekranı', 'welcomeScreen'),
      I('Video Eğitimleri…', 0, '', 'preview'),
      I('Öğren', 'dockHints'),
      I('Hızlı Başlangıç Kılavuzu…', 0, '', 'help'),
      I('Kullanıcı Kılavuzu…', 0, '', 'help'),
      X('shortcuts'),
      X('sample'),
      SEP,
      I('Yenilikler…', 'whatsNew', '', 'welcome'),
      SEP,
      I('Güncellemeler…'),
      I('Mesaj Ayarları'),
      I('Topluluk', 'c_coreldrawtoplulugu'),
      I('Destek…', 'c_coreldestek'),
      I('Fikir ve Geri Bildirim Gönderin…', ['c_fikirvegeribildirimgonderin', 'c_fikirvegeribildirimgonderinyalnizcaingilizce']),
      SEP,
      I('Hesabınızı yenileyin'),
      I('Hesap Ayarları…'),
      I('Bulut oturumunu kapat'),
      SEP,
      I('Satın Alımları Geri Yükle…'),
      SEP,
      I('VektörPad Hakkında…', 'about', '', 'help')
    ]
  };
  const NAMES = { file: 'Dosya', edit: 'Düzen', view: 'Görünüm', layout: 'Mizanpaj', object: 'Nesne', effects: 'Efektler', bitmaps: 'Biteşlemler', text: 'Metin', table: 'Tablo', tools: 'Araçlar', plugins: 'Eklentiler', window: 'Pencere', help: 'Yardım' };

  // flat id lists (for code that reads UI.MENUS, e.g. "is this id in a menu?")
  const flatIds = (list, out = []) => {
    (Array.isArray(list) ? list : []).forEach((e) => {
      if (!e || e === SEP) return;
      if (Array.isArray(e.sub)) flatIds(e.sub, out);
      if (e.id && !e.sub) [].concat(e.id).forEach((id) => out.push(id));
    });
    return out;
  };
  // converts an old-style list ('|', 'h:Title', 'sub:Label|a,b', ids) to entries
  const fromFlat = (list) =>
    (list || []).map((id) => {
      if (id === '|') return SEP;
      if (typeof id !== 'string') return id;
      if (id.startsWith('h:')) return { h: id.slice(2) };
      if (id.startsWith('sub:')) {
        const [label, ids] = id.slice(4).split('|');
        return S(label, (ids || '').split(',').filter(Boolean).map((x) => X(x)));
      }
      return X(id);
    });

  const M = UI.MENUS;
  const prevPlugins = M.plugins ? M.plugins.slice() : [];
  const BASE = {};
  Object.keys(M).forEach((k) => delete M[k]);
  Object.keys(NAMES).forEach((k) => {
    const ids = k === 'plugins' ? prevPlugins : flatIds(DEFS[k]);
    BASE[k] = new Set(ids);
    M[k] = ids.slice();
  });
  Object.keys(UI.MENU_NAMES).forEach((k) => delete UI.MENU_NAMES[k]);
  Object.assign(UI.MENU_NAMES, NAMES);
  // entries of a top menu: the Corel definition plus anything other parts added to UI.MENUS[k] later
  const menuItems = (k) => {
    if (k === 'plugins' || !DEFS[k]) return fromFlat(M[k]);
    const extra = (M[k] || []).filter((id) => typeof id === 'string' && id !== '|' && !id.startsWith('h:') && (id.startsWith('sub:') || (!BASE[k].has(id) && A[id])));
    return extra.length ? DEFS[k].concat([SEP], fromFlat(extra)) : DEFS[k];
  };

  /* ---------- state of an entry ---------- */
  const resolve = (e) => {
    const ids = [].concat(e.id || []);
    const have = ids.filter((id) => A[id]);
    const ok = have.find((id) => !A[id].enabled || A[id].enabled());
    const id = ok || have[0] || ids[0];
    return { id, a: A[id] };
  };
  const subItems = (e) => {
    let list = typeof e.sub === 'function' ? e.sub() : e.sub;
    return (list || []).filter((x) => x === SEP || !x.when || x.when());
  };
  const entryOn = (e) => {
    if (e === SEP || e.h) return false;
    if (e.sub) {
      const list = subItems(e);
      if (!list.some((x) => x !== SEP && !x.h)) return !!A[e.id];
      return list.some(entryOn);
    }
    if (e.run) return !e.en || e.en();
    const { a } = resolve(e);
    return !!a && (!a.enabled || !!a.enabled());
  };
  const entryChecked = (e) => {
    if (e.chk) return !!e.chk();
    if (e.sub || e.run) return null;
    const { a } = resolve(e);
    if (a && a.checked) return !!a.checked();
    if (!a && e.chk0) return true; // how VektörPad always draws it (e.g. Geliştirilmiş görünüm)
    return null;
  };
  const label = (e) => {
    if (e.t) return e.t;
    const { a, id } = resolve(e);
    return clean(a ? a.label : id);
  };

  /* ---------- rendering ---------- */
  const CHEV = '<svg class="cm-chev" viewBox="0 0 8 8" aria-hidden="true"><path d="M2.5 1.2L5.6 4 2.5 6.8"/></svg>';
  const TICK = '<svg class="cm-tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.4l3 3 6.6-7"/></svg>';
  const DOT = '<svg class="cm-dot" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2"/></svg>';
  const rowHTML = (e, i) => {
    if (e === SEP) return '<div class="cm-sep" role="separator"></div>';
    if (e.h) return '<div class="cm-head">' + esc(e.h) + '</div>';
    const on = entryOn(e);
    const chk = entryChecked(e);
    // Corel items show Corel's shortcut; VektörPad extras show their own
    const kbd = e.sub ? '' : e.x ? e.k || (resolve(e).a || {}).kbd || '' : e.k || '';
    const ic = icon(e.ic);
    let lead = '';
    if (chk && ic) lead = '<span class="cm-i cm-on">' + ic + '</span>';
    else if (chk) lead = '<span class="cm-i">' + (e.radio ? DOT : TICK) + '</span>';
    else lead = '<span class="cm-i">' + ic + '</span>';
    return (
      '<button type="button" class="cm-item' + (e.sub ? ' cm-has-sub' : '') + '" role="menuitem" data-i="' + i + '"' + (on ? '' : ' aria-disabled="true" data-off="1"') +
      (e.sub ? ' aria-haspopup="menu" aria-expanded="false"' : '') + (chk != null ? ' aria-checked="' + !!chk + '"' : '') + ' tabindex="-1">' +
      lead + '<span class="cm-t">' + esc(label(e)) + '</span><span class="cm-k">' + esc(kbd) + '</span><span class="cm-a">' + (e.sub ? CHEV : '') + '</span></button>'
    );
  };
  // drops separators at the ends and doubled ones; expands dynamic groups
  const tidy = (list) => {
    const out = [];
    list.forEach((e) => {
      if (e && e.dyn) {
        const d = e.dyn();
        if (d.length) out.push(...d);
        return;
      }
      if (e !== SEP && e.when && !e.when()) return;
      if (e === SEP && (!out.length || out[out.length - 1] === SEP)) return;
      out.push(e);
    });
    while (out.length && out[out.length - 1] === SEP) out.pop();
    return out;
  };

  const CM = (VP.cmenu = { I, X, S, SEP, SUB, slug, DEFS, NAMES, panels: [], open: null });
  let layer = null;
  let scrim = null;
  let ctx = null; // { kind: 'bar'|'ctx'|'all', key, btn }
  let hoverT = 0;
  let size0 = '';
  // a real window size change (rotation, split view) closes the menu
  const onResize = () => {
    if (innerWidth + 'x' + innerHeight !== size0) close();
  };

  const close = () => {
    if (layer && UI._pop === layer) UI.closePop();
    else cleanup();
  };
  const cleanup = () => {
    clearTimeout(hoverT);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    document.querySelectorAll('.menu-btn.cm-open').forEach((b) => b.classList.remove('cm-open'));
    CM.panels = [];
    if (layer) layer.remove();
    if (scrim) scrim.remove();
    layer = null;
    scrim = null;
    ctx = null;
  };
  const cp0 = UI.closePop;
  UI.closePop = () => {
    const mine = layer && UI._pop === layer;
    cp0();
    if (mine) cleanup();
  };

  const place = (el, x, y, alt) => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x;
    let top = y;
    if (left + w > innerWidth - 4) left = alt != null ? alt - w : innerWidth - w - 4;
    if (left < 4) left = 4;
    if (top + h > innerHeight - 4) top = Math.max(4, innerHeight - h - 4);
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
  };
  const closeFrom = (level) => {
    while (CM.panels.length > level) {
      const p = CM.panels.pop();
      if (p.owner) {
        p.owner.classList.remove('cm-hot');
        p.owner.setAttribute('aria-expanded', 'false');
      }
      p.el.remove();
    }
  };
  const showPanel = (items, level, x, y, alt, owner) => {
    closeFrom(level);
    const list = tidy(items);
    const el = document.createElement('div');
    el.className = 'cm-menu' + (ctx && ctx.kind === 'ctx' ? ' cm-ctx' : '');
    el.setAttribute('role', 'menu');
    el.dataset.level = level;
    el.innerHTML = list.length ? list.map(rowHTML).join('') : '<div class="cm-empty">(boş)</div>';
    layer.appendChild(el);
    place(el, x, y, alt);
    const p = { el, list, owner };
    CM.panels.push(p);
    if (owner) owner.setAttribute('aria-expanded', 'true');
    return p;
  };
  const openSub = (btn, focusFirst) => {
    const level = +btn.closest('.cm-menu').dataset.level;
    const p = CM.panels[level];
    const e = p && p.list[+btn.dataset.i];
    if (!e || !e.sub) return;
    const kids = subItems(e);
    if (!kids.some((x) => x !== SEP && !x.h)) return closeFrom(level + 1);
    if (CM.panels[level + 1] && CM.panels[level + 1].owner === btn) {
      if (focusFirst) focusRow(CM.panels[level + 1], 0, 1);
      return;
    }
    p.el.querySelectorAll('.cm-item.cm-hot').forEach((b) => b !== btn && b.classList.remove('cm-hot'));
    btn.classList.add('cm-hot');
    const r = btn.getBoundingClientRect();
    const pr = p.el.getBoundingClientRect();
    const np = showPanel(kids, level + 1, pr.right - 3, r.top - 4, pr.left + 3, btn);
    if (focusFirst) focusRow(np, 0, 1);
  };
  const rows = (p) => [...p.el.querySelectorAll('.cm-item')];
  const focusRow = (p, idx, dir) => {
    const rs = rows(p);
    if (!rs.length) return;
    let i = idx;
    for (let n = 0; n < rs.length; n++) {
      const r = rs[(i + rs.length) % rs.length];
      if (!r.dataset.off) {
        p.el.querySelectorAll('.cm-item.cm-hot').forEach((b) => b !== r && !(CM.panels[+p.el.dataset.level + 1] && CM.panels[+p.el.dataset.level + 1].owner === b) && b.classList.remove('cm-hot'));
        r.classList.add('cm-hot');
        r.focus({ preventScroll: false });
        return r;
      }
      i += dir || 1;
    }
  };
  const activate = (btn) => {
    if (!btn || btn.dataset.off) return;
    const level = +btn.closest('.cm-menu').dataset.level;
    const p = CM.panels[level];
    const e = p && p.list[+btn.dataset.i];
    if (!e) return;
    if (e.sub && subItems(e).some((x) => x !== SEP && !x.h)) return openSub(btn, false);
    const anchor = ctx && ctx.btn;
    close();
    if (anchor && anchor.isConnected) UI._lastAnchor = anchor;
    if (e.run) return e.run();
    UI.run(e.sub ? e.id : resolve(e).id);
  };

  const menuBtn = (key) => document.querySelector('.menu-btn[data-menu="' + key + '"]');
  const barKeys = () => [...document.querySelectorAll('.menu-btn[data-menu]')].filter((b) => b.offsetParent).map((b) => b.dataset.menu);

  const begin = (kind, btn) => {
    close();
    ctx = { kind, btn };
    scrim = document.createElement('div');
    scrim.className = 'scrim cm-scrim';
    layer = document.createElement('div');
    layer.className = 'cm-layer';
    document.body.append(scrim, layer);
    UI._pop = layer;
    UI._scrim = scrim;
    UI._popAnchor = btn || layer;
    UI._lastAnchor = btn || UI._lastAnchor;
    if (btn) btn.setAttribute('aria-expanded', 'true');
    window.addEventListener('keydown', onKey, true);
    size0 = innerWidth + 'x' + innerHeight;
    window.addEventListener('resize', onResize);
    // the menu-bar buttons stay live under the scrim: press another to switch, the same one to close
    const under = (e) => {
      scrim.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      scrim.style.pointerEvents = '';
      return el && el.closest ? el.closest('.menu-btn[data-menu]') : null;
    };
    scrim.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const b = under(e);
      const was = ctx && ctx.kind === 'bar' ? ctx.key : null;
      close();
      if (b && b.dataset.menu !== was) CM.openMenu(b.dataset.menu, b);
    });
    scrim.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !ctx || ctx.kind !== 'bar') return;
      const b = under(e);
      if (b && b.dataset.menu !== ctx.key) CM.openMenu(b.dataset.menu, b);
    });
    scrim.addEventListener('contextmenu', (e) => e.preventDefault());
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
    layer.addEventListener('click', (e) => {
      const b = e.target.closest('.cm-item');
      if (b) activate(b);
    });
    layer.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest('.cm-item');
      if (!b) return;
      const menu = b.closest('.cm-menu');
      const level = +menu.dataset.level;
      menu.querySelectorAll('.cm-item.cm-hot').forEach((x) => x !== b && !(CM.panels[level + 1] && CM.panels[level + 1].owner === x) && x.classList.remove('cm-hot'));
      if (!b.dataset.off) b.classList.add('cm-hot');
      clearTimeout(hoverT);
      hoverT = setTimeout(() => {
        if (!b.isConnected) return;
        if (b.classList.contains('cm-has-sub') && !b.dataset.off) openSub(b, false);
        else {
          if (CM.panels[level + 1]) CM.panels[level + 1].owner && CM.panels[level + 1].owner.classList.remove('cm-hot');
          closeFrom(level + 1);
        }
      }, 160);
    });
  };

  // opens a top menu under its menu-bar button
  CM.openMenu = (key, btn) => {
    btn = btn || menuBtn(key);
    if (!btn) return;
    begin('bar', btn);
    ctx.key = key;
    btn.classList.add('cm-open');
    const r = btn.getBoundingClientRect();
    showPanel(menuItems(key), 0, r.left, r.bottom);
  };
  // the compact "≡" button: every top menu as a submenu
  CM.openAll = (btn) => {
    begin('all', btn);
    const items = Object.keys(NAMES).map((k) => S(NAMES[k], () => menuItems(k)));
    const r = btn.getBoundingClientRect();
    showPanel(items, 0, r.left, r.bottom);
  };
  // any list of entries at a screen point (right-click menu)
  CM.openAt = (items, x, y, anchor) => {
    begin('ctx', anchor || null);
    showPanel(items, 0, x, y);
    return CM.panels[0];
  };
  CM.close = close;
  CM.isOpen = () => !!layer;

  /* ---------- keyboard ---------- */
  function onKey(e) {
    if (!layer) return;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (e.key !== 'Alt') close();
      return;
    }
    const k = e.key;
    const deep = CM.panels[CM.panels.length - 1];
    const act = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.cm-item') : null;
    const cur = act && layer.contains(act) ? act : null;
    const p = cur ? CM.panels[+cur.closest('.cm-menu').dataset.level] : deep;
    e.preventDefault();
    e.stopPropagation();
    if (!p) return;
    const rs = rows(p);
    const idx = cur ? rs.indexOf(cur) : -1;
    if (k === 'ArrowDown') focusRow(p, idx + 1, 1);
    else if (k === 'ArrowUp') focusRow(p, idx < 0 ? rs.length - 1 : idx - 1, -1);
    else if (k === 'Home') focusRow(p, 0, 1);
    else if (k === 'End') focusRow(p, rs.length - 1, -1);
    else if (k === 'ArrowRight') {
      if (cur && cur.classList.contains('cm-has-sub') && !cur.dataset.off) openSub(cur, true);
      else if (ctx && ctx.kind === 'bar') step(1);
    } else if (k === 'ArrowLeft') {
      const level = +p.el.dataset.level;
      if (level > 0) {
        const owner = p.owner;
        closeFrom(level);
        if (owner) {
          owner.classList.add('cm-hot');
          owner.focus();
        }
      } else if (ctx && ctx.kind === 'bar') step(-1);
    } else if (k === 'Enter' || k === ' ') {
      if (cur) {
        if (cur.classList.contains('cm-has-sub')) openSub(cur, true);
        else activate(cur);
      }
    } else if (k === 'Escape') {
      const level = +p.el.dataset.level;
      if (level > 0) {
        const owner = p.owner;
        closeFrom(level);
        if (owner) owner.focus();
      } else close();
    } else if (k === 'Tab') close();
    else if (k.length === 1) {
      // first letter jumps to the next item starting with it
      const ch = k.toLocaleLowerCase('tr');
      const n = rs.length;
      for (let j = 1; j <= n; j++) {
        const r = rs[(idx + j + n) % n];
        if (!r.dataset.off && r.textContent.trim().toLocaleLowerCase('tr').startsWith(ch)) {
          focusRow(p, (idx + j + n) % n, 1);
          break;
        }
      }
    }
  }
  const step = (d) => {
    const keys = barKeys();
    const i = keys.indexOf(ctx.key);
    const k = keys[(i + d + keys.length) % keys.length];
    CM.openMenu(k);
    if (CM.panels[0]) focusRow(CM.panels[0], 0, 1);
  };

  /* ---------- hook the menu bar ---------- */
  document.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest && e.target.closest('.menu-btn[data-menu], #btn-menu-all');
      if (!b) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (b.id === 'btn-menu-all') return CM.openAll(b);
      CM.openMenu(b.dataset.menu, b);
      // opened from the keyboard (Enter/Space on the button): put the focus in the menu
      if (e.detail === 0 && CM.panels[0]) focusRow(CM.panels[0], 0, 1);
    },
    true
  );
  // Alt alone opens the first menu (F10 is the Shape tool, as in the desktop suite)
  let altDown = false;
  document.addEventListener('keydown', (e) => {
    if (layer) return;
    altDown = e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey;
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' && altDown && !layer && !/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) {
      e.preventDefault();
      const k = barKeys()[0];
      if (k) {
        CM.openMenu(k);
        if (CM.panels[0]) focusRow(CM.panels[0], 0, 1);
      }
    }
    altDown = false;
  });
  document.addEventListener('pointerdown', () => (altDown = false), true);
})();
