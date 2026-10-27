/* VektörPad "Metin" docker, laid out like the desktop suite's Text docker: Character, Paragraph and Frame
   sections that work on every kind of text (artistic text, paragraph text, text on a path, tables) and on
   the text being typed; with nothing selected they set the defaults for new text. The font list shows
   each font in its own face. Also makes the font playground apply fonts to every text kind. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const TX = VP.tx;
  const FX = VP.fx;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const A = VP.actions;
  const TD = (VP.textdock = {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isFxText = (it) => {
    const fx = FX.of(it);
    return !!(fx && fx.font && (fx.type === 'paragraph' || fx.type === 'textpath' || fx.type === 'table'));
  };
  const isText = (it) => it instanceof paper.PointText || isFxText(it);
  // the texts the docker works on
  TD.targets = () => {
    const out = VP.sel.filter(isText);
    if (UI.textItem && !out.includes(UI.textItem)) out.push(UI.textItem);
    const ed = TX.editing && TX.editing();
    if (ed && ed.parent && !out.includes(ed)) out.push(ed);
    return out;
  };
  // current character settings of the first target (or the defaults)
  TD.current = () => {
    const t = TD.targets()[0];
    const d = VP.defaults;
    if (!t) return { kind: 'none', family: d.fontFamily || 'Fira Sans', size: d.fontSize || 24, bold: !!d.bold, italic: !!d.italic, align: d.justification || 'left', fill: d.fill || '#1d1d1b', lead: 1.2 };
    if (t instanceof paper.PointText) {
      const f = VP.getFill(t);
      const s = VP.getStroke(t);
      return { kind: 'artistic', item: t, family: t.fontFamily, size: t.fontSize, bold: VP.isBold(t), italic: VP.isItalic(t), align: t.justification, fill: f.type === 'none' ? null : f.color, stroke: s.on ? s.color : null, strokeW: s.width, lead: t.leading && t.fontSize ? t.leading / t.fontSize : 1.2 };
    }
    const fx = FX.of(t);
    const f = VP.getFill(t);
    const s = VP.getStroke(t);
    return { kind: fx.type, item: t, fx, family: fx.font.family, size: fx.font.size, bold: !!fx.font.bold, italic: !!fx.font.italic, align: fx.align, fill: fx.type === 'table' ? fx.color : f.type === 'none' ? null : f.color, stroke: s.on ? s.color : null, strokeW: s.width, lead: fx.lead || 1.2 };
  };
  const loadFace = (family, bold, italic, then) => {
    if (!document.fonts) return;
    document.fonts.load(VP.textWeight(bold, italic) + ' 24px "' + family + '"').then(() => then && then()).catch(() => {});
  };
  // character changes: {family, size, bold, italic}
  TD.applyChar = (patch) => {
    const ts = TD.targets();
    if (!ts.length) {
      const d = VP.defaults;
      if (patch.family) d.fontFamily = patch.family;
      if (patch.size) d.fontSize = patch.size;
      if ('bold' in patch) d.bold = patch.bold;
      if ('italic' in patch) d.italic = patch.italic;
      VP.io.savePrefs();
      if (patch.family) VP.toast('Yeni metinlerin yazı tipi: ' + patch.family);
      return 0;
    }
    ts.forEach((t) => {
      if (t instanceof paper.PointText) {
        if (patch.family) t.fontFamily = patch.family;
        if (patch.size) {
          const k = t.leading && t.fontSize ? t.leading / t.fontSize : null;
          t.fontSize = patch.size;
          if (k) t.leading = patch.size * k;
        }
        if ('bold' in patch || 'italic' in patch) t.fontWeight = VP.textWeight('bold' in patch ? patch.bold : VP.isBold(t), 'italic' in patch ? patch.italic : VP.isItalic(t));
        loadFace(t.fontFamily, VP.isBold(t), VP.isItalic(t), () => {
          if (paper.view.update) paper.view.update();
          VP.drawOverlay();
        });
      } else {
        const fx = FX.of(t);
        Object.assign(fx.font, patch);
        TX.build(t);
        loadFace(fx.font.family, fx.font.bold, fx.font.italic, () => t.parent && TX.build(t));
      }
    });
    if (UI.textItem && UI.syncTextEditor) UI.syncTextEditor();
    if (TX.editing && TX.editing()) TX.placeEditor();
    else if (!UI.textItem) VP.commit();
    VP.drawOverlay();
    return ts.length;
  };
  // paragraph and frame changes
  TD.applyPara = (fn) => {
    const ts = TD.targets();
    let n = 0;
    ts.forEach((t) => {
      if (fn(t, FX.of(t)) !== false) {
        n++;
        if (isFxText(t)) TX.build(t);
      }
    });
    if (n && !UI.textItem && !(TX.editing && TX.editing())) VP.commit();
    VP.drawOverlay();
    return n;
  };

  /* =============== font list (each font in its own face) =============== */
  TD.fontMenu = (anchor) => {
    const cur = TD.current().family;
    const fonts = VP.FONTS.slice();
    if (!fonts.includes(cur)) fonts.unshift(cur);
    const html = '<div class="pop-head">Yazı tipleri</div>' + fonts.map((f) => '<button class="pop-item' + (f === cur ? ' on' : '') + '" data-pick="' + esc(f) + '" style="font-family:\'' + esc(f) + '\';font-size:17px;min-height:38px">' + esc(f) + (f === cur ? '<span class="check">✓</span>' : '') + '</button>').join('');
    UI.popover(anchor, html, (f) => {
      TD.applyChar({ family: f });
      UI.schedule('prop', 'dock', 'status');
    });
  };

  /* =============== docker =============== */
  const STYLES = [['n', 'Normal'], ['b', 'Kalın'], ['i', 'İtalik'], ['bi', 'Kalın İtalik']];
  const ALIGNS = [['left', 'alignL', 'Sola'], ['center', 'alignCH', 'Ortaya'], ['right', 'alignR', 'Sağa'], ['justify', 'alignJ', 'İki yana']];
  const SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72, 96, 120];
  const sec = (title, body, open) => '<div class="sec tk-sec"><div class="sec-h"><h3>' + esc(title) + '</h3></div>' + (open === false ? '' : body) + '</div>';
  const field = (label, name, value, unit, attrs) => '<label class="field"><span>' + esc(label) + '</span><input data-pf="' + name + '" value="' + esc(value) + '" inputmode="decimal" enterkeyhint="done" aria-label="' + esc(label) + '"' + (attrs || '') + '>' + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</label>';
  const panel = () => {
    const c = TD.current();
    const ts = TD.targets();
    const para = c.kind === 'paragraph';
    const fx = c.fx;
    const style = c.bold && c.italic ? 'bi' : c.bold ? 'b' : c.italic ? 'i' : 'n';
    const kindName = { none: 'Seçim yok · Ayarlar yeni metinlere uygulanır', artistic: 'Sanatsal metin', paragraph: 'Paragraf metni', textpath: 'Yoldaki metin', table: 'Tablo' }[c.kind];
    let h = '<p class="sec-note">' + esc(ts.length > 1 ? ts.length + ' metin seçili' : kindName) + '</p>';
    // character
    let ch = '<button class="btn tk-font" data-act="tkFontMenu" style="width:100%;justify-content:space-between;height:40px;font-family:\'' + esc(c.family) + '\';font-size:17px" aria-label="Yazı tipi: ' + esc(c.family) + '"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.family) + '</span><span style="font:12px var(--font-ui);color:var(--muted)">▾</span></button>';
    ch += '<div class="row"><label class="field grow"><span>Stil</span><select data-pf="tkStyle" aria-label="Yazı stili" style="flex:1">' + STYLES.map(([k, l]) => '<option value="' + k + '"' + (k === style ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      '<button class="btn' + (c.bold ? ' on' : '') + '" data-act="tkBold" aria-pressed="' + c.bold + '" title="Kalın" style="font-weight:700;width:32px;justify-content:center">K</button><button class="btn' + (c.italic ? ' on' : '') + '" data-act="tkItalic" aria-pressed="' + c.italic + '" title="İtalik" style="font-style:italic;width:32px;justify-content:center">İ</button></div>';
    ch += '<div class="row"><label class="field"><span>Boyut</span><input data-pf="tkSize" value="' + esc(VP.num(c.size, 1)) + '" list="tk-sizes" inputmode="decimal" enterkeyhint="done" aria-label="Yazı boyutu" style="width:44px"><span class="unit">pt</span></label>' +
      '<button class="btn icon-only" data-act="tkSize:-1" title="Küçült" aria-label="Yazıyı küçült">' + ic('minus', 'sm') + '</button><button class="btn icon-only" data-act="tkSize:1" title="Büyüt" aria-label="Yazıyı büyüt">' + ic('plus', 'sm') + '</button>' +
      '<button class="btn" data-act="tkCase" title="Büyük/küçük harf">Aa ▾</button></div>' +
      '<datalist id="tk-sizes">' + SIZES.map((s) => '<option value="' + s + '">').join('') + '</datalist>';
    ch += '<div class="row"><label class="field"><span>Dolgu</span><input type="color" data-pf="tkFill" value="' + esc(c.fill || '#1d1d1b') + '" style="width:34px;height:24px;border:0;padding:0;background:transparent" aria-label="Metin rengi"></label>' +
      (c.kind !== 'table' ? '<label class="field"><span>Anahat</span><input type="color" data-pf="tkStroke" value="' + esc(c.stroke || '#1d1d1b') + '" style="width:34px;height:24px;border:0;padding:0;background:transparent" aria-label="Anahat rengi"></label>' + (c.stroke ? '<button class="btn" data-act="tkNoStroke">Anahat yok</button>' : '') : '') + '</div>';
    h += sec('Karakter', ch);
    // paragraph
    let pg = '<div class="row"><span class="seg">' + ALIGNS.map(([k, icon, l]) => {
      const dis = c.kind === 'artistic' && k === 'justify';
      return '<button data-act="tkAlign:' + k + '" class="' + (c.align === k ? 'on' : '') + '" title="' + l + '" aria-label="' + l + '"' + (dis ? ' disabled' : '') + '>' + ic(icon, 'sm') + '</button>';
    }).join('') + '</span></div>';
    if (c.kind === 'artistic' || c.kind === 'none' || para) pg += '<div class="row">' + field('Satır aralığı', 'tkLead', Math.round(c.lead * 100), '%') + '</div>';
    if (para) {
      pg += '<div class="row">' + field('Paragraf sonrası', 'tkParaSp', VP.num(VP.toMM(fx.paraSpace || 0), 1), 'mm') + '</div>' +
        '<div class="row">' + field('Sol girinti', 'tqIndL', VP.num(VP.toMM(fx.indL || 0), 1), 'mm') + field('Sağ', 'tqIndR', VP.num(VP.toMM(fx.indR || 0), 1), 'mm') + '</div>' +
        '<div class="row">' + field('İlk satır', 'tqIndF', VP.num(VP.toMM(fx.indF || 0), 1), 'mm') + '</div>' +
        '<div class="row"><label class="field"><span>Madde</span><select data-pf="tqBullet">' + VP.text2.BULLETS.map(([k, l]) => '<option value="' + k + '"' + (k === ((fx.bullet && fx.bullet.type) || 'none') ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span>Büyük harf</span><select data-pf="tqDrop">' + [[0, 'Yok'], [2, '2 satır'], [3, '3 satır'], [4, '4 satır']].map(([k, l]) => '<option value="' + k + '"' + (k === ((fx.dropCap && fx.dropCap.lines) || 0) ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>' +
        '<div class="row"><button class="btn' + (fx.hyph ? ' on' : '') + '" data-act="tqHyph" aria-pressed="' + !!fx.hyph + '">Türkçe heceleme</button></div>';
    } else if (c.kind === 'textpath') {
      pg += '<div class="row">' + field('Harf aralığı', 'txSpacing', VP.num(VP.toMM(fx.spacing || 0), 2), 'mm') + '</div>';
    }
    if (c.kind !== 'table') h += sec('Paragraf', pg);
    // frame
    if (para) {
      const fr = '<div class="row">' + field('Sütun', 'txCols', fx.cols, '') + field('Aralık', 'txGutter', VP.num(VP.toMM(fx.gutter || 0), 1), 'mm') + '</div>' +
        '<div class="row"><span class="pb-label">Dikey</span><span class="seg">' + [['top', 'Üst'], ['middle', 'Orta'], ['bottom', 'Alt']].map(([k, l]) => '<button data-act="tkVAlign:' + k + '" class="' + (fx.valign === k ? 'on' : '') + '">' + l + '</button>').join('') + '</span></div>' +
        '<div class="row"><button class="btn' + (fx.autoH ? ' on' : '') + '" data-act="txAutoH" aria-pressed="' + !!fx.autoH + '">Otomatik yükseklik</button><button class="btn" data-act="txFitFrame">Çerçeveyi uydur</button><button class="btn" data-act="txFitText">Metni sığdır</button></div>' +
        (fx.overflow ? '<p class="sec-note" style="color:var(--danger)">Metnin bir kısmı çerçeveye sığmıyor.</p>' : '');
      h += sec('Çerçeve', fr);
    }
    h += '<div class="row"><button class="btn" data-act="tkPlayground">' + ic('text', 'sm') + 'Yazı tipi oyun alanı</button>' + (ts.length === 1 && !(TX.editing && TX.editing()) && !UI.textItem ? '<button class="btn" data-act="tkEdit">Metni düzenle</button>' : '') + '</div>';
    return h;
  };
  UI.panels = UI.panels || {};
  UI.panels.text = panel;
  if (!UI.DOCKERS.some(([k]) => k === 'text')) {
    const at = UI.DOCKERS.findIndex(([k]) => k === 'objects');
    UI.DOCKERS.splice(at < 0 ? 1 : at, 0, ['text', 'Metin']);
  }
  // the font playground applies to every kind of text
  const act0 = TX.act;
  TX.act = (id, el) => {
    if (id.startsWith('tqFont:')) {
      const f = id.slice(7);
      const n = TD.applyChar({ family: f });
      if (n) VP.toast(n + ' metne uygulandı: ' + f);
      // keep the list where it was and mark the new font straight away
      const body = document.getElementById('dock-body');
      const st = body ? body.scrollTop : 0;
      UI.renderDock(true);
      if (body) body.scrollTop = st;
      UI.schedule('prop', 'status');
      return true;
    }
    if (!/^tk/.test(id)) return act0(id, el);
    const [k, arg] = id.split(':');
    const c = TD.current();
    switch (k) {
      case 'tkFontMenu': TD.fontMenu(el); return true;
      case 'tkBold': TD.applyChar({ bold: !c.bold }); break;
      case 'tkItalic': TD.applyChar({ italic: !c.italic }); break;
      case 'tkSize': {
        const i = SIZES.findIndex((s) => s >= c.size - 0.01);
        const cur = i < 0 ? SIZES.length - 1 : i;
        const next = +arg > 0 ? SIZES.find((s) => s > c.size + 0.01) || c.size * 1.2 : [...SIZES].reverse().find((s) => s < c.size - 0.01) || Math.max(1, c.size / 1.2);
        void cur;
        TD.applyChar({ size: next });
        break;
      }
      case 'tkCase': UI.run('changeCase'); return true;
      case 'tkNoStroke':
        TD.applyPara((t) => {
          if (isFxText(t)) FX.restyle(t, (l) => VP.setStroke(l, { on: false }));
          else VP.setStroke([t], { on: false });
        });
        break;
      case 'tkAlign':
        if (!TD.targets().length) VP.defaults.justification = arg === 'justify' ? 'left' : arg;
        TD.applyPara((t, fx) => {
          if (t instanceof paper.PointText) {
            if (arg === 'justify') return false;
            t.justification = arg;
          } else if (fx.type === 'paragraph') fx.align = arg;
          else if (fx.type === 'table') fx.align = arg === 'justify' ? 'left' : arg;
          else if (fx.type === 'textpath') fx.align = arg === 'left' ? 'start' : arg === 'right' ? 'end' : 'center';
          else return false;
        });
        break;
      case 'tkVAlign': TD.applyPara((t, fx) => (fx && fx.type === 'paragraph' ? void (fx.valign = arg) : false)); break;
      case 'tkPlayground': UI.openDock('fonts'); return true;
      case 'tkEdit': {
        const t = TD.targets()[0];
        if (t) VP.tools.select.dblTap(t, t.bounds.center);
        return true;
      }
      default: return false;
    }
    UI.schedule('prop', 'dock', 'status');
    return true;
  };
  const pf0 = TX.propField;
  TX.propField = (name, raw, el) => {
    if (!/^tk/.test(name)) return pf0(name, raw, el);
    const v = VP.parseNum(raw);
    const hex = UI.normHex(raw);
    switch (name) {
      case 'tkStyle': TD.applyChar({ bold: raw === 'b' || raw === 'bi', italic: raw === 'i' || raw === 'bi' }); break;
      case 'tkSize': if (v > 0) TD.applyChar({ size: clamp(v, 0.5, 1000) }); break;
      case 'tkFill':
        if (!hex) break;
        if (!TD.targets().length) VP.defaults.fill = hex;
        TD.applyPara((t, fx) => {
          if (fx && fx.type === 'table') fx.color = hex;
          else if (fx) FX.restyle(t, (l) => VP.setFill(l, { type: 'solid', color: hex, alpha: 1 }));
          else VP.setFill([t], { type: 'solid', color: hex, alpha: 1 });
        });
        break;
      case 'tkStroke':
        if (!hex) break;
        TD.applyPara((t, fx) => {
          const spec = { on: true, color: hex, width: VP.getStroke(t).width || 0.5 };
          if (fx) FX.restyle(t, (l) => VP.setStroke(l, spec));
          else VP.setStroke([t], spec);
        });
        break;
      case 'tkLead':
        if (!(v > 0)) break;
        TD.applyPara((t, fx) => {
          if (t instanceof paper.PointText) t.leading = t.fontSize * clamp(v / 100, 0.5, 5);
          else if (fx.type === 'paragraph') fx.lead = clamp(v / 100, 0.5, 5);
          else return false;
        });
        break;
      case 'tkParaSp': if (v >= 0) TD.applyPara((t, fx) => (fx && fx.type === 'paragraph' ? void (fx.paraSpace = VP.toPT(v)) : false)); break;
      default: return false;
    }
    UI.schedule('prop', 'dock', 'status');
    return true;
  };
  // the text menu's "text properties" opens this docker
  A.textProps = { label: 'Metin özellikleri', kbd: 'Ctrl+T', icon: 'text', run: () => UI.openDock('text') };
  A.dockText = { label: 'Metin', icon: 'text', run: () => UI.openDock('text') };
  const W = UI.MENUS.window;
  if (W && !W.includes('dockText')) {
    const i = W.indexOf('dockProps');
    W.splice(i < 0 ? W.length : i + 1, 0, 'dockText');
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 't' || e.key === 'T') && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
      e.preventDefault();
      UI.openDock('text');
    }
  });
  // keep the docker in step with the selection and with typing
  ['selection', 'change', 'tool'].forEach((ev) => VP.on(ev, () => UI.dockTab === 'text' && !document.getElementById('dock').hidden && UI.schedule('dock')));
})();
