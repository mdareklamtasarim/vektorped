/* VektörPad styles, palettes and symbols.
   - Styles docker: object, character and paragraph styles (linked: updating a style updates its objects)
     and colour styles (named colours linked to fills and outlines).
   - Palette manager docker: built-in and custom palettes for the colour bar; import/export GIMP .gpl files.
   - Symbols docker: turn a selection into a symbol, place instances, update every instance at once, and a
     small built-in symbol library. Instances are groups linked to the definition. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const TX = VP.tx;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const A = VP.actions;
  const ST = (VP.styles = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const E = () => VP.ext();
  const list = (k) => (E()[k] = E()[k] || []);
  const uid = () => 's' + Math.random().toString(36).slice(2, 9);
  const isTextFx = (it) => {
    const fx = FX.of(it);
    return !!(fx && (fx.type === 'paragraph' || fx.type === 'textpath' || fx.type === 'table'));
  };
  const isText = (it) => it instanceof paper.PointText || isTextFx(it);
  const allItems = (root) => {
    const out = [];
    const walk = (it) => {
      out.push(it);
      if (it.children && !FX.isFx(it) && !(it instanceof paper.CompoundPath)) it.children.forEach(walk);
    };
    (root ? [root] : VP.userLayers()).forEach((r) => (r instanceof paper.Layer ? r.children.forEach(walk) : walk(r)));
    return out;
  };
  const pageItems = () => allItems();

  /* =============== object, character and paragraph styles =============== */
  ST.KINDS = { object: 'Nesne', char: 'Karakter', para: 'Paragraf' };
  const fontOf = (it) => {
    const fx = FX.of(it);
    if (fx && fx.font) return Object.assign({}, fx.font);
    return { family: it.fontFamily, size: it.fontSize, bold: VP.isBold(it), italic: VP.isItalic(it) };
  };
  ST.capture = (it, kind) => {
    const p = {};
    if (kind === 'object') {
      p.fill = VP.getFill(it);
      p.stroke = VP.getStroke(it);
      p.opacity = it.opacity;
      p.blend = it.blendMode || 'normal';
      p.shadow = it.data && it.data.shadow ? Object.assign({}, it.data.shadow) : null;
      ['arrows', 'nib', 'behindFill', 'strokePos'].forEach((k) => it.data && it.data[k] != null && (p[k] = JSON.parse(JSON.stringify(it.data[k]))));
      return p;
    }
    p.font = fontOf(it);
    const f = VP.getFill(it);
    p.color = f.type === 'none' ? null : f.color;
    if (kind === 'para') {
      const fx = FX.of(it);
      if (fx && fx.type === 'paragraph') ['align', 'lead', 'paraSpace', 'indL', 'indR', 'indF', 'bullet', 'dropCap', 'hyph', 'tabStep', 'tabs', 'cols', 'gutter'].forEach((k) => fx[k] != null && (p[k] = JSON.parse(JSON.stringify(fx[k]))));
      else if (it instanceof paper.PointText) {
        p.align = it.justification;
        p.lead = it.leading && it.fontSize ? it.leading / it.fontSize : 1.2;
      }
    }
    return p;
  };
  const applyOne = (it, st) => {
    const p = st.props;
    if (st.kind === 'object') {
      if (it instanceof paper.Raster) return;
      if (p.fill) VP.setFill([it], p.fill);
      if (p.stroke) VP.setStroke([it], p.stroke.on ? Object.assign({}, p.stroke) : { on: false });
      it.opacity = p.opacity == null ? 1 : p.opacity;
      it.blendMode = p.blend || 'normal';
      VP.setShadow([it], p.shadow ? Object.assign({ on: true }, p.shadow) : { on: false });
      VP.leafItems([it]).forEach((lf) => {
        if (!(lf instanceof paper.Path || lf instanceof paper.CompoundPath)) return;
        ['arrows', 'nib', 'behindFill', 'strokePos'].forEach((k) => (p[k] != null ? (lf.data[k] = JSON.parse(JSON.stringify(p[k]))) : delete lf.data[k]));
      });
      it.data.styleRef = st.id;
      return;
    }
    if (!isText(it)) return;
    const fx = FX.of(it);
    if (fx && fx.font && p.font) Object.assign(fx.font, p.font);
    else if (it instanceof paper.PointText && p.font) {
      it.fontFamily = p.font.family;
      it.fontSize = p.font.size;
      it.fontWeight = VP.textWeight(p.font.bold, p.font.italic);
    }
    if (st.kind === 'para') {
      if (fx && fx.type === 'paragraph') ['align', 'lead', 'paraSpace', 'indL', 'indR', 'indF', 'bullet', 'dropCap', 'hyph', 'tabStep', 'tabs', 'cols', 'gutter'].forEach((k) => (p[k] != null ? (fx[k] = JSON.parse(JSON.stringify(p[k]))) : k === 'tabs' || k === 'bullet' || k === 'dropCap' ? delete fx[k] : null));
      else if (it instanceof paper.PointText && p.align) it.justification = p.align === 'justify' ? 'left' : p.align;
    }
    if (p.color) {
      if (fx) FX.restyle(it, (l) => VP.setFill(l, { type: 'solid', color: p.color, alpha: 1 }));
      else VP.setFill([it], { type: 'solid', color: p.color, alpha: 1 });
    } else if (fx) FX.rebuild(it);
    if (fx) fx.styleRef = st.id;
    else it.data.styleRef = st.id;
  };
  ST.apply = (items, st) => {
    let n = 0;
    items.forEach((it) => {
      if (st.kind !== 'object' && !isText(it)) return;
      applyOne(it, st);
      n++;
    });
    return n;
  };
  const refOf = (it) => {
    const fx = FX.of(it);
    return (fx && fx.styleRef) || (it.data && it.data.styleRef) || null;
  };
  // re-applies every linked style on the current page (after a style changes or a page loads)
  ST.sync = (onlyId) => {
    const styles = list('objStyles');
    if (!styles.length) return 0;
    let n = 0;
    pageItems().forEach((it) => {
      const r = refOf(it);
      if (!r || (onlyId && r !== onlyId)) return;
      const st = styles.find((s) => s.id === r);
      if (!st) {
        if (it.data) delete it.data.styleRef;
        return;
      }
      applyOne(it, st);
      n++;
    });
    return n;
  };
  ST.fromSelection = async (kind) => {
    const it = VP.sel[0];
    if (!it) return VP.toast('Önce stili alınacak nesneyi seçin');
    if (kind !== 'object' && !isText(it)) return VP.toast(ST.KINDS[kind] + ' stili için bir metin seçin');
    const name = await UI.prompt({ title: 'Yeni ' + ST.KINDS[kind].toLowerCase() + ' stili', label: 'Stil adı', value: ST.KINDS[kind] + ' stili ' + (list('objStyles').filter((s) => s.kind === kind).length + 1), ok: 'Oluştur' });
    if (!name) return;
    const st = { id: uid(), name, kind, props: ST.capture(it, kind) };
    list('objStyles').push(st);
    VP.sel.forEach((x) => (kind === 'object' || isText(x)) && (FX.of(x) && FX.of(x).font && kind !== 'object' ? (FX.of(x).styleRef = st.id) : (x.data.styleRef = st.id)));
    VP.commit();
    UI.openDock('styles');
    VP.toast('Stil oluşturuldu: ' + name);
  };

  /* =============== colour styles =============== */
  ST.applyColorStyle = (items, cs, target) => {
    items.forEach((it) => {
      if (target === 'stroke') {
        VP.setStroke([it], { on: true, color: cs.hex, width: VP.getStroke(it).width || VP.defaults.strokeWidth });
        it.data.cstroke = cs.id;
      } else {
        if (it instanceof paper.Raster) return;
        VP.setFill([it], { type: 'solid', color: cs.hex, alpha: 1 });
        it.data.cfill = cs.id;
      }
    });
  };
  ST.syncColors = (root) => {
    const cs = list('colorStyles');
    if (!cs.length) return;
    const by = new Map(cs.map((c) => [c.id, c]));
    allItems(root).forEach((it) => {
      const d = it.data;
      if (!d) return;
      if (d.cfill) {
        const c = by.get(d.cfill);
        if (!c) delete d.cfill;
        else if (VP.getFill(it).color !== c.hex || VP.getFill(it).type !== 'solid') VP.setFill([it], { type: 'solid', color: c.hex, alpha: 1 });
      }
      if (d.cstroke) {
        const c = by.get(d.cstroke);
        if (!c) delete d.cstroke;
        else if (VP.getStroke(it).color !== c.hex) VP.setStroke([it], { on: true, color: c.hex });
      }
    });
  };

  /* =============== palettes =============== */
  const ramp = (n, f) => Array.from({ length: n }, (_, i) => f(i, n));
  const hsl = (h, s, l) => {
    const c = new paper.Color({ hue: h, saturation: s, lightness: l });
    return VP.hex(c);
  };
  ST.BUILTIN = {
    default: { name: 'Varsayılan (CMYK benzeri)', colors: () => UI.PALETTE },
    pastel: { name: 'Pastel', colors: () => ramp(16, (i) => [hsl((i * 360) / 16, 0.65, 0.82), 'Pastel ' + (i + 1)]) },
    vivid: { name: 'Canlı (RGB)', colors: () => ramp(18, (i) => [hsl((i * 360) / 18, 0.9, 0.5), 'Canlı ' + (i + 1)]) },
    earth: { name: 'Toprak tonları', colors: () => [['#3b2a1a', 'Koyu kahve'], ['#5c3d22', 'Kahve'], ['#7d4e24', 'Kızıl kahve'], ['#a0693b', 'Tarçın'], ['#c49a6c', 'Kum'], ['#e0c9a6', 'Bej'], ['#f2e6d0', 'Krem'], ['#6b705c', 'Zeytin'], ['#a5a58d', 'Adaçayı'], ['#cb997e', 'Kil'], ['#9c6644', 'Pişmiş toprak'], ['#ddbea9', 'Deve tüyü'], ['#556b2f', 'Haki'], ['#8b5a2b', 'Bakır'], ['#4e3b31', 'Ceviz']] },
    gray: { name: 'Gri tonlar', colors: () => ramp(11, (i) => [VP.hex(new paper.Color(i / 10)), '%' + (100 - i * 10) + ' siyah']) },
    skin: { name: 'Ten tonları', colors: () => [['#ffe0c4', 'Açık 1'], ['#f6cfa8', 'Açık 2'], ['#eab68f', 'Orta 1'], ['#d99e73', 'Orta 2'], ['#c68863', 'Buğday'], ['#a96e4b', 'Esmer 1'], ['#8d5a3b', 'Esmer 2'], ['#6e432a', 'Koyu 1'], ['#4b2c1b', 'Koyu 2']] },
    web: { name: 'Web güvenli (kısa)', colors: () => { const v = ['00', '66', 'cc', 'ff']; const o = []; v.forEach((r) => v.forEach((g) => v.forEach((b) => o.push(['#' + r + g + b, '#' + r + g + b])))); return o; } }
  };
  const customs = () => (VP.settings.palettes = VP.settings.palettes || []);
  ST.paletteColors = (id) => {
    id = id || VP.settings.palette || 'default';
    if (id === 'doc') return docColors().map((c) => [c, c]);
    if (id === 'styles') return list('colorStyles').map((c) => [c.hex, c.name]);
    if (ST.BUILTIN[id]) return ST.BUILTIN[id].colors();
    const c = customs().find((p) => p.id === id);
    return c ? c.colors : UI.PALETTE;
  };
  UI.curPalette = () => {
    const c = ST.paletteColors();
    return c && c.length ? c : UI.PALETTE;
  };
  const docColors = () => {
    const seen = [];
    const add = (c) => {
      if (!c || c.type === 'gradient' || c.alpha === 0) return;
      const h = VP.hex(c);
      if (h && !seen.includes(h)) seen.push(h);
    };
    pageItems().forEach((it) => {
      if (it.children && !(it instanceof paper.CompoundPath)) return;
      if (it instanceof paper.Raster) return;
      add(it.fillColor);
      add(it.strokeColor);
    });
    return seen;
  };
  ST.setPalette = (id) => {
    VP.settings.palette = id;
    VP.io.savePrefs();
    UI.renderPalette(true);
  };
  const gpl = (name, colors) => 'GIMP Palette\nName: ' + name + '\nColumns: 8\n#\n' + colors.map(([hex, n]) => {
    const c = new paper.Color(hex);
    return [c.red, c.green, c.blue].map((v) => String(Math.round(v * 255)).padStart(3, ' ')).join(' ') + '\t' + (n || hex);
  }).join('\n') + '\n';
  const parseGpl = (txt) => {
    const out = [];
    let name = 'İçe aktarılan palet';
    txt.split(/\r?\n/).forEach((ln) => {
      const nm = ln.match(/^Name:\s*(.+)/);
      if (nm) name = nm[1].trim();
      const m = ln.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*(.*)$/);
      if (m) {
        const hex = '#' + [m[1], m[2], m[3]].map((v) => Math.min(255, +v).toString(16).padStart(2, '0')).join('');
        out.push([hex, (m[4] || hex).trim()]);
      }
    });
    return { name, colors: out };
  };
  const importPalette = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.gpl,text/plain';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const p = parseGpl(await f.text());
      if (!p.colors.length) return VP.toast('Bu dosyada renk bulunamadı (.gpl bekleniyor)');
      const id = 'c' + Date.now();
      customs().push({ id, name: p.name, colors: p.colors });
      ST.setPalette(id);
      UI.renderDock(true);
      VP.toast('Palet içe aktarıldı: ' + p.name + ' (' + p.colors.length + ' renk)');
    });
    inp.click();
  };

  /* =============== symbols =============== */
  const symbols = () => list('symbols');
  ST.makeInstance = (sym) => {
    const g = new paper.Group({ insert: false, applyMatrix: false });
    const holder = new paper.Group({ insert: false });
    const item = holder.importJSON(sym.json);
    g.addChildren(item === holder ? holder.removeChildren() : [item]);
    g.data.symbolId = sym.id;
    g.data.label = 'Sembol: ' + sym.name;
    return g;
  };
  const refill = (g, sym) => {
    g.removeChildren();
    const holder = new paper.Group({ insert: false });
    const item = holder.importJSON(sym.json);
    g.addChildren(item === holder ? holder.removeChildren() : [item]);
    g.data.label = 'Sembol: ' + sym.name;
  };
  ST.syncSymbols = (root) => {
    const syms = symbols();
    allItems(root).forEach((it) => {
      const id = it.data && it.data.symbolId;
      if (!id) return;
      const s = syms.find((x) => x.id === id);
      if (!s) {
        delete it.data.symbolId;
        delete it.data.label;
        return;
      }
      if (it.data.symVer !== s.ver) {
        refill(it, s);
        it.data.symVer = s.ver;
      }
    });
  };
  const defFromItems = (items) => {
    const g = new paper.Group({ insert: false });
    VP.zSort(items).forEach((it) => g.addChild(it.clone({ insert: false })));
    const c = g.bounds.center;
    g.translate(c.multiply(-1));
    return { json: g.exportJSON({ asString: true }), center: c };
  };
  ST.toSymbol = async () => {
    const items = VP.sel.slice();
    if (!items.length) return VP.toast('Sembole dönüştürmek için nesne seçin');
    const name = await UI.prompt({ title: 'Sembole dönüştür', label: 'Sembol adı', value: 'Sembol ' + (symbols().length + 1), ok: 'Dönüştür' });
    if (!name) return;
    const d = defFromItems(items);
    const sym = { id: uid(), name, json: d.json, ver: 1 };
    symbols().push(sym);
    const inst = ST.makeInstance(sym);
    inst.data.symVer = 1;
    inst.translate(d.center);
    const top = VP.zSort(items).pop();
    inst.insertAbove(top);
    items.forEach((it) => it.remove());
    VP.setSelection([inst]);
    VP.commit();
    UI.openDock('symbols');
    VP.toast('Sembol oluşturuldu: ' + name);
  };
  ST.place = (sym, at) => {
    VP.ensureLayer();
    const inst = ST.makeInstance(sym);
    inst.data.symVer = sym.ver;
    const p = VP.page();
    inst.translate(at || Pt(p.w / 2, p.h / 2));
    VP.activeLayer.addChild(inst);
    VP.setSelection([inst]);
    VP.commit();
    return inst;
  };
  ST.updateFromSelection = (sym) => {
    const items = VP.sel.filter((it) => !(it.data && it.data.symbolId === sym.id));
    if (!items.length) return VP.toast('Sembolün yeni hâli olacak nesneleri seçin');
    const d = defFromItems(items);
    sym.json = d.json;
    sym.ver = (sym.ver || 1) + 1;
    const inst = ST.makeInstance(sym);
    inst.data.symVer = sym.ver;
    inst.translate(d.center);
    inst.insertAbove(VP.zSort(items).pop());
    items.forEach((it) => it.remove());
    ST.syncSymbols();
    VP.setSelection([inst]);
    VP.commit();
    VP.toast('Sembol güncellendi · Tüm kopyalar yenilendi');
  };
  ST.breakLink = () => {
    const ins = VP.sel.filter((it) => it.data && it.data.symbolId);
    if (!ins.length) return VP.toast('Bir sembol kopyası seçin');
    ins.forEach((g) => {
      delete g.data.symbolId;
      delete g.data.symVer;
      delete g.data.label;
    });
    VP.commit();
    VP.toast('Bağlantı koparıldı · Artık normal bir grup');
  };
  // a few ready-made symbols (drawn here)
  const LIB = [
    ['Yıldız', () => new paper.Path.Star({ center: [0, 0], points: 5, radius1: 20, radius2: 8.5, fillColor: '#f9b200' })],
    ['Kalp', () => { const p = new paper.Path({ segments: [[0, 18], [-20, -2], [-10, -16], [0, -7], [10, -16], [20, -2]], closed: true, fillColor: '#e30613', insert: false }); p.smooth({ type: 'catmull-rom' }); p.segments[0].handleIn = p.segments[0].handleOut = Pt(0, 0); return p; }],
    ['Onay', () => new paper.Path({ segments: [[-16, 0], [-5, 12], [17, -12]], strokeColor: '#3aaa35', strokeWidth: 6, strokeCap: 'round', strokeJoin: 'round', insert: false })],
    ['Çarpı', () => new paper.CompoundPath({ children: [new paper.Path.Line({ from: [-14, -14], to: [14, 14], insert: false }), new paper.Path.Line({ from: [14, -14], to: [-14, 14], insert: false })], strokeColor: '#e30613', strokeWidth: 6, strokeCap: 'round', insert: false })],
    ['Konum', () => { const c = new paper.Path.Circle({ center: [0, -6], radius: 14, insert: false }); const t = new paper.Path({ segments: [[-12, 0], [0, 20], [12, 0]], closed: true, insert: false }); const u = c.unite(t, { insert: false }); const h = new paper.Path.Circle({ center: [0, -6], radius: 5, insert: false }); const r = u.subtract(h, { insert: false }); r.fillColor = '#0069b4'; return r; }],
    ['Konuşma', () => { const b = new paper.Path.Rectangle({ rectangle: [-22, -16, 44, 28], radius: 7, insert: false }); const t = new paper.Path({ segments: [[-10, 10], [-14, 20], [0, 10]], closed: true, insert: false }); const u = b.unite(t, { insert: false }); u.fillColor = '#ffffff'; u.strokeColor = '#1d1d1b'; u.strokeWidth = 2; return u; }],
    ['Ev', () => new paper.Path({ segments: [[0, -20], [20, -2], [14, -2], [14, 18], [4, 18], [4, 6], [-4, 6], [-4, 18], [-14, 18], [-14, -2], [-20, -2]], closed: true, fillColor: '#2d2e83', insert: false })],
    ['Dişli', () => { const o = new paper.Path.Star({ center: [0, 0], points: 8, radius1: 20, radius2: 15, insert: false }); const h = new paper.Path.Circle({ center: [0, 0], radius: 6, insert: false }); const r = o.subtract(h, { insert: false }); r.fillColor = '#706f6f'; return r; }],
    ['Ok', () => new paper.Path({ segments: [[-20, -5], [4, -5], [4, -14], [20, 0], [4, 14], [4, 5], [-20, 5]], closed: true, fillColor: '#ef7d00', insert: false })],
    ['Bilgi', () => { const c = new paper.Path.Circle({ center: [0, 0], radius: 20, fillColor: '#00a0e3', insert: false }); const g = new paper.Group({ insert: false }); g.addChild(c); g.addChild(new paper.Path.Rectangle({ rectangle: [-3, -3, 6, 14], fillColor: '#ffffff', insert: false })); g.addChild(new paper.Path.Circle({ center: [0, -10], radius: 3.4, fillColor: '#ffffff', insert: false })); return g; }]
  ];
  const libJSON = (i) => {
    const it = LIB[i][1]();
    const g = new paper.Group({ insert: false });
    g.addChild(it);
    return g.exportJSON({ asString: true });
  };
  const thumb = (json) => {
    try {
      const holder = new paper.Group({ insert: false });
      holder.importJSON(json);
      const b = holder.bounds;
      if (!(b.width > 0 || b.height > 0)) return '';
      const svg = holder.exportSVG({ asString: true });
      const pad = Math.max(b.width, b.height) * 0.08;
      return '<svg viewBox="' + [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2].map((v) => v.toFixed(2)).join(' ') + '" width="44" height="44" style="display:block">' + svg + '</svg>';
    } catch (e) {
      return '';
    }
  };

  /* =============== dockers =============== */
  const row = (inner) => '<div class="row" style="flex-wrap:nowrap;gap:4px;align-items:center">' + inner + '</div>';
  const stylesPanel = () => {
    const styles = list('objStyles');
    const cs = list('colorStyles');
    const sel = VP.sel;
    let h = '<div class="sec"><div class="sec-h"><h3>Nesne ve metin stilleri</h3></div>';
    h += '<div class="grid-btns" style="grid-template-columns:repeat(3,1fr)"><button class="btn" data-act="zsNew:object">' + ic('plus', 'sm') + 'Nesne</button><button class="btn" data-act="zsNew:char">' + ic('plus', 'sm') + 'Karakter</button><button class="btn" data-act="zsNew:para">' + ic('plus', 'sm') + 'Paragraf</button></div>';
    if (!styles.length) h += '<p class="sec-note">Henüz stil yok · Bir nesne seçip yukarıdan stil oluşturun. Stili güncellediğinizde bağlı tüm nesneler değişir.</p>';
    Object.keys(ST.KINDS).forEach((k) => {
      const ss = styles.filter((s) => s.kind === k);
      if (!ss.length) return;
      h += '<div class="pop-head" style="margin-top:6px">' + ST.KINDS[k] + ' stilleri</div>';
      ss.forEach((s) => {
        const p = s.props;
        const sw = k === 'object' ? '<i style="display:inline-block;width:16px;height:16px;border-radius:3px;vertical-align:middle;background:' + esc(p.fill && p.fill.type !== 'none' ? p.fill.color : 'transparent') + ';border:2px solid ' + esc(p.stroke && p.stroke.on ? p.stroke.color : 'transparent') + '"></i> ' : '<span style="font-family:\'' + esc(p.font.family) + '\';font-weight:' + (p.font.bold ? 700 : 400) + ';font-style:' + (p.font.italic ? 'italic' : 'normal') + ';color:' + esc(p.color || 'inherit') + '">Aa</span> ';
        h += row('<button class="btn" style="flex:1;justify-content:flex-start" data-act="zsApply:' + s.id + '" title="Seçime uygula"' + (sel.length ? '' : ' disabled') + '>' + sw + esc(s.name) + '</button>' +
          '<button class="row-btn" data-act="zsUpdate:' + s.id + '" title="Stili seçimden güncelle" aria-label="Stili güncelle"' + (sel.length ? '' : ' disabled') + '>' + ic('redo', 'sm') + '</button>' +
          '<button class="row-btn" data-act="zsSelect:' + s.id + '" title="Bu stildeki nesneleri seç" aria-label="Nesneleri seç">' + ic('select', 'sm') + '</button>' +
          '<button class="row-btn" data-act="zsRename:' + s.id + '" title="Yeniden adlandır" aria-label="Yeniden adlandır">' + ic('text', 'sm') + '</button>' +
          '<button class="row-btn" data-act="zsDel:' + s.id + '" title="Sil" aria-label="Stili sil">' + ic('trash', 'sm') + '</button>');
      });
    });
    h += '</div><div class="sec"><div class="sec-h"><h3>Renk stilleri</h3><button class="btn" data-act="zsColorNew">' + ic('plus', 'sm') + 'Renk</button></div>';
    if (!cs.length) h += '<p class="sec-note">Renk stilleri adlandırılmış renklerdir · Rengi değiştirdiğinizde o rengi kullanan tüm dolgu ve anahatlar güncellenir.</p>';
    cs.forEach((c) => {
      h += row('<input type="color" data-pf="zsColor:' + c.id + '" value="' + esc(c.hex) + '" style="width:34px;height:30px;border:0;padding:0;background:transparent" aria-label="' + esc(c.name) + ' rengi">' +
        '<button class="btn" style="flex:1;justify-content:flex-start" data-act="zsColorFill:' + c.id + '"' + (sel.length ? '' : ' disabled') + ' title="Dolguya uygula">' + esc(c.name) + '</button>' +
        '<button class="row-btn" data-act="zsColorStroke:' + c.id + '" title="Anahata uygula" aria-label="Anahata uygula"' + (sel.length ? '' : ' disabled') + '>' + ic('pen', 'sm') + '</button>' +
        '<button class="row-btn" data-act="zsColorRename:' + c.id + '" title="Yeniden adlandır" aria-label="Yeniden adlandır">' + ic('text', 'sm') + '</button>' +
        '<button class="row-btn" data-act="zsColorDel:' + c.id + '" title="Sil" aria-label="Renk stilini sil">' + ic('trash', 'sm') + '</button>');
    });
    if (cs.length) h += '<div class="row"><button class="btn" data-act="zsColorsFromDoc">Belgedeki renklerden ekle</button><button class="btn" data-act="zsPalStyles">Palet çubuğunda göster</button></div>';
    h += '</div>';
    return h;
  };
  const palettesPanel = () => {
    const cur = VP.settings.palette || 'default';
    const all = Object.keys(ST.BUILTIN).map((k) => [k, ST.BUILTIN[k].name, false]).concat([['doc', 'Belge paleti (sayfadaki renkler)', false], ['styles', 'Renk stilleri', false]]).concat(customs().map((p) => [p.id, p.name, true]));
    let h = '<div class="sec"><div class="sec-h"><h3>Palet yöneticisi</h3></div><p class="sec-note">Sağdaki renk çubuğunda gösterilecek paleti seçin.</p>';
    all.forEach(([id, name, custom]) => {
      const cols = ST.paletteColors(id).slice(0, 14);
      h += '<div class="row" style="flex-wrap:nowrap;gap:4px"><button class="btn' + (id === cur ? ' on' : '') + '" style="flex:1;flex-direction:column;align-items:flex-start;gap:4px;height:auto;padding:6px 8px" data-act="zsPal:' + id + '" aria-pressed="' + (id === cur) + '"><span>' + esc(name) + '</span><span style="display:flex;gap:2px">' + cols.map(([c]) => '<i style="width:11px;height:11px;border-radius:2px;background:' + esc(c) + ';border:1px solid rgba(127,127,127,.35)"></i>').join('') + '</span></button>' +
        (custom ? '<button class="row-btn" data-act="zsPalAdd:' + id + '" title="Seçili nesnenin rengini ekle" aria-label="Renk ekle">' + ic('plus', 'sm') + '</button><button class="row-btn" data-act="zsPalRename:' + id + '" title="Yeniden adlandır" aria-label="Yeniden adlandır">' + ic('text', 'sm') + '</button><button class="row-btn" data-act="zsPalDel:' + id + '" title="Paleti sil" aria-label="Paleti sil">' + ic('trash', 'sm') + '</button>' : '') + '</div>';
    });
    h += '<div class="grid-btns" style="grid-template-columns:repeat(2,1fr)"><button class="btn" data-act="zsPalNew">' + ic('plus', 'sm') + 'Yeni palet</button><button class="btn" data-act="zsPalFromDoc">Belgeden palet</button><button class="btn" data-act="zsPalImport">İçe aktar (.gpl)</button><button class="btn" data-act="zsPalExport">Dışa aktar (.gpl)</button></div></div>';
    return h;
  };
  const symbolsPanel = () => {
    const syms = symbols();
    const counts = {};
    pageItems().forEach((it) => it.data && it.data.symbolId && (counts[it.data.symbolId] = (counts[it.data.symbolId] || 0) + 1));
    let h = '<div class="sec"><div class="sec-h"><h3>Belgedeki semboller</h3><button class="btn" data-act="zyNew">' + ic('plus', 'sm') + 'Seçimden</button></div>';
    if (!syms.length) h += '<p class="sec-note">Seçili nesneleri sembole dönüştürün; kopyaları yerleştirin. Sembolü güncellediğinizde tüm kopyalar değişir ve dosya küçük kalır.</p>';
    syms.forEach((s) => {
      h += '<div class="row" style="flex-wrap:nowrap;gap:6px;align-items:center"><span style="width:44px;height:44px;border-radius:6px;background:#fff;flex:none">' + thumb(s.json) + '</span>' +
        '<span style="flex:1;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.name) + '</b><small style="opacity:.65">' + (counts[s.id] || 0) + ' kopya bu sayfada</small></span>' +
        '<button class="row-btn" data-act="zyPlace:' + s.id + '" title="Yerleştir" aria-label="Yerleştir">' + ic('plus', 'sm') + '</button>' +
        '<button class="row-btn" data-act="zyUpdate:' + s.id + '" title="Seçimden güncelle" aria-label="Seçimden güncelle">' + ic('redo', 'sm') + '</button>' +
        '<button class="row-btn" data-act="zyRename:' + s.id + '" title="Yeniden adlandır" aria-label="Yeniden adlandır">' + ic('text', 'sm') + '</button>' +
        '<button class="row-btn" data-act="zyDel:' + s.id + '" title="Sil" aria-label="Sembolü sil">' + ic('trash', 'sm') + '</button></div>';
    });
    if (VP.sel.some((it) => it.data && it.data.symbolId)) h += '<div class="row"><button class="btn" data-act="zyBreak">Bağlantıyı kopar</button></div>';
    h += '</div><div class="sec"><div class="sec-h"><h3>Sembol kütüphanesi</h3></div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">' +
      LIB.map(([n], i) => '<button class="btn" style="height:auto;padding:4px;flex-direction:column;gap:2px" data-act="zyLib:' + i + '" title="' + esc(n) + '"><span style="width:40px;height:40px;background:#fff;border-radius:6px;display:block">' + (ST._libThumbs[i] || '') + '</span><small>' + esc(n) + '</small></button>').join('') + '</div><p class="sec-note">Kütüphaneden eklenen şekil belgeye sembol olarak girer.</p></div>';
    return h;
  };
  ST._libThumbs = [];
  setTimeout(() => {
    try {
      ST._libThumbs = LIB.map((_, i) => thumb(libJSON(i)));
    } catch (e) { /* ignore */ }
  }, 0);
  UI.panels = UI.panels || {};
  UI.panels.styles = stylesPanel;
  UI.panels.palettes = palettesPanel;
  UI.panels.symbols = symbolsPanel;
  [['styles', 'Stiller'], ['palettes', 'Paletler'], ['symbols', 'Semboller']].forEach((d) => !UI.DOCKERS.some(([k]) => k === d[0]) && UI.DOCKERS.push(d));

  /* =============== handlers =============== */
  const find = (arr, id) => arr.find((x) => x.id === id);
  ST.act = async (id, el) => {
    const i = id.indexOf(':');
    const k = i < 0 ? id : id.slice(0, i);
    const arg = i < 0 ? '' : id.slice(i + 1);
    const styles = list('objStyles');
    const cs = list('colorStyles');
    const done = () => {
      VP.commit();
      UI.renderDock(true);
    };
    switch (k) {
      case 'zsNew': await ST.fromSelection(arg); return true;
      case 'zsApply': {
        const s = find(styles, arg);
        if (!s) return true;
        const n = ST.apply(VP.sel, s);
        if (!n) return VP.toast(ST.KINDS[s.kind] + ' stili yalnızca metinlere uygulanır'), true;
        done();
        return true;
      }
      case 'zsUpdate': {
        const s = find(styles, arg);
        const it = VP.sel[0];
        if (!s || !it) return true;
        if (s.kind !== 'object' && !isText(it)) return VP.toast('Bir metin seçin'), true;
        s.props = ST.capture(it, s.kind);
        const n = ST.sync(s.id);
        done();
        VP.toast('Stil güncellendi · ' + n + ' nesne yenilendi');
        return true;
      }
      case 'zsSelect': {
        const its = VP.userLayers().reduce((a, L) => a.concat(L.children), []).filter((it) => refOf(it) === arg);
        VP.setSelection(its);
        VP.toast(its.length + ' nesne seçildi');
        return true;
      }
      case 'zsRename':
      case 'zsColorRename': {
        const s = find(k === 'zsRename' ? styles : cs, arg);
        if (!s) return true;
        const n = await UI.prompt({ title: 'Yeniden adlandır', label: 'Ad', value: s.name });
        if (n) {
          s.name = n;
          done();
        }
        return true;
      }
      case 'zsDel': {
        const s = find(styles, arg);
        if (!s) return true;
        styles.splice(styles.indexOf(s), 1);
        ST.sync();
        done();
        VP.toast('Stil silindi · Nesneler görünümlerini korur');
        return true;
      }
      case 'zsColorNew': {
        const it = VP.sel[0];
        const f = it ? VP.getFill(it) : null;
        const hex = f && f.type !== 'none' ? f.color : VP.defaults.fill || '#1461b2';
        const n = await UI.prompt({ title: 'Yeni renk stili', label: 'Renk adı', value: 'Renk ' + (cs.length + 1) });
        if (!n) return true;
        const c = { id: uid(), name: n, hex };
        cs.push(c);
        if (it) ST.applyColorStyle(VP.sel, c, 'fill');
        done();
        return true;
      }
      case 'zsColorFill':
      case 'zsColorStroke': {
        const c = find(cs, arg);
        if (!c || !VP.sel.length) return true;
        ST.applyColorStyle(VP.sel, c, k === 'zsColorFill' ? 'fill' : 'stroke');
        done();
        return true;
      }
      case 'zsColorDel': {
        const c = find(cs, arg);
        if (!c) return true;
        cs.splice(cs.indexOf(c), 1);
        ST.syncColors();
        done();
        return true;
      }
      case 'zsColorsFromDoc': {
        let n = 0;
        docColors().forEach((hex) => {
          if (cs.some((c) => c.hex === hex)) return;
          cs.push({ id: uid(), name: hex, hex });
          n++;
        });
        done();
        VP.toast(n + ' renk stili eklendi');
        return true;
      }
      case 'zsPalStyles': ST.setPalette('styles'); UI.renderDock(true); return true;
      case 'zsPal': ST.setPalette(arg); UI.renderDock(true); return true;
      case 'zsPalNew':
      case 'zsPalFromDoc': {
        const n = await UI.prompt({ title: 'Yeni palet', label: 'Palet adı', value: k === 'zsPalFromDoc' ? (VP.doc.name || 'Belge') + ' renkleri' : 'Paletim ' + (customs().length + 1) });
        if (!n) return true;
        const id = 'c' + Date.now();
        customs().push({ id, name: n, colors: k === 'zsPalFromDoc' ? docColors().map((c) => [c, c]) : [] });
        ST.setPalette(id);
        UI.renderDock(true);
        return true;
      }
      case 'zsPalAdd': {
        const p = customs().find((x) => x.id === arg);
        const it = VP.sel[0];
        const f = it ? VP.getFill(it) : null;
        const hex = f && f.type !== 'none' ? f.color : VP.defaults.fill;
        if (!p || !hex) return VP.toast('Rengi alınacak nesneyi seçin'), true;
        if (!p.colors.some((c) => c[0] === hex)) p.colors.push([hex, hex]);
        VP.io.savePrefs();
        UI.renderPalette(true);
        UI.renderDock(true);
        return true;
      }
      case 'zsPalRename': {
        const p = customs().find((x) => x.id === arg);
        const n = p && (await UI.prompt({ title: 'Paleti yeniden adlandır', label: 'Ad', value: p.name }));
        if (n) {
          p.name = n;
          VP.io.savePrefs();
          UI.renderDock(true);
        }
        return true;
      }
      case 'zsPalDel': {
        const arr = customs();
        const p = arr.find((x) => x.id === arg);
        if (!p) return true;
        if (!(await UI.confirm({ title: 'Paleti sil', text: '“' + p.name + '” silinsin mi?', ok: 'Sil', danger: true }))) return true;
        arr.splice(arr.indexOf(p), 1);
        if (VP.settings.palette === arg) VP.settings.palette = 'default';
        VP.io.savePrefs();
        UI.renderPalette(true);
        UI.renderDock(true);
        return true;
      }
      case 'zsPalImport': importPalette(); return true;
      case 'zsPalExport': {
        const id = VP.settings.palette || 'default';
        const name = ST.BUILTIN[id] ? ST.BUILTIN[id].name : (customs().find((p) => p.id === id) || {}).name || 'VektörPad paleti';
        VP.io.saveFile(String(name).replace(/[\\/:*?"<>|]+/g, '-') + '.gpl', gpl(name, ST.paletteColors(id)));
        return true;
      }
      case 'zyNew': await ST.toSymbol(); return true;
      case 'zyPlace': {
        const s = find(symbols(), arg);
        if (s) ST.place(s);
        return true;
      }
      case 'zyUpdate': {
        const s = find(symbols(), arg);
        if (s) ST.updateFromSelection(s);
        UI.renderDock(true);
        return true;
      }
      case 'zyRename': {
        const s = find(symbols(), arg);
        const n = s && (await UI.prompt({ title: 'Sembolü yeniden adlandır', label: 'Ad', value: s.name }));
        if (n) {
          s.name = n;
          s.ver = (s.ver || 1) + 1;
          ST.syncSymbols();
          done();
        }
        return true;
      }
      case 'zyDel': {
        const s = find(symbols(), arg);
        if (!s) return true;
        const arr = symbols();
        arr.splice(arr.indexOf(s), 1);
        ST.syncSymbols();
        done();
        VP.toast('Sembol silindi · Kopyaları normal grup oldu');
        return true;
      }
      case 'zyBreak': ST.breakLink(); UI.renderDock(true); return true;
      case 'zyLib': {
        const li = +arg;
        const name = LIB[li][0];
        let s = symbols().find((x) => x.lib === name);
        if (!s) {
          s = { id: uid(), name, json: libJSON(li), ver: 1, lib: name };
          symbols().push(s);
        }
        ST.place(s);
        UI.renderDock(true);
        return true;
      }
      default:
        return false;
    }
  };
  ST.propField = (name, raw) => {
    if (name.startsWith('zsColor:')) {
      const c = find(list('colorStyles'), name.slice(8));
      const hex = UI.normHex(raw);
      if (!c || !hex) return true;
      c.hex = hex;
      ST.syncColors();
      VP.commit();
      return true;
    }
    return false;
  };
  const pf0 = TX.propField;
  TX.propField = (n, r, el) => (/^z[sy]/.test(n) ? ST.propField(n, r, el) : pf0(n, r, el));
  const act0 = TX.act;
  TX.act = (id, el) => (/^z[sy]/.test(id) ? (ST.act(id, el), true) : act0(id, el));

  // keep linked styles, colours and symbols current on every page that is opened, and in exports
  VP.on('page', () => {
    try {
      ST.syncSymbols();
      ST.syncColors();
      ST.sync();
    } catch (e) {
      console.error(e);
    }
  });
  VP.io.exportHooks = VP.io.exportHooks || [];
  VP.io.exportHooks.unshift((proj) => {
    try {
      proj.layers.forEach((L) => {
        ST.syncSymbols(L);
        ST.syncColors(L);
      });
    } catch (e) {
      console.error(e);
    }
  });

  Object.assign(A, {
    dockStyles: { label: 'Stiller', icon: 'layers', run: () => UI.openDock('styles') },
    dockPalettes: { label: 'Palet yöneticisi', icon: 'fillTool', run: () => UI.openDock('palettes') },
    dockSymbols: { label: 'Semboller', icon: 'star', run: () => UI.openDock('symbols') },
    toSymbol: { label: 'Sembole dönüştür…', run: () => ST.toSymbol(), enabled: () => VP.sel.length > 0 },
    breakSymbol: { label: 'Sembol bağlantısını kopar', run: () => ST.breakLink(), enabled: () => VP.sel.some((it) => it.data && it.data.symbolId) },
    styleFromSel: { label: 'Seçimden stil oluştur…', run: () => ST.fromSelection(VP.sel[0] && isText(VP.sel[0]) ? 'char' : 'object'), enabled: () => VP.sel.length > 0 },
    colorStyleNew: { label: 'Yeni renk stili…', run: () => ST.act('zsColorNew') }
  });
  const M = UI.MENUS;
  if (M.object && !M.object.includes('toSymbol')) M.object.push('|', 'h:Semboller ve stiller', 'toSymbol', 'breakSymbol', 'styleFromSel', 'colorStyleNew');
  if (M.window && !M.window.includes('dockStyles')) M.window.push('|', 'dockStyles', 'dockPalettes', 'dockSymbols');
  // palette choice is restored with the other preferences
  setTimeout(() => UI.renderPalette(true), 0);
})();
