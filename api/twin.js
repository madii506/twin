'use strict';
/* TWIN: bind two coins to one market maker. When one pumps, both pump.
 * Every number comes from Solana, Jupiter, Dexscreener or GeckoTerminal. A twin's maker is a public wallet run by this
 * engine: it buys the coin that's lagging and trims the one that's leading, inside the limits its owner sets.
 * The owner's wallet is the only place its SOL can ever be sent. */
const crypto = require('crypto');
const { PublicKey, Keypair, VersionedTransaction, Transaction, SystemProgram, TransactionInstruction } = require('@solana/web3.js');

const E = (k, d = '') => String(process.env[k] == null ? d : process.env[k]).trim();
const RPC_URL = E('RPC_URL');
const RPCS = E('TWIN_RPCS') ? E('TWIN_RPCS').split(',') : [RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
const DEX = E('TWIN_DEX', 'https://api.dexscreener.com'), JUP = E('TWIN_JUP', 'https://lite-api.jup.ag'), GT = E('TWIN_GT', 'https://api.geckoterminal.com/api/v2');
const DB_URL = E('TWIN_DB_URL') || E('TWIN_DB_DATABASE_URL') || E('TWIN_DB_POSTGRES_URL') || E('DATABASE_URL') || E('POSTGRES_URL');
const SECRET = E('SESSION_SECRET') || crypto.createHash('sha256').update('twin-session:' + DB_URL).digest('hex');
const KEY_SECRET = E('TWIN_SECRET') || ('db:' + DB_URL);       // set TWIN_SECRET in the project to keep maker keys apart from the database
const MAX_SOL = Number(E('TWIN_MAX_SOL', '5')) || 5;           // the most SOL one maker will ever put to work
const MIN_LIQ = Number(E('TWIN_MIN_LIQ', '3000')) || 3000;     // coins need at least this much liquidity (USD)
const MIN_FUND = 0.05, RESERVE = 0.012;                        // SOL kept back for fees and token-account rent
const SOL = 'So11111111111111111111111111111111111111112';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SPL = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const DEFAULTS = { band: 8, buy: 20, trim: 35, cooldown: 3, maxTrade: 0.5, impact: 4, slippage: 300 };
const LIMITS = { band: [2, 40], buy: [5, 60], trim: [0, 100], cooldown: [1, 120], maxTrade: [0.01, 5], impact: [0.5, 10], slippage: [50, 1500] };

/* ---------------- plumbing ---------------- */
function send(res, code, body, headers) { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); if (headers) for (const k in headers) res.setHeader(k, headers[k]); res.end(JSON.stringify(body)); }
function http(code, msg, extra) { const e = new Error(msg); e.code = code; if (extra) e.extra = extra; return e; }
async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = []; let n = 0; for await (const c of req) { chunks.push(c); n += c.length; if (n > 1e6) break; }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { return {}; }
}
const timed = ms => (url, opt = {}) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(url, { ...opt, signal: c.signal }).finally(() => clearTimeout(t)); };
const getJson = async (url, opt, ms = 9000) => { const r = await timed(ms)(url, opt); if (!r.ok) throw http(502, 'Upstream ' + r.status); return r.json(); };
const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ');
const hits = new Map();
function limit(key, n, ms, msg) { const t = Date.now(), a = (hits.get(key) || []).filter(x => t - x < ms); if (a.length >= n) throw http(429, msg || 'Slow down a little.'); a.push(t); hits.set(key, a); if (hits.size > 5000) hits.clear(); }
const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
const ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58dec(s) { let n = 0n; for (const c of s) { const i = ALPH.indexOf(c); if (i < 0) throw new Error('bad'); n = n * 58n + BigInt(i); } let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex; const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex'); let z = 0; while (z < s.length && s[z] === '1') z++; return Buffer.concat([Buffer.alloc(z), body]); }
function verifySig(wallet, msg, sig) { try { const pub = b58dec(wallet); if (pub.length !== 32 || sig.length !== 64) return false; const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub]), format: 'der', type: 'spki' }); return crypto.verify(null, msg, key, sig); } catch (e) { return false; } }
const b64u = b => Buffer.from(b).toString('base64url');
function issue(wallet) { const p = b64u(JSON.stringify({ w: wallet, e: Date.now() + 14 * 864e5 })); return p + '.' + b64u(crypto.createHmac('sha256', SECRET).update(p).digest()); }
function who(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer ([\w-]+)\.([\w-]+)$/); if (!m) return null;
  const want = b64u(crypto.createHmac('sha256', SECRET).update(m[1]).digest());
  if (want.length !== m[2].length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m[2]))) return null;
  try { const j = JSON.parse(Buffer.from(m[1], 'base64url').toString()); return j.w && j.e > Date.now() ? j.w : null; } catch (e) { return null; }
}
// maker keys are encrypted at rest (AES-256-GCM)
const kek = () => crypto.createHash('sha256').update('twin-keys-v1:' + KEY_SECRET).digest();
function seal(bytes) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', kek(), iv); const ct = Buffer.concat([c.update(Buffer.from(bytes)), c.final()]); return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') }; }
function unseal(o) { const d = crypto.createDecipheriv('aes-256-gcm', kek(), Buffer.from(o.iv, 'base64')); d.setAuthTag(Buffer.from(o.tag, 'base64')); return Keypair.fromSecretKey(Uint8Array.from(Buffer.concat([d.update(Buffer.from(o.ct, 'base64')), d.final()]))); }

