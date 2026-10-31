/* VektörPad font manager (written for this app): fonts from files on the iPad (.ttf, .otf, .woff, .woff2)
   and Google Fonts by name join the font lists. Font files are kept on this device and come back on the next
   start; they also work for "convert to curves", envelopes and perspective (outlines read with opentype.js). */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const A = VP.actions;
  const S = VP.settings;
  const FM = (VP.fontsMgr = { user: {}, ot: {} });
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => x !== '|' && !x.startsWith('h:') && !x.startsWith('sub:') && M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };
  const DB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        let r;
        try {
          r = indexedDB.open('vektorpad-fonts', 1);
        } catch (e) {
          return rej(e);
        }
        r.onupgradeneeded = () => r.result.createObjectStore('fonts', { keyPath: 'name' });
        r.onsuccess = () => res((this.db = r.result));
        r.onerror = () => rej(r.error);
      });
    },
    async all() {
      const db = await this.open();
      return new Promise((res) => {
        const q = db.transaction('fonts').objectStore('fonts').getAll();
        q.onsuccess = () => res(q.result || []);
        q.onerror = () => res([]);
      });
    },
    async put(f) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction('fonts', 'readwrite');
        t.objectStore('fonts').put(f);
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
      });
    },
    async del(name) {
      const db = await this.open();
      return new Promise((res) => {
        const t = db.transaction('fonts', 'readwrite');
        t.objectStore('fonts').delete(name);
        t.oncomplete = () => res();
        t.onerror = () => res();
      });
    }
  };
  const addToList = (name) => {
    if (!VP.FONTS.includes(name)) VP.FONTS.push(name);
    UI.schedule && UI.schedule('prop', 'dock');
  };
  // registers a font file (ArrayBuffer) under its own family name
  FM.register = async (buf, fallbackName) => {
    let name = fallbackName;
    let ot = null;
    try {
      ot = window.opentype ? opentype.parse(buf) : null;
      const n = ot && ot.names && (ot.names.typographicFamily || ot.names.fontFamily);
      if (n) name = n.en || Object.values(n)[0] || name;
    } catch (e) {
      ot = null; // woff2 and some files cannot be read for outlines; the font still draws
    }
    name = String(name || 'Yazı tipi').trim();
    const ff = new FontFace(name, buf);
    await ff.load();
    document.fonts.add(ff);
    FM.user[name] = true;
    if (ot) FM.ot[name.toLowerCase()] = ot;
    addToList(name);
    return name;
  };
  FM.loadFiles = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
    inp.multiple = true;
    inp.onchange = async () => {
      const done = [];
      const bad = [];
      for (const f of [...inp.files].slice(0, 40)) {
        try {
          const buf = await f.arrayBuffer();
          const name = await FM.register(buf.slice(0), f.name.replace(/\.[^.]+$/, ''));
          await DB.put({ name, file: f.name, data: buf, time: Date.now() }).catch(() => {});
          done.push(name);
        } catch (e) {
          bad.push(f.name);
        }
      }
      VP.toast((done.length ? 'Yüklendi: ' + done.join(', ') : 'Yazı tipi yüklenemedi') + (bad.length ? ' · Okunamadı: ' + bad.join(', ') : ''));
    };
    inp.click();
  };
  FM.addGoogle = async (name) => {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (!name) return false;
    if (!document.querySelector('link[data-gf="' + CSS.escape(name) + '"]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.dataset.gf = name;
      l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name).replace(/%20/g, '+') + ':ital,wght@0,400;0,700;1,400;1,700&display=swap';
      document.head.appendChild(l);
      await new Promise((res) => {
        l.onload = res;
        l.onerror = res;
        setTimeout(res, 5000);
      });
    }
    let ok = false;
    try {
      const got = await document.fonts.load('24px "' + name + '"');
      ok = got && got.length > 0;
    } catch (e) {
      ok = false;
    }
    if (!ok) return false;
    S.gfonts = Array.from(new Set((S.gfonts || []).concat([name])));
    VP.io.savePrefs();
    addToList(name);
    return true;
  };
  FM.googleDialog = async () => {
    const name = await UI.prompt({ title: 'Google yazı tipi ekle', label: 'Yazı tipi adı (fonts.google.com’daki gibi, ör. Montserrat, Nunito, Roboto Slab)', value: '', ok: 'Ekle' });
    if (!name) return;
    VP.toast('Yükleniyor: ' + name + '…');
    const ok = await FM.addGoogle(name);
    VP.toast(ok ? name + ' eklendi · Yazı tipi listesinde' : '“' + name + '” bulunamadı · Adı fonts.google.com’daki gibi yazın');
  };
  FM.manage = async () => {
    const files = await DB.all().catch(() => []);
    const g = S.gfonts || [];
    const row = (label, kind, key) => '<div class="obj-row" style="padding-left:10px"><span class="row-name" style="font-family:\'' + esc(label) + '\'">' + esc(label) + '</span><small style="color:var(--muted)">' + kind + '</small><button class="row-btn" data-del="' + esc(key) + '" title="Kaldır">' + ic('trash', 'sm') + '</button></div>';
    UI.modal('<h2>Yazı tipleri</h2><p class="sec-note">Uygulamayla gelenler: ' + esc(VP.FONTS.filter((f) => !FM.user[f] && !g.includes(f)).join(', ')) + '</p>' +
      '<div class="list" style="max-height:45vh;overflow:auto">' + (files.map((f) => row(f.name, 'dosya', 'f:' + f.name)).join('') + g.map((n) => row(n, 'Google', 'g:' + n)).join('') || '<p class="sec-note" style="padding:8px">Eklenmiş yazı tipi yok.</p>') + '</div>' +
      '<div class="actions"><button class="btn" data-x="file">' + ic('open', 'sm') + 'Dosyadan yükle…</button><button class="btn" data-x="google">Google yazı tipi…</button><button class="btn primary" data-x="no">Kapat</button></div>', (root, close) => {
      root.addEventListener('click', async (e) => {
        const d = e.target.closest('[data-del]');
        if (d) {
          const [k, n] = [d.dataset.del.slice(0, 1), d.dataset.del.slice(2)];
          if (k === 'f') await DB.del(n);
          else S.gfonts = (S.gfonts || []).filter((x) => x !== n);
          VP.io.savePrefs();
          const i = VP.FONTS.indexOf(n);
          if (i >= 0) VP.FONTS.splice(i, 1);
          delete FM.user[n];
          d.closest('.obj-row').remove();
          VP.toast(n + ' listeden kaldırıldı (kullanan metinler yedek yazı tipiyle görünür)');
          return;
        }
        const b = e.target.closest('[data-x]');
        if (!b) return;
        close();
        if (b.dataset.x === 'file') FM.loadFiles();
        if (b.dataset.x === 'google') FM.googleDialog();
      });
    });
  };
  // outlines of loaded font files for "convert to curves" and the warping effects
  const ttp0 = VP.textToPath;
  VP.textToPath = (t) => {
    const ot = FM.ot[String(t.fontFamily || '').toLowerCase()];
    if (!ot) return ttp0(t);
    const fam = t.fontFamily;
    const g0 = VP.getOTFont;
    VP.getOTFont = () => ot;
    t.fontFamily = 'Fira Sans';
    let r = null;
    try {
      r = ttp0(t);
    } finally {
      VP.getOTFont = g0;
      if (!r) t.fontFamily = fam;
    }
    return r;
  };
  Object.assign(A, {
    fontLoad: { label: 'Yazı tipi yükle (dosya)…', icon: 'open', run: () => FM.loadFiles() },
    fontGoogle: { label: 'Google yazı tipi ekle…', run: () => FM.googleDialog() },
    fontManage: { label: 'Yazı tiplerini yönet…', run: () => FM.manage() }
  });
  ins('text', 'insertGlyph', ['fontLoad', 'fontGoogle', 'fontManage']);
  // fonts come back on start
  const start = async () => {
    try {
      const files = await DB.all();
      for (const f of files) {
        try {
          await FM.register(f.data.slice(0), f.name);
        } catch (e) { /* a font that no longer loads is skipped */ }
      }
    } catch (e) { /* no storage */ }
    for (const n of S.gfonts || []) FM.addGoogle(n).catch(() => {});
  };
  if (document.readyState === 'complete') setTimeout(start, 0);
  else addEventListener('load', () => setTimeout(start, 0));
})();
