/* VektörPad QR code and barcode encoders (written for this app, no outside code).
   QR: byte mode (UTF-8), versions 1–40, error correction L/M/Q/H, automatic mask choice.
   Barcodes: Code 128 (sets B and C), EAN-13, EAN-8, UPC-A.
   Exposed as VP.codes; also works under Node for testing (module.exports). */
(function (root) {
  'use strict';

  /* ======================= QR ======================= */
  const ECC = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  };
  const BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  };
  const FORMAT = { L: 1, M: 0, Q: 3, H: 2 };
  const bit = (x, i) => ((x >>> i) & 1) !== 0;
  const rawModules = (ver) => {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  };
  const dataCodewords = (ver, ecl) => Math.floor(rawModules(ver) / 8) - ECC[ecl][ver] * BLOCKS[ecl][ver];
  const gfMul = (x, y) => {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  };
  const rsDivisor = (deg) => {
    const r = new Array(deg).fill(0);
    r[deg - 1] = 1;
    let root = 1;
    for (let i = 0; i < deg; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = gfMul(r[j], root);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return r;
  };
  const rsRemainder = (data, div) => {
    const r = div.map(() => 0);
    data.forEach((b) => {
      const f = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => (r[i] ^= gfMul(c, f)));
    });
    return r;
  };
  const utf8 = (s) => {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
    return Array.from(Buffer.from(s, 'utf8'));
  };

  function qr(text, ecl = 'M', minVer = 1) {
    ecl = FORMAT[ecl] != null ? ecl : 'M';
    const bytes = utf8(String(text));
    let ver = Math.max(1, Math.min(40, minVer | 0));
    const need = (v) => 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
    while (ver <= 40 && need(ver) > dataCodewords(ver, ecl) * 8) ver++;
    if (ver > 40) throw new Error('too_long');
    const cap = dataCodewords(ver, ecl) * 8;
    const bits = [];
    const put = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };
    put(4, 4);
    put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach((b) => put(b, 8));
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

    // error correction and interleaving
    const nb = BLOCKS[ecl][ver];
    const el = ECC[ecl][ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const nShort = nb - (raw % nb);
    const shortLen = Math.floor(raw / nb);
    const div = rsDivisor(el);
    const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => {
        if (i !== shortLen - el || j >= nShort) all.push(b[i]);
      });
    }

    // module grid
    const size = ver * 4 + 17;
    const mod = [];
    const fn = [];
    for (let y = 0; y < size; y++) {
      mod.push(new Array(size).fill(false));
      fn.push(new Array(size).fill(false));
    }
    const setF = (x, y, d) => {
      mod[y][x] = d;
      fn[y][x] = true;
    };
    for (let i = 0; i < size; i++) {
      setF(6, i, i % 2 === 0);
      setF(i, 6, i % 2 === 0);
    }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
        }
      }
    };
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    const align = [];
    if (ver > 1) {
      const na = Math.floor(ver / 7) + 2;
      const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
      align.push(6);
      for (let p = size - 7; align.length < na; p -= step) align.splice(1, 0, p);
    }
    const last = align.length - 1;
    align.forEach((ax, i) => align.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    const formatBits = (mask) => {
      const d = (FORMAT[ecl] << 3) | mask;
      let r = d;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(b, i));
      setF(8, 7, bit(b, 6));
      setF(8, 8, bit(b, 7));
      setF(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(b, i));
      setF(8, size - 8, true);
    };
    formatBits(0);
    if (ver >= 7) {
      let r = ver;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const b = (ver << 12) | r;
      for (let i = 0; i < 18; i++) {
        const a = size - 11 + (i % 3);
        const c = Math.floor(i / 3);
        setF(a, c, bit(b, i));
        setF(c, a, bit(b, i));
      }
    }
    // data
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const up = ((right + 1) & 2) === 0;
          const y = up ? size - 1 - v : v;
          if (!fn[y][x] && i < all.length * 8) {
            mod[y][x] = bit(all[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
    const MASKS = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    ];
    const applyMask = (m) => {
      const f = MASKS[m];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && f(x, y)) mod[y][x] = !mod[y][x];
    };
    const addHist = (len, h) => {
      if (h[0] === 0) len += size;
      h.pop();
      h.unshift(len);
    };
    const countPat = (h) => {
      const n = h[1];
      const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    };
    const termCount = (col, len, h) => {
      if (col) {
        addHist(len, h);
        len = 0;
      }
      len += size;
      addHist(len, h);
      return countPat(h);
    };
    const penalty = () => {
      let r = 0;
      const line = (get) => {
        for (let a = 0; a < size; a++) {
          let col = false;
          let run = 0;
          const h = [0, 0, 0, 0, 0, 0, 0];
          for (let b = 0; b < size; b++) {
            if (get(a, b) === col) {
              run++;
              if (run === 5) r += 3;
              else if (run > 5) r++;
            } else {
              addHist(run, h);
              if (!col) r += countPat(h) * 40;
              col = get(a, b);
              run = 1;
            }
          }
          r += termCount(col, run, h) * 40;
        }
      };
      line((y, x) => mod[y][x]);
      line((x, y) => mod[y][x]);
      for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
          const c = mod[y][x];
          if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) r += 3;
        }
      }
      let dark = 0;
      mod.forEach((row) => row.forEach((d) => d && dark++));
      const total = size * size;
      r += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return r;
    };
    let best = 0;
    let bp = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m);
      formatBits(m);
      const p = penalty();
      if (p < bp) {
        bp = p;
        best = m;
      }
      applyMask(m);
    }
    applyMask(best);
    formatBits(best);
    return { size, version: ver, mask: best, ecl, modules: mod };
  }

  /* ======================= barcodes ======================= */
  // Code 128 bar/space widths of symbols 0–105, then the stop symbol
  const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
    '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
    '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
    '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
    '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
    '114131 311141 411131 211412 211214 211232 2331112').split(' ');
  // widths → module runs [[dark, length], …]
  const runsOf = (widths) => widths.split('').map((w, i) => [i % 2 === 0, +w]);
  function code128(text) {
    text = String(text);
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      if (c < 32 || c > 126) throw new Error('chars');
    }
    // set C for runs of 4+ digits (or the whole text when it is all digits, even length), set B otherwise
    const syms = [];
    let set = null;
    let i = 0;
    const digitsAt = (k) => {
      let n = 0;
      while (k + n < text.length && /\d/.test(text[k + n])) n++;
      return n;
    };
    const to = (x) => {
      if (set === x) return;
      syms.push(set === null ? (x === 'C' ? 105 : 104) : x === 'C' ? 99 : 100);
      set = x;
    };
    while (i < text.length) {
      let nd = digitsAt(i);
      if (nd >= 4 || (nd >= 2 && set === 'C')) {
        if (nd % 2 === 1) {
          to('B');
          syms.push(text.charCodeAt(i) - 32);
          i++;
          nd--;
        }
        to('C');
        for (let k = 0; k < nd; k += 2) syms.push(+text.substr(i + k, 2));
        i += nd;
      } else {
        to('B');
        syms.push(text.charCodeAt(i) - 32);
        i++;
      }
    }
    let sum = syms[0];
    for (let k = 1; k < syms.length; k++) sum += syms[k] * k;
    syms.push(sum % 103);
    syms.push(106);
    const runs = [];
    syms.forEach((s) => runs.push(...runsOf(C128[s])));
    return { runs, quiet: 10, text, syms };
  }
  const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const EAN_R = EAN_L.map((s) => s.replace(/./g, (c) => (c === '0' ? '1' : '0')));
  const EAN_G = EAN_R.map((s) => s.split('').reverse().join(''));
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const checkDigit = (d) => {
    // weights 3,1,3,… from the rightmost data digit
    let s = 0;
    for (let k = d.length - 1, w = 3; k >= 0; k--, w = 4 - w) s += +d[k] * w;
    return (10 - (s % 10)) % 10;
  };
  const bitsToRuns = (bits) => {
    const runs = [];
    bits.split('').forEach((b) => {
      const d = b === '1';
      if (runs.length && runs[runs.length - 1][0] === d) runs[runs.length - 1][1]++;
      else runs.push([d, 1]);
    });
    if (runs.length && !runs[0][0]) runs.shift();
    return runs;
  };
  // guards: module ranges drawn longer
  function ean13(text) {
    let d = String(text).replace(/\D/g, '');
    if (d.length === 13) {
      if (checkDigit(d.slice(0, 12)) !== +d[12]) throw new Error('check');
      d = d.slice(0, 12);
    }
    if (d.length !== 12) throw new Error('len13');
    d += checkDigit(d);
    const par = PARITY[+d[0]];
    let bits = '101';
    for (let k = 1; k <= 6; k++) bits += (par[k - 1] === 'L' ? EAN_L : EAN_G)[+d[k]];
    bits += '01010';
    for (let k = 7; k <= 12; k++) bits += EAN_R[+d[k]];
    bits += '101';
    return { bits, runs: bitsToRuns(bits), quiet: 11, text: d, guards: [[0, 3], [45, 50], [92, 95]], kind: 'ean13' };
  }
  function ean8(text) {
    let d = String(text).replace(/\D/g, '');
    if (d.length === 8) {
      if (checkDigit(d.slice(0, 7)) !== +d[7]) throw new Error('check');
      d = d.slice(0, 7);
    }
    if (d.length !== 7) throw new Error('len8');
    d += checkDigit(d);
    let bits = '101';
    for (let k = 0; k < 4; k++) bits += EAN_L[+d[k]];
    bits += '01010';
    for (let k = 4; k < 8; k++) bits += EAN_R[+d[k]];
    bits += '101';
    return { bits, runs: bitsToRuns(bits), quiet: 7, text: d, guards: [[0, 3], [31, 36], [64, 67]], kind: 'ean8' };
  }
  function upca(text) {
    let d = String(text).replace(/\D/g, '');
    if (d.length === 12) {
      if (checkDigit(d.slice(0, 11)) !== +d[11]) throw new Error('check');
      d = d.slice(0, 11);
    }
    if (d.length !== 11) throw new Error('len12');
    const r = ean13('0' + d);
    r.text = r.text.slice(1);
    r.kind = 'upca';
    r.guards = [[0, 10], [45, 50], [85, 95]];
    return r;
  }

  const api = { qr, code128, ean13, ean8, upca, checkDigit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.VP) root.VP.codes = api;
  else if (root) root.VP_CODES = api;
})(typeof window !== 'undefined' ? window : null);
