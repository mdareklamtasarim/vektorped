/* VektörPad files: autosave, save/open, import, export (SVG, PNG, PDF). */
(function () {
  'use strict';
  const VP = window.VP;
  const SVGNS = 'http://www.w3.org/2000/svg';

  const IO = (VP.io = {
    KEY: 'vektorpad.doc.v1',
    PREFS: 'vektorpad.prefs.v1',

    /* ---------- capability ---------- */
    inViewer() {
      return !!(window.claude && typeof window.claude.use === 'function');
    },
    downloads() {
      if (!this._dl) this._dl = this.inViewer() ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
      return this._dl;
    },
    async saveFile(filename, data) {
      const dl = await this.downloads();
      if (dl) {
        try {
          const r = await dl.save({ filename, data });
          if (r && r.status === 'saved') VP.toast('Kaydedildi: ' + filename);
          else VP.toast('Dosya gönderildi: ' + filename);
          return true;
        } catch (err) {
          const code = err && err.code;
          if (code === 'declined') VP.toast('Kaydetme iptal edildi');
          else if (code === 'rate_limited') VP.toast('Önceki kaydetme penceresi hâlâ açık');
          else if (code === 'too_large') VP.toast('Dosya çok büyük · Daha düşük çözünürlük seçin');
          else VP.toast('Dosya kaydedilemedi (' + (code || 'hata') + ')');
          return false;
        }
      }
      if (this.inViewer()) {
        VP.toast('Bu görünümde dosya kaydetme kullanılamıyor');
        return false;
      }
      // the app added to the iPad home screen: hand the file to the share sheet ("Save to Files")
      const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
      if (standalone && navigator.share && typeof File !== 'undefined') {
        const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
        const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) return this.shareFile(file);
      }
      try {
        const blob = data instanceof Blob ? data : new Blob([data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        VP.toast('İndirildi: ' + filename);
        return true;
      } catch (e) {
        VP.toast('Dosya kaydedilemedi');
        return false;
      }
    },
    // sharing needs a fresh tap, so the file waits behind a Save button
    shareFile(file) {
      return new Promise((resolve) => {
        const kb = Math.max(1, Math.round(file.size / 1024));
        const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
        VP.ui.modal('<h2>Dosya hazır</h2><p>' + esc(file.name) + ' · ' + (kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB') + '</p><p class="sec-note">Kaydet’e dokunun, açılan menüde “Dosyalara Kaydet”i seçin.</p><div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Kaydet</button></div>', (root, close) => {
          root.addEventListener('click', (e) => {
            const b = e.target.closest('[data-x]');
            if (!b) return;
            close();
            if (b.dataset.x !== 'yes') {
              VP.toast('Kaydetme iptal edildi');
              return resolve(false);
            }
            navigator.share({ files: [file], title: file.name }).then(() => {
              VP.toast('Kaydedildi: ' + file.name);
              resolve(true);
            }).catch((err) => {
              VP.toast(err && err.name === 'AbortError' ? 'Kaydetme iptal edildi' : 'Dosya paylaşılamadı');
              resolve(false);
            });
          });
        });
      });
    },
    safeName() {
      const n = String(VP.doc.name || 'cizim').replace(/[\\/:*?"<>|]+/g, '-').trim();
      return n || 'cizim';
    },

    /* ---------- autosave & prefs ---------- */
    scheduleAutosave() {
      clearTimeout(this._t);
      this._t = setTimeout(() => this.autosave(), 900);
    },
    autosave() {
      try {
        VP.storePage();
        localStorage.setItem(this.KEY, JSON.stringify({ app: 'VektorPad', v: 1, doc: VP.doc }));
        this._warned = false;
      } catch (e) {
        if (!this._warned) {
          VP.toast('Otomatik kayıt yapılamadı · Dosya › Kaydet ile saklayın');
          this._warned = true;
        }
      }
    },
    loadAutosave() {
      try {
        const s = localStorage.getItem(this.KEY);
        if (!s) return null;
        const o = JSON.parse(s);
        return this.valid(o) ? o.doc : null;
      } catch (e) {
        return null;
      }
    },
    savePrefs() {
      try {
        localStorage.setItem(this.PREFS, JSON.stringify({ settings: VP.settings, defaults: VP.defaults, dock: VP.ui && VP.ui.dockTab }));
      } catch (e) { /* optional */ }
    },
    loadPrefs() {
      try {
        const o = JSON.parse(localStorage.getItem(this.PREFS) || 'null');
        if (!o) return null;
        if (o.settings) Object.assign(VP.settings, o.settings, { multi: false });
        if (o.defaults) Object.assign(VP.defaults, o.defaults);
        return o;
      } catch (e) {
        return null;
      }
    },
    valid(o) {
      return !!(o && o.app === 'VektorPad' && o.doc && Array.isArray(o.doc.pages) && o.doc.pages.length);
    },

    /* ---------- document files ---------- */
    serialize() {
      VP.storePage();
      return JSON.stringify({ app: 'VektorPad', v: 1, savedAt: new Date().toISOString(), doc: VP.doc });
    },
    save() {
      return this.saveFile(this.safeName() + '.vektorpad.json', this.serialize());
    },
    open() {
      document.getElementById('file-open').click();
    },
    loadDoc(doc) {
      VP.doc = { name: doc.name || 'Adsız çizim', active: Math.min(doc.active || 0, doc.pages.length - 1), pages: doc.pages.map((p) => Object.assign({ layers: [], thumb: null }, p)), ext: doc.ext || {} };
      VP.loadPage(VP.doc.active);
      VP.refreshShadows();
      VP.resetHistory();
      this.autosave();
      VP.emit('doc');
    },
    async handleOpen(file) {
      if (!file) return;
      try {
        const o = JSON.parse(await file.text());
        if (!this.valid(o)) throw new Error('format');
        this.loadDoc(o.doc);
        VP.toast('Açıldı: ' + (o.doc.name || file.name));
      } catch (e) {
        VP.toast('Bu dosya bir VektörPad belgesi değil');
      }
    },

    /* ---------- import ---------- */
    importFile() {
      document.getElementById('file-import').click();
    },
    async handleImport(file) {
      if (!file) return;
      const page = VP.page();
      const fitIn = (item) => {
        const b = item.bounds;
        const maxW = page.w * 0.8;
        const maxH = page.h * 0.8;
        if (b.width > maxW || b.height > maxH) {
          const s = Math.min(maxW / b.width, maxH / b.height);
          item.scale(s, b.center);
        }
        item.position = new paper.Point(page.w / 2, page.h / 2);
      };
      if (/svg/.test(file.type) || /\.svg$/i.test(file.name)) {
        try {
          const text = await file.text();
          VP.ensureLayer();
          const item = paper.project.importSVG(text, { insert: false, expandShapes: true });
          VP.activeLayer.activate();
          if (!item) throw new Error('svg');
          VP.activeLayer.addChild(item);
          if (item instanceof paper.Group && item.clipped && item.children[0] && item.children[0].clipMask && item.children.length > 1) {
            /* keep the SVG's own clip when present */
          }
          fitIn(item);
          VP.setSelection([item]);
          VP.commit();
          VP.toast('SVG içe aktarıldı (grup olarak)');
        } catch (e) {
          VP.toast('SVG dosyası okunamadı');
        }
        return;
      }
      if (/^image\//.test(file.type)) {
        const url = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = rej;
          fr.readAsDataURL(file);
        });
        VP.ensureLayer();
        const r = new paper.Raster({ source: url, insert: false });
        r.onLoad = () => {
          VP.activeLayer.addChild(r);
          r.scale(0.75);
          fitIn(r);
          VP.setSelection([r]);
          VP.commit();
          VP.toast('Resim içe aktarıldı');
        };
        r.onError = () => VP.toast('Resim okunamadı');
        return;
      }
      VP.toast('Desteklenen biçimler: SVG, PNG, JPG, WEBP, GIF');
    },

    /* ---------- export ---------- */
    // Decodes the page's embedded images first, so the rebuilt page has them ready when it is exported.
    _imgs: new Map(),
    async preload(index) {
      if (index === VP.doc.active) VP.storePage();
      const page = VP.doc.pages[index];
      const srcs = new Set();
      (page.layers || []).forEach((json) => {
        for (const m of json.matchAll(/"source":"(data:image\/[^"]+)"/g)) srcs.add(m[1]);
      });
      await Promise.all([...srcs].map((s) => {
        if (this._imgs.has(s)) return null;
        return new Promise((res) => {
          const img = new Image();
          img.onload = () => {
            this._imgs.set(s, img);
            res();
          };
          img.onerror = res;
          img.src = s;
        });
      }));
      if (this._imgs.size > 60) this._imgs = new Map([...this._imgs].slice(-30));
    },
    // opts: pdf (PDF-safe output), bleed (pt around the page), box (export area), layersJSON (instead of the
    // page's layers, e.g. a selection), curves (texts as outlines), onProject + noSVG (other exporters)
    buildSVG(index, opts = {}) {
      if (index === VP.doc.active) VP.storePage();
      const page = VP.doc.pages[index];
      const main = paper.project;
      const tmp = new paper.Project(new paper.Size(4, 4));
      let svg;
      const shadows = [];
      const bl = opts.bleed || 0;
      const box = opts.box || new paper.Rectangle(-bl, -bl, page.w + bl * 2, page.h + bl * 2);
      try {
        (opts.layersJSON || page.layers).forEach((json) => {
          const L = new paper.Layer({ insert: false });
          L.importJSON(json);
          if (L.visible) tmp.addLayer(L);
        });
        tmp.getItems({ match: (it) => it.visible === false }).forEach((it) => it.remove());
        // images rebuilt from saved data load asynchronously; use the decoded copies
        tmp.getItems({ class: paper.Raster }).forEach((r) => {
          const img = !r.loaded && this._imgs.get(r.source);
          if (img) r.setImage(img);
        });
        // invisible hit areas of text frames and tables are not part of the artwork
        tmp.getItems({ match: (it) => it.data && it.data.hitOnly }).forEach((it) => it.remove());
        // page number fields show the number of the page being exported
        tmp.getItems({ match: (it) => it.data && it.data.pageField }).forEach((it) => (it.content = VP.pageLabel ? VP.pageLabel(index) : String(index + 1)));
        // other modules can turn screen-only looks (arrowheads, PDF shadows) into real artwork here
        (VP.io.exportHooks || []).forEach((f) => f(tmp, index, opts));
        if (opts.curves) tmp.getItems({ class: paper.PointText }).forEach((t) => VP.textToPath(t));
        if (page.bg && tmp.layers[0] && !opts.layersJSON) tmp.layers[0].insertChild(0, new paper.Path.Rectangle({ rectangle: new paper.Rectangle(-bl, -bl, page.w + bl * 2, page.h + bl * 2), fillColor: page.bg, insert: false }));
        if (opts.onProject) {
          const r = opts.onProject(tmp, box);
          if (opts.noSVG) return r;
        }
        let n = 0;
        tmp.getItems({ match: (it) => it.data && it.data.shadow }).forEach((it) => {
          it.name = 'vpsh' + n++;
          shadows.push({ id: it.name, s: it.data.shadow });
        });
        svg = tmp.exportSVG({ asString: false, bounds: box, embedImages: true, precision: 3 });
      } finally {
        tmp.remove();
        main.activate();
      }
      svg.setAttribute('xmlns', SVGNS);
      svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      svg.setAttribute('width', VP.num(VP.toMM(box.width), 3).replace(',', '.') + 'mm');
      svg.setAttribute('height', VP.num(VP.toMM(box.height), 3).replace(',', '.') + 'mm');
      svg.setAttribute('viewBox', '0 0 ' + box.width.toFixed(3) + ' ' + box.height.toFixed(3));
      let defs = svg.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS(SVGNS, 'defs');
        svg.insertBefore(defs, svg.firstChild);
      }
      if (!opts.pdf) {
        shadows.forEach(({ id, s }) => {
          const el = svg.querySelector('[id="' + id + '"]');
          if (!el) return;
          const f = document.createElementNS(SVGNS, 'filter');
          f.setAttribute('id', 'f-' + id);
          f.setAttribute('x', '-50%');
          f.setAttribute('y', '-50%');
          f.setAttribute('width', '200%');
          f.setAttribute('height', '200%');
          f.setAttribute('color-interpolation-filters', 'sRGB');
          const ds = document.createElementNS(SVGNS, 'feDropShadow');
          ds.setAttribute('dx', s.dx);
          ds.setAttribute('dy', s.dy);
          ds.setAttribute('stdDeviation', Math.max(0, s.blur / 2));
          ds.setAttribute('flood-color', s.color);
          ds.setAttribute('flood-opacity', s.alpha);
          f.appendChild(ds);
          defs.appendChild(f);
          el.setAttribute('filter', 'url(#f-' + id + ')');
          el.removeAttribute('id');
        });
      } else {
        shadows.forEach(({ id }) => {
          const el = svg.querySelector('[id="' + id + '"]');
          if (el) el.removeAttribute('id');
        });
      }
      svg.querySelectorAll('[data-paper-data]').forEach((el) => el.removeAttribute('data-paper-data'));
      svg.querySelectorAll('[stroke-width], [stroke-dasharray], [stroke-linecap], [stroke-linejoin], [stroke-miterlimit]').forEach((el) => {
        ['stroke-width', 'stroke-miterlimit'].forEach((a) => {
          const v = el.getAttribute(a);
          if (v != null && !isFinite(parseFloat(v))) el.removeAttribute(a);
        });
        const da = el.getAttribute('stroke-dasharray');
        if (da != null && !/\d/.test(da)) el.removeAttribute('stroke-dasharray');
        ['stroke-linecap', 'stroke-linejoin'].forEach((a) => {
          if (/^(none|null|undefined)?$/.test(el.getAttribute(a) || '')) el.removeAttribute(a);
        });
      });
      svg.querySelectorAll('[font-weight]').forEach((t) => {
        const fw = t.getAttribute('font-weight') || '';
        if (/italic/.test(fw)) {
          t.setAttribute('font-style', 'italic');
          t.setAttribute('font-weight', fw.replace('italic', '').trim() || 'normal');
        }
      });
      if (opts.pdf) {
        svg.querySelectorAll('text, tspan, [font-family]').forEach((t) => {
          if (t.hasAttribute('font-family') || t.tagName === 'text') {
            t.setAttribute('font-family', 'Fira Sans');
            t.removeAttribute('font-style');
            const w = t.getAttribute('font-weight');
            if (w != null) t.setAttribute('font-weight', /bold|[6-9]00/.test(w) ? 'bold' : 'normal');
          }
        });
        svg.querySelectorAll('[style*="mix-blend-mode"]').forEach((el) => {
          el.style.removeProperty('mix-blend-mode');
        });
      }
      return svg;
    },
    async exportSVG() {
      await this.preload(VP.doc.active);
      const svg = this.buildSVG(VP.doc.active);
      const str = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + new XMLSerializer().serializeToString(svg);
      const suffix = VP.doc.pages.length > 1 ? '-' + (VP.doc.active + 1) : '';
      return this.saveFile(this.safeName() + suffix + '.svg', str);
    },
    async exportPNG(dpi = 150, transparent = false) {
      VP.storePage();
      const p = VP.page();
      const MAXPX = 16000000;
      let res = dpi;
      const px = (r) => ((p.w * r) / 72) * ((p.h * r) / 72);
      while (px(res) > MAXPX && res > 36) res = Math.floor(res * 0.8);
      if (res !== dpi) VP.toast('Sayfa çok büyük · Çözünürlük ' + res + ' dpi olarak ayarlandı');
      const g = VP.composePageGroup({ white: !transparent, res });
      const raster = g.rasterize(res, false);
      const canvas = raster.canvas;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return VP.toast('PNG oluşturulamadı');
      const suffix = VP.doc.pages.length > 1 ? '-' + (VP.doc.active + 1) : '';
      return this.saveFile(this.safeName() + suffix + '.png', blob);
    },
    async exportPDF(all = true) {
      const lib = window.jspdf;
      if (!lib || !lib.jsPDF) return VP.toast('PDF kütüphanesi yüklenemedi');
      VP.storePage();
      const idxs = all ? VP.doc.pages.map((_, i) => i) : [VP.doc.active];
      const first = VP.doc.pages[idxs[0]];
      const orient = (pg) => (pg.w > pg.h ? 'landscape' : 'portrait');
      const pdf = new lib.jsPDF({ unit: 'pt', format: [first.w, first.h], orientation: orient(first), compress: true });
      try {
        if (window.VP_FONTS) {
          pdf.addFileToVFS('FiraSans-Regular.ttf', window.VP_FONTS.regular);
          pdf.addFont('FiraSans-Regular.ttf', 'Fira Sans', 'normal');
          pdf.addFileToVFS('FiraSans-Bold.ttf', window.VP_FONTS.bold);
          pdf.addFont('FiraSans-Bold.ttf', 'Fira Sans', 'bold');
          pdf.setFont('Fira Sans', 'normal');
        }
      } catch (e) { /* falls back to standard fonts */ }
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden;';
      document.body.appendChild(host);
      try {
        for (let k = 0; k < idxs.length; k++) {
          const pg = VP.doc.pages[idxs[k]];
          if (k > 0) pdf.addPage([pg.w, pg.h], orient(pg));
          await this.preload(idxs[k]);
          const svg = this.buildSVG(idxs[k], { pdf: true });
          host.appendChild(svg);
          if (typeof pdf.svg === 'function') await pdf.svg(svg, { x: 0, y: 0, width: pg.w, height: pg.h });
          else if (window.svg2pdf && window.svg2pdf.svg2pdf) await window.svg2pdf.svg2pdf(svg, pdf, { x: 0, y: 0, width: pg.w, height: pg.h });
          else throw new Error('svg2pdf');
          host.removeChild(svg);
        }
      } catch (e) {
        host.remove();
        console.error(e);
        return VP.toast('PDF oluşturulamadı');
      }
      host.remove();
      const buf = pdf.output('arraybuffer');
      return this.saveFile(this.safeName() + '.pdf', new Blob([buf], { type: 'application/pdf' }));
    }
  });
  VP.on('dirty', () => IO.scheduleAutosave());
})();
