/* VektörPad common shapes ("perfect shapes"): basic, arrow, flowchart, banner and callout shapes.
   Each shape is drawn in a 100×100 box from SVG path data (or built with paper operations) and stays
   parametric: kind 'perfect' with an adjust value (the glyph handle of the desktop suite). */
(function () {
  'use strict';
  const VP = window.VP;
  const SH = (VP.perfect = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const r1 = (v) => Math.round(v * 100) / 100;
  const circle = (cx, cy, r) => 'M' + (cx - r) + ' ' + cy + 'A' + r + ' ' + r + ' 0 1 0 ' + (cx + r) + ' ' + cy + 'A' + r + ' ' + r + ' 0 1 0 ' + (cx - r) + ' ' + cy + 'Z';
  const jag = (n, ro, ri, seed) => {
    let s = 'M';
    for (let i = 0; i < n * 2; i++) {
      const k = Math.sin(i * 12.9898 + seed) * 43758.5453;
      const jit = 0.85 + 0.3 * (k - Math.floor(k));
      const r = (i % 2 ? ri : ro) * jit;
      const a = (Math.PI * 2 * i) / (n * 2) - Math.PI / 2;
      s += r1(50 + Math.cos(a) * r * 50) + ' ' + r1(50 + Math.sin(a) * r * 50) + (i < n * 2 - 1 ? 'L' : 'Z');
    }
    return s;
  };
  // category → { id: [label, defaultAdjust | null, (a) => pathData, evenodd?] }
  SH.CATS = {
    basic: ['Temel şekiller', {
      parallelogram: ['Paralelkenar', 0.25, (a) => { const s = a * 45; return 'M' + s + ' 0L100 0L' + (100 - s) + ' 100L0 100Z'; }],
      trapezoid: ['Yamuk', 0.25, (a) => { const s = a * 45; return 'M' + s + ' 0L' + (100 - s) + ' 0L100 100L0 100Z'; }],
      diamond: ['Eşkenar dörtgen', null, () => 'M50 0L100 50L50 100L0 50Z'],
      triangle: ['Üçgen', 0.5, (a) => 'M' + a * 100 + ' 0L100 100L0 100Z'],
      rightTriangle: ['Dik üçgen', null, () => 'M0 0L100 100L0 100Z'],
      hexagon: ['Altıgen', 0.25, (a) => { const s = a * 50; return 'M' + s + ' 0L' + (100 - s) + ' 0L100 50L' + (100 - s) + ' 100L' + s + ' 100L0 50Z'; }],
      octagon: ['Sekizgen', 0.3, (a) => { const s = a * 50; return 'M' + s + ' 0L' + (100 - s) + ' 0L100 ' + s + 'L100 ' + (100 - s) + 'L' + (100 - s) + ' 100L' + s + ' 100L0 ' + (100 - s) + 'L0 ' + s + 'Z'; }],
      cross: ['Artı', 0.35, (a) => { const t = a * 100; const c0 = 50 - t / 2; const c1 = 50 + t / 2; return 'M' + c0 + ' 0H' + c1 + 'V' + c0 + 'H100V' + c1 + 'H' + c1 + 'V100H' + c0 + 'V' + c1 + 'H0V' + c0 + 'H' + c0 + 'Z'; }],
      frame: ['Çerçeve', 0.15, (a) => { const t = a * 50; return 'M0 0H100V100H0Z M' + t + ' ' + t + 'V' + (100 - t) + 'H' + (100 - t) + 'V' + t + 'Z'; }, true],
      donut: ['Halka', 0.35, (a) => circle(50, 50, 50) + ' ' + circle(50, 50, 50 * (1 - a)), true],
      heart: ['Kalp', null, () => 'M50 92C20 70 0 52 0 30C0 12 14 2 28 2C40 2 47 10 50 18C53 10 60 2 72 2C86 2 100 12 100 30C100 52 80 70 50 92Z'],
      lightning: ['Şimşek', null, () => 'M58 0L18 55L45 55L32 100L82 38L54 38L70 0Z'],
      moon: ['Hilal', 0.5, (a) => { const rx = 20 + a * 30; return 'M62 0A50 50 0 1 0 62 100A' + rx + ' 50 0 1 1 62 0Z'; }],
      teardrop: ['Damla', null, () => 'M50 0C70 30 100 48 100 68C100 86 77 100 50 100C23 100 0 86 0 68C0 48 30 30 50 0Z'],
      smiley: ['Gülen yüz', null, () => circle(50, 50, 50) + ' ' + circle(33, 38, 6) + ' ' + circle(67, 38, 6) + ' M27 60Q50 86 73 60Q50 74 27 60Z', true],
      cylinder: ['Silindir', 0.12, (a) => { const e = a * 100; return 'M0 ' + e + 'A50 ' + e + ' 0 0 1 100 ' + e + 'V' + (100 - e) + 'A50 ' + e + ' 0 0 1 0 ' + (100 - e) + 'Z M0 ' + e + 'A50 ' + e + ' 0 0 0 100 ' + e; }],
      cube: ['Küp', 0.25, (a) => { const d = a * 60; return 'M0 ' + d + 'H' + (100 - d) + 'V100H0Z M0 ' + d + 'L' + d + ' 0H100L' + (100 - d) + ' ' + d + 'Z M' + (100 - d) + ' ' + d + 'L100 0V' + (100 - d) + 'L' + (100 - d) + ' 100Z'; }],
      ban: ['Yasak işareti', 0.16, null]
    }],
    arrow: ['Ok şekilleri', {
      right: ['Sağ ok', 0.4, (a) => { const h = a * 100; return 'M0 30H' + (100 - h) + 'V0L100 50L' + (100 - h) + ' 100V70H0Z'; }],
      left: ['Sol ok', 0.4, (a) => { const h = a * 100; return 'M100 30H' + h + 'V0L0 50L' + h + ' 100V70H100Z'; }],
      up: ['Yukarı ok', 0.4, (a) => { const h = a * 100; return 'M30 100V' + h + 'H0L50 0L100 ' + h + 'H70V100Z'; }],
      down: ['Aşağı ok', 0.4, (a) => { const h = a * 100; return 'M30 0V' + (100 - h) + 'H0L50 100L100 ' + (100 - h) + 'H70V0Z'; }],
      leftRight: ['Sol-sağ ok', 0.3, (a) => { const h = a * 50; return 'M0 50L' + h + ' 0V30H' + (100 - h) + 'V0L100 50L' + (100 - h) + ' 100V70H' + h + 'V100Z'; }],
      upDown: ['Yukarı-aşağı ok', 0.3, (a) => { const h = a * 50; return 'M50 0L100 ' + h + 'H70V' + (100 - h) + 'H100L50 100L0 ' + (100 - h) + 'H30V' + h + 'H0Z'; }],
      quad: ['Dört yönlü ok', null, () => 'M50 0L68 18H58V42H82V32L100 50L82 68V58H58V82H68L50 100L32 82H42V58H18V68L0 50L18 32V42H42V18H32Z'],
      chevron: ['Şerit ok', 0.35, (a) => { const s = a * 50; return 'M0 0H' + (100 - s) + 'L100 50L' + (100 - s) + ' 100H0L' + s + ' 50Z'; }],
      pentagon: ['Ev ok', 0.3, (a) => { const s = a * 50; return 'M0 0H' + (100 - s) + 'L100 50L' + (100 - s) + ' 100H0Z'; }],
      notched: ['Çentikli ok', 0.4, (a) => { const h = a * 100; return 'M0 30H' + (100 - h) + 'V0L100 50L' + (100 - h) + ' 100V70H0L14 50Z'; }],
      uturn: ['U dönüş oku', null, () => 'M10 100V45A35 35 0 0 1 80 45V60H100L70 95L40 60H60V45A15 15 0 0 0 30 45V100Z']
    }],
    flow: ['Akış diyagramı', {
      process: ['İşlem', null, () => 'M0 0H100V100H0Z'],
      altProcess: ['Alternatif işlem', null, () => 'M15 0H85A15 15 0 0 1 100 15V85A15 15 0 0 1 85 100H15A15 15 0 0 1 0 85V15A15 15 0 0 1 15 0Z'],
      decision: ['Karar', null, () => 'M50 0L100 50L50 100L0 50Z'],
      data: ['Veri', null, () => 'M20 0H100L80 100H0Z'],
      predefined: ['Önceden tanımlı işlem', null, () => 'M0 0H100V100H0Z M12 0V100 M88 0V100'],
      internal: ['İç depolama', null, () => 'M0 0H100V100H0Z M14 0V100 M0 14H100'],
      document: ['Belge', null, () => 'M0 0H100V85C75 70 60 105 30 95C18 91 8 88 0 90Z'],
      multiDoc: ['Çoklu belge', null, () => 'M0 15H85V97C65 85 52 110 26 102C16 99 7 97 0 99Z M7 15V8H92V90H85 M14 8V0H100V83H92'],
      terminator: ['Sonlandırıcı', null, () => 'M25 0H75A25 50 0 0 1 75 100H25A25 50 0 0 1 25 0Z'],
      preparation: ['Hazırlık', null, () => 'M20 0H80L100 50L80 100H20L0 50Z'],
      manualInput: ['Elle giriş', null, () => 'M0 25L100 0V100H0Z'],
      manualOp: ['Elle işlem', null, () => 'M0 0H100L80 100H20Z'],
      connector: ['Bağlayıcı', null, () => circle(50, 50, 50)],
      offPage: ['Sayfa dışı bağlayıcı', null, () => 'M0 0H100V70L50 100L0 70Z'],
      card: ['Kart', null, () => 'M20 0H100V100H0V20Z'],
      tape: ['Delikli şerit', null, () => 'M0 10C25 25 25 -5 50 10C75 25 75 -5 100 10V90C75 75 75 105 50 90C25 75 25 105 0 90Z'],
      summing: ['Toplama bağlantısı', null, () => circle(50, 50, 50) + ' M14.6 14.6L85.4 85.4 M85.4 14.6L14.6 85.4'],
      or: ['Veya', null, () => circle(50, 50, 50) + ' M50 0V100 M0 50H100'],
      collate: ['Harmanla', null, () => 'M0 0H100L0 100H100Z'],
      sort: ['Sırala', null, () => 'M50 0L100 50L50 100L0 50Z M0 50H100'],
      extract: ['Ayıkla', null, () => 'M50 0L100 100H0Z'],
      merge: ['Birleştir', null, () => 'M0 0H100L50 100Z'],
      stored: ['Depolanan veri', null, () => 'M15 0H100C90 25 90 75 100 100H15C3 75 3 25 15 0Z'],
      delay: ['Gecikme', null, () => 'M0 0H60A40 50 0 0 1 60 100H0Z'],
      disk: ['Manyetik disk', null, () => 'M0 12A50 12 0 0 1 100 12V88A50 12 0 0 1 0 88Z M0 12A50 12 0 0 0 100 12'],
      display: ['Ekran', null, () => 'M0 50L20 0H80C100 15 100 85 80 100H20Z']
    }],
    banner: ['Pankart şekilleri', {
      ribbon: ['Kurdele', 0.2, (a) => { const t = a * 100; return 'M0 ' + (t + 10) + 'H18V' + t + 'H82V' + (t + 10) + 'H100L88 ' + (t + 40) + 'L100 ' + (t + 70) + 'H70V' + (100 - 10) + 'H30V' + (t + 70) + 'H0L12 ' + (t + 40) + 'Z'; }],
      wave: ['Dalgalı bayrak', null, () => 'M0 15C25 -5 50 35 75 15C88 5 95 5 100 10V85C75 105 50 65 25 85C12 95 5 95 0 90Z'],
      doubleWave: ['Çift dalga', null, () => 'M0 15C17 -5 33 35 50 15C67 -5 83 35 100 15V85C83 105 67 65 50 85C33 105 17 65 0 85Z'],
      scroll: ['Rulo', null, () => 'M10 8H92A8 8 0 0 1 92 24H86V92H8A8 8 0 0 1 8 76H14V8 M14 24H92 M8 76H86'],
      explosion1: ['Patlama 1', null, () => jag(12, 1, 0.62, 1)],
      explosion2: ['Patlama 2', null, () => jag(16, 1, 0.72, 7)]
    }],
    callout: ['Not şekilleri', {
      rectCallout: ['Dikdörtgen not', 0.2, (a) => { const tip = a * 100; return 'M0 0H100V75H42L' + tip + ' 100L26 75H0Z'; }],
      roundCallout: ['Yuvarlak köşeli not', 0.2, (a) => { const tip = a * 100; return 'M12 0H88A12 12 0 0 1 100 12V63A12 12 0 0 1 88 75H42L' + tip + ' 100L26 75H12A12 12 0 0 1 0 63V12A12 12 0 0 1 12 0Z'; }],
      ovalCallout: ['Oval not', 0.25, null],
      cloudCallout: ['Bulut not', 0.2, null],
      lineCallout: ['Çizgili not', 0.15, (a) => 'M0 0H100V68H0Z M30 68L' + a * 100 + ' 100']
    }]
  };
  // shapes built from boolean operations
  const MAKE = {
    ban: (a) => {
      const o = new paper.Path.Circle({ center: [50, 50], radius: 50, insert: false });
      const i = new paper.Path.Circle({ center: [50, 50], radius: 50 * (1 - a), insert: false });
      const ring = o.subtract(i, { insert: false });
      const bar = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(0, 50 - a * 45, 100, a * 90), insert: false });
      bar.rotate(45, Pt(50, 50));
      return ring.unite(bar.intersect(o, { insert: false }), { insert: false });
    },
    ovalCallout: (a) => {
      const body = new paper.Path.Ellipse({ rectangle: new paper.Rectangle(0, 0, 100, 76), insert: false });
      const tail = new paper.Path({ segments: [[34, 62], [a * 100, 100], [50, 70]], closed: true, insert: false });
      return body.unite(tail, { insert: false });
    },
    cloudCallout: (a) => {
      let body = new paper.Path.Ellipse({ rectangle: new paper.Rectangle(10, 10, 80, 52), insert: false });
      [[22, 22, 16], [44, 14, 18], [68, 16, 17], [84, 34, 15], [70, 58, 15], [44, 62, 16], [20, 54, 15], [10, 38, 13]].forEach(([x, y, r]) => {
        body = body.unite(new paper.Path.Circle({ center: [x, y], radius: r, insert: false }), { insert: false });
      });
      const tx = a * 100;
      const bubbles = [[tx * 0.5 + 25, 84, 5], [tx * 0.8 + 10, 93, 3.4]].map(([x, y, r]) => new paper.Path.Circle({ center: [x, y], radius: r, insert: false }));
      return new paper.CompoundPath({ children: [body].concat(bubbles).map((p) => (p instanceof paper.CompoundPath ? p.children.slice() : [p])).flat().map((p) => p.clone({ insert: false })), insert: false });
    }
  };
  SH.find = (id) => {
    for (const k of Object.keys(SH.CATS)) if (SH.CATS[k][1][id]) return SH.CATS[k][1][id];
    return null;
  };
  // Unit-box geometry for a shape (CompoundPath in 0..100).
  SH.unit = (id, a) => {
    const def = SH.find(id) || SH.CATS.basic[1].diamond;
    const adj = a == null ? def[1] || 0 : a;
    let item;
    if (!def[2] && MAKE[id]) item = MAKE[id](adj);
    else item = new paper.CompoundPath({ pathData: def[2](adj), insert: false });
    if (!(item instanceof paper.CompoundPath)) item = new paper.CompoundPath({ children: [item], insert: false });
    item.fillRule = def[3] ? 'evenodd' : 'nonzero';
    if (!def[3]) item.children.forEach((c) => c.closed && (c.clockwise = true));
    return item;
  };
  // Parametric builder hook: kind 'perfect' {shape, adj, cx, cy, w, h, angle, fx, fy}
  const build0 = VP.buildParamPath;
  VP.buildParamPath = (p) => {
    if (p.kind === 'perfect') {
      const it = SH.unit(p.shape, p.adj);
      const w = Math.max(Math.abs(p.w), 0.01);
      const h = Math.max(Math.abs(p.h), 0.01);
      it.translate(Pt(-50, -50));
      it.scale((w / 100) * (p.fx ? -1 : 1), (h / 100) * (p.fy ? -1 : 1), Pt(0, 0));
      if (p.angle) it.rotate(p.angle, Pt(0, 0));
      it.translate(Pt(p.cx, p.cy));
      return it;
    }
    if (p.kind === 'cstar') return cstar(p);
    return build0(p);
  };
  // Complex star: n points joined every k-th, filled even-odd like the desktop suite.
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const cstar = (p) => {
    const n = Math.max(5, Math.round(p.sides || 9));
    let k = Math.round(p.step || 2) + 1;
    k = Math.max(2, Math.min(k, Math.floor((n - 1) / 2)));
    const g = gcd(n, k);
    const w = Math.max(Math.abs(p.w), 0.01) / 2;
    const h = Math.max(Math.abs(p.h), 0.01) / 2;
    const loops = [];
    for (let s = 0; s < g; s++) {
      const segs = [];
      for (let i = 0; i < n / g; i++) {
        const idx = (s + i * k) % n;
        const ang = ((-90 + (360 * idx) / n) * Math.PI) / 180;
        segs.push(Pt(Math.cos(ang) * w, Math.sin(ang) * h));
      }
      loops.push(new paper.Path({ segments: segs, closed: true, insert: false }));
    }
    const cp = new paper.CompoundPath({ children: loops, insert: false });
    cp.fillRule = 'evenodd';
    if (p.angle) cp.rotate(p.angle, Pt(0, 0));
    cp.translate(Pt(p.cx, p.cy));
    return cp;
  };
  // compound results replace the children instead of the segments
  const rebuild0 = VP.rebuildParam;
  VP.rebuildParam = (item) => {
    const k = item.data.param.kind;
    if (k !== 'perfect' && k !== 'cstar') return rebuild0(item);
    const np = VP.buildParamPath(item.data.param);
    if (item instanceof paper.CompoundPath) {
      item.removeChildren();
      item.addChildren(np.removeChildren());
      item.fillRule = np.fillRule;
    }
  };
  Object.assign(VP.KIND_NAMES, { perfect: 'Hazır şekil', cstar: 'Karmaşık yıldız' });
  const kind0 = VP.kindOf;
  VP.kindOf = (it) => (it && it.data && it.data.param && (it.data.param.kind === 'perfect' || it.data.param.kind === 'cstar') ? it.data.param.kind : kind0(it));
  const desc0 = VP.describe;
  VP.describe = (it) => {
    if (it && it.data && it.data.param && it.data.param.kind === 'perfect' && !it.data.label) {
      const d = SH.find(it.data.param.shape);
      return d ? d[0] : 'Hazır şekil';
    }
    return desc0(it);
  };
  // small SVG preview of a shape for pickers
  SH.icon = (id) => {
    const it = SH.unit(id);
    const d = it.pathData;
    return '<svg viewBox="-6 -6 112 112" width="34" height="34" aria-hidden="true"><path d="' + d + '" fill="currentColor" fill-opacity=".18" fill-rule="' + it.fillRule + '" stroke="currentColor" stroke-width="5" vector-effect="non-scaling-stroke"/></svg>';
  };
})();
