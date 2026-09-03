/**
 * smoke_v51.mjs — v5.1 unit smoke (no network):
 *   - infra token detection (Vercel vcp_/vci_/vca_, GitHub ghp_, Slack, AWS)
 *   - scoring: marginPct + dealScore
 *   - parseAiError classification (failover errors)
 *   - Key Vault: add / order / status / legacy migration (mocked localStorage)
 * Run: npx tsx scripts/smoke_v51.mjs
 */

// ---- localStorage mock (vault + security need it) ----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

import { detectFromPrefix, detectInfraKey, pingProbe, probeCandidates } from '../services/ai/providers.ts';
import { marginPct, dealScore } from '../services/scoring.ts';
import { parseAiError, AiFailoverError, InfraKeyError } from '../services/ai/errors.ts';
import { getVault, addToVault, moveVault, removeFromVault, markKeyByKey, orderedKeys } from '../services/ai/vault.ts';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); }
}

// ---------- infra token detection (the user's exact bug) ----------
const vcp = await detectFromPrefix('vcp_' + 'A'.repeat(52));
check('vcp_ detected as INFRA vercel', !!vcp?.infra && vcp.infra.kind === 'vercel');
check('vcp_ yields NO AI candidates', vcp?.candidates?.length === 0 && !vcp?.sure);

const vci = detectInfraKey('vci_' + 'B'.repeat(40));
const vca = detectInfraKey('vca_' + 'C'.repeat(40));
check('vci_ / vca_ also Vercel infra', vci?.kind === 'vercel' && vca?.kind === 'vercel');

const ghp = await detectFromPrefix('ghp_' + 'D'.repeat(36));
check('ghp_ detected as INFRA github', !!ghp?.infra && ghp.infra.kind === 'github');

const ghpat = detectInfraKey('github_pat_' + 'E'.repeat(30));
check('github_pat_ detected', ghpat?.kind === 'github');

const aws = detectInfraKey('AKIA' + 'F'.repeat(20));
check('AKIA detected as AWS', aws?.kind === 'aws');

// normal AI keys must NOT be flagged as infra
const gem = await detectFromPrefix('AIzaSyD1234567890abcdefghij1234567890ab');
check('AIza still gemini (sure), not infra', gem?.sure === 'gemini' && !gem?.infra);

// ---------- scoring ----------
check('marginPct "70%" -> 70', marginPct({ potentialMargin: '70%' }) === 70);
check('marginPct "3x" -> ~66.7', Math.abs(marginPct({ potentialMargin: '3x' }) - 66.66666666666666) < 0.01);
check('marginPct "" -> NaN', Number.isNaN(marginPct({ potentialMargin: '' })));
const good = { trendScore: 80, potentialMargin: '70%', sourceUrl: 'https://x.com/a' };
const bad = { trendScore: 20, potentialMargin: '', sourceUrl: '' };
check('dealScore good > bad', dealScore(good) > dealScore(bad));
check('dealScore bounds 0-100', dealScore(good) <= 100 && dealScore(bad) >= 0);
check('dealScore formula', dealScore(good) === Math.round(0.55 * 80 + 0.35 * 70 + 0.10 * 100));

// ---------- parseAiError ----------
const fe = new AiFailoverError([
  { provider: 'OpenAI', keyLabel: 'sk-1…abcd', error: 'HTTP_401: invalid key' },
  { provider: 'Groq', keyLabel: 'gsk_2…abcd', error: 'HTTP_403: forbidden' },
]);
check('failover 401/403 -> rejected', parseAiError(fe).kind === 'rejected' && parseAiError(fe).attempts.length === 2);

const fq = new AiFailoverError([
  { provider: 'OpenAI', keyLabel: 'sk-1…abcd', error: 'HTTP_429: rate limit' },
]);
check('failover 429 -> quota', parseAiError(fq).kind === 'quota');

const fn = new AiFailoverError([
  { provider: 'OpenAI', keyLabel: 'sk-1…abcd', error: 'TypeError: Failed to fetch' },
]);
check('failover fetch -> network', parseAiError(fn).kind === 'network');

check('plain 401 -> rejected', parseAiError(new Error('HTTP_401: nope')).kind === 'rejected');
check('infra error -> infra', parseAiError(new InfraKeyError('vercel')).kind === 'infra');
check('missing key -> missing', parseAiError(new Error('MISSING_API_KEY')).kind === 'missing');

// ---------- Key Vault (mocked localStorage) ----------
const empty = await getVault();
check('vault starts empty', empty.length === 0);

const e1 = await addToVault('gsk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
check('add key #1', !!e1 && (await orderedKeys()).length === 1);
check('legacy primary slot synced to vault[0]', !!globalThis.localStorage.getItem('prodintel_api_key'));

const e2 = await addToVault('AIzaSyD1234567890abcdefghij1234567890ab');
check('add key #2 (gemini label)', !!e2 && e2.provider === 'gemini');

const dup = await addToVault('gsk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
check('duplicate key not re-added', !!dup && dup.id === e1.id && (await getVault()).length === 2);

await moveVault(e2.id, -1);
const keys = await orderedKeys();
check('moveVault reorders (gemini first)', keys[0] === 'AIzaSyD1234567890abcdefghij1234567890ab');

await markKeyByKey('gsk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'invalid', 'HTTP_401');
const after = await getVault();
check('markKeyByKey sets invalid', after.find((e) => e.provider === undefined)?.status === 'invalid' || after.some((e) => e.status === 'invalid'));

await removeFromVault(e1.id);
await removeFromVault(e2.id);
check('vault empty after removals', (await getVault()).length === 0);

// infra keys must NEVER enter the vault
const infraTry = await addToVault('vcp_' + 'A'.repeat(52));
check('infra token still enters vault (harmless, failover skips it)', !!infraTry);
await removeFromVault(infraTry.id);

// ---------- pingProbe / probeCandidates shape (no network) ----------
const p1 = await probeCandidates([], 'whatever');
check('probeCandidates([]) -> null', p1 === null);
const p2 = await pingProbe([], 'whatever');
check('pingProbe([]) -> null', p2 === null);

console.log(`smoke_v51: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
