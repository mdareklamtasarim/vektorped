/* VektörPad keyboard shortcuts as in the desktop program (written for this app).
   Tools: F5 Freehand, F6 Rectangle, F7 Ellipse, F8 Text, F10 Shape, F2 Zoom, H Pan, Y Polygon, A Spiral,
   D Graph paper, G Interactive fill, M Mesh fill, X Eraser, I Artistic media; Space switches between the
   current tool and the Pick tool (held down while dragging it still pans).
   With objects selected: L R T B align left/right/top/bottom, E and C centre horizontally/vertically,
   P centre to page.
   Zoom: F3 zoom out, F4 all objects, Shift+F4 page, F9 full-screen preview, Shift+F9 last two view modes.
   Edit: Ctrl+Shift+Z redo, Ctrl+Y snap to grid, Ctrl+R repeat, Ctrl+Shift+D step and repeat,
   Ctrl+Shift+A copy properties, Alt+Enter properties, Ctrl+J options, Ctrl+P print, Ctrl+T text properties,
   Ctrl+F8 artistic/paragraph text, Ctrl+F11 glyphs, Ctrl+Shift+T edit text.
   Order: Ctrl+Home / Ctrl+End front / back of page, Shift+PgUp / Shift+PgDn front / back of layer,
   Ctrl+PgUp / Ctrl+PgDn forward / back one, PgUp / PgDn previous / next page.
   Dockers: Alt+F7..F10 Transform tabs, Ctrl+F9 contour, Ctrl+F7 envelope, Alt+F3 lens,
   F11 interactive fill, Shift+F11 fill colour, F12 / Shift+F12 outline. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const S = VP.settings;
  const T = VP.TOOL_META;
  const run = (id) => A[id] && (!A[id].enabled || A[id].enabled()) && UI.run(id);
  const tool = (id) => VP.tools[id] && VP.setTool(id);
  const typing = (e) => {
    const t = e.target;
    return (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) || !!document.querySelector('.modal-wrap') || !!UI.textItem;
  };
  // the tool keys shown in tooltips
  const KEYS = { freehand: 'F5', rect: 'F6', ellipse: 'F7', text: 'F8', node: 'F10', zoom: 'F2', hand: 'H', polygon: 'Y', spiral: 'A', graphTool: 'D', fillTool: 'G', meshTool: 'M', eraserTool: 'X', brush: 'I', select: 'Boşluk' };
  Object.keys(T).forEach((id) => {
    if (KEYS[id]) T[id].key = KEYS[id];
    else if (/^[A-Z]$/.test(T[id].key || '')) T[id].key = '';
  });
  const LETTER_TOOLS = { h: 'hand', y: 'polygon', a: 'spiral', d: 'graphTool', g: 'fillTool', m: 'meshTool', x: 'eraserTool', i: 'brush' };
  const ALIGN = { l: 'l', r: 'r', t: 't', b: 'b', e: 'ch', c: 'cv' };
  const centerToPage = () => {
    if (!VP.sel.length) return;
    const b = VP.selBounds();
    const c = VP.pageRect().center;
    VP.T.move(VP.sel, c.subtract(b.center));
    VP.commit();
  };
  const zoomAll = () => {
    const all = VP.allSelectable();
    if (!all.length) return run('fit');
    const r = all.reduce((acc, it) => (acc ? acc.unite(it.bounds) : it.bounds.clone()), null);
    VP.zoomToRect(r.expand(VP.toPT(5)));
  };
  // to the front / back of the page: across layers, onto the top / bottom drawing layer
  const pageOrder = (front) => {
    if (!VP.sel.length) return;
    const ls = VP.userLayers().filter((L) => !L.locked && L.visible);
    if (!ls.length) return;
    const L = front ? ls[ls.length - 1] : ls[0];
    if (front) VP.zSort(VP.sel).forEach((it) => L.addChild(it));
    else VP.zSort(VP.sel).reverse().forEach((it) => L.insertChild(0, it));
    VP.commit();
    VP.drawOverlay();
  };
  let lastMode = 'wire';
  const toggleMode = () => {
    const VW = VP.view2;
    if (!VW || !VW.setMode) return;
    const cur = S.viewMode || 'enhanced';
    const next = cur === lastMode ? 'enhanced' : lastMode;
    lastMode = cur;
    VW.setMode(next);
  };
  const transformTab = (tab) => {
    UI.openDock('transform');
    if (VP.k3 && VP.k3.tr) VP.k3.tr.tab = tab;
    UI.renderDock(true);
  };
  const colorTarget = (t) => {
    UI.openDock('color');
    if (VP.panels2 && VP.panels2.color) VP.panels2.color.target = t;
    UI.renderDock(true);
  };
  A.zoomAll = { label: 'Tüm nesnelere yakınlaştır', kbd: 'F4', run: zoomAll };
  A.centerPage = { label: 'Sayfanın ortasına hizala', kbd: 'P', enabled: () => VP.sel.length > 0, run: centerToPage };
  A.pageFront = { label: 'Sayfanın önüne', kbd: 'Ctrl+Home', enabled: () => VP.sel.length > 0, run: () => pageOrder(true) };
  A.pageBack = { label: 'Sayfanın arkasına', kbd: 'Ctrl+End', enabled: () => VP.sel.length > 0, run: () => pageOrder(false) };
  if (A.fit) A.fit.kbd = 'Shift+F4';
  if (A.redo) A.redo.kbd = 'Ctrl+Shift+Z';
  if (A.toFront) A.toFront.kbd = 'Shift+PgUp';
  if (A.toBack) A.toBack.kbd = 'Shift+PgDn';
  if (A.forward) A.forward.kbd = 'Ctrl+PgUp';
  if (A.backward) A.backward.kbd = 'Ctrl+PgDn';
  if (A.snap) A.snap.kbd = 'Ctrl+Y';
  if (A.dockProps) A.dockProps.kbd = 'Alt+Enter';
  if (A.copyProps) A.copyProps.kbd = 'Ctrl+Shift+A';
  if (A.stepRepeat) A.stepRepeat.kbd = 'Ctrl+Shift+D';
  if (A.options) A.options.kbd = 'Ctrl+J';
  if (A.print) A.print.kbd = 'Ctrl+P';
  if (A.repeat) A.repeat.kbd = 'Ctrl+R';
  if (A.fullPreview) A.fullPreview.kbd = 'F9';
  if (A.insertGlyph) A.insertGlyph.kbd = 'Ctrl+F11';
  if (A.alignL) A.alignL.kbd = 'L';
  if (A.alignR) A.alignR.kbd = 'R';
  if (A.alignT) A.alignT.kbd = 'T';
  if (A.alignB) A.alignB.kbd = 'B';
  if (A.alignCH) A.alignCH.kbd = 'E';
  if (A.alignCV) A.alignCV.kbd = 'C';
  {
    const M = UI.MENUS.view;
    if (M && !M.includes('zoomAll')) M.splice(Math.max(0, M.indexOf('fit')), 0, 'zoomAll');
    const O = UI.MENUS.object;
    if (O && !O.includes('pageFront')) {
      const i = O.indexOf('toFront');
      O.splice(i >= 0 ? i : O.length, 0, 'pageFront');
      const j = O.indexOf('toBack');
      O.splice(j >= 0 ? j + 1 : O.length, 0, 'pageBack');
    }
    const al = O ? O.indexOf('alignB') : -1;
    if (al >= 0 && !O.includes('centerPage')) O.splice(al + 1, 0, 'centerPage');
  }

  // Space: a tap switches between the current tool and the Pick tool; held while dragging, it pans
  let spaceDown = false;
  let spaceMoved = false;
  let prevTool = null;
  addEventListener('pointermove', (e) => {
    if (spaceDown && e.buttons) spaceMoved = true;
  }, true);

  addEventListener('keydown', (e) => {
    if (typing(e)) return;
    const k = (e.key || '').toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    let done = true;
    if (e.key === ' ') {
      if (!e.repeat) {
        spaceDown = true;
        spaceMoved = false;
      }
      return; // the normal handler keeps panning while held
    }
    if (!mod && !e.altKey && /^F\d+$/.test(e.key)) {
      switch (e.key) {
        case 'F2': tool('zoom'); break;
        case 'F3': VP.zoomAt(0.5); break;
        case 'F4': if (e.shiftKey) run('fit'); else zoomAll(); break;
        case 'F5': tool('freehand'); break;
        case 'F6': tool('rect'); break;
        case 'F7': tool('ellipse'); break;
        case 'F8': tool('text'); break;
        case 'F9': if (e.shiftKey) toggleMode(); else run('fullPreview'); break;
        case 'F10': tool('node'); break;
        case 'F11': if (e.shiftKey) colorTarget('fill'); else tool('fillTool'); break;
        case 'F12': if (e.shiftKey) colorTarget('stroke'); else UI.openDock('props'); break;
        default: done = false;
      }
    } else if (e.altKey && !mod) {
      if (e.key === 'Enter') UI.openDock('props');
      else if (e.key === 'F7') transformTab('pos');
      else if (e.key === 'F8') transformTab('rot');
      else if (e.key === 'F9') transformTab('scale');
      else if (e.key === 'F10') transformTab('size');
      else if (e.key === 'F3') run('fxLens');
      else done = false;
    } else if (mod) {
      if (k === 'z' && e.shiftKey) run('redo');
      else if (k === 'y' && !e.shiftKey) run('snap');
      else if (k === 'r' && !e.shiftKey) run('repeat');
      else if (k === 'd' && e.shiftKey) UI.openDock('step');
      else if (k === 'a' && e.shiftKey) run('copyProps');
      else if (k === 'j') run('options');
      else if (k === 'p') run('print');
      else if (k === 't' && e.shiftKey) run('txEditText');
      else if (k === 't') UI.openDock('text');
      else if (e.key === 'F8') run(A.txToPara && A.txToPara.enabled && A.txToPara.enabled() ? 'txToPara' : 'txToArtistic');
      else if (e.key === 'F11') run('insertGlyph');
      else if (e.key === 'F9') run('fxContour');
      else if (e.key === 'F7') run('fxEnvelope');
      else if (e.key === 'Home') pageOrder(true);
      else if (e.key === 'End') pageOrder(false);
      else if (e.key === 'PageUp') run('forward');
      else if (e.key === 'PageDown') run('backward');
      else done = false;
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      if (e.shiftKey) run(e.key === 'PageUp' ? 'toFront' : 'toBack');
      else {
        const n = VP.doc.pages.length;
        const i = VP.doc.active + (e.key === 'PageUp' ? -1 : 1);
        if (i >= 0 && i < n) VP.gotoPage(i);
      }
    } else if (!e.shiftKey && /^[a-z]$/.test(k)) {
      if (VP.sel.length && VP.toolId === 'select' && ALIGN[k]) VP.align(ALIGN[k]);
      else if (VP.sel.length && VP.toolId === 'select' && k === 'p') centerToPage();
      else if (LETTER_TOOLS[k]) tool(LETTER_TOOLS[k]);
      else if ('vfrestpl'.includes(k)) {
        /* letters the desktop program does not use for tools: nothing happens */
      } else done = false;
    } else done = false;
    if (done) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  addEventListener('keyup', (e) => {
    if (e.key !== ' ' || typing(e)) return;
    const tapped = spaceDown && !spaceMoved;
    spaceDown = false;
    if (!tapped) return;
    if (VP.toolId === 'select') {
      if (prevTool && prevTool !== 'select' && VP.tools[prevTool]) VP.setTool(prevTool);
    } else {
      prevTool = VP.toolId;
      VP.setTool('select');
    }
  }, true);
  // the Learning/Hints texts and tooltips pick up the new keys
  if (UI.renderToolbox) setTimeout(() => UI.renderToolbox(), 0);
})();
