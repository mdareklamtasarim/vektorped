/* VektörPad: convert text to curves in every font (written for this app).
   - Google fonts (the ones in the font list and any added by name) are fetched as font files in the
     background (Latin and Latin Extended, so Turkish letters work) and their real outlines are used.
   - Fonts whose files cannot be read (system fonts such as Georgia, Arial, Times, Courier) are drawn large
     and traced into curves.
   - PDF export turns text in such fonts into curves, so the PDF looks like the drawing. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const Pt = (x, y) => new paper.Point(x, y);
  const FC = (VP.fontCurves = { cache: new Map(), loading: new Map() });
  const BUILTIN = /^fira sans$/i;
  const SYSTEM = ['georgia', 'times new roman', 'times', 'arial', 'helvetica', 'courier new', 'courier', 'verdana', 'tahoma', 'trebuchet ms', 'impact', 'comic sans ms', 'system-ui', 'sans-serif', 'serif', 'monospace'];
  const idOf = (fam) => String(fam || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const famOf = (t) => String(t.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
  const weightOf = (t) => {
    const w = String(t.fontWeight || 'normal').toLowerCase();
    const m = /(\d{3})/.exec(w);
    if (m) return Math.round(+m[1] / 100) * 100;
    return /bold/.test(w) ? 700 : 400;
  };
  const italicOf = (t) => /italic|oblique/.test(String(t.fontWeight || '') + ' ' + String(t.fontStyle || ''));
  const userFont = (fam) => VP.fontsMgr && VP.fontsMgr.ot && VP.fontsMgr.ot[String(fam).toLowerCase()];
  const fetchable = (fam) => fam && !BUILTIN.test(fam) && !SYSTEM.includes(fam.toLowerCase()) && !userFont(fam);
  const keyOf = (fam, w, it) => idOf(fam) + '|' + w + '|' + (it ? 'i' : 'n');

  /* ---------- font files ---------- */
  const url = (id, subset, w, it) => 'https://cdn.jsdelivr.net/npm/@fontsource/' + id + '@5/files/' + id + '-' + subset + '-' + w + '-' + (it ? 'italic' : 'normal') + '.woff';
  const getFont = async (id, subset, w, it) => {
    const r = await fetch(FC.url ? FC.url(id, subset, w, it) : url(id, subset, w, it));
    if (!r.ok) throw new Error('font ' + r.status);
    return opentype.parse(await r.arrayBuffer());
  };
  // Latin and Latin Extended files for a family; falls back to regular weight and upright style
  FC.load = (fam, w, it) => {
    const k = keyOf(fam, w, it);
    if (FC.cache.has(k)) return Promise.resolve(FC.cache.get(k));
    if (FC.loading.has(k)) return FC.loading.get(k);
    const id = idOf(fam);
    const tryOne = async (ww, ii) => {
      const res = await Promise.allSettled([getFont(id, 'latin', ww, ii), getFont(id, 'latin-ext', ww, ii)]);
      const fonts = res.filter((x) => x.status === 'fulfilled').map((x) => x.value);
      if (!fonts.length) throw new Error('no font');
      return fonts;
    };
    const p = (async () => {
      if (!window.opentype) return null;
      const tries = [[w, it], [w, false], [400, it], [400, false], [700, false]];
      for (const [ww, ii] of tries) {
        try {
          const fonts = await tryOne(ww, ii);
          FC.cache.set(k, fonts);
          return fonts;
        } catch (e) { /* next */ }
      }
      FC.cache.set(k, null);
      return null;
    })();
    FC.loading.set(k, p);
    p.finally(() => FC.loading.delete(k));
    return p;
  };
  const textsIn = (items) => {
    const out = [];
    const walk = (it) => {
      if (!it) return;
      if (it instanceof paper.PointText) out.push(it);
      else if (it.children) it.children.forEach(walk);
    };
    items.forEach(walk);
    return out;
  };
  FC.ensure = (items, ms = 6000) => {
    const specs = new Map();
    textsIn(items).forEach((t) => {
      const fam = famOf(t);
      if (!fetchable(fam)) return;
      const w = weightOf(t);
      const it = italicOf(t);
      specs.set(keyOf(fam, w, it), [fam, w, it]);
    });
    if (!specs.size) return Promise.resolve();
    const all = Promise.all([...specs.values()].map(([f, w, i]) => FC.load(f, w, i).catch(() => null)));
    return Promise.race([all, new Promise((r) => setTimeout(r, ms))]);
  };
  FC.ensureDoc = (ms) => FC.ensure(VP.userLayers(), ms);

  /* ---------- outlines from font files ---------- */
  const otOf = (t) => (VP.text3 && VP.text3.otOf ? VP.text3.otOf(t) : t.data && t.data.ot) || null;
  const glyphFor = (fonts, ch) => {
    for (const f of fonts) {
      const g = f.charToGlyph(ch);
      if (g && g.index > 0) return { f, g };
    }
    return { f: fonts[0], g: fonts[0].charToGlyph(ch) };
  };
  const fromFonts = (t, fonts) => {
    const size = t.fontSize;
    const lead = t.leading || size * 1.2;
    const ot = otOf(t);
    const track = ot && ot.track ? (ot.track / 1000) * size : 0;
    let d = '';
    String(t.content).split(/\r?\n/).forEach((ln, li) => {
      const chars = Array.from(ln);
      if (!chars.length) return;
      const gs = chars.map((ch) => glyphFor(fonts, ch));
      const adv = [];
      let w = 0;
      gs.forEach((x, i) => {
        let a = (x.g.advanceWidth || 0) * (size / x.f.unitsPerEm);
        const nx = gs[i + 1];
        if (nx && nx.f === x.f && ot && ot.kern !== false && x.f.getKerningValue) a += x.f.getKerningValue(x.g, nx.g) * (size / x.f.unitsPerEm);
        a += i < gs.length - 1 ? track : 0;
        adv.push(a);
        w += a;
      });
      let x = t.justification === 'center' ? -w / 2 : t.justification === 'right' ? -w : 0;
      gs.forEach((q, i) => {
        d += q.g.getPath(x, li * lead, size).toPathData(3) + ' ';
        x += adv[i];
      });
    });
    return d.trim();
  };

  /* ---------- traced outlines for fonts without a readable file ---------- */
  const traced = (t) => {
    if (!VP.bitmap || !VP.bitmap.trace) return null;
    const lines = String(t.content).split(/\r?\n/);
    const size = t.fontSize || 12;
    const PX = 240;
    const k = PX / size;
    const lead = (t.leading || size * 1.2) * k;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    const font = (italicOf(t) ? 'italic ' : '') + weightOf(t) + ' ' + PX + 'px ' + JSON.stringify(famOf(t));
    ctx.font = font;
    const ot = otOf(t);
    const ls = ot && ot.track && 'letterSpacing' in ctx ? ((ot.track / 1000) * PX).toFixed(2) + 'px' : null;
    if (ls) ctx.letterSpacing = ls;
    const widths = lines.map((l) => ctx.measureText(l).width);
    const maxW = Math.max(1, ...widths);
    const pad = Math.round(PX * 0.5);
    const asc = PX * 1.05;
    const W = Math.min(8000, Math.ceil(maxW + pad * 2));
    const Hh = Math.min(8000, Math.ceil(asc + (lines.length - 1) * lead + PX * 0.45 + pad * 2));
    cv.width = W;
    cv.height = Hh;
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#fff';
    c2.fillRect(0, 0, W, Hh);
    c2.fillStyle = '#000';
    c2.font = font;
    if (ls) c2.letterSpacing = ls;
    c2.textBaseline = 'alphabetic';
    // the text's own origin (first baseline, alignment point) sits here in the picture
    const ox = t.justification === 'center' ? pad + maxW / 2 : t.justification === 'right' ? pad + maxW : pad;
    const oy = pad + asc;
    lines.forEach((l, i) => {
      const x = t.justification === 'center' ? ox - widths[i] / 2 : t.justification === 'right' ? ox - widths[i] : ox;
      c2.fillText(l, x, oy + i * lead);
    });
    const r = new paper.Raster({ canvas: cv, insert: false });
    r.position = Pt(W / 2, Hh / 2);
    let res;
    try {
      res = VP.bitmap.trace(r, { bw: true, threshold: 128, side: Math.max(W, Hh), min: 3, tol: 0.35, removeBg: true });
    } catch (e) {
      return null;
    }
    const g = res && res.group;
    if (!g) return null;
    // keep the dark shapes (the letters), drop the white page
    const kids = [];
    g.children.slice().forEach((cp) => {
      const col = cp.fillColor;
      if (col && col.gray > 0.5) return;
      (cp.children ? cp.children.slice() : [cp]).forEach((p) => kids.push(p));
    });
    if (!kids.length) return null;
    const out = new paper.CompoundPath({ children: kids, insert: false });
    out.fillRule = 'evenodd';
    out.translate(Pt(-ox, -oy));
    out.scale(1 / k, Pt(0, 0));
    return out;
  };

  /* ---------- text to curves ---------- */
  const finish = (t, cp) => {
    cp.transform(t.matrix);
    cp.fillColor = t.fillColor;
    cp.strokeColor = t.strokeColor;
    cp.strokeWidth = t.strokeWidth;
    cp.opacity = t.opacity;
    cp.blendMode = t.blendMode;
    cp.data = JSON.parse(JSON.stringify(t.data || {}));
    cp.insertAbove(t);
    t.remove();
    if (VP.applyShadowProps) VP.applyShadowProps(cp);
    return cp;
  };
  const ttp0 = VP.textToPath;
  VP.textToPath = (t) => {
    const r = ttp0(t);
    if (r || !t || !t.parent) return r;
    const fam = famOf(t);
    let cp = null;
    const fonts = FC.cache.get(keyOf(fam, weightOf(t), italicOf(t)));
    if (fonts && fonts.length) {
      try {
        const d = fromFonts(t, fonts);
        cp = new paper.CompoundPath({ pathData: d || 'M0,0', insert: false });
      } catch (e) {
        cp = null;
      }
    }
    if (!cp) cp = traced(t);
    if (!cp) return null;
    return finish(t, cp);
  };
  FC.traced = traced;

  // Convert to curves waits (a few seconds at most) for font files the selection needs
  if (VP.convertToCurves) {
    const cc0 = VP.convertToCurves;
    VP.convertToCurves = function () {
      const args = arguments;
      const me = this;
      const sel = VP.sel.slice();
      const need = textsIn(sel).some((t) => fetchable(famOf(t)) && !FC.cache.has(keyOf(famOf(t), weightOf(t), italicOf(t))));
      if (!need) return cc0.apply(me, args);
      VP.toast('Yazı tipi dosyası alınıyor…');
      return FC.ensure(sel).then(() => {
        if (sel.every((it) => it.parent)) VP.sel = sel.filter((it) => it.parent);
        return cc0.apply(me, args);
      });
    };
  }

  // PDF: text in fonts other than the embedded one becomes curves, so it keeps its look
  VP.io.exportHooks = VP.io.exportHooks || [];
  VP.io.exportHooks.push((tmp, index, opts) => {
    if (!opts || !opts.pdf || opts.curves) return;
    tmp.getItems({ class: paper.PointText }).forEach((t) => {
      if (BUILTIN.test(famOf(t))) return;
      try {
        VP.textToPath(t);
      } catch (e) { /* the text stays as text */ }
    });
  });
  const wrapAsync = (obj, name) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const f = obj[name];
    obj[name] = async function () {
      await FC.ensureDoc(8000);
      return f.apply(this, arguments);
    };
  };
  wrapAsync(VP.io, 'exportPDF');
  if (VP.files) ['pdf', 'print'].forEach((n) => wrapAsync(VP.files, n));

  // fonts used in the document are fetched in the background, so conversion is ready when needed
  let pre = 0;
  const prefetch = () => {
    clearTimeout(pre);
    pre = setTimeout(() => {
      try {
        FC.ensureDoc(20000);
      } catch (e) { /* offline */ }
    }, 1500);
  };
  VP.on('doc', prefetch);
  VP.on('change', prefetch);
  if (document.readyState === 'complete') setTimeout(prefetch, 3000);
  else addEventListener('load', () => setTimeout(prefetch, 3000));
  void A;
  void UI;
})();