/* ---------------- database ---------------- */
let sqlFn, ready;
function db() {
  if (!sqlFn) {
    if (E('TWIN_LOCAL_PG')) { const { Pool } = require('pg'); const pool = new Pool({ connectionString: E('TWIN_LOCAL_PG') }); sqlFn = async (strs, ...vals) => { let q = strs[0]; vals.forEach((v, i) => { q += '$' + (i + 1) + strs[i + 1]; }); return (await pool.query(q, vals)).rows; }; }
    else { if (!DB_URL) throw http(503, 'The database is not connected yet.'); const { neon } = require('@neondatabase/serverless'); sqlFn = neon(DB_URL); }
  }
  return sqlFn;
}
async function ensure() {
  if (ready) return ready;
  ready = (async () => {
    const s = db();
    await s`CREATE TABLE IF NOT EXISTS tw_nonces (nonce TEXT PRIMARY KEY, wallet TEXT NOT NULL, text TEXT NOT NULL, used BOOLEAN DEFAULT false, at TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE TABLE IF NOT EXISTS tw_twins (id BIGSERIAL PRIMARY KEY, owner TEXT NOT NULL, a_mint TEXT, b_mint TEXT, a JSONB, b JSONB, treasury TEXT UNIQUE, enc JSONB, settings JSONB, status TEXT DEFAULT 'pending', paused BOOLEAN DEFAULT false, anchor_a DOUBLE PRECISION, anchor_b DOUBLE PRECISION, ladder INT DEFAULT 0, next_pass TIMESTAMPTZ DEFAULT now(), last_pass TIMESTAMPTZ, last JSONB, created TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE INDEX IF NOT EXISTS tw_twins_due ON tw_twins (status, next_pass)`;
    await s`CREATE TABLE IF NOT EXISTS tw_trades (id BIGSERIAL PRIMARY KEY, twin BIGINT, side TEXT, mint TEXT, sol DOUBLE PRECISION, tokens DOUBLE PRECISION, usd DOUBLE PRECISION, sig TEXT, status TEXT, reason TEXT, at TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE INDEX IF NOT EXISTS tw_trades_twin ON tw_trades (twin, at)`;
    await s`CREATE TABLE IF NOT EXISTS tw_samples (twin BIGINT, at TIMESTAMPTZ DEFAULT now(), pa DOUBLE PRECISION, pb DOUBLE PRECISION, spread DOUBLE PRECISION, sol DOUBLE PRECISION, value DOUBLE PRECISION)`;
    await s`CREATE INDEX IF NOT EXISTS tw_samples_twin ON tw_samples (twin, at)`;
    await s`CREATE TABLE IF NOT EXISTS tw_events (id BIGSERIAL PRIMARY KEY, twin BIGINT, kind TEXT, note TEXT, at TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE TABLE IF NOT EXISTS tw_cache (k TEXT PRIMARY KEY, v JSONB, at TIMESTAMPTZ DEFAULT now())`;
  })();
  try { await ready; } catch (e) { ready = null; throw e; }
  return ready;
}
async function cached(k, secs, fn) {
  const row = (await db()`SELECT v, extract(epoch FROM now() - at) AS age FROM tw_cache WHERE k=${k}`)[0];
  if (row && row.age < secs) return row.v;
  try { const v = await fn(); await db()`INSERT INTO tw_cache (k, v, at) VALUES (${k}, ${JSON.stringify(v)}, now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`; return v; }
  catch (e) { if (row) return row.v; throw e; }
}
const event = (twin, kind, note) => db()`INSERT INTO tw_events (twin, kind, note) VALUES (${twin}, ${kind}, ${String(note).slice(0, 300)})`.catch(() => { });

