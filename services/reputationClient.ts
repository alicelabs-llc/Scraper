
/**
 * reputationClient.ts — client for the UTA Domain Reputation endpoint (/api/reputation).
 *
 * Contract: fail-soft. This is a DISPLAY upgrade (server-confirmed badges), never
 * a blocker. If the endpoint is unreachable (e.g. static hosting), the app keeps
 * running with the local deterministic engine — the user never sees an error.
 *
 * Caching: verdicts are deterministic per (engine version, domain) -> cached 24h
 * in localStorage. A negative probe is remembered for the whole session so a
 * static deploy doesn't hammer a missing endpoint.
 */

import { REPUTATION_ENGINE_VERSION } from './sourceTrust';

export interface ServerVerdict {
  domain: string;
  verdict: 'trusted' | 'unknown' | 'caution' | 'risky';
  score: number;
  reasons: string[];
  engine: string;
  source: 'server';
}

const ENDPOINT_PATH = '/api/reputation';
const CACHE_KEY = 'prodintel_reputation_v1';
const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 4500;
const MAX_CONCURRENT = 6;
const MAX_BATCH = 24;

let probeResult: boolean | null = null;

function readCache(): Record<string, { v: ServerVerdict; ts: number }> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, { v: ServerVerdict; ts: number }>): void {
  try {
    // Keep it bounded: latest 200 entries.
    const entries = Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts).slice(0, 200);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* storage full/quota: cache is best-effort */ }
}

function cachedFresh(domain: string): ServerVerdict | null {
  const hit = readCache()[domain];
  if (hit && Date.now() - hit.ts < TTL_MS && hit.v.engine === REPUTATION_ENGINE_VERSION) return hit.v;
  return null;
}

/** Is the reputation endpoint available on this origin? Probed once per session. */
export async function probeReputationEndpoint(): Promise<boolean> {
  if (probeResult !== null) return probeResult;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${ENDPOINT_PATH}?probe=1`, { signal: ctrl.signal });
    clearTimeout(timer);
    probeResult = res.ok;
  } catch {
    probeResult = false;
  }
  return probeResult;
}

/** Ask the endpoint for a single verdict. Throws only on unavailability/timeout. */
async function fetchVerdict(url: string): Promise<ServerVerdict> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`reputation ${res.status}`);
    const data = await res.json();
    if (!data || !data.verdict || typeof data.score !== 'number') throw new Error('reputation bad payload');
    return {
      domain: data.domain,
      verdict: data.verdict,
      score: data.score,
      reasons: Array.isArray(data.reasons) ? data.reasons : [],
      engine: data.engine || REPUTATION_ENGINE_VERSION,
      source: 'server',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify a set of source URLs against the live endpoint (dedup by domain,
 * bounded concurrency, cached results served instantly). Calls onUpdate per
 * verdict as it arrives. Returns an abort function.
 *
 * Silent no-op when the endpoint is not available (static hosting).
 */
export function batchVerifySources(
  urls: (string | undefined | null)[],
  onUpdate: (verdict: ServerVerdict) => void
): () => void {
  const ctrl = new AbortController();
  (async () => {
    if (ctrl.signal.aborted) return;
    if (!(await probeReputationEndpoint())) return;

    const seen = new Set<string>();
    const pending: string[] = [];
    for (const u of urls) {
      if (!u || typeof u !== 'string' || !u.startsWith('http') || seen.size >= MAX_BATCH) continue;
      let domain = u;
      try { domain = new URL(u).hostname.toLowerCase(); } catch { continue; }
      if (seen.has(domain)) continue;
      seen.add(domain);

      const fresh = cachedFresh(domain);
      if (fresh) { onUpdate(fresh); continue; }
      pending.push(u);
    }

    // Bounded-concurrency worker pool.
    let index = 0;
    const worker = async () => {
      while (!ctrl.signal.aborted) {
        const current = pending[index++];
        if (!current) return;
        try {
          const v = await fetchVerdict(current);
          if (ctrl.signal.aborted) return;
          const cache = readCache();
          cache[v.domain] = { v, ts: Date.now() };
          writeCache(cache);
          onUpdate(v);
        } catch { /* fail-soft: this domain just stays local-only */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, pending.length) }, worker));
  })().catch(() => { /* never let verification break the UI */ });

  return () => ctrl.abort();
}
