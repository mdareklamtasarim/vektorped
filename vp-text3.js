/* VektörPad, more desktop drawing suite features (written for this app):
   - Typography (OpenType): small caps, kerning, ligatures, letter spacing and the weight axis of variable
     fonts, for artistic text, paragraph text and text on a path (screen and SVG export).
   - Straighten text and align text to a common baseline.
   - Show non-printing characters (spaces, paragraph ends).
   - Overprint fill / outline, with an overprint simulation view.
   - Object data docker: named fields on objects (name, price…), a table of all of them, CSV export.
   - Links and bookmarks: web links and links to bookmarks on objects; active in exported PDF and SVG.
   - Edit anchor tool: extra connection points on objects for connector lines. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const mm = H.mm;
  const A = VP.actions;
  const T = VP.tools;
  const S = VP.settings;
  const IO = VP.io;
  const TX = VP.tx;
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const T3 = (VP.text3 = {});
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => x !== '|' && !x.startsWith('h:') && !x.startsWith('sub:') && M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };
  const topItems = () => {
    const out = [];
    VP.userLayers().forEach((L) => L.children.forEach((c) => out.push(c)));
    return out;
  };
  const uidOf = (it) => it.data.uid || (it.data.uid = VP.uid());

  /* ======================================================================
     TYPOGRAPHY
     ====================================================================== */
  // variable fonts and the weights they can take (any value between)
  T3.VAR = { Inter: [100, 900], 'Roboto Flex': [100, 1000], 'Bricolage Grotesque': [200, 800], Oswald: [200, 700] };
  ['Inter', 'Roboto Flex'].forEach((f) => !VP.FONTS.includes(f) && VP.FONTS.splice(2, 0, f));
  const otOf = (t) => {
    if (t.data && t.data.ot) return t.data.ot;
    for (let p = t.parent; p && !(p instanceof paper.Layer); p = p.parent) {
      const fx = FX.of(p);
      if (fx && fx.ot) return fx.ot;
    }
    return null;
  };
  T3.otOf = otOf;
  {
    const PT = paper.PointText.prototype;
    const orig = PT._draw;
    PT._draw = function (ctx, param, vm) {
      const ot = otOf(this);
      if (!ot) return orig.call(this, ctx, param, vm);
      const save = {};
      const set = (k, v) => {
        if (k in ctx) {
          save[k] = ctx[k];
          try {
            ctx[k] = v;
          } catch (e) { /* not supported by this browser */ }
        }
      };
      if (ot.caps && ot.caps !== 'normal') set('fontVariantCaps', ot.caps);
      if (ot.kern === false) set('fontKerning', 'none');
      if (ot.liga === false) set('textRendering', 'optimizeSpeed');
      if (ot.track) set('letterSpacing', ((ot.track / 1000) * (this.fontSize || 12)).toFixed(3) + 'px');
      try {
        return orig.call(this, ctx, param, vm);
      } finally {
        Object.keys(save).forEach((k) => {
          try {
            ctx[k] = save[k];
          } catch (e) { /* ignore */ }
        });
      }
    };
  }
  const textTargets = () => VP.sel.filter((it) => it instanceof paper.PointText || (FX.of(it) && ['paragraph', 'textpath', 'table'].includes(FX.of(it).type)));
  const weightOf = (t) => {
    const w = String(t.fontWeight || 'normal').replace('italic', '').trim();
    if (w === 'bold') return 700;
    if (w === 'normal' || !w) return 400;
    return +w || 400;
  };
  const familyOf = (it) => (it instanceof paper.PointText ? it.fontFamily : FX.of(it).font ? FX.of(it).font.family : 'Fira Sans');
  T3.apply = (ot, weight) => {
    const ts = textTargets();
    ts.forEach((it) => {
      if (it instanceof paper.PointText) {
        it.data.ot = Object.assign({}, ot);
        if (weight) it.fontWeight = (VP.isItalic(it) ? 'italic ' : '') + weight;
        it.content = it.content; // re-measure
      } else {
        const fx = FX.of(it);
        fx.ot = Object.assign({}, ot);
        if (weight && fx.font) {
          fx.font.weight = weight;
          fx.font.bold = weight >= 600;
        }
        FX.rebuild(it);
      }
    });
    VP.commit();
  };
  // paragraph/path text: the chosen weight goes to every generated line
  const bp0 = TX.buildPara;
  TX.buildPara = (g) => {
    bp0(g);
    const fx = g.data.effect;
    if (fx && fx.font && fx.font.weight) g.children.forEach((c) => c instanceof paper.PointText && (c.fontWeight = (fx.font.italic ? 'italic ' : '') + fx.font.weight));
  };
  T3.dialog = () => {
    const ts = textTargets();
    if (!ts.length) return VP.toast('Önce bir metin seçin');
    const first = ts[0];
    const cur = Object.assign({ caps: 'normal', kern: true, liga: true, track: 0 }, (first instanceof paper.PointText ? first.data.ot : FX.of(first).ot) || {});
    const fam = familyOf(first);
    const range = T3.VAR[fam];
    const w0 = first instanceof paper.PointText ? weightOf(first) : (FX.of(first).font && FX.of(first).font.weight) || (FX.of(first).font && FX.of(first).font.bold ? 700 : 400);
    let weight = range ? clamp(w0, range[0], range[1]) : null;
    const sample = String(first instanceof paper.PointText ? first.content : FX.of(first).text || 'Örnek Metin').slice(0, 40) || 'Örnek Metin';
    const seg = (k, items, v) => '<span class="seg" data-seg="' + k + '">' + items.map(([x, l]) => '<button data-v="' + x + '" class="' + (String(x) === String(v) ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
    UI.modal('<h2>Yazı ayarları (OpenType)</h2>' +
      '<div data-prev style="padding:12px;border:1px solid var(--line);background:#fff;color:#111;font-size:30px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>' +
      '<div class="row"><span class="opt-label">Büyük harf</span>' + seg('caps', [['normal', 'Normal'], ['small-caps', 'Küçük büyük harf'], ['all-small-caps', 'Tümü küçük büyük']], cur.caps) + '</div>' +
      '<div class="row"><span class="opt-label">Karakter aralığı (kerning)</span>' + seg('kern', [['1', 'Açık'], ['0', 'Kapalı']], cur.kern === false ? '0' : '1') + '</div>' +
      '<div class="row"><span class="opt-label">Bitişik harfler (fi, fl)</span>' + seg('liga', [['1', 'Açık'], ['0', 'Kapalı']], cur.liga === false ? '0' : '1') + '</div>' +
      '<label class="range"><span class="pb-label">Harf aralığı</span><input type="range" data-k="track" min="-100" max="500" step="5" value="' + (cur.track || 0) + '"><output>' + (cur.track || 0) + '</output></label>' +
      (range ? '<label class="range"><span class="pb-label">Ağırlık (değişken yazı tipi)</span><input type="range" data-k="wght" min="' + range[0] + '" max="' + range[1] + '" step="10" value="' + weight + '"><output>' + weight + '</output></label>' : '<p class="sec-note">Ağırlık ekseni yalnızca değişken yazı tiplerinde: ' + Object.keys(T3.VAR).join(', ') + '.</p>') +
      '<p class="sec-note">Ekranda ve SVG’de uygulanır; PDF’te metin Fira Sans ile yazılır, harf aralığı ve küçük büyük harf PDF’e taşınmaz (gerekirse Eğriye dönüştür).</p>' +
      '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Uygula</button></div>', (root, close) => {
      const prev = root.querySelector('[data-prev]');
      const show = () => {
        prev.textContent = sample;
        prev.style.fontFamily = '"' + fam + '"';
        prev.style.fontVariantCaps = cur.caps;
        prev.style.fontKerning = cur.kern === false ? 'none' : 'normal';
        prev.style.fontVariantLigatures = cur.liga === false ? 'none' : 'normal';
        prev.style.letterSpacing = (cur.track || 0) / 1000 + 'em';
        prev.style.fontWeight = weight || (VP.isBold && first instanceof paper.PointText && VP.isBold(first) ? 700 : 400);
      };
      show();
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-seg] [data-v]');
        if (b) {
          const k = b.parentElement.dataset.seg;
          b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          if (k === 'caps') cur.caps = b.dataset.v;
          else cur[k] = b.dataset.v === '1';
          return show();
        }
        const x = e.target.closest('[data-x]');
        if (!x) return;
        close();
        if (x.dataset.x === 'yes') {
          T3.apply(cur, weight);
          VP.toast('Yazı ayarları uygulandı');
        }
      });
      root.addEventListener('input', (e) => {
        const el = e.target.closest('[data-k]');
        if (!el) return;
        if (el.dataset.k === 'track') cur.track = +el.value;
        else weight = +el.value;
        el.nextElementSibling.textContent = el.value;
        show();
      });
    });
  };

  /* ---------- straighten, align to baseline ---------- */
  T3.straighten = () => {
    const ts = VP.sel.filter((it) => it instanceof paper.PointText);
    const paths = VP.sel.filter((it) => FX.of(it) && FX.of(it).type === 'textpath');
    if (!ts.length && !paths.length) return VP.toast('Bir metin seçin');
    ts.forEach((t) => {
      const m = t.matrix;
      const sc = m.scaling;
      const k = (Math.abs(sc.x) + Math.abs(sc.y)) / 2 || 1;
      const p = t.point.clone();
      t.matrix = new paper.Matrix(k, 0, 0, k, p.x, p.y);
    });
    if (paths.length && A.txUnpath) {
      VP.setSelection(paths);
      A.txUnpath.run();
    } else VP.commit();
    VP.toast('Metin düzleştirildi');
  };
  T3.alignBaseline = () => {
    const ts = VP.sel.filter((it) => it instanceof paper.PointText);
    if (ts.length < 2) return VP.toast('Taban çizgisini eşitlemek için en az iki metin seçin · İlk seçilen esas alınır');
    const y = ts[0].point.y;
    ts.slice(1).forEach((t) => t.translate(Pt(0, y - t.point.y)));
    VP.commit();
    VP.toast(ts.length + ' metin aynı taban çizgisine hizalandı');
  };

  /* ---------- non-printing characters ---------- */
  let mctx = null;
  const measure = (t, s) => {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = t.getStyle().getFontStyle();
    return mctx.measureText(s).width;
  };
  VP.overlayHooks = VP.overlayHooks || [];
  VP.overlayHooks.push((L) => {
    if (!S.showNP) return;
    const z = zoom();
    const col = new paper.Color('#2f7fe0');
    const marks = [];
    const visit = (t, last) => {
      if (!t.visible || !t.content) return;
      const lines = String(t.content).split('\n');
      const lead = t.leading || t.fontSize * 1.2;
      const just = t.justification;
      lines.forEach((ln, i) => {
        const w = measure(t, ln);
        const x0 = just === 'center' ? -w / 2 : just === 'right' ? -w : 0;
        const y = i * lead - t.fontSize * 0.3;
        for (let k = 0; k < ln.length; k++) {
          if (ln[k] !== ' ') continue;
          const a = measure(t, ln.slice(0, k));
          const b = measure(t, ln.slice(0, k + 1));
          marks.push({ t, p: Pt(x0 + (a + b) / 2, y), dot: true });
        }
        if (last || i < lines.length - 1 || lines.length > 1) marks.push({ t, p: Pt(x0 + w + t.fontSize * 0.12, i * lead), end: true });
      });
    };
    VP.userLayers().forEach((Ly) => Ly.getItems({ class: paper.PointText }).forEach((t) => {
      if (t.data && (t.data.pageField || t.data.hitOnly)) return;
      const par = t.parent && FX.of(t.parent);
      if (par && par.type === 'paragraph') {
        const kids = t.parent.children.filter((c) => c instanceof paper.PointText);
        visit(t, kids[kids.length - 1] === t);
      } else visit(t, !par);
    }));
    if (marks.length > 4000) return;
    marks.forEach((m) => {
      const g = m.t.globalToLocal ? m.t.localToGlobal(m.p) : m.p;
      const s = Math.max(1.2 / z, m.t.fontSize * 0.06);
      if (m.dot) L.addChild(new paper.Path.Circle({ center: g, radius: s, fillColor: col, insert: false }));
      else L.addChild(new paper.PointText({ point: g, content: '¶', fontSize: m.t.fontSize * 0.8, fillColor: col, fontFamily: 'Fira Sans', insert: false }));
    });
  });

  /* ======================================================================
     OVERPRINT
     ====================================================================== */
  [paper.Path, paper.CompoundPath, paper.PointText].forEach((K) => {
    const orig = K.prototype._draw;
    K.prototype._draw = function (ctx, param, vm, sm) {
      const op = S.simOP && !param.clip && this.data && this.data.overprint;
      if (!op || !(op.fill || op.stroke)) return orig.call(this, ctx, param, vm, sm);
      const g = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'multiply';
      try {
        return orig.call(this, ctx, param, vm, sm);
      } finally {
        ctx.globalCompositeOperation = g;
      }
    };
  });
  const leaves = (items) => {
    const out = [];
    const walk = (it) => {
      if (it instanceof paper.Path || it instanceof paper.CompoundPath || it instanceof paper.PointText) out.push(it);
      else if (it.children) it.children.forEach(walk);
    };
    items.forEach(walk);
    return out;
  };
  T3.setOverprint = (k) => {
    const ls = leaves(VP.sel);
    if (!ls.length) return VP.toast('Önce nesne seçin');
    const on = !ls.every((it) => it.data.overprint && it.data.overprint[k]);
    ls.forEach((it) => {
      const o = Object.assign({ fill: false, stroke: false }, it.data.overprint || {});
      o[k] = on;
      if (o.fill || o.stroke) it.data.overprint = o;
      else delete it.data.overprint;
    });
    VP.commit();
    VP.toast((k === 'fill' ? 'Dolgu' : 'Anahat') + ' bindirme ' + (on ? 'açık' : 'kapalı') + (on && !S.simOP ? ' · Görünüm › Bindirmeyi simüle et ile görün' : ''));
  };
  const opState = (k) => {
    const ls = leaves(VP.sel);
    return ls.length > 0 && ls.every((it) => it.data.overprint && it.data.overprint[k]);
  };

  /* ======================================================================
     OBJECT DATA
     ====================================================================== */
  const fields = () => {
    VP.doc.ext = VP.doc.ext || {};
    if (!VP.doc.ext.dataFields) VP.doc.ext.dataFields = ['Ad', 'Açıklama', 'Fiyat', 'Adet'];
    return VP.doc.ext.dataFields;
  };
  const odPanel = () => {
    const fs = fields();
    const it = VP.sel.length === 1 ? VP.sel[0] : null;
    let h = '<div class="sec"><div class="sec-h"><h3>Nesne verileri</h3></div>';
    if (!it) h += '<p class="sec-note">' + (VP.sel.length ? 'Verileri görmek için tek nesne seçin.' : 'Bir nesne seçin; ona ad, açıklama, fiyat gibi bilgiler yazın. Bütün nesnelerin verileri bir tabloda toplanır.') + '</p>';
    else {
      const d = it.data.odata || {};
      fs.forEach((f, i) => {
        h += '<label class="field" style="width:100%"><span style="min-width:72px">' + esc(f) + '</span><input data-pf="odF:' + i + '" value="' + esc(d[f] || '') + '" style="flex:1;width:auto;font-family:var(--font-ui)" autocomplete="off"></label>';
      });
    }
    h += '<div class="row"><button class="btn" data-act="odAddF">' + ic('plus', 'sm') + 'Alan</button><button class="btn" data-act="odDelF"' + (fs.length ? '' : ' disabled') + '>Alan sil…</button></div>' +
      '<div class="row"><button class="btn primary" data-act="odTable">Tablo görünümü</button><button class="btn" data-act="odCsv">CSV olarak kaydet</button></div></div>';
    return h;
  };
  UI.panels = UI.panels || {};
  UI.panels.odata = odPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'odata')) UI.DOCKERS.push(['odata', 'Nesne verileri']);
  // every object with data, on every page
  const allData = () => {
    VP.storePage();
    const rows = [];
    VP.doc.pages.forEach((pg, pi) => {
      (pg.layers || []).forEach((json) => {
        if (!json.includes('"odata"')) return;
        const Ly = new paper.Layer({ insert: false });
        Ly.importJSON(json);
        Ly.getItems({ match: (x) => x.data && x.data.odata }).forEach((x) => rows.push({ page: pi + 1, kind: VP.describe ? VP.describe(x) : x.className, d: x.data.odata, uid: x.data.uid }));
      });
    });
    return rows;
  };
  const toCSV = (rows) => {
    const fs = fields();
    const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    return '﻿' + ['Sayfa', 'Nesne'].concat(fs).map(q).join(';') + '\n' + rows.map((r) => [r.page, r.kind].concat(fs.map((f) => r.d[f])).map(q).join(';')).join('\n');
  };
  T3.odTable = () => {
    const rows = allData();
    const fs = fields();
    const num = (v) => {
      const n = VP.parseNum(v);
      return isFinite(n) ? n : null;
    };
    const tot = fs.map((f) => {
      const vals = rows.map((r) => num(r.d[f])).filter((v) => v != null);
      return vals.length && vals.length === rows.filter((r) => String(r.d[f] || '').trim()).length ? vals.reduce((a, b) => a + b, 0) : null;
    });
    const cell = 'padding:4px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap';
    UI.modal('<h2>Nesne verileri</h2>' + (rows.length ? '<div style="max-height:55vh;overflow:auto;border:1px solid var(--line)"><table style="border-collapse:collapse;font-size:13px;width:100%"><thead><tr><th style="' + cell + '">Sayfa</th><th style="' + cell + '">Nesne</th>' + fs.map((f) => '<th style="' + cell + '">' + esc(f) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((r) => '<tr><td style="' + cell + '">' + r.page + '</td><td style="' + cell + '">' + esc(r.kind) + '</td>' + fs.map((f) => '<td style="' + cell + '">' + esc(r.d[f] || '') + '</td>').join('') + '</tr>').join('') +
      '</tbody><tfoot><tr><th style="' + cell + '" colspan="2">Toplam</th>' + tot.map((t) => '<th style="' + cell + '">' + (t == null ? '' : esc(VP.num(t, 2))) + '</th>').join('') + '</tr></tfoot></table></div>' : '<p>Henüz verisi olan nesne yok.</p>') +
      '<div class="actions"><button class="btn" data-x="csv"' + (rows.length ? '' : ' disabled') + '>CSV olarak kaydet</button><button class="btn primary" data-x="no">Kapat</button></div>', (root, close) => {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        close();
        if (b.dataset.x === 'csv') IO.saveFile(IO.safeName() + '-nesne-verileri.csv', toCSV(rows));
      });
    });
  };

  /* ======================================================================
     LINKS AND BOOKMARKS
     ====================================================================== */
  const bookmarks = () => {
    VP.storePage();
    const out = [];
    VP.doc.pages.forEach((pg, pi) => (pg.layers || []).forEach((json) => {
      for (const m of json.matchAll(/"bookmark":"((?:[^"\\]|\\.)*)"/g)) out.push({ name: JSON.parse('"' + m[1] + '"'), page: pi });
    }));
    return out;
  };
  const lkPanel = () => {
    const it = VP.sel.length === 1 ? VP.sel[0] : null;
    let h = '<div class="sec"><div class="sec-h"><h3>Bağlantı</h3></div>';
    if (!it) h += '<p class="sec-note">Bir nesne seçin: ona bir web bağlantısı veya belgedeki bir yer imine bağlantı verin. Dışa aktarılan PDF ve SVG’de tıklanabilir olur.</p>';
    else {
      const bms = bookmarks().filter((b) => b.name !== it.data.bookmark);
      h += '<label class="field" style="width:100%"><span>Web</span><input data-pf="lkUrl" value="' + esc(it.data.link && it.data.link.url ? it.data.link.url : '') + '" placeholder="https://" style="flex:1;width:auto;font-family:var(--font-ui)" autocomplete="off" inputmode="url"></label>' +
        '<label class="field" style="width:100%"><span>Yer imine</span><select data-pf="lkTo" style="flex:1;max-width:none"><option value="">—</option>' + bms.map((b) => '<option value="' + esc(b.name) + '"' + (it.data.link && it.data.link.bm === b.name ? ' selected' : '') + '>' + esc(b.name) + ' (s.' + (b.page + 1) + ')</option>').join('') + '</select></label>' +
        '</div><div class="sec"><div class="sec-h"><h3>Yer imi</h3></div>' +
        '<label class="field" style="width:100%"><span>Ad</span><input data-pf="lkBm" value="' + esc(it.data.bookmark || '') + '" placeholder="ör. İçindekiler" style="flex:1;width:auto;font-family:var(--font-ui)" autocomplete="off"></label>' +
        '<p class="sec-note">Yer imleri PDF’in yer imi (anahat) listesinde de görünür.</p>';
    }
    const all = bookmarks();
    h += '</div><div class="sec"><div class="sec-h"><h3>Belgedeki yer imleri</h3></div>' + (all.length ? '<div class="list">' + all.map((b) => '<button class="obj-row" style="width:100%;border:0;border-bottom:1px solid var(--line);text-align:left;padding-left:10px" data-act="lkGo:' + esc(b.page) + '"><span class="row-name">' + esc(b.name) + '</span><small style="color:var(--muted)">s.' + (b.page + 1) + '</small></button>').join('') + '</div>' : '<p class="sec-note">Yok</p>') + '</div>';
    return h;
  };
  UI.panels.links = lkPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'links')) UI.DOCKERS.push(['links', 'Bağlantılar']);
  // export: objects with links get ids in the temporary project; after the SVG is made they are wrapped
  // in <a> (SVG) or turned into PDF link areas
  const linkQueue = [];
  let pendingSVG = null;
  IO.exportHooks = IO.exportHooks || [];
  IO.exportHooks.push((proj, index, opts) => {
    const entry = { box: null, links: [], bms: [] };
    let k = 0;
    proj.getItems({ match: (it) => it.data && (it.data.link || it.data.bookmark) }).forEach((it) => {
      const b = it.bounds;
      if (it.data.link && (it.data.link.url || it.data.link.bm)) {
        const id = 'vplk' + k++;
        if (!it.name) it.name = id;
        entry.links.push({ id: it.name, r: [b.x, b.y, b.width, b.height], url: it.data.link.url, bm: it.data.link.bm });
      }
      if (it.data.bookmark) entry.bms.push({ name: it.data.bookmark, y: b.top });
    });
    // typography settings travel to the SVG as CSS on the text elements
    entry.ot = [];
    proj.getItems({ class: paper.PointText }).forEach((t) => {
      const ot = otOf(t);
      if (!ot) return;
      if (!t.name) t.name = 'vpot' + k++;
      entry.ot.push({ id: t.name, ot, size: t.fontSize || 12 });
    });
    pendingSVG = entry;
  });
  const bsvg0 = IO.buildSVG.bind(IO);
  IO.buildSVG = function (index, opts = {}) {
    pendingSVG = null;
    const svg = bsvg0(index, opts);
    const entry = pendingSVG;
    pendingSVG = null;
    if (!entry || opts.noSVG || !svg || !svg.querySelector) return svg;
    (entry.ot || []).forEach((o) => {
      const el = svg.querySelector('[id="' + o.id + '"]');
      if (!el) return;
      const css = [];
      if (o.ot.caps && o.ot.caps !== 'normal') css.push('font-variant-caps:' + o.ot.caps);
      if (o.ot.kern === false) css.push('font-kerning:none');
      if (o.ot.liga === false) css.push('font-variant-ligatures:none');
      if (o.ot.track) css.push('letter-spacing:' + (o.ot.track / 1000) + 'em');
      if (css.length) el.setAttribute('style', ((el.getAttribute('style') || '') + ';' + css.join(';')).replace(/^;/, ''));
      if (/^vpot\d+$/.test(o.id)) el.removeAttribute('id');
    });
    const vb = (svg.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number);
    const p = VP.doc.pages[index];
    const bl = opts.bleed || 0;
    entry.box = opts.box ? [opts.box.x, opts.box.y, opts.box.width, opts.box.height] : [-bl, -bl, p.w + bl * 2, p.h + bl * 2];
    entry.vb = vb;
    entry.page = index;
    if (entry.links.length || entry.bms.length) linkQueue.push(entry);
    while (linkQueue.length > 50) linkQueue.shift();
    entry.links.forEach((l) => {
      const el = svg.querySelector('[id="' + l.id + '"]');
      if (!el) return;
      const a = document.createElementNS('http://www.w3.org/2000/svg', 'a');
      const href = l.url || (l.bm ? '#' + encodeURIComponent(l.bm) : '');
      a.setAttribute('href', href);
      a.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href);
      if (l.url) a.setAttribute('target', '_blank');
      el.parentNode.insertBefore(a, el);
      a.appendChild(el);
      if (/^vplk\d+$/.test(l.id)) el.removeAttribute('id');
    });
    return svg;
  };
  // PDF: link areas and outline entries are added right after each page's drawing
  const pdfState = new WeakMap();
  const hookPDF = () => {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J || !J.API || !J.API.svg || J.API.svg._vp) return;
    const svg0 = J.API.svg;
    J.API.svg = async function (el, o = {}) {
      const r = await svg0.call(this, el, o);
      const entry = linkQueue.shift();
      if (!entry) return r;
      const st = pdfState.get(this) || { bms: {}, pending: [] };
      pdfState.set(this, st);
      const pn = this.internal.getNumberOfPages();
      const [bx, by, bw, bh] = entry.box;
      const X = (v) => (o.x || 0) + ((v - bx) / bw) * (o.width || bw);
      const Y = (v) => (o.y || 0) + ((v - by) / bh) * (o.height || bh);
      entry.bms.forEach((bm) => {
        st.bms[bm.name] = { page: pn, top: Y(bm.y) };
        try {
          if (this.outline) this.outline.add(null, bm.name, { pageNumber: pn });
        } catch (e) { /* outline not available */ }
      });
      entry.links.forEach((l) => {
        const [x, y, w, h] = l.r;
        const rect = [X(x), Y(y), X(x + w) - X(x), Y(y + h) - Y(y)];
        if (l.url) this.link(rect[0], rect[1], rect[2], rect[3], { url: l.url });
        else if (l.bm) st.pending.push({ page: pn, rect, bm: l.bm });
      });
      // links to bookmarks whose page is known now
      st.pending = st.pending.filter((q) => {
        const t = st.bms[q.bm];
        if (!t) return true;
        const cur = this.internal.getCurrentPageInfo().pageNumber;
        this.setPage(q.page);
        this.link(q.rect[0], q.rect[1], q.rect[2], q.rect[3], { pageNumber: t.page, top: t.top });
        this.setPage(cur);
        return false;
      });
      return r;
    };
    J.API.svg._vp = true;
  };
  hookPDF();
  addEventListener('load', hookPDF);

  /* ======================================================================
     EDIT ANCHOR TOOL (connection points)
     ====================================================================== */
  const M = VP.measure;
  const anchorsOf = (it) => (it.data && it.data.anchors) || [];
  const apt = (it, a) => {
    const b = it.bounds;
    return Pt(b.left + b.width * a[0], b.top + b.height * a[1]);
  };
  if (M && M.anchorAt) {
    const aa0 = M.anchorAt;
    M.anchorAt = (pt, opts = {}) => {
      const best = aa0(pt, opts);
      const tol = (VP.coarse ? 14 : 9) / zoom();
      let mine = null;
      let md = tol;
      topItems().forEach((it) => {
        if (!it.visible || (opts.exclude && opts.exclude.includes(it))) return;
        anchorsOf(it).forEach((a) => {
          const p = apt(it, a);
          const d = p.getDistance(pt);
          if (d < md) {
            md = d;
            mine = { pt: p, it, link: { k: 'box', u: a[0], v: a[1], id: uidOf(it) } };
          }
        });
      });
      if (mine && (!best || md <= best.pt.getDistance(pt))) return mine;
      return best;
    };
  }
  const connectors = () => {
    const out = [];
    VP.userLayers().forEach((L) => L.getItems({ match: (it) => FX.of(it) && (FX.of(it).type === 'connector' || FX.of(it).type === 'dimension') }).forEach((g) => out.push(g)));
    return out;
  };
  const relink = (uid, from, to) => {
    connectors().forEach((g) => {
      const fx = FX.of(g);
      ['la', 'lb', 'lc'].forEach((k) => {
        const l = fx[k];
        if (l && l.id === uid && l.k === 'box' && Math.abs(l.u - from[0]) < 1e-6 && Math.abs(l.v - from[1]) < 1e-6) {
          if (to) {
            l.u = to[0];
            l.v = to[1];
          } else fx[k] = null;
        }
      });
    });
    if (M && M.updateLinks) M.updateLinks();
  };
  const anchorHit = (pt) => {
    const tol = (VP.coarse ? 16 : 10) / zoom();
    let best = null;
    topItems().forEach((it) => anchorsOf(it).forEach((a, i) => {
      const d = apt(it, a).getDistance(pt);
      if (d < tol && (!best || d < best.d)) best = { it, i, d };
    }));
    return best;
  };
  T.anchorTool = {
    cursor: 'crosshair',
    op: null,
    busy() { return !!(this.op && this.op.moved); },
    down(e) {
      const h = anchorHit(e.point);
      if (h) {
        this.op = { type: 'move', h, from: anchorsOf(h.it)[h.i].slice(), start: e.point, moved: false };
        return;
      }
      const hit = VP.hitItem(e.point);
      if (!hit || (M && M.is && M.is(hit))) {
        this.op = null;
        return VP.toast('Bağlantı noktası eklemek için bir nesneye dokunun');
      }
      const b = hit.bounds;
      const a = [clamp((e.point.x - b.left) / (b.width || 1), 0, 1), clamp((e.point.y - b.top) / (b.height || 1), 0, 1)];
      hit.data.anchors = anchorsOf(hit).concat([a.map((v) => Math.round(v * 1000) / 1000)]);
      uidOf(hit);
      this.op = { type: 'add' };
      VP.commit();
      VP.toast('Bağlantı noktası eklendi · Bağlantı araçlarıyla bu noktaya bağlanabilirsiniz');
    },
    move(e) {
      const op = this.op;
      if (!op || op.type !== 'move') return;
      if (!op.moved && op.start.getDistance(e.point) * zoom() < 4) return;
      op.moved = true;
      const it = op.h.it;
      const b = it.bounds;
      const a = [clamp((e.point.x - b.left) / (b.width || 1), -0.5, 1.5), clamp((e.point.y - b.top) / (b.height || 1), -0.5, 1.5)];
      const prev = anchorsOf(it)[op.h.i].slice();
      it.data.anchors[op.h.i] = a;
      relink(uidOf(it), prev, a);
      VP.drawOverlay();
    },
    up() {
      const op = this.op;
      this.op = null;
      if (!op || op.type !== 'move') return;
      if (!op.moved) {
        // a tap on a point removes it (connectors attached to it are released)
        const it = op.h.it;
        const a = it.data.anchors.splice(op.h.i, 1)[0];
        relink(uidOf(it), a, null);
        if (!it.data.anchors.length) delete it.data.anchors;
        VP.toast('Bağlantı noktası silindi');
      }
      VP.commit();
      VP.drawOverlay();
    },
    cancel() {
      this.op = null;
    },
    overlayAfter(L) {
      const s = 1 / zoom();
      const col = new paper.Color(VP.colors.accent);
      const gray = new paper.Color(0.5, 0.5, 0.5, 0.7);
      topItems().forEach((it) => {
        if (!it.visible || (M && M.is && M.is(it))) return;
        const b = it.bounds;
        [0, 0.5, 1].forEach((u) => [0, 0.5, 1].forEach((v) => L.addChild(new paper.Path.Circle({ center: Pt(b.left + b.width * u, b.top + b.height * v), radius: 2.2 * s, fillColor: gray, insert: false }))));
        anchorsOf(it).forEach((a) => {
          const p = apt(it, a);
          L.addChild(new paper.Path.RegularPolygon({ center: p, sides: 4, radius: (VP.coarse ? 8 : 6) * s, fillColor: '#ffffff', strokeColor: col, strokeWidth: 1.6 * s, insert: false }));
        });
      });
    }
  };
  Object.assign(VP.TOOL_META, {
    anchorTool: { label: 'Bağlantı noktası düzenle', icon: 'anchorEdit', key: '', hint: 'Nesneye dokunun: bağlantı noktası ekle · Noktayı sürükleyin: taşı · Noktaya dokunun: sil' }
  });

  /* ======================================================================
     property fields, actions, menus
     ====================================================================== */
  T3.propField = (name, raw) => {
    const it = VP.sel.length === 1 ? VP.sel[0] : null;
    const [k, arg] = name.split(':');
    if (!it) return true;
    if (k === 'odF') {
      const f = fields()[+arg];
      const d = Object.assign({}, it.data.odata || {});
      if (String(raw).trim()) d[f] = String(raw).trim();
      else delete d[f];
      if (Object.keys(d).length) it.data.odata = d;
      else delete it.data.odata;
      VP.commit();
      return true;
    }
    if (k === 'lkUrl' || k === 'lkTo') {
      const v = String(raw || '').trim();
      if (k === 'lkUrl') {
        const url = v && !/^[a-z]+:/i.test(v) ? 'https://' + v : v;
        it.data.link = url ? { url } : undefined;
      } else it.data.link = v ? { bm: v } : undefined;
      if (!it.data.link) delete it.data.link;
      VP.commit();
      return true;
    }
    if (k === 'lkBm') {
      const v = String(raw || '').trim();
      if (v) it.data.bookmark = v;
      else delete it.data.bookmark;
      VP.commit();
      return true;
    }
    return true;
  };
  T3.act = async (id, el) => {
    const [k, arg] = id.split(':');
    switch (k) {
      case 'odAddF': {
        const n = await UI.prompt({ title: 'Yeni alan', label: 'Alan adı', value: '', ok: 'Ekle' });
        if (n && n.trim() && !fields().includes(n.trim())) {
          fields().push(n.trim());
          VP.commit();
          UI.renderDock(true);
        }
        return true;
      }
      case 'odDelF':
        UI.popover(el, '<div class="pop-head">Silinecek alan</div>' + fields().map((f, i) => '<button class="pop-item" data-pick="' + i + '">' + esc(f) + '</button>').join(''), (i) => {
          fields().splice(+i, 1);
          VP.commit();
          UI.renderDock(true);
        });
        return true;
      case 'odTable': T3.odTable(); return true;
      case 'odCsv': IO.saveFile(IO.safeName() + '-nesne-verileri.csv', toCSV(allData())); return true;
      case 'lkGo': VP.gotoPage(+arg); return true;
      default: return false;
    }
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^(odF|lk[A-Z])/.test(n) ? T3.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^(od[A-Z]|lkGo)/.test(id) ? (T3.act(id, el), true) : act0(id, el));
  Object.assign(A, {
    txOpenType: { label: 'Yazı ayarları (OpenType)…', enabled: () => textTargets().length > 0, run: () => T3.dialog() },
    txStraighten: { label: 'Metni düzleştir', enabled: () => VP.sel.some((it) => it instanceof paper.PointText || (FX.of(it) && FX.of(it).type === 'textpath')), run: () => T3.straighten() },
    txAlignBase: { label: 'Taban çizgisine hizala', enabled: () => VP.sel.filter((it) => it instanceof paper.PointText).length > 1, run: () => T3.alignBaseline() },
    showNP: { label: 'Basılmayan karakterleri göster', checked: () => !!S.showNP, run: () => { S.showNP = !S.showNP; VP.io.savePrefs(); VP.drawOverlay(); } },
    opFill: { label: 'Dolguyu bindir', checked: () => opState('fill'), enabled: () => VP.sel.length > 0, run: () => T3.setOverprint('fill') },
    opStroke: { label: 'Anahatı bindir', checked: () => opState('stroke'), enabled: () => VP.sel.length > 0, run: () => T3.setOverprint('stroke') },
    simOP: { label: 'Bindirmeyi simüle et', checked: () => !!S.simOP, run: () => { S.simOP = !S.simOP; VP.io.savePrefs(); if (paper.view) { paper.view._needsUpdate = true; paper.view.requestUpdate(); } VP.toast(S.simOP ? 'Bindirme simülasyonu açık · Bindirilen renkler alttakiyle karışır' : 'Bindirme simülasyonu kapalı'); } },
    dockOData: { label: 'Nesne verileri paneli', run: () => UI.openDock('odata') },
    dockLinks: { label: 'Bağlantılar ve yer imleri', run: () => UI.openDock('links') },
    anchorToolA: { label: 'Bağlantı noktası düzenle aracı', icon: 'anchorEdit', run: () => VP.setTool('anchorTool') }
  });
  ins('text', null, ['|', 'txOpenType', 'txStraighten', 'txAlignBase', 'showNP']);
  ins('object', null, ['sub:Bindirme baskı|opFill,opStroke', 'dockOData', 'dockLinks']);
  ins('view', 'gamutAlarm', ['simOP']);
  ins('window', 'dockCoords', ['dockOData', 'dockLinks']);
})();