/* ---------------- Solana ---------------- */
async function rpc(method, params, good) {
  for (const u of RPCS) {
    try {
      const r = await timed(9000)(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message || 'rpc error');
      if (good && !good(j.result)) throw new Error('unusable answer'); return j.result;
    } catch (e) { if (method === 'sendTransaction' && /blockhash|insufficient|custom program error|simulation/i.test(e.message)) throw http(400, 'The transaction was refused: ' + e.message.slice(0, 120)); }
  }
  throw http(502, 'Solana RPC is busy, try again in a moment.');
}
const mintCache = new Map();
async function mintInfo(mint) {
  const c = mintCache.get(mint); if (c && Date.now() - c.t < 600e3) return c.v;
  const r = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  const v = r && r.value; if (!v || !v.data || !v.data.parsed || v.data.parsed.type !== 'mint') throw http(400, 'That address is not a token.');
  const i = v.data.parsed.info, out = { program: v.owner, decimals: i.decimals, supply: Number(i.supply) / 10 ** i.decimals };
  mintCache.set(mint, { t: Date.now(), v: out }); return out;
}
async function holdings(owner) {
  const [bal, a, b] = await Promise.all([
    rpc('getBalance', [owner, { commitment: 'confirmed' }], x => x && typeof x.value === 'number'),
    rpc('getTokenAccountsByOwner', [owner, { programId: SPL }, { encoding: 'jsonParsed', commitment: 'confirmed' }], x => x && Array.isArray(x.value)),
    rpc('getTokenAccountsByOwner', [owner, { programId: T22 }, { encoding: 'jsonParsed', commitment: 'confirmed' }], x => x && Array.isArray(x.value)).catch(() => ({ value: [] })),
  ]);
  const tokens = {};
  for (const x of [...a.value, ...b.value]) {
    const i = x.account.data.parsed.info, t = tokens[i.mint] || (tokens[i.mint] = { ui: 0, raw: 0n, dec: i.tokenAmount.decimals, accounts: [], program: x.account.owner });
    t.ui += Number(i.tokenAmount.uiAmountString || 0); t.raw += BigInt(i.tokenAmount.amount); t.accounts.push(x.pubkey);
  }
  return { sol: bal.value / 1e9, lamports: bal.value, tokens };
}
async function sendSigned(tx) {
  const sig = await rpc('sendTransaction', [Buffer.from(tx.serialize()).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 4 }]);
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1300));
    try { const st = (await rpc('getSignatureStatuses', [[sig]])).value[0]; if (st) { if (st.err) return { sig, status: 'failed' }; if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') return { sig, status: 'confirmed' }; } } catch (e) { }
  }
  return { sig, status: 'sent' };
}

/* ---------------- market data ---------------- */
function bestPair(pairs) { return (pairs || []).filter(p => p.chainId === 'solana').sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0))[0] || null; }
const shape = p => p && ({
  mint: p.baseToken.address, symbol: clean(p.baseToken.symbol).slice(0, 16), name: clean(p.baseToken.name).slice(0, 48),
  image: (p.info && p.info.imageUrl) || null, mc: Math.round(p.marketCap || p.fdv || 0), liq: Math.round((p.liquidity || {}).usd || 0),
  vol: Math.round((p.volume || {}).h24 || 0), chg: (p.priceChange || {}).h24 ?? null, price: Number(p.priceUsd || 0), pair: p.pairAddress, created: p.pairCreatedAt || null,
});
async function coin(ca) {
  if (!B58.test(ca)) throw http(400, 'Paste a Solana contract address.');
  if (ca === SOL) throw http(400, 'Pick a coin, not SOL.');
  return cached('coin:' + ca, 40, async () => {
    const [d, m] = await Promise.all([getJson(DEX + '/tokens/v1/solana/' + ca).catch(() => []), mintInfo(ca)]);
    const p = bestPair(Array.isArray(d) ? d : d.pairs); if (!p) throw http(404, 'No market found for that coin yet.');
    return { ...shape(p), decimals: m.decimals, program: m.program, supply: m.supply };
  });
}
async function prices(mints) {
  const j = await getJson(JUP + '/price/v3?ids=' + [...new Set(mints)].join(','), {}, 8000);
  const out = {}; for (const m of mints) if (j[m] && j[m].usdPrice) out[m] = Number(j[m].usdPrice); return out;
}
// GeckoTerminal candles: a coin's biggest pool, then its OHLCV
async function poolOf(mint) {
  return cached('pool:' + mint, 3600, async () => {
    const j = await getJson(`${GT}/networks/solana/tokens/${mint}/pools?page=1`, { headers: { accept: 'application/json' } });
    const p = (j.data || [])[0]; if (!p) throw http(404, 'No pool with candles for that coin.');
    return p.attributes.address;
  });
}
const TF = { '1m': ['minute', 1, 240], '5m': ['minute', 5, 288], '15m': ['minute', 15, 192], '1h': ['hour', 1, 168] };
async function candles(mint, tf) {
  const [unit, agg, n] = TF[tf] || TF['5m'];
  return cached(`ohlcv:${mint}:${tf}`, tf === '1m' ? 30 : 60, async () => {
    const pool = await poolOf(mint);
    const j = await getJson(`${GT}/networks/solana/pools/${pool}/ohlcv/${unit}?aggregate=${agg}&limit=${n}&currency=usd&token=${mint}`, { headers: { accept: 'application/json' } });
    const list = ((j.data || {}).attributes || {}).ohlcv_list || [];
    return list.map(c => [c[0], Number(c[4])]).filter(c => c[1] > 0).sort((a, b) => a[0] - b[0]);
  });
}
function align(ca, cb) {
  const mb = new Map(cb), out = []; let lastB = null;
  const all = [...new Set([...ca.map(c => c[0]), ...cb.map(c => c[0])])].sort((a, b) => a - b), ma = new Map(ca); let lastA = null;
  for (const t of all) { if (ma.has(t)) lastA = ma.get(t); if (mb.has(t)) lastB = mb.get(t); if (lastA != null && lastB != null) out.push([t, lastA, lastB]); }
  return out;
}
function corr(rows) {
  const ra = [], rb = [];
  for (let i = 1; i < rows.length; i++) { ra.push(Math.log(rows[i][1] / rows[i - 1][1])); rb.push(Math.log(rows[i][2] / rows[i - 1][2])); }
  const n = ra.length; if (n < 8) return null;
  const ma = ra.reduce((a, b) => a + b, 0) / n, mb = rb.reduce((a, b) => a + b, 0) / n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = ra[i] - ma, y = rb[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
}

/* ---------------- swaps (Jupiter), signed by the maker ---------------- */
async function quote(input, output, amountRaw, bps) {
  const p = new URLSearchParams({ inputMint: input, outputMint: output, amount: String(amountRaw), slippageBps: String(bps), restrictIntermediateTokens: 'true' });
  const r = await timed(10000)(JUP + '/swap/v1/quote?' + p); const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw http(400, j.error || 'No route.'); return j;
}
async function swapAs(kp, q) {
  const r = await timed(12000)(JUP + '/swap/v1/swap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteResponse: q, userPublicKey: kp.publicKey.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 300000, priorityLevel: 'high' } } }) });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.swapTransaction) throw http(400, j.error || 'Could not build the swap.');
  const tx = VersionedTransaction.deserialize(Buffer.from(j.swapTransaction, 'base64')); tx.sign([kp]);
  return sendSigned(tx);
}
async function latestHash() { return (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }], x => x && x.value)).value.blockhash; }
async function transferSol(kp, to, lamports) {
  const tx = new Transaction({ feePayer: kp.publicKey, recentBlockhash: await latestHash() }).add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(to), lamports }));
  tx.sign(kp); return sendSigned(tx);
}
async function closeEmpty(kp, accounts) {   // empty token accounts give their rent back to the maker
  if (!accounts.length) return null;
  const tx = new Transaction({ feePayer: kp.publicKey, recentBlockhash: await latestHash() });
  for (const a of accounts.slice(0, 8)) tx.add(new TransactionInstruction({ programId: new PublicKey(a.program), keys: [{ pubkey: new PublicKey(a.pubkey), isSigner: false, isWritable: true }, { pubkey: kp.publicKey, isSigner: false, isWritable: true }, { pubkey: kp.publicKey, isSigner: true, isWritable: false }], data: Buffer.from([9]) }));
  tx.sign(kp); return sendSigned(tx);
}

