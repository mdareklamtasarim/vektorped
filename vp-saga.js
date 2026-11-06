/* "Saga Standart": print-and-cut for Saga cutting plotters through CutArtist, as the Saga plug-in for CorelDRAW does.
   CutArtist is started as  CutArtist.exe -f <print.pdf> <cut.plt>. The PLT is HPGL with Saga's header:
     PS<page length>,<page width>,<top>,<left>,<marks>,<mark diameter>;MD0,0,<mark span x>,<mark span y>,<marks>;IN;PA;SP1;SP2; ... PU;!PG;
   in 1/40 mm. X runs down the page from the top-left mark, Y runs across from it (the sheet is fed long side first). */
(() => {
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const IO = VP.io;
  const EC = VP.ecut;
  if (!EC) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const SG = (VP.saga = {});
  const U = 40; // plotter units per mm
  const DEF = { top: 10, left: 10, right: 10, bottom: 10, dia: 5 };
  const S = () => (VP.settings.saga = Object.assign({}, DEF, VP.settings.saga || {}));
  const mm = (v) => VP.toMM(v);
  const r = (v) => Math.round(v);

  /* ---------- registration marks: filled circles inside the page corners ---------- */
  SG.marks = () => {
    const s = S();
    const page = VP.pageRect();
    const L = EC.layer('marks');
    L.removeChildren();
    const rad = VP.toPT(s.dia) / 2;
    const pts = [
      [page.left + VP.toPT(s.left), page.top + VP.toPT(s.top)],
      [page.right - VP.toPT(s.right), page.top + VP.toPT(s.top)],
      [page.right - VP.toPT(s.right), page.bottom - VP.toPT(s.bottom)],
      [page.left + VP.toPT(s.left), page.bottom - VP.toPT(s.bottom)]
    ];
    const g = new paper.Group({ insert: false });
    g.name = 'Saga işaretleri';
    pts.forEach(([x, y]) => {
      const c = new paper.Path.Circle(new paper.Point(x, y), rad);
      c.fillColor = new paper.Color('#000000');
      c.strokeColor = null;
      g.addChild(c);
    });
    g.data = { ecMarks: true, saga: true, box: [page.x, page.y, page.width, page.height] };
    L.addChild(g);
    L.locked = true;
    VP.commit();
    VP.toast('4 Saga işareti eklendi · ' + s.dia + ' mm, kenarlardan ' + s.top + ' mm');
  };

  /* ---------- selected objects become cut lines ---------- */
  SG.setCut = () => {
    const items = VP.sel.filter((it) => !(it.layer && it.layer.data && it.layer.data.ecut));
    if (!items.length) return VP.toast('Önce kesilecek nesneleri seçin');
    const L = EC.layer('cut');
    items.forEach((it) => L.addChild(it));
    VP.setSelection(items);
    VP.commit();
    VP.toast(items.length + ' nesne kesim katmanına taşındı (yazdırılmaz, kesilir)');
  };

  /* ---------- PLT ---------- */
  const pathsOf = (item, out) => {
    if (!item.visible) return out;
    if (item instanceof paper.Group || item instanceof paper.Layer) item.children.forEach((c) => pathsOf(c, out));
    else if (item instanceof paper.CompoundPath) item.children.forEach((c) => pathsOf(c, out));
    else if (item instanceof paper.Shape) {
      const p = item.toPath(false);
      p.transform(item.globalMatrix);
      out.push(p);
    } else if (item instanceof paper.Path && item.segments.length > 1) {
      const p = item.clone({ insert: false, deep: false });
      p.transform(item.parent ? item.parent.globalMatrix : new paper.Matrix());
      out.push(p);
    } else if (item instanceof paper.TextItem) out.skipped = (out.skipped || 0) + 1;
    return out;
  };
  SG.plt = () => {
    const s = S();
    const L = EC.findLayer('cut');
    if (!L || !L.children.length) return null;
    const page = VP.pageRect();
    const H = mm(page.height);
    const W = mm(page.width);
    const tol = VP.toPT(0.05);
    // page point -> plotter units: X down from the top mark, Y across from the left mark
    const pu = (pt) => r((mm(pt.y - page.top) - s.top) * U) + ',' + r((mm(pt.x - page.left) - s.left) * U);
    let n = 0;
    const body = [];
    const paths = pathsOf(L, []);
    paths.forEach((p) => {
      p.flatten(tol);
      const pts = p.segments.map((g) => g.point);
      if (p.closed && pts.length) pts.push(pts[0]);
      if (pts.length < 2) return;
      body.push('PU' + pu(pts[0]) + ';PD' + pts.slice(1).map(pu).join(',') + ';');
      n++;
    });
    if (!n) return null;
    const head =
      'PS' + r(H * U) + ',' + r(W * U) + ',' + r(s.top * U) + ',' + r(s.left * U) + ',4,' + r(s.dia * U) + ';' +
      'MD0,0,' + r((H - s.top - s.bottom) * U) + ',' + r((W - s.left - s.right) * U) + ',4;IN;PA;SP1;SP2;';
    return { text: head + body.join('') + 'PU;!PG;', count: n, skipped: paths.skipped || 0 };
  };

  /* ---------- print PDF (everything but the cut lines) ---------- */
  const printPdf = async () => {
    const got = [];
    const save0 = IO.saveFile;
    IO.saveFile = async (name, data) => {
      got.push(data);
      return true;
    };
    try {
      await EC.exportPrint();
    } finally {
      IO.saveFile = save0;
    }
    const d = got[0];
    if (!d) return null;
    return d instanceof Blob ? d : new Blob([d], { type: 'application/pdf' });
  };

  /* ---------- the CutArtist folder (C:\Users\Public\Documents\SagaCommonPlugin), remembered ---------- */
  const DB = 'vektorpad-saga';
  const idb = (mode, fn) =>
    new Promise((res, rej) => {
      const q = indexedDB.open(DB, 1);
      q.onupgradeneeded = () => q.result.createObjectStore('h');
      q.onerror = () => rej(q.error);
      q.onsuccess = () => {
        const tx = q.result.transaction('h', mode);
        const st = tx.objectStore('h');
        const rq = fn(st);
        tx.oncomplete = () => res(rq && rq.result);
        tx.onerror = () => rej(tx.error);
      };
    });
  const getDir = async (ask) => {
    let h = null;
    try {
      h = await idb('readonly', (st) => st.get('dir'));
    } catch (e) {
      h = null;
    }
    if (h && (await h.queryPermission({ mode: 'readwrite' })) === 'granted') return h;
    if (h && (await h.requestPermission({ mode: 'readwrite' })) === 'granted') return h;
    if (!ask) return null;
    h = await window.showDirectoryPicker({ id: 'saga', mode: 'readwrite', startIn: 'documents' });
    await idb('readwrite', (st) => st.put(h, 'dir'));
    return h;
  };
  const writeFile = async (dir, name, data) => {
    const f = await dir.getFileHandle(name, { create: true });
    const w = await f.createWritable();
    await w.write(data);
    await w.close();
  };

  // first use: say which folder to pick; the button press lets the browser open its folder picker
  const pickDir = () =>
    new Promise((res) => {
      UI.modal(
        '<h2>CutArtist klasörünü seçin</h2>' +
          '<p>VektörPad kesim işini, Corel’deki Saga eklentisi gibi CutArtist’in klasörüne yazar. Açılan pencerede şu klasörü seçin:</p>' +
          '<p><b>C:\\Users\\Public\\Documents\\SagaCommonPlugin</b><br><span class="sec-note">(Bu Bilgisayar › Yerel Disk C: › Kullanıcılar › Ortak › Ortak Belgeler › SagaCommonPlugin)</span></p>' +
          '<p class="sec-note">Bu seçim bir kez yapılır. Sonra masaüstündeki “VektörPad - CutArtist” kısayoluyla iş CutArtist’te açılır.</p>' +
          '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="pick">Klasörü seç…</button></div>',
        (root, close) => {
          root.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-x]');
            if (!b) return;
            close();
            if (b.dataset.x !== 'pick') return res(null);
            try {
              res(await getDir(true));
            } catch (err) {
              res(err && err.name === 'AbortError' ? null : undefined);
            }
          });
        }
      );
    });

  SG.send = async (opts = {}) => {
    const job = SG.plt();
    if (!job) return VP.toast('Kesim katmanında çizgi yok · Nesneleri seçip "Kesim Çizgisi Yap" deyin');
    if (job.skipped) VP.toast('Kesim katmanındaki ' + job.skipped + ' metin atlandı · Kesmek için önce eğriye dönüştürün');
    // the folder is asked for before the slow PDF step, while the click still counts as the user's
    let dir = null;
    if (!opts.download && window.showDirectoryPicker) {
      try {
        dir = await getDir(false);
      } catch (e) {
        dir = null;
      }
      if (!dir) {
        dir = await pickDir();
        if (dir === null) return VP.toast('İptal edildi');
      }
    }
    if (!EC.findLayer('marks')) SG.marks();
    VP.toast('Kesim işi hazırlanıyor…');
    const pdf = await printPdf();
    const plt = new Blob([job.text], { type: 'application/vnd.hp-hpgl' });
    if (dir) {
      try {
        if (!pdf) throw new Error('pdf');
        // the parent (Ortak Belgeler) may have been picked instead of the folder itself
        const to = /SagaCommonPlugin/i.test(dir.name) ? dir : await dir.getDirectoryHandle('SagaCommonPlugin', { create: true });
        await writeFile(to, 'ABDOPQR.pdf', pdf);
        await writeFile(to, 'ABDOPQR.plt', plt);
        return VP.toast(job.count + ' kesim yolu CutArtist klasörüne yazıldı · Masaüstündeki "VektörPad - CutArtist" kısayoluna tıklayın');
      } catch (e) {
        if (e && e.name === 'AbortError') return VP.toast('İptal edildi');
        console.error(e);
        VP.toast('Klasöre yazılamadı · Dosyalar indiriliyor');
      }
    }
    const base = IO.safeName() + '-saga';
    if (pdf) await IO.saveFile(base + '.pdf', pdf);
    await IO.saveFile(base + '.plt', plt);
    VP.toast('PLT ve PDF kaydedildi · CutArtist’te açın');
  };
  SG.savePlt = () => {
    const job = SG.plt();
    if (!job) return VP.toast('Kesim katmanında çizgi yok');
    IO.saveFile(IO.safeName() + '-saga.plt', new Blob([job.text], { type: 'application/vnd.hp-hpgl' }));
  };
  SG.chooseDir = async () => {
    if (!window.showDirectoryPicker) return VP.toast('Bu tarayıcı klasör seçmeyi desteklemiyor · Dosyalar indirilir');
    try {
      await idb('readwrite', (st) => st.delete('dir'));
      await getDir(true);
      VP.toast('CutArtist klasörü kaydedildi');
    } catch (e) {
      if (!(e && e.name === 'AbortError')) VP.toast('Klasör seçilemedi');
    }
  };

  /* ---------- settings (same fields as SagaCdrCam.ini) ---------- */
  SG.settings = () => {
    const s = S();
    const f = (k, l) => '<label class="field"><span>' + esc(l) + '</span><input data-k="' + k + '" value="' + s[k] + '" inputmode="decimal" style="width:60px"><span class="unit">mm</span></label>';
    UI.modal(
      '<h2>Saga Standart ayarları</h2>' +
        '<div class="row">' + f('top', 'Üst boşluk') + f('bottom', 'Alt boşluk') + '</div>' +
        '<div class="row">' + f('left', 'Sol boşluk') + f('right', 'Sağ boşluk') + '</div>' +
        '<div class="row">' + f('dia', 'İşaret çapı') + '</div>' +
        '<p class="sec-note">İşaretlerin merkezi sayfa kenarlarından bu kadar içeridedir. Değerler CutArtist’teki Mark Point ayarlarıyla aynı olmalı.</p>' +
        '<div class="row"><button class="btn" data-x="dir">CutArtist klasörünü seç…</button></div>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Tamam</button></div>',
      (root, close) => {
        root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-x]');
          if (!b) return;
          if (b.dataset.x === 'dir') return SG.chooseDir();
          if (b.dataset.x === 'yes') {
            const o = S();
            root.querySelectorAll('[data-k]').forEach((el) => {
              const v = VP.parseNum(el.value);
              if (v >= 0) o[el.dataset.k] = v;
            });
            VP.settings.saga = o;
            IO.savePrefs();
          }
          close();
        });
      }
    );
  };

  Object.assign(A, {
    sagaMarks: { label: 'Saga İşaretleri Ekle', icon: 'ecMarks', run: SG.marks },
    sagaSetCut: { label: 'Kesim Çizgisi Yap', icon: 'ecCut', enabled: () => VP.sel.length > 0, run: SG.setCut },
    sagaSend: { label: 'CutArtist’e Gönder', icon: 'export', run: () => SG.send() },
    sagaSendFiles: { label: 'PLT + PDF olarak kaydet', run: () => SG.send({ download: true }) },
    sagaPlt: { label: 'PLT Dosyası Kaydet', run: SG.savePlt },
    sagaSettings: { label: 'Saga Ayarları…', icon: 'gear', run: SG.settings }
  });
  const M = UI.MENUS.plugins;
  if (M && !M.includes('sagaSend')) M.push('|', 'h:Saga Standart', 'sagaMarks', 'sagaSetCut', 'sagaSend', 'sagaSendFiles', 'sagaPlt', 'sagaSettings');
})();
