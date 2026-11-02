/* VektörPad Text docker laid out like the desktop program (written for this app).
   Character: font and size side by side, style, letter spacing, underline, text fill, character background,
   outline width. Paragraph: six alignments (none, left, centre, right, justify, force justify), line spacing
   in % or pt, left / first-line / right indents, space before and after paragraphs. Frame: background colour,
   vertical alignment, columns. Icons at the top show or hide each section.
   Underline and character background draw on screen and become real shapes in every export. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const TX = VP.tx;
  const FX = VP.fx;
  const TD = VP.textdock;
  const S = VP.settings;
  const esc = UI.h.esc;
  const ic = UI.h.ic;
  if (!TD) return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const svg = (body) => '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';

  /* ---------- underline and character background ---------- */
  const otOf = (t) => (VP.text3 && VP.text3.otOf ? VP.text3.otOf(t) : (t.data && t.data.ot) || null);
  // line boxes in the text's own coordinates: [{x, y (baseline), w}]
  const lineBoxes = (t, ctx) => {
    const lines = t._lines || String(t.content || '').split(/\r\n|\n|\r/);
    const lead = t.leading || t.fontSize * 1.2;
    ctx.font = t._style && t._style.getFontStyle ? t._style.getFontStyle() : (t.fontWeight || 'normal') + ' ' + t.fontSize + 'px "' + t.fontFamily + '"';
    const ot = otOf(t);
    // letter spacing only widens the line where the browser draws it
    const ls = ot && ot.track && 'letterSpacing' in ctx ? (ot.track / 1000) * (t.fontSize || 12) : 0;
    return lines.map((s, i) => {
      const w = ctx.measureText(s).width + ls * Math.max(0, Array.from(s).length - 1);
      const x = t.justification === 'center' ? -w / 2 : t.justification === 'right' ? -w : 0;
      return { x, y: i * lead, w };
    });
  };
  const UL = (t) => ({ off: t.fontSize * 0.13, th: Math.max(t.fontSize * 0.06, 0.25) });
  const BG = (t) => ({ top: t.fontSize * 0.92, h: t.fontSize * 1.18 });
  const PT = paper.PointText.prototype;
  const d0 = PT._draw;
  PT._draw = function (ctx, param, vm) {
    const u = this.data && this.data.under;
    const bg = this.data && this.data.tbg;
    if (!u && !bg) return d0.call(this, ctx, param, vm);
    let boxes = null;
    try {
      boxes = lineBoxes(this, ctx);
    } catch (e) {
      boxes = null;
    }
    if (bg && boxes) {
      const g = BG(this);
      ctx.save();
      ctx.fillStyle = bg;
      boxes.forEach((b) => b.w > 0 && ctx.fillRect(b.x, b.y - g.top, b.w, g.h));
      ctx.restore();
    }
    // the built-in drawing moves the canvas down one line per line of text
    ctx.save();
    let r;
    try {
      r = d0.call(this, ctx, param, vm);
    } finally {
      ctx.restore();
    }
    if (u && boxes) {
      const g = UL(this);
      ctx.save();
      const col = this.fillColor || this.strokeColor;
      ctx.fillStyle = col ? col.toCanvasStyle(ctx) : '#000';
      boxes.forEach((b) => b.w > 0 && ctx.fillRect(b.x, b.y + g.off, b.w, g.th));
      ctx.restore();
    }
    return r;
  };
  let mctx = null;
  const realShapes = (project) => {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    project.getItems({ class: paper.PointText, match: (t) => t.data && (t.data.under || t.data.tbg) }).forEach((t) => {
      const boxes = lineBoxes(t, mctx);
      if (t.data.tbg) {
        const g = BG(t);
        boxes.forEach((b) => {
          if (!(b.w > 0)) return;
          const p = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(b.x, b.y - g.top, b.w, g.h), fillColor: t.data.tbg, insert: false });
          p.transform(t.matrix);
          p.insertBelow(t);
        });
      }
      if (t.data.under) {
        const g = UL(t);
        boxes.forEach((b) => {
          if (!(b.w > 0)) return;
          const p = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(b.x, b.y + g.off, b.w, g.th), fillColor: t.fillColor || t.strokeColor || '#000', insert: false });
          p.transform(t.matrix);
          p.opacity = t.opacity;
          p.insertAbove(t);
        });
      }
      delete t.data.under;
      delete t.data.tbg;
    });
  };
  VP.io.exportHooks = VP.io.exportHooks || [];
  VP.io.exportHooks.push((tmp) => realShapes(tmp));
  // converting text to curves keeps them too
  const ttp0 = VP.textToPath;
  VP.textToPath = (t) => {
    if (t && t.data && (t.data.under || t.data.tbg) && t.parent) {
      if (!mctx) mctx = document.createElement('canvas').getContext('2d');
      const keep = { under: t.data.under, tbg: t.data.tbg };
      realShapes({ getItems: (o) => [t].filter(o.match) });
      const r = ttp0(t);
      if (!r) Object.assign(t.data, keep);
      return r;
    }
    return ttp0(t);
  };

  // paragraph text: flags go to every generated line; space before; frame background
  const bp0 = TX.buildPara;
  TX.buildPara = (g) => {
    const fx = g.data.effect;
    const ps = fx.paraSpace || 0;
    if (fx.paraBefore) fx.paraSpace = ps + fx.paraBefore;
    try {
      bp0(g);
    } finally {
      fx.paraSpace = ps;
    }
    const f = fx.font || {};
    if (f.under || f.tbg) {
      g.children.forEach((c) => {
        if (c instanceof paper.PointText) {
          if (f.under) c.data.under = true;
          if (f.tbg) c.data.tbg = f.tbg;
        }
      });
    }
    if (fx.frameBg) {
      const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(fx.x, fx.y, fx.w, fx.h), fillColor: fx.frameBg, insert: false });
      r.data.frameBg = true;
      g.insertChild(0, r);
    }
  };

  /* ---------- docker ---------- */
  const SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72, 96, 120];
  const STYLES = [['n', 'Normal'], ['b', 'Kalın'], ['i', 'İtalik'], ['bi', 'Kalın İtalik']];
  const WIDTHS = [['none', 'Yok'], ['0.1', 'Saç teli'], ['0.2', '0,2 mm'], ['0.5', '0,5 mm'], ['1', '1,0 mm'], ['2', '2,0 mm']];
  const AL_NONE = svg('<path d="M4 6h14M4 10h10M4 14h16M4 18h8"/><path d="M19 15l3 3m0-3l-3 3" stroke-width="1.4"/>');
  const AL_FORCE = svg('<path d="M3 6h18M3 10h18M3 14h18M3 18h18"/><path d="M1.5 16v4M22.5 16v4"/>');
  const I_CHAR = svg('<path d="M5 19l6-14 6 14M7.5 13.5h7"/>');
  const I_PARA = svg('<path d="M11 4h8M15 4v16M11 4a4 4 0 100 8h0V20"/>');
  const I_FRAME = svg('<rect x="4" y="4" width="16" height="16"/><path d="M7 8h10M7 12h10M7 16h6"/>');
  const I_TRACK = svg('<path d="M3 15l3-9 3 9M4 12h4M12 6l3 9 3-9"/><path d="M3 19h18M3 19l2-1.5M3 19l2 1.5M21 19l-2-1.5M21 19l-2 1.5"/>');
  const I_UNDER = svg('<path d="M7 4v7a5 5 0 0010 0V4M5 20h14"/>');
  const I_FILL = svg('<path d="M5 19l6-14 6 14M7.5 13.5h7"/><rect x="3" y="20" width="18" height="2" fill="currentColor"/>');
  const I_BG = svg('<rect x="3" y="3" width="18" height="18" fill="currentColor" opacity=".35"/><path d="M7 18l5-12 5 12M9 13.5h6"/>');
  const I_OUT = svg('<path d="M5 19l6-14 6 14M7.5 13.5h7" stroke-dasharray="2 1.4"/>');
  const I_LEAD = svg('<path d="M9 6h11M9 12h11M9 18h11M4 5v14M4 5l-1.5 2M4 5l1.5 2M4 19l-1.5-2M4 19l1.5-2"/>');
  const I_INDL = svg('<path d="M10 6h10M10 10h10M10 14h10M10 18h10M3 9l3 3-3 3"/>');
  const I_INDF = svg('<path d="M10 6h10M4 10h16M4 14h16M4 18h16M3 3l3 3-3 3"/>');
  const I_INDR = svg('<path d="M4 6h10M4 10h10M4 14h10M4 18h10M21 9l-3 3 3 3"/>');
  const I_SPB = svg('<path d="M4 14h16M4 18h16M12 3v7M12 10l-2-2M12 10l2-2"/>');
  const I_SPA = svg('<path d="M4 6h16M4 10h16M12 21v-7M12 14l-2 2M12 14l2 2"/>');
  const I_COLS = svg('<path d="M4 5h6M4 9h6M4 13h6M4 17h6M14 5h6M14 9h6M14 13h6M14 17h6"/>');
  const I_VA = svg('<path d="M4 4h16M4 20h16M12 8v8M12 8l-2 2M12 8l2 2M12 16l-2-2M12 16l2-2"/>');
  const show = () => (S.tdShow = Object.assign({ ch: true, pg: true, fr: true }, S.tdShow || {}));
  const fld = (name, value, unit, title, dis, w) =>
    '<label class="field k4-f' + (dis ? ' k4-dim' : '') + '" title="' + esc(title) + '"><input data-pf="' + name + '" value="' + esc(value) + '" inputmode="decimal" enterkeyhint="done" aria-label="' + esc(title) + '"' + (w ? ' style="width:' + w + 'px"' : '') + (dis ? ' disabled' : '') + '>' + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</label>';
  const sel = (name, opts, cur, title, dis) =>
    '<label class="field k4-s' + (dis ? ' k4-dim' : '') + '" title="' + esc(title) + '"><select data-pf="' + name + '" aria-label="' + esc(title) + '"' + (dis ? ' disabled' : '') + '>' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>';
  const ibtn = (act, icon, title, on, dis) => '<button class="btn icon-only' + (on ? ' on' : '') + '" data-act="' + act + '" title="' + esc(title) + '" aria-label="' + esc(title) + '"' + (on != null ? ' aria-pressed="' + !!on + '"' : '') + (dis ? ' disabled' : '') + '>' + icon + '</button>';
  const lab = (icon, title) => '<span class="k4-ic" title="' + esc(title) + '">' + icon + '</span>';
  const color = (name, hex, title, dis) => '<input type="color" class="k4-col" data-pf="' + name + '" value="' + esc(hex || '#000000') + '" aria-label="' + esc(title) + '" title="' + esc(title) + '"' + (dis ? ' disabled' : '') + '>';
  const sec = (title, body) => '<div class="sec tk-sec k4-sec"><div class="sec-h"><h3>' + esc(title) + '</h3></div>' + body + '</div>';
  const first = () => TD.targets()[0];
  const fontFlags = (t) => {
    if (!t) return { under: !!VP.defaults.under, tbg: null };
    if (t instanceof paper.PointText) return { under: !!t.data.under, tbg: t.data.tbg || null };
    const f = (FX.of(t) && FX.of(t).font) || {};
    return { under: !!f.under, tbg: f.tbg || null };
  };
  const trackOf = (t) => {
    if (!t) return 0;
    const ot = t instanceof paper.PointText ? t.data.ot : FX.of(t) && FX.of(t).ot;
    return (ot && ot.track) || 0;
  };
  const panel = () => {
    const c = TD.current();
    const ts = TD.targets();
    const t = first();
    const para = c.kind === 'paragraph';
    const fx = c.fx;
    const sh = show();
    const style = c.bold && c.italic ? 'bi' : c.bold ? 'b' : c.italic ? 'i' : 'n';
    const kindName = { none: 'Seçim yok · Ayarlar yeni metinlere uygulanır', artistic: 'Sanatsal metin', paragraph: 'Paragraf metni', textpath: 'Yoldaki metin', table: 'Tablo' }[c.kind];
    const ff = fontFlags(t);
    let h = '<div class="k4-top">' + ibtn('k4Show:ch', I_CHAR, 'Karakter', sh.ch) + ibtn('k4Show:pg', I_PARA, 'Paragraf', sh.pg) + ibtn('k4Show:fr', I_FRAME, 'Çerçeve', sh.fr) +
      '<span style="flex:1"></span>' + (ts.length === 1 && !(TX.editing && TX.editing()) && !UI.textItem ? ibtn('tkEdit', ic('text', 'sm'), 'Metni düzenle') : '') + ibtn('tkPlayground', ic('glyph', 'sm'), 'Yazı tipi oyun alanı') + '</div>';
    h += '<p class="sec-note">' + esc(ts.length > 1 ? ts.length + ' metin seçili' : kindName) + '</p>';
    if (sh.ch) {
      let ch = '<div class="k4-r"><button class="btn k4-font" data-act="tkFontMenu" title="Yazı tipi" aria-label="Yazı tipi: ' + esc(c.family) + '"><span style="font-family:\'' + esc(c.family) + '\'">' + esc(c.family) + '</span><span class="k4-dd">▾</span></button>' +
        '<label class="field k4-f k4-size" title="Yazı boyutu"><input data-pf="tkSize" value="' + esc(VP.num(c.size, 1)) + '" list="k4-sizes" inputmode="decimal" enterkeyhint="done" aria-label="Yazı boyutu"><span class="unit">pt</span></label>' +
        '<span class="k4-spin"><button data-act="tkSize:1" aria-label="Büyüt" title="Büyüt">▲</button><button data-act="tkSize:-1" aria-label="Küçült" title="Küçült">▼</button></span></div>' +
        '<datalist id="k4-sizes">' + SIZES.map((s) => '<option value="' + s + '">').join('') + '</datalist>';
      ch += '<div class="k4-r">' + sel('tkStyle', STYLES, style, 'Yazı stili') + '<button class="btn k4-case" data-act="tkCase" title="Büyük/küçük harf">Aa ▾</button></div>';
      ch += '<div class="k4-r">' + lab(I_TRACK, 'Harf aralığı') + fld('k4Track', VP.num(trackOf(t) / 10, 1), '%', 'Harf aralığı', !t) + '<span style="flex:1"></span>' + ibtn('k4Under', I_UNDER, 'Altı çizili', ff.under) + '</div>';
      ch += '<div class="k4-r">' + lab(I_FILL, 'Metin dolgusu') + sel('k4FillT', [['solid', 'Düz dolgu'], ['none', 'Dolgu yok']], c.fill ? 'solid' : 'none', 'Dolgu türü') + color('tkFill', c.fill || '#1d1d1b', 'Dolgu rengi', !c.fill) + ibtn('dockProps', '…', 'Diğer dolgu ayarları') + '</div>';
      ch += '<div class="k4-r">' + lab(I_BG, 'Karakter arka planı') + sel('k4BgT', [['none', 'Dolgu yok'], ['solid', 'Düz dolgu']], ff.tbg ? 'solid' : 'none', 'Arka plan dolgusu', c.kind === 'table' || !t) + color('k4BgC', ff.tbg || '#ffff00', 'Arka plan rengi', !ff.tbg) + '</div>';
      const sw = c.stroke ? String(VP.num(VP.toMM(c.strokeW || 0), 2)).replace(',', '.') : 'none';
      const wopts = WIDTHS.some(([v]) => v === sw) || sw === 'none' ? WIDTHS : WIDTHS.concat([[sw, VP.num(+sw, 2) + ' mm']]);
      ch += c.kind !== 'table' ? '<div class="k4-r">' + lab(I_OUT, 'Metin anahatı') + sel('k4StrokeW', wopts, sw, 'Anahat kalınlığı') + color('tkStroke', c.stroke || '#1d1d1b', 'Anahat rengi', !c.stroke) + '</div>' : '';
      h += sec('Karakter', ch);
    }
    if (sh.pg && c.kind !== 'table') {
      const artistic = c.kind === 'artistic' || c.kind === 'none';
      const noneOn = t ? (t instanceof paper.PointText ? !!t.data.alNone : !!(fx && fx.alNone)) : false;
      const cur = noneOn ? 'none' : c.align === 'start' ? 'left' : c.align === 'end' ? 'right' : c.align;
      const A6 = [['none', AL_NONE, 'Hizalama yok'], ['left', ic('alignL', 'sm'), 'Sola'], ['center', ic('alignCH', 'sm'), 'Ortaya'], ['right', ic('alignR', 'sm'), 'Sağa'], ['justify', ic('alignJ', 'sm'), 'İki yana'], ['force', AL_FORCE, 'Zorla iki yana']];
      let pg = '<div class="k4-r k4-al">' + A6.map(([k, icon, l]) => ibtn(k === 'none' ? 'k4AlNone' : 'tkAlign:' + k, icon, l, cur === k, (artistic && (k === 'justify' || k === 'force')) || (c.kind === 'textpath' && (k === 'justify' || k === 'force'))) ).join('') + '</div>';
      const unit = S.tdLeadU || 'pct';
      const leadDis = !(artistic || para);
      pg += '<div class="k4-r">' + lab(I_LEAD, 'Satır aralığı') + (unit === 'pt' ? fld('k4LeadPt', VP.num(c.lead * c.size, 1), 'pt', 'Satır aralığı', leadDis) : fld('tkLead', Math.round(c.lead * 100), '%', 'Satır aralığı', leadDis)) +
        sel('k4LeadU', [['pct', '% karakter yüksekliği'], ['pt', 'Punto']], unit, 'Satır aralığı birimi', leadDis) + '</div>';
      const P = para ? fx : {};
      pg += '<div class="k4-g2">' +
        '<div class="k4-r">' + lab(I_INDL, 'Sol girinti') + fld('tqIndL', VP.num(VP.toMM(P.indL || 0), 1), 'mm', 'Sol girinti', !para) + '</div>' +
        '<div class="k4-r">' + lab(I_SPB, 'Paragraf öncesi boşluk') + fld('k4ParaB', VP.num(VP.toMM(P.paraBefore || 0), 1), 'mm', 'Paragraf öncesi boşluk', !para) + '</div>' +
        '<div class="k4-r">' + lab(I_INDF, 'İlk satır girintisi') + fld('tqIndF', VP.num(VP.toMM(P.indF || 0), 1), 'mm', 'İlk satır girintisi', !para) + '</div>' +
        '<div class="k4-r">' + lab(I_SPA, 'Paragraf sonrası boşluk') + fld('tkParaSp', VP.num(VP.toMM(P.paraSpace || 0), 1), 'mm', 'Paragraf sonrası boşluk', !para) + '</div>' +
        '<div class="k4-r">' + lab(I_INDR, 'Sağ girinti') + fld('tqIndR', VP.num(VP.toMM(P.indR || 0), 1), 'mm', 'Sağ girinti', !para) + '</div>' +
        '</div>';
      if (para) {
        pg += '<div class="k4-r">' + sel('tqBullet', VP.text2.BULLETS, (fx.bullet && fx.bullet.type) || 'none', 'Madde işareti') +
          sel('tqDrop', [[0, 'Büyük ilk harf yok'], [2, 'Büyük harf: 2 satır'], [3, 'Büyük harf: 3 satır'], [4, 'Büyük harf: 4 satır']], (fx.dropCap && fx.dropCap.lines) || 0, 'Büyük ilk harf') + '</div>' +
          '<div class="k4-r"><button class="btn' + (fx.hyph ? ' on' : '') + '" data-act="tqHyph" aria-pressed="' + !!fx.hyph + '">Türkçe heceleme</button></div>';
      } else if (c.kind === 'textpath') {
        pg += '<div class="k4-r">' + lab(I_TRACK, 'Yoldaki harf aralığı') + fld('txSpacing', VP.num(VP.toMM(fx.spacing || 0), 2), 'mm', 'Yoldaki harf aralığı') + '</div>';
      }
      h += sec('Paragraf', pg);
    }
    if (sh.fr) {
      const F = para ? fx : {};
      const dis = !para;
      let fr = '<div class="k4-r">' + lab(I_FILL, 'Çerçeve arka planı') + sel('k4FrBgT', [['none', 'Dolgu yok'], ['solid', 'Düz dolgu']], F.frameBg ? 'solid' : 'none', 'Çerçeve arka planı', dis) + color('k4FrBg', F.frameBg || '#ffffff', 'Çerçeve rengi', dis || !F.frameBg) +
        '<span style="flex:1"></span>' + lab(I_VA, 'Dikey hizalama') + sel('k4VAlign', [['top', 'Üst'], ['middle', 'Orta'], ['bottom', 'Alt']], F.valign || 'top', 'Dikey hizalama', dis) + '</div>';
      fr += '<div class="k4-r">' + lab(I_COLS, 'Sütun sayısı') + fld('txCols', String(F.cols || 1), '', 'Sütun sayısı', dis, 30) + fld('txGutter', VP.num(VP.toMM(F.gutter || 0), 1), 'mm', 'Sütun aralığı', dis) + '</div>';
      if (para) {
        fr += '<div class="k4-r"><button class="btn' + (fx.autoH ? ' on' : '') + '" data-act="txAutoH" aria-pressed="' + !!fx.autoH + '">Otomatik yükseklik</button><button class="btn" data-act="txFitFrame">Çerçeveyi uydur</button><button class="btn" data-act="txFitText">Metni sığdır</button></div>' +
          (fx.overflow ? '<p class="sec-note" style="color:var(--danger)">Metnin bir kısmı çerçeveye sığmıyor.</p>' : '');
      }
      h += sec('Çerçeve', fr);
    }
    return h;
  };
  UI.panels.text = panel;

  /* ---------- fields and buttons ---------- */
  const pf0 = VP.tx.propField;
  const rebuild = (t) => {
    if (t instanceof paper.PointText) {
      t.content = t.content;
    } else if (FX.of(t)) TX.build(t);
  };
  VP.tx.propField = (n, raw, el) => {
    if (!/^k4[A-Z]/.test(n)) return pf0(n, raw, el);
    const v = VP.parseNum(raw);
    const hex = UI.normHex ? UI.normHex(raw) : raw;
    switch (n) {
      case 'k4Track':
        if (!isFinite(v)) break;
        TD.applyPara((t, fx) => {
          const track = clamp(v, -50, 200) * 10;
          if (t instanceof paper.PointText) t.data.ot = Object.assign({}, t.data.ot || {}, { track });
          else if (fx) {
            fx.ot = Object.assign({}, fx.ot || {}, { track });
            if (fx.font) fx.font.track = track;
          }
          rebuild(t);
        });
        break;
      case 'k4FillT':
        if (raw === 'none') {
          TD.applyPara((t, fx) => {
            if (fx && fx.type === 'table') return false;
            VP.setFill([t], { type: 'none' });
          });
          if (!TD.targets().length) VP.defaults.fill = null;
        } else return pf0('tkFill', TD.current().fill || '#1d1d1b', el);
        break;
      case 'k4BgT':
      case 'k4BgC': {
        const col = n === 'k4BgT' ? (raw === 'none' ? null : fontFlags(first()).tbg || '#ffff00') : hex;
        if (n === 'k4BgC' && !col) break;
        TD.applyPara((t, fx) => {
          if (t instanceof paper.PointText) {
            if (col) t.data.tbg = col;
            else delete t.data.tbg;
          } else if (fx && fx.font && fx.type !== 'table') fx.font.tbg = col || undefined;
          else return false;
        });
        break;
      }
      case 'k4StrokeW': {
        const spec = raw === 'none' ? { on: false } : { on: true, color: TD.current().stroke || '#1d1d1b', width: VP.toPT(+raw) };
        TD.applyPara((t, fx) => {
          if (fx && fx.type === 'table') return false;
          if (fx) FX.restyle(t, (l) => VP.setStroke(l, spec));
          else VP.setStroke([t], spec);
        });
        break;
      }
      case 'k4LeadU':
        S.tdLeadU = raw === 'pt' ? 'pt' : 'pct';
        break;
      case 'k4LeadPt': {
        const size = TD.current().size || 12;
        if (v > 0) return pf0('tkLead', String(Math.round((v / size) * 1000) / 10), el);
        break;
      }
      case 'k4ParaB':
        if (!isFinite(v)) break;
        TD.applyPara((t, fx) => {
          if (!fx || fx.type !== 'paragraph') return false;
          fx.paraBefore = Math.max(0, VP.toPT(v));
        });
        break;
      case 'k4FrBgT':
      case 'k4FrBg': {
        const col = n === 'k4FrBgT' ? (raw === 'none' ? null : '#ffffff') : hex;
        if (n === 'k4FrBg' && !col) break;
        TD.applyPara((t, fx) => {
          if (!fx || fx.type !== 'paragraph') return false;
          if (col) fx.frameBg = col;
          else delete fx.frameBg;
        });
        break;
      }
      case 'k4VAlign':
        return VP.tx.act('tkVAlign:' + raw) || UI.dockAct('tkVAlign:' + raw, el || document.body);
      default:
        break;
    }
    try {
      VP.io.savePrefs();
    } catch (e) { /* optional */ }
    return true;
  };
  const act = (id) => {
    const [k, arg] = id.split(':');
    if (k === 'k4Show') {
      const sh = show();
      sh[arg] = !sh[arg];
    } else if (k === 'k4Under') {
      const on = !fontFlags(first()).under;
      if (!TD.targets().length) VP.defaults.under = on;
      TD.applyPara((t, fx) => {
        if (t instanceof paper.PointText) {
          if (on) t.data.under = true;
          else delete t.data.under;
        } else if (fx && fx.font && fx.type !== 'table') fx.font.under = on || undefined;
        else return false;
      });
    } else if (k === 'k4AlNone') {
      UI.dockAct('tkAlign:left', document.body);
      TD.applyPara((t, fx) => {
        if (t instanceof paper.PointText) t.data.alNone = true;
        else if (fx) fx.alNone = true;
        else return false;
      });
    } else return false;
    try {
      VP.io.savePrefs();
    } catch (e) { /* optional */ }
    UI.schedule('dock', 'prop', 'status');
    return true;
  };
  const clearNone = () =>
    TD.targets().forEach((t) => {
      if (t instanceof paper.PointText) delete t.data.alNone;
      else if (FX.of(t)) delete FX.of(t).alNone;
    });
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => {
    if (/^k4[A-Z]/.test(id)) return act(id);
    if (id.startsWith('tkAlign:')) clearNone();
    return act0(id, el);
  };
  const da0 = UI.dockAct;
  UI.dockAct = function (id, el) {
    if (/^k4[A-Z]/.test(id) && act(id)) return;
    if (id.startsWith('tkAlign:')) clearNone();
    return da0.apply(this, arguments);
  };

  /* ---------- look ---------- */
  const css = document.createElement('style');
  css.textContent = [
    '.k4-top{display:flex;align-items:center;gap:2px;margin:2px 0 4px}',
    '#dock-body .k4-top .btn.icon-only,#dock-body .k4-r .btn.icon-only{width:26px!important;min-width:0!important;height:24px;padding:0!important;justify-content:center}',
    '.k4-r{display:flex;align-items:center;gap:3px;margin:3px 0;min-width:0}',
    '.k4-r .field{min-width:0}',
    '.k4-f input{width:52px}',
    '.k4-size input{width:34px}',
    '.k4-s{flex:1;min-width:0}.k4-s select{width:100%;min-width:0}',
    '.k4-ic{display:inline-grid;place-items:center;width:18px;flex:none;color:var(--muted)}',
    '.btn.k4-font{flex:1;min-width:0;justify-content:space-between;height:24px;font-size:12px;padding:0 6px}',
    '.btn.k4-font span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.k4-dd{font-size:10px;color:var(--muted);margin-left:4px}',
    '.k4-spin{display:flex;flex-direction:column;flex:none}',
    '.k4-spin button{height:12px;width:16px;font-size:7px;line-height:1;padding:0;border:0;background:transparent;color:var(--muted)}',
    '.k4-spin button:hover{color:var(--fg)}',
    '.btn.k4-case{padding:0 6px;height:24px;font-size:11px}',
    '.k4-col{width:30px;height:22px;border:1px solid var(--line);padding:0;background:transparent;flex:none}',
    '.k4-col:disabled,.k4-dim{opacity:.45}',
    '.k4-al{gap:1px}',
    '.k4-g2{display:grid;grid-template-columns:1fr 1fr;column-gap:6px}',
    '.k4-g2 .k4-f input{width:38px}',
    '@media (pointer:coarse){#dock-body .k4-top .btn.icon-only,#dock-body .k4-r .btn.icon-only{width:32px!important;height:32px}.k4-spin button{height:16px;width:22px;font-size:9px}.btn.k4-font,.btn.k4-case{height:32px}.k4-col{height:30px;width:36px}}'
  ].join('\n');
  document.head.appendChild(css);
})();
