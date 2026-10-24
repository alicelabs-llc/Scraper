/**
 * api/reputation.ts — UTA Domain Reputation Endpoint (engine uta-reputation-v1.2, API v1.3)
 *
 * PATCH FREEMIUM (UTA Trust): añade tier premium con API keys + batch, dejando el
 * camino FREE 100% idéntico (mismos campos, mismos headers de caché, mismos errores).
 *
 *   FREE (sin key, como siempre):
 *     GET  /api/reputation?url=https://bit.ly/abc
 *     GET  /api/reputation?domain=aliexpress.com
 *     GET  /api/reputation?probe=1              -> availability check
 *     POST /api/reputation  {"url": "..."}      -> same verdict as GET
 *
 *   PREMIUM (con API key, freemium):
 *     GET  /api/reputation?domain=X  +  Authorization: Bearer uta_pro_xxx
 *     GET  /api/reputation?domain=X&key=uta_pro_xxx          (alternativa)
 *     POST /api/reputation {"key":"uta_pro_xxx","domains":["a.com","b.com",...]}
 *         -> {"engine","tier","count","results":[...]}          (batch)
 *
 *   La key se define en la env var de Vercel UTA_PREMIUM_KEYS (JSON):
 *     {
 *       "uta_pro_xxx":  { "tier": "pro",      "max_batch": 50,  "rpm": 300  },
 *       "uta_biz_xxx":  { "tier": "business", "max_batch": 500, "rpm": 1200 }
 *     }
 *   Sin env var definida, el endpoint se comporta exactamente como v1.2 (free only).
 *
 * Spec (canonical): alicelabs-llc/universal-trust-adapter · api/reputation-spec.md
 * Engine: imported from services/sourceTrust.ts — single source of truth.
 *
 * Design guarantees (se mantienen):
 *  - Free path: no secrets, no keys required, no external calls, free forever.
 *  - Deterministic per (engine version, domain). Free responses CDN-cacheable 24h.
 *  - Keyed responses son SIEMPRE no-store (el tier no debe cachearse en CDN
 *    compartido y el batch es por-request).
 *  - Fail-soft contract para DISPLAY; fail-closed es política del CALLER (spec §6).
 *  - Runtime: Vercel Edge (Web APIs only). Deploys with this repo, zero config.
 */

import { evaluateDomain, REPUTATION_ENGINE_VERSION } from '../services/sourceTrust';

export const config = { runtime: 'edge' };

const SPEC_URL = 'https://github.com/alicelabs-llc/universal-trust-adapter/blob/main/api/reputation-spec.md';

// ---------------------------------------------------------------------------
// Premium keys (freemium) — parsed lazily once per isolate.
// ---------------------------------------------------------------------------
interface PremiumKey {
  tier: string;
  max_batch: number;
  rpm: number;
}

let keysCache: Record<string, PremiumKey> | null | undefined; // undefined = not parsed yet

function premiumKeys(): Record<string, PremiumKey> | null {
  if (keysCache !== undefined) return keysCache;
  try {
    const raw = typeof process !== 'undefined' ? process.env.UTA_PREMIUM_KEYS : undefined;
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const clean: Record<string, PremiumKey> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'object' && v !== null) {
          const o = v as Record<string, unknown>;
          clean[k] = {
            tier: typeof o.tier === 'string' ? o.tier : 'pro',
            max_batch: typeof o.max_batch === 'number' && o.max_batch > 0 ? Math.floor(o.max_batch) : 50,
            rpm: typeof o.rpm === 'number' && o.rpm > 0 ? Math.floor(o.rpm) : 300,
          };
        }
      }
      keysCache = Object.keys(clean).length > 0 ? clean : null;
    } else {
      keysCache = null;
    }
  } catch {
    keysCache = null; // env ausente o inválido -> free-only (nunca romper el free path)
  }
  return keysCache;
}

// ----- anti-abuse: per-IP token bucket (per-isolate, light but real) — FREE path -----
const WINDOW_MS = 60_000;
const MAX_REQ = 60;
const buckets = new Map<string, { count: number; reset: number }>();

