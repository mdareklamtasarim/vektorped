/* VektörPad bitmap effects and bitmap tools.
   Effects work on the pixels of selected bitmaps (Raster items) with a preview dialog; the result can be
   undone like any other change. Shared image helpers (blur) are exposed as VP.imgfx for other modules. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const A = VP.actions;
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const IM = (VP.imgfx = {});

  /* =============== pixel helpers =============== */
  const copyID = (id) => new ImageData(new Uint8ClampedArray(id.data), id.width, id.height);
  const rand = (seed) => {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const lumOf = (d, o) => 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
  // per-pixel colour map; fn(r, g, b, x, y) returns [r, g, b] (alpha kept)
  const mapPx = (src, fn) => {
    const out = copyID(src);
    const d = out.data;
    const w = src.width;
    for (let i = 0, n = d.length; i < n; i += 4) {
      const c = fn(d[i], d[i + 1], d[i + 2], (i >> 2) % w, ((i >> 2) / w) | 0);
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
    }
    return out;
  };
  // bilinear sample of src at (x, y) into dst[o..o+3]
  const sample = (s, w, h, x, y, dst, o) => {
    x = clamp(x, 0, w - 1);
    y = clamp(y, 0, h - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const a = (y0 * w + x0) * 4;
    const b = (y0 * w + x1) * 4;
    const c = (y1 * w + x0) * 4;
    const e = (y1 * w + x1) * 4;
    for (let k = 0; k < 4; k++) {
      const top = s[a + k] + (s[b + k] - s[a + k]) * fx;
      const bot = s[c + k] + (s[e + k] - s[c + k]) * fx;
      dst[o + k] = top + (bot - top) * fy;
    }
  };
  // geometric remap: fn(x, y) returns the source point for the destination pixel
  const remap = (src, fn) => {
    const w = src.width;
    const h = src.height;
    const out = new ImageData(w, h);
    const d = out.data;
    const s = src.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = fn(x, y);
        sample(s, w, h, p[0], p[1], d, (y * w + x) * 4);
      }
    }
    return out;
  };

  /* Gaussian blur as three box passes on premultiplied colour (no dark fringes at transparent edges). */
  const boxesFor = (sigma, n) => {
    const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
    let wl = Math.floor(wIdeal);
    if (wl % 2 === 0) wl--;
    const wu = wl + 2;
    const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
    const out = [];
    for (let i = 0; i < n; i++) out.push(i < m ? wl : wu);
    return out;
  };
  const boxPass = (src, dst, w, h, r, horiz) => {
    const n = horiz ? w : h;
    const lines = horiz ? h : w;
    const step = horiz ? 4 : w * 4;
    const lineStep = horiz ? w * 4 : 4;
    const inv = 1 / (2 * r + 1);
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep;
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[base + clamp(k, 0, n - 1) * step + c];
        for (let i = 0; i < n; i++) {
          dst[base + i * step + c] = acc * inv;
          acc += src[base + Math.min(n - 1, i + r + 1) * step + c] - src[base + Math.max(0, i - r) * step + c];
        }
      }
    }
  };
  IM.blur = (id, radius) => {
    if (!(radius >= 0.5)) return copyID(id);
    const w = id.width;
    const h = id.height;
    const s = id.data;
    let a = new Float32Array(s.length);
    let b = new Float32Array(s.length);
    for (let i = 0; i < s.length; i += 4) {
      const al = s[i + 3] / 255;
      a[i] = s[i] * al;
      a[i + 1] = s[i + 1] * al;
      a[i + 2] = s[i + 2] * al;
      a[i + 3] = s[i + 3];
    }
    boxesFor(radius, 3).forEach((size) => {
      const r = Math.max(0, (size - 1) >> 1);
      boxPass(a, b, w, h, r, true);
      boxPass(b, a, w, h, r, false);
    });
    const out = new ImageData(w, h);
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
      const al = a[i + 3];
      const k = al > 0.01 ? 255 / al : 0;
      d[i] = a[i] * k;
      d[i + 1] = a[i + 1] * k;
      d[i + 2] = a[i + 2] * k;
      d[i + 3] = al;
    }
    return out;
  };
  // blur only the alpha channel of a canvas-sized silhouette (used for soft shadows)
  IM.blurCanvas = (cv, radius) => {
    const ctx = cv.getContext('2d');
    const id = ctx.getImageData(0, 0, cv.width, cv.height);
    ctx.putImageData(IM.blur(id, radius), 0, 0);
    return cv;
  };
  const sobel = (L, w, h, x, y) => {
    const g = (xx, yy) => L[clamp(yy, 0, h - 1) * w + clamp(xx, 0, w - 1)];
    const gx = -g(x - 1, y - 1) - 2 * g(x - 1, y) - g(x - 1, y + 1) + g(x + 1, y - 1) + 2 * g(x + 1, y) + g(x + 1, y + 1);
    const gy = -g(x - 1, y - 1) - 2 * g(x, y - 1) - g(x + 1, y - 1) + g(x - 1, y + 1) + 2 * g(x, y + 1) + g(x + 1, y + 1);
    return Math.sqrt(gx * gx + gy * gy);
  };
  const lumArray = (src) => {
    const L = new Float32Array(src.width * src.height);
    for (let i = 0; i < L.length; i++) L[i] = lumOf(src.data, i * 4);
    return L;
  };
  const rgb2hsl = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let hh;
    if (mx === r) hh = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    return [hh / 6, s, l];
  };
  const hue2 = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hsl2rgb = (hh, s, l) => {
    if (s <= 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue2(p, q, hh + 1 / 3) * 255, hue2(p, q, hh) * 255, hue2(p, q, hh - 1 / 3) * 255];
  };
  const hexRGB = (hex) => {
    const c = new paper.Color(hex || '#000000').convert('rgb');
    return [c.red * 255, c.green * 255, c.blue * 255];
  };
  IM.hexRGB = hexRGB;

  /* =============== effects =============== */
  // params: k, l (label), min, max, step, v (default), unit, px (scales with the preview), type ('range'|'bool'|'color'|'select'), opts
  const R = (k, l, min, max, v, extra) => Object.assign({ k, l, min, max, v, step: 1 }, extra || {});
  const B = (k, l, v) => ({ k, l, v: !!v, type: 'bool' });
  const C = (k, l, v) => ({ k, l, v, type: 'color' });
  const S = (k, l, opts, v) => ({ k, l, opts, v, type: 'select' });
  const sepia = (r, g, b, k) => [
    r + (Math.min(255, r * 0.393 + g * 0.769 + b * 0.189) - r) * k,
    g + (Math.min(255, r * 0.349 + g * 0.686 + b * 0.168) - g) * k,
    b + (Math.min(255, r * 0.272 + g * 0.534 + b * 0.131) - b) * k
  ];
  const addNoise = (src, amt, mono, seed) => {
    const rnd = rand(seed || 7);
    const out = copyID(src);
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
      if (mono) {
        const n = (rnd() - 0.5) * 2 * amt;
        d[i] += n;
        d[i + 1] += n;
        d[i + 2] += n;
      } else {
        d[i] += (rnd() - 0.5) * 2 * amt;
        d[i + 1] += (rnd() - 0.5) * 2 * amt;
        d[i + 2] += (rnd() - 0.5) * 2 * amt;
      }
    }
    return out;
  };
  const vignette = (src, amt, size, hex) => {
    const w = src.width;
    const h = src.height;
    const cx = w / 2;
    const cy = h / 2;
    const col = hexRGB(hex || '#000000');
    const s0 = clamp(size / 100, 0, 1.3);
    return mapPx(src, (r, g, b, x, y) => {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const dd = Math.sqrt(dx * dx + dy * dy);
      let t = clamp((dd - s0) / (1.45 - s0 || 0.01), 0, 1);
      t = t * t * (3 - 2 * t) * (amt / 100);
      return [r + (col[0] - r) * t, g + (col[1] - g) * t, b + (col[2] - b) * t];
    });
  };
  const posterize = (src, n) => {
    const st = 255 / Math.max(1, n - 1);
    return mapPx(src, (r, g, b) => [Math.round(r / st) * st, Math.round(g / st) * st, Math.round(b / st) * st]);
  };
  const edges = (src, strength, color) => {
    const w = src.width;
    const h = src.height;
    const out = copyID(src);
    const d = out.data;
    const k = strength / 50;
    if (!color) {
      const L = lumArray(src);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = 255 - clamp(sobel(L, w, h, x, y) * k, 0, 255);
        const o = (y * w + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = v;
      }
      return out;
    }
    for (let c = 0; c < 3; c++) {
      const L = new Float32Array(w * h);
      for (let i = 0; i < L.length; i++) L[i] = src.data[i * 4 + c];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + c] = 255 - clamp(sobel(L, w, h, x, y) * k, 0, 255);
    }
    return out;
  };
  const median = (src, r) => {
    const w = src.width;
    const h = src.height;
    const s = src.data;
    const out = copyID(src);
    const d = out.data;
    const buf = [[], [], []];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        buf[0].length = buf[1].length = buf[2].length = 0;
        for (let j = -r; j <= r; j++) {
          const yy = clamp(y + j, 0, h - 1);
          for (let i = -r; i <= r; i++) {
            const o = (yy * w + clamp(x + i, 0, w - 1)) * 4;
            buf[0].push(s[o]);
            buf[1].push(s[o + 1]);
            buf[2].push(s[o + 2]);
          }
        }
        const o = (y * w + x) * 4;
        const mid = buf[0].length >> 1;
        for (let c = 0; c < 3; c++) d[o + c] = buf[c].sort((a, b) => a - b)[mid];
      }
    }
    return out;
  };
  const unsharp = (src, amount, radius, thr) => {
    const bl = IM.blur(src, radius);
    const out = copyID(src);
    const d = out.data;
    const b = bl.data;
    const k = amount / 100;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const diff = d[i + c] - b[i + c];
        if (Math.abs(diff) >= thr) d[i + c] = d[i + c] + diff * k;
      }
    }
    return out;
  };
  const motion = (src, dist, ang) => {
    const w = src.width;
    const h = src.height;
    const s = src.data;
    const n = clamp(Math.round(dist), 1, 64);
    const a = (ang * Math.PI) / 180;
    const dx = Math.cos(a) * (dist / n);
    const dy = Math.sin(a) * (dist / n);
    const out = new ImageData(w, h);
    const d = out.data;
    const tmp = [0, 0, 0, 0];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let al = 0;
        for (let k = -n / 2; k <= n / 2; k++) {
          sample(s, w, h, x + dx * k, y + dy * k, tmp, 0);
          const m = tmp[3] / 255;
          r += tmp[0] * m;
          g += tmp[1] * m;
          b += tmp[2] * m;
          al += tmp[3];
        }
        const cnt = Math.floor(n / 2) * 2 + 1;
        const o = (y * w + x) * 4;
        const kk = al > 0 ? 255 / al : 0;
        d[o] = r * kk;
        d[o + 1] = g * kk;
        d[o + 2] = b * kk;
        d[o + 3] = al / cnt;
      }
    }
    return out;
  };

  const E = {
    /* Ayarla */
    bc: { cat: 'adjust', label: 'Parlaklık ve karşıtlık', params: [R('b', 'Parlaklık', -100, 100, 0), R('c', 'Karşıtlık', -100, 100, 0)],
      run: (s, p) => {
        const c = p.c * 1.28;
        const k = (259 * (c + 255)) / (255 * (259 - c));
        const bb = p.b * 1.28;
        return mapPx(s, (r, g, b) => [k * (r + bb - 128) + 128, k * (g + bb - 128) + 128, k * (b + bb - 128) + 128]);
      } },
    hsl: { cat: 'adjust', label: 'Ton, doygunluk, açıklık', params: [R('h', 'Ton', -180, 180, 0, { unit: '°' }), R('s', 'Doygunluk', -100, 100, 0), R('l', 'Açıklık', -100, 100, 0)],
      run: (src, p) => mapPx(src, (r, g, b) => {
        let [hh, s, l] = rgb2hsl(r, g, b);
        hh = (hh + p.h / 360 + 1) % 1;
        s = clamp(p.s >= 0 ? s + (1 - s) * (p.s / 100) * s : s * (1 + p.s / 100), 0, 1);
        l = clamp(p.l >= 0 ? l + (1 - l) * (p.l / 100) : l * (1 + p.l / 100), 0, 1);
        return hsl2rgb(hh, s, l);
      }) },
    balance: { cat: 'adjust', label: 'Renk dengesi', params: [R('cr', 'Camgöbeği ↔ Kırmızı', -100, 100, 0), R('mg', 'Macenta ↔ Yeşil', -100, 100, 0), R('yb', 'Sarı ↔ Mavi', -100, 100, 0), S('range', 'Etki', [['mid', 'Orta tonlar'], ['shadow', 'Gölgeler'], ['high', 'Parlak tonlar'], ['all', 'Tümü']], 'mid')],
      run: (src, p) => mapPx(src, (r, g, b) => {
        const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const wgt = p.range === 'all' ? 1 : p.range === 'shadow' ? clamp(1 - l * 1.6, 0, 1) : p.range === 'high' ? clamp(l * 1.6 - 0.6, 0, 1) : clamp(1 - Math.abs(l - 0.5) * 2, 0, 1);
        const k = 0.9 * wgt;
        return [r + p.cr * k, g + p.mg * k, b + p.yb * k];
      }) },
    gamma: { cat: 'adjust', label: 'Gama', params: [R('g', 'Gama', 20, 500, 100, { unit: '%' })],
      run: (src, p) => {
        const lut = new Float32Array(256);
        for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(i / 255, 100 / p.g);
        return mapPx(src, (r, g, b) => [lut[r], lut[g], lut[b]]);
      } },
    levels: { cat: 'adjust', label: 'Düzeyler', params: [R('lo', 'Siyah nokta', 0, 250, 0), R('hi', 'Beyaz nokta', 5, 255, 255), R('g', 'Orta ton', 20, 500, 100, { unit: '%' }), R('olo', 'Çıkış siyah', 0, 250, 0), R('ohi', 'Çıkış beyaz', 5, 255, 255)],
      run: (src, p) => {
        const lut = new Float32Array(256);
        const hi = Math.max(p.lo + 1, p.hi);
        for (let i = 0; i < 256; i++) lut[i] = p.olo + (p.ohi - p.olo) * Math.pow(clamp((i - p.lo) / (hi - p.lo), 0, 1), 100 / p.g);
        return mapPx(src, (r, g, b) => [lut[r], lut[g], lut[b]]);
      } },
    autoLevels: { cat: 'adjust', label: 'Otomatik eşitle', params: [R('clip', 'Kırpma', 0, 5, 0.5, { step: 0.1, unit: '%' })],
      run: (src, p) => {
        const hist = new Uint32Array(256);
        const d = src.data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 8) continue;
          hist[Math.round(lumOf(d, i))]++;
          n++;
        }
        const cut = (n * p.clip) / 100;
        let lo = 0;
        let hi = 255;
        for (let acc = 0; lo < 254 && acc + hist[lo] <= cut; lo++) acc += hist[lo];
        for (let acc = 0; hi > lo + 1 && acc + hist[hi] <= cut; hi--) acc += hist[hi];
        const k = 255 / Math.max(1, hi - lo);
        return mapPx(src, (r, g, b) => [(r - lo) * k, (g - lo) * k, (b - lo) * k]);
      } },
    desat: { cat: 'adjust', label: 'Doygunluğu azalt', params: [R('a', 'Oran', 0, 100, 100, { unit: '%' })],
      run: (src, p) => mapPx(src, (r, g, b) => {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        const k = p.a / 100;
        return [r + (l - r) * k, g + (l - g) * k, b + (l - b) * k];
      }) },
    replace: { cat: 'adjust', label: 'Rengi değiştir', params: [C('from', 'Eski renk', '#ff0000'), C('to', 'Yeni renk', '#1461b2'), R('tol', 'Tolerans', 0, 100, 30, { unit: '%' })],
      run: (src, p) => {
        const f = hexRGB(p.from);
        const t = rgb2hsl(...hexRGB(p.to));
        const fh = rgb2hsl(f[0], f[1], f[2]);
        const tol = (p.tol / 100) * 441;
        return mapPx(src, (r, g, b) => {
          const dist = Math.sqrt((r - f[0]) ** 2 + (g - f[1]) ** 2 + (b - f[2]) ** 2);
          if (dist > tol) return [r, g, b];
          const k = tol > 0 ? 1 - dist / tol : 1;
          const [hh, s, l] = rgb2hsl(r, g, b);
          const n = hsl2rgb(t[0], clamp(s + (t[1] - fh[1]), 0, 1), clamp(l + (t[2] - fh[2]), 0, 1));
          const kk = clamp(k * 1.6, 0, 1);
          return [r + (n[0] - r) * kk, g + (n[1] - g) * kk, b + (n[2] - b) * kk];
        });
      } },
    /* Sanatsal */
    pencil: { cat: 'art', label: 'Karakalem çizim', params: [R('r', 'Çizgi kalınlığı', 1, 20, 4, { px: true }), R('dark', 'Koyuluk', 0, 100, 40)],
      run: (src, p) => {
        const g = mapPx(src, (r, gg, b) => {
          const l = 255 - (0.299 * r + 0.587 * gg + 0.114 * b);
          return [l, l, l];
        });
        const bl = IM.blur(g, p.r).data;
        return mapPx(src, (r, gg, b, x, y) => {
          const o = (y * src.width + x) * 4;
          const l = 0.299 * r + 0.587 * gg + 0.114 * b;
          let v = Math.min(255, (l * 255) / Math.max(1, 255 - bl[o]));
          v = 255 - (255 - v) * (1 + p.dark / 40);
          return [v, v, v];
        });
      } },
    oil: { cat: 'art', label: 'Yağlı boya', params: [R('r', 'Fırça', 1, 5, 3, { px: true }), R('lv', 'Ton sayısı', 6, 40, 20)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const s = src.data;
        const out = copyID(src);
        const d = out.data;
        const r = Math.max(1, Math.round(p.r));
        const lv = Math.round(p.lv);
        const L = new Uint8Array(w * h);
        for (let i = 0; i < L.length; i++) L[i] = Math.min(lv - 1, ((lumOf(s, i * 4) / 256) * lv) | 0);
        const cnt = new Uint16Array(lv);
        const sr = new Float32Array(lv);
        const sg = new Float32Array(lv);
        const sb = new Float32Array(lv);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            cnt.fill(0);
            sr.fill(0);
            sg.fill(0);
            sb.fill(0);
            for (let j = -r; j <= r; j++) {
              const yy = clamp(y + j, 0, h - 1);
              for (let i = -r; i <= r; i++) {
                const q = yy * w + clamp(x + i, 0, w - 1);
                const b = L[q];
                cnt[b]++;
                sr[b] += s[q * 4];
                sg[b] += s[q * 4 + 1];
                sb[b] += s[q * 4 + 2];
              }
            }
            let best = 0;
            for (let b = 1; b < lv; b++) if (cnt[b] > cnt[best]) best = b;
            const o = (y * w + x) * 4;
            d[o] = sr[best] / cnt[best];
            d[o + 1] = sg[best] / cnt[best];
            d[o + 2] = sb[best] / cnt[best];
          }
        }
        return out;
      } },
    cartoon: { cat: 'art', label: 'Çizgi film', params: [R('lv', 'Ton sayısı', 2, 12, 5), R('edge', 'Çizgi', 0, 100, 50)],
      run: (src, p) => {
        const post = posterize(IM.blur(src, 1.2), p.lv);
        const L = lumArray(src);
        const w = src.width;
        const h = src.height;
        const d = post.data;
        const thr = 260 - p.edge * 2.2;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (sobel(L, w, h, x, y) > thr) {
            const o = (y * w + x) * 4;
            d[o] = d[o + 1] = d[o + 2] = 25;
          }
        }
        for (let i = 3; i < d.length; i += 4) d[i] = src.data[i];
        return post;
      } },
    /* Bulanıklaştır */
    gauss: { cat: 'blur', label: 'Gauss bulanıklığı', params: [R('r', 'Yarıçap', 0, 60, 4, { px: true, step: 0.5, unit: 'px' })], run: (s, p) => IM.blur(s, p.r) },
    motionBlur: { cat: 'blur', label: 'Hareket bulanıklığı', params: [R('d', 'Uzaklık', 1, 120, 16, { px: true, unit: 'px' }), R('a', 'Açı', -180, 180, 0, { unit: '°' })], run: (s, p) => motion(s, p.d, p.a) },
    zoomBlur: { cat: 'blur', label: 'Yakınlaştırma bulanıklığı', params: [R('a', 'Miktar', 1, 60, 20, { unit: '%' })],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const s = src.data;
        const out = new ImageData(w, h);
        const d = out.data;
        const cx = w / 2;
        const cy = h / 2;
        const n = 18;
        const tmp = [0, 0, 0, 0];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const acc = [0, 0, 0, 0];
          for (let k = 0; k < n; k++) {
            const t = 1 - (k / n) * (p.a / 100);
            sample(s, w, h, cx + (x - cx) * t, cy + (y - cy) * t, tmp, 0);
            for (let c = 0; c < 4; c++) acc[c] += tmp[c];
          }
          const o = (y * w + x) * 4;
          for (let c = 0; c < 4; c++) d[o + c] = acc[c] / n;
        }
        return out;
      } },
    smooth: { cat: 'blur', label: 'Yumuşat', params: [R('a', 'Miktar', 0, 100, 50, { unit: '%' })],
      run: (src, p) => {
        const b = IM.blur(src, 1.5).data;
        const out = copyID(src);
        const d = out.data;
        for (let i = 0; i < d.length; i++) d[i] += (b[i] - d[i]) * (p.a / 100);
        return out;
      } },
    /* Kamera */
    sepiaFx: { cat: 'camera', label: 'Sepya tonu', params: [R('a', 'Oran', 0, 100, 80, { unit: '%' })], run: (src, p) => mapPx(src, (r, g, b) => sepia(r, g, b, p.a / 100)) },
    tint: { cat: 'camera', label: 'Renk tonu (fotoğraf filtresi)', params: [C('c', 'Renk', '#e8a33c'), R('a', 'Yoğunluk', 0, 100, 35, { unit: '%' }), B('keep', 'Parlaklığı koru', true)],
      run: (src, p) => {
        const t = hexRGB(p.c);
        const k = p.a / 100;
        return mapPx(src, (r, g, b) => {
          const l0 = 0.299 * r + 0.587 * g + 0.114 * b;
          let n = [r * (1 - k) + ((r * t[0]) / 255) * k * 1.6, g * (1 - k) + ((g * t[1]) / 255) * k * 1.6, b * (1 - k) + ((b * t[2]) / 255) * k * 1.6];
          if (p.keep) {
            const l1 = 0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2] || 1;
            n = n.map((v) => (v * l0) / l1);
          }
          return n;
        });
      } },
    vignetteFx: { cat: 'camera', label: 'Vinyet', params: [R('a', 'Koyuluk', 0, 100, 60, { unit: '%' }), R('s', 'Boyut', 0, 120, 45), C('c', 'Renk', '#000000')], run: (src, p) => vignette(src, p.a, p.s, p.c) },
    oldPhoto: { cat: 'camera', label: 'Eski fotoğraf', params: [R('a', 'Yaşlanma', 0, 100, 70, { unit: '%' })],
      run: (src, p) => {
        const k = p.a / 100;
        let o = mapPx(src, (r, g, b) => {
          const s = sepia(r, g, b, k);
          return [s[0] * (1 - 0.15 * k) + 20 * k, s[1] * (1 - 0.15 * k) + 14 * k, s[2] * (1 - 0.15 * k)];
        });
        o = addNoise(o, 18 * k, true, 3);
        return vignette(o, 55 * k, 40, '#2a1a0a');
      } },
    /* Renk dönüştürme */
    invert: { cat: 'color', label: 'Ters çevir', params: [], run: (src) => mapPx(src, (r, g, b) => [255 - r, 255 - g, 255 - b]) },
    posterizeFx: { cat: 'color', label: 'Posterleştir', params: [R('n', 'Düzey', 2, 32, 5)], run: (src, p) => posterize(src, p.n) },
    solarize: { cat: 'color', label: 'Solarize', params: [R('t', 'Eşik', 0, 255, 128)], run: (src, p) => mapPx(src, (r, g, b) => [r > p.t ? 255 - r : r, g > p.t ? 255 - g : g, b > p.t ? 255 - b : b]) },
    threshold: { cat: 'color', label: 'Eşik (siyah-beyaz)', params: [R('t', 'Eşik', 0, 255, 128)],
      run: (src, p) => mapPx(src, (r, g, b) => {
        const v = 0.299 * r + 0.587 * g + 0.114 * b > p.t ? 255 : 0;
        return [v, v, v];
      }) },
    halftone: { cat: 'color', label: 'Yarım ton', params: [R('cell', 'Nokta aralığı', 3, 40, 8, { px: true, unit: 'px' }), R('a', 'Açı', 0, 90, 45, { unit: '°' }), B('color', 'Renkli noktalar', false)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const s = src.data;
        const cell = Math.max(2, p.cell);
        const a = (p.a * Math.PI) / 180;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const out = copyID(src);
        const d = out.data;
        const tmp = [0, 0, 0, 0];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const u = x * ca + y * sa;
          const v = -x * sa + y * ca;
          const cu = (Math.floor(u / cell) + 0.5) * cell;
          const cv = (Math.floor(v / cell) + 0.5) * cell;
          const sx = cu * ca - cv * sa;
          const sy = cu * sa + cv * ca;
          sample(s, w, h, sx, sy, tmp, 0);
          const l = (0.299 * tmp[0] + 0.587 * tmp[1] + 0.114 * tmp[2]) / 255;
          const rad = (cell / 2) * Math.sqrt(1 - l) * 1.414;
          const dist = Math.sqrt((u - cu) ** 2 + (v - cv) ** 2);
          const cov = clamp(rad - dist + 0.5, 0, 1);
          const o = (y * w + x) * 4;
          const ink = p.color ? [tmp[0] * 0.6, tmp[1] * 0.6, tmp[2] * 0.6] : [0, 0, 0];
          for (let c = 0; c < 3; c++) d[o + c] = 255 + (ink[c] - 255) * cov;
        }
        return out;
      } },
    /* Kontur */
    edgeFx: { cat: 'contour', label: 'Kenar bul', params: [R('s', 'Güç', 5, 100, 50), B('color', 'Renkli', false)], run: (src, p) => edges(src, p.s, p.color) },
    outlineFx: { cat: 'contour', label: 'Kontur izle', params: [R('t', 'Eşik', 10, 250, 90)],
      run: (src, p) => {
        const L = lumArray(src);
        const w = src.width;
        const h = src.height;
        const out = copyID(src);
        const d = out.data;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const v = sobel(L, w, h, x, y) > p.t ? 0 : 255;
          const o = (y * w + x) * 4;
          d[o] = d[o + 1] = d[o + 2] = v;
        }
        return out;
      } },
    /* Yaratıcı */
    pixelate: { cat: 'creative', label: 'Pikselleştir', params: [R('s', 'Kare boyutu', 2, 80, 10, { px: true, unit: 'px' }), B('gap', 'Mozaik aralığı', false)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const s = src.data;
        const size = Math.max(1, Math.round(p.s));
        const out = copyID(src);
        const d = out.data;
        for (let by = 0; by < h; by += size) for (let bx = 0; bx < w; bx += size) {
          const acc = [0, 0, 0, 0];
          let n = 0;
          const ex = Math.min(w, bx + size);
          const ey = Math.min(h, by + size);
          for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) {
            const o = (y * w + x) * 4;
            for (let c = 0; c < 4; c++) acc[c] += s[o + c];
            n++;
          }
          for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) {
            const o = (y * w + x) * 4;
            const edge = p.gap && size > 3 && (x === ex - 1 || y === ey - 1);
            for (let c = 0; c < 3; c++) d[o + c] = edge ? 255 : acc[c] / n;
            d[o + 3] = acc[3] / n;
          }
        }
        return out;
      } },
    crystallize: { cat: 'creative', label: 'Kristalleştir', params: [R('s', 'Hücre', 4, 80, 16, { px: true, unit: 'px' })],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const s = src.data;
        const cs = Math.max(2, p.s);
        const gw = Math.ceil(w / cs) + 1;
        const gh = Math.ceil(h / cs) + 1;
        const rnd = rand(11);
        const pts = new Float32Array(gw * gh * 2);
        for (let i = 0; i < gw * gh; i++) {
          pts[i * 2] = ((i % gw) + rnd()) * cs;
          pts[i * 2 + 1] = (((i / gw) | 0) + rnd()) * cs;
        }
        const out = copyID(src);
        const d = out.data;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const gx = Math.floor(x / cs);
          const gy = Math.floor(y / cs);
          let best = -1;
          let bd = 1e18;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
            const xx = gx + i;
            const yy = gy + j;
            if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
            const q = yy * gw + xx;
            const dd = (pts[q * 2] - x) ** 2 + (pts[q * 2 + 1] - y) ** 2;
            if (dd < bd) {
              bd = dd;
              best = q;
            }
          }
          const sx = clamp(Math.round(pts[best * 2]), 0, w - 1);
          const sy = clamp(Math.round(pts[best * 2 + 1]), 0, h - 1);
          const so = (sy * w + sx) * 4;
          const o = (y * w + x) * 4;
          d[o] = s[so];
          d[o + 1] = s[so + 1];
          d[o + 2] = s[so + 2];
        }
        return out;
      } },
    /* Bozulma */
    swirl: { cat: 'distort', label: 'Girdap', params: [R('a', 'Açı', -720, 720, 180, { unit: '°' }), R('r', 'Yarıçap', 10, 100, 80, { unit: '%' })],
      run: (src, p) => {
        const cx = src.width / 2;
        const cy = src.height / 2;
        const Rr = (Math.min(cx, cy) * p.r) / 100 || 1;
        const a = (p.a * Math.PI) / 180;
        return remap(src, (x, y) => {
          const dx = x - cx;
          const dy = y - cy;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd >= Rr) return [x, y];
          const t = (1 - dd / Rr) ** 2 * a;
          const c = Math.cos(t);
          const s = Math.sin(t);
          return [cx + dx * c - dy * s, cy + dx * s + dy * c];
        });
      } },
    ripple: { cat: 'distort', label: 'Dalgalanma', params: [R('amp', 'Genlik', 0, 60, 8, { px: true, unit: 'px' }), R('len', 'Dalga boyu', 4, 300, 48, { px: true, unit: 'px' }), S('dir', 'Yön', [['h', 'Yatay dalga'], ['v', 'Dikey dalga'], ['both', 'İkisi']], 'h')],
      run: (src, p) => remap(src, (x, y) => {
        const k = (2 * Math.PI) / Math.max(1, p.len);
        const ox = p.dir !== 'h' ? p.amp * Math.sin(y * k) : 0;
        const oy = p.dir !== 'v' ? p.amp * Math.sin(x * k) : 0;
        return [x + ox, y + oy];
      }) },
    pinch: { cat: 'distort', label: 'Sıkıştır / şişir', params: [R('a', 'Miktar', -100, 100, 50, { unit: '%' })],
      run: (src, p) => {
        const cx = src.width / 2;
        const cy = src.height / 2;
        const Rr = Math.min(cx, cy) || 1;
        const k = p.a / 100;
        return remap(src, (x, y) => {
          const dx = (x - cx) / Rr;
          const dy = (y - cy) / Rr;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd >= 1 || dd < 1e-6) return [x, y];
          const f = Math.pow(dd, k >= 0 ? 1 - k * 0.7 : 1 - k * 1.2) / dd;
          return [cx + dx * f * Rr, cy + dy * f * Rr];
        });
      } },
    wind: { cat: 'distort', label: 'Rüzgâr', params: [R('s', 'Güç', 2, 80, 20, { px: true, unit: 'px' }), S('dir', 'Yön', [['r', 'Sağdan'], ['l', 'Soldan']], 'r')],
      run: (src, p) => {
        const m = motion(src, p.s * 2, 0);
        const out = copyID(src);
        const d = out.data;
        const md = m.data;
        const w = src.width;
        const sh = Math.round(p.s) * (p.dir === 'r' ? -1 : 1);
        for (let i = 0; i < d.length; i += 4) {
          const x = (i >> 2) % w;
          const xs = clamp(x + sh, 0, w - 1);
          const j = i + (xs - x) * 4;
          for (let c = 0; c < 3; c++) d[i + c] = Math.max(d[i + c], md[j + c] * 0.92);
        }
        return out;
      } },
    /* Gürültü */
    noise: { cat: 'noise', label: 'Gürültü ekle', params: [R('a', 'Miktar', 0, 100, 20), B('mono', 'Tek renk', true), R('seed', 'Rastgele', 1, 99, 7)], run: (src, p) => addNoise(src, p.a * 1.2, p.mono, p.seed) },
    denoise: { cat: 'noise', label: 'Gürültü azalt (ortanca)', params: [R('r', 'Yarıçap', 1, 3, 1, { px: true })], run: (src, p) => median(src, Math.max(1, Math.round(p.r))) },
    despeckle: { cat: 'noise', label: 'Lekeleri temizle', params: [], run: (src) => median(src, 1) },
    /* Netleştir */
    sharpen: { cat: 'sharpen', label: 'Keskinleştir (keskin olmayan maske)', params: [R('a', 'Miktar', 0, 400, 100, { unit: '%' }), R('r', 'Yarıçap', 0.5, 10, 1.5, { px: true, step: 0.5, unit: 'px' }), R('t', 'Eşik', 0, 50, 2)], run: (src, p) => unsharp(src, p.a, p.r, p.t) },
    highpass: { cat: 'sharpen', label: 'Yüksek geçiren', params: [R('r', 'Yarıçap', 1, 40, 6, { px: true, unit: 'px' })],
      run: (src, p) => {
        const b = IM.blur(src, p.r).data;
        const out = copyID(src);
        const d = out.data;
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = 128 + d[i + c] - b[i + c];
        return out;
      } },
    /* Doku */
    emboss: { cat: 'texture', label: 'Kabartma', params: [R('a', 'Işık açısı', -180, 180, 135, { unit: '°' }), R('d', 'Derinlik', 1, 10, 3), B('color', 'Rengi koru', false)],
      run: (src, p) => {
        const L = lumArray(src);
        const w = src.width;
        const h = src.height;
        const a = (p.a * Math.PI) / 180;
        const dx = Math.round(Math.cos(a) * 1.4);
        const dy = Math.round(Math.sin(a) * 1.4);
        const out = copyID(src);
        const d = out.data;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const q1 = clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1);
          const q0 = clamp(y - dy, 0, h - 1) * w + clamp(x - dx, 0, w - 1);
          const v = (L[q0] - L[q1]) * p.d;
          const o = (y * w + x) * 4;
          if (p.color) for (let c = 0; c < 3; c++) d[o + c] += v;
          else d[o] = d[o + 1] = d[o + 2] = 128 + v;
        }
        return out;
      } },
    canvasTex: { cat: 'texture', label: 'Tuval dokusu', params: [R('a', 'Belirginlik', 0, 100, 40), R('s', 'Doku boyutu', 2, 12, 4, { px: true })],
      run: (src, p) => {
        const rnd = rand(5);
        const k = p.a / 100;
        const s = Math.max(1, p.s);
        return mapPx(src, (r, g, b, x, y) => {
          const weave = Math.sin((x / s) * Math.PI) * Math.sin((y / s) * Math.PI);
          const n = (weave * 22 + (rnd() - 0.5) * 18) * k;
          return [r + n, g + n, b + n];
        });
      } },
    stone: { cat: 'texture', label: 'Taş / sıva', params: [R('a', 'Belirginlik', 0, 100, 50), R('s', 'Tane', 1, 8, 2, { px: true })],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const n = addNoise(new ImageData(new Uint8ClampedArray(src.data.length).fill(128), w, h), 100, true, 9);
        const bl = IM.blur(n, p.s);
        const L = lumArray(bl);
        const k = (p.a / 100) * 2.2;
        return mapPx(src, (r, g, b, x, y) => {
          const q = y * w + x;
          const v = (L[q] - L[clamp(y + 1, 0, h - 1) * w + clamp(x + 1, 0, w - 1)]) * k * 6;
          return [r + v, g + v, b + v];
        });
      } }
  };
  IM.EFFECTS = E;
  const CATS = [
    ['adjust', 'Ayarla'], ['art', 'Sanatsal fırça'], ['blur', 'Bulanıklaştır'], ['camera', 'Kamera'], ['color', 'Renk dönüştürme'],
    ['contour', 'Kontur'], ['creative', 'Yaratıcı'], ['distort', 'Bozulma'], ['noise', 'Gürültü'], ['sharpen', 'Netleştir'], ['texture', 'Doku']
  ];
  IM.CATS = CATS;

  /* =============== applying to bitmaps =============== */
  const rasters = () => VP.sel.filter((it) => it instanceof paper.Raster);
  const needRaster = () => {
    VP.toast('Biteşlem seçin · Vektörler için önce Biteşlemler › Biteşleme dönüştür');
    return null;
  };
  const getID = (r) => r.getImageData(new paper.Rectangle(0, 0, r.width, r.height));
  const toCanvas = (id) => {
    const cv = document.createElement('canvas');
    cv.width = id.width;
    cv.height = id.height;
    cv.getContext('2d').putImageData(id, 0, 0);
    return cv;
  };
  IM.toCanvas = toCanvas;
  // Replaces a raster's pixels with a canvas of a different size. sx/sy: old pixels per new pixel;
  // off: shift of the new centre in old pixel units (both in the raster's own space).
  IM.replace = (r, cv, sx = 1, sy = 1, off) => {
    const m = r.matrix.clone();
    r.setImage(cv);
    if (off) m.translate(off);
    m.scale(sx, sy);
    r.matrix = m;
  };
  const applyFx = (def, p) => {
    const rs = rasters();
    rs.forEach((r) => {
      const out = def.run(getID(r), p);
      if (out.width === r.width && out.height === r.height) r.setImageData(out, Pt(0, 0));
      else IM.replace(r, toCanvas(out));
    });
    VP.commit();
  };
  const thumbOf = (r, max) => {
    const full = getID(r);
    const sc = Math.min(1, max / Math.max(full.width, full.height));
    const tw = Math.max(1, Math.round(full.width * sc));
    const th = Math.max(1, Math.round(full.height * sc));
    const cv = document.createElement('canvas');
    cv.width = tw;
    cv.height = th;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(toCanvas(full), 0, 0, tw, th);
    return { id: ctx.getImageData(0, 0, tw, th), sc };
  };
  const CHECKER = 'background:repeating-conic-gradient(#d4d4d4 0 25%,#ffffff 0 50%) 0 0/14px 14px;';
  const paramHTML = (q, v) => {
    if (q.type === 'bool') return '<label class="field"><span>' + esc(q.l) + '</span><input type="checkbox" data-bk="' + q.k + '"' + (v ? ' checked' : '') + '></label>';
    if (q.type === 'color') return '<label class="field"><span>' + esc(q.l) + '</span><input type="color" data-bk="' + q.k + '" value="' + esc(v) + '" style="width:34px;height:26px;border:0;padding:0;background:transparent"></label>';
    if (q.type === 'select') return '<label class="field"><span>' + esc(q.l) + '</span><select data-bk="' + q.k + '">' + q.opts.map(([k, l]) => '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>';
    return '<label class="range"><span class="pb-label">' + esc(q.l) + '</span><input type="range" data-bk="' + q.k + '" min="' + q.min + '" max="' + q.max + '" step="' + (q.step || 1) + '" value="' + v + '"><output>' + v + (q.unit || '') + '</output></label>';
  };
  const last = {};
  // Preview dialog: a reduced copy of the first selected bitmap shows the effect while the sliders move.
  IM.dialog = (id) => {
    const def = E[id];
    const rs = rasters();
    if (!def || !rs.length) return needRaster();
    const p = Object.assign({}, ...def.params.map((q) => ({ [q.k]: q.v })), last[id] || {});
    if (!def.params.length) {
      applyFx(def, p);
      return VP.toast(def.label + ' uygulandı');
    }
    const th = thumbOf(rs[0], 300);
    let before = false;
    UI.modal(
      '<h2>' + esc(def.label) + '</h2>' +
        '<div style="display:flex;justify-content:center;margin:4px 0 10px"><canvas id="bx-cv" width="' + th.id.width + '" height="' + th.id.height + '" style="max-width:100%;border-radius:6px;' + CHECKER + '"></canvas></div>' +
        def.params.map((q) => paramHTML(q, p[q.k])).join('') +
        '<p class="sec-note">Önizleme küçültülmüş kopyadır · ' + rs.length + ' biteşleme uygulanır</p>' +
        '<div class="actions"><button class="btn" data-x="ba">Önce / sonra</button><button class="btn" data-x="reset">Sıfırla</button><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Uygula</button></div>',
      (root, close) => {
        const cv = root.querySelector('#bx-cv');
        const ctx = cv.getContext('2d');
        let raf = 0;
        const draw = () => {
          raf = 0;
          if (before) return ctx.putImageData(th.id, 0, 0);
          const pp = Object.assign({}, p);
          def.params.forEach((q) => q.px && (pp[q.k] = Math.max(q.min > 0 ? Math.min(q.min, 0.5) : 0, p[q.k] * th.sc)));
          try {
            ctx.putImageData(def.run(th.id, pp), 0, 0);
          } catch (e) {
            console.error(e);
          }
        };
        const soon = () => raf || (raf = requestAnimationFrame(draw));
        root.addEventListener('input', (e) => {
          const el = e.target.closest('[data-bk]');
          if (!el) return;
          const q = def.params.find((x) => x.k === el.dataset.bk);
          p[q.k] = q.type === 'bool' ? el.checked : q.type === 'color' || q.type === 'select' ? el.value : +el.value;
          if (el.nextElementSibling && el.nextElementSibling.tagName === 'OUTPUT') el.nextElementSibling.textContent = el.value + (q.unit || '');
          soon();
        });
        root.addEventListener('change', (e) => e.target.closest('select,[type=checkbox]') && soon());
        root.addEventListener('click', (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'ba') {
            before = !before;
            x.classList.toggle('on', before);
            return draw();
          }
          if (x.dataset.x === 'reset') {
            def.params.forEach((q) => (p[q.k] = q.v));
            root.querySelectorAll('[data-bk]').forEach((el) => {
              const q = def.params.find((y) => y.k === el.dataset.bk);
              if (q.type === 'bool') el.checked = !!q.v;
              else el.value = q.v;
              if (el.nextElementSibling && el.nextElementSibling.tagName === 'OUTPUT') el.nextElementSibling.textContent = q.v + (q.unit || '');
            });
            return draw();
          }
          if (x.dataset.x === 'yes') {
            last[id] = Object.assign({}, p);
            x.disabled = true;
            x.textContent = 'Uygulanıyor…';
            setTimeout(() => {
              try {
                applyFx(def, p);
                VP.toast(def.label + ' uygulandı');
              } catch (err) {
                console.error(err);
                VP.toast('Efekt uygulanamadı');
              }
              close();
            }, 30);
            return;
          }
          close();
        });
        draw();
      }
    );
    return true;
  };

  /* =============== bitmap tools =============== */
  const resampleTo = (r, W, Hh) => {
    W = Math.max(1, Math.round(W));
    Hh = Math.max(1, Math.round(Hh));
    let cur = toCanvas(getID(r));
    // halve in steps when shrinking a lot, for a clean result
    while (cur.width / 2 > W && cur.height / 2 > Hh) {
      const c2 = document.createElement('canvas');
      c2.width = Math.round(cur.width / 2);
      c2.height = Math.round(cur.height / 2);
      const x = c2.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, c2.width, c2.height);
      cur = c2;
    }
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = Hh;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, W, Hh);
    const ow = r.width;
    const oh = r.height;
    IM.replace(r, cv, ow / W, oh / Hh);
  };
  const dpiOf = (r) => Math.round((r.width / (r.bounds.width || 1)) * 72);
  const resample = () => {
    const rs = rasters();
    if (!rs.length) return needRaster();
    const r = rs[0];
    UI.modal(
      '<h2>Yeniden örnekle</h2><p class="sec-note">Şu an: ' + r.width + ' × ' + r.height + ' piksel · yaklaşık ' + dpiOf(r) + ' dpi. Biteşlemin sayfadaki boyutu değişmez.</p>' +
        '<label class="field"><span>Genişlik</span><input id="rs-w" value="' + r.width + '" inputmode="numeric"><span class="unit">px</span></label>' +
        '<label class="field"><span>Yükseklik</span><input id="rs-h" value="' + r.height + '" inputmode="numeric"><span class="unit">px</span></label>' +
        '<label class="field"><span>Çözünürlük</span><input id="rs-d" value="' + dpiOf(r) + '" inputmode="numeric"><span class="unit">dpi</span></label>' +
        '<label class="field"><span>En-boy oranını koru</span><input type="checkbox" id="rs-k" checked></label>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Uygula</button></div>',
      (root, close) => {
        const w = root.querySelector('#rs-w');
        const h = root.querySelector('#rs-h');
        const dd = root.querySelector('#rs-d');
        const k = root.querySelector('#rs-k');
        const ratio = r.height / r.width;
        w.addEventListener('input', () => {
          if (k.checked) h.value = Math.round(+w.value * ratio) || '';
          dd.value = Math.round((+w.value / (r.bounds.width || 1)) * 72) || '';
        });
        h.addEventListener('input', () => {
          if (k.checked) w.value = Math.round(+h.value / ratio) || '';
          dd.value = Math.round((+w.value / (r.bounds.width || 1)) * 72) || '';
        });
        dd.addEventListener('input', () => {
          w.value = Math.round(((r.bounds.width || 1) * +dd.value) / 72) || '';
          h.value = Math.round(((r.bounds.height || 1) * +dd.value) / 72) || '';
        });
        root.addEventListener('click', (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'yes') {
            const W = clamp(+w.value || 0, 1, 8000);
            const Hh = clamp(+h.value || 0, 1, 8000);
            rs.forEach((ri) => resampleTo(ri, ri === r ? W : (W / r.width) * ri.width, ri === r ? Hh : (Hh / r.height) * ri.height));
            VP.commit();
            VP.toast('Yeniden örneklendi: ' + Math.round(W) + ' × ' + Math.round(Hh) + ' px');
          }
          close();
        });
      }
    );
  };
  const upscale = () => {
    const rs = rasters();
    if (!rs.length) return needRaster();
    const anchor = document.querySelector('.menu-btn[data-menu="bitmaps"]') || document.body;
    UI.popover(anchor, [2, 3, 4].map((k) => '<button class="pop-item" data-pick="' + k + '">' + k + '× büyüt</button>').join(''), (k) => {
      k = +k;
      if (rs.some((r) => r.width * k > 8000 || r.height * k > 8000)) return VP.toast('Sonuç çok büyük olur · Daha küçük bir oran seçin');
      VP.toast('Büyütülüyor…');
      setTimeout(() => {
        rs.forEach((r) => {
          resampleTo(r, r.width * k, r.height * k);
          r.setImageData(unsharp(getID(r), 70, 0.8 * k, 1), Pt(0, 0));
        });
        VP.commit();
        VP.toast(k + '× büyütüldü ve netleştirildi');
      }, 30);
    });
  };
  // crop: keeps the part that stays where it was on the page
  const cropTo = (r, x0, y0, w2, h2) => {
    const id = getID(r);
    const cv = document.createElement('canvas');
    cv.width = w2;
    cv.height = h2;
    cv.getContext('2d').putImageData(id, -x0, -y0);
    const off = Pt(x0 + w2 / 2 - r.width / 2, y0 + h2 / 2 - r.height / 2);
    IM.replace(r, cv, 1, 1, off);
  };
  const crop = () => {
    const rs = rasters();
    if (!rs.length) return needRaster();
    const r = rs[0];
    const th = thumbOf(r, 300);
    const m = { t: 0, r: 0, b: 0, l: 0 };
    UI.modal(
      '<h2>Biteşlemi kırp</h2><div style="display:flex;justify-content:center;margin:4px 0 10px"><canvas id="cr-cv" width="' + th.id.width + '" height="' + th.id.height + '" style="max-width:100%;' + CHECKER + '"></canvas></div>' +
        [['t', 'Üst'], ['b', 'Alt'], ['l', 'Sol'], ['r', 'Sağ']].map(([k, l]) => '<label class="range"><span class="pb-label">' + l + '</span><input type="range" data-ck="' + k + '" min="0" max="95" value="0"><output>0%</output></label>').join('') +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Kırp</button></div>',
      (root, close) => {
        const cv = root.querySelector('#cr-cv');
        const ctx = cv.getContext('2d');
        const draw = () => {
          ctx.putImageData(th.id, 0, 0);
          const W = cv.width;
          const Hh = cv.height;
          ctx.fillStyle = 'rgba(0,0,0,.5)';
          const x0 = (W * m.l) / 100;
          const y0 = (Hh * m.t) / 100;
          const x1 = W * (1 - m.r / 100);
          const y1 = Hh * (1 - m.b / 100);
          ctx.fillRect(0, 0, W, y0);
          ctx.fillRect(0, y1, W, Hh - y1);
          ctx.fillRect(0, y0, x0, y1 - y0);
          ctx.fillRect(x1, y0, W - x1, y1 - y0);
          ctx.strokeStyle = '#fff';
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
        };
        root.addEventListener('input', (e) => {
          const el = e.target.closest('[data-ck]');
          if (!el) return;
          m[el.dataset.ck] = +el.value;
          el.nextElementSibling.textContent = el.value + '%';
          if (m.l + m.r > 95) m[el.dataset.ck === 'l' ? 'r' : 'l'] = 95 - m[el.dataset.ck];
          if (m.t + m.b > 95) m[el.dataset.ck === 't' ? 'b' : 't'] = 95 - m[el.dataset.ck];
          draw();
        });
        root.addEventListener('click', (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'yes') {
            rs.forEach((ri) => {
              const x0 = Math.round((ri.width * m.l) / 100);
              const y0 = Math.round((ri.height * m.t) / 100);
              const w2 = Math.max(1, Math.round(ri.width * (1 - (m.l + m.r) / 100)));
              const h2 = Math.max(1, Math.round(ri.height * (1 - (m.t + m.b) / 100)));
              cropTo(ri, x0, y0, w2, h2);
            });
            VP.commit();
            VP.toast('Biteşlem kırpıldı');
          }
          close();
        });
        draw();
      }
    );
  };
  // trims transparent borders (or white ones when there are none)
  const trim = () => {
    const rs = rasters();
    if (!rs.length) return needRaster();
    let n = 0;
    rs.forEach((r) => {
      const id = getID(r);
      const d = id.data;
      const w = id.width;
      const h = id.height;
      const box = (test) => {
        let x0 = w;
        let y0 = h;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (!test((y * w + x) * 4)) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
      };
      let b = box((o) => d[o + 3] > 8);
      if (b && b[2] === w && b[3] === h) b = box((o) => d[o + 3] > 8 && (d[o] < 245 || d[o + 1] < 245 || d[o + 2] < 245));
      if (!b || (b[2] === w && b[3] === h)) return;
      cropTo(r, b[0], b[1], b[2], b[3]);
      n++;
    });
    if (n) VP.commit();
    VP.toast(n ? 'Boş kenarlar kırpıldı' : 'Kırpılacak boş kenar yok');
  };
  const expand = async () => {
    const rs = rasters();
    if (!rs.length) return needRaster();
    const v = await UI.prompt({ title: 'Biteşlemi genişlet', label: 'Her kenara eklenecek saydam alan (piksel)', value: '20', ok: 'Genişlet' });
    const px = Math.round(VP.parseNum(v || ''));
    if (!(px > 0)) return;
    rs.forEach((r) => {
      const cv = document.createElement('canvas');
      cv.width = r.width + px * 2;
      cv.height = r.height + px * 2;
      cv.getContext('2d').putImageData(getID(r), px, px);
      IM.replace(r, cv);
    });
    VP.commit();
    VP.toast('Biteşlem genişletildi');
  };
  // colour mask: hides (or keeps only) the picked colour
  const colorMask = () => {
    const rs = rasters();
    if (!rs.length) return needRaster();
    const th = thumbOf(rs[0], 300);
    const d0 = th.id.data;
    const corner = '#' + [d0[0], d0[1], d0[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    const p = { c: corner, tol: 12, mode: 'hide', soft: true };
    const run = (src, q) => {
      const t = hexRGB(q.c);
      const tol = (q.tol / 100) * 441;
      const out = copyID(src);
      const d = out.data;
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.sqrt((d[i] - t[0]) ** 2 + (d[i + 1] - t[1]) ** 2 + (d[i + 2] - t[2]) ** 2);
        let m = dist <= tol ? 1 : q.soft && dist <= tol * 1.4 + 6 ? 1 - (dist - tol) / (tol * 0.4 + 6) : 0;
        if (q.mode === 'show') m = 1 - m;
        d[i + 3] = d[i + 3] * (1 - m);
      }
      return out;
    };
    UI.modal(
      '<h2>Biteşlem renk maskesi</h2><div style="display:flex;justify-content:center;margin:4px 0 10px"><canvas id="cm-cv" width="' + th.id.width + '" height="' + th.id.height + '" style="max-width:100%;cursor:crosshair;' + CHECKER + '"></canvas></div>' +
        '<p class="sec-note">Önizlemede bir renge dokunarak seçebilirsiniz</p>' +
        '<label class="field"><span>Renk</span><input type="color" id="cm-c" value="' + corner + '" style="width:34px;height:26px;border:0;padding:0;background:transparent"></label>' +
        '<label class="range"><span class="pb-label">Tolerans</span><input type="range" id="cm-t" min="0" max="80" value="12"><output>12%</output></label>' +
        '<label class="field"><span>Mod</span><select id="cm-m"><option value="hide">Seçili rengi gizle</option><option value="show">Yalnızca seçili rengi göster</option></select></label>' +
        '<label class="field"><span>Yumuşak kenar</span><input type="checkbox" id="cm-s" checked></label>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Uygula</button></div>',
      (root, close) => {
        const cv = root.querySelector('#cm-cv');
        const ctx = cv.getContext('2d');
        const draw = () => ctx.putImageData(run(th.id, p), 0, 0);
        root.querySelector('#cm-c').addEventListener('input', (e) => {
          p.c = e.target.value;
          draw();
        });
        root.querySelector('#cm-t').addEventListener('input', (e) => {
          p.tol = +e.target.value;
          e.target.nextElementSibling.textContent = e.target.value + '%';
          draw();
        });
        root.querySelector('#cm-m').addEventListener('change', (e) => {
          p.mode = e.target.value;
          draw();
        });
        root.querySelector('#cm-s').addEventListener('change', (e) => {
          p.soft = e.target.checked;
          draw();
        });
        cv.addEventListener('pointerdown', (e) => {
          const rr = cv.getBoundingClientRect();
          const x = clamp(Math.floor(((e.clientX - rr.left) / rr.width) * cv.width), 0, cv.width - 1);
          const y = clamp(Math.floor(((e.clientY - rr.top) / rr.height) * cv.height), 0, cv.height - 1);
          const o = (y * cv.width + x) * 4;
          p.c = '#' + [d0[o], d0[o + 1], d0[o + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
          root.querySelector('#cm-c').value = p.c;
          draw();
        });
        root.addEventListener('click', (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'yes') {
            rs.forEach((r) => r.setImageData(run(getID(r), p), Pt(0, 0)));
            VP.commit();
            VP.toast('Renk maskesi uygulandı');
          }
          close();
        });
        draw();
      }
    );
  };
  /* colour modes */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const toBW = (src, q) => {
    const w = src.width;
    const h = src.height;
    const out = copyID(src);
    const d = out.data;
    const L = lumArray(src);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = L[i];
        let o;
        if (q.method === 'ordered') o = v + (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * 255 > q.t ? 255 : 0;
        else o = v > q.t ? 255 : 0;
        if (q.method === 'fs') {
          const err = v - o;
          if (x + 1 < w) L[i + 1] += (err * 7) / 16;
          if (y + 1 < h) {
            if (x > 0) L[i + w - 1] += (err * 3) / 16;
            L[i + w] += (err * 5) / 16;
            if (x + 1 < w) L[i + w + 1] += err / 16;
          }
        }
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = o;
      }
    }
    return out;
  };
  E.bw = { cat: 'mode', label: 'Siyah-beyaz (1 bit)', params: [S('method', 'Dönüştürme', [['threshold', 'Çizgi resmi (eşik)'], ['fs', 'Hata yayma (Floyd–Steinberg)'], ['ordered', 'Düzenli (Bayer)']], 'threshold'), R('t', 'Eşik', 1, 254, 128)], run: toBW };
  const quantize = (src, q) => {
    const k = clamp(Math.round(q.n), 2, 256);
    const d = src.data;
    const n = d.length / 4;
    const S0 = [];
    const step = Math.max(1, Math.floor(n / 6000));
    for (let i = 0; i < n; i += step) if (d[i * 4 + 3] > 8) S0.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
    if (!S0.length) return copyID(src);
    S0.sort((a, b) => a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11 - (b[0] * 0.3 + b[1] * 0.59 + b[2] * 0.11));
    let cents = [];
    for (let i = 0; i < k; i++) cents.push(S0[Math.floor(((i + 0.5) / k) * S0.length)].slice());
    for (let it = 0; it < 8; it++) {
      const acc = cents.map(() => [0, 0, 0, 0]);
      S0.forEach((c) => {
        let best = 0;
        let bd = 1e9;
        for (let j = 0; j < cents.length; j++) {
          const e = cents[j];
          const dd = (c[0] - e[0]) ** 2 + (c[1] - e[1]) ** 2 + (c[2] - e[2]) ** 2;
          if (dd < bd) {
            bd = dd;
            best = j;
          }
        }
        const a = acc[best];
        a[0] += c[0];
        a[1] += c[1];
        a[2] += c[2];
        a[3]++;
      });
      cents = cents.map((e, j) => (acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : e));
    }
    const out = copyID(src);
    const o = out.data;
    const w = src.width;
    const err = q.dither ? new Float32Array(n * 3) : null;
    for (let i = 0; i < n; i++) {
      let r = o[i * 4];
      let g = o[i * 4 + 1];
      let b = o[i * 4 + 2];
      if (err) {
        r += err[i * 3];
        g += err[i * 3 + 1];
        b += err[i * 3 + 2];
      }
      let best = 0;
      let bd = 1e9;
      for (let j = 0; j < cents.length; j++) {
        const e = cents[j];
        const dd = (r - e[0]) ** 2 + (g - e[1]) ** 2 + (b - e[2]) ** 2;
        if (dd < bd) {
          bd = dd;
          best = j;
        }
      }
      const c = cents[best];
      if (err) {
        const x = i % w;
        const er = [r - c[0], g - c[1], b - c[2]];
        const push = (q2, f) => {
          if (q2 < n) for (let ch = 0; ch < 3; ch++) err[q2 * 3 + ch] += er[ch] * f;
        };
        if (x + 1 < w) push(i + 1, 7 / 16);
        if (x > 0) push(i + w - 1, 3 / 16);
        push(i + w, 5 / 16);
        if (x + 1 < w) push(i + w + 1, 1 / 16);
      }
      o[i * 4] = c[0];
      o[i * 4 + 1] = c[1];
      o[i * 4 + 2] = c[2];
    }
    return out;
  };
  E.palette = { cat: 'mode', label: 'Paletli (az renkli)', params: [R('n', 'Renk sayısı', 2, 64, 8), B('dither', 'Titreklik (hata yayma)', false)], run: quantize };
  E.duotone = { cat: 'mode', label: 'İki tonlu', params: [C('a', 'Koyu ton', '#1d1d5b'), C('b', 'Açık ton', '#f3d9a4')],
    run: (src, p) => {
      const a = hexRGB(p.a);
      const b = hexRGB(p.b);
      return mapPx(src, (r, g, bb) => {
        const t = (0.299 * r + 0.587 * g + 0.114 * bb) / 255;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      });
    } };

  /* =============== menus =============== */
  const anchorFor = (menu) => {
    const b = document.querySelector('.menu-btn[data-menu="' + menu + '"]');
    if (b && b.offsetParent) return b;
    return document.querySelector('#btn-menu-all') || document.querySelector('#propbar') || document.body;
  };
  const isRaster = () => VP.sel.some((it) => it instanceof paper.Raster);
  IM.catMenu = (cat, anchor) => {
    const ids = Object.keys(E).filter((k) => E[k].cat === cat);
    UI.popover(anchor || anchorFor('effects'), ids.map((k) => '<button class="pop-item" data-pick="' + k + '"><span>' + esc(E[k].label) + (E[k].params.length ? '…' : '') + '</span></button>').join(''), (k) => IM.dialog(k));
  };
  IM.allMenu = (anchor) => {
    UI.popover(anchor, CATS.map(([k, l]) => '<button class="pop-item" data-pick="' + k + '"><span>' + esc(l) + ' ▸</span></button>').join(''), (k) => IM.catMenu(k, anchor));
  };
  CATS.forEach(([k, l]) => {
    A['bx_' + k] = { label: l + ' ▸', icon: k === 'adjust' ? 'bmpfx' : '', enabled: isRaster, run: () => IM.catMenu(k) };
  });
  Object.assign(A, {
    bmpResample: { label: 'Yeniden örnekle…', enabled: isRaster, run: resample },
    bmpUpscale: { label: 'Büyüt (yüksek kalite)…', enabled: isRaster, run: upscale },
    bmpCrop: { label: 'Biteşlemi kırp…', enabled: isRaster, run: crop },
    bmpTrim: { label: 'Boş kenarları kırp', enabled: isRaster, run: trim },
    bmpExpand: { label: 'Biteşlemi genişlet…', enabled: isRaster, run: expand },
    bmpColorMask: { label: 'Biteşlem renk maskesi…', enabled: isRaster, run: colorMask },
    bmpBW: { label: 'Siyah-beyaz (1 bit)…', enabled: isRaster, run: () => IM.dialog('bw') },
    bmpPalette: { label: 'Paletli (az renkli)…', enabled: isRaster, run: () => IM.dialog('palette') },
    bmpDuotone: { label: 'İki tonlu…', enabled: isRaster, run: () => IM.dialog('duotone') },
    bmpAdjust: { label: 'Parlaklık ve karşıtlık…', enabled: isRaster, run: () => IM.dialog('bc') },
    bmpHSL: { label: 'Ton, doygunluk, açıklık…', enabled: isRaster, run: () => IM.dialog('hsl') },
    bmpLevels: { label: 'Düzeyler…', enabled: isRaster, run: () => IM.dialog('levels') }
  });
  const M = UI.MENUS;
  M.bitmaps = ['toBitmap', '|', 'h:İzleme', 'traceQuick', 'traceCenter', 'traceOutline', 'traceLogo', 'traceLine', '|', 'bmpCrop', 'bmpTrim', 'bmpExpand', 'bmpResample', 'bmpUpscale', 'bmpColorMask', '|', 'h:Mod', 'bmpGray', 'bmpBW', 'bmpPalette', 'bmpDuotone', 'bmpInvert', '|', 'h:Ayarla', 'bmpAdjust', 'bmpHSL', 'bmpLevels'];
  if (!M.effects.includes('bx_adjust')) M.effects.push('|', 'h:Biteşlem efektleri', ...CATS.map(([k]) => 'bx_' + k));

  // the property bar of a selected bitmap gets an effects button
  UI.selExtras = UI.selExtras || [];
  UI.selExtras.push((s, one) => (one instanceof paper.Raster ? H.btn('bxMenu', ic('bmpfx', 'sm') + 'Efektler ▾', 'Biteşlem efektleri') + H.btn('bmpCrop', 'Kırp', 'Biteşlemi kırp') : ''));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => {
    if (id === 'bxMenu') {
      IM.allMenu(el);
      return true;
    }
    return act0(id, el);
  };
})();
