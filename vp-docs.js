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

  /* =============== Create a New Document =============== */
  const MM = (px, dpi) => (px * 25.4) / dpi;
  D.PRESETS = [
    ['print', 'Varsayılan baskı (A4)', { size: 'A4', orient: 'p', color: 'CMYK', dpi: 300 }],
    ['web', 'Web (1920 × 1080 px)', { size: 'custom', w: MM(1920, 96), h: MM(1080, 96), orient: 'l', color: 'RGB', dpi: 96 }],
    ['social', 'Sosyal medya kare (1080 × 1080 px)', { size: 'custom', w: MM(1080, 96), h: MM(1080, 96), orient: 'p', color: 'RGB', dpi: 96 }],
    ['story', 'Hikâye (1080 × 1920 px)', { size: 'custom', w: MM(1080, 96), h: MM(1920, 96), orient: 'p', color: 'RGB', dpi: 96 }],
    ['card', 'Kartvizit (85 × 55 mm)', { size: 'Kartvizit', orient: 'l', color: 'CMYK', dpi: 300 }],
    ['poster', 'Afiş (50 × 70 cm)', { size: 'Afis', orient: 'p', color: 'CMYK', dpi: 150 }],
    ['custom', 'Özel', {}]
  ];
  const sizeOf = (s) => {
    const p = VP.PAGE_PRESETS.find((x) => x.id === s.size);
    let w = p ? p.w : +s.w || 210;
    let h = p ? p.h : +s.h || 297;
    if ((s.orient === 'l') !== w > h && w !== h) [w, h] = [h, w];
    return { w, h };
  };
  D.create = (s) => {
    const { w, h } = sizeOf(s);
    const doc = VP.newDoc(s.name || D.nextName());
    const n = clamp(Math.round(+s.pages || 1), 1, 200);
    doc.pages = [];
    for (let i = 1; i <= n; i++) doc.pages.push(VP.newPage(i, w, h));
    doc.ext = { colorMode: s.color || 'CMYK', dpi: +s.dpi || 300 };
    D.add(doc);
    VP.fitPage();
    VP.toast('Yeni belge: ' + doc.name + ' · ' + VP.num(w, 1) + ' × ' + VP.num(h, 1) + ' mm' + (n > 1 ? ' · ' + n + ' sayfa' : ''));
  };
  D.newDialog = () => {
    const last = VP.settings.newDocLast || {};
    const s = Object.assign({ preset: 'print', size: 'A4', w: 210, h: 297, orient: 'p', pages: 1, color: 'CMYK', dpi: 300 }, last, { name: D.nextName() });
    if (VP.settings.newDocNoDialog) return D.create(s);
    const preview = () => {
      const { w, h } = sizeOf(s);
      const k = 70 / Math.max(w, h);
      return '<svg width="90" height="90" viewBox="0 0 90 90" aria-hidden="true"><rect x="' + (45 - (w * k) / 2 + 3) + '" y="' + (45 - (h * k) / 2 + 3) + '" width="' + w * k + '" height="' + h * k + '" fill="rgba(0,0,0,.25)"/><rect x="' + (45 - (w * k) / 2) + '" y="' + (45 - (h * k) / 2) + '" width="' + w * k + '" height="' + h * k + '" fill="#fff" stroke="#333" stroke-width="1"/></svg>';
    };
    const sizeOpts = VP.PAGE_PRESETS.map((p) => [p.id, p.label]).concat([['custom', 'Özel']]);
    const render = (root) => {
      const { w, h } = sizeOf(s);
      root.innerHTML =
        '<h2>Yeni Belge Oluştur</h2>' +
        '<div style="display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:12px;align-items:start"><div style="display:flex;flex-direction:column;gap:8px">' +
        '<label class="field wide"><span>Ad</span><input data-nd="name" value="' + esc(s.name) + '" style="width:170px" spellcheck="false"></label>' +
        '<label class="field"><span>Hazır ayar</span><select data-nd="preset">' + D.PRESETS.map(([k, l]) => '<option value="' + k + '"' + (k === s.preset ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span>Sayfa sayısı</span><input data-nd="pages" value="' + s.pages + '" inputmode="numeric" style="width:50px"></label>' +
        '<label class="field"><span>Sayfa boyutu</span><select data-nd="size">' + sizeOpts.map(([k, l]) => '<option value="' + k + '"' + (k === s.size ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
        '<div class="row"><label class="field"><span>Genişlik</span><input data-nd="w" value="' + VP.num(w, 1) + '" inputmode="decimal"><span class="unit">mm</span></label>' +
        '<label class="field"><span>Yükseklik</span><input data-nd="h" value="' + VP.num(h, 1) + '" inputmode="decimal"><span class="unit">mm</span></label></div>' +
        '<div class="row"><span class="opt-label">Yön</span><span class="seg"><button data-orient="p" class="' + (s.orient === 'p' ? 'on' : '') + '">Dikey</button><button data-orient="l" class="' + (s.orient === 'l' ? 'on' : '') + '">Yatay</button></span></div>' +
        '<div class="row"><span class="opt-label">Birincil renk modu</span><span class="seg"><button data-color="CMYK" class="' + (s.color === 'CMYK' ? 'on' : '') + '">CMYK</button><button data-color="RGB" class="' + (s.color === 'RGB' ? 'on' : '') + '">RGB</button></span></div>' +
        '<label class="field"><span>Görüntü çözünürlüğü</span><select data-nd="dpi">' + [72, 96, 150, 300, 600].map((d) => '<option value="' + d + '"' + (+s.dpi === d ? ' selected' : '') + '>' + d + ' dpi</option>').join('') + '</select></label>' +
        '</div><div style="display:grid;place-items:center;border:1px solid var(--line);background:var(--paste);height:96px">' + preview() + '</div></div>' +
        '<label class="field"><input type="checkbox" data-nd="noask"' + (VP.settings.newDocNoDialog ? ' checked' : '') + '><span style="text-transform:none">Bu iletişim kutusunu bir daha gösterme</span></label>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Tamam</button></div>';
    };
    UI.modal('', (root, close) => {
      render(root);
      const read = () => {
        root.querySelectorAll('[data-nd]').forEach((el) => {
          const k = el.dataset.nd;
          if (k === 'noask') return;
          if (k === 'w' || k === 'h') {
            const v = VP.parseNum(el.value);
            if (v > 1 && Math.abs(v - sizeOf(s)[k]) > 0.05) {
              const cur = sizeOf(s);
              s.size = 'custom';
              s.preset = 'custom';
              s.w = k === 'w' ? v : cur.w;
              s.h = k === 'h' ? v : cur.h;
              s.orient = s.w > s.h ? 'l' : 'p';
            }
          } else if (k !== 'preset' && k !== 'size') s[k] = el.value;
        });
      };
      root.addEventListener('change', (ev) => {
        const el = ev.target;
        if (el.dataset.nd === 'preset') {
          read();
          s.preset = el.value;
          const p = (D.PRESETS.find((x) => x[0] === el.value) || [])[2] || {};
          Object.assign(s, p);
          render(root);
        } else if (el.dataset.nd === 'size') {
          read();
          s.size = el.value;
          if (el.value !== 'custom') s.preset = 'custom';
          render(root);
        } else if (el.dataset.nd === 'w' || el.dataset.nd === 'h') {
          read();
          render(root);
        }
      });
      root.addEventListener('click', (ev) => {
        const o = ev.target.closest('[data-orient]');
        if (o) {
          read();
          if (s.size === 'custom') {
            const cur = sizeOf(s);
            if ((o.dataset.orient === 'l') !== cur.w > cur.h) [s.w, s.h] = [cur.h, cur.w];
          }
          s.orient = o.dataset.orient;
          return render(root);
        }
        const c = ev.target.closest('[data-color]');
        if (c) {
          read();
          s.color = c.dataset.color;
          return render(root);
        }
        const x = ev.target.closest('[data-x]');
        if (!x) return;
        if (x.dataset.x === 'yes') {
          read();
          VP.settings.newDocNoDialog = !!root.querySelector('[data-nd="noask"]').checked;
          const keep = Object.assign({}, s);
          delete keep.name;
          VP.settings.newDocLast = keep;
          VP.io.savePrefs();
          close();
          D.create(s);
          return;
        }
        close();
      });
      setTimeout(() => {
        const n = root.querySelector('[data-nd="name"]');
        if (n && !VP.coarse) n.select();
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
    newQuick: { label: 'Yeni (iletişim kutusu olmadan)', run: () => D.create(Object.assign({}, VP.settings.newDocLast || { size: 'A4', orient: 'p', pages: 1 }, { name: D.nextName() })) },
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
