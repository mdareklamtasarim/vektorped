/* VektörPad "classic desktop" look (default): flat docked bars like a desktop drawing suite, a welcome
   screen tab, a Hints docker, black square selection handles with rotate/skew arrows on the second tap,
   a page with a hard drop shadow, the Outline flyout at the bottom of the tool box, section shortcuts in
   the Properties docker and "snap off". All drawn here; no other program's artwork is used. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const A = VP.actions;
  const CL = (VP.classic = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;

  /* =============== skin =============== */
  const savedSkin = () => {
    try {
      const o = JSON.parse(localStorage.getItem('vektorpad.prefs.v1') || 'null');
      return o && o.settings && o.settings.skin;
    } catch (e) {
      return null;
    }
  };
  VP.settings.skin = savedSkin() || VP.settings.skin || 'classic';
  CL.on = () => VP.settings.skin !== 'modern';
  CL.apply = () => {
    root.dataset.skin = CL.on() ? 'classic' : 'modern';
    VP.readColors();
    if (paper.project && VP.bgLayer) {
      VP.drawPage();
      VP.drawOverlay();
    }
    if (UI.drawRulers) UI.drawRulers();
    if (UI.fitToolbox) setTimeout(() => UI.fitToolbox(), 0);
    if (UI.onResize) setTimeout(() => UI.onResize(), 0);
  };
  root.dataset.skin = CL.on() ? 'classic' : 'modern';
  // the area outside the page: white as in the desktop suite, or the theme's grey ('theme')
  const savedDesk = () => {
    try {
      const o = JSON.parse(localStorage.getItem('vektorpad.prefs.v1') || 'null');
      return o && o.settings && o.settings.desk;
    } catch (e) {
      return null;
    }
  };
  VP.settings.desk = savedDesk() || VP.settings.desk || 'white';
  CL.applyDesk = () => {
    if (VP.settings.desk === 'theme') root.style.removeProperty('--paste');
    else root.style.setProperty('--paste', '#ffffff');
  };
  CL.applyDesk();
  const lp0 = VP.io.loadPrefs.bind(VP.io);
  VP.io.loadPrefs = () => {
    const r = lp0();
    if (!VP.settings.skin) VP.settings.skin = 'classic';
    if (!VP.settings.desk) VP.settings.desk = 'white';
    root.dataset.skin = CL.on() ? 'classic' : 'modern';
    CL.applyDesk();
    return r;
  };

  /* =============== page: hard drop shadow and thin border =============== */
  const dp0 = VP.drawPage;
  VP.drawPage = () => {
    dp0();
    if (!VP.bgLayer) return;
    const p = VP.page();
    const r = VP.bgLayer.children.find((c) => c instanceof paper.Path && c.bounds.width === p.w && c.bounds.height === p.h && c.bounds.x === 0);
    if (!r) return;
    if (!CL.on()) {
      // a white page on a white desktop needs an edge
      if (VP.settings.desk !== 'theme') {
        r.strokeColor = new paper.Color('#a8a8a8');
        r.strokeWidth = 1;
        r.strokeScaling = false;
      }
      return;
    }
    r.shadowColor = new paper.Color(0, 0, 0, 0.42);
    r.shadowBlur = 0;
    r.shadowOffset = Pt(5, 5);
    r.strokeColor = new paper.Color(root.dataset.theme === 'dark' || (matchMedia('(prefers-color-scheme: dark)').matches && root.dataset.theme !== 'light') ? '#8a8a8a' : '#3c3c3c');
    r.strokeWidth = 1;
    r.strokeScaling = false;
  };

  /* =============== selection handles =============== */
  const rk0 = VP.rotKnob;
  VP.rotKnob = (b) => (CL.on() ? Pt(1e9, 1e9) : rk0(b));
  const sel0 = VP.drawSelectionOverlay;
  const ink = () => new paper.Color(VP.colors.fg && /^#[0-9a-f]{3,6}$/i.test(VP.colors.fg) && root.dataset.theme === 'dark' ? '#f0f0f0' : '#000000');
  const arrowHead = (tip, dir, s) => {
    const n = Pt(-dir.y, dir.x);
    const k = VP.coarse ? 1.4 : 1;
    return new paper.Path({ segments: [tip, tip.subtract(dir.multiply(7 * s * k)).add(n.multiply(4.5 * s * k)), tip.subtract(dir.multiply(7 * s * k)).subtract(n.multiply(4.5 * s * k))], closed: true, insert: false });
  };
  // curved two-headed arrow at a corner (rotate)
  const rotGlyph = (L, p, out, s, col) => {
    const r = 13 * s * (VP.coarse ? 1.4 : 1);
    const c = p.add(out.multiply(r * 0.15));
    const a0 = out.angle - 55;
    const a1 = out.angle + 55;
    const P = (a) => c.add(Pt(r, 0).rotate(a));
    const arc = new paper.Path.Arc({ from: P(a0), through: P(out.angle), to: P(a1), strokeColor: col, strokeWidth: 1.6 * s, insert: false });
    L.addChild(arc);
    const t0 = Pt(0, 1).rotate(a0 - 90 + 180).normalize();
    const t1 = Pt(0, 1).rotate(a1 - 90).normalize();
    [arrowHead(P(a0), Pt(1, 0).rotate(a0 - 90), s), arrowHead(P(a1), Pt(1, 0).rotate(a1 + 90), s)].forEach((h) => {
      h.fillColor = col;
      L.addChild(h);
    });
    void t0;
    void t1;
  };
  // straight two-headed arrow along an edge (skew)
  const skewGlyph = (L, p, along, s, col) => {
    const r = 12 * s * (VP.coarse ? 1.4 : 1);
    const a = p.subtract(along.multiply(r));
    const b = p.add(along.multiply(r));
    L.addChild(new paper.Path.Line({ from: a, to: b, strokeColor: col, strokeWidth: 1.6 * s, insert: false }));
    [arrowHead(a, along.multiply(-1), s), arrowHead(b, along, s)].forEach((h) => {
      h.fillColor = col;
      L.addChild(h);
    });
  };
  VP.drawSelectionOverlay = (L) => {
    if (!CL.on()) return sel0(L);
    VP.pruneSel();
    if (!VP.sel.length) return;
    const s = 1 / paper.view.zoom;
    const col = ink();
    const b = VP.selBounds();
    // small to see, while the touch target (hit test) stays finger-sized
    const hs = (VP.coarse ? 8 : 6.5) * s;
    if (VP.sel.length > 1) VP.sel.forEach((it) => L.addChild(new paper.Path.Rectangle({ rectangle: it.bounds, strokeColor: new paper.Color(VP.colors.accent), strokeWidth: s, dashArray: [2 * s, 2 * s], opacity: 0.6, insert: false })));
    if (VP.handleMode === 'rotate') {
      VP.handlesOf(b).forEach((h) => {
        const out = h.p.subtract(b.center);
        if (h.kind === 'corner') rotGlyph(L, h.p, out.normalize(), s, col);
        else skewGlyph(L, h.p, h.id === 'tc' || h.id === 'bc' ? Pt(1, 0) : Pt(0, 1), s, col);
      });
      const c = VP.pivot || b.center;
      L.addChild(new paper.Path.Circle({ center: c, radius: 5 * s, strokeColor: col, strokeWidth: 1.3 * s, fillColor: new paper.Color(1, 1, 1, 0.6), insert: false }));
      L.addChild(new paper.Path.Circle({ center: c, radius: 1.6 * s, fillColor: col, insert: false }));
      return;
    }
    VP.handlesOf(b).forEach((h) => L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(h.p.subtract(hs / 2), new paper.Size(hs, hs)), fillColor: col, strokeColor: new paper.Color(1, 1, 1, 0.85), strokeWidth: 0.8 * s, insert: false })));
    const c = b.center;
    const k = 3.5 * s;
    L.addChild(new paper.Path.Line({ from: c.add(Pt(-k, -k)), to: c.add(Pt(k, k)), strokeColor: col, strokeWidth: 1.2 * s, insert: false }));
    L.addChild(new paper.Path.Line({ from: c.add(Pt(-k, k)), to: c.add(Pt(k, -k)), strokeColor: col, strokeWidth: 1.2 * s, insert: false }));
  };

  /* =============== snap off =============== */
  A.snapOff = {
    label: 'Yakalamayı kapat', kbd: 'Alt+Q', icon: 'snapOff',
    checked: () => !VP.settings.snap && !VP.settings.snapGuides && !VP.settings.snapObjects,
    run: () => {
      const s = VP.settings;
      const on = s.snap || s.snapGuides || s.snapObjects;
      if (on) {
        s._snapMem = { snap: s.snap, snapGuides: s.snapGuides, snapObjects: s.snapObjects };
        s.snap = s.snapGuides = s.snapObjects = false;
        VP.toast('Yakalama kapalı');
      } else {
        Object.assign(s, s._snapMem || { snapGuides: true, snapObjects: true });
        VP.toast('Yakalama açık');
      }
      VP.io.savePrefs();
      UI.renderTop();
      UI.schedule && UI.schedule('prop');
    }
  };
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'q' || e.key === 'Q') && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
      e.preventDefault();
      UI.run('snapOff');
    }
  });

  /* =============== outline flyout (bottom of the tool box) =============== */
  const WIDTHS = [['none', 'Anahat yok'], [0.216, 'Kıl çizgi'], [0.5, '0,5 pt'], [0.75, '0,75 pt'], [1, '1 pt'], [1.5, '1,5 pt'], [2, '2 pt'], [3, '3 pt'], [4, '4 pt'], [8, '8 pt'], [12, '12 pt'], [16, '16 pt'], [24, '24 pt']];
  const widthIcon = (w) => '<svg viewBox="0 0 40 14" width="40" height="14" aria-hidden="true">' + (w === 'none' ? '<path d="M4 3l32 8M4 11l32-8" stroke="currentColor" stroke-width="1.2"/>' : '<path d="M3 7h34" stroke="currentColor" stroke-width="' + Math.min(10, Math.max(0.6, w * 0.8)) + '"/>') + '</svg>';
  UI.outlineFlyout = (btn) => {
    const html = '<button class="pop-item" data-pick="pen">' + ic('outlinePen', 'sm') + '<span>Anahat kalemi…</span><span class="kbd">F12</span></button>' +
      '<button class="pop-item" data-pick="color">' + ic('fillTool', 'sm') + '<span>Anahat rengi…</span><span class="kbd">Shift+F12</span></button><div class="pop-sep"></div>' +
      WIDTHS.map(([w, l]) => '<button class="pop-item" data-pick="' + w + '">' + widthIcon(w) + '<span>' + esc(l) + '</span></button>').join('');
    UI.popover(btn, html, (k) => {
      if (k === 'pen') return UI.openDock('props');
      if (k === 'color') {
        UI.palTarget = 'stroke';
        return UI.customColor();
      }
      const items = VP.sel;
      if (k === 'none') {
        if (items.length) VP.setStroke(items, { on: false });
        else VP.defaults.stroke = null;
      } else {
        const w = +k;
        if (items.length) VP.setStroke(items, { on: true, width: w, color: VP.getStroke(items[0]).color || '#1d1d1b' });
        else VP.defaults.strokeWidth = w;
      }
      if (items.length) VP.commit();
      else {
        VP.io.savePrefs();
        VP.toast('Yeni nesnelerin anahattı: ' + (k === 'none' ? 'yok' : WIDTHS.find((x) => String(x[0]) === k)[1]));
      }
      UI.schedule && UI.schedule('prop', 'dock', 'status');
    }, innerWidth > 640 ? 'right' : undefined);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'F12' || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    e.preventDefault();
    if (e.shiftKey) {
      UI.palTarget = 'stroke';
      UI.customColor();
    } else UI.openDock('props');
  });

  /* =============== properties docker: section shortcuts =============== */
  const SECS = [['Dolgu', 'fillTool', 'Dolgu'], ['Anahat', 'outlinePen', 'Anahat'], ['Anahat kalemi', 'calligraphy', 'Anahat kalemi'], ['Saydamlık', 'transpTool', 'Saydamlık'], ['Gölge', 'shadowTool', 'Gölge'], ['Efektler', 'blend', 'Efektler']];
  const rd0 = UI.renderDock;
  UI.renderDock = (force) => {
    rd0(force);
    if (!CL.on() || UI.dockTab !== 'props') return;
    const body = $('#dock-body');
    if (!body || body.querySelector('.props-nav')) return;
    const heads = [...body.querySelectorAll('.sec-h h3')];
    const avail = SECS.filter(([t]) => heads.some((h) => h.textContent.trim() === t));
    if (avail.length < 2) return;
    const nav = document.createElement('div');
    nav.className = 'props-nav';
    nav.innerHTML = avail.map(([t, icon, label]) => '<button data-jump="' + esc(t) + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + ic(icon, 'sm') + '</button>').join('');
    body.insertBefore(nav, body.firstChild);
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.props-nav [data-jump]');
    if (!b) return;
    e.stopPropagation();
    const h = [...document.querySelectorAll('#dock-body .sec-h h3')].find((x) => x.textContent.trim() === b.dataset.jump);
    if (h) h.closest('.sec').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, true);

  /* =============== Hints docker =============== */
  const TIPS = [
    'Seçili bir nesneye ikinci kez dokunun: döndürme ve eğme okları görünür.',
    'Bir araç düğmesine uzun basın: aynı gruptaki diğer araçlar açılır.',
    'Paletteki bir renge dokunmak dolguyu, uzun basmak anahattı boyar.',
    'Çift dokunuş: eğride düğüm düzenleme, metinde yazı düzenleme.',
    'İki parmakla sürükleyin: kaydırma · Sıkıştırın: yakınlaştırma.',
    'Sağdaki dikey sekmeler panelleri açar; açık sekmeye yeniden dokunmak paneli kapatır.'
  ];
  const hintsPanel = () => {
    const m = VP.TOOL_META[VP.toolId] || { label: VP.toolId, icon: 'select', hint: '' };
    let h = '<div class="sec"><div class="sec-h"><h3>' + esc(m.label) + '</h3></div>' +
      '<div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:12px"><span style="width:48px;height:48px;flex:none;display:grid;place-items:center;border:1px solid var(--line);background:var(--panel-2)">' + ic(m.icon) + '</span>' +
      '<p style="margin:0;font-size:13px;line-height:1.5">' + esc(m.hint || 'Bu araçla sayfaya dokunun veya sürükleyin.').split(' · ').join('<br>') + '</p></div>' +
      (m.key ? '<p class="sec-note">Kısayol: <b>' + esc(m.key) + '</b></p>' : '') + '</div>';
    if (VP.sel.length) h += '<div class="sec"><div class="sec-h"><h3>Seçim</h3></div><p class="sec-note">' + esc(VP.sel.length === 1 ? VP.describe(VP.sel[0]) : VP.sel.length + ' nesne') + ' · Ayarlar özellik çubuğunda ve Özellikler panelinde.</p></div>';
    h += '<div class="sec"><div class="sec-h"><h3>Biliyor muydunuz?</h3></div>' + TIPS.map((t) => '<p class="sec-note">• ' + esc(t) + '</p>').join('') + '</div>';
    return h;
  };
  UI.panels = UI.panels || {};
  UI.panels.hints = hintsPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'hints')) UI.DOCKERS.splice(1, 0, ['hints', 'İpuçları']);
  VP.on('tool', () => UI.dockTab === 'hints' && UI.renderDock(true));
  VP.on('selection', () => UI.dockTab === 'hints' && UI.renderDock(true));

  /* =============== welcome screen =============== */
  let wl = null;
  const wlState = { tab: 'start' };
  const recentCard = () => {
    const p = VP.doc.pages[0];
    return '<button class="wl-card wl-recent" data-wl="resume">' + (p && p.thumb ? '<img src="' + p.thumb + '" alt="">' : ic('file')) + '<b>' + esc(VP.doc.name) + '</b><small>' + VP.doc.pages.length + ' sayfa · çalışmaya devam et</small></button>';
  };
  const content = () => {
    const t = wlState.tab;
    if (t === 'start') {
      return '<h2>Başlarken</h2><div class="wl-cards">' +
        '<button class="wl-card" data-wl="new">' + ic('file') + '<b>Yeni belge</b><small>Yeni Belge Oluştur penceresi</small></button>' +
        '<button class="wl-card" data-wl="sizes">' + ic('pages') + '<b>Hazır boyuttan yeni</b><small>A3, A5, kartvizit, afiş…</small></button>' +
        '<button class="wl-card" data-wl="open">' + ic('open') + '<b>Aç…</b><small>VektörPad belgesi</small></button>' +
        '<button class="wl-card" data-wl="import">' + ic('import') + '<b>İçe aktar…</b><small>SVG, PDF, AI, DXF, resim</small></button>' +
        '<button class="wl-card" data-wl="sample">' + ic('star') + '<b>Örnek çizim</b><small>Araçları denemek için</small></button></div>' +
        '<h2 style="font-size:16px">Son çalışma</h2><div class="wl-cards">' + recentCard() + '</div>';
    }
    if (t === 'new') {
      const items = (A.whatsNew && document.createElement('div')) || null;
      void items;
      return '<h2>Yenilikler</h2><p class="sec-note">Ayrıntılı liste: Yardım › Yenilikler</p><dl>' +
        [['Sürüm 26', 'Yazı tipi yöneticisi: dosyadan yazı tipi yükleme, Google Fonts’tan ekleme'],
          ['Sürüm 25', 'Kısayol ve araç çubuğu özelleştirme, renk ayarları, Renk paneli, Varlıklar paneli'],
          ['Sürüm 24', '31 yeni biteşlem efekti (3B, sanatsal darbeler, mercek parlaması, vitray, hava…), JPEG temizleme, RGB/Lab/CMYK modları'],
          ['Sürüm 23', 'OpenType yazı ayarları ve değişken yazı tipleri, metni düzleştir, basılmayan karakterler, bindirme baskı, nesne verileri, bağlantılar ve yer imleri, bağlantı noktası aracı'],
          ['Sürüm 22', 'Son kaydedilene dön, şablonlar, son kullanılanlar, birleştirerek yazdır, kılavuzlar paneli ve açılı kılavuzlar, taban çizgisi ızgarası, sayfa numarası biçimleri, serbest dönüştürme'],
          ['Sürüm 21', 'Tahribatsız efektler, bağlı metin çerçeveleri, anahattı nesneye dönüştür, geri alma ve şekillendirme panelleri, efekt kopyala/klonla, özel yapıştır'],
          ['Sürüm 20', 'Dışa aktarma paneli (çoklu dışa aktarma, ZIP), renk provası ve gamut uyarısı'],
          ['Sürüm 19', 'Görüntü ayarlama laboratuvarı, renk uyumları, Noktalayıcı, Fotoğraf kolajı'],
          ['Sürüm 18', 'Perspektif çizim (1-2-3 nokta), Etki aracı, nesneleri yola sığdırma, paragraf metnini nesne etrafında akıtma'],
          ['Sürüm 17', 'Görünüm modları (tel kafes, taslak, piksel), çoklu sayfa görünümü, Koordinatlar paneli, çizim ölçeği'],
          ['Sürüm 16', 'Hizalama kılavuzları, simetri, eğim efekti, QR kod ve barkod'],
          ['Sürüm 15', 'Sağ tık menüsü (basılı tutarak)'],
          ['Sürüm 14', 'CorelDRAW dosyalarını açma (.cdr), sürüm seçerek CorelDRAW için kaydetme'],
          ['Sürüm 13', 'Kesim ve Montaj eklentisi: bıçak izi, hizalama işaretleri, çoğaltma, yerleştirme, ayıklama'],
          ['Sürüm 12', 'Yeni Belge Oluştur penceresi, her belge kendi sekmesinde, klasik masaüstü görünümü, Metin paneli'],
          ['Sürüm 11','Dışa aktarma (EPS, DXF, JPG, WEBP), PDF güvenliği, yazdırma, kitapçık, PDF/AI/DXF içe aktarma, betikler ve makrolar'],
          ['Sürüm 10', 'Paragraf biçimleri, Türkçe heceleme, stiller, palet yöneticisi, semboller, ana katmanlar, yorumlar'],
          ['Sürüm 9', 'Gölge araçları, deformasyon, 6 derinlik türü, anahat kalemi, çok duraklı geçiş, biteşlem efektleri'],
          ['Sürüm 8', 'Akıllı çizim, LiveSketch, hazır şekiller, köşeler, klonlar']].map(([a, b]) => '<dt>' + a + '</dt><dd>' + b + '</dd>').join('') + '</dl>';
    }
    if (t === 'learn') {
      return '<h2>Öğrenme</h2><dl>' + [['Seç (Boşluk)', 'Dokun: seç · Sürükle: taşı · İkinci dokunuş: döndür/eğ'], ['Şekil (F10)', 'Düğümleri ve tutamaçları düzenle'], ['Dörtgen (F6)', 'Sürükleyerek çiz · Köşe yarıçapı özellik çubuğunda'], ['Elips (F7)', 'Sürükleyerek çiz'], ['Metin (F8)', 'Dokun: sanatsal metin · Sürükle: paragraf metni'], ['Etkileşimli dolgu (G)', 'Nesne üzerinde sürükle: geçişli dolgu'], ['Anahat (F12)', 'Anahat kalemi: oklar, kaligrafi, konum'], ['Tam ekran önizleme (F9)', 'Sayfayı arayüz olmadan gör']].map(([a, b]) => '<dt>' + a + '</dt><dd>' + b + '</dd>').join('') + '</dl><div class="wl-cards"><button class="wl-card" data-wl="help">' + ic('help') + '<b>Yardım ve kısayollar</b><small>Tüm tuşlar</small></button><button class="wl-card" data-wl="hints">' + ic('hints') + '<b>İpuçları paneli</b><small>Seçili araç için yardım</small></button></div>';
    }
    return '<h2>Çalışma alanı</h2><div class="wl-cards">' + Object.keys((VP.docx && VP.docx.WS) || {}).map((k) => '<button class="wl-card" data-wl="ws:' + k + '">' + ic('panels') + '<b>' + esc(VP.docx.WS[k].name) + '</b></button>').join('') +
      '<button class="wl-card" data-wl="skin">' + ic('gear') + '<b>' + (CL.on() ? 'Modern görünüme geç' : 'Klasik masaüstü görünüme geç') + '</b><small>Pencere › Arayüz görünümü</small></button></div>';
  };
  const render = () => {
    if (!wl) return;
    wl.innerHTML = '<nav><div class="wl-brand">' + ($('.brand svg') ? $('.brand').innerHTML : '') + 'VektörPad <small style="font:600 12px var(--font-ui);color:var(--muted)">sürüm 26</small></div>' +
      [['start', 'Başlarken'], ['new', 'Yenilikler'], ['learn', 'Öğrenme'], ['ws', 'Çalışma alanı']].map(([k, l]) => '<button data-wtab="' + k + '" class="' + (wlState.tab === k ? 'on' : '') + '">' + l + '</button>').join('') +
      '<label><input type="checkbox" data-wl="startup"' + (VP.settings.welcome !== false ? ' checked' : '') + '>Başlangıçta göster</label></nav><div class="wl-main">' + content() + '</div>';
  };
  CL.showWelcome = (on) => {
    if (!wl) return;
    const tabsEl = $('.doc-tabs');
    if (tabsEl) wl.style.top = tabsEl.offsetHeight + 'px';
    wl.hidden = !on;
    const wt = $('.welcome-tab');
    // the tab of the document on screen (other open documents have their own tabs)
    const dn = document.getElementById('doc-name');
    const dt = dn ? dn.closest('.doc-tab') : null;
    if (wt) wt.classList.toggle('on', on);
    if (dt) dt.classList.toggle('on', !on);
    if (on) {
      try {
        VP.storePage();
        VP.makeThumb();
      } catch (e) { /* ignore */ }
      render();
    }
  };
  const initWelcome = () => {
    const tabs = $('.doc-tabs');
    const docwin = $('#docwin');
    if (!tabs || !docwin || $('#welcome')) return;
    const t = document.createElement('div');
    t.className = 'doc-tab welcome-tab';
    t.setAttribute('role', 'tab');
    t.innerHTML = ic('welcome', 'sm') + '<span>Hoş Geldiniz ekranı</span><button class="doc-close" aria-label="Hoş geldiniz ekranını kapat">×</button>';
    tabs.insertBefore(t, tabs.firstChild);
    t.addEventListener('click', (e) => {
      if (e.target.closest('.doc-close')) {
        e.stopPropagation();
        t.hidden = true;
        return CL.showWelcome(false);
      }
      CL.showWelcome(true);
    });
    const dnEl = document.getElementById('doc-name');
    const dt = dnEl ? dnEl.closest('.doc-tab') : null;
    if (dt) dt.addEventListener('click', () => CL.showWelcome(false));
    wl = document.createElement('section');
    wl.id = 'welcome';
    wl.hidden = true;
    docwin.style.position = 'relative';
    docwin.appendChild(wl);
    wl.addEventListener('click', async (e) => {
      const tb = e.target.closest('[data-wtab]');
      if (tb) {
        wlState.tab = tb.dataset.wtab;
        return render();
      }
      const b = e.target.closest('[data-wl]');
      if (!b) return;
      const k = b.dataset.wl;
      if (k === 'startup') {
        VP.settings.welcome = b.checked;
        return VP.io.savePrefs();
      }
      if (k === 'resume') return CL.showWelcome(false);
      if (k === 'new') {
        CL.showWelcome(false);
        return UI.run('new');
      }
      if (k === 'sizes') {
        // the New Document dialog has the page sizes
        return UI.run('new');
      }
      if (k === 'open' || k === 'import' || k === 'sample' || k === 'help') {
        CL.showWelcome(false);
        return UI.run(k);
      }
      if (k === 'hints') {
        CL.showWelcome(false);
        return UI.openDock('hints');
      }
      if (k.startsWith('ws:')) {
        CL.showWelcome(false);
        return VP.docx.applyWS(k.slice(3));
      }
      if (k === 'skin') {
        UI.run('skinToggle');
        return render();
      }
    });
    // shown by itself only on the first start; an existing drawing opens straight away
    if (CL.on() && VP.settings.welcome !== false && !CL._shown && !VP.hadSavedDoc) {
      CL._shown = true;
      setTimeout(() => CL.showWelcome(true), 50);
    }
  };
  VP.on('doc', () => CL.showWelcome(false));

  /* =============== actions =============== */
  Object.assign(A, {
    deskWhite: {
      label: 'Sayfa dışı beyaz', checked: () => VP.settings.desk !== 'theme',
      run: () => {
        VP.settings.desk = VP.settings.desk === 'theme' ? 'white' : 'theme';
        VP.io.savePrefs();
        CL.applyDesk();
        VP.drawPage();
        VP.toast('Sayfa dışı rengi: ' + (VP.settings.desk === 'theme' ? 'temaya göre gri' : 'beyaz'));
      }
    },
    skinToggle: {
      label: 'Klasik masaüstü görünümü', checked: () => CL.on(),
      run: () => {
        VP.settings.skin = CL.on() ? 'modern' : 'classic';
        VP.io.savePrefs();
        CL.apply();
        VP.toast('Arayüz görünümü: ' + (CL.on() ? 'klasik masaüstü' : 'modern'));
      }
    },
    welcomeScreen: { label: 'Hoş Geldiniz ekranı', icon: 'welcome', run: () => { const t = $('.welcome-tab'); if (t) t.hidden = false; CL.showWelcome(true); } },
    dockHints: { label: 'İpuçları', icon: 'hints', run: () => UI.openDock('hints') }
  });
  const M = UI.MENUS;
  if (M.window && !M.window.includes('skinToggle')) M.window.push('|', 'h:Arayüz görünümü', 'skinToggle', 'deskWhite', 'dockHints');
  if (M.view && !M.view.includes('deskWhite')) M.view.push('|', 'deskWhite');
  if (M.help && !M.help.includes('welcomeScreen')) M.help.unshift('welcomeScreen', '|');

  // Long menus: each titled section becomes a submenu ("Hizala ve dağıt ▸"), as in the desktop suite.
  CL.subMenus = (arr) => {
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const id = arr[i];
      if (typeof id === 'string' && id.startsWith('h:')) {
        const ids = [];
        let j = i + 1;
        for (; j < arr.length && arr[j] !== '|' && !String(arr[j]).startsWith('h:'); j++) ids.push(arr[j]);
        if (ids.length > 1) out.push('sub:' + id.slice(2) + '|' + ids.join(','));
        else out.push(...ids);
        i = j - 1;
      } else out.push(id);
    }
    // no separators twice in a row, none at the ends
    return out.filter((x, k, a) => !(x === '|' && (k === 0 || a[k - 1] === '|' || k === a.length - 1)));
  };
  // the welcome tab and the rest need the page in place
  const ready = () => {
    try {
      if (M.object && M.object.length > 40) M.object = CL.subMenus(M.object);
      initWelcome();
      CL.apply();
    } catch (e) {
      console.error(e);
    }
  };
  if (document.readyState === 'complete') setTimeout(ready, 0);
  else addEventListener('load', () => setTimeout(ready, 0));
})();
