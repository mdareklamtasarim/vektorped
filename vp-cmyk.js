/* VektörPad CMYK colour values (written for this app).
   - Colours picked as CMYK (palette swatches named with CMYK values, the Colour docker in CMYK mode) keep
     their exact CMYK numbers: the status bar, the Colour docker and object hints show those numbers instead
     of a conversion back from the screen colour. The values are stored with the document.
   - File › "PDF renkleri: CMYK" writes solid fill, outline and text colours into the PDF as CMYK. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const S = VP.settings;
  const A = VP.actions;
  const P5 = VP.panels2;
  if (!P5 || !P5.conv) return;
  const conv = P5.conv;
  const hexOf = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const CM = (VP.cmyk = {});
  // CMYK numbers written in a swatch name: "C0 M0 Y0 K100", "Kırmızı · M100 Y100"
  CM.parse = (name) => {
    const s = String(name || '');
    const part = s.includes('·') ? s.slice(s.indexOf('·') + 1) : s;
    const re = /\b([CMYK])\s*:?\s*(\d{1,3})\b/g;
    const v = { C: 0, M: 0, Y: 0, K: 0 };
    let m;
    let n = 0;
    while ((m = re.exec(part))) {
      v[m[1]] = Math.min(100, +m[2]);
      n++;
    }
    return n ? [v.C, v.M, v.Y, v.K] : null;
  };
  let palKey = '';
  let palMap = new Map();
  const paletteMap = () => {
    const list = (UI.curPalette ? UI.curPalette() : UI.PALETTE) || [];
    const k = list.length + ':' + (list[0] && list[0][0]) + ':' + (list[list.length - 1] && list[list.length - 1][0]);
    if (k !== palKey) {
      palKey = k;
      palMap = new Map();
      list.concat(UI.PALETTE || []).forEach(([hex, nm]) => {
        const c = CM.parse(nm);
        if (c && hex && !palMap.has(hex.toLowerCase())) palMap.set(hex.toLowerCase(), c);
      });
    }
    return palMap;
  };
  const docMap = () => {
    const ext = VP.ext ? VP.ext() : null;
    if (!ext) return {};
    ext.cmyk = ext.cmyk || {};
    return ext.cmyk;
  };
  CM.get = (hex) => {
    if (!hex) return null;
    const h = String(hex).toLowerCase();
    const d = docMap()[h];
    if (d) return d.slice();
    const p = paletteMap().get(h);
    return p ? p.slice() : null;
  };
  CM.set = (hex, cmyk) => {
    if (!hex || !cmyk) return;
    docMap()[String(hex).toLowerCase()] = cmyk.map((v) => Math.round(Math.max(0, Math.min(100, v))));
  };
  // every CMYK readout in the app goes through this, so stored values win
  const r2c0 = conv.rgb2cmyk;
  conv.rgb2cmyk = (r, g, b) => CM.get(hexOf(r, g, b)) || r2c0(r, g, b);
  CM.of = (hex) => {
    const c = CM.get(hex);
    if (c) return c;
    const n = parseInt(String(hex).slice(1), 16);
    return r2c0((n >> 16) & 255, (n >> 8) & 255, n & 255);
  };

  // the Colour docker in CMYK mode: the numbers on the sliders are kept for the colour it applies
  const readSliders = () => {
    const q = (k) => document.querySelector('#dock-body input[data-pf="coM:' + k + '"]');
    const els = ['c', 'm', 'y', 'k'].map(q);
    if (els.some((e) => !e)) return null;
    return els.map((e) => +e.value);
  };
  const remember = () => {
    const co = P5.color;
    if (!co || co.model !== 'cmyk') return;
    const c = readSliders();
    if (!c) return;
    const rgb = conv.cmyk2rgb(...c);
    CM.set(hexOf(...rgb), c);
  };
  const da0 = UI.dockAct;
  UI.dockAct = function (id, el) {
    if (typeof id === 'string' && id.startsWith('coApply')) remember();
    // the Colour docker's buttons are handled by the command layer
    if (typeof id === 'string' && /^co(Target|Model|Apply|Recent|Eye)/.test(id)) return UI.act(id, el);
    return da0.apply(this, arguments);
  };
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => {
    if (typeof id === 'string' && id.startsWith('coApply') && !VP._cmRem) remember();
    return act0(id, el);
  };

  /* ---------- CMYK PDF ---------- */
  let active = false;
  const toCMYK = (args) => {
    // jsPDF colour arguments: (r, g, b) 0–255, a single grey, or a CSS colour string
    let r;
    let g;
    let b;
    if (args.length >= 3 && args.slice(0, 3).every((v) => typeof v === 'number') && args.length !== 4) [r, g, b] = args;
    else if (args.length === 1 && typeof args[0] === 'string' && /^#?[0-9a-f]{6}$/i.test(args[0])) {
      const n = parseInt(args[0].replace('#', ''), 16);
      r = (n >> 16) & 255;
      g = (n >> 8) & 255;
      b = n & 255;
    } else return null;
    const c = conv.rgb2cmyk(r, g, b);
    return c.map((v) => v / 100);
  };
  const patchDoc = (pdf) => {
    ['setFillColor', 'setDrawColor', 'setTextColor'].forEach((n) => {
      const f = pdf[n];
      if (typeof f !== 'function' || f._vp) return;
      const w = function () {
        if (active) {
          const c = toCMYK(Array.from(arguments));
          if (c) return f.call(this, c[0], c[1], c[2], c[3]);
        }
        return f.apply(this, arguments);
      };
      w._vp = true;
      pdf[n] = w;
    });
    return pdf;
  };
  // every new PDF document gets CMYK-aware colour calls (they live on each document, not on a shared table)
  const patch = () => {
    const lib = window.jspdf;
    if (!lib || !lib.jsPDF || lib.jsPDF._vpCmyk) return;
    const J0 = lib.jsPDF;
    const J1 = function () {
      const pdf = new (Function.prototype.bind.apply(J0, [null].concat(Array.from(arguments))))();
      return patchDoc(pdf);
    };
    Object.getOwnPropertyNames(J0).forEach((k) => {
      if (['length', 'name', 'prototype', 'caller', 'arguments'].includes(k)) return;
      try {
        J1[k] = J0[k];
      } catch (e) { /* read-only */ }
    });
    J1.prototype = J0.prototype;
    J1._vpCmyk = true;
    lib.jsPDF = J1;
  };
  const withCMYK = (obj, name) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const f = obj[name];
    obj[name] = async function () {
      patch();
      const was = active;
      active = !!S.pdfCMYK;
      try {
        return await f.apply(this, arguments);
      } finally {
        active = was;
      }
    };
  };
  const start = () => {
    patch();
    withCMYK(VP.io, 'exportPDF');
    if (VP.files) ['pdf', 'print'].forEach((n) => withCMYK(VP.files, n));
  };
  A.pdfCMYK = {
    label: 'PDF renkleri: CMYK',
    checked: () => !!S.pdfCMYK,
    run: () => {
      S.pdfCMYK = !S.pdfCMYK;
      try {
        VP.io.savePrefs();
      } catch (e) { /* optional */ }
      VP.toast(S.pdfCMYK ? 'PDF’te düz renkler CMYK olarak yazılır (resimler ve geçişler RGB kalır)' : 'PDF renkleri RGB');
    }
  };
  const M = UI.MENUS.file;
  if (M && !M.includes('pdfCMYK')) {
    const i = M.indexOf('exportPdf');
    M.splice(i >= 0 ? i + 1 : M.length, 0, 'pdfCMYK');
  }
  if (document.readyState === 'complete') setTimeout(start, 0);
  else addEventListener('load', () => setTimeout(start, 0));
})();
