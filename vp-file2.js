/* VektörPad, desktop drawing suite features (written for this app):
   - File: revert to the last saved version, templates (save as template, new from template), recently
     used documents, print merge (one copy per row of a CSV table, fields written as [Name] in text).
   - Guidelines docker: exact horizontal and vertical guides, angled guides, guide presets.
   - Baseline grid: shown on the page and snapped to.
   - Page numbering: start number and style (1, i, I, a, A) for page number fields.
   - Free transform tool: free rotate, reflect, scale and skew around an anchor point.
   - Apple Pencil hover: the Bézier pen shows the next segment while the pencil hovers. */
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
  const D = VP.docs;
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const F2 = (VP.file2 = {});
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => x !== '|' && !x.startsWith('h:') && !x.startsWith('sub:') && M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };
  const ls = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : d;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    }
  };
  const normDoc = (doc) => ({ name: doc.name || 'Adsız çizim', active: Math.min(doc.active || 0, doc.pages.length - 1), pages: doc.pages.map((p) => Object.assign({ layers: [], thumb: null }, p)), ext: doc.ext || {} });
  const thumbOf = () => {
    try {
      if (VP.makeThumb) VP.makeThumb();
    } catch (e) { /* ignore */ }
    return (VP.page() && VP.page().thumb) || null;
  };

  /* ======================================================================
     REVERT, RECENT, TEMPLATES
     ====================================================================== */
  const saved = new WeakMap();
  const remember = () => {
    try {
      VP.storePage();
      saved.set(VP.doc, IO.serialize());
    } catch (e) { /* ignore */ }
  };
  // recently used documents (kept on this device, newest first)
  const RECENT = 'vektorpad.recent.v1';
  F2.addRecent = () => {
    try {
      VP.storePage();
      const json = IO.serialize();
      const list = ls.get(RECENT, []).filter((r) => r.name !== VP.doc.name);
      list.unshift({ name: VP.doc.name, time: Date.now(), thumb: thumbOf(), json: json.length < 1.5e6 ? json : null, pages: VP.doc.pages.length });
      while (list.length > 8) list.pop();
      // the list must fit the browser storage: drop the oldest contents first
      while (!ls.set(RECENT, list) && list.some((r) => r.json)) {
        const k = list.map((r) => !!r.json).lastIndexOf(true);
        list[k].json = null;
      }
    } catch (e) { /* ignore */ }
  };
  const save0 = IO.save;
  IO.save = async function () {
    const r = await save0.apply(this, arguments);
    if (r) {
      remember();
      F2.addRecent();
    }
    return r;
  };
  const open0 = IO.handleOpen;
  IO.handleOpen = async function () {
    const before = VP.doc;
    const r = await open0.apply(this, arguments);
    if (VP.doc !== before) {
      remember();
      F2.addRecent();
    }
    return r;
  };
  F2.revert = () => {
    const json = saved.get(VP.doc);
    if (!json) return VP.toast('Bu belge bu oturumda kaydedilmedi veya açılmadı · Dönülecek kayıt yok');
    UI.modal('<h2>Son kaydedilene dön</h2><p>Kaydettikten sonraki bütün değişiklikler kaybolur. Bu işlem geri alınamaz.</p><div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Dön</button></div>', (root, close) => {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        close();
        if (b.dataset.x !== 'yes') return;
        const doc = normDoc(JSON.parse(json).doc);
        if (D && D.list && D.list[D.active]) {
          const ent = D.list[D.active];
          ent.doc = doc;
          ent.hist = null;
          ent.view = null;
          D.activate(D.active, true);
          ent.dirty = false;
          D.render();
        } else IO.loadDoc(doc);
        saved.set(VP.doc, json);
        VP.toast('Son kaydedilen sürüme dönüldü');
      });
    });
  };
  F2.recentMenu = (el) => {
    const list = ls.get(RECENT, []);
    if (!list.length) return VP.toast('Henüz kaydedilmiş veya açılmış belge yok');
    UI.popover(el, '<div class="pop-head">Son kullanılanlar</div>' + list.map((r, i) => '<button class="pop-item" data-pick="' + i + '"' + (r.json ? '' : ' disabled') + '>' +
      (r.thumb ? '<img src="' + esc(r.thumb) + '" style="width:30px;height:30px;object-fit:contain;background:#fff;border:1px solid var(--line)">' : '') +
      '<span>' + esc(r.name) + '<br><small style="color:var(--muted)">' + new Date(r.time).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) + (r.json ? '' : ' · içerik saklanamadı, dosyadan açın') + '</small></span></button>').join(''), (i) => {
      const r = list[+i];
      if (!r || !r.json) return;
      try {
        const o = JSON.parse(r.json);
        IO.loadDoc(o.doc);
        remember();
        VP.toast('Açıldı: ' + r.name);
      } catch (e) {
        VP.toast('Belge açılamadı');
      }
    });
  };
  const TPL = 'vektorpad.templates.v1';
  F2.saveTemplate = async () => {
    const name = await UI.prompt({ title: 'Şablon olarak kaydet', label: 'Şablon adı', value: VP.doc.name + ' şablonu', ok: 'Kaydet' });
    if (!name) return;
    VP.storePage();
    const json = JSON.stringify({ app: 'VektorPad', v: 1, template: true, doc: Object.assign({}, VP.doc, { name }) });
    const list = ls.get(TPL, []).filter((t) => t.name !== name);
    list.unshift({ name, time: Date.now(), thumb: thumbOf(), json, pages: VP.doc.pages.length, w: VP.page().w, h: VP.page().h });
    if (!ls.set(TPL, list)) {
      VP.toast('Şablon cihaza sığmadı · Dosya olarak kaydediliyor');
    } else VP.toast('Şablon kaydedildi: ' + name + ' · Dosya › Şablondan yeni');
    // a copy as a file too, so it can be shared or kept
    await IO.saveFile(String(name).replace(/[\\/:*?"<>|]+/g, '-') + '.vektorpad-sablon.json', json);
  };
  F2.newFromTemplate = () => {
    const list = ls.get(TPL, []);
    const cards = list.map((t, i) => '<button class="wl-card" data-t="' + i + '" style="display:flex;flex-direction:column;gap:6px;align-items:flex-start;padding:10px;border:1px solid var(--line);background:var(--panel);text-align:left;min-height:0">' +
      (t.thumb ? '<img src="' + esc(t.thumb) + '" style="width:100%;height:90px;object-fit:contain;background:#fff;border:1px solid var(--line)">' : '<div style="width:100%;height:90px;background:var(--panel-2)"></div>') +
      '<b style="font-size:13px">' + esc(t.name) + '</b><small style="color:var(--muted)">' + t.pages + ' sayfa · ' + mm(t.w, 0) + ' × ' + mm(t.h, 0) + ' mm</small></button>').join('');
    UI.modal('<h2>Şablondan yeni</h2>' + (list.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;max-height:55vh;overflow:auto">' + cards + '</div>' : '<p>Henüz şablon yok. Bir belgeyi Dosya › Şablon olarak kaydet ile saklayın ya da bir şablon dosyası açın.</p>') +
      '<div class="actions"><button class="btn" data-x="file">' + ic('open', 'sm') + 'Şablon dosyası aç…</button>' + (list.length ? '<button class="btn danger" data-x="del">Şablon sil…</button>' : '') + '<button class="btn" data-x="no">Vazgeç</button></div>', (root, close) => {
      root.addEventListener('click', (e) => {
        const c = e.target.closest('[data-t]');
        if (c) {
          close();
          const t = list[+c.dataset.t];
          try {
            const o = JSON.parse(t.json);
            const doc = o.doc;
            doc.name = (D && D.nextName ? D.nextName() : 'Adsız') ;
            IO.loadDoc(doc);
            VP.toast('Şablondan yeni belge: ' + t.name);
          } catch (err) {
            VP.toast('Şablon açılamadı');
          }
          return;
        }
        const b = e.target.closest('[data-x]');
        if (!b) return;
        close();
        if (b.dataset.x === 'file') IO.open();
        if (b.dataset.x === 'del') {
          UI.popover(document.querySelector('.menu-btn[data-menu="file"]') || document.body, '<div class="pop-head">Silinecek şablon</div>' + list.map((t, i) => '<button class="pop-item" data-pick="' + i + '">' + esc(t.name) + '</button>').join(''), (i) => {
            list.splice(+i, 1);
            ls.set(TPL, list);
            VP.toast('Şablon silindi');
          });
        }
      });
    });
  };

  /* ======================================================================
     PRINT MERGE
     ====================================================================== */
  // CSV with comma or semicolon, quoted fields, first row = field names
  F2.parseCSV = (txt) => {
    txt = String(txt || '').replace(/^﻿/, '');
    const first = txt.split(/\r?\n/)[0] || '';
    const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
    const rows = [];
    let row = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (q) {
        if (c === '"' && txt[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === sep) {
        row.push(cur);
        cur = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && txt[i + 1] === '\n') i++;
        row.push(cur);
        if (row.some((x) => x.trim())) rows.push(row);
        row = [];
        cur = '';
      } else cur += c;
    }
    row.push(cur);
    if (row.some((x) => x.trim())) rows.push(row);
    if (!rows.length) return { fields: [], records: [] };
    const fields = rows[0].map((f) => f.trim());
    return { fields, records: rows.slice(1).map((r) => Object.fromEntries(fields.map((f, i) => [f, (r[i] || '').trim()]))) };
  };
  const FIELD_RE = /\[([^\[\]\n]{1,40})\]/g;
  // the field names written in the texts of a page
  F2.fieldsOnPage = () => {
    const out = new Set();
    VP.userLayers().forEach((L) => L.getItems({}).forEach((it) => {
      const s = it instanceof paper.PointText ? it.content : FX.of(it) && FX.of(it).text != null ? String(FX.of(it).text) : '';
      for (const m of String(s).matchAll(FIELD_RE)) out.add(m[1]);
    }));
    return [...out];
  };
  const MERGE = (F2.merge = { rec: null });
  const fill = (s) => String(s).replace(FIELD_RE, (m, k) => (MERGE.rec && Object.prototype.hasOwnProperty.call(MERGE.rec, k) ? MERGE.rec[k] : m));
  IO.exportHooks = IO.exportHooks || [];
  IO.exportHooks.unshift((proj) => {
    if (!MERGE.rec) return;
    const groups = [];
    proj.getItems({}).forEach((it) => {
      const fx = FX.of(it);
      if (fx && fx.text != null && /\[/.test(fx.text)) {
        fx.text = fill(fx.text);
        groups.push(it);
      } else if (it instanceof paper.PointText && /\[/.test(it.content) && !(it.parent && FX.of(it.parent))) it.content = fill(it.content);
    });
    groups.forEach((g) => {
      try {
        FX.rebuild(g);
      } catch (e) { /* keep as it is */ }
    });
  });
  F2.mergePDF = async (records) => {
    const lib = window.jspdf;
    if (!lib || !lib.jsPDF) return VP.toast('PDF kütüphanesi yüklenemedi');
    VP.storePage();
    const i = VP.doc.active;
    const pg = VP.page();
    const orient = pg.w > pg.h ? 'landscape' : 'portrait';
    const pdf = new lib.jsPDF({ unit: 'pt', format: [pg.w, pg.h], orientation: orient, compress: true });
    try {
      if (window.VP_FONTS) {
        pdf.addFileToVFS('FiraSans-Regular.ttf', window.VP_FONTS.regular);
        pdf.addFont('FiraSans-Regular.ttf', 'Fira Sans', 'normal');
        pdf.addFileToVFS('FiraSans-Bold.ttf', window.VP_FONTS.bold);
        pdf.addFont('FiraSans-Bold.ttf', 'Fira Sans', 'bold');
        pdf.setFont('Fira Sans', 'normal');
      }
    } catch (e) { /* standard fonts */ }
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden;';
    document.body.appendChild(host);
    await IO.preload(i);
    try {
      for (let k = 0; k < records.length; k++) {
        if (k > 0) pdf.addPage([pg.w, pg.h], orient);
        MERGE.rec = records[k];
        const svg = IO.buildSVG(i, { pdf: true });
        MERGE.rec = null;
        host.appendChild(svg);
        if (typeof pdf.svg === 'function') await pdf.svg(svg, { x: 0, y: 0, width: pg.w, height: pg.h });
        else await window.svg2pdf.svg2pdf(svg, pdf, { x: 0, y: 0, width: pg.w, height: pg.h });
        host.removeChild(svg);
      }
    } catch (e) {
      MERGE.rec = null;
      host.remove();
      console.error(e);
      return VP.toast('Birleştirme PDF’i oluşturulamadı');
    }
    host.remove();
    return IO.saveFile(IO.safeName() + '-birlestirme.pdf', new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' }));
  };
  F2.mergeDialog = () => {
    const used = F2.fieldsOnPage();
    let data = F2.lastMerge || null;
    UI.modal('<h2>Birleştirerek yazdır</h2><p>Bu sayfadaki metinlere alan adlarını köşeli parantezle yazın, ör. <b>[Ad]</b>, <b>[Şehir]</b>. Bir tablo (CSV) verin; her satır için sayfanın bir kopyası alanlar doldurularak çıkar.</p>' +
      '<p class="sec-note" data-used>' + (used.length ? 'Sayfadaki alanlar: ' + used.map((u) => '[' + esc(u) + ']').join(', ') : 'Sayfada henüz [Alan] yok.') + '</p>' +
      '<div class="row"><button class="btn" data-x="file">' + ic('open', 'sm') + 'CSV dosyası seç…</button><button class="btn" data-x="sample">Örnek tablo</button></div>' +
      '<textarea data-csv rows="6" placeholder="Ad;Şehir&#10;Ayşe Yılmaz;İzmir&#10;Mehmet Kaya;Ankara" style="width:100%;font:13px var(--font-num);padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);color:var(--fg);-webkit-user-select:text;user-select:text">' + esc(data ? data.raw : '') + '</textarea>' +
      '<p class="sec-note" data-info></p>' +
      '<div class="actions"><button class="btn" data-x="ins">Alan ekle ▾</button><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">PDF oluştur</button></div>', (root, close) => {
      const ta = root.querySelector('[data-csv]');
      const info = root.querySelector('[data-info]');
      const check = () => {
        const p = F2.parseCSV(ta.value);
        data = { raw: ta.value, p };
        const miss = used.filter((u) => !p.fields.includes(u));
        info.textContent = p.fields.length ? p.records.length + ' kayıt · Alanlar: ' + p.fields.join(', ') + (miss.length ? ' · Tabloda olmayan: ' + miss.join(', ') : '') : 'Tablo boş';
        info.style.color = miss.length && p.fields.length ? 'var(--danger)' : '';
      };
      ta.addEventListener('input', check);
      check();
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        const k = b.dataset.x;
        if (k === 'no') return close();
        if (k === 'sample') {
          ta.value = (used.length ? used.join(';') : 'Ad;Şehir') + '\n' + (used.length ? used.map((u) => u + ' 1').join(';') + '\n' + used.map((u) => u + ' 2').join(';') : 'Ayşe Yılmaz;İzmir\nMehmet Kaya;Ankara');
          return check();
        }
        if (k === 'file') {
          const inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = '.csv,.txt,text/csv,text/plain';
          inp.onchange = async () => {
            const f = inp.files[0];
            if (!f) return;
            ta.value = await f.text();
            check();
          };
          inp.click();
          return;
        }
        if (k === 'ins') {
          const p = F2.parseCSV(ta.value);
          if (!p.fields.length) return VP.toast('Önce tabloyu girin');
          UI.popover(b, '<div class="pop-head">Seçili metne ekle</div>' + p.fields.map((f) => '<button class="pop-item" data-pick="' + esc(f) + '">[' + esc(f) + ']</button>').join(''), (f) => {
            const t = VP.sel.find((it) => it instanceof paper.PointText);
            if (!t) return VP.toast('Alanı eklemek için bir metin seçin');
            t.content = t.content + ' [' + f + ']';
            VP.commit();
            VP.toast('[' + f + '] eklendi');
          });
          return;
        }
        if (k === 'yes') {
          const p = F2.parseCSV(ta.value);
          if (!p.records.length) return VP.toast('Tabloda kayıt yok (ilk satır alan adlarıdır)');
          F2.lastMerge = data;
          close();
          VP.toast(p.records.length + ' kayıt birleştiriliyor…');
          setTimeout(() => F2.mergePDF(p.records), 40);
        }
      });
    });
  };

  /* ======================================================================
     GUIDELINES DOCKER, ANGLED GUIDES
     ====================================================================== */
  const guides = () => (VP.page().guides = VP.page().guides || []);
  const aguides = () => (VP.page().aguides = VP.page().aguides || []);
  const dg0 = VP.drawGuides;
  VP.drawGuides = () => {
    dg0();
    drawAngled();
  };
  // the core redraws guides on view, page and change events with its own function; angled guides follow
  const drawAngled = () => {
    if (!S.guides || !paper.view || !VP.guideLayer) return;
    const L = VP.guideLayer;
    L.children.filter((c) => c.data && c.data.aguide).forEach((c) => c.remove());
    const s = 1 / zoom();
    const vb = paper.view.bounds;
    const len = Math.max(vb.width, vb.height) * 2 + 2000;
    aguides().forEach((g) => {
      const c = Pt(g.x, g.y);
      const d = Pt(1, 0).rotate(-g.a);
      const ln = new paper.Path.Line({ from: c.subtract(d.multiply(len)), to: c.add(d.multiply(len)), strokeColor: '#2f7fe0', strokeWidth: s, dashArray: [5 * s, 3 * s], opacity: 0.85, insert: false });
      ln.data.aguide = true;
      L.addChild(ln);
    });
  };
  ['view', 'page', 'change'].forEach((ev) => VP.on(ev, drawAngled));
  const snapG = VP.snapPt;
  VP.snapPt = (pt) => {
    let q = snapG(pt);
    if (S.guides && S.snapGuides && aguides().length) {
      const tol = (VP.coarse ? 10 : 7) / zoom();
      let best = null;
      aguides().forEach((g) => {
        const c = Pt(g.x, g.y);
        const d = Pt(1, 0).rotate(-g.a);
        const pr = c.add(d.multiply(pt.subtract(c).dot(d)));
        const dist = pr.getDistance(pt);
        if (dist < tol && (!best || dist < best.d)) best = { d: dist, p: pr };
      });
      if (best && best.p.getDistance(pt) < q.getDistance(pt) + tol) q = best.p;
    }
    // baseline grid
    if (S.baseGrid && S.snapBase) {
      const step = VP.toPT(S.baseStepMM || 4.5);
      const off = VP.toPT(S.baseTopMM || 10);
      const tol = (VP.coarse ? 10 : 7) / zoom();
      const y = off + Math.round((q.y - off) / step) * step;
      if (Math.abs(y - q.y) < tol) q = Pt(q.x, y);
    }
    return q;
  };
  const GP = (F2.gpanel = { o: 'h', pos: VP.toPT(20), x: 0, y: 0, a: 30 });
  const guidesPanel = () => {
    const gs = guides();
    const ag = aguides();
    let h = '<div class="sec"><div class="sec-h"><h3>Kılavuz çizgiler</h3></div>' +
      '<div class="row"><button class="btn' + (S.guides ? ' on' : '') + '" data-act="gdShow">' + (S.guides ? '☑' : '☐') + ' Göster</button><button class="btn' + (S.snapGuides ? ' on' : '') + '" data-act="gdSnap">' + (S.snapGuides ? '☑' : '☐') + ' Yakala</button></div>' +
      '<div class="row"><span class="seg">' + [['h', 'Yatay'], ['v', 'Dikey'], ['a', 'Açılı']].map(([k, l]) => '<button data-act="gdType:' + k + '" class="' + (GP.o === k ? 'on' : '') + '">' + l + '</button>').join('') + '</span></div>';
    if (GP.o === 'a') h += '<div class="row">' + H.dfieldPf('X', 'gdX', mm(GP.x, 1)) + H.dfieldPf('Y', 'gdY', mm(GP.y, 1)) + H.dfieldPf('Açı', 'gdA', VP.num(GP.a, 1), '°') + '</div>';
    else h += '<div class="row">' + H.dfieldPf(GP.o === 'h' ? 'Y' : 'X', 'gdPos', mm(GP.pos, 1)) + '</div>';
    h += '<div class="row"><button class="btn primary" data-act="gdAdd">' + ic('plus', 'sm') + 'Ekle</button><button class="btn" data-act="gdPreset">Hazır ▾</button><button class="btn danger" data-act="gdClear"' + (gs.length || ag.length ? '' : ' disabled') + '>Tümünü sil</button></div>';
    h += '<div class="list">';
    gs.forEach((g, i) => {
      h += '<div class="obj-row" style="padding-left:10px"><span class="row-name">' + (g.o === 'h' ? 'Yatay · Y ' : 'Dikey · X ') + mm(g.p, 1) + ' mm</span>' +
        '<button class="row-btn" data-act="gdEdit:' + i + '" title="Seç ve düzenle">' + ic('node', 'sm') + '</button><button class="row-btn" data-act="gdDel:' + i + '" title="Sil">' + ic('trash', 'sm') + '</button></div>';
    });
    ag.forEach((g, i) => {
      h += '<div class="obj-row" style="padding-left:10px"><span class="row-name">Açılı · ' + VP.num(g.a, 1) + '° · ' + mm(g.x, 0) + ', ' + mm(g.y, 0) + ' mm</span>' +
        '<button class="row-btn" data-act="gdEditA:' + i + '" title="Seç ve düzenle">' + ic('node', 'sm') + '</button><button class="row-btn" data-act="gdDelA:' + i + '" title="Sil">' + ic('trash', 'sm') + '</button></div>';
    });
    if (!gs.length && !ag.length) h += '<p class="sec-note" style="padding:8px">Kılavuz yok · Cetvelden sürükleyerek de ekleyebilirsiniz.</p>';
    h += '</div></div>';
    h += '<div class="sec"><div class="sec-h"><h3>Taban çizgisi ızgarası</h3></div>' +
      '<div class="row"><button class="btn' + (S.baseGrid ? ' on' : '') + '" data-act="bgShow">' + (S.baseGrid ? '☑' : '☐') + ' Göster</button><button class="btn' + (S.snapBase ? ' on' : '') + '" data-act="bgSnap">' + (S.snapBase ? '☑' : '☐') + ' Yakala</button></div>' +
      '<div class="row">' + H.dfieldPf('Aralık', 'bgStep', VP.num(S.baseStepMM || 4.5, 2)) + H.dfieldPf('Başlangıç', 'bgTop', VP.num(S.baseTopMM || 10, 1)) + '</div>' +
      '<p class="sec-note">Metin satırlarını hizalamak için. Aralığı yazı satır aralığına eşit seçin (ör. 12 pt × 1,2 = 5,08 mm).</p></div>';
    return h;
  };
  UI.panels = UI.panels || {};
  UI.panels.guides = guidesPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'guides')) UI.DOCKERS.push(['guides', 'Kılavuzlar']);
  const setGuidesSoon = () => {
    VP.drawGuides();
    VP.commit();
    UI.renderDock(true);
  };
  F2.guidePreset = (el) => {
    const items = [['margins', 'Kenar boşlukları 10 mm'], ['margins20', 'Kenar boşlukları 20 mm'], ['center', 'Sayfa ortası (yatay + dikey)'], ['thirds', 'Üçte bir (3 × 3)'], ['cols', '12 sütunlu ızgara (10 mm kenar, 5 mm aralık)'], ['bleed', 'Taşma payı çizgisi 3 mm (sayfa dışı)']];
    UI.popover(el, '<div class="pop-head">Hazır kılavuzlar</div>' + items.map(([k, l]) => '<button class="pop-item" data-pick="' + k + '">' + esc(l) + '</button>').join(''), (k) => {
      const p = VP.page();
      const g = guides();
      const add = (o, v) => !g.some((x) => x.o === o && Math.abs(x.p - v) < 0.01) && g.push({ o, p: v });
      if (k === 'margins' || k === 'margins20') {
        const m = VP.toPT(k === 'margins' ? 10 : 20);
        add('v', m);
        add('v', p.w - m);
        add('h', m);
        add('h', p.h - m);
      } else if (k === 'center') {
        add('v', p.w / 2);
        add('h', p.h / 2);
      } else if (k === 'thirds') {
        [1, 2].forEach((i) => {
          add('v', (p.w * i) / 3);
          add('h', (p.h * i) / 3);
        });
      } else if (k === 'cols') {
        const m = VP.toPT(10);
        const gut = VP.toPT(5);
        const cw = (p.w - 2 * m - 11 * gut) / 12;
        for (let i = 0; i < 12; i++) {
          add('v', m + i * (cw + gut));
          add('v', m + i * (cw + gut) + cw);
        }
      } else if (k === 'bleed') {
        const b = VP.toPT(3);
        add('v', -b);
        add('v', p.w + b);
        add('h', -b);
        add('h', p.h + b);
      }
      S.guides = true;
      setGuidesSoon();
    });
  };
  // baseline grid drawing (on the page, under the artwork)
  const drawGrid0 = VP.drawGrid;
  VP.drawGrid = () => {
    drawGrid0();
    const L = VP.bgLayer;
    if (!L) return;
    const old = L.children.find((c) => c.name === 'baseGrid');
    if (old) old.remove();
    if (!S.baseGrid) return;
    const p = VP.page();
    const step = VP.toPT(S.baseStepMM || 4.5);
    const off = VP.toPT(S.baseTopMM || 10);
    if (step * zoom() < 3) return;
    const col = new paper.Color('#3fa7c9');
    col.alpha = 0.45;
    const cp = new paper.CompoundPath({ insert: false, strokeColor: col, strokeWidth: 1 / zoom() });
    for (let y = off; y <= p.h + 0.01; y += step) cp.addChild(new paper.Path.Line({ from: [0, y], to: [p.w, y], insert: false }));
    const g = new paper.Group({ insert: false, name: 'baseGrid' });
    g.addChild(cp);
    L.addChild(g);
  };
  F2.act = async (id, el) => {
    const [k, arg] = id.split(':');
    const re = () => UI.renderDock(true);
    switch (k) {
      case 'gdShow': S.guides = !S.guides; VP.io.savePrefs(); VP.drawGuides(); re(); return true;
      case 'gdSnap': S.snapGuides = !S.snapGuides; VP.io.savePrefs(); re(); return true;
      case 'gdType': GP.o = arg; re(); return true;
      case 'gdAdd':
        if (GP.o === 'a') aguides().push({ x: GP.x, y: GP.y, a: GP.a });
        else guides().push({ o: GP.o, p: GP.pos });
        S.guides = true;
        setGuidesSoon();
        return true;
      case 'gdDel': guides().splice(+arg, 1); setGuidesSoon(); return true;
      case 'gdDelA': aguides().splice(+arg, 1); setGuidesSoon(); return true;
      case 'gdEdit': {
        const g = guides()[+arg];
        if (g) {
          GP.o = g.o;
          GP.pos = g.p;
          guides().splice(+arg, 1);
          VP.drawGuides();
          re();
          VP.toast('Değeri değiştirip “Ekle”ye dokunun');
        }
        return true;
      }
      case 'gdEditA': {
        const g = aguides()[+arg];
        if (g) {
          Object.assign(GP, { o: 'a', x: g.x, y: g.y, a: g.a });
          aguides().splice(+arg, 1);
          VP.drawGuides();
          re();
          VP.toast('Değerleri değiştirip “Ekle”ye dokunun');
        }
        return true;
      }
      case 'gdClear': VP.page().guides = []; VP.page().aguides = []; setGuidesSoon(); return true;
      case 'gdPreset': F2.guidePreset(el); return true;
      case 'bgShow': S.baseGrid = !S.baseGrid; VP.io.savePrefs(); VP.drawGrid(); re(); return true;
      case 'bgSnap': S.snapBase = !S.snapBase; if (S.snapBase) S.baseGrid = true; VP.io.savePrefs(); VP.drawGrid(); re(); return true;
      case 'ftMode': D2.mode = arg; UI.schedule('prop'); return true;
      default: return false;
    }
  };
  F2.propField = (name, raw) => {
    const v = VP.parseNum(raw);
    if (!isFinite(v)) return true;
    switch (name) {
      case 'gdPos': GP.pos = VP.toPT(v); break;
      case 'gdX': GP.x = VP.toPT(v); break;
      case 'gdY': GP.y = VP.toPT(v); break;
      case 'gdA': GP.a = v; break;
      case 'bgStep': if (v > 0.5) S.baseStepMM = v; VP.io.savePrefs(); VP.drawGrid(); break;
      case 'bgTop': S.baseTopMM = v; VP.io.savePrefs(); VP.drawGrid(); break;
      default: break;
    }
    return true;
  };

  /* ======================================================================
     PAGE NUMBERING
     ====================================================================== */
  const roman = (n) => {
    if (n <= 0 || n >= 4000) return String(n);
    const t = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let s = '';
    t.forEach(([v, r]) => {
      while (n >= v) {
        s += r;
        n -= v;
      }
    });
    return s;
  };
  const alpha = (n) => {
    let s = '';
    while (n > 0) {
      n--;
      s = String.fromCharCode(97 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  };
  const STYLES = [['1', '1, 2, 3'], ['i', 'i, ii, iii'], ['I', 'I, II, III'], ['a', 'a, b, c'], ['A', 'A, B, C'], ['01', '01, 02, 03']];
  VP.pageLabel = (i) => {
    const o = (VP.doc && VP.doc.ext && VP.doc.ext.pageNum) || {};
    const n = i + (o.start != null ? +o.start : 1);
    let s;
    switch (o.style) {
      case 'i': s = roman(n); break;
      case 'I': s = roman(n).toUpperCase(); break;
      case 'a': s = alpha(n); break;
      case 'A': s = alpha(n).toUpperCase(); break;
      case '01': s = String(n).padStart(2, '0'); break;
      default: s = String(n);
    }
    return (o.prefix || '') + s;
  };
  F2.pageNumDialog = () => {
    const o = Object.assign({ style: '1', start: 1, prefix: '' }, (VP.doc.ext && VP.doc.ext.pageNum) || {});
    UI.modal('<h2>Sayfa numarası ayarları</h2>' +
      '<label class="field"><span>Biçim</span><select data-n="style">' + STYLES.map(([k, l]) => '<option value="' + k + '"' + (k === o.style ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      '<div class="row"><label class="field"><span>İlk sayfa numarası</span><input data-n="start" value="' + esc(o.start) + '" inputmode="numeric" style="width:60px"></label><label class="field"><span>Ön ek</span><input data-n="prefix" value="' + esc(o.prefix) + '" style="width:90px" placeholder="Sayfa "></label></div>' +
      '<p class="sec-note" data-n="prev"></p><p class="sec-note">Mizanpaj › Sayfa numarası ekle ile yerleştirilen alanlar bu biçimi kullanır (dışa aktarmada da).</p>' +
      '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Tamam</button></div>', (root, close) => {
      const g = (k) => root.querySelector('[data-n="' + k + '"]');
      const read = () => ({ style: g('style').value, start: Math.round(VP.parseNum(g('start').value) || 1), prefix: g('prefix').value });
      const prev = () => {
        const save = VP.doc.ext.pageNum;
        VP.doc.ext.pageNum = read();
        g('prev').textContent = 'Örnek: ' + [0, 1, 2, 3].map((i) => VP.pageLabel(i)).join(', ') + ' …';
        VP.doc.ext.pageNum = save;
      };
      root.addEventListener('input', prev);
      root.addEventListener('change', prev);
      VP.doc.ext = VP.doc.ext || {};
      prev();
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        close();
        if (b.dataset.x !== 'yes') return;
        VP.doc.ext.pageNum = read();
        VP.emit('page');
        VP.commit();
        if (UI.renderPageTabs) UI.renderPageTabs();
        VP.toast('Sayfa numaraları: ' + VP.pageLabel(0) + ', ' + VP.pageLabel(1) + ' …');
      });
    });
  };
  VP.on('page', () => {
    VP.userLayers().forEach((L) => L.getItems({ match: (it) => it.data && it.data.pageField }).forEach((t) => (t.content = VP.pageLabel(VP.doc.active))));
  });

  /* ======================================================================
     FREE TRANSFORM TOOL
     ====================================================================== */
  const D2 = (F2.ft = { mode: 'rotate', anchor: null });
  const MODES = [['rotate', 'Serbest döndür'], ['reflect', 'Serbest yansıt'], ['scale', 'Serbest ölçekle'], ['skew', 'Serbest eğ']];
  T.freeXform = {
    cursor: 'crosshair',
    op: null,
    busy() { return !!(this.op && this.op.moved); },
    down(e) {
      const hit = VP.hitItem(e.point);
      if (!VP.sel.length && hit) VP.setSelection([hit]);
      if (!VP.sel.length) {
        this.op = null;
        return VP.toast('Önce dönüştürülecek nesneyi seçin');
      }
      const A0 = D2.anchor || VP.selBounds().center;
      this.op = { start: e.point, A: A0, prev: new paper.Matrix(), moved: false };
    },
    matrix(cur) {
      const op = this.op;
      const A0 = op.A;
      const m = new paper.Matrix();
      const v0 = op.start.subtract(A0);
      const v1 = cur.subtract(A0);
      if (D2.mode === 'rotate') {
        if (v0.length < 1e-6 || v1.length < 1e-6) return m;
        let a = v1.angle - v0.angle;
        if (VP.keys.shift) a = Math.round(a / 15) * 15;
        return m.rotate(a, A0);
      }
      if (D2.mode === 'reflect') {
        const d = cur.subtract(A0);
        if (d.length < 1e-6) return m;
        const ang = Math.round(d.angle / (VP.keys.shift ? 15 : 0.001)) * (VP.keys.shift ? 15 : 0.001);
        // mirror across the line through the anchor in the drag direction
        return m.rotate(ang, A0).scale(1, -1, A0).rotate(-ang, A0);
      }
      if (D2.mode === 'scale') {
        const sx = Math.abs(v0.x) > 1e-3 ? v1.x / v0.x : 1;
        const sy = Math.abs(v0.y) > 1e-3 ? v1.y / v0.y : 1;
        if (VP.keys.shift || VP.settings.keepRatio) {
          const k = v1.length / (v0.length || 1);
          return m.scale(k, k, A0);
        }
        return m.scale(clamp(sx, -50, 50) || 0.01, clamp(sy, -50, 50) || 0.01, A0);
      }
      // skew: along the stronger drag direction
      const d = cur.subtract(op.start);
      const dy0 = Math.abs(v0.y) > 1e-3 ? v0.y : 1;
      const dx0 = Math.abs(v0.x) > 1e-3 ? v0.x : 1;
      const sh = Math.abs(d.x) >= Math.abs(d.y) ? [d.x / dy0, 0] : [0, d.y / dx0];
      return m.translate(A0).append(new paper.Matrix(1, sh[1], sh[0], 1, 0, 0)).translate(A0.negate());
    },
    move(e) {
      const op = this.op;
      if (!op) return;
      if (!op.moved && op.start.getDistance(e.point) * zoom() < (e.isTouch ? 6 : 3)) return;
      op.moved = true;
      const M = this.matrix(e.point);
      const delta = M.clone().append(op.prev.inverted());
      VP.sel.forEach((it) => it.transform(delta));
      op.prev = M;
      op.cur = e.point;
      VP.drawOverlay();
      VP.emit('transform');
    },
    up(e) {
      const op = this.op;
      this.op = null;
      if (!op) return;
      if (!op.moved) {
        // a tap sets the anchor point (a second tap on it returns to the selection centre)
        D2.anchor = D2.anchor && D2.anchor.getDistance(e.point) * zoom() < 14 ? null : VP.snapPt(e.point);
        VP.drawOverlay();
        UI.schedule('prop');
        return;
      }
      VP.commit();
    },
    cancel() {
      if (this.op && this.op.moved) VP.undoLive && VP.undoLive();
      this.op = null;
    },
    deactivate() {
      D2.anchor = null;
    },
    overlayAfter(L) {
      const s = 1 / zoom();
      const col = new paper.Color(VP.colors.accent);
      const A0 = (this.op && this.op.A) || D2.anchor || (VP.sel.length ? VP.selBounds().center : null);
      if (!A0) return;
      L.addChild(new paper.Path.Circle({ center: A0, radius: 6 * s, strokeColor: col, strokeWidth: 1.5 * s, fillColor: '#ffffff', insert: false }));
      L.addChild(new paper.Path.Line({ from: A0.subtract([10 * s, 0]), to: A0.add([10 * s, 0]), strokeColor: col, strokeWidth: 1.2 * s, insert: false }));
      L.addChild(new paper.Path.Line({ from: A0.subtract([0, 10 * s]), to: A0.add([0, 10 * s]), strokeColor: col, strokeWidth: 1.2 * s, insert: false }));
      if (this.op && this.op.cur) L.addChild(new paper.Path.Line({ from: A0, to: this.op.cur, strokeColor: col, strokeWidth: s, dashArray: [4 * s, 3 * s], insert: false }));
    }
  };
  Object.assign(VP.TOOL_META, {
    freeXform: { label: 'Serbest dönüştürme', icon: 'freeXform', key: '', hint: 'Dokunun: dayanak noktası · Sürükleyin: dayanak çevresinde döndür, yansıt, ölçekle veya eğ (özellik çubuğu) · Shift: 15° adım' }
  });
  const tb0 = VP.tx.toolBar;
  VP.tx.toolBar = (id) => {
    if (id === 'freeXform') return '<span class="pb-title">Serbest dönüştürme</span><span class="seg">' + MODES.map(([k, l]) => '<button data-act="ftMode:' + k + '" class="' + (D2.mode === k ? 'on' : '') + '">' + l.replace('Serbest ', '') + '</button>').join('') + '</span><span class="pb-label">' + (D2.anchor ? 'Dayanak: ' + mm(D2.anchor.x, 1) + ', ' + mm(D2.anchor.y, 1) + ' mm' : 'Dayanak: seçimin ortası · Ayarlamak için dokunun') + '</span>';
    return tb0(id);
  };
  // with a selection the property bar shows the selection; the mode switch goes in front of it
  const rpb0 = UI.renderPropbar;
  UI.renderPropbar = () => {
    rpb0();
    if (VP.toolId !== 'freeXform' || !VP.sel.length) return;
    const pb = document.querySelector('#propbar');
    if (!pb || pb.querySelector('[data-ft-pre]')) return;
    pb.insertAdjacentHTML('afterbegin', '<span data-ft-pre style="display:contents"><span class="seg">' + MODES.map(([k, l]) => '<button data-act="ftMode:' + k + '" class="' + (D2.mode === k ? 'on' : '') + '" title="' + l + '">' + l.replace('Serbest ', '') + '</button>').join('') + '</span><span class="pb-sep"></span></span>');
  };

  /* ======================================================================
     actions and menus
     ====================================================================== */
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^(gd|bg)[A-Z]/.test(n) ? F2.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^((gd|bg)[A-Z]|ftMode:)/.test(id) ? (F2.act(id, el), true) : act0(id, el));
  Object.assign(A, {
    revertDoc: { label: 'Son kaydedilene dön…', run: () => F2.revert() },
    recentDocs: { label: 'Son kullanılanlar ▸', icon: 'open', run: () => F2.recentMenu(document.querySelector('.menu-btn[data-menu="file"]') || document.querySelector('#btn-menu-all') || document.body) },
    saveTemplate: { label: 'Şablon olarak kaydet…', run: () => F2.saveTemplate() },
    newFromTemplate: { label: 'Şablondan yeni…', icon: 'file', run: () => F2.newFromTemplate() },
    printMerge: { label: 'Birleştirerek yazdır…', icon: 'print', run: () => F2.mergeDialog() },
    dockGuides: { label: 'Kılavuzlar paneli', icon: 'guides', run: () => UI.openDock('guides') },
    baseGrid: { label: 'Taban çizgisi ızgarası', checked: () => !!S.baseGrid, run: () => { S.baseGrid = !S.baseGrid; VP.io.savePrefs(); VP.drawGrid(); VP.toast(S.baseGrid ? 'Taban çizgisi ızgarası açık · Ayarlar: Kılavuzlar paneli' : 'Taban çizgisi ızgarası kapalı'); } },
    snapBase: { label: 'Taban çizgisine yakala', checked: () => !!S.snapBase, run: () => { S.snapBase = !S.snapBase; if (S.snapBase) S.baseGrid = true; VP.io.savePrefs(); VP.drawGrid(); } },
    pageNumSettings: { label: 'Sayfa numarası ayarları…', run: () => F2.pageNumDialog() },
    freeXformA: { label: 'Serbest dönüştürme aracı', icon: 'freeXform', run: () => VP.setTool('freeXform') }
  });
  ins('file', 'new', ['newFromTemplate', 'recentDocs']);
  ins('file', 'saveAs', ['saveTemplate', 'revertDoc']);
  ins('file', 'print', ['printMerge']);
  ins('view', 'clearGuides', ['dockGuides', 'baseGrid']);
  ins('view', 'snapObjects', ['snapBase']);
  ins('layout', 'insertPageNum', ['pageNumSettings']);
  ins('window', 'dockCoords', ['dockGuides']);
  ins('object', null, ['freeXformA']);
  if (!S.snapBase) S.snapBase = false;
  // Apple Pencil hover: the pen tool's preview follows the hovering pencil
  addEventListener('load', () => {
    const cv = document.querySelector('#canvas');
    if (!cv) return;
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'pen' || e.buttons) return;
      const t = VP.tool();
      if (!t || !t.hover) return;
      const r = cv.getBoundingClientRect();
      const vpt = Pt(e.clientX - r.left, e.clientY - r.top);
      t.hover({ point: paper.view.viewToProject(vpt), vpt, pointerType: 'pen', shift: false, alt: false, ctrl: false, isTouch: false });
      VP.drawOverlay();
    });
  });
  VP.on('doc', () => VP.drawGuides && VP.drawGuides());
})();
