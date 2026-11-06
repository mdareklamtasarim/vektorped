/* VektörPad outline and contour additions (written for this app):
   - Contour corners: sharp (mitre), round or bevel, and contour "to centre".
   - Outline "scale with object": the outline width grows and shrinks with the object.
   - Custom dash pattern: dash and gap lengths as multiples of the outline width (e.g. "4 2 1 2"). */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const FX = VP.fx;
  const $ = (q) => document.querySelector(q);

  /* ---------- contour corners ---------- */
  const CORNERS = [['miter', 'Sivri'], ['round', 'Yuvarlak'], ['bevel', 'Kesik']];
  const cornerSeg = (cur) => '<span class="seg" title="Kontur köşeleri">' + CORNERS.map(([k, l]) => '<button data-act="occ:' + k + '" class="' + (cur === k ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const contourSel = () => (VP.sel.length === 1 && FX.of(VP.sel[0]) && FX.of(VP.sel[0]).type === 'contour' ? VP.sel[0] : null);
  UI.selExtras = UI.selExtras || [];
  UI.selExtras.push((s, one) => {
    const g = contourSel();
    return g ? H.sep + cornerSeg(FX.of(g).corners || 'round') : '';
  });
  const rp0 = UI.renderPropbar;
  UI.renderPropbar = function () {
    const r = rp0.apply(this, arguments);
    const pb = $('#propbar');
    if (pb && VP.toolId === 'contourTool' && !VP.sel.length && !pb.querySelector('[data-act^="occ:"]')) {
      const sp = document.createElement('span');
      sp.innerHTML = H.sep + cornerSeg(VP.defaults.contourCorners || 'miter');
      pb.appendChild(sp);
    }
    return r;
  };
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => {
    if (!id.startsWith('occ:')) return act0(id, el);
    const v = id.slice(4);
    const g = contourSel();
    if (g) {
      FX.update(g, { corners: v });
      VP.commit();
    } else VP.defaults.contourCorners = v;
    try {
      VP.io.savePrefs();
    } catch (e) { /* optional */ }
    UI.schedule('prop', 'dock');
    return true;
  };

  /* ---------- scale outline with object ---------- */
  const sc0 = VP.T.scale;
  VP.T.scale = function (items, sx, sy, anchor) {
    const r = sc0.apply(this, arguments);
    const k = Math.sqrt(Math.abs(sx * sy));
    if (isFinite(k) && k > 0 && Math.abs(k - 1) > 1e-9) {
      VP.leafItems(items).forEach((it) => {
        if (it.data && it.data.scaleStroke && it.strokeWidth) {
          it.strokeWidth *= k;
          VP.applyDash(it);
        }
      });
    }
    return r;
  };

  /* ---------- custom dashes ---------- */
  const ad0 = VP.applyDash;
  VP.applyDash = (item) => {
    if (item.data && item.data.dash === 'custom' && Array.isArray(item.data.dashPat) && item.data.dashPat.length) {
      const w = Math.max(item.strokeWidth || 1, 0.5);
      item.dashArray = item.data.dashPat.map((v) => Math.max(0.01, v) * w);
      return;
    }
    return ad0(item);
  };
  const parsePat = (s) => String(s || '').split(/[\s;]+/).map((x) => VP.parseNum(x)).filter((v) => isFinite(v) && v >= 0).slice(0, 12);

  // Properties docker, outline section: custom dash and "scale with object"
  const addRows = () => {
    if (UI.dockTab !== 'props') return;
    const body = $('#dock-body');
    const dash = body && body.querySelector('[data-dk="dash"]');
    if (!dash || body.querySelector('[data-vpo]')) return;
    const leaf = VP.sel.length ? VP.leafItems(VP.sel).find((x) => x.strokeColor) || VP.leafItems(VP.sel)[0] : null;
    const pat = leaf && leaf.data.dash === 'custom' ? (leaf.data.dashPat || []).join(' ') : '';
    const scale = !!(leaf && leaf.data.scaleStroke);
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<label class="field" title="Kesik ve boşluk uzunlukları, anahat kalınlığının katı olarak (ör. 4 2 1 2)"><span>Özel kesik</span><input data-vpo="dash" value="' + esc(pat) + '" placeholder="4 2 1 2" style="width:84px"></label>' +
      '<label class="field" title="Nesne büyüyüp küçülünce anahat kalınlığı da değişir"><input type="checkbox" data-vpo="scale"' + (scale ? ' checked' : '') + ' style="width:auto"><span>Nesneyle ölçekle</span></label>';
    const host = dash.closest('.row') || dash.parentNode;
    host.after(row);
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
    if (!t || !t.dataset || !t.dataset.vpo) return;
    const items = VP.leafItems(VP.sel);
    if (!items.length) return VP.toast('Önce nesne seçin');
    if (t.dataset.vpo === 'dash') {
      const pat = parsePat(t.value);
      items.forEach((it) => {
        if (pat.length) {
          it.data.dash = 'custom';
          it.data.dashPat = pat;
        } else {
          it.data.dash = 'solid';
          delete it.data.dashPat;
        }
        VP.applyDash(it);
      });
    } else if (t.dataset.vpo === 'scale') {
      items.forEach((it) => {
        if (t.checked) it.data.scaleStroke = true;
        else delete it.data.scaleStroke;
      });
    }
    VP.commit();
    UI.schedule('dock', 'prop');
  });
})();
