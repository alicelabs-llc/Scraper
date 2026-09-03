/**
 * test_api_signals.mjs — local harness for the /api/signals edge handler.
 * Bundles api/signals.ts with esbuild and exercises: probe, method guard,
 * rate limit, and the fail-soft merge (upstream fetches may fail in CI —
 * the endpoint must still return valid JSON with sources: 0).
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'url';

const out = '/tmp/api_signals.bundle.mjs';
await build({
  entryPoints: ['api/signals.ts'],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['node:*'],
});

const mod = await import(pathToFileURL(out).href);
const handler = mod.default;

let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else { fail++; console.error('  FAIL:', n); } };

// probe
const base = 'https://prodintel.local/api/signals';
const r1 = await handler(new Request(`${base}?probe=1`));
check('probe 200', r1.status === 200);
const j1 = await r1.json();
check('probe payload', j1.probe === true && j1.version === 'v5');

// method guard
const r2 = await handler(new Request(base, { method: 'DELETE' }));
check('DELETE -> 405', r2.status === 405);

// CORS preflight
const r3 = await handler(new Request(base, { method: 'OPTIONS' }));
check('OPTIONS -> 204 + CORS', r3.status === 204 && r3.headers.get('Access-Control-Allow-Origin') === '*');

// full request (fail-soft: whatever it can fetch) — first of 40/minute
const r4 = await handler(new Request(`${base}?geo=US`));
check('signals 200', r4.status === 200);
const j4 = await r4.json();
check('signals shape', typeof j4.sources === 'object' && Array.isArray(j4.signals));
check('signals geo normalized', j4.geo === 'US');
check('signals cache header', /s-maxage=900/.test(r4.headers.get('Cache-Control') || ''));

// geo sanitization
const r5 = await handler(new Request(`${base}?geo=%3Cscript%3E`));
const j5 = await r5.json();
check('geo sanitized to US', j5.geo === 'US');

// rate limit: hammer the same "ip" (no headers -> 'unknown') — MAX_REQ=40
let limited = false;
for (let i = 0; i < 50; i++) {
  const r = await handler(new Request(`${base}?probe=1`));
  if (r.status === 429) { limited = true; break; }
}
check('rate limit kicks in (>40/min)', limited);

console.log(`api_signals: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
