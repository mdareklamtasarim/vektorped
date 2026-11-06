/* VektörPad desktop-style finishing touches (written for this app):
   - A long default CMYK palette in one column with scroll arrows.
   - Scroll bars along the drawing window and a navigator button in the corner (mini map of the page).
   - Status bar shows fill and outline as CMYK values and the outline width ("Saç teli" for hairlines),
     plus a hint for the current tool. Document palette row shows a hint while empty.
   - Property bar: a nine-point reference selector for X and Y, small up/down arrows on number boxes,
     icons for the artistic media modes; drop-down arrows on New, Open, Undo and Redo.
   - Narrow document tabs whose × shows on hover; the ruler unit is written at the end of the ruler.
   - Context menu: zoom to selection, internet links, object and colour styles, pixel grid. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const S = VP.settings;
  const A = VP.actions;
  const esc = UI.h.esc;
  const ic = UI.h.ic;
  const $ = (q) => document.querySelector(q);
  const Pt = (x, y) => new paper.Point(x, y);
  const svg = (body) => '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  const classic = () => document.documentElement.dataset.skin === 'classic';

  /* ================= palette ================= */
  const conv = () => (VP.panels2 && VP.panels2.conv) || null;
  const cmykHex = (c, m, y, k) => {
    const cv = conv();
    const rgb = cv ? cv.cmyk2rgb(c, m, y, k) : [255 * (1 - c / 100) * (1 - k / 100), 255 * (1 - m / 100) * (1 - k / 100), 255 * (1 - y / 100) * (1 - k / 100)];
    return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  };
  const name = (c, m, y, k) => ['C', c, 'M', m, 'Y', y, 'K', k].reduce((s, v, i) => (i % 2 ? s + v + ' ' : s + v), '').trim();
  const buildCMYK = () => {
    const out = [];
    const add = (c, m, y, k) => out.push([cmykHex(c, m, y, k), name(c, m, y, k)]);
    [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].forEach((k) => add(0, 0, 0, k));
    const hues = [[0, 0, 100], [0, 20, 100], [0, 40, 100], [0, 60, 100], [0, 80, 100], [0, 100, 100], [0, 100, 60], [0, 100, 20], [0, 100, 0], [20, 100, 0], [40, 100, 0], [60, 100, 0], [80, 100, 0], [100, 100, 0], [100, 60, 0], [100, 20, 0], [100, 0, 0], [100, 0, 20], [100, 0, 40], [100, 0, 60], [100, 0, 100], [60, 0, 100], [40, 0, 100], [20, 0, 100]];
    [1, 0.6, 0.3].forEach((f) => hues.forEach(([c, m, y]) => add(Math.round(c * f), Math.round(m * f), Math.round(y * f), 0)));
    hues.filter((h, i) => i % 2 === 0).forEach(([c, m, y]) => add(c, m, y, 40));
    [[0, 20, 40, 40], [0, 40, 60, 20], [20, 40, 60, 20], [0, 60, 80, 60], [40, 60, 80, 40]].forEach((v) => add(...v));
    return out;
  };
  // the default palette becomes the long CMYK palette (a palette chosen in the Palettes docker still wins)
  const startPalette = () => {
    if (!UI.PALETTE) return;
    const list = buildCMYK();
    UI.PALETTE.splice(0, UI.PALETTE.length, ...list);
    UI.renderPalette && UI.renderPalette(true);
  };
  const rp0 = UI.renderPalette;
  UI.renderPalette = function () {
    const r = rp0.apply(this, arguments);
    const pal = $('#palette');
    if (pal && !pal.querySelector('.k6-ps')) {
      const up = document.createElement('button');
      up.className = 'k6-ps k6-up';
      up.dataset.palscroll = '-1';
      up.title = 'Yukarı kaydır';
      up.setAttribute('aria-label', 'Paleti yukarı kaydır');
      up.textContent = '▴';
      const dn = up.cloneNode();
      dn.className = 'k6-ps k6-dn';
      dn.dataset.palscroll = '1';
      dn.title = 'Aşağı kaydır';
      dn.setAttribute('aria-label', 'Paleti aşağı kaydır');
      dn.textContent = '▾';
      const t = pal.querySelector('[data-pal="target"]');
      if (t) t.after(up);
      else pal.prepend(up);
      pal.append(dn);
    }
    return r;
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-palscroll]');
    if (!b) return;
    e.stopPropagation();
    const pal = $('#palette');
    if (pal) pal.scrollBy({ top: +b.dataset.palscroll * 120, left: +b.dataset.palscroll * 120, behavior: 'smooth' });
  }, true);

  /* ================= scroll bars and navigator ================= */
  let bars = null;
  const extent = () => {
    const p = VP.page();
    const pr = new paper.Rectangle(0, 0, p.w, p.h);
    let r = pr.expand(Math.max(p.w, p.h) * 1.2);
    VP.userLayers().forEach((L) => L.children.forEach((it) => {
      if (it.visible && it.bounds && it.bounds.width >= 0) r = r.unite(it.bounds.expand(VP.toPT(20)));
    }));
    return r.unite(paper.view.bounds);
  };
  const makeBars = () => {
    const wrap = $('#canvas-wrap');
    if (!wrap || bars) return;
    const mk = (cls) => {
      const d = document.createElement('div');
      d.className = 'k6-sb ' + cls;
      d.innerHTML = '<div class="k6-th"></div>';
      wrap.appendChild(d);
      return d;
    };
    const h = mk('k6-h');
    const v = mk('k6-v');
    const nav = document.createElement('button');
    nav.className = 'k6-nav';
    nav.title = 'Gezgin';
    nav.setAttribute('aria-label', 'Gezgin: sayfanın küçük haritası');
    nav.innerHTML = svg('<rect x="3" y="3" width="18" height="18"/><rect x="8" y="8" width="8" height="8" fill="currentColor" opacity=".5"/>');
    wrap.appendChild(nav);
    bars = { h, v, nav };
    const drag = (bar, axis) => {
      bar.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const th = bar.firstChild;
        const ext = extent();
        const len = axis === 'x' ? bar.clientWidth : bar.clientHeight;
        const span = axis === 'x' ? ext.width : ext.height;
        if (e.target !== th) {
          // a tap on the track jumps there
          const r = bar.getBoundingClientRect();
          const f = axis === 'x' ? (e.clientX - r.left) / len : (e.clientY - r.top) / len;
          const c = paper.view.center;
          paper.view.center = axis === 'x' ? Pt(ext.left + f * span, c.y) : Pt(c.x, ext.top + f * span);
          VP.viewChanged();
          return;
        }
        const start = axis === 'x' ? e.clientX : e.clientY;
        const c0 = paper.view.center;
        bar.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const d = ((axis === 'x' ? ev.clientX : ev.clientY) - start) / len * span;
          paper.view.center = axis === 'x' ? Pt(c0.x + d, c0.y) : Pt(c0.x, c0.y + d);
          VP.viewChanged();
        };
        const up = () => {
          bar.removeEventListener('pointermove', move);
          bar.removeEventListener('pointerup', up);
          bar.removeEventListener('pointercancel', up);
        };
        bar.addEventListener('pointermove', move);
        bar.addEventListener('pointerup', up);
        bar.addEventListener('pointercancel', up);
      });
    };
    drag(h, 'x');
    drag(v, 'y');
    nav.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator(nav);
    });
  };
  const updateBars = () => {
    if (!bars || !paper.view) return;
    const ext = extent();
    const vb = paper.view.bounds;
    const set = (bar, a0, a1, e0, span) => {
      const th = bar.firstChild;
      const f0 = Math.max(0, (a0 - e0) / span);
      const f1 = Math.min(1, (a1 - e0) / span);
      const horiz = bar.classList.contains('k6-h');
      const L = horiz ? bar.clientWidth : bar.clientHeight;
      const size = Math.max(18, (f1 - f0) * L);
      const pos = Math.min(L - size, f0 * L);
      if (horiz) {
        th.style.left = pos + 'px';
        th.style.width = size + 'px';
      } else {
        th.style.top = pos + 'px';
        th.style.height = size + 'px';
      }
    };
    set(bars.h, vb.left, vb.right, ext.left, ext.width);
    set(bars.v, vb.top, vb.bottom, ext.top, ext.height);
  };
  const navigator = (anchor) => {
    const p = VP.page();
    try {
      VP.storePage && VP.storePage();
      VP.makeThumb && VP.makeThumb();
    } catch (e) { /* optional */ }
    const W = 200;
    const ext = extent();
    const sc = W / ext.width;
    const H = Math.round(ext.height * sc);
    const vb = paper.view.bounds;
    const rx = (x) => (x - ext.left) * sc;
    const ry = (y) => (y - ext.top) * sc;
    const html = '<div class="pop-head">Gezgin</div><div class="k6-map" style="width:' + W + 'px;height:' + H + 'px">' +
      '<div class="k6-mpage" style="left:' + rx(0) + 'px;top:' + ry(0) + 'px;width:' + p.w * sc + 'px;height:' + p.h * sc + 'px;' + (p.thumb ? 'background-image:url(' + p.thumb + ')' : '') + '"></div>' +
      '<div class="k6-mview" style="left:' + rx(vb.left) + 'px;top:' + ry(vb.top) + 'px;width:' + vb.width * sc + 'px;height:' + vb.height * sc + 'px"></div></div>' +
      '<div class="pop-sep"></div>' + UI.menuHTML(['fit', 'zoomSel', 'zoom100']);
    UI.popover(anchor, html, (id) => UI.run(id));
    const map = document.querySelector('.popover .k6-map');
    if (map) {
      const go = (e) => {
        const r = map.getBoundingClientRect();
        paper.view.center = Pt(ext.left + (e.clientX - r.left) / sc, ext.top + (e.clientY - r.top) / sc);
        VP.viewChanged();
        const v = map.querySelector('.k6-mview');
        const nb = paper.view.bounds;
        if (v) {
          v.style.left = rx(nb.left) + 'px';
          v.style.top = ry(nb.top) + 'px';
        }
      };
      map.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        go(e);
        map.setPointerCapture(e.pointerId);
        const mv = (ev) => go(ev);
        map.addEventListener('pointermove', mv);
        map.addEventListener('pointerup', () => map.removeEventListener('pointermove', mv), { once: true });
      });
    }
  };

  /* ================= status bar ================= */
  const cmykText = (hex) => {
    const cv = conv();
    if (!hex || !cv) return hex || '';
    const n = parseInt(hex.slice(1), 16);
    const k = cv.rgb2cmyk((n >> 16) & 255, (n >> 8) & 255, n & 255);
    return 'C:' + k[0] + ' M:' + k[1] + ' Y:' + k[2] + ' K:' + k[3];
  };
  const HINTS = {
    select: 'Döndürmek/eğmek için nesneye iki kez dokunun · Çift dokunuş: tüm nesneler · Shift: çoklu seçim',
    node: 'Düğüme dokunun: seçin · Sürükleyin: taşıyın · Çift dokunuş: düğüm ekle/sil',
    rect: 'Sürükleyerek dikdörtgen çizin · Ctrl: kare · Shift: merkezden',
    ellipse: 'Sürükleyerek elips çizin · Ctrl: daire · Shift: merkezden',
    polygon: 'Sürükleyerek çokgen çizin · Kenar sayısı özellik çubuğunda',
    text: 'Dokunun: sanatsal metin · Sürükleyin: paragraf metni çerçevesi',
    freehand: 'Sürükleyerek serbest çizin',
    brush: 'Sürükleyerek fırça darbesi uygulayın',
    pen: 'Dokunun: köşe düğümü · Sürükleyin: eğri · Çift dokunuş: bitir',
    zoom: 'Dokunun: yakınlaştır · Sürükleyin: alana yakınlaştır',
    hand: 'Sürükleyerek görünümü kaydırın',
    eyedropper: 'Rengini almak için bir nesneye dokunun'
  };
  const rs0 = UI.renderStatus;
  UI.renderStatus = function () {
    const r = rs0.apply(this, arguments);
    if (!classic()) return r;
    const chips = $('#st-chips');
    if (chips) {
      const f = chips.querySelector('[data-st="fill"] small');
      const s = chips.querySelector('[data-st="stroke"] small');
      const sel = VP.sel[0];
      const fill = sel ? VP.getFill(sel) : { type: VP.defaults.fill ? 'solid' : 'none', color: VP.defaults.fill };
      const st = sel ? VP.getStroke(sel) : { on: !!VP.defaults.stroke, color: VP.defaults.stroke, width: VP.defaults.strokeWidth };
      if (f) f.textContent = fill.type === 'none' || !fill.color ? 'Yok' : fill.type === 'solid' ? cmykText(fill.color) : fill.type === 'linear' || fill.type === 'radial' ? 'Geçişli dolgu' : 'Özel dolgu';
      if (s) s.textContent = st.on && st.color ? cmykText(st.color) + ' ' + (st.width <= VP.toPT(0.08) ? 'Saç teli' : VP.num(VP.toMM(st.width), 3) + ' mm') : 'Yok';
    }
    const info = $('#st-info');
    if (info && !VP.sel.length) {
      const h = HINTS[VP.toolId] || (VP.TOOL_META[VP.toolId] && VP.TOOL_META[VP.toolId].hint);
      if (h) info.textContent = h;
    }
    return r;
  };
  const rd0 = UI.renderDocPal;
  UI.renderDocPal = function () {
    const r = rd0.apply(this, arguments);
    const e = document.querySelector('#docpal .dp-empty');
    if (e) e.textContent = 'Renkleri (veya nesneleri) belgeyle saklamak için buraya sürükleyin';
    return r;
  };

  /* ================= property bar ================= */
  const ANCH = ['tl', 'tc', 'tr', 'ml', 'cc', 'mr', 'bl', 'bc', 'br'];
  const anc = () => S.trAnc || 'tl';
  const anchorPt = (b, a) => ({ tl: b.topLeft, tc: b.topCenter, tr: b.topRight, ml: b.leftCenter, cc: b.center, mr: b.rightCenter, bl: b.bottomLeft, bc: b.bottomCenter, br: b.bottomRight })[a] || b.topLeft;
  const MODE_ICONS = {
    preset: '<path d="M3 17c3-1 4-6 8-6s4 5 10 3" stroke-width="3" stroke-linecap="round"/>',
    brush: '<path d="M14 4l6 6-8 8H6v-6z"/><path d="M3 21c2 0 3-1 3-3"/>',
    sprayer: '<circle cx="6" cy="7" r="1.6" fill="currentColor"/><circle cx="12" cy="5" r="1.2" fill="currentColor"/><circle cx="17" cy="9" r="1.8" fill="currentColor"/><circle cx="9" cy="13" r="1.4" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="7" cy="19" r="1.6" fill="currentColor"/><circle cx="19" cy="19" r="1.4" fill="currentColor"/>',
    calligraphy: '<path d="M4 20l6-2 10-10-4-4L6 14z"/><path d="M14 6l4 4"/>',
    pressure: '<path d="M3 15c2 0 2-4 4-4s2 6 4 6 2-8 4-8 2 5 4 5h2" /><path d="M4 21h16" stroke-width="1"/>'
  };
  const MODE_LABEL = { preset: 'Ön ayar', sprayer: 'Püskürtme', calligraphy: 'Kaligrafi', pressure: 'Basınç' };
  const stepOf = (input) => {
    const u = input.parentNode && input.parentNode.querySelector('.unit');
    const t = u ? u.textContent : '';
    return t === 'mm' || t === 'cm' ? 0.1 : t === 'in' ? 0.01 : 1;
  };
  const addSpins = (pb) => {
    pb.querySelectorAll('.field input[data-pf][inputmode="decimal"]').forEach((inp) => {
      const lab = inp.closest('.field');
      if (!lab || lab.querySelector('.k6-spin') || lab.closest('.pb-stack')) return;
      const sp = document.createElement('span');
      sp.className = 'k6-spin';
      sp.innerHTML = '<button type="button" data-spin="1" tabindex="-1" aria-label="Artır">▴</button><button type="button" data-spin="-1" tabindex="-1" aria-label="Azalt">▾</button>';
      lab.appendChild(sp);
    });
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#propbar [data-spin]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const inp = b.closest('.field').querySelector('input[data-pf]');
    if (!inp) return;
    const v = VP.parseNum(inp.value);
    const st = stepOf(inp);
    const nv = (isFinite(v) ? v : 0) + st * +b.dataset.spin;
    inp.value = VP.num(Math.round(nv / st) * st, st < 1 ? 2 : 1);
    // through the normal change event, so unit conversion and every listener see it
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, true);
  const rpb0 = UI.renderPropbar;
  UI.renderPropbar = function () {
    const pb = $('#propbar');
    const busy = pb.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && UI._pbTyping;
    const r = rpb0.apply(this, arguments);
    if (busy || !classic()) return r;
    try {
      // artistic media modes as icons
      pb.querySelectorAll('[data-act^="d2Mode:"]').forEach((b) => {
        const k = b.dataset.act.slice(7);
        if (MODE_ICONS[k]) {
          b.innerHTML = svg(MODE_ICONS[k]);
          b.title = MODE_LABEL[k] || k;
          b.setAttribute('aria-label', b.title);
          b.classList.add('k6-mode');
        }
      });
      // reference point in front of X and Y
      const xy = pb.querySelector('.pb-stack [data-pf="x"]');
      if (xy && VP.sel.length) {
        const st = xy.closest('.pb-stack');
        if (!pb.querySelector('.k6-ref')) {
          const g = document.createElement('span');
          g.className = 'k6-ref';
          g.setAttribute('role', 'group');
          g.setAttribute('aria-label', 'Referans noktası');
          g.innerHTML = ANCH.map((a) => '<button type="button" data-k6ref="' + a + '" class="' + (a === anc() ? 'on' : '') + '" aria-label="Referans ' + a + '" aria-pressed="' + (a === anc()) + '"></button>').join('');
          st.before(g);
        }
        const b = VP.selBounds();
        const p = anchorPt(b, anc());
        const yi = pb.querySelector('.pb-stack [data-pf="y"]');
        xy.value = VP.num(VP.toMM(p.x), 2);
        if (yi) yi.value = VP.num(VP.toMM(p.y), 2);
      }
      addSpins(pb);
    } catch (e) { /* plain bar stays */ }
    return r;
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-k6ref]');
    if (!b) return;
    e.stopPropagation();
    S.trAnc = b.dataset.k6ref;
    try {
      VP.io.savePrefs();
    } catch (er) { /* optional */ }
    UI.schedule('prop', 'dock');
  }, true);
  // X and Y typed in the bar refer to the chosen reference point
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, raw, el) => {
    if ((n === 'x' || n === 'y') && classic() && anc() !== 'tl' && VP.sel.length && el && el.closest && el.closest('#propbar')) {
      const v = VP.parseNum(raw);
      if (!isFinite(v)) return true;
      const b = VP.selBounds();
      const p = anchorPt(b, anc());
      if (n === 'x') VP.setSelGeom({ x: VP.toPT(v) - (p.x - b.left) });
      else VP.setSelGeom({ y: VP.toPT(v) - (p.y - b.top) });
      return true;
    }
    return pf0(n, raw, el);
  };

  /* ================= standard bar drop-downs ================= */
  const histMenu = (anchor, future) => {
    const h = VP.hist;
    const items = [];
    if (future) for (let k = h.i + 1; k < h.stack.length && items.length < 20; k++) items.push(k);
    else for (let k = h.i - 1; k >= 0 && items.length < 20; k--) items.push(k);
    if (!items.length) return VP.toast(future ? 'Yinelenecek işlem yok' : 'Geri alınacak işlem yok');
    const html = '<div class="pop-head">' + (future ? 'Yinele' : 'Geri al') + '</div>' + items.map((k, n) => {
      const s = h.stack[future ? k : k + 1];
      return '<button class="pop-item" data-pick="' + k + '"><span>' + esc((s && s.label) || 'Adım') + '</span><span class="kbd">' + (n + 1) + '</span></button>';
    }).join('');
    UI.popover(anchor, html, (k) => {
      k = +k;
      if (k < 0 || k >= h.stack.length) return;
      h.i = k;
      VP.restore(h.stack[k]);
      UI.schedule('dock', 'top', 'prop', 'status');
    });
  };
  const addDropdowns = () => {
    const bar = $('#stdbar');
    if (!bar || bar.querySelector('.k6-dd')) return;
    const mk = (cmd, title, fn) => {
      const b = bar.querySelector('[data-cmd="' + cmd + '"]') || bar.querySelector('#btn-' + cmd);
      if (!b) return;
      const d = document.createElement('button');
      d.className = 'k6-dd';
      d.title = title;
      d.setAttribute('aria-label', title);
      d.textContent = '▾';
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        fn(d);
      });
      b.after(d);
    };
    mk('new', 'Yeni belge seçenekleri', (d) => UI.popover(d, UI.menuHTML(['new', 'newFromTemplate'].filter((x) => A[x])), (id) => UI.run(id)));
    mk('open', 'Son kullanılanlar', (d) => (VP.file2 && VP.file2.recentMenu ? VP.file2.recentMenu(d) : UI.run('open')));
    mk('undo', 'Geri alma listesi', (d) => histMenu(d, false));
    mk('redo', 'Yineleme listesi', (d) => histMenu(d, true));
  };

  /* ================= ruler unit ================= */
  const addUnit = () => {
    const st = $('#stage');
    if (!st || $('#k6-unit')) return;
    const u = document.createElement('div');
    u.id = 'k6-unit';
    u.textContent = 'milimetre';
    st.appendChild(u);
  };

  /* ================= context menu extras ================= */
  Object.assign(A, {
    k6PixGrid: { label: 'Piksel ızgarasına hizala', enabled: () => VP.sel.length > 0, run: () => VP.k3 && VP.k3.pixelGrid() },
    k6Link: { label: 'Bağlantılar ve yer imleri…', enabled: () => VP.sel.length > 0, run: () => (A.dockLinks ? A.dockLinks.run() : UI.openDock('links')) },
    k6StyleFrom: { label: 'Seçimden nesne stili oluştur…', enabled: () => VP.sel.length > 0, run: () => A.styleFromSel && A.styleFromSel.run() },
    k6Styles: { label: 'Nesne stilleri paneli', run: () => UI.openDock('styles') },
    k6ColorStyle: { label: 'Yeni renk stili…', enabled: () => VP.sel.length > 0, run: () => A.colorStyleNew && A.colorStyleNew.run() }
  });

  /* ================= look ================= */
  const R = 'html[data-skin="classic"]';
  const css = document.createElement('style');
  css.textContent = [
    // palette: one column, full height, scroll arrows
    'html[data-cd][data-skin="classic"] #palette{grid-template-columns:16px!important;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;padding:2px 3px!important}',
    'html[data-cd][data-skin="classic"] #palette .swatch{width:16px!important;height:13px!important}',
    'html[data-cd][data-skin="classic"] #palette .pal-target,html[data-cd][data-skin="classic"] #palette .swatch.none,html[data-cd][data-skin="classic"] #palette .swatch.add{width:16px!important}',
    '.k6-ps{display:none}',
    'html[data-cd][data-skin="classic"] .k6-ps{display:block;position:sticky;z-index:2;width:16px;height:12px;padding:0;border:0;background:#262626;color:#9a9a9a;font-size:10px;line-height:12px}',
    'html[data-cd][data-skin="classic"] .k6-up{top:0}html[data-cd][data-skin="classic"] .k6-dn{bottom:0}',
    '@media (pointer:coarse){html[data-cd][data-skin="classic"] #palette{grid-template-columns:22px!important}html[data-cd][data-skin="classic"] #palette .swatch,html[data-cd][data-skin="classic"] #palette .pal-target,html[data-cd][data-skin="classic"] #palette .swatch.none,html[data-cd][data-skin="classic"] #palette .swatch.add,html[data-cd][data-skin="classic"] .k6-ps{width:22px!important}html[data-cd][data-skin="classic"] #palette .swatch{height:18px!important}html[data-cd][data-skin="classic"] .k6-ps{height:18px}}',
    // scroll bars and navigator
    '.k6-sb,.k6-nav{display:none}',
    R + ' .k6-sb{display:block;position:absolute;z-index:3;background:var(--panel);opacity:.96}',
    R + ' .k6-h{left:0;right:11px;bottom:0;height:11px;border-top:1px solid var(--line)}',
    R + ' .k6-v{top:0;bottom:11px;right:0;width:11px;border-left:1px solid var(--line)}',
    '.k6-th{position:absolute;background:#8a8a8a;border-radius:5px;opacity:.75}',
    '.k6-h .k6-th{top:2px;height:6px}.k6-v .k6-th{left:2px;width:6px}',
    '.k6-sb:hover .k6-th{opacity:1}',
    R + ' .k6-nav{display:grid;place-items:center;position:absolute;z-index:3;right:0;bottom:0;width:11px;height:11px;padding:0;border:0;background:var(--panel);color:var(--muted)}',
    R + ' .k6-nav svg.i{width:9px;height:9px}',
    '@media (pointer:coarse){' + R + ' .k6-h{height:16px;right:16px}' + R + ' .k6-v{width:16px;bottom:16px}.k6-h .k6-th{top:3px;height:9px}.k6-v .k6-th{left:3px;width:9px}' + R + ' .k6-nav{width:16px;height:16px}' + R + ' .k6-nav svg.i{width:12px;height:12px}}',
    '.k6-map{position:relative;margin:6px 8px;background:#e9e9e9;border:1px solid var(--line);cursor:crosshair;touch-action:none}',
    '.k6-mpage{position:absolute;background:#fff center/100% 100% no-repeat;box-shadow:1px 1px 0 #aaa}',
    '.k6-mview{position:absolute;border:1.5px solid #e0342b;background:rgba(224,52,43,.08)}',
    // property bar
    '.k6-ref{display:none}',
    R + ' .k6-ref{display:inline-grid;grid-template-columns:repeat(3,6px);grid-template-rows:repeat(3,6px);gap:2px;margin:0 4px;flex:none}',
    R + ' .k6-ref button{width:6px;height:6px;padding:0;min-height:0;border:1px solid var(--muted);background:transparent;border-radius:1px}',
    R + ' .k6-ref button.on{background:var(--fg);border-color:var(--fg)}',
    '@media (pointer:coarse){' + R + ' .k6-ref{grid-template-columns:repeat(3,9px);grid-template-rows:repeat(3,9px)}' + R + ' .k6-ref button{width:9px;height:9px}}',
    '.k6-spin{display:none}',
    R + ' #propbar .k6-spin{display:inline-flex;flex-direction:column;margin-left:2px}',
    R + ' #propbar .k6-spin button{height:9px;width:11px;padding:0;border:0;background:transparent;color:var(--muted);font-size:8px;line-height:9px;min-height:0}',
    R + ' #propbar .k6-spin button:hover{color:var(--fg)}',
    '@media (pointer:coarse){' + R + ' #propbar .k6-spin button{height:14px;width:16px;font-size:10px}}',
    R + ' #propbar .k6-mode{width:28px;padding:0;justify-content:center}',
    // standard bar drop-down arrows
    '.k6-dd{display:none}',
    R + ' .k6-dd{display:inline-block;width:11px;height:24px;padding:0;margin-left:-3px;border:0;background:transparent;color:var(--muted);font-size:9px}',
    R + ' .k6-dd:hover{color:var(--fg);background:var(--cd-hover,rgba(127,127,127,.2))}',
    '@media (pointer:coarse){' + R + ' .k6-dd{width:16px;height:32px;font-size:11px}}',
    // document tabs: narrow, × on hover
    '@media (pointer:fine){html[data-cd][data-skin="classic"] .doc-tab{max-width:120px;min-width:80px}html[data-cd][data-skin="classic"] .doc-tab .doc-close{opacity:0}html[data-cd][data-skin="classic"] .doc-tab:hover .doc-close,html[data-cd][data-skin="classic"] .doc-tab.on .doc-close{opacity:1}}',
    // ruler unit at the end of the ruler
    '#k6-unit{display:none}',
    R + ' #k6-unit{display:block;position:absolute;top:0;right:12px;height:15px;line-height:15px;padding:0 4px;font-size:9px;color:var(--muted);background:var(--ruler);pointer-events:none;z-index:2}',
    R + ' #stage.no-rulers #k6-unit{display:none}',
    // the effects button is not on the desktop bar (effects stay in the Effects menu and the context menu)
    'html[data-cd][data-skin="classic"] #propbar [data-act="fxAddMenu"]{display:none}',
    // document palette row
    'html[data-cd][data-skin="classic"] #docpal .dp-label{display:none}',
    'html[data-cd][data-skin="classic"] #docpal .dp-empty{flex:1;text-align:center;font-style:italic;color:var(--muted);font-size:10.5px}'
  ].join('\n');
  document.head.appendChild(css);

  const start = () => {
    startPalette();
    makeBars();
    addDropdowns();
    addUnit();
    updateBars();
    VP.on('view', updateBars);
    VP.on('page', updateBars);
    VP.on('change', updateBars);
    addEventListener('resize', () => setTimeout(updateBars, 50));
    UI.renderStatus && UI.renderStatus();
    UI.renderDocPal && ((UI._dpKey = null), UI.renderDocPal());
    UI.renderPropbar && UI.renderPropbar();
  };
  if (document.readyState === 'complete') setTimeout(start, 40);
  else addEventListener('load', () => setTimeout(start, 40));
})();
