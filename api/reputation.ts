/**
 * api/reputation.ts — UTA Domain Reputation Endpoint (uta-reputation-v1.2)
 *
 * The HTTP surface of the Source Safety Gate: ANY app, bot or AI agent can
 * ask "can I trust this domain?" and get a deterministic, transparent verdict.
 *
 *   GET  /api/reputation?url=https://bit.ly/abc
 *   GET  /api/reputation?domain=aliexpress.com
 *   GET  /api/reputation?probe=1              -> availability check
 *   POST /api/reputation  {"url": "..."}      -> same verdict as GET
 *
 * Spec (canonical): alicelabs-llc/universal-trust-adapter · api/reputation-spec.md
 * Engine: imported from services/sourceTrust.ts — single source of truth shared
 *         with the client-side badges (client verdict == server verdict, always).
 *
 * Design guarantees:
 *  - No secrets, no API keys, no external calls: free forever, zero egress.
 *  - Deterministic per (engine version, domain): safe to cache 24h.
 *  - Fail-soft contract for DISPLAY consumers (badge shows "unknown" on error),
 *    fail-closed semantics are the caller's policy for ACTIONS (see spec §6).
 *  - Runtime: Vercel Edge (Web APIs only). Deploys with this repo, zero config.
 */

import { evaluateDomain, REPUTATION_ENGINE_VERSION } from '../services/sourceTrust';

export const config = { runtime: 'edge' };

const SPEC_URL = 'https://github.com/alicelabs-llc/universal-trust-adapter/blob/main/api/reputation-spec.md';

// ----- anti-abuse: per-IP token bucket (per-isolate, light but real) -----
const WINDOW_MS = 60_000;
const MAX_REQ = 60;
const buckets = new Map<string, { count: number; reset: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.reset) {
    buckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    if (buckets.size > 5000) buckets.clear(); // hard memory cap
    return false;
  }
  b.count += 1;
  return b.count > MAX_REQ;
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
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200, cacheSeconds = 86400): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Deterministic per input per engine version -> CDN-cacheable for a day.
      'Cache-Control': `public, s-maxage=${cacheSeconds}, stale-while-revalidate=604800`,
      ...CORS,
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'method not allowed', engine: REPUTATION_ENGINE_VERSION }, 405);
  }

  if (rateLimited(clientIp(req))) {
    return json({ error: 'rate limited', engine: REPUTATION_ENGINE_VERSION }, 429, 10);
  }

  const requestUrl = new URL(req.url);

  // Availability probe (used by clients to enable server-verified badges).
  if (requestUrl.searchParams.has('probe')) {
    return json({ probe: true, engine: REPUTATION_ENGINE_VERSION, spec: SPEC_URL });
  }

  // Input: query param (GET) or JSON body (POST, wins).
  let input = requestUrl.searchParams.get('url') || requestUrl.searchParams.get('domain') || '';
  if (req.method === 'POST') {
    let bodyText = '';
    try {
      bodyText = await req.text();
    } catch {
      return json({ error: 'invalid body', engine: REPUTATION_ENGINE_VERSION }, 400);
    }
    if (bodyText.length > 4096) {
      return json({ error: 'body too large', engine: REPUTATION_ENGINE_VERSION }, 413);
    }
    try {
      const body = JSON.parse(bodyText);
      if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        input = (typeof b.url === 'string' && b.url) || (typeof b.domain === 'string' && b.domain) || input;
      }
    } catch {
      return json({ error: 'invalid JSON body', engine: REPUTATION_ENGINE_VERSION }, 400);
    }
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

  const assessment = evaluateDomain(input);
  return json({
    engine: REPUTATION_ENGINE_VERSION,
    input,
    domain: assessment.domain,
    verdict: assessment.verdict,
    status: assessment.status,
    score: assessment.score,
    reasons: assessment.reasons,
    checked_at: new Date().toISOString(),
    ttl: 86400,
  });
}
