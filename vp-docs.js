/* VektörPad open documents, as in the desktop suite: File › New opens the "Create a New Document" dialog
   (name, preset, page size, orientation, number of pages, colour mode, resolution) and every document has
   its own tab above the drawing window. Opening a file adds a tab too. Each document keeps its own undo
   history and view; all open documents are kept by the autosave. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const IO = VP.io;
  const A = VP.actions;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const D = (VP.docs = { list: [], active: 0 });
  const KEY2 = 'vektorpad.docs.v2';
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const newHist = () => ({ stack: [], i: -1, max: 80 });
  const norm = (doc) => ({
    name: doc.name || 'Adsız',
    active: clamp(doc.active || 0, 0, Math.max(0, (doc.pages || []).length - 1)),
    pages: (doc.pages && doc.pages.length ? doc.pages : [VP.newPage(1)]).map((p) => Object.assign({ layers: [], thumb: null }, p)),
    ext: doc.ext || {}
  });
  // undo replaces VP.doc, so the current document is always read from VP.doc
  const docOf = (e) => (D.list[D.active] === e ? VP.doc : e.doc);
  D.nextName = () => {
    let n = 0;
    D.list.forEach((e) => {
      const m = /^Adsız-(\d+)$/.exec(docOf(e).name || '');
      if (m) n = Math.max(n, +m[1]);
    });
    return 'Adsız-' + (n + 1);
  };

  /* =============== autosave of every open document =============== */
  let pending = null;
  let inited = false;
  const la0 = IO.loadAutosave.bind(IO);
  IO.loadAutosave = () => {
    try {
      const s = localStorage.getItem(KEY2);
      if (s) {
        const o = JSON.parse(s);
        if (o && o.app === 'VektorPad' && Array.isArray(o.docs) && o.docs.length && o.docs.every((d) => d && Array.isArray(d.pages) && d.pages.length)) {
          const a = clamp(o.active | 0, 0, o.docs.length - 1);
          pending = { docs: o.docs, active: a };
          return o.docs[a];
        }
      }
    } catch (e) { /* fall back to the single saved document */ }
    return la0();
  };
  const as0 = IO.autosave.bind(IO);
  IO.autosave = () => {
    if (!inited) return as0();
    try {
      D.saveActive();
      localStorage.setItem(KEY2, JSON.stringify({ app: 'VektorPad', v: 2, active: D.active, docs: D.list.map((e) => e.doc) }));
      IO._warned = false;
    } catch (e) {
      if (!IO._warned) {
        VP.toast('Otomatik kayıt yapılamadı · Belgeleri Dosya › Kaydet ile saklayın');
        IO._warned = true;
      }
    }
  };

  /* =============== switching, adding, closing =============== */
  D.saveActive = () => {
    const e = D.list[D.active];
    if (!e) return;
    try {
      VP.storePage();
    } catch (err) { /* ignore */ }
    e.doc = VP.doc;
    e.hist = VP.hist;
    if (paper.view) e.view = { zoom: paper.view.zoom, center: paper.view.center.clone() };
  };
  D.activate = (i, force) => {
    if (!D.list[i] || (i === D.active && !force)) return;
    if (D.list[D.active] && D.active !== i) D.saveActive();
    D.active = i;
    const e = D.list[i];
    VP.doc = e.doc;
    VP.hist = e.hist || newHist();
    VP.loadPage(clamp(VP.doc.active || 0, 0, VP.doc.pages.length - 1), { keepView: !!e.view });
    if (e.view) {
      paper.view.zoom = e.view.zoom;
      paper.view.center = e.view.center;
      VP.viewChanged();
    }
    VP.refreshShadows();
    if (!e.hist) {
      e.hist = VP.hist;
      VP.resetHistory();
    }
    VP.emit('doc');
    if (VP.classic) VP.classic.showWelcome(false);
    D.render();
    IO.scheduleAutosave();
  };
  D.add = (doc) => {
    if (D.list[D.active]) D.saveActive();
    D.list.push({ doc: norm(doc), hist: null, view: null, dirty: false });
    D.active = -1;
    D.activate(D.list.length - 1, true);
  };
  // an untouched new document is replaced instead of keeping an empty tab
  D.pristine = () => {
    const e = D.list[D.active];
    return !!(e && !e.dirty && VP.hist.stack.length <= 1 && VP.userLayers().every((L) => !L.children.length) && /^Adsız/.test(VP.doc.name || ''));
  };
  const askSave = (e) => new Promise((resolve) => {
    UI.modal(
      '<h2>Değişiklikler kaydedilsin mi?</h2><p>“' + esc(docOf(e).name) + '” belgesinde kaydedilmemiş değişiklikler var.</p>' +
        '<div class="actions"><button class="btn" data-x="cancel">Vazgeç</button><button class="btn" data-x="discard">Kaydetme</button><button class="btn primary" data-x="save">Kaydet</button></div>',
      (root, close) => {
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-x]');
          if (!b) return;
          close();
          if (b.dataset.x === 'cancel') return resolve(false);
          if (b.dataset.x === 'save') {
            const i = D.list.indexOf(e);
            if (i !== D.active) D.activate(i);
            await IO.save();
          }
          resolve(true);
        });
      }
    );
  });
  D.close = async (i) => {
    const e = D.list[i];
    if (!e) return;
    if (e.dirty && !(await askSave(e))) return;
    i = D.list.indexOf(e);
    if (D.list.length === 1) {
      D.list[0] = { doc: VP.newDoc('Adsız-1'), hist: null, view: null, dirty: false };
      D.active = -1;
      D.activate(0, true);
      if (VP.classic && VP.classic.on()) VP.classic.showWelcome(true);
      return;
    }
    if (i === D.active) {
      D.list.splice(i, 1);
      D.active = -1;
      D.activate(Math.min(i, D.list.length - 1), true);
    } else {
      D.list.splice(i, 1);
      if (i < D.active) D.active--;
      D.render();
      IO.scheduleAutosave();
    }
  };
  D.closeAll = async () => {
    for (const e of D.list.slice()) {
      if (e.dirty && !(await askSave(e))) return;
      e.dirty = false;
    }
    D.list = [{ doc: VP.newDoc('Adsız-1'), hist: null, view: null, dirty: false }];
    D.active = -1;
    D.activate(0, true);
    if (VP.classic && VP.classic.on()) VP.classic.showWelcome(true);
  };
  // modified marks
  const cm0 = VP.commit;
  VP.commit = function () {
    const r = cm0.apply(this, arguments);
    const e = inited && D.list[D.active];
    if (e && !e.dirty) {
      e.dirty = true;
      D.render();
    }
    return r;
  };
  const sv0 = IO.save.bind(IO);
  IO.save = async () => {
    const r = await sv0();
    const e = D.list[D.active];
    if (r && e) {
      e.dirty = false;
      D.render();
    }
    return r;
  };
  // opening a file adds a tab (unless the current document is an untouched new one)
  const ld0 = IO.loadDoc.bind(IO);
  IO.loadDoc = (doc) => {
    if (!inited || D.pristine()) {
      ld0(doc);
      const e = D.list[D.active];
      if (e) e.dirty = false;
      D.render();
      return;
    }
    D.add(doc);
  };

  /* =============== tabs =============== */
  D.render = () => {
    const bar = $('.doc-tabs');
    const dn = $('#doc-name');
    if (!bar || !dn) return;
    const main = dn.closest('.doc-tab');
    bar.querySelectorAll('.doc-tab[data-doc]').forEach((t) => t.remove());
    D.list.forEach((e, i) => {
      if (i === D.active) {
        bar.appendChild(main);
        return;
      }
      const t = document.createElement('div');
      t.className = 'doc-tab doc-other';
      t.dataset.doc = i;
      t.setAttribute('role', 'tab');
      t.title = e.doc.name;
      t.innerHTML = ic('file', 'sm') + '<span class="doc-tab-name">' + esc(e.doc.name) + (e.dirty ? ' *' : '') + '</span><button class="doc-close" aria-label="“' + esc(e.doc.name) + '” belgesini kapat">×</button>';
      bar.appendChild(t);
    });
    const e = D.list[D.active];
    let mark = main.querySelector('.doc-dirty');
    if (!mark) {
      mark = document.createElement('span');
      mark.className = 'doc-dirty';
      mark.textContent = '*';
      mark.title = 'Kaydedilmemiş değişiklikler';
      main.insertBefore(mark, main.querySelector('.doc-close'));
    }
    mark.hidden = !(e && e.dirty);
    if (document.activeElement !== dn) dn.value = VP.doc.name;
    const wl = $('#welcome');
    main.classList.toggle('on', !wl || wl.hidden);
  };
  const bindTabs = () => {
    const bar = $('.doc-tabs');
    bar.addEventListener('click', (ev) => {
      const t = ev.target.closest('.doc-tab[data-doc]');
      if (!t) return;
      const i = +t.dataset.doc;
      if (ev.target.closest('.doc-close')) {
        ev.stopPropagation();
        return D.close(i);
      }
      D.activate(i);
    });
    // the close button of the current document closes it (it used to start a new document)
    const main = $('#doc-name').closest('.doc-tab');
    const old = main.querySelector('.doc-close');
    if (old) {
      const nb = old.cloneNode(true);
      nb.removeAttribute('data-cmd');
      nb.title = 'Belgeyi kapat';
      nb.setAttribute('aria-label', 'Belgeyi kapat');
      old.replaceWith(nb);
      nb.addEventListener('click', (ev) => {
        ev.stopPropagation();
        D.close(D.active);
      });
    }
    $('#doc-name').addEventListener('change', () => D.render());
  };
  const init = () => {
    inited = true;
    if (pending) {
      D.list = pending.docs.map((doc, i) => (i === pending.active ? { doc: VP.doc, hist: VP.hist, view: null, dirty: false } : { doc: norm(doc), hist: null, view: null, dirty: false }));
      D.active = pending.active;
      pending = null;
    } else {
      D.list = [{ doc: VP.doc, hist: VP.hist, view: null, dirty: false }];
      D.active = 0;
    }
    bindTabs();
    D.render();
  };
  VP.on('doc', () => {
    if (!inited) return init();
    // the current document was replaced (sample, opened file): keep its tab in step
    const e = D.list[D.active];
    if (e) {
      e.doc = VP.doc;
      e.hist = VP.hist;
    }
    D.render();
  });

  /* =============== Create a New Document (Yeni Belge Oluştur, as in the desktop suite) =============== */
  const IN = 25.4;
  const MM = (px, dpi) => (px * 25.4) / dpi;
  // preset grid: id, name, w × h in mm, unit shown, type (print, env, card, web), extra settings
  const P = (id, name, w, h, unit, type, o) => Object.assign({ id, name, w, h, unit, type }, o);
  D.PRESETS = [
    P('custom', 'Özel', 0, 0, '', ''),
    P('vpdefault', 'VektörPad Varsayılanı', 210, 297, 'mm', 'print', { color: 'CMYK', dpi: 300 }),
    P('cmyk', 'Varsayılan CMYK', 210, 297, 'mm', 'print', { color: 'CMYK', dpi: 300 }),
    P('legal', 'Resmi', 8.5 * IN, 14 * IN, 'in', 'print'),
    P('letter', 'Harf', 8.5 * IN, 11 * IN, 'in', 'print'),
    P('tabloid', 'Tabloid', 11 * IN, 17 * IN, 'in', 'print'),
    P('execlegal', 'Yönetim Yasal', 8.5 * IN, 13 * IN, 'in', 'print'),
    P('execletter', 'Yönetim Mektup', 8 * IN, 10.5 * IN, 'in', 'print'),
    P('halfletter', 'Yarım Mektup', 5.5 * IN, 8.5 * IN, 'in', 'print'),
    P('nabc', 'North American Business Card', 3.5 * IN, 2 * IN, 'in', 'card'),
    P('broadsheet', 'Geniş Kağıt', 18 * IN, 24 * IN, 'in', 'print'),
    P('double', 'Çift', 11 * IN, 17 * IN, 'in', 'print'),
    P('env9', 'Zarf #9', 8.88 * IN, 3.88 * IN, 'in', 'env'),
    P('env10', 'Zarf #10', 9.5 * IN, 4.13 * IN, 'in', 'env'),
    P('env11', 'Zarf #11', 10.38 * IN, 4.5 * IN, 'in', 'env'),
    P('env12', 'Zarf #12', 11 * IN, 4.75 * IN, 'in', 'env'),
    P('env14', 'Zarf #14', 11.5 * IN, 5 * IN, 'in', 'env'),
    P('A3', 'A3', 297, 420, 'mm', 'print'),
    P('A4', 'A4', 210, 297, 'mm', 'print'),
    P('A5', 'A5', 148, 210, 'mm', 'print'),
    P('A6', 'A6', 105, 148, 'mm', 'print'),
    P('B4', 'B4 (ISO)', 250, 353, 'mm', 'print'),
    P('B5', 'B5 (ISO)', 176, 250, 'mm', 'print'),
    P('envDL', 'Zarf DL', 220, 110, 'mm', 'env'),
    P('envC5', 'Zarf C5', 229, 162, 'mm', 'env'),
    P('envC4', 'Zarf C4', 324, 229, 'mm', 'env'),
    P('Kartvizit', 'Kartvizit', 85, 55, 'mm', 'card'),
    P('Kare', 'Kare', 200, 200, 'mm', 'print'),
    P('Afis', 'Afiş', 500, 700, 'cm', 'print', { dpi: 150 }),
    P('web', 'Web', MM(1920, 96), MM(1080, 96), 'px', 'web', { color: 'RGB', dpi: 96 }),
    P('social', 'Sosyal medya kare', MM(1080, 96), MM(1080, 96), 'px', 'web', { color: 'RGB', dpi: 96 }),
    P('story', 'Hikâye', MM(1080, 96), MM(1920, 96), 'px', 'web', { color: 'RGB', dpi: 96 })
  ];
  const UNITS = [['mm', 'milimetre'], ['cm', 'santimetre'], ['in', 'inç'], ['pt', 'nokta'], ['px', 'piksel']];
  const toU = (mm, u, dpi) => (u === 'cm' ? mm / 10 : u === 'in' ? mm / IN : u === 'pt' ? (mm / IN) * 72 : u === 'px' ? (mm / IN) * (dpi || 96) : mm);
  const fromU = (v, u, dpi) => (u === 'cm' ? v * 10 : u === 'in' ? v * IN : u === 'pt' ? (v / 72) * IN : u === 'px' ? (v / (dpi || 96)) * IN : v);
  const UABBR = { mm: 'mm', cm: 'cm', in: 'in.', pt: 'pt', px: 'px' };
  const fmt = (mm, u, dpi) => VP.num(toU(mm, u, dpi), u === 'px' || u === 'pt' ? 0 : u === 'in' ? 2 : 1);
  const userPresets = () => (Array.isArray(VP.settings.newDocPresets) ? VP.settings.newDocPresets : []);
  const allPresets = () => D.PRESETS.concat(userPresets().map((p) => Object.assign({ user: true, type: 'user' }, p)));
  const findPreset = (id) => allPresets().find((p) => p.id === id);
  const sizeOf = (s) => {
    if (+s.w > 0 && +s.h > 0) return { w: +s.w, h: +s.h };
    const p = findPreset(s.size) || VP.PAGE_PRESETS.find((x) => x.id === s.size);
    let w = p && p.w > 0 ? p.w : 210;
    let h = p && p.h > 0 ? p.h : 297;
    if ((s.orient === 'l') !== w > h && w !== h) [w, h] = [h, w];
    return { w, h };
  };
  D.create = (s) => {
    const { w, h } = sizeOf(s);
    const doc = VP.newDoc(s.name || D.nextName());
    const n = clamp(Math.round(+s.pages || 1), 1, 200);
    doc.pages = [];
    for (let i = 1; i <= n; i++) doc.pages.push(VP.newPage(i, w, h));
    doc.ext = { colorMode: s.color || 'CMYK', dpi: +s.dpi || 300, unit: s.unit || 'mm', bleed: +s.bleed || 0, colors: s.colors || null, pageView: s.view || 'single' };
    D.add(doc);
    // Sayfa görünümü: the multi-page view shows pages side by side (facing pages)
    const facing = s.view === 'multi';
    if (VP.docx && VP.docx.toggleFacing && !!VP.settings.facing !== facing && n > 1) VP.docx.toggleFacing();
    VP.fitPage();
    VP.toast('Yeni belge: ' + doc.name + ' · ' + VP.num(w, 1) + ' × ' + VP.num(h, 1) + ' mm' + (n > 1 ? ' · ' + n + ' sayfa' : ''));
  };

  const pageThumb = (w, h, box) => {
    const k = box / Math.max(w, h);
    const pw = Math.max(4, w * k);
    const ph = Math.max(4, h * k);
    return '<svg width="' + (box + 4) + '" height="' + (box + 4) + '" viewBox="0 0 ' + (box + 4) + ' ' + (box + 4) + '" aria-hidden="true"><rect class="pg" x="' + ((box + 4 - pw) / 2 + 0.5) + '" y="' + ((box + 4 - ph) / 2 + 0.5) + '" width="' + (pw - 1) + '" height="' + (ph - 1) + '"/></svg>';
  };
  const STAR = '<svg width="38" height="38" viewBox="0 0 24 24" aria-hidden="true"><rect class="pg" x="2.5" y="2.5" width="19" height="19"/><path d="M12 6.2l1.7 3.6 3.9.5-2.9 2.7.8 3.9L12 15l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
  const STAR_BADGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.5l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="currentColor"/></svg>';
  const CHEV = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const XIC = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4"/></svg>';
  const PLUS = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 5.5v9M5.5 10h9" stroke="currentColor" stroke-width="1.6"/></svg>';
  const MINUS = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 10h9" stroke="currentColor" stroke-width="1.6"/></svg>';
  const sizeLabel = (p) => (p.id === 'custom' ? '' : fmt(p.w, p.unit, p.dpi) + ' × ' + fmt(p.h, p.unit, p.dpi) + ' ' + UABBR[p.unit || 'mm']);
  const TYPES = [['', 'Sayfa Türü'], ['print', 'Baskı'], ['env', 'Zarf'], ['card', 'Kartvizit'], ['web', 'Web ve ekran'], ['user', 'Özel hazır ayarlar']];
  const SIZES = [['', 'Tüm Sayfa Boyutları'], ['metric', 'Metrik (mm, cm)'], ['in', 'İnç'], ['px', 'Piksel']];

  D.newDialog = () => {
    const last = VP.settings.newDocLast || {};
    const s = Object.assign({ preset: 'vpdefault', w: 210, h: 297, orient: 'p', pages: 1, color: 'CMYK', dpi: 300, unit: 'mm', view: 'single', bleed: 0, colors: { rgb: 'sRGB IEC61966-2.1', cmyk: 'ISO Coated v2 (ECI)', gray: 'Dot Gain 20%', intent: 'Algısal' } }, last, { name: D.nextName() });
    if (!(+s.w > 0 && +s.h > 0) || (last.size && last.size !== 'custom')) Object.assign(s, sizeOf(Object.assign({}, s, { w: 0, h: 0 })));
    if (!UNITS.some((u) => u[0] === s.unit)) s.unit = 'mm';
    delete s.size;
    if (!findPreset(s.preset)) s.preset = 'custom';
    if (VP.settings.newDocNoDialog) return D.create(s);
    const ui = { tab: 'doc', q: '', type: '', sz: '', open: { layout: false, colors: false } };
    const opt = (list, cur) => list.map(([k, l]) => '<option value="' + esc(k) + '"' + (String(k) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
    const shown = () =>
      allPresets().filter((p) => {
        if (p.id === 'custom') return !ui.q && !ui.type && !ui.sz;
        if (ui.type && p.type !== ui.type) return false;
        if (ui.sz === 'metric' && !/^(mm|cm)$/.test(p.unit)) return false;
        if (ui.sz && ui.sz !== 'metric' && p.unit !== ui.sz) return false;
        if (ui.q && !(p.name + ' ' + sizeLabel(p)).toLocaleLowerCase('tr').includes(ui.q.toLocaleLowerCase('tr'))) return false;
        return true;
      });
    const tile = (p) =>
      '<button type="button" class="nd-tile' + (p.id === s.preset ? ' on' : '') + '" data-preset="' + esc(p.id) + '" role="option" aria-selected="' + (p.id === s.preset) + '" title="' + esc(p.name + (p.id === 'custom' ? '' : ' · ' + sizeLabel(p))) + '">' +
      '<span class="nd-thumb">' + (p.id === 'custom' ? STAR : pageThumb(p.w, p.h, 54)) + '</span>' +
      '<span class="nd-badge">' + (p.id === 'custom' ? STAR_BADGE : ic(p.type === 'web' ? 'preview' : p.user ? 'save' : 'print')) + '</span>' +
      '<span class="nd-name">' + esc(p.name) + '</span><span class="nd-size">' + esc(sizeLabel(p)) + '</span></button>';
    const grid = () => {
      const list = shown();
      return list.length ? list.map(tile).join('') : '<div class="nd-empty">Bu aramaya uyan hazır ayar yok.</div>';
    };
    const sec = (key, title, inner) => '<div class="nd-sec' + (ui.open[key] ? ' open' : '') + '"><button type="button" data-sec="' + key + '" aria-expanded="' + !!ui.open[key] + '">' + CHEV + title + '</button><div class="nd-sec-body">' + inner + '</div></div>';
    const row = (lab, ctl, forId) => '<div class="nd-row">' + (forId ? '<label for="' + forId + '">' + esc(lab) + ':</label>' : '<span>' + esc(lab) + ':</span>') + '<div class="nd-ctl">' + ctl + '</div></div>';
    const side = () => {
      const u = s.unit;
      const c = s.colors || {};
      return (
        '<h3>Belge Ayarları</h3><h4>Genel</h4>' +
        row('İsim', '<input id="nd-name" class="nd-name-in" data-nd="name" value="' + esc(s.name) + '" spellcheck="false">', 'nd-name') +
        row('Sayfa sayısı', '<input id="nd-pages" class="nd-num" data-nd="pages" type="number" min="1" max="200" step="1" value="' + esc(s.pages) + '" inputmode="numeric">', 'nd-pages') +
        row('Sayfa görünümü', '<button type="button" class="nd-ibtn' + (s.view !== 'multi' ? ' on' : '') + '" data-view="single" title="Tek sayfa görünümü" aria-pressed="' + (s.view !== 'multi') + '">' + ic('currentPage') + '</button><button type="button" class="nd-ibtn' + (s.view === 'multi' ? ' on' : '') + '" data-view="multi" title="Çok sayfalı görünüm (karşılıklı sayfalar)" aria-pressed="' + (s.view === 'multi') + '">' + ic('allPages') + '</button>') +
        row('Birincil renk modu', '<label class="nd-radio"><input type="radio" name="nd-color" data-color="CMYK"' + (s.color !== 'RGB' ? ' checked' : '') + '>CMYK</label><label class="nd-radio"><input type="radio" name="nd-color" data-color="RGB"' + (s.color === 'RGB' ? ' checked' : '') + '>RGB</label>') +
        '<h4>Boyutlar</h4>' +
        row('Genişlik', '<input id="nd-w" class="nd-num" data-nd="w" value="' + fmt(s.w, u, s.dpi) + ' ' + UABBR[u] + '" inputmode="decimal"><select data-nd="unit" aria-label="Birim">' + opt(UNITS, u) + '</select>', 'nd-w') +
        row('Yükseklik', '<input id="nd-h" class="nd-num" data-nd="h" value="' + fmt(s.h, u, s.dpi) + ' ' + UABBR[u] + '" inputmode="decimal">', 'nd-h') +
        row('Yön', '<button type="button" class="nd-ibtn' + (s.h >= s.w ? ' on' : '') + '" data-orient="p" title="Dikey" aria-pressed="' + (s.h >= s.w) + '">' + ic('portrait') + '</button><button type="button" class="nd-ibtn' + (s.w > s.h ? ' on' : '') + '" data-orient="l" title="Yatay" aria-pressed="' + (s.w > s.h) + '">' + ic('landscape') + '</button>') +
        row('Çözünürlük', '<select id="nd-dpi" data-nd="dpi">' + opt([72, 96, 150, 200, 300, 400, 600].map((d) => [d, d]), +s.dpi) + '</select><span>dpi</span>', 'nd-dpi') +
        sec('layout', 'Mizanpaj', row('Taşma payı', '<input id="nd-bleed" class="nd-num" data-nd="bleed" value="' + VP.num(+s.bleed || 0, 1) + ' mm" inputmode="decimal">', 'nd-bleed')) +
        sec('colors', 'Renkler',
          row('RGB profili', '<select data-col="rgb">' + opt([['sRGB IEC61966-2.1', 'sRGB IEC61966-2.1'], ['Adobe RGB (1998)', 'Adobe RGB (1998)'], ['Display P3', 'Display P3']], c.rgb) + '</select>') +
          row('CMYK profili', '<select data-col="cmyk">' + opt([['ISO Coated v2 (ECI)', 'ISO Coated v2 (ECI)'], ['U.S. Web Coated (SWOP) v2', 'U.S. Web Coated (SWOP) v2'], ['Coated FOGRA39', 'Coated FOGRA39'], ['PSO Uncoated ISO12647 (ECI)', 'PSO Uncoated (ECI)']], c.cmyk) + '</select>') +
          row('Gri tonlama profili', '<select data-col="gray">' + opt([['Dot Gain 20%', 'Dot Gain 20%'], ['Dot Gain 15%', 'Dot Gain 15%'], ['Gray Gamma 2.2', 'Gray Gamma 2.2']], c.gray) + '</select>') +
          row('Görüntü oluşturma amacı', '<select data-col="intent">' + opt([['Algısal', 'Algısal'], ['Göreli renk ölçümsel', 'Göreli renk ölçümsel'], ['Doygunluk', 'Doygunluk'], ['Mutlak renk ölçümsel', 'Mutlak renk ölçümsel']], c.intent) + '</select>'))
      );
    };
    const body = () =>
      ui.tab === 'tpl'
        ? '<div class="nd-filter" style="grid-template-columns:1fr"><input type="search" placeholder="Şablon ara" aria-label="Şablon ara"></div><div class="nd-tpl">Henüz şablon yok. Bir belgeyi Dosya › Şablon olarak kaydet ile şablon olarak saklayabilirsiniz; şimdilik Belge Ayarları sekmesindeki hazır ayarları kullanın.</div>'
        : '<div class="nd-filter"><input type="search" data-f="q" placeholder="Hazır ayar ara" aria-label="Hazır ayar ara" value="' + esc(ui.q) + '"><select data-f="type" aria-label="Sayfa Türü">' + opt(TYPES, ui.type) + '</select><select data-f="sz" aria-label="Tüm Sayfa Boyutları">' + opt(SIZES, ui.sz) + '</select></div>' +
          '<div class="nd-body"><div class="nd-left"><div class="nd-grid" role="listbox" aria-label="Hazır ayarlar">' + grid() + '</div>' +
          '<div class="nd-plusminus"><button type="button" class="nd-round" data-x="addPreset" title="Geçerli ayarları hazır ayar olarak ekle" aria-label="Hazır ayar ekle">' + PLUS + '</button><button type="button" class="nd-round" data-x="delPreset" title="Seçili hazır ayarı sil" aria-label="Hazır ayarı sil"' + ((findPreset(s.preset) || {}).user ? '' : ' disabled') + '>' + MINUS + '</button></div></div>' +
          '<div class="nd-side">' + side() + '</div></div>';
    const render = (root) => {
      const sc = root.querySelector('.nd-grid');
      const top = sc ? sc.scrollTop : 0;
      const ss = root.querySelector('.nd-side');
      const stop = ss ? ss.scrollTop : 0;
      root.innerHTML =
        '<div class="nd-title"><span>Yeni Belge Oluştur</span><button type="button" class="nd-x" data-x="no" aria-label="Kapat">' + XIC + '</button></div>' +
        '<div class="nd-tabs" role="tablist"><button type="button" class="nd-tab' + (ui.tab === 'doc' ? ' on' : '') + '" data-tab="doc" role="tab" aria-selected="' + (ui.tab === 'doc') + '">Belge Ayarları</button><button type="button" class="nd-tab' + (ui.tab === 'tpl' ? ' on' : '') + '" data-tab="tpl" role="tab" aria-selected="' + (ui.tab === 'tpl') + '">Şablonlar</button></div>' +
        body() +
        '<div class="nd-foot"><button type="button" class="nd-help" data-x="help" aria-label="Yardım">?</button><label><input type="checkbox" data-nd="noask"' + (VP.settings.newDocNoDialog ? ' checked' : '') + '>Bu iletişim kutusunu bir daha gösterme</label><button type="button" class="nd-btn primary" data-x="yes">OK</button><button type="button" class="nd-btn" data-x="no">İptal</button></div>';
      const sc2 = root.querySelector('.nd-grid');
      if (sc2) sc2.scrollTop = top;
      const ss2 = root.querySelector('.nd-side');
      if (ss2) ss2.scrollTop = stop;
    };
    const refreshGrid = (root) => {
      const g = root.querySelector('.nd-grid');
      if (g) g.innerHTML = grid();
    };
    UI.modal('', (root, close) => {
      root.classList.add('nd-dialog');
      root.setAttribute('aria-label', 'Yeni Belge Oluştur');
      render(root);
      // reads the typed fields into s (sizes typed in the current unit)
      const read = () => {
        const v = (k) => {
          const el = root.querySelector('[data-nd="' + k + '"]');
          return el ? el.value : null;
        };
        if (v('name') != null) s.name = v('name').trim() || s.name;
        if (v('pages') != null) s.pages = clamp(Math.round(VP.parseNum(v('pages')) || 1), 1, 200);
        if (v('dpi') != null) s.dpi = +v('dpi') || 300;
        if (v('bleed') != null) s.bleed = Math.max(0, VP.parseNum(v('bleed')) || 0);
        ['w', 'h'].forEach((k) => {
          const raw = v(k);
          if (raw == null) return;
          const n = VP.parseNum(raw);
          if (!(n > 0)) return;
          const mm = clamp(fromU(n, s.unit, s.dpi), 1, 50000);
          if (fmt(mm, s.unit, s.dpi) !== fmt(s[k], s.unit, s.dpi)) {
            s[k] = mm;
            s.preset = 'custom';
          }
        });
        root.querySelectorAll('[data-col]').forEach((el) => {
          s.colors = Object.assign({}, s.colors, { [el.dataset.col]: el.value });
        });
      };
      const finish = () => {
        read();
        s.orient = s.w > s.h ? 'l' : 'p';
        const nb = root.querySelector('[data-nd="noask"]');
        VP.settings.newDocNoDialog = !!(nb && nb.checked);
        const keep = Object.assign({}, s);
        delete keep.name;
        delete keep.size;
        VP.settings.newDocLast = keep;
        VP.io.savePrefs();
        close();
        D.create(s);
      };
      root.addEventListener('input', (ev) => {
        if (ev.target.dataset.f === 'q') {
          ui.q = ev.target.value;
          refreshGrid(root);
        }
      });
      root.addEventListener('change', (ev) => {
        const el = ev.target;
        if (el.dataset.f) {
          ui[el.dataset.f] = el.value;
          return refreshGrid(root);
        }
        if (el.dataset.color) {
          read();
          s.color = el.dataset.color;
          return;
        }
        const k = el.dataset.nd;
        if (k === 'unit') {
          read();
          s.unit = el.value;
          return render(root);
        }
        if (k === 'w' || k === 'h' || k === 'dpi' || k === 'bleed' || k === 'pages') {
          read();
          render(root);
        }
      });
      root.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.dataset.f !== 'q') {
          ev.preventDefault();
          finish();
        }
        if (ev.key !== 'Escape') ev.stopPropagation();
      });
      root.addEventListener('click', async (ev) => {
        const t = ev.target;
        const tab = t.closest('[data-tab]');
        if (tab) {
          read();
          ui.tab = tab.dataset.tab;
          return render(root);
        }
        const pr = t.closest('[data-preset]');
        if (pr) {
          read();
          const p = findPreset(pr.dataset.preset);
          s.preset = pr.dataset.preset;
          if (p && p.id !== 'custom') {
            s.w = p.w;
            s.h = p.h;
            if (p.unit) s.unit = p.unit;
            if (p.color) s.color = p.color;
            if (p.dpi) s.dpi = p.dpi;
          }
          render(root);
          if (ev.detail > 1) finish(); // a double click / double tap on a preset creates the document
          return;
        }
        const sc = t.closest('[data-sec]');
        if (sc) {
          ui.open[sc.dataset.sec] = !ui.open[sc.dataset.sec];
          sc.parentNode.classList.toggle('open', ui.open[sc.dataset.sec]);
          sc.setAttribute('aria-expanded', String(ui.open[sc.dataset.sec]));
          return;
        }
        const o = t.closest('[data-orient]');
        if (o) {
          read();
          if ((o.dataset.orient === 'l') !== s.w > s.h && s.w !== s.h) [s.w, s.h] = [s.h, s.w];
          s.orient = o.dataset.orient;
          return render(root);
        }
        const vw = t.closest('[data-view]');
        if (vw) {
          read();
          s.view = vw.dataset.view;
          return render(root);
        }
        const x = t.closest('[data-x]');
        if (!x) return;
        const what = x.dataset.x;
        if (what === 'yes') return finish();
        if (what === 'no') return close();
        if (what === 'help') return UI.run('help');
        if (what === 'addPreset') {
          read();
          const name = await UI.prompt({ title: 'Hazır ayar ekle', label: 'Ad', value: fmt(s.w, s.unit, s.dpi) + ' × ' + fmt(s.h, s.unit, s.dpi) + ' ' + UABBR[s.unit], ok: 'Ekle' });
          if (!name || !name.trim()) return;
          const p = { id: 'u' + VP.uid(), name: name.trim(), w: s.w, h: s.h, unit: s.unit, color: s.color, dpi: +s.dpi };
          VP.settings.newDocPresets = userPresets().concat([p]);
          VP.io.savePrefs();
          s.preset = p.id;
          return render(root);
        }
        if (what === 'delPreset') {
          const p = findPreset(s.preset);
          if (!p || !p.user) return;
          VP.settings.newDocPresets = userPresets().filter((q) => q.id !== p.id);
          VP.io.savePrefs();
          s.preset = 'custom';
          return render(root);
        }
      });
      setTimeout(() => {
        const n = root.querySelector('[data-nd="name"]');
        if (n && !VP.coarse) {
          n.focus();
          n.select();
        }
      }, 30);
    });
  };

  /* =============== actions and menus =============== */
  const docMenu = () => {
    const la = UI._lastAnchor;
    const anchor = la && document.body.contains(la) ? la : $('.doc-tabs') || document.body;
    UI.popover(anchor, '<div class="pop-head">Açık belgeler</div>' + D.list.map((e, i) => '<button class="pop-item' + (i === D.active ? ' on' : '') + '" data-pick="' + i + '">' + ic('file', 'sm') + '<span>' + esc(docOf(e).name) + (e.dirty ? ' *' : '') + '</span>' + (i === D.active ? '<span class="check">✓</span>' : '') + '</button>').join(''), (i) => D.activate(+i));
  };
  Object.assign(A, {
    new: { label: 'Yeni…', kbd: 'Ctrl+N', icon: 'file', run: () => D.newDialog() },
    newQuick: { label: 'Yeni (iletişim kutusu olmadan)', run: () => D.create(Object.assign({}, VP.settings.newDocLast || { w: 210, h: 297, orient: 'p', pages: 1 }, { name: D.nextName() })) },
    newDocAsk: {
      label: 'Yeni belgede iletişim kutusunu göster', checked: () => !VP.settings.newDocNoDialog,
      run: () => {
        VP.settings.newDocNoDialog = !VP.settings.newDocNoDialog;
        VP.io.savePrefs();
      }
    },
    docClose: { label: 'Kapat', kbd: 'Ctrl+W', run: () => D.close(D.active) },
    docCloseAll: { label: 'Tümünü kapat', run: () => D.closeAll() },
    docList: { label: 'Açık belgeler ▸', run: docMenu },
    docNext: { label: 'Sonraki belge', kbd: 'Ctrl+Tab', run: () => D.list.length > 1 && D.activate((D.active + 1) % D.list.length) }
  });
  const M = UI.MENUS;
  if (M.file && !M.file.includes('docClose')) {
    const i = M.file.indexOf('open');
    M.file.splice(i + 1, 0, 'docClose', 'docCloseAll');
  }
  if (M.window && !M.window.includes('docList')) M.window.unshift('docList', 'docNext', '|');
  if (M.tools && !M.tools.includes('newDocAsk')) M.tools.splice(1, 0, 'newDocAsk');
  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W') && !e.shiftKey) {
      e.preventDefault();
      D.close(D.active);
    } else if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      UI.run('docNext');
    }
  }, true);
})();