/* ---------------- the engine: one pass for one twin ---------------- */
function settingsOf(s) {
  const o = { ...DEFAULTS };
  for (const k in LIMITS) if (s && s[k] != null && isFinite(Number(s[k]))) o[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], Number(s[k])));
  return o;
}
async function trade(t, kp, side, mint, amountRaw, sym, reason, s, px, dec) {
  const input = side === 'buy' ? SOL : mint, output = side === 'buy' ? mint : SOL;
  let q; try { q = await quote(input, output, amountRaw, Math.round(s.slippage)); } catch (e) { await event(t.id, 'skip', `No route to ${side} $${sym}: ${e.message}`); return null; }
  const impact = Number(q.priceImpactPct || 0) * 100;
  if (impact > s.impact) { await event(t.id, 'skip', `Skipped ${side} $${sym}: price impact ${impact.toFixed(2)}% is above the ${s.impact}% limit.`); return null; }
  const r = await swapAs(kp, q);
  const sol = (side === 'buy' ? Number(q.inAmount) : Number(q.outAmount)) / 1e9, tokens = (side === 'buy' ? Number(q.outAmount) : Number(q.inAmount)) / 10 ** dec;
  await db()`INSERT INTO tw_trades (twin, side, mint, sol, tokens, usd, sig, status, reason) VALUES (${t.id}, ${side}, ${mint}, ${sol}, ${tokens}, ${tokens * (px || 0)}, ${r.sig}, ${r.status}, ${reason})`;
  return r;
}
async function pass(t) {
  const s = settingsOf(t.settings), kp = unseal(t.enc), me = kp.publicKey.toBase58();
  const px = await prices([t.a_mint, t.b_mint, SOL]); const pa = px[t.a_mint], pb = px[t.b_mint], psol = px[SOL] || 0;
  if ((!pa || !pb) && t.status !== 'closing') { await event(t.id, 'skip', 'No price for one of the coins this pass.'); return { ok: false }; }
  const h = await holdings(me), A = h.tokens[t.a_mint] || { ui: 0, raw: 0n, dec: t.a.decimals || 6, accounts: [] }, B = h.tokens[t.b_mint] || { ui: 0, raw: 0n, dec: t.b.decimals || 6, accounts: [] };
  const value = h.sol * psol + A.ui * (pa || 0) + B.ui * (pb || 0);
  let spread = t.anchor_a && t.anchor_b && pa && pb ? Math.log((pa / t.anchor_a) / (pb / t.anchor_b)) : 0; if (!isFinite(spread)) spread = 0;
  await db()`INSERT INTO tw_samples (twin, pa, pb, spread, sol, value) VALUES (${t.id}, ${pa}, ${pb}, ${spread}, ${h.sol}, ${value})`;
  const last = { pa, pb, psol, spread, sol: h.sol, a: A.ui, b: B.ui, value, at: Date.now() };

  if (t.status === 'closing') {   // withdraw: sell both coins, give empty accounts back, send every lamport home
    if (A.raw > 0n) { await trade(t, kp, 'sell', t.a_mint, A.raw, t.a.symbol, 'withdraw', { ...s, impact: 25, slippage: 1500 }, pa, A.dec); }
    else if (B.raw > 0n) { await trade(t, kp, 'sell', t.b_mint, B.raw, t.b.symbol, 'withdraw', { ...s, impact: 25, slippage: 1500 }, pb, B.dec); }
    else {
      const empty = Object.values(h.tokens).filter(x => x.raw === 0n).flatMap(x => x.accounts.map(p => ({ pubkey: p, program: x.program })));
      if (empty.length) { await closeEmpty(kp, empty).catch(() => { }); }
      else {
        const lamports = h.lamports - 5000;
        if (lamports > 0) { const r = await transferSol(kp, t.owner, lamports); await event(t.id, 'withdraw', `Sent ${(lamports / 1e9).toFixed(4)} SOL to the owner. ${r.sig}`); }
        await db()`UPDATE tw_twins SET status='closed', last=${JSON.stringify(last)} WHERE id=${t.id}`; return { ok: true, closed: true };
      }
    }
    await db()`UPDATE tw_twins SET last=${JSON.stringify(last)}, next_pass=now() + interval '20 seconds' WHERE id=${t.id}`;
    return { ok: true, closing: true };
  }

  let ladder = t.ladder || 0, did = [];
  const band = s.band / 100, level = Math.floor(Math.abs(spread) / band);
  if (!t.paused) {
    if (level === 0) ladder = 0;
    else if (level > ladder) {
      // the spread opened a new step: trim the leader, buy the laggard
      const aLeads = spread > 0, L = aLeads ? { mint: t.a_mint, sym: t.a.symbol, h: A, p: pa } : { mint: t.b_mint, sym: t.b.symbol, h: B, p: pb }, G = aLeads ? { mint: t.b_mint, sym: t.b.symbol, p: pb, dec: B.dec } : { mint: t.a_mint, sym: t.a.symbol, p: pa, dec: A.dec };
      const why = `$${L.sym} ran ${(Math.abs(spread) * 100).toFixed(1)}% ahead of $${G.sym}`;
      if (s.trim > 0 && L.h.raw > 0n && L.h.ui * L.p > 0.5) {
        const raw = L.h.raw * BigInt(Math.round(s.trim)) / 100n;
        if (raw > 0n) { const r = await trade(t, kp, 'sell', L.mint, raw, L.sym, `trim the leader · ${why}`, s, L.p, L.h.dec); if (r) did.push(r); }
      }
      const h2 = did.length ? await holdings(me) : h, working = Math.min(h2.sol, MAX_SOL) - RESERVE;
      const solIn = Math.min(s.maxTrade, working * s.buy / 100);
      if (solIn >= 0.004) { const r = await trade(t, kp, 'buy', G.mint, Math.floor(solIn * 1e9), G.sym, `buy the laggard · ${why}`, s, G.p, G.dec); if (r) did.push(r); }
      ladder = level;
    } else if (level < ladder - 1) ladder = level + 1;
  }
  await db()`UPDATE tw_twins SET ladder=${ladder}, last=${JSON.stringify(last)}, last_pass=now(), next_pass=now() + make_interval(secs => ${Math.round(s.cooldown * 60)}) WHERE id=${t.id}`;
  return { ok: true, trades: did.length, spread };
}
async function runDue(max = 2, budget = 20000) {
  const t0 = Date.now(), done = [];
  for (let i = 0; i < max && Date.now() - t0 < budget; i++) {
    const t = (await db()`UPDATE tw_twins SET next_pass = now() + interval '75 seconds' WHERE id = (SELECT id FROM tw_twins WHERE status IN ('live','closing') AND next_pass <= now() ORDER BY next_pass ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`)[0];
    if (!t) break;
    try { done.push({ id: Number(t.id), ...(await pass(t)) }); } catch (e) { console.error('pass', t.id, e.message); await event(t.id, 'error', 'Engine pass failed: ' + e.message); done.push({ id: Number(t.id), error: e.message }); }
  }
  return done;
}
async function runSafe() { try { return await runDue(); } catch (e) { console.error('engine', e.message); return []; } }

