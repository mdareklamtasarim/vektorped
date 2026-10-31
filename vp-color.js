/* VektörPad colour and image set (desktop drawing suite features, written for this app):
   - Image adjustment lab: temperature, tint, saturation, vibrance, brightness, contrast, highlights,
     midtones and shadows in one preview dialog (added to the bitmap effects).
   - Colour harmonies: a group of linked colour styles built from one base colour by a rule (analogous,
     complementary, triadic…); turning the harmony's hue or changing its saturation/lightness recolours every
     object that uses its colours.
   - Pointillizer: turns a selection (vectors or bitmaps) into a vector mosaic of dots.
   - PhotoCocktail: rebuilds a photo as a mosaic of small pictures (other selected images or picked files). */
(function () {
  'use strict';
  const VP = window.VP;
  const FX = VP.fx;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const mm = H.mm;
  const A = VP.actions;
  const IM = VP.imgfx;
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const CL = (VP.color2 = {});
  const seg = (items, cur, prefix) => '<span class="seg">' + items.map(([v, l]) => '<button data-act="' + prefix + v + '" class="' + (String(v) === String(cur) ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const ins = (menu, after, ids) => {
    const M = UI.MENUS[menu];
    if (!M || ids.some((x) => x !== '|' && !x.startsWith('h:') && !x.startsWith('sub:') && M.includes(x))) return;
    let i = after ? M.indexOf(after) : -1;
    if (i < 0) i = M.length - 1;
    M.splice(i + 1, 0, ...ids);
  };

  /* ======================================================================
     IMAGE ADJUSTMENT LAB
     ====================================================================== */
  if (IM && IM.EFFECTS) {
    const R = (k, l, min, max, v, extra) => Object.assign({ k, l, min, max, v, step: 1 }, extra || {});
    const auto = IM.EFFECTS.autoLevels;
    IM.EFFECTS.adjLab = {
      cat: 'adjust',
      label: 'Görüntü ayarlama laboratuvarı',
      params: [
        { k: 'auto', l: 'Otomatik ayar', v: false, type: 'bool' },
        R('temp', 'Sıcaklık', -100, 100, 0), R('tint', 'Renk tonu (yeşil ↔ macenta)', -100, 100, 0),
        R('sat', 'Doygunluk', -100, 100, 0), R('vib', 'Canlılık', -100, 100, 0),
        R('bri', 'Parlaklık', -100, 100, 0), R('con', 'Karşıtlık', -100, 100, 0),
        R('hi', 'Vurgular', -100, 100, 0), R('mid', 'Ara tonlar', -100, 100, 0), R('sh', 'Gölgeler', -100, 100, 0)
      ],
      run: (src, p) => {
        let s = src;
        if (p.auto && auto) s = auto.run(src, { clip: 0.5 });
        const out = new ImageData(new Uint8ClampedArray(s.data), s.width, s.height);
        const d = out.data;
        const c = p.con * 1.28;
        const kc = (259 * (c + 255)) / (255 * (259 - c));
        const t = p.temp * 0.45;
        const tn = p.tint * 0.35;
        const bri = p.bri * 1.1;
        const sat = 1 + p.sat / 100;
        const vib = p.vib / 100;
        const tone = p.hi || p.mid || p.sh;
        for (let i = 0; i < d.length; i += 4) {
          let r = d[i] + t + tn * 0.5;
          let g = d[i + 1] - tn;
          let b = d[i + 2] - t + tn * 0.5;
          r += bri;
          g += bri;
          b += bri;
          if (tone) {
            const L = clamp((0.299 * r + 0.587 * g + 0.114 * b) / 255, 0, 1);
            const wS = (1 - L) * (1 - L);
            const wH = L * L;
            const wM = 1 - Math.abs(2 * L - 1);
            const dv = (p.sh * wS + p.hi * wH + p.mid * wM) * 0.9;
            r += dv;
            g += dv;
            b += dv;
          }
          if (p.con) {
            r = kc * (r - 128) + 128;
            g = kc * (g - 128) + 128;
            b = kc * (b - 128) + 128;
          }
          if (p.sat || p.vib) {
            const Y = 0.299 * r + 0.587 * g + 0.114 * b;
            const mx = Math.max(r, g, b);
            const mn = Math.min(r, g, b);
            const curS = mx > 0 ? (mx - mn) / mx : 0;
            const k = sat * (1 + vib * (1 - clamp(curS, 0, 1)));
            r = Y + (r - Y) * k;
            g = Y + (g - Y) * k;
            b = Y + (b - Y) * k;
          }
          d[i] = r;
          d[i + 1] = g;
          d[i + 2] = b;
        }
        return out;
      }
    };
  }

  /* ======================================================================
     COLOUR HARMONIES
     ====================================================================== */
  const ext = () => VP.ext();
  const listOf = (k) => (ext()[k] = ext()[k] || []);
  const RULES = {
    mono: { label: 'Tek renk', f: (h, s, l) => [[h, s, 0.22], [h, s, 0.36], [h, s, l], [h, s * 0.8, 0.68], [h, s * 0.6, 0.84]] },
    analog: { label: 'Benzer', f: (h, s, l) => [[h - 40, s, l], [h - 20, s, l], [h, s, l], [h + 20, s, l], [h + 40, s, l]] },
    comp: { label: 'Tamamlayıcı', f: (h, s, l) => [[h, s, l], [h, s, clamp(l - 0.18, 0.08, 0.92)], [h + 180, s, l], [h + 180, s, clamp(l + 0.18, 0.08, 0.92)], [h, s * 0.35, 0.9]] },
    split: { label: 'Bölünmüş tamamlayıcı', f: (h, s, l) => [[h, s, l], [h + 150, s, l], [h + 210, s, l], [h, s, clamp(l - 0.2, 0.08, 0.92)], [h, s * 0.35, 0.9]] },
    triad: { label: 'Üçlü', f: (h, s, l) => [[h, s, l], [h + 120, s, l], [h + 240, s, l], [h, s, clamp(l + 0.2, 0.08, 0.92)], [h + 120, s, clamp(l - 0.2, 0.08, 0.92)]] },
    tetrad: { label: 'Dörtlü (dikdörtgen)', f: (h, s, l) => [[h, s, l], [h + 60, s, l], [h + 180, s, l], [h + 240, s, l], [h, s * 0.3, 0.9]] }
  };
  CL.RULES = RULES;
  const toHex = ([h, s, l]) => VP.hex(new paper.Color({ hue: ((h % 360) + 360) % 360, saturation: clamp(s, 0, 1), lightness: clamp(l, 0, 1) }));
  CL.colorsOf = (hm) => RULES[hm.rule].f(hm.h + (hm.rot || 0), hm.s * (hm.sk == null ? 1 : hm.sk), hm.l + (hm.lk || 0)).map(toHex);
  CL.newHarmony = (rule, baseHex) => {
    const c = new paper.Color(baseHex || '#1461b2');
    const hm = { id: 'h' + Math.random().toString(36).slice(2, 8), name: 'Uyum ' + (listOf('harmonies').length + 1), rule: rule || 'comp', h: c.hue || 0, s: c.saturation || 0.6, l: clamp(c.lightness, 0.15, 0.85), rot: 0, sk: 1, lk: 0, ids: [] };
    const cs = listOf('colorStyles');
    CL.colorsOf(hm).forEach((hex, i) => {
      const st = { id: 'c' + Math.random().toString(36).slice(2, 9), name: hm.name + ' · ' + (i + 1), hex, harmony: hm.id };
      cs.push(st);
      hm.ids.push(st.id);
    });
    listOf('harmonies').push(hm);
    VP.commit();
    UI.openDock('styles');
    UI.renderDock(true);
    VP.toast(RULES[hm.rule].label + ' renk uyumu oluşturuldu · Renklere dokunarak seçime uygulayın');
    return hm;
  };
  CL.update = (hm, commit) => {
    const cs = listOf('colorStyles');
    const cols = CL.colorsOf(hm);
    hm.ids.forEach((id, i) => {
      const st = cs.find((x) => x.id === id);
      if (st) st.hex = cols[i] || st.hex;
    });
    if (VP.styles && VP.styles.syncColors) VP.styles.syncColors();
    if (commit) VP.commit();
    else VP.dirty && VP.dirty();
  };
  const harmonySection = () => {
    const hms = listOf('harmonies');
    const cs = listOf('colorStyles');
    const sel = VP.sel.length > 0;
    let h = '<div class="sec"><div class="sec-h"><h3>Renk uyumları</h3><button class="btn" data-act="hmNewMenu">' + ic('plus', 'sm') + 'Uyum</button></div>';
    if (!hms.length) h += '<p class="sec-note">Bir temel renkten kurala göre (benzer, tamamlayıcı, üçlü…) birbirine bağlı renk stilleri oluşturur. Uyumun tonunu döndürünce bu renkleri kullanan bütün nesneler birlikte değişir. Seçili nesnenin rengi temel alınır.</p>';
    hms.forEach((hm) => {
      const members = hm.ids.map((id) => cs.find((x) => x.id === id)).filter(Boolean);
      h += '<div style="border:1px solid var(--line);padding:6px;display:flex;flex-direction:column;gap:6px">' +
        '<div class="row" style="flex-wrap:nowrap"><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(hm.name) + '</b><span class="sec-note">' + esc(RULES[hm.rule].label) + '</span>' +
        '<button class="row-btn" data-act="hmRule:' + hm.id + '" title="Kuralı değiştir" aria-label="Kuralı değiştir">' + ic('swap', 'sm') + '</button>' +
        '<button class="row-btn" data-act="hmDel:' + hm.id + '" title="Uyumu sil (renk stilleri kalır)" aria-label="Uyumu sil">' + ic('trash', 'sm') + '</button></div>' +
        '<div class="row" style="gap:3px;flex-wrap:nowrap">' + members.map((m) => '<button data-act="hmFill:' + m.id + '" title="' + esc(m.name) + ' · dokunun: dolgu, basılı tutun: anahat" aria-label="' + esc(m.name) + '"' + (sel ? '' : ' disabled') + ' style="flex:1;height:30px;border:1px solid rgba(0,0,0,.2);background:' + esc(m.hex) + '"></button>').join('') + '</div>' +
        '<div class="row" style="gap:3px;flex-wrap:nowrap">' + members.map((m) => '<button class="btn" data-act="hmStroke:' + m.id + '" title="Anahata uygula" aria-label="' + esc(m.name) + ' anahat"' + (sel ? '' : ' disabled') + ' style="flex:1;padding:0;justify-content:center;font-size:11px">Anahat</button>').join('') + '</div>' +
        '<label class="range"><span class="pb-label">Ton</span><input type="range" data-pf="hmRot:' + hm.id + '" data-live="1" min="-180" max="180" value="' + Math.round(hm.rot || 0) + '" aria-label="Ton döndür"><output>' + Math.round(hm.rot || 0) + '°</output></label>' +
        '<label class="range"><span class="pb-label">Doygunluk</span><input type="range" data-pf="hmSat:' + hm.id + '" data-live="1" min="0" max="200" value="' + Math.round((hm.sk == null ? 1 : hm.sk) * 100) + '" aria-label="Doygunluk"><output>' + Math.round((hm.sk == null ? 1 : hm.sk) * 100) + '%</output></label>' +
        '<label class="range"><span class="pb-label">Açıklık</span><input type="range" data-pf="hmLight:' + hm.id + '" data-live="1" min="-40" max="40" value="' + Math.round((hm.lk || 0) * 100) + '" aria-label="Açıklık"><output>' + Math.round((hm.lk || 0) * 100) + '</output></label>' +
        '</div>';
    });
    return h + '</div>';
  };
  if (UI.panels && UI.panels.styles) {
    const sp0 = UI.panels.styles;
    UI.panels.styles = () => {
      const base = sp0();
      // harmony colours are listed with their harmony, not again among the single colour styles
      return base + harmonySection();
    };
  }
  const baseColor = () => {
    const it = VP.sel[0];
    if (!it) return null;
    const f = VP.getFill(it);
    if (f && f.type !== 'none' && f.color) return f.color;
    const s = VP.getStroke(it);
    return s && s.on ? s.color : null;
  };
  CL.ruleMenu = (el, pick) => UI.popover(el, '<div class="pop-head">Kural</div>' + Object.keys(RULES).map((k) => '<button class="pop-item" data-pick="' + k + '">' + esc(RULES[k].label) + '</button>').join(''), pick);
  CL.act = (id, el) => {
    const i = id.indexOf(':');
    const k = i < 0 ? id : id.slice(0, i);
    const arg = i < 0 ? '' : id.slice(i + 1);
    const hms = listOf('harmonies');
    const cs = listOf('colorStyles');
    const hm = hms.find((x) => x.id === arg);
    switch (k) {
      case 'hmNewMenu': CL.ruleMenu(el, (r) => CL.newHarmony(r, baseColor())); return true;
      case 'hmRule':
        if (hm) CL.ruleMenu(el, (r) => {
          hm.rule = r;
          CL.update(hm, true);
          UI.renderDock(true);
        });
        return true;
      case 'hmDel':
        if (hm) {
          hms.splice(hms.indexOf(hm), 1);
          cs.forEach((c) => c.harmony === hm.id && delete c.harmony);
          VP.commit();
          UI.renderDock(true);
          VP.toast('Uyum silindi · Renkleri, renk stili olarak kaldı');
        }
        return true;
      case 'hmFill':
      case 'hmStroke': {
        const c = cs.find((x) => x.id === arg);
        if (!c || !VP.sel.length) return true;
        VP.styles.applyColorStyle(VP.sel, c, k === 'hmStroke' ? 'stroke' : 'fill');
        VP.commit();
        return true;
      }
      default: return false;
    }
  };
  CL.propField = (name, raw, el) => {
    const [k, id] = name.split(':');
    const hm = listOf('harmonies').find((x) => x.id === id);
    if (!hm) return true;
    const v = VP.parseNum(raw);
    if (!isFinite(v)) return true;
    if (k === 'hmRot') hm.rot = v;
    if (k === 'hmSat') hm.sk = v / 100;
    if (k === 'hmLight') hm.lk = v / 100;
    const live = el && el.dataset && el.dataset.live && !UI._rangeDone;
    CL.update(hm, !live);
    if (el && el.nextElementSibling && el.nextElementSibling.tagName === 'OUTPUT') el.nextElementSibling.textContent = Math.round(v) + (k === 'hmRot' ? '°' : k === 'hmSat' ? '%' : '');
    return true;
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, r, el) => (/^hm[A-Z]/.test(n) ? CL.propField(n, r, el) : pf0(n, r, el));
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => (/^(hm|pt|pc)[A-Z]/.test(id) ? CL.act(id, el) : act0(id, el));

  /* ======================================================================
     shared: pixels of the selection, in page coordinates
     ====================================================================== */
  const selPixels = (items, res) => {
    const g = new paper.Group({ insert: false });
    VP.zSort(items).forEach((it) => g.addChild(it.clone({ insert: false })));
    const r = g.rasterize(res, false);
    const cv = r.canvas;
    const ctx = cv.getContext('2d');
    return { data: ctx.getImageData(0, 0, cv.width, cv.height), bounds: r.bounds.clone(), w: cv.width, h: cv.height, canvas: cv };
  };
  const field = (label, k, v, unit) => '<label class="field"><span>' + esc(label) + '</span><input data-f="' + k + '" value="' + esc(v) + '" inputmode="decimal"' + (unit ? '' : '') + '>' + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</label>';
  const segRow = (label, k, items, cur) => '<div class="row"><span class="opt-label">' + esc(label) + '</span><span class="seg" data-seg="' + k + '">' + items.map(([v, l]) => '<button data-v="' + v + '" class="' + (String(v) === String(cur) ? 'on' : '') + '">' + l + '</button>').join('') + '</span></div>';
  const bindSegs = (root, st) => root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] [data-v]');
    if (!b) return;
    const sg = b.parentElement;
    st[sg.dataset.seg] = b.dataset.v;
    sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });

  /* ======================================================================
     POINTILLIZER
     ====================================================================== */
  CL.ptOpts = { cell: VP.toPT(2.5), size: 90, shape: 'circle', byLight: '0', color: 'orig', mono: '#1d1d1b', layout: 'offset', hide: '0' };
  CL.pointillize = (items, o) => {
    const b0 = VP.selBounds();
    let cell = Math.max(VP.toPT(0.3), o.cell);
    let cols = Math.ceil(b0.width / cell);
    let rows = Math.ceil(b0.height / cell);
    let note = '';
    if (cols * rows > 25000) {
      cell *= Math.sqrt((cols * rows) / 25000);
      cols = Math.ceil(b0.width / cell);
      rows = Math.ceil(b0.height / cell);
      note = ' · Nokta aralığı ' + mm(cell, 1) + ' mm yapıldı (çok fazla nokta)';
    }
    const res = clamp((72 * 4) / cell, 6, 300);
    let px;
    try {
      px = selPixels(items, res);
    } catch (e) {
      return VP.toast('Seçim okunamadı');
    }
    const d = px.data.data;
    const sx = px.w / px.bounds.width;
    const sy = px.h / px.bounds.height;
    const avg = (x0, y0, x1, y1) => {
      let r = 0, g = 0, b = 0, a = 0;
      const X0 = clamp(Math.floor((x0 - px.bounds.x) * sx), 0, px.w - 1);
      const X1 = clamp(Math.ceil((x1 - px.bounds.x) * sx), X0 + 1, px.w);
      const Y0 = clamp(Math.floor((y0 - px.bounds.y) * sy), 0, px.h - 1);
      const Y1 = clamp(Math.ceil((y1 - px.bounds.y) * sy), Y0 + 1, px.h);
      let n = 0;
      for (let y = Y0; y < Y1; y++) {
        for (let x = X0; x < X1; x++) {
          const k = (y * px.w + x) * 4;
          const al = d[k + 3] / 255;
          r += d[k] * al;
          g += d[k + 1] * al;
          b += d[k + 2] * al;
          a += al;
          n++;
        }
      }
      return a > 0 ? { r: r / a, g: g / a, b: b / a, a: a / n } : { r: 0, g: 0, b: 0, a: 0 };
    };
    const buckets = new Map();
    const shapeAt = (c, s) => {
      if (o.shape === 'square') return new paper.Path.Rectangle({ rectangle: new paper.Rectangle(c.x - s / 2, c.y - s / 2, s, s), insert: false });
      if (o.shape === 'diamond') return new paper.Path.RegularPolygon({ center: c, sides: 4, radius: s / 2, insert: false });
      if (o.shape === 'hex') return new paper.Path.RegularPolygon({ center: c, sides: 6, radius: s / 2, insert: false });
      return new paper.Path.Circle({ center: c, radius: s / 2, insert: false });
    };
    const q = (v) => clamp(Math.round(v / 8) * 8, 0, 255);
    for (let j = 0; j < rows; j++) {
      const shift = o.layout === 'offset' && j % 2 ? cell / 2 : 0;
      for (let i = 0; i < cols + (shift ? 1 : 0); i++) {
        const x0 = b0.left + i * cell - shift;
        const y0 = b0.top + j * cell;
        const c = avg(x0, y0, x0 + cell, y0 + cell);
        if (c.a < 0.35) continue;
        const Lm = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
        let s = (cell * o.size) / 100;
        if (o.byLight === '1') s *= clamp(1.05 - Lm, 0.08, 1);
        if (s < cell * 0.04) continue;
        let hex;
        if (o.color === 'gray') {
          const v = q(Lm * 255);
          hex = VP.hex(new paper.Color(v / 255, v / 255, v / 255));
        } else if (o.color === 'mono') hex = o.mono;
        else hex = VP.hex(new paper.Color(q(c.r) / 255, q(c.g) / 255, q(c.b) / 255));
        const sh = shapeAt(Pt(x0 + cell / 2, y0 + cell / 2), s);
        if (!buckets.has(hex)) buckets.set(hex, []);
        buckets.get(hex).push(sh);
      }
    }
    if (!buckets.size) return VP.toast('Noktalanacak görünür alan yok');
    const out = new paper.Group({ insert: false });
    out.name = 'Noktalayıcı';
    buckets.forEach((paths, hex) => out.addChild(new paper.CompoundPath({ children: paths, fillColor: hex, insert: false })));
    const top = VP.zSort(items)[items.length - 1];
    out.insertAbove(top);
    if (o.hide === '1') items.forEach((it) => (it.visible = false));
    VP.setSelection([out]);
    VP.commit();
    let n = 0;
    buckets.forEach((p) => (n += p.length));
    VP.toast('Noktalayıcı: ' + n + ' nokta, ' + buckets.size + ' renk' + note);
  };
  CL.ptDialog = () => {
    const items = VP.sel.slice();
    if (!items.length) return VP.toast('Önce nesne veya resim seçin');
    const o = CL.ptOpts;
    const html = '<h2>Noktalayıcı</h2><p>Seçimi renkli noktalardan oluşan bir vektör mozaiğe dönüştürür. Sonuç ayrı bir grup olarak eklenir.</p>' +
      '<div class="row">' + field('Nokta aralığı', 'cell', mm(o.cell, 1), 'mm') + field('Nokta boyutu', 'size', o.size, '%') + '</div>' +
      segRow('Şekil', 'shape', [['circle', 'Daire'], ['square', 'Kare'], ['diamond', 'Elmas'], ['hex', 'Altıgen']], o.shape) +
      segRow('Düzen', 'layout', [['grid', 'Izgara'], ['offset', 'Kaydırmalı']], o.layout) +
      segRow('Boyut', 'byLight', [['0', 'Sabit'], ['1', 'Koyuluğa göre']], o.byLight) +
      segRow('Renk', 'color', [['orig', 'Özgün'], ['gray', 'Gri'], ['mono', 'Tek renk']], o.color) +
      '<div class="row"><label class="field"><span>Tek renk</span><input type="color" data-f="mono" value="' + esc(o.mono) + '" style="width:34px;height:26px;border:0;padding:0;background:transparent"></label></div>' +
      segRow('Kaynak', 'hide', [['0', 'Kalsın'], ['1', 'Gizle']], o.hide) +
      '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Uygula</button></div>';
    UI.modal(html, (root, close) => {
      bindSegs(root, o);
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'no') return close();
        const g = (k) => root.querySelector('[data-f="' + k + '"]').value;
        const c = VP.parseNum(g('cell'));
        if (c > 0) o.cell = VP.toPT(c);
        const s = VP.parseNum(g('size'));
        if (s > 0) o.size = clamp(s, 5, 300);
        o.mono = g('mono');
        close();
        setTimeout(() => CL.pointillize(items, o), 30);
      });
    });
  };

  /* ======================================================================
     PHOTOCOCKTAIL
     ====================================================================== */
  CL.pcOpts = { cols: 40, tile: 28, blend: 35, src: 'sel' };
  CL.pcFiles = [];
  const loadImg = (src) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
  const fileToImg = (f) => new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => loadImg(fr.result).then(res);
    fr.onerror = () => res(null);
    fr.readAsDataURL(f);
  });
  // a square, centre-cropped copy of an image, and its average colour
  const tileOf = (img, ts) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = ts;
    const ctx = cv.getContext('2d');
    const w = img.width || img.naturalWidth;
    const h = img.height || img.naturalHeight;
    const s = Math.min(w, h);
    ctx.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, ts, ts);
    const d = ctx.getImageData(0, 0, ts, ts).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
    return { cv, r: r / n, g: g / n, b: b / n };
  };
  CL.cocktail = async (target, tileImgs, o) => {
    let tgt;
    try {
      tgt = target instanceof paper.Raster ? { canvas: target.canvas, bounds: target.bounds.clone() } : selPixels([target], 150);
    } catch (e) {
      return VP.toast('Hedef resim okunamadı');
    }
    const W = tgt.canvas.width;
    const Hh = tgt.canvas.height;
    const cols = clamp(Math.round(o.cols), 6, 160);
    const rows = Math.max(1, Math.round((cols * tgt.bounds.height) / tgt.bounds.width));
    void W;
    void Hh;
    let ts = clamp(Math.round(o.tile), 8, 96);
    while (cols * ts > 4096 || rows * ts > 4096) ts--;
    const small = document.createElement('canvas');
    small.width = cols;
    small.height = rows;
    const sc = small.getContext('2d');
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(tgt.canvas, 0, 0, cols, rows);
    const cell = sc.getImageData(0, 0, cols, rows).data;
    const tiles = tileImgs.map((im) => tileOf(im, ts));
    if (!tiles.length) return VP.toast('Döşeme resmi yok');
    const out = document.createElement('canvas');
    out.width = cols * ts;
    out.height = rows * ts;
    const ctx = out.getContext('2d');
    const used = new Array(tiles.length).fill(0);
    const k = clamp(o.blend, 0, 100) / 100;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const o4 = (y * cols + x) * 4;
        if (cell[o4 + 3] < 20) continue;
        const r = cell[o4];
        const g = cell[o4 + 1];
        const b = cell[o4 + 2];
        let best = 0;
        let bd = Infinity;
        tiles.forEach((t, i) => {
          const dd = (t.r - r) ** 2 + (t.g - g) ** 2 + (t.b - b) ** 2 + used[i] * 6;
          if (dd < bd) {
            bd = dd;
            best = i;
          }
        });
        used[best]++;
        ctx.globalAlpha = cell[o4 + 3] / 255;
        ctx.drawImage(tiles[best].cv, x * ts, y * ts);
        if (k > 0) {
          ctx.globalAlpha = k * (cell[o4 + 3] / 255);
          ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
          ctx.fillRect(x * ts, y * ts, ts, ts);
        }
      }
    }
    ctx.globalAlpha = 1;
    const rr = new paper.Raster({ source: out.toDataURL('image/jpeg', 0.9), insert: false });
    await new Promise((res) => {
      rr.onLoad = res;
      setTimeout(res, 3000);
    });
    rr.fitBounds(tgt.bounds);
    rr.name = 'Fotoğraf kolajı';
    rr.insertAbove(target);
    VP.setSelection([rr]);
    VP.commit();
    VP.toast('Fotoğraf kolajı: ' + cols + ' × ' + rows + ' döşeme, ' + tiles.length + ' farklı resim');
  };
  CL.pcDialog = () => {
    const rs = VP.sel.filter((it) => it instanceof paper.Raster);
    const target = rs.length ? rs.reduce((a, b) => (b.bounds.area > a.bounds.area ? b : a)) : VP.sel[0];
    if (!target) return VP.toast('Önce bir resim seçin (döşemeler için başka resimleri de birlikte seçebilirsiniz)');
    const others = rs.filter((r) => r !== target);
    const o = CL.pcOpts;
    const html = '<h2>Fotoğraf kolajı</h2><p>Seçili resmi küçük resimlerden oluşan bir mozaik olarak yeniden kurar. Her parçaya rengi en yakın resim konur.</p>' +
      '<div class="row">' + field('Sütun', 'cols', o.cols, '') + field('Döşeme', 'tile', o.tile, 'px') + field('Renk uyumu', 'blend', o.blend, '%') + '</div>' +
      segRow('Döşemeler', 'src', [['sel', 'Seçili resimler (' + others.length + ')'], ['files', 'Dosyalardan'], ['self', 'Resmin kendisi']], others.length ? o.src : o.src === 'sel' ? 'self' : o.src) +
      '<div class="row"><button class="btn" data-x="pick">' + ic('open', 'sm') + 'Resim dosyaları seç…</button><span class="sec-note" data-n>' + (CL.pcFiles.length ? CL.pcFiles.length + ' dosya seçili' : 'Dosya seçilmedi') + '</span></div>' +
      '<p class="sec-note">Çok sayıda farklı renkte döşeme resmi daha iyi sonuç verir. Renk uyumu, her döşemeyi hedef rengine doğru boyar.</p>' +
      '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Oluştur</button></div>';
    if (!others.length && o.src === 'sel') o.src = 'self';
    UI.modal(html, (root, close) => {
      bindSegs(root, o);
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'no') return close();
        if (b.dataset.x === 'pick') {
          const inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = 'image/*';
          inp.multiple = true;
          inp.onchange = async () => {
            const imgs = (await Promise.all([...inp.files].slice(0, 300).map(fileToImg))).filter(Boolean);
            CL.pcFiles = imgs;
            root.querySelector('[data-n]').textContent = imgs.length + ' dosya seçili';
            o.src = 'files';
            root.querySelectorAll('[data-seg="src"] button').forEach((x) => x.classList.toggle('on', x.dataset.v === 'files'));
          };
          inp.click();
          return;
        }
        const g = (k) => VP.parseNum(root.querySelector('[data-f="' + k + '"]').value);
        if (g('cols') > 0) o.cols = g('cols');
        if (g('tile') > 0) o.tile = g('tile');
        if (g('blend') >= 0) o.blend = g('blend');
        let imgs = [];
        if (o.src === 'files') imgs = CL.pcFiles;
        else if (o.src === 'sel') imgs = others.map((r) => r.canvas);
        if (!imgs.length) {
          // the photo itself, cut into a few coloured variations
          const base = target instanceof paper.Raster ? target.canvas : null;
          if (base) imgs = [base];
          else return VP.toast('Döşeme için resim seçin veya dosya ekleyin');
        }
        close();
        VP.toast('Fotoğraf kolajı hazırlanıyor…');
        setTimeout(() => CL.cocktail(target, imgs, o), 40);
      });
    });
  };

  /* ======================================================================
     actions and menus
     ====================================================================== */
  Object.assign(A, {
    bmpAdjLab: { label: 'Görüntü ayarlama laboratuvarı…', icon: 'bmpfx', enabled: () => VP.sel.some((it) => it instanceof paper.Raster), run: () => IM.dialog('adjLab') },
    fxPointillizer: { label: 'Noktalayıcı…', icon: 'pointillize', enabled: () => VP.sel.length > 0, run: () => CL.ptDialog() },
    fxPhotoCocktail: { label: 'Fotoğraf kolajı…', icon: 'mosaic', enabled: () => VP.sel.length > 0, run: () => CL.pcDialog() },
    harmonyNew: { label: 'Yeni renk uyumu…', icon: 'palette', run: () => CL.ruleMenu(document.querySelector('.menu-btn[data-menu="window"]') || document.querySelector('#btn-menu-all') || document.body, (r) => CL.newHarmony(r, baseColor())) }
  });
  ins('bitmaps', 'h:Ayarla', ['bmpAdjLab']);
  ins('effects', null, ['|', 'h:Yaratıcı', 'fxPointillizer', 'fxPhotoCocktail']);
  ins('window', 'dockStyles', ['harmonyNew']);
  ins('object', null, ['harmonyNew']);
})();
