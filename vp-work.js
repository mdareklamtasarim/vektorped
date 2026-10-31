/* VektörPad workflow set (desktop drawing suite features, written for this app):
   - Export docker: a list of pages and objects, each with its own name, format and resolution, exported in
     one go (several files are packed into one ZIP so the iPad asks only once where to save).
   - Proof colours: the drawing window shows an approximation of how the colours print on coated, uncoated
     or newsprint paper, with an optional gamut alarm for colours that print duller than on screen.
     (A simple model, not an ICC colour profile.) */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const A = VP.actions;
  const S = VP.settings;
  const IO = VP.io;
  const FL = VP.files;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const WK = (VP.work = {});
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => x !== '|' && !x.startsWith('h:') && !x.startsWith('sub:') && M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };

  /* ======================================================================
     ZIP (stored, no compression: images are already compressed)
     ====================================================================== */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (u8) => {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  WK.zip = (files) => {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let off = 0;
    const d = new Date();
    const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    files.forEach(({ name, data }) => {
      const nm = enc.encode(name);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true); // UTF-8 names
      lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, nm.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, nm.length, true);
      ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + data.length;
    });
    const csize = central.reduce((a, p) => a + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true);
    end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  };

  /* ======================================================================
     EXPORT DOCKER
     ====================================================================== */
  const FMTS = [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WEBP'], ['svg', 'SVG'], ['pdf', 'PDF'], ['eps', 'EPS'], ['dxf', 'DXF']];
  const DPIS = [72, 96, 150, 300, 600];
  const raster = (f) => f === 'png' || f === 'jpg' || f === 'webp';
  const list = () => {
    VP.doc.ext = VP.doc.ext || {};
    return (VP.doc.ext.exportList = VP.doc.ext.exportList || []);
  };
  const newId = () => 'x' + Math.random().toString(36).slice(2, 8);
  const pageName = (i) => {
    const p = VP.doc.pages[i];
    return (p && p.name) || 'Sayfa ' + (i + 1);
  };
  const safe = (s) => String(s || 'dosya').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'dosya';
  // finds an object entry's item (on any page) by its id
  const findItem = (e) => {
    if (e.page !== VP.doc.active) return null;
    let found = null;
    VP.userLayers().forEach((L) => L.children.forEach((c) => {
      if (!found && c.data && c.data.uid === e.uid) found = c;
    }));
    return found;
  };
  const pageHasUid = (i, uid) => (VP.doc.pages[i].layers || []).some((j) => j.includes('"uid":"' + uid + '"'));
  WK.addPages = () => {
    const L = list();
    VP.doc.pages.forEach((p, i) => {
      if (L.some((e) => e.kind === 'page' && e.page === i)) return;
      L.push({ id: newId(), kind: 'page', page: i, name: safe(IO.safeName() + (VP.doc.pages.length > 1 ? '-' + (i + 1) : '')), fmt: 'png', dpi: 150, on: true });
    });
    VP.commit();
    UI.renderDock(true);
  };
  WK.addSelection = () => {
    if (!VP.sel.length) return VP.toast('Önce dışa aktarılacak nesneleri seçin');
    const L = list();
    let n = 0;
    VP.sel.forEach((it) => {
      if (!it.data.uid) it.data.uid = VP.uid();
      if (L.some((e) => e.kind === 'obj' && e.uid === it.data.uid)) return;
      const nm = (it.name || (VP.describe ? VP.describe(it) : 'nesne')) + '-' + (L.length + 1);
      L.push({ id: newId(), kind: 'obj', page: VP.doc.active, uid: it.data.uid, name: safe(nm), fmt: 'png', dpi: 300, on: true });
      n++;
    });
    VP.commit();
    UI.openDock('export');
    UI.renderDock(true);
    VP.toast(n ? n + ' nesne dışa aktarma listesine eklendi' : 'Seçili nesneler zaten listede');
  };
  const exportPanel = () => {
    const L = list();
    let h = '<div class="sec"><div class="sec-h"><h3>Dışa aktarma listesi</h3></div>' +
      '<div class="row"><button class="btn" data-act="wxPages">' + ic('pages', 'sm') + 'Sayfalar</button><button class="btn" data-act="wxSel"' + (VP.sel.length ? '' : ' disabled') + '>' + ic('plus', 'sm') + 'Seçim</button></div>';
    if (!L.length) h += '<p class="sec-note">Sayfaları veya seçili nesneleri listeye ekleyin; her birine ayrı ad, biçim ve çözünürlük verip hepsini tek seferde dışa aktarın. Birden çok dosya tek bir ZIP olarak kaydedilir.</p>';
    L.forEach((e) => {
      const missing = e.kind === 'obj' && !(e.page < VP.doc.pages.length && (e.page === VP.doc.active ? findItem(e) : pageHasUid(e.page, e.uid)));
      h += '<div style="border:1px solid var(--line);padding:6px;display:flex;flex-direction:column;gap:5px;' + (e.on ? '' : 'opacity:.55') + '">' +
        '<div class="row" style="flex-wrap:nowrap;gap:4px"><button class="row-btn" data-act="wxOn:' + e.id + '" title="Dışa aktarılsın mı" aria-pressed="' + !!e.on + '">' + (e.on ? '☑' : '☐') + '</button>' +
        '<span class="pb-label" style="white-space:nowrap">' + (e.kind === 'page' ? esc(pageName(e.page)) : 'Nesne · s.' + (e.page + 1)) + '</span>' +
        (missing ? '<span class="pb-warn">bulunamadı</span>' : '') + '<span style="flex:1"></span>' +
        (e.kind === 'obj' && !missing ? '<button class="row-btn" data-act="wxShow:' + e.id + '" title="Nesneyi seç" aria-label="Nesneyi seç">' + ic('select', 'sm') + '</button>' : '') +
        '<button class="row-btn" data-act="wxDel:' + e.id + '" title="Listeden çıkar" aria-label="Listeden çıkar">' + ic('trash', 'sm') + '</button></div>' +
        '<label class="field" style="width:100%"><span>Ad</span><input data-pf="wxName:' + e.id + '" value="' + esc(e.name) + '" style="flex:1;width:auto;font-family:var(--font-ui)" autocomplete="off"></label>' +
        '<div class="row" style="gap:4px"><label class="field"><span>Biçim</span><select data-pf="wxFmt:' + e.id + '">' + FMTS.map(([k, l]) => '<option value="' + k + '"' + (k === e.fmt ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
        (raster(e.fmt) ? '<label class="field"><span>Çözünürlük</span><select data-pf="wxDpi:' + e.id + '">' + DPIS.map((d) => '<option value="' + d + '"' + (d === +e.dpi ? ' selected' : '') + '>' + d + ' dpi</option>').join('') + '</select></label>' : '') + '</div></div>';
    });
    if (L.length) {
      const n = L.filter((e) => e.on).length;
      h += '<div class="row"><button class="btn" data-act="wxAll">Tümünü seç</button><button class="btn" data-act="wxClear">Listeyi temizle</button></div>' +
        '<button class="btn primary" data-act="wxRun"' + (n ? '' : ' disabled') + '>' + ic('export', 'sm') + 'Dışa aktar (' + n + ')</button>' +
        '<p class="sec-note">' + (n > 1 ? 'Dosyalar tek bir ZIP içinde kaydedilir.' : 'Tek dosya doğrudan kaydedilir.') + '</p>';
    }
    return h + '</div>';
  };
  UI.panels = UI.panels || {};
  UI.panels.export = exportPanel;
  if (!UI.DOCKERS.some(([k]) => k === 'export')) UI.DOCKERS.push(['export', 'Dışa aktar']);

  // runs the normal exporters with their save step captured
  const capture = async (fn) => {
    const got = [];
    const save0 = IO.saveFile;
    IO.saveFile = async (name, data) => {
      got.push({ name, data });
      return true;
    };
    try {
      await fn();
    } finally {
      IO.saveFile = save0;
    }
    return got;
  };
  const extOf = (n) => (n.match(/\.[a-z0-9]+$/i) || [''])[0];
  WK.run = async () => {
    const L = list().filter((e) => e.on);
    if (!L.length) return VP.toast('Listede işaretli öğe yok');
    VP.storePage();
    const active = VP.doc.active;
    const sel0 = VP.sel.slice();
    const files = [];
    const skipped = [];
    VP.toast('Dışa aktarılıyor… (' + L.length + ')');
    try {
      for (const e of L) {
        if (e.page >= VP.doc.pages.length) {
          skipped.push(e.name);
          continue;
        }
        if (VP.doc.active !== e.page) {
          VP.storePage();
          VP.loadPage(e.page, { keepView: true });
        }
        const o = Object.assign({}, FL.DEFAULTS, { fmt: e.fmt, dpi: +e.dpi || 150, quality: 90, bg: e.fmt === 'png' ? 'clear' : 'white' });
        if (e.kind === 'obj') {
          const it = findItem(e);
          if (!it) {
            skipped.push(e.name);
            continue;
          }
          VP.sel = [it];
          o.area = 'sel';
        } else {
          VP.sel = [];
          o.area = 'page';
          o.range = 'custom';
          o.rangeText = String(e.page + 1);
        }
        const got = await capture(() => FL.exportAs(o));
        got.forEach((g, k) => files.push({ name: safe(e.name) + (got.length > 1 ? '-' + (k + 1) : '') + extOf(g.name), data: g.data }));
      }
    } finally {
      if (VP.doc.active !== active) {
        VP.storePage();
        VP.loadPage(active, { keepView: true });
      }
      VP.setSelection(sel0.filter((s) => s.parent));
    }
    if (!files.length) return VP.toast('Dışa aktarılacak dosya oluşmadı');
    // the same name twice gets a number
    const seen = new Map();
    files.forEach((f) => {
      const k = f.name.toLowerCase();
      const n = (seen.get(k) || 0) + 1;
      seen.set(k, n);
      if (n > 1) f.name = f.name.replace(/(\.[a-z0-9]+)?$/i, '-' + n + '$1');
    });
    const note = skipped.length ? ' · Bulunamadı: ' + skipped.join(', ') : '';
    if (files.length === 1) {
      const f = files[0];
      await IO.saveFile(f.name, f.data);
      if (note) VP.toast(note.slice(3));
      return;
    }
    const bins = await Promise.all(files.map(async (f) => ({ name: f.name, data: f.data instanceof Blob ? new Uint8Array(await f.data.arrayBuffer()) : new TextEncoder().encode(String(f.data)) })));
    WK.lastZip = bins.map((b) => b.name);
    await IO.saveFile(safe(IO.safeName()) + '-disa-aktarim.zip', WK.zip(bins));
    if (note) setTimeout(() => VP.toast(files.length + ' dosya ZIP içinde' + note), 1800);
  };
  WK.act = (id) => {
    const [k, arg] = id.split(':');
    const L = list();
    const e = L.find((x) => x.id === arg);
    const re = () => {
      VP.commit();
      UI.renderDock(true);
    };
    switch (k) {
      case 'wxPages': WK.addPages(); return true;
      case 'wxSel': WK.addSelection(); return true;
      case 'wxOn': if (e) { e.on = !e.on; re(); } return true;
      case 'wxDel': if (e) { L.splice(L.indexOf(e), 1); re(); } return true;
      case 'wxAll': L.forEach((x) => (x.on = true)); re(); return true;
      case 'wxClear': L.length = 0; re(); return true;
      case 'wxShow':
        if (e) {
          if (e.page !== VP.doc.active) VP.gotoPage(e.page);
          const it = findItem(e);
          if (it) VP.setSelection([it]);
        }
        return true;
      case 'wxRun': WK.run(); return true;
      default: return false;
    }
  };
  WK.propField = (name, raw) => {
    const [k, id] = name.split(':');
    const e = list().find((x) => x.id === id);
    if (!e) return true;
    if (k === 'wxName') e.name = safe(raw);
    if (k === 'wxFmt' && FMTS.some(([f]) => f === raw)) e.fmt = raw;
    if (k === 'wxDpi') e.dpi = clamp(+raw || 150, 36, 1200);
    VP.commit();
    return true;
  };

  /* ======================================================================
     PROOF COLOURS
     ====================================================================== */
  // paper: white of the paper, darkest black, and how much of the screen's colourfulness survives
  const PROFILES = {
    coated: { label: 'Kuşe kâğıt (ofset)', paper: [247, 246, 242], black: [35, 31, 32], sat: 1, light: 0 },
    uncoated: { label: 'Mat (kuşe olmayan) kâğıt', paper: [244, 242, 235], black: [58, 54, 55], sat: 0.82, light: 0.03 },
    news: { label: 'Gazete kâğıdı', paper: [232, 229, 220], black: [74, 70, 70], sat: 0.62, light: 0.06 },
    inkjet: { label: 'Mürekkep püskürtmeli (fotoğraf)', paper: [250, 250, 248], black: [22, 20, 22], sat: 1.06, light: 0 }
  };
  WK.PROFILES = PROFILES;
  const def = (k, v) => {
    if (S[k] === undefined) S[k] = v;
  };
  def('proofProfile', 'coated');
  WK.proof = false;
  WK.gamut = false;
  // how colourful (chroma, 0..1) a CMYK print can be: the most at each hue's own best lightness, less
  // towards white and black. Yellows print bright and light, blues and greens lose the most.
  const HUES = [[0, 0.9, 0.5], [30, 0.92, 0.56], [55, 0.95, 0.74], [90, 0.75, 0.55], [130, 0.62, 0.45], [175, 0.68, 0.52], [205, 0.66, 0.48], [235, 0.58, 0.36], [270, 0.6, 0.42], [305, 0.84, 0.5], [335, 0.88, 0.5], [360, 0.9, 0.5]];
  const hueAt = (h) => {
    for (let i = 1; i < HUES.length; i++) {
      if (h <= HUES[i][0]) {
        const [h0, c0, l0] = HUES[i - 1];
        const [h1, c1, l1] = HUES[i];
        const t = (h - h0) / (h1 - h0);
        return [c0 + (c1 - c0) * t, l0 + (l1 - l0) * t];
      }
    }
    return [0.9, 0.5];
  };
  const rgb2hsl = (r, g, b) => {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h;
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  };
  const hsl2rgb = (h, s, l) => {
    if (!s) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h / 360 + 1 / 3), f(h / 360), f(h / 360 - 1 / 3)];
  };
  WK.limit = (h, l, prof) => {
    const [cmax, lopt] = hueAt(h);
    const span = l > lopt ? 1 - lopt : lopt;
    const k = clamp(1 - Math.pow(Math.abs(l - lopt) / (span || 1), 1.6), 0, 1);
    return clamp(cmax * prof.sat * (0.15 + 0.85 * k), 0.02, 1);
  };
  // proofed colour and whether it is out of gamut, for one 0..255 RGB colour
  WK.proofColor = (r, g, b, prof) => {
    const [h, s, l] = rgb2hsl(r / 255, g / 255, b / 255);
    const den = 1 - Math.abs(2 * l - 1);
    const c = s * den; // chroma
    const lim = WK.limit(h, l, prof);
    const out = c > lim + 0.03;
    // soft compression of the chroma towards the limit
    const knee = lim * 0.75;
    const c2 = c <= knee ? c : knee + (lim - knee) * (1 - Math.exp(-(c - knee) / ((lim - knee) || 1)));
    const s2 = den > 1e-6 ? clamp(c2 / den, 0, 1) : 0;
    let [R, G, B] = hsl2rgb(h, s2, clamp(l + prof.light * (1 - l), 0, 1));
    // paper white and the darkest black the press makes
    const P = prof.paper;
    const K = prof.black;
    R = K[0] + R * (P[0] - K[0]);
    G = K[1] + G * (P[1] - K[1]);
    B = K[2] + B * (P[2] - K[2]);
    return [R, G, B, out];
  };
  const N = 64;
  let lut = null;
  let lutKey = '';
  const buildLut = () => {
    const prof = PROFILES[S.proofProfile] || PROFILES.coated;
    const key = S.proofProfile + '|' + (S.renderIntent || '');
    if (lut && lutKey === key) return lut;
    lut = new Uint8Array(N * N * N * 4);
    for (let r = 0; r < N; r++) for (let g = 0; g < N; g++) for (let b = 0; b < N; b++) {
      const c = WK.proofColor((r * 255) / (N - 1), (g * 255) / (N - 1), (b * 255) / (N - 1), prof);
      const o = ((r * N + g) * N + b) * 4;
      lut[o] = c[0];
      lut[o + 1] = c[1];
      lut[o + 2] = c[2];
      lut[o + 3] = c[3] ? 1 : 0;
    }
    lutKey = key;
    return lut;
  };
  const ALARM = [36, 211, 63];
  const proofCanvas = (ctx) => {
    const cv = ctx.canvas;
    const W = cv.width;
    const Hh = cv.height;
    if (!W || !Hh) return;
    const L = buildLut();
    const img = ctx.getImageData(0, 0, W, Hh);
    const d = img.data;
    const q = (N - 1) / 255;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const o = ((Math.round(d[i] * q) * N + Math.round(d[i + 1] * q)) * N + Math.round(d[i + 2] * q)) * 4;
      if (WK.gamut && L[o + 3]) {
        d[i] = ALARM[0];
        d[i + 1] = ALARM[1];
        d[i + 2] = ALARM[2];
      } else {
        d[i] = L[o];
        d[i + 1] = L[o + 1];
        d[i + 2] = L[o + 2];
      }
    }
    ctx.putImageData(img, 0, 0);
  };
  const pdraw0 = paper.Project.prototype.draw;
  paper.Project.prototype.draw = function (ctx, matrix, pr) {
    if (!(WK.proof || WK.gamut) || this !== paper.project || !VP.uiLayer) return pdraw0.call(this, ctx, matrix, pr);
    // artwork first (with the page), proofed; guides and handles on top, as they are
    const top = [VP.guideLayer, VP.uiLayer].filter(Boolean);
    const vis = top.map((l) => l._visible);
    top.forEach((l) => (l._visible = false));
    try {
      pdraw0.call(this, ctx, matrix, pr);
    } finally {
      top.forEach((l, i) => (l._visible = vis[i]));
    }
    try {
      proofCanvas(ctx);
    } catch (e) { /* a canvas that cannot be read back is shown as it is */ }
    ctx.save();
    matrix.applyToContext(ctx);
    const param = new paper.Base({ offset: new paper.Point(0, 0), pixelRatio: pr, viewMatrix: matrix.isIdentity() ? null : matrix, matrices: [new paper.Matrix()], updateMatrix: true });
    top.forEach((l) => l.draw(ctx, param));
    ctx.restore();
  };
  const redraw = () => {
    if (paper.view) {
      paper.view._needsUpdate = true;
      paper.view.requestUpdate();
    }
    UI.schedule('top', 'status', 'prop');
  };
  WK.setProof = (on) => {
    WK.proof = on;
    if (!on) WK.gamut = false;
    redraw();
    VP.toast(on ? 'Renk provası: ' + PROFILES[S.proofProfile].label + ' · Yaklaşık görünüm (renk profili değil)' : 'Renk provası kapalı');
  };
  WK.setGamut = (on) => {
    WK.gamut = on;
    if (on) WK.proof = true;
    redraw();
    VP.toast(on ? 'Gamut uyarısı: yeşil alanlar baskıda daha soluk çıkar' : 'Gamut uyarısı kapalı');
  };
  // a status line note while proofing
  const st0 = UI.renderStatus;
  if (st0) {
    UI.renderStatus = function () {
      const r = st0.apply(this, arguments);
      const el = document.querySelector('#st-info');
      if (el && (WK.proof || WK.gamut) && !el.textContent.startsWith('Prova')) el.textContent = 'Prova: ' + PROFILES[S.proofProfile].label + (WK.gamut ? ' · gamut uyarısı' : '') + ' · ' + el.textContent;
      return r;
    };
  }

  /* ======================================================================
     actions and menus
     ====================================================================== */
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^wx[A-Z]/.test(n) ? WK.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^wx[A-Z]/.test(id) ? WK.act(id, el) : act0(id, el));
  Object.assign(A, {
    dockExport: { label: 'Dışa aktarma paneli', icon: 'export', run: () => UI.openDock('export') },
    exportAddSel: { label: 'Dışa aktarma listesine ekle', icon: 'export', enabled: () => VP.sel.length > 0, run: () => WK.addSelection() },
    proofColors: { label: 'Renk provası', checked: () => !!WK.proof, run: () => WK.setProof(!WK.proof) },
    gamutAlarm: { label: 'Gamut uyarısı', checked: () => !!WK.gamut, run: () => WK.setGamut(!WK.gamut) }
  });
  Object.keys(PROFILES).forEach((k) => {
    A['proof_' + k] = {
      label: PROFILES[k].label,
      checked: () => S.proofProfile === k,
      run: () => {
        S.proofProfile = k;
        VP.io.savePrefs();
        WK.setProof(true);
      }
    };
  });
  ins('file', 'exportPdf', ['dockExport']);
  ins('window', 'dockCoords', ['dockExport']);
  ins('view', 'multiPage', ['|', 'proofColors', 'gamutAlarm', 'sub:Prova kâğıdı|' + Object.keys(PROFILES).map((k) => 'proof_' + k).join(',')]);
  ins('object', null, ['exportAddSel']);
})();
