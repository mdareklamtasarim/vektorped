/* VektörPad, CorelDRAW 2026 look and behaviour: tools part.
   Toolbox (left) with the same groups, order and flyouts as the desktop suite, Corel-style tooltips,
   and the property bar (second row) with the same controls per tool and selection.
   Only active with the classic skin; the other skin keeps the original toolbox and property bar. */
(function () {
  'use strict';
  const VP = window.VP;
  if (!VP || !VP.ui) return;
  const UI = VP.ui;
  const A = VP.actions || {};
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const classic = () => document.documentElement.dataset.skin === 'classic';
  const coarse = () => matchMedia('(pointer: coarse)').matches;
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('vp.ctools.' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('vp.ctools.' + k, JSON.stringify(v));
      } catch (e) {
        /* private mode */
      }
    }
  };

  /* ================= icons ================= */
  // Icons come from vp-icons.js. Glyphs it does not (yet) have fall back to these simple line drawings.
  const FB = {
    sizeW: '<path d="M3.5 12h17M7 8.5L3.5 12 7 15.5M17 8.5l3.5 3.5-3.5 3.5"/>',
    sizeH: '<path d="M12 3.5v17M8.5 7L12 3.5 15.5 7M8.5 17l3.5 3.5 3.5-3.5"/>',
    pageW: '<path d="M6 9h9l3 3v8.5H6z"/><path d="M4 4.5h16M6.5 2.5L4 4.5l2.5 2M17.5 2.5l2.5 2-2.5 2"/>',
    pageH: '<path d="M9 5h7l3 3v12H9z"/><path d="M4.5 4v16M2.5 6.5L4.5 4l2 2.5M2.5 17.5l2 2.5 2-2.5"/>',
    portrait: '<path d="M6.5 3.5h7.5l3.5 3.5v13.5h-11z"/><path d="M14 3.5V7h3.5"/>',
    landscape: '<path d="M3.5 6.5h13.5l3.5 3.5v7.5h-17z"/><path d="M17 6.5V10h3.5"/>',
    allPages: '<rect x="4" y="3.5" width="10" height="12" rx="1"/><rect x="10" y="8.5" width="10" height="12" rx="1"/>',
    curPage: '<rect x="6.5" y="3.5" width="11" height="17" rx="1"/><path d="M9.5 8h5M9.5 11h5"/>',
    pageLayout: '<path d="M4 4l16 16M20 4L4 20"/><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    nudge: '<path d="M12 3v18M3 12h18M9.5 5.5L12 3l2.5 2.5M9.5 18.5L12 21l2.5-2.5M5.5 9.5L3 12l2.5 2.5M18.5 9.5L21 12l-2.5 2.5"/>',
    dupX: '<rect x="3.5" y="7" width="10" height="10" rx="1"/><rect x="10.5" y="7" width="10" height="10" rx="1" stroke-dasharray="2 1.6"/>',
    dupY: '<rect x="7" y="3.5" width="10" height="10" rx="1"/><rect x="7" y="10.5" width="10" height="10" rx="1" stroke-dasharray="2 1.6"/>',
    pie: '<path d="M12 12V3.5A8.5 8.5 0 1 1 3.5 12z"/>',
    arc: '<path d="M12 3.5A8.5 8.5 0 1 1 3.5 12"/>',
    angleStart: '<path d="M12 12h8.5"/><path d="M20.5 12A8.5 8.5 0 1 0 12 20.5" stroke-dasharray="2.2 2"/><circle cx="20.5" cy="12" r="1.6" fill="currentColor"/>',
    angleEnd: '<path d="M12 12v8.5"/><path d="M20.5 12A8.5 8.5 0 1 0 12 20.5" stroke-dasharray="2.2 2"/><circle cx="12" cy="20.5" r="1.6" fill="currentColor"/>',
    arcDir: '<path d="M18.5 12a6.5 6.5 0 1 1-2-4.7"/><path d="M17 3.5v4h-4"/>',
    cornerRound: '<path d="M4.5 20V11.5a7 7 0 0 1 7-7H20"/>',
    cornerScallop: '<path d="M4.5 20v-8.5a7 7 0 0 0 7-7H20"/>',
    cornerChamfer: '<path d="M4.5 20v-8.5l7-7H20"/>',
    cornerTL: '<path d="M6 20V11a5 5 0 0 1 5-5h9"/>',
    cornerTR: '<path d="M18 20V11a5 5 0 0 0-5-5H4"/>',
    cornerBL: '<path d="M6 4v9a5 5 0 0 0 5 5h9"/>',
    cornerBR: '<path d="M18 4v9a5 5 0 0 1-5 5H4"/>',
    cornerRel: '<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M9 15l6-6M11 9h4v4"/>',
    points: '<path d="M12 3.6l8.2 6-3.1 9.7H6.9L3.8 9.6z"/><circle cx="12" cy="3.6" r="1.4" fill="currentColor"/>',
    sharp: '<path d="M12 3.4l2.4 6.2 6.1.4-4.8 3.9 1.6 6.1-5.3-3.5-5.3 3.5 1.6-6.1L3.5 10l6.1-.4z"/>',
    turns: '<path d="M12.2 12.1c.1-.9 1.2-1.2 1.8-.6.9.8.4 2.4-.8 2.8-1.7.6-3.4-.8-3.4-2.6 0-2.4 2.4-4.2 4.8-3.6 3 .7 4.4 4.1 3.2 6.8"/>',
    autoClose: '<path d="M5 17C5 9 9 5 16 5"/><path d="M16 5c3 3 3 9-2 12H5" stroke-dasharray="2.2 2"/>',
    frontMinusBack: '<rect x="3.5" y="3.5" width="11" height="11" rx="1"/><rect x="9.5" y="9.5" width="11" height="11" rx="1" fill="currentColor" fill-opacity=".35"/>',
    backMinusFront: '<rect x="3.5" y="3.5" width="11" height="11" rx="1" fill="currentColor" fill-opacity=".35"/><rect x="9.5" y="9.5" width="11" height="11" rx="1"/>',
    boundary: '<rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke-dasharray="2.4 2"/><circle cx="10" cy="10" r="3.5"/><rect x="11.5" y="11.5" width="6" height="6"/>',
    zoomAll: '<circle cx="10.5" cy="10.5" r="6.2"/><path d="M15.2 15.2l5 5"/><rect x="7.8" y="7.8" width="5.4" height="5.4"/>',
    zoomPage: '<path d="M5.5 3.5h9l4 4v13h-13z"/><circle cx="11" cy="13" r="3.2"/><path d="M13.3 15.3l2.7 2.7"/>',
    zoomPages: '<path d="M3.5 5.5h7v10h-7zM13.5 5.5h7v10h-7z"/><path d="M8 18.5h8"/>',
    zoomWidth: '<path d="M5.5 3.5h13v17h-13z"/><path d="M8 12h8M10 10l-2 2 2 2M14 10l2 2-2 2"/>',
    zoomHeight: '<path d="M5.5 3.5h13v17h-13z"/><path d="M12 7v10M10 9l2-2 2 2M10 15l2 2 2-2"/>',
    editText: '<path d="M4 6V4.5h11V6M9.5 4.5v12M7.5 16.5h4"/><path d="M14 19.5l1-3.5 5-5 2.5 2.5-5 5z"/>',
    underline: '<path d="M7 4.5v6a5 5 0 0 0 10 0v-6M5.5 20h13"/>',
    alignFull: '<path d="M3.5 5.5h17M3.5 9.5h17M3.5 13.5h17M3.5 17.5h17"/>',
    alignForce: '<path d="M3.5 5.5h17M3.5 9.5h17M3.5 13.5h17M3.5 17.5h17M3.5 3.5v16M20.5 3.5v16"/>',
    bullet: '<circle cx="6" cy="7" r="2" fill="currentColor"/><path d="M11 7h9"/><circle cx="6" cy="12" r="2" fill="currentColor"/><path d="M11 12h9"/><circle cx="6" cy="17" r="2" fill="currentColor"/><path d="M11 17h9"/>',
    dropCap: '<path d="M4 5h7v7H4z"/><path d="M14 6h6M14 10h6M4 15h16M4 18h16"/>',
    changeCase: '<path d="M4 18l5-12 5 12M6 14h6"/><path d="M16 11a3 3 0 1 1 0 6 3 3 0 0 1 0-6v7"/>',
    textDock: '<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    fitPath: '<path d="M4 17c4-8 12-8 16 0"/><path d="M8 8l2-4 2 4M9 7h2"/><path d="M13 8l1.5-3 1.5 3"/>',
    customize: '<path d="M12 5v14M5 12h14"/>'
  };
  // Names from corel-ref/icons-added.md, tried before the local name.
  const ALIAS = { sizeW: 'objWidth', sizeH: 'objHeight', pageW: 'pageWidth', pageH: 'pageHeight', curPage: 'currentPage', dupX: 'dupDistance', dupY: 'dupDistance', flipH: 'mirrorH', flipV: 'mirrorV', unlock: 'lockRatio', ellipseType: 'ellipseFull', outlinePen: 'nib', pageLayout: 'pageFrame', curves: 'curves' };
  const ic = (name, cls, ...alts) => {
    const V = window.VPIcon;
    for (const n of [ALIAS[name], name, ...alts]) if (n && V && V.has && V.has(n)) return V(n, cls);
    if (FB[name]) return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + FB[name] + '</svg>';
    return V ? V(alts[alts.length - 1] || name, cls) : '';
  };
  const chev = (d) => '<svg class="ct-chev" viewBox="0 0 10 10" aria-hidden="true"><path d="' + (d === 'up' ? 'M2 6.5l3-3 3 3' : 'M2 3.5l3 3 3-3') + '"/></svg>';

  /* ================= tool names, shortcuts and tooltips ================= */
  // [name, shortcut shown in the tooltip (only keys that work here), description]
  const TIP = {
    select: ['Seçim aracı', 'V', 'Nesneleri seçin, taşıyın ve boyutlandırın. Seçili bir nesneye yeniden tıklayarak döndürün ve eğin.'],
    lassoTool: ['Serbest biçimli seçim aracı', '', 'Serbest bir seçim çizgisi çizerek çevrelediğiniz nesneleri seçin.'],
    node: ['Şekil aracı', 'F10', 'Noktaları kullanarak eğriden oluşan bir nesneyi veya metin karakterlerini düzenle.'],
    smoothTool: ['Pürüzsüzleştirme aracı', '', 'Eğri nesnelerin kenarları boyunca sürükleyerek pürüzlü kenarları düzeltin ve düğüm sayısını azaltın.'],
    smearTool: ['Bulaştırma aracı', '', 'Bir nesnenin anahattı boyunca sürükleyerek şeklini dışarı uzatın veya içeri çekin.'],
    twirlTool: ['Girdap aracı', '', 'Nesnelerin üzerinde basılı tutarak girdap efektleri ekleyin.'],
    attractTool: ['Çekme aracı', '', 'Düğümleri imlecin altına doğru çekerek nesneleri şekillendirin.'],
    repelTool: ['İtme aracı', '', 'Düğümleri imleçten uzağa iterek nesneleri şekillendirin.'],
    roughenTool: ['Pürüzlendirme aracı', '', 'Nesnenin anahattı boyunca sürükleyerek kenarları pürüzlendirin.'],
    cropTool: ['Kırpma aracı', '', 'Nesnelerin istenmeyen alanlarını kaldırın.'],
    knifeTool: ['Bıçak aracı', '', 'Nesneleri ve metni kesip ayrı nesnelere bölün.'],
    virtualDel: ['Sanal segment silme aracı', '', 'Nesnelerin diğer nesnelerle kesişen bölümlerini silin.'],
    eraserTool: ['Silgi aracı', 'X', 'Çizimin istenmeyen alanlarını silin.'],
    zoom: ['Yakınlaştırma aracı', 'Z', 'Belge penceresinin büyütme düzeyini değiştirin.'],
    hand: ['Kaydırma aracı', 'H', 'Belge penceresinde çizimin hangi bölümünün görüneceğini denetleyin.'],
    pageTool: ['Sayfa aracı', '', 'Sayfaların boyutunu ve yerleşimini çizim penceresinde düzenleyin.'],
    freehand: ['Serbest el aracı', 'F5', 'Tek segmentli çizgiler ve eğriler çizin.'],
    line: ['2 noktalı çizgi aracı', 'L', 'İki noktalı düz bir çizgi segmenti çizin.'],
    pen: ['Bézier aracı', 'P', 'Eğrileri her seferinde bir segment olacak biçimde çizin.'],
    bsplineTool: ['B-spline aracı', '', 'Denetim noktalarını belirleyerek düzgün eğriler çizin.'],
    polylineTool: ['Çoklu çizgi aracı', '', 'Tek bir eylemde birbirine bağlı çizgiler ve eğriler çizin.'],
    curve3Tool: ['3 noktalı eğri aracı', '', 'Başlangıç, bitiş ve merkez noktalarını belirleyerek bir eğri çizin.'],
    brush: ['Sanatsal medya aracı', 'I', 'Fırça, püskürtücü, kaligrafi ve basınç efektleri ekleyin.'],
    liveSketch: ['LiveSketch aracı', '', 'Serbest el darbeleriyle eskiz çizin; darbeler ayarlanarak eğrilere dönüştürülür.'],
    smartDraw: ['Akıllı çizim aracı', '', 'Serbest el darbelerini temel şekillere ve düzgün eğrilere dönüştürün.'],
    sketchTool: ['Karalama aracı', '', 'Elle çizilmiş görünümlü, birden çok çizgiden oluşan darbeler çizin.'],
    rect: ['Dörtgen aracı', 'F6', 'Çizim sayfasında tuşa basıp imleci sürükleyerek kare ve dörtgen çizin.'],
    rect3Tool: ['3 noktalı dörtgen aracı', '', 'Taban çizgisini çizip yüksekliğini belirleyerek açılı dörtgenler çizin.'],
    ellipse: ['Elips aracı', 'F7', 'Çizim sayfasında tuşa basıp imleci sürükleyerek daire ve elips çizin.'],
    ellipse3Tool: ['3 noktalı elips aracı', '', 'Merkez çizgisini çizip yüksekliğini belirleyerek açılı elipsler çizin.'],
    polygon: ['Çokgen aracı', 'Y', 'Çizim sayfasında tuşa basıp imleci sürükleyerek çokgen çizin.'],
    star: ['Yıldız aracı', 'S', 'Mükemmel biçimli yıldızlar çizin.'],
    spiral: ['Spiral aracı', '', 'Simetrik ve logaritmik spiraller çizin.'],
    perfectTool: ['Ortak şekiller aracı', '', 'Temel şekiller, oklar, akış şeması şekilleri, şeritler ve belirtme çizgileri çizin.'],
    cstarTool: ['Karmaşık yıldız aracı', '', 'Kenarları kesişen karmaşık yıldızlar çizin.'],
    graphTool: ['Grafik kağıdı aracı', '', 'Satır ve sütunlardan oluşan bir ızgara çizin.'],
    text: ['Metin aracı', 'F8', 'Sözcükleri doğrudan ekrana sanatsal metin veya paragraf metni olarak yazın.'],
    tableTool: ['Tablo aracı', '', 'Tablo çizin, seçin ve düzenleyin.'],
    textPathTool: ['Yola metin aracı', '', 'Metni bir eğrinin veya şeklin yolu boyunca yerleştirin.'],
    dimParallel: ['Paralel boyut aracı', '', 'Eğik boyut çizgileri çizin.'],
    dimHV: ['Yatay veya dikey boyut aracı', '', 'Yatay veya dikey boyut çizgileri çizin.'],
    dimAngular: ['Açısal boyut aracı', '', 'Açısal boyut çizgileri çizin.'],
    dimSegment: ['Segment boyutu aracı', '', 'Bir segmentin uç noktaları arasındaki uzaklığı gösterin.'],
    dimCallout: ['3 noktalı belirtme çizgisi aracı', '', 'İki segmentli bir belirtme çizgisi çizin.'],
    commentTool: ['Yorum aracı', '', 'Belgeye notlar ve yorumlar ekleyin.'],
    connStraight: ['Düz çizgi bağlayıcı aracı', '', 'İki nesneyi düz bir bağlayıcı çizgiyle birleştirin.'],
    connRight: ['Dik açılı bağlayıcı aracı', '', 'İki nesneyi dik açılı bir bağlayıcıyla birleştirin.'],
    connRound: ['Yuvarlak dik açılı bağlayıcı aracı', '', 'İki nesneyi köşeleri yuvarlatılmış dik açılı bir bağlayıcıyla birleştirin.'],
    shadowTool: ['Gölge aracı', '', 'Nesnelerin arkasına veya altına gölge uygulayın.'],
    contourTool: ['Kontur aracı', '', 'Bir nesnenin anahattının içine veya dışına bir dizi eş merkezli çizgi uygulayın.'],
    blendTool: ['Harmanlama aracı', '', 'İki nesneyi harmanlayın.'],
    distortTool: ['Deformasyon aracı', '', 'Bir nesneye itme-çekme, fermuar veya girdap deformasyonu uygulayın.'],
    envelopeTool: ['Zarf aracı', '', 'Zarfın düğümlerini sürükleyerek bir nesneyi şekillendirin.'],
    extrudeTool: ['Derinlik aracı', '', 'Nesnelere derinlik yanılsaması uygulayın.'],
    blockShadowTool: ['Blok gölge aracı', '', 'Nesnelere ve metne düz, katı gölgeler ekleyin.'],
    innerShadowTool: ['İç gölge aracı', '', 'Nesnenin içine düşen bir gölge uygulayın.'],
    perspectiveTool: ['Perspektif aracı', '', 'Bir nesneye perspektif uygulayın.'],
    lensTool: ['Mercek aracı', '', 'Altındaki nesnelerin görünümünü değiştiren bir mercek uygulayın.'],
    powerclipTool: ['PowerClip aracı', '', 'Nesneleri başka bir nesnenin içine yerleştirin.'],
    transpTool: ['Şeffaflık aracı', '', 'Nesnelerin altındaki görüntü alanlarını kısmen gösterin.'],
    eyedropper: ['Renk damlalığı aracı', 'D', 'Renk örnekleyin ve nesnelere uygulayın.'],
    attrEyedropper: ['Nitelik damlalığı aracı', '', 'Dolgu, anahat ve metin gibi nesne özelliklerini kopyalayıp diğer nesnelere uygulayın.'],
    fillTool: ['Etkileşimli dolgu aracı', 'G', 'Bir nesneye geçerli dolguyu dinamik olarak uygulayın.'],
    smartFill: ['Akıllı dolgu aracı', '', 'Kapalı alanlardan nesne oluşturup bu nesnelere dolgu uygulayın.'],
    meshTool: ['Ağ dolgu aracı', 'M', 'Bir nesneye çok renkli bir ağ dolgusu uygulayın.'],
    varOutline: ['Değişken anahat aracı', '', 'Anahattın genişliğini düğümler boyunca değiştirerek değişken genişlikli anahatlar oluşturun.']
  };
  const meta = (id) => {
    const m = VP.TOOL_META[id] || {};
    const t = TIP[id];
    const key = t ? t[1] : m.key || '';
    return { id, name: t ? t[0] : m.label || id, key, desc: t ? t[2] : m.hint || '', icon: m.icon || id };
  };
  // Shortcuts of the desktop suite that the app's own key handler does not know.
  const FKEYS = { F5: 'freehand', F6: 'rect', F7: 'ellipse', F8: 'text', F10: 'node' };
  document.addEventListener(
    'keydown',
    (e) => {
      const id = FKEYS[e.key];
      if (!id || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !VP.tools || !VP.tools[id]) return;
      const t = e.target;
      if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector('.modal-wrap')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      VP.setTool(id);
    },
    true
  );

  /* ================= toolbox ================= */
  // Groups, order and flyouts as in the desktop suite's toolbox (DrawUI.xml): Pick | Edit shape |
  // Crop, Zoom | Curve, Artistic media, Rectangle, Ellipse, Object | Text | Dimension, Connector |
  // Effects, Transparency | Eyedropper, Fill | Variable outline | customise. Tools only this app has
  // follow a separator at the end of the flyout they belong to.
  const GROUPS = [
    { id: 'pick', tools: ['select', 'lassoTool'] },
    { id: 'shape', tools: ['node', '|', 'smoothTool', 'smearTool', 'twirlTool', 'attractTool', 'repelTool', 'roughenTool'] },
    '|',
    { id: 'crop', tools: ['cropTool', 'knifeTool', 'virtualDel', '|', 'eraserTool'] },
    { id: 'zoom', tools: ['zoom', 'hand', '|', 'pageTool'] },
    '|',
    { id: 'curve', tools: ['freehand', 'line', 'pen', 'bsplineTool', 'polylineTool', 'curve3Tool'] },
    { id: 'artistic', tools: ['brush', 'liveSketch', 'smartDraw', '|', 'sketchTool'] },
    { id: 'rect', tools: ['rect', 'rect3Tool'] },
    { id: 'ellipse', tools: ['ellipse', 'ellipse3Tool'] },
    { id: 'object', tools: ['polygon', 'star', 'spiral', 'perfectTool', '|', 'cstarTool', 'graphTool'] },
    '|',
    { id: 'text', tools: ['text', 'tableTool', '|', 'textPathTool'] },
    '|',
    { id: 'dim', tools: ['dimParallel', 'dimHV', 'dimAngular', 'dimSegment', '|', 'dimCallout', '|', 'commentTool'] },
    { id: 'conn', tools: ['connStraight', 'connRight', 'connRound'] },
    '|',
    { id: 'effects', tools: ['shadowTool', 'contourTool', 'blendTool', 'distortTool', 'envelopeTool', 'extrudeTool', 'blockShadowTool', '|', 'innerShadowTool', 'perspectiveTool', 'lensTool', 'powerclipTool'] },
    { id: 'transp', tools: ['transpTool'] },
    '|',
    { id: 'eyedrop', tools: ['eyedropper', 'attrEyedropper'] },
    { id: 'fill', tools: ['fillTool', 'smartFill', '|', 'meshTool'] },
    '|',
    { id: 'varout', tools: ['varOutline'] },
    '|',
    'custom'
  ];
  const GROUP_NAMES = { pick: 'Seçim araçları', shape: 'Şekil düzenleme araçları', crop: 'Kırpma araçları', zoom: 'Yakınlaştırma araçları', curve: 'Eğri araçları', artistic: 'Sanatsal medya araçları', rect: 'Dörtgen araçları', ellipse: 'Elips araçları', object: 'Nesne araçları', text: 'Metin ve tablo araçları', dim: 'Boyut araçları', conn: 'Bağlayıcı araçları', effects: 'Etkileşimli efekt araçları', transp: 'Şeffaflık aracı', eyedrop: 'Damlalık araçları', fill: 'Dolgu araçları', varout: 'Değişken anahat aracı' };
  UI.CT_GROUPS = GROUPS;
  // Flyout contents: tools the app has, with separators tidied.
  const toolsOf = (g) => {
    const out = [];
    g.tools.forEach((id) => {
      if (id === '|') {
        if (out.length && out[out.length - 1] !== '|') out.push('|');
      } else if (VP.tools && VP.tools[id] && VP.TOOL_META[id]) out.push(id);
    });
    while (out[out.length - 1] === '|') out.pop();
    return out;
  };
  const realTools = (g) => toolsOf(g).filter((id) => id !== '|');
  const cur = store.get('cur', {});
  let hiddenGroups = store.get('hidden', []);

  const tip = { el: null, timer: 0, hideT: 0 };
  const tipEl = () => {
    if (!tip.el) {
      tip.el = document.createElement('div');
      tip.el.className = 'ct-tip';
      tip.el.setAttribute('role', 'tooltip');
      tip.el.hidden = true;
      document.body.append(tip.el);
    }
    return tip.el;
  };
  const hideTip = () => {
    clearTimeout(tip.timer);
    clearTimeout(tip.hideT);
    if (tip.el) tip.el.hidden = true;
  };
  const showTip = (b, html) => {
    const el = tipEl();
    el.innerHTML = html;
    el.hidden = false;
    const r = b.getBoundingClientRect();
    const horiz = innerWidth <= 640;
    let left = horiz ? r.left : r.right + 4;
    let top = horiz ? r.bottom + 6 : r.top + r.height * 0.55;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (left + w > innerWidth - 6) left = Math.max(6, innerWidth - w - 6);
    if (top + h > innerHeight - 6) top = Math.max(6, r.top - h - 4);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  };
  const toolTipHTML = (id) => {
    const m = meta(id);
    return '<b>' + esc(m.name) + (m.key ? ' (' + esc(m.key) + ')' : '') + '</b>' + (m.desc ? '<span>' + esc(m.desc) + '</span>' : '');
  };

  const visibleTool = (g) => {
    const list = realTools(g);
    if (list.includes(VP.toolId)) return VP.toolId;
    return list.includes(cur[g.id]) ? cur[g.id] : list[0];
  };
  const rt0 = UI.renderToolbox;
  UI.renderToolbox = () => {
    const tb = $('#toolbox');
    if (!tb) return;
    if (!classic()) {
      tb.classList.remove('ct-tb');
      return rt0();
    }
    hideTip();
    tb.classList.add('ct-tb');
    let h = '';
    let lastSep = true;
    GROUPS.forEach((g, gi) => {
      if (g === '|') {
        if (!lastSep) h += '<div class="ct-sep" role="separator"></div>';
        lastSep = true;
        return;
      }
      if (g === 'custom') {
        h += '<button class="ct-tool ct-custom" data-ctcustom="1" aria-label="Hızlı özelleştir: araç kutusunda gösterilecek araçlar">' + ic('customize', '', 'plus') + '</button>';
        return;
      }
      const list = realTools(g);
      if (!list.length) return;
      const on = list.includes(VP.toolId);
      if (!on && hiddenGroups.includes(g.id)) return;
      const id = visibleTool(g);
      const m = meta(id);
      const fly = list.length > 1;
      h += '<button class="ct-tool' + (on ? ' on' : '') + '" data-ctg="' + gi + '" data-tool="' + id + '" aria-label="' + esc(m.name + (m.key ? ' (' + m.key + ')' : '')) + '" aria-pressed="' + on + '"' + (fly ? ' aria-haspopup="menu"' : '') + '>' + ic(m.icon) + (fly ? '<span class="ct-mark" aria-hidden="true"></span>' : '') + '</button>';
      lastSep = false;
    });
    tb.innerHTML = h;
    bindToolbox();
    UI.fitToolbox();
  };
  const fit0 = UI.fitToolbox;
  UI.fitToolbox = () => {
    const tb = $('#toolbox');
    if (!tb || !tb.classList.contains('ct-tb')) return fit0 && fit0();
    if (tb.hidden) return;
    const was = tb.className;
    // one column as in the desktop suite; when it does not fit: tighter rows, then tighter still (then it scrolls)
    tb.classList.remove('two-col', 'ct-tight', 'ct-tighter');
    if (innerWidth > 640) {
      if (tb.scrollHeight > tb.clientHeight + 1) tb.classList.add('ct-tight');
      if (tb.scrollHeight > tb.clientHeight + 1) tb.classList.add('ct-tighter');
    }
    if (was !== tb.className) setTimeout(() => UI.onResize && UI.onResize(), 0);
  };

  const pickTool = (g, id) => {
    cur[g.id] = id;
    store.set('cur', cur);
    VP.setTool(id);
    UI.schedule('tools', 'prop', 'status');
  };
  const openFlyout = (b) => {
    const g = GROUPS[+b.dataset.ctg];
    if (!g || !g.tools) return;
    hideTip();
    const html = toolsOf(g)
      .map((id) => {
        if (id === '|') return '<div class="pop-sep"></div>';
        const m = meta(id);
        const on = id === VP.toolId;
        return '<button class="pop-item ct-fi' + (on ? ' on' : '') + '" role="menuitemradio" aria-checked="' + on + '" data-pick="' + id + '">' + ic(m.icon, 'sm') + '<span class="ct-fi-l">' + esc(m.name) + '</span><span class="kbd">' + esc(m.key) + '</span></button>';
      })
      .join('');
    UI.popover(b, html, (id) => pickTool(g, id), innerWidth > 640 ? 'right' : undefined);
    if (UI._pop) {
      UI._pop.classList.add('ct-fly');
      UI._pop.setAttribute('aria-label', GROUP_NAMES[g.id] || '');
      // the flyout opens right beside the toolbox, aligned with the button
      if (innerWidth > 640) {
        const r = b.getBoundingClientRect();
        const tbr = $('#toolbox').getBoundingClientRect();
        const ph = UI._pop.offsetHeight;
        UI._pop.style.left = Math.round(tbr.right + 1) + 'px';
        UI._pop.style.top = Math.round(Math.max(4, Math.min(r.top, innerHeight - ph - 6))) + 'px';
      }
    }
  };
  const openCustomize = (b) => {
    const html =
      '<div class="pop-head">Hızlı özelleştir</div>' +
      GROUPS.filter((g) => g && g.tools && realTools(g).length)
        .map((g) => {
          const m = meta(visibleTool(g));
          const on = !hiddenGroups.includes(g.id);
          return '<button class="pop-item ct-fi" role="menuitemcheckbox" aria-checked="' + on + '" data-pick="' + g.id + '"><span class="ct-check">' + (on ? '✓' : '') + '</span>' + ic(m.icon, 'sm') + '<span class="ct-fi-l">' + esc(GROUP_NAMES[g.id] || m.name) + '</span></button>';
        })
        .join('') +
      '<div class="pop-sep"></div><button class="pop-item ct-fi" data-pick="__reset"><span class="ct-check"></span><span class="ct-fi-l">Varsayılana sıfırla</span></button>';
    UI.popover(b, html, (gid) => {
      if (gid === '__reset') {
        hiddenGroups = [];
        Object.keys(cur).forEach((k) => delete cur[k]);
        store.set('cur', cur);
      } else hiddenGroups = hiddenGroups.includes(gid) ? hiddenGroups.filter((x) => x !== gid) : hiddenGroups.concat(gid);
      store.set('hidden', hiddenGroups);
      UI.renderToolbox();
      const nb = $('#toolbox [data-ctcustom]');
      if (nb && gid !== '__reset') openCustomize(nb);
    }, innerWidth > 640 ? 'right' : undefined);
    if (UI._pop) UI._pop.classList.add('ct-fly');
  };

  let bound = false;
  const bindToolbox = () => {
    if (bound) return;
    const tb = $('#toolbox');
    if (!tb) return;
    bound = true;
    let press = null;
    let fired = false;
    const inMark = (b, e) => {
      const r = b.getBoundingClientRect();
      return e.clientX - r.left > r.width * 0.6 && e.clientY - r.top > r.height * 0.6;
    };
    tb.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.ct-tool');
      clearTimeout(press && press.timer);
      press = null;
      fired = false;
      hideTip();
      if (!b || e.button > 0) return;
      const mouse = e.pointerType === 'mouse';
      press = { b, x: e.clientX, y: e.clientY, mouse, timer: 0 };
      if (b.dataset.ctcustom) return;
      const g = GROUPS[+b.dataset.ctg];
      const fly = g && realTools(g).length > 1;
      if (fly && inMark(b, e)) {
        // a tap or click on the small triangle opens the flyout straight away
        fired = true;
        e.preventDefault();
        openFlyout(b);
        return;
      }
      press.timer = setTimeout(() => {
        fired = true;
        if (fly) openFlyout(b);
        else if (!mouse) {
          showTip(b, toolTipHTML(b.dataset.tool));
          tip.hideT = setTimeout(hideTip, 2600);
        }
      }, mouse ? 380 : 480);
    });
    tb.addEventListener('pointermove', (e) => {
      if (press && press.timer && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) {
        clearTimeout(press.timer);
        press.timer = 0;
      }
    });
    const end = () => {
      if (press) clearTimeout(press.timer);
    };
    tb.addEventListener('pointerup', end);
    tb.addEventListener('pointercancel', end);
    tb.addEventListener('click', (e) => {
      const b = e.target.closest('.ct-tool');
      if (!b) return;
      if (fired) {
        fired = false;
        return;
      }
      if (b.dataset.ctcustom) return openCustomize(b);
      const g = GROUPS[+b.dataset.ctg];
      if (!g) return;
      const touch = press && !press.mouse;
      // on touch, tapping the active tool of a group opens its flyout (no mouse hold needed)
      if (touch && realTools(g).length > 1 && b.dataset.tool === VP.toolId) return openFlyout(b);
      pickTool(g, b.dataset.tool);
    });
    tb.addEventListener('keydown', (e) => {
      const b = e.target.closest && e.target.closest('.ct-tool[data-ctg]');
      if (!b) return;
      if (e.key === 'ArrowRight' || (e.key === 'ArrowDown' && e.altKey) || e.key === 'ContextMenu') {
        e.preventDefault();
        openFlyout(b);
      }
    });
    // Corel-style tooltip on mouse hover
    tb.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest('.ct-tool');
      if (!b || (UI._pop && UI._pop.classList.contains('ct-fly'))) return;
      clearTimeout(tip.timer);
      tip.timer = setTimeout(() => {
        if (!b.isConnected || (UI._pop && UI._pop.classList.contains('ct-fly'))) return;
        showTip(b, b.dataset.ctcustom ? '<b>Hızlı özelleştir</b><span>Araç kutusunda gösterilecek araçları seçin.</span>' : toolTipHTML(b.dataset.tool));
      }, 550);
    });
    tb.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest('.ct-tool');
      if (b && !b.contains(e.relatedTarget)) hideTip();
    });
    tb.addEventListener('scroll', hideTip, { passive: true });
  };

  /* ================= parametric shapes: pie/arc and per-corner radii ================= */
  const bpp = VP.buildParamPath;
  const P1 = (deg) => new paper.Point(Math.cos((deg * Math.PI) / 180), -Math.sin((deg * Math.PI) / 180));
  const ellipsePart = (p) => {
    let a0 = +p.a0 || 0;
    let a1 = p.a1 == null ? 270 : +p.a1;
    if (p.cw) [a0, a1] = [a1, a0];
    const sweep = (((a1 - a0) % 360) + 360) % 360;
    if (sweep < 0.05 || sweep > 359.95) return null;
    const path = new paper.Path.Arc({ from: P1(a0), through: P1(a0 + sweep / 2), to: P1(a0 + sweep), insert: false });
    if (p.etype === 'pie') {
      path.add(new paper.Point(0, 0));
      path.closed = true;
    }
    path.scale(Math.max(Math.abs(p.w), 0.01) / 2, Math.max(Math.abs(p.h), 0.01) / 2, new paper.Point(0, 0));
    return path;
  };
  const K = 0.5522847498;
  const rectCorners = (p) => {
    const w = Math.max(Math.abs(p.w), 0.01);
    const h = Math.max(Math.abs(p.h), 0.01);
    const lim = Math.min(w, h) / 2;
    const rr = (p.radii || [p.r, p.r, p.r, p.r]).map((v) => Math.max(0, Math.min(+v || 0, lim)));
    const type = p.ctype || 'round';
    const C = [new paper.Point(-w / 2, -h / 2), new paper.Point(w / 2, -h / 2), new paper.Point(w / 2, h / 2), new paper.Point(-w / 2, h / 2)];
    const path = new paper.Path({ insert: false });
    for (let i = 0; i < 4; i++) {
      const c = C[i];
      const r = rr[i];
      if (r <= 1e-6) {
        path.add(c);
        continue;
      }
      const a = c.add(C[(i + 3) % 4].subtract(c).normalize(r));
      const b = c.add(C[(i + 1) % 4].subtract(c).normalize(r));
      if (type === 'chamfer') {
        path.add(a);
        path.add(b);
      } else {
        const ctrl = type === 'scallop' ? a.add(b).subtract(c) : c;
        path.add(new paper.Segment(a, null, ctrl.subtract(a).multiply(K)));
        path.add(new paper.Segment(b, ctrl.subtract(b).multiply(K), null));
      }
    }
    path.closed = true;
    return path;
  };
  if (bpp) {
    VP.buildParamPath = (p) => {
      let local = null;
      if (p && p.kind === 'ellipse' && p.etype && p.etype !== 'ellipse') local = ellipsePart(p);
      if (p && p.kind === 'rect') {
        if (p.radii && p._rr !== p.r) {
          // the uniform radius was changed elsewhere (e.g. by dragging a corner with the shape tool)
          delete p.radii;
          delete p._rr;
        }
        if (p.radii || (p.ctype && p.ctype !== 'round' && p.r)) local = rectCorners(p);
      }
      if (!local) return bpp(p);
      if (p.angle) local.rotate(p.angle, new paper.Point(0, 0));
      local.translate(new paper.Point(p.cx, p.cy));
      return local;
    };
  }
  // New ellipses and rectangles take the property bar settings of their tool.
  const cp0 = VP.createParam;
  if (cp0) {
    VP.createParam = (param) => {
      const d = VP.defaults;
      if (param && param.kind === 'ellipse' && (VP.toolId === 'ellipse' || VP.toolId === 'ellipse3Tool') && d.ctEType && d.ctEType !== 'ellipse') {
        Object.assign(param, { etype: d.ctEType, a0: d.ctA0 == null ? 0 : d.ctA0, a1: d.ctA1 == null ? 270 : d.ctA1, cw: !!d.ctCW });
      }
      if (param && param.kind === 'rect' && (VP.toolId === 'rect' || VP.toolId === 'rect3Tool')) {
        if (d.ctCType && d.ctCType !== 'round') param.ctype = d.ctCType;
        if (Array.isArray(d.ctRadii) && !d.ctRadii.every((v) => v === d.ctRadii[0])) {
          param.radii = d.ctRadii.map((v) => VP.toPT(v));
          param._rr = param.r;
        }
      }
      const it = cp0(param);
      if (param && param.etype === 'arc' && it) it.fillColor = null;
      return it;
    };
  }

  /* ================= duplicate distance, all pages ================= */
  const S = () => VP.settings;
  const dupX = () => (S().ctDupX == null ? 5 : S().ctDupX);
  const dupY = () => (S().ctDupY == null ? 5 : S().ctDupY);
  if (VP.duplicate && VP.zSort && VP.cloneItem) {
    VP.duplicate = () => {
      if (!VP.sel.length) return;
      const off = new paper.Point(VP.toPT(dupX()), VP.toPT(dupY()));
      const copies = VP.zSort(VP.sel).map((it) => {
        const c = VP.cloneItem(it);
        c.insertAbove(it);
        return c;
      });
      VP.T.move(copies, off);
      VP.setSelection(copies);
      VP.commit();
    };
  }
  let allPagesOnce = false;
  const allPages = () => store.get('allPages', true);
  const sps = VP.setPageSize;
  VP.setPageSize = (wmm, hmm) => {
    if (allPagesOnce && wmm > 1 && hmm > 1 && VP.doc && VP.doc.pages) {
      VP.doc.pages.forEach((pg) => {
        pg.w = VP.toPT(wmm);
        pg.h = VP.toPT(hmm);
      });
    }
    return sps(wmm, hmm);
  };

  /* ================= property bar ================= */
  // Numbers as the desktop suite shows them: fixed decimals for positions, sizes and angles (117,331 mm, 0,0°),
  // at least one decimal elsewhere (210,0 mm, 0,1 mm).
  const num = (v, d = 3) => (isFinite(v) ? (+v).toFixed(d).replace('.', ',') : '');
  const numMin = (v) => {
    const s = VP.num(+v, 3);
    return s === '' || s.includes(',') ? s : s + ',0';
  };
  const mmv = (pt, d = 3) => num(VP.toMM(pt), d);
  const SEP = '<span class="ct-sep" role="separator"></span>';
  // number box: [icon or label][value][unit][spin arrows]
  const nbox = (o) =>
    '<span class="ct-num' + (o.dis ? ' dis' : '') + (o.cls ? ' ' + o.cls : '') + '" title="' + esc(o.title || '') + '"' + (o.w ? ' style="--w:' + o.w + 'px"' : '') + '>' +
    (o.icon ? '<span class="ct-nic">' + o.icon + '</span>' : '') +
    (o.label ? '<span class="ct-nlab">' + esc(o.label) + '</span>' : '') +
    '<span class="ct-nbox"><input data-pf="' + o.pf + '" value="' + esc(o.value) + '" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="' + esc(o.title || o.label || '') + '"' + (o.dis ? ' disabled' : '') + '>' +
    (o.unit ? '<span class="ct-unit">' + esc(o.unit) + '</span>' : '') + '</span>' +
    (o.spin ? spin(o.pf, o.step || 1, o.dis, o.spin === 'v') : '') +
    '</span>';
  const spin = (pf, step, dis, vertical) =>
    '<span class="ct-spin' + (vertical ? ' v' : '') + '">' +
    (vertical ? '<button tabindex="-1" data-act="ctSpin:' + pf + ':' + step + '" aria-label="Artır"' + (dis ? ' disabled' : '') + '>' + chev('up') + '</button>' : '') +
    '<button tabindex="-1" data-act="ctSpin:' + pf + ':' + -step + '" aria-label="Azalt"' + (dis ? ' disabled' : '') + '>' + chev('down') + '</button>' +
    (vertical ? '' : '<button tabindex="-1" data-act="ctSpin:' + pf + ':' + step + '" aria-label="Artır"' + (dis ? ' disabled' : '') + '>' + chev('up') + '</button>') +
    '</span>';
  const stack = (a, b, cls) => '<span class="ct-stack' + (cls ? ' ' + cls : '') + '">' + a + b + '</span>';
  // icon button; on = pressed toggle; dis = disabled
  const ib = (act, icon, title, on, dis) =>
    '<button class="ct-ib' + (on ? ' on' : '') + '" data-act="' + act + '" title="' + esc(title) + '" aria-label="' + esc(title) + '"' + (on != null ? ' aria-pressed="' + !!on + '"' : '') + (dis ? ' disabled' : '') + '>' + icon + '</button>';
  const abtn = (id, icon, title) => {
    const a = A[id];
    if (!a) return '';
    const dis = a.enabled ? !a.enabled() : false;
    return ib(id, icon, title || a.label || id, null, dis);
  };
  const combo = (act, inner, title, w, dis) =>
    '<button class="ct-combo" data-act="' + act + '" title="' + esc(title) + '" aria-label="' + esc(title) + '" aria-haspopup="menu"' + (w ? ' style="--w:' + w + 'px"' : '') + (dis ? ' disabled' : '') + '><span class="ct-cv">' + inner + '</span>' + chev('down') + '</button>';
  const select = (pf, opts, curVal, title, w) =>
    '<span class="ct-sel"' + (w ? ' style="--w:' + w + 'px"' : '') + '><select data-pf="' + pf + '" aria-label="' + esc(title) + '" title="' + esc(title) + '">' +
    opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(curVal) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') +
    '</select>' + chev('down') + '</span>';
  const plusBtn = () => '<button class="ct-ib ct-plus" data-act="ctPbCustom" title="Hızlı özelleştir" aria-label="Hızlı özelleştir">' + ic('customize', '', 'plus') + '</button>';

  // Reference point of the X/Y fields (the desktop suite's "object origin"); centre by default.
  const ANCH = { tl: [0, 0], tc: [0.5, 0], tr: [1, 0], ml: [0, 0.5], c: [0.5, 0.5], mr: [1, 0.5], bl: [0, 1], bc: [0.5, 1], br: [1, 1] };
  const ANCH_N = { tl: 'Sol üst', tc: 'Üst orta', tr: 'Sağ üst', ml: 'Sol orta', c: 'Merkez', mr: 'Sağ orta', bl: 'Sol alt', bc: 'Alt orta', br: 'Sağ alt' };
  let anchor = store.get('anchor', 'c');
  if (!ANCH[anchor]) anchor = 'c';
  const anchorPt = (b) => new paper.Point(b.left + ANCH[anchor][0] * b.width, b.top + ANCH[anchor][1] * b.height);
  const anchorGrid = (dis) =>
    '<span class="ct-anchor' + (dis ? ' dis' : '') + '" role="radiogroup" aria-label="Nesne başlangıç noktası" title="Nesne başlangıç noktası: ' + ANCH_N[anchor] + '">' +
    Object.keys(ANCH).map((k) => '<button data-act="ctAnchor:' + k + '" role="radio" aria-checked="' + (k === anchor) + '" aria-label="' + ANCH_N[k] + '" class="' + (k === anchor ? 'on' : '') + '"' + (dis ? ' disabled' : '') + '></button>').join('') +
    '</span>';

  const geomBlock = (b, dis) => {
    const ap = b ? anchorPt(b) : null;
    const v = (x) => (b ? mmv(x) : '');
    const keep = !!VP.settings.keepRatio;
    return anchorGrid(dis) +
      stack(nbox({ pf: 'ctX', label: 'X:', value: v(ap && ap.x), unit: 'mm', title: 'Nesne konumu X', w: 74, dis }), nbox({ pf: 'ctY', label: 'Y:', value: v(ap && ap.y), unit: 'mm', title: 'Nesne konumu Y', w: 74, dis })) + SEP +
      stack(nbox({ pf: 'ctW', icon: ic('sizeW', 'sm'), value: v(b && b.width), unit: 'mm', title: 'Nesne boyutu: genişlik', w: 74, dis }), nbox({ pf: 'ctH', icon: ic('sizeH', 'sm'), value: v(b && b.height), unit: 'mm', title: 'Nesne boyutu: yükseklik', w: 74, dis })) +
      stack(nbox({ pf: 'ctSX', value: b ? '100,0' : '', unit: '%', title: 'Ölçek faktörü: yatay', w: 42, dis }), nbox({ pf: 'ctSY', value: b ? '100,0' : '', unit: '%', title: 'Ölçek faktörü: dikey', w: 42, dis })) +
      ib('ratio', ic(keep ? 'lock' : 'unlock', 'sm'), keep ? 'Oranı kilitle (açık)' : 'Oranı kilitle', keep, dis) + SEP;
  };
  const rotBlock = (one, dis) =>
    nbox({ pf: 'angle', icon: ic('rotate', 'sm'), value: dis ? '' : num(one ? VP.itemAngle(one) : 0, 1), unit: '°', title: 'Dönme açısı', w: 44, dis }) + SEP +
    ib('flipH', ic('flipH', 'sm'), 'Yatay aynala', null, dis) + ib('flipV', ic('flipV', 'sm'), 'Dikey aynala', null, dis) + SEP;

  // Outline width and line style, as in the desktop suite's property bar.
  const OW = [['none', 'Yok'], ['0.076', 'Saç çizgisi'], ['0.1', '0,1 mm'], ['0.2', '0,2 mm'], ['0.25', '0,25 mm'], ['0.5', '0,5 mm'], ['0.75', '0,75 mm'], ['1', '1,0 mm'], ['1.5', '1,5 mm'], ['2', '2,0 mm'], ['2.5', '2,5 mm'], ['3', '3,0 mm'], ['5', '5,0 mm'], ['8', '8,0 mm']];
  const strokeInfo = (items) => {
    if (items && items.length && VP.getStroke) {
      try {
        const st = VP.getStroke(items[0]);
        return { on: st.on, width: st.width, dash: st.dash || 'solid' };
      } catch (e) {
        /* fall through */
      }
    }
    const d = VP.defaults;
    return { on: !!d.stroke && d.strokeWidth > 0, width: d.strokeWidth, dash: d.dash || 'solid' };
  };
  const dashSvg = (key, w = 90) => {
    const pat = VP.DASHES && VP.DASHES[key];
    const da = pat ? pat.map((v) => Math.max(v * 1.6, 0.6)).join(' ') : '';
    return '<svg class="ct-dash" viewBox="0 0 ' + w + ' 8" width="' + w + '" height="8" aria-hidden="true"><line x1="2" y1="4" x2="' + (w - 2) + '" y2="4" stroke="currentColor" stroke-width="1.6"' + (da ? ' stroke-dasharray="' + da + '" stroke-linecap="round"' : '') + '/></svg>';
  };
  const outlineBlock = (items, withVar) => {
    const st = strokeInfo(items);
    const val = st.on ? VP.num(VP.toMM(st.width), 3) + ' mm' : 'Yok';
    return '<span class="ct-ow" title="Anahat genişliği">' + '<span class="ct-nic">' + ic('outlinePen', 'sm') + '</span>' +
      '<span class="ct-nbox"><input data-pf="ctOW" value="' + esc(val) + '" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="Anahat genişliği"></span>' +
      '<button class="ct-drop" data-act="ctOWList" tabindex="-1" aria-label="Anahat genişlikleri" aria-haspopup="menu">' + chev('down') + '</button></span>' +
      combo('ctLS', dashSvg(st.dash), 'Çizgi stili', 110) +
      (withVar && VP.tools && VP.tools.varOutline ? ib('ctTool:varOutline', ic('varOutline', 'sm'), 'Değişken anahat aracı', VP.toolId === 'varOutline') : '');
  };
  const orderBlock = () => SEP + abtn('toFront', ic('toFront', 'sm'), 'Katmanın önüne') + abtn('toBack', ic('toBack', 'sm'), 'Katmanın arkasına');
  const curvesBtn = (items) => {
    const can = items.some((i) => (i.data && i.data.param) || i instanceof paper.PointText || i instanceof paper.Group);
    return can ? SEP + abtn('toCurves', ic('curves', 'sm'), 'Eğrilere dönüştür (Ctrl+Q)') : '';
  };

  // Ellipse: ellipse/pie/arc, starting and ending angles, change direction
  const ellipseBlock = (p) => {
    const d = VP.defaults;
    const t = p ? p.etype || 'ellipse' : d.ctEType || 'ellipse';
    const a0 = p ? (p.a0 == null ? (t === 'ellipse' ? 90 : 0) : p.a0) : d.ctA0 == null ? 0 : d.ctA0;
    const a1 = p ? (p.a1 == null ? (t === 'ellipse' ? 90 : 270) : p.a1) : d.ctA1 == null ? 270 : d.ctA1;
    const cw = p ? !!p.cw : !!d.ctCW;
    const part = t !== 'ellipse';
    return ib('ctEType:ellipse', ic('ellipseType', 'sm', 'ellipse'), 'Elips', t === 'ellipse') + ib('ctEType:pie', ic('pie', 'sm'), 'Pasta', t === 'pie') + ib('ctEType:arc', ic('arc', 'sm'), 'Yay', t === 'arc') + SEP +
      stack(nbox({ pf: 'ctA0', icon: ic('angleStart', 'sm'), value: num(a0, 1), unit: '°', title: 'Başlangıç açısı', w: 40, spin: true, step: 1, dis: !part }), nbox({ pf: 'ctA1', icon: ic('angleEnd', 'sm'), value: num(a1, 1), unit: '°', title: 'Bitiş açısı', w: 40, spin: true, step: 1, dis: !part })) + SEP +
      ib('ctEDir', ic('arcDir', 'sm'), 'Yönü değiştir', cw, !part) + SEP;
  };
  // Rectangle: corner type, four corner radii with lock, relative corner scaling
  const rectBlock = (p) => {
    const d = VP.defaults;
    const type = p ? p.ctype || 'round' : d.ctCType || 'round';
    const rr = p ? (p.radii || [p.r || 0, p.r || 0, p.r || 0, p.r || 0]).map((v) => VP.toMM(v)) : Array.isArray(d.ctRadii) ? d.ctRadii : [d.rectRadius || 0, d.rectRadius || 0, d.rectRadius || 0, d.rectRadius || 0];
    const lock = store.get('rlock', true);
    const f = (i, ico, t) => nbox({ pf: 'ctR' + i, icon: ic(ico, 'sm'), value: numMin(rr[i]), unit: 'mm', title: t, w: 56 });
    return ib('ctCType:round', ic('cornerRound', 'sm'), 'Yuvarlatılmış köşe', type === 'round') + ib('ctCType:scallop', ic('cornerScallop', 'sm'), 'Oyuk köşe', type === 'scallop') + ib('ctCType:chamfer', ic('cornerChamfer', 'sm'), 'Pah kırılmış köşe', type === 'chamfer') + SEP +
      stack(f(0, 'cornerTL', 'Köşe yarıçapı: sol üst'), f(3, 'cornerBL', 'Köşe yarıçapı: sol alt')) +
      ib('ctRLock', ic(lock ? 'lock' : 'unlock', 'sm'), 'Köşeleri birlikte düzenle', lock) +
      stack(f(1, 'cornerTR', 'Köşe yarıçapı: sağ üst'), f(2, 'cornerBR', 'Köşe yarıçapı: sağ alt')) + SEP;
  };
  const polyBlock = (p) => {
    const d = VP.defaults;
    const star = p ? !!p.star : VP.toolId === 'star';
    const n = p ? p.sides : d.polySides;
    let h = nbox({ pf: 'polySides', icon: ic('points', 'sm'), value: n, title: star ? 'Nokta veya kenar sayısı' : 'Nokta veya kenar sayısı', w: 34, spin: true, step: 1 });
    if (star) h += nbox({ pf: 'ctSharp', icon: ic('sharp', 'sm'), value: Math.round((1 - (p ? p.inner : d.polyInner)) * 100), title: 'Yıldız keskinliği', w: 34, spin: true, step: 1 });
    return h + SEP;
  };
  const spiralBlock = (p) => nbox({ pf: 'spiralTurns', icon: ic('turns', 'sm'), value: numMin(p ? p.turns : VP.defaults.spiralTurns), title: 'Spiral dönüşleri', w: 34, spin: true, step: 1 }) + SEP;

  // Text: font list, font size, bold/italic, alignment
  const SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 24, 36, 48, 60, 72, 96, 144];
  const textBlock = (t) => {
    const d = VP.defaults;
    const isPara = t && VP.tx && VP.tx.is && VP.tx.is(t, 'paragraph');
    const pfx = isPara ? (t.data && t.data.effect) : null;
    const pfont = pfx ? (pfx.font || {}) : null;

    const fam = pfont ? pfont.family : (t ? t.fontFamily : d.fontFamily);
    const size = pfont ? pfont.size : (t ? t.fontSize : d.fontSize);
    const bold = pfont ? !!pfont.bold : (t ? VP.isBold(t) : d.bold);
    const ital = pfont ? !!pfont.italic : (t ? VP.isItalic(t) : d.italic);
    const under = pfx ? !!(pfx.underline || (pfont && pfont.underline)) : (t ? !!(t.data && t.data.underline) : !!d.underline);
    const j = pfx ? (pfx.align || 'left') : (t ? (t.justification || 'left') : (d.justification || 'left'));

    const fonts = (VP.FONTS || []).slice();
    if (fam && !fonts.includes(fam)) fonts.push(fam);

    let h = '<span class="ct-sel ct-font" style="--w:150px"><select data-pf="font" aria-label="Yazı tipi listesi" title="Yazı tipi listesi">' + fonts.map((f) => '<option' + (f === fam ? ' selected' : '') + ' style="font-family:\'' + esc(f) + '\'">' + esc(f) + '</option>').join('') + '</select>' + chev('down') + '</span>' +
      '<span class="ct-ow ct-fs" title="Yazı tipi boyutu"><span class="ct-nbox"><input data-pf="fontSize" value="' + esc(VP.num(size, 1) + ' pt') + '" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="Yazı tipi boyutu"></span><button class="ct-drop" data-act="ctFSList" tabindex="-1" aria-label="Yazı tipi boyutları" aria-haspopup="menu">' + chev('down') + '</button></span>' + SEP +
      ib('bold', '<b class="ct-glyph">K</b>', 'Kalın (Ctrl+B)', !!bold) +
      ib('italic', '<i class="ct-glyph">İ</i>', 'İtalik (Ctrl+I)', !!ital) +
      ib('underline', '<u class="ct-glyph" style="text-decoration:underline;font-weight:bold">A</u>', 'Altı Çizili (Ctrl+U)', !!under) + SEP +
      ib('just:left', ic('alignL', 'sm'), 'Sola hizala (Ctrl+L)', j === 'left') +
      ib('just:center', ic('alignCH', 'sm'), 'Ortaya hizala (Ctrl+E)', j === 'center') +
      ib('just:right', ic('alignR', 'sm'), 'Sağa hizala (Ctrl+R)', j === 'right') +
      ib('just:justify', ic('alignFull', 'sm'), 'Tam yasla (Ctrl+J)', j === 'justify') +
      ib('just:force', ic('alignForce', 'sm'), 'Zorla yasla', j === 'force') + SEP;

    if (isPara) {
      const bOn = pfx.bullet && pfx.bullet.type && pfx.bullet.type !== 'none';
      const dcOn = pfx.dropCap && pfx.dropCap.lines > 0;
      h += ib('c_maddelervenumaralandirma', ic('bullet', 'sm'), 'Madde İşaretleri ve Numaralandırma…', !!bOn) +
           ib('c_buyukharf', ic('dropCap', 'sm'), 'Büyük İlk Harf…', !!dcOn) + SEP;
    }

    h += abtn('changeCase', ic('changeCase', 'sm'), 'Büyük/Küçük Harf Değiştir… (Shift+F3)') +
         abtn('textProps', ic('textDock', 'sm'), 'Metin Özellikleri Yuvası (Ctrl+T)') + SEP;

    if (t) {
      h += abtn('txEditText', ic('editText', 'sm'), 'Metni düzenle (Ctrl+Shift+T)') +
           abtn('c_donustur', ic('paragraph', 'sm'), isPara ? 'Sanatsal metne dönüştür (Ctrl+F8)' : 'Paragraf metnine dönüştür (Ctrl+F8)') +
           abtn('txFitPath', ic('fitPath', 'sm'), 'Metni eğriye yerleştir') + SEP;
    }

    return h;
  };

  const multiBtn = () => ib('multi', ic('multi', 'sm'), 'Çoklu seçim: dokunarak seçime ekle veya çıkar', !!VP.settings.multi);

  // Selection bar. Returns null where the app's own bar has more to offer (live effects).
  const selBar = () => {
    const s = VP.sel;
    const one = s.length === 1 ? s[0] : null;
    if (one && VP.fx && VP.fx.isFx && VP.fx.isFx(one)) return null;
    const b = VP.selBounds();
    const prm = one && one.data && one.data.param;
    const isText = one instanceof paper.PointText || (one && VP.tx && VP.tx.is && VP.tx.is(one, 'paragraph'));
    const isRaster = one instanceof paper.Raster;
    const isPC = one && VP.fx && VP.fx.of && VP.fx.of(one) && VP.fx.of(one).type === 'powerclip';
    const isPCEdit = VP.cFocus && VP.cFocus.isEditingPC;

    let h = '';
    if (isPCEdit) {
      h += abtn('pcFinish', ic('ok', 'sm') + ' <b style="color:var(--accent,#5ea6ff);margin-left:4px">PowerClip Düzenlemeyi Bitir</b>', 'PowerClip düzenlemeyi bitir (Shift+Esc / Ctrl+Boşluğa Tık)') + SEP;
    }
    h += geomBlock(b, false) + rotBlock(one, false);
    if (isPC) {
      h += SEP +
        abtn('pcEdit', ic('editText', 'sm', 'edit'), 'PowerClip’i düzenle (Ctrl+Tık / Çift Tık)') +
        abtn('pcSelectContent', ic('select', 'sm'), 'PowerClip içeriğini seç (Alt+Tık)') +
        abtn('pcExtract', ic('ungroup', 'sm'), 'İçeriği çıkar') +
        ib('pcLockToggle', ic(one.data.effect && one.data.effect.lock !== false ? 'lock' : 'unlock', 'sm'), 'İçeriği PowerClip’e kilitle', one.data.effect && one.data.effect.lock !== false) + SEP +
        abtn('pcCenter', ic('alignCH', 'sm'), 'İçeriği kabın ortasına al') +
        abtn('pcFit', ic('fit', 'sm'), 'İçeriği orantılı sığdır') +
        abtn('pcFill', ic('zoomPage', 'sm'), 'Çerçeveyi orantılı doldur') +
        abtn('pcStretch', ic('distH', 'sm'), 'Çerçeveyi dolduracak şekilde uzat') + SEP +
        outlineBlock(s, true) + orderBlock();
      return h + SEP + multiBtn();
    }
    if (s.length > 1) {
      h += abtn('combine', ic('combine', 'sm'), 'Birleştir (Ctrl+L)') + SEP +
        abtn('weld', ic('weld', 'sm'), 'Kaynak') + abtn('trim', ic('trim', 'sm'), 'Kırp') + abtn('intersect', ic('intersect', 'sm'), 'Kesişim') + abtn('exclude', ic('exclude', 'sm'), 'Dışla') +
        abtn('frontMinusBack', ic('frontMinusBack', 'sm'), 'Öndeki eksi arkadaki') + abtn('backMinusFront', ic('backMinusFront', 'sm'), 'Arkadaki eksi öndeki') + abtn('createBoundary', ic('boundary', 'sm'), 'Sınır oluştur') + SEP +
        outlineBlock(s, false) + SEP +
        abtn('group', ic('group', 'sm'), 'Nesneleri grupla (Ctrl+G)') + abtn('ungroup', ic('ungroup', 'sm'), 'Nesnelerin grubunu çöz (Ctrl+U)') + abtn('ungroupAll', ic('ungroupAll', 'sm', 'ungroup'), 'Tüm nesnelerin grubunu çöz');
    } else if (isText) {
      h += textBlock(one) + orderBlock() + curvesBtn(s);
    } else if (one instanceof paper.Group && !prm) {
      h += outlineBlock(s, false) + SEP + abtn('ungroup', ic('ungroup', 'sm'), 'Nesnelerin grubunu çöz (Ctrl+U)') + abtn('ungroupAll', ic('ungroupAll', 'sm', 'ungroup'), 'Tüm nesnelerin grubunu çöz') + orderBlock() + curvesBtn(s);
    } else if (isRaster) {
      h += orderBlock().slice(SEP.length);
    } else {
      if (prm && prm.kind === 'ellipse') h += ellipseBlock(prm);
      else if (prm && prm.kind === 'rect') h += rectBlock(prm);
      else if (prm && prm.kind === 'polygon') h += polyBlock(prm);
      else if (prm && prm.kind === 'spiral') h += spiralBlock(prm);
      h += outlineBlock(s, true);
      if (!prm && one instanceof paper.Path) h += SEP + ib('ctClose', ic('autoClose', 'sm'), 'Eğriyi otomatik kapat', !!one.closed);
      if (!prm && one instanceof paper.CompoundPath) h += SEP + abtn('breakApart', ic('breakApart', 'sm'), 'Ayır (Ctrl+K)');
      h += orderBlock() + curvesBtn(s);
    }
    (UI.selExtras || []).forEach((f) => {
      try {
        h += f(s, one) || '';
      } catch (e) {
        /* an extra from another module failed; keep the bar */
      }
    });
    return h + SEP + multiBtn();
  };

  const PAGE_ICON = (land) => ic(land ? 'landscape' : 'portrait', 'sm');
  const pageBar = () => {
    const p = VP.page();
    const w = VP.toMM(p.w);
    const hh = VP.toMM(p.h);
    const approx = (a, b) => Math.abs(a - b) < 0.6;
    const pre = (VP.PAGE_PRESETS || []).find((x) => (approx(x.w, w) && approx(x.h, hh)) || (approx(x.w, hh) && approx(x.h, w)));
    const land = p.w > p.h;
    const all = allPages();
    const opts = (VP.PAGE_PRESETS || []).map((o) => [o.id, o.label]);
    if (!pre) opts.push(['custom', 'Özel']);
    return select('pagePreset', opts, pre ? pre.id : 'custom', 'Sayfa boyutu', 150) + SEP +
      stack(nbox({ pf: 'pageW', icon: ic('pageW', 'sm'), value: numMin(w), unit: 'mm', title: 'Sayfa genişliği', w: 60, spin: true, step: 1 }), nbox({ pf: 'pageH', icon: ic('pageH', 'sm'), value: numMin(hh), unit: 'mm', title: 'Sayfa yüksekliği', w: 60, spin: true, step: 1 })) + SEP +
      (A.pageSetup ? ib('pageSetup', ic('pageLayout', 'sm'), 'Sayfa düzeni') + SEP : '') +
      ib('orient:p', PAGE_ICON(false), 'Dikey', !land) + ib('orient:l', PAGE_ICON(true), 'Yatay', land) + SEP +
      ib('ctAllPg', ic('allPages', 'sm'), 'Tüm sayfalar: boyut ve yön tüm sayfalara uygulanır', all) + ib('ctCurPg', ic('curPage', 'sm'), 'Geçerli sayfa: boyut ve yön yalnızca bu sayfaya uygulanır', !all) + SEP +
      '<span class="ct-lab">Birim:</span>' + select('ctUnits', [['mm', 'milimetre']], 'mm', 'Çizim birimleri', 100) + SEP +
      nbox({ pf: 'ctNudge', icon: ic('nudge', 'sm'), value: numMin(VP.settings.nudgeMM || 1) + ' mm', title: 'Kaydırma uzaklığı (ok tuşları)', w: 62, spin: 'v', step: 0.1 }) + SEP +
      stack(nbox({ pf: 'ctDupX', icon: ic('dupX', 'sm'), value: numMin(dupX()), unit: 'mm', title: 'Çoğaltma uzaklığı: yatay', w: 50, spin: true, step: 1 }), nbox({ pf: 'ctDupY', icon: ic('dupY', 'sm'), value: numMin(dupY()), unit: 'mm', title: 'Çoğaltma uzaklığı: dikey', w: 50, spin: true, step: 1 })) + SEP +
      multiBtn();
  };
  const ZOOMS = [10, 25, 50, 75, 100, 200, 400, 800, 1600];
  const zoomBar = () => {
    const z = Math.round(paper.view.zoom * 100);
    const opts = ZOOMS.map((v) => [v, v + '%']);
    if (!ZOOMS.includes(z)) opts.unshift([z, z + '%']);
    return select('ctZoom', opts, z, 'Yakınlaştırma düzeyleri', 80) +
      ib('zoomIn', ic('zoomIn', 'sm'), 'Yakınlaştır') + ib('zoomOut', ic('zoomOut', 'sm'), 'Uzaklaştır') + SEP +
      abtn('zoomSel', ic('zoom', 'sm'), 'Seçili nesnelere yakınlaştır (Shift+F2)') + ib('ctZoomAll', ic('zoomAll', 'sm'), 'Tüm nesnelere yakınlaştır') + SEP +
      ib('fit', ic('zoomPage', 'sm', 'fit'), 'Sayfaya yakınlaştır (F4)') + ib('ctZoomW', ic('zoomWidth', 'sm'), 'Sayfa genişliğine yakınlaştır') + ib('ctZoomH', ic('zoomHeight', 'sm'), 'Sayfa yüksekliğine yakınlaştır') + SEP +
      ib('zoom100', '<span class="ct-glyph">1:1</span>', 'Gerçek boyut (%100)');
  };
  const LINE_TOOLS = ['freehand', 'line', 'pen', 'bsplineTool', 'polylineTool', 'curve3Tool'];
  
  const nodeBlock = () => {
    const t = VP.tools && VP.tools.node;
    const segCount = (t && t.segs) ? t.segs.size : 0;
    return abtn('nodeAdd', ic('nodeAdd', 'sm', 'plus'), 'Düğüm ekle (+)') +
      abtn('nodeDelete', ic('nodeDel', 'sm', 'trash'), 'Düğümleri sil (-)') + SEP +
      abtn('nodeJoin', ic('nodeJoin', 'sm', 'join'), 'Düğümleri birleştir') +
      abtn('nodeBreak', ic('nodeBreak', 'sm', 'split'), 'Eğriyi böl') + SEP +
      abtn('nodeToLine', ic('toLine', 'sm', 'line'), 'Düğümü çizgiye dönüştür') +
      abtn('nodeToCurve', ic('toCurve', 'sm', 'curve'), 'Düğümü eğriye dönüştür') + SEP +
      abtn('nodeCusp', ic('nodeCusp', 'sm', 'cusp'), 'Köşe düğüm (Cusp - C)') +
      abtn('nodeSmooth', ic('nodeSmooth', 'sm', 'smooth'), 'Düzgün düğüm (Smooth - S)') +
      abtn('nodeSymm', ic('nodeSymmetric', 'sm', 'symm'), 'Simetrik düğüm') + SEP +
      abtn('nodeAutoClose', ic('autoClose', 'sm', 'close'), 'Eğriyi kapat/aç') +
      abtn('nodeReverse', ic('reverseCurve', 'sm', 'reverse'), 'Eğri yönünü tersine çevir') + SEP +
      '<span class="ct-nlab" style="font-size:11px;color:var(--cd-mut);padding:0 4px;">' +
      (segCount > 0 ? segCount + ' düğüm seçili' : 'Düğüm seçin') +
      '</span>';
  };

  const toolBar = (id) => {
    const d = VP.defaults;
    switch (id) {
      case 'select':
      case 'lassoTool':
        return pageBar();
      case 'node':
        return nodeBlock();
      case 'rect':
      case 'rect3Tool':
        return geomBlock(null, true) + rotBlock(null, true) + rectBlock(null) + outlineBlock(null, true);
      case 'ellipse':
      case 'ellipse3Tool':
        return geomBlock(null, true) + rotBlock(null, true) + ellipseBlock(null) + outlineBlock(null, true);
      case 'polygon':
      case 'star':
        return geomBlock(null, true) + rotBlock(null, true) + polyBlock(null) + outlineBlock(null, true);
      case 'spiral':
        return spiralBlock(null) + outlineBlock(null, false);
      case 'text':
        return textBlock(null).slice(0, -SEP.length);
      default:
        if (LINE_TOOLS.includes(id)) {
          let h = geomBlock(null, true) + rotBlock(null, true) + outlineBlock(null, false);
          if (id === 'freehand') {
            h += SEP + '<span class="ct-lab">Serbest el yumuşatma</span><label class="ct-range"><input type="range" data-pf="smoothing" data-live="1" min="0" max="10" step="1" value="' + d.smoothing + '" aria-label="Serbest el yumuşatma"><output>' + d.smoothing + '</output></label>';
          }
          return h;
        }
        return null;
    }
  };
  // Tools whose property bar is built here; all others keep the app's own bars (restyled by CSS).
  const PLAIN = ['select', 'lassoTool', 'node', 'rect', 'rect3Tool', 'ellipse', 'ellipse3Tool', 'polygon', 'star', 'spiral', 'text', 'eyedropper', 'attrEyedropper'].concat(LINE_TOOLS);
  const corelBar = () => {
    const id = VP.toolId;
    if (UI.textItem) return null;
    if (VP.tx && VP.tx.propbar && VP.tx.propbar()) return null;
    if (id === 'pen' && VP.tools.pen && VP.tools.pen.path) return null;
    if (id === 'hand' || id === 'zoom') return zoomBar();
    if (!PLAIN.includes(id)) return null;
    if (VP.sel.length) return selBar();
    return toolBar(id);
  };
  const pb0 = UI.renderPropbar;
  UI.renderPropbar = () => {
    const pb = $('#propbar');
    if (!pb) return;
    if (!classic()) {
      pb.classList.remove('ct-pb');
      return pb0();
    }
    const ae = document.activeElement;
    if (pb.contains(ae) && ae.tagName === 'INPUT' && UI._pbTyping) return;
    pb.classList.add('ct-pb');
    let h = null;
    try {
      h = corelBar();
    } catch (err) {
      console.error('vp-c-tools: property bar', err);
      h = null;
    }
    if (h == null) {
      pb.classList.add('ct-own');
      pb0();
      pb.insertAdjacentHTML('beforeend', plusBtn());
      return;
    }
    pb.classList.remove('ct-own');
    pb.innerHTML = h + plusBtn();
  };

  /* ---------- property bar input ---------- */
  const selParams = (kind) => VP.sel.filter((it) => it.data && it.data.param && it.data.param.kind === kind);
  const done = () => {
    VP.io && VP.io.savePrefs && VP.io.savePrefs();
    UI.schedule('prop', 'status', 'dock');
  };
  const setAnchorGeom = (fn) => {
    if (!VP.sel.length) return;
    fn(VP.selBounds());
    VP.commit();
    VP.drawOverlay && VP.drawOverlay();
    VP.emit && VP.emit('transform');
  };
  const scaleSel = (sx, sy) =>
    setAnchorGeom((b) => {
      if (!(sx > 0) || !(sy > 0)) return;
      VP.T.scale(VP.sel, sx, sy, anchorPt(b));
    });
  const parseWidthMM = (raw) => {
    const s = String(raw).trim().toLowerCase();
    if (!s || s === 'yok' || s === 'none') return 'none';
    if (s.startsWith('saç')) return 0.076;
    let v = VP.parseNum(s);
    if (!isFinite(v)) return null;
    if (/pt\b/.test(s)) v = VP.toMM(v);
    return v;
  };
  const applyWidth = (mm) => {
    const items = VP.sel;
    if (mm === 'none') {
      if (items.length) VP.setStroke(items, { on: false });
      else VP.defaults.stroke = null;
    } else {
      const pt = VP.toPT(mm);
      if (items.length) {
        const st = strokeInfo(items);
        const spec = { width: pt };
        if (!st.on) Object.assign(spec, { on: true, color: VP.defaults.stroke || '#1d1d1b' });
        VP.setStroke(items, spec);
      } else {
        VP.defaults.strokeWidth = pt;
        if (!VP.defaults.stroke) VP.defaults.stroke = '#1d1d1b';
      }
    }
    if (items.length) VP.commit();
  };
  const rebuildAll = (items) => {
    items.forEach((it) => VP.rebuildParam(it));
    VP.commit();
  };
  const pf0 = UI.propField;
  UI.propField = (name, raw, el) => {
    if (!name || !name.startsWith('ct')) {
      if (name === 'pagePreset' || name === 'pageW' || name === 'pageH') {
        allPagesOnce = allPages();
        try {
          return pf0(name, raw, el);
        } finally {
          allPagesOnce = false;
        }
      }
      if (name === 'fontSize') raw = String(raw).replace(/pt/i, '');
      return pf0(name, raw, el);
    }
    const v = VP.parseNum(raw);
    const d = VP.defaults;
    switch (name) {
      case 'ctX':
      case 'ctY':
        if (isFinite(v)) {
          setAnchorGeom((b) => {
            const ap = anchorPt(b);
            const t = VP.toPT(v);
            VP.T.move(VP.sel, new paper.Point(name === 'ctX' ? t - ap.x : 0, name === 'ctY' ? t - ap.y : 0));
          });
        }
        break;
      case 'ctW':
      case 'ctH':
        if (v > 0 && VP.sel.length) {
          const b = VP.selBounds();
          const cur0 = name === 'ctW' ? b.width : b.height;
          if (cur0 > 0) {
            const f = VP.toPT(v) / cur0;
            const keep = !!VP.settings.keepRatio;
            scaleSel(name === 'ctW' || keep ? f : 1, name === 'ctH' || keep ? f : 1);
          }
        }
        break;
      case 'ctSX':
      case 'ctSY':
        if (v > 0) {
          const f = v / 100;
          const keep = !!VP.settings.keepRatio;
          scaleSel(name === 'ctSX' || keep ? f : 1, name === 'ctSY' || keep ? f : 1);
        }
        break;
      case 'ctOW': {
        const mm = parseWidthMM(raw);
        if (mm != null) applyWidth(mm);
        break;
      }
      case 'ctA0':
      case 'ctA1': {
        if (!isFinite(v)) break;
        const a = ((v % 360) + 360) % 360;
        const ps = selParams('ellipse');
        if (ps.length) {
          ps.forEach((it) => (it.data.param[name === 'ctA0' ? 'a0' : 'a1'] = a));
          rebuildAll(ps);
        } else d[name] = a;
        break;
      }
      case 'ctR0':
      case 'ctR1':
      case 'ctR2':
      case 'ctR3': {
        if (!(v >= 0)) break;
        const i = +name.slice(3);
        const lock = store.get('rlock', true);
        const ps = selParams('rect');
        if (ps.length) {
          ps.forEach((it) => {
            const p = it.data.param;
            if (lock) {
              p.r = VP.toPT(v);
              delete p.radii;
              delete p._rr;
            } else {
              const rr = (p.radii || [p.r || 0, p.r || 0, p.r || 0, p.r || 0]).slice();
              rr[i] = VP.toPT(v);
              p.radii = rr;
              p._rr = p.r;
            }
          });
          rebuildAll(ps);
        } else {
          const rr = Array.isArray(d.ctRadii) ? d.ctRadii.slice() : [d.rectRadius || 0, d.rectRadius || 0, d.rectRadius || 0, d.rectRadius || 0];
          if (lock) rr.fill(v);
          else rr[i] = v;
          d.ctRadii = rr;
          d.rectRadius = rr[0];
        }
        break;
      }
      case 'ctSharp': {
        if (!isFinite(v)) break;
        const inner = 1 - VP.clamp(v, 1, 99) / 100;
        const ps = selParams('polygon').filter((it) => it.data.param.star);
        if (ps.length) {
          ps.forEach((it) => (it.data.param.inner = inner));
          rebuildAll(ps);
        } else d.polyInner = inner;
        break;
      }
      case 'ctNudge':
        if (v > 0) VP.settings.nudgeMM = v;
        break;
      case 'ctDupX':
        if (isFinite(v)) VP.settings.ctDupX = v;
        break;
      case 'ctDupY':
        if (isFinite(v)) VP.settings.ctDupY = v;
        break;
      case 'ctZoom':
        if (v > 0) VP.setZoom(v / 100);
        break;
      case 'ctUnits':
        break;
    }
    done();
  };

  const act0 = UI.act;
  const zoomTo = (rect) => rect && rect.width > 0 && rect.height > 0 && VP.zoomToRect(rect);
  const pageRect = () => {
    const p = VP.page();
    return new paper.Rectangle(0, 0, p.w, p.h);
  };
  const spinField = (pf, step) => {
    const inp = document.querySelector('#propbar [data-pf="' + pf + '"]');
    if (!inp || inp.disabled) return;
    let v = VP.parseNum(inp.value);
    if (!isFinite(v)) v = 0;
    const dec = String(step).includes('.') ? String(step).split('.')[1].length : 0;
    const nv = Math.round((v + step) * Math.pow(10, Math.max(dec, 3))) / Math.pow(10, Math.max(dec, 3));
    const unit = (inp.value.match(/[a-z°%]+\s*$/i) || [''])[0];
    inp.value = VP.num(nv, 3) + (unit ? ' ' + unit.trim() : '');
    UI._pbTyping = false;
    UI.propField(pf, inp.value, inp);
  };
  const listPopover = (el, items, onPick) => {
    UI.popover(el, items.map(([k, l, extra]) => '<button class="pop-item ct-fi" data-pick="' + esc(k) + '">' + (extra || '') + '<span class="ct-fi-l">' + esc(l) + '</span></button>').join(''), onPick);
    if (UI._pop) UI._pop.classList.add('ct-list');
  };
  UI.act = (id, el) => {
    if (id === 'ctPbCustom') {
      const ids = ['barStd', 'barProp', 'barTools', 'barStatus', 'barPalette', 'barDocPal'].filter((k) => A[k]);
      if (!ids.length || !UI.h || !UI.h.menuHTML) return;
      UI.popover(el, '<div class="pop-head">Araç çubukları</div>' + UI.h.menuHTML(ids), (pid) => UI.run(pid));
      if (UI._pop) UI._pop.classList.add('ct-list');
      return;
    }
    if (id.startsWith('orient:')) {
      allPagesOnce = allPages();
      try {
        return act0(id, el);
      } finally {
        allPagesOnce = false;
      }
    }
    if (!id.startsWith('ct')) return act0(id, el);
    const d = VP.defaults;
    const [cmd, arg, arg2] = id.split(':');
    switch (cmd) {
      case 'ctSpin':
        return spinField(arg, +arg2);
      case 'ctAnchor':
        if (coarse() && el && !(UI._pop && UI._pop.contains(el))) {
          // the 3×3 grid is small; on touch it opens as a larger grid
          UI.popover(el.parentElement, '<div class="ct-anchor big">' + Object.keys(ANCH).map((k) => '<button data-pick="' + k + '" aria-label="' + ANCH_N[k] + '" class="' + (k === anchor ? 'on' : '') + '"></button>').join('') + '</div>', (k) => {
            anchor = k;
            store.set('anchor', k);
            UI.schedule('prop');
          });
          return;
        }
        anchor = arg;
        store.set('anchor', arg);
        break;
      case 'ctTool':
        if (VP.tools[arg]) VP.setTool(arg);
        break;
      case 'ctEType': {
        const ps = selParams('ellipse');
        if (ps.length) {
          ps.forEach((it) => {
            const p = it.data.param;
            const was = p.etype || 'ellipse';
            if (was === arg) return;
            if (arg !== 'ellipse' && (p.a0 == null || p.a1 == null || p.a0 === p.a1)) {
              p.a0 = 0;
              p.a1 = 270;
            }
            p.etype = arg;
            if (arg === 'arc' && it.fillColor && !p._fill) {
              p._fill = VP.hex(it.fillColor) || null;
              it.fillColor = null;
            } else if (arg !== 'arc' && was === 'arc' && p._fill) {
              it.fillColor = new paper.Color(p._fill);
              delete p._fill;
            }
          });
          rebuildAll(ps);
        } else d.ctEType = arg;
        break;
      }
      case 'ctEDir': {
        const ps = selParams('ellipse');
        if (ps.length) {
          ps.forEach((it) => (it.data.param.cw = !it.data.param.cw));
          rebuildAll(ps);
        } else d.ctCW = !d.ctCW;
        break;
      }
      case 'ctCType': {
        const ps = selParams('rect');
        if (ps.length) {
          ps.forEach((it) => {
            it.data.param.ctype = arg;
            if (it.data.param.radii) it.data.param._rr = it.data.param.r;
          });
          rebuildAll(ps);
        } else d.ctCType = arg;
        break;
      }
      case 'ctRLock':
        store.set('rlock', !store.get('rlock', true));
        break;
      case 'ctClose': {
        const it = VP.sel.length === 1 ? VP.sel[0] : null;
        if (it instanceof paper.Path) {
          it.closed = !it.closed;
          VP.commit();
        }
        break;
      }
      case 'ctAllPg':
        store.set('allPages', true);
        break;
      case 'ctCurPg':
        store.set('allPages', false);
        break;
      case 'ctOWList':
        return listPopover(el.closest('.ct-ow') || el, OW, (k) => {
          applyWidth(k === 'none' ? 'none' : +k);
          done();
        });
      case 'ctLS': {
        const items = (VP.DASH_LABELS || []).map(([k, l]) => [k, l, dashSvg(k, 70)]);
        return listPopover(el, items, (k) => {
          if (VP.sel.length) {
            VP.setStroke(VP.sel, { dash: k });
            VP.commit();
          } else d.dash = k;
          done();
        });
      }
      case 'ctFSList':
        return listPopover(el.closest('.ct-ow') || el, SIZES.map((s) => [String(s), s + ' pt']), (k) => {
          UI.propField('fontSize', k);
        });
      case 'ctZoomAll': {
        let r = null;
        (VP.userLayers ? VP.userLayers() : []).forEach((L) => L.children.forEach((c) => {
          if (c.data && c.data.hitOnly) return;
          r = r ? r.unite(c.bounds) : c.bounds.clone();
        }));
        if (r) zoomTo(r.expand(VP.toPT(4)));
        break;
      }
      case 'ctZoomW': {
        const pr = pageRect();
        const vs = paper.view.viewSize;
        VP.setZoom((vs.width * 0.96) / pr.width);
        paper.view.center = new paper.Point(pr.center.x, paper.view.center.y);
        VP.viewChanged && VP.viewChanged();
        break;
      }
      case 'ctZoomH': {
        const pr = pageRect();
        const vs = paper.view.viewSize;
        VP.setZoom((vs.height * 0.96) / pr.height);
        paper.view.center = new paper.Point(paper.view.center.x, pr.center.y);
        VP.viewChanged && VP.viewChanged();
        break;
      }
    }
    done();
  };
  // keep the zoom combo current
  if (VP.on) VP.on('view', () => VP.toolId && (VP.toolId === 'zoom' || VP.toolId === 'hand') && UI.schedule('prop'));
})();
