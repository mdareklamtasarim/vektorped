/* VektörPad bitmap tracing (bitmap → vector shapes) and print separations (C, M, Y, K plates).
   Tracing: reduce colours (k-means), merge specks, follow the pixel edges of each colour,
   smooth the staircase and fit Bézier curves. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const $ = (s) => document.querySelector(s);
  const B = (VP.bitmap = {});

  /* =============== pixels =============== */
  // Reads a raster scaled so its longer side is at most maxSide pixels.
  const readPixels = (raster, maxSide) => {
    const src = raster.canvas || raster.image;
    const w0 = raster.width;
    const h0 = raster.height;
    const k = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(2, Math.round(w0 * k));
    const h = Math.max(2, Math.round(h0 * k));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h, k };
  };

  /* =============== colour reduction =============== */
  // Starts from the most common 4-bit colour boxes, then refines with a few k-means passes.
  const quantize = (px, n, w, h) => {
    const N = w * h;
    const idx = new Int16Array(N).fill(-1);
    const bins = new Map();
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      if (px[o + 3] < 128) continue;
      const key = ((px[o] >> 4) << 8) | ((px[o + 1] >> 4) << 4) | (px[o + 2] >> 4);
      const b = bins.get(key);
      if (b) {
        b.n++;
        b.r += px[o];
        b.g += px[o + 1];
        b.b += px[o + 2];
      } else bins.set(key, { n: 1, r: px[o], g: px[o + 1], b: px[o + 2] });
    }
    const sorted = [...bins.values()].sort((a, b) => b.n - a.n);
    const cents = [];
    // pick well separated seeds among the frequent boxes
    for (const b of sorted) {
      if (cents.length >= n) break;
      const c = [b.r / b.n, b.g / b.n, b.b / b.n];
      if (cents.every((d) => (d[0] - c[0]) ** 2 + (d[1] - c[1]) ** 2 + (d[2] - c[2]) ** 2 > 900)) cents.push(c);
    }
    for (const b of sorted) {
      if (cents.length >= n) break;
      cents.push([b.r / b.n, b.g / b.n, b.b / b.n]);
    }
    if (!cents.length) return { idx, cents: [] };
    const K = cents.length;
    const nearest = (o) => {
      let best = 0;
      let bd = Infinity;
      for (let j = 0; j < K; j++) {
        const c = cents[j];
        const d = (px[o] - c[0]) ** 2 + (px[o + 1] - c[1]) ** 2 + (px[o + 2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      return best;
    };
    // refine the centres on a sample, then label every pixel once
    const step = Math.max(1, Math.floor(N / 60000));
    for (let it = 0; it < 8; it++) {
      const sum = new Float64Array(K * 4);
      for (let i = 0; i < N; i += step) {
        const o = i * 4;
        if (px[o + 3] < 128) continue;
        const b = nearest(o);
        sum[b * 4] += px[o];
        sum[b * 4 + 1] += px[o + 1];
        sum[b * 4 + 2] += px[o + 2];
        sum[b * 4 + 3]++;
      }
      for (let j = 0; j < K; j++) if (sum[j * 4 + 3]) cents[j] = [sum[j * 4] / sum[j * 4 + 3], sum[j * 4 + 1] / sum[j * 4 + 3], sum[j * 4 + 2] / sum[j * 4 + 3]];
    }
    for (let i = 0; i < N; i++) if (px[i * 4 + 3] >= 128) idx[i] = nearest(i * 4);
    return { idx, cents };
  };
  // Black and white by brightness.
  const threshold = (px, w, h, t) => {
    const idx = new Int16Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      if (px[o + 3] < 128) {
        idx[i] = -1;
        continue;
      }
      idx[i] = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2] < t ? 0 : 1;
    }
    return { idx, cents: [[20, 20, 20], [255, 255, 255]] };
  };
  // Repaints connected specks smaller than minArea with the colour that surrounds them most.
  const despeckle = (idx, w, h, minArea) => {
    if (minArea < 2) return;
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    const comp = [];
    for (let s = 0; s < w * h; s++) {
      if (seen[s] || idx[s] < 0) continue;
      const col = idx[s];
      let top = 0;
      stack[top++] = s;
      seen[s] = 1;
      comp.length = 0;
      while (top) {
        const p = stack[--top];
        comp.push(p);
        if (comp.length > minArea * 4) {
          // big enough: just finish marking it
        }
        const x = p % w;
        const y = (p / w) | 0;
        const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of nb) {
          if (q >= 0 && !seen[q] && idx[q] === col) {
            seen[q] = 1;
            stack[top++] = q;
          }
        }
      }
      if (comp.length >= minArea) continue;
      const votes = new Map();
      comp.forEach((p) => {
        const x = p % w;
        const y = (p / w) | 0;
        [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1].forEach((q) => {
          if (q >= 0 && idx[q] !== col) votes.set(idx[q], (votes.get(idx[q]) || 0) + 1);
        });
      });
      let best = col;
      let bv = 0;
      votes.forEach((v, k) => {
        if (v > bv) {
          bv = v;
          best = k;
        }
      });
      comp.forEach((p) => (idx[p] = best));
    }
  };

  // Edge-smoothing pixels form thin bands whose colour lies between two neighbours (blue→white gives
  // light blue). Such bands are folded into the colours around them.
  const foldEdgeBands = (q, w, h) => {
    const { idx, cents } = q;
    const K = cents.length;
    if (K < 3) return;
    const area = new Float64Array(K);
    const edges = new Float64Array(K);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = idx[y * w + x];
        if (c < 0) continue;
        area[c]++;
        if (x + 1 < w && idx[y * w + x + 1] !== c) edges[c]++;
        if (x > 0 && idx[y * w + x - 1] !== c) edges[c]++;
        if (y + 1 < h && idx[(y + 1) * w + x] !== c) edges[c]++;
        if (y > 0 && idx[(y - 1) * w + x] !== c) edges[c]++;
      }
    }
    const between = (c) => {
      const p = cents[c];
      for (let a = 0; a < K; a++) {
        for (let b = a + 1; b < K; b++) {
          if (a === c || b === c || !area[a] || !area[b]) continue;
          const A = cents[a];
          const Bv = cents[b];
          const ab = [Bv[0] - A[0], Bv[1] - A[1], Bv[2] - A[2]];
          const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
          if (L2 < 1600) continue;
          const t = ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1] + (p[2] - A[2]) * ab[2]) / L2;
          if (t < 0.08 || t > 0.92) continue;
          const d2 = (A[0] + ab[0] * t - p[0]) ** 2 + (A[1] + ab[1] * t - p[1]) ** 2 + (A[2] + ab[2] * t - p[2]) ** 2;
          if (d2 < 45 * 45) return [a, b];
        }
      }
      return null;
    };
    for (let c = 0; c < K; c++) {
      if (!area[c] || !edges[c]) continue;
      const thick = (2 * area[c]) / edges[c];
      if (thick > 2.6) continue;
      const pair = between(c);
      if (!pair) continue;
      for (let pass = 0; pass < 3; pass++) {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (idx[i] !== c) continue;
            let va = 0;
            let vb = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx;
                const yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                const n = idx[yy * w + xx];
                if (n === pair[0]) va++;
                else if (n === pair[1]) vb++;
              }
            }
            if (va || vb) idx[i] = va >= vb ? pair[0] : pair[1];
            else if (pass === 2) {
              const p = cents[c];
              const da = cents[pair[0]].reduce((s, v, k) => s + (v - p[k]) ** 2, 0);
              const db = cents[pair[1]].reduce((s, v, k) => s + (v - p[k]) ** 2, 0);
              idx[i] = da <= db ? pair[0] : pair[1];
            }
          }
        }
      }
    }
  };

  /* =============== edge following =============== */
  // Boundary loops of the pixels whose index is `col`, as lists of grid corners (inside on the right).
  const loopsOf = (idx, w, h, col) => {
    const W1 = w + 1;
    const mask = new Uint8Array(W1 * (h + 1));
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && idx[y * w + x] === col;
    let any = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (idx[y * w + x] !== col) continue;
        any = true;
        if (!inside(x, y - 1)) mask[y * W1 + x] |= 1; // right along the top edge
        if (!inside(x + 1, y)) mask[y * W1 + x + 1] |= 2; // down the right edge
        if (!inside(x, y + 1)) mask[(y + 1) * W1 + x + 1] |= 4; // left along the bottom edge
        if (!inside(x - 1, y)) mask[(y + 1) * W1 + x] |= 8; // up the left edge
      }
    }
    if (!any) return [];
    const DX = [1, 0, -1, 0];
    const DY = [0, 1, 0, -1];
    const single = (m) => m === 1 || m === 2 || m === 4 || m === 8;
    const loops = [];
    const traceFrom = (v) => {
      let d = mask[v] & 1 ? 0 : mask[v] & 2 ? 1 : mask[v] & 4 ? 2 : 3;
      let x = v % W1;
      let y = (v / W1) | 0;
      const pts = [];
      let guard = 0;
      for (;;) {
        mask[y * W1 + x] &= ~(1 << d);
        pts.push(x, y);
        x += DX[d];
        y += DY[d];
        const nx = y * W1 + x;
        const m = mask[nx];
        // back at a start corner with nothing left there: the loop is closed
        if (!m || (nx === v && !m)) break;
        // prefer turning right, so pixels touching only at a corner stay separate
        const r = (d + 1) % 4;
        const l = (d + 3) % 4;
        d = m & (1 << r) ? r : m & (1 << d) ? d : m & (1 << l) ? l : (d + 2) % 4;
        if (++guard > 4e6) break;
      }
      if (pts.length >= 8) loops.push(pts);
    };
    // start at ordinary corners first; corners shared by two diagonal pixels come last
    for (let v = 0; v < mask.length; v++) while (mask[v] && single(mask[v])) traceFrom(v);
    for (let v = 0; v < mask.length; v++) while (mask[v]) traceFrom(v);
    return loops;
  };
  // Staircase → midpoints → fitted curve.
  const loopToPath = (pts, tol) => {
    const n = pts.length / 2;
    const mid = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      mid.push(new paper.Point((pts[i * 2] + pts[j * 2]) / 2, (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2));
    }
    // average neighbouring points to remove the pixel staircase, but leave real corners sharp
    const M = mid.length;
    const at = (i) => mid[((i % M) + M) % M];
    const sm = mid.map((p, i) => {
      if (M < 12) return p;
      const v1 = p.subtract(at(i - 3));
      const v2 = at(i + 3).subtract(p);
      const turn = Math.abs(v1.getDirectedAngle(v2));
      if (turn > 50) return p;
      let x = 0;
      let y = 0;
      for (let k = -2; k <= 2; k++) {
        const q = at(i + k);
        x += q.x;
        y += q.y;
      }
      return new paper.Point(x / 5, y / 5);
    });
    // drop points that lie on a straight run so the fitter sees only the shape
    const keep = [];
    for (let i = 0; i < sm.length; i++) {
      const a = sm[(i - 1 + sm.length) % sm.length];
      const b = sm[i];
      const c = sm[(i + 1) % sm.length];
      if (Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > 1e-6) keep.push(b);
    }
    if (keep.length < 3) return null;
    const p = new paper.Path({ segments: keep, closed: true, insert: false });
    if (keep.length > 4) p.simplify(tol);
    return p;
  };

  /* =============== centreline tracing =============== */
  // Brightness as if the pixel sat on white paper (transparent areas count as paper).
  const lumOnWhite = (px, o) => {
    const a = px[o + 3] / 255;
    return (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) * a + 255 * (1 - a);
  };
  // Otsu's threshold on brightness: the split that best separates ink from paper.
  const otsu = (px, n) => {
    const hist = new Float64Array(256);
    let total = 0;
    for (let i = 0; i < n; i++) {
      hist[Math.round(lumOnWhite(px, i * 4))]++;
      total++;
    }
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0;
    let wB = 0;
    let best = 128;
    let bv = -1;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sB += t * hist[t];
      const mB = sB / wB;
      const mF = (sum - sB) / wF;
      const v = wB * wF * (mB - mF) ** 2;
      if (v > bv) {
        bv = v;
        best = t;
      }
    }
    return best;
  };
  // Zhang–Suen thinning: peels the ink down to one-pixel-wide lines.
  const thin = (m, w, h) => {
    const N = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
    const del = [];
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 200) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        del.length = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (!m[y * w + x]) continue;
            const p2 = N(x, y - 1);
            const p3 = N(x + 1, y - 1);
            const p4 = N(x + 1, y);
            const p5 = N(x + 1, y + 1);
            const p6 = N(x, y + 1);
            const p7 = N(x - 1, y + 1);
            const p8 = N(x - 1, y);
            const p9 = N(x - 1, y - 1);
            const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (B < 2 || B > 6) continue;
            const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
            let A = 0;
            for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++;
            if (A !== 1) continue;
            if (step === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
            del.push(y * w + x);
          }
        }
        if (del.length) changed = true;
        del.forEach((i) => (m[i] = 0));
      }
    }
  };
  // Distance of each ink pixel to the nearest paper pixel (two-pass chamfer).
  const distance = (m, w, h) => {
    const d = new Float32Array(w * h);
    const INF = 1e9;
    for (let i = 0; i < w * h; i++) d[i] = m[i] ? INF : 0;
    const relax = (i, j, c) => {
      if (d[j] + c < d[i]) d[i] = d[j] + c;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!d[i]) continue;
        if (x > 0) relax(i, i - 1, 1);
        if (y > 0) relax(i, i - w, 1);
        if (x > 0 && y > 0) relax(i, i - w - 1, 1.414);
        if (x < w - 1 && y > 0) relax(i, i - w + 1, 1.414);
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (!d[i]) continue;
        if (x < w - 1) relax(i, i + 1, 1);
        if (y < h - 1) relax(i, i + w, 1);
        if (x < w - 1 && y < h - 1) relax(i, i + w + 1, 1.414);
        if (x > 0 && y < h - 1) relax(i, i + w - 1, 1.414);
      }
    }
    return d;
  };
  // Walks the one-pixel skeleton into chains between ends and crossings.
  const skeletonChains = (m, w, h) => {
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
    // diagonal steps count only when no straight step already links the two pixels
    const nbrs = (i) => {
      const x = i % w;
      const y = (i / w) | 0;
      const out = [];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => on(x + dx, y + dy) && out.push((y + dy) * w + x + dx));
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dx, dy]) => {
        if (on(x + dx, y + dy) && !on(x + dx, y) && !on(x, y + dy)) out.push((y + dy) * w + x + dx);
      });
      return out;
    };
    const used = new Set();
    const key = (a, b) => (a < b ? a * 1e7 + b : b * 1e7 + a);
    const chains = [];
    const deg = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (m[i]) deg[i] = nbrs(i).length;
    const walk = (start, next) => {
      const chain = [start];
      let prev = start;
      let cur = next;
      used.add(key(prev, cur));
      for (let g = 0; g < 1e6; g++) {
        chain.push(cur);
        if (deg[cur] !== 2) break;
        const nx = nbrs(cur).find((q) => q !== prev && !used.has(key(cur, q)));
        if (nx == null) break;
        used.add(key(cur, nx));
        prev = cur;
        cur = nx;
      }
      return chain;
    };
    for (let i = 0; i < w * h; i++) {
      if (!m[i] || deg[i] === 2 || deg[i] === 0) continue;
      nbrs(i).forEach((q) => {
        if (!used.has(key(i, q))) chains.push(walk(i, q));
      });
    }
    // closed loops have no ends or crossings
    for (let i = 0; i < w * h; i++) {
      if (!m[i] || deg[i] !== 2) continue;
      const q = nbrs(i).find((n) => !used.has(key(i, n)));
      if (q != null) chains.push(walk(i, q));
    }
    return chains;
  };
  const centerline = (raster, o) => {
    const { data, w, h, k } = readPixels(raster, o.side);
    const N = w * h;
    const t = o.threshold || otsu(data, N);
    const m = new Uint8Array(N);
    let ink = [0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      const p = i * 4;
      if (lumOnWhite(data, p) < t) {
        m[i] = 1;
        ink[0] += data[p];
        ink[1] += data[p + 1];
        ink[2] += data[p + 2];
        ink[3]++;
      }
    }
    if (!ink[3]) return { group: new paper.Group({ insert: false }), colors: 0, paths: 0, size: w + '×' + h };
    // drop specks before thinning
    const idx = new Int16Array(N);
    for (let i = 0; i < N; i++) idx[i] = m[i] ? 1 : 0;
    despeckle(idx, w, h, o.min);
    for (let i = 0; i < N; i++) m[i] = idx[i] === 1 ? 1 : 0;
    const dist = distance(m, w, h);
    thin(m, w, h);
    let ws = 0;
    let wn = 0;
    for (let i = 0; i < N; i++) {
      if (m[i]) {
        ws += dist[i];
        wn++;
      }
    }
    const widthPx = Math.max(1, (2 * ws) / Math.max(1, wn) - 0.5);
    const chains = skeletonChains(m, w, h);
    const mat = new paper.Matrix().translate(-raster.width / 2, -raster.height / 2).scale(1 / k);
    const col = new paper.Color(ink[0] / ink[3] / 255, ink[1] / ink[3] / 255, ink[2] / ink[3] / 255).toCSS(true);
    const g = new paper.Group({ insert: false });
    const minLen = Math.max(2, widthPx * 1.5);
    chains.forEach((c) => {
      if (c.length < 2) return;
      let pts = c.map((i) => new paper.Point((i % w) + 0.5, ((i / w) | 0) + 0.5));
      const closed = c.length > 4 && c[0] === c[c.length - 1];
      if (closed) pts.pop();
      // light averaging removes the pixel steps; ends stay put
      pts = pts.map((p, i) => {
        if (!closed && (i === 0 || i === pts.length - 1)) return p;
        const a = pts[(i - 1 + pts.length) % pts.length];
        const b = pts[(i + 1) % pts.length];
        return a.add(p.multiply(2)).add(b).divide(4);
      });
      const path = new paper.Path({ segments: pts, closed, insert: false });
      if (path.length < minLen) return;
      if (pts.length > 3) path.simplify(o.tol * 1.2);
      path.transform(mat);
      path.transform(raster.matrix);
      path.strokeColor = col;
      path.fillColor = null;
      path.strokeCap = 'round';
      path.strokeJoin = 'round';
      g.addChild(path);
    });
    const sw = (widthPx / k) * Math.abs(raster.matrix.scaling.x);
    g.children.forEach((p) => (p.strokeWidth = o.fixedWidth ? VP.toPT(o.fixedWidth) : sw));
    g.data.label = 'Merkez çizgi izleme (' + g.children.length + ' çizgi)';
    return { group: g, colors: 1, paths: g.children.length, size: w + '×' + h, width: sw };
  };

  /* =============== tracing =============== */
  B.PRESETS = {
    line: { label: 'Çizim (siyah-beyaz)', colors: 2, side: 700, min: 4, tol: 0.5, bw: true },
    logo: { label: 'Logo', colors: 6, side: 450, min: 10, tol: 0.7 },
    detail: { label: 'Ayrıntılı logo', colors: 12, side: 600, min: 5, tol: 0.55 },
    clipart: { label: 'Klipart', colors: 16, side: 560, min: 6, tol: 0.6 },
    photoLow: { label: 'Fotoğraf (düşük kalite)', colors: 10, side: 260, min: 4, tol: 0.9 },
    photoHigh: { label: 'Fotoğraf (yüksek kalite)', colors: 24, side: 520, min: 3, tol: 0.6 },
    quick: { label: 'Hızlı izleme', colors: 8, side: 320, min: 8, tol: 0.9 },
    centerTech: { label: 'Merkez çizgi: teknik çizim', colors: 1, side: 700, min: 6, tol: 0.8, center: true },
    centerSketch: { label: 'Merkez çizgi: eskiz', colors: 1, side: 520, min: 10, tol: 1.4, center: true }
  };
  // Returns a Group of filled curves (outline trace) or stroked lines (centreline trace) placed over the raster.
  B.trace = (raster, o) => {
    if (o.center) return centerline(raster, o);
    const { data, w, h, k } = readPixels(raster, o.side);
    const q = o.bw ? threshold(data, w, h, o.threshold || 128) : quantize(data, o.colors, w, h);
    if (!o.bw && !/^photo/.test(o.preset || '')) foldEdgeBands(q, w, h);
    despeckle(q.idx, w, h, o.min);
    const counts = new Array(q.cents.length).fill(0);
    let border = new Array(q.cents.length).fill(0);
    for (let i = 0; i < w * h; i++) {
      const c = q.idx[i];
      if (c < 0) continue;
      counts[c]++;
      const x = i % w;
      const y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border[c]++;
    }
    // the colour that owns most of the border is the background
    let bg = -1;
    if (o.removeBg) {
      let bv = 0;
      border.forEach((v, c) => {
        if (v > bv) {
          bv = v;
          bg = c;
        }
      });
      if (bv < (2 * (w + h)) * 0.35) bg = -1;
    }
    const order = counts.map((n, c) => [n, c]).filter(([n, c]) => n > 0 && c !== bg).sort((a, b) => b[0] - a[0]);
    const g = new paper.Group({ insert: false });
    // pixel grid → raster local space (centred, 1 unit = 1 source pixel) → page
    const m = new paper.Matrix().translate(-raster.width / 2, -raster.height / 2).scale(1 / k);
    let paths = 0;
    order.forEach(([, c]) => {
      const loops = loopsOf(q.idx, w, h, c);
      const kids = [];
      loops.forEach((L) => {
        const p = loopToPath(L, o.tol);
        if (p) kids.push(p);
      });
      if (!kids.length) return;
      const cp = new paper.CompoundPath({ children: kids, insert: false });
      cp.fillRule = 'evenodd';
      const col = q.cents[c];
      const hex = new paper.Color(col[0] / 255, col[1] / 255, col[2] / 255).toCSS(true);
      cp.fillColor = hex;
      // a hairline of the same colour hides seams between neighbouring colours
      cp.strokeColor = hex;
      cp.strokeWidth = 0.6;
      cp.strokeJoin = 'round';
      cp.transform(m);
      cp.transform(raster.matrix);
      cp.strokeWidth = Math.max(0.15, (0.6 / k) * Math.abs(raster.matrix.scaling.x));
      g.addChild(cp);
      paths += kids.length;
    });
    g.data.label = 'İzlenmiş biteşlem (' + g.children.length + ' renk)';
    return { group: g, colors: g.children.length, paths, size: w + '×' + h };
  };
  const traceDialog = (raster, preset = 'logo') => {
    const st = Object.assign({ preset, removeBg: true, keepOriginal: false }, B.PRESETS[preset]);
    let result = null;
    const clear = () => {
      if (result && result.group.parent) result.group.remove();
      result = null;
    };
    const run = (msg) => {
      clear();
      msg.textContent = 'İzleniyor…';
      return new Promise((res) => setTimeout(() => {
        try {
          const t0 = performance.now();
          result = B.trace(raster, st);
          result.group.insertAbove(raster);
          raster.opacity = 0.25;
          msg.textContent = (st.center ? result.paths + ' çizgi · kalınlık ' + VP.num(VP.toMM(result.width || 0), 2) + ' mm' : result.colors + ' renk, ' + result.paths + ' eğri') + ' · ' + Math.round(performance.now() - t0) + ' ms · Çalışma boyutu ' + result.size + ' piksel';
        } catch (e) {
          console.error(e);
          msg.textContent = 'İzleme başarısız oldu';
        }
        paper.view.update && paper.view.update();
        res();
      }, 30));
    };
    const presetSel = '<label class="field"><span>Tür</span><select id="tr-preset">' + Object.keys(B.PRESETS).map((k) => '<option value="' + k + '"' + (k === st.preset ? ' selected' : '') + '>' + esc(B.PRESETS[k].label) + '</option>').join('') + '</select></label>';
    const md = UI.modal(
      '<h2>Biteşlemi izle</h2>' +
        '<div class="row">' + presetSel + '</div>' +
        '<label class="range"><span class="pb-label">Renk</span><input type="range" id="tr-colors" min="2" max="32" value="' + st.colors + '"><output>' + st.colors + '</output></label>' +
        '<label class="range"><span class="pb-label">Ayrıntı</span><input type="range" id="tr-detail" min="1" max="10" value="6"><output>6</output></label>' +
        '<label class="range"><span class="pb-label">Yumuşatma</span><input type="range" id="tr-smooth" min="1" max="10" value="5"><output>5</output></label>' +
        '<div class="row"><button class="btn on" data-o="removeBg">Arka planı kaldır</button><button class="btn" data-o="keepOriginal">Özgün resmi sakla</button></div>' +
        '<p id="tr-msg">Önizleme için “İzle”ye dokunun. Sonuç resmin üzerine yerleşir.</p>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn" data-x="run">' + ic('bitmap', 'sm') + 'İzle</button><button class="btn primary" data-x="ok">Tamam</button></div>',
      (root, close) => {
        const msg = root.querySelector('#tr-msg');
        const detail = root.querySelector('#tr-detail');
        const smooth = root.querySelector('#tr-smooth');
        const colors = root.querySelector('#tr-colors');
        const applyDetail = () => {
          const base = B.PRESETS[st.preset];
          const d = +detail.value / 6;
          st.side = Math.round(Math.min(900, base.side * d));
          st.min = Math.max(1, Math.round(base.min / d));
          st.tol = base.tol * (+smooth.value / 5);
        };
        root.querySelector('#tr-preset').addEventListener('change', (e) => {
          st.preset = e.target.value;
          delete st.center;
          delete st.bw;
          Object.assign(st, B.PRESETS[st.preset]);
          colors.value = st.colors;
          colors.nextElementSibling.textContent = st.colors;
          colors.disabled = !!(st.bw || st.center);
          applyDetail();
        });
        colors.disabled = !!(st.bw || st.center);
        [colors, detail, smooth].forEach((r) => r.addEventListener('input', () => {
          r.nextElementSibling.textContent = r.value;
          st.colors = +colors.value;
          applyDetail();
        }));
        applyDetail();
        root.addEventListener('click', async (e) => {
          const o = e.target.closest('[data-o]');
          if (o) {
            st[o.dataset.o] = !st[o.dataset.o];
            o.classList.toggle('on', st[o.dataset.o]);
            return;
          }
          const b = e.target.closest('[data-x]');
          if (!b) return;
          const x = b.dataset.x;
          if (x === 'run') return run(msg);
          if (x === 'no') {
            clear();
            raster.opacity = 1;
            return close();
          }
          if (!result) await run(msg);
          if (!result || !result.colors) {
            raster.opacity = 1;
            return close();
          }
          raster.opacity = 1;
          if (!st.keepOriginal) raster.remove();
          VP.setSelection([result.group]);
          VP.commit();
          VP.toast('Biteşlem izlendi: ' + result.colors + ' renk · Renkleri ayrı düzenlemek için grubu çözün');
          close();
        });
      }
    );
    // closing with Esc or the scrim leaves the preview behind; clean it up
    const wrap = md && md.root && md.root.parentElement;
    if (wrap) {
      new MutationObserver((ms, obs) => {
        if (!wrap.isConnected) {
          obs.disconnect();
          if (result && result.group.parent && !VP.sel.includes(result.group)) {
            clear();
            raster.opacity = 1;
          }
        }
      }).observe(document.body, { childList: true });
    }
  };
  const quickTrace = (preset, dialog) => () => {
    const r = VP.sel.find((it) => it instanceof paper.Raster);
    if (!r) return VP.toast('Önce bir biteşlem (resim) seçin · Dosya › İçe aktar ile resim ekleyebilirsiniz');
    if (!preset || dialog) return traceDialog(r, preset || 'logo');
    VP.toast('İzleniyor…');
    setTimeout(() => {
      const res = B.trace(r, Object.assign({ removeBg: true, preset }, B.PRESETS[preset]));
      res.group.insertAbove(r);
      r.remove();
      VP.setSelection([res.group]);
      VP.commit();
      VP.toast('Biteşlem izlendi: ' + res.colors + ' renk');
    }, 30);
  };

  /* =============== print separations =============== */
  // Renders the page and splits it into cyan, magenta, yellow and black ink plates.
  const PLATES = [['c', 'Camgöbeği (C)', '#00a0e3'], ['m', 'Macenta (M)', '#e5007e'], ['y', 'Sarı (Y)', '#ffed00'], ['k', 'Siyah (K)', '#1d1d1b']];
  B.separate = (dpi) => {
    VP.storePage();
    const p = VP.page();
    const g = VP.composePageGroup({ white: true, res: dpi });
    const r = g.rasterize(dpi, false);
    const src = r.canvas;
    const w = src.width;
    const h = src.height;
    const px = src.getContext('2d').getImageData(0, 0, w, h).data;
    const out = {};
    PLATES.forEach(([k]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      out[k] = { cv: c, ctx: c.getContext('2d'), img: null, cover: 0 };
      out[k].img = out[k].ctx.createImageData(w, h);
    });
    const N = w * h;
    const Dc = out.c.img.data;
    const Dm = out.m.img.data;
    const Dy = out.y.img.data;
    const Dk = out.k.img.data;
    let sc = 0;
    let sm = 0;
    let sy = 0;
    let sk = 0;
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      const R = px[o] / 255;
      const G = px[o + 1] / 255;
      const Bb = px[o + 2] / 255;
      const K = 1 - Math.max(R, G, Bb);
      const d = 1 - K || 1;
      const c = (1 - R - K) / d;
      const m = (1 - G - K) / d;
      const y = (1 - Bb - K) / d;
      Dc[o] = Dc[o + 1] = Dc[o + 2] = 255 - c * 255;
      Dm[o] = Dm[o + 1] = Dm[o + 2] = 255 - m * 255;
      Dy[o] = Dy[o + 1] = Dy[o + 2] = 255 - y * 255;
      Dk[o] = Dk[o + 1] = Dk[o + 2] = 255 - K * 255;
      Dc[o + 3] = Dm[o + 3] = Dy[o + 3] = Dk[o + 3] = 255;
      sc += c;
      sm += m;
      sy += y;
      sk += K;
    }
    out.c.cover = sc;
    out.m.cover = sm;
    out.y.cover = sy;
    out.k.cover = sk;
    PLATES.forEach(([k]) => {
      out[k].ctx.putImageData(out[k].img, 0, 0);
      out[k].cover = Math.round((out[k].cover / N) * 100);
    });
    return { plates: out, page: p, dpi };
  };
  const sepPDF = async (sep) => {
    const lib = window.jspdf;
    if (!lib) return VP.toast('PDF kütüphanesi yüklenemedi');
    const p = sep.page;
    const m = VP.toPT(12);
    const W = p.w + m * 2;
    const Hh = p.h + m * 2;
    const pdf = new lib.jsPDF({ unit: 'pt', format: [W, Hh], orientation: W > Hh ? 'landscape' : 'portrait', compress: true });
    try {
      if (window.VP_FONTS) {
        pdf.addFileToVFS('FiraSans-Regular.ttf', window.VP_FONTS.regular);
        pdf.addFont('FiraSans-Regular.ttf', 'Fira Sans', 'normal');
        pdf.setFont('Fira Sans', 'normal');
      }
    } catch (e) { /* standard font */ }
    PLATES.forEach(([k, name], i) => {
      if (i) pdf.addPage([W, Hh], W > Hh ? 'landscape' : 'portrait');
      pdf.addImage(sep.plates[k].cv.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, p.w, p.h);
      // crop and registration marks
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.4);
      const L = VP.toPT(6);
      [[m, m], [m + p.w, m], [m, m + p.h], [m + p.w, m + p.h]].forEach(([x, y]) => {
        const sx = x === m ? -1 : 1;
        const sy = y === m ? -1 : 1;
        pdf.line(x + sx * 2, y, x + sx * (2 + L), y);
        pdf.line(x, y + sy * 2, x, y + sy * (2 + L));
      });
      [[W / 2, m / 2], [W / 2, Hh - m / 2]].forEach(([x, y]) => {
        pdf.circle(x, y, 4, 'S');
        pdf.line(x - 7, y, x + 7, y);
        pdf.line(x, y - 7, x, y + 7);
      });
      pdf.setFontSize(7);
      pdf.text(VP.doc.name + ' · ' + p.name + ' · ' + name + ' · kapsama %' + sep.plates[k].cover, m, Hh - 6);
    });
    const buf = pdf.output('arraybuffer');
    return VP.io.saveFile(VP.io.safeName() + '-ayrimlar.pdf', new Blob([buf], { type: 'application/pdf' }));
  };
  const separations = () => {
    let sep;
    try {
      sep = B.separate(110);
    } catch (e) {
      console.error(e);
      return VP.toast('Ayrımlar oluşturulamadı');
    }
    const thumbs = PLATES.map(([k, name, col]) => '<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:4px"><img alt="' + esc(name) + ' plakası" src="' + sep.plates[k].cv.toDataURL('image/png') + '" style="width:100%;max-width:150px;background:#fff;border:1px solid var(--line)"><figcaption style="font-size:12.5px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + col + ';margin-right:5px"></span>' + esc(name) + ' · %' + sep.plates[k].cover + '</figcaption></figure>').join('');
    UI.modal(
      '<h2>Baskı ayrımları</h2><p>' + esc(VP.page().name) + ' sayfası dört mürekkep plakasına ayrıldı. Koyu alanlar mürekkep basılan yerlerdir; yüzde, plakanın ortalama kapsamasıdır.</p>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">' + thumbs + '</div>' +
        '<p>Renk dönüşümü basit bir RGB → CMYK hesabıdır; matbaa için renk profiliyle doğrulayın.</p>' +
        '<div class="actions"><button class="btn" data-x="no">Kapat</button><button class="btn primary" data-x="pdf">' + ic('pdf', 'sm') + 'Plakaları PDF olarak kaydet</button></div>',
      (root, close) => root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'pdf') {
          b.disabled = true;
          b.textContent = 'Hazırlanıyor…';
          try {
            await sepPDF(B.separate(300));
          } catch (err) {
            console.error(err);
            VP.toast('PDF oluşturulamadı');
          }
        }
        close();
      })
    );
  };
  B.separationsPDF = (dpi) => sepPDF(B.separate(dpi || 300));

  Object.assign(A, {
    traceOutline: { label: 'Anahat izleme…', icon: 'bitmap', run: quickTrace(null), enabled: () => VP.sel.some((it) => it instanceof paper.Raster) },
    traceQuick: { label: 'Hızlı izleme', run: quickTrace('quick'), enabled: () => VP.sel.some((it) => it instanceof paper.Raster) },
    traceLogo: { label: 'Logo olarak izle', run: quickTrace('logo'), enabled: () => VP.sel.some((it) => it instanceof paper.Raster) },
    traceLine: { label: 'Çizim olarak izle (siyah-beyaz)', run: quickTrace('line'), enabled: () => VP.sel.some((it) => it instanceof paper.Raster) },
    traceCenter: { label: 'Merkez çizgi izleme…', icon: 'bitmap', run: quickTrace('centerTech', true), enabled: () => VP.sel.some((it) => it instanceof paper.Raster) },
    separations: { label: 'Baskı ayrımları…', icon: 'layers', run: separations }
  });
  // a selected bitmap offers tracing right on the property bar
  UI.selExtras = UI.selExtras || [];
  UI.selExtras.push((s, one) => (one instanceof paper.Raster ? H.sep + H.btn('traceOutline', ic('bitmap', 'sm') + 'Biteşlemi izle', 'Resmi vektör şekillere çevir', 'primary') + H.btn('traceQuick', 'Hızlı izleme', 'Varsayılan ayarlarla izle') : ''));
  const M = UI.MENUS;
  M.bitmaps = ['toBitmap', '|', 'h:İzleme', 'traceQuick', 'traceCenter', 'traceOutline', 'traceLogo', 'traceLine', '|', 'h:Mod', 'bmpGray', 'bmpBW', 'bmpInvert', '|', 'bmpAdjust'];
  const fi = M.file.indexOf('docProps');
  if (fi >= 0 && !M.file.includes('separations')) M.file.splice(fi, 0, 'separations', '|');
})();
