/**
 * scripts/test_reputation.mjs — regression suite for the Source Safety Gate engine.
 *
 * Run:  node scripts/test_reputation.mjs   (uses esbuild from node_modules to
 * compile services/sourceTrust.ts, then executes the parity cases).
 *
 * v1.2: includes regressions for the shortener false-positive fix — hosts whose
 * names contain "t.co" inside "<name>.com" (walmart.com, target.com, …) must
 * NOT be flagged risky, while real shorteners (t.co, bit.ly, …) still are.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(join(fileURLToPath(import.meta.url), '..'));
const esbuild = require('esbuild');

const root = join(fileURLToPath(import.meta.url), '..', '..');
const src = join(root, 'services', 'sourceTrust.ts');

const out = await esbuild.build({
  entryPoints: [src],
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  write: false,
});
const tmp = mkdtempSync(join(tmpdir(), 'rep-'));
const file = join(tmp, 'sourceTrust.mjs');
writeFileSync(file, out.outputFiles[0].text);
const { evaluateDomain, REPUTATION_ENGINE_VERSION } = await import(pathToFileURL(file));

let pass = 0, fail = 0;
const t = (input, expectedVerdict, name) => {
  const a = evaluateDomain(input);
  if (a.verdict === expectedVerdict) { pass++; return; }
  fail++;
  console.log(`FAIL ${name || input}: got ${a.verdict} (${a.score}), expected ${expectedVerdict}`);
};

// v1.2 regressions — substring 't.co' false positives
t('https://www.walmart.com/ip/123', 'trusted', 'walmart.com');
t('https://www.target.com/p/x', 'trusted', 'target.com');
t('https://www.homedepot.com/p/1', 'trusted', 'homedepot.com');
t('https://www.flipkart.com/x', 'trusted', 'flipkart.com');
t('https://blogspot.com', 'caution', 'blogspot.com root (low barrier, not shortener)');

// real shorteners are still risky
t('https://t.co/abc', 'risky', 't.co');
t('https://bit.ly/petdeal', 'risky', 'bit.ly');
t('https://www.bit.ly/x', 'risky', 'subdomain of bit.ly');
t('https://tinyurl.com/xyz', 'risky', 'tinyurl.com');
t('https://shrinkme.io/x', 'risky', 'shrinkme.* prefix pattern');

// core engine semantics intact
t('https://amazon.com/dp/B01', 'trusted', 'amazon.com');
t('https://www.aliexpress.com/item/1.html', 'trusted', 'aliexpress.com');
t('https://amaz0n-deals.net/shop', 'risky', 'brand typosquat');
t('https://amazon-secure-login.com', 'risky', 'brand + credential word');
t('https://some-random-site.io', 'unknown', 'neutral unknown');
t('http://mystore.myshopify.com', 'caution', 'myshopify low barrier');
t('https://shopify.com', 'trusted', 'shopify.com itself');
t('http://normal-site.io/page', 'caution', 'http penalty');
t('123.45.67.89/shop', 'risky', 'raw IP host');
t('https://xn--80ak6aa92e.com', 'risky', 'punycode (decodable homoglyph host)');
t('https://xn--invalid-punycode-test.com', 'risky', 'xn-- host caught by punycode check');
t('not a url at all', 'caution', 'malformed input is total');

console.log(`${REPUTATION_ENGINE_VERSION}: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
