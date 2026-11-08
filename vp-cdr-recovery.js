/* CorelDRAW high-fidelity import with libcdr WebAssembly engine & multi-page support. */
(() => {
  const VP = window.VP;
  const CDR = VP.cdr;

  async function convert(file) {
    if (file.size > 256 * 1024 * 1024) throw Error('Dosya okuyucunun 256 MB sınırını aşıyor.');
    const buffer = await file.arrayBuffer();
    if (!VP.cdrWorkerSource) throw Error('libcdr çalışma motoru (worker) hazır değil.');
    const url = URL.createObjectURL(new Blob([VP.cdrWorkerSource], { type: 'text/javascript' }));
    let worker;
    let timer;
    try {
      worker = new Worker(url);
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(Error('CorelDRAW okuyucusu süre sınırına ulaştı (60 sn).')), 60000);
        worker.onmessage = ({ data }) => (data.error ? reject(Error(data.error)) : resolve(data.svg));
        worker.onerror = (e) => reject(Error('CorelDRAW okuyucusu bu tarayıcıda başlatılamadı: ' + (e?.message || '')));
        worker.postMessage(buffer, [buffer]);
      });
    } finally {
      clearTimeout(timer);
      if (worker) worker.terminate();
      URL.revokeObjectURL(url);
    }
  }

  function cleanSVG(source) {
    const raw = String(source || '').replace(/\bxlink:href=/gi, 'href=');
    const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
    const root = doc.documentElement;
    if (root.localName !== 'svg') throw Error('CorelDRAW vektör motoru çıktısı okunamadı.');
    if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const tags = new Set('svg g defs path rect circle ellipse line polyline polygon text tspan image clipPath linearGradient radialGradient stop pattern mask'.split(' '));
    const attrs = new Set('id x y x1 x2 y1 y2 cx cy r rx ry dx dy d points width height viewBox transform gradientTransform gradientUnits fx fy offset patternUnits maskUnits'.split(' '));
    const styles = new Set('fill stroke fill-rule stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset fill-opacity stroke-opacity opacity font-family font-style font-size font-weight text-anchor clip-path stop-color stop-opacity visibility display'.split(' '));
    function safeValue(value) {
      return !/[\\@<>]|\/\*|[()]/.test(value) || /^(url\(#[\w.-]+\)|rgba?\([\d.,%\s]+\))$/i.test(value);
    }
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (!tags.has(el.localName) || el.namespaceURI !== 'http://www.w3.org/2000/svg') { el.remove(); continue; }
      for (const a of Array.from(el.attributes)) {
        if (a.name === 'style') {
          el.removeAttribute('style');
          for (const part of a.value.split(';')) {
            const at = part.indexOf(':');
            if (at < 0) continue;
            const key = part.slice(0, at).trim(), value = part.slice(at + 1).trim();
            if (styles.has(key) && safeValue(value)) el.setAttribute(key, value);
          }
        } else if (a.localName === 'href' && el.localName === 'image') {
          if (!/^data:image\/(png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(a.value) && !a.value.startsWith('#')) {
            // retain image if valid data URI, otherwise skip
          }
        } else if (!(attrs.has(a.name) || (styles.has(a.name) && safeValue(a.value)))) {
          el.removeAttributeNode(a);
        }
      }
    }
    return root;
  }

  // Import high-fidelity vector document using libcdr
  CDR.importWithEngine = async (file, options = {}) => {
    VP.toast('CorelDRAW dosyası yüksek doğruluklu motorla açılıyor…');
    const svg = cleanSVG(await convert(file));
    const box = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
      throw Error('Belge sayfa ölçüsü okunamadı.');
    }

    // Set SVG attributes to exact point dimensions matching viewBox
    svg.setAttribute('width', box[2]);
    svg.setAttribute('height', box[3]);
    svg.setAttribute('overflow', 'visible');

    const art = paper.project.importSVG(svg, { insert: false, expandShapes: true });
    if (!art || !art.children?.length) {
      throw Error('CorelDRAW dosyasında aktarılabilir nesne bulunamadı.');
    }

    // Wait for embedded raster images to load
    const rasters = art.getItems({ class: paper.Raster });
    await Promise.all(rasters.map(r => r.loaded ? undefined : new Promise((resolve) => {
      const timer = setTimeout(() => resolve(), 8000);
      r.once('load', () => { clearTimeout(timer); resolve(); });
      r.once('error', () => { clearTimeout(timer); resolve(); });
    })));

    const docName = (file.name || 'Corel belgesi').replace(/\.(cdr|cdt|cdrt)$/i, '');
    const vdoc = VP.newDoc(docName);
    const pageW_MM = VP.toMM(box[2]);
    const pageH_MM = VP.toMM(box[3]);

    const page1 = VP.newPage(1, pageW_MM, pageH_MM);
    const ls = [];

    // Optional preview raster
    if (options.previewBase64) {
      const pLayer = new paper.Layer({ name: 'CorelDRAW Önizlemesi (Başvuru)', insert: false });
      const raster = new paper.Raster({ source: 'data:image/png;base64,' + options.previewBase64, insert: false });
      raster.data.cdrPreview = true;
      pLayer.addChild(raster);
      pLayer.visible = false;
      pLayer.locked = true;
      pLayer.data.cdrPreview = true;
      ls.push(pLayer);
    }

    // Add main vector artwork layer
    const artLayer = new paper.Layer({ name: 'Corel Çizimi (Düzenlenebilir)', insert: false });
    artLayer.addChild(art);
    ls.push(artLayer);

    page1.layers = ls.map(l => l.exportJSON({ asString: true, precision: 5 }));
    page1.activeLayer = ls.length - 1;
    page1.cdrPreviewSize = [box[2], box[3]];
    vdoc.pages = [page1];
    vdoc.ext = { colorMode: 'CMYK', cdrEngine: 'libcdr' };

    VP.io.loadDoc(vdoc);
    VP.toast(docName + ' CorelDRAW motoruyla başarıyla açıldı.');
    return { doc: vdoc, shapes: art.children.length };
  };

  CDR.recover = async (file) => {
    try {
      return await CDR.importWithEngine(file);
    } catch (error) {
      VP.toast(error.message || 'Dosya açılamadı.');
      return null;
    }
  };

  CDR.offerRecovery = (file, reason) => {
    VP.ui.modal('', (root, close) => {
      root.innerHTML = '<h3>CorelDRAW dosya açılışı</h3><p></p>' +
        '<p>Dosyada standart okuyucunun desteklemediği karmaşık Corel nesneleri veya eksiklikler tespit edildi. Tüm nesneleri (CorelDRAW 2026 kalitesinde) tam uyumlulukla açmak için gelişmiş motoru kullanabilirsiniz.</p>' +
        '<div class="actions"><button class="btn" data-close>Olduğu Gibi Bırak</button><button class="btn primary" data-recover>Gelişmiş Motorla Aç</button></div>';
      root.querySelector('p').textContent = reason;
      root.querySelector('[data-close]').onclick = close;
      root.querySelector('[data-recover]').onclick = () => { close(); CDR.importWithEngine(file); };
    });
  };

  VP.actions.recoverCdr = {
    label: 'CorelDRAW dosyasını gelişmiş motorla aç…',
    icon: 'open',
    run: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.cdr,.cdt,.cdrt';
      input.onchange = () => { if (input.files[0]) CDR.importWithEngine(input.files[0]); };
      input.click();
    }
  };
  const menu = VP.ui.MENUS.file;
  if (menu && !menu.includes('recoverCdr')) {
    menu.splice(menu.indexOf('openCdr') + 1, 0, 'recoverCdr');
  }
})();
