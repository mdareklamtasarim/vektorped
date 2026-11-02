/* VektörPad docker set (written for this app): like the desktop program, only the dockers you open sit
   as tabs on the right. The "+" tab and Window › Dockers list every docker with a check mark; picking one
   adds or removes its tab. The × in a docker's title closes that docker. The choice is kept on this device. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const S = VP.settings;
  const $ = (q) => document.querySelector(q);
  const esc = UI.h.esc;
  const DEFAULT = ['props', 'objects', 'transform', 'corners', 'align', 'text'];
  const known = (k) => UI.DOCKERS.some(([x]) => x === k);
  const list = () => {
    if (!Array.isArray(S.dockOpen)) S.dockOpen = DEFAULT.filter(known);
    S.dockOpen = S.dockOpen.filter(known);
    return S.dockOpen;
  };
  const save = () => {
    try {
      VP.io.savePrefs();
    } catch (e) { /* optional */ }
  };
  const isOpen = (k) => list().includes(k);
  // adds a docker tab (in the order of the full list) without opening it
  const add = (k) => {
    if (!known(k) || isOpen(k)) return;
    const order = UI.DOCKERS.map(([x]) => x);
    S.dockOpen = list().concat([k]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    save();
  };
  // closes a docker: its tab goes away; the docker area shows the next open one or folds away
  const close = (k) => {
    const L = list();
    const i = L.indexOf(k);
    if (i < 0) return;
    L.splice(i, 1);
    save();
    if (UI.dockTab === k) {
      if (L.length) {
        UI.dockTab = L[Math.min(i, L.length - 1)];
      } else $('#dock').hidden = true;
    }
    UI.renderDock(true);
    UI.renderTop();
    setTimeout(() => UI.onResize && UI.onResize(), 0);
  };
  const toggle = (k) => (isOpen(k) ? close(k) : UI.openDock(k));

  const od0 = UI.openDock;
  UI.openDock = function (tab) {
    if (tab) add(tab);
    return od0.apply(this, arguments);
  };
  UI.renderDockTabs = function () {
    const open = !$('#dock').hidden;
    const L = list();
    if (open && !L.includes(UI.dockTab) && known(UI.dockTab)) {
      L.push(UI.dockTab);
    }
    const tabs = UI.DOCKERS.filter(([k]) => L.includes(k));
    $('#dock-tabs').innerHTML =
      tabs
        .map(([k, l]) => {
          const on = open && k === UI.dockTab;
          return '<button class="dtab' + (on ? ' on' : '') + '" data-tab="' + k + '" role="tab" aria-selected="' + on + '" title="' + esc(l) + '">' + esc(l) + '</button>';
        })
        .join('') + '<button class="dtab dtab-add" data-dockpick="1" title="Panel ekle veya kaldır" aria-label="Panel ekle veya kaldır">+</button>';
    if (UI._decorateDockTabs) UI._decorateDockTabs();
  };
  const pickHTML = () =>
    '<div class="pop-head">Paneller</div>' +
    UI.DOCKERS.map(([k, l]) => '<button class="pop-item" role="menuitemcheckbox" aria-checked="' + isOpen(k) + '" data-pick="' + k + '"><span>' + esc(l) + '</span>' + (isOpen(k) ? '<span class="check">✓</span>' : '') + '</button>').join('') +
    '<div class="pop-sep"></div><button class="pop-item" data-pick=":default"><span>Varsayılan panellere dön</span></button><button class="pop-item" data-pick=":none"><span>Tüm panelleri kapat</span></button>';
  UI.dockPicker = (anchor) => {
    UI.popover(anchor || $('#dock-tabs'), pickHTML(), (k) => {
      if (k === ':default') {
        S.dockOpen = DEFAULT.filter(known);
        save();
        if (!S.dockOpen.includes(UI.dockTab)) UI.dockTab = S.dockOpen[0];
        UI.renderDock(true);
        UI.renderTop();
        return;
      }
      if (k === ':none') {
        S.dockOpen = [];
        save();
        $('#dock').hidden = true;
        UI.renderDock(true);
        UI.renderTop();
        setTimeout(() => UI.onResize && UI.onResize(), 0);
        return;
      }
      toggle(k);
      // the list stays at hand for picking several
      setTimeout(() => UI.dockPicker(anchor && anchor.isConnected ? anchor : $('#dock-tabs .dtab-add')), 0);
    }, 'left');
  };

  // the "+" tab, and × closes the docker instead of only folding it
  const bind = () => {
    $('#dock-tabs').addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('[data-dockpick]');
        if (!b) return;
        e.stopImmediatePropagation();
        UI.dockPicker(b);
      },
      true
    );
    const x = $('#btn-dock-close');
    if (x) {
      x.addEventListener(
        'click',
        (e) => {
          e.stopImmediatePropagation();
          close(UI.dockTab);
        },
        true
      );
      x.title = 'Bu paneli kapat';
    }
  };

  // Window › Dockers: every docker with a check mark
  const ids = [];
  const addActions = () => {
    UI.DOCKERS.forEach(([k, l]) => {
      const id = 'dockT_' + k;
      if (!A[id]) A[id] = { label: l, run: () => toggle(k), checked: () => isOpen(k) };
      if (!ids.includes(id)) ids.push(id);
    });
    A.dockPick = { label: 'Panelleri seç…', run: () => UI.dockPicker($('#dock-tabs .dtab-add')) };
    A.dockCloseAll = { label: 'Tüm panelleri kapat', run: () => [...list()].forEach(close) };
    const M = UI.MENUS.window;
    if (!M || M.includes('dockPick')) return;
    const h = M.indexOf('h:Yerleşik paneller');
    if (h >= 0) {
      let end = M.indexOf('|', h);
      if (end < 0) end = M.length;
      M.splice(h, end - h, 'sub:Paneller|' + ids.join(','), 'dockPick', 'dockCloseAll');
    } else M.unshift('sub:Paneller|' + ids.join(','), 'dockPick', 'dockCloseAll', '|');
  };

  const css = document.createElement('style');
  css.textContent =
    '.dtab.dtab-add{font-size:15px;line-height:1;padding:6px 0;writing-mode:horizontal-tb;text-align:center;font-weight:500}' +
    '#dock-tabs{overflow-y:auto}';
  document.head.appendChild(css);

  const start = () => {
    addActions();
    bind();
    if (!$('#dock').hidden && !isOpen(UI.dockTab)) add(UI.dockTab);
    UI.renderDock(true);
  };
  if (document.readyState === 'complete') setTimeout(start, 0);
  else addEventListener('load', () => setTimeout(start, 0));
})();
