/* VektörPad text objects: text on a path, paragraph (frame) text with columns, and tables.
   Each one is a live Group (applyMatrix=false, data.effect) rebuilt from its data, like the effects in vp-effects.js.
   Loaded after vp-ui.js, so it can add actions, property-bar fields and tools. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const TX = (VP.tx = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);
  const $ = (s) => document.querySelector(s);
  const esc = H.esc;
  const ic = H.ic;
  const mm = H.mm;
  const TYPES = ['textpath', 'paragraph', 'table'];

  Object.assign(FX.NAMES, { textpath: 'Yoldaki metin', paragraph: 'Paragraf metni', table: 'Tablo' });
  Object.assign(VP.KIND_NAMES, { textpath: 'Yoldaki metin', paragraph: 'Paragraf metni', table: 'Tablo' });
  const typeOf = (it) => {
    const fx = FX.of(it);
    return fx ? fx.type : null;
  };
  TX.is = (it, type) => typeOf(it) === type;
  TX.isTx = (it) => TYPES.includes(typeOf(it));
  const one = (type) => {
    const it = VP.sel.length === 1 ? VP.sel[0] : null;
    if (!it) return null;
    return type ? (TX.is(it, type) ? it : null) : TX.isTx(it) ? it : null;
  };
  TX.one = one;

  /* =============== measuring =============== */
  // Widths are measured once at 100px and scaled, so the cache works for every size.
  const REF = 100;
  const mctx = document.createElement('canvas').getContext('2d');
  const fontKey = (f) => VP.textWeight(f.bold, f.italic) + ' ' + REF + 'px ' + f.family;
  const caches = new Map();
  TX.measurer = (f) => {
    const key = fontKey(f);
    let c = caches.get(key);
    if (!c) {
      if (caches.size > 40) caches.delete(caches.keys().next().value);
      c = { w: new Map(), m: null };
      caches.set(key, c);
    }
    const k = f.size / REF;
    const m = (s) => {
      let w = c.w.get(s);
      if (w == null) {
        mctx.font = key;
        w = mctx.measureText(s).width;
        if (c.w.size > 5000) c.w.clear();
        c.w.set(s, w);
      }
      return w * k;
    };
    if (!c.m) {
      mctx.font = key;
      const r = mctx.measureText('Hgé');
      const a = r.fontBoundingBoxAscent;
      const d = r.fontBoundingBoxDescent;
      c.m = a > 0 && d >= 0 ? { asc: a / REF, desc: d / REF } : { asc: 0.92, desc: 0.24 };
    }
    m.asc = c.m.asc * f.size;
    m.desc = c.m.desc * f.size;
    return m;
  };
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => caches.clear());
  const fontReady = (f) => {
    try {
      return !document.fonts || document.fonts.check(fontKey(f));
    } catch (e) {
      return true;
    }
  };
  // A web font that is still downloading measures with the fallback; lay out again once it arrives.
  // each font is waited for once: some browsers never report certain fonts as ready, and waiting again
  // after every rebuild would rebuild the text forever
  const waited = new Set();
  const whenFont = (g, f) => {
    if (fontReady(f)) return;
    const key = fontKey(f);
    if (waited.has(key)) return;
    waited.add(key);
    document.fonts.load(key).then(() => {
      caches.delete(key);
      if (g.parent && FX.of(g)) {
        TX.build(g);
        VP.drawOverlay();
        if (paper.view.update) paper.view.update();
      }
    }).catch(() => {});
  };

  /* Greedy line breaking. Returns [{text, words, width, last}] where last marks the end of a paragraph. */
  TX.breakLines = (text, width, m) => {
    const out = [];
    String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n').forEach((para) => {
      const words = para.split(/[ \t]+/).filter(Boolean);
      if (!words.length) {
        out.push({ text: '', words: [], width: 0, last: true });
        return;
      }
      let cur = [];
      let curText = '';
      const push = (last) => {
        out.push({ text: curText, words: cur, width: m(curText), last });
        cur = [];
        curText = '';
      };
      words.forEach((w) => {
        if (m(w) > width) {
          // a word longer than the line is split between letters
          if (cur.length) push(false);
          let piece = '';
          Array.from(w).forEach((ch) => {
            if (piece && m(piece + ch) > width) {
              cur = [piece];
              curText = piece;
              push(false);
              piece = ch;
            } else piece += ch;
          });
          cur = [piece];
          curText = piece;
          return;
        }
        const cand = curText ? curText + ' ' + w : w;
        if (cur.length && m(cand) > width) {
          push(false);
          cur = [w];
          curText = w;
        } else {
          cur.push(w);
          curText = cand;
        }
      });
      if (cur.length) push(true);
    });
    return out;
  };

  /* =============== shared look (fill/outline of the letters) =============== */
  const protoOf = (fx) => {
    let t = null;
    if (fx.style) {
      try {
        const h = new paper.Group({ insert: false });
        t = h.importJSON(fx.style);
        if (t) t.remove();
      } catch (e) {
        t = null;
      }
    }
    if (!(t instanceof paper.PointText)) t = new paper.PointText({ content: 'A', fillColor: '#1d1d1b', insert: false });
    const f = fx.font;
    t.fontFamily = f.family;
    t.fontSize = f.size;
    t.fontWeight = VP.textWeight(f.bold, f.italic);
    return t;
  };
  const styleFrom = (t) => {
    const p = new paper.PointText({ content: 'A', insert: false });
    p.fillColor = t && t.fillColor ? t.fillColor.clone() : null;
    p.strokeColor = t && t.strokeColor ? t.strokeColor.clone() : null;
    p.strokeWidth = t ? t.strokeWidth : 1;
    p.data = { dash: (t && t.data && t.data.dash) || 'solid' };
    return p.exportJSON({ asString: true });
  };
  const lookOf = (fx) => {
    if (fx.type === 'table') return { fill: { type: 'solid', color: fx.color || '#1d1d1b', alpha: 1 }, stroke: { on: false } };
    const p = protoOf(fx);
    return { fill: VP.getFill(p), stroke: VP.getStroke(p) };
  };
  const makeText = (f, look, s, pt, just = 'left', bold) => {
    const t = new paper.PointText({
      point: pt, content: s, justification: just,
      fontFamily: f.family, fontSize: f.size, fontWeight: VP.textWeight(bold == null ? f.bold : bold, f.italic), insert: false
    });
    VP.setFill([t], look.fill);
    VP.setStroke([t], look.stroke.on ? { on: true, color: look.stroke.color, width: look.stroke.width, dash: look.stroke.dash } : { on: false });
    return t;
  };
  const hitRect = (x, y, w, h) => {
    const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(x, y, Math.max(w, 0.5), Math.max(h, 0.5)), insert: false });
    r.fillColor = '#000000';
    r.opacity = 0;
    r.data = { hitOnly: true };
    return r;
  };
  const defaultFont = () => ({ family: VP.defaults.fontFamily || 'Fira Sans', size: 12, bold: !!VP.defaults.bold, italic: !!VP.defaults.italic });
  const defaultStyle = () => {
    const p = new paper.PointText({ content: 'A', insert: false });
    p.fillColor = new paper.Color(VP.defaults.fill || '#1d1d1b');
    p.data = { dash: 'solid' };
    return p.exportJSON({ asString: true });
  };
  const fontOfText = (t) => ({ family: t.fontFamily || 'Fira Sans', size: t.fontSize || 12, bold: VP.isBold(t), italic: VP.isItalic(t) });
  const newGroup = (fx) => {
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.data.effect = fx;
    return g;
  };
  const rectOf = (g, x, y, w, h) => {
    const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(x, y, w, h), insert: false });
    r.transform(g.matrix);
    return r;
  };
  // Scaling that keeps the text crisp: edges resize the frame, a uniform scale also scales the type.
  const axisAligned = (g, sx, sy) => {
    const M = g.matrix;
    return Math.abs(M.b) < 1e-9 && Math.abs(M.c) < 1e-9 && M.a > 0 && M.d > 0 && sx > 0 && sy > 0;
  };
  const moveOrigin = (g, fx, sx, sy, anchor) => {
    const M = g.matrix;
    const tl = M.transform(Pt(fx.x, fx.y));
    const n = M.inverseTransform(anchor.add(tl.subtract(anchor).multiply(Pt(sx, sy))));
    fx.x = n.x;
    fx.y = n.y;
  };

  /* =============== TEXT ON A PATH =============== */
  const longest = (cp) => cp.children.reduce((a, b) => (b.length > (a ? a.length : -1) ? b : a), null);
  TX.tpSource = (g) => g.children.find((c) => c.data.effectSrc);
  TX.buildTextPath = (g) => {
    const fx = g.data.effect;
    const src = TX.tpSource(g);
    if (!src) return;
    g.children.slice().forEach((c) => c !== src && c.remove());
    src.visible = fx.showPath !== false;
    const base = src instanceof paper.CompoundPath ? longest(src) : src;
    fx.hidden = 0;
    if (!base || !(base.length > 0.01)) return;
    const P = base.clone({ insert: false });
    if (P.closed && !P.clockwise) P.reverse();
    if (fx.flip) P.reverse();
    const len = P.length;
    const m = TX.measurer(fx.font);
    const chars = Array.from(String(fx.text || '').replace(/\s*\n\s*/g, ' '));
    const sp = fx.spacing || 0;
    const pos = [];
    let pre = '';
    chars.forEach((ch, i) => {
      const x0 = m(pre);
      pre += ch;
      pos.push({ ch, c: x0 + (m(pre) - x0) / 2 + i * sp });
    });
    const total = chars.length ? m(pre) + sp * (chars.length - 1) : 0;
    let start;
    if (P.closed) {
      // closed shapes: centre the text on the top (or, on the other side, the bottom) of the shape
      let s0 = 0;
      let best = fx.flip ? -Infinity : Infinity;
      for (let k = 0; k < 240; k++) {
        const s = (len * k) / 240;
        const y = P.getPointAt(s).y;
        if (fx.flip ? y > best : y < best) {
          best = y;
          s0 = s;
        }
      }
      start = fx.align === 'start' ? s0 : fx.align === 'end' ? s0 - total : s0 - total / 2;
    } else start = fx.align === 'start' ? 0 : fx.align === 'end' ? len - total : (len - total) / 2;
    start += fx.shift || 0;
    const look = lookOf(fx);
    const glyphs = new paper.Group({ insert: false });
    glyphs.data.tpGlyphs = true;
    let hidden = 0;
    pos.forEach(({ ch, c }) => {
      if (!ch.trim()) return;
      let s = start + c;
      if (P.closed) s = ((s % len) + len) % len;
      else if (s < 0 || s > len) {
        hidden++;
        return;
      }
      const p = P.getPointAt(s);
      const t = P.getTangentAt(s);
      if (!p || !t) {
        hidden++;
        return;
      }
      const at = p.add(t.rotate(-90).multiply(fx.offset || 0));
      const g1 = makeText(fx.font, look, ch, at, 'center');
      g1.rotate(t.angle, at);
      glyphs.addChild(g1);
    });
    g.addChild(glyphs);
    fx.hidden = hidden;
    whenFont(g, fx.font);
  };
  TX.fitToPath = (path, text) => {
    if (!path || !FX.isShape(path)) return VP.toast('Metni yerleştirmek için bir eğri veya şekil seçin');
    const fx = {
      type: 'textpath', text: text ? String(text.content).replace(/\s*\n\s*/g, ' ') : '',
      font: text ? fontOfText(text) : Object.assign(defaultFont(), { size: VP.defaults.fontSize || 24 }),
      style: text ? styleFrom(text) : defaultStyle(),
      offset: 0, shift: 0, align: 'center', spacing: 0, flip: false, showPath: true
    };
    const g = newGroup(fx);
    g.insertAbove(text && text.isAbove(path) ? text : path);
    delete path.data.param;
    path.data.effectSrc = true;
    g.addChild(path);
    if (text) {
      g.opacity = text.opacity;
      if (text.data.shadow) g.data.shadow = text.data.shadow;
      text.remove();
    }
    TX.buildTextPath(g);
    VP.applyShadowProps(g);
    VP.setSelection([g]);
    if (text) {
      VP.commit();
      VP.toast(fx.hidden ? 'Metin yola yerleştirildi · ' + fx.hidden + ' harf sığmadı' : 'Metin yola yerleştirildi');
    } else TX.edit(g, true);
    return g;
  };
  TX.fitSelection = () => {
    const path = VP.sel.find(FX.isShape);
    const text = VP.sel.find((it) => it instanceof paper.PointText);
    if (!path) return VP.toast('Bir metin ve bir eğri seçin (ya da yalnızca eğri)');
    TX.fitToPath(path, text || null);
  };

  /* =============== PARAGRAPH (frame) TEXT =============== */
  const paraGeom = (fx) => {
    const cols = Math.max(1, Math.round(fx.cols || 1));
    const gut = cols > 1 ? Math.max(0, fx.gutter || 0) : 0;
    const colW = Math.max(fx.font.size * 0.6, (fx.w - gut * (cols - 1)) / cols);
    return { cols, gut, colW };
  };
  const paraLines = (fx) => {
    const m = TX.measurer(fx.font);
    const { colW } = paraGeom(fx);
    return { m, lines: TX.breakLines(fx.text, colW, m) };
  };
  // Pours lines into the columns from top to bottom; returns the placed lines and how many did not fit.
  const pour = (fx, lines, h) => {
    const { cols } = paraGeom(fx);
    const lh = fx.font.size * (fx.lead || 1.2);
    const eps = 1e-6;
    const placed = [];
    const used = new Array(cols).fill(0);
    let col = 0;
    let y = 0;
    let i = 0;
    for (; i < lines.length; i++) {
      if (y > 0 && y + lh > h + eps) {
        col++;
        y = 0;
      }
      if (col >= cols || lh > h + eps) break;
      placed.push({ ln: lines[i], col, top: y });
      y += lh;
      used[col] = y;
      if (lines[i].last) y += fx.paraSpace || 0;
    }
    return { placed, used, overflow: lines.length - i, lh };
  };
  TX.fitHeight = (fx) => {
    const { lines } = paraLines(fx);
    const lh = fx.font.size * (fx.lead || 1.2);
    if (!lines.length) return lh;
    let hi = lines.length * (lh + (fx.paraSpace || 0)) + lh;
    let lo = lh;
    if (pour(fx, lines, lo).overflow === 0) return lo;
    for (let k = 0; k < 32 && hi - lo > 0.05; k++) {
      const mid = (lo + hi) / 2;
      if (pour(fx, lines, mid).overflow) lo = mid;
      else hi = mid;
    }
    return hi + 0.01;
  };
  TX.fitTextToFrame = (g) => {
    const fx = g.data.effect;
    if (!String(fx.text).trim()) return;
    const orig = fx.font.size;
    let lo = 1;
    let hi = Math.max(orig * 4, 12);
    const fits = (s) => {
      fx.font.size = s;
      const { lines } = paraLines(fx);
      return pour(fx, lines, fx.h).overflow === 0;
    };
    if (!fits(lo)) {
      fx.font.size = orig;
      return VP.toast('Metin bu çerçeveye sığmıyor · Çerçeveyi büyütün');
    }
    for (let k = 0; k < 28 && hi - lo > 0.05; k++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    fx.font.size = Math.floor(lo * 10) / 10;
    fx.autoH = false;
    TX.buildPara(g);
    VP.commit();
    VP.toast('Yazı boyutu ' + VP.num(fx.font.size, 1) + ' pt yapıldı');
  };
  TX.buildPara = (g) => {
    const fx = g.data.effect;
    fx.w = Math.max(fx.w, fx.font.size * 0.8);
    if (fx.autoH) fx.h = TX.fitHeight(fx);
    fx.h = Math.max(fx.h, 1);
    g.removeChildren();
    const frame = hitRect(fx.x, fx.y, fx.w, fx.h);
    frame.data.paraFrame = true;
    g.addChild(frame);
    const { m, lines } = paraLines(fx);
    const { colW, gut } = paraGeom(fx);
    const P = pour(fx, lines, fx.h);
    fx.overflow = P.overflow;
    const half = (P.lh - (m.asc + m.desc)) / 2;
    const look = lookOf(fx);
    P.placed.forEach(({ ln, col, top }) => {
      if (!ln.text) return;
      const x0 = fx.x + col * (colW + gut);
      const free = Math.max(0, fx.h - P.used[col]);
      const yOff = fx.valign === 'middle' ? free / 2 : fx.valign === 'bottom' ? free : 0;
      const base = fx.y + top + yOff + half + m.asc;
      if (fx.align === 'justify' && !ln.last && ln.words.length > 1) {
        const ws = ln.words.map((w) => m(w));
        const gap = (colW - ws.reduce((a, b) => a + b, 0)) / (ln.words.length - 1);
        let x = x0;
        ln.words.forEach((w, k) => {
          g.addChild(makeText(fx.font, look, w, Pt(x, base)));
          x += ws[k] + gap;
        });
      } else {
        let x = x0;
        if (fx.align === 'center') x = x0 + (colW - ln.width) / 2;
        else if (fx.align === 'right') x = x0 + colW - ln.width;
        g.addChild(makeText(fx.font, look, ln.text, Pt(x, base)));
      }
    });
    whenFont(g, fx.font);
  };
  TX.createParagraph = (rect, text, opts = {}) => {
    VP.ensureLayer();
    const fx = Object.assign(
      {
        type: 'paragraph', text: text || '', font: defaultFont(), style: defaultStyle(),
        x: rect.x, y: rect.y, w: rect.width, h: rect.height,
        cols: 1, gutter: VP.toPT(5), lead: 1.2, paraSpace: 0, align: 'left', valign: 'top', autoH: false
      },
      opts
    );
    const g = newGroup(fx);
    VP.activeLayer.addChild(g);
    TX.buildPara(g);
    VP.setSelection([g]);
    return g;
  };
  TX.toParagraph = () => {
    const t = VP.sel.find((it) => it instanceof paper.PointText);
    if (!t) return VP.toast('Önce bir metin seçin');
    const b = t.bounds;
    const font = fontOfText(t);
    const g = TX.createParagraph(new paper.Rectangle(b.left, b.top, Math.max(b.width * 1.04 + font.size * 0.5, font.size * 4), b.height), t.content, {
      font, style: styleFrom(t), align: t.justification === 'center' || t.justification === 'right' ? t.justification : 'left', autoH: true,
      lead: t.leading && t.fontSize ? t.leading / t.fontSize : 1.2
    });
    g.remove();
    g.insertAbove(t);
    g.opacity = t.opacity;
    if (t.data.shadow) g.data.shadow = t.data.shadow;
    VP.applyShadowProps(g);
    t.remove();
    VP.setSelection([g]);
    VP.commit();
    VP.toast('Paragraf metnine dönüştürüldü · Çerçeve kenarlarını sürükleyin: metin yeniden akar');
  };
  // Paragraph → one artistic text with the current line breaks.
  const paraToArtistic = (g) => {
    const fx = g.data.effect;
    const { lines } = paraLines(fx);
    const P = pour(fx, lines, fx.h);
    const content = P.placed.map((p) => p.ln.text).join('\n') || ' ';
    const look = lookOf(fx);
    const { colW } = paraGeom(fx);
    const just = fx.align === 'center' || fx.align === 'right' ? fx.align : 'left';
    const x = just === 'center' ? fx.x + colW / 2 : just === 'right' ? fx.x + colW : fx.x;
    const m = TX.measurer(fx.font);
    const t = makeText(fx.font, look, content, Pt(x, fx.y + (P.lh - (m.asc + m.desc)) / 2 + m.asc), just);
    t.leading = P.lh;
    t.transform(g.matrix);
    t.opacity = g.opacity;
    if (g.data.shadow) t.data.shadow = g.data.shadow;
    t.insertAbove(g);
    VP.applyShadowProps(t);
    g.remove();
    return [t];
  };
  TX.toArtistic = () => {
    const g = VP.sel.find((it) => TX.is(it, 'paragraph'));
    if (!g) return VP.toast('Önce bir paragraf metni seçin');
    const out = paraToArtistic(g);
    VP.setSelection(out);
    VP.commit();
    VP.toast('Sanatsal metne dönüştürüldü');
  };

  /* =============== TABLE =============== */
  const regionAt = (fx, r, c) => fx.merges.find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs) || { r, c, rs: 1, cs: 1 };
  TX.regionAt = regionAt;
  const sameMerge = (a, b) => a.r === b.r && a.c === b.c && (a.rs > 1 || a.cs > 1);
  const colName = (c) => (c < 26 ? String.fromCharCode(65 + c) : String.fromCharCode(65 + Math.floor(c / 26) - 1) + String.fromCharCode(65 + (c % 26)));
  TX.cellName = (r, c) => colName(c) + (r + 1);
  const normTable = (fx) => {
    const R = fx.rowH.length;
    const C = fx.colW.length;
    fx.cells = fx.cells || [];
    for (let r = 0; r < R; r++) {
      fx.cells[r] = fx.cells[r] || [];
      for (let c = 0; c < C; c++) fx.cells[r][c] = fx.cells[r][c] || { t: '' };
      fx.cells[r].length = C;
    }
    fx.cells.length = R;
    fx.merges = (fx.merges || []).filter((m) => m.r >= 0 && m.c >= 0 && m.rs > 0 && m.cs > 0 && m.r + m.rs <= R && m.c + m.cs <= C && m.rs * m.cs > 1);
  };
  TX.tableGeom = (fx) => {
    const hs = fx.eff && fx.eff.length === fx.rowH.length ? fx.eff : fx.rowH;
    const xs = [fx.x];
    fx.colW.forEach((w) => xs.push(xs[xs.length - 1] + w));
    const ys = [fx.y];
    hs.forEach((h) => ys.push(ys[ys.length - 1] + h));
    return { xs, ys };
  };
  TX.buildTable = (g) => {
    const fx = g.data.effect;
    normTable(fx);
    const R = fx.rowH.length;
    const C = fx.colW.length;
    const f = fx.font;
    const mN = TX.measurer(f);
    const mB = TX.measurer(Object.assign({}, f, { bold: true }));
    const lh = f.size * 1.2;
    const pad = fx.pad;
    const regs = [];
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const reg = regionAt(fx, r, c);
        if (reg.r !== r || reg.c !== c) continue;
        const cell = fx.cells[r][c];
        const bold = !!(cell.b || (fx.header && r === 0) || f.bold);
        let w = -2 * pad;
        for (let k = c; k < c + reg.cs; k++) w += fx.colW[k];
        const m = bold ? mB : mN;
        const lines = cell.t ? TX.breakLines(cell.t, Math.max(1, w), m) : [];
        regs.push(Object.assign({}, reg, { cell, bold, w, m, lines, need: lines.length ? lines.length * lh + 2 * pad : 0 }));
      }
    }
    // rows grow to fit their text; the height the user set stays as the minimum
    const eff = fx.rowH.slice();
    regs.forEach((g1) => {
      if (g1.rs === 1) eff[g1.r] = Math.max(eff[g1.r], g1.need);
    });
    regs.forEach((g1) => {
      if (g1.rs === 1) return;
      let sum = 0;
      for (let k = g1.r; k < g1.r + g1.rs; k++) sum += eff[k];
      if (sum < g1.need) eff[g1.r + g1.rs - 1] += g1.need - sum;
    });
    fx.eff = eff;
    const { xs, ys } = TX.tableGeom(fx);
    g.removeChildren();
    g.addChild(hitRect(xs[0], ys[0], xs[C] - xs[0], ys[R] - ys[0]));
    regs.forEach((g1) => {
      const fill = g1.cell.f !== undefined ? g1.cell.f : fx.header && g1.r === 0 ? fx.headerFill : fx.fill;
      if (!fill) return;
      const bg = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(xs[g1.c], ys[g1.r], xs[g1.c + g1.cs] - xs[g1.c], ys[g1.r + g1.rs] - ys[g1.r]), insert: false });
      bg.fillColor = new paper.Color(fill);
      bg.data.tblBg = true;
      g.addChild(bg);
    });
    if (fx.bColor && fx.bWidth > 0 && fx.border !== 'none') {
      const segs = [];
      const run = (a, b, fixed, horiz) => segs.push(horiz ? [Pt(a, fixed), Pt(b, fixed)] : [Pt(fixed, a), Pt(fixed, b)]);
      if (fx.border === 'outer') {
        const o = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(xs[0], ys[0], xs[C] - xs[0], ys[R] - ys[0]), insert: false });
        segs.push(o);
      } else {
        for (let i = 0; i <= R; i++) {
          let cur = null;
          for (let c = 0; c < C; c++) {
            const inside = i > 0 && i < R && sameMerge(regionAt(fx, i - 1, c), regionAt(fx, i, c));
            if (inside) {
              if (cur) run(cur[0], cur[1], ys[i], true);
              cur = null;
            } else if (cur) cur[1] = xs[c + 1];
            else cur = [xs[c], xs[c + 1]];
          }
          if (cur) run(cur[0], cur[1], ys[i], true);
        }
        if (fx.border === 'all') {
          for (let j = 0; j <= C; j++) {
            let cur = null;
            for (let r = 0; r < R; r++) {
              const inside = j > 0 && j < C && sameMerge(regionAt(fx, r, j - 1), regionAt(fx, r, j));
              if (inside) {
                if (cur) run(cur[0], cur[1], xs[j], false);
                cur = null;
              } else if (cur) cur[1] = ys[r + 1];
              else cur = [ys[r], ys[r + 1]];
            }
            if (cur) run(cur[0], cur[1], xs[j], false);
          }
        }
      }
      const kids = segs.map((s) => (s instanceof paper.Path ? s : new paper.Path({ segments: s, insert: false })));
      const grid = new paper.CompoundPath({ children: kids, insert: false });
      grid.fillColor = null;
      grid.strokeColor = new paper.Color(fx.bColor);
      grid.strokeWidth = fx.bWidth;
      grid.strokeCap = 'square';
      grid.strokeJoin = 'miter';
      grid.data.tblGrid = true;
      g.addChild(grid);
    }
    const look = lookOf(fx);
    regs.forEach((g1) => {
      if (!g1.lines.length) return;
      const top = ys[g1.r];
      const hh = ys[g1.r + g1.rs] - top;
      const block = g1.lines.length * lh;
      const va = g1.cell.v || fx.valign;
      const y0 = va === 'top' ? top + pad : va === 'bottom' ? top + hh - pad - block : top + (hh - block) / 2;
      const half = (lh - (g1.m.asc + g1.m.desc)) / 2;
      const al = g1.cell.a || fx.align;
      const x0 = xs[g1.c] + pad;
      g1.lines.forEach((ln, k) => {
        if (!ln.text) return;
        let x = x0;
        if (al === 'center') x = x0 + (g1.w - ln.width) / 2;
        else if (al === 'right') x = x0 + g1.w - ln.width;
        g.addChild(makeText(f, look, ln.text, Pt(x, y0 + k * lh + half + g1.m.asc), 'left', g1.bold));
      });
    });
    whenFont(g, f);
  };
  TX.createTable = (rect) => {
    VP.ensureLayer();
    const d = VP.defaults;
    const rows = clamp(Math.round(d.tableRows || 3), 1, 60);
    const cols = clamp(Math.round(d.tableCols || 3), 1, 30);
    const rh = rect.height / rows;
    const fx = {
      type: 'table', x: rect.x, y: rect.y,
      colW: new Array(cols).fill(rect.width / cols), rowH: new Array(rows).fill(rh),
      cells: [], merges: [],
      font: { family: d.fontFamily || 'Fira Sans', size: clamp(Math.round(rh * 0.34 * 2) / 2, 6, 18), bold: false, italic: false },
      color: '#1d1d1b', pad: clamp(rh * 0.16, 2, 8), border: 'all', bColor: '#1d1d1b', bWidth: 0.75,
      header: true, headerFill: '#e3e9f0', fill: null, align: 'left', valign: 'middle'
    };
    const g = newGroup(fx);
    VP.activeLayer.addChild(g);
    TX.buildTable(g);
    VP.setSelection([g]);
    TX.setCellSel(g, { r: 0, c: 0 }, { r: 0, c: 0 });
    VP.commit();
    VP.toast('Tablo eklendi · Hücreye dokunun: seç · Seçili hücreye tekrar dokunun: yaz');
    return g;
  };
  TX.cellAt = (g, pt) => {
    const fx = g.data.effect;
    const lp = g.globalToLocal(pt);
    const { xs, ys } = TX.tableGeom(fx);
    const R = fx.rowH.length;
    const C = fx.colW.length;
    if (lp.x < xs[0] || lp.x > xs[C] || lp.y < ys[0] || lp.y > ys[R]) return null;
    let c = 0;
    while (c < C - 1 && lp.x >= xs[c + 1]) c++;
    let r = 0;
    while (r < R - 1 && lp.y >= ys[r + 1]) r++;
    return { r, c };
  };
  /* Cell selection (only while the table tool works on a table). */
  TX.cellSel = null;
  TX.setCellSel = (g, a, b) => {
    TX.cellSel = { g, a: { r: a.r, c: a.c }, b: { r: b.r, c: b.c } };
  };
  TX.selRange = (g) => {
    const s = TX.cellSel;
    if (!s || !s.g || s.g !== g || !g.parent) return null;
    const fx = g.data.effect;
    const R = fx.rowH.length;
    const C = fx.colW.length;
    let r0 = clamp(Math.min(s.a.r, s.b.r), 0, R - 1);
    let r1 = clamp(Math.max(s.a.r, s.b.r), 0, R - 1);
    let c0 = clamp(Math.min(s.a.c, s.b.c), 0, C - 1);
    let c1 = clamp(Math.max(s.a.c, s.b.c), 0, C - 1);
    // grow until no merged cell is cut by the range
    for (let guard = 0; guard < 50; guard++) {
      let grew = false;
      fx.merges.forEach((m) => {
        const hit = m.r <= r1 && m.r + m.rs - 1 >= r0 && m.c <= c1 && m.c + m.cs - 1 >= c0;
        if (!hit) return;
        if (m.r < r0) { r0 = m.r; grew = true; }
        if (m.c < c0) { c0 = m.c; grew = true; }
        if (m.r + m.rs - 1 > r1) { r1 = m.r + m.rs - 1; grew = true; }
        if (m.c + m.cs - 1 > c1) { c1 = m.c + m.cs - 1; grew = true; }
      });
      if (!grew) break;
    }
    return { r0, c0, r1, c1 };
  };
  const forRange = (fx, rg, fn) => {
    for (let r = rg.r0; r <= rg.r1; r++) {
      for (let c = rg.c0; c <= rg.c1; c++) {
        const reg = regionAt(fx, r, c);
        if (reg.r === r && reg.c === c) fn(fx.cells[r][c], r, c);
      }
    }
  };
  const tbl = (TX.tbl = {
    insertRow(fx, at, src) {
      const C = fx.colW.length;
      const s = clamp(src, 0, fx.rowH.length - 1);
      fx.rowH.splice(at, 0, (fx.eff && fx.eff[s]) || fx.rowH[s]);
      fx.cells.splice(at, 0, fx.cells[s].map((c) => {
        const n = { t: '' };
        ['f', 'a', 'v', 'b'].forEach((k) => c[k] !== undefined && (n[k] = c[k]));
        return n;
      }).slice(0, C));
      fx.merges.forEach((m) => {
        if (at <= m.r) m.r++;
        else if (at < m.r + m.rs) m.rs++;
      });
      fx.eff = null;
    },
    deleteRow(fx, r) {
      if (fx.rowH.length <= 1) return false;
      fx.merges.forEach((m) => {
        if (r < m.r) m.r--;
        else if (r < m.r + m.rs) {
          if (r === m.r && m.rs > 1) fx.cells[r + 1][m.c] = Object.assign({}, fx.cells[r][m.c]);
          m.rs--;
        }
      });
      fx.rowH.splice(r, 1);
      fx.cells.splice(r, 1);
      fx.eff = null;
      normTable(fx);
      return true;
    },
    insertCol(fx, at, src) {
      const s = clamp(src, 0, fx.colW.length - 1);
      fx.colW.splice(at, 0, fx.colW[s]);
      fx.cells.forEach((row) => {
        const c = row[s] || {};
        const n = { t: '' };
        ['f', 'a', 'v', 'b'].forEach((k) => c[k] !== undefined && (n[k] = c[k]));
        row.splice(at, 0, n);
      });
      fx.merges.forEach((m) => {
        if (at <= m.c) m.c++;
        else if (at < m.c + m.cs) m.cs++;
      });
      fx.eff = null;
    },
    deleteCol(fx, c) {
      if (fx.colW.length <= 1) return false;
      fx.merges.forEach((m) => {
        if (c < m.c) m.c--;
        else if (c < m.c + m.cs) {
          if (c === m.c && m.cs > 1) fx.cells[m.r][c + 1] = Object.assign({}, fx.cells[m.r][c]);
          m.cs--;
        }
      });
      fx.colW.splice(c, 1);
      fx.cells.forEach((row) => row.splice(c, 1));
      fx.eff = null;
      normTable(fx);
      return true;
    },
    merge(fx, rg) {
      if (rg.r0 === rg.r1 && rg.c0 === rg.c1) return false;
      const texts = [];
      forRange(fx, rg, (cell) => cell.t && cell.t.trim() && texts.push(cell.t.trim()));
      fx.merges = fx.merges.filter((m) => !(m.r >= rg.r0 && m.r + m.rs - 1 <= rg.r1 && m.c >= rg.c0 && m.c + m.cs - 1 <= rg.c1));
      for (let r = rg.r0; r <= rg.r1; r++) for (let c = rg.c0; c <= rg.c1; c++) fx.cells[r][c].t = '';
      fx.cells[rg.r0][rg.c0].t = texts.join(' ');
      fx.merges.push({ r: rg.r0, c: rg.c0, rs: rg.r1 - rg.r0 + 1, cs: rg.c1 - rg.c0 + 1 });
      return true;
    },
    split(fx, rg) {
      const n = fx.merges.length;
      fx.merges = fx.merges.filter((m) => !(m.r <= rg.r1 && m.r + m.rs - 1 >= rg.r0 && m.c <= rg.c1 && m.c + m.cs - 1 >= rg.c0));
      return fx.merges.length !== n;
    },
    setRows(fx, n) {
      n = clamp(Math.round(n), 1, 200);
      while (fx.rowH.length < n) tbl.insertRow(fx, fx.rowH.length, fx.rowH.length - 1);
      while (fx.rowH.length > n) tbl.deleteRow(fx, fx.rowH.length - 1);
    },
    setCols(fx, n) {
      n = clamp(Math.round(n), 1, 60);
      while (fx.colW.length < n) tbl.insertCol(fx, fx.colW.length, fx.colW.length - 1);
      while (fx.colW.length > n) tbl.deleteCol(fx, fx.colW.length - 1);
    },
    distribute(fx, axis) {
      if (axis === 'cols') {
        const t = fx.colW.reduce((a, b) => a + b, 0);
        fx.colW = fx.colW.map(() => t / fx.colW.length);
      } else {
        const hs = fx.eff || fx.rowH;
        const t = hs.reduce((a, b) => a + b, 0);
        fx.rowH = fx.rowH.map(() => t / fx.rowH.length);
      }
    }
  });
  const tableScale = (g, sx, sy, anchor) => {
    if (!axisAligned(g, sx, sy)) return false;
    const fx = g.data.effect;
    moveOrigin(g, fx, sx, sy, anchor);
    fx.colW = fx.colW.map((w) => Math.max(1, w * sx));
    fx.rowH = (fx.eff && fx.eff.length === fx.rowH.length ? fx.eff : fx.rowH).map((h) => Math.max(1, h * sy));
    if (Math.abs(sx - sy) < 1e-9) {
      fx.font.size = Math.max(0.5, fx.font.size * sx);
      fx.pad *= sx;
      fx.bWidth *= sx;
    }
    TX.buildTable(g);
    return true;
  };
  const paraScale = (g, sx, sy, anchor) => {
    if (!axisAligned(g, sx, sy)) return false;
    const fx = g.data.effect;
    moveOrigin(g, fx, sx, sy, anchor);
    fx.w = Math.max(1, fx.w * sx);
    fx.h = Math.max(1, fx.h * sy);
    if (Math.abs(sx - sy) < 1e-9) {
      fx.font.size = Math.max(0.5, fx.font.size * sx);
      fx.gutter *= sx;
      fx.paraSpace *= sx;
    }
    TX.buildPara(g);
    return true;
  };

  /* =============== registration with the effect framework =============== */
  TX.build = (g) => {
    const t = typeOf(g);
    if (t === 'paragraph') TX.buildPara(g);
    else if (t === 'table') TX.buildTable(g);
    else if (t === 'textpath') TX.buildTextPath(g);
  };
  const restyleText = (g, fn) => {
    const fx = g.data.effect;
    const p = protoOf(fx);
    fn([p]);
    fx.style = styleFrom(p);
    TX.build(g);
  };
  const dropHit = (g) => g.children.slice().forEach((c) => c.data.hitOnly && c.remove());
  FX.TYPES = FX.TYPES || {};
  FX.TYPES.textpath = {
    tool: 'textPathTool',
    build: TX.buildTextPath,
    probe: (g) => protoOf(g.data.effect),
    restyle: restyleText,
    describe: (g) => 'Yoldaki metin: “' + short(g.data.effect.text) + '”',
    bake(g) {
      const src = TX.tpSource(g);
      if (src && !src.visible) src.remove();
    },
    bakeMsg: 'Yoldaki metin ayrıldı · Harfler artık ayrı metinler',
    clear(g) {
      const fx = g.data.effect;
      const src = TX.tpSource(g);
      const out = [];
      let at = g.bounds.topLeft;
      if (src) {
        src.visible = true;
        delete src.data.effectSrc;
        src.transform(g.matrix);
        src.insertAbove(g);
        const first = src instanceof paper.CompoundPath ? src.firstChild : src;
        if (first && first.firstSegment) at = first.firstSegment.point;
        out.push(src);
      }
      if (String(fx.text).trim()) {
        const t = makeText(fx.font, lookOf(fx), fx.text, at.subtract(Pt(0, fx.font.size * 0.3)));
        t.opacity = g.opacity;
        t.insertAbove(src || g);
        out.push(t);
      }
      g.remove();
      return out;
    },
    clearMsg: 'Metin yoldan çıkarıldı',
    dblTap: (g) => TX.edit(g),
    fields: (g) => textPathFields(g),
    panel: (g) => textPathPanel(g)
  };
  FX.TYPES.paragraph = {
    build: TX.buildPara,
    probe: (g) => protoOf(g.data.effect),
    restyle: restyleText,
    scale: paraScale,
    describe: (g) => 'Paragraf: “' + short(g.data.effect.text) + '”',
    bake: dropHit,
    bakeMsg: 'Paragraf satırlara ayrıldı · Her satır ayrı metin',
    clear: paraToArtistic,
    clearMsg: 'Sanatsal metne dönüştürüldü',
    dblTap: (g) => TX.edit(g),
    fields: (g) => paraFields(g),
    panel: (g) => paraPanel(g)
  };
  FX.TYPES.table = {
    tool: 'tableTool',
    build: TX.buildTable,
    probe(g) {
      const fx = g.data.effect;
      const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(0, 0, 10, 10), insert: false });
      const rg = VP.toolId === 'tableTool' ? TX.selRange(g) : null;
      const cell = rg ? fx.cells[rg.r0][rg.c0] : null;
      const f = cell && cell.f !== undefined ? cell.f : fx.fill;
      r.fillColor = f ? new paper.Color(f) : null;
      r.strokeColor = fx.bColor && fx.border !== 'none' ? new paper.Color(fx.bColor) : null;
      r.strokeWidth = fx.bWidth;
      return r;
    },
    restyle(g, fn) {
      const fx = g.data.effect;
      const before = FX.TYPES.table.probe(g);
      const p = before.clone({ insert: false });
      fn([p]);
      const hx = (c) => (c ? VP.hex(c) : null);
      if (hx(p.fillColor) !== hx(before.fillColor)) {
        const nf = hx(p.fillColor);
        const rg = VP.toolId === 'tableTool' ? TX.selRange(g) : null;
        if (rg) forRange(fx, rg, (cell) => (cell.f = nf));
        else {
          fx.fill = nf;
          fx.cells.forEach((row) => row.forEach((cell) => delete cell.f));
        }
      }
      if (hx(p.strokeColor) !== hx(before.strokeColor) || p.strokeWidth !== before.strokeWidth) {
        fx.bColor = hx(p.strokeColor);
        if (fx.bColor && fx.border === 'none') fx.border = 'all';
        if (p.strokeWidth > 0) fx.bWidth = p.strokeWidth;
      }
      TX.buildTable(g);
    },
    scale: tableScale,
    describe: (g) => 'Tablo (' + g.data.effect.rowH.length + ' × ' + g.data.effect.colW.length + ')',
    bake: dropHit,
    bakeMsg: 'Tablo, düz nesne grubuna dönüştürüldü',
    clear(g) {
      dropHit(g);
      FX.bake(g);
      return [g];
    },
    clearMsg: 'Tablo, düz nesne grubuna dönüştürüldü',
    dblTap(g, pt) {
      const cell = pt && TX.cellAt(g, pt);
      VP.setSelection([g]);
      VP.setTool('tableTool');
      if (cell) TX.editCell(g, cell.r, cell.c);
    },
    fields: (g) => tableFields(g),
    panel: (g) => tablePanel(g)
  };
  const short = (s) => {
    const c = String(s || '').replace(/\s+/g, ' ').trim();
    return c.length > 18 ? c.slice(0, 18) + '…' : c || '…';
  };

  /* =============== floating text editor =============== */
  const ed = { el: null, ta: null, a: null, orig: '' };
  const ensureEd = () => {
    if (ed.el) return;
    const el = document.createElement('div');
    el.id = 'rich-editor';
    el.className = 'rich-ed';
    el.hidden = true;
    el.innerHTML = '<div class="re-head"><span class="re-title"></span><span class="re-note"></span><button class="btn primary" data-re="done">Bitti</button></div>' +
      '<textarea spellcheck="false" autocomplete="off" aria-label="Metin"></textarea>';
    $('#canvas-wrap').appendChild(el);
    ed.el = el;
    ed.ta = el.querySelector('textarea');
    ed.ta.addEventListener('input', () => {
      if (!ed.a) return;
      ed.a.set(ed.ta.value);
      VP.drawOverlay();
      UI.schedule('prop', 'status');
      TX.placeEditor();
    });
    ed.ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (!ed.a) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        TX.closeEditor(false);
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || ed.a.single)) {
        e.preventDefault();
        TX.closeEditor(true);
      } else if (e.key === 'Tab' && ed.a.tab) {
        e.preventDefault();
        const a = ed.a;
        TX.closeEditor(true);
        a.tab(e.shiftKey);
      }
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-re="done"]')) TX.closeEditor(true);
    });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => TX.placeEditor());
  };
  TX.editing = () => (ed.a ? ed.a.target : null);
  TX.openEditor = (a) => {
    TX.closeEditor(true);
    if (UI.textItem) UI.commitText();
    ensureEd();
    ed.a = a;
    ed.dirty = false;
    ed.orig = a.get();
    ed.ta.value = ed.orig;
    ed.el.querySelector('.re-title').textContent = a.title;
    ed.el.querySelector('.re-note').textContent = a.note || '';
    ed.ta.style.height = a.single ? '3.2em' : '';
    ed.ta.setAttribute('enterkeyhint', a.single ? 'done' : 'enter');
    ed.el.hidden = false;
    TX.placeEditor();
    VP.drawOverlay();
    UI.schedule('prop');
    setTimeout(() => {
      if (ed.a !== a) return;
      ed.ta.focus();
      const n = ed.ta.value.length;
      try {
        ed.ta.setSelectionRange(n, n);
      } catch (e) { /* ignore */ }
    }, 30);
  };
  TX.placeEditor = () => {
    if (!ed.a || !ed.el) return;
    const wrap = $('#canvas-wrap');
    const W = wrap.clientWidth;
    const Hh = wrap.clientHeight;
    const ew = Math.max(220, Math.min(440, W - 24));
    ed.el.style.width = ew + 'px';
    const eh = ed.el.offsetHeight || 160;
    let visBottom = Hh;
    const vv = window.visualViewport;
    if (vv) visBottom = Math.min(Hh, vv.offsetTop + vv.height - wrap.getBoundingClientRect().top);
    const b = ed.a.bounds();
    const v = paper.view;
    const tl = v.projectToView(b.topLeft);
    const br = v.projectToView(b.bottomRight);
    let top;
    if (br.y + 10 + eh <= visBottom - 8) top = br.y + 10;
    else if (tl.y - 10 - eh >= 8) top = tl.y - 10 - eh;
    else top = 8;
    top = clamp(top, 8, Math.max(8, visBottom - eh - 8));
    const left = clamp((tl.x + br.x) / 2 - ew / 2, 12, Math.max(12, W - ew - 12));
    ed.el.style.left = left + 'px';
    ed.el.style.top = top + 'px';
  };
  TX.closeEditor = (commit) => {
    const a = ed.a;
    if (!a) return;
    ed.a = null;
    const val = ed.ta.value;
    ed.el.hidden = true;
    ed.ta.blur();
    if (!commit) a.set(ed.orig);
    // style changes made while typing are kept even when the text is cancelled
    a.done(commit ? val : ed.orig, (commit && val !== ed.orig) || !!ed.dirty);
    ed.dirty = false;
    VP.drawOverlay();
    UI.schedule('prop', 'dock', 'status');
  };
  /* Edit the text of a paragraph or text-on-path. */
  TX.edit = (g, isNew) => {
    const fx = FX.of(g);
    if (!fx) return;
    if (fx.type === 'table') return TX.editCell(g, 0, 0);
    if (!VP.sel.includes(g) || VP.sel.length !== 1) VP.setSelection([g]);
    const para = fx.type === 'paragraph';
    TX.openEditor({
      target: g,
      title: para ? 'Paragraf metni' : 'Yoldaki metin',
      note: para ? 'Enter: yeni paragraf' : '',
      single: !para,
      get: () => fx.text,
      set: (v) => {
        fx.text = v;
        TX.build(g);
      },
      bounds: () => g.bounds,
      done: (v, changed) => {
        if (!g.parent) return;
        if (!String(v).trim()) {
          if (para) {
            g.remove();
            VP.setSelection([]);
            if (!isNew) VP.commit();
            return;
          }
          // text on a path with no text left: give the path back
          const src = TX.tpSource(g);
          if (src) {
            src.visible = true;
            delete src.data.effectSrc;
            src.transform(g.matrix);
            src.insertAbove(g);
          }
          g.remove();
          VP.setSelection(src ? [src] : []);
          if (!isNew) VP.commit();
          return;
        }
        if (changed || isNew) VP.commit();
        if (!para && fx.hidden) VP.toast(fx.hidden + ' harf yola sığmadı · Yazı boyutunu küçültün veya yolu uzatın');
        if (para && fx.overflow) VP.toast('Metin çerçeveye sığmadı · “Çerçeveyi uydur” veya “Metni sığdır” kullanın');
      }
    });
  };
  TX.editCell = (g, r, c) => {
    const fx = g.data.effect;
    const reg = regionAt(fx, r, c);
    r = reg.r;
    c = reg.c;
    if (!VP.sel.includes(g) || VP.sel.length !== 1) VP.setSelection([g]);
    TX.setCellSel(g, { r, c }, { r, c });
    TX.openEditor({
      target: g,
      title: 'Hücre ' + TX.cellName(r, c),
      note: 'Tab: sonraki hücre',
      get: () => (fx.cells[r] && fx.cells[r][c] ? fx.cells[r][c].t : ''),
      set: (v) => {
        if (!fx.cells[r] || !fx.cells[r][c]) return;
        fx.cells[r][c].t = v;
        TX.buildTable(g);
      },
      bounds: () => {
        const { xs, ys } = TX.tableGeom(fx);
        return rectOf(g, xs[c], ys[r], xs[c + reg.cs] - xs[c], ys[r + reg.rs] - ys[r]).bounds;
      },
      done: (v, changed) => {
        if (changed && g.parent) VP.commit();
      },
      tab: (back) => {
        if (!g.parent) return;
        const R = fx.rowH.length;
        const C = fx.colW.length;
        let k = r * C + c;
        for (let n = 0; n < R * C; n++) {
          k = (k + (back ? -1 : 1) + R * C) % (R * C);
          const rr = Math.floor(k / C);
          const cc = k % C;
          const rg = regionAt(fx, rr, cc);
          if (rg.r === rr && rg.c === cc) return TX.editCell(g, rr, cc);
        }
      }
    });
  };
  // Close the editor before anything that replaces or leaves the edited object.
  ['undo', 'redo', 'gotoPage', 'addPage', 'deletePage', 'duplicatePage'].forEach((name) => {
    const f = VP[name];
    if (typeof f !== 'function') return;
    VP[name] = function () {
      TX.closeEditor(true);
      return f.apply(this, arguments);
    };
  });
  const setTool0 = VP.setTool;
  VP.setTool = (id) => {
    TX.closeEditor(true);
    if (id !== 'tableTool') TX.cellSel = null;
    return setTool0(id);
  };
  VP.on('selection', () => {
    if (ed.a && !VP.sel.includes(ed.a.target)) TX.closeEditor(true);
  });
  VP.on('view', () => TX.placeEditor());
  const cv = document.getElementById('canvas');
  if (cv) {
    cv.addEventListener('pointerdown', (e) => {
      if (!ed.a || e.button === 2) return;
      TX.closeEditor(true);
      if (VP.toolId === 'text' || VP.toolId === 'textPathTool') {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);
  }

  /* =============== overlays =============== */
  const allOf = (type) => {
    const out = [];
    VP.userLayers().forEach((L) => {
      if (L.visible) L.children.forEach((c) => c.visible && TX.is(c, type) && out.push(c));
    });
    return out;
  };
  VP.overlayHooks = VP.overlayHooks || [];
  VP.overlayHooks.push((L) => {
    const s = 1 / zoom();
    const showAll = VP.toolId === 'text';
    const list = showAll ? allOf('paragraph') : VP.sel.filter((it) => TX.is(it, 'paragraph'));
    list.forEach((g) => {
      const fx = g.data.effect;
      const sel = VP.sel.includes(g);
      const red = new paper.Color('#d6362b');
      const r = rectOf(g, fx.x, fx.y, fx.w, fx.h);
      r.strokeColor = fx.overflow ? red : acc();
      r.strokeWidth = s;
      r.dashArray = [4 * s, 3 * s];
      r.opacity = sel ? 0.95 : 0.5;
      L.addChild(r);
      if (sel && fx.cols > 1) {
        const { cols, colW, gut } = paraGeom(fx);
        for (let k = 1; k < cols; k++) {
          [fx.x + k * colW + (k - 1) * gut, fx.x + k * (colW + gut)].forEach((x) => {
            const ln = new paper.Path.Line({ from: Pt(x, fx.y), to: Pt(x, fx.y + fx.h), insert: false });
            ln.transform(g.matrix);
            ln.strokeColor = acc();
            ln.strokeWidth = s;
            ln.dashArray = [2 * s, 3 * s];
            ln.opacity = 0.55;
            L.addChild(ln);
          });
        }
      }
      if (fx.overflow) {
        const bc = g.localToGlobal(Pt(fx.x + fx.w / 2, fx.y + fx.h));
        const t = 7 * s;
        const tri = new paper.Path({ segments: [bc.add([-t, 2 * s]), bc.add([t, 2 * s]), bc.add([0, t * 1.4])], closed: true, insert: false });
        tri.fillColor = red;
        L.addChild(tri);
      }
    });
  });

  /* =============== tools =============== */
  const T = VP.tools;
  const drawFrame = (L, rect) => {
    if (!rect) return;
    const s = 1 / zoom();
    const r = new paper.Path.Rectangle({ rectangle: rect, insert: false });
    r.strokeColor = acc();
    r.strokeWidth = 1.2 * s;
    r.dashArray = [5 * s, 3 * s];
    const f = acc();
    f.alpha = 0.06;
    r.fillColor = f;
    L.addChild(r);
  };
  /* Text tool: tap = artistic text, drag = paragraph frame, tap a text object = edit it. */
  T.text = {
    cursor: 'text',
    op: null,
    busy() { return !!(this.op && this.op.rect); },
    down(e) {
      this.op = { start: VP.snapPt(e.point), raw: e.point, rect: null, hit: VP.hitItem(e.point) };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      const p = VP.snapPt(e.point);
      if (!op.rect && op.raw.getDistance(e.point) * zoom() < (e.isTouch ? 10 : 6)) return;
      op.rect = new paper.Rectangle(op.start, p);
      VP.drawOverlay();
    },
    up(e) {
      const op = this.op;
      this.op = null;
      if (!op) return;
      if (op.rect && op.rect.width * zoom() > 14 && op.rect.height * zoom() > 14) {
        const g = TX.createParagraph(op.rect, '');
        TX.edit(g, true);
        return;
      }
      VP.drawOverlay();
      const hit = op.hit;
      if (hit instanceof paper.PointText) {
        VP.setSelection([hit]);
        VP.ui.editText(hit);
        return;
      }
      const t = typeOf(hit);
      if (t === 'paragraph' || t === 'textpath') return TX.edit(hit);
      if (t === 'table') {
        const cell = TX.cellAt(hit, e.point);
        VP.setSelection([hit]);
        if (cell) return TX.editCell(hit, cell.r, cell.c);
      }
      const nt = VP.createText(op.start, '');
      VP.setSelection([nt]);
      VP.ui.editText(nt, true);
    },
    cancel() {
      this.op = null;
      VP.drawOverlay();
    },
    overlayAfter(L) {
      if (this.op && this.op.rect) drawFrame(L, this.op.rect);
    }
  };
  /* Text-on-path tool: tap a curve. A text selected beforehand is the one that gets fitted. */
  T.textPathTool = {
    cursor: 'crosshair',
    pending: null,
    busy() { return false; },
    activate() {
      const t = VP.sel.length === 1 && VP.sel[0] instanceof paper.PointText ? VP.sel[0] : null;
      this.pending = t;
      if (t) VP.toast('Metin seçildi · Şimdi metnin yerleşeceği eğriye dokunun');
    },
    deactivate() { this.pending = null; },
    down(e) {
      const hit = VP.hitItem(e.point, this.pending ? { exclude: [this.pending] } : {});
      if (!hit) {
        this.pending = null;
        VP.clearSelection();
        return;
      }
      if (TX.is(hit, 'textpath')) {
        this.pending = null;
        return TX.edit(hit);
      }
      if (hit instanceof paper.PointText) {
        this.pending = hit;
        VP.setSelection([hit]);
        VP.emit('tool');
        return VP.toast('Metin seçildi · Şimdi eğriye dokunun');
      }
      if (!FX.isShape(hit)) return VP.toast('Metin yalnızca eğri veya şekil üzerine yerleşir · Grupları önce çözün');
      const text = this.pending && this.pending.parent ? this.pending : null;
      this.pending = null;
      TX.fitToPath(hit, text);
      VP.emit('tool');
    },
    move() {},
    up() {},
    cancel() { this.pending = null; },
    overlayAfter(L) {
      if (!this.pending || !this.pending.parent) return;
      const s = 1 / zoom();
      L.addChild(new paper.Path.Rectangle({ rectangle: this.pending.bounds, strokeColor: acc(), strokeWidth: 1.5 * s, dashArray: [6 * s, 4 * s], insert: false }));
    }
  };
  const curTable = () => one('table');
  // A grid line near the point, in table-local coordinates.
  const lineAt = (g, pt) => {
    const fx = g.data.effect;
    const lp = g.globalToLocal(pt);
    const M = g.matrix;
    const k = Math.sqrt(Math.abs(M.a * M.d - M.b * M.c)) || 1;
    const tol = (VP.coarse ? 11 : 6) / zoom() / k;
    const { xs, ys } = TX.tableGeom(fx);
    const R = fx.rowH.length;
    const C = fx.colW.length;
    const inY = lp.y > ys[0] - tol && lp.y < ys[R] + tol;
    const inX = lp.x > xs[0] - tol && lp.x < xs[C] + tol;
    let best = null;
    let bd = tol;
    if (inY) xs.forEach((x, j) => {
      const d = Math.abs(lp.x - x);
      if (d < bd) { bd = d; best = { axis: 'col', i: j }; }
    });
    if (inX) ys.forEach((y, i) => {
      const d = Math.abs(lp.y - y);
      if (d < bd) { bd = d; best = { axis: 'row', i }; }
    });
    return best;
  };
  const dragLine = (fx, ln, o, d) => {
    const minW = Math.max(4, fx.pad * 2 + 2);
    const minH = Math.max(4, fx.pad * 2 + 2);
    if (ln.axis === 'col') {
      const C = o.colW.length;
      const cw = o.colW.slice();
      let x = o.x;
      if (ln.i === 0) {
        d = Math.min(d, cw[0] - minW);
        x += d;
        cw[0] -= d;
      } else if (ln.i === C) cw[C - 1] = Math.max(minW, cw[C - 1] + d);
      else {
        d = clamp(d, minW - cw[ln.i - 1], cw[ln.i] - minW);
        cw[ln.i - 1] += d;
        cw[ln.i] -= d;
      }
      fx.colW = cw;
      fx.x = x;
    } else {
      const R = o.eff.length;
      const rh = o.rowH.slice();
      let y = o.y;
      if (ln.i === 0) {
        d = Math.min(d, o.eff[0] - minH);
        y += d;
        rh[0] = Math.max(minH, o.eff[0] - d);
      } else if (ln.i === R) rh[R - 1] = Math.max(minH, o.eff[R - 1] + d);
      else {
        d = clamp(d, minH - o.eff[ln.i - 1], o.eff[ln.i] - minH);
        rh[ln.i - 1] = o.eff[ln.i - 1] + d;
        rh[ln.i] = o.eff[ln.i] - d;
      }
      fx.rowH = rh;
      fx.y = y;
    }
  };
  T.tableTool = {
    cursor: 'cell',
    op: null,
    busy() { return !!(this.op && this.op.changed); },
    activate() {
      const g = curTable();
      if (g && !TX.selRange(g)) TX.setCellSel(g, { r: 0, c: 0 }, { r: 0, c: 0 });
    },
    deactivate() {
      this.op = null;
      TX.cellSel = null;
    },
    down(e) {
      const g = curTable();
      if (g) {
        const ln = lineAt(g, e.point);
        if (ln) {
          const fx = g.data.effect;
          this.op = { type: 'line', g, ln, start: g.globalToLocal(e.point), o: { x: fx.x, y: fx.y, colW: fx.colW.slice(), rowH: fx.rowH.slice(), eff: (fx.eff || fx.rowH).slice() }, changed: false, pt: e.point, tap: e.tapCount };
          return;
        }
      }
      this.pickCell(e.point, e.tapCount);
    },
    pickCell(pt, tapCount) {
      const hit = VP.hitItem(pt);
      const ht = TX.is(hit, 'table') ? hit : null;
      if (ht) {
        const cell = TX.cellAt(ht, pt);
        if (!cell) return;
        const rg = TX.selRange(ht);
        const reg = regionAt(ht.data.effect, cell.r, cell.c);
        const was = !!rg && rg.r0 === reg.r && rg.c0 === reg.c && rg.r1 === reg.r + reg.rs - 1 && rg.c1 === reg.c + reg.cs - 1;
        if (VP.sel.length !== 1 || VP.sel[0] !== ht) VP.setSelection([ht]);
        TX.setCellSel(ht, cell, cell);
        this.op = { type: 'cells', g: ht, a: cell, was, moved: false, tap: tapCount };
        VP.drawOverlay();
        UI.schedule('prop', 'dock', 'palette');
        return;
      }
      if (hit) {
        TX.cellSel = null;
        VP.setSelection([hit]);
        return;
      }
      VP.clearSelection();
      TX.cellSel = null;
      this.op = { type: 'new', start: VP.snapPt(pt), raw: pt, rect: null };
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (op.type === 'line') {
        const lp = op.g.globalToLocal(VP.snapPt(e.point));
        const d = op.ln.axis === 'col' ? lp.x - op.start.x : lp.y - op.start.y;
        if (!op.changed && Math.abs(d) * zoom() < 3) return;
        dragLine(op.g.data.effect, op.ln, op.o, d);
        op.changed = true;
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
          this._raf = 0;
          if (op.g.parent) TX.buildTable(op.g);
          VP.drawOverlay();
          VP.emit('transform');
        });
      } else if (op.type === 'cells') {
        const cell = TX.cellAt(op.g, e.point);
        if (!cell) return;
        const b = TX.cellSel && TX.cellSel.b;
        if (b && b.r === cell.r && b.c === cell.c) return;
        op.moved = true;
        TX.setCellSel(op.g, op.a, cell);
        VP.drawOverlay();
        UI.schedule('prop');
      } else if (op.type === 'new') {
        if (!op.rect && op.raw.getDistance(e.point) * zoom() < 6) return;
        op.rect = new paper.Rectangle(op.start, VP.snapPt(e.point));
        VP.drawOverlay();
      }
    },
    up() {
      const op = this.op;
      this.op = null;
      if (!op) return;
      if (op.type === 'line') {
        if (this._raf) {
          cancelAnimationFrame(this._raf);
          this._raf = 0;
        }
        if (op.changed) {
          TX.buildTable(op.g);
          VP.commit();
          return;
        }
        // a tap on a grid line counts as a tap on the cell under it
        this.pickCell(op.pt, op.tap);
        if (this.op && this.op.type === 'cells') this.up();
        return;
      }
      if (op.type === 'cells') {
        if (!op.moved && (op.was || op.tap >= 2)) TX.editCell(op.g, op.a.r, op.a.c);
        UI.schedule('prop', 'dock');
        return;
      }
      if (op.type === 'new') {
        if (op.rect && op.rect.width * zoom() > 20 && op.rect.height * zoom() > 14) TX.createTable(op.rect);
        else VP.drawOverlay();
      }
    },
    cancel() {
      if (this.op && this.op.type === 'line' && this.op.changed) VP.undoLive();
      this.op = null;
      VP.drawOverlay();
    },
    overlay(L) {
      const s = 1 / zoom();
      if (this.op && this.op.type === 'new') {
        const r = this.op.rect;
        if (r) {
          drawFrame(L, r);
          const d = VP.defaults;
          const rows = clamp(Math.round(d.tableRows || 3), 1, 60);
          const cols = clamp(Math.round(d.tableCols || 3), 1, 30);
          for (let i = 1; i < rows; i++) L.addChild(new paper.Path.Line({ from: Pt(r.left, r.top + (r.height * i) / rows), to: Pt(r.right, r.top + (r.height * i) / rows), strokeColor: acc(), strokeWidth: s, opacity: 0.6, insert: false }));
          for (let j = 1; j < cols; j++) L.addChild(new paper.Path.Line({ from: Pt(r.left + (r.width * j) / cols, r.top), to: Pt(r.left + (r.width * j) / cols, r.bottom), strokeColor: acc(), strokeWidth: s, opacity: 0.6, insert: false }));
        }
        return true;
      }
      const g = curTable();
      if (!g) return false;
      const fx = g.data.effect;
      const { xs, ys } = TX.tableGeom(fx);
      const R = fx.rowH.length;
      const C = fx.colW.length;
      const out = rectOf(g, xs[0], ys[0], xs[C] - xs[0], ys[R] - ys[0]);
      out.strokeColor = acc();
      out.strokeWidth = s;
      out.opacity = 0.6;
      L.addChild(out);
      const rg = TX.selRange(g);
      if (rg) {
        const r = rectOf(g, xs[rg.c0], ys[rg.r0], xs[rg.c1 + 1] - xs[rg.c0], ys[rg.r1 + 1] - ys[rg.r0]);
        const f = acc();
        f.alpha = 0.16;
        r.fillColor = f;
        r.strokeColor = acc();
        r.strokeWidth = 2 * s;
        L.addChild(r);
      }
      // little tabs on the outer edge show where lines can be dragged
      const t = (VP.coarse ? 5 : 3.5) * s;
      xs.forEach((x) => {
        const p = g.localToGlobal(Pt(x, ys[0]));
        L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(p.x - t, p.y - 3 * t, 2 * t, 2 * t), fillColor: '#ffffff', strokeColor: acc(), strokeWidth: s, insert: false }));
      });
      ys.forEach((y) => {
        const p = g.localToGlobal(Pt(xs[0], y));
        L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(p.x - 3 * t, p.y - t, 2 * t, 2 * t), fillColor: '#ffffff', strokeColor: acc(), strokeWidth: s, insert: false }));
      });
      return true;
    }
  };
  Object.assign(VP.TOOL_META, {
    textPathTool: { label: 'Yola metin', icon: 'textpath', key: '', hint: 'Bir eğriye dokunun: metin yolun üzerine yerleşir · Önce bir metin seçtiyseniz o metin yerleşir' },
    tableTool: { label: 'Tablo', icon: 'table', key: '', hint: 'Sürükle: tablo çiz · Hücreye dokun: seç · Sürükle: çoklu seç · Seçili hücreye dokun: yaz · Çizgiyi sürükle: boyutlandır' }
  });
  VP.TOOL_META.text.hint = 'Dokun: sanatsal metin · Sürükle: paragraf çerçevesi · Var olan metne dokun: düzenle';
  Object.assign(VP.defaults, { tableRows: 3, tableCols: 4 }, VP.defaults);

  /* =============== property bar & inspector =============== */
  const seg = (items, cur, prefix) => '<span class="seg">' + items.map(([v, l, t]) => '<button data-act="' + prefix + v + '" class="' + (v === cur ? 'on' : '') + '"' + (t ? ' title="' + esc(t) + '" aria-label="' + esc(t) + '"' : '') + '>' + l + '</button>').join('') + '</span>';
  const fontSel = (cur) =>
    '<label class="field"><span>Yazı tipi</span><select data-pf="txFont" aria-label="Yazı tipi">' + VP.FONTS.map((f) => '<option' + (f === cur ? ' selected' : '') + ' style="font-family:\'' + f + '\'">' + esc(f) + '</option>').join('') + (VP.FONTS.includes(cur) ? '' : '<option selected>' + esc(cur) + '</option>') + '</select></label>';
  const fontCtl = (f) => fontSel(f.family) + H.field('Boyut', 'txSize', VP.num(f.size, 1), 'pt') + H.tog('txBold', '<b>K</b>', f.bold, 'Kalın') + H.tog('txItalic', '<i>İ</i>', f.italic, 'İtalik');
  const ALIGN4 = [['left', ic('alignL', 'sm'), 'Sola'], ['center', ic('alignCH', 'sm'), 'Ortaya'], ['right', ic('alignR', 'sm'), 'Sağa'], ['justify', ic('alignJ', 'sm'), 'İki yana']];
  const ALIGN3 = ALIGN4.slice(0, 3);
  const VALIGN = [['top', 'Üst', 'Üste yasla'], ['middle', 'Orta', 'Ortaya yasla'], ['bottom', 'Alt', 'Alta yasla']];
  const warn = (txt) => '<span class="pb-warn">' + esc(txt) + '</span>';
  const paraFields = (g) => {
    const fx = g.data.effect;
    return '<span class="pb-label">Paragraf</span>' + fontCtl(fx.font) + seg(ALIGN4, fx.align, 'txAlign:') + H.sep +
      H.field('Sütun', 'txCols', fx.cols, '') + (fx.cols > 1 ? H.field('Aralık', 'txGutter', mm(fx.gutter, 1)) : '') +
      H.field('Satır', 'txLead', Math.round(fx.lead * 100), '%') + H.field('Paragraf', 'txParaSp', mm(fx.paraSpace, 1)) + seg(VALIGN, fx.valign, 'txVAlign:') + H.sep +
      H.tog('txAutoH', 'Oto. yükseklik', fx.autoH, 'Çerçeve metne göre uzar ve kısalır') +
      (fx.overflow ? warn('Taşan metin') : '') + H.btn('txFitFrame', 'Çerçeveyi uydur', 'Çerçeve yüksekliğini metne uydur') + H.btn('txFitText', 'Metni sığdır', 'Yazı boyutunu çerçeveye göre ayarla') + H.sep +
      H.btn('txEdit', ic('text', 'sm') + 'Metni düzenle', 'Metni düzenle') + H.btn('txConvMenu', 'Dönüştür ▾', 'Sanatsal metne çevir veya satırlara ayır');
  };
  const textPathFields = (g) => {
    const fx = g.data.effect;
    return '<span class="pb-label">Yoldaki metin</span>' + fontCtl(fx.font) + seg([['start', 'Baş', 'Yolun başına'], ['center', 'Orta', 'Ortaya'], ['end', 'Son', 'Yolun sonuna']], fx.align, 'txTpAlign:') + H.sep +
      H.field('Kaydır', 'txShift', mm(fx.shift, 1)) + H.field('Uzaklık', 'txOffset', mm(fx.offset, 1)) + H.field('Harf aralığı', 'txSpacing', mm(fx.spacing, 2)) +
      H.tog('txFlip', 'Diğer taraf', fx.flip, 'Metni yolun diğer tarafına al') + H.tog('txShowPath', 'Yolu göster', fx.showPath !== false, 'Yolu göster veya gizle') +
      (fx.hidden ? warn(fx.hidden + ' harf sığmadı') : '') + H.sep +
      H.btn('txEdit', ic('text', 'sm') + 'Metni düzenle', 'Metni düzenle') + H.btn('txTpMenu', 'Yol ▾', 'Ayır veya yoldan çıkar');
  };
  const BORDERS = [['all', 'Tüm çizgiler'], ['h', 'Yalnız yatay'], ['outer', 'Yalnız dış'], ['none', 'Çizgisiz']];
  const tableFields = (g) => {
    const fx = g.data.effect;
    return '<span class="pb-label">Tablo</span>' + H.field('Satır', 'txRows', fx.rowH.length, '') + H.field('Sütun', 'txColsN', fx.colW.length, '') + H.sep +
      fontCtl(fx.font) + H.colorField('Yazı', 'txColor', fx.color) + seg(ALIGN3, fx.align, 'txTAlign:') + H.sep +
      H.btn('txBorder', 'Kenarlık ▾', 'Kenarlık çizgileri') + H.field('Kalınlık', 'txBW', mm(fx.bWidth, 2)) + H.colorField('Çizgi', 'txBColor', fx.bColor || '#1d1d1b') +
      H.tog('txHeader', 'Başlık satırı', fx.header, 'İlk satır kalın ve renkli') + (fx.header ? H.colorField('Başlık', 'txHeadFill', fx.headerFill || '#e3e9f0') : '') + H.sep +
      H.btn('txCells', ic('table', 'sm') + 'Hücreler', 'Tablo aracıyla hücreleri düzenle', 'primary') + H.btn('txConvMenu', 'Dönüştür ▾', 'Düz nesne grubuna çevir');
  };
  const cellBar = (g) => {
    const fx = g.data.effect;
    const rg = TX.selRange(g);
    if (!rg) return '<span class="pb-title">Tablo</span><span class="pb-label">Bir hücreye dokunun</span>' + H.sep + tableFields(g);
    const cell = fx.cells[rg.r0][rg.c0];
    const name = TX.cellName(rg.r0, rg.c0) + (rg.r1 !== rg.r0 || rg.c1 !== rg.c0 ? '–' + TX.cellName(rg.r1, rg.c1) : '');
    const fill = cell.f !== undefined ? cell.f : fx.header && rg.r0 === 0 ? fx.headerFill : fx.fill;
    const multi = rg.r1 !== rg.r0 || rg.c1 !== rg.c0;
    const merged = fx.merges.some((m) => m.r <= rg.r1 && m.r + m.rs - 1 >= rg.r0 && m.c <= rg.c1 && m.c + m.cs - 1 >= rg.c0);
    return '<span class="pb-title">Hücre ' + esc(name) + '</span>' + H.btn('txEditCell', ic('text', 'sm') + 'Yaz', 'Hücre metnini düzenle', 'primary') + H.sep +
      H.btn('txRowMenu', ic('plus', 'sm') + 'Satır ▾', 'Satır ekle') + H.btn('txColMenu', ic('plus', 'sm') + 'Sütun ▾', 'Sütun ekle') +
      H.btn('txDelMenu', ic('minus', 'sm') + 'Sil ▾', 'Satır veya sütun sil') + H.sep +
      (multi ? H.btn('txMerge', 'Birleştir', 'Seçili hücreleri birleştir') : '') + (merged ? H.btn('txSplit', 'Ayır', 'Birleşik hücreyi ayır') : '') + (multi || merged ? H.sep : '') +
      H.colorField('Hücre', 'txCellFill', fill || '#ffffff') + H.btn('txCellNoFill', 'Dolgusuz', 'Hücre dolgusunu kaldır') +
      seg(ALIGN3, cell.a || fx.align, 'txCellAlign:') + seg(VALIGN, cell.v || fx.valign, 'txCellVAlign:') + H.tog('txCellBold', '<b>K</b>', !!cell.b, 'Hücre metni kalın') + H.sep +
      H.btn('txDistMenu', 'Eşitle ▾', 'Satır veya sütunları eşit dağıt') + H.btn('txTableProps', 'Tablo ▾', 'Tablo yazı tipi ve kenarlık');
  };
  // Property bar contents that replace the default ones (editing, table cells).
  TX.propbar = () => {
    if (ed.a) {
      const g = ed.a.target;
      const fx = FX.of(g);
      if (!fx || !g.parent) return null;
      return '<span class="pb-title">' + esc(ed.a.title) + '</span>' + fontCtl(fx.font) +
        (fx.type === 'paragraph' ? seg(ALIGN4, fx.align, 'txAlign:') : '') + H.sep + H.btn('txDone', 'Bitti', 'Metni bitir', 'primary');
    }
    if (VP.toolId === 'tableTool') {
      const g = curTable();
      if (g) return cellBar(g);
    }
    return null;
  };
  TX.toolBar = (id) => {
    const d = VP.defaults;
    if (id === 'tableTool') return '<span class="pb-title">Tablo</span>' + H.field('Satır', 'txNewRows', d.tableRows, '') + H.field('Sütun', 'txNewCols', d.tableCols, '') + '<span class="pb-label">Sürükleyerek tablo çizin</span>';
    if (id === 'textPathTool') {
      const p = T.textPathTool.pending;
      return '<span class="pb-title">Yola metin</span><span class="pb-label">' + (p ? 'Metin seçildi · Şimdi eğriye dokunun' : 'Bir eğriye dokunun · Önce metne dokunursanız o metin yerleşir') + '</span>';
    }
    return '';
  };
  const pf = (label, k, value, unit = 'mm') => H.dfieldPf(label, k, value, unit);
  const paraPanel = (g) => {
    const fx = g.data.effect;
    return '<div class="row">' + fontSel(fx.font.family) + '</div><div class="row">' + pf('Boyut', 'txSize', VP.num(fx.font.size, 1), 'pt') + H.tog('txBold', '<b>K</b>', fx.font.bold, 'Kalın') + H.tog('txItalic', '<i>İ</i>', fx.font.italic, 'İtalik') + '</div>' +
      '<div class="row">' + seg(ALIGN4, fx.align, 'txAlign:') + seg(VALIGN, fx.valign, 'txVAlign:') + '</div>' +
      '<div class="row">' + pf('Sütun', 'txCols', fx.cols, '') + pf('Aralık', 'txGutter', mm(fx.gutter, 1)) + '</div>' +
      '<div class="row">' + pf('Satır', 'txLead', Math.round(fx.lead * 100), '%') + pf('Paragraf', 'txParaSp', mm(fx.paraSpace, 1)) + '</div>' +
      '<div class="row">' + H.tog('txAutoH', 'Otomatik yükseklik', fx.autoH, 'Çerçeve metne göre uzar ve kısalır') + '</div>' +
      (fx.overflow ? '<p class="sec-note" style="color:var(--danger)">Metnin bir kısmı çerçeveye sığmıyor.</p>' : '') +
      '<div class="grid-btns" style="grid-template-columns:repeat(2,1fr)"><button class="btn" data-act="txFitFrame">Çerçeveyi uydur</button><button class="btn" data-act="txFitText">Metni sığdır</button>' +
      '<button class="btn" data-act="txEdit">' + ic('text', 'sm') + 'Metni düzenle</button><button class="btn" data-act="txToArtistic">Sanatsal metne çevir</button></div>' +
      '<p class="sec-note">Kenar tutamaçları çerçeveyi boyutlandırır ve metin yeniden akar; oranlı köşe sürüklemesi yazıyı da büyütür.</p>';
  };
  const textPathPanel = (g) => {
    const fx = g.data.effect;
    return '<div class="row">' + fontSel(fx.font.family) + '</div><div class="row">' + pf('Boyut', 'txSize', VP.num(fx.font.size, 1), 'pt') + H.tog('txBold', '<b>K</b>', fx.font.bold, 'Kalın') + H.tog('txItalic', '<i>İ</i>', fx.font.italic, 'İtalik') + '</div>' +
      '<div class="row">' + seg([['start', 'Baş'], ['center', 'Orta'], ['end', 'Son']], fx.align, 'txTpAlign:') + '</div>' +
      '<div class="row">' + pf('Kaydır', 'txShift', mm(fx.shift, 1)) + pf('Uzaklık', 'txOffset', mm(fx.offset, 1)) + '</div>' +
      '<div class="row">' + pf('Harf aralığı', 'txSpacing', mm(fx.spacing, 2)) + '</div>' +
      '<div class="row">' + H.tog('txFlip', 'Diğer taraf', fx.flip, 'Metni yolun diğer tarafına al') + H.tog('txShowPath', 'Yolu göster', fx.showPath !== false, 'Yolu göster veya gizle') + '</div>' +
      (fx.hidden ? '<p class="sec-note" style="color:var(--danger)">' + fx.hidden + ' harf yola sığmadı.</p>' : '') +
      '<div class="grid-btns" style="grid-template-columns:repeat(2,1fr)"><button class="btn" data-act="txEdit">' + ic('text', 'sm') + 'Metni düzenle</button><button class="btn" data-act="txUnpath">Yoldan çıkar</button></div>' +
      '<p class="sec-note">Palet harfleri boyar. Yolun kendisi, gizlense de yerleşimi belirlemeye devam eder.</p>';
  };
  const tablePanel = (g) => {
    const fx = g.data.effect;
    return '<div class="row">' + pf('Satır', 'txRows', fx.rowH.length, '') + pf('Sütun', 'txColsN', fx.colW.length, '') + '</div>' +
      '<div class="row">' + fontSel(fx.font.family) + '</div><div class="row">' + pf('Boyut', 'txSize', VP.num(fx.font.size, 1), 'pt') + H.tog('txBold', '<b>K</b>', fx.font.bold, 'Kalın') + H.tog('txItalic', '<i>İ</i>', fx.font.italic, 'İtalik') + '</div>' +
      '<div class="row">' + H.colorField('Yazı rengi', 'txColor', fx.color) + seg(ALIGN3, fx.align, 'txTAlign:') + '</div>' +
      '<div class="row"><span class="pb-label">Kenarlık</span>' + seg([['all', 'Tümü'], ['h', 'Yatay'], ['outer', 'Dış'], ['none', 'Yok']], fx.border, 'txBorderSet:') + '</div>' +
      '<div class="row">' + pf('Kalınlık', 'txBW', mm(fx.bWidth, 2)) + H.colorField('Çizgi', 'txBColor', fx.bColor || '#1d1d1b') + '</div>' +
      '<div class="row">' + pf('İç boşluk', 'txPad', mm(fx.pad, 1)) + '</div>' +
      '<div class="row">' + H.tog('txHeader', 'Başlık satırı', fx.header, 'İlk satır kalın ve renkli') + (fx.header ? H.colorField('Başlık', 'txHeadFill', fx.headerFill || '#e3e9f0') : '') + '</div>' +
      '<div class="grid-btns" style="grid-template-columns:repeat(2,1fr)"><button class="btn" data-act="txCells">' + ic('table', 'sm') + 'Hücreleri düzenle</button><button class="btn" data-act="txBake">Gruba dönüştür</button></div>' +
      '<p class="sec-note">Palet: dolgu hücreleri, anahat kenarlıkları boyar. Tablo aracıyla hücre seçiliyken yalnızca o hücreler boyanır. Satırlar yazıya göre uzar.</p>';
  };

  const anyTx = () => one(null);
  const rebuildCommit = (g) => {
    TX.build(g);
    VP.commit();
  };
  const loadFont = (g) => {
    if (document.fonts) document.fonts.load(fontKey(g.data.effect.font)).then(() => {
      caches.delete(fontKey(g.data.effect.font));
      if (g.parent) {
        TX.build(g);
        VP.drawOverlay();
        if (paper.view.update) paper.view.update();
      }
    }).catch(() => {});
  };
  /* Property fields (data-pf). Returns true when handled. */
  TX.propField = (name, raw, el) => {
    if (!/^tx/.test(name)) return false;
    const v = VP.parseNum(raw);
    const d = VP.defaults;
    const hex = UI.normHex(raw);
    if (name === 'txNewRows') {
      if (v >= 1) d.tableRows = clamp(Math.round(v), 1, 60);
      return true;
    }
    if (name === 'txNewCols') {
      if (v >= 1) d.tableCols = clamp(Math.round(v), 1, 30);
      return true;
    }
    const g = (ed.a && ed.a.target && ed.a.target.parent ? ed.a.target : null) || anyTx();
    if (!g) return true;
    const fx = g.data.effect;
    const live = !!ed.a;
    const done = () => {
      TX.build(g);
      if (live) {
        ed.dirty = true;
        TX.placeEditor();
      } else VP.commit();
      VP.drawOverlay();
    };
    switch (name) {
      case 'txFont':
        fx.font.family = raw;
        done();
        loadFont(g);
        break;
      case 'txSize':
        if (v > 0) {
          fx.font.size = clamp(v, 0.5, 1000);
          done();
        }
        break;
      case 'txCols':
        if (fx.type === 'paragraph' && v >= 1) {
          fx.cols = clamp(Math.round(v), 1, 12);
          done();
        }
        break;
      case 'txGutter':
        if (fx.type === 'paragraph' && v >= 0) {
          fx.gutter = VP.toPT(v);
          done();
        }
        break;
      case 'txLead':
        if (fx.type === 'paragraph' && v > 0) {
          fx.lead = clamp(v / 100, 0.5, 5);
          done();
        }
        break;
      case 'txParaSp':
        if (fx.type === 'paragraph' && v >= 0) {
          fx.paraSpace = VP.toPT(v);
          done();
        }
        break;
      case 'txShift':
        if (fx.type === 'textpath' && isFinite(v)) {
          fx.shift = VP.toPT(v);
          done();
        }
        break;
      case 'txOffset':
        if (fx.type === 'textpath' && isFinite(v)) {
          fx.offset = VP.toPT(v);
          done();
        }
        break;
      case 'txSpacing':
        if (fx.type === 'textpath' && isFinite(v)) {
          fx.spacing = VP.toPT(v);
          done();
        }
        break;
      case 'txRows':
        if (fx.type === 'table' && v >= 1) {
          tbl.setRows(fx, v);
          done();
        }
        break;
      case 'txColsN':
        if (fx.type === 'table' && v >= 1) {
          tbl.setCols(fx, v);
          done();
        }
        break;
      case 'txColor':
        if (fx.type === 'table' && hex) {
          fx.color = hex;
          done();
        }
        break;
      case 'txBW':
        if (fx.type === 'table' && v >= 0) {
          fx.bWidth = VP.toPT(v);
          if (fx.bWidth > 0 && !fx.bColor) fx.bColor = '#1d1d1b';
          done();
        }
        break;
      case 'txBColor':
        if (fx.type === 'table' && hex) {
          fx.bColor = hex;
          if (fx.border === 'none') fx.border = 'all';
          done();
        }
        break;
      case 'txHeadFill':
        if (fx.type === 'table' && hex) {
          fx.headerFill = hex;
          done();
        }
        break;
      case 'txPad':
        if (fx.type === 'table' && v >= 0) {
          fx.pad = VP.toPT(v);
          done();
        }
        break;
      case 'txCellFill': {
        const rg = fx.type === 'table' && TX.selRange(g);
        if (rg && hex) {
          forRange(fx, rg, (c) => (c.f = hex));
          done();
        }
        break;
      }
      default:
        break;
    }
    return true;
  };
  const pop = (el, items, fn) => UI.popover(el, items.map(([k, l]) => '<button class="pop-item" data-pick="' + k + '">' + esc(l) + '</button>').join(''), fn);
  /* Buttons (data-act). Returns true when handled. */
  TX.act = (id, el) => {
    if (!/^tx/.test(id)) return false;
    const [key, arg] = id.split(':');
    if (key === 'txDone') {
      TX.closeEditor(true);
      return true;
    }
    if (VP.actions[key]) {
      UI.run(key);
      return true;
    }
    const g = (ed.a && ed.a.target && ed.a.target.parent ? ed.a.target : null) || anyTx();
    if (!g) return true;
    const fx = g.data.effect;
    const live = !!ed.a;
    const done = () => {
      TX.build(g);
      if (live) {
        ed.dirty = true;
        TX.placeEditor();
      } else VP.commit();
      VP.drawOverlay();
    };
    const rg = fx.type === 'table' ? TX.selRange(g) : null;
    switch (key) {
      case 'txBold':
        fx.font.bold = !fx.font.bold;
        done();
        loadFont(g);
        break;
      case 'txItalic':
        fx.font.italic = !fx.font.italic;
        done();
        loadFont(g);
        break;
      case 'txAlign':
        fx.align = arg;
        done();
        break;
      case 'txVAlign':
        fx.valign = arg;
        done();
        break;
      case 'txTAlign':
        fx.align = arg;
        fx.cells.forEach((row) => row.forEach((c) => delete c.a));
        done();
        break;
      case 'txTpAlign':
        fx.align = arg;
        fx.shift = 0;
        done();
        break;
      case 'txAutoH':
        fx.autoH = !fx.autoH;
        done();
        break;
      case 'txFitFrame':
        fx.autoH = false;
        fx.h = TX.fitHeight(fx);
        done();
        break;
      case 'txFitText':
        TX.fitTextToFrame(g);
        break;
      case 'txFlip':
        fx.flip = !fx.flip;
        done();
        break;
      case 'txShowPath':
        fx.showPath = fx.showPath === false;
        done();
        break;
      case 'txEdit':
        TX.edit(g);
        break;
      case 'txConvMenu':
        pop(el, fx.type === 'paragraph' ? [['txToArtistic', 'Sanatsal metne dönüştür'], ['txBake', 'Satırlara ayır (ayrı metinler)'], ['txCurves', 'Eğriye dönüştür']] : [['txBake', 'Düz nesne grubuna dönüştür'], ['txCurves', 'Eğriye dönüştür']], (k) => (k === 'txCurves' ? UI.run('toCurves') : UI.run(k)));
        break;
      case 'txTpMenu':
        pop(el, [['txUnpath', 'Metni yoldan çıkar'], ['txBake', 'Harflere ayır (ayrı metinler)'], ['txCurves', 'Eğriye dönüştür']], (k) => (k === 'txCurves' ? UI.run('toCurves') : UI.run(k)));
        break;
      case 'txBorder':
        pop(el, BORDERS, (k) => {
          fx.border = k;
          if (k !== 'none' && !fx.bColor) fx.bColor = '#1d1d1b';
          rebuildCommit(g);
        });
        break;
      case 'txBorderSet':
        fx.border = arg;
        if (arg !== 'none' && !fx.bColor) fx.bColor = '#1d1d1b';
        done();
        break;
      case 'txHeader':
        fx.header = !fx.header;
        done();
        break;
      case 'txCells':
        VP.setTool('tableTool');
        break;
      case 'txTableProps':
        UI.openDock('props');
        break;
      case 'txEditCell':
        if (rg) TX.editCell(g, rg.r0, rg.c0);
        break;
      case 'txRowMenu':
        if (!rg) break;
        pop(el, [['above', 'Üste satır ekle'], ['below', 'Alta satır ekle']], (k) => {
          tbl.insertRow(fx, k === 'above' ? rg.r0 : rg.r1 + 1, k === 'above' ? rg.r0 : rg.r1);
          if (k === 'above') TX.setCellSel(g, { r: rg.r0 + 1, c: rg.c0 }, { r: rg.r1 + 1, c: rg.c1 });
          rebuildCommit(g);
        });
        break;
      case 'txColMenu':
        if (!rg) break;
        pop(el, [['left', 'Sola sütun ekle'], ['right', 'Sağa sütun ekle']], (k) => {
          tbl.insertCol(fx, k === 'left' ? rg.c0 : rg.c1 + 1, k === 'left' ? rg.c0 : rg.c1);
          if (k === 'left') TX.setCellSel(g, { r: rg.r0, c: rg.c0 + 1 }, { r: rg.r1, c: rg.c1 + 1 });
          rebuildCommit(g);
        });
        break;
      case 'txDelMenu':
        if (!rg) break;
        pop(el, [['rows', rg.r1 > rg.r0 ? 'Seçili satırları sil' : 'Satırı sil'], ['cols', rg.c1 > rg.c0 ? 'Seçili sütunları sil' : 'Sütunu sil']], (k) => {
          const rows = k === 'rows';
          const n = rows ? rg.r1 - rg.r0 + 1 : rg.c1 - rg.c0 + 1;
          if (n >= (rows ? fx.rowH.length : fx.colW.length)) return VP.toast('Tabloda en az bir ' + (rows ? 'satır' : 'sütun') + ' kalmalı');
          for (let i = 0; i < n; i++) (rows ? tbl.deleteRow(fx, rg.r0) : tbl.deleteCol(fx, rg.c0));
          const r = clamp(rg.r0, 0, fx.rowH.length - 1);
          const c = clamp(rg.c0, 0, fx.colW.length - 1);
          TX.setCellSel(g, { r, c }, { r, c });
          rebuildCommit(g);
        });
        break;
      case 'txMerge':
        if (rg && tbl.merge(fx, rg)) {
          TX.setCellSel(g, { r: rg.r0, c: rg.c0 }, { r: rg.r0, c: rg.c0 });
          rebuildCommit(g);
        } else VP.toast('Birleştirmek için birden çok hücre seçin (sürükleyerek)');
        break;
      case 'txSplit':
        if (rg && tbl.split(fx, rg)) rebuildCommit(g);
        else VP.toast('Seçimde birleşik hücre yok');
        break;
      case 'txCellNoFill':
        if (rg) {
          forRange(fx, rg, (c) => (c.f = null));
          done();
        }
        break;
      case 'txCellAlign':
        if (rg) {
          forRange(fx, rg, (c) => (c.a = arg));
          done();
        }
        break;
      case 'txCellVAlign':
        if (rg) {
          forRange(fx, rg, (c) => (c.v = arg));
          done();
        }
        break;
      case 'txCellBold':
        if (rg) {
          const on = !fx.cells[rg.r0][rg.c0].b;
          forRange(fx, rg, (c) => (on ? (c.b = true) : delete c.b));
          done();
        }
        break;
      case 'txDistMenu':
        pop(el, [['cols', 'Sütun genişliklerini eşitle'], ['rows', 'Satır yüksekliklerini eşitle']], (k) => {
          tbl.distribute(fx, k);
          rebuildCommit(g);
        });
        break;
      default:
        break;
    }
    return true;
  };

  /* =============== actions & menus =============== */
  Object.assign(VP.actions, {
    txFitPath: { label: 'Metni yola yerleştir', icon: 'textpath', run: () => TX.fitSelection(), enabled: () => VP.sel.some(FX.isShape) },
    txPathTool: { label: 'Yola metin aracı', icon: 'textpath', run: () => VP.setTool('textPathTool') },
    txToPara: { label: 'Paragraf metnine dönüştür', icon: 'paragraph', run: () => TX.toParagraph(), enabled: () => VP.sel.some((it) => it instanceof paper.PointText) },
    txToArtistic: { label: 'Sanatsal metne dönüştür', icon: 'text', run: () => TX.toArtistic(), enabled: () => VP.sel.some((it) => TX.is(it, 'paragraph')) },
    txNewPara: {
      label: 'Paragraf çerçevesi çiz',
      icon: 'paragraph',
      run: () => {
        VP.setTool('text');
        VP.toast('Metin aracıyla sayfada sürükleyin: paragraf çerçevesi');
      }
    },
    txNewTable: {
      label: 'Tablo çiz',
      icon: 'table',
      run: () => {
        VP.setTool('tableTool');
        VP.toast('Sayfada sürükleyerek tablo çizin');
      }
    },
    txEditText: { label: 'Metni düzenle', icon: 'text', run: () => anyTx() && TX.edit(anyTx()), enabled: () => !!(one('paragraph') || one('textpath')) },
    txBake: { label: 'Ayrı nesnelere çevir', run: () => FX.separate(VP.sel.find(TX.isTx)), enabled: () => VP.sel.some(TX.isTx) },
    txUnpath: { label: 'Metni yoldan çıkar', run: () => FX.clear(VP.sel.find((it) => TX.is(it, 'textpath'))), enabled: () => VP.sel.some((it) => TX.is(it, 'textpath')) }
  });
})();
