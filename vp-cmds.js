/* VektörPad workspace commands: menu items of a desktop drawing suite that are not tools —
   files, view (guides, snapping, preview, page sorter), layout, object, bitmap, text and table commands,
   options, theme and toolbar visibility. Loaded after vp-ui.js and vp-text.js. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const $ = (s) => document.querySelector(s);
  const Pt = (x, y) => new paper.Point(x, y);
  const zoom = () => paper.view.zoom;
  const S = VP.settings;
  const hasSel = () => VP.sel.length > 0;
  const def = (k, v) => {
    if (S[k] === undefined) S[k] = v;
  };
  def('guides', true);
  def('snapGuides', true);
  def('snapObjects', false);
  def('nudgeMM', 1);
  def('superNudgeMM', 10);
  def('theme', 'auto');
  const savePrefs = () => VP.io.savePrefs();
  // Follow-up choices open under the menu they came from (or the compact menu button).
  const menuAnchor = (m) => {
    const b = $('.menu-btn[data-menu="' + m + '"]');
    if (b && b.offsetParent) return b;
    const all = $('#btn-menu-all');
    return all && all.offsetParent ? all : $('#stdbar');
  };
  const refreshAll = () => UI.schedule('prop', 'dock', 'status', 'top', 'palette', 'rulers');

  /* =============== guidelines =============== */
  const guideLayer = () => {
    if (VP.guideLayer && paper.project.layers.includes(VP.guideLayer)) return VP.guideLayer;
    const L = new paper.Layer({ name: '__guides', insert: false });
    L.data.sys = true;
    paper.project.addLayer(L);
    VP.guideLayer = L;
    VP.keepSysOrder();
    if (VP.activeLayer) VP.activeLayer.activate();
    return L;
  };
  const guides = () => VP.page().guides || [];
  VP.guideDrag = null; // {o, p, i?} while a guide is being dragged
  VP.drawGuides = () => {
    if (!paper.view || !VP.doc) return;
    const L = guideLayer();
    L.removeChildren();
    if (!S.guides) return;
    const vb = paper.view.bounds.expand(20 / zoom());
    const s = 1 / zoom();
    const list = guides().map((g, i) => (VP.guideDrag && VP.guideDrag.i === i ? null : g)).filter(Boolean);
    if (VP.guideDrag) list.push(Object.assign({ live: true }, VP.guideDrag));
    list.forEach((g) => {
      const line = g.o === 'h' ? new paper.Path.Line({ from: [vb.left, g.p], to: [vb.right, g.p], insert: false }) : new paper.Path.Line({ from: [g.p, vb.top], to: [g.p, vb.bottom], insert: false });
      line.strokeColor = g.live ? '#d6362b' : '#2f7fe0';
      line.strokeWidth = s;
      line.dashArray = [5 * s, 3 * s];
      line.opacity = g.live ? 1 : 0.85;
      L.addChild(line);
    });
  };
  const setGuides = (list) => {
    VP.page().guides = list;
    VP.drawGuides();
  };
  const guideAt = (pt) => {
    if (!S.guides) return null;
    const tol = (VP.coarse ? 10 : 6) / zoom();
    let best = null;
    guides().forEach((g, i) => {
      const d = g.o === 'h' ? Math.abs(pt.y - g.p) : Math.abs(pt.x - g.p);
      if (d <= tol && (!best || d < best.d)) best = { i, o: g.o, d };
    });
    return best;
  };
  VP.on('view', VP.drawGuides);
  VP.on('page', VP.drawGuides);
  VP.on('change', VP.drawGuides);
  // Drag from a ruler onto the page to create a guide.
  const bindRuler = (cv, o) => {
    if (!cv) return;
    cv.addEventListener('pointerdown', (e) => {
      if (!S.rulers) return;
      e.preventDefault();
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
      if (!S.guides) {
        S.guides = true;
        savePrefs();
      }
      const canvas = $('#canvas');
      const at = (ev) => {
        const r = canvas.getBoundingClientRect();
        const vpt = Pt(ev.clientX - r.left, ev.clientY - r.top);
        const p = VP.snapPt(paper.view.viewToProject(vpt));
        return { inside: vpt.x >= 0 && vpt.y >= 0 && vpt.x <= r.width && vpt.y <= r.height, p: o === 'h' ? p.y : p.x };
      };
      VP.guideDrag = { o, p: at(e).p };
      const move = (ev) => {
        VP.guideDrag = { o, p: at(ev).p };
        VP.drawGuides();
      };
      const up = (ev) => {
        cv.removeEventListener('pointermove', move);
        cv.removeEventListener('pointerup', up);
        cv.removeEventListener('pointercancel', up);
        const a = at(ev);
        VP.guideDrag = null;
        if (a.inside && ev.type === 'pointerup') {
          setGuides(guides().concat([{ o, p: a.p }]));
          VP.commit();
          VP.toast((o === 'h' ? 'Yatay' : 'Dikey') + ' kılavuz eklendi · Cetvele geri sürükleyin: silinir');
        } else VP.drawGuides();
      };
      cv.addEventListener('pointermove', move);
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
    });
  };
  bindRuler($('#ruler-top'), 'h');
  bindRuler($('#ruler-left'), 'v');
  // The pick tool moves guides that are not covered by an object; dropping one on a ruler deletes it.
  const sel = VP.tools.select;
  const down0 = sel.down;
  const move0 = sel.move;
  const up0 = sel.up;
  sel.down = function (e) {
    if (S.guides && !VP.hitHandle(e.point) && !VP.hitItem(e.point)) {
      const g = guideAt(e.point);
      if (g) {
        this.op = { type: 'guide', i: g.i, o: g.o, changed: false };
        VP.guideDrag = { o: g.o, p: guides()[g.i].p, i: g.i };
        VP.drawGuides();
        return;
      }
    }
    return down0.call(this, e);
  };
  sel.move = function (e) {
    const op = this.op;
    if (op && op.type === 'guide') {
      const p = VP.snapPt(e.point);
      VP.guideDrag = { o: op.o, p: op.o === 'h' ? p.y : p.x, i: op.i };
      op.changed = true;
      op.out = e.vpt.x < 0 || e.vpt.y < 0;
      VP.drawGuides();
      return;
    }
    return move0.call(this, e);
  };
  sel.up = function (e) {
    const op = this.op;
    if (op && op.type === 'guide') {
      this.op = null;
      const d = VP.guideDrag;
      VP.guideDrag = null;
      if (op.changed && d) {
        const list = guides().slice();
        if (op.out) {
          list.splice(op.i, 1);
          VP.toast('Kılavuz silindi');
        } else list[op.i] = { o: op.o, p: d.p };
        setGuides(list);
        VP.commit();
      } else VP.drawGuides();
      return;
    }
    return up0.call(this, e);
  };

  /* =============== snapping to guides and objects =============== */
  const snap0 = VP.snapPt;
  const objectPoints = () => {
    const out = [];
    VP.userLayers().forEach((L) => {
      if (!L.visible) return;
      L.children.forEach((it) => {
        if (!it.visible || VP.sel.includes(it) || (VP.snapExclude && VP.snapExclude.includes(it))) return;
        const b = it.bounds;
        [b.topLeft, b.topCenter, b.topRight, b.leftCenter, b.center, b.rightCenter, b.bottomLeft, b.bottomCenter, b.bottomRight].forEach((p) => out.push(p));
        if (it instanceof paper.Path && it.segments.length <= 200) it.segments.forEach((sg) => out.push(sg.point));
      });
    });
    return out;
  };
  VP.snapObjectPoint = (pt, tolPx) => {
    const tol = (tolPx || (VP.coarse ? 12 : 8)) / zoom();
    let best = null;
    let bd = tol;
    objectPoints().forEach((p) => {
      const d = p.getDistance(pt);
      if (d < bd) {
        bd = d;
        best = p;
      }
    });
    return best ? best.clone() : null;
  };
  VP.snapPt = (pt) => {
    let q = snap0(pt);
    const tol = (VP.coarse ? 10 : 7) / zoom();
    if (S.snapObjects) {
      const o = VP.snapObjectPoint(pt);
      if (o) q = o;
    }
    if (S.snapGuides && S.guides) {
      let gx = null;
      let gy = null;
      guides().forEach((g) => {
        if (g.o === 'h' && Math.abs(pt.y - g.p) < tol && (gy == null || Math.abs(pt.y - g.p) < Math.abs(pt.y - gy))) gy = g.p;
        if (g.o === 'v' && Math.abs(pt.x - g.p) < tol && (gx == null || Math.abs(pt.x - g.p) < Math.abs(pt.x - gx))) gx = g.p;
      });
      if (gx != null || gy != null) q = Pt(gx != null ? gx : q.x, gy != null ? gy : q.y);
    }
    return q;
  };

  /* =============== page number fields =============== */
  const updatePageFields = () => {
    VP.userLayers().forEach((L) => L.getItems({ match: (it) => it.data && it.data.pageField }).forEach((t) => (t.content = String(VP.doc.active + 1))));
  };
  VP.on('page', updatePageFields);

  /* =============== theme =============== */
  const applyTheme = () => {
    const t = S.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    VP.readColors();
    if (paper.project) {
      VP.drawPage();
      VP.drawOverlay();
    }
    UI.drawRulers && UI.drawRulers();
  };
  VP.on('doc', () => {
    applyTheme();
    UI.applyBars();
    VP.drawGuides();
  });

  /* =============== text helpers =============== */
  const tx = () => VP.tx;
  // Calls fn(get, set) for every piece of text on the current page (artistic, paragraph, path text, table cells).
  const forEachText = (fn, onlySel) => {
    const roots = onlySel ? VP.sel : VP.allSelectable();
    const visit = (it, top) => {
      if (it instanceof paper.PointText) {
        if (it.data && it.data.pageField) return;
        fn(() => it.content, (v) => (it.content = v), top);
        return;
      }
      const fx = it.data && it.data.effect;
      if (fx && (fx.type === 'paragraph' || fx.type === 'textpath')) {
        fn(() => fx.text, (v) => {
          fx.text = v;
          VP.fx.rebuild(it);
        }, top);
        return;
      }
      if (fx && fx.type === 'table') {
        fx.cells.forEach((row) => row.forEach((c) => fn(() => c.t, (v) => {
          c.t = v;
          VP.fx.rebuild(it);
        }, top)));
        return;
      }
      if (fx) return;
      if (it.children) it.children.forEach((c) => visit(c, top));
    };
    roots.forEach((r) => visit(r, r));
  };
  const lowerTR = (s) => s.toLocaleLowerCase('tr');
  const findAll = (text, q, cs) => {
    const out = [];
    if (!q) return out;
    const a = cs ? text : lowerTR(text);
    const b = cs ? q : lowerTR(q);
    let i = a.indexOf(b);
    while (i >= 0) {
      out.push(i);
      i = a.indexOf(b, i + Math.max(1, b.length));
    }
    return out;
  };
  const replaceAll = (text, q, r, cs) => {
    const idx = findAll(text, q, cs);
    if (!idx.length) return { s: text, n: 0 };
    let s = '';
    let last = 0;
    idx.forEach((i) => {
      s += text.slice(last, i) + r;
      last = i + q.length;
    });
    return { s: s + text.slice(last), n: idx.length };
  };
  const CASES = {
    sentence: (s) => lowerTR(s).replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr')),
    lower: (s) => lowerTR(s),
    upper: (s) => s.toLocaleUpperCase('tr'),
    title: (s) => lowerTR(s).replace(/(^|[\s\-–—(“"'/])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr')),
    toggle: (s) => Array.from(s).map((ch) => (ch === ch.toLocaleUpperCase('tr') ? ch.toLocaleLowerCase('tr') : ch.toLocaleUpperCase('tr'))).join('')
  };

  /* =============== dialogs =============== */
  const docProps = () => {
    const pages = VP.doc.pages;
    const p = VP.page();
    let objects = 0;
    VP.userLayers().forEach((L) => (objects += L.children.length));
    UI.modal(
      '<h2>Belge özellikleri</h2><label class="field wide" style="height:40px"><span>Ad</span><input id="dp-name" value="' + esc(VP.doc.name) + '" style="width:100%" spellcheck="false"></label>' +
        '<dl class="help-grid"><dt>Sayfa</dt><dd>' + pages.length + '</dd><dt>Etkin sayfa</dt><dd>' + esc(p.name) + ' · ' + H.mm(p.w, 1) + ' × ' + H.mm(p.h, 1) + ' mm</dd>' +
        '<dt>Katman</dt><dd>' + VP.userLayers().length + '</dd><dt>Nesne</dt><dd>' + objects + ' (bu sayfada)</dd>' +
        '<dt>Kılavuz</dt><dd>' + guides().length + '</dd><dt>Arka plan</dt><dd>' + (p.bg ? esc(p.bg) : 'Beyaz') + '</dd></dl>' +
        '<div class="actions"><button class="btn" data-x="no">Kapat</button><button class="btn primary" data-x="yes">Kaydet</button></div>',
      (root, close) => root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'yes') {
          const n = root.querySelector('#dp-name').value.trim();
          if (n) {
            VP.doc.name = n;
            VP.dirty();
            UI.schedule('top');
          }
        }
        close();
      })
    );
  };
  const findReplace = () => {
    UI.modal(
      '<h2>Bul ve değiştir</h2>' +
        '<label class="field wide" style="height:40px"><span>Bul</span><input id="fr-q" style="width:100%" spellcheck="false"></label>' +
        '<label class="field wide" style="height:40px"><span>Değiştir</span><input id="fr-r" style="width:100%" spellcheck="false"></label>' +
        '<div class="row"><button class="btn" data-x="cs" aria-pressed="false">Büyük/küçük harf duyarlı</button><button class="btn" data-x="selonly" aria-pressed="false">Yalnızca seçimde</button></div>' +
        '<p id="fr-msg">Sayfadaki tüm metinlerde arar: sanatsal ve paragraf metni, yoldaki metin, tablo hücreleri.</p>' +
        '<div class="actions"><button class="btn" data-x="no">Kapat</button><button class="btn" data-x="find">' + ic('search', 'sm') + 'Sonrakini bul</button><button class="btn primary" data-x="all">Tümünü değiştir</button></div>',
      (root, close) => {
        const st = { cs: false, selonly: false, last: -1 };
        const msg = root.querySelector('#fr-msg');
        const q = root.querySelector('#fr-q');
        setTimeout(() => q.focus(), 30);
        root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-x]');
          if (!b) return;
          const x = b.dataset.x;
          if (x === 'no') return close();
          if (x === 'cs' || x === 'selonly') {
            st[x] = !st[x];
            b.classList.toggle('on', st[x]);
            b.setAttribute('aria-pressed', st[x]);
            return;
          }
          const needle = q.value;
          if (!needle) return (msg.textContent = 'Aranacak metni yazın');
          if (x === 'find') {
            const hits = [];
            forEachText((get, set, top) => {
              if (findAll(get(), needle, st.cs).length && !hits.includes(top)) hits.push(top);
            }, st.selonly);
            if (!hits.length) return (msg.textContent = '“' + needle + '” bulunamadı');
            st.last = (st.last + 1) % hits.length;
            VP.setTool('select');
            VP.setSelection([hits[st.last]]);
            VP.zoomToRect(hits[st.last].bounds.expand(VP.toPT(20)));
            msg.textContent = hits.length + ' nesnede bulundu · ' + (st.last + 1) + '. gösteriliyor';
            return;
          }
          let n = 0;
          forEachText((get, set) => {
            const r = replaceAll(get(), needle, root.querySelector('#fr-r').value, st.cs);
            if (r.n) {
              set(r.s);
              n += r.n;
            }
          }, st.selonly);
          if (n) VP.commit();
          msg.textContent = n ? n + ' yerde değiştirildi' : '“' + needle + '” bulunamadı';
        });
      }
    );
  };
  const fullPreview = async () => {
    VP.storePage();
    const p = VP.page();
    const dpr = window.devicePixelRatio || 1;
    let res = 72 * Math.min((innerWidth * dpr * 0.96) / p.w, (innerHeight * dpr * 0.92) / p.h);
    while (((p.w * res) / 72) * ((p.h * res) / 72) > 16e6) res *= 0.8;
    const g = VP.composePageGroup({ white: true, res });
    const url = g.rasterize(res, false).toDataURL();
    const el = document.createElement('div');
    el.className = 'fs-preview';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Tam ekran önizleme');
    el.innerHTML = '<img alt="Sayfa önizlemesi" src="' + url + '"><div class="fs-note">' + esc(p.name) + ' · Kapatmak için dokunun veya Esc</div>';
    const close = () => {
      el.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'F9') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    el.addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
  };
  const pageSorter = () => {
    VP.storePage();
    VP.makeThumb();
    const el = document.createElement('div');
    el.className = 'sorter';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Sayfa sıralayıcı');
    const render = () => {
      const a = VP.doc.active;
      el.innerHTML = '<div class="sorter-head"><h2>Sayfa sıralayıcı görünümü</h2><button class="btn" data-s="add">' + ic('plus', 'sm') + 'Sayfa ekle</button><button class="btn primary" data-s="close">Kapat</button></div>' +
        '<div class="sorter-grid">' + VP.doc.pages.map((p, i) => '<div class="sorter-card' + (i === a ? ' on' : '') + '"><button class="st" data-s="go" data-i="' + i + '" aria-label="' + esc(p.name) + ' sayfasına git" style="border:0;background:transparent">' + (p.thumb ? '<img alt="" src="' + p.thumb + '">' : '') + '</button><b>' + (i + 1) + '. ' + esc(p.name) + '</b>' +
          '<div class="row"><button class="pn-btn" data-s="left" data-i="' + i + '" aria-label="Sola taşı"' + (i === 0 ? ' disabled' : '') + '>' + ic('chevLeft', 'sm') + '</button><button class="pn-btn" data-s="dup" data-i="' + i + '" aria-label="Çoğalt">' + ic('duplicate', 'sm') + '</button><button class="pn-btn" data-s="right" data-i="' + i + '" aria-label="Sağa taşı"' + (i === VP.doc.pages.length - 1 ? ' disabled' : '') + '>' + ic('chevRight', 'sm') + '</button></div></div>').join('') + '</div>';
    };
    render();
    const close = () => {
      el.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]');
      if (!b) return;
      const i = +b.dataset.i;
      const k = b.dataset.s;
      if (k === 'close') return close();
      if (k === 'go') {
        VP.gotoPage(i);
        return close();
      }
      if (k === 'add') VP.addPage();
      if (k === 'dup') VP.duplicatePage(i);
      if (k === 'left') VP.movePage(i, -1);
      if (k === 'right') VP.movePage(i, 1);
      VP.storePage();
      VP.makeThumb();
      render();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
  };
  const pageBg = () => {
    const p = VP.page();
    UI.modal(
      '<h2>Sayfa arka planı</h2><div class="row"><input type="color" id="pb-c" value="' + esc(p.bg || '#ffffff') + '" style="width:72px;height:56px;border:0;padding:0;background:transparent"><p>Arka plan rengi ekranda, PNG, SVG ve PDF çıktılarında görünür.</p></div>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn" data-x="none">Beyaz (yok)</button><button class="btn primary" data-x="yes">Uygula</button></div>',
      (root, close) => root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x !== 'no') {
          p.bg = b.dataset.x === 'yes' ? root.querySelector('#pb-c').value : null;
          VP.drawPage();
          VP.commit();
        }
        close();
      })
    );
  };
  const GLYPHS = '₺ € $ £ ¥ ¢ © ® ™ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ π µ Ω ‰ % § ¶ • · … – — “ ” ‘ ’ « » ‹ › ½ ¼ ¾ ¹ ² ³ → ← ↑ ↓ ↔ ⇒ ★ ☆ ✓ ✗ ✔ ✘ ♥ ♦ ♣ ♠ ☎ ✉ ☀ ☁ ☂ ♪ ♫ ⚑ ⌀ △ ▲ ▽ ▼ ◆ ◇ ■ □ ● ○ ğ Ğ ü Ü ş Ş ı İ ö Ö ç Ç â Â î Î û Û'.split(' ');
  const insertGlyph = () => {
    UI.modal(
      '<h2>Glif ekle</h2><p>Bir karaktere dokunun: yazılan metne, seçili metne veya sayfaya eklenir.</p><div class="glyph-grid">' + GLYPHS.map((g) => '<button data-g="' + esc(g) + '" aria-label="' + esc(g) + '">' + esc(g) + '</button>').join('') + '</div>' +
        '<div class="actions"><button class="btn primary" data-x="no">Kapat</button></div>',
      (root, close) => root.addEventListener('click', (e) => {
        if (e.target.closest('[data-x]')) return close();
        const b = e.target.closest('[data-g]');
        if (!b) return;
        const g = b.dataset.g;
        const live = [$('#text-editor'), $('#rich-editor textarea')].find((t) => t && !t.hidden && t.offsetParent !== null && !(t.closest('#rich-editor') && t.closest('#rich-editor').hidden));
        if (live) {
          const s0 = live.selectionStart != null ? live.selectionStart : live.value.length;
          const s1 = live.selectionEnd != null ? live.selectionEnd : s0;
          live.value = live.value.slice(0, s0) + g + live.value.slice(s1);
          live.dispatchEvent(new Event('input'));
          return;
        }
        const t = VP.sel.find((it) => it instanceof paper.PointText);
        if (t) {
          t.content += g;
          VP.commit();
          return;
        }
        const p = VP.page();
        const nt = VP.createText(Pt(p.w / 2, p.h / 2), g);
        nt.justification = 'center';
        nt.fontSize = 48;
        VP.setSelection([nt]);
        VP.commit();
      })
    );
  };
  const options = () => {
    UI.modal(
      '<h2>Seçenekler</h2>' +
        '<div class="row"><label class="field"><span>Izgara aralığı</span><input id="op-grid" value="' + VP.num(S.gridMM, 2) + '" inputmode="decimal"><span class="unit">mm</span></label></div>' +
        '<div class="row"><label class="field"><span>Ok tuşu kaydırma</span><input id="op-n1" value="' + VP.num(S.nudgeMM, 2) + '" inputmode="decimal"><span class="unit">mm</span></label>' +
        '<label class="field"><span>Shift ile</span><input id="op-n2" value="' + VP.num(S.superNudgeMM, 2) + '" inputmode="decimal"><span class="unit">mm</span></label></div>' +
        '<div class="row"><span class="opt-label">Tema</span><span class="seg" id="op-theme">' + [['auto', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']].map(([v, l]) => '<button data-t="' + v + '" class="' + (S.theme === v ? 'on' : '') + '">' + l + '</button>').join('') + '</span></div>' +
        '<div class="row"><button class="btn' + (S.keepRatio ? ' on' : '') + '" data-o="keepRatio">Ölçeklerken oranı koru</button><button class="btn' + (S.pencilOnly ? ' on' : '') + '" data-o="pencilOnly">Yalnızca Apple Pencil ile çiz</button></div>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Tamam</button></div>',
      (root, close) => {
        const st = { theme: S.theme, keepRatio: S.keepRatio, pencilOnly: S.pencilOnly };
        root.addEventListener('click', (e) => {
          const t = e.target.closest('[data-t]');
          if (t) {
            st.theme = t.dataset.t;
            root.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b === t));
            return;
          }
          const o = e.target.closest('[data-o]');
          if (o) {
            st[o.dataset.o] = !st[o.dataset.o];
            o.classList.toggle('on', st[o.dataset.o]);
            return;
          }
          const b = e.target.closest('[data-x]');
          if (!b) return;
          if (b.dataset.x === 'yes') {
            const n = (id) => VP.parseNum(root.querySelector(id).value);
            if (n('#op-grid') > 0.1) S.gridMM = n('#op-grid');
            if (n('#op-n1') > 0) S.nudgeMM = n('#op-n1');
            if (n('#op-n2') > 0) S.superNudgeMM = n('#op-n2');
            Object.assign(S, st);
            applyTheme();
            VP.drawGrid();
            savePrefs();
            refreshAll();
          }
          close();
        });
      }
    );
  };
  const info = (title, html) =>
    UI.modal('<h2>' + esc(title) + '</h2>' + html + '<div class="actions"><button class="btn primary" data-x="ok">Tamam</button></div>', (root, close) => root.addEventListener('click', (e) => e.target.closest('[data-x]') && close()));

  /* =============== object commands =============== */
  // Outline of the whole selection as a new curve.
  const createBoundary = () => {
    if (!VP.sel.length) return VP.toast('Önce nesne seçin');
    const holder = new paper.Group({ insert: false });
    VP.sel.forEach((it) => holder.addChild(it.clone({ insert: false })));
    const flat = (it) => {
      if (it instanceof paper.Group) it.applyMatrix = true;
      if (it.children) it.children.slice().forEach(flat);
    };
    flat(holder);
    const shapes = [];
    const walk = (it) => {
      if (it.data && it.data.hitOnly) return;
      if (it instanceof paper.PointText) {
        const cp = VP.textToPath(it);
        if (cp) shapes.push(cp);
        else shapes.push(new paper.Path.Rectangle({ rectangle: it.bounds, insert: false }));
        return;
      }
      if (it instanceof paper.Raster) return shapes.push(new paper.Path.Rectangle({ rectangle: it.bounds, insert: false }));
      if (it instanceof paper.CompoundPath || (it instanceof paper.Path && it.closed)) return shapes.push(it);
      if (it instanceof paper.Path) return;
      if (it.children) it.children.slice().forEach(walk);
    };
    walk(holder);
    if (!shapes.length) return VP.toast('Sınır için kapalı şekil gerekiyor');
    let acc = shapes[0].clone({ insert: false });
    try {
      for (let i = 1; i < shapes.length; i++) acc = acc.unite(shapes[i], { insert: false });
    } catch (e) {
      return VP.toast('Sınır oluşturulamadı');
    }
    acc.fillColor = null;
    acc.strokeColor = new paper.Color('#1d1d1b');
    acc.strokeWidth = 0.75;
    acc.data = {};
    acc.insertAbove(VP.zSort(VP.sel).pop());
    VP.setSelection([acc]);
    VP.commit();
    VP.toast('Sınır oluşturuldu');
  };
  const forEachItem = (fn) => VP.userLayers().forEach((L) => L.children.forEach(fn));

  /* =============== bitmaps =============== */
  const rasters = () => VP.sel.filter((it) => it instanceof paper.Raster);
  const toBitmap = () => {
    if (!VP.sel.length) return VP.toast('Önce nesne seçin');
    UI.popover(menuAnchor('bitmaps'), [72, 150, 300].map((d) => '<button class="pop-item" data-pick="' + d + '">' + d + ' dpi</button>').join(''), (d) => {
      const items = VP.zSort(VP.sel);
      const g = new paper.Group({ insert: false });
      items.forEach((it) => g.addChild(it.clone({ insert: false })));
      let r;
      try {
        r = g.rasterize(+d, false);
      } catch (e) {
        return VP.toast('Biteşleme dönüştürülemedi');
      }
      r.insertAbove(items[items.length - 1]);
      items.forEach((it) => it.remove());
      VP.setSelection([r]);
      VP.commit();
      VP.toast('Biteşleme dönüştürüldü (' + d + ' dpi)');
    });
  };
  const pixelOp = (fn) => {
    const rs = rasters();
    if (!rs.length) return VP.toast('Biteşlem seçin · Vektörler için önce Biteşlemler › Biteşleme dönüştür');
    rs.forEach((r) => {
      const rect = new paper.Rectangle(0, 0, r.width, r.height);
      const id = r.getImageData(rect);
      fn(id.data);
      r.setImageData(id, Pt(0, 0));
    });
    VP.commit();
  };
  const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const bmpAdjust = () => {
    const rs = rasters();
    if (!rs.length) return VP.toast('Biteşlem seçin · Vektörler için önce Biteşlemler › Biteşleme dönüştür');
    const orig = rs.map((r) => r.getImageData(new paper.Rectangle(0, 0, r.width, r.height)));
    const apply = (b, c) => {
      const k = (259 * (c + 255)) / (255 * (259 - c));
      rs.forEach((r, n) => {
        const src = orig[n].data;
        const out = new ImageData(new Uint8ClampedArray(src), orig[n].width, orig[n].height);
        const d = out.data;
        for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) d[i + j] = k * (d[i + j] + b - 128) + 128;
        r.setImageData(out, Pt(0, 0));
      });
    };
    UI.modal(
      '<h2>Parlaklık ve karşıtlık</h2>' +
        '<label class="range"><span class="pb-label">Parlaklık</span><input type="range" id="ba-b" min="-100" max="100" value="0"><output>0</output></label>' +
        '<label class="range"><span class="pb-label">Karşıtlık</span><input type="range" id="ba-c" min="-100" max="100" value="0"><output>0</output></label>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">Uygula</button></div>',
      (root, close) => {
        const b = root.querySelector('#ba-b');
        const c = root.querySelector('#ba-c');
        const upd = () => {
          b.nextElementSibling.textContent = b.value;
          c.nextElementSibling.textContent = c.value;
          apply(+b.value * 1.28, +c.value * 1.28);
        };
        b.addEventListener('input', upd);
        c.addEventListener('input', upd);
        root.addEventListener('click', (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'yes') VP.commit();
          else rs.forEach((r, n) => r.setImageData(orig[n], Pt(0, 0)));
          close();
        });
      }
    );
  };

  /* =============== tables =============== */
  const curTable = () => VP.sel.find((it) => VP.tx.is(it, 'table'));
  const tableRange = (g) => VP.tx.selRange(g) || { r0: 0, c0: 0, r1: 0, c1: 0 };
  const tableOp = (fn) => () => {
    const g = curTable();
    if (!g) return VP.toast('Önce bir tablo seçin');
    const fx = g.data.effect;
    if (fn(fx, tableRange(g), g) === false) return;
    VP.fx.rebuild(g);
    VP.commit();
  };
  const selectCells = (g, r0, c0, r1, c1) => {
    VP.setSelection([g]);
    VP.setTool('tableTool');
    VP.tx.setCellSel(g, { r: r0, c: c0 }, { r: r1, c: c1 });
    VP.drawOverlay();
    UI.schedule('prop');
  };
  const textToTable = () => {
    const t = VP.sel.find((it) => it instanceof paper.PointText || VP.tx.is(it, 'paragraph'));
    if (!t) return VP.toast('Önce bir metin seçin');
    const raw = t instanceof paper.PointText ? t.content : t.data.effect.text;
    const lines = String(raw).replace(/\r/g, '').split('\n').filter((l) => l.trim());
    if (!lines.length) return;
    const delim = /\t/.test(raw) ? '\t' : /;/.test(raw) ? ';' : /,/.test(raw) ? ',' : null;
    const rows = lines.map((l) => (delim ? l.split(delim).map((c) => c.trim()) : [l.trim()]));
    const cols = Math.max(...rows.map((r) => r.length));
    const b = t.bounds;
    const font = t instanceof paper.PointText ? { family: t.fontFamily, size: Math.min(t.fontSize, 14), bold: false, italic: false } : Object.assign({}, t.data.effect.font);
    const cw = Math.max(b.width / cols, VP.toPT(20));
    const rh = font.size * 2;
    const fx = {
      type: 'table', x: b.left, y: b.top, colW: new Array(cols).fill(cw), rowH: new Array(rows.length).fill(rh),
      cells: rows.map((r) => Array.from({ length: cols }, (_, i) => ({ t: r[i] || '' }))), merges: [],
      font, color: '#1d1d1b', pad: Math.max(2, font.size * 0.35), border: 'all', bColor: '#1d1d1b', bWidth: 0.75,
      header: true, headerFill: '#e3e9f0', fill: null, align: 'left', valign: 'middle'
    };
    const g = new paper.Group({ insert: false, applyMatrix: false });
    g.data.effect = fx;
    g.insertAbove(t);
    t.remove();
    VP.fx.rebuild(g);
    VP.setSelection([g]);
    VP.commit();
    VP.toast(rows.length + ' × ' + cols + ' tablo oluşturuldu' + (delim ? '' : ' · Sütun ayırmak için sekme, noktalı virgül veya virgül kullanın'));
  };
  const tableToText = () => {
    const g = curTable();
    if (!g) return VP.toast('Önce bir tablo seçin');
    const fx = g.data.effect;
    const content = fx.cells.map((row) => row.map((c) => String(c.t || '').replace(/\n/g, ' ')).join('\t')).join('\n');
    const t = VP.createText(g.localToGlobal(Pt(fx.x, fx.y + fx.font.size)), content);
    t.fontFamily = fx.font.family;
    t.fontSize = fx.font.size;
    t.fillColor = fx.color;
    t.remove();
    t.insertAbove(g);
    g.remove();
    VP.setSelection([t]);
    VP.commit();
    VP.toast('Tablo metne dönüştürüldü · Hücreler sekmeyle ayrıldı');
  };

  /* =============== actions =============== */
  const toggleSetting = (k, after) => () => {
    S[k] = !S[k];
    if (after) after();
    savePrefs();
    refreshAll();
  };
  const bar = (k) => ({
    run: () => {
      S.bars[k] = !S.bars[k];
      UI.applyBars();
      savePrefs();
      UI.schedule('top');
    },
    checked: () => !!(S.bars || {})[k]
  });
  const dock = (k, label) => ({ label, run: () => UI.openDock(k), checked: () => !$('#dock').hidden && UI.dockTab === k });
  const textSel = () => VP.sel.some((it) => it instanceof paper.PointText || VP.tx.isTx(it));
  Object.assign(A, {
    saveAs: {
      label: 'Farklı kaydet…', kbd: 'Ctrl+Shift+S', icon: 'save',
      run: async () => {
        const n = await UI.prompt({ title: 'Farklı kaydet', label: 'Belge adı', value: VP.doc.name });
        if (!n || !n.trim()) return;
        VP.doc.name = n.trim();
        VP.dirty();
        UI.schedule('top');
        VP.io.save();
      }
    },
    exportPdf: { label: 'PDF olarak yayımla…', icon: 'pdf', run: () => VP.io.exportPDF(true) },
    docProps: { label: 'Belge özellikleri…', run: docProps },
    selectAllText: {
      label: 'Tümünü seç: metin',
      run: () => {
        VP.setTool('select');
        VP.setSelection(VP.allSelectable().filter((it) => it instanceof paper.PointText || VP.tx.isTx(it)));
      }
    },
    findReplace: { label: 'Bul ve değiştir…', kbd: 'Ctrl+F', icon: 'search', run: findReplace },
    copyProps: {
      label: 'Özellikleri kopyala (damlalık)', icon: 'eyedropper',
      run: () => {
        VP.setTool('eyedropper');
        VP.toast(VP.sel.length ? 'Özelliklerini almak istediğiniz nesneye dokunun' : 'Önce hedef nesneleri seçin, sonra kaynağa dokunun');
      }
    },
    fullPreview: { label: 'Tam ekran önizleme', kbd: 'F9', icon: 'preview', run: fullPreview },
    pageSorter: { label: 'Sayfa sıralayıcı görünümü', icon: 'sorter', run: pageSorter },
    guides: { label: 'Kılavuz çizgileri göster', icon: 'guides', checked: () => !!S.guides, run: toggleSetting('guides', () => VP.drawGuides()) },
    clearGuides: {
      label: 'Kılavuz çizgileri temizle',
      run: () => {
        if (!guides().length) return VP.toast('Bu sayfada kılavuz çizgi yok');
        setGuides([]);
        VP.commit();
      }
    },
    snapGuides: { label: 'Kılavuz çizgilere yakala', checked: () => !!S.snapGuides, run: toggleSetting('snapGuides') },
    snapObjects: { label: 'Nesnelere yakala', checked: () => !!S.snapObjects, run: toggleSetting('snapObjects') },
    addPage: { label: 'Sayfa ekle', icon: 'plus', run: () => VP.addPage() },
    dupPage: { label: 'Sayfayı çoğalt', icon: 'duplicate', run: () => VP.duplicatePage() },
    renamePage: {
      label: 'Sayfayı yeniden adlandır…',
      run: async () => {
        const n = await UI.prompt({ title: 'Sayfayı yeniden adlandır', label: 'Ad', value: VP.page().name });
        if (n && n.trim()) {
          VP.page().name = n.trim();
          VP.commit();
          VP.emit('page');
        }
      }
    },
    delPage: {
      label: 'Sayfayı sil', icon: 'trash', enabled: () => VP.doc.pages.length > 1,
      run: async () => {
        if (await UI.confirm({ title: '“' + VP.page().name + '” silinsin mi?', text: 'Bu sayfadaki tüm nesneler silinir.', ok: 'Sayfayı sil', danger: true })) VP.deletePage();
      }
    },
    gotoPage: {
      label: 'Sayfaya git…', enabled: () => VP.doc.pages.length > 1,
      run: async () => {
        const n = await UI.prompt({ title: 'Sayfaya git', label: 'Sayfa (1–' + VP.doc.pages.length + ')', value: String(VP.doc.active + 1), ok: 'Git' });
        const i = Math.round(VP.parseNum(n)) - 1;
        if (i >= 0 && i < VP.doc.pages.length) VP.gotoPage(i);
      }
    },
    insertPageNum: {
      label: 'Sayfa numarası ekle',
      run: () => {
        const p = VP.page();
        const t = VP.createText(Pt(p.w / 2, p.h - VP.toPT(8)), String(VP.doc.active + 1));
        t.justification = 'center';
        t.fontSize = 10;
        t.fillColor = '#1d1d1b';
        t.data.pageField = true;
        t.data.label = 'Sayfa numarası';
        VP.setSelection([t]);
        VP.commit();
        VP.toast('Sayfa numarası eklendi · Sayfa sırası değişince güncellenir');
      }
    },
    orientToggle: {
      label: 'Sayfa yönünü değiştir',
      run: () => {
        const p = VP.page();
        VP.setPageSize(VP.toMM(p.h), VP.toMM(p.w));
      }
    },
    pageSetup: { label: 'Sayfa boyutu…', icon: 'page', run: () => UI.openDock('pages') },
    pageBg: { label: 'Sayfa arka planı…', run: pageBg },
    createBoundary: { label: 'Sınır oluştur', run: createBoundary, enabled: hasSel },
    alignL: { label: 'Sola hizala', icon: 'alignL', run: () => VP.align('l'), enabled: hasSel },
    alignCH: { label: 'Yatay ortala', icon: 'alignCH', run: () => VP.align('ch'), enabled: hasSel },
    alignR: { label: 'Sağa hizala', icon: 'alignR', run: () => VP.align('r'), enabled: hasSel },
    alignT: { label: 'Üste hizala', icon: 'alignT', run: () => VP.align('t'), enabled: hasSel },
    alignCV: { label: 'Dikey ortala', icon: 'alignCV', run: () => VP.align('cv'), enabled: hasSel },
    alignB: { label: 'Alta hizala', icon: 'alignB', run: () => VP.align('b'), enabled: hasSel },
    distH: { label: 'Yatay dağıt', icon: 'distH', run: () => VP.distribute('h', 'center'), enabled: () => VP.sel.length > 2 },
    distV: { label: 'Dikey dağıt', icon: 'distV', run: () => VP.distribute('v', 'center'), enabled: () => VP.sel.length > 2 },
    dockAlign: dock('align', 'Hizala ve Dağıt…'),
    dockTransform: dock('transform', 'Dönüştür…'),
    dockProps: dock('props', 'Özellikler'),
    dockObjects: dock('objects', 'Nesneler'),
    dockPages: dock('pages', 'Sayfalar'),
    dockStep: dock('step', 'Adım ve Tekrar'),
    unlockAll: {
      label: 'Tüm nesnelerin kilidini aç', icon: 'unlock',
      run: () => {
        let n = 0;
        forEachItem((it) => it.locked && ((it.locked = false), n++));
        if (n) VP.commit();
        VP.toast(n ? n + ' nesnenin kilidi açıldı' : 'Kilitli nesne yok');
      }
    },
    showAll: {
      label: 'Tümünü göster', icon: 'eye',
      run: () => {
        let n = 0;
        forEachItem((it) => !it.visible && ((it.visible = true), n++));
        if (n) VP.commit();
        VP.toast(n ? n + ' gizli nesne gösterildi' : 'Gizli nesne yok');
      }
    },
    shadowToggle: {
      label: 'Gölge', icon: 'shadow', enabled: hasSel, checked: () => VP.sel.length > 0 && VP.sel.every((it) => it.data && it.data.shadow),
      run: () => {
        const on = !VP.sel.every((it) => it.data && it.data.shadow);
        VP.setShadow(VP.sel, on ? { on: true, color: '#000000', alpha: 0.35, blur: VP.toPT(2.5), dx: VP.toPT(1.5), dy: VP.toPT(1.5) } : { on: false });
        VP.commit();
      }
    },
    toBitmap: { label: 'Biteşleme dönüştür…', icon: 'bitmap', run: toBitmap, enabled: hasSel },
    bmpGray: {
      label: 'Gri tonlama',
      run: () => pixelOp((d) => {
        for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = lum(d, i);
      })
    },
    bmpBW: {
      label: 'Siyah-beyaz (1 bit)',
      run: () => pixelOp((d) => {
        for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = lum(d, i) > 127 ? 255 : 0;
      })
    },
    bmpInvert: {
      label: 'Renkleri ters çevir',
      run: () => pixelOp((d) => {
        for (let i = 0; i < d.length; i += 4) {
          d[i] = 255 - d[i];
          d[i + 1] = 255 - d[i + 1];
          d[i + 2] = 255 - d[i + 2];
        }
      })
    },
    bmpAdjust: { label: 'Parlaklık ve karşıtlık…', run: bmpAdjust },
    textProps: { label: 'Metin özellikleri', icon: 'text', run: () => UI.openDock('props') },
    insertGlyph: { label: 'Glif ekle…', icon: 'glyph', run: insertGlyph },
    txFitText: {
      label: 'Metni çerçeveye sığdır', enabled: () => !!VP.tx.one('paragraph'),
      run: () => VP.tx.fitTextToFrame(VP.tx.one('paragraph'))
    },
    txFitFrame: {
      label: 'Çerçeveyi metne uydur', enabled: () => !!VP.tx.one('paragraph'),
      run: () => {
        const g = VP.tx.one('paragraph');
        g.data.effect.autoH = false;
        g.data.effect.h = VP.tx.fitHeight(g.data.effect);
        VP.fx.rebuild(g);
        VP.commit();
      }
    },
    changeCase: {
      label: 'Büyük/küçük harf değiştir…', enabled: textSel,
      run: () => {
        const items = [['sentence', 'Cümle düzeni.'], ['lower', 'küçük harf'], ['upper', 'BÜYÜK HARF'], ['title', 'Her Kelime Büyük'], ['toggle', 'bÜYÜK/kÜÇÜK tERSİNE']];
        UI.popover(menuAnchor('text'), items.map(([k, l]) => '<button class="pop-item" data-pick="' + k + '">' + esc(l) + '</button>').join(''), (k) => {
          let n = 0;
          forEachText((get, set) => {
            const v = CASES[k](get());
            if (v !== get()) {
              set(v);
              n++;
            }
          }, true);
          if (n) VP.commit();
        });
      }
    },
    textToTable: { label: 'Metni tabloya dönüştür', run: textToTable, enabled: () => VP.sel.some((it) => it instanceof paper.PointText || VP.tx.is(it, 'paragraph')) },
    tableToText: { label: 'Tabloyu metne dönüştür', run: tableToText, enabled: () => !!curTable() },
    tRowAbove: { label: 'Üste satır', run: tableOp((fx, rg) => VP.tx.tbl.insertRow(fx, rg.r0, rg.r0)), enabled: () => !!curTable() },
    tRowBelow: { label: 'Alta satır', run: tableOp((fx, rg) => VP.tx.tbl.insertRow(fx, rg.r1 + 1, rg.r1)), enabled: () => !!curTable() },
    tColLeft: { label: 'Sola sütun', run: tableOp((fx, rg) => VP.tx.tbl.insertCol(fx, rg.c0, rg.c0)), enabled: () => !!curTable() },
    tColRight: { label: 'Sağa sütun', run: tableOp((fx, rg) => VP.tx.tbl.insertCol(fx, rg.c1 + 1, rg.c1)), enabled: () => !!curTable() },
    tSelRow: {
      label: 'Satır', enabled: () => !!curTable(),
      run: () => {
        const g = curTable();
        const rg = tableRange(g);
        selectCells(g, rg.r0, 0, rg.r1, g.data.effect.colW.length - 1);
      }
    },
    tSelCol: {
      label: 'Sütun', enabled: () => !!curTable(),
      run: () => {
        const g = curTable();
        const rg = tableRange(g);
        selectCells(g, 0, rg.c0, g.data.effect.rowH.length - 1, rg.c1);
      }
    },
    tSelAll: {
      label: 'Tablo', enabled: () => !!curTable(),
      run: () => {
        const g = curTable();
        selectCells(g, 0, 0, g.data.effect.rowH.length - 1, g.data.effect.colW.length - 1);
      }
    },
    tDelRow: {
      label: 'Satırı sil', enabled: () => !!curTable(),
      run: tableOp((fx, rg) => {
        const n = rg.r1 - rg.r0 + 1;
        if (n >= fx.rowH.length) return VP.toast('Tabloda en az bir satır kalmalı'), false;
        for (let i = 0; i < n; i++) VP.tx.tbl.deleteRow(fx, rg.r0);
      })
    },
    tDelCol: {
      label: 'Sütunu sil', enabled: () => !!curTable(),
      run: tableOp((fx, rg) => {
        const n = rg.c1 - rg.c0 + 1;
        if (n >= fx.colW.length) return VP.toast('Tabloda en az bir sütun kalmalı'), false;
        for (let i = 0; i < n; i++) VP.tx.tbl.deleteCol(fx, rg.c0);
      })
    },
    tDelTable: { label: 'Tabloyu sil', icon: 'trash', enabled: () => !!curTable(), run: () => VP.deleteSel() },
    tDistRows: { label: 'Satırları eşit dağıt', enabled: () => !!curTable(), run: tableOp((fx) => VP.tx.tbl.distribute(fx, 'rows')) },
    tDistCols: { label: 'Sütunları eşit dağıt', enabled: () => !!curTable(), run: tableOp((fx) => VP.tx.tbl.distribute(fx, 'cols')) },
    tMerge: { label: 'Hücreleri birleştir', enabled: () => !!curTable(), run: tableOp((fx, rg) => (VP.tx.tbl.merge(fx, rg) ? undefined : (VP.toast('Önce tablo aracıyla birden çok hücre seçin'), false))) },
    tSplit: { label: 'Hücreleri ayır', enabled: () => !!curTable(), run: tableOp((fx, rg) => (VP.tx.tbl.split(fx, rg) ? undefined : (VP.toast('Seçimde birleşik hücre yok'), false))) },
    options: { label: 'Seçenekler…', kbd: 'Ctrl+J', icon: 'gear', run: options },
    themeAuto: { label: 'Sistemle aynı', checked: () => S.theme === 'auto', run: () => ((S.theme = 'auto'), applyTheme(), savePrefs()) },
    themeLight: { label: 'Açık', checked: () => S.theme === 'light', run: () => ((S.theme = 'light'), applyTheme(), savePrefs()) },
    themeDark: { label: 'Koyu', checked: () => S.theme === 'dark', run: () => ((S.theme = 'dark'), applyTheme(), savePrefs()) },
    resetWorkspace: {
      label: 'Çalışma alanını sıfırla',
      run: () => {
        S.bars = { std: true, prop: true, tools: true, status: true, palette: true, docpal: true };
        S.rulers = true;
        UI.applyBars();
        UI.openDock('props');
        savePrefs();
        refreshAll();
        VP.toast('Çalışma alanı varsayılana döndü');
      }
    },
    barStd: Object.assign({ label: 'Standart araç çubuğu' }, bar('std')),
    barProp: Object.assign({ label: 'Özellik çubuğu' }, bar('prop')),
    barTools: Object.assign({ label: 'Araç kutusu' }, bar('tools')),
    barStatus: Object.assign({ label: 'Durum çubuğu' }, bar('status')),
    barPalette: Object.assign({ label: 'Varsayılan CMYK paleti' }, bar('palette')),
    barDocPal: Object.assign({ label: 'Belge paleti' }, bar('docpal')),
    fullscreen: {
      label: 'Tam ekran',
      run: async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await document.documentElement.requestFullscreen();
        } catch (e) {
          VP.toast('Bu görünümde tam ekran kullanılamıyor · Safari’de Paylaş › Ana Ekrana Ekle deneyin');
        }
      }
    },
    shortcuts: { label: 'Klavye kısayolları', run: () => UI.help() },
    whatsNew: {
      label: 'Yenilikler',
      run: () => info('Yenilikler', '<dl class="help-grid">' +
        '<dt>Sürüm 14.4</dt><dd>iPad: sağdaki paneller (özellikler, katmanlar…) artık yüzen pencere değil; CorelDRAW gibi sağ kenara tam boy yerleşir, çizim alanı yanında küçülür</dd><dt>Sürüm 14.3</dt><dd>Sayfa dışı (masaüstü) artık beyaz, açık ve koyu temada · Görünüm › Sayfa dışı beyaz ile eski gri renge dönülebilir</dd><dt>Sürüm 14.2</dt><dd>CorelDRAW tabloları: hücre ve tablo çerçeveleri (kenar çizgileri) artık çiziliyor · Boş tablo hücrelerinde görünen “character” yazısı kaldırıldı · Paragraf satır aralığı Corel’deki gibi (satırlar tablo çizgileriyle hizalı)</dd><dt>Sürüm 14.1</dt><dd>CorelDRAW 2026 dosyaları: metinler (Türkçe harfler, bir satırda kalın/normal karışık yazı, paragraf kutuları), dosyadaki resimler (saydam arka planlı fotoğraflar dahil), geçişli (gradyan) dolgular ve saydamlık artık açılıyor · Çizim Corel’de sayfanın dışında duruyorsa ekran çizime yakınlaşır · Mizanpaj › Sayfayı çizime uydur</dd><dt>Sürüm 14</dt><dd><b>CorelDRAW dosyalarını açma</b> (.cdr ve .cdrt şablonlar; X6’dan 2026’ya, eski sürümler kısmen): sayfalar, katmanlar, gruplar, eğriler, dikdörtgen ve elipsler, dolgu ve anahat renkleri (CMYK/RGB), metin ve paragraf metni, PowerClip, karşılıklı sayfalar · Her sayfada Corel’in kendi önizlemesi gizli bir başvuru katmanında durur (Görünüm › Corel önizlemesi) · <b>CorelDRAW için kaydet</b>: sürüm seçilir (2026’dan X3’e), o sürümün en iyi açtığı biçimde (PDF, AI ya da EPS) kaydedilir</dd><dt>Sürüm 13.1</dt><dd>Bıçak izinde <b>Dışa / İçe</b> düğmesi · Mesafeye eksi yazınca (iPad klavyesinin eksi işareti dahil) hat nesnenin içinden geçer · İçe mesafe nesneye göre çok büyükse uyarır</dd><dt>Sürüm 13</dt><dd>Yeni <b>Eklentiler › Kesim ve Montaj</b>: bıçak izi (kontur, dikdörtgen, yuvarlak köşe, oval; mesafe, köprü), kesim plotteri için hizalama işaretleri (kare, daire, artı, köşe L; ara işaretler), sayfayı dolduran çoğaltma (döndürerek sığdırma, kesim işaretleri), az fireli yerleştirme, ayıklama çerçevesi ve çizgileri, taşma payı, kesim uzunluğu ve maliyet, ayrı kesim dosyası (SVG/DXF/EPS) ve bıçak izi olmadan baskı PDF’i</dd><dt>Sürüm 12.5</dt><dd>Dosya › Yeni artık <b>Yeni Belge Oluştur</b> penceresini açar: ad, hazır ayar, sayfa boyutu, en/boy, yön, sayfa sayısı, renk modu ve çözünürlük · Her belge kendi sekmesinde açılır; sekmeler arasında geçiş yapılır, her belgenin geri alma geçmişi ayrıdır · Kaydedilmemiş belge kapatılırken sorulur (Ctrl+W) · Açık belgelerin hepsi otomatik kaydedilir</dd><dt>Sürüm 12.4</dt><dd>Yazı tipleri panelindeki liste sayfanın ortasında üst üste biniyordu; artık panelin içinde düzgün listeleniyor · Seçili metnin yazı tipi listede işaretli</dd><dt>Sürüm 12.3</dt><dd>Yazı tipi değiştirildiğinde bazı tarayıcılarda metnin durmadan yeniden çizilip uygulamayı kilitlemesi düzeltildi · Kayıtlı belge açılamazsa yedeklenip boş belgeyle açılır, çizim alanı her durumda çalışır · Beklenmeyen hata ekranda gösterilir · Hoş Geldiniz ekranı yalnızca ilk açılışta kendiliğinden gelir</dd><dt>Sürüm 12.2</dt><dd>Yeni Metin paneli (Ctrl+T): Karakter (yazı tipi listesi kendi görünümüyle, stil, boyut, kalın/italik, renk, anahat), Paragraf (hizalama, satır ve paragraf aralığı, girintiler, madde işareti, büyük ilk harf, heceleme), Çerçeve (sütunlar, dikey hizalama, otomatik yükseklik) · Yazı tipi oyun alanı ve Metin paneli artık paragraf metnine, yoldaki metne ve tablolara da uygulanır · Yazarken yazı tipi değiştirilebilir</dd><dt>Sürüm 12.1</dt><dd>Nesne menüsü alt menülere ayrıldı (PowerClip, Hizala ve dağıt, Sırala, Şekillendir, Eğriler, Klon, Dönüştürmeler…) · Şekil aracı dörtgen, çokgen ve yıldızı eğriye çevirmeden düzenler (köşe yuvarlatma, simetrik boyut/açı, yıldız keskinliği) · Konik/kare/desen/doku dolgu düğmeleri yalnızca kapalı şekillerde görünür · Dokunmatik ekranda daha küçük seçim tutamaçları · Telefonda Hoş Geldiniz sekmesi yalnız simge · İletişim kutularında onay kutuları düzeltildi</dd><dt>Sürüm 13</dt><dd>Klasik masaüstü görünümü (varsayılan): kenardan kenara yerleşik çubuklar, açık/koyu gri pencere, tek sütun araç kutusu, sık renk paleti, beyaz cetveller · Standart araç çubuğu masaüstü sırasında (Yazdır, Kes/Kopyala/Yapıştır, Tam ekran önizleme, Yakalamayı kapat) · Araç kutusu masaüstü sırasında, en altta Anahat açılır menüsü (F12) · Hoş Geldiniz ekranı · İpuçları paneli · Siyah kare seçim tutamaçları, ikinci dokunuşta döndürme/eğme okları · Keskin sayfa gölgesi · Özellikler panelinde bölüm simgeleri · Pencere › Arayüz görünümü ile modern görünüme dönüş</dd><dt>Sürüm 11</dt><dd>Dışa aktarma: PDF, SVG, PNG, JPG, WEBP, EPS, DXF · Sayfa aralığı veya yalnız seçim · PDF belge bilgileri, parola ve izinler · Taşma payı ve kesim işaretleri · Metni eğriye çevirerek dışa aktarma · Sayfa yerleşimi: 2’li, 4’lü, kitapçık · Yazdırma (Ctrl+P) · Baskı stilleri · PDF ve AI içe aktarma (vektör veya resim) · DXF içe aktarma · Betik düzenleyici (örneklerle) · Makro kaydedici</dd><dt>Sürüm 10</dt><dd>Paragraf girintileri · Madde işaretleri ve numaralandırma · Büyük ilk harf · Sekme durakları · Türkçe heceleme · Yazım denetimi, hızlı düzelt, metin istatistikleri · Yazı tipi oyun alanı · Nesne, karakter, paragraf ve renk stilleri · Palet yöneticisi (.gpl içe/dışa aktarma) · Semboller ve sembol kütüphanesi · Ana katmanlar · Karşılıklı sayfalar · Yorumlar · Ağaç görünümlü nesne yöneticisi · Sayfa aracı · Çalışma alanları (dokunmatik, sade, sayfa düzeni, odak)</dd><dt>Sürüm 9</dt><dd>Gölge aracı (düz ve perspektif) · İç gölge · Blok gölge · Deformasyon (it-çek, fermuar, burgu) · Derinliğin 6 türü · Zarf modları (düz, tek yay, çift yay, serbest) · Yol boyunca harmanlama, döndürme ve renk yönü · Saydamlık ve özel renk eşlemi mercekleri · Ok başları, kaligrafik anahat, anahat konumu ve dolgunun arkasında anahat · Çok renk duraklı geçişler · Konik, kare, desen ve doku şeffaflığı · Yeni desenler · Biteşlem efektleri (11 kategori) · Biteşlem kırp, yeniden örnekle, büyüt, genişlet, renk maskesi · Paletli, iki tonlu ve titreşimli siyah-beyaz modları · PDF’te yumuşak gölgeler</dd><dt>Sürüm 8</dt><dd>Serbest seçim · 3 noktalı dörtgen ve elips · Karmaşık yıldız · Kâğıt ızgarası · Hazır şekiller (temel, ok, akış diyagramı, pankart, not) · Akıllı çizim · Artistik medya modları (ön ayar, püskürtme, kaligrafi, basınç) · Karalama · LiveSketch · Değişken anahat · Serbest bıçak · Sanal segment silme · Nitelik damlalığı · Köşeler (yuvarlat, oy, pah) · Basitleştir, önü eksi arka, arkası eksi ön, böl · Şunun önüne/arkasına, sırayı tersine çevir · Klon · Tekrarla (Ctrl+R) · Katmana taşı/kopyala · Paralel eğri · Eğrileri kapat, birleştir, ters çevir · Izgaraya hizala · Dönüşümleri temizle · Taşınabilir dönme merkezi</dd>' +
        '<dt>Sürüm 7</dt><dd>Merkez çizgi izleme · Konik ve kare geçişler · Desen dolgular (10 desen) ve doku dolgular (7 doku) · Yumuşatma, bulaştırma, girdap, çekme, itme ve pürüz fırçaları · B-spline, çoklu çizgi ve 3 noktalı eğri araçları</dd>' +
        '<dt>Sürüm 6</dt><dd>Biteşlem izleme (logo, ayrıntılı logo, klipart, fotoğraf, çizim) · Etkileşimli dolgu · Şeffaflık aracı · Ağ dolgu · Akıllı dolgu · Kırpma, bıçak ve silgi araçları · Baskı ayrımları (C, M, Y, K plakaları)</dd>' +
        '<dt>Sürüm 5</dt><dd>Masaüstü düzeni: menü çubuğu, standart çubuk, belge sekmesi, sağda panel sekmeleri, belge paleti, sayfa gezgini · Kılavuz çizgiler ve nesneye yakalama · Ölçü ve bağlantı araçları · Bul ve değiştir · Sayfa sıralayıcı · Tam ekran önizleme · Biteşleme dönüştürme ve modlar · Glif ekleme · Büyük/küçük harf · Metin ↔ tablo · Sayfa numarası ve arka planı · Sınır oluşturma</dd>' +
        '<dt>Sürüm 4</dt><dd>Yola metin, paragraf metni (sütunlu), tablo</dd><dt>Sürüm 3</dt><dd>Derinlik, mercek, PowerClip</dd><dt>Sürüm 2</dt><dd>Harmanlama, kontur, zarf, perspektif</dd></dl>')
    },
    about: {
      label: 'VektörPad hakkında',
      run: () => info('VektörPad', '<p>Sürüm 12 · iPad için vektör çizim uygulaması.</p><p>Masaüstü çizim programlarının çalışma düzeninden esinlenen özgün bir uygulamadır; başka bir programın kodu, simgeleri veya dosyaları kullanılmaz.</p><p>Yazı tipi: Fira Sans, SIL Open Font License 1.1.</p>')
    }
  });
  A.rulers.icon = 'ruler';
  if (A.txNewTable) A.txNewTable.label = 'Yeni tablo oluştur';
  A.help.label = 'Ürün yardımı';

  // Desktop-style shortcuts that the main key handler does not know.
  document.addEventListener(
    'keydown',
    (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.querySelector('.modal-wrap')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      let id = null;
      if (e.key === 'F9') id = 'fullPreview';
      else if (mod && e.shiftKey && k === 's') id = 'saveAs';
      else if (mod && k === 'j') id = 'options';
      else if (mod && k === 'f') id = 'findReplace';
      if (!id) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      UI.run(id);
    },
    true
  );
})();
