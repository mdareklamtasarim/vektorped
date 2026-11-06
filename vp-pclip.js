/* VektörPad PowerClip commands as in the desktop program (written for this app):
   - Edit PowerClip: the contents come out where they are, everything else fades (focus), edit them with
     any tool; Finish editing puts them back into the frame.
   - Extract contents: the contents become ordinary objects again, the frame stays as an empty PowerClip
     frame.
   - Lock contents to PowerClip (on by default): when switched off, moving, scaling or rotating the frame
     leaves the contents where they are.
   - Select contents; Stretch contents to fill the frame (not proportional). */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const A = VP.actions;
  const FX = VP.fx;
  const H = UI.h;
  const $ = (q) => document.querySelector(q);
  const PC = (VP.pclip = {});
  const isPC = (g) => !!(g && FX.of(g) && FX.of(g).type === 'powerclip');
  const selPC = () => (VP.sel.length === 1 && isPC(VP.sel[0]) ? VP.sel[0] : null);
  let editing = null;

  // contents out of the frame, keeping their place on the page
  const takeOut = (g) => {
    const { frame } = FX.pcParts(g);
    const kids = FX.pcContents(g);
    if (!frame) return null;
    const parent = g.parent;
    const idx = g.index;
    frame.remove();
    delete frame.data.pcFrame;
    parent.insertChild(idx, frame);
    let at = frame;
    kids.forEach((k) => {
      k.remove();
      k.insertAbove(at);
      at = k;
    });
    g.remove();
    return { frame, kids };
  };
  PC.extract = (g) => {
    g = g || selPC();
    if (!isPC(g)) return VP.toast('Önce bir PowerClip seçin');
    const r = takeOut(g);
    if (!r) return;
    r.frame.data.pcEmpty = true;
    VP.setSelection(r.kids);
    VP.commit();
    VP.toast('İçerik çıkarıldı · Çerçeve boş PowerClip çerçevesi olarak kaldı');
  };
  const banner = () => {
    let b = $('#vp-pcedit');
    if (!editing) return b && b.remove();
    if (!b) {
      b = document.createElement('div');
      b.id = 'vp-pcedit';
      b.innerHTML = '<span>PowerClip içeriği düzenleniyor</span><button class="btn primary" data-pcfinish="1">Düzenlemeyi bitir</button>';
      b.addEventListener('click', (e) => e.target.closest('[data-pcfinish]') && PC.finish());
      const w = $('#canvas-wrap');
      if (w) w.appendChild(b);
    }
  };
  PC.edit = (g) => {
    g = g || selPC();
    if (!isPC(g)) return VP.toast('Önce bir PowerClip seçin');
    if (editing) PC.finish();
    const locked = !!FX.of(g).unlocked;
    const r = takeOut(g);
    if (!r) return;
    r.frame.locked = true;
    r.frame.data.pcEditFrame = true;
    editing = { frame: r.frame, kids: r.kids.slice(), unlocked: locked };
    r.kids.forEach((k) => (k.data.pcEditKid = true));
    VP.setTool('select');
    VP.setSelection(r.kids);
    if (VP.k7 && VP.k7.focus) VP.k7.focus();
    banner();
    VP.drawOverlay();
  };
  PC.finish = () => {
    if (!editing) return;
    const { frame, unlocked } = editing;
    editing = null;
    if (VP.k7 && VP.k7.exitFocus) VP.k7.exitFocus();
    banner();
    if (!frame.parent) return VP.drawOverlay();
    const kids = VP.allSelectable().concat(VP.userLayers().reduce((a, L) => a.concat(L.children.slice()), [])).filter((k, i, arr) => arr.indexOf(k) === i && k.data && k.data.pcEditKid);
    kids.forEach((k) => delete k.data.pcEditKid);
    frame.locked = false;
    delete frame.data.pcEditFrame;
    if (!kids.length) {
      frame.data.pcEmpty = true;
      VP.setSelection([frame]);
      VP.commit();
      return;
    }
    const g = FX.powerclip(kids, frame);
    if (g && unlocked) FX.of(g).unlocked = true;
    VP.toast('PowerClip düzenlemesi bitti');
  };
  PC.isEditing = () => !!editing;
  VP.overlayHooks = VP.overlayHooks || [];
  VP.overlayHooks.push((L) => {
    if (!editing || !editing.frame.parent) return;
    const s = 1 / paper.view.zoom;
    const o = editing.frame.clone({ insert: false });
    o.fillColor = null;
    o.strokeColor = '#1e78ff';
    o.strokeWidth = 1.5 * s;
    o.dashArray = [5 * s, 3 * s];
    o.opacity = 1;
    L.addChild(o);
  });
  addEventListener('keydown', (e) => {
    if (editing && e.key === 'Escape' && !(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) PC.finish();
  });
  VP.on('page', () => editing && PC.finish());
  PC.selectContents = () => {
    const g = selPC();
    if (!g) return;
    const kids = FX.pcContents(g);
    if (kids.length) VP.setSelection(kids);
  };
  PC.stretch = () => {
    const g = selPC();
    if (!g) return VP.toast('Önce bir PowerClip seçin');
    const { frame } = FX.pcParts(g);
    const kids = FX.pcContents(g);
    if (!frame || !kids.length) return;
    const fb = frame.bounds;
    const cb = VP.selBounds(kids);
    VP.T.scale(kids, fb.width / cb.width, fb.height / cb.height, cb.center);
    VP.T.move(kids, fb.center.subtract(VP.selBounds(kids).center));
    VP.commit();
  };

  // unlocked contents stay put when the frame is transformed
  const unlockedIn = (items) => items.filter((it) => isPC(it) && FX.of(it).unlocked);
  const T = VP.T;
  const m0 = T.move;
  T.move = function (items, d) {
    const r = m0.apply(this, arguments);
    unlockedIn(items).forEach((g) => FX.pcContents(g).forEach((k) => k.translate(d.multiply(-1))));
    return r;
  };
  const s0 = T.scale;
  T.scale = function (items, sx, sy, anchor) {
    const r = s0.apply(this, arguments);
    unlockedIn(items).forEach((g) => FX.pcContents(g).forEach((k) => k.scale(1 / sx, 1 / sy, anchor)));
    return r;
  };
  const r0 = T.rotate;
  T.rotate = function (items, deg, c) {
    const r = r0.apply(this, arguments);
    unlockedIn(items).forEach((g) => FX.pcContents(g).forEach((k) => k.rotate(-deg, c)));
    return r;
  };

  Object.assign(A, {
    pcEdit: { label: 'PowerClip’i düzenle', icon: 'powerclip', enabled: () => !!selPC(), run: () => PC.edit() },
    pcFinish: { label: 'PowerClip düzenlemesini bitir', enabled: () => !!editing, run: () => PC.finish() },
    pcExtract: { label: 'İçeriği çıkar', enabled: () => !!selPC(), run: () => PC.extract() },
    pcLock: { label: 'İçeriği PowerClip’e kilitle', checked: () => !!selPC() && !FX.of(selPC()).unlocked, enabled: () => !!selPC(), run: () => { const g = selPC(); const fx = FX.of(g); fx.unlocked = !fx.unlocked; if (!fx.unlocked) delete fx.unlocked; VP.commit(); VP.toast(fx.unlocked ? 'Çerçeve taşınınca içerik yerinde kalır' : 'İçerik çerçeveyle birlikte hareket eder'); } },
    pcSelect: { label: 'İçeriği seç', enabled: () => !!selPC(), run: () => PC.selectContents() },
    pcStretch: { label: 'İçeriği çerçeveyi dolduracak şekilde uzat', enabled: () => !!selPC(), run: () => PC.stretch() }
  });
  const sub = 'sub:PowerClip|fxPowerclip2,pcEdit,pcFinish,pcExtract,pcLock,pcSelect,pcCenter,pcFit,pcFill,pcStretch';
  ['object'].forEach((m) => {
    const M = UI.MENUS[m];
    if (!M || M.includes('pcEdit')) return;
    const i = M.indexOf('pcFill');
    if (i >= 0) M.splice(i + 1, 0, 'pcStretch', 'pcEdit', 'pcFinish', 'pcExtract', 'pcLock', 'pcSelect');
  });
  PC.SUB = sub;
  UI.selExtras = UI.selExtras || [];
  UI.selExtras.push((s, one) => (isPC(one) ? H.sep + H.btn('pcEdit', 'Düzenle', 'PowerClip içeriğini düzenle') + H.btn('pcExtract', 'İçeriği çıkar', 'İçeriği çerçeveden çıkar') + H.tog('pcLock', 'Kilitli', !FX.of(one).unlocked, 'İçeriği PowerClip’e kilitle') + H.btn('pcSelect', 'İçeriği seç', 'İçerikteki nesneleri seç') : ''));
  const css = document.createElement('style');
  css.textContent = '#vp-pcedit{position:absolute;z-index:7;left:50%;top:44px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:4px 6px 4px 12px;background:var(--panel);color:var(--fg);border:1px solid #1e78ff;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.25);font-size:12px}';
  document.head.appendChild(css);
})();
