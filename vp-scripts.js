/* VektörPad scripts and macros.
   - Script editor docker: JavaScript with a small drawing API (vp.rect, vp.text, vp.each…) and samples.
     Scripts are saved with the preferences on this device.
   - Macro recorder: records menu commands, property changes and palette colours, then plays them back
     on a new selection. Works even where running script code is not allowed. */
(function () {
  'use strict';
  const VP = window.VP;
  const UI = VP.ui;
  const TX = VP.tx;
  const H = UI.h;
  const esc = H.esc;
  const ic = H.ic;
  const A = VP.actions;
  const SC = (VP.scripts = {});
  const Pt = (x, y) => new paper.Point(x, y);

  /* =============== drawing API for scripts =============== */
  const logs = [];
  const log = (...a) => {
    logs.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
    if (logs.length > 200) logs.shift();
  };
  const style = (it, o = {}) => {
    const fill = o.fill !== undefined ? o.fill : VP.defaults.fill;
    const stroke = o.stroke !== undefined ? o.stroke : VP.defaults.stroke;
    it.fillColor = fill ? new paper.Color(fill) : null;
    it.strokeColor = stroke ? new paper.Color(stroke) : null;
    it.strokeWidth = o.width != null ? VP.toPT(o.width) : VP.defaults.strokeWidth;
    if (o.opacity != null) it.opacity = o.opacity;
    return it;
  };
  const add = (it, o) => {
    VP.ensureLayer();
    style(it, o);
    VP.activeLayer.addChild(it);
    SC._made.push(it);
    return it;
  };
  const mm = (v) => VP.toPT(v);
  SC.api = () => ({
    paper,
    get sel() { return VP.sel.slice(); },
    get page() { const p = VP.page(); return { w: VP.toMM(p.w), h: VP.toMM(p.h), name: p.name, index: VP.doc.active }; },
    mm: (v) => VP.toPT(v),
    toMM: (v) => VP.toMM(v),
    rect: (x, y, w, h, o) => add(new paper.Path.Rectangle({ rectangle: new paper.Rectangle(mm(x), mm(y), mm(w), mm(h)), radius: o && o.radius ? mm(o.radius) : 0, insert: false }), o),
    ellipse: (cx, cy, rx, ry, o) => add(new paper.Path.Ellipse({ center: [mm(cx), mm(cy)], radius: [mm(rx), mm(ry == null ? rx : ry)], insert: false }), o),
    circle: (cx, cy, r, o) => add(new paper.Path.Circle({ center: [mm(cx), mm(cy)], radius: mm(r), insert: false }), o),
    line: (x1, y1, x2, y2, o) => add(new paper.Path.Line({ from: [mm(x1), mm(y1)], to: [mm(x2), mm(y2)], insert: false }), Object.assign({ fill: null }, o)),
    polygon: (cx, cy, r, sides, o) => add(new paper.Path.RegularPolygon({ center: [mm(cx), mm(cy)], radius: mm(r), sides: sides || 6, insert: false }), o),
    star: (cx, cy, r1, r2, points, o) => add(new paper.Path.Star({ center: [mm(cx), mm(cy)], radius1: mm(r1), radius2: mm(r2), points: points || 5, insert: false }), o),
    path: (pts, o) => add(new paper.Path({ segments: pts.map((p) => [mm(p[0]), mm(p[1])]), closed: !!(o && o.closed), insert: false }), o),
    text: (x, y, s, o = {}) => {
      VP.ensureLayer();
      const t = new paper.PointText({ point: [mm(x), mm(y)], content: String(s), fontFamily: o.font || VP.defaults.fontFamily || 'Fira Sans', fontSize: o.size || 12, fontWeight: o.bold ? 'bold' : 'normal', justification: o.align || 'left', fillColor: o.fill || '#1d1d1b', insert: false });
      VP.activeLayer.addChild(t);
      SC._made.push(t);
      return t;
    },
    color: (h, s = 70, l = 50) => VP.hex(new paper.Color({ hue: h, saturation: s / 100, lightness: l / 100 })),
    random: (a = 0, b = 1) => a + Math.random() * (b - a),
    each: (fn) => VP.sel.slice().forEach((it, i) => fn(it, i)),
    texts: () => VP.userLayers().reduce((a, L) => a.concat(L.getItems({ class: paper.PointText })), []),
    all: () => VP.userLayers().reduce((a, L) => a.concat(L.children), []),
    fill: (it, hex) => VP.setFill([it], hex ? { type: 'solid', color: hex, alpha: 1 } : { type: 'none' }),
    stroke: (it, hex, w) => VP.setStroke([it], hex ? { on: true, color: hex, width: w != null ? VP.toPT(w) : undefined } : { on: false }),
    select: (items) => VP.setSelection(Array.isArray(items) ? items : [items]),
    group: (items) => {
      const g = new paper.Group(items);
      return g;
    },
    run: (id) => UI.run(id),
    toast: (m) => VP.toast(String(m)),
    log
  });
  SC.run = (code) => {
    logs.length = 0;
    SC._made = [];
    let fn;
    try {
      fn = new Function('vp', 'paper', '"use strict";\n' + code);
    } catch (e) {
      if (e instanceof EvalError || /unsafe-eval|Content Security/i.test(String(e.message))) {
        log('⚠ Bu görünüm betik kodu çalıştırmaya izin vermiyor. Makro kaydediciyi kullanabilirsiniz.');
        return false;
      }
      log('Sözdizimi hatası: ' + e.message);
      return false;
    }
    try {
      const r = fn(SC.api(), paper);
      if (r !== undefined) log('→ ' + (typeof r === 'object' ? (r && r.className) || JSON.stringify(r) : r));
      VP.commit();
      if (SC._made.length) VP.setSelection(SC._made.filter((it) => it.parent && it.parent instanceof paper.Layer));
      log('✓ Tamamlandı' + (SC._made.length ? ' · ' + SC._made.length + ' nesne oluşturuldu' : ''));
      return true;
    } catch (e) {
      log('Hata: ' + e.message);
      VP.commit();
      return false;
    }
  };
  SC.SAMPLES = [
    { name: 'Renkli ızgara', code: '// 8×6 renkli daire ızgarası (ölçüler mm)\nfor (let r = 0; r < 6; r++) {\n  for (let c = 0; c < 8; c++) {\n    vp.circle(25 + c * 22, 30 + r * 22, 8, { fill: vp.color(c * 45 + r * 10, 75, 55), stroke: null });\n  }\n}' },
    { name: 'Seçimi daire etrafında çoğalt', code: '// Seçili nesneyi merkez çevresinde 12 kez çoğaltır\nconst it = vp.sel[0];\nif (!it) { vp.toast("Önce bir nesne seçin"); return; }\nconst n = 12;\nconst c = it.bounds.center.add([0, vp.mm(40)]);\nfor (let i = 1; i < n; i++) {\n  const k = it.clone();\n  k.rotate(360 / n * i, c);\n}' },
    { name: 'Rastgele renk ver', code: '// Seçili her nesneye rastgele canlı bir dolgu verir\nvp.each((it) => vp.fill(it, vp.color(vp.random(0, 360), 80, 55)));' },
    { name: 'Ay takvimi', code: '// Bu ayın takvimi\nconst d = new Date();\nconst y = d.getFullYear(), m = d.getMonth();\nconst days = ["Pt","Sa","Ça","Pe","Cu","Ct","Pz"];\nconst first = (new Date(y, m, 1).getDay() + 6) % 7;\nconst n = new Date(y, m + 1, 0).getDate();\nvp.text(20, 25, d.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }), { size: 22, bold: true });\ndays.forEach((t, i) => vp.text(24 + i * 24, 40, t, { size: 10, bold: true, align: "center" }));\nfor (let k = 0; k < n; k++) {\n  const p = first + k, r = Math.floor(p / 7), c = p % 7;\n  vp.rect(13 + c * 24, 44 + r * 20, 22, 18, { fill: c > 4 ? "#fde8e8" : "#f2f4f7", stroke: null, radius: 2 });\n  vp.text(24 + c * 24, 56 + r * 20, k + 1, { size: 11, align: "center" });\n}' },
    { name: 'Metinleri BÜYÜK HARF yap', code: '// Sayfadaki tüm sanatsal metinleri Türkçe kurala göre büyük harfe çevirir\nvp.texts().forEach((t) => (t.content = t.content.toLocaleUpperCase("tr")));' },
    { name: 'Spirograf', code: '// Spirograf eğrisi\nconst pts = [];\nconst R = 40, r = 13, d = 22;\nfor (let t = 0; t <= Math.PI * 26; t += 0.05) {\n  const x = (R - r) * Math.cos(t) + d * Math.cos((R - r) / r * t);\n  const y = (R - r) * Math.sin(t) - d * Math.sin((R - r) / r * t);\n  pts.push([105 + x, 120 + y]);\n}\nvp.path(pts, { fill: null, stroke: "#2d2e83", width: 0.3 });' }
  ];
  const saved = () => (VP.settings.scripts = VP.settings.scripts || []);
  const state = { cur: 'sample:0', code: SC.SAMPLES[0].code };

  /* =============== macro recorder =============== */
  const macros = () => (VP.settings.macros = VP.settings.macros || []);
  const rec = { on: false, steps: [], playing: false };
  const push = (s) => {
    if (rec.on && !rec.playing) {
      rec.steps.push(s);
      SC.refresh();
    }
  };
  const SKIP = new Set(['macroRec', 'macroStop', 'dockScripts', 'help', 'whatsNew', 'about']);
  const run0 = UI.run;
  UI.run = (id) => {
    if (!SKIP.has(id) && !String(id).startsWith('sub:')) push({ t: 'run', id });
    return run0(id);
  };
  const pf0 = UI.propField;
  UI.propField = (n, r, el) => {
    if (!(el && el.dataset && el.dataset.live && !UI._rangeDone)) push({ t: 'pf', n, r });
    return pf0(n, r, el);
  };
  const df0 = UI.dockField;
  UI.dockField = (k, r, el, isLive) => {
    if (!isLive) push({ t: 'df', k, r });
    return df0(k, r, el, isLive);
  };
  const ac0 = UI.applyColor;
  UI.applyColor = (hex, target) => {
    push({ t: 'col', hex, target });
    return ac0(hex, target);
  };
  const da0 = UI.dockAct;
  UI.dockAct = (id, el) => {
    if (!/^(zs|zy|zd|objSel|layer|gotoPage|tqFont)/.test(id) && !/^sc/.test(id)) push({ t: 'da', id });
    return da0(id, el);
  };
  SC.play = async (steps) => {
    if (!VP.sel.length) VP.toast('Uyarı: seçim yok · Makro yeni nesnelerin ayarlarını değiştirebilir');
    rec.playing = true;
    const dummy = document.createElement('div');
    try {
      for (const s of steps) {
        if (s.t === 'run') run0(s.id);
        else if (s.t === 'pf') pf0(s.n, s.r, null);
        else if (s.t === 'df') df0(s.k, s.r, null, false);
        else if (s.t === 'col') ac0(s.hex, s.target);
        else if (s.t === 'da') await da0(s.id, dummy);
        await new Promise((r) => setTimeout(r, 30));
      }
    } catch (e) {
      console.error(e);
      VP.toast('Makro çalışırken hata: ' + e.message);
    } finally {
      rec.playing = false;
    }
    VP.toast('Makro oynatıldı (' + steps.length + ' adım)');
  };
  const stepText = (s) => {
    if (s.t === 'run') return (A[s.id] && A[s.id].label) || s.id;
    if (s.t === 'col') return (s.target === 'fill' ? 'Dolgu ' : 'Anahat ') + (s.hex || 'yok');
    if (s.t === 'pf' || s.t === 'df') return (s.n || s.k) + ' = ' + s.r;
    return s.id;
  };

  /* =============== docker =============== */
  const panel = () => {
    const sv = saved();
    let h = '<div class="sec"><div class="sec-h"><h3>Betik düzenleyici</h3></div>' +
      '<div class="row"><select data-sc="pick" style="flex:1;height:32px;min-width:0">' +
      '<optgroup label="Örnekler">' + SC.SAMPLES.map((s, i) => '<option value="sample:' + i + '"' + (state.cur === 'sample:' + i ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</optgroup>' +
      (sv.length ? '<optgroup label="Betiklerim">' + sv.map((s, i) => '<option value="mine:' + i + '"' + (state.cur === 'mine:' + i ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</optgroup>' : '') + '</select></div>' +
      '<textarea data-sc="code" spellcheck="false" autocapitalize="off" autocorrect="off" style="width:100%;min-height:210px;font:12.5px/1.45 \'Fira Mono\',ui-monospace,monospace;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--bg,#111);color:inherit;tab-size:2">' + esc(state.code) + '</textarea>' +
      '<div class="grid-btns" style="grid-template-columns:repeat(4,1fr)"><button class="btn primary" data-act="scRun">▶ Çalıştır</button><button class="btn" data-act="scSave">Kaydet</button><button class="btn" data-act="scNew">Yeni</button><button class="btn danger" data-act="scDel"' + (state.cur.startsWith('mine:') ? '' : ' disabled') + '>Sil</button></div>' +
      '<pre data-sc="log" style="white-space:pre-wrap;max-height:120px;overflow:auto;font:12px/1.4 \'Fira Mono\',monospace;opacity:.85;margin:0">' + esc(logs.join('\n') || 'Çıktı burada görünür · vp.log(…) ile yazdırın') + '</pre>' +
      '<details><summary style="cursor:pointer">Kullanılabilir komutlar</summary><p class="sec-note" style="white-space:pre-wrap;font-family:\'Fira Mono\',monospace">vp.rect(x,y,en,boy,{fill,stroke,width,radius})\nvp.circle(x,y,r,{…}) · vp.ellipse(x,y,rx,ry)\nvp.line(x1,y1,x2,y2) · vp.polygon(x,y,r,kenar)\nvp.star(x,y,r1,r2,uç) · vp.path([[x,y],…],{closed})\nvp.text(x,y,"metin",{size,bold,align,fill,font})\nvp.sel · vp.each(fn) · vp.all() · vp.texts()\nvp.fill(nesne,"#hex") · vp.stroke(nesne,"#hex",kalınlık)\nvp.color(ton,doygunluk,açıklık) · vp.random(a,b)\nvp.select(nesneler) · vp.run("komutKimliği")\nvp.page.w / vp.page.h (mm) · vp.mm(v) · vp.toast · vp.log\nÖlçüler milimetredir; paper (paper.js) da kullanılabilir.</p></details></div>';
    h += '<div class="sec"><div class="sec-h"><h3>Makro kaydedici</h3>' + (rec.on ? '<button class="btn danger" data-act="scRecStop">■ Durdur (' + rec.steps.length + ')</button>' : '<button class="btn" data-act="scRec">● Kaydet</button>') + '</div>';
    if (rec.on) h += '<p class="sec-note">Kaydediliyor: menü komutları, özellik değişiklikleri ve palet renkleri.</p><ol style="margin:0;padding-left:20px;font-size:12.5px">' + rec.steps.slice(-8).map((s) => '<li>' + esc(stepText(s)) + '</li>').join('') + '</ol>';
    else if (!macros().length) h += '<p class="sec-note">Bir dizi işlemi kaydedin, sonra başka nesneler seçip tek dokunuşla tekrarlayın.</p>';
    macros().forEach((m, i) => {
      h += '<div class="row" style="flex-wrap:nowrap;gap:4px"><button class="btn" style="flex:1;justify-content:flex-start" data-act="scPlay:' + i + '" title="' + esc(m.steps.map(stepText).join(' → ')) + '">▶ ' + esc(m.name) + ' <small style="opacity:.6">(' + m.steps.length + ')</small></button><button class="row-btn" data-act="scMacDel:' + i + '" aria-label="Makroyu sil">' + ic('trash', 'sm') + '</button></div>';
    });
    return h + '</div>';
  };
  SC.refresh = () => {
    if (UI.dockTab === 'scripts' && !document.getElementById('dock').hidden) {
      const ta = document.querySelector('#dock-body [data-sc="code"]');
      if (ta) state.code = ta.value;
      UI.renderDock(true);
    }
  };
  UI.panels = UI.panels || {};
  UI.panels.scripts = panel;
  if (!UI.DOCKERS.some(([k]) => k === 'scripts')) UI.DOCKERS.push(['scripts', 'Betikler']);
  document.addEventListener('change', (e) => {
    const t = e.target.closest && e.target.closest('[data-sc="pick"]');
    if (!t) return;
    state.cur = t.value;
    const [k, i] = t.value.split(':');
    state.code = k === 'sample' ? SC.SAMPLES[+i].code : (saved()[+i] || {}).code || '';
    UI.renderDock(true);
  });
  document.addEventListener('input', (e) => {
    const t = e.target.closest && e.target.closest('[data-sc="code"]');
    if (t) state.code = t.value;
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target.closest && e.target.closest('[data-sc="code"]');
    if (!t) return;
    e.stopPropagation();
    if (e.key === 'Tab') {
      e.preventDefault();
      t.setRangeText('  ', t.selectionStart, t.selectionEnd, 'end');
      state.code = t.value;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      SC.act('scRun');
    }
  }, true);
  SC.act = async (id) => {
    const [k, arg] = id.split(':');
    const ta = document.querySelector('#dock-body [data-sc="code"]');
    if (ta) state.code = ta.value;
    switch (k) {
      case 'scRun':
        SC.run(state.code);
        UI.renderDock(true);
        return true;
      case 'scSave': {
        const cur = state.cur.startsWith('mine:') ? saved()[+state.cur.slice(5)] : null;
        if (cur) cur.code = state.code;
        else {
          const name = await UI.prompt({ title: 'Betiği kaydet', label: 'Ad', value: 'Betik ' + (saved().length + 1) });
          if (!name) return true;
          saved().push({ name, code: state.code });
          state.cur = 'mine:' + (saved().length - 1);
        }
        VP.io.savePrefs();
        VP.toast('Betik kaydedildi');
        UI.renderDock(true);
        return true;
      }
      case 'scNew':
        state.cur = 'new';
        state.code = '// Yeni betik · ölçüler mm\nvp.rect(20, 20, 60, 30, { fill: "#a6d8f0" });\n';
        UI.renderDock(true);
        return true;
      case 'scDel':
        if (state.cur.startsWith('mine:') && (await UI.confirm({ title: 'Betik silinsin mi?', ok: 'Sil', danger: true }))) {
          saved().splice(+state.cur.slice(5), 1);
          state.cur = 'sample:0';
          state.code = SC.SAMPLES[0].code;
          VP.io.savePrefs();
          UI.renderDock(true);
        }
        return true;
      case 'scRec':
        rec.on = true;
        rec.steps = [];
        VP.toast('Makro kaydı başladı · İşlemleri yapın, sonra Durdur');
        UI.renderDock(true);
        UI.renderTop && UI.renderTop();
        return true;
      case 'scRecStop': {
        rec.on = false;
        const steps = rec.steps.slice();
        rec.steps = [];
        if (!steps.length) {
          VP.toast('Kayıt boş');
          UI.renderDock(true);
          return true;
        }
        const name = await UI.prompt({ title: 'Makroyu kaydet', label: 'Ad', value: 'Makro ' + (macros().length + 1) });
        if (name) {
          macros().push({ name, steps });
          VP.io.savePrefs();
        }
        UI.renderDock(true);
        return true;
      }
      case 'scPlay': {
        const m = macros()[+arg];
        if (m) await SC.play(m.steps);
        return true;
      }
      case 'scMacDel':
        macros().splice(+arg, 1);
        VP.io.savePrefs();
        UI.renderDock(true);
        return true;
      default:
        return false;
    }
  };
  const act0 = TX.act;
  TX.act = (id, el) => (/^sc[A-Z]/.test(id) ? (SC.act(id, el), true) : act0(id, el));

  Object.assign(A, {
    dockScripts: { label: 'Betikler ve makrolar', icon: 'code', run: () => UI.openDock('scripts') },
    macroRec: { label: 'Makro kaydını başlat', checked: () => rec.on, run: () => (rec.on ? SC.act('scRecStop') : SC.act('scRec')) },
    runScript: { label: 'Betik çalıştır…', run: () => UI.openDock('scripts') }
  });
  const M = UI.MENUS.tools;
  if (M && !M.includes('dockScripts')) M.push('|', 'h:Betikler', 'dockScripts', 'macroRec', 'runScript');
})();
