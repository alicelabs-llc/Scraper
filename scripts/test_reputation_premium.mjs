/**
 * scripts/test_reputation_premium.mjs — regresión del endpoint UTA Reputation v1.3
 * (patch freemium: free path idéntico a v1.2 + premium keys + batch).
 *
 * Run (dentro del repo Scraper, con el parche YA aplicado en api/reputation.ts
 * y UTA_PREMIUM_KEYS simulada aquí):
 *   node scripts/test_reputation_premium.mjs
 *
 * Compila api/reputation.ts con esbuild (node_modules del repo) y ejecuta el
 * handler real con Request/Response de Node 18+.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(join(fileURLToPath(import.meta.url), '..'));
const esbuild = require('esbuild');

const root = join(fileURLToPath(import.meta.url), '..', '..');
const src = join(root, 'api', 'reputation.ts');

const out = await esbuild.build({
  entryPoints: [src],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const tmp = mkdtempSync(join(tmpdir(), 'rep-premium-'));
const file = join(tmp, 'reputation.mjs');
writeFileSync(file, out.outputFiles[0].text);

// Premium keys simuladas ANTES de importar el handler (parse lazy por isolate).
process.env.UTA_PREMIUM_KEYS = JSON.stringify({
  uta_pro_testkey: { tier: 'pro', max_batch: 50, rpm: 300 },
  uta_biz_testkey: { tier: 'business', max_batch: 500, rpm: 1200 },
});

const { default: handler } = await import(pathToFileURL(file));

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; return; }
  fail++;
  console.log(`FAIL ${name} ${extra}`);
};

const get = async (qs, headers = {}) =>
  handler(new Request(`https://example.com/api/reputation${qs}`, { headers }));
const post = async (obj, headers = {}) =>
  handler(new Request('https://example.com/api/reputation', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof obj === 'string' ? obj : JSON.stringify(obj),
  }));

// ---------- 1. FREE path: paridad con v1.2 ----------
{
  const r = await get('?domain=aliexpress.com');
  const j = await r.json();
  ok(r.status === 200, 'free 200');
  ok(j.engine === 'uta-reputation-v1.2', 'free engine version', j.engine);
  ok(j.verdict === 'trusted' && j.score === 95 && j.status === 'marketplace', 'aliexpress trusted/95');
  ok(!('tier' in j), 'free response has NO tier field');
  ok((r.headers.get('cache-control') || '').includes('public'), 'free cache public');
}
{
  const r = await get('?url=https://t.co/abc');
  const j = await r.json();
  ok(j.verdict === 'risky' && j.score === 8, 't.co risky/8');
}
{
  const r = await get('?domain=paypal-login-verify.com');
  const j = await r.json();
  ok(j.verdict === 'risky', 'typosquat risky');
}
{
  const r = await get('?probe=1');
  const j = await r.json();
  ok(r.status === 200 && j.probe === true, 'probe ok');
}
{
  const r = await get('');
  ok(r.status === 400, 'missing input 400');
}
{
  const r = await post('{invalid json');
  ok(r.status === 400, 'invalid JSON body 400');
}
{
  const r = await post('x'.repeat(5000));
  ok(r.status === 413, 'body too large 413');
}
{
  const r = await post({ domain: 'github.com' });
  const j = await r.json();
  ok(r.status === 200 && j.domain === 'github.com', 'POST single works');
}

// ---------- 2. PREMIUM single ----------
{
  const r = await get('?domain=aliexpress.com', { authorization: 'Bearer uta_pro_testkey' });
  const j = await r.json();
  ok(r.status === 200, 'premium single 200');
  ok(j.tier === 'pro', 'premium tier pro', JSON.stringify(j));
  ok(j.verdict === 'trusted', 'premium verdict correct');
  ok((r.headers.get('cache-control') || '').includes('no-store'), 'premium cache no-store');
}
{
  const r = await get('?domain=aliexpress.com&key=uta_pro_testkey');
  const j = await r.json();
  ok(r.status === 200 && j.tier === 'pro', 'key via query param works');
}
{
  const r = await post({ domain: 'walmart.com', key: 'uta_biz_testkey' });
  const j = await r.json();
  ok(r.status === 200 && j.tier === 'business', 'key via body works (business tier)');
}
{
  const r = await get('?domain=aliexpress.com', { authorization: 'Bearer uta_wrongkey' });
  ok(r.status === 401, 'invalid key 401');
}

// ---------- 3. PREMIUM batch ----------
{
  const r = await post({ key: 'uta_pro_testkey', domains: ['aliexpress.com', 't.co', 'github.com'] });
  const j = await r.json();
  ok(r.status === 200, 'batch 200');
  ok(j.count === 3 && Array.isArray(j.results) && j.results.length === 3, 'batch count 3');
  ok(j.tier === 'pro', 'batch tier pro');
  ok(j.results[0].verdict === 'trusted' && j.results[1].verdict === 'risky', 'batch verdicts correct');
  ok(j.results.every((x) => x.score !== undefined && Array.isArray(x.reasons)), 'batch items complete');
}
{
  const r = await post({ key: 'uta_pro_testkey', domains: [] });
  ok(r.status === 400, 'batch empty 400');
}
{
  const r = await post({ key: 'uta_pro_testkey', domains: Array.from({ length: 51 }, (_, i) => `d${i}.com`) });
  const j = await r.json();
  ok(r.status === 400 && /max 50/.test(j.error || ''), 'batch over limit pro (50)');
}
{
  const r = await post({ key: 'uta_biz_testkey', domains: Array.from({ length: 501 }, (_, i) => `d${i}.com`) });
  ok(r.status === 400, 'batch over limit business (500)');
}
{
  const r = await post({ domains: ['a.com', 'b.com'] });
  const j = await r.json();
  ok(r.status === 400 && /valid API key/.test(j.error || ''), 'batch WITHOUT key -> clear error');
}

// ---------- 4. Rate limits ----------
{
  // IP bucket free: 60/min. Ya consumimos algunas en la sección 1 (~4-5).
  let got429 = false;
  for (let i = 0; i < 70; i++) {
    const r = await get(`?domain=flood${i}.com`);
    if (r.status === 429) { got429 = true; break; }
  }
  ok(got429, 'free IP bucket 429 kicks in');
  // Premium BYPASA el bucket de IP (bucket propio por key).
  const r = await get('?domain=aliexpress.com', { authorization: 'Bearer uta_pro_testkey' });
  ok(r.status === 200, 'premium bypasses IP bucket after 429');
}
{
  // Key bucket: 300/min pro. Empujamos 300 keyed y esperamos 429.
  let got429 = false;
  for (let i = 0; i < 302; i++) {
    const r = await get(`?domain=k${i}.com`, { authorization: 'Bearer uta_biz_testkey' });
    if (r.status === 429) { got429 = true; break; }
  }
  // business rpm=1200: 302 no alcanza; probamos con la key pro (rpm=300)
  ok(!got429, 'business key under its 1200 rpm limit');
  let pro429 = false;
  for (let i = 0; i < 305; i++) {
    const r = await get(`?domain=p${i}.com`, { authorization: 'Bearer uta_pro_testkey' });
    if (r.status === 429) { pro429 = true; break; }
  }
  ok(pro429, 'pro key bucket 429 at 300 rpm');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
