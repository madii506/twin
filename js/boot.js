/* the loading screen, ~7 s, once per tab. Click, scroll or any key skips.
   the paper powers on from the centre, two swarms of glyphs build two spinning coins,
   A pumps and B lags, a thread pulls tight, SOL runs down it and lifts B,
   the two coins stack into the hero's coins and TWIN decodes out of random glyphs. */
(() => {
  const html = document.documentElement, el = document.getElementById('boot');
  if (!el) return;
  if (!html.classList.contains('booting')) { el.remove(); return; }
  el.style.display = 'block';
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), bar = el.querySelector('.bbar i');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const C = { aRim: '#16a34a', aFace: '#86efac', aChart: '#22c55e', bRim: '#26302b', bFace: '#b6cdbf', bChart: '#3f4a44', dot: '#d4eedd', hot: '#4ade80', ink: '#18181b', t2: '#3f4a44' };
  const TL = { power: 1.1, spawn0: .3, spawn1: 1.45, fly: .95, pump0: 2.55, pump1: 3.25, thread0: 3.0, tight: 3.35, pk0: 3.4, merge0: 4.55, merge1: 5.35, word: 5.4, tag: 6.0, END: 7.1 };
  const cl = x => Math.min(1, Math.max(0, x)), eo = x => 1 - Math.pow(1 - cl(x), 3);
  const io = x => { x = cl(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const back = x => { x = cl(x); const c = 1.8; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const rnd = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  const NOISE = '#$%&+=o:01ABCDEFX';

  let W, H, FS, sprites = new Map(), S;
  function sprite(ch, col, wt) {
    const k = ch + col + wt; let s = sprites.get(k);
    if (!s) {
      const box = FS * 1.3; s = document.createElement('canvas'); s.width = s.height = Math.ceil(box * DPR); s.box = box;
      const c = s.getContext('2d'); c.scale(DPR, DPR); c.font = `${wt} ${FS}px J, ui-monospace, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(ch, box / 2, box / 2 + FS * .04); sprites.set(k, s);
    }
    return s;
  }
  function glyph(ch, col, x, y, a = 1, sc = 1, wt = 800) { if (a <= .01 || sc <= .01) return; const s = sprite(ch, col, wt), z = s.box * sc; g.globalAlpha = Math.min(1, a); g.drawImage(s, x - z / 2, y - z / 2, z, z); }

  // one coin = a rim (top ring, the visible half of the bottom ring, reeding between) + a face with dots and a small chart
  function coinModel(seed) {
    const pts = [], n = 56;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push({ lx: Math.cos(a), lz: Math.sin(a), layer: 0, ch: '#', kind: 'rim' }); pts.push({ lx: Math.cos(a), lz: Math.sin(a), layer: 1, ch: '#', kind: 'rim' }); if (i % 2 === 0) pts.push({ lx: Math.cos(a), lz: Math.sin(a), layer: .5, ch: '|', kind: 'rim' }); }
    for (let i = 0; i < 64; i++) { const r = Math.sqrt((i + .5) / 64) * .8, a = i * 2.39996; pts.push({ lx: Math.cos(a) * r, lz: Math.sin(a) * r, layer: 0, ch: ':', kind: 'face' }); }
    for (let i = 0; i < 15; i++) { const u = -.6 + i / 14 * 1.2, s = cl((u + .2) / .6), v = .28 - .56 * s * s * (3 - 2 * s) + Math.sin(i * 1.7 + seed) * .03; pts.push({ lx: u, lz: v, layer: 0, ch: '#', kind: 'chart' }); }
    pts.forEach((p, i) => { p.born = TL.spawn0 + rnd(i + seed * 999, 3) * (TL.spawn1 - TL.spawn0); p.sx = rnd(i + seed * 999, 1); p.sy = rnd(i + seed * 999, 2); p.w = rnd(i + seed * 999, 5) * 6.28; p.dir = rnd(i + seed * 999, 6) > .5 ? 1 : -1; });
    return pts;
  }
  const MA = coinModel(1), MB = coinModel(2);

  function layout() {
    W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const mob = W < 720; FS = mob ? 9.5 : Math.max(10, Math.min(13, W / 112)); sprites = new Map();
    const st = document.querySelector('.stage'), r = st && st.getBoundingClientRect();
    const sw = st ? st.offsetWidth : Math.min(400, W * .8), sh = st ? st.offsetHeight : Math.min(H * .36, 300);
    const fx = r ? r.left + r.width / 2 : W / 2, fy = r ? r.top + r.height / 2 : H * .36;
    const Rf = Math.min(sw / 2.4, sh / 2.15) * .92, R = mob ? W * .15 : Math.min(150, H * .155, W * .095), sep = mob ? W * .26 : Math.min(W * .2, 320);
    S = { mob, R, Rf, A0: { x: W / 2 - sep, y: H * .5 }, B0: { x: W / 2 + sep, y: H * .5 }, fx, fy, lift: Rf * .5, rise: Math.min(H * .1, R * .9) };
  }

  // where each coin is at time t (and how big), plus B's lift from the packets
  const PK = 5, pkAt = j => TL.pk0 + j * .2, pkDur = .55;
  function scene(t) {
    const pump = io((t - TL.pump0) / (TL.pump1 - TL.pump0)) * S.rise;
    let lift = 0; for (let j = 0; j < PK; j++) lift += io((t - pkAt(j) - pkDur) / .32) * S.rise / PK;
    const m = io((t - TL.merge0) / (TL.merge1 - TL.merge0)), R = S.R + (S.Rf - S.R) * m;
    const a = { x: S.A0.x, y: S.A0.y - pump }, b = { x: S.B0.x, y: S.B0.y - lift };
    const ta = { x: S.fx, y: S.fy - S.lift }, tb = { x: S.fx, y: S.fy + S.lift };
    return { m, R, A: { x: a.x + (ta.x - a.x) * m, y: a.y + (ta.y - a.y) * m }, B: { x: b.x + (tb.x - b.x) * m, y: b.y + (tb.y - b.y) * m }, pump, lift };
  }

  const SQ = .36, TH = .2;
  function project(p, c, R, phi) {
    const cs = Math.cos(phi), sn = Math.sin(phi), rx = p.lx * cs - p.lz * sn, rz = p.lx * sn + p.lz * cs;
    return { x: c.x + rx * R, y: c.y + rz * R * SQ + p.layer * TH * R, z: rz };
  }
  function drawCoin(M, c, R, phi, t, col) {
    const out = [];
    for (let i = 0; i < M.length; i++) {
      const p = M[i], q = project(p, c, R, phi);
      if (p.layer > 0 && q.z < -.08) continue;
      const k = io((t - p.born - .22) / TL.fly), pop = back((t - p.born) / .26);
      if (pop <= 0) continue;
      let x = q.x, y = q.y, ch = p.ch, a;
      const shade = p.kind === 'rim' ? .5 + .5 * (q.z + 1) / 2 : 1;
      if (k < 1) {
        // fly in from the scatter point with a swirl, glyphs flicker until they land
        const sx = p.sx * W, sy = p.sy * H + Math.sin(t * 3 + p.w) * 4, dx = sx - q.x, dy = sy - q.y, sw = (1 - k) * 1.3 * p.dir;
        x = q.x + (dx * Math.cos(sw) - dy * Math.sin(sw)) * (1 - k); y = q.y + (dx * Math.sin(sw) + dy * Math.cos(sw)) * (1 - k);
        if (k < .82) ch = NOISE[Math.floor(t * 14 + i * 3) % NOISE.length];
        a = (.35 + .65 * k) * Math.min(1, pop);
      } else a = 1;
      const color = p.kind === 'rim' ? col.rim : p.kind === 'face' ? col.face : col.chart;
      out.push([q.z + (p.layer ? .001 : 0), ch, color, x, y, a * shade, (k < 1 ? .85 + .3 * pop : 1) * (p.kind === 'face' ? .9 : 1)]);
    }
    out.sort((u, v) => u[0] - v[0]);
    for (const o of out) glyph(o[1], o[2], o[3], o[4], o[5], o[6], o[1] === ':' ? 500 : 800);
  }

  // the dot paper, powering on from the centre (same 32px grid as the page)
  function paper(t) {
    const p = eo(t / TL.power), rad = Math.hypot(W, H) * .6 * p, cx = W / 2, cy = H / 2;
    for (let y = 16; y < H; y += 32) for (let x = 16; x < W; x += 32) {
      const d = Math.hypot(x - cx, y - cy), edge = rad - d; if (edge < 0) continue;
      const hot = p < 1 ? Math.max(0, 1 - Math.abs(edge - 30) / 60) : 0;
      g.fillStyle = hot > .05 ? C.hot : C.dot; const s = 1.2 + hot * 1.3;
      g.globalAlpha = hot > .05 ? .35 + hot * .65 : 1; g.beginPath(); g.arc(x, y, s, 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;
  }

  function quad(p0, c, p1, u) { const v = 1 - u; return { x: v * v * p0.x + 2 * v * u * c.x + u * u * p1.x, y: v * v * p0.y + 2 * v * u * c.y + u * u * p1.y }; }
  const trail = [];
  let lastT = 0;

  function draw(t) {
    g.clearRect(0, 0, W, H);
    paper(t);
    const sc = scene(t), phiA = t * .85, phiB = t * .85 + 1.1;
    // A's pump leaves a trail of falling dust
    if (t > TL.pump0 && t < TL.pump1 && t - lastT > .012) for (let i = 0; i < 2; i++) trail.push({ x: sc.A.x + (Math.random() - .5) * sc.R * 1.4, y: sc.A.y + sc.R * .5, t, ch: Math.random() > .5 ? '·' : ':' });
    lastT = t;
    for (let i = trail.length - 1; i >= 0; i--) { const d = t - trail[i].t; if (d > .9 || d < 0) { trail.splice(i, 1); continue; } glyph(trail[i].ch, C.aChart, trail[i].x, trail[i].y + d * 40, (1 - d / .9) * .8, .9, 800); }
    // the thread: it draws out with slack, then pulls tight
    const thA = 1 - eo((t - TL.merge0) / .35);
    if (t > TL.thread0 && thA > 0) {
      const grow = eo((t - TL.thread0) / .38), tight = eo((t - TL.tight) / .4);
      const p0 = { x: sc.A.x + sc.R * .98, y: sc.A.y }, p1 = { x: sc.B.x - sc.R * .98, y: sc.B.y }, ctl = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 + (1 - tight) * sc.R * 1.25 + Math.sin(t * 6) * (1 - tight) * 3 };
      g.globalAlpha = thA; g.lineWidth = 1.6; g.strokeStyle = C.aChart; g.lineCap = 'round'; g.shadowColor = 'rgba(74,222,128,.55)'; g.shadowBlur = 8;
      g.beginPath(); g.moveTo(p0.x, p0.y); for (let u = .02; u <= grow + .001; u += .02) { const q = quad(p0, ctl, p1, Math.min(u, grow)); g.lineTo(q.x, q.y); } g.stroke(); g.shadowBlur = 0;
      // SOL runs down the thread from the leader to the laggard
      for (let j = 0; j < PK; j++) {
        const u = io((t - pkAt(j)) / pkDur); if (u <= 0 || u >= 1) continue;
        for (let k = 0; k < 4; k++) { const uu = Math.max(0, u - k * .035), q = quad(p0, ctl, p1, uu); glyph('$', C.aChart, q.x, q.y - 1, thA * (1 - k * .25), 1.25 - k * .15, 800); }
      }
      // each arrival bumps B
      for (let j = 0; j < PK; j++) { const d = t - pkAt(j) - pkDur; if (d > 0 && d < .5) { g.globalAlpha = (1 - d / .5) * .6 * thA; g.lineWidth = 1; g.strokeStyle = C.aChart; g.beginPath(); g.ellipse(sc.B.x, sc.B.y, sc.R * (1 + d * .9), sc.R * SQ * (1 + d * .9), 0, 0, 6.283); g.stroke(); } }
      g.globalAlpha = 1;
    }
    // the coins: B first when stacked (it sits underneath)
    const A = () => drawCoin(MA, sc.A, sc.R, phiA, t, { rim: C.aRim, face: C.aFace, chart: C.aChart });
    const B = () => drawCoin(MB, sc.B, sc.R, phiB, t, { rim: C.bRim, face: C.bFace, chart: C.bChart });
    if (sc.m > .5) { B(); A(); } else { A(); B(); }
    // labels under the coins while they're apart
    const la = cl((t - 2.3) / .4) * (1 - cl((t - TL.merge0) / .3));
    if (la > 0) {
      g.globalAlpha = la; g.font = `700 ${S.mob ? 11 : 12.5}px J, monospace`; g.textAlign = 'center'; g.textBaseline = 'top';
      const gap = Math.round((sc.pump - sc.lift) / S.rise * 61);
      g.fillStyle = C.aChart; g.fillText(`coin A  +${Math.round(sc.pump / S.rise * 64)}%`, sc.A.x, sc.A.y + sc.R * .92);
      g.fillStyle = C.t2; g.fillText(`coin B  +${Math.round(sc.lift / S.rise * 64)}%`, sc.B.x, sc.B.y + sc.R * .92);
      g.fillStyle = gap > 5 ? C.t2 : C.aChart; g.fillText(t < TL.thread0 ? `gap +${gap}%` : gap > 5 ? `gap +${gap}%  ·  maker buying B` : 'in sync', W / 2, Math.max(sc.A.y, sc.B.y) + sc.R * 1.4);
      g.globalAlpha = 1;
    }
    // the snap: a ripple and a flash as the stack lands
    if (t > TL.merge1 - .05) {
      const d = t - TL.merge1 + .05;
      for (let r = 0; r < 2; r++) { const e = d - r * .12; if (e > 0 && e < .8) { g.globalAlpha = (1 - e / .8) * .7; g.lineWidth = 1.3; g.strokeStyle = C.hot; g.beginPath(); g.ellipse(S.fx, S.fy, S.Rf * (1.05 + e * 1.6), S.Rf * SQ * (1.05 + e * 1.6) + S.lift, 0, 0, 6.283); g.stroke(); } }
      if (d < .4) { g.globalAlpha = .4 * (1 - d / .4); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
      g.globalAlpha = 1;
    }
    word(t);
  }

  // TWIN decodes letter by letter, white face on a light-green extrusion, then a slow sweep of light
  function word(t) {
    if (t < TL.word) return;
    const fs = Math.min(W * (S.mob ? .17 : .085), H * .11, 112), y = S.fy + S.lift + S.Rf * .62 + fs * .9;
    g.font = `800 ${fs}px J, ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const word = 'TWIN', cw = g.measureText('W').width, gap = fs * .04, total = cw * 4 + gap * 3, x0 = W / 2 - total / 2 + cw / 2;
    const ext = Math.max(2, fs * .045);
    for (let i = 0; i < 4; i++) {
      const show = t - (TL.word + i * .09), settle = t - (TL.word + .3 + i * .14); if (show <= 0) continue;
      const ch = settle >= 0 ? word[i] : NOISE[Math.floor(t * 18 + i * 5) % NOISE.length], x = x0 + i * (cw + gap), rise = (1 - eo(show / .35)) * fs * .25;
      g.globalAlpha = eo(show / .25);
      for (let k = Math.ceil(ext); k >= 1; k--) { g.fillStyle = k > ext * .5 ? '#a7e8bd' : '#c8f2d6'; g.fillText(ch, x + k * .8, y + k + rise); }
      g.fillStyle = settle >= 0 ? '#ffffff' : '#e3f6ea'; g.fillText(ch, x, y + rise);
      g.lineWidth = 1; g.strokeStyle = '#a9dcbb'; g.strokeText(ch, x, y + rise);
      if (settle >= 0 && settle < .3) { g.globalAlpha = (1 - settle / .3) * .9; g.fillStyle = C.hot; g.fillText(ch, x, y + rise); }
    }
    g.globalAlpha = 1;
    if (t > TL.word + .9) {
      const sw = ((t - TL.word - .9) / 1.1) * (total + fs) + W / 2 - total / 2 - fs / 2, gr = g.createLinearGradient(sw - fs * .3, 0, sw + fs * .3, 0);
      gr.addColorStop(0, 'rgba(74,222,128,0)'); gr.addColorStop(.5, 'rgba(74,222,128,.55)'); gr.addColorStop(1, 'rgba(74,222,128,0)');
      g.fillStyle = gr; for (let i = 0; i < 4; i++) g.fillText(word[i], x0 + i * (cw + gap), y);
    }
    const ta = eo((t - TL.tag) / .5);
    if (ta > 0) { g.globalAlpha = ta; g.font = `500 ${S.mob ? 12 : 14}px J, monospace`; g.fillStyle = C.t2; g.textBaseline = 'top'; g.fillText('two coins. one chart.', W / 2, y + fs * .35 + (1 - ta) * 8); g.globalAlpha = 1; }
  }

  let t0 = null, done = false, skipped = false;
  function frame(now) {
    if (done) return;
    if (t0 == null) t0 = now;
    const t = (now - t0) / 1000;
    draw(t);
    bar.style.transform = `scaleX(${cl(t / TL.END)})`;
    if (t >= TL.END || skipped) return finish();
    requestAnimationFrame(frame);
  }
  function finish() {
    if (done) return; done = true;
    try { sessionStorage.setItem('tw:boot', '1'); } catch (e) { }
    el.classList.add('out'); html.classList.add('booted'); html.classList.remove('booting');
    window.dispatchEvent(new Event('twin:booted'));
    setTimeout(() => el.remove(), 1100);
  }
  const skip = () => { skipped = true; if (t0 == null) finish(); };
  el.addEventListener('click', skip);
  ['keydown', 'wheel', 'touchmove'].forEach(ev => addEventListener(ev, skip, { once: true, passive: true }));
  addEventListener('resize', () => { if (!done) layout(); });
  setTimeout(finish, 12000);

  layout();
  const fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('800 14px J'), document.fonts.load('500 14px J')]) : Promise.resolve();
  Promise.race([fonts, new Promise(r => setTimeout(r, 900))]).then(() => { sprites = new Map(); layout(); requestAnimationFrame(frame); }).catch(finish);
})();
