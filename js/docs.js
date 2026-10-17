(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  try { window.ASCIIRain && window.ASCIIRain($('#rain')); } catch (e) { }
  const nav = $('#nav'), prog = $('#progress');
  const onScroll = () => { nav.classList.toggle('scrolled', scrollY > 10); const h = document.documentElement.scrollHeight - innerHeight; prog.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`; spy(); };

  // the tree of contents, drawn like `tree`
  const secs = $$('.ds'), tree = $('#tree');
  tree.innerHTML = '<span class="br">docs/</span>\n' + secs.map((s, i) => {
    const h = s.querySelector('h2'), n = h.querySelector('b').textContent, t = h.textContent.replace(n, '').trim();
    return `<span class="br">${i === secs.length - 1 ? '└── ' : '├── '}</span><a href="#${s.id}" data-id="${s.id}">${n} ${t}</a>`;
  }).join('\n');
  const tl = $$('#tree a');
  function spy() {
    let cur = secs[0]; for (const s of secs) if (s.getBoundingClientRect().top < innerHeight * .32) cur = s;
    tl.forEach(a => a.classList.toggle('on', a.dataset.id === cur.id));
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // sections rise in as they come into view
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  secs.forEach(s => io.observe(s));
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.classList.add('vis'); }

  // search: dims what doesn't match, Enter jumps to the first match
  const dq = $('#dq');
  const matches = q => secs.filter(s => !q || (s.dataset.t + ' ' + s.textContent).toLowerCase().includes(q));
  dq.addEventListener('input', () => {
    const q = dq.value.trim().toLowerCase(), m = new Set(matches(q).map(s => s.id));
    tl.forEach(a => a.classList.toggle('dim', !m.has(a.dataset.id)));
    $('#tnone').hidden = m.size > 0;
  });
  dq.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const m = matches(dq.value.trim().toLowerCase())[0]; if (m) jump(m); }
    if (e.key === 'Escape') { dq.value = ''; dq.dispatchEvent(new Event('input')); dq.blur(); }
  });
  addEventListener('keydown', e => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); dq.focus(); } });
  function jump(s) { s.classList.add('vis'); s.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', '#' + s.id); s.classList.add('hl'); setTimeout(() => s.classList.remove('hl'), 1400); }
  tl.forEach(a => a.addEventListener('click', e => { e.preventDefault(); jump(document.getElementById(a.dataset.id)); }));

  // copy buttons
  $('#curlLine').textContent = `curl -s ${location.origin}/api/scan?tab=trending`;
  $$('.code .cp').forEach(b => b.addEventListener('click', async () => {
    const t = b.parentElement.textContent.replace(/^copy/, '').trim();
    try { await navigator.clipboard.writeText(t); b.textContent = 'copied'; } catch (e) { b.textContent = 'select it'; }
    setTimeout(() => b.textContent = 'copy', 1400);
  }));

  // the real numbers, read from the running engine
  const CFG = { defaults: { band: 8, buy: 20, trim: 35, cooldown: 3, maxTrade: .5, impact: 4, slippage: 300 }, maxSol: 5, reserve: .012, minFund: .05, minLiq: 3000 };
  const st = $('#cfgState'), dot = st.previousElementSibling;
  fetch('/api/config').then(r => r.ok ? r.json() : Promise.reject(r.status)).then(c => {
    Object.assign(CFG, c);
    $$('[data-cfg]').forEach(el => {
      const k = el.dataset.cfg, u = el.dataset.u || ''; let v;
      if (k.startsWith('d.')) v = c.defaults[k.slice(2)] + u;
      else if (k.startsWith('l.')) { const l = c.limits[k.slice(2)]; v = `${l[0]}–${l[1]}${u}`; }
      else v = c[k];
      if (v != null) { el.textContent = v; el.classList.add('live'); }
    });
    st.textContent = 'live config · read from the engine just now'; dot.classList.add('ok'); calc();
  }).catch(() => { st.textContent = "couldn't read /api/config · showing the values in the code"; dot.classList.add('bad'); });

  // the calculator: one pass decision, exactly as the engine makes it
  const ids = ['cA', 'cB', 'cBand', 'cBuy', 'cTrim', 'cSol', 'cLad'], I = {}; ids.forEach(k => I[k] = $('#' + k));
  const fill = el => el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
  const pct = (v, d = 1) => (v > 0 ? '+' : '') + v.toFixed(d) + '%';
  function calc() {
    ids.forEach(k => fill(I[k]));
    const a = +I.cA.value / 100, b = +I.cB.value / 100, band = +I.cBand.value / 100, buy = +I.cBuy.value, trim = +I.cTrim.value, sol = +I.cSol.value / 100, lad = +I.cLad.value;
    $('#vA').textContent = pct(a * 100, 0); $('#vB').textContent = pct(b * 100, 0); $('#vBand2').textContent = (band * 100) + '%'; $('#vBuy2').textContent = buy + '%'; $('#vTrim2').textContent = trim + '%'; $('#vSol').textContent = sol.toFixed(2); $('#vLad').textContent = lad;
    const gap = Math.log((1 + a) / (1 + b)), step = Math.floor(Math.abs(gap) / band), aLeads = gap > 0;
    const lead = aLeads ? 'A' : 'B', lag = aLeads ? 'B' : 'A';
    const maxT = CFG.defaults.maxTrade, cap = CFG.maxSol, res = CFG.reserve;
    const solIn = Math.max(0, Math.min(maxT, (Math.min(sol, cap) - res) * buy / 100));
    let act, newLad = lad, idle = true;
    if (step === 0) { newLad = 0; act = 'in sync: inside the band, no trade' + (lad ? '. the ladder resets to 0' : ''); }
    else if (step > lad) {
      idle = false; newLad = step; const parts = [];
      if (trim > 0) parts.push(`sell ${trim}% of the $${lead} bag`);
      if (solIn >= .004) parts.push(`buy $${lag} with ${solIn.toFixed(3)} SOL`); else parts.push(`buy skipped (under 0.004 SOL)`);
      act = `step ${step} is new → ${parts.join(', then ')}. ladder → ${step}` + (step - lad > 1 ? ` (one trade for ${step - lad} steps)` : '');
    } else if (step < lad - 1) { newLad = step + 1; act = `the gap shrank: ladder steps down to ${newLad}, no trade. it trades again at step ${newLad + 1}`; }
    else act = `step ${step} already traded: waiting for step ${lad + 1} at a ${((lad + 1) * band * 100).toFixed(0)}% gap`;
    // ascii ladder
    const N = Math.min(7, Math.max(3, step + 1)), W = 12, rows = [];
    const mark = `<span class="k">        ● gap ${pct(gap * 100)}</span>`;
    const line = lvl => {
      const th = lvl * band * 100, lab = (lvl > 0 ? '+' : lvl < 0 ? '-' : ' ') + Math.abs(th).toFixed(0) + '%';
      if (lvl === 0) return `${lab.padStart(6)} ┼${'─'.repeat(W)} in sync`;
      const side = lvl > 0 ? 'A' : 'B', k = Math.abs(lvl), onSide = (lvl > 0) === aLeads && gap !== 0, crossed = onSide && k <= step;
      let tag = `step ${k} · trim ${side} · buy ${side === 'A' ? 'B' : 'A'}`;
      if (onSide && k <= lad && k <= step) tag += ' ✓ traded';
      else if (crossed && k === step && step > lad) tag += ' ◀ trades now';
      const txt = `${lab.padStart(6)} ┤${' ·'.repeat(W / 2)} ${tag}`;
      return crossed ? `<span class="g">${txt}</span>` : txt;
    };
    for (let l = N; l >= -N; l--) {
      if (gap >= 0 && ((step >= N && l === N) || (step < N && l === step))) { if (step >= N) { rows.push(mark); rows.push(line(l)); continue; } rows.push(mark); }
      rows.push(line(l));
      if (gap < 0 && ((step >= N && l === -N) || (step < N && l === -step))) rows.push(mark);
    }
    $('#cLadder').innerHTML = rows.join('\n');
    $('#cRes').innerHTML = `<div><span>gap = ln((1${a >= 0 ? '+' : ''}${a.toFixed(2)})/(1${b >= 0 ? '+' : ''}${b.toFixed(2)}))</span><b>${pct(gap * 100)}</b></div>
      <div><span>step = floor(|gap| / ${(band * 100)}%)</span><b>${step}</b></div>
      <div><span>leader / laggard</span><b>${gap === 0 ? '—' : `$${lead} / $${lag}`}</b></div>
      <div><span>buy size = min(${maxT}, (min(${sol.toFixed(2)}, ${cap}) − ${res}) × ${buy}%)</span><b>${solIn.toFixed(3)} SOL</b></div>
      <span class="act${idle ? ' idle' : ''}">${act}</span>`;
  }
  ids.forEach(k => I[k].addEventListener('input', calc)); calc();
})();
