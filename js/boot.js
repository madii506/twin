/* the loading screen: two charts drift apart, one maker binds them, they become one chart.
   ~6 s, plays once per tab session, click or any key skips. */
(() => {
  const html = document.documentElement, el = document.getElementById('boot');
  if (!el) return;
  if (!html.classList.contains('booting')) { el.remove(); return; }
  el.style.display = 'block';
  const cv = el.querySelector('canvas'), x = cv.getContext('2d'), bar = el.querySelector('.bbar i');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const C = { ink: '#18181b', t2: '#3f4a44', mu: '#6b7c72', g: '#22c55e', g2: '#4ade80', line: '#a9d9b9', fA: '#9edcb3', fB: '#c4d9cc', b: '#3f4a44' };
  let W, H, fs, cw, ch, L, atlas = new Map();

  function glyph(c, col, bold) {
    const k = c + col + (bold ? 1 : 0); let g = atlas.get(k);
    if (!g) {
      g = document.createElement('canvas'); g.width = Math.ceil(cw * DPR); g.height = Math.ceil(ch * DPR);
      const t = g.getContext('2d'); t.scale(DPR, DPR); t.font = `${bold ? 800 : 500} ${fs}px J, ui-monospace, monospace`;
      t.fillStyle = col; t.textAlign = 'center'; t.textBaseline = 'middle'; t.fillText(c, cw / 2, ch / 2 + .5); atlas.set(k, g);
    }
    return g;
  }
  const snap = v => Math.round(v * DPR) / DPR;
  const put = (c, col, px, py, bold) => { if (c !== ' ') x.drawImage(glyph(c, col, bold), snap(px), snap(py), cw, ch); };
  const text = (s, col, px, py, bold) => { for (let i = 0; i < s.length; i++) put(s[i], col, px + i * cw, py, bold); };
  const center = (s, col, py, bold) => text(s, col, (W - s.length * cw) / 2, py, bold);

  function layout() {
    W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; x.setTransform(DPR, 0, 0, DPR, 0, 0);
    fs = Math.max(10, Math.min(14, W / 100)); cw = fs * .6; ch = fs * 1.32; atlas = new Map();
    const cols = Math.floor(W / cw), rows = Math.floor(H / ch);
    if (W >= 720) {
      const bw = Math.max(26, Math.min(62, Math.floor(cols * .3))), bh = Math.max(11, Math.min(22, Math.floor(rows * .38))), gap = Math.max(18, Math.floor(bw * .5));
      const lx = (W - (2 * bw + gap) * cw) / 2, ty = H / 2 - bh * ch / 2;
      L = { vert: false, bw, bh, gap, A: { x: lx, y: ty }, B: { x: lx + (bw + gap) * cw, y: ty }, M: { x: (W - bw * cw) / 2, y: ty } };
    } else {
      const bw = Math.min(cols - 4, 46), bh = Math.max(8, Math.min(14, Math.floor(rows * .19))), gap = 7;
      const lx = (W - bw * cw) / 2, ty = (H - (2 * bh + gap) * ch) / 2;
      L = { vert: true, bw, bh, gap, A: { x: lx, y: ty }, B: { x: lx, y: ty + (bh + gap) * ch }, M: { x: lx, y: (H - bh * ch) / 2 } };
    }
  }

  const cl = t => Math.max(0, Math.min(1, t));
  const ss = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const eo = t => 1 - Math.pow(1 - cl(t), 3);
  const eio = t => { t = cl(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const fa = v => 1 + .035 * Math.sin(v * 31 + 1) + .025 * Math.sin(v * 67 + 2) + .02 * Math.sin(v * 13) + .78 * ss(.36, .8, v);
  const fb = (v, c) => 1 + .03 * Math.sin(v * 29 + 4) + .025 * Math.sin(v * 59 + 1) + .02 * Math.sin(v * 11 + 2) - .05 * ss(.4, .7, v) * (1 - c) + c * .8 * ss(.5, .95, v);
  const LO = .8, HI = 1.95;
  const pct = v => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';

  function box(p, label, f, lc, fch, fc, d, al, chg, border) {
    const { bw, bh } = L, iw = bw - 2, ih = bh - 2;
    x.globalAlpha = al * border;
    for (let i = 0; i < bw; i++) { const c = i === 0 || i === bw - 1 ? '+' : '-'; put(c, C.line, p.x + i * cw, p.y); put(c, C.line, p.x + i * cw, p.y + (bh - 1) * ch); }
    for (let j = 1; j < bh - 1; j++) { put('|', C.line, p.x, p.y + j * ch); put('|', C.line, p.x + (bw - 1) * cw, p.y + j * ch); }
    x.globalAlpha = al;
    if (label) text(' ' + label + ' ', C.ink, p.x + 2 * cw, p.y, true);
    if (chg) text(' ' + chg + ' ', lc, p.x + (bw - 3 - chg.length) * cw, p.y, true);
    const n = Math.floor(iw * d); let prev = null;
    for (let i = 0; i < n; i++) {
      const r = Math.max(0, Math.min(ih - 1, Math.round((f(i / (iw - 1)) - LO) / (HI - LO) * (ih - 1)))), row = ih - 1 - r, px = p.x + (i + 1) * cw;
      for (let j = row + 1; j < ih; j++) if ((i + j) % 2 === 0) put(fch, fc, px, p.y + (j + 1) * ch);
      if (prev != null && Math.abs(row - prev) > 1) for (let j = Math.min(row, prev) + 1; j < Math.max(row, prev); j++) put('#', lc, px, p.y + (j + 1) * ch, true);
      put(i === n - 1 && d < 1 ? '@' : '#', lc, px, p.y + (row + 1) * ch, true); prev = row;
    }
    x.globalAlpha = 1;
  }

  // the link between a chart and the maker, with SOL moving along it
  function link(ax, ay, bx, by, grow, flow, al) {
    const n = Math.max(1, Math.round(L.vert ? (by - ay) / ch : (bx - ax) / cw)), m = Math.floor(n * grow);
    x.globalAlpha = al;
    for (let i = 0; i < m; i++) { const c = L.vert ? (i % 3 === 1 ? 'o' : '|') : (i % 3 === 1 ? 'o' : '='); put(c, C.g2, L.vert ? ax : ax + i * cw, L.vert ? ay + i * ch : ay, true); }
    if (flow > 0) for (let k = 0; k < 3; k++) { const u = (flow + k / 3) % 1, i = Math.floor(u * n); put('$', C.g, L.vert ? ax : ax + i * cw, L.vert ? ay + i * ch : ay, true); }
    x.globalAlpha = 1;
  }
  function maker(cx, cy, al) {
    x.globalAlpha = al; const s = ['+-----------+', '|   MAKER   |', '+-----------+'], w = s[0].length * cw;
    s.forEach((r, j) => text(r, j === 1 ? C.ink : C.g, cx - w / 2, cy + (j - 1.5) * ch, j === 1));
    x.globalAlpha = 1;
  }

  const LINES = [[.15, 'reading two charts'], [1.75, 'coin A ran ahead. coin B is lagging.'], [2.45, 'bind both to one market maker'], [3.05, 'it trims the leader and buys the laggard'], [4.45, 'two coins. one chart.']];
  const END = 6.4;
  let t0 = null, done = false, skipped = false;

  function frame(now) {
    if (done) return;
    if (t0 == null) t0 = now;
    const t = skipped ? END : (now - t0) / 1000;
    x.clearRect(0, 0, W, H);
    const { bw, bh, A, B, M } = L;
    const fadeIn = eo(t / .45), d = eio((t - .3) / 1.55), c = eio((t - 3.05) / 1.35), mg = eio((t - 4.45) / .95);
    const lerp = (p, q, k) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
    const pA = lerp(A, M, mg), pB = lerp(B, M, mg);
    const gap = Math.log(fa(1) / fb(1, c));
    // the two charts (B first, so A sits on top when they merge)
    box(pB, mg > .5 ? '' : 'coin B', v => fb(v, c), C.b, '.', C.fB, d, fadeIn, d > .98 && mg < .5 ? pct(fb(1, c) - 1) : '', 1 - mg * .999);
    box(pA, mg > .5 ? 'A + B' : 'coin A', fa, C.g, ':', C.fA, d, fadeIn, d > .98 && mg < .5 ? pct(fa(1) - 1) : '', 1);
    // the maker and its two links
    const ma = eo((t - 2.3) / .4) * (1 - eo(mg * 2)), lg = eo((t - 2.45) / .5), fl = t > 3.05 && t < 4.45 ? (t - 3.05) * 1.1 : 0;
    if (ma > 0) {
      if (!L.vert) {
        const ly = A.y + Math.floor(bh / 2) * ch, mx = A.x + bw * cw + L.gap * cw / 2, half = 6.5 * cw;
        link(A.x + bw * cw + cw * .5, ly, mx - half - cw * .5, ly, lg, fl, ma);
        link(mx + half + cw * .5, ly, B.x - cw * .5, ly, lg, fl ? fl + .5 : 0, ma);
        maker(mx, ly + ch * 1.5, ma);
      } else {
        const lx = A.x + Math.floor(bw / 2) * cw, my = A.y + (bh + L.gap / 2) * ch;
        link(lx, A.y + bh * ch, lx, my - 1.5 * ch, lg, fl, ma);
        link(lx, my + 1.5 * ch, lx, B.y, lg, fl ? fl + .5 : 0, ma);
        maker(W / 2, my + .5 * ch, ma);
      }
    }
    // the line above, typed
    const top = Math.min(A.y, pA.y) - ch * 3.2;
    let cur = null; for (const l of LINES) if (t >= l[0]) cur = l;
    if (cur) { const n = Math.floor((t - cur[0]) / .026); const s = '> ' + cur[1].slice(0, n); x.globalAlpha = fadeIn; center(s + (n < cur[1].length || (t * 2 | 0) % 2 ? '_' : ' '), cur === LINES[4] ? C.ink : C.t2, top, cur === LINES[4]); x.globalAlpha = 1; }
    // the gap readout below
    if (t > 1.75 && mg < .99) {
      const bottom = Math.max(A.y, B.y) + bh * ch + ch * 2.2;
      x.globalAlpha = eo((t - 1.75) / .35) * (1 - mg);
      center(`gap ${pct(gap)}  ·  ${c > .02 ? 'maker trading' : t > 2.45 ? 'maker bound' : 'no maker'}`, gap > .1 ? C.t2 : C.g, bottom, true);
      x.globalAlpha = 1;
    }
    bar.style.transform = `scaleX(${cl(t / END)})`;
    if (t >= END) return finish();
    requestAnimationFrame(frame);
  }

  function finish() {
    if (done) return; done = true;
    try { sessionStorage.setItem('tw:boot', '1'); } catch (e) { }
    el.classList.add('out'); html.classList.remove('booting');
    window.dispatchEvent(new Event('twin:booted'));
    setTimeout(() => el.remove(), 1000);
  }
  const skip = () => { if (!done) skipped = true; };
  el.addEventListener('click', skip); addEventListener('keydown', skip, { once: true });
  addEventListener('resize', () => { if (!done) layout(); });
  setTimeout(finish, 12000);   // never hold the page hostage

  layout();
  const fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('800 14px J'), document.fonts.load('500 14px J')]) : Promise.resolve();
  Promise.race([fonts, new Promise(r => setTimeout(r, 900))]).then(() => { atlas = new Map(); requestAnimationFrame(frame); }).catch(finish);
})();
