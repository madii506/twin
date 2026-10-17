/* ASCII renderers for TWIN: two 3D coins spinning in sync, the wordmark, and the drifting background. */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RAMP = ' .:-=+*#%@';
  const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  const MINT = [190, 244, 208], GREEN = [34, 197, 94], DEEP = [21, 160, 80], INK = [24, 24, 27];
  // glyph atlas: each (char, colour) drawn once, then blitted
  function atlas(font, cw, ch, dpr) {
    const cache = new Map();
    return (c, col) => {
      const k = c + col; let g = cache.get(k); if (g) return g;
      g = document.createElement('canvas'); g.width = Math.ceil(cw * dpr); g.height = Math.ceil(ch * dpr);
      const x = g.getContext('2d'); x.scale(dpr, dpr); x.font = font; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(c, 0, ch / 2 + .5);
      cache.set(k, g); if (cache.size > 2000) cache.clear(); return g;
    };
  }
  // the chart engraved on both coins: the same squiggle, so they read as twins
  const P = [[-.62, .34], [-.22, .02], [.04, .16], [.62, -.38]];
  function onChart(x, y) {
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1]; if (x < x0 || x > x1) continue;
      const yy = y0 + (y1 - y0) * (x - x0) / (x1 - x0); return Math.abs(y - yy) < .07;
    }
    return false;
  }
  // one coin's surface as points: a flat disc (top and bottom faces with ring + chart) and the reeded rim; y is the coin's axis
  function coinPoints() {
    const pts = [], H = .12;
    for (let r = 0; r <= 1; r += .016) {
      const n = Math.max(6, Math.round(r * 400));
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
        const ink = (r > .8 && r < .85) || (r < .74 && onChart(x, z)) || r > .978;
        pts.push([x, H, z, 0, 1, 0, ink ? 1 : 0], [x, -H, z, 0, -1, 0, 0]);
      }
    }
    for (let k = 0; k < 520; k++) {
      const a = k / 520 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (let y = -H; y <= H + 1e-6; y += H / 4) pts.push([c, y, s, c, 0, s, k % 7 === 0 ? 1 : 2]);
    }
    return pts;
  }
  window.ASCIICoins = function (canvas, opts = {}) {
    const ctx = canvas.getContext('2d'), PTS = coinPoints();
    let W, H, dpr, cw, ch, cols, rows, prevC, prevK, glyph, spin = 0, vel = .55, tilt = .36, drag = null, flash = 0, on = true, t0 = performance.now(), last = 0;
    const api = { bound: false };
    function size() {
      const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const fs = W < 420 ? 9 : 11; cw = fs * .6; ch = fs * 1.12; cols = Math.floor(W / cw); rows = Math.floor(H / ch);
      glyph = atlas(`800 ${fs}px J, ui-monospace, monospace`, cw, ch, dpr); prevC = new Array(cols * rows).fill(''); prevK = new Array(cols * rows).fill('');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    function frame(ts) {
      requestAnimationFrame(frame);
      if (!on || document.hidden || ts - last < 30) return; const dt = Math.min(.06, (ts - last) / 1000); last = ts;
      const t = (ts - t0) / 1000;
      if (!drag) { spin += vel * dt; vel += ((reduce ? 0 : .55) - vel) * dt * .8; }
      flash = Math.max(0, flash - dt * 1.4);
      const zb = new Float32Array(cols * rows).fill(-1e9), lum = new Float32Array(cols * rows), kind = new Uint8Array(cols * rows);
      // a stack of two coins seen from a little above, spinning together about their shared axis
      const sc = Math.min(W / 2.4, H / 2.15), cx = W / 2, L = [-.5, .75, .45], ll = Math.hypot(...L);
      const cs = Math.cos(spin), sn = Math.sin(spin), cp = Math.cos(tilt), sp = Math.sin(tilt);
      for (let c = 0; c < 2; c++) {
        const lift = (c === 0 ? .56 : -.56) + (reduce ? 0 : Math.sin(t * 1.2 + c * .4) * .025), cy = H / 2;
        for (const p of PTS) {
          const x = p[0] * cs - p[2] * sn, z = p[0] * sn + p[2] * cs, y = p[1] + lift;
          const nx = p[3] * cs - p[5] * sn, nz = p[3] * sn + p[5] * cs, ny = p[4];
          const up = y * cp + z * sp, depth = -z * cp + y * sp;
          const sx = cx + x * sc, sy = cy - up * sc;
          const i = Math.floor(sx / cw), j = Math.floor(sy / ch); if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
          const k = j * cols + i; if (depth <= zb[k]) continue;
          // the normal in camera space: up and toward the viewer
          const nup = ny * cp + nz * sp, nto = -nz * cp + ny * sp;
          zb[k] = depth; lum[k] = Math.max(0, (nx * L[0] + nup * L[1] + nto * L[2]) / ll); kind[k] = p[6];
        }
      }
      for (let k = 0; k < cols * rows; k++) {
        let ch_ = '', col = '';
        if (zb[k] > -1e9) {
          const l = Math.min(1, lum[k] * .9 + .12 + flash * .5);
          if (kind[k] === 1) { ch_ = '#'; col = rgb(INK); }
          else { const n = Math.min(9, 2 + Math.round(l * 7)); ch_ = RAMP[n]; col = rgb(kind[k] === 2 ? lerp(DEEP, MINT, l) : lerp(GREEN, MINT, l)); }
        }
        if (ch_ === prevC[k] && col === prevK[k]) continue;
        prevC[k] = ch_; prevK[k] = col; const i = k % cols, j = (k / cols) | 0;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(Math.floor(i * cw * dpr), Math.floor(j * ch * dpr), Math.ceil(cw * dpr) + 1, Math.ceil(ch * dpr) + 1);
        if (ch_ && ch_ !== ' ') ctx.drawImage(glyph(ch_, col), Math.floor(i * cw * dpr), Math.floor(j * ch * dpr));
      }
    }
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, s: spin, t: performance.now() }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (drag) { const d = (e.clientX - drag.x) / 120; vel = (spin - drag.s - d) / -Math.max(.016, (performance.now() - drag.t) / 1000) * .02; spin = drag.s + d; } else { const r = canvas.getBoundingClientRect(); tilt = .36 + ((e.clientY - r.top) / r.height - .5) * .2; } });
    canvas.addEventListener('pointerup', () => { if (drag) { vel = Math.max(-6, Math.min(6, vel * 50)); drag = null; } });
    new IntersectionObserver(es => { on = es[0].isIntersecting; }).observe(canvas);
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(size, 150); });
    size(); requestAnimationFrame(frame);
    api.pulse = () => { flash = 1; vel = 5; };
    return api;
  };
  // the wordmark: white letters on a light green extrusion, like the banner
  window.ASCIIWord = function (canvas, text = 'TWIN') {
    function draw() {
      const W = canvas.getBoundingClientRect().width || 480, dpr = Math.min(2, devicePixelRatio || 1);
      const m = document.createElement('canvas'), mx = m.getContext('2d'); const fsBig = 200; mx.font = `800 ${fsBig}px J, ui-monospace, monospace`;
      const tw = mx.measureText(text).width; m.width = Math.ceil(tw + 20); m.height = Math.ceil(fsBig * 1.05);
      mx.font = `800 ${fsBig}px J, ui-monospace, monospace`; mx.textBaseline = 'top'; mx.fillStyle = '#fff'; mx.fillText(text, 10, 0);
      const d = mx.getImageData(0, 0, m.width, m.height).data; let y0 = m.height, y1 = 0, x0 = m.width, x1 = 0;
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (d[(y * m.width + x) * 4 + 3] > 128) { if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, scale = W / (bw + 12), fs = Math.max(4, (bh * scale) / 15 / 1.12), cw = fs * .6, ch = fs * 1.12;
      const cols = Math.floor((bw * scale) / cw), rows = Math.floor((bh * scale) / ch), H = rows * ch + 10;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + 'px';
      const c = canvas.getContext('2d'); c.scale(dpr, dpr); c.font = `800 ${fs}px J, ui-monospace, monospace`; c.textBaseline = 'top';
      const on = (i, j) => { const x = Math.floor(x0 + (i + .5) * cw / scale), y = Math.floor(y0 + (j + .5) * ch / scale); return x >= 0 && y >= 0 && x < m.width && y < m.height && d[(y * m.width + x) * 4 + 3] > 128; };
      const ox = (W - cols * cw) / 2;
      for (let s = 5; s >= 1; s--) { c.fillStyle = rgb(lerp([110, 231, 155], [196, 244, 214], (s - 1) / 4)); for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (on(i, j)) c.fillText('#', ox + i * cw + s * 1.1, j * ch + s * 1.1); }
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (on(i, j)) { c.fillStyle = on(i, j - 1) ? '#ffffff' : '#e3fbeb'; c.fillText('#', ox + i * cw, j * ch); }
    }
    (document.fonts && document.fonts.load ? document.fonts.load('800 40px J').catch(() => { }) : Promise.resolve()).then(draw);
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 200); });
  };
  // the background: slow falling characters in pale mint, brighter near the cursor
  window.ASCIIRain = function (canvas) {
    if (reduce) return;
    const ctx = canvas.getContext('2d'), CH = '01#$+=:.';
    let W, H, dpr, drops = [], mx = -999, my = -999, last = 0;
    function size() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const n = Math.round(W / 46); drops = Array.from({ length: n }, (_, i) => ({ x: (i + .5) * W / n, y: Math.random() * H, v: 14 + Math.random() * 26, len: 6 + (Math.random() * 10 | 0), s: Math.random() * 1000 })); }
    function frame(ts) {
      requestAnimationFrame(frame); if (document.hidden || ts - last < 50) return; const dt = (ts - last) / 1000; last = ts;
      ctx.clearRect(0, 0, W, H); ctx.font = '700 12px J, ui-monospace, monospace';
      for (const d of drops) {
        d.y += d.v * dt; if (d.y - d.len * 14 > H) { d.y = -20; d.v = 14 + Math.random() * 26; }
        for (let k = 0; k < d.len; k++) {
          const y = d.y - k * 14; if (y < -14 || y > H) continue;
          const near = Math.hypot(d.x - mx, y - my) < 120, a = (1 - k / d.len) * (near ? .55 : .2);
          ctx.fillStyle = near ? `rgba(34,197,94,${a})` : `rgba(120,200,150,${a})`; ctx.fillText(CH[(Math.floor(d.s + y / 14) + k) % CH.length], d.x, y);
        }
      }
    }
    addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
    addEventListener('resize', size); size(); requestAnimationFrame(frame);
  };
})();
