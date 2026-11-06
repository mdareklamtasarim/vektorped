/* VektörPad letters of artistic text, as with the desktop program's Shape tool on text (written for this
   app): with the Shape tool on an artistic text every letter gets a small node under it. Tap a node to
   pick the letter (Shift or the multi-select button adds), drag to move the picked letters; the property
   bar gives the picked letters their own font, size, colour, bold, rotation and offset. The text stays
   editable. Letter settings draw on screen and come out the same in every export. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const Pt = (x, y) => new paper.Point(x, y);
  const N = VP.tools.node;
  if (!N) return;
  const CH = (VP.chars = {});
  const has = (t) => !!(t && t.data && t.data.chars && Object.keys(t.data.chars).length);
  const famOf = (t) => String(t.fontFamily || 'Fira Sans').replace(/["']/g, '');
  const fontFor = (t, o, px) => {
    const bold = o && o.bold != null ? o.bold : VP.isBold(t);
    const ital = VP.isItalic(t);
    return (ital ? 'italic ' : '') + (bold ? 'bold ' : '') + px + 'px "' + ((o && o.font) || famOf(t)) + '"';
  };
  let mctx = null;
  const ctx2 = () => mctx || (mctx = document.createElement('canvas').getContext('2d'));
  // every letter's box in the text's own coordinates
  CH.layout = (t) => {
    const ctx = ctx2();
    const map = (t.data && t.data.chars) || {};
    const lead = t.leading || t.fontSize * 1.2;
    const ot = t.data && t.data.ot;
    const track = ot && ot.track ? (ot.track / 1000) * t.fontSize : 0;
    const out = [];
    let idx = 0;
    String(t.content || '').split(/\r\n|\r|\n/).forEach((line, li) => {
      const chars = Array.from(line);
      const ws = chars.map((ch, k) => {
        const o = map[idx + k];
        ctx.font = fontFor(t, o, (o && o.size) || t.fontSize);
        return ctx.measureText(ch).width;
      });
      const W = ws.reduce((a, b) => a + b, 0) + track * Math.max(0, chars.length - 1);
      let x = t.justification === 'center' ? -W / 2 : t.justification === 'right' ? -W : 0;
      chars.forEach((ch, k) => {
        const o = map[idx + k] || {};
        out.push({ i: idx + k, ch, x, y: li * lead, w: ws[k], o });
        x += ws[k] + track;
      });
      idx += chars.length + 1;
    });
    return out;
  };
  const PT = paper.PointText.prototype;
  const d0 = PT._draw;
  PT._draw = function (ctx, param, vm) {
    if (!has(this)) return d0.call(this, ctx, param, vm);
    if (this._setStyles) this._setStyles(ctx, param, vm);
    const st = this._style;
    const hasFill = st.hasFill();
    const hasStroke = st.hasStroke();
    ctx.textAlign = 'left';
    CH.layout(this).forEach((L) => {
      const o = L.o;
      ctx.save();
      ctx.translate(L.x + (o.dx || 0), L.y + (o.dy || 0));
      if (o.rot) ctx.rotate((-o.rot * Math.PI) / 180);
      ctx.font = fontFor(this, o, o.size || this.fontSize);
      if (o.fill) ctx.fillStyle = o.fill;
      if (hasFill || o.fill) ctx.fillText(L.ch, 0, 0);
      if (hasStroke) ctx.strokeText(L.ch, 0, 0);
      ctx.restore();
    });
  };
  // exports: one text object per letter, so every format keeps the look
  const explode = (t) => {
    const g = new paper.Group({ insert: false });
    CH.layout(t).forEach((L) => {
      if (!L.ch.trim()) return;
      const o = L.o;
      const c = new paper.PointText({ point: Pt(0, 0), content: L.ch, fontFamily: o.font || t.fontFamily, fontSize: o.size || t.fontSize, fontWeight: o.bold != null ? (o.bold ? 'bold' : 'normal') : t.fontWeight, fillColor: o.fill || t.fillColor, strokeColor: t.strokeColor, strokeWidth: t.strokeWidth, insert: false });
      c.justification = 'left';
      const m = new paper.Matrix().translate(L.x + (o.dx || 0), L.y + (o.dy || 0));
      if (o.rot) m.rotate(-o.rot, 0, 0);
      c.transform(t.matrix.clone().append(m));
      g.addChild(c);
    });
    g.opacity = t.opacity;
    g.insertAbove(t);
    t.remove();
    return g;
  };
  VP.io.exportHooks = VP.io.exportHooks || [];
  VP.io.exportHooks.unshift((tmp) => tmp.getItems({ class: paper.PointText, match: has }).forEach(explode));
  const ttp0 = VP.textToPath;
  VP.textToPath = (t) => {
    if (!has(t) || !t.parent) return ttp0(t);
    const g = explode(t);
    const parts = g.children.slice().map((c) => VP.textToPath(c)).filter(Boolean);
    if (!parts.length) return g;
    const cp = new paper.CompoundPath({ insert: false });
    parts.forEach((p) => {
      if (p instanceof paper.CompoundPath) p.children.slice().forEach((k) => cp.addChild(k));
      else cp.addChild(p);
    });
    // letters with their own colour keep it as separate shapes
    const colours = new Set(parts.map((p) => (p.fillColor ? p.fillColor.toCSS(true) : '')));
    if (colours.size > 1) return g;
    cp.fillColor = parts[0].fillColor;
    cp.strokeColor = parts[0].strokeColor;
    cp.strokeWidth = parts[0].strokeWidth;
    cp.insertAbove(g);
    g.remove();
    return cp;
  };

  /* ---------- Shape tool on artistic text ---------- */
  CH.target = null;
  CH.picked = new Set();
  const nodePos = (t, L) => t.matrix.transform(Pt(L.x + (L.o.dx || 0), L.y + (L.o.dy || 0) + t.fontSize * 0.18));
  const pick0 = N.pick;
  N.pick = function (item) {
    if (item instanceof paper.PointText) {
      CH.target = item;
      CH.picked = new Set();
      this.target = null;
      this.segs = new Set();
      if (VP.sel.length !== 1 || VP.sel[0] !== item) VP.setSelection([item]);
      VP.drawOverlay();
      UI.schedule('prop');
      return;
    }
    CH.target = null;
    return pick0.apply(this, arguments);
  };
  const letterAt = (pt) => {
    const t = CH.target;
    if (!t) return null;
    const tol = (VP.coarse ? 14 : 8) / paper.view.zoom;
    let best = null;
    CH.layout(t).forEach((L) => {
      if (!L.ch.trim()) return;
      const d = nodePos(t, L).getDistance(pt);
      if (d < tol && (!best || d < best.d)) best = { L, d };
    });
    return best && best.L;
  };
  const down0 = N.down;
  const move0 = N.move;
  const up0 = N.up;
  N.down = function (e) {
    const t = CH.target;
    if (t && t.parent) {
      const L = letterAt(e.point);
      if (L) {
        if (e.shift || VP.settings.multi) {
          if (CH.picked.has(L.i)) CH.picked.delete(L.i);
          else CH.picked.add(L.i);
        } else if (!CH.picked.has(L.i)) CH.picked = new Set([L.i]);
        this.op = { type: 'letters', start: e.point, inv: t.matrix.inverted(), changed: false, base: {} };
        CH.picked.forEach((i) => {
          const o = (t.data.chars && t.data.chars[i]) || {};
          this.op.base[i] = [o.dx || 0, o.dy || 0];
        });
        VP.drawOverlay();
        UI.schedule('prop');
        return;
      }
      const hit = VP.hitItem(e.point);
      if (hit === t) {
        CH.picked = new Set();
        VP.drawOverlay();
        UI.schedule('prop');
        this.op = null;
        return;
      }
      CH.target = null;
      if (hit) return this.pick(hit);
      VP.drawOverlay();
    }
    return down0.apply(this, arguments);
  };
  N.move = function (e) {
    const op = this.op;
    if (op && op.type === 'letters') {
      const t = CH.target;
      const a = op.inv.transform(op.start);
      const b = op.inv.transform(e.point);
      const d = b.subtract(a);
      t.data.chars = t.data.chars || {};
      CH.picked.forEach((i) => {
        const o = (t.data.chars[i] = t.data.chars[i] || {});
        o.dx = op.base[i][0] + d.x;
        o.dy = op.base[i][1] + d.y;
      });
      op.changed = true;
      t.content = t.content;
      VP.drawOverlay();
      return;
    }
    return move0.apply(this, arguments);
  };
  N.up = function (e) {
    const op = this.op;
    if (op && op.type === 'letters') {
      this.op = null;
      if (op.changed) VP.commit();
      return;
    }
    return up0.apply(this, arguments);
  };
  const ov0 = N.overlay;
  N.overlay = function (L) {
    const t = CH.target;
    if (!t || !t.parent || VP.toolId !== 'node') return ov0.apply(this, arguments);
    const s = 1 / paper.view.zoom;
    const hs = (VP.coarse ? 7 : 5) * s;
    const acc = new paper.Color(VP.colors.accent || '#1461b2');
    L.addChild(new paper.Path.Rectangle({ rectangle: t.bounds, strokeColor: acc, strokeWidth: s, dashArray: [3 * s, 3 * s], opacity: 0.6, insert: false }));
    CH.layout(t).forEach((Lt) => {
      if (!Lt.ch.trim()) return;
      const p = nodePos(t, Lt);
      const on = CH.picked.has(Lt.i);
      L.addChild(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(p.subtract(hs / 2), new paper.Size(hs, hs)), fillColor: on ? acc : '#ffffff', strokeColor: acc, strokeWidth: s, insert: false }));
    });
    return true;
  };

  // property bar for picked letters
  const rp0 = UI.renderPropbar;
  UI.renderPropbar = function () {
    const pb = document.getElementById('propbar');
    const t = CH.target;
    if (VP.toolId !== 'node' || !t || !t.parent || !pb) return rp0.apply(this, arguments);
    if (pb.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && UI._pbTyping) return;
    const n = CH.picked.size;
    const first = n ? (t.data.chars && t.data.chars[[...CH.picked][0]]) || {} : {};
    const fonts = VP.FONTS.slice();
    let h = '<span class="pb-title">Harfler</span><span class="pb-label">' + (n ? n + ' harf seçili' : 'Harf düğümüne dokunun · Shift ile ekleyin') + '</span>';
    if (n) {
      h += H.sep + '<label class="field"><span>Yazı tipi</span><select data-pf="chFont">' + ['', ...fonts].map((f) => '<option value="' + esc(f) + '"' + ((first.font || '') === f ? ' selected' : '') + '>' + esc(f || '(metninki)') + '</option>').join('') + '</select></label>' +
        H.field('Boyut', 'chSize', VP.num(first.size || t.fontSize, 1), 'pt') +
        '<label class="field"><span>Renk</span><input type="color" data-pf="chFill" value="' + esc(first.fill || VP.hex(t.fillColor) || '#000000') + '" style="width:34px;height:22px;padding:0;border:0;background:transparent"></label>' +
        H.tog('chBold', '<b>K</b>', !!first.bold, 'Kalın') +
        H.field('Açı', 'chRot', VP.num(first.rot || 0, 1), '°') +
        H.field('Yatay', 'chDx', VP.num(VP.toMM(first.dx || 0), 2)) + H.field('Dikey', 'chDy', VP.num(VP.toMM(-(first.dy || 0)), 2)) +
        H.btn('chReset', 'Sıfırla', 'Seçili harflerin ayarlarını kaldır');
    }
    h += H.sep + H.btn('chAll', 'Tüm harfler', 'Bütün harfleri seç') + H.btn('chResetAll', 'Hepsini sıfırla', 'Bütün harf ayarlarını kaldır');
    pb.innerHTML = h;
  };
  const setPicked = (fn) => {
    const t = CH.target;
    if (!t || !CH.picked.size) return;
    t.data.chars = t.data.chars || {};
    CH.picked.forEach((i) => {
      const o = (t.data.chars[i] = t.data.chars[i] || {});
      fn(o);
      Object.keys(o).forEach((k) => (o[k] === undefined || o[k] === '' || o[k] === null) && delete o[k]);
      if (!Object.keys(o).length) delete t.data.chars[i];
    });
    if (!Object.keys(t.data.chars).length) delete t.data.chars;
    t.content = t.content;
    VP.commit();
    VP.drawOverlay();
    UI.schedule('prop');
  };
  const pf0 = VP.tx.propField;
  VP.tx.propField = (n, raw, el) => {
    if (!/^ch[A-Z]/.test(n)) return pf0(n, raw, el);
    const v = VP.parseNum(raw);
    if (n === 'chFont') setPicked((o) => (o.font = raw || undefined));
    else if (n === 'chSize' && v > 0) setPicked((o) => (o.size = v));
    else if (n === 'chFill') setPicked((o) => (o.fill = UI.normHex ? UI.normHex(raw) : raw));
    else if (n === 'chRot' && isFinite(v)) setPicked((o) => (o.rot = v || undefined));
    else if (n === 'chDx' && isFinite(v)) setPicked((o) => (o.dx = VP.toPT(v) || undefined));
    else if (n === 'chDy' && isFinite(v)) setPicked((o) => (o.dy = -VP.toPT(v) || undefined));
    return true;
  };
  const act0 = VP.tx.act;
  VP.tx.act = (id, el) => {
    if (!/^ch[A-Z]/.test(id)) return act0(id, el);
    const t = CH.target;
    if (!t) return true;
    if (id === 'chBold') setPicked((o) => (o.bold = o.bold ? undefined : true));
    else if (id === 'chReset') setPicked((o) => Object.keys(o).forEach((k) => delete o[k]));
    else if (id === 'chAll') {
      CH.picked = new Set(CH.layout(t).filter((L) => L.ch.trim()).map((L) => L.i));
      VP.drawOverlay();
      UI.schedule('prop');
    } else if (id === 'chResetAll') {
      delete t.data.chars;
      t.content = t.content;
      VP.commit();
      VP.drawOverlay();
    }
    return true;
  };
  // editing the words keeps letter settings in place as far as possible (they follow their position)
  VP.on('selection', () => {
    if (CH.target && (!VP.sel.includes(CH.target) || VP.toolId !== 'node')) {
      CH.target = null;
      CH.picked = new Set();
    }
  });
})();
