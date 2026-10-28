/* VektörPad context menu: a long press (finger or Apple Pencil) with the Pick tool, or a right click,
   opens the commands for the object under it, like the right-click menu of a desktop drawing suite.
   Only commands that apply to the current selection are listed. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // menu for a selection, top to bottom
  const OBJECT = [
    'undo', '|',
    'cut', 'copy', 'paste', 'delete', '|',
    'duplicate', 'stepRepeat', 'copyProps', '|',
    'ctxEditArt', 'txEditText', 'textProps', 'txToPara', 'txToArtistic', 'txFitPath', 'txUnpath', 'txFitText', 'txFitFrame', '|',
    'sub:Tablo|tRowAbove,tRowBelow,tColLeft,tColRight,tDelRow,tDelCol,tMerge,tSplit,tDistRows,tDistCols,tableToText,tDelTable',
    'group', 'ungroup', 'ungroupAll', '|',
    'combine', 'breakApart', 'toCurves', '|',
    'sub:Şekillendir|weld,trim,intersect,exclude,frontMinusBack,backMinusFront,divide,simplify,createBoundary',
    'sub:Sırala|toFront,forward,backward,toBack,inFrontOf,behindOf,reverseOrder,toLayer,copyToLayer',
    'sub:Hizala ve dağıt|alignL,alignCH,alignR,alignT,alignCV,alignB,distH,distV',
    'sub:PowerClip|fxPowerclip,fxPowerclip2,pcCenter,pcFit,pcFill',
    'sub:Dönüştür|flipH,flipV,rot90,clearTransform',
    'sub:Efektler|shadowToggle,fxSeparate,fxClear',
    'sub:Eğri|closePath,joinCurves,reversePath,parallelCurve,corners',
    '|',
    'toSymbol', 'breakSymbol', 'toBitmap', 'ecCut', '|',
    'lock', 'hide', '|',
    'dockProps', 'dockObjects'
  ];
  // menu for an empty spot on the page
  const PAGE = [
    'undo', 'redo', '|',
    'paste', 'selectAll', '|',
    'fit', 'zoom100', '|',
    'grid', 'guides', 'snap', '|',
    'addPage', 'pageSetup', 'pageBg', '|',
    'unlockAll', 'showAll', '|',
    'dockProps', 'dockObjects'
  ];

  // shown even when they cannot be used right now (greyed out), as in the desktop menu
  const ALWAYS = ['undo', 'redo', 'cut', 'copy', 'paste', 'delete'];
  // text commands appear only when text is selected
  const TEXT_ONLY = ['ctxEditArt', 'txEditText', 'textProps', 'txToPara', 'txToArtistic', 'txFitPath', 'txUnpath', 'txFitText', 'txFitFrame'];
  const isText = (it) => it instanceof paper.PointText || !!(VP.tx && VP.tx.isTx && VP.tx.isTx(it));

  // an artistic (point) text is edited in place, like a double tap
  A.ctxEditArt = {
    label: 'Metni düzenle',
    icon: 'text',
    run: () => UI.editText(VP.sel[0]),
    enabled: () => VP.sel.length === 1 && VP.sel[0] instanceof paper.PointText
  };

  const usable = (id) => A[id] && (!A[id].enabled || A[id].enabled());
  // drops commands that do not apply, empty submenus and doubled separators
  const build = (ids) => {
    const hasText = VP.sel.some(isText);
    const out = [];
    ids.forEach((id) => {
      if (id === '|') {
        if (out.length && out[out.length - 1] !== '|') out.push('|');
        return;
      }
      if (id.startsWith('sub:')) {
        const [label, list] = id.slice(4).split('|');
        const ok = list.split(',').filter(usable);
        if (ok.length) out.push('sub:' + label + '|' + ok.join(','));
        return;
      }
      if (TEXT_ONLY.includes(id) && !hasText) return;
      if (A[id] && (ALWAYS.includes(id) || usable(id))) out.push(id);
    });
    while (out.length && out[out.length - 1] === '|') out.pop();
    return out;
  };

  const KIND = { rect: 'Dikdörtgen', ellipse: 'Elips', polygon: 'Çokgen', spiral: 'Sarmal', star: 'Yıldız' };
  const nameOf = (it) => {
    if (it.data && it.data.label) return it.data.label;
    if (it.data && it.data.param && KIND[it.data.param.kind]) return KIND[it.data.param.kind];
    if (it instanceof paper.PointText) return 'Metin';
    if (it instanceof paper.Raster) return 'Resim';
    if (it instanceof paper.Group) return 'Grup (' + it.children.length + ' nesne)';
    return 'Eğri';
  };

  // a fixed 1-pixel spot the menu (and its submenus) open beside
  let spot = null;
  const spotAt = (x, y) => {
    if (!spot) {
      spot = document.createElement('div');
      spot.style.cssText = 'position:fixed;width:1px;height:1px;pointer-events:none';
      document.body.appendChild(spot);
    }
    spot.style.left = Math.round(x) + 'px';
    spot.style.top = Math.round(y) + 'px';
    return spot;
  };

  const CX = (VP.ctx = { lastOpen: 0 });
  // x, y: screen position. point: drawing position to pick the object under it (right click);
  // left out after a long press, where the Pick tool has already selected it.
  CX.open = (x, y, point) => {
    if (UI.textItem) UI.commitText();
    if (point) {
      const hit = VP.hitItem(point);
      if (hit && !VP.sel.includes(hit)) VP.setSelection([hit]);
      else if (!hit && VP.sel.length) VP.clearSelection();
    }
    VP.drawOverlay();
    const n = VP.sel.length;
    const head = n === 0 ? 'Sayfa' : n === 1 ? nameOf(VP.sel[0]) : n + ' nesne seçili';
    const list = build(n ? OBJECT : PAGE);
    CX.lastOpen = performance.now();
    UI.popover(spotAt(x + 6, y), '<div class="pop-head">' + esc(head) + '</div>' + UI.menuHTML(list), (id) => UI.run(id), 'right');
  };
})();
