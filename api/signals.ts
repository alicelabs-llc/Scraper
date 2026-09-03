/**
 * api/signals.ts — FREE keyless market-signals endpoint (server-side scraping).
 *
 * GET /api/signals            → merged live signals (Reddit + HN + Google Trends)
 * GET /api/signals?probe=1    → availability check
 *
 * Why server-side: Google Trends RSS and some Reddit responses are not
 * browser-CORS friendly; the edge function fetches them natively, in
 * parallel, with hard timeouts, and returns ONE merged JSON payload.
 *
 * Security (anti-abuse):
 *  - NO user-supplied URLs are ever fetched (fixed internal allowlist only).
 *  - Per-IP token bucket (lightweight, per-isolate).
 *  - Response cached at the CDN (s-maxage) to protect upstream sources.
 *  - Runtime: Vercel Edge. Deploys with this repo, zero config.
 */

export const config = { runtime: "edge" };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ----- per-IP rate limit (in-memory token bucket, per isolate) -----
const WINDOW_MS = 60_000;
const MAX_REQ = 40;
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

function json(body: unknown, status = 200, cacheSeconds = 900): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`,
      ...CORS,
    },
  });
}

async function fetchWithTimeout(url: string, ms: number, headers?: Record<string, string>): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "ProdIntel/5.0 (Alicelabs; signals bot)", ...(headers || {}) } });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ----- Google Trends RSS -----
function parseTrendsRss(xml: string, geo: string): { title: string; score: number; url: string }[] {
  const out: { title: string; score: number; url: string }[] = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const item of items.slice(0, 20)) {
    const title = (item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1];
    const traffic = parseInt(((item.match(/ht:approx_traffic>([^<]+)</) || [])[1] || "0").replace(/[^0-9]/g, ""), 10) || 0;
    const newsUrl = (item.match(/<news:source><a[^>]*href="([^"]+)"/) || [])[1];
    if (!title) continue;
    const url = newsUrl || `https://trends.google.com/trends/explore?q=${encodeURIComponent(title)}&geo=${geo}`;
    out.push({ title: title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").slice(0, 200), score: traffic, url });
  }
  return out;
}

// ----- Reddit -----
const REDDIT_SUBS = ["dropship", "ecommerce", "Entrepreneur", "BusinessIdeas", "sidehustle"];

/** Country allowlist for Google Trends (strict SSRF/input hygiene). */
const ALLOWED_GEOS = new Set([
  "US", "GB", "CA", "AU", "DE", "FR", "ES", "IT", "MX", "BR", "AR", "CL", "CO", "PE",
  "NL", "SE", "PL", "JP", "KR", "IN", "CN", "HK", "TW", "SG", "AE", "SA", "ZA", "NG",
  "EG", "TR", "RU", "UA", "ID", "PH", "TH", "VN", "MY", "NZ", "IE", "CH", "AT", "BE",
  "DK", "NO", "FI", "PT", "GR", "CZ", "RO", "HU", "IL",
]);

async function redditSignals(): Promise<{ title: string; url: string; score: number }[]> {
  const results = await Promise.allSettled(
    REDDIT_SUBS.map((s) => fetchWithTimeout(`https://www.reddit.com/r/${s}/hot.json?limit=10&t=day`, 6000))
  );
  const out: { title: string; url: string; score: number }[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    try {
      const data = await r.value.json();
      for (const c of data?.data?.children || []) {
        const d = c?.data || {};
        if (!d.title || !d.permalink) continue;
        out.push({
          title: String(d.title).slice(0, 200),
          url: `https://www.reddit.com${d.permalink}`,
          score: Number(d.ups) || 0,
        });
      }
    } catch { /* ignore */ }
  }
  return out;
}

// ----- Hacker News -----
async function hnSignals(): Promise<{ title: string; url: string; score: number }[]> {
  const week = Math.floor(Date.now() / 1000) - 7 * 86400;
  const queries = ["winning product", "ecommerce trend", "tiktok shop", "amazon find"];
  const results = await Promise.allSettled(
    queries.map((q) =>
      fetchWithTimeout(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=8&numericFilters=created_at_i>${week}`,
        6000
      )
    )
  );
  const out: { title: string; url: string; score: number }[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    try {
      const data = await r.value.json();
      for (const h of data?.hits || []) {
        if (!h.title || seen.has(h.title)) continue;
        seen.add(h.title);
        out.push({
          title: String(h.title).slice(0, 200),
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          score: Number(h.points) || 0,
        });
      }
    } catch { /* ignore */ }
  }
  return out;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const ip =
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown";
  if (rateLimited(ip)) return json({ error: "rate limited" }, 429, 10);

  const requestUrl = new URL(req.url);
  if (requestUrl.searchParams.has("probe")) {
    return json({ probe: true, service: "prodintel-signals", version: "v5" });
  }

  const rawGeo = (requestUrl.searchParams.get("geo") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  const geo = ALLOWED_GEOS.has(rawGeo) ? rawGeo : "US";
  const trendsUrl = `https://trends.google.com/trending/rss?geo=${geo}`;

  const [trendsRes, reddit, hn] = await Promise.all([
    fetchWithTimeout(trendsUrl, 7000),
    redditSignals(),
    hnSignals(),
  ]);

  const trends = trendsRes ? parseTrendsRss(await trendsRes.text(), geo) : [];

  return json({
    service: "prodintel-signals",
    version: "v5",
    geo,
    sources: {
      googletrends: trends.length,
      reddit: reddit.length,
      hackernews: hn.length,
    },
    signals: [
      ...trends.map((t) => ({ ...t, source: "googletrends" as const, ageHours: 6 })),
      ...hn.map((s) => ({ ...s, source: "hackernews" as const, ageHours: 24 })),
      ...reddit.map((s) => ({ ...s, source: "reddit" as const, ageHours: 12 })),
    ].slice(0, 60),
    checked_at: new Date().toISOString(),
  });
}
