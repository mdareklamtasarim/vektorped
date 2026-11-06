/* VektörPad fill additions (written for this app):
   - Fountain fill options for linear and radial fills: repeat, repeat and mirror, steps (banding),
     acceleration, midpoint, and colour blend direction (direct or round the colour wheel, either way).
   - Vector / image pattern fill: the top object of a selection becomes a pattern tile that fills the
     other selected shapes (live: size, gap, angle and row offset can be changed).
   - Uniform transparency applied to the fill only, the outline only, or both. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const FX = VP.fx;
  const Q = VP.fillfx;
  const H = UI.h;
  const esc = H.esc;
  const Pt = (x, y) => new paper.Point(x, y);
  const $ = (q) => document.querySelector(q);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ================= fountain fill options ================= */
  const leafOf = (it) => VP.leafItems([it]).find((x) => x.fillColor && x.fillColor.type === 'gradient');
  const rgbOf = (hex) => new paper.Color(hex).convert('hsb');
  const colorAt = (c1, c2, t, dir) => {
    if (!dir || dir === 'direct') {
      const a = new paper.Color(c1);
      const b = new paper.Color(c2);
      return new paper.Color(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t);
    }
    const a = rgbOf(c1);
    const b = rgbOf(c2);
    let dh = b.hue - a.hue;
    if (dir === 'cw') {
      if (dh < 0) dh += 360;
    } else if (dh > 0) dh -= 360;
    const c = new paper.Color({ hue: (a.hue + dh * t + 360) % 360, saturation: a.saturation + (b.saturation - a.saturation) * t, brightness: a.brightness + (b.brightness - a.brightness) * t });
    return c.convert('rgb');
  };
  // position along the fill (0..1) → colour mix amount (0..1)
  const ease = (t, o) => {
    let u = t;
    const mid = clamp((o.mid == null ? 50 : o.mid) / 100, 0.02, 0.98);
    u = u < mid ? (u / mid) * 0.5 : 0.5 + ((u - mid) / (1 - mid)) * 0.5;
    const acc = clamp((o.accel || 0) / 100, -0.95, 0.95);
    if (acc) u = acc > 0 ? Math.pow(u, 1 + acc * 3) : 1 - Math.pow(1 - u, 1 - acc * 3);
    return u;
  };
  const stopsFor = (o) => {
    const rep = Math.max(1, Math.round(o.repeat || 1));
    const steps = Math.round(o.steps || 0);
    const out = [];
    const N = 24;
    for (let r = 0; r < rep; r++) {
      const flip = o.mirror && r % 2 === 1;
      const add = (localT, pos) => {
        const tt = flip ? 1 - localT : localT;
        out.push([colorAt(o.c1, o.c2, ease(tt, o), o.dir), (r + pos) / rep]);
      };
      if (steps >= 2) {
        // hard-edged bands
        for (let k = 0; k < steps; k++) {
          const t = steps === 1 ? 0 : k / (steps - 1);
          add(t, k / steps + 1e-4);
          add(t, (k + 1) / steps - 1e-4);
        }
      } else for (let k = 0; k <= N; k++) add(k / N, k / N);
    }
    return out.map(([c, p]) => [c, clamp(p, 0, 1)]);
  };
  const applyGrad = (it) => {
    const o = it.data.grad;
    if (!o || !it.fillColor || it.fillColor.type !== 'gradient') return;
    const c = it.fillColor;
    it.fillColor = { gradient: { stops: stopsFor(o), radial: c.gradient.radial }, origin: c.origin, destination: c.destination };
  };
  const plainGrad = (o) => !o || ((o.repeat || 1) <= 1 && !o.steps && !o.accel && (o.mid == null || o.mid === 50) && (!o.dir || o.dir === 'direct'));
  const sf0 = VP.setFill;
  VP.setFill = (items, spec) => {
    const r = sf0(items, spec);
    VP.leafItems(items).forEach((it) => {
      if (!it.data) return;
      if (spec.type === 'linear' || spec.type === 'radial') {
        if (it.data.grad) {
          it.data.grad.c1 = spec.color;
          it.data.grad.c2 = spec.color2;
          applyGrad(it);
        }
      } else if (spec.type) delete it.data.grad;
    });
    return r;
  };
  const gf0 = VP.getFill;
  VP.getFill = (it) => {
    const f = gf0(it);
    const leaf = leafOf(it);
    if (leaf && leaf.data.grad && (f.type === 'linear' || f.type === 'radial')) {
      f.color = leaf.data.grad.c1;
      f.color2 = leaf.data.grad.c2;
      f.grad = Object.assign({}, leaf.data.grad);
    }
    return f;
  };
  const setGrad = (patch) => {
    const items = VP.leafItems(VP.sel).filter((x) => x.fillColor && x.fillColor.type === 'gradient');
    if (!items.length) return VP.toast('Önce doğrusal veya dairesel dolgulu bir nesne seçin');
    items.forEach((it) => {
      const c = it.fillColor;
      const st = c.gradient.stops;
      const o = Object.assign({ c1: it.data.grad ? it.data.grad.c1 : VP.hex(st[0].color), c2: it.data.grad ? it.data.grad.c2 : VP.hex(st[st.length - 1].color) }, it.data.grad || {}, patch);
      if (plainGrad(o)) {
        delete it.data.grad;
        it.fillColor = { gradient: { stops: [[o.c1, 0], [o.c2, 1]], radial: c.gradient.radial }, origin: c.origin, destination: c.destination };
      } else {
        it.data.grad = o;
        applyGrad(it);
      }
    });
    VP.commit();
    UI.schedule('dock', 'prop');
  };

  /* ================= Properties docker rows ================= */
  const addRows = () => {
    if (UI.dockTab !== 'props') return;
    const body = $('#dock-body');
    if (!body || body.querySelector('[data-vpg]')) return;
    const rev = body.querySelector('[data-act="fillReverse"]');
    if (rev && VP.sel.length) {
      const f = VP.getFill(VP.sel[0]);
      const o = f.grad || {};
      const row = document.createElement('div');
      row.className = 'vpg-rows';
      const num = (k, label, v, unit, w) => '<label class="field"><span>' + label + '</span><input data-vpg="' + k + '" value="' + esc(v) + '" inputmode="decimal" style="width:' + (w || 40) + 'px">' + (unit ? '<span class="unit-u">' + unit + '</span>' : '') + '</label>';
      row.innerHTML = '<div class="row">' + num('repeat', 'Tekrar', o.repeat || 1, '×') + '<label class="field"><input type="checkbox" data-vpg="mirror"' + (o.mirror ? ' checked' : '') + ' style="width:auto"><span>Yansıt</span></label>' + num('steps', 'Adım', o.steps || 0, '', 36) + '</div>' +
        '<div class="row">' + num('accel', 'Hızlanma', o.accel || 0, '', 40) + num('mid', 'Orta nokta', o.mid == null ? 50 : o.mid, '%', 40) + '</div>' +
        '<div class="row"><label class="field grow"><span>Renk yönü</span><select data-vpg="dir">' + [['direct', 'Doğrudan'], ['cw', 'Saat yönünde (renk çarkı)'], ['ccw', 'Saat yönünün tersine']].map(([k, l]) => '<option value="' + k + '"' + ((o.dir || 'direct') === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>';
      (rev.closest('.row') || rev).after(row);
    }
    // transparency target
    const op = body.querySelector('[data-dk="opacity"]');
    if (op && VP.sel.length && !body.querySelector('[data-vpt]')) {
      const t = (VP.sel[0].data && VP.sel[0].data.tTarget) || 'all';
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<span class="pb-label">Uygula</span><span class="seg">' + [['fill', 'Dolgu'], ['stroke', 'Anahat'], ['all', 'Tümü']].map(([k, l]) => '<button data-vpt="' + k + '" class="' + (t === k ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
      (op.closest('.range') || op).after(row);
    }
  };
  const rd0 = UI.renderDock;
  UI.renderDock = function () {
    const r = rd0.apply(this, arguments);
    try {
      addRows();
    } catch (e) { /* optional */ }
    return r;
  };
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || !t.dataset || !t.dataset.vpg) return;
    const k = t.dataset.vpg;
    if (k === 'mirror') return setGrad({ mirror: t.checked });
    if (k === 'dir') return setGrad({ dir: t.value });
    const v = VP.parseNum(t.value);
    if (!isFinite(v)) return;
    if (k === 'repeat') setGrad({ repeat: clamp(Math.round(v), 1, 20) });
    else if (k === 'steps') setGrad({ steps: clamp(Math.round(v), 0, 256) });
    else if (k === 'accel') setGrad({ accel: clamp(v, -100, 100) });
    else if (k === 'mid') setGrad({ mid: clamp(v, 1, 99) });
  });

  /* ================= transparency: fill / outline / all ================= */
  const applyTarget = (it, target, op) => {
    VP.leafItems([it]).forEach((x) => {
      const a = op == null ? x.opacity : op;
      if (target === 'all') {
        if (x.fillColor && x.fillColor.type !== 'gradient') x.fillColor.alpha = 1;
        if (x.strokeColor) x.strokeColor.alpha = 1;
        x.opacity = a;
      } else {
        x.opacity = 1;
        if (x.fillColor && x.fillColor.type !== 'gradient') x.fillColor.alpha = target === 'fill' ? a : 1;
        if (x.strokeColor) x.strokeColor.alpha = target === 'stroke' ? a : 1;
      }
    });
  };
  const currentOpacity = (it) => {
    const t = it.data.tTarget;
    if (!t || t === 'all') return it.opacity;
    const leaf = VP.leafItems([it])[0];
    const c = t === 'fill' ? leaf.fillColor : leaf.strokeColor;
    return c && c.alpha != null ? c.alpha : 1;
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-vpt]');
    if (!b) return;
    e.stopPropagation();
    const target = b.dataset.vpt;
    VP.sel.forEach((it) => {
      const op = currentOpacity(it);
      it.data.tTarget = target;
      if (target === 'all') delete it.data.tTarget;
      applyTarget(it, target, op);
    });
    VP.commit();
    UI.schedule('dock');
  }, true);
  // the opacity slider follows the chosen target
  const df0 = UI.dockField;
  UI.dockField = function (k, raw, el, live) {
    if (k === 'opacity' && VP.sel.some((it) => it.data.tTarget)) {
      const op = clamp(VP.parseNum(raw) / 100, 0, 1);
      VP.sel.forEach((it) => applyTarget(it, it.data.tTarget || 'all', op));
      if (live) UI.softCommit ? UI.softCommit() : VP.drawOverlay();
      else VP.commit();
      return;
    }
    return df0.apply(this, arguments);
  };

  /* ================= vector / image pattern fill ================= */
  if (Q) {
    Q.KINDS.tile = 'Vektör / resim desen';
    const tileContent = (fx, box) => {
      const g = new paper.Group({ insert: false });
      let tile;
      try {
        tile = new paper.Group({ insert: false });
        tile.importJSON(fx.tile);
        if (!(tile.children && tile.children.length) && tile.className === 'Group') tile = null;
      } catch (e) {
        tile = null;
      }
      if (!tile) return g;
      const tb = tile.bounds;
      if (!(tb.width > 0 && tb.height > 0)) return g;
      const s = Math.max(1, fx.size || tb.width) / tb.width;
      tile.scale(s, tb.topLeft);
      const w = tile.bounds.width + (fx.gap || 0);
      const h = tile.bounds.height + (fx.gap || 0);
      const c = box.center;
      const R = Math.sqrt(box.width * box.width + box.height * box.height) / 2 + Math.max(w, h);
      const nx = Math.ceil(R / w) + 1;
      const ny = Math.ceil(R / h) + 1;
      if (nx * ny * 4 > 6000) return g;
      if (fx.c1) g.addChild(new paper.Path.Rectangle({ rectangle: box.expand(2), fillColor: fx.c1, insert: false }));
      const grid = new paper.Group({ insert: false });
      tile.position = Pt(0, 0);
      for (let j = -ny; j <= ny; j++) {
        for (let i = -nx; i <= nx; i++) {
          const k = tile.clone({ insert: false });
          k.position = Pt(i * w + (j % 2 ? (w * (fx.offset || 0)) / 100 : 0), j * h);
          grid.addChild(k);
        }
      }
      grid.rotate(fx.angle || 0, Pt(0, 0));
      grid.translate(c);
      g.addChild(grid);
      return g;
    };
    const build0 = Q.build;
    Q.build = (g) => {
      const fx = g.data.effect;
      if (fx.kind !== 'tile') return build0(g);
      const s = g.children.find((c) => c.data.effectSrc);
      if (!s) return;
      g.children.slice().forEach((c) => c !== s && c.remove());
      const box = s.bounds.expand(1);
      if (!(box.width > 0.5 && box.height > 0.5)) return;
      const content = tileContent(fx, box);
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
    if (FX.TYPES && FX.TYPES.fillfx) {
      const t = FX.TYPES.fillfx;
      if (t.build) {
        const tb0 = t.build;
        t.build = (g) => (g.data.effect.kind === 'tile' ? Q.build(g) : tb0(g));
      }
      if (t.describe) {
        const d0 = t.describe;
        t.describe = (g) => (g.data.effect.kind === 'tile' ? 'Vektör/resim desen dolgu' : d0(g));
      }
    }
    PCT();
  }
  function PCT() {
    A.tileFill = {
      label: 'Desen dolgusu: üstteki nesneyle doldur',
      icon: 'grid',
      enabled: () => VP.sel.length >= 2,
      run: () => {
        // the object on top is the tile
        const tileSrc = VP.sel.reduce((a, b) => (b.isAbove(a) ? b : a));
        const targets = VP.sel.filter((x) => x !== tileSrc);
        const json = tileSrc.exportJSON({ asString: true });
        const size = tileSrc.bounds.width;
        const made = Q.apply(targets, 'pattern');
        let n = 0;
        made.forEach((g) => {
          const fx = FX.of(g);
          if (!fx || fx.type !== 'fillfx') return;
          fx.kind = 'tile';
          fx.tile = json;
          fx.size = size;
          fx.gap = 0;
          fx.offset = 0;
          fx.angle = 0;
          fx.c1 = null;
          Q.build(g);
          n++;
        });
        if (!n) return VP.toast('Doldurulacak kapalı şekil yok');
        VP.setSelection(made);
        VP.commit();
        VP.toast(n + ' şekil desenle dolduruldu · Desen nesnesi olduğu gibi kaldı');
      }
    };
    const M = UI.MENUS.object;
    if (M && !M.includes('tileFill')) M.push('|', 'tileFill');
    UI.selExtras = UI.selExtras || [];
    UI.selExtras.push((s, one) => {
      const fx = one && FX.of(one);
      if (!fx || fx.type !== 'fillfx' || fx.kind !== 'tile') return '';
      return H.sep + '<span class="pb-label">Desen</span>' + H.field('Boyut', 'tlSize', VP.num(VP.toMM(fx.size || 10), 1)) + H.field('Aralık', 'tlGap', VP.num(VP.toMM(fx.gap || 0), 1)) + H.field('Açı', 'tlAngle', VP.num(fx.angle || 0, 1), '°') + H.field('Satır kaydır', 'tlOff', Math.round(fx.offset || 0), '%');
    });
    const pf0 = VP.tx.propField;
    VP.tx.propField = (n, raw, el) => {
      if (!/^tl[A-Z]/.test(n)) return pf0(n, raw, el);
      const v = VP.parseNum(raw);
      if (!isFinite(v)) return true;
      VP.sel.forEach((g) => {
        const fx = FX.of(g);
        if (!fx || fx.kind !== 'tile') return;
        if (n === 'tlSize' && v > 0) fx.size = VP.toPT(v);
        if (n === 'tlGap') fx.gap = Math.max(0, VP.toPT(v));
        if (n === 'tlAngle') fx.angle = v;
        if (n === 'tlOff') fx.offset = clamp(v, -100, 100);
        Q.build(g);
      });
      VP.commit();
      return true;
    };
  }
})();
