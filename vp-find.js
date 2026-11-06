/* VektörPad Find and Replace for objects (written for this app), as a docker:
   find objects by kind, fill colour, outline colour, outline width or name/text, on this page or on every
   page; select them all or step through them; replace a fill or outline colour (or both) and outline widths
   everywhere at once. Text search and replace stays in Edit › Find and replace text. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const S = VP.settings;
  const FX = VP.fx;
  const esc = UI.h.esc;
  const ic = UI.h.ic;
  const F = (VP.findObj = { kind: 'any', fill: '', stroke: '', width: '', text: '', scope: 'page', rFrom: '#000000', rTo: '#e30613', rTarget: 'both', wFrom: '', wTo: '', cursor: -1, last: [] });
  const KINDS = [['any', 'Her tür'], ['rect', 'Dörtgen'], ['ellipse', 'Elips'], ['polygon', 'Çokgen / yıldız'], ['curve', 'Eğri'], ['text', 'Metin'], ['group', 'Grup'], ['image', 'Resim'], ['effect', 'Efekt']];
  const hex = (h) => (h ? String(h).toLowerCase() : '');
  const kindOf = (it) => {
    const k = VP.kindOf(it);
    if (k === 'star') return 'polygon';
    if (['closed', 'path', 'compound'].includes(k)) return 'curve';
    if (k === 'text' || (FX.of(it) && ['paragraph', 'textpath', 'table'].includes(FX.of(it).type))) return 'text';
    if (FX.isFx(it)) return 'effect';
    return k;
  };
  const textOf = (it) => {
    if (it instanceof paper.PointText) return it.content || '';
    const fx = FX.of(it);
    return (fx && fx.text) || '';
  };
  // the objects searched: top-level objects and the contents of plain groups
  const walk = (fn) => {
    VP.userLayers().forEach((L) => {
      if (!L.visible || L.locked) return;
      const go = (it) => {
        if (!it.visible || it.locked) return;
        fn(it);
        if (it instanceof paper.Group && !FX.isFx(it) && !it.clipped) it.children.forEach(go);
      };
      L.children.forEach(go);
    });
  };
  const matches = (it) => {
    if (F.kind !== 'any' && kindOf(it) !== F.kind) return false;
    if (it instanceof paper.Group && !FX.isFx(it) && F.kind !== 'group' && (F.fill || F.stroke || F.width)) return false;
    if (F.fill) {
      const f = VP.getFill(it);
      if (!f || f.type !== 'solid' || hex(f.color) !== hex(F.fill)) return false;
    }
    if (F.stroke || F.width) {
      const s = VP.getStroke(it);
      if (!s || !s.on) return false;
      if (F.stroke && hex(s.color) !== hex(F.stroke)) return false;
      if (F.width && Math.abs(VP.toMM(s.width) - VP.parseNum(F.width)) > 0.005) return false;
    }
    if (F.text) {
      const q = F.text.toLocaleLowerCase('tr');
      const hay = (VP.describe(it) + ' ' + textOf(it) + ' ' + ((it.data && it.data.label) || '')).toLocaleLowerCase('tr');
      if (!hay.includes(q)) return false;
    }
    return true;
  };
  const findHere = () => {
    const out = [];
    walk((it) => matches(it) && out.push(it));
    return out;
  };
  // runs fn on every page (or only this one), then returns to the page the user was on
  const eachPage = (fn) => {
    const start = VP.doc.active;
    if (F.scope !== 'all' || VP.doc.pages.length < 2) return fn(start);
    let total = 0;
    for (let i = 0; i < VP.doc.pages.length; i++) {
      if (i !== VP.doc.active) VP.gotoPage(i);
      total += fn(i) || 0;
    }
    if (VP.doc.active !== start) VP.gotoPage(start);
    return total;
  };
  F.findAll = () => {
    const list = findHere();
    F.last = list;
    F.cursor = -1;
    if (!list.length) return VP.toast('Eşleşen nesne yok' + (F.scope === 'all' ? ' (bu sayfada)' : ''));
    VP.setTool('select');
    VP.setSelection(list.filter((it) => it.parent && it.parent instanceof paper.Layer).length === list.length ? list : list);
    VP.toast(list.length + ' nesne bulundu ve seçildi');
  };
  F.findNext = () => {
    const list = findHere();
    F.last = list;
    if (!list.length) return VP.toast('Eşleşen nesne yok');
    F.cursor = (F.cursor + 1) % list.length;
    VP.setTool('select');
    VP.setSelection([list[F.cursor]]);
    if (VP.zoomToRect) {
      const b = list[F.cursor].bounds;
      if (!paper.view.bounds.contains(b)) VP.zoomToRect(b.expand(Math.max(b.width, b.height)));
    }
    VP.toast((F.cursor + 1) + ' / ' + list.length);
  };
  F.replaceColor = () => {
    const from = hex(F.rFrom);
    const to = F.rTo;
    if (!from || !to) return;
    const n = eachPage(() => {
      let c = 0;
      walk((it) => {
        if (it instanceof paper.Group && !FX.isFx(it)) return;
        if (F.rTarget !== 'stroke') {
          const f = VP.getFill(it);
          if (f && f.type === 'solid' && hex(f.color) === from) {
            VP.setFill([it], { type: 'solid', color: to, alpha: f.alpha == null ? 1 : f.alpha });
            c++;
          }
        }
        if (F.rTarget !== 'fill') {
          const s = VP.getStroke(it);
          if (s && s.on && hex(s.color) === from) {
            VP.setStroke([it], { on: true, color: to });
            c++;
          }
        }
      });
      if (c) VP.commit();
      return c;
    });
    VP.toast(n ? n + ' renk değiştirildi' : 'Bu renkte nesne yok');
    UI.schedule('dock', 'prop', 'status', 'palette');
  };
  F.replaceWidth = () => {
    const from = VP.parseNum(F.wFrom);
    const to = VP.parseNum(F.wTo);
    if (!(to >= 0)) return VP.toast('Yeni kalınlığı girin');
    const n = eachPage(() => {
      let c = 0;
      walk((it) => {
        if (it instanceof paper.Group && !FX.isFx(it)) return;
        const s = VP.getStroke(it);
        if (!s || !s.on) return;
        if (isFinite(from) && Math.abs(VP.toMM(s.width) - from) > 0.005) return;
        VP.setStroke([it], { width: VP.toPT(to) });
        c++;
      });
      if (c) VP.commit();
      return c;
    });
    VP.toast(n ? n + ' anahat kalınlığı değiştirildi' : 'Eşleşen anahat yok');
    UI.schedule('dock', 'prop', 'status');
  };
  const fromSel = (what) => {
    const it = VP.sel[0];
    if (!it) return VP.toast('Önce örnek bir nesne seçin');
    const f = VP.getFill(it);
    const s = VP.getStroke(it);
    if (what === 'find') {
      F.kind = kindOf(it);
      F.fill = f && f.type === 'solid' ? f.color : '';
      F.stroke = s && s.on ? s.color : '';
      F.width = '';
    } else if (what === 'from') F.rFrom = (f && f.type === 'solid' && f.color) || (s && s.on && s.color) || F.rFrom;
    else if (what === 'to') F.rTo = (f && f.type === 'solid' && f.color) || (s && s.on && s.color) || F.rTo;
  };

  /* ---------- docker ---------- */
  const colorBox = (name, val, title) =>
    '<label class="field" title="' + esc(title) + '"><span>' + esc(title) + '</span><input type="checkbox" data-fo-on="' + name + '"' + (val ? ' checked' : '') + ' aria-label="' + esc(title) + ' kullan" style="width:auto">' +
    '<input type="color" data-pf="fo:' + name + '" value="' + esc(val || '#000000') + '" style="width:34px;height:22px;padding:0;border:0;background:transparent"' + (val ? '' : ' disabled') + '></label>';
  const panel = () => {
    const n = findHere().length;
    let h = '<div class="sec"><div class="sec-h"><h3>Nesne bul</h3></div>' +
      '<div class="row"><label class="field grow"><span>Tür</span><select data-pf="fo:kind" style="flex:1">' + KINDS.map(([k, l]) => '<option value="' + k + '"' + (k === F.kind ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>' +
      '<div class="row">' + colorBox('fill', F.fill, 'Dolgu') + colorBox('stroke', F.stroke, 'Anahat') + '</div>' +
      '<div class="row"><label class="field"><span>Kalınlık</span><input data-pf="fo:width" value="' + esc(F.width) + '" placeholder="hepsi" inputmode="decimal" style="width:56px"><span class="unit">mm</span></label></div>' +
      '<div class="row"><label class="field grow"><span>Ad / metin</span><input data-pf="fo:text" value="' + esc(F.text) + '" style="flex:1" placeholder="içerir"></label></div>' +
      '<div class="row"><span class="seg">' + [['page', 'Bu sayfa'], ['all', 'Tüm sayfalar']].map(([k, l]) => '<button data-act="foScope:' + k + '" class="' + (F.scope === k ? 'on' : '') + '">' + l + '</button>').join('') + '</span>' +
      '<button class="btn" data-act="foFromSel:find" title="Seçili nesnenin türünü ve renklerini al">' + ic('eyedropper', 'sm') + 'Seçimden</button></div>' +
      '<p class="sec-note">Bu sayfada eşleşen: <b>' + n + '</b></p>' +
      '<div class="row"><button class="btn primary" data-act="foFindAll">Tümünü bul</button><button class="btn" data-act="foFindNext">Sonrakini bul</button></div></div>';
    h += '<div class="sec"><div class="sec-h"><h3>Rengi değiştir</h3></div>' +
      '<div class="row"><label class="field"><span>Bul</span><input type="color" data-pf="fo:rFrom" value="' + esc(F.rFrom) + '" style="width:34px;height:22px;padding:0;border:0;background:transparent"></label><button class="btn icon-only" data-act="foFromSel:from" title="Seçimden al">' + ic('eyedropper', 'sm') + '</button>' +
      '<label class="field"><span>Yeni</span><input type="color" data-pf="fo:rTo" value="' + esc(F.rTo) + '" style="width:34px;height:22px;padding:0;border:0;background:transparent"></label><button class="btn icon-only" data-act="foFromSel:to" title="Seçimden al">' + ic('eyedropper', 'sm') + '</button></div>' +
      '<div class="row"><span class="seg">' + [['fill', 'Dolgu'], ['stroke', 'Anahat'], ['both', 'İkisi']].map(([k, l]) => '<button data-act="foTarget:' + k + '" class="' + (F.rTarget === k ? 'on' : '') + '">' + l + '</button>').join('') + '</span></div>' +
      '<div class="row"><button class="btn primary" data-act="foReplaceColor">Tümünü değiştir</button></div></div>';
    h += '<div class="sec"><div class="sec-h"><h3>Anahat kalınlığını değiştir</h3></div>' +
      '<div class="row"><label class="field"><span>Bul</span><input data-pf="fo:wFrom" value="' + esc(F.wFrom) + '" placeholder="hepsi" inputmode="decimal" style="width:52px"><span class="unit">mm</span></label>' +
      '<label class="field"><span>Yeni</span><input data-pf="fo:wTo" value="' + esc(F.wTo) + '" inputmode="decimal" style="width:52px"><span class="unit">mm</span></label></div>' +
      '<div class="row"><button class="btn primary" data-act="foReplaceWidth">Tümünü değiştir</button></div>' +
      '<p class="sec-note">Metin aramak için: Düzen › Bul ve değiştir (metin) · <button class="btn" data-act="findReplace" style="height:auto;padding:2px 6px">Metin ara</button></p></div>';
    return h;
  };
  UI.panels.findobj = panel;
  if (!UI.DOCKERS.some(([k]) => k === 'findobj')) UI.DOCKERS.push(['findobj', 'Bul ve değiştir']);

  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, raw, el) => {
    if (!n.startsWith('fo:')) return pf0(n, raw, el);
    const k = n.slice(3);
    F[k] = raw;
    F.cursor = -1;
    UI.schedule('dock');
    return true;
  };
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || !t.dataset || !t.dataset.foOn) return;
    const k = t.dataset.foOn;
    F[k] = t.checked ? F[k] || '#000000' : '';
    UI.schedule('dock');
  });
  const act = (id, el) => {
    const [k, arg] = id.split(':');
    switch (k) {
      case 'foScope': F.scope = arg; break;
      case 'foTarget': F.rTarget = arg; break;
      case 'foFromSel': fromSel(arg); break;
      case 'foFindAll': F.findAll(); break;
      case 'foFindNext': F.findNext(); break;
      case 'foReplaceColor': F.replaceColor(); break;
      case 'foReplaceWidth': F.replaceWidth(); break;
      default: return false;
    }
    UI.schedule('dock');
    return true;
  };
  const da0 = UI.dockAct;
  UI.dockAct = function (id, el) {
    if (/^fo[A-Z]/.test(id) && act(id, el)) return;
    return da0.apply(this, arguments);
  };
  A.findObjects = { label: 'Nesne bul ve değiştir…', icon: 'search', kbd: 'Ctrl+F', run: () => UI.openDock('findobj') };
  if (A.findReplace) {
    A.findReplace.label = 'Metin bul ve değiştir…';
    A.findReplace.kbd = '';
  }
  const M = UI.MENUS.edit;
  if (M && !M.includes('findObjects')) {
    const i = M.indexOf('findReplace');
    M.splice(i >= 0 ? i : M.length, 0, 'findObjects');
  }
  // Ctrl+F opens the docker (as in the desktop program)
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      const t = e.target;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      UI.openDock('findobj');
    }
  }, true);
  void S;
})();
