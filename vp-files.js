/* VektörPad files, second set: export dialog (PDF, SVG, PNG, JPG, WEBP, EPS, DXF; page, range or selection),
   PDF settings (metadata, password and permissions, bleed and crop marks, text as curves), imposition
   (2-up, 4-up, booklet), printing through the system print dialog, print styles, and import of PDF/AI
   (vector paths and text, or as an image) and DXF drawings. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const A = VP.actions;
  const IO = VP.io;
  const FL = (VP.files = {});
  const Pt = (x, y) => new paper.Point(x, y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mmPT = (v) => VP.toPT(v);

  /* =============== helpers =============== */
  // "1-3, 5" -> [0,1,2,4]
  FL.parseRange = (s, n) => {
    const out = [];
    String(s || '').split(/[,;\s]+/).forEach((part) => {
      const m = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return;
      const a = +m[1];
      const b = m[2] ? +m[2] : a;
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= n && !out.includes(i - 1)) out.push(i - 1);
    });
    return out;
  };
  const pagesOf = (o) => {
    const n = VP.doc.pages.length;
    if (o.range === 'one') return [VP.doc.active];
    if (o.range === 'custom') {
      const r = FL.parseRange(o.rangeText, n);
      return r.length ? r : [VP.doc.active];
    }
    return VP.doc.pages.map((_, i) => i);
  };
  const selJSON = () => {
    const L = new paper.Layer({ insert: false });
    VP.zSort(VP.sel).forEach((it) => L.addChild(it.clone({ insert: false })));
    return { layers: [L.exportJSON({ asString: true })], box: VP.selBounds().expand(1) };
  };
  const svgString = (svg) => '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + new XMLSerializer().serializeToString(svg);
  const suffix = (i) => (VP.doc.pages.length > 1 ? '-' + (i + 1) : '');
  const fonts = (pdf) => {
    try {
      if (window.VP_FONTS) {
        pdf.addFileToVFS('FiraSans-Regular.ttf', window.VP_FONTS.regular);
        pdf.addFont('FiraSans-Regular.ttf', 'Fira Sans', 'normal');
        pdf.addFileToVFS('FiraSans-Bold.ttf', window.VP_FONTS.bold);
        pdf.addFont('FiraSans-Bold.ttf', 'Fira Sans', 'bold');
        pdf.setFont('Fira Sans', 'normal');
      }
    } catch (e) { /* standard fonts */ }
  };
  const placeSVG = async (pdf, svg, x, y, w, h) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden;';
    document.body.appendChild(host);
    host.appendChild(svg);
    try {
      if (typeof pdf.svg === 'function') await pdf.svg(svg, { x, y, width: w, height: h });
      else await window.svg2pdf.svg2pdf(svg, pdf, { x, y, width: w, height: h });
    } finally {
      host.remove();
    }
  };

  /* =============== raster export (PNG, JPG, WEBP) =============== */
  FL.raster = async (o) => {
    VP.storePage();
    const type = o.fmt === 'jpg' ? 'image/jpeg' : o.fmt === 'webp' ? 'image/webp' : 'image/png';
    const white = o.fmt === 'jpg' || o.bg !== 'clear';
    const p = VP.page();
    let g;
    let area;
    if (o.area === 'sel' && VP.sel.length) {
      g = new paper.Group({ insert: false });
      VP.zSort(VP.sel).forEach((it) => g.addChild(it.clone({ insert: false })));
      area = g.strokeBounds;
      if (white) g.insertChild(0, new paper.Path.Rectangle({ rectangle: area, fillColor: '#ffffff', insert: false }));
    } else {
      g = VP.composePageGroup({ white, res: o.dpi });
      area = new paper.Rectangle(0, 0, p.w, p.h);
    }
    let res = o.dpi;
    while ((area.width * res / 72) * (area.height * res / 72) > 16e6 && res > 36) res = Math.floor(res * 0.8);
    if (res !== o.dpi) VP.toast('Çok büyük · Çözünürlük ' + res + ' dpi yapıldı');
    const r = g.rasterize(res, false);
    let cv = r.canvas;
    if (white && type !== 'image/png') {
      const c2 = document.createElement('canvas');
      c2.width = cv.width;
      c2.height = cv.height;
      const x = c2.getContext('2d');
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, c2.width, c2.height);
      x.drawImage(cv, 0, 0);
      cv = c2;
    }
    const blob = await new Promise((resolve) => cv.toBlob(resolve, type, clamp((o.quality || 90) / 100, 0.1, 1)));
    if (!blob) return VP.toast('Resim oluşturulamadı');
    const ext = o.fmt === 'jpg' ? '.jpg' : '.' + o.fmt;
    return IO.saveFile(IO.safeName() + (o.area === 'sel' ? '-secim' : suffix(VP.doc.active)) + ext, blob);
  };

  /* =============== EPS (PostScript) =============== */
  const n3 = (v) => String(Math.round(v * 1000) / 1000);
  const rgb = (c) => {
    const x = c.convert('rgb');
    return [x.red, x.green, x.blue];
  };
  const translit = (s) => String(s).replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => ({ ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' }[c])).replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1');
  FL.eps = (proj, box) => {
    const Hh = box.height;
    const T = (p) => [p.x - box.x, Hh - (p.y - box.y)];
    const out = [];
    const pathOps = (path, m) => {
      const segs = path.segments;
      if (!segs.length) return '';
      const P = (pt) => T(m.transform(pt));
      let s = '';
      const p0 = P(segs[0].point);
      s += n3(p0[0]) + ' ' + n3(p0[1]) + ' moveto\n';
      const n = segs.length;
      const last = path.closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = segs[i];
        const b = segs[(i + 1) % n];
        const e = P(b.point);
        if (a.handleOut.isZero() && b.handleIn.isZero()) s += n3(e[0]) + ' ' + n3(e[1]) + ' lineto\n';
        else {
          const c1 = P(a.point.add(a.handleOut));
          const c2 = P(b.point.add(b.handleIn));
          s += [c1, c2, e].map((q) => n3(q[0]) + ' ' + n3(q[1])).join(' ') + ' curveto\n';
        }
      }
      if (path.closed) s += 'closepath\n';
      return s;
    };
    const shapeOps = (it) => {
      const m = it.globalMatrix;
      if (it instanceof paper.CompoundPath) return it.children.map((c) => pathOps(c, c.globalMatrix)).join('');
      return pathOps(it, m);
    };
    const shading = (col, it) => {
      const g = col.gradient;
      const m = it.globalMatrix;
      const o = T(m.transform(col.origin));
      const d = T(m.transform(col.destination));
      const st = g.stops.map((s) => [rgb(s.color), s.offset == null ? 0 : s.offset]);
      let fn;
      const f2 = (a, b) => '<< /FunctionType 2 /Domain [0 1] /C0 [' + a.map(n3).join(' ') + '] /C1 [' + b.map(n3).join(' ') + '] /N 1 >>';
      if (st.length <= 2) fn = f2(st[0][0], st[st.length - 1][0]);
      else {
        const fs = [];
        for (let i = 0; i < st.length - 1; i++) fs.push(f2(st[i][0], st[i + 1][0]));
        fn = '<< /FunctionType 3 /Domain [' + n3(st[0][1]) + ' ' + n3(st[st.length - 1][1]) + '] /Functions [' + fs.join(' ') + '] /Bounds [' + st.slice(1, -1).map((s) => n3(s[1])).join(' ') + '] /Encode [' + fs.map(() => '0 1').join(' ') + '] >>';
      }
      const coords = g.radial ? [o[0], o[1], 0, o[0], o[1], Math.hypot(d[0] - o[0], d[1] - o[1])] : [o[0], o[1], d[0], d[1]];
      return '<< /ShadingType ' + (g.radial ? 3 : 2) + ' /ColorSpace /DeviceRGB /Coords [' + coords.map(n3).join(' ') + '] /Extend [true true] /Function ' + fn + ' >> shfill\n';
    };
    const paint = (it) => {
      const s = shapeOps(it);
      if (!s) return;
      const even = it.fillRule === 'evenodd';
      const fc = it.fillColor;
      if (fc && fc.alpha !== 0) {
        if (fc.type === 'gradient') out.push('gsave newpath\n' + s + (even ? 'eoclip' : 'clip') + '\n' + shading(fc, it) + 'grestore');
        else out.push(rgb(fc).map(n3).join(' ') + ' setrgbcolor newpath\n' + s + (even ? 'eofill' : 'fill'));
      }
      const sc = it.strokeColor;
      if (sc && it.strokeWidth > 0 && sc.alpha !== 0) {
        const k = Math.sqrt(Math.abs(it.globalMatrix.a * it.globalMatrix.d - it.globalMatrix.b * it.globalMatrix.c)) || 1;
        const cap = { butt: 0, round: 1, square: 2 }[it.strokeCap] || 0;
        const join = { miter: 0, round: 1, bevel: 2 }[it.strokeJoin] || 0;
        const dash = (it.dashArray || []).length ? '[' + it.dashArray.map((d) => n3(d * k)).join(' ') + '] 0 setdash' : '[] 0 setdash';
        const col = sc.type === 'gradient' ? sc.gradient.stops[0].color : sc;
        out.push('gsave ' + rgb(col).map(n3).join(' ') + ' setrgbcolor ' + n3(it.strokeWidth * k) + ' setlinewidth ' + cap + ' setlinecap ' + join + ' setlinejoin ' + dash + ' newpath\n' + s + 'stroke grestore');
      }
    };
    const image = (r) => {
      let cv;
      try {
        cv = r.getSubCanvas(new paper.Rectangle(0, 0, r.width, r.height));
      } catch (e) {
        return;
      }
      let w = cv.width;
      let h = cv.height;
      const k = Math.min(1, 1500 / Math.max(w, h));
      if (k < 1) {
        const c2 = document.createElement('canvas');
        c2.width = Math.round(w * k);
        c2.height = Math.round(h * k);
        c2.getContext('2d').drawImage(cv, 0, 0, c2.width, c2.height);
        cv = c2;
        w = c2.width;
        h = c2.height;
      }
      const d = cv.getContext('2d').getImageData(0, 0, w, h).data;
      const m = r.globalMatrix;
      const BL = T(m.transform(Pt(-r.width / 2, r.height / 2)));
      const BR = T(m.transform(Pt(r.width / 2, r.height / 2)));
      const TL = T(m.transform(Pt(-r.width / 2, -r.height / 2)));
      let hex = '';
      const hx = (v) => (v < 16 ? '0' : '') + v.toString(16);
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        hex += hx(Math.round(d[i] * a + 255 * (1 - a))) + hx(Math.round(d[i + 1] * a + 255 * (1 - a))) + hx(Math.round(d[i + 2] * a + 255 * (1 - a)));
        if ((i / 4) % 40 === 39) hex += '\n';
      }
      out.push('gsave [' + [BR[0] - BL[0], BR[1] - BL[1], TL[0] - BL[0], TL[1] - BL[1], BL[0], BL[1]].map(n3).join(' ') + '] concat\n/DeviceRGB setcolorspace\n<< /ImageType 1 /Width ' + w + ' /Height ' + h + ' /BitsPerComponent 8 /Decode [0 1 0 1 0 1] /ImageMatrix [' + w + ' 0 0 -' + h + ' 0 ' + h + '] /DataSource currentfile /ASCIIHexDecode filter >> image\n' + hex + '>\ngrestore');
    };
    const walk = (it) => {
      if (!it.visible || it.opacity === 0 || (it.data && it.data.hitOnly)) return;
      if (it instanceof paper.Group || it instanceof paper.Layer) {
        if (it.clipped && it.children[0]) {
          out.push('gsave newpath\n' + shapeOps(it.children[0]) + 'clip newpath');
          it.children.slice(1).forEach(walk);
          out.push('grestore');
        } else it.children.forEach(walk);
        return;
      }
      if (it instanceof paper.Raster) return image(it);
      if (it instanceof paper.PointText) {
        const m = it.globalMatrix;
        void m;
        const p = T((it.parent ? it.parent.globalMatrix : new paper.Matrix()).transform(it.point));
        const col = it.fillColor ? rgb(it.fillColor.type === 'gradient' ? it.fillColor.gradient.stops[0].color : it.fillColor) : [0, 0, 0];
        const bold = VP.isBold(it);
        out.push(col.map(n3).join(' ') + ' setrgbcolor /Helvetica' + (bold ? '-Bold' : '') + ' findfont ' + n3(it.fontSize) + ' scalefont setfont ' + n3(p[0]) + ' ' + n3(p[1]) + ' moveto (' + translit(it.content) + ') show');
        return;
      }
      if (it instanceof paper.Path || it instanceof paper.CompoundPath) paint(it);
    };
    proj.layers.forEach(walk);
    const W = box.width;
    return '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 ' + Math.ceil(W) + ' ' + Math.ceil(Hh) + '\n%%HiResBoundingBox: 0 0 ' + n3(W) + ' ' + n3(Hh) + '\n%%Creator: VektorPad\n%%Title: ' + translit(VP.doc.name || 'cizim') + '\n%%LanguageLevel: 3\n%%Pages: 1\n%%EndComments\n%%Page: 1 1\ngsave\n' + out.join('\n') + '\ngrestore\nshowpage\n%%EOF\n';
  };

  /* =============== DXF =============== */
  const ACI = [[1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]], [6, [255, 0, 255]], [7, [0, 0, 0]], [8, [128, 128, 128]], [9, [192, 192, 192]], [30, [255, 127, 0]]];
  const aci = (c) => {
    if (!c) return 7;
    const v = rgb(c.type === 'gradient' ? c.gradient.stops[0].color : c).map((x) => x * 255);
    let best = 7;
    let bd = 1e9;
    ACI.forEach(([i, q]) => {
      const d = (v[0] - q[0]) ** 2 + (v[1] - q[1]) ** 2 + (v[2] - q[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  FL.dxf = (proj, box) => {
    const o = [];
    const P = (p) => [VP.toMM(p.x - box.x), VP.toMM(box.height - (p.y - box.y))];
    const layerName = (it) => String((it.layer && it.layer.name) || '0').replace(/[^A-Za-z0-9_\-]/g, '_') || '0';
    const poly = (pts, closed, it) => {
      if (pts.length < 2) return;
      o.push('0', 'POLYLINE', '8', layerName(it), '62', String(aci(it.strokeColor || it.fillColor)), '66', '1', '10', '0', '20', '0', '30', '0', '70', closed ? '1' : '0');
      pts.forEach((p) => o.push('0', 'VERTEX', '8', layerName(it), '10', p[0].toFixed(4), '20', p[1].toFixed(4), '30', '0'));
      o.push('0', 'SEQEND', '8', layerName(it));
    };
    const flat = (path) => {
      const q = path.clone({ insert: false });
      q.transform(path.globalMatrix);
      q.flatten(0.25);
      const pts = q.segments.map((s) => P(s.point));
      return { pts, closed: q.closed };
    };
    const walk = (it) => {
      if (!it.visible || (it.data && it.data.hitOnly)) return;
      if (it instanceof paper.Group || it instanceof paper.Layer) return it.children.forEach((c, i) => (it.clipped && i === 0 ? null : walk(c)));
      if (it instanceof paper.PointText) {
        const p = P((it.parent ? it.parent.globalMatrix : new paper.Matrix()).transform(it.point));
        o.push('0', 'TEXT', '8', layerName(it), '62', String(aci(it.fillColor)), '10', p[0].toFixed(4), '20', p[1].toFixed(4), '30', '0', '40', VP.toMM(it.fontSize * 0.72).toFixed(3), '1', String(it.content).replace(/\n/g, ' '), '50', String(-Math.round(VP.itemAngle ? VP.itemAngle(it) : 0)));
        return;
      }
      if (it instanceof paper.Raster) {
        const b = it.bounds;
        poly([P(b.topLeft), P(b.topRight), P(b.bottomRight), P(b.bottomLeft)], true, it);
        return;
      }
      if (it instanceof paper.CompoundPath) return it.children.forEach((c) => {
        const f = flat(c);
        poly(f.pts, f.closed, it);
      });
      if (it instanceof paper.Path) {
        const f = flat(it);
        poly(f.pts, f.closed, it);
      }
    };
    proj.layers.forEach(walk);
    return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '9', '$EXTMIN', '10', '0', '20', '0', '9', '$EXTMAX', '10', VP.toMM(box.width).toFixed(3), '20', VP.toMM(box.height).toFixed(3), '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'].concat(o, ['0', 'ENDSEC', '0', 'EOF']).join('\r\n') + '\r\n';
  };

  /* =============== PDF with settings and imposition =============== */
  FL.SHEETS = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4], A5: [148, 210] };
  // order of pages on booklet sheets (front/back of each folded sheet)
  FL.bookletOrder = (n) => {
    const total = Math.ceil(n / 4) * 4;
    const seq = [];
    for (let i = 0; i < total / 2; i += 2) {
      seq.push([total - 1 - i, i]);
      seq.push([i + 1, total - 2 - i]);
    }
    return seq.map((pair) => pair.map((k) => (k < n ? k : -1)));
  };
  const cropMarks = (pdf, x, y, w, h, bleed) => {
    const L = 14;
    const gap = Math.max(3, bleed + 2);
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.3);
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy], i) => {
      const sx = i % 2 === 0 ? -1 : 1;
      const sy = i < 2 ? -1 : 1;
      pdf.line(cx + sx * gap, cy, cx + sx * (gap + L), cy);
      pdf.line(cx, cy + sy * gap, cx, cy + sy * (gap + L));
    });
  };
  FL.pdf = async (o) => {
    const lib = window.jspdf;
    if (!lib || !lib.jsPDF) return VP.toast('PDF kütüphanesi yüklenemedi');
    VP.storePage();
    const idxs = o.area === 'sel' ? [VP.doc.active] : pagesOf(o);
    const bleed = o.bleed ? mmPT(o.bleed) : 0;
    const pad = o.marks ? 36 : 0;
    const nup = o.nup || '1';
    const enc = o.userPass || o.ownerPass ? { userPassword: o.userPass || '', ownerPassword: o.ownerPass || o.userPass || '', userPermissions: ['print', 'modify', 'copy', 'annot-forms'].filter((k) => o.perms ? o.perms.includes(k) : true) } : undefined;
    const sel = o.area === 'sel' && VP.sel.length ? selJSON() : null;
    const svgFor = async (i) => {
      await IO.preload(i);
      if (sel) return IO.buildSVG(i, { pdf: true, curves: !!o.curves, layersJSON: sel.layers, box: sel.box });
      return IO.buildSVG(i, { pdf: true, curves: !!o.curves, bleed });
    };
    const sizeOf = (i) => (sel ? [sel.box.width, sel.box.height] : [VP.doc.pages[i].w + bleed * 2, VP.doc.pages[i].h + bleed * 2]);
    let pdf;
    const make = (w, h) => {
      const fmt = [w, h];
      const ori = w > h ? 'landscape' : 'portrait';
      if (!pdf) {
        pdf = new lib.jsPDF({ unit: 'pt', format: fmt, orientation: ori, compress: true, encryption: enc });
        fonts(pdf);
      } else pdf.addPage(fmt, ori);
    };
    try {
      if (nup === '1') {
        for (const i of idxs) {
          const [w, h] = sizeOf(i);
          make(w + pad * 2, h + pad * 2);
          await placeSVG(pdf, await svgFor(i), pad, pad, w, h);
          if (o.marks) cropMarks(pdf, pad + bleed, pad + bleed, w - bleed * 2, h - bleed * 2, bleed);
        }
      } else {
        const sheet = FL.SHEETS[o.sheet || 'A4'] || FL.SHEETS.A4;
        const land = nup === '2' || nup === 'booklet';
        const SW = mmPT(land ? sheet[1] : sheet[0]);
        const SH = mmPT(land ? sheet[0] : sheet[1]);
        const cols = nup === '4' ? 2 : 2;
        const rows = nup === '4' ? 2 : 1;
        const groups = [];
        if (nup === 'booklet') FL.bookletOrder(idxs.length).forEach((pair) => groups.push(pair.map((k) => (k < 0 ? -1 : idxs[k]))));
        else for (let k = 0; k < idxs.length; k += cols * rows) groups.push(idxs.slice(k, k + cols * rows));
        const m = 18;
        const cw = (SW - m * 2) / cols;
        const chh = (SH - m * 2) / rows;
        for (const grp of groups) {
          make(SW, SH);
          for (let c = 0; c < grp.length; c++) {
            const i = grp[c];
            if (i < 0 || i == null) continue;
            const [w, h] = sizeOf(i);
            const s = nup === 'booklet' ? Math.min(cw / w, chh / h) : Math.min(cw / w, chh / h) * 0.96;
            const cx = m + (c % cols) * cw;
            const cy = m + Math.floor(c / cols) * chh;
            const dx = nup === 'booklet' ? (c === 0 ? cx + cw - w * s : cx) : cx + (cw - w * s) / 2;
            const dy = cy + (chh - h * s) / 2;
            await placeSVG(pdf, await svgFor(i), dx, dy, w * s, h * s);
            if (o.marks) cropMarks(pdf, dx + bleed * s, dy + bleed * s, (w - bleed * 2) * s, (h - bleed * 2) * s, bleed * s);
          }
          if (nup === 'booklet') {
            pdf.setDrawColor(150, 150, 150);
            pdf.setLineDashPattern([3, 3], 0);
            pdf.line(SW / 2, 6, SW / 2, 14);
            pdf.line(SW / 2, SH - 14, SW / 2, SH - 6);
            pdf.setLineDashPattern([], 0);
          }
        }
      }
      pdf.setProperties({ title: o.title || VP.doc.name || '', subject: o.subject || '', author: o.author || '', keywords: o.keywords || '', creator: 'VektörPad' });
    } catch (e) {
      console.error(e);
      VP.toast('PDF oluşturulamadı');
      return null;
    }
    const blob = new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
    if (o.returnBlob) return blob;
    return IO.saveFile(IO.safeName() + (nup !== '1' ? '-yerlesim' : '') + '.pdf', blob);
  };

  /* =============== export (generic) =============== */
  FL.exportAs = async (o) => {
    const fmt = o.fmt;
    if (fmt === 'png' || fmt === 'jpg' || fmt === 'webp') return FL.raster(o);
    if (fmt === 'pdf') return FL.pdf(o);
    VP.storePage();
    const sel = o.area === 'sel' && VP.sel.length ? selJSON() : null;
    const idxs = sel ? [VP.doc.active] : o.fmt === 'svg' || o.fmt === 'eps' || o.fmt === 'dxf' ? pagesOf(o) : [VP.doc.active];
    for (const i of idxs) {
      await IO.preload(i);
      const base = sel ? { layersJSON: sel.layers, box: sel.box } : {};
      const name = IO.safeName() + (sel ? '-secim' : suffix(i));
      if (fmt === 'svg') {
        const svg = IO.buildSVG(i, Object.assign({ curves: !!o.curves }, base));
        await IO.saveFile(name + '.svg', svgString(svg));
      } else if (fmt === 'eps') {
        const s = IO.buildSVG(i, Object.assign({ pdf: true, curves: true, noSVG: true, onProject: (proj, box) => FL.eps(proj, box) }, base));
        await IO.saveFile(name + '.eps', new Blob([s], { type: 'application/postscript' }));
      } else if (fmt === 'dxf') {
        const s = IO.buildSVG(i, Object.assign({ curves: !!o.curves, noSVG: true, onProject: (proj, box) => FL.dxf(proj, box) }, base));
        await IO.saveFile(name + '.dxf', new Blob([s], { type: 'application/dxf' }));
      }
    }
    return true;
  };

  /* =============== print styles =============== */
  const styles = () => (VP.settings.printStyles = VP.settings.printStyles || []);
  const DEFAULTS = { fmt: 'pdf', area: 'page', range: 'all', rangeText: '', dpi: 150, bg: 'white', quality: 90, curves: false, bleed: 0, marks: false, nup: '1', sheet: 'A4', title: '', author: '', subject: '', keywords: '', userPass: '', ownerPass: '', perms: ['print', 'copy', 'modify', 'annot-forms'] };
  FL.DEFAULTS = DEFAULTS;

  /* =============== export dialog =============== */
  const FMTS = [['pdf', 'PDF'], ['svg', 'SVG'], ['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WEBP'], ['eps', 'EPS'], ['dxf', 'DXF']];
  const segH = (g, items, cur) => '<span class="seg" data-g="' + g + '">' + items.map(([v, l]) => '<button data-v="' + v + '" class="' + (String(cur) === String(v) ? 'on' : '') + '">' + l + '</button>').join('') + '</span>';
  const inp = (k, label, val, attrs) => '<label class="field wide"><span>' + esc(label) + '</span><input data-k="' + k + '" value="' + esc(val || '') + '" ' + (attrs || '') + ' style="width:150px"></label>';
  FL.dialog = (mode) => {
    const print = mode === 'print';
    const o = Object.assign({}, DEFAULTS, VP.settings.lastExport || {}, print ? { fmt: 'pdf' } : {});
    o.userPass = '';
    o.ownerPass = '';
    const n = VP.doc.pages.length;
    const render = (root) => {
      const raster = ['png', 'jpg', 'webp'].includes(o.fmt);
      const vector = ['svg', 'eps', 'dxf'].includes(o.fmt);
      let h = '<h2>' + (print ? 'Yazdır' : 'Dışa aktar') + '</h2>';
      if (styles().length || o.fmt === 'pdf') h += '<div class="sec"><span class="opt-label">Baskı stili</span><select data-k="style" style="height:32px"><option value="">— Seçin —</option>' + styles().map((s, i) => '<option value="' + i + '">' + esc(s.name) + '</option>').join('') + '</select> <button class="btn" data-x="saveStyle">Stili kaydet</button></div>';
      if (!print) h += '<div class="sec"><span class="opt-label">Biçim</span>' + segH('fmt', FMTS, o.fmt) + '</div>';
      h += '<div class="sec"><span class="opt-label">Alan</span>' + segH('area', [['page', 'Sayfa'], ['sel', 'Seçim' + (VP.sel.length ? '' : ' (yok)')]], o.area) + '</div>';
      if (o.area !== 'sel' && (o.fmt === 'pdf' || vector)) h += '<div class="sec"><span class="opt-label">Sayfalar</span>' + segH('range', [['all', 'Tümü (' + n + ')'], ['one', 'Bu sayfa'], ['custom', 'Aralık']], o.range) + (o.range === 'custom' ? ' ' + inp('rangeText', 'Sayfalar', o.rangeText, 'placeholder="1-3, 5"') : '') + '</div>';
      if (raster) {
        h += '<div class="sec"><span class="opt-label">Çözünürlük</span>' + segH('dpi', [[72, '72'], [150, '150'], [300, '300'], [600, '600']], o.dpi) + ' dpi</div>';
        if (o.fmt !== 'jpg') h += '<div class="sec"><span class="opt-label">Arka plan</span>' + segH('bg', [['white', 'Beyaz'], ['clear', 'Şeffaf']], o.bg) + '</div>';
        if (o.fmt !== 'png') h += '<label class="range"><span class="pb-label">Kalite</span><input type="range" data-k="quality" min="30" max="100" value="' + o.quality + '"><output>' + o.quality + '</output></label>';
      }
      if (o.fmt === 'pdf' || o.fmt === 'svg' || o.fmt === 'dxf') h += '<div class="sec"><label class="field"><input type="checkbox" data-k="curves"' + (o.curves ? ' checked' : '') + '><span style="text-transform:none">Metinleri eğriye dönüştür</span></label></div>';
      if (o.fmt === 'pdf') {
        h += '<div class="sec"><span class="opt-label">Yerleşim</span>' + segH('nup', [['1', '1 sayfa'], ['2', '2’li'], ['4', '4’lü'], ['booklet', 'Kitapçık']], o.nup) + (o.nup !== '1' ? ' ' + segH('sheet', Object.keys(FL.SHEETS).map((k) => [k, k]), o.sheet) : '') + '</div>';
        h += '<div class="sec"><span class="opt-label">Baskı işaretleri</span><label class="field"><input type="checkbox" data-k="marks"' + (o.marks ? ' checked' : '') + '><span style="text-transform:none">Kesim işaretleri</span></label> <label class="field"><span>Taşma payı</span><input data-k="bleed" value="' + o.bleed + '" inputmode="decimal" style="width:48px"><span class="unit">mm</span></label></div>';
        if (!print) {
          h += '<details class="sec"><summary style="cursor:pointer;font-weight:600">Belge bilgileri</summary>' + inp('title', 'Başlık', o.title || VP.doc.name) + inp('author', 'Yazar', o.author) + inp('subject', 'Konu', o.subject) + inp('keywords', 'Anahtar sözcükler', o.keywords) + '</details>';
          h += '<details class="sec"><summary style="cursor:pointer;font-weight:600">Güvenlik</summary><p class="sec-note">Açma parolası verirseniz PDF parolasız açılmaz. İzin parolası, izinleri değiştirmeyi korur.</p>' + inp('userPass', 'Açma parolası', o.userPass, 'type="password" autocomplete="new-password"') + inp('ownerPass', 'İzin parolası', o.ownerPass, 'type="password" autocomplete="new-password"') +
            [['print', 'Yazdırma'], ['copy', 'Kopyalama'], ['modify', 'Değiştirme'], ['annot-forms', 'Not ekleme']].map(([k, l]) => '<label class="field"><input type="checkbox" data-perm="' + k + '"' + (o.perms.includes(k) ? ' checked' : '') + '><span style="text-transform:none">' + l + '</span></label>').join(' ') + '</details>';
        }
      }
      const notes = { pdf: 'Fira Sans metinler gömülür; yumuşak gölgeler resim olarak eklenir.', svg: 'Milimetre ölçülü SVG · Gölgeler SVG filtresi olur.', png: 'Kayıpsız resim.', jpg: 'Küçük dosya, saydamlık yok.', webp: 'Küçük dosya, saydamlık desteklenir.', eps: 'PostScript 3 (EPS) · Saydamlık ve gölgeler düzleştirilir; Fira dışındaki metinler Helvetica ile yazılır.', dxf: 'CAD için çizgiler ve metinler (mm) · Dolgular aktarılmaz, yalnız anahatlar.' };
      h += '<p class="sec-note">' + esc(print ? 'Sistem yazdırma penceresi açılır; iPad’de AirPrint yazıcınızı seçebilirsiniz. Yazdırma bu görünümde engelliyse “Baskı PDF’i” ile kaydedip yazdırın.' : notes[o.fmt]) + '</p>';
      h += '<div class="actions"><button class="btn" data-x="no">Vazgeç</button>' + (print ? '<button class="btn" data-x="printPdf">' + ic('pdf', 'sm') + 'Baskı PDF’i</button><button class="btn primary" data-x="print">' + ic('pdf', 'sm') + 'Yazdır</button>' : '<button class="btn primary" data-x="go">' + ic('export', 'sm') + 'Dışa aktar</button>') + '</div>';
      root.innerHTML = h;
    };
    UI.modal('', (root, close) => {
      render(root);
      const read = () => {
        root.querySelectorAll('[data-k]').forEach((el) => {
          const k = el.dataset.k;
          if (k === 'style') return;
          if (el.type === 'checkbox') o[k] = el.checked;
          else if (k === 'bleed' || k === 'quality') o[k] = Math.max(0, VP.parseNum(el.value) || 0);
          else o[k] = el.value;
        });
        const ps = root.querySelectorAll('[data-perm]');
        if (ps.length) o.perms = [...ps].filter((c) => c.checked).map((c) => c.dataset.perm);
      };
      root.addEventListener('input', (e) => {
        if (e.target.dataset.k === 'quality' && e.target.nextElementSibling) e.target.nextElementSibling.textContent = e.target.value;
      });
      root.addEventListener('change', (e) => {
        if (e.target.dataset.k === 'style' && e.target.value !== '') {
          Object.assign(o, styles()[+e.target.value].o);
          render(root);
        }
      });
      root.addEventListener('click', async (e) => {
        const sb = e.target.closest('[data-v]');
        if (sb) {
          read();
          const g = sb.parentElement.dataset.g;
          o[g] = g === 'dpi' ? +sb.dataset.v : sb.dataset.v;
          if (g === 'area' && o.area === 'sel' && !VP.sel.length) o.area = 'page';
          render(root);
          return;
        }
        const x = e.target.closest('[data-x]');
        if (!x) return;
        const k = x.dataset.x;
        if (k === 'no') return close();
        read();
        if (k === 'saveStyle') {
          const name = await UI.prompt({ title: 'Baskı stilini kaydet', label: 'Stil adı', value: 'Baskı stili ' + (styles().length + 1) });
          if (name) {
            const keep = Object.assign({}, o);
            delete keep.userPass;
            delete keep.ownerPass;
            styles().push({ name, o: keep });
            VP.io.savePrefs();
            VP.toast('Baskı stili kaydedildi');
          }
          return;
        }
        const keep = Object.assign({}, o);
        delete keep.userPass;
        delete keep.ownerPass;
        VP.settings.lastExport = keep;
        VP.io.savePrefs();
        x.disabled = true;
        x.textContent = 'Hazırlanıyor…';
        try {
          if (k === 'print') await FL.print(o);
          else if (k === 'printPdf') await FL.pdf(o);
          else await FL.exportAs(o);
        } catch (err) {
          console.error(err);
          VP.toast('İşlem tamamlanamadı');
        }
        close();
      });
    });
  };
  UI.exportDialog = () => FL.dialog('export');

  /* =============== printing =============== */
  FL.print = async (o) => {
    VP.storePage();
    const idxs = o.area === 'sel' ? [VP.doc.active] : pagesOf(o);
    const sel = o.area === 'sel' && VP.sel.length ? selJSON() : null;
    let root = document.getElementById('print-root');
    if (root) root.remove();
    root = document.createElement('div');
    root.id = 'print-root';
    const css = document.createElement('style');
    css.textContent = '#print-root{display:none}@media print{@page{margin:0}html,body{background:#fff!important;height:auto!important;overflow:visible!important}body>*:not(#print-root){display:none!important}#print-root{display:block}#print-root .pp{page-break-after:always;break-after:page;display:flex;align-items:center;justify-content:center}#print-root img{display:block}}';
    root.appendChild(css);
    for (const i of idxs) {
      await IO.preload(i);
      const svg = sel ? IO.buildSVG(i, { curves: true, layersJSON: sel.layers, box: sel.box }) : IO.buildSVG(i, { curves: true });
      const w = svg.getAttribute('width');
      const h = svg.getAttribute('height');
      const div = document.createElement('div');
      div.className = 'pp';
      div.style.width = w;
      div.style.height = h;
      const img = document.createElement('img');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString(svg));
      img.style.width = w;
      img.style.height = h;
      div.appendChild(img);
      root.appendChild(div);
    }
    document.body.appendChild(root);
    await Promise.all([...root.querySelectorAll('img')].map((im) => im.decode().catch(() => {})));
    const cleanup = () => setTimeout(() => root.remove(), 500);
    window.addEventListener('afterprint', cleanup, { once: true });
    try {
      window.print();
    } catch (e) {
      cleanup();
      VP.toast('Bu görünümde yazdırma engellendi · Baskı PDF’ini kaydedip yazdırın');
    }
  };

  /* =============== import: PDF / AI =============== */
  // the offline package carries its own copy (window.VP_PDFJS_BASE)
  const PDFJS = window.VP_PDFJS_BASE || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  FL.pdfjs = () => {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (FL._pdfjsP) return FL._pdfjsP;
    FL._pdfjsP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = () => {
        const L = window.pdfjsLib;
        if (!L) return rej(new Error('pdfjs'));
        L.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
        res(L);
      };
      s.onerror = () => rej(new Error('pdfjs load'));
      document.head.appendChild(s);
    });
    return FL._pdfjsP;
  };
  const mul = (m1, m2) => [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1], m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3], m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
  const app = (m, x, y) => Pt(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
  const colorArg = (args) => {
    if (typeof args[0] === 'string') return args[0];
    const [r, g, b] = args;
    return VP.hex(new paper.Color(r / 255, g / 255, b / 255));
  };
  // Vector paths from the page's drawing operators, and its text as editable text.
  FL.pdfPageToGroup = async (L, page) => {
    const vp = page.getViewport({ scale: 1 });
    const ol = await page.getOperatorList();
    const OPS = L.OPS;
    const g = new paper.Group({ insert: false });
    let st = { ctm: vp.transform.slice(), fill: '#000000', stroke: '#000000', lw: 1, fa: 1, sa: 1, dash: [] };
    const stack = [];
    let cur = [];
    let curPt = Pt(0, 0);
    let subStart = null;
    let path = null;
    const newSub = (p) => {
      path = new paper.Path({ insert: false });
      path.add(p);
      cur.push(path);
      subStart = p;
    };
    const paint = (fill, stroke, even, close) => {
      if (close && path) path.closed = true;
      const parts = cur.filter((p) => p.segments.length > 1 || (p.segments.length === 1 && false));
      cur = [];
      path = null;
      if (!parts.length) return;
      const item = parts.length === 1 ? parts[0] : new paper.CompoundPath({ children: parts, insert: false });
      if (fill) {
        const c = new paper.Color(st.fill);
        c.alpha = st.fa;
        item.fillColor = c;
        if (even) item.fillRule = 'evenodd';
      } else item.fillColor = null;
      if (stroke) {
        const c = new paper.Color(st.stroke);
        c.alpha = st.sa;
        item.strokeColor = c;
        const k = Math.sqrt(Math.abs(st.ctm[0] * st.ctm[3] - st.ctm[1] * st.ctm[2])) || 1;
        item.strokeWidth = Math.max(0.1, st.lw * k);
        if (st.dash && st.dash.length) item.dashArray = st.dash.map((d) => d * k);
      }
      g.addChild(item);
    };
    const fn = ol.fnArray;
    const aa = ol.argsArray;
    for (let i = 0; i < fn.length; i++) {
      const op = fn[i];
      const args = aa[i];
      switch (op) {
        case OPS.save: stack.push(Object.assign({}, st, { ctm: st.ctm.slice(), dash: (st.dash || []).slice() })); break;
        case OPS.restore: if (stack.length) st = stack.pop(); break;
        case OPS.transform: st.ctm = mul(st.ctm, args); break;
        case OPS.setLineWidth: st.lw = args[0]; break;
        case OPS.setDash: st.dash = (args[0] || []).slice(); break;
        case OPS.setFillRGBColor: st.fill = colorArg(args); break;
        case OPS.setStrokeRGBColor: st.stroke = colorArg(args); break;
        case OPS.setFillGray: st.fill = VP.hex(new paper.Color(args[0])); break;
        case OPS.setStrokeGray: st.stroke = VP.hex(new paper.Color(args[0])); break;
        case OPS.setGState:
          (args[0] || []).forEach(([k, v]) => {
            if (k === 'CA') st.sa = v;
            if (k === 'ca') st.fa = v;
            if (k === 'LW') st.lw = v;
          });
          break;
        case OPS.constructPath: {
          const ops = args[0];
          const c = args[1];
          let j = 0;
          ops.forEach((o2) => {
            if (o2 === OPS.moveTo) {
              curPt = app(st.ctm, c[j], c[j + 1]);
              j += 2;
              newSub(curPt);
            } else if (o2 === OPS.lineTo) {
              curPt = app(st.ctm, c[j], c[j + 1]);
              j += 2;
              if (!path) newSub(curPt);
              else path.add(curPt);
            } else if (o2 === OPS.curveTo || o2 === OPS.curveTo2 || o2 === OPS.curveTo3) {
              let c1;
              let c2;
              let e;
              if (o2 === OPS.curveTo) {
                c1 = app(st.ctm, c[j], c[j + 1]);
                c2 = app(st.ctm, c[j + 2], c[j + 3]);
                e = app(st.ctm, c[j + 4], c[j + 5]);
                j += 6;
              } else if (o2 === OPS.curveTo2) {
                c1 = curPt;
                c2 = app(st.ctm, c[j], c[j + 1]);
                e = app(st.ctm, c[j + 2], c[j + 3]);
                j += 4;
              } else {
                c1 = app(st.ctm, c[j], c[j + 1]);
                e = app(st.ctm, c[j + 2], c[j + 3]);
                c2 = e;
                j += 4;
              }
              if (!path) newSub(curPt);
              path.lastSegment.handleOut = c1.subtract(path.lastSegment.point);
              path.add(new paper.Segment(e, c2.subtract(e), null));
              curPt = e;
            } else if (o2 === OPS.closePath) {
              if (path) path.closed = true;
              if (subStart) curPt = subStart;
              path = null;
            } else if (o2 === OPS.rectangle) {
              const x = c[j];
              const y = c[j + 1];
              const w = c[j + 2];
              const h = c[j + 3];
              j += 4;
              const r = new paper.Path({ segments: [app(st.ctm, x, y), app(st.ctm, x + w, y), app(st.ctm, x + w, y + h), app(st.ctm, x, y + h)], closed: true, insert: false });
              cur.push(r);
              path = null;
            }
          });
          break;
        }
        case OPS.fill: paint(true, false, false); break;
        case OPS.eoFill: paint(true, false, true); break;
        case OPS.stroke: paint(false, true, false); break;
        case OPS.closeStroke: paint(false, true, false, true); break;
        case OPS.fillStroke: paint(true, true, false); break;
        case OPS.eoFillStroke: paint(true, true, true); break;
        case OPS.closeFillStroke: paint(true, true, false, true); break;
        case OPS.closeEOFillStroke: paint(true, true, true, true); break;
        case OPS.endPath: cur = []; path = null; break;
        default: break;
      }
    }
    // text
    try {
      const tc = await page.getTextContent();
      tc.items.forEach((it) => {
        if (!it.str || !it.str.trim()) return;
        const m = mul(vp.transform, it.transform);
        const size = Math.hypot(m[2], m[3]) || 10;
        const style = tc.styles && tc.styles[it.fontName];
        const fam = style && /serif/i.test(style.fontFamily) && !/sans/i.test(style.fontFamily) ? 'Georgia' : style && /mono/i.test(style.fontFamily) ? 'Fira Mono' : 'Fira Sans';
        const t = new paper.PointText({ point: Pt(m[4], m[5]), content: it.str, fontFamily: fam, fontSize: size, fillColor: '#1d1d1b', insert: false });
        const ang = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
        if (Math.abs(ang) > 0.5) t.rotate(ang, Pt(m[4], m[5]));
        g.addChild(t);
      });
    } catch (e) { /* no text */ }
    return { g, w: vp.width, h: vp.height };
  };
  FL.pdfPageToRaster = async (page, scale) => {
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(vp.width);
    cv.height = Math.ceil(vp.height);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    const r = new paper.Raster({ insert: false });
    r.setImage(cv);
    r.scale(1 / scale);
    r.position = Pt(vp.width / scale / 2, vp.height / scale / 2);
    return r;
  };
  FL.importPDF = async (file) => {
    let L;
    try {
      L = await FL.pdfjs();
    } catch (e) {
      return VP.toast('PDF okuyucu yüklenemedi · İnternet bağlantısını kontrol edin');
    }
    let pdf;
    try {
      pdf = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    } catch (e) {
      return VP.toast(/password/i.test(String(e && e.name)) ? 'Parolalı PDF içe aktarılamaz' : 'PDF dosyası okunamadı');
    }
    const n = pdf.numPages;
    const o = { mode: 'vector', range: n > 1 ? '1' : '1', asPages: false };
    UI.modal(
      '<h2>' + esc(file.name) + '</h2><p class="sec-note">' + n + ' sayfa · ' + (/\.ai$/i.test(file.name) ? 'Illustrator dosyasının PDF uyumlu bölümü okunur.' : '') + '</p>' +
        '<div class="sec"><span class="opt-label">İçe aktarma</span><span class="seg" data-g="mode"><button data-v="vector" class="on">Vektör (düzenlenebilir)</button><button data-v="image">Resim</button></span></div>' +
        '<label class="field wide"><span>Sayfalar</span><input id="pi-r" value="1' + (n > 1 ? '-' + n : '') + '" style="width:120px"></label>' +
        (n > 1 ? '<label class="field"><input type="checkbox" id="pi-p" checked><span style="text-transform:none">Her PDF sayfası yeni bir sayfa olsun</span></label>' : '') +
        '<p class="sec-note">Vektör modunda yollar, renkler ve metinler alınır; gömülü resimler ve özel desenler atlanır (resim modunu kullanın).</p>' +
        '<div class="actions"><button class="btn" data-x="no">Vazgeç</button><button class="btn primary" data-x="yes">İçe aktar</button></div>',
      (root, close) => {
        root.addEventListener('click', async (e) => {
          const sb = e.target.closest('[data-v]');
          if (sb) {
            o.mode = sb.dataset.v;
            sb.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === sb));
            return;
          }
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'no') return close();
          const idxs = FL.parseRange(root.querySelector('#pi-r').value, n);
          const asPages = root.querySelector('#pi-p') ? root.querySelector('#pi-p').checked : false;
          x.disabled = true;
          x.textContent = 'Okunuyor…';
          let done = 0;
          try {
            for (let k = 0; k < idxs.length; k++) {
              const page = await pdf.getPage(idxs[k] + 1);
              let item;
              let w;
              let h;
              if (o.mode === 'image') {
                item = await FL.pdfPageToRaster(page, 2);
                const vp = page.getViewport({ scale: 1 });
                w = vp.width;
                h = vp.height;
              } else {
                const r = await FL.pdfPageToGroup(L, page);
                item = r.g;
                w = r.w;
                h = r.h;
              }
              if (asPages && (k > 0 || VP.userLayers().some((Ly) => Ly.children.length))) VP.addPage();
              if (asPages) {
                const p = VP.page();
                p.w = w;
                p.h = h;
                VP.drawPage();
              }
              VP.ensureLayer();
              VP.activeLayer.addChild(item);
              if (!asPages) {
                const p = VP.page();
                const b = item.bounds;
                const s = Math.min(1, (p.w * 0.9) / (b.width || 1), (p.h * 0.9) / (b.height || 1));
                if (s < 1) item.scale(s, b.center);
                item.position = Pt(p.w / 2, p.h / 2).add(Pt(k * 12, k * 12));
              }
              done++;
            }
            if (asPages) VP.fitPage();
            VP.setSelection(VP.activeLayer.children.slice(-1));
            VP.commit();
            VP.toast(done + ' sayfa içe aktarıldı');
          } catch (err) {
            console.error(err);
            VP.toast('PDF içe aktarılırken hata oluştu');
          }
          close();
        });
      }
    );
  };

  /* =============== import: DXF =============== */
  FL.parseDXF = (txt) => {
    const lines = txt.split(/\r?\n/);
    const pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i], 10), lines[i + 1].trim()]);
    let i = pairs.findIndex((p) => p[0] === 2 && p[1] === 'ENTITIES');
    if (i < 0) i = 0;
    const ents = [];
    let cur = null;
    for (; i < pairs.length; i++) {
      const [c, v] = pairs[i];
      if (c === 0) {
        if (v === 'ENDSEC' || v === 'EOF') break;
        cur = { type: v, v: [] };
        ents.push(cur);
      } else if (cur) cur.v.push([c, v]);
    }
    return ents;
  };
  FL.importDXF = async (file) => {
    const ents = FL.parseDXF(await file.text());
    const g = new paper.Group({ insert: false });
    const S = VP.toPT(1);
    const get = (e, c) => {
      const p = e.v.find((x) => x[0] === c);
      return p ? parseFloat(p[1]) : 0;
    };
    const all = (e, c) => e.v.filter((x) => x[0] === c).map((x) => parseFloat(x[1]));
    const P = (x, y) => Pt(x * S, -y * S);
    const style = (it) => {
      it.strokeColor = '#1d1d1b';
      it.strokeWidth = 0.5;
      it.fillColor = null;
      return it;
    };
    let poly = null;
    ents.forEach((e) => {
      switch (e.type) {
        case 'LINE': g.addChild(style(new paper.Path.Line({ from: P(get(e, 10), get(e, 20)), to: P(get(e, 11), get(e, 21)), insert: false }))); break;
        case 'LWPOLYLINE': {
          const xs = all(e, 10);
          const ys = all(e, 20);
          const p = new paper.Path({ segments: xs.map((x, k) => P(x, ys[k])), closed: (get(e, 70) & 1) === 1, insert: false });
          g.addChild(style(p));
          break;
        }
        case 'POLYLINE': poly = new paper.Path({ insert: false, closed: (get(e, 70) & 1) === 1 }); break;
        case 'VERTEX': if (poly) poly.add(P(get(e, 10), get(e, 20))); break;
        case 'SEQEND': if (poly) g.addChild(style(poly)); poly = null; break;
        case 'CIRCLE': g.addChild(style(new paper.Path.Circle({ center: P(get(e, 10), get(e, 20)), radius: get(e, 40) * S, insert: false }))); break;
        case 'ARC': {
          const c = P(get(e, 10), get(e, 20));
          const r = get(e, 40) * S;
          let a0 = get(e, 50);
          let a1 = get(e, 51);
          if (a1 < a0) a1 += 360;
          const pt = (a) => c.add(Pt(Math.cos((a * Math.PI) / 180) * r, -Math.sin((a * Math.PI) / 180) * r));
          g.addChild(style(new paper.Path.Arc({ from: pt(a0), through: pt((a0 + a1) / 2), to: pt(a1), insert: false })));
          break;
        }
        case 'SPLINE': {
          const xs = all(e, 10);
          const ys = all(e, 20);
          const p = new paper.Path({ segments: xs.map((x, k) => P(x, ys[k])), insert: false });
          p.smooth({ type: 'catmull-rom' });
          g.addChild(style(p));
          break;
        }
        case 'TEXT':
        case 'MTEXT': {
          const s = (e.v.find((x) => x[0] === 1) || [0, ''])[1].replace(/\\P/g, '\n').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '');
          const h = get(e, 40) * S || 10;
          const t = new paper.PointText({ point: P(get(e, 10), get(e, 20)), content: s, fontFamily: 'Fira Sans', fontSize: h / 0.72, fillColor: '#1d1d1b', insert: false });
          const rot = get(e, 50);
          if (rot) t.rotate(-rot, t.point);
          g.addChild(t);
          break;
        }
        default: break;
      }
    });
    if (!g.children.length) return VP.toast('DXF dosyasında desteklenen çizim bulunamadı');
    VP.ensureLayer();
    VP.activeLayer.addChild(g);
    const p = VP.page();
    const b = g.bounds;
    const s = Math.min(1, (p.w * 0.9) / (b.width || 1), (p.h * 0.9) / (b.height || 1));
    if (s < 1) g.scale(s, b.center);
    g.position = Pt(p.w / 2, p.h / 2);
    VP.setSelection([g]);
    VP.commit();
    VP.toast('DXF içe aktarıldı · ' + g.children.length + ' nesne' + (s < 1 ? ' (sayfaya sığdırıldı)' : ''));
  };
  const hi0 = IO.handleImport.bind(IO);
  IO.handleImport = async (file) => {
    if (!file) return;
    if (/pdf/.test(file.type) || /\.(pdf|ai)$/i.test(file.name)) return FL.importPDF(file);
    if (/\.dxf$/i.test(file.name)) return FL.importDXF(file);
    return hi0(file);
  };
  const fi = document.getElementById('file-import');
  if (fi) fi.setAttribute('accept', '.svg,image/svg+xml,image/png,image/jpeg,image/webp,image/gif,.pdf,application/pdf,.ai,.dxf');

  /* =============== actions and menus =============== */
  Object.assign(A, {
    import: { label: 'İçe aktar (SVG, PDF, AI, DXF, resim)…', kbd: 'Ctrl+I', icon: 'image', run: () => IO.importFile() },
    export: { label: 'Dışa aktar…', kbd: 'Ctrl+E', icon: 'export', run: () => FL.dialog('export') },
    print: { label: 'Yazdır…', kbd: 'Ctrl+P', icon: 'pdf', run: () => FL.dialog('print') },
    printPreview: { label: 'Baskı önizleme (tam ekran)', run: () => A.fullPreview && UI.run('fullPreview') },
    impose: { label: 'Sayfa yerleşimi (2’li, 4’lü, kitapçık)…', run: () => { VP.settings.lastExport = Object.assign({}, VP.settings.lastExport || {}, { fmt: 'pdf', nup: '2' }); FL.dialog('print'); } },
    exportJpg: { label: 'JPG olarak dışa aktar…', run: () => { VP.settings.lastExport = Object.assign({}, VP.settings.lastExport || {}, { fmt: 'jpg' }); FL.dialog('export'); } },
    exportEps: { label: 'EPS olarak dışa aktar', run: () => FL.exportAs(Object.assign({}, DEFAULTS, { fmt: 'eps', range: 'one' })) },
    exportDxf: { label: 'DXF olarak dışa aktar (CAD)', run: () => FL.exportAs(Object.assign({}, DEFAULTS, { fmt: 'dxf', range: 'one' })) }
  });
  const M = UI.MENUS.file;
  if (M && !M.includes('print')) {
    const at = M.indexOf('exportPdf');
    M.splice(at + 1, 0, 'exportJpg', 'exportEps', 'exportDxf', '|', 'print', 'impose');
  }
  // Ctrl+P prints (the browser's own shortcut otherwise prints the whole app)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'p' || e.key === 'P')) {
      const t = e.target;
      if (t && /INPUT|TEXTAREA/.test(t.tagName)) return;
      e.preventDefault();
      FL.dialog('print');
    }
  }, true);
})();
