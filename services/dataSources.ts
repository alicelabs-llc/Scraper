
/**
 * dataSources.ts — FREE, keyless market signals ("scrape everything" layer).
 *
 * Aggregates real-time, public data the moment the app opens — no API key
 * required — and injects it into AI prompts so EVERY provider (not only
 * Gemini's Google Search grounding) hunts products with today's REAL urls:
 *
 *   - Reddit r/dropship, r/ecommerce, r/Entrepreneur, r/BusinessIdeas,
 *     r/sidehustle  → hot.json (public, no auth)
 *   - Hacker News (Algolia API) → last stories about product/e-commerce terms
 *   - Google Trends daily RSS → fetched server-side by /api/signals when the
 *     app is deployed on Vercel (browser CORS blocks it locally; fail-soft).
 *
 * Contract: fail-soft everywhere. One broken source never breaks the app —
 * we ship whatever arrived, cached 30 min in sessionStorage.
 */

import { safeExternalUrl } from "./security";

export type SignalSource = "reddit" | "hackernews" | "googletrends";

export interface LiveSignal {
  title: string;
  url: string;
  source: SignalSource;
  /** Raw engagement (upvotes/points/traffic estimate). */
  score: number;
  ageHours: number;
}

const CACHE_KEY = "prodintel_signals_cache";
const CACHE_MS = 30 * 60 * 1000; // 30 minutes
const FETCH_TIMEOUT = 6000;

const REDDIT_SUBS = ["dropship", "ecommerce", "Entrepreneur", "BusinessIdeas", "sidehustle"];

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

// ---------- Reddit ----------

interface RedditChild { data?: { title?: string; url?: string; ups?: number; created_utc?: number; permalink?: string } }

async function fetchReddit(): Promise<LiveSignal[]> {
  const { signal, done } = withTimeout();
  try {
    const subs = REDDIT_SUBS.map(
      (s) => `https://www.reddit.com/r/${s}/hot.json?limit=10&t=day`
    );
    const results = await Promise.allSettled(
      subs.map((u) => fetch(u, { signal, headers: { Accept: "application/json" } }))
    );
    const out: LiveSignal[] = [];
    const now = Date.now() / 1000;
    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value.ok) continue;
      try {
        const data = await r.value.json();
        const children: RedditChild[] = data?.data?.children || [];
        for (const c of children) {
          const d = c?.data;
          const url = safeExternalUrl(d?.url) || (d?.permalink ? safeExternalUrl(`https://www.reddit.com${d.permalink}`) : null);
          if (!d?.title || !url) continue;
          out.push({
            title: String(d.title).slice(0, 200),
            url,
            source: "reddit",
            score: Number(d.ups) || 0,
            ageHours: d.created_utc ? Math.max(0, (now - d.created_utc) / 3600) : 24,
          });
        }
      } catch { /* one sub failing is fine */ }
    }
    return out;
  } finally {
    done();
  }
}

// ---------- Hacker News ----------

interface HNHit { title?: string; url?: string; points?: number; created_at_i?: number; objectID?: string }

async function fetchHackerNews(): Promise<LiveSignal[]> {
  const { signal, done } = withTimeout();
  try {
    const queries = ["winning product", "ecommerce trend", "tiktok shop", "amazon find"];
    const results = await Promise.allSettled(
      queries.map((q) =>
        fetch(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=8&numericFilters=created_at_i>${Math.floor(Date.now() / 1000) - 7 * 86400}`,
          { signal }
        )
      )
    );
    const out: LiveSignal[] = [];
    const seen = new Set<string>();
    const nowSec = Date.now() / 1000;
    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value.ok) continue;
      try {
        const data = await r.value.json();
        for (const h of (data?.hits || []) as HNHit[]) {
          if (!h.title) continue;
          const url = safeExternalUrl(h.url) || (h.objectID ? `https://news.ycombinator.com/item?id=${h.objectID}` : "");
          if (!url || seen.has(h.title)) continue;
          seen.add(h.title);
          out.push({
            title: String(h.title).slice(0, 200),
            url,
            source: "hackernews",
            score: Number(h.points) || 0,
            ageHours: h.created_at_i ? Math.max(0, (nowSec - h.created_at_i) / 3600) : 24,
          });
        }
      } catch { /* ignore */ }
    }
    return out;
  } finally {
    done();
  }
}

// ---------- Google Trends (via our own /api/signals when available) ----------

async function fetchTrendsViaServer(): Promise<LiveSignal[]> {
  const { signal, done } = withTimeout();
  try {
    const res = await fetch("/api/signals", { signal });
    if (!res.ok) return [];
    const data = await res.json();
    const trends: LiveSignal[] = Array.isArray(data?.signals)
      ? data.signals.filter((s: any) => s?.source === "googletrends")
      : [];
    return trends.slice(0, 25);
  } catch {
    return []; // static hosting / local dev — honest degradation
  } finally {
    done();
  }
}

// ---------- aggregation ----------

function dedupeAndRank(signals: LiveSignal[]): LiveSignal[] {
  const byUrl = new Map<string, LiveSignal>();
  for (const s of signals) {
    if (!s.title || !s.url) continue;
    const prev = byUrl.get(s.url);
    if (!prev || prev.score < s.score) byUrl.set(s.url, s);
  }
  // engagement decays with age; fresh + hot first
  return [...byUrl.values()]
    .map((s) => ({ ...s, heat: s.score / (1 + s.ageHours / 6) }))
    .sort((a: any, b: any) => b.heat - a.heat)
    .slice(0, 40);
}

interface CacheShape { at: number; items: LiveSignal[] }

function readCache(): CacheShape | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c && Array.isArray(c.items) && Date.now() - c.at < CACHE_MS) return c;
  } catch { /* ignore */ }
  return null;
}

function writeCache(items: LiveSignal[]) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items })); } catch { /* ignore */ }
}

/** Aggregate ALL free sources (30-min cache). Never throws. */
export async function getLiveSignals(): Promise<LiveSignal[]> {
  const cached = readCache();
  if (cached) return cached.items;

  const [server, reddit, hn] = await Promise.all([
    fetchTrendsViaServer(),
    fetchReddit().catch(() => [] as LiveSignal[]),
    fetchHackerNews().catch(() => [] as LiveSignal[]),
  ]);
  const items = dedupeAndRank([...server, ...reddit, ...hn]);
  writeCache(items);
  return items;
}

/** Compact prompt block so ANY model can cite REAL, just-scraped URLs. */
export function signalsToPromptContext(signals: LiveSignal[], max = 18): string {
  if (!signals.length) return "";
  const lines = signals.slice(0, max).map((s, i) => {
    const origin = s.source === "reddit" ? "Reddit" : s.source === "hackernews" ? "HackerNews" : "GoogleTrends";
    return `${i + 1}. [${origin}] ${s.title} — ${s.url} (engagement: ${s.score}, ${Math.round(s.ageHours)}h old)`;
  });
  return lines.join("\n");
}

/** Small UI helper: source icon name. */
export function signalIcon(source: SignalSource): string {
  switch (source) {
    case "reddit": return "forum";
    case "hackernews": return "science";
    default: return "trending_up";
  }
}
