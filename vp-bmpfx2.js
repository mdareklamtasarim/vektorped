/* VektörPad bitmap effects, second set (written for this app): 3D effects (sphere, cylinder, 3D rotate,
   page curl), art strokes (charcoal, chalk, watercolour, pen and ink, impressionist, crayon), camera (lens flare,
   lighting, bokeh), creative (stained glass, glass block, frame, weather, particles, scatter), distort (blocks,
   offset, shear, wet paint, whirlpool, tile), texture (brick wall, relief sculpture, plastic, etching), bit planes,
   JPEG artefact removal and colour modes. They join the bitmap effect menus and the non-destructive effects. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const IM = VP.imgfx;
  if (!IM || !IM.EFFECTS) return;
  const E = IM.EFFECTS;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const R = (k, l, min, max, v, extra) => Object.assign({ k, l, min, max, v, step: 1 }, extra || {});
  const B = (k, l, v) => ({ k, l, v: !!v, type: 'bool' });
  const C = (k, l, v) => ({ k, l, v, type: 'color' });
  const S = (k, l, opts, v) => ({ k, l, opts, v, type: 'select' });
  const hex = (h) => {
    const c = new paper.Color(h || '#000000');
    return [c.red * 255, c.green * 255, c.blue * 255];
  };
  const rng = (seed) => {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const copy = (id) => new ImageData(new Uint8ClampedArray(id.data), id.width, id.height);
  const lum = (d, o) => 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
  // bilinear sample; outside the image: transparent (or clamped)
  const sample = (s, w, h, x, y, out, o, clampEdge) => {
    if (!clampEdge && (x < -0.5 || y < -0.5 || x > w - 0.5 || y > h - 0.5)) {
      out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
      return;
    }
    x = clamp(x, 0, w - 1);
    y = clamp(y, 0, h - 1);
    const x0 = x | 0;
    const y0 = y | 0;
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const a = (y0 * w + x0) * 4;
    const b = (y0 * w + x1) * 4;
    const c = (y1 * w + x0) * 4;
    const e = (y1 * w + x1) * 4;
    for (let k = 0; k < 4; k++) {
      const t = s[a + k] + (s[b + k] - s[a + k]) * fx;
      const u = s[c + k] + (s[e + k] - s[c + k]) * fx;
      out[o + k] = t + (u - t) * fy;
    }
  };
  // inverse mapping: for each output pixel, where to read in the source
  const remap = (src, fn, clampEdge) => {
    const w = src.width;
    const h = src.height;
    const out = new ImageData(w, h);
    const d = out.data;
    const s = src.data;
    const p = [0, 0];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (fn(x, y, p) === false) continue;
        sample(s, w, h, p[0], p[1], d, o, clampEdge);
      }
    }
    return out;
  };
  const toCanvas = (id) => {
    const cv = document.createElement('canvas');
    cv.width = id.width;
    cv.height = id.height;
    cv.getContext('2d').putImageData(id, 0, 0);
    return cv;
  };
  const fromCanvas = (cv) => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
  const gray = (id) => {
    const o = copy(id);
    const d = o.data;
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = lum(d, i);
    return o;
  };
  // gradient magnitude of luminance (0..255)
  const edgeMap = (id) => {
    const w = id.width;
    const h = id.height;
    const s = id.data;
    const L = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) L[i] = lum(s, i * 4);
    const g = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1];
        const gy = L[i + w - 1] + 2 * L[i + w] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - w] - L[i - w + 1];
        g[i] = Math.min(255, Math.hypot(gx, gy) / 4);
      }
    }
    return { L, g };
  };
  // value noise in 0..1
  const noise2 = (seed) => {
    const r = rng(seed);
    const N = 256;
    const t = new Float32Array(N * N);
    for (let i = 0; i < t.length; i++) t[i] = r();
    const at = (x, y) => t[((y & 255) * N) + (x & 255)];
    return (x, y) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const fbm = (n, x, y, oct) => {
    let v = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      v += n(x * f, y * f) * amp;
      amp *= 0.5;
      f *= 2;
    }
    return v;
  };
  const bump = (id, H, light, depth, keep) => {
    // shade an image by a height field H (Float32Array, 0..255)
    const w = id.width;
    const h = id.height;
    const o = copy(id);
    const d = o.data;
    const a = (light * Math.PI) / 180;
    const lx = Math.cos(a);
    const ly = Math.sin(a);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const nx = (H[i - 1] - H[i + 1]) * depth;
        const ny = (H[i - w] - H[i + w]) * depth;
        const sh = clamp((nx * lx + ny * ly) / 255, -1, 1) * 120;
        const k = i * 4;
        if (keep) {
          d[k] += sh;
          d[k + 1] += sh;
          d[k + 2] += sh;
        } else d[k] = d[k + 1] = d[k + 2] = 128 + sh;
      }
    }
    return o;
  };

  /* ====================== 3B efektleri ====================== */
  IM.CATS.splice(1, 0, ['three', '3B efektleri'], ['strokes', 'Sanatsal darbeler']);
  Object.assign(E, {
    sphere: { cat: 'three', label: 'Küre', params: [R('a', 'Miktar', -100, 100, 60, { unit: '%' })],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const cx = w / 2;
        const cy = h / 2;
        const R0 = Math.min(w, h) / 2;
        const k = p.a / 100;
        return remap(src, (x, y, q) => {
          const dx = (x - cx) / R0;
          const dy = (y - cy) / R0;
          const r = Math.hypot(dx, dy);
          if (r >= 1 || r === 0) {
            q[0] = x;
            q[1] = y;
            return;
          }
          const nr = k >= 0 ? Math.pow(r, 1 + k) : Math.pow(r, 1 / (1 - k));
          const s = (nr / r) * R0;
          q[0] = cx + dx * s;
          q[1] = cy + dy * s;
        }, true);
      } },
    cylinder: { cat: 'three', label: 'Silindir', params: [S('dir', 'Yön', [['v', 'Dikey'], ['h', 'Yatay']], 'v'), R('a', 'Miktar', -100, 100, 60, { unit: '%' })],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const k = p.a / 100;
        const map = (u) => {
          // u in -1..1 → arcsine projection blended by k
          const t = Math.asin(clamp(u, -1, 1)) / (Math.PI / 2);
          return k >= 0 ? u + (t - u) * k : u + (u * u * u - u) * -k;
        };
        return remap(src, (x, y, q) => {
          if (p.dir === 'v') {
            q[0] = ((map((x / (w - 1)) * 2 - 1) + 1) / 2) * (w - 1);
            q[1] = y;
          } else {
            q[0] = x;
            q[1] = ((map((y / (h - 1)) * 2 - 1) + 1) / 2) * (h - 1);
          }
        }, true);
      } },
    rotate3d: { cat: 'three', label: '3B döndür', params: [R('ry', 'Dikey eksen', -70, 70, 30, { unit: '°' }), R('rx', 'Yatay eksen', -70, 70, 0, { unit: '°' }), B('fit', 'Sığdır', true)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const cx = w / 2;
        const cy = h / 2;
        const f = Math.max(w, h) * 1.6;
        const ay = (p.ry * Math.PI) / 180;
        const ax = (p.rx * Math.PI) / 180;
        // rotation of the image plane: R = Rx·Ry; we invert per pixel by intersecting the view ray with the plane
        const cyy = Math.cos(ay);
        const syy = Math.sin(ay);
        const cxx = Math.cos(ax);
        const sxx = Math.sin(ax);
        // plane basis vectors after rotation
        const U = [cyy, sxx * syy, -cxx * syy];
        const V = [0, cxx, sxx];
        const N = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
        const sc = p.fit ? 0.82 : 1;
        return remap(src, (x, y, q) => {
          const dir = [(x - cx) / sc, (y - cy) / sc, f];
          const cam = [0, 0, -f];
          // plane through origin with normal N; ray cam + t·dir
          const den = N[0] * dir[0] + N[1] * dir[1] + N[2] * dir[2];
          if (Math.abs(den) < 1e-9) return false;
          const t = -(N[0] * cam[0] + N[1] * cam[1] + N[2] * cam[2]) / den;
          if (t <= 0) return false;
          const P = [cam[0] + dir[0] * t, cam[1] + dir[1] * t, cam[2] + dir[2] * t];
          q[0] = cx + (P[0] * U[0] + P[1] * U[1] + P[2] * U[2]);
          q[1] = cy + (P[0] * V[0] + P[1] * V[1] + P[2] * V[2]);
        });
      } },
    pageCurl: { cat: 'three', label: 'Sayfa kıvırma', params: [S('c', 'Köşe', [['br', 'Sağ alt'], ['bl', 'Sol alt'], ['tr', 'Sağ üst'], ['tl', 'Sol üst']], 'br'), R('s', 'Boyut', 5, 70, 30, { unit: '%' }), C('paper', 'Kâğıdın arkası', '#f2f0ea')],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const o = copy(src);
        const d = o.data;
        const cxp = p.c[1] === 'r' ? w : 0;
        const cyp = p.c[0] === 'b' ? h : 0;
        const L = (Math.min(w, h) * p.s) / 100 * 1.6;
        // fold line: points at distance L from the corner along the diagonal direction
        const nx = p.c[1] === 'r' ? 1 : -1;
        const ny = p.c[0] === 'b' ? 1 : -1;
        const n = [nx / Math.SQRT2, ny / Math.SQRT2];
        const back = hex(p.paper);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dist = (x - cxp) * n[0] + (y - cyp) * n[1] + L; // >0 beyond the fold
            const i = (y * w + x) * 4;
            if (dist > 0) {
              d[i + 3] = 0;
              continue;
            }
            // the curled flap: mirror of the removed corner across the fold, folded over the page
            const md = -dist;
            if (md < L) {
              const mx = x + n[0] * md * 2;
              const my = y + n[1] * md * 2;
              const inside = mx >= 0 && my >= 0 && mx <= w - 1 && my <= h - 1;
              if (inside) {
                const shade = 0.72 + 0.28 * (md / L);
                d[i] = back[0] * shade;
                d[i + 1] = back[1] * shade;
                d[i + 2] = back[2] * shade;
                d[i + 3] = 255;
                continue;
              }
              continue;
            }
            // a soft shadow on the page next to the flap
            if (md < L * 1.25) {
              const sh = 0.35 * (1 - (md - L) / (L * 0.25));
              for (let c = 0; c < 3; c++) d[i + c] *= 1 - sh;
            }
          }
        }
        return o;
      } }
  });

  /* ====================== Sanatsal darbeler ====================== */
  const strokesOnCanvas = (src, p, draw) => {
    const cv = document.createElement('canvas');
    cv.width = src.width;
    cv.height = src.height;
    const ctx = cv.getContext('2d');
    draw(ctx, src);
    const out = fromCanvas(cv);
    // keep the source transparency
    const d = out.data;
    const s = src.data;
    for (let i = 3; i < d.length; i += 4) d[i] = Math.min(d[i], s[i]);
    return out;
  };
  Object.assign(E, {
    charcoal: { cat: 'strokes', label: 'Kömür kalem', params: [R('size', 'Kalınlık', 1, 10, 3, { px: true }), R('edge', 'Kenar', 0, 100, 60)],
      run: (src, p) => {
        const { L, g } = edgeMap(src);
        const w = src.width;
        const h = src.height;
        const n = noise2(7);
        const o = copy(src);
        const d = o.data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const grain = fbm(n, (x + y * 0.4) / (p.size * 1.5), y / (p.size * 8), 3);
            let v = 255 - g[i] * (p.edge / 40) - (255 - L[i]) * 0.75 * (0.6 + grain * 0.8);
            v = v > 200 ? 255 : v;
            d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = clamp(v, 0, 255);
          }
        }
        return o;
      } },
    chalk: { cat: 'strokes', label: 'Tebeşir ve pastel', params: [R('size', 'Darbe', 2, 20, 6, { px: true }), R('grain', 'Kâğıt dokusu', 0, 100, 50)],
      run: (src, p) => {
        const r = rng(3);
        const nz = noise2(11);
        const out = strokesOnCanvas(src, p, (ctx, s) => {
          ctx.fillStyle = '#f4efe2';
          ctx.fillRect(0, 0, s.width, s.height);
          ctx.lineCap = 'round';
          const step = Math.max(1, p.size * 0.7);
          for (let y = 0; y < s.height; y += step) {
            for (let x = 0; x < s.width; x += step) {
              const jx = x + (r() - 0.5) * step;
              const jy = y + (r() - 0.5) * step;
              const i = ((clamp(jy | 0, 0, s.height - 1)) * s.width + clamp(jx | 0, 0, s.width - 1)) * 4;
              if (s.data[i + 3] < 10) continue;
              ctx.strokeStyle = 'rgba(' + s.data[i] + ',' + s.data[i + 1] + ',' + s.data[i + 2] + ',0.75)';
              ctx.lineWidth = p.size * (0.4 + r() * 0.5);
              const a = -0.9 + (r() - 0.5) * 0.5;
              const len = p.size * (1.2 + r());
              ctx.beginPath();
              ctx.moveTo(jx - Math.cos(a) * len, jy - Math.sin(a) * len);
              ctx.lineTo(jx + Math.cos(a) * len, jy + Math.sin(a) * len);
              ctx.stroke();
            }
          }
        });
        const d = out.data;
        const w = out.width;
        for (let i = 0; i < d.length; i += 4) {
          const x = (i / 4) % w;
          const y = (i / 4 / w) | 0;
          const t = (fbm(nz, x / 2.5, y / 2.5, 2) - 0.5) * p.grain * 1.4;
          d[i] += t;
          d[i + 1] += t;
          d[i + 2] += t;
        }
        return out;
      } },
    watercolor: { cat: 'strokes', label: 'Sulu boya', params: [R('r', 'Fırça', 1, 12, 4, { px: true }), R('wet', 'Islaklık', 0, 100, 50), R('edge', 'Kenar koyuluğu', 0, 100, 40)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const bl = IM.blur(src, p.r * (1 + p.wet / 50));
        const { g } = edgeMap(bl);
        const nz = noise2(5);
        const o = copy(bl);
        const d = o.data;
        for (let i = 0; i < w * h; i++) {
          const x = i % w;
          const y = (i / w) | 0;
          const k = i * 4;
          // pigment pools at edges, paper shows through in light areas
          const dark = (g[i] / 255) * p.edge * 1.6;
          const paperT = (fbm(nz, x / 6, y / 6, 3) - 0.5) * 30;
          for (let c = 0; c < 3; c++) {
            const v = d[k + c];
            d[k + c] = clamp(255 - (255 - v) * 1.08 - dark + paperT, 0, 255);
          }
        }
        // posterise lightly for the flat washes
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] / 24) * 24;
        return IM.blur(o, 0.8);
      } },
    penInk: { cat: 'strokes', label: 'Kalem ve mürekkep', params: [R('lines', 'Tarama aralığı', 3, 20, 6, { px: true }), R('edge', 'Kontur', 0, 100, 60), C('ink', 'Mürekkep', '#1b1b2e')],
      run: (src, p) => {
        const { L, g } = edgeMap(src);
        const w = src.width;
        const h = src.height;
        const ink = hex(p.ink);
        const o = copy(src);
        const d = o.data;
        const sp = p.lines;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const v = L[i] / 255;
            let on = g[i] > 255 - p.edge * 2.2;
            // up to three hatch directions as it gets darker
            if (!on && v < 0.75) on = ((x + y) % sp) < 1;
            if (!on && v < 0.5) on = ((x - y + h * sp) % sp) < 1;
            if (!on && v < 0.25) on = (y % sp) < 1;
            const k = i * 4;
            if (on) {
              d[k] = ink[0];
              d[k + 1] = ink[1];
              d[k + 2] = ink[2];
            } else d[k] = d[k + 1] = d[k + 2] = 252;
          }
        }
        return o;
      } },
    impressionist: { cat: 'strokes', label: 'Empresyonist', params: [R('size', 'Fırça', 2, 30, 8, { px: true }), R('len', 'Darbe uzunluğu', 1, 6, 3), R('seed', 'Rastgele', 1, 99, 7)],
      run: (src, p) => {
        const r = rng(p.seed);
        const { g } = edgeMap(src);
        return strokesOnCanvas(src, p, (ctx, s) => {
          ctx.drawImage(toCanvas(IM.blur(s, p.size / 2)), 0, 0);
          ctx.lineCap = 'round';
          const n = Math.round((s.width * s.height) / (p.size * p.size) * 1.6);
          for (let k = 0; k < n; k++) {
            const x = r() * s.width;
            const y = r() * s.height;
            const i = ((y | 0) * s.width + (x | 0)) * 4;
            if (s.data[i + 3] < 10) continue;
            const j = (y | 0) * s.width + (x | 0);
            const a = g[j] > 30 ? Math.atan2(y - s.height / 2, x - s.width / 2) + Math.PI / 2 : -0.6 + (r() - 0.5);
            const len = p.size * p.len * (0.5 + r() * 0.5);
            ctx.strokeStyle = 'rgba(' + s.data[i] + ',' + s.data[i + 1] + ',' + s.data[i + 2] + ',0.85)';
            ctx.lineWidth = p.size * (0.5 + r() * 0.5);
            ctx.beginPath();
            ctx.moveTo(x - (Math.cos(a) * len) / 2, y - (Math.sin(a) * len) / 2);
            ctx.lineTo(x + (Math.cos(a) * len) / 2, y + (Math.sin(a) * len) / 2);
            ctx.stroke();
          }
        });
      } },
    crayon: { cat: 'strokes', label: 'Mum boya', params: [R('size', 'Darbe', 1, 10, 3, { px: true }), R('grain', 'Doku', 0, 100, 60)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const nz = noise2(9);
        const o = copy(src);
        const d = o.data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const k = (y * w + x) * 4;
            const t = fbm(nz, (x + y) / (p.size * 0.9), (x - y) / (p.size * 6), 3);
            const keep = t > 0.16 + (p.grain / 100) * 0.2;
            for (let c = 0; c < 3; c++) d[k + c] = keep ? Math.round(d[k + c] / 32) * 32 + 8 : 246 - c * 4;
          }
        }
        return o;
      } }
  });

  /* ====================== Kamera ====================== */
  Object.assign(E, {
    lensFlare: { cat: 'camera', label: 'Mercek parlaması', params: [R('x', 'Konum X', 0, 100, 25, { unit: '%' }), R('y', 'Konum Y', 0, 100, 25, { unit: '%' }), R('b', 'Parlaklık', 10, 200, 100, { unit: '%' }), S('t', 'Mercek', [['50', '50–300 mm zum'], ['35', '35 mm'], ['105', '105 mm']], '50')],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const cv = toCanvas(src);
        const ctx = cv.getContext('2d');
        ctx.globalCompositeOperation = 'lighter';
        const fx = (p.x / 100) * w;
        const fy = (p.y / 100) * h;
        const R0 = Math.max(w, h);
        const k = p.b / 100;
        const glow = (x, y, r, col, a) => {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, 'rgba(' + col + ',' + a + ')');
          g.addColorStop(1, 'rgba(' + col + ',0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        };
        glow(fx, fy, R0 * 0.08 * k, '255,255,240', 1);
        glow(fx, fy, R0 * 0.35 * k, '255,200,120', 0.35 * k);
        // streak
        ctx.save();
        ctx.translate(fx, fy);
        ctx.scale(1, 0.03);
        glow(0, 0, R0 * 0.5 * k, '255,240,220', 0.6 * k);
        ctx.restore();
        // ghosts along the line through the centre
        const cx = w / 2;
        const cy = h / 2;
        const ghosts = p.t === '35' ? [0.4, 0.8, 1.3] : p.t === '105' ? [0.6, 1.1, 1.6, 1.9] : [0.3, 0.55, 0.9, 1.25, 1.6];
        ghosts.forEach((t, i) => {
          const gx = fx + (cx - fx) * t * 2;
          const gy = fy + (cy - fy) * t * 2;
          const r = R0 * (0.015 + ((i * 37) % 7) * 0.008) * k;
          const col = ['120,180,255', '255,160,90', '160,255,170', '255,120,200', '200,200,255'][i % 5];
          glow(gx, gy, r, col, 0.45);
        });
        // halo ring
        ctx.lineWidth = R0 * 0.006;
        ctx.strokeStyle = 'rgba(255,220,180,' + 0.18 * k + ')';
        ctx.beginPath();
        ctx.arc(fx, fy, R0 * 0.22 * k, 0, Math.PI * 2);
        ctx.stroke();
        return fromCanvas(cv);
      } },
    lighting: { cat: 'camera', label: 'Işık efektleri', params: [R('x', 'Işık X', 0, 100, 30, { unit: '%' }), R('y', 'Işık Y', 0, 100, 25, { unit: '%' }), R('r', 'Yayılma', 10, 200, 80, { unit: '%' }), R('i', 'Yoğunluk', 0, 200, 110, { unit: '%' }), R('amb', 'Ortam ışığı', 0, 100, 30, { unit: '%' }), C('c', 'Işık rengi', '#fff4dc'), R('tex', 'Doku kabartması', 0, 100, 0)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const lx = (p.x / 100) * w;
        const ly = (p.y / 100) * h;
        const rad = (Math.max(w, h) * p.r) / 100;
        const col = hex(p.c).map((v) => v / 255);
        const amb = p.amb / 100;
        const inten = p.i / 100;
        const o = copy(src);
        const d = o.data;
        let H = null;
        if (p.tex > 0) {
          H = new Float32Array(w * h);
          for (let i = 0; i < w * h; i++) H[i] = lum(src.data, i * 4);
        }
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const dist = Math.hypot(x - lx, y - ly) / rad;
            let li = amb + Math.max(0, 1 - dist * dist) * inten;
            if (H && x > 0 && y > 0 && x < w - 1 && y < h - 1) {
              const nx = (H[i - 1] - H[i + 1]) / 255;
              const ny = (H[i - w] - H[i + w]) / 255;
              const dx = (lx - x) / (rad || 1);
              const dy = (ly - y) / (rad || 1);
              li += (nx * dx + ny * dy) * (p.tex / 50);
            }
            const k = i * 4;
            d[k] = d[k] * li * col[0];
            d[k + 1] = d[k + 1] * li * col[1];
            d[k + 2] = d[k + 2] * li * col[2];
          }
        }
        return o;
      } },
    bokeh: { cat: 'camera', label: 'Bokeh bulanıklığı', params: [R('fy', 'Odak yüksekliği', 0, 100, 55, { unit: '%' }), R('fw', 'Net alan', 2, 100, 25, { unit: '%' }), R('r', 'Bulanıklık', 1, 40, 12, { px: true }), R('hl', 'Işık diskleri', 0, 100, 50)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const b1 = IM.blur(src, p.r * 0.45);
        const b2 = IM.blur(src, p.r);
        const o = copy(src);
        const d = o.data;
        const c0 = (p.fy / 100) * h;
        const half = (p.fw / 100) * h / 2;
        for (let y = 0; y < h; y++) {
          const t = clamp((Math.abs(y - c0) - half) / (h * 0.25), 0, 1);
          for (let x = 0; x < w; x++) {
            const k = (y * w + x) * 4;
            for (let c = 0; c < 4; c++) {
              const a = t < 0.5 ? src.data[k + c] + (b1.data[k + c] - src.data[k + c]) * t * 2 : b1.data[k + c] + (b2.data[k + c] - b1.data[k + c]) * (t - 0.5) * 2;
              d[k + c] = a;
            }
          }
        }
        if (p.hl > 0) {
          // bright points out of focus become soft discs
          const cv = toCanvas(o);
          const ctx = cv.getContext('2d');
          ctx.globalCompositeOperation = 'screen';
          const step = Math.max(3, p.r);
          for (let y = 0; y < h; y += step) {
            const t = clamp((Math.abs(y - c0) - half) / (h * 0.25), 0, 1);
            if (t < 0.3) continue;
            for (let x = 0; x < w; x += step) {
              const k = (y * w + x) * 4;
              const L0 = lum(src.data, k);
              if (L0 < 225 - p.hl * 0.6) continue;
              ctx.fillStyle = 'rgba(' + src.data[k] + ',' + src.data[k + 1] + ',' + src.data[k + 2] + ',' + (0.35 * t) + ')';
              ctx.beginPath();
              ctx.arc(x, y, p.r * t * 0.9, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          return fromCanvas(cv);
        }
        return o;
      } }
  });

  /* ====================== Yaratıcı ====================== */
  // Voronoi cells over a jittered grid: nearest and second-nearest seed
  const voronoi = (w, h, cell, seed, fn) => {
    const r = rng(seed);
    const gw = Math.ceil(w / cell) + 2;
    const gh = Math.ceil(h / cell) + 2;
    const sx = new Float32Array(gw * gh);
    const sy = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        sx[j * gw + i] = (i - 1 + 0.15 + r() * 0.7) * cell;
        sy[j * gw + i] = (j - 1 + 0.15 + r() * 0.7) * cell;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gi = Math.floor(x / cell) + 1;
        const gj = Math.floor(y / cell) + 1;
        let d1 = Infinity;
        let d2 = Infinity;
        let id = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const q = (gj + dj) * gw + gi + di;
            const dd = (sx[q] - x) ** 2 + (sy[q] - y) ** 2;
            if (dd < d1) {
              d2 = d1;
              d1 = dd;
              id = q;
            } else if (dd < d2) d2 = dd;
          }
        }
        fn(x, y, id, Math.sqrt(d2) - Math.sqrt(d1), sx[id], sy[id]);
      }
    }
    return gw * gh;
  };
  Object.assign(E, {
    stainedGlass: { cat: 'creative', label: 'Vitray', params: [R('cell', 'Parça boyutu', 6, 80, 22, { px: true }), R('lead', 'Kurşun kalınlığı', 0, 8, 2, { px: true, step: 0.5 }), C('lc', 'Kurşun rengi', '#1d1a17'), R('light', 'Işık', 0, 100, 40)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const s = src.data;
        const n = voronoi(w, h, p.cell, 4, () => {});
        const sum = new Float64Array(n * 4);
        const ids = new Int32Array(w * h);
        const edge = new Float32Array(w * h);
        voronoi(w, h, p.cell, 4, (x, y, id, de) => {
          const i = y * w + x;
          ids[i] = id;
          edge[i] = de;
          sum[id * 4] += s[i * 4];
          sum[id * 4 + 1] += s[i * 4 + 1];
          sum[id * 4 + 2] += s[i * 4 + 2];
          sum[id * 4 + 3]++;
        });
        const o = copy(src);
        const d = o.data;
        const lc = hex(p.lc);
        for (let i = 0; i < w * h; i++) {
          const id = ids[i];
          const k = i * 4;
          if (edge[i] < p.lead) {
            d[k] = lc[0];
            d[k + 1] = lc[1];
            d[k + 2] = lc[2];
            continue;
          }
          const cnt = sum[id * 4 + 3] || 1;
          const glow = 1 + (p.light / 100) * clamp(1 - edge[i] / (p.cell * 0.6), 0, 1) * 0.35;
          d[k] = (sum[id * 4] / cnt) * glow;
          d[k + 1] = (sum[id * 4 + 1] / cnt) * glow;
          d[k + 2] = (sum[id * 4 + 2] / cnt) * glow;
        }
        return o;
      } },
    glassBlock: { cat: 'creative', label: 'Cam blok', params: [R('bw', 'Blok genişliği', 4, 100, 24, { px: true }), R('bh', 'Blok yüksekliği', 4, 100, 24, { px: true }), R('ref', 'Kırılma', 0, 100, 50)],
      run: (src, p) => remap(src, (x, y, q) => {
        const bx = Math.floor(x / p.bw) * p.bw + p.bw / 2;
        const by = Math.floor(y / p.bh) * p.bh + p.bh / 2;
        const k = 1 - p.ref / 100 * 0.8;
        q[0] = bx + (x - bx) * k + (x - bx) * (1 - k) * -0.6;
        q[1] = by + (y - by) * k + (y - by) * (1 - k) * -0.6;
      }, true) },
    frameFx: { cat: 'creative', label: 'Çerçeve', params: [S('st', 'Tür', [['solid', 'Düz kenar'], ['round', 'Yuvarlak köşe'], ['torn', 'Yırtık kâğıt'], ['soft', 'Yumuşak kenar'], ['film', 'Film kenarı']], 'torn'), R('s', 'Genişlik', 1, 25, 6, { unit: '%' }), C('c', 'Renk', '#ffffff')],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const m = (Math.min(w, h) * p.s) / 100;
        const col = hex(p.c);
        const nz = noise2(17);
        const o = copy(src);
        const d = o.data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const k = (y * w + x) * 4;
            const e = Math.min(x, y, w - 1 - x, h - 1 - y);
            let a = 0; // 1 = frame colour
            if (p.st === 'solid') a = e < m ? 1 : 0;
            else if (p.st === 'round') {
              const rr = m * 2.5;
              const cx = clamp(x, rr + m, w - rr - m);
              const cy = clamp(y, rr + m, h - rr - m);
              a = Math.hypot(x - cx, y - cy) > rr || e < m ? 1 : 0;
            } else if (p.st === 'torn') {
              const t = fbm(nz, x / 9, y / 9, 4) * m * 1.4;
              a = e < m * 0.6 + t ? 1 : 0;
            } else if (p.st === 'soft') a = clamp(1 - (e - m * 0.2) / m, 0, 1);
            else {
              a = e < m ? 1 : 0;
              const holeW = m * 0.45;
              if ((y < m || y > h - m) && Math.abs(((x % (m * 1.3)) - m * 0.65)) < holeW / 2 && Math.abs((y < m ? y : h - y) - m / 2) < m * 0.25) a = -1;
            }
            if (a === -1) {
              d[k + 3] = 0;
              continue;
            }
            for (let c = 0; c < 3; c++) d[k + c] = d[k + c] * (1 - a) + col[c] * a;
            if (a > 0 && d[k + 3] < 255) d[k + 3] = Math.max(d[k + 3], a * 255);
          }
        }
        return o;
      } },
    weather: { cat: 'creative', label: 'Hava', params: [S('t', 'Tür', [['rain', 'Yağmur'], ['snow', 'Kar'], ['fog', 'Sis']], 'rain'), R('a', 'Yoğunluk', 1, 100, 50), R('size', 'Boyut', 1, 20, 4, { px: true }), R('dir', 'Yön', -60, 60, 15, { unit: '°' }), R('seed', 'Rastgele', 1, 99, 3)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const r = rng(p.seed);
        if (p.t === 'fog') {
          const nz = noise2(p.seed);
          const o = copy(src);
          const d = o.data;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const k = (y * w + x) * 4;
              const t = clamp(fbm(nz, x / (w / 6), y / (h / 6), 4) * (p.a / 60) + (y / h) * 0.2, 0, 1);
              for (let c = 0; c < 3; c++) d[k + c] = d[k + c] * (1 - t) + 225 * t;
            }
          }
          return o;
        }
        const cv = toCanvas(src);
        const ctx = cv.getContext('2d');
        const n = Math.round((w * h) / 2500 * p.a * (p.t === 'snow' ? 0.6 : 1));
        const a = ((p.dir + 90) * Math.PI) / 180;
        for (let i = 0; i < n; i++) {
          const x = r() * w;
          const y = r() * h;
          const s = p.size * (0.4 + r() * 0.8);
          if (p.t === 'snow') {
            ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + r() * 0.5) + ')';
            ctx.beginPath();
            ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.strokeStyle = 'rgba(220,230,240,' + (0.25 + r() * 0.35) + ')';
            ctx.lineWidth = Math.max(0.6, s * 0.18);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * s * 5, y + Math.sin(a) * s * 5);
            ctx.stroke();
          }
        }
        return fromCanvas(cv);
      } },
    particles: { cat: 'creative', label: 'Parçacıklar', params: [S('t', 'Tür', [['stars', 'Yıldız'], ['bubbles', 'Kabarcık']], 'stars'), R('n', 'Sayı', 5, 300, 60), R('size', 'Boyut', 2, 60, 12, { px: true }), C('c', 'Renk', '#fff6c8'), R('seed', 'Rastgele', 1, 99, 5)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const r = rng(p.seed);
        const cv = toCanvas(src);
        const ctx = cv.getContext('2d');
        const [cr, cg, cb] = hex(p.c).map(Math.round);
        for (let i = 0; i < p.n; i++) {
          const x = r() * w;
          const y = r() * h;
          const s = p.size * (0.3 + r() * 0.9);
          if (p.t === 'stars') {
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(x, y, 0, x, y, s);
            g.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.9)');
            g.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - s, y - s, s * 2, s * 2);
            ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.7)';
            ctx.lineWidth = Math.max(0.6, s * 0.06);
            ctx.beginPath();
            ctx.moveTo(x - s * 1.4, y);
            ctx.lineTo(x + s * 1.4, y);
            ctx.moveTo(x, y - s * 1.4);
            ctx.lineTo(x, y + s * 1.4);
            ctx.stroke();
          } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.6)';
            ctx.lineWidth = Math.max(0.6, s * 0.08);
            ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.12)';
            ctx.beginPath();
            ctx.arc(x, y, s, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath();
            ctx.arc(x - s * 0.35, y - s * 0.35, s * 0.18, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        return fromCanvas(cv);
      } },
    scatter: { cat: 'creative', label: 'Dağıt', params: [R('a', 'Miktar', 1, 40, 6, { px: true }), R('seed', 'Rastgele', 1, 99, 2)],
      run: (src, p) => {
        const r = rng(p.seed);
        return remap(src, (x, y, q) => {
          q[0] = x + (r() - 0.5) * 2 * p.a;
          q[1] = y + (r() - 0.5) * 2 * p.a;
        }, true);
      } }
  });

  /* ====================== Bozulma ====================== */
  Object.assign(E, {
    blocks: { cat: 'distort', label: 'Bloklar', params: [R('bw', 'Blok', 4, 120, 24, { px: true }), R('off', 'Kayma', 0, 100, 40, { unit: '%' }), S('bg', 'Boşluklar', [['clear', 'Saydam'], ['white', 'Beyaz'], ['black', 'Siyah']], 'white'), R('seed', 'Rastgele', 1, 99, 3)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const r = rng(p.seed);
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext('2d');
        if (p.bg !== 'clear') {
          ctx.fillStyle = p.bg === 'white' ? '#fff' : '#000';
          ctx.fillRect(0, 0, w, h);
        }
        const sc = toCanvas(src);
        for (let y = 0; y < h; y += p.bw) {
          for (let x = 0; x < w; x += p.bw) {
            const dx = (r() - 0.5) * p.bw * (p.off / 100);
            const dy = (r() - 0.5) * p.bw * (p.off / 100);
            ctx.drawImage(sc, x, y, p.bw, p.bw, x + dx, y + dy, p.bw, p.bw);
          }
        }
        return fromCanvas(cv);
      } },
    offsetFx: { cat: 'distort', label: 'Kaydır', params: [R('x', 'Yatay', -100, 100, 25, { unit: '%' }), R('y', 'Dikey', -100, 100, 0, { unit: '%' }), B('wrap', 'Taşanı öbür kenara sar', true)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const ox = (p.x / 100) * w;
        const oy = (p.y / 100) * h;
        return remap(src, (x, y, q) => {
          let sx = x - ox;
          let sy = y - oy;
          if (p.wrap) {
            sx = ((sx % w) + w) % w;
            sy = ((sy % h) + h) % h;
          }
          q[0] = sx;
          q[1] = sy;
        });
      } },
    shear: { cat: 'distort', label: 'Makaslama', params: [R('a', 'Eğrilik', -100, 100, 40), R('f', 'Dalga', 0, 5, 1), S('dir', 'Yön', [['h', 'Yatay'], ['v', 'Dikey']], 'h')],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        return remap(src, (x, y, q) => {
          if (p.dir === 'h') {
            const t = y / h;
            q[0] = x - Math.sin(t * Math.PI * (p.f || 0.5)) * (p.a / 100) * w * 0.25;
            q[1] = y;
          } else {
            const t = x / w;
            q[0] = x;
            q[1] = y - Math.sin(t * Math.PI * (p.f || 0.5)) * (p.a / 100) * h * 0.25;
          }
        });
      } },
    wetPaint: { cat: 'distort', label: 'Islak boya', params: [R('len', 'Akıntı', 1, 100, 30, { px: true }), R('pct', 'Oran', 1, 100, 40, { unit: '%' }), S('which', 'Akan renkler', [['dark', 'Koyular'], ['light', 'Açıklar']], 'dark'), R('seed', 'Rastgele', 1, 99, 4)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const r = rng(p.seed);
        const o = copy(src);
        const d = o.data;
        const s = src.data;
        for (let x = 0; x < w; x++) {
          if (r() * 100 > p.pct) continue;
          const L0 = p.len * (0.3 + r() * 0.7);
          for (let y = 0; y < h; y++) {
            const k = (y * w + x) * 4;
            const v = lum(s, k);
            const go = p.which === 'dark' ? v < 110 : v > 170;
            if (!go || s[k + 3] < 20) continue;
            const n = Math.round(L0 * (0.5 + r()));
            for (let t = 1; t <= n && y + t < h; t++) {
              const q = ((y + t) * w + x) * 4;
              const a = 1 - t / (n + 1);
              for (let c = 0; c < 3; c++) d[q + c] = d[q + c] * (1 - a) + s[k + c] * a;
              d[q + 3] = Math.max(d[q + 3], s[k + 3] * a);
            }
            y += n;
          }
        }
        return o;
      } },
    whirlpool: { cat: 'distort', label: 'Girdap havuzu', params: [R('a', 'Güç', 1, 60, 15, { px: true }), R('s', 'Ölçek', 5, 200, 40, { px: true }), R('seed', 'Rastgele', 1, 99, 6)],
      run: (src, p) => {
        const nz = noise2(p.seed);
        return remap(src, (x, y, q) => {
          const a = fbm(nz, x / p.s, y / p.s, 3) * Math.PI * 4;
          q[0] = x + Math.cos(a) * p.a;
          q[1] = y + Math.sin(a) * p.a;
        }, true);
      } },
    tileFx: { cat: 'distort', label: 'Döşe', params: [R('nx', 'Yatay', 1, 12, 3), R('ny', 'Dikey', 1, 12, 3)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        return remap(src, (x, y, q) => {
          q[0] = ((x * p.nx) % w);
          q[1] = ((y * p.ny) % h);
        }, true);
      } }
  });

  /* ====================== Doku ====================== */
  Object.assign(E, {
    brick: { cat: 'texture', label: 'Tuğla duvar', params: [R('bw', 'Tuğla genişliği', 6, 200, 48, { px: true }), R('bh', 'Tuğla yüksekliği', 3, 100, 18, { px: true }), R('m', 'Derz', 1, 12, 3, { px: true }), R('d', 'Derinlik', 0, 100, 50)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const Hf = new Float32Array(w * h);
        const nz = noise2(13);
        for (let y = 0; y < h; y++) {
          const row = Math.floor(y / p.bh);
          const sh = row % 2 ? p.bw / 2 : 0;
          for (let x = 0; x < w; x++) {
            const lx = (x + sh) % p.bw;
            const ly = y % p.bh;
            const mortar = lx < p.m || ly < p.m;
            Hf[y * w + x] = mortar ? 40 : 200 + fbm(nz, x / 4, y / 4, 2) * 40;
          }
        }
        const o = bump(src, Hf, 135, p.d / 100, true);
        const d = o.data;
        for (let i = 0; i < w * h; i++) if (Hf[i] < 100) for (let c = 0; c < 3; c++) d[i * 4 + c] *= 0.8;
        return o;
      } },
    relief: { cat: 'texture', label: 'Kabartma heykel', params: [R('d', 'Derinlik', 1, 100, 50), R('a', 'Işık açısı', -180, 180, 135, { unit: '°' }), B('color', 'Renkli', false)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const bl = IM.blur(src, 1.2);
        const Hf = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) Hf[i] = lum(bl.data, i * 4);
        return bump(p.color ? src : gray(src), Hf, p.a, p.d / 25, p.color);
      } },
    plastic: { cat: 'texture', label: 'Plastik', params: [R('d', 'Parlaklık', 1, 100, 60), R('s', 'Yumuşaklık', 1, 12, 3, { px: true })],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const bl = IM.blur(src, p.s);
        const o = copy(src);
        const d = o.data;
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            const nx = lum(bl.data, (i - 1) * 4) - lum(bl.data, (i + 1) * 4);
            const ny = lum(bl.data, (i - w) * 4) - lum(bl.data, (i + w) * 4);
            const spec = Math.pow(clamp((nx + ny) / 14, 0, 1), 1.5) * (p.d * 2.6) - Math.pow(clamp(-(nx + ny) / 14, 0, 1), 1.5) * p.d * 0.8;
            const k = i * 4;
            for (let c = 0; c < 3; c++) d[k + c] = bl.data[k + c] + spec;
          }
        }
        return o;
      } },
    etching: { cat: 'texture', label: 'Gravür', params: [R('sp', 'Çizgi aralığı', 2, 16, 4, { px: true }), R('ang', 'Açı', -90, 90, 20, { unit: '°' }), C('ink', 'Mürekkep', '#2a2420'), C('paper', 'Kâğıt', '#f3ead8')],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const a = (p.ang * Math.PI) / 180;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const ink = hex(p.ink);
        const pap = hex(p.paper);
        const o = copy(src);
        const d = o.data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const k = (y * w + x) * 4;
            const v = lum(src.data, k) / 255;
            const t = ((x * sa - y * ca) / p.sp) % 1;
            const ph = Math.abs((t < 0 ? t + 1 : t) - 0.5) * 2; // 0 at line centre
            const on = ph < 1 - v;
            const c = on ? ink : pap;
            d[k] = c[0];
            d[k + 1] = c[1];
            d[k + 2] = c[2];
          }
        }
        return o;
      } }
  });

  /* ====================== Renk dönüştürme, gürültü ====================== */
  Object.assign(E, {
    bitPlanes: { cat: 'color', label: 'Bit düzlemleri', params: [R('r', 'Kırmızı biti', 0, 7, 7), R('g', 'Yeşil biti', 0, 7, 7), R('b', 'Mavi biti', 0, 7, 7)],
      run: (src, p) => {
        const o = copy(src);
        const d = o.data;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = (d[i] >> p.r) & 1 ? 255 : 0;
          d[i + 1] = (d[i + 1] >> p.g) & 1 ? 255 : 0;
          d[i + 2] = (d[i + 2] >> p.b) & 1 ? 255 : 0;
        }
        return o;
      } },
    jpegClean: { cat: 'noise', label: 'JPEG kusurlarını temizle', params: [R('a', 'Güç', 0, 100, 60), B('keep', 'Kenarları koru', true)],
      run: (src, p) => {
        const w = src.width;
        const h = src.height;
        const s = src.data;
        const o = copy(src);
        const d = o.data;
        const sig = 8 + p.a * 0.45; // colour difference allowed
        const k2 = 1 / (2 * sig * sig);
        // edge-preserving smoothing (small bilateral filter), stronger on the 8×8 block borders
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const onBorder = x % 8 === 0 || x % 8 === 7 || y % 8 === 0 || y % 8 === 7;
            const rad = onBorder ? 2 : 1;
            let sr = 0, sg = 0, sb = 0, sw = 0;
            for (let dy = -rad; dy <= rad; dy++) {
              const yy = clamp(y + dy, 0, h - 1);
              for (let dx = -rad; dx <= rad; dx++) {
                const xx = clamp(x + dx, 0, w - 1);
                const j = (yy * w + xx) * 4;
                const dr = s[j] - s[i];
                const dg = s[j + 1] - s[i + 1];
                const db = s[j + 2] - s[i + 2];
                const wt = p.keep ? Math.exp(-(dr * dr + dg * dg + db * db) * k2) : 1;
                sr += s[j] * wt;
                sg += s[j + 1] * wt;
                sb += s[j + 2] * wt;
                sw += wt;
              }
            }
            const m = p.a / 100;
            d[i] = s[i] + (sr / sw - s[i]) * m;
            d[i + 1] = s[i + 1] + (sg / sw - s[i + 1]) * m;
            d[i + 2] = s[i + 2] + (sb / sw - s[i + 2]) * m;
          }
        }
        return o;
      } }
  });

  /* ====================== colour modes ====================== */
  const rasters = () => VP.sel.filter((it) => it instanceof paper.Raster);
  const setMode = (mode) => {
    const rs = rasters();
    if (!rs.length) return VP.toast('Biteşlem seçin');
    rs.forEach((r) => {
      if (mode === 'CMYK' && VP.work && VP.work.proofColor) {
        const id = r.getImageData(new paper.Rectangle(0, 0, r.width, r.height));
        const d = id.data;
        const prof = Object.assign({}, VP.work.PROFILES.coated, { paper: [255, 255, 255], black: [0, 0, 0] });
        const cache = new Map();
        for (let i = 0; i < d.length; i += 4) {
          const key = ((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2);
          let c = cache.get(key);
          if (!c) {
            c = VP.work.proofColor(d[i], d[i + 1], d[i + 2], prof);
            cache.set(key, c);
          }
          d[i] = c[0];
          d[i + 1] = c[1];
          d[i + 2] = c[2];
        }
        r.setImageData(id, new paper.Point(0, 0));
      }
      r.data.colorMode = mode;
    });
    VP.commit();
    VP.toast(mode === 'CMYK' ? 'CMYK’ye dönüştürüldü · Baskıda çıkmayan canlı renkler yumuşatıldı' : mode === 'Lab' ? 'Lab olarak işaretlendi (renkler değişmez)' : 'RGB');
  };
  Object.assign(A, {
    bmpModeRGB: { label: 'RGB renk (24 bit)', enabled: () => rasters().length > 0, checked: () => rasters().length > 0 && rasters().every((r) => !r.data.colorMode || r.data.colorMode === 'RGB'), run: () => setMode('RGB') },
    bmpModeLab: { label: 'Lab renk', enabled: () => rasters().length > 0, checked: () => rasters().length > 0 && rasters().every((r) => r.data.colorMode === 'Lab'), run: () => setMode('Lab') },
    bmpModeCMYK: { label: 'CMYK renk (32 bit)', enabled: () => rasters().length > 0, checked: () => rasters().length > 0 && rasters().every((r) => r.data.colorMode === 'CMYK'), run: () => setMode('CMYK') },
    bmpJpegClean: { label: 'JPEG kusurlarını temizle…', enabled: () => rasters().length > 0, run: () => IM.dialog('jpegClean') }
  });
  // effect menus for the new categories
  [['three', '3B efektleri'], ['strokes', 'Sanatsal darbeler']].forEach(([k, l]) => {
    A['bx_' + k] = { label: l + ' ▸', enabled: () => rasters().length > 0, run: () => IM.catMenu(k) };
  });
  const M = UI.MENUS;
  if (M.effects && !M.effects.includes('bx_three')) {
    const i = M.effects.indexOf('bx_adjust');
    if (i >= 0) M.effects.splice(i + 1, 0, 'bx_three', 'bx_strokes');
  }
  if (M.bitmaps && !M.bitmaps.includes('bmpModeRGB')) {
    const i = M.bitmaps.indexOf('h:Mod');
    if (i >= 0) M.bitmaps.splice(i + 1, 0, 'bmpModeRGB', 'bmpModeLab', 'bmpModeCMYK');
    M.bitmaps.push('|', 'bmpJpegClean');
  }
})();
