/* VektörPad settings and panels (desktop drawing suite features, written for this app):
   - Customisation: keyboard shortcuts for any command (search, press keys to assign), and extra buttons on
     the standard toolbar.
   - Colour management settings: default colour mode, RGB working space, CMYK print condition (also used by
     colour proofing) and rendering intent.
   - Assets docker: a library on this device of saved objects and pictures, with categories and search;
     tap to place.
   - Colour docker: colour viewer (hue / saturation-brightness), sliders for RGB, CMYK, HSB and Lab, hex,
     recent colours; apply to fill or outline. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const A = VP.actions;
  const S = VP.settings;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const P5 = (VP.panels2 = {});
  const $ = (s) => document.querySelector(s);
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => x !== '|' && !x.startsWith('h:') && !x.startsWith('sub:') && M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };

  /* ======================================================================
     KEYBOARD SHORTCUTS
     ====================================================================== */
  const comboOf = (e) => {
    let k = e.key;
    if (!k || ['Control', 'Meta', 'Shift', 'Alt'].includes(k)) return null;
    if (k === ' ') k = 'Space';
    if (k.length === 1) k = k.toUpperCase();
    return (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + k;
  };
  const keymap = () => (S.keymap = S.keymap || {});
  P5.applyKbdLabels = () => {
    const km = keymap();
    Object.keys(km).forEach((id) => A[id] && (A[id].kbd = km[id]));
  };
  addEventListener('keydown', (e) => {
    if (P5.capturing) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (document.querySelector('.modal-wrap')) return;
    const c = comboOf(e);
    if (!c) return;
    const km = keymap();
    const id = Object.keys(km).find((k) => km[k] === c);
    if (!id || !A[id]) return;
    e.preventDefault();
    e.stopPropagation();
    UI.run(id);
  }, true);
  P5.shortcutsDialog = () => {
    const km = keymap();
    const ids = Object.keys(A).filter((id) => A[id] && A[id].label && !/▸$/.test(A[id].label) && !/^(vm_|proof_|bx_)/.test(id));
    ids.sort((a, b) => A[a].label.localeCompare(A[b].label, 'tr'));
    const row = (id) => '<div class="obj-row" data-id="' + esc(id) + '" style="padding-left:10px;gap:6px"><span class="row-name">' + esc(A[id].label.replace(/…$/, '')) + '</span>' +
      '<button class="btn" data-k="' + esc(id) + '" style="min-width:110px;justify-content:center;font-family:var(--font-num)">' + esc(km[id] || A[id].kbd || '—') + '</button>' +
      (km[id] ? '<button class="row-btn" data-clear="' + esc(id) + '" title="Kısayolu kaldır">×</button>' : '<span style="width:28px"></span>') + '</div>';
    UI.modal('<h2>Klavye kısayolları</h2><p class="sec-note">Bir komutun kutusuna dokunun, sonra tuşlara basın (iPad klavyesi ile). Esc: vazgeç. Ctrl, Mac/iPad’de ⌘ tuşudur.</p>' +
      '<label class="field" style="width:100%"><span>Ara</span><input data-q style="flex:1;width:auto;font-family:var(--font-ui)" placeholder="Komut adı"></label>' +
      '<div class="list" data-list style="max-height:50vh;overflow:auto">' + ids.map(row).join('') + '</div>' +
      '<div class="actions"><button class="btn danger" data-x="reset">Tümünü varsayılana döndür</button><button class="btn" data-x="export">Dışa aktar</button><button class="btn primary" data-x="no">Kapat</button></div>', (root, close) => {
      const list = root.querySelector('[data-list]');
      root.querySelector('[data-q]').addEventListener('input', (e) => {
        const q = e.target.value.toLocaleLowerCase('tr');
        list.querySelectorAll('[data-id]').forEach((r) => (r.style.display = A[r.dataset.id].label.toLocaleLowerCase('tr').includes(q) ? '' : 'none'));
      });
      const refresh = (id) => {
        const r = list.querySelector('[data-id="' + CSS.escape(id) + '"]');
        if (r) r.outerHTML = row(id);
      };
      root.addEventListener('click', (e) => {
        const kb = e.target.closest('[data-k]');
        if (kb) {
          const id = kb.dataset.k;
          kb.textContent = 'Tuşlara basın…';
          kb.classList.add('on');
          P5.capturing = true;
          const onKey = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.key === 'Escape') {
              finish();
              return refresh(id);
            }
            const c = comboOf(ev);
            if (!c) return;
            const taken = Object.keys(km).find((k) => km[k] === c && k !== id);
            if (taken) {
              delete km[taken];
              if (A[taken]) delete A[taken].kbd;
              refresh(taken);
              VP.toast(c + ' önceden “' + A[taken].label + '” içindi; o kısayol kaldırıldı');
            }
            km[id] = c;
            A[id].kbd = c;
            VP.io.savePrefs();
            finish();
            refresh(id);
          };
          const finish = () => {
            removeEventListener('keydown', onKey, true);
            P5.capturing = false;
          };
          addEventListener('keydown', onKey, true);
          return;
        }
        const cl = e.target.closest('[data-clear]');
        if (cl) {
          delete km[cl.dataset.clear];
          delete A[cl.dataset.clear].kbd;
          VP.io.savePrefs();
          return refresh(cl.dataset.clear);
        }
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'reset') {
          Object.keys(km).forEach((k) => A[k] && delete A[k].kbd);
          S.keymap = {};
          VP.io.savePrefs();
          close();
          return VP.toast('Kısayollar varsayılana döndü (yenilenince tam olarak geçerli olur)');
        }
        if (b.dataset.x === 'export') {
          const lines = Object.keys(km).map((k) => (A[k] ? A[k].label : k) + '\t' + km[k]);
          VP.io.saveFile('vektorpad-kisayollar.txt', lines.join('\n') || 'Özel kısayol yok');
          return;
        }
        close();
      });
    });
  };

  /* ---------- standard toolbar: extra buttons ---------- */
  P5.renderExtraButtons = () => {
    const bar = $('#stdbar');
    if (!bar) return;
    bar.querySelectorAll('[data-p5]').forEach((b) => b.remove());
    const list = (S.stdExtra || []).filter((id) => A[id]);
    if (!list.length) return;
    const spacer = bar.querySelector('.spacer');
    const sep = document.createElement('span');
    sep.className = 'sb-sep';
    sep.dataset.p5 = '1';
    bar.insertBefore(sep, spacer);
    list.forEach((id) => {
      const b = document.createElement('button');
      b.className = 'icon-btn';
      b.dataset.p5 = '1';
      b.title = A[id].label;
      b.setAttribute('aria-label', A[id].label);
      b.innerHTML = window.VPIcon && window.VPIcon.has(A[id].icon || '') ? ic(A[id].icon) : '<span style="font-size:11px;padding:0 4px;white-space:nowrap">' + esc(A[id].label.replace(/…$/, '').slice(0, 14)) + '</span>';
      if (!window.VPIcon.has(A[id].icon || '')) b.style.width = 'auto';
      b.addEventListener('click', () => UI.run(id));
      bar.insertBefore(b, spacer);
    });
  };
  P5.toolbarDialog = () => {
    const ids = Object.keys(A).filter((id) => A[id] && A[id].label && !/▸$/.test(A[id].label) && !/^(vm_|proof_|bx_)/.test(id)).sort((a, b) => A[a].label.localeCompare(A[b].label, 'tr'));
    const cur = new Set(S.stdExtra || []);
    UI.modal('<h2>Araç çubuğunu özelleştir</h2><p class="sec-note">Standart araç çubuğuna eklenecek komutları işaretleyin.</p>' +
      '<label class="field" style="width:100%"><span>Ara</span><input data-q style="flex:1;width:auto;font-family:var(--font-ui)"></label>' +
      '<div class="list" style="max-height:50vh;overflow:auto">' + ids.map((id) => '<label class="obj-row" data-id="' + esc(id) + '" style="padding-left:10px;gap:8px"><input type="checkbox" data-c="' + esc(id) + '"' + (cur.has(id) ? ' checked' : '') + '>' + (window.VPIcon.has(A[id].icon || '') ? ic(A[id].icon, 'sm') : '<span style="width:18px"></span>') + '<span class="row-name">' + esc(A[id].label) + '</span></label>').join('') + '</div>' +
      '<div class="actions"><button class="btn" data-x="none">Hepsini kaldır</button><button class="btn primary" data-x="ok">Tamam</button></div>', (root, close) => {
      root.querySelector('[data-q]').addEventListener('input', (e) => {
        const q = e.target.value.toLocaleLowerCase('tr');
        root.querySelectorAll('[data-id]').forEach((r) => (r.style.display = A[r.dataset.id].label.toLocaleLowerCase('tr').includes(q) ? '' : 'none'));
      });
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'none') root.querySelectorAll('[data-c]').forEach((c) => (c.checked = false));
        if (b.dataset.x === 'ok') {
          S.stdExtra = [...root.querySelectorAll('[data-c]:checked')].map((c) => c.dataset.c).slice(0, 24);
          VP.io.savePrefs();
          P5.renderExtraButtons();
          close();
        }
      });
    });
  };

  /* ======================================================================
     COLOUR MANAGEMENT SETTINGS
     ====================================================================== */
  P5.colorSettings = () => {
    const PR = (VP.work && VP.work.PROFILES) || {};
    const ext = (VP.doc.ext = VP.doc.ext || {});
    const sel = (k, items, v) => '<label class="field" style="width:100%"><span style="min-width:150px">' + esc(k) + '</span><select data-c="' + esc(items[0][2]) + '" style="flex:1;max-width:none">' + items.map(([val, l]) => '<option value="' + esc(val) + '"' + (val === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>';
    UI.modal('<h2>Renk ayarları</h2>' +
      sel('Belgenin birincil renk modu', [['CMYK', 'CMYK (baskı)', 'mode'], ['RGB', 'RGB (ekran, web)', 'mode']], ext.colorMode || 'CMYK') +
      sel('RGB çalışma alanı', [['sRGB', 'sRGB IEC61966-2.1', 'rgb'], ['P3', 'Display P3 (iPad ekranı)', 'rgb'], ['AdobeRGB', 'Adobe RGB (1998)', 'rgb']], S.rgbSpace || 'sRGB') +
      sel('CMYK baskı koşulu', Object.keys(PR).map((k) => [k, PR[k].label, 'cmyk']), S.proofProfile || 'coated') +
      sel('Görüntü oluşturma amacı', [['perceptual', 'Algısal (fotoğraflar)', 'intent'], ['relative', 'Bağıl renk ölçümsel (logolar, düz renkler)', 'intent'], ['saturation', 'Doygunluk (grafikler)', 'intent']], S.renderIntent || 'perceptual') +
      '<p class="sec-note">Baskı koşulu ve oluşturma amacı renk provasını, gamut uyarısını ve CMYK’ye dönüştürmeyi etkiler. Uygulama yaklaşık bir renk modeli kullanır; ICC profili yüklenmez. Ekran her zaman tarayıcının renk yönetimiyle (sRGB) çizilir.</p>' +
      '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Tamam</button></div>', (root, close) => {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        close();
        if (b.dataset.x !== 'yes') return;
        const v = (k) => root.querySelector('[data-c="' + k + '"]').value;
        ext.colorMode = v('mode');
        S.rgbSpace = v('rgb');
        S.proofProfile = v('cmyk');
        S.renderIntent = v('intent');
        VP.io.savePrefs();
        if (VP.work && (VP.work.proof || VP.work.gamut) && paper.view) {
          paper.view._needsUpdate = true;
          paper.view.requestUpdate();
        }
        VP.commit();
        VP.toast('Renk ayarları kaydedildi');
      });
    });
  };

  /* ======================================================================
     ASSETS DOCKER (IndexedDB library on this device)
     ====================================================================== */
  const DB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        let r;
        try {
          r = indexedDB.open('vektorpad-assets', 1);
        } catch (e) {
          return rej(e);
        }
        r.onupgradeneeded = () => r.result.createObjectStore('assets', { keyPath: 'id' });
        r.onsuccess = () => res((this.db = r.result));
        r.onerror = () => rej(r.error);
      });
    },
    async all() {
      const db = await this.open();
      return new Promise((res, rej) => {
        const q = db.transaction('assets').objectStore('assets').getAll();
        q.onsuccess = () => res(q.result || []);
        q.onerror = () => rej(q.error);
      });
    },
    async put(a) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction('assets', 'readwrite');
        t.objectStore('assets').put(a);
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
      });
    },
    async del(id) {
      const db = await this.open();
      return new Promise((res) => {
        const t = db.transaction('assets', 'readwrite');
        t.objectStore('assets').delete(id);
        t.oncomplete = () => res();
        t.onerror = () => res();
      });
    }
  };
  P5.assetDB = DB;
  const AS = (P5.assets = { list: null, q: '', cat: 'Tümü' });
  const loadAssets = async () => {
    try {
      AS.list = (await DB.all()).sort((a, b) => b.time - a.time);
    } catch (e) {
      AS.list = [];
      AS.err = true;
    }
    if (UI.dockTab === 'assets') UI.renderDock(true);
  };
  const thumbOfItems = (items) => {
    try {
      const g = new paper.Group({ insert: false });
      items.forEach((it) => g.addChild(it.clone({ insert: false })));
      const b = g.bounds;
      const res = clamp((72 * 160) / Math.max(b.width, b.height, 1), 4, 300);
      return g.rasterize(res, false).toDataURL();
    } catch (e) {
      return null;
    }
  };
  P5.saveAsset = async () => {
    if (!VP.sel.length) return VP.toast('Varlık olarak saklamak için nesne seçin');
    const name = await UI.prompt({ title: 'Varlık olarak kaydet', label: 'Ad', value: VP.sel.length === 1 && VP.describe ? VP.describe(VP.sel[0]) : VP.sel.length + ' nesne', ok: 'Kaydet' });
    if (!name) return;
    const cat = await UI.prompt({ title: 'Kategori', label: 'Kategori (ör. Logolar, Simgeler)', value: AS.cat !== 'Tümü' ? AS.cat : 'Genel', ok: 'Kaydet' });
    const items = VP.zSort(VP.sel);
    const L = new paper.Layer({ insert: false });
    items.forEach((it) => L.addChild(it.clone({ insert: false })));
    const a = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: String(name).trim(), cat: String(cat || 'Genel').trim() || 'Genel', time: Date.now(), json: L.exportJSON({ asString: true }), thumb: thumbOfItems(items) };
    try {
      await DB.put(a);
      VP.toast('Varlık kaydedildi: ' + a.name);
    } catch (e) {
      return VP.toast('Varlık kaydedilemedi (depolama dolu olabilir)');
    }
    UI.openDock('assets');
    loadAssets();
  };
  P5.placeAsset = (a) => {
    VP.ensureLayer();
    const L = new paper.Layer({ insert: false });
    L.importJSON(a.json);
    const kids = L.removeChildren();
    kids.forEach((k) => VP.activeLayer.addChild(k));
    const g = new paper.Group({ insert: false });
    const b = kids.reduce((acc, k) => (acc ? acc.unite(k.bounds) : k.bounds.clone()), null);
    if (b) VP.T.move(kids, paper.view.center.subtract(b.center));
    void g;
    VP.setSelection(kids);
    VP.commit();
    VP.toast('Yerleştirildi: ' + a.name);
  };
  const assetsPanel = () => {
    if (AS.list == null) {
      loadAssets();
      return '<p class="sec-note">Yükleniyor…</p>';
    }
    const cats = ['Tümü'].concat([...new Set(AS.list.map((a) => a.cat))].sort((a, b) => a.localeCompare(b, 'tr')));
    const q = AS.q.toLocaleLowerCase('tr');
    const shown = AS.list.filter((a) => (AS.cat === 'Tümü' || a.cat === AS.cat) && (!q || a.name.toLocaleLowerCase('tr').includes(q)));
    let h = '<div class="sec"><div class="sec-h"><h3>Varlıklar</h3></div>' +
      '<div class="row"><button class="btn primary" data-act="asSave"' + (VP.sel.length ? '' : ' disabled') + '>' + ic('plus', 'sm') + 'Seçimi kaydet</button><button class="btn" data-act="asImport">' + ic('import', 'sm') + 'Resim ekle</button></div>' +
      '<label class="field" style="width:100%"><span>Ara</span><input data-pf="asQ" value="' + esc(AS.q) + '" style="flex:1;width:auto;font-family:var(--font-ui)"></label>' +
      '<label class="field" style="width:100%"><span>Kategori</span><select data-pf="asCat" style="flex:1;max-width:none">' + cats.map((c) => '<option' + (c === AS.cat ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>';
    if (AS.err) h += '<p class="sec-note">Bu tarayıcıda yerel depolama kullanılamıyor.</p>';
    if (!shown.length) h += '<p class="sec-note">' + (AS.list.length ? 'Eşleşen varlık yok.' : 'Sık kullandığınız logoları, simgeleri ve resimleri burada saklayın; bu cihazdaki bütün belgelerde kullanılabilir. Dokunun: sayfaya yerleştir.') + '</p>';
    else h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">' + shown.map((a) => '<div style="border:1px solid var(--line);background:var(--panel-2);display:flex;flex-direction:column">' +
      '<button data-act="asPlace:' + a.id + '" style="border:0;background:#fff;height:86px;display:grid;place-items:center;padding:4px" title="Yerleştir">' + (a.thumb ? '<img src="' + esc(a.thumb) + '" style="max-width:100%;max-height:78px;object-fit:contain">' : ic('star')) + '</button>' +
      '<div class="row" style="flex-wrap:nowrap;gap:2px;padding:2px 4px"><small style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(a.name) + '">' + esc(a.name) + '</small><button class="row-btn" data-act="asDel:' + a.id + '" title="Sil" aria-label="Sil">' + ic('trash', 'sm') + '</button></div></div>').join('') + '</div>';
    return h + '</div>';
  };
  UI.panels = UI.panels || {};
  UI.panels.assets = assetsPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'assets')) UI.DOCKERS.push(['assets', 'Varlıklar']);

  /* ======================================================================
     COLOUR DOCKER
     ====================================================================== */
  const CO = (P5.color = { h: 210, s: 0.8, v: 0.7, model: 'cmyk', target: 'fill' });
  const hsv2rgb = (h, s, v) => {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  };
  const rgb2hsv = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
  };
  const toHex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgb2cmyk = (r, g, b) => {
    const k = 1 - Math.max(r, g, b) / 255;
    if (k >= 1) return [0, 0, 0, 100];
    return [(1 - r / 255 - k) / (1 - k), (1 - g / 255 - k) / (1 - k), (1 - b / 255 - k) / (1 - k), k].map((v) => Math.round(v * 100));
  };
  const cmyk2rgb = (c, m, y, k) => [255 * (1 - c / 100) * (1 - k / 100), 255 * (1 - m / 100) * (1 - k / 100), 255 * (1 - y / 100) * (1 - k / 100)];
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055);
  const rgb2lab = (r, g, b) => {
    const R = lin(r);
    const G = lin(g);
    const B = lin(b);
    const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
    const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))].map((v) => Math.round(v));
  };
  const lab2rgb = (L, a, b) => {
    const fy = (L + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    const inv = (t) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27));
    const X = inv(fx) * 0.95047;
    const Y = inv(fy);
    const Z = inv(fz) * 1.08883;
    return [gam(3.2406 * X - 1.5372 * Y - 0.4986 * Z), gam(-0.9689 * X + 1.8758 * Y + 0.0415 * Z), gam(0.0557 * X - 0.204 * Y + 1.057 * Z)].map((v) => clamp(isFinite(v) ? v : 0, 0, 255));
  };
  P5.conv = { rgb2cmyk, cmyk2rgb, rgb2lab, lab2rgb, rgb2hsv, hsv2rgb };
  const curRGB = () => hsv2rgb(CO.h, CO.s, CO.v);
  const setRGB = (rgb) => {
    const [h, s, v] = rgb2hsv(...rgb);
    if (s > 0.001 && v > 0.001) CO.h = h;
    CO.s = s;
    CO.v = v;
  };
  // the selection's colour is shown when the docker opens or the selection changes
  const syncFromSel = () => {
    const it = VP.sel[0];
    if (!it) return;
    const f = CO.target === 'fill' ? VP.getFill(it) : VP.getStroke(it);
    const rgb = f && f.color && fromHex(f.color);
    if (rgb) setRGB(rgb);
  };
  const colorPanel = () => {
    if (!CO._held) syncFromSel();
    const rgb = curRGB();
    const hx = toHex(rgb);
    const field = (lab, k, v, max, unit) => '<label class="range" style="width:100%"><span class="pb-label" style="min-width:18px">' + lab + '</span><input type="range" data-pf="coM:' + k + '" data-live="1" min="' + (max[0]) + '" max="' + max[1] + '" value="' + v + '" style="flex:1;width:auto"><output style="min-width:34px">' + v + (unit || '') + '</output></label>';
    let sl = '';
    if (CO.model === 'cmyk') {
      const c = rgb2cmyk(...rgb);
      sl = field('C', 'c', c[0], [0, 100], '%') + field('M', 'm', c[1], [0, 100], '%') + field('Y', 'y', c[2], [0, 100], '%') + field('K', 'k', c[3], [0, 100], '%');
    } else if (CO.model === 'rgb') sl = field('R', 'r', Math.round(rgb[0]), [0, 255]) + field('G', 'g', Math.round(rgb[1]), [0, 255]) + field('B', 'b', Math.round(rgb[2]), [0, 255]);
    else if (CO.model === 'hsb') sl = field('H', 'h', Math.round(CO.h), [0, 359], '°') + field('S', 's', Math.round(CO.s * 100), [0, 100], '%') + field('B', 'v', Math.round(CO.v * 100), [0, 100], '%');
    else {
      const l = rgb2lab(...rgb);
      sl = field('L', 'L', l[0], [0, 100]) + field('a', 'a', l[1], [-128, 127]) + field('b', 'bb', l[2], [-128, 127]);
    }
    const cmyk = rgb2cmyk(...rgb);
    const oog = VP.work && VP.work.proofColor ? VP.work.proofColor(rgb[0], rgb[1], rgb[2], VP.work.PROFILES[S.proofProfile || 'coated'])[3] : false;
    return '<div class="sec"><div class="sec-h"><h3>Renk</h3></div>' +
      '<div class="row"><span class="seg">' + [['fill', 'Dolgu'], ['stroke', 'Anahat']].map(([k, l]) => '<button data-act="coTarget:' + k + '" class="' + (CO.target === k ? 'on' : '') + '">' + l + '</button>').join('') + '</span>' +
      '<span style="width:46px;height:30px;border:1px solid var(--line);background:' + hx + '" title="' + hx + '"></span>' + (oog ? '<span class="pb-warn" title="Baskıda daha soluk çıkar">⚠ gamut dışı</span>' : '') + '</div>' +
      '<div style="display:flex;gap:6px;touch-action:none"><canvas data-sv width="200" height="140" style="flex:1;min-width:0;height:140px;border:1px solid var(--line);touch-action:none"></canvas><canvas data-hue width="22" height="140" style="width:22px;height:140px;border:1px solid var(--line);touch-action:none"></canvas></div>' +
      '<div class="row"><span class="seg">' + [['cmyk', 'CMYK'], ['rgb', 'RGB'], ['hsb', 'HSB'], ['lab', 'Lab']].map(([k, l]) => '<button data-act="coModel:' + k + '" class="' + (CO.model === k ? 'on' : '') + '">' + l + '</button>').join('') + '</span></div>' + sl +
      '<div class="row"><label class="field"><span>HEX</span><input data-pf="coHex" value="' + hx + '" style="width:80px"></label><span class="sec-note">C' + cmyk[0] + ' M' + cmyk[1] + ' Y' + cmyk[2] + ' K' + cmyk[3] + '</span></div>' +
      '<div class="row"><button class="btn primary" data-act="coApply:fill">Dolguya uygula</button><button class="btn" data-act="coApply:stroke">Anahata uygula</button><button class="btn icon-only" data-act="coEye" title="Damlalık">' + ic('eyedropper', 'sm') + '</button></div>' +
      (UI.recent && UI.recent.length ? '<div class="row" style="gap:3px">' + UI.recent.map((c) => '<button data-act="coRecent:' + c + '" title="' + c + '" style="width:24px;height:22px;border:1px solid rgba(0,0,0,.2);background:' + c + '"></button>').join('') + '</div>' : '') +
      '</div>';
  };
  UI.panels.color = colorPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'color')) UI.DOCKERS.push(['color', 'Renk']);
  // the viewer canvases are drawn after the docker renders
  const drawViewer = () => {
    const sv = document.querySelector('#dock-body canvas[data-sv]');
    const hue = document.querySelector('#dock-body canvas[data-hue]');
    if (!sv || !hue) return;
    const c = sv.getContext('2d');
    const W = sv.width;
    const Hh = sv.height;
    const base = toHex(hsv2rgb(CO.h, 1, 1));
    let g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#fff');
    g.addColorStop(1, base);
    c.fillStyle = g;
    c.fillRect(0, 0, W, Hh);
    g = c.createLinearGradient(0, 0, 0, Hh);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, '#000');
    c.fillStyle = g;
    c.fillRect(0, 0, W, Hh);
    c.strokeStyle = CO.v > 0.5 ? '#000' : '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(CO.s * W, (1 - CO.v) * Hh, 6, 0, Math.PI * 2);
    c.stroke();
    const h = hue.getContext('2d');
    const hg = h.createLinearGradient(0, 0, 0, hue.height);
    [0, 60, 120, 180, 240, 300, 360].forEach((d) => hg.addColorStop(d / 360, toHex(hsv2rgb(d % 360, 1, 1))));
    h.fillStyle = hg;
    h.fillRect(0, 0, hue.width, hue.height);
    h.fillStyle = '#fff';
    h.strokeStyle = '#000';
    const y = (CO.h / 360) * hue.height;
    h.fillRect(0, y - 2, hue.width, 4);
    h.strokeRect(0, y - 2, hue.width, 4);
    const drag = (cv, fn) => {
      if (cv._p5) return;
      cv._p5 = true;
      const at = (e) => {
        const r = cv.getBoundingClientRect();
        fn(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1));
        CO._held = true;
        drawViewer();
        const sw = document.querySelector('#dock-body .row span[title^="#"]');
        if (sw) {
          sw.style.background = toHex(curRGB());
          sw.title = toHex(curRGB());
        }
      };
      cv.addEventListener('pointerdown', (e) => {
        cv.setPointerCapture(e.pointerId);
        at(e);
        const mv = (ev) => at(ev);
        const up = () => {
          cv.removeEventListener('pointermove', mv);
          cv.removeEventListener('pointerup', up);
          UI.renderDock(true);
          CO._held = false;
        };
        cv.addEventListener('pointermove', mv);
        cv.addEventListener('pointerup', up);
      });
    };
    drag(sv, (x, y) => {
      CO.s = x;
      CO.v = 1 - y;
    });
    drag(hue, (x, y) => {
      CO.h = y * 359.9;
    });
  };
  const rd0 = UI.renderDock;
  UI.renderDock = function (force) {
    const r = rd0.apply(this, arguments);
    if (UI.dockTab === 'color') drawViewer();
    return r;
  };
  VP.on('selection', () => {
    if (UI.dockTab === 'color' && !CO._held) UI.schedule('dock');
  });

  /* ======================================================================
     dispatch, actions, menus
     ====================================================================== */
  P5.propField = (name, raw, el) => {
    const [k, arg] = name.split(':');
    if (k === 'asQ') {
      AS.q = String(raw || '');
      UI.renderDock(true);
      return true;
    }
    if (k === 'asCat') {
      AS.cat = raw;
      UI.renderDock(true);
      return true;
    }
    if (k === 'coHex') {
      const rgb = fromHex(String(raw).trim().replace(/^([0-9a-f]{6})$/i, '#$1'));
      if (rgb) setRGB(rgb);
      CO._held = true;
      UI.renderDock(true);
      CO._held = false;
      return true;
    }
    if (k === 'coM') {
      const v = +raw;
      let rgb = curRGB();
      if (CO.model === 'cmyk') {
        const c = rgb2cmyk(...rgb);
        c['cmyk'.indexOf(arg)] = v;
        rgb = cmyk2rgb(...c);
      } else if (CO.model === 'rgb') rgb['rgb'.indexOf(arg)] = v;
      else if (CO.model === 'hsb') {
        if (arg === 'h') CO.h = v;
        if (arg === 's') CO.s = v / 100;
        if (arg === 'v') CO.v = v / 100;
        rgb = null;
      } else {
        const l = rgb2lab(...rgb);
        l[{ L: 0, a: 1, bb: 2 }[arg]] = v;
        rgb = lab2rgb(...l);
      }
      if (rgb) setRGB(rgb);
      CO._held = true;
      if (el && el.nextElementSibling) el.nextElementSibling.textContent = v + (CO.model === 'cmyk' || (CO.model === 'hsb' && arg !== 'h') ? '%' : CO.model === 'hsb' ? '°' : '');
      drawViewer();
      const sw = document.querySelector('#dock-body .row span[title^="#"]');
      if (sw) sw.style.background = toHex(curRGB());
      if (UI._rangeDone || !(el && el.dataset.live)) {
        UI.renderDock(true);
        CO._held = false;
      }
      return true;
    }
    return true;
  };
  P5.act = (id, el) => {
    const i = id.indexOf(':');
    const k = i < 0 ? id : id.slice(0, i);
    const arg = i < 0 ? '' : id.slice(i + 1);
    switch (k) {
      case 'asSave': P5.saveAsset(); return true;
      case 'asImport': {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*,.svg';
        inp.multiple = true;
        inp.onchange = async () => {
          for (const f of [...inp.files].slice(0, 30)) {
            const url = await new Promise((res) => {
              const fr = new FileReader();
              fr.onload = () => res(fr.result);
              fr.readAsDataURL(f);
            });
            const L = new paper.Layer({ insert: false });
            const r = new paper.Raster({ source: url, insert: false });
            L.addChild(r);
            await DB.put({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: f.name.replace(/\.[^.]+$/, ''), cat: AS.cat !== 'Tümü' ? AS.cat : 'Resimler', time: Date.now(), json: L.exportJSON({ asString: true }), thumb: url.length < 400000 ? url : null });
          }
          loadAssets();
          VP.toast(inp.files.length + ' resim varlıklara eklendi');
        };
        inp.click();
        return true;
      }
      case 'asPlace': {
        const a = (AS.list || []).find((x) => x.id === arg);
        if (a) P5.placeAsset(a);
        return true;
      }
      case 'asDel':
        DB.del(arg).then(loadAssets);
        return true;
      case 'coTarget': CO.target = arg; UI.renderDock(true); return true;
      case 'coModel': CO.model = arg; CO._held = true; UI.renderDock(true); CO._held = false; return true;
      case 'coApply': {
        const hx = toHex(curRGB());
        UI.addRecent(hx);
        UI.applyColor(hx, arg);
        UI.schedule('palette', 'dock', 'status');
        return true;
      }
      case 'coRecent': {
        const rgb = fromHex(arg);
        if (rgb) setRGB(rgb);
        CO._held = true;
        UI.renderDock(true);
        CO._held = false;
        return true;
      }
      case 'coEye': VP.setTool('eyedropper'); VP.toast('Damlalık: bir renge dokunun'); return true;
      default: return false;
    }
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^(as[QC]|co(Hex|M:))/.test(n) ? P5.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^(as(Save|Import|Place|Del)|co(Target|Model|Apply|Recent|Eye))/.test(id) ? P5.act(id, el) : act0(id, el));
  Object.assign(A, {
    customShortcuts: { label: 'Klavye kısayollarını özelleştir…', run: () => P5.shortcutsDialog() },
    customToolbar: { label: 'Araç çubuğunu özelleştir…', run: () => P5.toolbarDialog() },
    colorSettings: { label: 'Renk ayarları…', icon: 'palette', run: () => P5.colorSettings() },
    dockAssets: { label: 'Varlıklar paneli', icon: 'star', run: () => UI.openDock('assets') },
    assetSave: { label: 'Varlık olarak kaydet…', enabled: () => VP.sel.length > 0, run: () => P5.saveAsset() },
    dockColor: { label: 'Renk paneli', icon: 'palette', run: () => UI.openDock('color') }
  });
  ins('tools', 'options', ['h:Özelleştirme', 'customShortcuts', 'customToolbar', 'colorSettings']);
  ins('window', 'dockCoords', ['dockColor', 'dockAssets']);
  ins('object', null, ['assetSave']);
  // the rendering intent shapes the colour proofing curve
  if (VP.work && VP.work.proofColor) {
    const pc0 = VP.work.proofColor;
    VP.work.proofColor = (r, g, b, prof) => {
      const it = S.renderIntent || 'perceptual';
      if (it === 'perceptual') return pc0(r, g, b, prof);
      const p2 = Object.assign({}, prof, { sat: prof.sat * (it === 'saturation' ? 1.08 : 1.02) });
      return pc0(r, g, b, p2);
    };
  }
  const start = () => {
    P5.applyKbdLabels();
    P5.renderExtraButtons();
  };
  if (document.readyState === 'complete') setTimeout(start, 0);
  else addEventListener('load', () => setTimeout(start, 0));
})();