/* ---------------- what the page sees ---------------- */
const pub = t => ({
  id: Number(t.id), owner: short(t.owner), ownerFull: t.owner, a: t.a, b: t.b, treasury: t.treasury, settings: settingsOf(t.settings),
  status: t.status, paused: t.paused, anchors: [t.anchor_a, t.anchor_b], ladder: t.ladder, next: t.next_pass, lastPass: t.last_pass, last: t.last, created: t.created,
});
const R = {};
R['GET config'] = async () => ({ defaults: DEFAULTS, limits: LIMITS, maxSol: MAX_SOL, minFund: MIN_FUND, reserve: RESERVE, minLiq: MIN_LIQ });
R['GET nonce'] = async ({ q, req }) => {
  const wallet = String(q.wallet || ''); if (!B58.test(wallet)) throw http(400, 'Bad wallet.');
  limit('n:' + wallet, 8, 60e3);
  const nonce = b64u(crypto.randomBytes(12)), host = String(req.headers['x-forwarded-host'] || req.headers.host || 'twin').replace(/[^\w.:-]/g, '').slice(0, 80);
  const text = `${host} wants you to sign in with your Solana account:\n${wallet}\n\nSign in to TWIN. This is a free signature, not a transaction. It cannot move anything.\n\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
  await db()`INSERT INTO tw_nonces (nonce, wallet, text) VALUES (${nonce}, ${wallet}, ${text})`;
  db()`DELETE FROM tw_nonces WHERE at < now() - interval '1 day'`.catch(() => { });
  return { nonce, message: text };
};
R['POST login'] = async ({ b }) => {
  const wallet = String(b.wallet || ''); if (!B58.test(wallet)) throw http(400, 'Bad wallet.');
  const row = (await db()`SELECT * FROM tw_nonces WHERE nonce=${String(b.nonce || '')} AND wallet=${wallet} AND used=false AND at > now() - interval '10 minutes'`)[0];
  if (!row) throw http(401, 'That sign-in expired. Try again.');
  let sig; try { sig = /^[1-9A-HJ-NP-Za-km-z]+$/.test(b.sig || '') ? b58dec(b.sig) : Buffer.from(String(b.sig || ''), 'base64'); } catch (e) { throw http(400, 'Bad signature.'); }
  const msg = b.msg ? Buffer.from(String(b.msg), 'base64') : Buffer.from(row.text, 'utf8');
  if (!msg.toString('utf8').includes(row.text)) throw http(401, 'The signed message does not match.');
  if (!verifySig(wallet, msg, sig)) throw http(401, 'The signature does not match this wallet.');
  if (!(await db()`UPDATE tw_nonces SET used=true WHERE nonce=${row.nonce} AND used=false RETURNING nonce`).length) throw http(401, 'That sign-in was already used.');
  return { token: issue(wallet), wallet };
};
R['GET coin'] = async ({ q }) => coin(String(q.ca || '').trim());
// the sync lab: two coins' real candles side by side, and how closely they move
R['GET sync'] = async ({ q }) => {
  const a = String(q.a || '').trim(), b = String(q.b || '').trim(), tf = TF[q.tf] ? q.tf : '5m';
  if (!B58.test(a) || !B58.test(b) || a === b) throw http(400, 'Paste two different contract addresses.');
  const [A, B] = await Promise.all([coin(a), coin(b)]);
  const [ca, cb] = await Promise.all([candles(a, tf), candles(b, tf)]);
  const rows = align(ca, cb); if (rows.length < 10) throw http(404, 'Not enough shared history for these two yet.');
  return { a: A, b: B, tf, rows, corr: corr(rows) };
};
// find a twin: which trending coin moves most like this one
R['GET match'] = async ({ q }) => {
  const a = String(q.a || '').trim(); const A = await coin(a);
  return cached('match:' + a, 300, async () => {
    const srcs = await Promise.all(['/token-boosts/top/v1', '/token-boosts/latest/v1', '/token-profiles/latest/v1'].map(u => getJson(DEX + u).catch(() => [])));
    const mints = [...new Set(srcs.flat().filter(x => x && x.chainId === 'solana' && x.tokenAddress && x.tokenAddress !== a).map(x => x.tokenAddress))].slice(0, 9);
    const ca = await candles(a, '15m'); const out = [];
    for (const m of mints) {
      try { const [c, info] = await Promise.all([candles(m, '15m'), coin(m)]); const rows = align(ca, c); const r = corr(rows); if (r != null && rows.length >= 12) out.push({ ...info, corr: r, n: rows.length, spark: rows.slice(-64).map(x => [x[1], x[2]]) }); } catch (e) { }
    }
    out.sort((x, y) => y.corr - x.corr);
    return { a: A, list: out.slice(0, 6) };
  });
};
// a demo pair for the lab: the two trending coins that moved most alike today
R['GET demo'] = async () => cached('demo', 600, async () => {
  const srcs = await Promise.all(['/token-boosts/top/v1', '/token-boosts/latest/v1'].map(u => getJson(DEX + u).catch(() => [])));
  const mints = [...new Set(srcs.flat().filter(x => x && x.chainId === 'solana' && x.tokenAddress).map(x => x.tokenAddress))].slice(0, 6);
  const cs = {}; for (const m of mints) { try { cs[m] = await candles(m, '15m'); } catch (e) { } }
  let best = null; const ks = Object.keys(cs);
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const rows = align(cs[ks[i]], cs[ks[j]]); const r = corr(rows); if (r != null && rows.length >= 12 && (!best || r > best.corr)) best = { a: ks[i], b: ks[j], corr: r }; }
  if (!best) throw http(404, 'No trending pair with enough history right now.');
  return best;
});
R['POST create'] = async ({ b, me }) => {
  if (!me) throw http(401, 'Connect a wallet first.');
  limit('c:' + me, 4, 3600e3, 'Four new twins an hour is the limit.');
  const a = String(b.a || '').trim(), c = String(b.b || '').trim();
  if (!B58.test(a) || !B58.test(c) || a === c) throw http(400, 'Pick two different coins.');
  const [A, B] = await Promise.all([coin(a), coin(c)]);
  for (const x of [A, B]) if ((x.liq || 0) < MIN_LIQ) throw http(400, `$${x.symbol} has only $${x.liq} of liquidity. A maker needs at least $${MIN_LIQ}.`);
  const kp = Keypair.generate(), s = settingsOf(b.settings);
  const r = await db()`INSERT INTO tw_twins (owner, a_mint, b_mint, a, b, treasury, enc, settings) VALUES (${me}, ${a}, ${c}, ${JSON.stringify(A)}, ${JSON.stringify(B)}, ${kp.publicKey.toBase58()}, ${JSON.stringify(seal(kp.secretKey))}, ${JSON.stringify(s)}) RETURNING id, treasury`;
  await event(r[0].id, 'create', `Twin created for $${A.symbol} × $${B.symbol} by ${short(me)}.`);
  return { id: Number(r[0].id), treasury: r[0].treasury, settings: s };
};
R['POST funded'] = async ({ b, me }) => {
  if (!me) throw http(401, 'Connect a wallet first.');
  const t = (await db()`SELECT * FROM tw_twins WHERE id=${parseInt(b.id, 10)} AND owner=${me}`)[0]; if (!t) throw http(404, 'No such twin.');
  if (t.status !== 'pending') return { ok: true, status: t.status };
  const h = await holdings(t.treasury); if (h.sol < MIN_FUND) throw http(409, `The maker holds ${h.sol.toFixed(4)} SOL. Send at least ${MIN_FUND} SOL to start it.`);
  const px = await prices([t.a_mint, t.b_mint]); if (!px[t.a_mint] || !px[t.b_mint]) throw http(502, 'No live price for one of the coins. Try again in a moment.');
  await db()`UPDATE tw_twins SET status='live', anchor_a=${px[t.a_mint]}, anchor_b=${px[t.b_mint]}, ladder=0, next_pass=now() + interval '20 seconds' WHERE id=${t.id}`;
  await event(t.id, 'live', `Funded with ${h.sol.toFixed(4)} SOL. The maker is live.`);
  return { ok: true, status: 'live', sol: h.sol };
};
R['GET twins'] = async ({ q }) => {
  await runSafe();
  const mine = B58.test(String(q.owner || '')) ? q.owner : null;
  const rows = mine ? await db()`SELECT * FROM tw_twins WHERE owner=${mine} ORDER BY id DESC LIMIT 60` : await db()`SELECT * FROM tw_twins WHERE status IN ('live','closing') ORDER BY id DESC LIMIT 60`;
  const ids = rows.map(r => r.id), tr = ids.length ? await db()`SELECT twin, count(*)::int AS n, coalesce(sum(sol), 0) AS vol FROM tw_trades WHERE twin = ANY(${ids}) GROUP BY twin` : [];
  const sp = ids.length ? await db()`SELECT twin, array_agg(spread ORDER BY at) AS s FROM (SELECT twin, spread, at, row_number() OVER (PARTITION BY twin ORDER BY at DESC) AS rn FROM tw_samples WHERE twin = ANY(${ids})) x WHERE rn <= 40 GROUP BY twin` : [];
  return { twins: rows.map(t => ({ ...pub(t), trades: (tr.find(x => String(x.twin) === String(t.id)) || {}).n || 0, volume: Number((tr.find(x => String(x.twin) === String(t.id)) || {}).vol || 0), spark: ((sp.find(x => String(x.twin) === String(t.id)) || {}).s || []).map(Number) })) };
};
R['GET twin'] = async ({ q }) => {
  await runSafe();
  const id = parseInt(q.id, 10), t = (await db()`SELECT * FROM tw_twins WHERE id=${id}`)[0]; if (!t) throw http(404, 'No such twin.');
  const [samples, trades, events] = await Promise.all([
    db()`SELECT extract(epoch FROM at)*1000 AS t, pa, pb, spread, sol, value FROM tw_samples WHERE twin=${id} ORDER BY at DESC LIMIT 400`,
    db()`SELECT side, mint, sol, tokens, usd, sig, status, reason, at FROM tw_trades WHERE twin=${id} ORDER BY at DESC LIMIT 80`,
    db()`SELECT kind, note, at FROM tw_events WHERE twin=${id} ORDER BY at DESC LIMIT 60`,
  ]);
  let live = null; try { live = await cached('hold:' + t.treasury, 15, async () => { const h = await holdings(t.treasury); return { sol: h.sol, a: (h.tokens[t.a_mint] || {}).ui || 0, b: (h.tokens[t.b_mint] || {}).ui || 0 }; }); } catch (e) { }
  return { twin: pub(t), live, samples: samples.reverse().map(s => ({ t: Number(s.t), pa: s.pa, pb: s.pb, spread: s.spread, sol: s.sol, value: s.value })), trades, events };
};
async function mine(b, me) {
  if (!me) throw http(401, 'Connect a wallet first.');
  const t = (await db()`SELECT * FROM tw_twins WHERE id=${parseInt(b.id, 10)}`)[0]; if (!t) throw http(404, 'No such twin.');
  if (t.owner !== me) throw http(403, 'Only the owner can steer this twin.'); return t;
}
R['POST settings'] = async ({ b, me }) => {
  const t = await mine(b, me); const s = settingsOf({ ...t.settings, ...(b.settings || {}) });
  await db()`UPDATE tw_twins SET settings=${JSON.stringify(s)} WHERE id=${t.id}`;
  await event(t.id, 'settings', `Settings: band ${s.band}% · buy ${s.buy}% · trim ${s.trim}% · every ${s.cooldown}m · max ${s.maxTrade} SOL · impact ≤ ${s.impact}%`);
  return { ok: true, settings: s };
};
R['POST pause'] = async ({ b, me }) => {
  const t = await mine(b, me); const p = !!b.paused;
  await db()`UPDATE tw_twins SET paused=${p} WHERE id=${t.id}`; await event(t.id, p ? 'pause' : 'resume', p ? 'Paused by the owner.' : 'Resumed by the owner.');
  return { ok: true, paused: p };
};
R['POST reanchor'] = async ({ b, me }) => {
  const t = await mine(b, me); const px = await prices([t.a_mint, t.b_mint]); if (!px[t.a_mint] || !px[t.b_mint]) throw http(502, 'No live price right now.');
  await db()`UPDATE tw_twins SET anchor_a=${px[t.a_mint]}, anchor_b=${px[t.b_mint]}, ladder=0 WHERE id=${t.id}`; await event(t.id, 'anchor', 'The owner reset the sync point to today\'s prices.');
  return { ok: true };
};
R['POST withdraw'] = async ({ b, me }) => {
  const t = await mine(b, me); if (t.status === 'closed') throw http(409, 'Already closed.');
  if (t.status === 'pending') { await db()`UPDATE tw_twins SET status='closing', next_pass=now() WHERE id=${t.id}`; }
  else await db()`UPDATE tw_twins SET status='closing', next_pass=now() WHERE id=${t.id}`;
  await event(t.id, 'closing', 'The owner asked for everything back: selling both coins, then sending all SOL home.');
  const done = await runDue(1, 18000).catch(() => []);
  return { ok: true, status: 'closing', done };
};
R['GET tick'] = async () => ({ at: Date.now(), done: await runDue(3, 22000) });
R['GET stats'] = async () => cached('stats', 20, async () => {
  const s = db();
  const t = (await s`SELECT count(*) FILTER (WHERE status='live')::int AS live, count(*)::int AS all FROM tw_twins`)[0];
  const tr = (await s`SELECT count(*)::int AS n, coalesce(sum(sol), 0) AS vol, count(*) FILTER (WHERE at > now() - interval '24 hours')::int AS d FROM tw_trades`)[0];
  const v = (await s`SELECT coalesce(sum((last->>'value')::float), 0) AS v FROM tw_twins WHERE status IN ('live','closing')`)[0];
  const lastTrades = await s`SELECT t.side, t.sol, t.sig, t.at, w.a->>'symbol' AS a, w.b->>'symbol' AS b, CASE WHEN t.mint = w.a_mint THEN w.a->>'symbol' ELSE w.b->>'symbol' END AS sym, w.id FROM tw_trades t JOIN tw_twins w ON w.id = t.twin ORDER BY t.at DESC LIMIT 20`;
  return { live: t.live, all: t.all, trades: tr.n, trades24: tr.d, volume: Number(tr.vol), managed: Number(v.v), feed: lastTrades };
});
R['POST rpc'] = async ({ b }) => {
  const ok = ['getSignatureStatuses', 'sendTransaction', 'getBalance', 'getLatestBlockhash', 'getTokenAccountsByOwner'];
  if (!ok.includes(b.method)) throw http(400, 'Not allowed.');
  return { result: await rpc(b.method, Array.isArray(b.params) ? b.params : []) };
};

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = String((req.query && req.query.__p) || url.searchParams.get('__p') || url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
  const q = Object.fromEntries(url.searchParams);
  const key = `${req.method} ${path}`, fn = R[key];
  if (!fn) return send(res, 404, { ok: false, error: 'No such endpoint.' });
  try {
    if (!['GET config', 'POST rpc'].includes(key)) await ensure();
    const b = req.method === 'POST' ? await readBody(req) : {};
    send(res, 200, await fn({ q, b, req, me: who(req) }));
  } catch (e) {
    const code = e.code && e.code >= 400 && e.code < 600 ? e.code : 500;
    if (code === 500) console.error(key, e);
    send(res, code, Object.assign({ ok: false, error: code === 500 ? 'Something broke on our side. Try again.' : e.message }, e.extra || {}));
  }
};
module.exports._t = { corr, align, settingsOf, seal, unseal };
