/* VektörPad special fills: conical and square gradients, two-colour vector patterns and procedural textures.
   The drawing engine only fills with flat colours and linear/radial gradients, so these fills are a live
   effect (data.effect.type = 'fillfx'): the content is generated and clipped by the shape, and rebuilt when
   a setting changes. Patterns stay vector; gradients and textures are generated images. */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const mm = H.mm;
  const Q = (VP.fillfx = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoom = () => paper.view.zoom;
  const acc = () => new paper.Color(VP.colors.accent);

  Q.KINDS = { conical: 'Konik', square: 'Kare', pattern: 'Desen', texture: 'Doku' };
  Q.PATTERNS = {
    dots: 'Noktalar', stripes: 'Çizgiler', grid: 'Kareli', diagCross: 'Çapraz kareli', checker: 'Dama',
    brick: 'Tuğla', zigzag: 'Zikzak', waves: 'Dalga', hex: 'Petek', scales: 'Pul',
    circles: 'Halkalar', crosses: 'Artılar', triangles: 'Üçgenler', stars: 'Yıldızlar', diamonds: 'Baklava', weave: 'Örgü'
  };
  Q.TEXTURES = { clouds: 'Bulut', marble: 'Mermer', wood: 'Ahşap', granite: 'Granit', water: 'Su', paper: 'Kâğıt', leather: 'Deri' };
  FX.NAMES.fillfx = 'Özel dolgu';
  VP.KIND_NAMES.fillfx = 'Özel dolgu';
  const src = (g) => g.children.find((c) => c.data.effectSrc);
  const rgb = (hex) => {
    const c = new paper.Color(hex || '#ffffff').convert('rgb');
    return [c.red * 255, c.green * 255, c.blue * 255];
  };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  /* =============== noise =============== */
  const hash = (x, y, s) => {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const vnoise = (x, y, s) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi, s);
    const b = hash(xi + 1, yi, s);
    const c = hash(xi, yi + 1, s);
    const d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, s, oct) => {
    let t = 0;
    let amp = 0.5;
    let f = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      t += amp * vnoise(x * f, y * f, s + i * 17);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return t / norm;
  };
  const worley = (x, y, s) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let d1 = 9;
    let d2 = 9;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i + hash(xi + i, yi + j, s);
        const cy = yi + j + hash(xi + i, yi + j, s + 91);
        const d = (cx - x) ** 2 + (cy - y) ** 2;
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
    }
    return [Math.sqrt(d1), Math.sqrt(d2)];
  };
  // Returns 0..1 for a texture at feature-space coordinates.
  const texture = (kind, x, y, s, oct) => {
    switch (kind) {
      case 'marble': return 0.5 + 0.5 * Math.sin(x * 2.2 + 6 * fbm(x * 0.6, y * 0.6, s, oct));
      case 'wood': {
        const r = Math.sqrt(x * x * 0.08 + y * y) * 2.5 + 2.2 * fbm(x * 0.4, y * 0.4, s, oct);
        return Math.pow(r - Math.floor(r), 0.7);
      }
      case 'granite': {
        const n = fbm(x * 3, y * 3, s, oct);
        return n > 0.58 ? 1 : n < 0.4 ? 0 : (n - 0.4) / 0.18 * 0.5;
      }
      case 'water': return Math.pow(1 - Math.abs(2 * fbm(x, y * 1.6, s, oct) - 1), 3);
      case 'paper': return 0.55 + 0.45 * (fbm(x * 6, y * 6, s, oct) - 0.5) * 2 * 0.6;
      case 'leather': {
        const [d1, d2] = worley(x * 1.4, y * 1.4, s);
        return clamp((d2 - d1) * 2.4, 0, 1) * (0.8 + 0.2 * fbm(x * 4, y * 4, s + 3, 2));
      }
      default: return fbm(x, y, s, oct);
    }
  };

  /* =============== content builders =============== */
  // Bitmap content (gradients, textures) over the box, in the group's local space.
  const imageContent = (fx, box) => {
    const res = Math.min(3, (fx.kind === 'texture' ? 520 : 600) / Math.max(box.width, box.height));
    const w = Math.max(2, Math.ceil(box.width * res));
    const h = Math.max(2, Math.ceil(box.height * res));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const D = img.data;
    const c0 = rgb(fx.c0);
    const c1 = rgb(fx.c1);
    const cx = box.left + box.width * fx.cx;
    const cy = box.top + box.height * fx.cy;
    const a = ((fx.angle || 0) * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const R = Math.max(box.width, box.height) / 2 || 1;
    const feat = Math.max(1, fx.size || VP.toPT(20));
    const oct = clamp(Math.round(fx.detail || 4), 1, 7);
    const seed = fx.seed || 1;
    for (let j = 0; j < h; j++) {
      const py = box.top + (j + 0.5) / res;
      for (let i = 0; i < w; i++) {
        const px = box.left + (i + 0.5) / res;
        const dx = px - cx;
        const dy = py - cy;
        let t;
        if (fx.kind === 'conical') {
          t = (Math.atan2(dy, dx) - a) / (2 * Math.PI);
          t -= Math.floor(t);
          if (fx.mirror) t = 1 - Math.abs(2 * t - 1);
        } else if (fx.kind === 'square') {
          const rx = dx * ca + dy * sa;
          const ry = -dx * sa + dy * ca;
          t = clamp(Math.max(Math.abs(rx), Math.abs(ry)) / R, 0, 1);
        } else {
          const rx = (dx * ca + dy * sa) / feat;
          const ry = (-dx * sa + dy * ca) / feat;
          t = clamp(texture(fx.texture, rx, ry, seed, oct), 0, 1);
        }
        const c = mix(c0, c1, t);
        const o = (j * w + i) * 4;
        D[o] = c[0];
        D[o + 1] = c[1];
        D[o + 2] = c[2];
        D[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const r = new paper.Raster({ insert: false });
    r.setImage(cv);
    r.scale(1 / res);
    r.position = box.center;
    return r;
  };
  // Two-colour vector pattern covering the box (rotated about its centre).
  const patternContent = (fx, box) => {
    const g = new paper.Group({ insert: false });
    const c = box.center;
    const R = Math.sqrt(box.width * box.width + box.height * box.height) / 2 + 2;
    let s = Math.max(1, fx.size || VP.toPT(4));
    while ((2 * R / s) ** 2 > 7000) s *= 1.25;
    const lw = clamp(fx.lw || 0.3, 0.05, 0.95) * s;
    if (fx.c1) g.addChild(new paper.Path.Rectangle({ rectangle: box.expand(2), fillColor: fx.c1, insert: false }));
    const kids = [];
    const n = Math.ceil(R / s) + 1;
    const rect = (x, y, w, h) => kids.push(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(x, y, w, h), insert: false }));
    const L = -n * s;
    const span = 2 * n * s;
    switch (fx.pattern) {
      case 'stripes':
        for (let i = -n; i <= n; i++) rect(L, i * s - lw / 2, span, lw);
        break;
      case 'grid':
        for (let i = -n; i <= n; i++) {
          rect(L, i * s - lw / 4, span, lw / 2);
          rect(i * s - lw / 4, L, lw / 2, span);
        }
        break;
      case 'diagCross':
        for (let i = -n * 2; i <= n * 2; i++) {
          const d = i * s;
          [1, -1].forEach((k) => kids.push(new paper.Path({ segments: [[L, d + k * L - lw / 3], [-L, d - k * L - lw / 3], [-L, d - k * L + lw / 3], [L, d + k * L + lw / 3]], closed: true, insert: false })));
        }
        break;
      case 'checker':
        for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) if ((i + j) % 2 === 0) rect(i * s, j * s, s, s);
        break;
      case 'brick':
        for (let j = -n; j < n; j++) {
          rect(L, j * s, span, lw / 3);
          for (let i = -n; i < n; i++) rect(i * s * 2 + (j % 2 ? s : 0), j * s, lw / 3, s);
        }
        break;
      case 'zigzag':
        for (let j = -n; j <= n; j++) {
          const top = [];
          const bot = [];
          for (let i = -n; i <= n; i++) {
            const y = j * s + (i % 2 ? s * 0.35 : -s * 0.35);
            top.push(Pt(i * s * 0.6, y - lw / 2));
            bot.push(Pt(i * s * 0.6, y + lw / 2));
          }
          kids.push(new paper.Path({ segments: top.concat(bot.reverse()), closed: true, insert: false }));
        }
        break;
      case 'waves':
        for (let j = -n; j <= n; j++) {
          const top = [];
          const bot = [];
          for (let i = -n * 4; i <= n * 4; i++) {
            const x = (i * s) / 4;
            const y = j * s + Math.sin((i * Math.PI) / 4) * s * 0.25;
            top.push(Pt(x, y - lw / 2));
            bot.push(Pt(x, y + lw / 2));
          }
          kids.push(new paper.Path({ segments: top.concat(bot.reverse()), closed: true, insert: false }));
        }
        break;
      case 'hex': {
        const r = s / 2;
        const hw = r * Math.sqrt(3);
        for (let j = -n; j <= n; j++) {
          for (let i = -n; i <= n; i++) {
            const x = i * hw + (j % 2 ? hw / 2 : 0);
            const y = j * r * 1.5;
            // even-odd filling turns each pair into a ring
            kids.push(new paper.Path.RegularPolygon({ center: [x, y], sides: 6, radius: r, insert: false }), new paper.Path.RegularPolygon({ center: [x, y], sides: 6, radius: Math.max(0.1, r - lw / 2), insert: false }));
          }
        }
        break;
      }
      case 'scales':
        for (let j = -n; j <= n; j++) {
          for (let i = -n; i <= n; i++) {
            const x = i * s + (j % 2 ? s / 2 : 0);
            const y = j * s * 0.5;
            kids.push(new paper.Path.Circle({ center: [x, y], radius: s / 2, insert: false }), new paper.Path.Circle({ center: [x, y], radius: Math.max(0.1, s / 2 - lw / 2), insert: false }));
          }
        }
        break;
      case 'circles':
        for (let j = -n; j <= n; j++) {
          for (let i = -n; i <= n; i++) {
            const x = i * s;
            const y = j * s;
            [0.46, 0.46 - lw / s / 2, 0.24, Math.max(0.02, 0.24 - lw / s / 2)].forEach((k) => kids.push(new paper.Path.Circle({ center: [x, y], radius: s * k, insert: false })));
          }
        }
        break;
      case 'crosses':
        for (let j = -n; j <= n; j++) {
          for (let i = -n; i <= n; i++) {
            const x = i * s + (j % 2 ? s / 2 : 0);
            const y = j * s;
            rect(x - s * 0.3, y - lw / 4, s * 0.6, lw / 2);
            rect(x - lw / 4, y - s * 0.3, lw / 2, s * 0.6);
          }
        }
        break;
      case 'triangles':
        for (let j = -n; j <= n; j++) {
          for (let i = -n; i <= n; i++) {
            const x = i * s + (j % 2 ? s / 2 : 0);
            const y = j * s * 0.866;
            const r = s * clamp(0.2 + (fx.lw || 0.3) * 0.5, 0.15, 0.6);
            kids.push(new paper.Path.RegularPolygon({ center: [x, y], sides: 3, radius: r, insert: false }));
          }
        }
        break;
      case 'stars':
        for (let j = -n; j <= n; j++) {
          for (let i = -n; i <= n; i++) {
            const r = s * clamp(0.2 + (fx.lw || 0.3) * 0.5, 0.15, 0.6);
            kids.push(new paper.Path.Star({ center: [i * s + (j % 2 ? s / 2 : 0), j * s], points: 5, radius1: r, radius2: r * 0.42, insert: false }));
          }
        }
        break;
      case 'diamonds':
        for (let j = -n; j <= n; j++) {
          for (let i = -n; i <= n; i++) {
            const x = i * s + (j % 2 ? s / 2 : 0);
            const y = (j * s) / 2;
            const r = (s / 2) * clamp(0.3 + (fx.lw || 0.3), 0.3, 0.98);
            kids.push(new paper.Path({ segments: [[x, y - r / 2], [x + r, y], [x, y + r / 2], [x - r, y]], closed: true, insert: false }));
          }
        }
        break;
      case 'weave':
        for (let j = -n; j < n; j++) {
          for (let i = -n; i < n; i++) {
            const x = i * s;
            const y = j * s;
            if ((i + j) % 2 === 0) for (let k = 0; k < 3; k++) rect(x, y + (s / 3) * k + s / 12, s, s / 6 + lw / 6);
            else for (let k = 0; k < 3; k++) rect(x + (s / 3) * k + s / 12, y, s / 6 + lw / 6, s);
          }
        }
        break;
      default:
        for (let i = -n; i <= n; i++) {
          for (let j = -n; j <= n; j++) kids.push(new paper.Path.Circle({ center: [i * s + (j % 2 ? s / 2 : 0), j * s * 0.866], radius: lw / 2, insert: false }));
        }
    }
    const cp = new paper.CompoundPath({ children: kids, insert: false });
    cp.fillRule = fx.pattern === 'hex' || fx.pattern === 'scales' || fx.pattern === 'circles' ? 'evenodd' : 'nonzero';
    cp.fillColor = fx.c0;
    cp.rotate(fx.angle || 0, Pt(0, 0));
    cp.translate(c);
    g.addChild(cp);
    return g;
  };

  Q.build = (g) => {
    const fx = g.data.effect;
    const s = src(g);
    if (!s) return;
    g.children.slice().forEach((c) => c !== s && c.remove());
    const box = s.bounds.expand(1);
    if (!(box.width > 0.5 && box.height > 0.5)) return;
    const content = fx.kind === 'pattern' ? patternContent(fx, box) : imageContent(fx, box);
    const mask = s.clone({ insert: false });
    mask.data = {};
    mask.fillColor = '#000000';
    mask.strokeColor = null;
    mask.shadowColor = null;
    const clip = new paper.Group({ insert: false });
    clip.addChild(mask);
    clip.addChild(content);
    clip.clipped = true;
    clip.data.fillClip = true;
    clip.insertBelow(s);
  };
  // shared with the pattern/texture transparency effect
  Q.imageContent = imageContent;
  Q.patternContent = patternContent;
  const DEF = {
    conical: { c0: '#1461b2', c1: '#ffffff', angle: 0, mirror: false },
    square: { c0: '#ffffff', c1: '#1461b2', angle: 0 },
    pattern: { c0: '#1d1d1b', c1: '#ffffff', pattern: 'dots', size: VP.toPT(4), lw: 0.35, angle: 0 },
    texture: { c0: '#2d2e83', c1: '#a6d8f0', texture: 'clouds', size: VP.toPT(18), detail: 5, seed: 7, angle: 0 }
  };
  const solidHex = (c) => (c ? VP.hex(c) : null);
  // Turns plain shapes into special-fill groups (or changes the kind of existing ones).
  Q.apply = (items, kind) => {
    const out = [];
    let skipped = 0;
    items.forEach((it) => {
      const fx0 = FX.of(it);
      if (fx0 && fx0.type === 'fillfx') {
        if (fx0.kind !== kind) Object.assign(fx0, DEF[kind], { c0: fx0.c0, c1: fx0.c1 || DEF[kind].c1 }, { kind });
        Q.build(it);
        out.push(it);
        return;
      }
      if (!VP.isPathItem(it) || FX.isFx(it) || (it instanceof paper.Path && !it.closed)) {
        skipped++;
        out.push(it);
        return;
      }
      const base = solidHex(it.fillColor && it.fillColor.type === 'gradient' ? it.fillColor.gradient.stops[0].color : it.fillColor);
      const g = new paper.Group({ insert: false, applyMatrix: false });
      g.insertAbove(it);
      g.data.effect = Object.assign({ type: 'fillfx', kind, cx: 0.5, cy: 0.5, origFill: it.fillColor ? it.exportJSON({ asString: true }) : null }, DEF[kind]);
      if (base && kind !== 'pattern') g.data.effect.c0 = base;
      if (base && kind === 'pattern') g.data.effect.c0 = base;
      g.addChild(it);
      it.data.effectSrc = true;
      it.fillColor = null;
      Q.build(g);
      out.push(g);
    });
    VP.setSelection(out);
    VP.commit();
    VP.toast(Q.KINDS[kind] + ' dolgu uygulandı' + (skipped ? ' · ' + skipped + ' nesne atlandı (kapalı şekil gerekir)' : ''));
    return out;
  };
  // Back to an ordinary shape: flat, linear or radial fill types (or none).
  Q.unwrap = (g) => {
    const fx = g.data.effect;
    const s = src(g);
    if (!s) return g;
    s.fillColor = fx.c0;
    delete s.data.effectSrc;
    s.transform(g.matrix);
    s.insertAbove(g);
    g.remove();
    return s;
  };
  // Hook for the Properties docker: true when the click was a special kind (or left one).
  Q.handleKind = (items, kind) => {
    if (!items) return false;
    if (Q.KINDS[kind]) {
      Q.apply(items, kind);
      return true;
    }
    const fxs = items.filter((it) => FX.of(it) && FX.of(it).type === 'fillfx');
    if (!fxs.length) return false;
    const plain = items.map((it) => (fxs.includes(it) ? Q.unwrap(it) : it));
    VP.setSelection(plain);
    return false; // the docker then applies the ordinary fill type to the unwrapped shapes
  };

  FX.TYPES.fillfx = {
    tool: 'fillTool',
    build: (g) => Q.build(g),
    probe(g) {
      const fx = g.data.effect;
      const p = src(g).clone({ insert: false });
      p.fillColor = fx.c0;
      return p;
    },
    restyle(g, fn) {
      const fx = g.data.effect;
      const s = src(g);
      const p = s.clone({ insert: false });
      p.fillColor = fx.c0;
      fn([p]);
      const f = p.fillColor;
      if (f && f.type === 'gradient') {
        fx.c0 = VP.hex(f.gradient.stops[0].color);
        fx.c1 = VP.hex(f.gradient.stops[f.gradient.stops.length - 1].color);
      } else if (f) fx.c0 = VP.hex(f);
      s.strokeColor = p.strokeColor;
      s.strokeWidth = p.strokeWidth;
      s.dashArray = p.dashArray;
      s.data.dash = p.data.dash;
      Q.build(g);
    },
    describe: (g) => {
      const fx = g.data.effect;
      return Q.KINDS[fx.kind] + ' dolgu' + (fx.kind === 'pattern' ? ': ' + Q.PATTERNS[fx.pattern] : fx.kind === 'texture' ? ': ' + Q.TEXTURES[fx.texture] : '');
    },
    bake(g) {
      const s = src(g);
      if (s && !s.strokeColor) s.remove();
    },
    bakeMsg: 'Özel dolgu ayrıldı · Kırpılmış bir grup oldu',
    clear(g) {
      const fx = g.data.effect;
      const s = src(g);
      if (!s) {
        g.remove();
        return [];
      }
      if (fx.origFill) {
        const h = new paper.Group({ insert: false });
        s.fillColor = h.importJSON(fx.origFill).fillColor;
      } else s.fillColor = fx.c0;
      delete s.data.effectSrc;
      s.transform(g.matrix);
      s.insertAbove(g);
      g.remove();
      return [s];
    },
    clearMsg: 'Özel dolgu kaldırıldı',
    dblTap(g) {
      VP.setSelection([g]);
      UI.openDock('props');
    },
    fields: (g) => fields(g, false),
    panel: (g) => fields(g, true)
  };

  /* =============== controls =============== */
  const seg = (items, cur, prefix) => '<span class="seg">' + items.map(([v, l]) => '<button data-act="' + prefix + v + '" class="' + (String(v) === String(cur) ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const select = (label, name, map, cur) => '<label class="field"><span>' + esc(label) + '</span><select data-pf="' + name + '" aria-label="' + esc(label) + '">' + Object.keys(map).map((k) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(map[k]) + '</option>').join('') + '</select></label>';
  const fields = (g, panel) => {
    const fx = g.data.effect;
    const f = panel ? H.dfieldPf : H.field;
    const row = (x) => (panel ? '<div class="row">' + x + '</div>' : x);
    let h = panel ? '' : '<span class="pb-label">' + esc(Q.KINDS[fx.kind]) + ' dolgu</span>';
    h += row(seg(Object.keys(Q.KINDS).map((k) => [k, Q.KINDS[k]]), fx.kind, 'ffKind:'));
    if (fx.kind === 'pattern') h += row(select('Desen', 'ffPattern', Q.PATTERNS, fx.pattern));
    if (fx.kind === 'texture') h += row(select('Doku', 'ffTexture', Q.TEXTURES, fx.texture));
    h += row(H.colorField(fx.kind === 'pattern' ? 'Desen' : fx.kind === 'texture' ? 'Renk 1' : 'Başlangıç', 'ffC0', fx.c0) + H.colorField(fx.kind === 'pattern' ? 'Zemin' : fx.kind === 'texture' ? 'Renk 2' : 'Bitiş', 'ffC1', fx.c1 || '#ffffff') + H.btn('ffSwap', 'Değiştir', 'Renkleri değiştir'));
    if (fx.kind === 'pattern') h += row(H.btn('ffNoBg', 'Zeminsiz', 'Zemin rengini kaldır (saydam)'));
    if (fx.kind === 'pattern' || fx.kind === 'texture') h += row(f('Boyut', 'ffSize', mm(fx.size, 1)) + (fx.kind === 'pattern' ? f('Kalınlık', 'ffLw', Math.round(fx.lw * 100), '%') : f('Ayrıntı', 'ffDetail', fx.detail, '')));
    h += row(f('Açı', 'ffAngle', VP.num(fx.angle || 0, 0), '°') + (fx.kind === 'conical' ? H.tog('ffMirror', 'Yansıt', !!fx.mirror, 'Renkler iki yöne yansısın (dikişsiz)') : '') + (fx.kind === 'texture' ? H.btn('ffSeed', 'Yeni desen', 'Rastgele yeni bir doku üret') : ''));
    if (fx.kind === 'conical' || fx.kind === 'square') h += row('<span class="pb-label">Merkez ve açı: Etkileşimli dolgu aracıyla sürükleyin</span>');
    if (!panel) h += H.btn('fxMenu', 'Efekt ▾', 'Ayır veya kaldır');
    return h;
  };
  const target = () => (VP.sel.length === 1 && FX.of(VP.sel[0]) && FX.of(VP.sel[0]).type === 'fillfx' ? VP.sel[0] : null);
  const done = (g) => {
    Q.build(g);
    VP.commit();
    VP.drawOverlay();
  };
  Q.propField = (name, raw) => {
    const g = target();
    if (!g) return true;
    const fx = g.data.effect;
    const v = VP.parseNum(raw);
    const hex = UI.normHex(raw);
    switch (name) {
      case 'ffPattern': if (Q.PATTERNS[raw]) fx.pattern = raw; break;
      case 'ffTexture': if (Q.TEXTURES[raw]) fx.texture = raw; break;
      case 'ffC0': if (!hex) return true; fx.c0 = hex; break;
      case 'ffC1': if (!hex) return true; fx.c1 = hex; break;
      case 'ffSize': if (!(v > 0)) return true; fx.size = VP.toPT(clamp(v, 0.3, 500)); break;
      case 'ffLw': if (!(v > 0)) return true; fx.lw = clamp(v / 100, 0.05, 0.95); break;
      case 'ffDetail': if (!(v >= 1)) return true; fx.detail = clamp(Math.round(v), 1, 7); break;
      case 'ffAngle': if (!isFinite(v)) return true; fx.angle = VP.norm(v); break;
      default: return false;
    }
    done(g);
    return true;
  };
  Q.act = (id) => {
    const [k, arg] = id.split(':');
    if (k === 'ffKind') {
      const g = target();
      if (g) Q.apply([g], arg);
      return true;
    }
    const g = target();
    if (!g) return true;
    const fx = g.data.effect;
    switch (k) {
      case 'ffSwap': [fx.c0, fx.c1] = [fx.c1 || '#ffffff', fx.c0]; break;
      case 'ffNoBg': fx.c1 = null; break;
      case 'ffMirror': fx.mirror = !fx.mirror; break;
      case 'ffSeed': fx.seed = 1 + Math.floor(Math.random() * 9999); break;
      default: return false;
    }
    done(g);
    return true;
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^ff/.test(n) ? Q.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^ff/.test(id) ? Q.act(id, el) : act0(id, el));

  /* =============== interactive fill tool on special fills =============== */
  // Dragging on a conical/square fill sets its centre and angle; on a pattern or texture, the angle.
  const T = VP.tools.fillTool;
  const down0 = T.down;
  const move0 = T.move;
  const up0 = T.up;
  const after0 = T.overlayAfter;
  T.down = function (e) {
    const hit = VP.hitItem(e.point);
    const g = hit && FX.of(hit) && FX.of(hit).type === 'fillfx' ? hit : null;
    if (g) {
      if (!VP.sel.includes(g) || VP.sel.length !== 1) VP.setSelection([g]);
      this.op = { type: 'ffx', g, start: e.point, changed: false };
      return;
    }
    return down0.call(this, e);
  };
  T.move = function (e) {
    const op = this.op;
    if (op && op.type === 'ffx') {
      if (!op.changed && op.start.getDistance(e.point) * zoom() < 6) return;
      const fx = op.g.data.effect;
      const s = src(op.g);
      const b = s.bounds;
      const ls = op.g.globalToLocal(op.start);
      const le = op.g.globalToLocal(e.point);
      if (fx.kind === 'conical' || fx.kind === 'square') {
        fx.cx = clamp((ls.x - b.left) / (b.width || 1), -0.5, 1.5);
        fx.cy = clamp((ls.y - b.top) / (b.height || 1), -0.5, 1.5);
      }
      fx.angle = Math.round(le.subtract(ls).angle);
      op.changed = true;
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        if (op.g.parent) Q.build(op.g);
        VP.drawOverlay();
      });
      return;
    }
    return move0.call(this, e);
  };
  T.up = function (e) {
    const op = this.op;
    if (op && op.type === 'ffx') {
      this.op = null;
      if (this._raf) {
        cancelAnimationFrame(this._raf);
        this._raf = 0;
      }
      if (op.changed) {
        Q.build(op.g);
        VP.commit();
        UI.schedule('prop', 'dock');
      }
      return;
    }
    return up0.call(this, e);
  };
  T.overlayAfter = function (L) {
    const g = target();
    if (!g) return after0.call(this, L);
    const fx = g.data.effect;
    const b = src(g).bounds;
    const s = 1 / zoom();
    const c = g.localToGlobal(Pt(b.left + b.width * fx.cx, b.top + b.height * fx.cy));
    const a = Pt(Math.max(b.width, b.height) * 0.4, 0).rotate(fx.angle || 0);
    const e = g.localToGlobal(Pt(b.left + b.width * fx.cx, b.top + b.height * fx.cy).add(a));
    L.addChild(new paper.Path.Line({ from: c, to: e, strokeColor: acc(), strokeWidth: 1.4 * s, dashArray: [5 * s, 3 * s], insert: false }));
    L.addChild(new paper.Path.Circle({ center: c, radius: 5 * s, fillColor: fx.c0, strokeColor: acc(), strokeWidth: 1.5 * s, insert: false }));
    L.addChild(new paper.Path.Circle({ center: e, radius: 4 * s, fillColor: '#ffffff', strokeColor: acc(), strokeWidth: 1.5 * s, insert: false }));
  };
  // the fill tool's type selector gains the special kinds
  const fpb = VP.fill.propbar;
  VP.fill.propbar = () => {
    const h = fpb();
    if (VP.toolId !== 'fillTool') return h;
    const g = target();
    if (g) return '<span class="pb-title">Etkileşimli dolgu</span>' + fields(g, false);
    return h && h.replace(/(<button data-act="flType:radial"[^>]*>Dairesel<\/button>)/, '$1' + Object.keys(Q.KINDS).map((k) => '<button data-act="ffApply:' + k + '">' + Q.KINDS[k] + '</button>').join(''));
  };
  const act1 = VP.tx.act;
  VP.tx.act = (id, el) => {
    if (id.startsWith('ffApply:')) {
      if (VP.sel.length) Q.apply(VP.sel.slice(), id.slice(8));
      return true;
    }
    return act1(id, el);
  };
})();
