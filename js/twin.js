/* TWIN: bind two coins to one market maker. Every number on this page is read live. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { v == null || v === '' ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } } };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
  const usd = v => v == null || isNaN(v) ? '—' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + (+v).toFixed(v < 10 ? 2 : 0);
  const sgn = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const ago = t => { if (!t) return '—'; const s = Math.max(0, (Date.now() - new Date(t)) / 1000); return s < 60 ? Math.round(s) + 's ago' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
  const amt = v => !v ? '0' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v >= 1 ? v.toFixed(2) : v.toPrecision(3);
  const av = c => c && c.image ? `<img class="av" src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'av',textContent:'${esc(((c && c.symbol) || '?')[0])}'}))">` : `<i class="av">${esc(((c && c.symbol) || '?')[0])}</i>`;
  const say = t => { $('#srlive').textContent = t; };
  function toast(t, ms = 2800) { $$('.toast').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); say(t); setTimeout(() => d.remove(), ms); }
  const S = { tok: store.get('tw:tok'), wallet: store.get('tw:w'), prov: null, cfg: { defaults: { band: 8, buy: 20, trim: 35, cooldown: 3, maxTrade: .5, impact: 4, slippage: 300 }, maxSol: 5, minFund: .05, reserve: .012 } };
  const GA = '#22c55e', GB = '#18181b';

  async function api(p, body) {
    const h = { 'content-type': 'application/json' }; if (S.tok) h.authorization = 'Bearer ' + S.tok;
    const r = await fetch('/api/' + p, { method: body ? 'POST' : 'GET', headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    let j = {}; try { j = await r.json(); } catch (e) { }
    if (r.status === 401 && S.tok && !/^(login|nonce)/.test(p)) { S.tok = null; store.set('tw:tok', ''); renderMe(); }
    if (!r.ok) { const e = new Error(j.error || 'Something went wrong (' + r.status + ').'); e.status = r.status; e.data = j; throw e; }
    return j;
  }

  /* ---------------- hero: the coins, the wordmark, the typed line ---------------- */
  window.ASCIIRain($('#rain'));
  const coins = window.ASCIICoins($('#coins'));
  const booted = new Promise(r => document.documentElement.classList.contains('booting') ? addEventListener('twin:booted', r, { once: true }) : r());
  booted.then(() => setTimeout(() => coins.pulse(), 350));
  (async () => { await booted; await sleep(250); const t = 'bind two coins to one market maker'; const el = $('#typed'); for (let i = 0; i <= t.length; i++) { el.textContent = '> ' + t.slice(0, i); await sleep(reduce ? 0 : 38); } })();
  const ready = () => $('#pairBar').classList.toggle('ready', B58.test($('#hA').value.trim()) && B58.test($('#hB').value.trim()));
  ['#hA', '#hB'].forEach(k => $(k).addEventListener('input', ready));
  $('#hSwap').onclick = () => { const a = $('#hA').value; $('#hA').value = $('#hB').value; $('#hB').value = a; };
  $('#pairBar').addEventListener('submit', e => { e.preventDefault(); const a = $('#hA').value.trim(), b = $('#hB').value.trim(); if (!B58.test(a)) return $('#hA').focus(); if (!B58.test(b)) return $('#hB').focus(); coins.pulse(); loadLab(a, b); goTo('lab'); });

  /* ---------------- nav, reveal, headings that decode ---------------- */
  const goTo = id => { const el = document.getElementById(id); if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: reduce ? 'auto' : 'smooth' }); };
  document.addEventListener('click', e => { const a = e.target.closest('a[data-s],[data-go]'); if (!a) return; e.preventDefault(); goTo(a.dataset.s || a.dataset.go); });
  const nav = $('#nav'), links = $$('#links a'), ind = $('#ind');
  function spy() { nav.classList.toggle('scrolled', scrollY > 10); let cur = null; links.forEach(a => { const s = document.getElementById(a.dataset.s); if (s && s.getBoundingClientRect().top < innerHeight * .45) cur = a; }); links.forEach(x => x.classList.toggle('on', x === cur)); if (!cur) { ind.style.opacity = 0; return; } ind.style.opacity = 1; ind.style.width = cur.offsetWidth + 'px'; ind.style.transform = `translateX(${cur.offsetLeft - 4}px)`; }
  addEventListener('scroll', spy, { passive: true }); addEventListener('resize', spy); spy();
  const GL = '#$%&*+=-:<>/\\|01';
  function scramble(el) { const t = el.dataset.t || el.textContent; let f = 0; const n = 18; const tick = () => { el.textContent = [...t].map((c, i) => c === ' ' ? ' ' : i < f / n * t.length ? c : GL[(Math.random() * GL.length) | 0]).join(''); if (f++ < n) requestAnimationFrame(tick); else el.textContent = t; }; tick(); }
  const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; e.target.classList.add('vis'); if (e.target.classList.contains('scr')) scramble(e.target); io.unobserve(e.target); }), { rootMargin: '0px 0px -8% 0px' });
  $$('.panel, .findbar, .mlist, .twgrid, .rules2, .qa, .tabs.big').forEach(el => { el.classList.add('rv'); io.observe(el); });
  $$('.fig, .notes').forEach(el => io.observe(el));
  // a moving chain between sections: two coins, one link
  $$('.sec').forEach(sec => { const d = document.createElement('div'); d.className = 'chain'; d.setAttribute('aria-hidden', 'true'); const unit = '=o=o=<b>$</b>=o=o=<b>$</b>'; d.innerHTML = `<span>${unit.repeat(40)}${unit.repeat(40)}</span>`; sec.prepend(d); });
  $$('.scr').forEach(h => { h.addEventListener('mouseenter', () => scramble(h)); });
  // motion: scroll progress, hero parallax, tilt cards, magnetic buttons, staggered groups
  const prog = $('#progress'), stage = $('.stage');
  addEventListener('scroll', () => { const m = document.documentElement.scrollHeight - innerHeight; prog.style.transform = `scaleX(${m > 0 ? scrollY / m : 0})`; if (!reduce && scrollY < innerHeight) { stage.style.transform = `translateY(${scrollY * .28}px) scale(${1 - scrollY / innerHeight * .12})`; stage.style.opacity = String(1 - scrollY / innerHeight * .9); } }, { passive: true });
  if (!reduce && matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', e => {
      const t = e.target.closest('.tcard, .mrow, .rules2 > div, .node, .kpis > div'); if (t) { t.classList.add('tilt'); const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; t.style.transform = `perspective(700px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateY(-3px)`; }
      const m = e.target.closest('.btn.pri'); if (m) { m.classList.add('mag'); const r = m.getBoundingClientRect(); m.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .12}px, ${(e.clientY - r.top - r.height / 2) * .25}px)`; }
    }, { passive: true });
    document.addEventListener('pointerout', e => { const t = e.target.closest('.tilt, .mag'); if (t && !t.contains(e.relatedTarget)) t.style.transform = ''; }, { passive: true });
  }
  $$('.rules2, .qa, .side, .rules, .pipe').forEach(el => { el.classList.add('stag'); io.observe(el); });
  const tween = (el, to, fmt, ms = 900) => { const from = parseFloat(el.dataset.v || 0) || 0; el.dataset.v = to; const t0 = performance.now(); const f = now => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); };
  $$('input[type=range]').forEach(r => { const f = () => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); r.addEventListener('input', f); f(); });

  /* ---------------- wallet ---------------- */
  const PROV = {
    phantom: () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) ? window.phantom.solana : ((window.solana && window.solana.isPhantom) ? window.solana : null),
    solflare: () => (window.solflare && window.solflare.isSolflare) ? window.solflare : null,
    backpack: () => (window.backpack && window.backpack.isBackpack) ? window.backpack : null,
  };
  const mobile = /iphone|ipad|android/i.test(navigator.userAgent);
  function modal(html, onBuild) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(m);
    const close = () => { m.remove(); document.removeEventListener('keydown', k); }; const k = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', k);
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-x]')) close(); }); if (onBuild) onBuild(m, close); return close;
  }
  function walletModal(then) {
    const here = encodeURIComponent(location.href);
    modal(`<h3>Connect</h3><p>Sign in with one free signature. It is not a transaction and cannot move anything.</p><div class="wl">${['phantom', 'solflare', 'backpack'].map(k => `<button class="btn" type="button" data-pv="${k}"><span>${k[0].toUpperCase() + k.slice(1)}</span><small class="${PROV[k]() ? 'ok' : ''}">${PROV[k]() ? 'DETECTED' : mobile ? 'OPEN APP' : 'INSTALL'}</small></button>`).join('')}</div><p class="err" data-err></p>`, (m, close) => {
      m.addEventListener('click', async e => {
        const b = e.target.closest('[data-pv]'); if (!b) return; const k = b.dataset.pv, p = PROV[k]();
        if (!p) { if (k === 'phantom') return mobile ? location.href = `https://phantom.app/ul/browse/${here}?ref=${encodeURIComponent(location.origin)}` : open('https://phantom.com/download', '_blank', 'noopener'); if (k === 'solflare') return mobile ? location.href = `https://solflare.com/ul/v1/browse/${here}` : open('https://solflare.com/download', '_blank', 'noopener'); return open('https://backpack.app/download', '_blank', 'noopener'); }
        const err = $('[data-err]', m); err.textContent = ''; b.disabled = true; b.querySelector('small').textContent = 'CHECK WALLET';
        try { await connect(p); close(); if (then) setTimeout(then, 150); } catch (x) { err.textContent = /reject|cancel|denied|declin/i.test(x.message) ? 'Cancelled.' : x.message; b.disabled = false; b.querySelector('small').textContent = 'DETECTED'; }
      });
    });
  }
  const ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58(bytes) { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = ALPH[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b === 0) s = '1' + s; else break; } return s; }
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  async function connect(p) {
    const r = await p.connect(); const wallet = ((r && r.publicKey) || p.publicKey).toString();
    if (!S.tok || S.wallet !== wallet) {
      const n = await api('nonce?wallet=' + wallet), bytes = new TextEncoder().encode(n.message);
      const o = await p.signMessage(bytes, 'utf8'), sig = o.signature || o;
      const j = await api('login', { wallet, nonce: n.nonce, sig: b58(new Uint8Array(sig)), msg: b64(bytes) }); S.tok = j.token; store.set('tw:tok', S.tok);
    }
    S.wallet = wallet; S.prov = p; store.set('tw:w', wallet); renderMe(); toast('Connected ' + short(wallet)); loadTwins(); if (S.sheet) openTwin(S.sheet);
  }
  function renderMe() { const on = !!(S.wallet && S.tok); $('#wBtn').classList.toggle('on', on); $('#wLabel').textContent = on ? short(S.wallet) : 'Connect'; }
  $('#wBtn').onclick = () => S.wallet && S.tok ? modal(`<h3>${esc(short(S.wallet))}</h3><p>Signed in. Twins you create belong to this wallet.</p><div class="wl"><button class="btn" data-x type="button" data-out>Disconnect</button></div>`, (m, close) => { $('[data-out]', m).onclick = async () => { try { S.prov && S.prov.disconnect && await S.prov.disconnect(); } catch (e) { } S.wallet = S.tok = S.prov = null; store.set('tw:w', ''); store.set('tw:tok', ''); renderMe(); loadTwins(); close(); }; }) : walletModal();
  async function needWallet(then, tx) {
    if (S.tok && S.wallet) {
      if (!S.prov) { for (const k of ['phantom', 'solflare', 'backpack']) { const p = PROV[k](); if (p) { try { const r = await p.connect({ onlyIfTrusted: true }); const pk = ((r && r.publicKey) || p.publicKey); if (pk && pk.toString() === S.wallet) { S.prov = p; break; } } catch (e) { } } } }
      if (S.prov || !tx) return then();
    }
    walletModal(then);
  }
  const W3 = () => window.solanaWeb3;
  async function rpc(method, params) { return (await api('rpc', { method, params })).result; }
  async function signSend(tx) {
    if (S.prov.signAndSendTransaction) { const r = await S.prov.signAndSendTransaction(tx); return typeof r === 'string' ? r : r.signature; }
    const signed = await S.prov.signTransaction(tx); return rpc('sendTransaction', [b64(signed.serialize()), { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 5 }]);
  }
  async function confirmSig(sig, secs = 60) {
    for (let i = 0; i < secs / 1.5; i++) { await sleep(1500); try { const s = (await rpc('getSignatureStatuses', [[sig]])).value[0]; if (s) { if (s.err) throw new Error('The transaction failed on chain.'); if (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized') return true; } } catch (e) { if (/failed on chain/.test(e.message)) throw e; } }
    return false;
  }
  async function sendSol(to, sol) {
    const w = W3(), bh = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value.blockhash;
    const tx = new w.Transaction({ feePayer: new w.PublicKey(S.wallet), recentBlockhash: bh }).add(w.SystemProgram.transfer({ fromPubkey: new w.PublicKey(S.wallet), toPubkey: new w.PublicKey(to), lamports: Math.round(sol * 1e9) }));
    const sig = await signSend(tx); const ok = await confirmSig(sig); return { sig, ok };
  }
  const errMsg = e => /reject|cancel|denied|declin/i.test(e && e.message) ? 'Cancelled in the wallet.' : (e && e.message) || 'Something went wrong.';

  /* ---------------- charts (canvas, no libraries) ---------------- */
  function fit(c) { const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return { x, w: r.width, h: r.height }; }
  function spark(c, a, b, opt = {}) {
    if (!a || a.length < 2) { const { x, w, h } = fit(c); x.clearRect(0, 0, w, h); return; }
    if (!reduce && opt.anim !== false && !opt._k) { const t0 = performance.now(); const f = now => { const k = Math.min(1, (now - t0) / 800); spark(c, a, b, { ...opt, _k: k }); if (k < 1) requestAnimationFrame(f); }; return requestAnimationFrame(f); }
    const kk = opt._k == null ? 1 : 1 - Math.pow(1 - opt._k, 3), n = Math.max(2, Math.round(a.length * kk));
    const { x, w, h } = fit(c); x.clearRect(0, 0, w, h);
    const all = [...a, ...(b || [])], lo = Math.min(...all), hi = Math.max(...all), Y = v => h - 4 - (v - lo) / ((hi - lo) || 1) * (h - 8), X = i => i / (a.length - 1) * w;
    const line = (s, col, dash) => { x.beginPath(); s.slice(0, n).forEach((v, i) => i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))); x.strokeStyle = col; x.lineWidth = 1.6; x.setLineDash(dash ? [4, 3] : []); x.stroke(); };
    if (opt.zero != null) { x.strokeStyle = '#cfe9d8'; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(0, Y(opt.zero)); x.lineTo(w, Y(opt.zero)); x.stroke(); }
    line(a, GA); if (b) line(b, GB, true);
  }

  /* ---------------- live scan: pump.fun coins moving right now, rescanned every minute ---------------- */
  const SC = { tab: 'trending', list: [], sort: null, at: 0, next: 60, q: '' };
  const PK = { A: null, B: null };
  const pctc = v => v == null ? '<b class="num">—</b>' : `<b class="num ${v >= 0 ? 'up' : 'dn'}">${v >= 0 ? '+' : ''}${(+v).toFixed(1)}%</b>`;
  const bar = v => v == null ? '' : `<span class="bar ${v < 0 ? 'dn' : ''}">${'▮'.repeat(Math.max(1, Math.min(12, Math.round(Math.abs(v) / 1.5))))}</span>`;
  async function loadScan(quiet) {
    try {
      const r = await api('scan?tab=' + SC.tab), prev = new Map(SC.list.map(x => [x.mint, x]));
      SC.list = r.list; SC.at = r.at || Date.now(); SC.next = 60; renderScan(prev, quiet);
      if (quiet) { const n = r.list.filter(x => !prev.has(x.mint)).length; if (n) say(`${n} new coins on the scan`); }
    } catch (e) { if (!quiet) $('#scList').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  function renderScan(prev = new Map(), quiet) {
    let l = SC.list.slice(); const q = SC.q.toLowerCase(); if (q) l = l.filter(x => (x.symbol + ' ' + x.name + ' ' + x.mint).toLowerCase().includes(q));
    if (SC.sort) l.sort((a, b) => SC.sort === 'symbol' ? a.symbol.localeCompare(b.symbol) : (b[SC.sort] ?? -1e18) - (a[SC.sort] ?? -1e18));
    $('#scList').innerHTML = l.length ? l.map(x => {
      const p = prev.get(x.mint), isNew = quiet && !p, changed = p && (p.mc !== x.mc || p.ch5 !== x.ch5), thin = (x.liq || 0) < (S.cfg.minLiq || 3000);
      return `<div class="srow${isNew ? ' new' : ''}${changed ? ' tick' : ''}${thin ? ' thin' : ''}" data-mint="${esc(x.mint)}"><span class="nm">${av(x)}<span style="min-width:0"><b>$${esc(x.symbol)}</b><small>${esc(x.name)}${x.created ? ' · ' + ago(x.created) : ''}${x.bonded ? ' · bonded' : ''}</small></span></span><span><b class="num">${usd(x.mc)}</b></span><span class="c3">${pctc(x.ch5)}${bar(x.ch5)}</span><span class="c4">${pctc(x.ch1h)}</span><span class="c5">${usd(x.vol1h)}</span><span class="c6">${usd(x.liq)}</span><span class="c7">${(x.holders || 0).toLocaleString()}</span><span class="pk"><button type="button" data-pk="A" data-m="${esc(x.mint)}" class="${PK.A && PK.A.mint === x.mint ? 'on' : ''}" title="Pick as coin A">A</button><button type="button" data-pk="B" data-m="${esc(x.mint)}" class="${PK.B && PK.B.mint === x.mint ? 'on' : ''}" title="Pick as coin B">B</button></span></div>`;
    }).join('') : `<div class="empty">${q ? 'Nothing matches that filter.' : 'Nothing on this board right now. Try another tab.'}</div>`;
  }
  setInterval(() => {
    if (!SC.at) return; const s = Math.round((Date.now() - SC.at) / 1000); $('#scAge').textContent = 'scanned ' + (s < 3 ? 'just now' : s + 's ago');
    SC.next = Math.max(0, SC.next - 1); $('#scNext').textContent = SC.next; $('#scRing').style.strokeDashoffset = String(94.25 * (1 - SC.next / 60));
    if (SC.next === 0 && !document.hidden) { SC.next = 60; loadScan(true); }
  }, 1000);
  $('#scTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; SC.tab = b.dataset.tab; $$('#scTabs button').forEach(x => x.classList.toggle('on', x === b)); $('#scList').innerHTML = '<div class="empty">Scanning…</div>'; SC.list = []; loadScan(false); });
  $$('.shead2 [data-sort]').forEach(b => b.onclick = () => { SC.sort = SC.sort === b.dataset.sort ? null : b.dataset.sort; $$('.shead2 [data-sort]').forEach(x => x.classList.toggle('on', x.dataset.sort === SC.sort)); renderScan(); });
  $('#scQ').addEventListener('input', e => { SC.q = e.target.value.trim(); renderScan(); });
  // the pair tray: what you picked from the scan
  function renderTray() { document.body.classList.toggle('trayon', !!(PK.A || PK.B));
    const t = $('#tray'); t.hidden = !(PK.A || PK.B); t.classList.toggle('both', !!(PK.A && PK.B));
    for (const k of ['A', 'B']) { const el = $('#t' + k), c = PK[k]; el.classList.toggle('on', !!c); el.innerHTML = `<span class="tl2">${k}</span>` + (c ? `${av(c)}$${esc(c.symbol)}` : '<em>pick a coin</em>'); }
    $('#tSync').disabled = $('#tBind').disabled = !(PK.A && PK.B); $('#tFind').disabled = !PK.A;
    if (PK.A) $('#hA').value = PK.A.mint; if (PK.B) $('#hB').value = PK.B.mint; $('#pairBar').classList.toggle('ready', !!(PK.A && PK.B));
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pk]'); if (!b) return; const c = SC.list.find(x => x.mint === b.dataset.m); if (!c) return; const k = b.dataset.pk, o = k === 'A' ? 'B' : 'A';
    if (PK[o] && PK[o].mint === c.mint) PK[o] = null; PK[k] = PK[k] && PK[k].mint === c.mint ? null : c; renderTray(); renderScan();
    if (PK.A && PK.B) toast(`$${PK.A.symbol} × $${PK.B.symbol} ready. Twin them or bind them.`);
  });
  $('#tSync').onclick = () => { if (!(PK.A && PK.B)) return; coins.pulse(); loadLab(PK.A.mint, PK.B.mint); goTo('lab'); };
  $('#tBind').onclick = () => { if (!(PK.A && PK.B)) return; $('#bA').value = PK.A.mint; $('#bB').value = PK.B.mint; pick('A'); pick('B'); step(1); goTo('bind'); };
  $('#tFind').onclick = () => { if (!PK.A) return; $('#fA').value = PK.A.mint; goTo('find'); $('#findForm').requestSubmit(); };
  $('#tClear').onclick = () => { PK.A = PK.B = null; renderTray(); renderScan(); };

  /* ---------------- the sync lab ---------------- */
  const L = { rows: null, a: null, b: null, tf: '5m', pos: 1, playing: false };
  const ctl = { band: $('#sBand'), buy: $('#sBuy'), trim: $('#sTrim'), cool: $('#sCool') };
  function setCtl(k, v) { const r = ctl[k]; r.value = v; r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); }
  const settingsFromLab = () => ({ band: +ctl.band.value, buy: +ctl.buy.value, trim: +ctl.trim.value, cooldown: +ctl.cool.value });
  // the same rules the engine runs, replayed over real candles (cash in USD, no fees beyond a 0.5% swap cost)
  function replay(rows, s) {
    if (!rows || rows.length < 3) return null;
    const a0 = rows[0][1], b0 = rows[0][2], band = s.band / 100, cool = (s.cooldown || 1) * 60, fee = .005;
    let cash = 100, qa = 0, qb = 0, ladder = 0, lastT = -1e12; const trades = [];
    for (const [t, pa, pb] of rows) {
      const sp = Math.log((pa / a0) / (pb / b0)), level = Math.floor(Math.abs(sp) / band);
      if (level === 0) ladder = 0;
      else if (level > ladder && t - lastT >= cool) {
        const aLeads = sp > 0;
        if (s.trim > 0) { if (aLeads && qa > 0) { const q = qa * s.trim / 100; qa -= q; cash += q * pa * (1 - fee); trades.push({ t, side: 'sell', coin: 'a' }); } if (!aLeads && qb > 0) { const q = qb * s.trim / 100; qb -= q; cash += q * pb * (1 - fee); trades.push({ t, side: 'sell', coin: 'b' }); } }
        const spend = cash * s.buy / 100; if (spend > .01) { cash -= spend; if (aLeads) qb += spend * (1 - fee) / pb; else qa += spend * (1 - fee) / pa; trades.push({ t, side: 'buy', coin: aLeads ? 'b' : 'a' }); }
        ladder = level; lastT = t;
      } else if (level < ladder - 1) ladder = level + 1;
    }
    const last = rows[rows.length - 1], value = cash + qa * last[1] + qb * last[2], hold = 50 * last[1] / a0 + 50 * last[2] / b0;
    return { trades, value: value - 100, hold: hold - 100 };
  }
  const corrOf = rows => { const ra = [], rb = []; for (let i = 1; i < rows.length; i++) { ra.push(Math.log(rows[i][1] / rows[i - 1][1])); rb.push(Math.log(rows[i][2] / rows[i - 1][2])); } const n = ra.length; if (n < 8) return null; const ma = ra.reduce((a, b) => a + b, 0) / n, mb = rb.reduce((a, b) => a + b, 0) / n; let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { const x = ra[i] - ma, y = rb[i] - mb; ab += x * y; aa += x * x; bb += y * y; } return aa && bb ? ab / Math.sqrt(aa * bb) : null; };
  function drawGauge(v) {
    const c = $('#gauge'), { x, w, h } = fit(c); x.clearRect(0, 0, w, h); const cx = w / 2, cy = h - 34, r = Math.min(w / 2 - 14, h - 44), n = 34;
    const p = v == null ? 0 : Math.max(0, Math.min(1, v));
    for (let i = 0; i < n; i++) { const a = Math.PI + i / (n - 1) * Math.PI, on = i / (n - 1) <= p; x.font = '800 12px J, monospace'; x.fillStyle = on ? (i / (n - 1) > .66 ? '#22c55e' : i / (n - 1) > .33 ? '#4ade80' : '#86efac') : '#d9efe1'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(on ? '#' : ':', cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  }
  function drawLab() {
    const rows = L.rows; if (!rows) return;
    const s = settingsFromLab(), rep = replay(rows, s), upto = Math.max(2, Math.round(Math.min(L.pos, L.anim == null ? 1 : L.anim) * (rows.length - 1)));
    const vis = rows.slice(0, upto + 1), a0 = rows[0][1], b0 = rows[0][2];
    const na = rows.map(r => r[1] / a0 * 100), nb = rows.map(r => r[2] / b0 * 100), sp = rows.map(r => Math.log((r[1] / a0) / (r[2] / b0)) * 100);
    const t0 = rows[0][0], t1 = rows[rows.length - 1][0];
    // the price panel
    { const { x, w, h } = fit($('#cPrice')); x.clearRect(0, 0, w, h); const lo = Math.min(...na, ...nb), hi = Math.max(...na, ...nb), pad = 18;
      const X = t => 10 + (t - t0) / ((t1 - t0) || 1) * (w - 60), Y = v => pad + (hi - v) / ((hi - lo) || 1) * (h - pad * 2);
      x.font = '500 10.5px J, monospace'; x.fillStyle = '#97aa9e'; x.textAlign = 'right';
      for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v); x.strokeStyle = '#eef6f0'; x.beginPath(); x.moveTo(0, y); x.lineTo(w - 46, y); x.stroke(); x.fillText(v.toFixed(0), w - 6, y + 3); }
      const ln = (arr, col, dash) => { x.beginPath(); vis.forEach((r, i) => { const px = X(r[0]), py = Y(arr[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.strokeStyle = col; x.lineWidth = 2; x.setLineDash(dash ? [6, 4] : []); x.stroke(); x.setLineDash([]); };
      // the gap between them, filled
      x.beginPath(); vis.forEach((r, i) => { const px = X(r[0]); i ? x.lineTo(px, Y(na[i])) : x.moveTo(px, Y(na[i])); }); for (let i = vis.length - 1; i >= 0; i--) x.lineTo(X(vis[i][0]), Y(nb[i])); x.closePath(); x.fillStyle = 'rgba(134,239,172,.18)'; x.fill();
      ln(nb, GB, true); ln(na, GA, false);
      if (rep) for (const tr of rep.trades) { if (tr.t > vis[vis.length - 1][0]) break; const i = rows.findIndex(r => r[0] === tr.t), v = tr.coin === 'a' ? na[i] : nb[i], px = X(tr.t), py = Y(v); x.fillStyle = tr.side === 'buy' ? '#22c55e' : '#18181b'; x.beginPath(); if (tr.side === 'buy') { x.moveTo(px, py + 9); x.lineTo(px - 6, py + 18); x.lineTo(px + 6, py + 18); } else { x.moveTo(px, py - 9); x.lineTo(px - 6, py - 18); x.lineTo(px + 6, py - 18); } x.fill(); }
      const le = vis.length - 1; x.fillStyle = GA; x.beginPath(); x.arc(X(vis[le][0]), Y(na[le]), 4, 0, 6.3); x.fill(); x.fillStyle = GB; x.beginPath(); x.arc(X(vis[le][0]), Y(nb[le]), 4, 0, 6.3); x.fill();
      L.X = X; L.Yp = Y; }
    // the spread panel, with the band you can drag
    { const { x, w, h } = fit($('#cSpread')); x.clearRect(0, 0, w, h); const m = Math.max(s.band * 2.4, ...sp.map(Math.abs)) * 1.1;
      const X = t => 10 + (t - t0) / ((t1 - t0) || 1) * (w - 60), Y = v => h / 2 - v / m * (h / 2 - 12);
      for (let k = -3; k <= 3; k++) { if (!k) continue; const y = Y(k * s.band); if (y < 0 || y > h) continue; x.strokeStyle = Math.abs(k) === 1 ? '#4ade80' : '#cfe9d8'; x.setLineDash(Math.abs(k) === 1 ? [] : [3, 4]); x.lineWidth = Math.abs(k) === 1 ? 1.5 : 1; x.beginPath(); x.moveTo(0, y); x.lineTo(w - 46, y); x.stroke(); }
      x.setLineDash([]); x.fillStyle = 'rgba(134,239,172,.16)'; x.fillRect(0, Y(s.band), w - 46, Y(-s.band) - Y(s.band));
      x.strokeStyle = '#cfe9d8'; x.beginPath(); x.moveTo(0, Y(0)); x.lineTo(w - 46, Y(0)); x.stroke();
      x.beginPath(); vis.forEach((r, i) => { const px = X(r[0]), py = Y(sp[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.strokeStyle = '#18181b'; x.lineWidth = 1.6; x.stroke();
      x.font = '700 10.5px J, monospace'; x.fillStyle = '#22c55e'; x.textAlign = 'right'; x.fillText('+' + s.band + '%', w - 6, Y(s.band) + 4); x.fillText('−' + s.band + '%', w - 6, Y(-s.band) + 4);
      x.fillStyle = '#97aa9e'; x.textAlign = 'left'; x.fillText('GAP · drag the band', 10, 14);
      L.Ys = Y; L.ms = m; }
    // numbers
    if (rep && L.lastRep !== rep.trades.length + ':' + rep.value.toFixed(2)) {
      L.lastRep = rep.trades.length + ':' + rep.value.toFixed(2);
      tween($('#rTrades'), rep.trades.length, v => Math.round(v), 500);
      const rv = $('#rValue'); tween(rv, rep.value, sgn, 500); rv.className = rep.value >= 0 ? 'up' : 'dn';
      const rh = $('#rHold'); tween(rh, rep.hold, sgn, 500); rh.className = rep.hold >= 0 ? 'up' : 'dn';
    }
    $('#scrubT').textContent = new Date(vis[vis.length - 1][0] * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    $('#vBand').textContent = s.band + '%'; $('#vBuy').textContent = s.buy + '%'; $('#vTrim').textContent = s.trim + '%'; $('#vCool').textContent = s.cooldown + 'm';
  }
  async function loadLab(a, b, tf) {
    if (tf) L.tf = tf; $('#labEmpty').hidden = false; $('#labEmpty').innerHTML = 'Reading both charts…';
    try {
      const r = await api(`sync?a=${a}&b=${b}&tf=${L.tf}`); L.rows = r.rows; L.a = r.a; L.b = r.b; L.pos = 1; $('#scrub').value = 1000;
      $('#labChips').innerHTML = `<span class="chip">${av(r.a)}<i style="background:${GA}"></i>$${esc(r.a.symbol)}</span><span class="chip">${av(r.b)}<i style="background:${GB}"></i>$${esc(r.b.symbol)}</span><button class="link" type="button" id="labSwap" title="Swap">⇄</button>`;
      $('#labSwap').onclick = () => loadLab(L.b.mint, L.a.mint);
      const c = r.corr, target = c == null ? 0 : Math.max(0, c);
      if (c == null) $('#syncPct').textContent = '—'; else tween($('#syncPct'), Math.round(target * 100), v => Math.round(v) + '%', 1100);
      { const g0 = L.g || 0, t0 = performance.now(); const f = now => { const k = Math.min(1, (now - t0) / 1100), e = 1 - Math.pow(1 - k, 3); drawGauge(g0 + (target - g0) * e); if (k < 1) requestAnimationFrame(f); else L.g = target; }; requestAnimationFrame(f); }
      $('#labEmpty').hidden = true; $('#labBind').disabled = false; say(`Sync ${Math.round(target * 100)}%`);
      L.anim = reduce ? 1 : 0; { const t0 = performance.now(); const f = now => { L.anim = Math.min(1, (now - t0) / 1300); drawLab(); if (L.anim < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }
      $('#hA').value = a; $('#hB').value = b; store.set('tw:lab', a + '|' + b);
    } catch (e) { $('#labEmpty').innerHTML = `<span><b>Couldn't read these two.</b><br>${esc(e.message)}</span>`; }
  }
  Object.values(ctl).forEach(r => r.addEventListener('input', drawLab));
  $('#tfTabs').addEventListener('click', e => { const b = e.target.closest('[data-tf]'); if (!b) return; $$('#tfTabs button').forEach(x => x.classList.toggle('on', x === b)); if (L.a) loadLab(L.a.mint, L.b.mint, b.dataset.tf); else L.tf = b.dataset.tf; });
  $('#scrub').addEventListener('input', e => { L.pos = e.target.value / 1000; L.playing = false; $('#play').textContent = '▶'; drawLab(); });
  $('#play').onclick = async () => { if (!L.rows) return; L.playing = !L.playing; $('#play').textContent = L.playing ? '❚❚' : '▶'; if (L.pos >= 1) L.pos = 0; while (L.playing && L.pos < 1) { L.pos = Math.min(1, L.pos + .006); $('#scrub').value = L.pos * 1000; drawLab(); await sleep(16); } L.playing = false; $('#play').textContent = '▶'; };
  // drag the band on the gap chart
  (() => { const c = $('#cSpread'); let d = false; const set = e => { if (!L.rows || !L.Ys) return; const r = c.getBoundingClientRect(), y = e.clientY - r.top, h = r.height, v = Math.abs((h / 2 - y) / (h / 2 - 12) * L.ms); setCtl('band', Math.max(2, Math.min(40, Math.round(v)))); drawLab(); };
    c.addEventListener('pointerdown', e => { d = true; c.setPointerCapture(e.pointerId); set(e); }); c.addEventListener('pointermove', e => { if (d) set(e); }); c.addEventListener('pointerup', () => { d = false; }); })();
  // crosshair on the price chart
  (() => { const c = $('#cPrice'), xh = $('#xh'); c.addEventListener('pointermove', e => { if (!L.rows || !L.X) return; const r = c.getBoundingClientRect(), px = e.clientX - r.left; let best = 0, bd = 1e9; L.rows.forEach((row, i) => { const d = Math.abs(L.X(row[0]) - px); if (d < bd) { bd = d; best = i; } }); const row = L.rows[best], a0 = L.rows[0][1], b0 = L.rows[0][2]; xh.hidden = false; xh.style.left = (L.X(row[0])) + 'px'; xh.style.top = (e.clientY - r.top) + 'px'; xh.innerHTML = `${new Date(row[0] * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · $${esc(L.a.symbol)} ${sgn((row[1] / a0 - 1) * 100)} · $${esc(L.b.symbol)} ${sgn((row[2] / b0 - 1) * 100)}`; }); c.addEventListener('pointerleave', () => { xh.hidden = true; }); })();
  $('#labDemo').onclick = async () => { $('#labEmpty').innerHTML = 'Finding two trending coins that move alike…'; try { const d = await api('demo'); loadLab(d.a, d.b); } catch (e) { $('#labEmpty').innerHTML = esc(e.message); } };
  $('#labBind').onclick = () => { if (!L.a) return; $('#bA').value = L.a.mint; $('#bB').value = L.b.mint; const s = settingsFromLab(); setRule('band', s.band); setRule('buy', s.buy); setRule('trim', s.trim); setRule('cool', s.cooldown); pick('A'); pick('B'); step(1); goTo('bind'); };
  addEventListener('resize', () => { clearTimeout(drawLab.t); drawLab.t = setTimeout(drawLab, 120); });

  /* ---------------- find a twin ---------------- */
  $('#findForm').addEventListener('submit', async e => {
    e.preventDefault(); const a = $('#fA').value.trim(); if (!B58.test(a)) return $('#fA').focus();
    const box = $('#mList'); box.innerHTML = `<div class="empty" style="grid-column:1/-1">Comparing it with what's trending, candle by candle…</div>`;
    try {
      const r = await api('match?a=' + a);
      if (!r.list.length) { box.innerHTML = `<div class="empty" style="grid-column:1/-1">Nothing trending has enough shared history with $${esc(r.a.symbol)} yet.</div>`; return; }
      box.innerHTML = r.list.map((m, i) => `<button type="button" class="mrow" style="--i:${i}" data-pair="${esc(a)}|${esc(m.mint)}">${av(m)}<span style="min-width:0"><b>$${esc(m.symbol)}</b><span>${esc(m.name)} · ${usd(m.mc)}</span></span><span class="pct ${m.corr >= .5 ? 'up' : ''}">${Math.round(Math.max(0, m.corr) * 100)}%</span><canvas></canvas></button>`).join('');
      $$('.mrow canvas', box).forEach((c, i) => { const sp = r.list[i].spark || [], a0 = sp[0] && sp[0][0], b0 = sp[0] && sp[0][1]; spark(c, sp.map(x => x[0] / a0), sp.map(x => x[1] / b0)); });
    } catch (x) { box.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(x.message)}</div>`; }
  });
  document.addEventListener('click', e => { const b = e.target.closest('[data-pair]'); if (!b) return; const [a, c] = b.dataset.pair.split('|'); loadLab(a, c); goTo('lab'); });

  /* ---------------- bind: three steps ---------------- */
  const P = { A: null, B: null };
  function step(k) { $$('#steps li').forEach(li => { const n = +li.dataset.k; li.classList.toggle('on', n === k); li.classList.toggle('done', n < k); }); $$('.stepv').forEach(v => v.classList.toggle('on', +v.dataset.k === k)); if (k === 2) preview(); if (k === 3) facts(); }
  $$('[data-back]').forEach(b => b.onclick = () => step(+b.dataset.back));
  async function pick(k) {
    const inp = $('#b' + k), card = $('#pc' + k), ca = inp.value.trim(); P[k] = null; checkPick();
    if (!ca) { card.innerHTML = ''; return; } if (!B58.test(ca)) { card.innerHTML = 'That is not a Solana address.'; return; }
    card.innerHTML = 'Reading the chain…';
    try { const c = await api('coin?ca=' + ca); if (inp.value.trim() !== ca) return; P[k] = c; card.innerHTML = `${av(c)}<div><b>$${esc(c.symbol)}</b>${esc(c.name)} · mc ${usd(c.mc)} · liquidity ${usd(c.liq)}</div>`; }
    catch (e) { if (inp.value.trim() === ca) card.innerHTML = esc(e.message); }
    checkPick();
  }
  function checkPick() { const ok = P.A && P.B && P.A.mint !== P.B.mint; $('#to2').disabled = !ok; $('#e1').textContent = P.A && P.B && P.A.mint === P.B.mint ? 'Pick two different coins.' : ''; bondOn = !!ok; }
  let pT = {}; ['A', 'B'].forEach(k => $('#b' + k).addEventListener('input', () => { clearTimeout(pT[k]); pT[k] = setTimeout(() => pick(k), 380); }));
  $('#to2').onclick = () => step(2); $('#to3').onclick = () => step(3);
  let bondOn = false; (() => { const c = $('#bondC'), x = c.getContext('2d'); const draw = t => { requestAnimationFrame(draw); x.clearRect(0, 0, 120, 60); x.font = '800 12px J, monospace'; x.textBaseline = 'middle'; for (let i = 0; i < 14; i++) { const ph = (i / 14 + t / 1400) % 1, on = bondOn; x.fillStyle = on ? `rgba(34,197,94,${.35 + .65 * Math.abs(Math.sin(ph * Math.PI))})` : '#cfe9d8'; x.fillText(on ? '=' : '·', 6 + i * 8, 30 + (on ? 0 : Math.sin(ph * 6.28) * 6)); } }; requestAnimationFrame(draw); })();
  const RULE = { band: ['#rBand', '#wBand', v => v + '%', 'band'], buy: ['#rBuy', '#wBuy', v => v + '%', 'buy'], trim: ['#rTrim', '#wTrim', v => v + '%', 'trim'], cool: ['#rCool', '#wCool', v => v + 'm', 'cooldown'], max: ['#rMax', '#wMax', v => (+v).toFixed(2) + ' SOL', 'maxTrade'], imp: ['#rImp', '#wImp', v => v + '%', 'impact'] };
  function setRule(k, v) { const [r, w, f] = RULE[k], el = $(r); el.value = v; el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); $(w).textContent = f(el.value); }
  const rules = () => { const o = {}; for (const k in RULE) o[RULE[k][3]] = +$(RULE[k][0]).value; return o; };
  for (const k in RULE) $(RULE[k][0]).addEventListener('input', () => { setRule(k, $(RULE[k][0]).value); preview(); });
  let prevRows = null, prevKey = '';
  async function preview() {
    const box = $('#rPrev'); if (!P.A || !P.B) return; const key = P.A.mint + P.B.mint, s = rules();
    if (prevKey !== key) { box.innerHTML = 'Replaying your rules on the last day of real candles…'; try { const r = L.a && L.a.mint === P.A.mint && L.b.mint === P.B.mint && L.tf === '5m' ? { rows: L.rows } : await api(`sync?a=${P.A.mint}&b=${P.B.mint}&tf=5m`); prevRows = r.rows; prevKey = key; } catch (e) { box.textContent = 'No replay: ' + e.message; return; } }
    const rep = replay(prevRows, s); if (!rep) return;
    box.innerHTML = `With these rules over the last day, the maker would have made <b>${rep.trades.length}</b> trades and ended <b class="${rep.value >= 0 ? 'up' : 'dn'}">${sgn(rep.value)}</b> against plain SOL (a 50/50 hold did <b class="${rep.hold >= 0 ? 'up' : 'dn'}">${sgn(rep.hold)}</b>). A replay, not a promise.`;
  }
  function facts() {
    const a = +$('#fAmt').value || 0;
    $('#facts').innerHTML = [`A fresh public wallet is created for $${esc(P.A ? P.A.symbol : 'A')} × $${esc(P.B ? P.B.symbol : 'B')}.`, `You send it ${a.toFixed(2)} SOL from your wallet. Add more any time.`, `It keeps ${S.cfg.reserve} SOL for fees and works with at most ${S.cfg.maxSol} SOL.`, `Withdraw sells both coins and sends every lamport back to ${S.wallet ? short(S.wallet) : 'your wallet'}. Only your wallet.`, `It can lose money. Fund it with SOL you can lose.`].map(t => `<li>${t}</li>`).join('');
  }
  $('#fAmt').addEventListener('input', facts);
  $$('[data-amt]').forEach(b => b.onclick = () => { $('#fAmt').value = b.dataset.amt; facts(); });
  $('#goBind').onclick = () => needWallet(async () => {
    const btn = $('#goBind'), out = $('#bindOut'), err = $('#e3'), amt_ = +$('#fAmt').value; err.textContent = '';
    if (!(amt_ >= S.cfg.minFund)) return err.textContent = `Fund it with at least ${S.cfg.minFund} SOL.`;
    if (!P.A || !P.B) return step(1);
    btn.disabled = true;
    try {
      btn.textContent = 'Creating the maker…'; const c = await api('create', { a: P.A.mint, b: P.B.mint, settings: rules() });
      out.innerHTML = `<div class="done-card"><b>Maker wallet created</b><div class="addr"><span>${esc(c.treasury)}</span><button class="btn sm" type="button" data-copy="${esc(c.treasury)}">Copy</button></div><span id="bStat">Sending ${amt_} SOL…</span></div>`;
      btn.textContent = 'Check your wallet'; const r = await sendSol(c.treasury, amt_);
      $('#bStat').textContent = r.ok ? 'Funded. Starting the engine…' : 'Sent. Waiting for the network…';
      let live = null; for (let i = 0; i < 12 && !live; i++) { try { live = await api('funded', { id: c.id }); } catch (e) { if (e.status !== 409) throw e; await sleep(2500); } }
      if (!live) throw new Error('The deposit has not landed yet. Open the twin in a minute and press start.');
      coins.pulse(); toast(`Twin #${c.id} is live.`, 4000);
      $('#bStat').innerHTML = `Live. <a class="ul" href="https://solscan.io/tx/${esc(r.sig)}" target="_blank" rel="noopener">deposit ↗</a> · <button type="button" class="ul" data-twin="${c.id}">open twin #${c.id}</button>`;
      loadTwins(); loadStats();
    } catch (e) { err.textContent = errMsg(e); }
    btn.disabled = false; btn.textContent = 'Create the maker and fund it';
  }, true);
  document.addEventListener('click', async e => { const c = e.target.closest('[data-copy]'); if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Copied'); } catch (x) { } } });

  /* ---------------- the twins board ---------------- */
  let twView = 'live';
  async function loadTwins() {
    const box = $('#twGrid');
    if (twView === 'mine' && !S.wallet) { box.innerHTML = `<div class="empty" style="grid-column:1/-1">Connect to see your twins.</div>`; return; }
    try {
      const r = await api(twView === 'mine' ? 'twins?owner=' + S.wallet : 'twins'); S.twins = r.twins;
      box.innerHTML = r.twins.length ? r.twins.map((t, i) => { const l = t.last || {}; return `<button type="button" class="tcard" style="--i:${i}" data-twin="${t.id}"><div class="tpair">${av(t.a)}$${esc(t.a.symbol)}<span class="x">×</span>$${esc(t.b.symbol)}${av(t.b)}</div><canvas></canvas><div class="tmeta"><span>gap <b>${l.spread != null ? sgn(l.spread * 100) : '—'}</b></span><span>value <b>${usd(l.value)}</b></span><span>${t.trades} trades</span><span class="st ${t.paused ? 'paused' : t.status === 'live' ? 'live' : ''}">${t.paused ? 'PAUSED' : t.status.toUpperCase()}</span></div></button>`; }).join('')
        : `<div class="empty" style="grid-column:1/-1"><span class="ascii-empty">${esc(' .-----.     .-----.\n( $  A  )===( $  B  )\n `-----\'     `-----\'')}</span>${twView === 'mine' ? 'You have no twins yet. Bind your first above.' : 'No twins running yet. Be the first to bind two coins.'}</div>`;
      $$('.tcard canvas', box).forEach((c, i) => { const s = r.twins[i].spark || []; spark(c, s.map(v => v * 100), null, { zero: 0 }); });
    } catch (e) { box.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(e.message)}</div>`; }
  }
  $('#twTabs').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; twView = b.dataset.v; $$('#twTabs button').forEach(x => x.classList.toggle('on', x === b)); loadTwins(); });
  document.addEventListener('click', e => { const b = e.target.closest('[data-twin]'); if (b) openTwin(+b.dataset.twin); });

  /* ---------------- one twin: the sheet ---------------- */
  const sheet = $('#sheet'), sPanel = $('#sPanel');
  function closeSheet() { sheet.classList.remove('on'); sheet.setAttribute('aria-hidden', 'true'); S.sheet = null; if (/^#t=/.test(location.hash)) history.replaceState(null, '', location.pathname); }
  sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('on') && !$('.modal')) closeSheet(); });
  async function openTwin(id) {
    S.sheet = id; try { history.replaceState(null, '', '#t=' + id); } catch (e) { }
    if (!sheet.classList.contains('on')) { sPanel.innerHTML = '<div class="empty">Opening the twin…</div>'; sheet.classList.add('on'); sheet.setAttribute('aria-hidden', 'false'); }
    try {
      const r = await api('twin?id=' + id), t = r.twin, l = t.last || {}, live = r.live || {}; if (S.sheet !== id) return;
      const owner = S.wallet && S.wallet === t.ownerFull, s = t.settings;
      sPanel.innerHTML = `<div class="stop"><span class="mono" style="color:var(--mu);font-size:12px">TWIN #${t.id} · owner ${esc(t.owner)}</span><button class="x" type="button" data-close aria-label="Close">×</button></div>
        <div class="shead">${av(t.a)}<h3>$${esc(t.a.symbol)} × $${esc(t.b.symbol)}</h3>${av(t.b)}<span class="st ${t.paused ? 'paused' : t.status === 'live' ? 'live' : ''}">${t.paused ? 'PAUSED' : t.status.toUpperCase()}</span></div>
        <div class="addr"><span>maker ${esc(t.treasury)}</span><button class="btn sm" type="button" data-copy="${esc(t.treasury)}">Copy</button><a class="btn sm" href="https://solscan.io/account/${esc(t.treasury)}" target="_blank" rel="noopener">Solscan</a></div>
        <div class="kpis"><div><b>${usd(l.value)}</b><span>maker value</span></div><div><b>${(live.sol ?? l.sol ?? 0).toFixed(3)}</b><span>SOL</span></div><div><b>${amt(live.a ?? l.a)} / ${amt(live.b ?? l.b)}</b><span>$${esc(t.a.symbol)} / $${esc(t.b.symbol)}</span></div><div><b>${l.spread != null ? sgn(l.spread * 100) : '—'}</b><span>gap now · band ${s.band}%</span></div></div>
        <div class="sc"><canvas id="tcP"></canvas></div><div class="sc" style="height:120px"><canvas id="tcS"></canvas></div>
        <p class="mono" style="font-size:11.5px;color:var(--mu)">${t.status === 'live' ? `last pass ${ago(t.lastPass)} · next ${t.next && new Date(t.next) > new Date() ? 'in ' + Math.max(0, Math.round((new Date(t.next) - Date.now()) / 1000)) + 's' : 'now'}` : t.status === 'pending' ? 'waiting for its first deposit' : t.status === 'closing' ? 'closing: selling both coins, then sending SOL home' : 'closed'}</p>
        ${owner ? ownerPanel(t) : ''}
        <div class="ssec"><h4>TRADES · ${r.trades.length}</h4><div class="tlog">${r.trades.length ? r.trades.map(x => `<a href="https://solscan.io/tx/${esc(x.sig)}" target="_blank" rel="noopener"><span class="side ${x.side === 'buy' ? 'up' : ''}">${x.side.toUpperCase()}</span><span class="reason">${amt(x.tokens)} $${esc(x.mint === t.a.mint ? t.a.symbol : t.b.symbol)} for ${(+x.sol).toFixed(4)} SOL · ${esc(x.reason)}</span><span>${esc(x.status)}</span><span>${ago(x.at)} ↗</span></a>`).join('') : '<div><span></span><span class="reason">No trades yet. The maker waits for the gap to pass the band.</span><span></span><span></span></div>'}</div></div>
        <div class="ssec"><h4>LOG</h4><div class="tlog">${r.events.map(x => `<div><span class="side">${esc(x.kind.toUpperCase())}</span><span class="reason" title="${esc(x.note)}">${esc(x.note)}</span><span></span><span>${ago(x.at)}</span></div>`).join('')}</div></div>`;
      const sm = r.samples; if (sm.length > 1) { const a0 = t.anchors[0] || sm[0].pa, b0 = t.anchors[1] || sm[0].pb; spark($('#tcP'), sm.map(x => x.pa / a0 * 100), sm.map(x => x.pb / b0 * 100)); spark($('#tcS'), sm.map(x => x.spread * 100), null, { zero: 0 }); }
      if (owner) wireOwner(t);
    } catch (e) { if (S.sheet === id) sPanel.innerHTML = `<div class="stop"><span></span><button class="x" type="button" data-close>×</button></div><div class="empty">${esc(e.message)}</div>`; }
  }
  function ownerPanel(t) {
    const s = t.settings, sl = (k, lab, min, max, st, v, f) => `<div class="ctl"><label>${lab} <b data-ov="${k}">${f(v)}</b></label><input type="range" data-ok="${k}" min="${min}" max="${max}" step="${st}" value="${v}"></div>`;
    return `<div class="ssec"><h4>YOUR CONTROLS</h4><div class="own">${sl('band', 'band', 2, 40, 1, s.band, v => v + '%')}${sl('buy', 'buy laggard', 5, 60, 1, s.buy, v => v + '%')}${sl('trim', 'trim leader', 0, 100, 5, s.trim, v => v + '%')}${sl('cooldown', 'cooldown', 1, 120, 1, s.cooldown, v => v + 'm')}${sl('maxTrade', 'max per trade', .01, 5, .01, s.maxTrade, v => (+v).toFixed(2) + ' SOL')}${sl('impact', 'max impact', .5, 10, .5, s.impact, v => v + '%')}</div>
      <div class="oact">${t.status !== 'closed' && t.status !== 'closing' ? `<button class="btn sm pri" type="button" data-oa="save">Save rules</button>${t.status === 'pending' ? `<button class="btn sm" type="button" data-oa="start">Start</button>` : `<button class="btn sm" type="button" data-oa="pause">${t.paused ? 'Resume' : 'Pause'}</button><button class="btn sm" type="button" data-oa="anchor">Reset sync point</button>`}<input class="btn sm" style="width:90px" type="number" min="0.01" step="0.01" value="0.1" data-oamt><button class="btn sm" type="button" data-oa="add">Add SOL</button><button class="btn sm" type="button" data-oa="withdraw" style="border-color:#f3b49a">Withdraw everything</button>` : ''}</div><p class="err" data-oerr></p></div>`;
  }
  function wireOwner(t) {
    $$('[data-ok]', sPanel).forEach(r => { const f = () => { r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); const k = r.dataset.ok, v = r.value; $(`[data-ov="${k}"]`, sPanel).textContent = k === 'maxTrade' ? (+v).toFixed(2) + ' SOL' : k === 'cooldown' ? v + 'm' : v + '%'; }; r.addEventListener('input', f); f(); });
    const err = $('[data-oerr]', sPanel);
    sPanel.onclick = async e => {
      const b = e.target.closest('[data-oa]'); if (!b) return; const a = b.dataset.oa; err.textContent = ''; b.disabled = true;
      try {
        if (a === 'save') { const s = {}; $$('[data-ok]', sPanel).forEach(r => s[r.dataset.ok] = +r.value); await api('settings', { id: t.id, settings: s }); toast('Rules saved'); }
        if (a === 'pause') { await api('pause', { id: t.id, paused: !t.paused }); toast(t.paused ? 'Resumed' : 'Paused'); }
        if (a === 'anchor') { await api('reanchor', { id: t.id }); toast('Sync point reset to today\'s prices'); }
        if (a === 'start') { await api('funded', { id: t.id }); toast('Live'); }
        if (a === 'add') { const v = +$('[data-oamt]', sPanel).value; if (!(v > 0)) throw new Error('Enter an amount.'); await new Promise((res, rej) => needWallet(async () => { try { const r = await sendSol(t.treasury, v); toast(r.ok ? `Added ${v} SOL` : 'Sent. Waiting for the network.'); res(); } catch (x) { rej(x); } }, true)); }
        if (a === 'withdraw') { if (!confirm('Sell both coins and send every lamport back to your wallet?')) { b.disabled = false; return; } await api('withdraw', { id: t.id }); toast('Withdrawing: selling both coins, then sending SOL home', 4000); }
        openTwin(t.id); loadTwins();
      } catch (x) { err.textContent = errMsg(x); }
      b.disabled = false;
    };
  }

  /* ---------------- engine: stats, the live tape, the pass animation ---------------- */
  async function loadStats() {
    try {
      const s = await api('stats'); S.stats = s;
      const items = s.feed.length ? s.feed.map(f => `<span><b class="${f.side === 'buy' ? 'buy' : ''}">${f.side.toUpperCase()}</b> $${esc(f.sym)} · ${(+f.sol).toFixed(3)} SOL · twin #${f.id} ($${esc(f.a)} × $${esc(f.b)}) · ${ago(f.at)}</span>`) : [`<span><b>${s.live}</b> twins live</span>`, `<span><b>${s.trades}</b> trades so far</span>`, `<span>engine passes every few minutes</span>`];
      const html = items.join(''); $('#tapeIn').innerHTML = html + html; $('#tape').hidden = false;
      $('#pipeAscii').textContent = asciiStats(s);
    } catch (e) { }
  }
  function asciiStats(s) {
    const box = (k, v) => { const w = Math.max(k.length, String(v).length) + 4; return ['+' + '-'.repeat(w) + '+', '| ' + String(v).padEnd(w - 2) + ' |', '| ' + k.padEnd(w - 2) + ' |', '+' + '-'.repeat(w) + '+']; };
    const bs = [box('twins live', s.live), box('value managed', usd(s.managed)), box('trades 24h', s.trades24), box('SOL traded', (+s.volume).toFixed(2))];
    return [0, 1, 2, 3].map(r => bs.map(b => b[r]).join('   ')).join('\n');
  }
  let pn = 0; setInterval(() => { if (document.hidden) return; $$('#pipe .node').forEach((n, i) => n.classList.toggle('on', i === pn)); pn = (pn + 1) % 6; }, 1100);
  const mx = $('.rules2'); if (mx) mx.innerHTML = mx.innerHTML.replace('{MAX}', S.cfg.maxSol);

  /* ---------------- command bar ---------------- */
  const cmd = $('#cmd'), cin = $('#cmdIn'), cout = $('#cmdOut');
  const openCmd = () => { cmd.hidden = false; cin.value = ''; cout.classList.remove('on'); setTimeout(() => cin.focus(), 10); };
  const closeCmd = () => { cmd.hidden = true; };
  $('#cmdBtn').onclick = openCmd;
  addEventListener('keydown', e => { if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); openCmd(); } if (e.key === 'Escape' && !cmd.hidden) closeCmd(); });
  cmd.addEventListener('click', e => { if (e.target === cmd) closeCmd(); });
  const echo = t => { cout.textContent = t; cout.classList.add('on'); };
  cin.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return; const [c, ...args] = cin.value.trim().split(/\s+/); const k = (c || '').toLowerCase();
    if (k === 'help' || !k) return echo('sync <A> <B>   chart two coins in the lab\nfind <A>       the trending coin that moves most like A\nbind <A> <B>   start a twin for these two\ntwin <id>      open a twin\ntwins          the board\nconnect        sign in');
    if (k === 'sync' && args.length >= 2) { closeCmd(); loadLab(args[0], args[1]); return goTo('lab'); }
    if (k === 'find' && args[0]) { closeCmd(); $('#fA').value = args[0]; goTo('find'); return $('#findForm').requestSubmit(); }
    if (k === 'bind' && args.length >= 2) { closeCmd(); $('#bA').value = args[0]; $('#bB').value = args[1]; pick('A'); pick('B'); step(1); return goTo('bind'); }
    if (k === 'twin' && args[0]) { closeCmd(); return openTwin(+args[0]); }
    if (k === 'twins') { closeCmd(); return goTo('twins'); }
    if (k === 'connect') { closeCmd(); return walletModal(); }
    echo(`unknown: ${c}. type help`);
  });

  /* ---------------- start ---------------- */
  renderMe();
  api('config').then(c => { S.cfg = c; for (const k in RULE) { const map = { band: 'band', buy: 'buy', trim: 'trim', cool: 'cooldown', max: 'maxTrade', imp: 'impact' }; setRule(k, c.defaults[map[k]]); } setCtl('band', c.defaults.band); setCtl('buy', c.defaults.buy); setCtl('trim', c.defaults.trim); setCtl('cool', c.defaults.cooldown); if (mx) mx.innerHTML = mx.innerHTML.replace(/\d+(\.\d+)? SOL cap/, c.maxSol + ' SOL cap'); facts(); }).catch(() => { for (const k in RULE) setRule(k, $(RULE[k][0]).value); });
  drawGauge(0); loadTwins(); loadStats(); loadScan(false);
  setInterval(() => { if (!document.hidden) { loadStats(); loadTwins(); if (S.sheet) openTwin(S.sheet); } }, 30000);
  const saved = (store.get('tw:lab') || '').split('|'); if (B58.test(saved[0] || '') && B58.test(saved[1] || '')) loadLab(saved[0], saved[1]);
  const deep = (location.hash.match(/^#t=(\d+)/) || [])[1]; if (deep) setTimeout(() => openTwin(+deep), 400);
})();
