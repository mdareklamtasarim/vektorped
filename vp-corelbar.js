/* VektörPad rectangle corners and the desktop-style property bar (written for this app).
   - Rectangles get a corner type (round, scallop, chamfer) and four separate corner sizes, with a lock
     that keeps them equal.
   - In the classic look the property bar for a selection stacks X over Y and width over height, adds
     scale percentages and an outline width box, like the desktop program. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const S = VP.settings;
  const Pt = (x, y) => new paper.Point(x, y);
  const esc = UI.h.esc;
  const K = 0.5523;

  /* ---------- rectangle corner geometry ---------- */
  // radii in drawing units: top-left, top-right, bottom-right, bottom-left
  const radii = (p) => {
    const r = p.r || 0;
    if (!Array.isArray(p.rs)) return [r, r, r, r];
    // the single corner size was changed elsewhere (shape tool, dialog, scaling): the four follow it
    if (p._rmax != null && Math.abs(p._rmax - r) > 1e-9) {
      const m = p._rmax;
      p.rs = p.rs.map((x) => (m > 0 ? (x * r) / m : r));
      p._rmax = r;
    }
    return p.rs.slice(0, 4);
  };
  VP.rectRadii = radii;
  VP.setRectRadii = (p, rs) => {
    p.rs = rs.map((x) => Math.max(0, x || 0));
    p.r = Math.max.apply(null, p.rs);
    p._rmax = p.r;
    if (p.rs.every((x) => Math.abs(x - p.rs[0]) < 1e-9)) {
      delete p.rs;
      delete p._rmax;
    }
  };
  const custom = (p) => p.kind === 'rect' && ((Array.isArray(p.rs) && p.rs.some((x) => x > 0)) || (p.ct && p.ct !== 'round' && p.r > 0));
  const bp0 = VP.buildParamPath;
  VP.buildParamPath = (p) => {
    if (!custom(p)) return bp0(p);
    const w = Math.max(Math.abs(p.w), 0.01);
    const h = Math.max(Math.abs(p.h), 0.01);
    const lim = Math.min(w, h) / 2;
    const rs = radii(p).map((r) => Math.min(Math.max(0, r), lim));
    const type = p.ct || 'round';
    // corners in drawing order, each with the direction of travel coming in and going out
    const C = [
      [Pt(-w / 2, -h / 2), Pt(0, -1), Pt(1, 0)],
      [Pt(w / 2, -h / 2), Pt(1, 0), Pt(0, 1)],
      [Pt(w / 2, h / 2), Pt(0, 1), Pt(-1, 0)],
      [Pt(-w / 2, h / 2), Pt(-1, 0), Pt(0, -1)]
    ];
    const segs = [];
    C.forEach(([c, din, dout], i) => {
      const r = rs[i];
      if (r <= 1e-6) return segs.push(new paper.Segment(c));
      const a = c.subtract(din.multiply(r));
      const b = c.add(dout.multiply(r));
      if (type === 'chamfer') {
        segs.push(new paper.Segment(a), new paper.Segment(b));
      } else if (type === 'scallop') {
        // a quarter circle around the corner point, bent inwards
        segs.push(new paper.Segment(a, null, dout.multiply(K * r)), new paper.Segment(b, din.multiply(-K * r), null));
      } else {
        segs.push(new paper.Segment(a, null, din.multiply(K * r)), new paper.Segment(b, dout.multiply(-K * r), null));
      }
    });
    const path = new paper.Path({ segments: segs, closed: true, insert: false });
    if (p.angle) path.rotate(p.angle, Pt(0, 0));
    path.translate(Pt(p.cx, p.cy));
    return path;
  };

  /* ---------- property bar ---------- */
  const classic = () => document.documentElement.dataset.skin === 'classic';
  const mm = (pt, d = 2) => VP.num(VP.toMM(pt), d);
  const field = (label, name, value, unit, title) =>
    '<label class="field" title="' + esc(title || label) + '"><span>' + esc(label) + '</span><input data-pf="' + name + '" value="' + esc(value) + '" inputmode="decimal" enterkeyhint="done" aria-label="' + esc(title || label) + '" autocomplete="off">' + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</label>';
  const svg = (body) => '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  const CT_ICON = {
    round: svg('<path d="M5 20V11a6 6 0 016-6h9"/>'),
    scallop: svg('<path d="M5 20V11a6 6 0 006-6h9"/>'),
    chamfer: svg('<path d="M5 20v-9l6-6h9"/>')
  };
  const CT_LABEL = { round: 'Yuvarlak köşe', scallop: 'Oyuk köşe', chamfer: 'Pah kırılmış köşe' };
  const oneRect = () => {
    const s = VP.sel;
    return s.length === 1 && s[0].data && s[0].data.param && s[0].data.param.kind === 'rect' ? s[0] : null;
  };
  const rectsSel = () => VP.sel.filter((it) => it.data && it.data.param && it.data.param.kind === 'rect');
  const stack = (a, b) => '<span class="pb-stack">' + a + b + '</span>';
  const strokeOf = () => {
    const it = VP.leafItems ? VP.leafItems(VP.sel).find((x) => x.strokeColor) : VP.sel.find((x) => x.strokeColor);
    return it ? it.strokeWidth : 0;
  };
  const cornerGroup = (it) => {
    const p = it.data.param;
    const rs = radii(p);
    const ct = p.ct || 'round';
    const lock = S.cbRLock !== false;
    return (
      '<span class="pb-sep"></span><span class="seg cb-ct">' +
      ['round', 'scallop', 'chamfer'].map((t) => '<button class="' + (t === ct ? 'on' : '') + '" data-act="cbCt:' + t + '" title="' + CT_LABEL[t] + '" aria-label="' + CT_LABEL[t] + '" aria-pressed="' + (t === ct) + '">' + CT_ICON[t] + '</button>').join('') +
      '</span>' +
      stack(field('', 'cbR0', mm(rs[0], 1), 'mm', 'Sol üst köşe'), field('', 'cbR3', mm(rs[3], 1), 'mm', 'Sol alt köşe')) +
      '<button class="btn icon-only' + (lock ? ' on' : '') + '" data-act="cbRLock" aria-pressed="' + lock + '" title="' + (lock ? 'Köşeler birlikte değişiyor' : 'Köşeler ayrı ayrı') + '" aria-label="Köşe kilidi">' + VPIcon(lock ? 'lock' : 'unlock', 'sm') + '</button>' +
      stack(field('', 'cbR1', mm(rs[1], 1), 'mm', 'Sağ üst köşe'), field('', 'cbR2', mm(rs[2], 1), 'mm', 'Sağ alt köşe'))
    );
  };
  const restack = (pb) => {
    const q = (n) => pb.querySelector('[data-pf="' + n + '"]');
    const lab = (n) => (q(n) ? q(n).closest('label') : null);
    const pair = (a, b) => {
      const A = lab(a);
      const B = lab(b);
      if (!A || !B) return null;
      const st = document.createElement('span');
      st.className = 'pb-stack';
      A.parentNode.insertBefore(st, A);
      st.append(A, B);
      return st;
    };
    pair('x', 'y');
    const wh = pair('w', 'h');
    if (!wh) return;
    // scale percentages, then the ratio lock after them as in the desktop program
    const tmp = document.createElement('span');
    tmp.innerHTML = stack(field('', 'cbSx', '100,0', '%', 'Yatay ölçek'), field('', 'cbSy', '100,0', '%', 'Dikey ölçek'));
    const sc = tmp.firstChild;
    wh.after(sc);
    const ratio = pb.querySelector('[data-act="ratio"]');
    if (ratio) sc.after(ratio);
    const ang = lab('angle');
    // mirror buttons sit right after the angle, as in the desktop program
    if (ang) {
      const fv = pb.querySelector('[data-act="flipV"]');
      const fh = pb.querySelector('[data-act="flipH"]');
      if (fh && fv) ang.after(fh, fv);
    }
    const it = oneRect();
    const rr = lab('rectR');
    if (it && rr) {
      const t2 = document.createElement('span');
      t2.innerHTML = cornerGroup(it);
      // the old single "corner" box and the separator in front of it make room for the corner group
      const prev = rr.previousElementSibling;
      if (prev && prev.classList.contains('pb-sep')) prev.remove();
      rr.replaceWith(...t2.childNodes);
    }
    // outline width, for shapes with an outline
    if (!q('strokeW') && VP.sel.some((x) => !(x instanceof paper.Raster))) {
      const t3 = document.createElement('span');
      const sw = strokeOf();
      t3.innerHTML = '<span class="pb-sep"></span>' + field('', 'cbSW', sw ? VP.num(VP.toMM(sw), 2) : '—', 'mm', 'Anahat kalınlığı');
      const anchor = pb.querySelector('.cb-ct') ? pb.querySelector('[data-pf="cbR2"]').closest('.pb-stack') : ang;
      if (anchor) anchor.after(...t3.childNodes);
    }
    pb.classList.add('cb-stacked');
  };
  const rp0 = UI.renderPropbar;
  UI.renderPropbar = function () {
    const pb = document.getElementById('propbar');
    const busy = pb.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && UI._pbTyping;
    const r = rp0.apply(this, arguments);
    pb.classList.remove('cb-stacked');
    if (!busy && classic() && VP.sel.length && pb.querySelector('[data-pf="x"]')) {
      try {
        restack(pb);
      } catch (e) { /* the plain bar stays */ }
    }
    return r;
  };

  /* ---------- fields and buttons ---------- */
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, raw, el) => {
    if (n === 'rectR') {
      // one size for all four corners
      rectsSel().forEach((it) => {
        delete it.data.param.rs;
        delete it.data.param._rmax;
      });
      return pf0(n, raw, el);
    }
    if (!/^cb[A-Z]/.test(n)) return pf0(n, raw, el);
    const v = VP.parseNum(raw);
    if (n === 'cbSx' || n === 'cbSy') {
      if (!(v > 0)) return true;
      const b = VP.selBounds();
      if (n === 'cbSx') VP.setSelGeom({ w: (b.width * v) / 100 });
      else VP.setSelGeom({ h: (b.height * v) / 100 });
      return true;
    }
    if (n === 'cbSW') {
      if (!(v >= 0)) return true;
      VP.setStroke(VP.sel, { width: VP.toPT(v) });
      VP.commit();
      return true;
    }
    const m = /^cbR(\d)$/.exec(n);
    if (m && isFinite(v)) {
      const i = +m[1];
      const val = Math.max(0, VP.toPT(v));
      rectsSel().forEach((it) => {
        const p = it.data.param;
        const rs = radii(p);
        if (S.cbRLock !== false) rs.fill(val);
        else rs[i] = val;
        VP.setRectRadii(p, rs);
        VP.rebuildParam(it);
      });
      VP.commit();
      return true;
    }
    return true;
  };
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => {
    if (id.startsWith('cbCt:')) {
      const t = id.slice(5);
      const list = rectsSel();
      list.forEach((it) => {
        it.data.param.ct = t === 'round' ? undefined : t;
        if (t === 'round') delete it.data.param.ct;
        VP.rebuildParam(it);
      });
      if (list.length) {
        if (list.every((it) => !(it.data.param.r > 0))) VP.toast('Köşe türü, köşe boyutu verildiğinde görünür');
        VP.commit();
      }
      return true;
    }
    if (id === 'cbRLock') {
      S.cbRLock = S.cbRLock === false;
      return true;
    }
    return act0(id, el);
  };

  /* ---------- look ---------- */
  const css = document.createElement('style');
  const R = 'html[data-skin="classic"] #propbar.cb-stacked';
  css.textContent =
    R + ' .pb-stack{display:inline-flex;flex-direction:column;gap:1px;flex:none}' +
    R + ' .pb-stack .field{height:15px;min-height:0;padding:0 4px;font-size:11px;border-radius:2px}' +
    R + ' .pb-stack .field input{font-size:11px;height:14px;width:58px;padding:0}' +
    R + ' .pb-stack .field>span:first-child{min-width:12px}' +
    R + ' .pb-stack .field>span:first-child:empty{display:none}' +
    R + ' .pb-stack .field .unit{font-size:10px}' +
    R + ' [data-pf="cbSx"],' + R + ' [data-pf="cbSy"]{width:40px!important}' +
    R + ' [data-pf^="cbR"]{width:40px!important}' +
    R + ' .cb-ct button{min-width:26px;padding:0 3px}' +
    R + ' [data-pf="cbSW"]{width:44px}' +
    '@media (pointer:coarse){' + R + ' .pb-stack .field{height:19px}' + R + ' .pb-stack .field input{font-size:12px;height:18px}' + R + ' .cb-ct button{min-width:32px}}';
  document.head.appendChild(css);
})();