// ----- per-key bucket (PREMIUM path) -----
const keyBuckets = new Map<string, { count: number; reset: number }>();

function hit(map: Map<string, { count: number; reset: number }>, id: string, max: number): boolean {
  const now = Date.now();
  const b = map.get(id);
  if (!b || now > b.reset) {
    map.set(id, { count: 1, reset: now + WINDOW_MS });
    if (map.size > 5000) map.clear(); // hard memory cap
    return false;
  }
  b.count += 1;
  return b.count > max;
}

function rateLimited(ip: string): boolean {
  return hit(buckets, ip, MAX_REQ);
}

function clientIp(req: Request): string {
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200, cacheSeconds = 86400): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS,
  };
  if (cacheSeconds > 0) {
    // Free path: deterministic per input per engine version -> CDN-cacheable.
    headers['Cache-Control'] = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=604800`;
  } else {
    // Keyed path: nunca cacheable en CDN compartido.
    headers['Cache-Control'] = 'private, no-store';
  }
  return new Response(JSON.stringify(body, null, 2), { status, headers });
}

/** Extrae la API key de: Authorization Bearer > ?key= > body.key. */
function extractKey(req: Request, url: URL, body: Record<string, unknown> | null): string | null {
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const k = auth.slice(7).trim();
    if (k) return k;
  }
  const q = url.searchParams.get('key');
  if (q && q.trim()) return q.trim();
  if (body && typeof body.key === 'string' && (body.key as string).trim()) {
    return (body.key as string).trim();
  }
  return null;
}

function assessmentJson(input: string, tier?: string): Record<string, unknown> {
  const a = evaluateDomain(input);
  const out: Record<string, unknown> = {
    engine: REPUTATION_ENGINE_VERSION,
    input,
    domain: a.domain,
    verdict: a.verdict,
    status: a.status,
    score: a.score,
    reasons: a.reasons,
    checked_at: new Date().toISOString(),
    ttl: 86400,
  };
  if (tier) out.tier = tier;
  return out;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'method not allowed', engine: REPUTATION_ENGINE_VERSION }, 405);
  }

  const requestUrl = new URL(req.url);

  // ---- leer body UNA sola vez (POST); los errores se reproducen en el mismo
  // ---- orden que v1.2 en el camino free (429 antes que 400/413).
  let bodyText = '';
  let bodyReadError = false;
  if (req.method === 'POST') {
    try {
      bodyText = await req.text();
    } catch {
      bodyReadError = true;
    }
  }
  const tooLarge = bodyText.length > 4096;
  let body: Record<string, unknown> | null = null;
  let bodyParseError = false;
  if (bodyText) {
    try {
      const p = JSON.parse(bodyText);
      if (p && typeof p === 'object' && !Array.isArray(p)) body = p as Record<string, unknown>;
      else bodyParseError = true;
    } catch {
      bodyParseError = true;
    }
  }

  // ---- resolución de key (header > query > body) ----
  const keyStr = extractKey(req, requestUrl, body);
  const keys = keyStr ? premiumKeys() : null;
  const premium = keyStr && keys ? keys[keyStr] : null;

  if (keyStr && !premium) {
    // Key presentada pero no reconocida -> 401 explícito (fail-closed para premium).
    return json({ error: 'invalid API key', engine: REPUTATION_ENGINE_VERSION }, 401, 0);
  }

  // =====================================================================
  // PREMIUM PATH (key válida): bucket por key, single o batch, no-store.
  // =====================================================================
  if (premium) {
    if (hit(keyBuckets, keyStr as string, premium.rpm)) {
      return json(
        { error: 'rate limited', tier: premium.tier, rpm: premium.rpm, engine: REPUTATION_ENGINE_VERSION },
        429,
        0
      );
    }

    // probe sigue disponible para clientes premium (idéntico al free)
    if (requestUrl.searchParams.has('probe')) {
      return json({ probe: true, engine: REPUTATION_ENGINE_VERSION, tier: premium.tier, spec: SPEC_URL });
    }

    // --- BATCH: POST {"key":"...", "domains":[...]} ---
    if (body && Array.isArray(body.domains)) {
      const list = body.domains as unknown[];
      if (list.length === 0) {
        return json({ error: 'batch requires a non-empty "domains" array', engine: REPUTATION_ENGINE_VERSION, tier: premium.tier }, 400, 0);
      }
      if (list.length > premium.max_batch) {
        return json(
          {
            error: `batch too large: ${list.length} domains, max ${premium.max_batch} for tier ${premium.tier}`,
            engine: REPUTATION_ENGINE_VERSION,
            tier: premium.tier,
          },
          400,
          0
        );
      }
      if (list.some((d) => typeof d !== 'string' || (d as string).length > 2048)) {
        return json({ error: 'invalid domain entry (must be strings, max 2048 chars each)', engine: REPUTATION_ENGINE_VERSION, tier: premium.tier }, 400, 0);
      }
      const results = (list as string[]).map((d) => assessmentJson(d, premium.tier));
      return json(
        { engine: REPUTATION_ENGINE_VERSION, tier: premium.tier, count: results.length, results },
        200,
        0
      );
    }

    // Si piden batch sin key, se lo decimos claro (no nos lo callamos).
    if (body && 'domains' in body) {
      return json({ error: 'batch requires a valid API key (see UTA Trust PRO)', engine: REPUTATION_ENGINE_VERSION }, 400, 0);
    }

    // --- SINGLE keyed ---
    let input = requestUrl.searchParams.get('url') || requestUrl.searchParams.get('domain') || '';
    if (req.method === 'POST' && body) {
      input = (typeof body.url === 'string' && body.url) || (typeof body.domain === 'string' && body.domain) || input;
    }
    if (!input) {
      return json(
        {
          error: 'missing input: pass ?url= or ?domain= (GET), or {"url"|"domain"} (POST)',
          engine: REPUTATION_ENGINE_VERSION,
          tier: premium.tier,
          spec: SPEC_URL,
        },
        400,
        0
      );
    }
    return json(assessmentJson(input, premium.tier), 200, 0);
  }

  // =====================================================================
  // FREE PATH — idéntico a v1.2 (rate limit IP -> probe -> errores body -> eval)
  // =====================================================================
  if (rateLimited(clientIp(req))) {
    return json({ error: 'rate limited', engine: REPUTATION_ENGINE_VERSION }, 429, 10);
  }

  // Availability probe (used by clients to enable server-verified badges).
  if (requestUrl.searchParams.has('probe')) {
    return json({ probe: true, engine: REPUTATION_ENGINE_VERSION, spec: SPEC_URL });
  }

  if (req.method === 'POST' && bodyReadError) {
    return json({ error: 'invalid body', engine: REPUTATION_ENGINE_VERSION }, 400);
  }
  if (tooLarge) {
    return json({ error: 'body too large', engine: REPUTATION_ENGINE_VERSION }, 413);
  }
  if (bodyParseError) {
    return json({ error: 'invalid JSON body', engine: REPUTATION_ENGINE_VERSION }, 400);
  }
  if (req.method === 'POST' && body && 'domains' in body) {
    return json({ error: 'batch requires a valid API key (see UTA Trust PRO)', engine: REPUTATION_ENGINE_VERSION }, 400, 0);
  }

  // Input: query param (GET) or JSON body (POST, wins).
  let input = requestUrl.searchParams.get('url') || requestUrl.searchParams.get('domain') || '';
  if (req.method === 'POST' && body) {
    input = (typeof body.url === 'string' && body.url) || (typeof body.domain === 'string' && body.domain) || input;
  }

  if (!input) {
    return json(
      {
        error: 'missing input: pass ?url= or ?domain= (GET), or {"url"|"domain"} (POST)',
        engine: REPUTATION_ENGINE_VERSION,
        spec: SPEC_URL,
      },
      400
    );
  }

  return json(assessmentJson(input));
}
