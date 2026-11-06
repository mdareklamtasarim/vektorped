/* VektörPad Shape tool and ellipse additions (written for this app):
   - Node commands: break the curve at the selected nodes, join two end nodes, extend the curve to close
     (straight line between two end nodes), extract a sub-path, reverse direction, reduce nodes (with a
     smoothness amount), align nodes horizontally or vertically, select all nodes (Ctrl+A).
   - Ellipses as pie or arc with start and end angles, on the Ellipse tool bar (for new ellipses) and on
     the property bar of a selected ellipse; the shape stays live. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const S = VP.settings;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const Pt = (x, y) => new paper.Point(x, y);
  const N = VP.tools.node;
  if (!N) return;
  const done = (msg) => {
    VP.commit();
    VP.drawOverlay();
    UI.schedule('prop', 'status');
    if (msg) VP.toast(msg);
  };
  const selSegs = () => Array.from(N.segs || []).filter((s) => s && s.path && s.path.parent);
  const isEnd = (s) => !s.path.closed && (s.index === 0 || s.index === s.path.segments.length - 1);
  // keep the item a single object: new sub-paths of a plain path make it a compound path
  const toCompound = () => {
    const t = N.target;
    if (!t || t instanceof paper.CompoundPath) return t;
    const cp = new paper.CompoundPath({ insert: false });
    cp.style = t.style;
    cp.data = t.data;
    cp.opacity = t.opacity;
    cp.blendMode = t.blendMode;
    t.parent.insertChild(t.index, cp);
    t.remove();
    cp.addChild(t);
    N.target = cp;
    VP.setSelection([cp]);
    return cp;
  };
  N.breakAt = () => {
    const list = selSegs();
    if (!list.length) return VP.toast('Önce kırılacak düğümleri seçin');
    let n = 0;
    list.forEach((s) => {
      const p = s.path;
      if (!p || !p.parent) return;
      if (p.closed) {
        // open the loop at this node: it becomes both ends
        const segs = p.segments.slice(s.index).concat(p.segments.slice(0, s.index)).map((g) => g.clone());
        segs.push(segs[0].clone());
        segs[0].handleIn = Pt(0, 0);
        segs[segs.length - 1].handleOut = Pt(0, 0);
        p.closed = false;
        p.segments = segs;
        n++;
        return;
      }
      if (isEnd(s)) return;
      const loc = p.getLocationOf(s.point);
      if (!loc) return;
      if (!(p.parent instanceof paper.CompoundPath)) toCompound();
      const rest = p.splitAt(loc);
      if (rest && rest.parent !== p.parent && p.parent) p.parent.insertChild(p.index + 1, rest);
      n++;
    });
    N.segs = new Set();
    if (n) done(n + ' noktada kırıldı');
  };
  const twoEnds = () => {
    const ends = selSegs().filter(isEnd);
    if (ends.length !== 2) {
      VP.toast('İki uç düğüm seçin');
      return null;
    }
    return ends;
  };
  // join (meet in the middle) or extend (straight line) two end nodes
  const connect = (merge) => {
    const ends = twoEnds();
    if (!ends) return;
    const [a, b] = ends;
    if (a.path === b.path) {
      const p = a.path;
      if (merge) {
        const first = p.firstSegment;
        const last = p.lastSegment;
        const mid = first.point.add(last.point).divide(2);
        first.point = mid;
        first.handleIn = last.handleIn.clone();
        last.remove();
      }
      p.closed = true;
      N.segs = new Set();
      return done(merge ? 'Düğümler birleştirildi' : 'Eğri kapatıldı');
    }
    let p1 = a.path;
    let p2 = b.path;
    // p1 must end at a, p2 must start at b
    if (a.index === 0) p1.reverse();
    if (b.index !== 0) p2.reverse();
    const e1 = p1.lastSegment;
    const s2 = p2.firstSegment;
    if (merge) {
      const mid = e1.point.add(s2.point).divide(2);
      e1.point = mid;
      e1.handleOut = s2.handleOut.clone();
      p2.segments.slice(1).forEach((g) => p1.add(g.clone()));
    } else p2.segments.forEach((g) => p1.add(g.clone()));
    p2.remove();
    N.segs = new Set();
    done(merge ? 'Düğümler birleştirildi' : 'Uçlar düz çizgiyle birleştirildi');
  };
  N.joinNodes = () => connect(true);
  N.extendClose = () => connect(false);
  N.extract = () => {
    const t = N.target;
    const s = selSegs()[0];
    if (!(t instanceof paper.CompoundPath) || !s) return VP.toast('Bileşik eğride ayıklanacak alt yolun bir düğümünü seçin');
    const p = s.path;
    const np = new paper.Path({ segments: p.segments.map((g) => g.clone()), closed: p.closed, insert: false });
    np.style = t.style;
    np.opacity = t.opacity;
    np.insertAbove(t);
    p.remove();
    N.segs = new Set();
    VP.commit();
    VP.setTool('select');
    VP.setSelection([np]);
    VP.toast('Alt yol ayrı nesne yapıldı');
  };
  N.reverseDir = () => {
    N.paths().forEach((p) => p.reverse());
    done('Eğri yönü ters çevrildi');
  };
  N.reduce = () => {
    const tol = Math.max(0.05, S.nodeReduce == null ? 1 : S.nodeReduce);
    let before = 0;
    let after = 0;
    N.paths().forEach((p) => {
      before += p.segments.length;
      p.simplify(tol);
      after += p.segments.length;
    });
    N.segs = new Set();
    done('Düğümler azaltıldı: ' + before + ' → ' + after);
  };
  N.alignNodes = (axis) => {
    const list = selSegs();
    if (list.length < 2) return VP.toast('Hizalamak için en az iki düğüm seçin');
    const avg = list.reduce((s, g) => s + (axis === 'h' ? g.point.y : g.point.x), 0) / list.length;
    list.forEach((g) => {
      if (axis === 'h') g.point = Pt(g.point.x, avg);
      else g.point = Pt(avg, g.point.y);
    });
    done('Düğümler hizalandı');
  };
  N.selectAllNodes = () => {
    N.segs = new Set(N.allSegs());
    VP.drawOverlay();
    UI.schedule('prop');
  };

  // node bar: extra buttons
  const btn = (act, inner, title) => '<button class="btn" data-act="' + act + '" title="' + esc(title) + '" aria-label="' + esc(title) + '">' + inner + '</button>';
  const rp0 = UI.renderPropbar;
  UI.renderPropbar = function () {
    const r = rp0.apply(this, arguments);
    const pb = document.getElementById('propbar');
    if (VP.toolId === 'node' && N.target && pb && !pb.querySelector('[data-act="nBreak"]')) {
      const s = document.createElement('span');
      s.className = 'vpn-bar';
      s.innerHTML = '<span class="pb-sep"></span>' +
        btn('nBreak', 'Kır', 'Eğriyi seçili düğümde kır') + btn('nJoin', 'Birleştir', 'İki uç düğümü birleştir') + btn('nExtend', 'Uzatarak kapat', 'İki uç düğümü düz çizgiyle birleştir') +
        btn('nExtract', 'Ayıkla', 'Alt yolu ayrı nesne yap') + btn('nReverse', 'Yönü çevir', 'Eğri yönünü ters çevir') + '<span class="pb-sep"></span>' +
        '<label class="range" title="Düğüm azaltma miktarı"><span class="pb-label">Yumuşatma</span><input type="range" data-vpn-red="1" min="1" max="100" value="' + Math.round((S.nodeReduce == null ? 1 : S.nodeReduce) * 10) + '"></label>' +
        btn('nReduce', 'Azalt', 'Düğüm sayısını azalt') + '<span class="pb-sep"></span>' +
        btn('nAlignH', 'Yatay hizala', 'Seçili düğümleri aynı yüksekliğe getir') + btn('nAlignV', 'Dikey hizala', 'Seçili düğümleri aynı dikeye getir') + btn('nAll', 'Tümü', 'Tüm düğümleri seç (Ctrl+A)');
      pb.appendChild(s);
    }
    return r;
  };
  document.addEventListener('input', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.vpnRed) S.nodeReduce = +e.target.value / 10;
  });
  const ACTS = { nBreak: () => N.breakAt(), nJoin: () => N.joinNodes(), nExtend: () => N.extendClose(), nExtract: () => N.extract(), nReverse: () => N.reverseDir(), nReduce: () => N.reduce(), nAlignH: () => N.alignNodes('h'), nAlignV: () => N.alignNodes('v'), nAll: () => N.selectAllNodes() };
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => {
    if (ACTS[id]) {
      ACTS[id]();
      return true;
    }
    if (/^ell[A-Z]/.test(id)) return ellAct(id);
    return act0(id, el);
  };
  addEventListener('keydown', (e) => {
    if (VP.toolId !== 'node' || !(e.ctrlKey || e.metaKey) || (e.key !== 'a' && e.key !== 'A')) return;
    const t = e.target;
    if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    if (!N.target) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    N.selectAllNodes();
  }, true);

  /* ---------- ellipse: pie and arc ---------- */
  const D = VP.defaults;
  if (!D.ellMode) D.ellMode = 'full';
  if (D.ellA0 == null) D.ellA0 = 0;
  if (D.ellA1 == null) D.ellA1 = 270;
  const bp0 = VP.buildParamPath;
  VP.buildParamPath = (p) => {
    if (p.kind !== 'ellipse' || !p.arc || p.arc.mode === 'full') return bp0(p);
    const w = Math.max(Math.abs(p.w), 0.01) / 2;
    const h = Math.max(Math.abs(p.h), 0.01) / 2;
    let a0 = p.arc.a0 || 0;
    let a1 = p.arc.a1 == null ? 270 : p.arc.a1;
    // angles counter-clockwise from the right, as in the desktop program (screen y points down)
    let sweep = ((a1 - a0) % 360 + 360) % 360;
    if (sweep < 0.01) sweep = 360;
    const P = (a) => Pt(Math.cos((a * Math.PI) / 180), -Math.sin((a * Math.PI) / 180));
    const unit = new paper.Path.Arc({ from: P(a0), through: P(a0 + sweep / 2), to: P(a0 + sweep), insert: false });
    if (p.arc.mode === 'pie') {
      unit.add(Pt(0, 0));
      unit.closed = true;
    }
    unit.scale(w, h, Pt(0, 0));
    if (p.angle) unit.rotate(p.angle, Pt(0, 0));
    unit.translate(Pt(p.cx, p.cy));
    return unit;
  };
  const cp0 = VP.createParam;
  VP.createParam = (prm) => {
    if (prm && prm.kind === 'ellipse' && !prm.arc && VP.toolId === 'ellipse' && D.ellMode !== 'full') prm.arc = { mode: D.ellMode, a0: D.ellA0, a1: D.ellA1 };
    const it = cp0(prm);
    if (prm && prm.arc && it && it.data.param && it.data.param.arc && prm.arc.mode === 'arc') {
      // an arc is an open line: no fill
      it.fillColor = null;
      if (!it.strokeColor) it.strokeColor = '#1d1d1b';
    }
    return it;
  };
  const ellipsesSel = () => VP.sel.filter((it) => it.data && it.data.param && it.data.param.kind === 'ellipse');
  const ellControls = (mode, a0, a1) =>
    '<span class="seg">' + [['full', 'Elips'], ['pie', 'Dilim'], ['arc', 'Yay']].map(([k, l]) => '<button data-act="ellMode:' + k + '" class="' + (mode === k ? 'on' : '') + '">' + l + '</button>').join('') + '</span>' +
    (mode !== 'full' ? H.field('Başlangıç', 'ellA0', VP.num(a0, 1), '°') + H.field('Bitiş', 'ellA1', VP.num(a1, 1), '°') + '<button class="btn" data-act="ellSwap" title="Yönü değiştir (tamamlayıcı dilim/yay)">⇄</button>' : '');
  UI.selExtras = UI.selExtras || [];
  UI.selExtras.push((s, one) => {
    const e = one && one.data && one.data.param && one.data.param.kind === 'ellipse' ? one : null;
    if (!e) return '';
    const a = e.data.param.arc || { mode: 'full', a0: D.ellA0, a1: D.ellA1 };
    return H.sep + ellControls(a.mode || 'full', a.a0 || 0, a.a1 == null ? 270 : a.a1);
  });
  const rp1 = UI.renderPropbar;
  UI.renderPropbar = function () {
    const r = rp1.apply(this, arguments);
    const pb = document.getElementById('propbar');
    if (VP.toolId === 'ellipse' && !VP.sel.length && pb && !pb.querySelector('[data-act^="ellMode"]')) {
      const s = document.createElement('span');
      s.innerHTML = H.sep + ellControls(D.ellMode, D.ellA0, D.ellA1);
      pb.appendChild(s);
    }
    return r;
  };
  const applyArc = (fn) => {
    const list = ellipsesSel();
    if (!list.length) {
      fn(null);
      return;
    }
    list.forEach((it) => {
      const p = it.data.param;
      p.arc = p.arc || { mode: 'full', a0: D.ellA0, a1: D.ellA1 };
      fn(p.arc);
      if (p.arc.mode === 'full') delete p.arc;
      VP.rebuildParam(it);
      if (p.arc && p.arc.mode === 'arc') it.fillColor = null;
    });
    VP.commit();
  };
  const ellAct = (id) => {
    const [k, arg] = id.split(':');
    if (k === 'ellMode') applyArc((a) => (a ? (a.mode = arg) : (D.ellMode = arg)));
    else if (k === 'ellSwap') applyArc((a) => {
      const o = a || D;
      if (a) [a.a0, a.a1] = [a.a1, a.a0];
      else [D.ellA0, D.ellA1] = [D.ellA1, D.ellA0];
      void o;
    });
    else return false;
    UI.schedule('prop');
    return true;
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, raw, el) => {
    if (n !== 'ellA0' && n !== 'ellA1') return pf0(n, raw, el);
    const v = VP.parseNum(raw);
    if (!isFinite(v)) return true;
    const key = n === 'ellA0' ? 'a0' : 'a1';
    applyArc((a) => {
      if (a) a[key] = v;
      else if (key === 'a0') D.ellA0 = v;
      else D.ellA1 = v;
    });
    return true;
  };
})();
