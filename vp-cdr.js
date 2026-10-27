/* VektörPad: CorelDRAW files.
   Opening .cdr: written for this app from the file layout (a zip with RIFF parts in CorelDRAW X6 to 2026,
   a single RIFF file in older versions). Reads pages, layers, groups, curves, rectangles, ellipses,
   fills and outlines; the page previews stored in the file are kept as a hidden reference layer.
   Saving for CorelDRAW: the user picks the CorelDRAW version and gets the format that version opens best
   (PDF, AI or EPS). A real .cdr file is not written: only CorelDRAW itself writes that format. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const IO = VP.io;
  const A = VP.actions;
  const esc = UI.h.esc;
  const CDR = (VP.cdr = {});
  const UNIT = 72 / 254000; // CorelDRAW unit (1/254000 inch) in points

  /* =============== versions =============== */
  CDR.VERSIONS = [
    [27, 'CorelDRAW 2026'], [26, 'CorelDRAW 2025'], [25, 'CorelDRAW 2024'], [24, 'CorelDRAW 2022'], [23, 'CorelDRAW 2021'],
    [22, 'CorelDRAW 2020'], [21, 'CorelDRAW 2019'], [20, 'CorelDRAW 2018'], [19, 'CorelDRAW 2017'], [18, 'CorelDRAW X8'],
    [17, 'CorelDRAW X7'], [16, 'CorelDRAW X6'], [15, 'CorelDRAW X5'], [14, 'CorelDRAW X4'], [13, 'CorelDRAW X3']
  ];
  CDR.versionName = (v) => {
    const r = CDR.VERSIONS.find(([n]) => n === v);
    return r ? r[1] : v > 27 ? 'CorelDRAW (sürüm ' + v + ')' : 'CorelDRAW ' + v;
  };

  /* =============== zip =============== */
  const inflate = async (u8) => {
    if (typeof DecompressionStream === 'undefined') throw new Error('nozip');
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([u8]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  };
  CDR.unzip = (buf) => {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('zip');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entries = {};
    const dec = new TextDecoder();
    for (let k = 0; k < n && dv.getUint32(p, true) === 0x02014b50; k++) {
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true);
      const el = dv.getUint16(p + 30, true);
      const cl = dv.getUint16(p + 32, true);
      const lo = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      entries[name] = { method, csize, lo };
      p += 46 + nl + el + cl;
    }
    const get = async (name) => {
      const e = entries[name];
      if (!e) return null;
      const start = e.lo + 30 + dv.getUint16(e.lo + 26, true) + dv.getUint16(e.lo + 28, true);
      const raw = u8.subarray(start, start + e.csize);
      return e.method === 0 ? raw.slice() : inflate(raw);
    };
    return { names: Object.keys(entries), get };
  };

  /* =============== RIFF walk =============== */
  const fourcc = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  const dvOf = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  // reads the chunk tree; in X6+ files most chunks hold a 16-byte reference into a data file
  CDR.tree = (root, files) => {
    const dv = dvOf(root);
    const body = (off, sz) => {
      if (files && sz === 16) {
        const fi = dv.getInt32(off + 8, true);
        const len = dv.getUint32(off + 12, true);
        if (fi === -1) return root.subarray(off + 16, off + 16 + Math.min(len, 8));
        const at = dv.getUint32(off + 16, true);
        const f = files[fi];
        if (f && at + len <= f.length) return f.subarray(at, at + len);
      }
      return root.subarray(off + 8, off + 8 + sz);
    };
    const walk = (off, end, node) => {
      while (off + 8 <= end) {
        const id = fourcc(root, off);
        const sz = dv.getUint32(off + 4, true);
        if (id === 'RIFF' || id === 'LIST') {
          const t = fourcc(root, off + 8);
          const child = { list: t.trim(), items: [], parent: node };
          node.items.push(child);
          walk(off + 12, Math.min(off + 8 + sz, end), child);
        } else node.items.push({ id: id.trim(), data: body(off, sz) });
        off += 8 + sz + (sz & 1);
      }
    };
    const top = { list: 'top', items: [] };
    walk(0, root.length, top);
    return top.items[0];
  };

  /* =============== colours and styles =============== */
  const hex2 = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  const rgb = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
  const cmyk = (c, m, y, k) => rgb(255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k));
  const lab2rgb = (L, a, b) => {
    let y = (L + 16) / 116;
    let x = a / 500 + y;
    let z = y - b / 200;
    const f = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
    x = 0.95047 * f(x);
    y = f(y);
    z = 1.08883 * f(z);
    const g = (c) => 255 * (c > 0.0031308 ? 1.055 * c ** (1 / 2.4) - 0.055 : 12.92 * c);
    return rgb(g(x * 3.2406 + y * -1.5372 + z * -0.4986), g(x * -0.9689 + y * 1.8758 + z * 0.0415), g(x * 0.0557 + y * -0.204 + z * 1.057));
  };
  // "CMYK,USER,0,0,0,100,100,<guid>" as written in CorelDRAW 2019 and later
  CDR.colorFromString = (s) => {
    if (!s) return null;
    const p = String(s).split(',');
    const model = (p[0] || '').toUpperCase();
    const v = p.slice(2).map(Number).filter((x) => isFinite(x));
    if (/^CMYK/.test(model)) {
      const max = /255|100$/.test(model) && model !== 'CMYK' ? 255 : 100;
      if (v.length >= 4) return cmyk(v[0] / max, v[1] / max, v[2] / max, v[3] / max);
    }
    if (/^CMY$/.test(model) && v.length >= 3) return cmyk(v[0] / 255, v[1] / 255, v[2] / 255, 0);
    if (/^RGB/.test(model) && v.length >= 3) return rgb(v[0], v[1], v[2]);
    if (/^(GRAY|GREY)/.test(model) && v.length) return rgb(v[0], v[0], v[0]);
    if (/^LAB/.test(model) && v.length >= 3) return lab2rgb(v[0] > 100 ? v[0] / 2.55 : v[0], v[1] > 127 ? v[1] - 128 : v[1], v[2] > 127 ? v[2] - 128 : v[2]);
    if (/^(HSB|HSV)/.test(model) && v.length >= 3) {
      const c = new paper.Color({ hue: v[0], saturation: v[1] / (v[1] > 1 ? 255 : 1), brightness: v[2] / (v[2] > 1 ? 255 : 1) });
      return c.toCSS(true);
    }
    // spot and named colours carry their CMYK equivalent at the end
    if (v.length >= 4) return cmyk(v[v.length - 5] / 100 || 0, v[v.length - 4] / 100 || 0, v[v.length - 3] / 100 || 0, v[v.length - 2] / 100 || 0);
    return null;
  };
  // binary colour of the fill table (versions without the JSON style)
  const binColor = (d, o) => {
    if (o + 12 > d.length) return null;
    const dv = dvOf(d);
    const model = dv.getUint16(o, true);
    const b = d.subarray(o + 8, o + 12);
    switch (model) {
      case 1: case 2: case 0x11: case 0x14: return cmyk(b[0] / 100, b[1] / 100, b[2] / 100, b[3] / 100);
      case 3: return cmyk(b[0] / 255, b[1] / 255, b[2] / 255, b[3] / 255);
      case 4: return cmyk(b[0] / 255, b[1] / 255, b[2] / 255, 0);
      case 5: return rgb(b[2], b[1], b[0]);
      case 9: return rgb(b[0], b[0], b[0]);
      default: return cmyk(b[0] / 100, b[1] / 100, b[2] / 100, b[3] / 100);
    }
  };
  const parseFild = (d) => {
    try {
      const dv = dvOf(d);
      const id = dv.getUint32(0, true);
      const type = dv.getUint16(12, true);
      if (type === 0) return [id, { type: 'none' }];
      return [id, { type: 'solid', color: binColor(d, 27) }];
    } catch (e) {
      return null;
    }
  };

  /* =============== text stream =============== */
  // The stream ends with: character count, one 8-byte record per character (bit 0 of the first byte:
  // the character takes two bytes; bytes 2-3: its style number), byte count, the characters, padding.
  // Before that come the style blocks as JSON: the first is the base (paragraph) style.
  CDR.textOf = (d) => {
    const dv = dvOf(d);
    const L = d.length;
    const dec = new TextDecoder('utf-8');
    const blocks = [];
    for (let i = d.indexOf(0x7b); i >= 4 && i < L; i = d.indexOf(0x7b, i + 1)) {
      const len = dv.getUint32(i - 4, true);
      if (len < 2 || i + len > L || d[i + len - 1] !== 0x7d) continue;
      try {
        blocks.push(JSON.parse(dec.decode(d.subarray(i, i + len))));
        i += len - 1;
      } catch (e) { /* not a style block */ }
    }
    let E = L;
    while (E > 0 && d[E - 1] === 0 && L - E < 16) E--;
    let chars = null;
    for (let n = 1; n < Math.min(E - 4, 200000) && !chars; n++) {
      const p = E - n - 4;
      if (p < 0) break;
      if (dv.getUint32(p, true) !== n) continue;
      // per-character records
      for (let c = Math.ceil(n / 2); c <= n; c++) {
        const q = p - 8 * c - 4;
        if (q < 0 || dv.getUint32(q, true) !== c) continue;
        let wide = 0;
        for (let k = 0; k < c; k++) wide += d[q + 4 + 8 * k] & 1;
        if (wide !== n - c) continue;
        const out = [];
        let at = p + 4;
        for (let k = 0; k < c; k++) {
          const rec = q + 4 + 8 * k;
          const two = d[rec] & 1;
          const code = two ? dv.getUint16(at, true) : d[at];
          at += two ? 2 : 1;
          out.push({ c: String.fromCharCode(code), s: dv.getUint16(rec + 2, true) });
        }
        chars = out;
        break;
      }
      if (!chars) {
        const s = dec.decode(d.subarray(p + 4, p + 4 + n));
        // an empty text box ends with a style block, not with characters
        let isStyle = false;
        if (/^\s*\{/.test(s)) {
          try {
            JSON.parse(s);
            isStyle = true;
          } catch (e) { /* real text */ }
        }
        chars = isStyle ? [] : [...s].map((c) => ({ c, s: 0 }));
        break;
      }
    }
    chars = (chars || []).filter((x) => x.c !== '\0');
    return { chars, blocks, text: chars.map((x) => x.c).join(''), style: blocks[0] || null };
  };

  // greedy word wrap measured with the browser's font metrics
  let mctx = null;
  CDR.wrap = (text, width, font, size, bold, italic) => {
    mctx = mctx || document.createElement('canvas').getContext('2d');
    mctx.font = (italic ? 'italic ' : '') + (bold ? 'bold ' : '') + size + 'px "' + font.replace(/"/g, '') + '", Arial, sans-serif';
    return text.split('\n').map((para) => {
      const words = para.split(/ +/);
      const lines = [];
      let cur = '';
      words.forEach((w) => {
        const next = cur ? cur + ' ' + w : w;
        if (cur && mctx.measureText(next).width > width) {
          lines.push(cur);
          cur = w;
        } else cur = next;
      });
      lines.push(cur);
      return lines.join('\n');
    }).join('\n');
  };

  /* =============== bitmaps =============== */
  // A bitmap record: id, header, then an "RI" image block (width, height, bits per pixel, row bytes,
  // pixel rows from the bottom up); an optional 8-bit transparency block follows the colour block.
  const riBlock = (rec, at) => {
    if (at < 0 || at + 80 > rec.length || rec[at] !== 0x52 || rec[at + 1] !== 0x49) return null;
    const dv = dvOf(rec);
    const w = dv.getUint32(at + 22, true);
    const h = dv.getUint32(at + 26, true);
    const bpp = dv.getUint32(at + 34, true);
    const stride = dv.getUint32(at + 38, true);
    if (!w || !h || w > 30000 || h > 30000 || stride < Math.ceil((w * bpp) / 8)) return null;
    let data = at + 78;
    // the palette of an 8-bit colour image sits before its pixels
    let pal = null;
    if (bpp <= 8 && data + stride * h + 1024 <= rec.length && rec.length - data > stride * h + 1000) {
      pal = rec.subarray(data, data + 1024);
      data += 1024;
    }
    if (data + stride * (h - 1) + Math.ceil((w * bpp) / 8) > rec.length) return null;
    return { w, h, bpp, stride, data, pal };
  };
  CDR.bitmapSize = (rec) => {
    for (let i = 8; i < Math.min(rec.length - 2, 400); i++) {
      const b = rec[i] === 0x52 && rec[i + 1] === 0x49 ? riBlock(rec, i) : null;
      if (b) return [b.w, b.h];
    }
    return null;
  };
  CDR.bitmap = (rec) => {
    try {
      const dv = dvOf(rec);
      let at = -1;
      for (let i = 8; i < Math.min(rec.length - 2, 400); i++) {
        if (rec[i] === 0x52 && rec[i + 1] === 0x49 && riBlock(rec, i)) {
          at = i;
          break;
        }
      }
      const img = riBlock(rec, at);
      if (!img) return null;
      const mo = dv.getUint32(24, true);
      const mask = mo ? riBlock(rec, 8 + mo) : null;
      const cv = document.createElement('canvas');
      cv.width = img.w;
      cv.height = img.h;
      const ctx = cv.getContext('2d');
      const id = ctx.createImageData(img.w, img.h);
      const px = id.data;
      let alpha = false;
      for (let y = 0; y < img.h; y++) {
        const row = img.data + (img.h - 1 - y) * img.stride;
        const mrow = mask && mask.w === img.w && mask.h === img.h ? mask.data + (img.h - 1 - y) * mask.stride : -1;
        for (let x = 0; x < img.w; x++) {
          const o = (y * img.w + x) * 4;
          if (img.bpp === 24 || img.bpp === 32) {
            const s = row + x * (img.bpp >> 3);
            px[o] = rec[s + 2];
            px[o + 1] = rec[s + 1];
            px[o + 2] = rec[s];
          } else if (img.bpp === 8) {
            const v = rec[row + x];
            if (img.pal) {
              px[o] = img.pal[v * 4 + 2];
              px[o + 1] = img.pal[v * 4 + 1];
              px[o + 2] = img.pal[v * 4];
            } else px[o] = px[o + 1] = px[o + 2] = v;
          } else if (img.bpp === 1) {
            const v = (rec[row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
            px[o] = px[o + 1] = px[o + 2] = v;
          }
          px[o + 3] = mrow >= 0 ? rec[mrow + x] : 255;
          if (px[o + 3] < 250) alpha = true;
        }
      }
      ctx.putImageData(id, 0, 0);
      return { canvas: cv, w: img.w, h: img.h, alpha };
    } catch (e) {
      return null;
    }
  };

  /* =============== object geometry =============== */
  const args = (d) => {
    const dv = dvOf(d);
    const n = dv.getUint32(4, true);
    const sa = dv.getUint32(8, true);
    const st = dv.getUint32(12, true);
    const type = dv.getUint32(16, true);
    const out = { type, args: {} };
    if (n > 64 || sa + 4 * n > d.length || st + 4 * n > d.length) return out;
    const offs = [];
    const tys = [];
    for (let i = 0; i < n; i++) {
      offs.push(dv.getUint32(sa + 4 * i, true));
      tys.push(dv.getUint32(st + 4 * (n - 1 - i), true));
    }
    tys.forEach((t, i) => {
      const a = offs[i];
      const b = i + 1 < n ? offs[i + 1] : d.length;
      if (a < b && b <= d.length) out.args[t] = d.subarray(a, b);
    });
    // later args may not be in ascending order: give each the bytes up to the next start
    const sorted = offs.map((o, i) => [o, tys[i]]).sort((x, y) => x[0] - y[0]);
    sorted.forEach(([o, t], i) => {
      const b = i + 1 < sorted.length ? sorted[i + 1][0] : d.length;
      if (o < b && b <= d.length) out.args[t] = d.subarray(o, b);
    });
    return out;
  };
  const matrixOf = (d, ver) => {
    if (!d || d.length < 24) return null;
    const dv = dvOf(d);
    try {
      const n = dv.getUint32(4, true);
      const sa = dv.getUint32(8, true);
      let m = null;
      for (let i = 0; i < Math.min(n, 8); i++) {
        let o = dv.getUint32(sa + 4 * i, true);
        if (ver >= 13) o += 8;
        const t = dv.getUint16(o, true);
        if (t !== 8) continue;
        const base = ver >= 13 ? o + 8 : o + 2;
        if (base + 48 > d.length) continue;
        const v = [0, 1, 2, 3, 4, 5].map((k) => dv.getFloat64(base + 8 * k, true));
        if (!v.every(isFinite)) continue;
        const mm = new paper.Matrix(v[0], v[3], v[1], v[4], v[2], v[5]);
        m = m ? mm.appended(m) : mm;
      }
      return m;
    } catch (e) {
      return null;
    }
  };
  const curve = (s) => {
    const dv = dvOf(s);
    const np = dv.getUint32(0, true);
    if (!np || 4 + np * 9 > s.length + 1) return null;
    const P = (k) => new paper.Point(dv.getInt32(4 + k * 8, true), dv.getInt32(8 + k * 8, true));
    const T = (k) => s[4 + np * 8 + k];
    const cp = new paper.CompoundPath({ insert: false });
    const ctrl = [];
    let open = false;
    for (let k = 0; k < np; k++) {
      const t = T(k);
      const p = P(k);
      const kind = t & 0xc0;
      if (kind === 0) {
        cp.moveTo(p);
        open = true;
        ctrl.length = 0;
      } else if (kind === 0x40) {
        if (!open) cp.moveTo(p);
        else cp.lineTo(p);
        open = true;
      } else if (kind === 0xc0) {
        ctrl.push(p);
        continue;
      } else {
        if (!open) cp.moveTo(p);
        else if (ctrl.length >= 2) cp.cubicCurveTo(ctrl[0], ctrl[1], p);
        else if (ctrl.length === 1) cp.quadraticCurveTo(ctrl[0], p);
        else cp.lineTo(p);
        open = true;
        ctrl.length = 0;
      }
      if (t & 0x08 && kind !== 0) cp.closePath();
    }
    return cp;
  };
  const rectOf = (s, ver) => {
    const dv = dvOf(s);
    let w;
    let h;
    if (ver >= 15 && s.length >= 16) {
      w = dv.getFloat64(0, true);
      h = dv.getFloat64(8, true);
    } else {
      w = dv.getInt32(0, true);
      h = dv.getInt32(4, true);
    }
    if (!isFinite(w) || !isFinite(h) || Math.abs(w) > 1e10 || Math.abs(h) > 1e10) return null;
    return new paper.Path.Rectangle({ rectangle: new paper.Rectangle(new paper.Point(0, 0), new paper.Point(w, h)), insert: false });
  };
  const ellipseOf = (s) => {
    const dv = dvOf(s);
    const w = dv.getInt32(0, true);
    const h = dv.getInt32(4, true);
    if (!w || !h) return null;
    return new paper.Path.Ellipse({ rectangle: new paper.Rectangle(new paper.Point(0, 0), new paper.Point(w, h)), insert: false });
  };

  /* =============== document =============== */
  CDR.read = async (buf) => {
    const u8 = new Uint8Array(buf);
    let root = null;
    let files = null;
    const previews = {};
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
      const z = CDR.unzip(buf);
      if (z.names.includes('content/root.dat')) {
        root = await z.get('content/root.dat');
        const list = new TextDecoder().decode((await z.get('content/dataFileList.dat')) || new Uint8Array()).split(/\r?\n/).filter(Boolean);
        files = [];
        for (const n of list) files.push((await z.get('content/data/' + n)) || (await z.get('content/' + n)));
      } else if (z.names.includes('content/riffData.cdr')) root = await z.get('content/riffData.cdr');
      for (const n of z.names) {
        const m = /^previews\/page(\d+)\.png$/i.exec(n);
        if (m) previews[+m[1]] = await z.get(n);
      }
    } else root = u8;
    // CDR documents and CDT templates
    if (!root || fourcc(root, 0) !== 'RIFF' || !/^CD[RT]/.test(fourcc(root, 8))) throw new Error('format');
    const tree = CDR.tree(root, files);
    return { tree, previews, letter: fourcc(root, 8)[3] };
  };
  CDR.toDoc = (R, name) => {
    const tree = R.tree;
    const st = { fills: {}, ver: 0, W: 0, H: 0, depth: 0, stats: { shapes: 0, skipped: {}, groups: 0 } };
    const find = (node, id) => node.items.find((x) => x.id === id);
    const vr = find(tree, 'vrsn');
    if (vr && vr.data.length >= 2) st.ver = Math.round(dvOf(vr.data).getUint16(0, true) / 100);
    if (!st.ver) st.ver = R.letter >= '0' && R.letter <= '9' ? +R.letter : R.letter.charCodeAt(0) - 55;
    const doc = tree.items.find((x) => x.list === 'doc');
    if (doc) {
      const mc = find(doc, 'mcfg');
      if (mc && mc.data.length >= 20) {
        const dv = dvOf(mc.data);
        const w = dv.getInt32(12, true);
        const h = dv.getInt32(16, true);
        if (w > 1e4 && h > 1e4 && w < 1e9 && h < 1e9) {
          st.W = w;
          st.H = h;
        }
        // facing pages: the origin sits on the spine between the left and right page
        if (mc.data.length >= 28) st.facing = !!((dv.getUint32(24, true) >>> 16) & 1);
      }
      const walkFills = (n) => n.items.forEach((x) => {
        if (x.list) walkFills(x);
        else if (x.id === 'fild') {
          const r = parseFild(x.data);
          if (r) st.fills[r[0]] = r[1];
        }
      });
      walkFills(doc);
    }
    if (!st.W) {
      st.W = 2100000;
      st.H = 2970000;
    }
    // PowerClip contents live in the document's clip table, keyed by number
    // bitmaps by number
    st.bmps = {};
    const bmpt = tree.items.find((x) => x.list === 'bmpt');
    (bmpt ? bmpt.items : []).forEach((x) => {
      if (x.id === 'bmp' && x.data.length > 8) st.bmps[dvOf(x.data).getUint32(0, true)] = x.data;
    });
    st.bmpCache = {};
    // an image object: its frame corners, pixel size and bitmap number
    const buildImage = (s) => {
      if (!s || s.length < 52) return null;
      const dv = dvOf(s);
      const x0 = dv.getInt32(0, true);
      const y0 = dv.getInt32(4, true);
      const x1 = dv.getInt32(8, true);
      const y1 = dv.getInt32(12, true);
      const pw = dv.getUint32(36, true);
      const ph = dv.getUint32(40, true);
      let rec = st.bmps[dv.getUint32(48, true)];
      const fits = (r) => {
        const b = r && CDR.bitmapSize(r);
        return b && b[0] === pw && b[1] === ph;
      };
      if (!fits(rec)) rec = Object.values(st.bmps).find(fits) || rec;
      if (!rec || !pw || !ph) return null;
      const key = dv.getUint32(48, true) + ':' + pw + 'x' + ph;
      let src = st.bmpCache[key];
      if (src === undefined) {
        const bm = CDR.bitmap(rec);
        src = st.bmpCache[key] = bm ? bm.canvas.toDataURL(bm.alpha ? 'image/png' : 'image/jpeg', 0.92) : null;
      }
      if (!src) return null;
      const r = new paper.Raster({ source: src, insert: false });
      const W = x1 - x0;
      const H = y0 - y1;
      r.transform(new paper.Matrix(W / pw, 0, 0, -H / ph, (x0 + x1) / 2, (y0 + y1) / 2));
      r.data.cdrSize = [pw, ph];
      return r;
    };
    st.clips = {};
    const clpt = doc && doc.items.find((x) => x.list === 'clpt');
    (clpt ? clpt.items : []).forEach((g) => {
      const sp = g.items && g.items.find((x) => x.id === 'spnd');
      if (sp && sp.data.length >= 4) st.clips[dvOf(sp.data).getUint32(0, true)] = g;
    });
    let PM = null;
    const setPage = (ox) => {
      PM = new paper.Matrix(UNIT, 0, 0, -UNIT, ox * UNIT, (st.H / 2) * UNIT);
    };
    setPage(st.W / 2);
    // facing pages: the origin is on the spine, so a right page spans 0..W, a left page -W..0
    // and a two-page spread -W..W. The stored content box and the preview's shape tell which.
    const pngSize = (u8) => (u8 && u8.length > 24 ? [(u8[16] << 24) | (u8[17] << 16) | (u8[18] << 8) | u8[19], (u8[20] << 24) | (u8[21] << 16) | (u8[22] << 8) | u8[23]] : null);
    const pageFrame = (pg, i) => {
      if (!st.facing) return { ox: st.W / 2, w: st.W };
      const bb = pg.items.find((x) => x.id === 'bbox');
      let cx = 0;
      if (bb && bb.data.length >= 16) {
        const dv = dvOf(bb.data);
        cx = (dv.getInt32(0, true) + dv.getInt32(8, true)) / 2;
      }
      const ps = pngSize(R.previews[i + 1]);
      const spread = ps && ps[0] / ps[1] > (st.W / st.H) * 1.5;
      if (spread) return { ox: st.W, w: st.W * 2 };
      return cx < 0 ? { ox: st.W, w: st.W } : { ox: 0, w: st.W };
    };
    const styleOf = (item, a) => {
      let fill = null;
      let stroke = null;
      const js = a.args[201];
      if (js && js.length > 8) {
        try {
          const len = dvOf(js).getUint32(4, true);
          const o = JSON.parse(new TextDecoder().decode(js.subarray(8, 8 + len)));
          const f = o.fill || {};
          if (f.type && f.type !== '0') fill = CDR.colorFromString(f.primaryColor) || '#808080';
          // fountain fill: colour stops from start, in-between and end colours
          let grad = null;
          if (f.type === '2' && f.primaryColor && f.secondaryColor) {
            const stop = (c, pos, al) => {
              const col = new paper.Color(CDR.colorFromString(c) || '#808080');
              col.alpha = al == null || al === '' ? 1 : Math.max(0, Math.min(1, +al / 255));
              return [col, Math.max(0, Math.min(1, pos))];
            };
            const stops = [stop(f.primaryColor, 0, f.primaryAlpha)];
            (f.intermediateColors || []).forEach((s) => {
              const p = String(s).split(':');
              if (p.length >= 3) stops.push(stop(p[1], +p[0] / 100, p[2]));
            });
            stops.push(stop(f.secondaryColor, 1, f.secondaryAlpha));
            stops.sort((x, y) => x[1] - y[1]);
            grad = { kind: +f.fountainType === 2 ? 'radial' : 'linear', angle: +f.angle || 0, stops };
          }
          const ol = o.outline || {};
          const w = +ol.width || 0;
          if (w > 0 && ol.color) stroke = { color: CDR.colorFromString(ol.color) || '#000000', width: w * UNIT, cap: ['butt', 'round', 'square'][+ol.endCaps] || 'butt', join: ['miter', 'round', 'bevel'][+ol.joinType] || 'miter', dash: ol.dashDotSpec && ol.dashDotSpec !== '0' };
          // uniform transparency: 0 opaque … 1 clear
          const tr = o.transparency || {};
          const opacity = tr.uniformTransparency != null && (!tr.fill || tr.fill.type === '1') ? Math.max(0, Math.min(1, 1 - +tr.uniformTransparency)) : 1;
          return { fill, stroke, grad, opacity };
        } catch (e) { /* fall back to the fill table */ }
      }
      const fa = a.args[20];
      if (fa && fa.length >= 4) {
        const f = st.fills[dvOf(fa).getUint32(0, true)];
        if (f && f.type === 'solid') fill = f.color || '#808080';
      }
      return { fill, stroke };
    };
    // artistic and paragraph text: the characters and their style are in the object's text stream
    const merge = (x, y) => {
      const o = Object.assign({}, x);
      Object.keys(y || {}).forEach((k) => {
        o[k] = y[k] && typeof y[k] === 'object' && !Array.isArray(y[k]) ? merge((x && x[k]) || {}, y[k]) : y[k];
      });
      return o;
    };
    const famOf = (font) => '"' + font.replace(/"/g, '') + '", Arial, sans-serif';
    const measure = (css, s) => {
      mctx = mctx || document.createElement('canvas').getContext('2d');
      mctx.font = css;
      return mctx.measureText(s).width;
    };
    // CorelDRAW line spacing is a share of the character height (ascent + descent, about 1.12 em)
    const LINE = 1.12;
    const BREAK = /[\r\n\x0b\u2028\u2029]/;
    const buildText = (node, a, m) => {
      const tx = node.items.find((x) => x.id === 'txsm');
      if (!tx) return null;
      const t = CDR.textOf(tx.data);
      // an empty text box (an empty table cell, say) draws nothing
      if (!t.chars.length || !t.chars.some((x) => !BREAK.test(x.c) && x.c.trim())) return 'empty';
      const M = m ? PM.appended(m) : PM;
      const sc = m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1 : 1;
      const base = (t.blocks[0] && t.blocks[0].character) || {};
      const para = (t.blocks[0] && t.blocks[0].paragraph) || {};
      const objFill = styleOf(null, a).fill;
      const cache = {};
      // style number n uses style block n/2 after the base block
      const styleFor = (n) => {
        if (cache[n]) return cache[n];
        const blk = t.blocks[1 + (n >> 1)];
        const ch = merge(base, (blk && blk.character) || {});
        const lat = ch.latin || {};
        const font = lat.font || 'Arial';
        const w = +lat.weight || 0;
        const bold = /bold|black|heavy/i.test(font) || w >= 1000 || (w >= 600 && w < 1000);
        const italic = /italic|oblique/i.test(font) || lat.italic === '1';
        const size = Math.max(1, (+lat.size || 42333) * UNIT * sc);
        const color = ch.fill && ch.fill.type && ch.fill.type !== '0' ? CDR.colorFromString(ch.fill.primaryColor) : objFill || '#000000';
        return (cache[n] = { font, bold, italic, size, color: color || '#000000', css: (italic ? 'italic ' : '') + (bold ? 'bold ' : '') + size + 'px ' + famOf(font) });
      };
      // lines of runs
      let lines = [[]];
      t.chars.forEach((x) => {
        if (BREAK.test(x.c)) lines.push([]);
        else lines[lines.length - 1].push(x);
      });
      const fr = a.args[30];
      const fw = a.type === 6 && fr && fr.length >= 12 ? dvOf(fr).getInt32(4, true) * UNIT * (m ? Math.hypot(m.a, m.b) : 1) : 0;
      // paragraph text wraps at spaces to the frame width
      if (fw > 0) {
        const out = [];
        lines.forEach((ln) => {
          let cur = [];
          let curW = 0;
          let word = [];
          const wordW = (wd) => wd.reduce((s, x) => s + measure(styleFor(x.s).css, x.c), 0);
          const flush = () => {
            const ww = wordW(word);
            if (cur.length && curW + ww > fw + 0.5) {
              while (cur.length && cur[cur.length - 1].c === ' ') cur.pop();
              out.push(cur);
              cur = word.filter((x, i) => i || x.c !== ' ');
              curW = wordW(cur);
            } else {
              cur = cur.concat(word);
              curW += ww;
            }
            word = [];
          };
          ln.forEach((x) => {
            if (x.c === ' ' && word.length && word[word.length - 1].c !== ' ') {
              word.push(x);
              flush();
            } else word.push(x);
          });
          flush();
          out.push(cur);
        });
        lines = out;
      }
      const just = { 2: 'center', 3: 'right' }[+para.justify] || 'left';
      const ls = (+para.interLineSpacing || 1000000) / 1000000;
      const O = M.transform(new paper.Point(0, 0));
      const styles = new Set(t.chars.map((x) => x.s));
      const runsOf = (ln) => {
        const r = [];
        ln.forEach((x) => {
          if (r.length && r[r.length - 1].s === x.s) r[r.length - 1].text += x.c;
          else r.push({ s: x.s, text: x.c });
        });
        return r;
      };
      const items = [];
      let y = O.y;
      lines.forEach((ln, li) => {
        const runs = runsOf(ln);
        const sz = runs.length ? Math.max(...runs.map((r) => styleFor(r.s).size)) : styleFor(0).size;
        if (li === 0) y += fw ? sz * 0.82 : 0;
        else y += sz * LINE * ls;
        const widths = runs.map((r) => measure(styleFor(r.s).css, r.text));
        const lw = widths.reduce((s, v) => s + v, 0);
        let x = fw ? O.x + (just === 'center' ? (fw - lw) / 2 : just === 'right' ? fw - lw : 0) : O.x - (just === 'center' ? lw / 2 : just === 'right' ? lw : 0);
        runs.forEach((r, i) => {
          const st2 = styleFor(r.s);
          if (r.text.trim()) {
            items.push(new paper.PointText({
              point: new paper.Point(x, y), content: r.text, fontFamily: famOf(st2.font), fontSize: st2.size,
              fontWeight: VP.textWeight ? VP.textWeight(st2.bold, st2.italic) : st2.bold ? 'bold' : 'normal',
              fillColor: new paper.Color(st2.color), insert: false
            }));
          }
          x += widths[i];
        });
      });
      if (!items.length) return null;
      let out;
      if (styles.size === 1 && lines.length > 1) {
        // one style: a single editable text object with its lines
        const st1 = styleFor([...styles][0]);
        const ax = fw ? O.x + (just === 'center' ? fw / 2 : just === 'right' ? fw : 0) : O.x;
        out = new paper.PointText({
          point: new paper.Point(ax, O.y + (fw ? st1.size * 0.82 : 0)), content: lines.map((ln) => ln.map((x) => x.c).join('')).join('\n'),
          fontFamily: famOf(st1.font), fontSize: st1.size, leading: st1.size * LINE * ls, justification: just,
          fontWeight: VP.textWeight ? VP.textWeight(st1.bold, st1.italic) : st1.bold ? 'bold' : 'normal',
          fillColor: new paper.Color(st1.color), insert: false
        });
      } else out = items.length === 1 ? items[0] : new paper.Group({ children: items, insert: false });
      if (m) {
        const ang = (Math.atan2(m.b, m.a) * 180) / Math.PI;
        if (Math.abs(ang) > 0.05) out.rotate(-ang, O);
      }
      return out;
    };
    const buildObj = (node) => {
      const lgob = node.items.find((x) => x.list === 'lgob');
      if (!lgob) return null;
      const lo = lgob.items.find((x) => x.id === 'loda');
      if (!lo) return null;
      const a = args(lo.data);
      const trfl = lgob.items.find((x) => x.list === 'trfl');
      const tr = trfl && trfl.items.find((x) => x.id === 'trfd');
      const coords = a.args[30];
      let it = null;
      if (a.type === 4 || a.type === 6) {
        try {
          it = buildText(node, a, matrixOf(tr && tr.data, st.ver));
        } catch (e) {
          it = null;
        }
        if (it === 'empty') return null;
        if (it) {
          st.stats.texts = (st.stats.texts || 0) + 1;
          return it;
        }
      }
      try {
        if (coords) {
          if (a.type === 3 || a.type === 0x14 || a.type === 0x25) it = curve(coords);
          else if (a.type === 1) it = rectOf(coords, st.ver);
          else if (a.type === 2) it = ellipseOf(coords);
          else if (a.type === 5) it = buildImage(coords);
        }
      } catch (e) {
        it = null;
      }
      if (!it) {
        const k = { 4: 'metin', 5: 'resim', 6: 'paragraf metni', 0x10: 'resim' }[a.type] || 'özel nesne';
        st.stats.skipped[k] = (st.stats.skipped[k] || 0) + 1;
        return null;
      }
      const m = matrixOf(tr && tr.data, st.ver);
      it.transform(m ? PM.appended(m) : PM);
      if (it instanceof paper.Raster) {
        st.stats.images = (st.stats.images || 0) + 1;
        return it;
      }
      if (it instanceof paper.CompoundPath) {
        it.fillRule = 'evenodd';
        if (it.children.length === 1) it = it.reduce();
      }
      const s = styleOf(it, a);
      it.fillColor = s.fill ? new paper.Color(s.fill) : null;
      if (s.grad && s.grad.stops.length >= 2) {
        const b = it.bounds;
        const c = b.center;
        let origin;
        let dest;
        if (s.grad.kind === 'radial') {
          origin = c;
          dest = c.add([Math.max(b.width, b.height) / 2, 0]);
        } else {
          // the angle runs counter-clockwise in CorelDRAW; the y axis is flipped here
          const r = (s.grad.angle * Math.PI) / 180;
          const dir = new paper.Point(Math.cos(r), -Math.sin(r));
          const half = (Math.abs(b.width * dir.x) + Math.abs(b.height * dir.y)) / 2;
          origin = c.subtract(dir.multiply(half));
          dest = c.add(dir.multiply(half));
        }
        it.fillColor = { gradient: { stops: s.grad.stops, radial: s.grad.kind === 'radial' }, origin, destination: dest };
      }
      if (s.opacity != null && s.opacity < 1) it.opacity = s.opacity;
      if (s.stroke) {
        it.strokeColor = new paper.Color(s.stroke.color);
        it.strokeWidth = Math.max(0.1, s.stroke.width);
        it.strokeCap = s.stroke.cap;
        it.strokeJoin = s.stroke.join;
        if (s.stroke.dash) it.dashArray = [it.strokeWidth * 3, it.strokeWidth * 2];
      }
      // PowerClip: the shape frames the contents kept in the clip table
      const pc = a.args[8005];
      if (pc && pc.length >= 8 && st.depth < 8) {
        const dv = dvOf(pc);
        const refs = [dv.getUint32(4, true)];
        if (pc.length >= 16) refs.push(dv.getUint32(12, true));
        const kids = [];
        st.depth++;
        refs.filter((r, i, all) => st.clips[r] && all.indexOf(r) === i).forEach((r) => buildChildren({ items: [st.clips[r]] }, kids));
        st.depth--;
        if (kids.length) {
          const clip = it.clone({ insert: false });
          clip.fillColor = null;
          clip.strokeColor = null;
          const g = new paper.Group({ children: [clip].concat(kids), insert: false });
          g.clipped = true;
          const out = new paper.Group({ children: [g], insert: false });
          if (s.fill) out.insertChild(0, it);
          else if (s.stroke) {
            it.fillColor = null;
            out.addChild(it);
          }
          st.stats.clips = (st.stats.clips || 0) + 1;
          st.stats.shapes++;
          return out.children.length === 1 ? g : out;
        }
      }
      if (!s.fill && !s.stroke) {
        // an object with neither fill nor outline is kept as a hairline so it can still be found
        it.strokeColor = new paper.Color('#1d1d1b');
        it.strokeWidth = 0.25;
      }
      st.stats.shapes++;
      return it;
    };
    // CorelDRAW lists objects (and layers) front to back; paper.js stacks them back to front
    const buildChildren = (node, into) => {
      node.items.slice().reverse().forEach((x) => {
        if (x.list === 'obj') {
          const it = buildObj(x);
          if (it) into.push(it);
        } else if (x.list === 'grp') {
          const kids = [];
          buildChildren(x, kids);
          // tables (object type 38): the table and each of its cells is a group with its own frame
          const frame = tableFrame(x);
          if (frame) kids.unshift(frame);
          if (kids.length) {
            const g = new paper.Group({ children: kids, insert: false });
            st.stats.groups++;
            into.push(g);
          }
        } else if (x.list === 'gobj' || x.list === 'lgob') buildChildren(x, into);
      });
    };
    const tableFrame = (x) => {
      const lgob = x.items.find((y) => y.list === 'lgob');
      const lo = lgob && lgob.items.find((y) => y.id === 'loda');
      const bb = x.items.find((y) => y.id === 'bbox');
      if (!lo || !bb || bb.data.length < 16) return null;
      const a = args(lo.data);
      if (a.type !== 38) return null;
      const dv = dvOf(bb.data);
      const p0 = PM.transform(new paper.Point(dv.getInt32(0, true), dv.getInt32(4, true)));
      const p1 = PM.transform(new paper.Point(dv.getInt32(8, true), dv.getInt32(12, true)));
      const s = styleOf(null, a);
      if (!s.fill && !s.stroke) return null;
      const r = new paper.Path.Rectangle({ rectangle: new paper.Rectangle(p0, p1), insert: false });
      r.fillColor = s.fill ? new paper.Color(s.fill) : null;
      if (s.stroke) {
        r.strokeColor = new paper.Color(s.stroke.color);
        r.strokeWidth = Math.max(0.1, s.stroke.width);
      }
      r.name = 'Tablo hücresi';
      st.stats.cells = (st.stats.cells || 0) + 1;
      return r;
    };
    const layerName = (layr) => {
      const lgob = layr.items.find((x) => x.list === 'lgob');
      const lo = lgob && lgob.items.find((x) => x.id === 'loda');
      if (!lo) return '';
      const s = args(lo.data).args[1000];
      if (!s) return '';
      let out = '';
      for (let i = 0; i + 1 < s.length; i += 2) {
        const c = s[i] | (s[i + 1] << 8);
        if (!c) break;
        out += String.fromCharCode(c);
      }
      return out;
    };
    const SPECIAL = /^(guides|desktop|grid|document grid|kılavuz.*|masaüstü|ızgara|belge ızgarası)$/i;
    const pages = tree.items.filter((x) => x.list === 'page');
    const layersOf = (page) => {
      const gobj = page.items.find((x) => x.list === 'gobj');
      const out = [];
      (gobj ? gobj.items : []).filter((x) => x.list === 'layr').reverse().forEach((layr) => {
        const name = layerName(layr);
        if (SPECIAL.test(name)) return;
        const items = [];
        buildChildren(layr, items);
        if (!name && !items.length) return;
        out.push({ name: name || 'Katman ' + (out.length + 1), items });
      });
      return out;
    };
    // the first page is the master page: its layers with objects repeat on every page
    const master = pages.length > 1 ? layersOf(pages[0]).filter((l) => l.items.length) : [];
    const real = pages.length > 1 ? pages.slice(1) : pages;
    const vdoc = VP.newDoc(name || 'Corel belgesi');
    vdoc.pages = [];
    real.forEach((pg, i) => {
      const fr = pageFrame(pg, i);
      setPage(fr.ox);
      const p = VP.newPage(i + 1, VP.toMM(fr.w * UNIT), VP.toMM(st.H * UNIT));
      const ls = [];
      const prev = R.previews[i + 1];
      if (prev) {
        // what CorelDRAW showed, as a hidden locked reference under everything
        const L = new paper.Layer({ name: 'Corel önizleme (başvuru)', insert: false });
        const r = new paper.Raster({ source: 'data:image/png;base64,' + b64(prev), insert: false });
        r.data.cdrPreview = true;
        L.addChild(r);
        L.visible = false;
        L.locked = true;
        L.data.cdrPreview = true;
        ls.push(L);
      }
      master.forEach((m) => {
        const L = new paper.Layer({ name: 'Ana: ' + m.name, insert: false });
        m.items.forEach((it) => L.addChild(it.clone({ insert: false })));
        ls.push(L);
      });
      layersOf(pg).forEach((l) => {
        const L = new paper.Layer({ name: l.name, insert: false });
        l.items.forEach((it) => L.addChild(it));
        ls.push(L);
      });
      if (!ls.some((L) => !L.data.cdrPreview)) ls.push(new paper.Layer({ name: 'Katman 1', insert: false }));
      p.layers = ls.map((L) => L.exportJSON({ asString: true, precision: 4 }));
      p.activeLayer = ls.length - 1;
      p.cdrPreviewSize = [fr.w * UNIT, st.H * UNIT];
      vdoc.pages.push(p);
    });
    if (!vdoc.pages.length) vdoc.pages.push(VP.newPage(1, VP.toMM(st.W * UNIT), VP.toMM(st.H * UNIT)));
    vdoc.ext = { colorMode: 'CMYK', cdrVersion: st.ver };
    return { doc: vdoc, stats: st.stats, ver: st.ver, previews: Object.keys(R.previews).length };
  };
  const b64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  // the preview raster takes the page size once its image has loaded
  VP.on('page', () => {
    const p = VP.page();
    if (!p || !p.cdrPreviewSize) return;
    VP.userLayers().filter((L) => L.data.cdrPreview).forEach((L) => L.children.forEach((r) => {
      if (!(r instanceof paper.Raster)) return;
      const fit = () => {
        r.bounds = new paper.Rectangle(0, 0, p.cdrPreviewSize[0], p.cdrPreviewSize[1]);
      };
      if (r.loaded) fit();
      else r.onLoad = fit;
    }));
  });

  CDR.open = async (file) => {
    VP.toast('CorelDRAW dosyası açılıyor…');
    try {
      const R = await CDR.read(await file.arrayBuffer());
      const name = (file.name || 'Corel belgesi').replace(/\.(cdr|cdt|cdrt)$/i, '');
      const res = CDR.toDoc(R, name);
      IO.loadDoc(res.doc);
      // a drawing left on the desktop beside the page: show it instead of an empty page
      setTimeout(() => {
        const bb = CDR.artBounds();
        if (bb && !VP.pageRect().intersects(bb)) {
          paper.view.center = bb.center;
          paper.view.zoom = Math.min(paper.view.viewSize.width / bb.width, paper.view.viewSize.height / bb.height) * 0.9;
          VP.viewChanged();
          setTimeout(() => VP.toast('Çizim Corel’de de sayfanın dışında (masaüstünde) duruyor · Mizanpaj › Sayfayı çizime uydur ile sayfaya alabilirsiniz'), 2600);
        }
      }, 60);
      const sk = Object.entries(res.stats.skipped).map(([k, n]) => n + ' ' + k).join(', ');
      VP.toast(CDR.versionName(res.ver) + ' dosyası açıldı · ' + res.stats.shapes + ' nesne' + (res.stats.texts ? ' · ' + res.stats.texts + ' metin' : '') + (sk ? ' · Okunamayan: ' + sk + (res.previews ? ' (Corel önizleme katmanında görünür)' : '') : ''));
      return res;
    } catch (e) {
      console.error(e);
      VP.toast(e && e.message === 'nozip' ? 'Bu tarayıcı sıkıştırılmış CDR dosyalarını açamıyor · Safari’yi güncelleyin' : 'CDR dosyası okunamadı · Corel’de PDF olarak kaydedip içe aktarmayı deneyin');
      return null;
    }
  };
  // bounds of everything drawn on the page (not the Corel preview)
  CDR.artBounds = () => VP.userLayers().filter((l) => !l.data.cdrPreview && l.visible).reduce((a, l) => {
    l.children.forEach((c) => {
      if (c.visible) a = a ? a.unite(c.bounds) : c.bounds.clone();
    });
    return a;
  }, null);
  // Layout › Fit page to drawing: the page takes the drawing's size and the drawing moves onto it
  CDR.fitPageToArt = () => {
    const bb = CDR.artBounds();
    if (!bb || bb.width < 1 || bb.height < 1) return VP.toast('Sayfada çizim yok');
    const d = new paper.Point(-bb.left, -bb.top);
    VP.userLayers().forEach((l) => {
      if (l.data.cdrPreview) return;
      VP.T.move(l.children.slice(), d);
    });
    VP.setPageSize(VP.toMM(bb.width), VP.toMM(bb.height));
    VP.commit();
    VP.toast('Sayfa çizime uyduruldu · ' + VP.num(VP.toMM(bb.width), 1) + ' × ' + VP.num(VP.toMM(bb.height), 1) + ' mm');
  };
  CDR.isCdr = (file) => /\.(cdr|cdt|cdrt)$/i.test(file.name || '');

  // File › Open and Import accept .cdr
  const ho0 = IO.handleOpen.bind(IO);
  IO.handleOpen = async (file) => (file && CDR.isCdr(file) ? CDR.open(file) : ho0(file));
  const fo = document.getElementById('file-open');
  if (fo) fo.setAttribute('accept', '.json,application/json,.cdr,.cdt,.cdrt');
  if (VP.files && IO.handleImport) {
    const hi0 = IO.handleImport.bind(IO);
    IO.handleImport = (file) => (file && CDR.isCdr(file) ? CDR.open(file) : hi0(file));
  }
  const fi = document.getElementById('file-import');
  if (fi && !/\.cdr/.test(fi.getAttribute('accept') || '')) fi.setAttribute('accept', (fi.getAttribute('accept') || '') + ',.cdr');

  /* =============== save for CorelDRAW =============== */
  const formatFor = (v) => (v >= 19 ? 'pdf' : v >= 15 ? 'ai' : 'eps');
  const FMT_LABEL = { pdf: 'PDF (düzenlenebilir vektör)', ai: 'AI (Illustrator uyumlu)', eps: 'EPS', svg: 'SVG' };
  CDR.saveFor = async (o) => {
    const FL = VP.files;
    if (!FL) return VP.toast('Dışa aktarma kullanılamıyor');
    const base = Object.assign({}, FL.DEFAULTS || {}, { area: 'page', range: 'all', curves: !!o.curves, title: VP.doc.name });
    const name = IO.safeName();
    if (o.fmt === 'pdf' || o.fmt === 'ai') {
      const blob = await FL.pdf(Object.assign(base, { fmt: 'pdf', returnBlob: true }));
      if (!blob) return;
      await IO.saveFile(name + (o.fmt === 'ai' ? '.ai' : '.pdf'), blob);
    } else await FL.exportAs(Object.assign(base, { fmt: o.fmt }));
    VP.ext().cdrVersion = o.ver;
    VP.toast(CDR.versionName(o.ver) + ' için ' + o.fmt.toUpperCase() + ' kaydedildi · Corel’de Dosya › Aç ile açıp istediğiniz sürümde CDR olarak kaydedin');
  };
  CDR.dialog = () => {
    const last = VP.settings.corelSave || {};
    const s = { ver: (VP.doc.ext && VP.doc.ext.cdrVersion) || last.ver || 27, fmt: null, curves: last.curves != null ? last.curves : false };
    const render = (root) => {
      const auto = formatFor(s.ver);
      const fmt = s.fmt || auto;
      root.innerHTML =
        '<h2>CorelDRAW için kaydet</h2>' +
        '<label class="field wide"><span>Sürüm</span><select data-cs="ver">' + CDR.VERSIONS.map(([v, l]) => '<option value="' + v + '"' + (v === +s.ver ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
        '<div class="row" style="margin-top:8px"><span class="opt-label">Biçim</span><span class="seg">' + ['pdf', 'ai', 'eps', 'svg'].map((f) => '<button data-fmt="' + f + '" class="' + (f === fmt ? 'on' : '') + '">' + f.toUpperCase() + (f === auto ? ' ★' : '') + '</button>').join('') + '</span></div>' +
        '<p class="sec-note">★ ' + esc(CDR.versionName(+s.ver)) + ' için önerilen: ' + esc(FMT_LABEL[auto]) + '. Corel’de açınca nesneler, katmanlar ve CMYK renkler düzenlenebilir gelir.</p>' +
        '<label class="field"><input type="checkbox" data-cs="curves"' + (s.curves ? ' checked' : '') + '><span style="text-transform:none">Metinleri eğriye dönüştür (yazı tipi olmayan bilgisayarlar için)</span></label>' +
        '<p class="sec-note">Not: Gerçek .cdr dosyasını yalnızca CorelDRAW yazabilir. Bu dosyayı Corel’de açıp <b>Farklı Kaydet</b> ile seçtiğiniz sürümde CDR olarak saklayabilirsiniz.</p>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Kaydet</button></div>';
    };
    UI.modal('', (root, close) => {
      render(root);
      root.addEventListener('change', (e) => {
        if (e.target.dataset.cs === 'ver') {
          s.ver = +e.target.value;
          s.fmt = null;
          render(root);
        } else if (e.target.dataset.cs === 'curves') s.curves = e.target.checked;
      });
      root.addEventListener('click', (e) => {
        const f = e.target.closest('[data-fmt]');
        if (f) {
          s.fmt = f.dataset.fmt;
          return render(root);
        }
        const x = e.target.closest('[data-x]');
        if (!x) return;
        close();
        if (x.dataset.x !== 'yes') return;
        VP.settings.corelSave = { ver: s.ver, curves: s.curves };
        IO.savePrefs();
        CDR.saveFor({ ver: s.ver, fmt: s.fmt || formatFor(s.ver), curves: s.curves });
      });
    });
  };

  Object.assign(A, {
    openCdr: {
      label: 'CorelDRAW dosyası aç (.cdr)…', icon: 'open', run: () => {
        // iPad's file picker greys out types it does not know, so this picker accepts every file
        const f = document.getElementById('file-open');
        if (!f) return;
        const keep = f.getAttribute('accept');
        f.removeAttribute('accept');
        IO.open();
        setTimeout(() => f.setAttribute('accept', keep), 1500);
      }
    },
    saveCorel: { label: 'CorelDRAW için kaydet (sürüm seç)…', icon: 'save', run: () => CDR.dialog() },
    cdrPreview: {
      label: 'Corel önizlemesini göster/gizle', run: () => {
        const L = VP.userLayers().find((l) => l.data.cdrPreview);
        if (!L) return VP.toast('Bu sayfada Corel önizlemesi yok');
        L.visible = !L.visible;
        VP.commit();
        VP.toast(L.visible ? 'Corel önizlemesi gösteriliyor (kilitli başvuru katmanı)' : 'Corel önizlemesi gizlendi');
      }
    }
  });
  const M = UI.MENUS.file;
  if (M && !M.includes('openCdr')) {
    M.splice(M.indexOf('open') + 1, 0, 'openCdr');
    M.splice(M.indexOf('saveAs') + 1, 0, 'saveCorel');
  }
  if (UI.MENUS.view && !UI.MENUS.view.includes('cdrPreview')) UI.MENUS.view.push('|', 'cdrPreview');
  A.fitPageToArt = { label: 'Sayfayı çizime uydur', run: () => CDR.fitPageToArt() };
  if (UI.MENUS.layout && !UI.MENUS.layout.includes('fitPageToArt')) UI.MENUS.layout.push('|', 'fitPageToArt');
})();
