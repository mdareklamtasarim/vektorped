/* VektörPad, CorelDRAW 2026 look and behaviour: canvas part.
   The drawing window and everything around it: rulers, page, selection / node handles, marquee,
   scroll bars with the navigator button, page navigator, document palette, status bar and the
   colour palette. Everything is drawn here (canvas / inline SVG); no other program's artwork is used.
   Only active in the classic skin; the modern skin keeps the previous functions. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const T = VP.tools;
  const esc = UI.h.esc;
  const ic = UI.h.ic;
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  const Pt = (x, y) => new paper.Point(x, y);
  const CL = () => !VP.classic || VP.classic.on();
  const dark = () => root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  const cssVar = (n, d) => (getComputedStyle(root).getPropertyValue(n) || '').trim() || d;
  const C = (VP.cCanvas = {});

  /* ======================= small SVG glyphs (own drawings) ======================= */
  const svg = (w, h, body, cls) => '<svg class="c-g' + (cls ? ' ' + cls : '') + '" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' + body + '</svg>';
  const G = {
    first: svg(10, 10, '<path d="M2 2v6" stroke="currentColor" stroke-width="1.2"/><path d="M8.5 2L3.5 5l5 3z" fill="currentColor"/>'),
    prev: svg(10, 10, '<path d="M7.5 2L2.5 5l5 3z" fill="currentColor"/>'),
    next: svg(10, 10, '<path d="M2.5 2l5 3-5 3z" fill="currentColor"/>'),
    last: svg(10, 10, '<path d="M8 2v6" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 2l5 3-5 3z" fill="currentColor"/>'),
    addPage: svg(12, 12, '<circle cx="6" cy="6" r="5.3" fill="currentColor"/><path d="M6 3.2v5.6M3.2 6h5.6" stroke="var(--cv-bar)" stroke-width="1.4"/>'),
    chevR: svg(8, 10, '<path d="M2.5 1.5L6 5 2.5 8.5" fill="none" stroke="currentColor" stroke-width="1.3"/>'),
    chevL: svg(8, 10, '<path d="M5.5 1.5L2 5l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.3"/>'),
    chevU: svg(10, 8, '<path d="M1.5 6L5 2.5 8.5 6" fill="none" stroke="currentColor" stroke-width="1.3"/>'),
    chevD: svg(10, 8, '<path d="M1.5 2L5 5.5 8.5 2" fill="none" stroke="currentColor" stroke-width="1.3"/>'),
    dblR: svg(10, 10, '<path d="M1.5 2l3 3-3 3M5.5 2l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.1"/>'),
    grip: svg(4, 14, '<g fill="currentColor"><rect x="0" y="1" width="1" height="1"/><rect x="3" y="1" width="1" height="1"/><rect x="0" y="4" width="1" height="1"/><rect x="3" y="4" width="1" height="1"/><rect x="0" y="7" width="1" height="1"/><rect x="3" y="7" width="1" height="1"/><rect x="0" y="10" width="1" height="1"/><rect x="3" y="10" width="1" height="1"/><rect x="0" y="13" width="1" height="1"/><rect x="3" y="13" width="1" height="1"/></g>'),
    // colour eyedropper as in the palettes: orange body, light tip
    dropper: svg(14, 14, '<path d="M9.6 1.6a1.9 1.9 0 012.8 2.8l-1.6 1.6-2.8-2.8z" fill="#e8823a"/><path d="M8.3 3.9L2.7 9.5l-.6 2.4 2.4-.6 5.6-5.6z" fill="#5aa7e6" stroke="#cfe6fa" stroke-width=".6"/><path d="M7.6 3.2l3.2 3.2" stroke="#f3b27c" stroke-width="1"/>'),
    gear: svg(16, 16, '<path d="M8 1.6l1.1.2.3 1.6 1 .5 1.4-.9 1.5 1.5-.9 1.4.4 1 1.6.3v2.2l-1.6.3-.4 1 .9 1.4-1.5 1.5-1.4-.9-1 .4-.3 1.6H6.9l-.3-1.6-1-.4-1.4.9-1.5-1.5.9-1.4-.4-1L1.6 9.1V6.9l1.6-.3.4-1-.9-1.4 1.5-1.5 1.4.9 1-.5.3-1.6z" fill="currentColor"/><circle cx="8" cy="8" r="2.3" fill="var(--cv-bar)"/><path d="M13 13.5h3l-1.5 1.8z" fill="currentColor"/>', 'c-g-gear'),
    // status bar fill: paint bucket with a small colour drop
    bucket: svg(16, 16, '<path d="M6.2 2.2l6 6-4.6 4.6a1.4 1.4 0 01-2 0L2 9.2a1.4 1.4 0 010-2z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.6 8.2h8.6L7.6 11.9a1.2 1.2 0 01-1.7 0z" fill="currentColor" opacity=".55"/><path d="M5.2 1.2l2.4 2.4" stroke="currentColor" stroke-width="1.2"/><path d="M13.6 10.4s1.4 1.7 1.4 2.6a1.4 1.4 0 01-2.8 0c0-.9 1.4-2.6 1.4-2.6z" fill="#e23b3b"/>'),
    // status bar outline: pen nib
    nib: svg(16, 16, '<path d="M8 1.5c1.6 2.2 3.4 4.6 3.4 7.2L9.6 13H6.4L4.6 8.7C4.6 6.1 6.4 3.7 8 1.5z" fill="none" stroke="currentColor" stroke-width="1.15"/><path d="M8 4.2v4.2" stroke="currentColor" stroke-width="1"/><circle cx="8" cy="9" r="1" fill="currentColor"/><path d="M6 14.6h4" stroke="currentColor" stroke-width="1.2"/>'),
    // colour management: small monitor with colour bands
    cm: svg(18, 16, '<rect x="1" y="1.5" width="16" height="11" rx="1" fill="#e9eef5"/><rect x="2.2" y="2.7" width="13.6" height="3" fill="#2f74c8"/><rect x="2.2" y="5.7" width="13.6" height="3" fill="#d8443c"/><rect x="2.2" y="8.7" width="13.6" height="2.6" fill="#4aa3df"/><path d="M6 14.5h6" stroke="#9aa6b2" stroke-width="1.4"/>'),
    zoomNav: svg(16, 16, '<circle cx="6.6" cy="6.6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10 10l4.4 4.4" stroke="currentColor" stroke-width="1.8"/><path d="M4.4 6.6h4.4M6.6 4.4v4.4" stroke="currentColor" stroke-width="1"/>'),
    rulerCorner: svg(12, 12, '<path d="M1.5 4.5V1.5h3M7.5 1.5h3v3M10.5 7.5v3h-3M4.5 10.5h-3v-3" fill="none" stroke="currentColor" stroke-width="1"/><path d="M6 3.5v5M3.5 6h5" stroke="currentColor" stroke-width="1"/>')
  };
  C.G = G;

  /* ======================= Corel default CMYK palette ======================= */
  // [screen colour, name, C, M, Y, K]; colours read off the reference screenshots where visible
  const CPAL = [
    ['#1d1d1b', 'Siyah', 0, 0, 0, 100], ['#30302e', '%90 Siyah', 0, 0, 0, 90], ['#4a4a4a', '%80 Siyah', 0, 0, 0, 80],
    ['#666666', '%70 Siyah', 0, 0, 0, 70], ['#828282', '%60 Siyah', 0, 0, 0, 60], ['#989898', '%50 Siyah', 0, 0, 0, 50],
    ['#acadad', '%40 Siyah', 0, 0, 0, 40], ['#c1c2c1', '%30 Siyah', 0, 0, 0, 30], ['#d8d9d9', '%20 Siyah', 0, 0, 0, 20],
    ['#ededed', '%10 Siyah', 0, 0, 0, 10], ['#ffffff', 'Beyaz', 0, 0, 0, 0],
    ['#312783', 'Mavi', 100, 100, 0, 0], ['#00a0e3', 'Camgöbeği', 100, 0, 0, 0], ['#009640', 'Yeşil', 100, 0, 100, 0],
    ['#ffed00', 'Sarı', 0, 0, 100, 0], ['#e30613', 'Kırmızı', 0, 100, 100, 0], ['#e5007e', 'Macenta', 0, 100, 0, 0],
    ['#a3348a', 'Mor', 20, 80, 0, 20], ['#ef7d00', 'Turuncu', 0, 60, 100, 0], ['#f9b1b7', 'Pembe', 0, 40, 20, 0],
    ['#85746a', 'Koyu Kahverengi', 0, 20, 20, 60], ['#d9d5f1', 'Pudra Mavisi', 20, 20, 0, 0], ['#ada3df', 'Pastel Mavi', 40, 40, 0, 0],
    ['#7a94cd', 'Bebek Mavisi', 60, 40, 0, 0], ['#8874c3', 'Elektrik Mavisi', 60, 60, 0, 0], ['#948cb2', 'Alacakaranlık Mavisi', 40, 40, 0, 20],
    ['#4f5f86', 'Lacivert', 60, 40, 0, 40], ['#514a7a', 'Koyu Lacivert', 60, 60, 0, 40], ['#73849a', 'Çöl Mavisi', 40, 20, 0, 40],
    ['#0092c8', 'Gök Mavisi', 100, 20, 0, 0], ['#b0ddf0', 'Buz Mavisi', 40, 0, 0, 0], ['#b4c7d5', 'Açık Mavi Yeşil', 20, 0, 0, 20],
    ['#91a2aa', 'Okyanus Yeşili', 20, 0, 0, 40], ['#6c787f', 'Yosun Yeşili', 20, 0, 0, 60], ['#3f494c', 'Koyu Yeşil', 20, 0, 0, 80],
    ['#536f6e', 'Orman Yeşili', 40, 0, 20, 60], ['#50897d', 'Çimen Yeşili', 60, 0, 40, 40], ['#749793', 'Kentucky Yeşili', 40, 0, 20, 40],
    ['#63b09e', 'Açık Yeşil', 60, 0, 40, 20], ['#66a974', 'Bahar Yeşili', 60, 0, 60, 20], ['#7fd6dc', 'Turkuaz', 60, 0, 20, 0],
    ['#61b0b4', 'Deniz Yeşili', 60, 0, 20, 20], ['#b8c7b6', 'Soluk Yeşil', 20, 0, 20, 20], ['#dff9dd', 'Hayalet Yeşili', 20, 0, 20, 0],
    ['#b5efbd', 'Nane Yeşili', 40, 0, 40, 0], ['#929f88', 'Asker Yeşili', 20, 0, 20, 40], ['#949e78', 'Avokado Yeşili', 20, 0, 40, 40],
    ['#bec576', 'Marslı Yeşili', 20, 0, 60, 20], ['#bbc58b', 'Mat Yeşil', 20, 0, 40, 20], ['#b9d602', 'Fıstık Yeşili', 20, 0, 100, 0],
    ['#e8f291', 'Ay Yeşili', 20, 0, 60, 0], ['#4b4b3f', 'Bulanık Yeşil', 0, 0, 20, 80], ['#7d7c6a', 'Zeytin Haki', 0, 0, 20, 60],
    ['#adaa8c', 'Haki', 0, 0, 20, 40], ['#a59f6c', 'Zeytin', 0, 0, 40, 40], ['#dcce74', 'Muz Sarısı', 0, 0, 60, 20],
    ['#fdef8f', 'Açık Sarı', 0, 0, 60, 0], ['#fef5b6', 'Tebeşir', 0, 0, 40, 0], ['#fffee1', 'Soluk Sarı', 0, 0, 20, 0],
    ['#a99273', 'Kahverengi', 0, 20, 40, 40], ['#cc9363', 'Kızıl Kahve', 0, 40, 60, 20], ['#d1b26a', 'Altın', 0, 20, 60, 20],
    ['#f9843d', 'Sonbahar Turuncusu', 0, 60, 80, 0], ['#f8ac56', 'Açık Turuncu', 0, 40, 80, 0], ['#fbb17a', 'Şeftali', 0, 40, 60, 0],
    ['#f6ca00', 'Koyu Sarı', 0, 20, 100, 0], ['#fedaaa', 'Kum', 0, 20, 40, 0], ['#7e6f58', 'Ceviz', 0, 20, 40, 60],
    ['#a05b45', 'Yakut Kırmızısı', 0, 60, 60, 40], ['#c4602f', 'Tuğla Kırmızısı', 0, 60, 80, 20], ['#f18c6f', 'Tropik Pembe', 0, 60, 60, 0],
    ['#f6b096', 'Yumuşak Pembe', 0, 40, 40, 0], ['#fbd6c8', 'Soluk Pembe', 0, 20, 20, 0], ['#a3555a', 'Koyu Kırmızı', 0, 60, 40, 40],
    ['#c86a6f', 'Asil Kırmızı', 0, 60, 40, 20], ['#c56a86', 'Koyu Gül', 0, 60, 20, 20], ['#e40e45', 'Neon Kırmızı', 0, 100, 60, 0],
    ['#ef8a8c', 'Koyu Pembe', 0, 60, 40, 0], ['#ea5f78', 'Sıcak Pembe', 0, 80, 40, 0], ['#cf9a9f', 'Tozlu Gül', 0, 40, 20, 20],
    ['#9c5a83', 'Erik', 0, 60, 0, 40], ['#c06c9e', 'Koyu Menekşe', 0, 60, 0, 20], ['#f2b3d2', 'Açık Menekşe', 0, 40, 0, 0],
    ['#cd98b2', 'Menekşe', 0, 40, 0, 20], ['#a6939d', 'Tozlu Erik', 0, 20, 0, 40], ['#f8daea', 'Soluk Mor', 0, 20, 0, 0],
    ['#a6689d', 'Görkemli Mor', 20, 60, 0, 20], ['#c3539b', 'Neon Mor', 20, 80, 0, 0], ['#cc7fb4', 'Açık Mor', 20, 60, 0, 0],
    ['#ad94bd', 'Alacakaranlık Moru', 20, 40, 0, 20], ['#d1aed3', 'Lavanta', 20, 40, 0, 0]
  ];
  const cmykStr = (c) => 'C:' + c[0] + ' M:' + c[1] + ' Y:' + c[2] + ' K:' + c[3];
  const CMYK = new Map();
  CPAL.forEach((e) => CMYK.set(e[0], e.slice(2)));
  // colours of the earlier VektörPad palette keep their process values
  [['#9d9d9c', [0, 0, 0, 50]], ['#c6c6c6', [0, 0, 0, 30]], ['#706f6f', [0, 0, 0, 70]], ['#f9b200', [0, 35, 100, 0]], ['#c8d400', [30, 0, 100, 0]], ['#3aaa35', [75, 0, 100, 0]],
    ['#00843d', [90, 0, 100, 10]], ['#00a19a', [85, 0, 45, 0]], ['#0069b4', [100, 50, 0, 0]], ['#2d2e83', [100, 90, 0, 0]], ['#662483', [75, 100, 0, 0]], ['#a3195b', [30, 100, 0, 20]],
    ['#f39fc5', [0, 45, 0, 0]], ['#a6d8f0', [35, 0, 0, 0]], ['#fff7b2', [0, 0, 35, 0]], ['#c49a6c', [25, 40, 60, 0]], ['#7d4e24', [30, 70, 100, 30]], ['#000000', [0, 0, 0, 100]]
  ].forEach(([h, c]) => !CMYK.has(h) && CMYK.set(h, c));
  C.CMYK = CMYK;
  // the palette array is shared with vp-ui (recent colours) and the palette manager: replace its contents
  if (Array.isArray(UI.PALETTE)) {
    UI.PALETTE.length = 0;
    CPAL.forEach((e) => UI.PALETTE.push([e[0], e[1] + ' · ' + cmykStr(e.slice(2))]));
  }
  const colorText = (hex) => {
    if (!hex) return 'Yok';
    const h = String(hex).toLowerCase();
    const c = CMYK.get(h);
    if (c) return cmykStr(c);
    try {
      const col = new paper.Color(h);
      return 'R:' + Math.round(col.red * 255) + ' G:' + Math.round(col.green * 255) + ' B:' + Math.round(col.blue * 255) + ' (' + h.toUpperCase() + ')';
    } catch (e) {
      return h;
    }
  };
  C.colorText = colorText;

  /* ======================= page on the desktop ======================= */
  const dp0 = VP.drawPage;
  VP.drawPage = () => {
    dp0();
    if (!CL() || !VP.bgLayer) return;
    const p = VP.page();
    const r = VP.bgLayer.children.find((c) => c instanceof paper.Path && Math.abs(c.bounds.width - p.w) < 1e-6 && Math.abs(c.bounds.height - p.h) < 1e-6 && c.name !== 'grid');
    if (!r) return;
    if (VP.settings.desk === 'theme') {
      // Corel: a plain white page straight on the grey desktop, no border, no shadow
      r.strokeColor = null;
      r.shadowColor = null;
    } else {
      // white desktop: the page needs a fine edge and a small drop shadow to be seen
      r.strokeColor = new paper.Color('#8c8c8c');
      r.strokeWidth = 1;
      r.strokeScaling = false;
      r.shadowColor = new paper.Color(0, 0, 0, 0.28);
      r.shadowBlur = 0;
      r.shadowOffset = Pt(3, 3);
    }
  };

  /* ======================= selection handles ======================= */
  const INK = () => new paper.Color('#000000');
  const RIM = () => new paper.Color(1, 1, 1, 0.9);
  // handles sit a few pixels outside the selection box, as in Corel
  const OUT = () => 6;
  const handlePts = (b) => {
    const o = OUT() / paper.view.zoom;
    const e = b.expand(o * 2);
    return [
      { id: 'tl', p: e.topLeft, kind: 'corner', d: Pt(-1, -1) }, { id: 'tc', p: e.topCenter, kind: 'edge', d: Pt(0, -1) },
      { id: 'tr', p: e.topRight, kind: 'corner', d: Pt(1, -1) }, { id: 'mr', p: e.rightCenter, kind: 'edge', d: Pt(1, 0) },
      { id: 'br', p: e.bottomRight, kind: 'corner', d: Pt(1, 1) }, { id: 'bc', p: e.bottomCenter, kind: 'edge', d: Pt(0, 1) },
      { id: 'bl', p: e.bottomLeft, kind: 'corner', d: Pt(-1, 1) }, { id: 'ml', p: e.leftCenter, kind: 'edge', d: Pt(-1, 0) }
    ];
  };
  C.handlePts = handlePts;
  const hit0 = VP.hitHandle;
  VP.hitHandle = (pt) => {
    if (!CL()) return hit0(pt);
    VP.pruneSel();
    if (!VP.sel.length) return null;
    const b = VP.selBounds();
    const z = paper.view.zoom;
    // small to see, generous to grab: a finger-sized invisible hit radius
    const tol = (VP.coarse ? 24 : 11) / z;
    if (VP.handleMode === 'rotate') {
      const c = VP.pivot || b.center;
      if (c.getDistance(pt) <= tol * 0.8) return { id: 'pivot', kind: 'pivot', p: c };
    }
    let best = null;
    handlePts(b).forEach((h) => {
      const d = h.p.getDistance(pt);
      if (d <= tol && (!best || d < best.d - 1e-9 || (h.kind === 'corner' && best.kind !== 'corner' && d <= best.d + 2 / z))) best = { id: h.id, kind: h.kind, p: h.p, d };
    });
    // a tap well inside a large selection is a move, not a handle
    if (best && b.width * z > 60 && b.height * z > 60 && b.expand(-tol * 0.9).contains(pt)) return null;
    return best;
  };
  // centre a square of n device pixels on whole pixels so its edges stay crisp
  const snapPx = (p, n) => {
    const v = paper.view;
    const dpr = (v.pixelRatio || window.devicePixelRatio || 1);
    const q = v.projectToView(p);
    const off = Math.round(n * dpr) % 2 ? 0.5 / dpr : 0;
    return v.viewToProject(Pt(Math.floor(q.x * dpr) / dpr + off, Math.floor(q.y * dpr) / dpr + off));
  };
  const tri = (tip, dir, s, len, half) => {
    const n = Pt(-dir.y, dir.x);
    const base = tip.subtract(dir.multiply(len * s));
    return new paper.Path({ segments: [tip, base.add(n.multiply(half * s)), base.subtract(n.multiply(half * s))], closed: true, fillColor: INK(), insert: false });
  };
  const withRim = (L, item, s) => {
    const r = item.clone({ insert: false });
    r.strokeColor = new paper.Color(1, 1, 1, 0.5);
    r.strokeWidth = 2.2 * s;
    r.fillColor = item.fillColor ? new paper.Color(1, 1, 1, 0.5) : null;
    r.strokeJoin = 'round';
    r.strokeCap = 'round';
    L.addChild(r);
    L.addChild(item);
  };
  // curved two-headed arrow at a corner (rotate), bulging outwards
  const rotGlyph = (L, p, d, s) => {
    const k = VP.coarse ? 1.25 : 1;
    const r = 6 * s * k;
    const out = d.normalize();
    const apex = p.add(out.multiply(1 * s));
    const c = apex.subtract(out.multiply(r));
    const th = out.angle;
    const P = (a) => c.add(Pt(r, 0).rotate(a));
    const a0 = th - 62;
    const a1 = th + 62;
    const arc = new paper.Path.Arc({ from: P(a0), through: P(th), to: P(a1), strokeColor: INK(), strokeWidth: 1.15 * s, insert: false });
    const g = new paper.Group({ insert: false });
    g.addChild(arc);
    const rad = (a) => (a * Math.PI) / 180;
    g.addChild(tri(P(a0).add(Pt(Math.sin(rad(a0)), -Math.cos(rad(a0))).multiply(1.2 * s)), Pt(Math.sin(rad(a0)), -Math.cos(rad(a0))), s, 2.8 * k, 2 * k));
    g.addChild(tri(P(a1).add(Pt(-Math.sin(rad(a1)), Math.cos(rad(a1))).multiply(1.2 * s)), Pt(-Math.sin(rad(a1)), Math.cos(rad(a1))), s, 2.8 * k, 2 * k));
    withRim(L, g, s);
  };
  // straight two-headed arrow along an edge (skew)
  const skewGlyph = (L, p, along, s) => {
    const k = VP.coarse ? 1.25 : 1;
    const r = 5 * s * k;
    const a = p.subtract(along.multiply(r));
    const b = p.add(along.multiply(r));
    const g = new paper.Group({ insert: false });
    g.addChild(new paper.Path.Line({ from: a.add(along.multiply(2 * s)), to: b.subtract(along.multiply(2 * s)), strokeColor: INK(), strokeWidth: 1.15 * s, insert: false }));
    g.addChild(tri(a, along.multiply(-1), s, 2.8 * k, 2 * k));
    g.addChild(tri(b, along, s, 2.8 * k, 2 * k));
    withRim(L, g, s);
  };
  // the start node of each selected curve, a small hollow square (seen in Corel's pick tool too)
  const startNodes = (L, s) => {
    if (VP.sel.length > 60) return;
    const hs = 4.5 * s;
    VP.sel.forEach((it) => {
      let path = it;
      if (it instanceof paper.CompoundPath) path = it.children[0];
      if (!(path instanceof paper.Path) || !path.segments.length) return;
      const q = path.segments[0].point;
      const pt = snapPx(q, 5);
      L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(pt.subtract(hs / 2), new paper.Size(hs, hs)), fillColor: '#ffffff', strokeColor: '#000000', strokeWidth: 0.9 * s, insert: false }));
    });
  };
  const sel0 = VP.drawSelectionOverlay;
  VP.drawSelectionOverlay = (L) => {
    if (!CL()) return sel0(L);
    VP.pruneSel();
    if (!VP.sel.length) return;
    const s = 1 / paper.view.zoom;
    const b = VP.selBounds();
    const hp = handlePts(b);
    if (VP.handleMode === 'rotate') {
      hp.forEach((h) => {
        if (h.kind === 'corner') rotGlyph(L, h.p, h.d, s);
        else skewGlyph(L, h.p, h.id === 'tc' || h.id === 'bc' ? Pt(1, 0) : Pt(0, 1), s);
      });
      const c = VP.pivot || b.center;
      const k = VP.coarse ? 1.2 : 1;
      L.addChild(new paper.Path.Circle({ center: c, radius: 4.6 * s * k, strokeColor: RIM(), strokeWidth: 2.8 * s, insert: false }));
      L.addChild(new paper.Path.Circle({ center: c, radius: 4.6 * s * k, strokeColor: INK(), strokeWidth: 1.1 * s, insert: false }));
      L.addChild(new paper.Path.Circle({ center: c, radius: 1.5 * s * k, fillColor: INK(), insert: false }));
      return;
    }
    startNodes(L, s);
    const n = VP.coarse ? 7 : 5;
    hp.forEach((h) => {
      const p = snapPx(h.p, n);
      // a faint light rim keeps the black squares visible on dark artwork; on white it disappears
      L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(p.subtract((n + 2) * s / 2), new paper.Size((n + 2) * s, (n + 2) * s)), fillColor: new paper.Color(1, 1, 1, 0.55), insert: false }));
      L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(p.subtract((n * s) / 2), new paper.Size(n * s, n * s)), fillColor: INK(), insert: false }));
    });
    // centre: a tiny "x"
    const c = snapPx(b.center, 5);
    const x = 2.2 * s;
    L.addChild(new paper.Path.Line({ from: c.add(Pt(-x, -x)), to: c.add(Pt(x, x)), strokeColor: INK(), strokeWidth: 0.9 * s, insert: false }));
    L.addChild(new paper.Path.Line({ from: c.add(Pt(-x, x)), to: c.add(Pt(x, -x)), strokeColor: INK(), strokeWidth: 0.9 * s, insert: false }));
  };

  /* ======================= marquee and node handles ======================= */
  const BLUE = '#2a6ad8';
  const drawMarquee = (L, rect) => {
    if (!rect) return;
    const s = 1 / paper.view.zoom;
    L.addChild(new paper.Path.Rectangle({ rectangle: rect, strokeColor: '#ffffff', strokeWidth: s, insert: false }));
    L.addChild(new paper.Path.Rectangle({ rectangle: rect, strokeColor: BLUE, strokeWidth: s, dashArray: [3 * s, 3 * s], insert: false }));
  };
  C.drawMarquee = drawMarquee;
  if (T && T.select) {
    const ov0 = T.select.overlay;
    const ova0 = T.select.overlayAfter;
    T.select.overlay = function (L) {
      if (!CL()) return ov0.call(this, L);
      if (this.op && this.op.type === 'marquee' && !VP.sel.length) {
        drawMarquee(L, this.op.rect);
        return true;
      }
      return false;
    };
    T.select.overlayAfter = function (L) {
      if (!CL()) return ova0.call(this, L);
      if (this.op && this.op.type === 'marquee') drawMarquee(L, this.op.rect);
    };
  }
  if (T && T.node) {
    const nov0 = T.node.overlay;
    T.node.overlay = function (L) {
      if (!CL()) return nov0.call(this, L);
      const t = this.target;
      if (!t || !t.parent) {
        this.target = null;
        return false;
      }
      const s = 1 / paper.view.zoom;
      const ol = t.clone({ insert: false });
      ol.fillColor = null;
      ol.strokeColor = new paper.Color(BLUE);
      ol.strokeWidth = s;
      ol.dashArray = [];
      ol.shadowColor = null;
      ol.opacity = 0.85;
      ol.blendMode = 'normal';
      L.addChild(ol);
      const k = VP.coarse ? 1.35 : 1;
      const hs = 6 * s * k;
      // control handles: dashed blue lines ending in small solid squares
      this.segs.forEach((g) => {
        ['In', 'Out'].forEach((w) => {
          const h = g['handle' + w];
          if (h.isZero()) return;
          const hp = g.point.add(h);
          L.addChild(new paper.Path.Line({ from: g.point, to: hp, strokeColor: BLUE, strokeWidth: s, dashArray: [3 * s, 2 * s], insert: false }));
          const q = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(hp.subtract(2.4 * s * k), new paper.Size(4.8 * s * k, 4.8 * s * k)), fillColor: BLUE, strokeColor: '#ffffff', strokeWidth: 0.6 * s, insert: false });
          q.rotate(45);
          L.addChild(q);
        });
      });
      // nodes: hollow squares; selected ones solid; the start node of an open curve a little bigger
      this.allSegs().forEach((g) => {
        const on = this.segs.has(g);
        const first = g.index === 0;
        const sz = first ? hs * 1.25 : hs;
        const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(g.point.subtract(sz / 2), new paper.Size(sz, sz)), insert: false });
        r.fillColor = on ? new paper.Color('#000000') : new paper.Color('#ffffff');
        r.strokeColor = on ? new paper.Color('#ffffff') : new paper.Color('#000000');
        r.strokeWidth = (on ? 0.8 : 1) * s;
        L.addChild(r);
      });
      if (this.op && this.op.type === 'marquee') drawMarquee(L, this.op.rect);
      return true;
    };
  }

  /* ======================= rulers ======================= */
  const dr0 = UI.drawRulers;
  const niceSteps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  // Corel: a label every 1-2-5 step that leaves room for the number, ten divisions in between
  C.rulerSteps = (pxPerUnit) => {
    const major = niceSteps.find((s) => s * pxPerUnit >= 64) || 50000;
    let div = 10;
    while (div > 1 && (major / div) * pxPerUnit < 5) div = div === 10 ? 5 : div === 5 ? 2 : 1;
    return { major, minor: major / div, div };
  };
  const UNIT_LABEL = 'milimetre';
  UI.drawRulers = () => {
    if (!CL()) return dr0();
    const stage = $('#stage');
    stage.classList.toggle('no-rulers', !VP.settings.rulers);
    C.updateScroll();
    if (!VP.settings.rulers) return;
    const v = paper.view;
    if (!v) return;
    const z = v.zoom;
    const vb = v.bounds;
    const ppu = z * VP.MM; // screen px per mm
    const { major, minor, div } = C.rulerSteps(ppu);
    const bg = cssVar('--cv-ruler', '#202020');
    const tick = cssVar('--cv-ruler-tick', '#6a6a6a');
    const fg = cssVar('--cv-ruler-fg', '#c8c8c8');
    const dpr = window.devicePixelRatio || 1;
    const font = '9px "Segoe UI", system-ui, -apple-system, sans-serif';
    const prep = (cv) => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 1;
      ctx.font = font;
      ctx.textBaseline = 'top';
      return { ctx, w, h };
    };
    const lab = (n) => {
      const a = Math.abs(n) < 1e-9 ? 0 : Math.abs(n); // Corel prints distances, no minus sign
      return String(Math.round(a * 100) / 100).replace('.', ',');
    };
    const idx = (m) => Math.round(m / minor);
    const ticks = (from, to, place) => {
      const a = Math.floor(from / minor) * minor;
      for (let m = a; m <= to + minor; m += minor) {
        const i = idx(m);
        const kind = i % div === 0 ? 2 : div % 2 === 0 && i % (div / 2) === 0 ? 1 : 0;
        place(m, kind);
      }
    };
    {
      const { ctx, w, h } = prep($('#ruler-top'));
      ctx.strokeStyle = tick;
      ctx.beginPath();
      const labels = [];
      ticks(VP.toMM(vb.left), VP.toMM(vb.left + w / z), (m, kind) => {
        const x = Math.round((VP.toPT(m) - vb.left) * z) + 0.5;
        const len = kind === 2 ? h : kind === 1 ? h * 0.45 : h * 0.25;
        ctx.moveTo(x, h);
        ctx.lineTo(x, h - len);
        if (kind === 2) labels.push([lab(Math.round(m / minor) * minor), x + 3]);
      });
      ctx.stroke();
      ctx.fillStyle = fg;
      labels.forEach(([t, x]) => ctx.fillText(t, x, 1));
      // unit name at the right end
      ctx.font = font;
      const tw = Math.ceil(ctx.measureText(UNIT_LABEL).width) + 8;
      ctx.fillStyle = bg;
      ctx.fillRect(w - tw, 0, tw, h);
      ctx.fillStyle = tick;
      ctx.fillRect(w - tw, 2, 1, h - 4);
      ctx.fillStyle = fg;
      ctx.fillText(UNIT_LABEL, w - tw + 4, 1);
    }
    {
      const { ctx, w, h } = prep($('#ruler-left'));
      ctx.strokeStyle = tick;
      ctx.beginPath();
      const labels = [];
      ticks(VP.toMM(vb.top), VP.toMM(vb.top + h / z), (m, kind) => {
        const y = Math.round((VP.toPT(m) - vb.top) * z) + 0.5;
        const len = kind === 2 ? w : kind === 1 ? w * 0.45 : w * 0.25;
        ctx.moveTo(w, y);
        ctx.lineTo(w - len, y);
        if (kind === 2) labels.push([lab(Math.round(m / minor) * minor), y]);
      });
      ctx.stroke();
      ctx.fillStyle = fg;
      labels.forEach(([t, y]) => {
        ctx.save();
        ctx.translate(1, y - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(t, 0, 0);
        ctx.restore();
      });
      const tw = Math.ceil(ctx.measureText(UNIT_LABEL).width) + 8;
      ctx.fillStyle = bg;
      ctx.fillRect(0, h - tw, w, tw);
      ctx.fillStyle = tick;
      ctx.fillRect(2, h - tw, w - 4, 1);
      ctx.fillStyle = fg;
      ctx.save();
      ctx.translate(1, h - 4);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(UNIT_LABEL, 0, 0);
      ctx.restore();
    }
  };

  /* ======================= scroll bars and navigator ======================= */
  let contentB = null;
  const recalcContent = () => {
    contentB = null;
    try {
      VP.userLayers().forEach((l) => {
        if (!l.visible || !l.children.length) return;
        const b = l.bounds;
        if (b && b.width + b.height > 0) contentB = contentB ? contentB.unite(b) : b.clone();
      });
    } catch (e) {
      contentB = null;
    }
  };
  // the scrollable desktop: the page with room around it, everything drawn, and the current view
  const world = (tight) => {
    const p = VP.page();
    const m = Math.max(p.w, p.h) * (tight ? 0.15 : 1);
    let w = new paper.Rectangle(-m, -m, p.w + 2 * m, p.h + 2 * m);
    if (contentB) w = w.unite(contentB.expand(m * 0.25));
    return w.unite(paper.view.bounds);
  };
  let sbRaf = 0;
  C.updateScroll = () => {
    if (sbRaf) return;
    sbRaf = requestAnimationFrame(() => {
      sbRaf = 0;
      if (!paper.view || !VP.doc || !C.sbH) return;
      const W = drag ? drag.W : world();
      const vb = paper.view.bounds;
      const set = (bar, horiz) => {
        const tr = bar.el.clientWidth && bar.el.clientHeight ? (horiz ? bar.el.clientWidth : bar.el.clientHeight) : 0;
        if (!tr) return;
        const ws = horiz ? W.width : W.height;
        const s0 = horiz ? vb.left - W.left : vb.top - W.top;
        const len = Math.max(18, ((horiz ? vb.width : vb.height) / ws) * tr);
        const pos = Math.max(0, Math.min(tr - len, (s0 / ws) * tr));
        bar.thumb.style[horiz ? 'left' : 'top'] = pos + 'px';
        bar.thumb.style[horiz ? 'width' : 'height'] = len + 'px';
      };
      set(C.sbH, true);
      set(C.sbV, false);
      if (C.navOpen) C.drawNav();
    });
  };
  let drag = null;
  const bindBar = (bar, horiz) => {
    bar.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const W = world();
      const tr = horiz ? bar.el.clientWidth : bar.el.clientHeight;
      if (e.target === bar.thumb) {
        try {
          bar.el.setPointerCapture(e.pointerId);
        } catch (err) { /* ignore */ }
        drag = { W, tr, start: horiz ? e.clientX : e.clientY, at: horiz ? paper.view.bounds.left : paper.view.bounds.top, id: e.pointerId };
        bar.el.classList.add('drag');
        return;
      }
      // a click on the track jumps by most of a window
      const r = bar.thumb.getBoundingClientRect();
      const before = horiz ? e.clientX < r.left : e.clientY < r.top;
      const vb = paper.view.bounds;
      const step = (horiz ? vb.width : vb.height) * 0.85 * paper.view.zoom;
      if (horiz) VP.panBy(before ? step : -step, 0);
      else VP.panBy(0, before ? step : -step);
    });
    bar.el.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = ((horiz ? e.clientX : e.clientY) - drag.start) * ((horiz ? drag.W.width : drag.W.height) / drag.tr);
      const vb = paper.view.bounds;
      const cur = horiz ? vb.left : vb.top;
      const want = drag.at + d;
      const z = paper.view.zoom;
      if (horiz) VP.panBy(-(want - cur) * z, 0);
      else VP.panBy(0, -(want - cur) * z);
    });
    const end = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      drag = null;
      bar.el.classList.remove('drag');
      C.updateScroll();
    };
    bar.el.addEventListener('pointerup', end);
    bar.el.addEventListener('pointercancel', end);
  };
  // navigator: an overview of the desktop; drag the frame to move around
  C.navOpen = false;
  let navImg = null;
  C.drawNav = () => {
    const pop = $('#c-nav-pop');
    if (!pop) return;
    const cv = pop.querySelector('canvas');
    const dpr = window.devicePixelRatio || 1;
    const cw = cv.clientWidth;
    const ch = cv.clientHeight;
    if (cv.width !== Math.round(cw * dpr)) {
      cv.width = Math.round(cw * dpr);
      cv.height = Math.round(ch * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = (C.navW || world(true)).unite(paper.view.bounds);
    const k = Math.min(cw / W.width, ch / W.height);
    const ox = (cw - W.width * k) / 2 - W.left * k;
    const oy = (ch - W.height * k) / 2 - W.top * k;
    C.navMap = { k, ox, oy };
    ctx.fillStyle = cssVar('--paste', '#404040');
    ctx.fillRect(0, 0, cw, ch);
    const p = VP.page();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, p.w * k, p.h * k);
    if (navImg && navImg.complete && navImg.naturalWidth) ctx.drawImage(navImg, ox, oy, p.w * k, p.h * k);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(ox + 0.5, oy + 0.5, p.w * k - 1, p.h * k - 1);
    const vb = paper.view.bounds;
    ctx.strokeStyle = '#2f8fff';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(47,143,255,0.12)';
    ctx.fillRect(ox + vb.left * k, oy + vb.top * k, vb.width * k, vb.height * k);
    ctx.strokeRect(ox + vb.left * k + 0.75, oy + vb.top * k + 0.75, vb.width * k - 1.5, vb.height * k - 1.5);
  };
  const closeNav = () => {
    const pop = $('#c-nav-pop');
    if (pop) pop.hidden = true;
    C.navOpen = false;
    C.navW = null;
    const b = $('#c-navbtn');
    if (b) b.classList.remove('on');
  };
  const openNav = () => {
    const pop = $('#c-nav-pop');
    if (!pop) return;
    pop.hidden = false;
    C.navOpen = true;
    C.navW = world(true);
    $('#c-navbtn').classList.add('on');
    try {
      VP.makeThumb();
      const t = VP.page().thumb;
      navImg = null;
      if (t) {
        navImg = new Image();
        navImg.onload = () => C.navOpen && C.drawNav();
        navImg.src = t;
      }
    } catch (e) { /* the overview works without the thumbnail */ }
    C.drawNav();
  };
  const buildStage = () => {
    const stage = $('#stage');
    if (!stage || $('#c-hscroll')) return;
    const corner = $('#ruler-corner');
    if (corner) {
      corner.innerHTML = G.rulerCorner;
      corner.title = 'Cetvel başlangıcı · birim: milimetre';
    }
    const mk = (id, cls) => {
      const d = document.createElement('div');
      d.id = id;
      d.className = 'c-sb ' + cls;
      d.innerHTML = '<div class="c-sb-thumb"></div>';
      stage.appendChild(d);
      return { el: d, thumb: d.firstChild };
    };
    C.sbV = mk('c-vscroll', 'c-sb-v');
    C.sbH = mk('c-hscroll', 'c-sb-h');
    bindBar(C.sbV, false);
    bindBar(C.sbH, true);
    const nb = document.createElement('button');
    nb.id = 'c-navbtn';
    nb.title = 'Gezgin · Belgenin tamamını gösterir, çerçeveyi sürükleyerek gezinin';
    nb.setAttribute('aria-label', 'Gezgin');
    nb.innerHTML = G.zoomNav;
    stage.appendChild(nb);
    const pop = document.createElement('div');
    pop.id = 'c-nav-pop';
    pop.hidden = true;
    pop.innerHTML = '<div class="c-nav-head"><span>Gezgin</span><button data-nav="fit" title="Sayfaya sığdır">Sayfaya sığdır</button></div><canvas aria-label="Belgenin genel görünümü"></canvas>';
    stage.appendChild(pop);
    nb.addEventListener('click', (e) => {
      e.stopPropagation();
      if (C.navOpen) closeNav();
      else openNav();
    });
    pop.addEventListener('click', (e) => {
      if (e.target.closest('[data-nav="fit"]')) {
        VP.fitPage();
        C.navW = world(true);
        C.drawNav();
      }
    });
    const cv = pop.querySelector('canvas');
    let nd = null;
    const goto = (e) => {
      const r = cv.getBoundingClientRect();
      const m = C.navMap;
      if (!m) return;
      const p = Pt((e.clientX - r.left - m.ox) / m.k, (e.clientY - r.top - m.oy) / m.k);
      paper.view.center = p;
      VP.viewTouched = true;
      VP.viewChanged();
    };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      nd = e.pointerId;
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
      goto(e);
    });
    cv.addEventListener('pointermove', (e) => nd === e.pointerId && goto(e));
    cv.addEventListener('pointerup', () => (nd = null));
    cv.addEventListener('pointercancel', () => (nd = null));
    document.addEventListener('pointerdown', (e) => {
      if (C.navOpen && !e.target.closest('#c-nav-pop') && !e.target.closest('#c-navbtn')) closeNav();
    }, true);
    document.addEventListener('keydown', (e) => e.key === 'Escape' && C.navOpen && closeNav());
    if (window.ResizeObserver) new ResizeObserver(() => C.updateScroll()).observe(stage);
  };

  /* ======================= page navigator ======================= */
  const pageTabs = () => {
    const el = $('#page-tabs');
    if (!el) return;
    const pages = VP.doc.pages;
    const n = pages.length;
    const a = VP.doc.active;
    const b = (attr, glyph, label, dis, cls) => '<button class="c-pn ' + (cls || '') + '" ' + attr + ' title="' + label + '" aria-label="' + label + '"' + (dis ? ' disabled' : '') + '>' + glyph + '</button>';
    el.innerHTML = b('data-cpage="before"', G.addPage, 'Önüne sayfa ekle', false, 'c-pn-add') +
      b('data-page="first"', G.first, 'İlk sayfa', a === 0) + b('data-page="prev"', G.prev, 'Önceki sayfa', a === 0) +
      '<span class="c-pn-count">' + (a + 1) + ' / ' + n + '</span>' +
      b('data-page="next"', G.next, 'Sonraki sayfa', a === n - 1) + b('data-page="last"', G.last, 'Son sayfa', a === n - 1) +
      b('data-page="add"', G.addPage, 'Arkasına sayfa ekle', false, 'c-pn-add') +
      '<span class="c-pn-tabs">' + pages.map((p, i) => '<button class="page-tab c-ptab' + (i === a ? ' on' : '') + '" data-page="' + i + '" title="' + esc(p.name) + ' · Sağ tık veya basılı tutun: sayfa menüsü">' + esc(p.name) + '</button>').join('') + '</span>';
    const on = el.querySelector('.c-ptab.on');
    if (on && on.scrollIntoView && el.scrollWidth > el.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const pageMenu = (btn, i) => {
    const html = [['rename', 'Sayfayı yeniden adlandır…'], ['after', 'Arkasına sayfa ekle'], ['before', 'Önüne sayfa ekle'], ['dup', 'Sayfayı çoğalt'], ['|'], ['del', 'Sayfayı sil', VP.doc.pages.length <= 1]]
      .map(([k, l, dis]) => (k === '|' ? '<div class="pop-sep"></div>' : '<button class="pop-item" data-pick="' + k + '"' + (dis ? ' disabled' : '') + '>' + l + '</button>')).join('');
    UI.popover(btn, html, async (k) => {
      if (i !== VP.doc.active) VP.gotoPage(i);
      if (k === 'rename') {
        const v = await UI.prompt({ title: 'Sayfayı yeniden adlandır', label: 'Sayfa adı', value: VP.page().name });
        if (v != null && String(v).trim()) {
          VP.page().name = String(v).trim();
          VP.commit();
          VP.emit('page');
        }
      } else if (k === 'after') VP.addPage();
      else if (k === 'before') addBefore();
      else if (k === 'dup') VP.duplicatePage();
      else if (k === 'del') VP.deletePage();
    });
  };
  // Corel numbers pages that still have their default name by position ("Sayfa 1", "Sayfa 2", …)
  const renumber = () => {
    if (!VP.doc || !CL()) return;
    VP.doc.pages.forEach((p, i) => {
      if (/^Sayfa \d+$/.test(p.name || '')) p.name = 'Sayfa ' + (i + 1);
    });
  };
  VP.on('page', renumber);
  const addBefore = () => {
    VP.addPage();
    VP.movePage(VP.doc.active, -1);
    VP.emit('page');
  };
  const bindPageNav = () => {
    const el = $('#page-tabs');
    if (!el) return;
    el.addEventListener('click', (e) => {
      if (!CL()) return;
      const b = e.target.closest('[data-cpage]');
      if (b && b.dataset.cpage === 'before') addBefore();
    });
    el.addEventListener('contextmenu', (e) => {
      const t = e.target.closest('.c-ptab');
      if (!t) return;
      e.preventDefault();
      pageMenu(t, +t.dataset.page);
    });
    let hold = 0;
    let fired = false;
    el.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('.c-ptab');
      fired = false;
      clearTimeout(hold);
      if (!t || e.pointerType === 'mouse') return;
      hold = setTimeout(() => {
        fired = true;
        pageMenu(t, +t.dataset.page);
      }, 520);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((n) => el.addEventListener(n, () => clearTimeout(hold)));
    // a long press opened the menu: swallow the click that follows
    el.addEventListener('click', (e) => {
      if (fired) {
        fired = false;
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);
  };

  /* ======================= status bar ======================= */
  const SEL_HINT = 'Döndürme/Eğme için nesneye yeniden tıklayın veya dokunun; çift tık düğümleri ya da metni düzenler; Shift+tık birden fazla nesne seçer; Alt+seçim çerçevesi değdiği nesneleri seçer';
  const ROT_HINT = 'Döndürmek için köşe oklarını, eğmek için kenar oklarını sürükleyin; merkez noktası taşınabilir; ölçekleme tutamaçları için yeniden tıklayın veya dokunun';
  let tempHint = null;
  let tempT = 0;
  const hintText = () => {
    if (tempHint) return tempHint;
    const id = VP.toolId;
    if (id === 'select') {
      if (!VP.sel.length) return 'Araç İpuçları';
      return VP.handleMode === 'rotate' ? ROT_HINT : SEL_HINT;
    }
    const m = VP.TOOL_META[id];
    return m && m.hint ? m.hint.split(' · ').join('; ') : 'Araç İpuçları';
  };
  const infoText = () => {
    if (!VP.sel.length) return '';
    const layers = [...new Set(VP.sel.map((it) => it.layer).filter(Boolean))];
    const ln = layers.length === 1 ? layers[0].name : layers.length + ' Katman';
    // Corel names the object type here ("Elips üzerinde Katman 1"), not the object's own name
    const typeName = (it) => {
      const k = VP.kindOf ? VP.kindOf(it) : '';
      if (k === 'closed' || k === 'path') return 'Eğri';
      if (/^(rect|ellipse|polygon|star|spiral|image|compound)$/.test(k)) return VP.KIND_NAMES[k];
      return VP.describe(it);
    };
    let t = VP.sel.length === 1 ? typeName(VP.sel[0]) + ' üzerinde ' + ln : VP.sel.length + ' Nesne Seçildi üzerinde ' + ln;
    if (VP.toolId === 'node' && T.node && T.node.segs && T.node.segs.size) t += ' · ' + T.node.segs.size + ' düğüm seçili';
    return t;
  };
  const curFillStroke = () => {
    if (VP.sel.length) {
      const it = VP.sel[0];
      const f = it instanceof paper.Raster ? { type: 'none' } : VP.getFill(it);
      const s = VP.getStroke(it);
      return { f, s };
    }
    return { f: VP.defaults.fill ? { type: 'solid', color: VP.defaults.fill } : { type: 'none' }, s: { on: !!VP.defaults.stroke, color: VP.defaults.stroke, width: VP.defaults.strokeWidth } };
  };
  const swatch = (css, none) => '<i class="c-st-sw' + (none ? ' c-none' : '') + '"' + (css ? ' style="' + css + '"' : '') + '></i>';
  const buildStatus = () => {
    const sb = $('#statusbar');
    if (!sb || $('#c-st-hint')) return;
    const gear = document.createElement('button');
    gear.id = 'c-st-gear';
    gear.className = 'c-st-btn';
    gear.title = 'Durum çubuğu seçenekleri';
    gear.setAttribute('aria-label', 'Durum çubuğu seçenekleri');
    gear.innerHTML = G.gear;
    const hint = document.createElement('div');
    hint.id = 'c-st-hint';
    hint.className = 'c-st-hint';
    hint.textContent = 'Araç İpuçları';
    sb.insertBefore(hint, sb.firstChild);
    sb.insertBefore(gear, hint);
    const cm = document.createElement('button');
    cm.id = 'c-st-cm';
    cm.className = 'c-st-btn';
    cm.title = 'Renk yönetimi · Ekran: sRGB';
    cm.setAttribute('aria-label', 'Renk yönetimi');
    cm.innerHTML = G.cm;
    sb.appendChild(cm);
    gear.addEventListener('click', () => {
      const html = '<button class="pop-item" data-pick="pos">' + (VP.settings.stPos ? '✓ ' : '') + 'İmleç konumunu göster</button>' +
        '<button class="pop-item" data-pick="hint">' + (VP.settings.stHint !== false ? '✓ ' : '') + 'Araç ipuçlarını göster</button><div class="pop-sep"></div>' +
        '<button class="pop-item" data-pick="hide">Durum çubuğunu gizle</button>';
      UI.popover(gear, html, (k) => {
        if (k === 'pos') VP.settings.stPos = !VP.settings.stPos;
        else if (k === 'hint') VP.settings.stHint = VP.settings.stHint === false;
        else if (k === 'hide') {
          VP.settings.bars = Object.assign({}, VP.settings.bars || {}, { status: false });
          UI.applyBars();
        }
        if (VP.io && VP.io.savePrefs) VP.io.savePrefs();
        applyStatusPrefs();
      });
    });
    cm.addEventListener('click', () => UI.toast('Renk yönetimi: ekran renkleri sRGB olarak gösterilir · CMYK değerleri palet renkleri içindir'));
    applyStatusPrefs();
  };
  const applyStatusPrefs = () => {
    const sb = $('#statusbar');
    if (!sb) return;
    sb.classList.toggle('c-show-pos', !!VP.settings.stPos);
    sb.classList.toggle('c-no-hint', VP.settings.stHint === false);
  };
  const statusBar = () => {
    const h = $('#c-st-hint');
    if (h) {
      const t = hintText();
      if (h.textContent !== t) h.textContent = t;
      h.title = t;
    }
    const info = $('#st-info');
    if (info) info.textContent = infoText();
    const { f, s } = curFillStroke();
    let fsw;
    let ftxt;
    if (f.type === 'none') {
      fsw = swatch('', true);
      ftxt = 'Yok';
    } else if (f.type === 'solid') {
      fsw = swatch('background:' + f.color);
      ftxt = colorText(f.color);
    } else if (f.type === 'linear' || f.type === 'radial') {
      fsw = swatch('background:' + (f.type === 'radial' ? 'radial-gradient(' : 'linear-gradient(90deg,') + f.color + ',' + f.color2 + ')');
      ftxt = f.type === 'radial' ? 'Dairesel geçişli dolgu' : 'Doğrusal geçişli dolgu';
    } else {
      fsw = swatch('background:' + (f.color || '#888'));
      ftxt = 'Desen dolgu';
    }
    const son = s.on && s.color;
    const w = (VP.toMM(s.width || 0)).toFixed(3).replace('.', ',') + ' mm';
    const chips = $('#st-chips');
    if (chips) {
      chips.innerHTML = '<button class="st-chip c-st-fill" data-st="fill" title="Dolgu · Özellikler panelini açar">' + G.bucket + fsw + '<span>' + esc(ftxt) + '</span></button>' +
        '<button class="st-chip c-st-line" data-st="stroke" title="Anahat · Özellikler panelini açar">' + G.nib + (son ? swatch('background:' + s.color) : swatch('', true)) + '<span>' + (son ? esc(colorText(s.color)) + '&ensp;' + w : 'Yok') + '</span></button>';
    }
  };
  C.hint = (txt, ms) => {
    tempHint = txt || null;
    clearTimeout(tempT);
    if (txt) tempT = setTimeout(() => {
      tempHint = null;
      statusBar();
    }, ms || 3500);
    statusBar();
  };
  const sh0 = UI.showHint;
  UI.showHint = (txt) => {
    sh0(txt);
    if (!CL()) return;
    // tool hints are shown by the status bar itself; other short notes appear there for a moment
    const tm = VP.TOOL_META[VP.toolId];
    if (txt && !(tm && tm.hint === txt)) C.hint(txt);
    else statusBar();
  };
  const rs0 = UI.renderStatus;
  UI.renderStatus = () => {
    if (!CL()) return rs0();
    pageTabs();
    statusBar();
  };

  /* ======================= document palette ======================= */
  const DP_HINT = 'Renkleri (veya nesneleri) buraya sürükleyerek bu renkleri belgenizle birlikte saklayın';
  const rdp0 = UI.renderDocPal;
  UI.renderDocPal = () => {
    if (!CL()) return rdp0();
    const el = $('#docpal');
    if (!el || el.hidden) return;
    const seen = [];
    const add = (c) => {
      if (!c || c.type === 'gradient' || c.alpha === 0) return;
      const h = VP.hex(c);
      if (h && !seen.includes(h)) seen.push(h);
    };
    const walk = (it) => {
      if (seen.length >= 60 || (it.data && it.data.hitOnly)) return;
      if (it.children && !(it instanceof paper.CompoundPath)) return it.children.forEach(walk);
      if (it instanceof paper.Raster) return;
      add(it.fillColor);
      add(it.strokeColor);
    };
    VP.userLayers().forEach((L) => L.children.forEach(walk));
    const key = 'c|' + seen.join(',');
    if (UI._dpKey === key && el.querySelector('.c-dp-list')) return;
    UI._dpKey = key;
    const t = (c) => {
      const cm = CMYK.get(c);
      return (cm ? cmykStr(cm) : colorText(c)) + ' · Dokun: dolgu · Basılı tut / sağ tık: anahat';
    };
    el.innerHTML = '<span class="c-dp-grip">' + G.grip + '</span>' +
      '<button class="c-dp-btn" data-dp="menu" title="Belge paleti seçenekleri" aria-label="Belge paleti seçenekleri">' + G.chevR + '</button>' +
      '<button class="c-dp-btn c-dp-drop" data-dp="drop" title="Damlalık · Çizimden renk alın" aria-label="Damlalık">' + G.dropper + '</button>' +
      '<button class="c-dp-btn" data-dp="left" title="Sola kaydır" aria-label="Sola kaydır">' + G.chevL + '</button>' +
      '<div class="c-dp-list"><button class="swatch none" data-color="none" title="Renk yok" aria-label="Renk yok"></button>' +
      seen.map((c) => '<button class="swatch" data-color="' + c + '" style="background:' + c + '" title="' + esc(t(c)) + '" aria-label="Belgedeki renk ' + c + '"></button>').join('') + '</div>' +
      '<div class="c-dp-hint">' + (seen.length ? '' : esc(DP_HINT)) + '</div>' +
      '<button class="c-dp-btn" data-dp="right" title="Sağa kaydır" aria-label="Sağa kaydır">' + G.chevR + '</button>' +
      '<button class="c-dp-btn" data-dp="end" title="Sona git" aria-label="Sona git">' + G.dblR + '</button>';
  };
  const bindDocPal = () => {
    const el = $('#docpal');
    if (!el) return;
    el.addEventListener('pointerdown', () => (UI.palTarget = 'fill'), true);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dp]');
      if (!b) return;
      const list = el.querySelector('.c-dp-list');
      const k = b.dataset.dp;
      if (k === 'drop') VP.setTool('eyedropper');
      else if (k === 'left' && list) list.scrollBy({ left: -120, behavior: 'smooth' });
      else if (k === 'right' && list) list.scrollBy({ left: 120, behavior: 'smooth' });
      else if (k === 'end' && list) list.scrollTo({ left: list.scrollWidth, behavior: 'smooth' });
      else if (k === 'menu') {
        UI.popover(b, '<button class="pop-item" data-pick="custom">Özel renk…</button><button class="pop-item" data-pick="pal">Palet yöneticisi</button><div class="pop-sep"></div><button class="pop-item" data-pick="hide">Belge paletini gizle</button>', (p) => {
          if (p === 'custom') UI.customColor();
          else if (p === 'pal') UI.run('dockPalettes');
          else if (p === 'hide') {
            VP.settings.bars = Object.assign({}, VP.settings.bars || {}, { docpal: false });
            UI.applyBars();
            if (VP.io && VP.io.savePrefs) VP.io.savePrefs();
          }
        });
      }
    });
  };

  /* ======================= colour palette (right edge) ======================= */
  const rp0 = UI.renderPalette;
  UI.renderPalette = (full) => {
    if (!CL()) return rp0(full);
    UI.palTarget = 'fill';
    const pal = $('#palette');
    if (!pal) return;
    const cols = UI.curPalette ? UI.curPalette() : UI.PALETTE;
    const key = cols.map((c) => c[0]).join(',');
    if (!full && UI._cpKey === key && pal.querySelector('.c-pal-list')) return updatePalArrows();
    UI._cpKey = key;
    UI._palKey = null;
    const keep = pal.querySelector('.c-pal-list');
    const top = keep ? keep.scrollTop : 0;
    pal.innerHTML = '<button class="c-pal-btn" data-cpal="menu" title="Palet seçenekleri" aria-label="Palet seçenekleri">' + G.chevR + '</button>' +
      '<button class="c-pal-btn c-pal-drop" data-cpal="drop" title="Damlalık · Çizimden renk alın" aria-label="Damlalık">' + G.dropper + '</button>' +
      '<button class="c-pal-btn" data-cpal="up" title="Yukarı kaydır" aria-label="Yukarı kaydır">' + G.chevU + '</button>' +
      '<div class="c-pal-list"><button class="swatch none" data-color="none" title="Renk yok · Dokun: dolguyu kaldır · Basılı tut / sağ tık: anahattı kaldır" aria-label="Renk yok"></button>' +
      cols.map(([col, name]) => '<button class="swatch" data-color="' + col + '" style="background:' + col + '" title="' + esc(name) + '" aria-label="' + esc(name) + '"></button>').join('') + '</div>' +
      '<button class="c-pal-btn" data-cpal="down" title="Aşağı kaydır" aria-label="Aşağı kaydır">' + G.chevD + '</button>' +
      '<button class="c-pal-btn" data-cpal="wide" title="Paleti genişlet" aria-label="Paleti genişlet">' + G.dblR + '</button>';
    const list = pal.querySelector('.c-pal-list');
    list.scrollTop = top;
    list.addEventListener('scroll', updatePalArrows, { passive: true });
    updatePalArrows();
  };
  const updatePalArrows = () => {
    const pal = $('#palette');
    const list = pal && pal.querySelector('.c-pal-list');
    if (!list) return;
    const up = pal.querySelector('[data-cpal="up"]');
    const dn = pal.querySelector('[data-cpal="down"]');
    if (up) up.disabled = list.scrollTop <= 0;
    if (dn) dn.disabled = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
  };
  const bindPal = () => {
    const pal = $('#palette');
    if (!pal) return;
    // Corel: a click fills, a right click (here also a long press) colours the outline
    pal.addEventListener('pointerdown', () => (UI.palTarget = 'fill'), true);
    let rep = 0;
    const scroll = (dir) => {
      const list = pal.querySelector('.c-pal-list');
      if (!list) return;
      const sw = list.querySelector('.swatch');
      const step = (sw ? sw.offsetHeight + 1 : 16) * 4;
      list.scrollBy({ top: dir * step, behavior: 'smooth' });
    };
    pal.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cpal]');
      if (!b) return;
      const k = b.dataset.cpal;
      if (k === 'up') scroll(-1);
      else if (k === 'down') scroll(1);
      else if (k === 'drop') VP.setTool('eyedropper');
      else if (k === 'wide') {
        pal.classList.toggle('c-wide');
        b.title = pal.classList.contains('c-wide') ? 'Paleti daralt' : 'Paleti genişlet';
        setTimeout(() => UI.onResize && UI.onResize(), 0);
        updatePalArrows();
      } else if (k === 'menu') {
        const ST = VP.styles;
        let html = '<button class="pop-item" data-pick="custom">Özel renk…</button><button class="pop-item" data-pick="mgr">Palet yöneticisi</button>';
        if (ST && ST.BUILTIN) {
          const cur = VP.settings.palette || 'default';
          html += '<div class="pop-sep"></div><div class="pop-head">Palet</div>' + Object.keys(ST.BUILTIN).map((id) => '<button class="pop-item" data-pick="p:' + id + '">' + (cur === id ? '✓ ' : '') + esc(ST.BUILTIN[id].name) + '</button>').join('');
        }
        UI.popover(b, html, (p) => {
          if (p === 'custom') UI.customColor();
          else if (p === 'mgr') UI.run('dockPalettes');
          else if (p.startsWith('p:') && ST) ST.setPalette(p.slice(2));
        }, 'left');
      }
    });
    // keep scrolling while an arrow is held
    pal.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-cpal="up"],[data-cpal="down"]');
      clearInterval(rep);
      if (!b) return;
      const dir = b.dataset.cpal === 'up' ? -1 : 1;
      rep = setTimeout(() => (rep = setInterval(() => scroll(dir), 140)), 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((n) => pal.addEventListener(n, () => {
      clearTimeout(rep);
      clearInterval(rep);
    }));
    pal.addEventListener('wheel', () => setTimeout(updatePalArrows, 60), { passive: true });
  };

  /* ======================= set-up ======================= */
  const moveDocPal = () => {
    const dp = $('#docpal');
    const pn = $('#page-tabs');
    // Corel: the document palette is a row of the drawing window, under the page navigator
    if (dp && pn && pn.parentNode && dp.previousElementSibling !== pn) pn.parentNode.insertBefore(dp, pn.nextSibling);
  };
  buildStage();
  buildStatus();
  moveDocPal();
  const init0 = UI.init;
  UI.init = () => {
    init0();
    bindPageNav();
    bindDocPal();
    bindPal();
    VP.on('view', C.updateScroll);
    ['page', 'doc', 'change'].forEach((ev) => VP.on(ev, () => {
      recalcContent();
      C.updateScroll();
    }));
    VP.on('selection', () => UI.schedule('status'));
    VP.on('tool', () => UI.schedule('status'));
  };
  // the handle mode changes without a selection event on a second tap: keep the hint in step
  if (T && T.select) {
    const up0 = T.select.up;
    T.select.up = function (e) {
      const m = VP.handleMode;
      const r = up0.call(this, e);
      if (m !== VP.handleMode) UI.schedule('status');
      return r;
    };
  }
  // the grey desktop of the dark theme is Corel's #404040 (set in CSS); redraw on desk changes
  const A = VP.actions;
  if (A && A.deskWhite && A.deskWhite.run) {
    const dw0 = A.deskWhite.run;
    A.deskWhite.run = () => {
      dw0();
      VP.drawOverlay();
      C.updateScroll();
      UI.drawRulers();
    };
  }
  void dark;
})();
