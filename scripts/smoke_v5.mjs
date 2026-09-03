/**
 * smoke_v5.mjs — quick unit smoke of the new v5 pure logic (no network):
 *   - providers.ts: prefix detection for every known key format
 *   - security.ts: sanitize/validate/mask + safeExternalUrl + isPrivateHost
 *   - dataSources.ts: signalsToPromptContext / dedupe ranking shape
 * Run: node scripts/smoke_v5.mjs
 */
import { detectFromPrefix, PROVIDERS } from '../services/ai/providers.ts';
import { sanitizeApiKey, looksLikeApiKey, maskKey, safeExternalUrl, isPrivateHost } from '../services/security.ts';
import { signalsToPromptContext } from '../services/dataSources.ts';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); }
}

// ---------- prefix detection ----------
const gemini = await detectFromPrefix('AIzaSyD1234567890abcdefghij1234567890ab');
check('AIza -> gemini (sure)', gemini?.sure === 'gemini');

const anthropic = await detectFromPrefix('sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
check('sk-ant -> anthropic (sure)', anthropic?.sure === 'anthropic');

const groq = await detectFromPrefix('gsk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
check('gsk_ -> groq (sure)', groq?.sure === 'groq');

const openrouter = await detectFromPrefix('sk-or-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
check('sk-or -> openrouter (sure)', openrouter?.sure === 'openrouter');

const openai = await detectFromPrefix('sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
check('sk-proj -> openai (sure)', openai?.sure === 'openai');

const skAmbiguous = await detectFromPrefix('sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
check('sk- generic -> [openai, deepseek] probe', !skAmbiguous?.sure && skAmbiguous?.candidates?.[0] === 'openai' && skAmbiguous.candidates[1] === 'deepseek');

const unknownPrefix = await detectFromPrefix('vcp_' + 'A'.repeat(52));
check('unknown prefix -> probe list >= 5', !unknownPrefix?.sure && unknownPrefix?.candidates?.length >= 5);

const mistralish = await detectFromPrefix('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
check('32+ alnum -> mistral candidate', !mistralish?.sure && mistralish?.candidates?.includes('mistral'));

const garbage = await detectFromPrefix('<script>alert(1)</script>');
check('injection attempt rejected', garbage === null);

const registry = Object.values(PROVIDERS);
check('registry has 13 providers', registry.length === 13);
check('every provider has name+defaultModel (except custom)', registry.filter(p => p.id !== 'custom').every(p => p.name && p.models.length > 0));

// ---------- security ----------
check('sanitize strips zero-width', sanitizeApiKey('AIza\u200Babc def') === 'AIzaabcdef');
check('looksLikeApiKey ok', looksLikeApiKey('sk-ant-api03-abcdefghij') === true);
check('looksLikeApiKey rejects html', looksLikeApiKey('<script>alert(1)</script>') === false);
check('looksLikeApiKey rejects spaces', looksLikeApiKey('my password here') === false);
check('mask keeps 4+4', /^AIza.{4,10}90ab$/.test(maskKey('AIzaSyD1234567890abcdefghij1234567890ab')));
check('safeExternalUrl blocks javascript:', safeExternalUrl('javascript:alert(1)') === null);
check('safeExternalUrl blocks data:', safeExternalUrl('data:text/html,<h1>') === null);
check('safeExternalUrl accepts https', safeExternalUrl('https://www.amazon.com/dp/B0X') !== null);
check('safeExternalUrl blocks credentials', safeExternalUrl('https://user:pass@amazon.com') === null);
check('isPrivateHost blocks 169.254 metadata', isPrivateHost('169.254.169.254') === true);
check('isPrivateHost blocks localhost', isPrivateHost('localhost') === true);
check('isPrivateHost allows public', isPrivateHost('www.amazon.com') === false);

// ---------- signals prompt ----------
const ctx = signalsToPromptContext([
  { title: 'Mini thermal printer viral on TikTok', url: 'https://www.reddit.com/r/dropship/x', source: 'reddit', score: 420, ageHours: 3 },
  { title: 'Google Trends: silk bonnet', url: 'https://trends.google.com/x', source: 'googletrends', score: 900, ageHours: 6 },
], 2);
check('prompt context has REAL urls', ctx.includes('https://www.reddit.com/r/dropship/x') && ctx.includes('silk bonnet'));

console.log(`smoke_v5: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
