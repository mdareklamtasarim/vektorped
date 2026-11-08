/* VektörPad text, second set: paragraph indents, bullets and numbering, drop caps, tab stops and Turkish
   hyphenation for paragraph text; writing tools (spell check, quick correct, text statistics) and the font
   playground docker. Paragraphs that use none of these keep the original layout. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const TX = VP.tx;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const mm = H.mm;
  const A = VP.actions;
  const T2 = (VP.text2 = {});
  T2._waited = new Set();
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* =============== Turkish hyphenation =============== */
  const VOW = /[aeıioöuüâîûAEIİOÖUÜÂÎÛ]/;
  const LET = /[a-zçğıöşüâîûA-ZÇĞİÖŞÜÂÎÛ]/;
  // Places where a word may be split: a consonant followed by a vowel starts a syllable; two vowels split.
  T2.hyphPoints = (w) => {
    // punctuation around the word (quotes, commas) stays with it
    let s = Array.from(w);
    let lead = 0;
    while (s.length && !LET.test(s[0])) {
      s.shift();
      lead++;
    }
    while (s.length && !LET.test(s[s.length - 1])) s.pop();
    if (lead) return T2.hyphPoints(s.join('')).map((i) => i + lead);
    if (s.length < 5 || !s.every((c) => LET.test(c))) return [];
    const v = s.map((c) => VOW.test(c));
    const pts = [];
    for (let i = 1; i < s.length - 1; i++) {
      if (!v[i] && v[i + 1] && i >= 2) pts.push(i);
      else if (v[i] && v[i - 1] && i >= 2) pts.push(i);
    }
    return pts.filter((i) => i >= 2 && s.length - i >= 2);
  };
  T2.hyphenate = (w) => {
    const s = Array.from(w);
    const pts = T2.hyphPoints(w);
    let out = '';
    s.forEach((c, i) => (out += (pts.includes(i) ? '-' : '') + c));
    return out;
  };

  /* =============== advanced paragraph layout =============== */
  const isAdv = (fx) => !!(fx.indL || fx.indR || fx.indF || (fx.bullet && fx.bullet.type && fx.bullet.type !== 'none') || (fx.dropCap && fx.dropCap.lines > 1) || fx.hyph || fx.tabs || fx.tabStep || /\t/.test(fx.text || ''));
  T2.isAdv = isAdv;
  const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
  T2.BULLETS = [['none', 'Yok'], ['dot', '• Nokta'], ['dash', '– Tire'], ['arrow', '→ Ok'], ['star', '* Yıldız'], ['num', '1. Sayı'], ['alpha', 'a) Harf'], ['roman', 'i. Roma']];
  const bulletText = (b, n) => {
    switch (b.type) {
      case 'dot': return '•';
      case 'dash': return '–';
      case 'arrow': return '→';
      case 'star': return '*';
      case 'num': return n + '.';
      case 'alpha': return String.fromCharCode(97 + ((n - 1) % 26)) + ')';
      case 'roman': return (ROMAN[n - 1] || String(n)) + '.';
      default: return '';
    }
  };
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
    return t;
  };
  const lookOf = (fx) => {
    const p = protoOf(fx);
    return { fill: VP.getFill(p), stroke: VP.getStroke(p) };
  };
  const makeText = (f, look, s, pt, size) => {
    const t = new paper.PointText({ point: pt, content: s, justification: 'left', fontFamily: f.family, fontSize: size || f.size, fontWeight: VP.textWeight(f.bold, f.italic), insert: false });
    VP.setFill([t], look.fill);
    VP.setStroke([t], look.stroke.on ? { on: true, color: look.stroke.color, width: look.stroke.width, dash: look.stroke.dash } : { on: false });
    return t;
  };
  const hitRect = (x, y, w, h) => {
    const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(x, y, Math.max(w, 0.5), Math.max(h, 0.5)), insert: false });
    r.fillColor = '#000000';
    r.opacity = 0;
    r.data = { hitOnly: true, paraFrame: true };
    return r;
  };
  const geom = (fx) => {
    const cols = Math.max(1, Math.round(fx.cols || 1));
    const gut = cols > 1 ? Math.max(0, fx.gutter || 0) : 0;
    const colW = Math.max(fx.font.size * 0.6, (fx.w - gut * (cols - 1)) / cols);
    return { cols, gut, colW };
  };
  // Breaks the text into lines of positioned pieces. Returns {lines, caps}.
  T2.layout = (fx) => {
    const m = TX.measurer(fx.font);
    const { colW } = geom(fx);
    const lh = fx.font.size * (fx.lead || 1.2);
    const indL = fx.indL || 0;
    const indR = fx.indR || 0;
    const indF = fx.indF || 0;
    const right = Math.max(fx.font.size, colW - indR);
    const sp = m(' ');
    const step = Math.max(2, fx.tabStep || VP.toPT(12.7));
    const stops = (fx.tabs || []).filter((x) => x > 0).sort((a, b) => a - b);
    const nextTab = (x) => {
      const s = stops.find((t) => t > x + 0.5);
      return s != null ? s : (Math.floor(x / step) + 1) * step;
    };
    const bul = fx.bullet && fx.bullet.type && fx.bullet.type !== 'none' ? fx.bullet : null;
    const hang = bul ? (bul.hang != null ? bul.hang : fx.font.size * 1.5) : 0;
    const dc = fx.dropCap && fx.dropCap.lines > 1 ? fx.dropCap : null;
    const lines = [];
    const caps = [];
    let num = 0;
    String(fx.text == null ? '' : fx.text).replace(/\r\n?/g, '\n').split('\n').forEach((para, pi) => {
      if (!para.trim()) {
        lines.push({ pieces: [], last: true, width: 0 });
        num = 0;
        return;
      }
      num++;
      let text = para;
      let capW = 0;
      let capLines = 0;
      if (dc && (dc.all || pi === 0 || lines.every((l) => !l.pieces.length))) {
        const first = Array.from(text.replace(/^\s+/, ''))[0];
        if (first && /\S/.test(first)) {
          capLines = Math.round(clamp(dc.lines, 2, 10));
          const size = ((capLines - 1) * lh + m.asc) / 0.72;
          const mb = TX.measurer(Object.assign({}, fx.font, { size }));
          capW = mb(first) + (dc.gap != null ? dc.gap : fx.font.size * 0.3);
          caps.push({ ch: first, size, line: lines.length, lines: capLines });
          text = text.replace(/^\s+/, '').slice(first.length);
        }
      }
      const parts = text.split(/(\t)/);
      let line = { pieces: [], last: false, x: 0 };
      let first = true;
      let lineNo = 0;
      const lineStart = () => {
        let x = indL + (first ? indF : 0) + (bul ? hang : 0);
        if (capLines && lineNo < capLines) x = Math.max(x, indL + capW);
        return x;
      };
      const startLine = () => {
        line = { pieces: [], last: false, x: lineStart(), x0: lineStart() };
        if (first && bul) line.bullet = { t: bulletText(bul, num), x: indL + indF };
      };
      const endLine = (last) => {
        line.last = last;
        lines.push(line);
        first = false;
        lineNo++;
        startLine();
      };
      startLine();
      parts.forEach((part) => {
        if (part === '\t') {
          const nx = nextTab(line.x);
          if (nx > right && line.pieces.length) {
            endLine(false);
            line.x = nextTab(line.x);
          } else line.x = nx;
          line.tabbed = true;
          line.afterTab = line.pieces.length;
          line.needSpace = false;
          return;
        }
        part.split(/ +/).forEach((w) => {
          if (!w) return;
          const gap = line.needSpace ? sp : 0;
          const ww = m(w);
          if (line.x + gap + ww <= right + 0.01) {
            line.pieces.push({ t: w, x: line.x + gap, w: ww });
            line.x += gap + ww;
            line.needSpace = true;
            return;
          }
          // try to split the word with a hyphen first
          let rest = w;
          if (fx.hyph && line.pieces.length >= 0) {
            const pts = T2.hyphPoints(w).slice().reverse();
            const chars = Array.from(w);
            const k = pts.find((i) => line.x + gap + m(chars.slice(0, i).join('') + '-') <= right + 0.01);
            if (k) {
              const head = chars.slice(0, k).join('') + '-';
              line.pieces.push({ t: head, x: line.x + gap, w: m(head) });
              line.x += gap + m(head);
              rest = chars.slice(k).join('');
              endLine(false);
            }
          }
          if (rest === w && line.pieces.length) endLine(false);
          // words still longer than a whole line are split between letters
          let piece = '';
          Array.from(rest).forEach((ch) => {
            if (piece && line.x + m(piece + ch) > right + 0.01) {
              line.pieces.push({ t: piece, x: line.x, w: m(piece) });
              endLine(false);
              piece = ch;
            } else piece += ch;
          });
          if (piece) {
            line.pieces.push({ t: piece, x: line.x, w: m(piece) });
            line.x += m(piece);
            line.needSpace = true;
          }
        });
      });
      endLine(true);
      // keep room for a drop cap taller than its paragraph
      const made = lines.length - caps.reduce((a, c) => (c.line >= 0 ? a : a), 0);
      if (capLines) {
        const cap = caps[caps.length - 1];
        const used = lines.length - cap.line;
        if (used < capLines) {
          lines[lines.length - 1].last = false;
          for (let k = used; k < capLines; k++) lines.push({ pieces: [], last: k === capLines - 1, width: 0 });
        }
      }
      void made;
    });
    lines.forEach((l) => {
      const p = l.pieces;
      l.width = p.length ? p[p.length - 1].x + p[p.length - 1].w : 0;
      l.right = right;
    });
    return { lines, caps, lh, m };
  };
  const pour = (fx, lines, h, lh) => {
    const { cols } = geom(fx);
    const placed = [];
    const used = new Array(cols).fill(0);
    let col = 0;
    let y = 0;
    let i = 0;
    for (; i < lines.length; i++) {
      if (y > 0 && y + lh > h + 1e-6) {
        col++;
        y = 0;
      }
      if (col >= cols || lh > h + 1e-6) break;
      placed.push({ ln: lines[i], idx: i, col, top: y });
      y += lh;
      used[col] = y;
      if (lines[i].last) y += fx.paraSpace || 0;
    }
    return { placed, used, overflow: lines.length - i };
  };
  T2.fitHeight = (fx) => {
    const L = T2.layout(fx);
    const lh = L.lh;
    if (!L.lines.length) return lh;
    let hi = L.lines.length * (lh + (fx.paraSpace || 0)) + lh;
    let lo = lh;
    if (pour(fx, L.lines, lo, lh).overflow === 0) return lo;
    for (let k = 0; k < 32 && hi - lo > 0.05; k++) {
      const mid = (lo + hi) / 2;
      if (pour(fx, L.lines, mid, lh).overflow) lo = mid;
      else hi = mid;
    }
    return hi + 0.01;
  };
  T2.buildPara = (g) => {
    const fx = g.data.effect;
    fx.w = Math.max(fx.w, fx.font.size * 0.8);
    if (fx.autoH) fx.h = T2.fitHeight(fx);
    fx.h = Math.max(fx.h, 1);
    g.removeChildren();
    g.addChild(hitRect(fx.x, fx.y, fx.w, fx.h));
    const L = T2.layout(fx);
    const { colW, gut } = geom(fx);
    const P = pour(fx, L.lines, fx.h, L.lh);
    fx.overflow = P.overflow;
    const m = L.m;
    const half = (L.lh - (m.asc + m.desc)) / 2;
    const look = lookOf(fx);
    const baseOf = new Map();
    P.placed.forEach(({ ln, idx, col, top }) => {
      const x0 = fx.x + col * (colW + gut);
      const free = Math.max(0, fx.h - P.used[col]);
      const yOff = fx.valign === 'middle' ? free / 2 : fx.valign === 'bottom' ? free : 0;
      const base = fx.y + top + yOff + half + m.asc;
      baseOf.set(idx, { base, x0 });
      if (ln.bullet) g.addChild(makeText(fx.font, look, ln.bullet.t, Pt(x0 + ln.bullet.x, base)));
      if (!ln.pieces.length) return;
      const pcs = ln.pieces;
      let shift = 0;
      let extra = 0;
      const start = ln.tabbed ? ln.afterTab || 0 : 0;
      const freeW = ln.right - ln.width;
      if (fx.align === 'center' && !ln.tabbed) shift = freeW / 2;
      else if (fx.align === 'right' && !ln.tabbed) shift = freeW;
      else if (fx.align === 'justify' && !ln.last && pcs.length - start > 1) extra = freeW / (pcs.length - start - 1);
      if (extra) {
        pcs.forEach((p, k) => g.addChild(makeText(fx.font, look, p.t, Pt(x0 + p.x + Math.max(0, k - start) * extra * (k >= start ? 1 : 0), base))));
        return;
      }
      // join neighbouring words into runs (fewer text items)
      let run = null;
      const flush = () => run && g.addChild(makeText(fx.font, look, run.t, Pt(x0 + run.x + shift, base)));
      pcs.forEach((p) => {
        if (run && Math.abs(run.end + m(' ') - p.x) < 0.05) {
          run.t += ' ' + p.t;
          run.end = p.x + p.w;
        } else {
          flush();
          run = { t: p.t, x: p.x, end: p.x + p.w };
        }
      });
      flush();
    });
    L.caps.forEach((c) => {
      const last = baseOf.get(c.line + c.lines - 1) || baseOf.get(c.line);
      const firstB = baseOf.get(c.line);
      if (!firstB) return;
      const b = last && last.x0 === firstB.x0 ? last.base : firstB.base;
      const t = makeText(fx.font, look, c.ch, Pt(firstB.x0 + (fx.indL || 0), b), c.size);
      t.data.dropCap = true;
      g.addChild(t);
    });
    const key = VP.textWeight(fx.font.bold, fx.font.italic) + ' 100px "' + fx.font.family + '"';
    let ready = true;
    try {
      ready = !document.fonts || document.fonts.check(key);
    } catch (e) {
      ready = true;
    }
    // wait for a font only once (some browsers never report a font as ready; rebuilding again would loop)
    if (!ready && !T2._waited.has(key)) {
      T2._waited.add(key);
      document.fonts.load(key).then(() => g.parent && FX.of(g) && TX.build(g)).catch(() => {});
    }
  };
  const bp0 = TX.buildPara;
  TX.buildPara = (g) => (isAdv(g.data.effect) ? T2.buildPara(g) : bp0(g));
  const fh0 = TX.fitHeight;
  TX.fitHeight = (fx) => (isAdv(fx) ? T2.fitHeight(fx) : fh0(fx));
  FX.TYPES.paragraph.build = (g) => TX.buildPara(g);

  /* =============== paragraph format controls =============== */
  const sel = (label, name, items, cur) => '<label class="field"><span>' + esc(label) + '</span><select data-pf="' + name + '">' + items.map(([k, l]) => '<option value="' + k + '"' + (String(k) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>';
  const paraExtras = (g) => {
    const fx = g.data.effect;
    const b = fx.bullet || {};
    const d = fx.dropCap || {};
    const pf = H.dfieldPf;
    return '<div class="sec-h" style="margin-top:6px"><h3>Paragraf biçimi</h3></div>' +
      '<div class="row">' + pf('Sol girinti', 'tqIndL', mm(fx.indL || 0, 1)) + pf('Sağ', 'tqIndR', mm(fx.indR || 0, 1)) + '</div>' +
      '<div class="row">' + pf('İlk satır', 'tqIndF', mm(fx.indF || 0, 1)) + '</div>' +
      '<div class="row">' + sel('Madde işareti', 'tqBullet', T2.BULLETS, b.type || 'none') + (b.type && b.type !== 'none' ? pf('Asılı', 'tqHang', mm(b.hang != null ? b.hang : fx.font.size * 1.5, 1)) : '') + '</div>' +
      '<div class="row">' + sel('Büyük ilk harf', 'tqDrop', [[0, 'Yok'], [2, '2 satır'], [3, '3 satır'], [4, '4 satır'], [5, '5 satır']], d.lines || 0) + (d.lines > 1 ? H.tog('tqDropAll', 'Her paragraf', !!d.all, 'Her paragrafın ilk harfi büyük olsun') : '') + '</div>' +
      '<div class="row">' + pf('Sekme aralığı', 'tqTabStep', mm(fx.tabStep || VP.toPT(12.7), 1)) + '</div>' +
      '<div class="row"><label class="field wide"><span>Sekme durakları</span><input data-pf="tqTabs" value="' + esc((fx.tabs || []).map((x) => VP.num(VP.toMM(x), 1)).join('; ')) + '" placeholder="örn. 20; 45; 80" style="width:130px"><span class="unit">mm</span></label></div>' +
      '<div class="row">' + H.tog('tqHyph', 'Türkçe heceleme', !!fx.hyph, 'Satır sonlarında sözcükleri hecesinden böl') + '</div>' +
      '<p class="sec-note">Sekme için metinde Tab karakteri kullanın (düzenleyicide ⇥ düğmesi).</p>';
  };
  const panel0 = FX.TYPES.paragraph.panel;
  FX.TYPES.paragraph.panel = (g) => panel0(g) + paraExtras(g);
  const fields0 = FX.TYPES.paragraph.fields;
  FX.TYPES.paragraph.fields = (g) => {
    const fx = g.data.effect;
    const on = fx.bullet && fx.bullet.type && fx.bullet.type !== 'none';
    return fields0(g) + H.sep + H.tog('tqBulletTog', '• Madde', on, 'Madde işaretli liste') + H.tog('tqDropTog', 'Büyük harf', !!(fx.dropCap && fx.dropCap.lines > 1), 'Büyük ilk harf') + H.btn('tqFormat', 'Biçim…', 'Girinti, sekme, heceleme (Özellikler)');
  };
  const curPara = () => {
    const g = VP.sel.length === 1 ? VP.sel[0] : TX.editing();
    return g && TX.is(g, 'paragraph') ? g : null;
  };
  const rebuild = (g) => {
    TX.buildPara(g);
    VP.commit();
    VP.drawOverlay();
  };
  T2.propField = (name, raw) => {
    const g = curPara();
    if (!g) return true;
    const fx = g.data.effect;
    const v = VP.parseNum(raw);
    switch (name) {
      case 'tqIndL': if (isFinite(v)) fx.indL = Math.max(0, VP.toPT(v)); break;
      case 'tqIndR': if (isFinite(v)) fx.indR = Math.max(0, VP.toPT(v)); break;
      case 'tqIndF': if (isFinite(v)) fx.indF = VP.toPT(v); break;
      case 'tqBullet': fx.bullet = Object.assign({}, fx.bullet || {}, { type: raw }); break;
      case 'tqHang': if (v >= 0) fx.bullet = Object.assign({}, fx.bullet || {}, { hang: VP.toPT(v) }); break;
      case 'tqDrop': fx.dropCap = Object.assign({}, fx.dropCap || {}, { lines: +raw || 0 }); break;
      case 'tqTabStep': if (v > 0) fx.tabStep = VP.toPT(v); break;
      case 'tqTabs': fx.tabs = String(raw).split(/[;\s]+/).map((s) => VP.parseNum(s)).filter((x) => x > 0).map((x) => VP.toPT(x)); if (!fx.tabs.length) delete fx.tabs; break;
      default: return false;
    }
    rebuild(g);
    return true;
  };
  T2.act = (id) => {
    if (/^tq(Stats|Spell|Quick|Hyph)Run$/.test(id)) return false;
    const g = curPara();
    if (id === 'tqFormat') {
      UI.openDock('props');
      return true;
    }
    if (!g) return true;
    const fx = g.data.effect;
    switch (id) {
      case 'tqHyph': fx.hyph = !fx.hyph; break;
      case 'tqDropAll': fx.dropCap = Object.assign({}, fx.dropCap || {}, { all: !(fx.dropCap && fx.dropCap.all) }); break;
      case 'tqBulletTog': fx.bullet = Object.assign({}, fx.bullet || {}, { type: fx.bullet && fx.bullet.type && fx.bullet.type !== 'none' ? 'none' : 'dot' }); break;
      case 'tqDropTog': fx.dropCap = Object.assign({}, fx.dropCap || {}, { lines: fx.dropCap && fx.dropCap.lines > 1 ? 0 : 3 }); break;
      default: return false;
    }
    rebuild(g);
    return true;
  };
  const pf0 = TX.propField;
  TX.propField = (n, r, el) => (/^tq/.test(n) ? T2.propField(n, r, el) : pf0(n, r, el));
  const act0 = TX.act;
  TX.act = (id, el) => (/^tq/.test(id) ? T2.act(id, el) : act0(id, el));

  /* =============== editor: spell check, tab key =============== */
  VP.settings.spell = VP.settings.spell !== false;
  const oe0 = TX.openEditor;
  TX.openEditor = (a) => {
    oe0(a);
    const el = document.getElementById('rich-editor');
    if (!el) return;
    const ta = el.querySelector('textarea');
    ta.spellcheck = VP.settings.spell !== false;
    ta.lang = 'tr';
    ta.setAttribute('autocorrect', VP.settings.spell !== false ? 'on' : 'off');
    let tb = el.querySelector('[data-re="tab"]');
    if (!tb) {
      tb = document.createElement('button');
      tb.className = 'btn';
      tb.dataset.re = 'tab';
      tb.title = 'Sekme karakteri ekle';
      tb.textContent = '⇥';
      el.querySelector('.re-head').insertBefore(tb, el.querySelector('[data-re="done"]'));
      tb.addEventListener('pointerdown', (e) => e.preventDefault());
      tb.addEventListener('click', () => {
        const s = ta.selectionStart;
        ta.setRangeText('\t', s, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
      });
    }
    tb.hidden = !(a && a.target && TX.is(a.target, 'paragraph'));
  };

  /* =============== writing tools =============== */
  // every text the selection (or the page) contains: [{get, set, label}]
  const textTargets = (all) => {
    const out = [];
    const items = all || !VP.sel.length ? VP.userLayers().reduce((a, L) => a.concat(L.children), []) : VP.sel;
    const walk = (it) => {
      const fx = FX.of(it);
      if (it instanceof paper.PointText) out.push({ get: () => it.content, set: (v) => (it.content = v) });
      else if (fx && (fx.type === 'paragraph' || fx.type === 'textpath')) out.push({ get: () => fx.text, set: (v) => { fx.text = v; TX.build(it); } });
      else if (fx && fx.type === 'table') fx.cells.forEach((row) => row.forEach((c) => out.push({ get: () => c.t || '', set: (v) => { c.t = v; TX.build(it); } })));
      else if (it.children && !fx) it.children.forEach(walk);
    };
    items.forEach(walk);
    return out;
  };
  T2.QC = [
    ['(c)', '©'], ['(C)', '©'], ['(r)', '®'], ['(R)', '®'], ['(tm)', '™'], ['(TM)', '™'], ['...', '…'], [' -- ', ' – '], ['--', '—'], ['->', '→'], ['<-', '←'], ['1/2', '½'], ['1/4', '¼'], ['3/4', '¾'], ['+-', '±'], ['x2', '×2']
  ];
  const quickCorrect = (s, o) => {
    let t = s;
    if (o.repl) T2.QC.forEach(([a, b]) => (t = t.split(a).join(b)));
    if (o.space) t = t.replace(/[ ]{2,}/g, ' ').replace(/ +([,.;:!?])/g, '$1');
    if (o.quotes) t = t.replace(/(^|[\s(\[{])"/g, '$1“').replace(/"/g, '”').replace(/(^|[\s(\[{])'/g, '$1‘').replace(/'/g, '’');
    if (o.caps) t = t.replace(/(^|[.!?…]\s+|\n\s*)([a-zçğıöşüi])/g, (m0, a, b) => a + b.toLocaleUpperCase('tr'));
    if (o.twoCaps) t = t.replace(/\b([A-ZÇĞİÖŞÜ])([A-ZÇĞİÖŞÜ])([a-zçğıöşü]{2,})/g, (m0, a, b, c) => a + b.toLocaleLowerCase('tr') + c);
    return t;
  };
  T2.quickCorrect = quickCorrect;
  const quickDialog = () => {
    const tg = textTargets();
    if (!tg.length) return VP.toast('Seçimde veya sayfada metin yok');
    const o = Object.assign({ repl: true, space: true, quotes: true, caps: true, twoCaps: true }, VP.settings.qc || {});
    UI.modal(
      '<h2>Hızlı düzelt</h2><p class="sec-note">' + (VP.sel.length ? 'Seçili' : 'Sayfadaki') + ' ' + tg.length + ' metne uygulanır.</p>' +
        [['repl', 'Kısaltmaları değiştir: (c) → ©, ... → …, -- → —, -> → →'], ['space', 'Çift boşlukları ve noktalamadan önceki boşlukları sil'], ['quotes', 'Düz tırnakları “tipografik” tırnaklara çevir'], ['caps', 'Cümle başlarını büyük harf yap'], ['twoCaps', 'İKİ BAşta büyük harfi düzelt']]
          .map(([k, l]) => '<label class="field wide" style="height:auto;padding:6px 8px"><input type="checkbox" data-qc="' + k + '"' + (o[k] ? ' checked' : '') + '><span style="text-transform:none;letter-spacing:0;font-size:13px">' + esc(l) + '</span></label>').join('') +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Düzelt</button></div>',
      (root, close) => {
        root.addEventListener('click', (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'yes') {
            root.querySelectorAll('[data-qc]').forEach((c) => (o[c.dataset.qc] = c.checked));
            VP.settings.qc = o;
            VP.io.savePrefs();
            let n = 0;
            tg.forEach((t) => {
              const a = t.get();
              const b = quickCorrect(a, o);
              if (a !== b) {
                t.set(b);
                n++;
              }
            });
            if (n) VP.commit();
            VP.toast(n ? n + ' metin düzeltildi' : 'Düzeltilecek bir şey bulunmadı');
          }
          close();
        });
      }
    );
  };
  // Spell check uses the system's Turkish dictionary: misspelt words are underlined while editing.
  const spellDialog = () => {
    const tg = textTargets();
    if (!tg.length) return VP.toast('Seçimde veya sayfada metin yok');
    const SEP = '\n\n⁂\n\n';
    UI.modal(
      '<h2>Yazım denetimi</h2><p class="sec-note">Hatalı sözcükler sistem sözlüğüyle altı çizili gösterilir; üzerine dokunup öneriyi seçebilirsiniz. ' + (tg.length > 1 ? 'Metinler ⁂ ile ayrılmıştır; ayırıcıları silmeyin.' : '') + '</p>' +
        '<textarea id="sp-ta" lang="tr" spellcheck="true" autocorrect="on" style="width:100%;min-height:220px;font:15px/1.5 \'Fira Sans\',sans-serif;padding:10px;border-radius:8px;border:1px solid var(--line);background:var(--panel-2,#fff);color:var(--fg,#111)"></textarea>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Uygula</button></div>',
      (root, close) => {
        const ta = root.querySelector('#sp-ta');
        ta.value = tg.map((t) => t.get()).join(SEP);
        setTimeout(() => ta.focus(), 50);
        root.addEventListener('click', (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'yes') {
            const parts = ta.value.split(/\n*⁂\n*/);
            if (parts.length !== tg.length) return VP.toast('Metin ayırıcıları (⁂) değişmiş · Düzeltmeler uygulanamadı');
            let n = 0;
            tg.forEach((t, i) => {
              if (t.get() !== parts[i]) {
                t.set(parts[i]);
                n++;
              }
            });
            if (n) VP.commit();
            VP.toast(n ? n + ' metin güncellendi' : 'Değişiklik yok');
          }
          close();
        });
      }
    );
  };
  const statsDialog = () => {
    const tg = textTargets();
    const all = tg.map((t) => t.get()).join('\n');
    const words = (all.match(/[^\s]+/g) || []).length;
    const chars = Array.from(all.replace(/\n/g, '')).length;
    const nospace = Array.from(all.replace(/\s/g, '')).length;
    const paras = all.split(/\n+/).filter((s) => s.trim()).length;
    const sent = (all.match(/[^.!?…]+[.!?…]+/g) || []).length;
    const fonts = new Set();
    const walk = (it) => {
      const fx = FX.of(it);
      if (it instanceof paper.PointText) fonts.add(it.fontFamily);
      else if (fx && fx.font) fonts.add(fx.font.family);
      else if (it.children && !fx) it.children.forEach(walk);
    };
    (VP.sel.length ? VP.sel : VP.userLayers().reduce((a, L) => a.concat(L.children), [])).forEach(walk);
    UI.modal(
      '<h2>Metin istatistikleri</h2><p class="sec-note">' + (VP.sel.length ? 'Seçim' : 'Etkin sayfa') + '</p>' +
        '<table style="width:100%;font-size:14px;border-collapse:collapse">' + [['Metin nesnesi', tg.length], ['Paragraf', paras], ['Cümle', sent], ['Sözcük', words], ['Karakter (boşluklu)', chars], ['Karakter (boşluksuz)', nospace], ['Yazı tipleri', [...fonts].join(', ') || '—']].map(([k, v]) => '<tr><td style="padding:5px 0;opacity:.7">' + k + '</td><td style="text-align:right;font-weight:600">' + esc(String(v)) + '</td></tr>').join('') + '</table>' +
        '<div class="actions"><button class="btn primary" data-x="no">Kapat</button></div>',
      (root, close) => root.addEventListener('click', (e) => e.target.closest('[data-x]') && close())
    );
  };
  const hyphDialog = () => {
    const tg = textTargets();
    if (!tg.length) return VP.toast('Seçimde veya sayfada metin yok');
    const paras = VP.sel.filter((it) => TX.is(it, 'paragraph'));
    if (paras.length) {
      const on = !paras.every((g) => g.data.effect.hyph);
      paras.forEach((g) => {
        g.data.effect.hyph = on;
        TX.buildPara(g);
      });
      VP.commit();
      return VP.toast('Türkçe heceleme ' + (on ? 'açıldı' : 'kapatıldı'));
    }
    VP.toast('Heceleme paragraf metinlerinde çalışır · Örnek: ' + T2.hyphenate('kitaplıklarımızdan'));
  };

  /* =============== font playground docker =============== */
  const play = { text: 'Hızlı kahverengi tilki tembel köpeğin üstünden atlar', size: 28 };
  const fontsPanel = () => {
    const sample = esc(play.text || 'Aa');
    let h = '<div class="sec"><div class="sec-h"><h3>Yazı tipi oyun alanı</h3></div>' +
      '<div class="row"><label class="field wide"><span>Örnek</span><input data-fp="text" value="' + esc(play.text) + '" style="width:190px"></label></div>' +
      '<label class="range"><span class="pb-label">Boyut</span><input type="range" data-fp="size" min="10" max="72" value="' + play.size + '"><output>' + play.size + '</output></label>' +
      '<p class="sec-note">Bir yazı tipine dokunun: seçili metinlere uygulanır, seçim yoksa yeni metinlerin yazı tipi olur.</p></div>';
    // the font of the selected text (or of new text) is marked
    const cur = VP.textdock ? VP.textdock.current().family : VP.defaults.fontFamily;
    h += '<div class="fp-list">' + VP.FONTS.map((f) => '<button class="fp-item' + (f === cur ? ' on' : '') + '" data-act="tqFont:' + esc(f) + '" aria-pressed="' + (f === cur) + '">' +
      '<small>' + esc(f) + (f === cur ? ' ✓' : '') + '</small><span class="fp-sample" style="font-family:\'' + esc(f) + '\';font-size:' + play.size + 'px">' + sample + '</span></button>').join('') + '</div>';
    return h;
  };
  UI.panels = UI.panels || {};
  UI.panels.fonts = fontsPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'fonts')) UI.DOCKERS.push(['fonts', 'Yazı tipleri']);
  document.addEventListener('input', (e) => {
    const t = e.target.closest && e.target.closest('[data-fp]');
    if (!t) return;
    play[t.dataset.fp] = t.dataset.fp === 'size' ? +t.value : t.value;
    clearTimeout(play._t);
    play._t = setTimeout(() => {
      const body = document.getElementById('dock-body');
      if (UI.dockTab !== 'fonts' || !body) return;
      body.querySelectorAll('.fp-item .fp-sample').forEach((s) => {
        s.textContent = play.text || 'Aa';
        s.style.fontSize = play.size + 'px';
      });
      const o = t.nextElementSibling;
      if (o && o.tagName === 'OUTPUT') o.textContent = play.size;
    }, 60);
  });
  const act1 = TX.act;
  TX.act = (id, el) => {
    if (id.startsWith('tqFont:')) {
      UI.propField('font', id.slice(7), el);
      VP.toast('Yazı tipi: ' + id.slice(7));
      return true;
    }
    return act1(id, el);
  };

  /* =============== actions and menus =============== */
  Object.assign(A, {
    spellCheck: { label: 'Yazım denetimi…', icon: 'text', run: spellDialog },
    quickCorrect: { label: 'Hızlı düzelt…', run: quickDialog },
    textStats: { label: 'Metin istatistikleri…', run: statsDialog },
    hyphenation: { label: 'Türkçe heceleme', run: hyphDialog, checked: () => VP.sel.some((it) => TX.is(it, 'paragraph')) && VP.sel.filter((it) => TX.is(it, 'paragraph')).every((g) => g.data.effect.hyph) },
    spellAsYouType: {
      label: 'Yazarken yazım denetimi', checked: () => VP.settings.spell !== false,
      run: () => {
        VP.settings.spell = VP.settings.spell === false;
        VP.io.savePrefs();
        VP.toast('Yazarken yazım denetimi ' + (VP.settings.spell ? 'açık' : 'kapalı'));
      }
    },
    fontPlayground: { label: 'Yazı tipi oyun alanı', icon: 'text', run: () => UI.openDock('fonts') },
    paraFormat: { label: 'Paragraf biçimi…', run: () => (curPara() ? UI.openDock('props') : VP.toast('Bir paragraf metni seçin')) }
  });
  const M = UI.MENUS.text;
  if (M && !M.includes('spellCheck')) M.push('|', 'h:Yazım araçları', 'spellCheck', 'spellAsYouType', 'quickCorrect', 'hyphenation', 'textStats', '|', 'paraFormat', 'fontPlayground');
  const W = UI.MENUS.window;
  if (W && !W.includes('fontPlayground')) W.push('fontPlayground');
})();
