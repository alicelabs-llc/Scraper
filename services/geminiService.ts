
/**
 * ProdIntel AI service — v5 "Universal Provider" edition.
 *
 * ANY API key works (BYOK): Gemini, OpenAI, Claude, Groq, OpenRouter,
 * DeepSeek, Mistral, xAI, Cerebras, Fireworks, Together, Z.ai or any
 * OpenAI-compatible endpoint. Detection lives in services/ai/*.
 *
 * v5 additions:
 *  - Every prompt is enriched with LIVE free-source signals (Reddit / HN /
 *    Google Trends — see services/dataSources.ts), so non-grounding models
 *    can still cite REAL, just-scraped URLs.
 *  - Google Search grounding stays available on Gemini (used when present).
 *  - Local rate limiting on expensive actions (anti-abuse).
 *
 * Key resolution (BYOK first, env as dev fallback):
 *   1. localStorage 'prodintel_api_key' (user's own key)
 *   2. process.env.API_KEY (only for local development via vite define)
 */

import { Language } from "../types";
import {
  aiGenerate, resolveAi, testConnectionFast,
  getStoredModel, setStoredModel, providerSummary,
} from "./ai/client";
import { MissingApiKeyError, GroundingSource, WinningProductRaw } from "./ai/types";
import { getLiveSignals, signalsToPromptContext } from "./dataSources";
import { rateLimitLocal } from "./security";

// ---- re-exports (public API compat) ----
export { MissingApiKeyError } from "./ai/types";
export type { GroundingSource, WinningProductRaw } from "./ai/types";
export { getApiKey, setApiKey } from "./ai/client";
export { providerSummary, invalidateDetection } from "./ai/client";
export { lastServed } from "./ai/client";
export { parseAiError } from "./ai/errors";
export type { ParsedAiError } from "./ai/errors";
export { addToVault, removeFromVault, getVault, moveVault, VAULT_EVENT } from "./ai/vault";
export type { VaultEntry } from "./ai/vault";

// Legacy model helpers — kept so older imports keep working.
export const getModel = (quality = false): string => {
  const stored = getStoredModel();
  if (stored) return stored;
  return quality ? "gemini-pro-latest" : "gemini-flash-latest";
};
export const setModel = (model: string) => setStoredModel(model);

// ---------- prompt helpers ----------

const LANG_NAMES: Record<Language, string> = {
  es: "Spanish (Español)",
  en: "English",
  fr: "French (Français)",
  de: "German (Deutsch)",
  zh: "Simplified Chinese (简体中文)",
};

// Dynamic date — prompts always anchored to TODAY, never a stale hardcoded month.
const dateContext = () =>
  new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// Every AI answer respects the UI language selected by the user.
const langDirective = (lang: Language) =>
  `\n\nRESPONSE LANGUAGE (MANDATORY): write ALL text fields in ${LANG_NAMES[lang]}.`;

// ---------- JSON safety ----------

const cleanJson = (text: string) =>
  text.replace(/```json/g, "").replace(/```/g, "").trim();

// JSON parse with brace/bracket recovery — one malformed model answer never crashes the UI.
const parseJsonSafe = <T,>(text: string, fallback: T): T => {
  const raw = cleanJson(text || "");
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/[[{][\s\S]*[\]}]/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch { /* fall through */ }
    }
    return fallback;
  }
};

/** Some providers force JSON objects; unwrap {"products": [...]} envelopes. */
const unwrapArray = <T,>(data: unknown, key: string): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const inner = (data as any)[key];
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isFatal = (err: unknown): boolean => {
  const name = (err as Error)?.name || "";
  const msg = String((err as Error)?.message || err || "");
  // v5.1: aiGenerate already walked the whole key vault — retrying the same
  // list here would only burn the user's quota. Failover errors are final.
  if (name === "AiFailoverError" || name === "InfraKeyError") return true;
  return (
    msg.includes("MISSING_API_KEY") ||
    msg.includes("KEY_REJECTED") ||
    msg.includes("KEY_FORMAT") ||
    msg.includes("NO_PROVIDER") ||
    msg.includes("ALL_PROVIDERS_FAILED") ||
    msg.includes("INFRA_KEY") ||
    msg.includes("CUSTOM_NO_") ||
    msg.includes("API key not valid") ||
    msg.includes("permission") ||
    msg.includes("401") ||
    msg.includes("403")
  );
};

// Retry with backoff — transient 429/500s recover silently, auth errors fail fast.
const withRetry = async <T,>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isFatal(err)) throw err;
      await sleep(700 * (i + 1));
    }
  }
  throw lastErr;
};

/**
 * Live free-source context, fetched once per scan (30-min cache inside).
 * Fail-soft: empty string when every source is unreachable.
 */
const liveContext = async (max = 18): Promise<string> => {
  try {
    const signals = await getLiveSignals();
    if (!signals.length) return "";
    return `\n\nLIVE MARKET SIGNALS (scraped minutes ago from free public sources — Reddit, Hacker News, Google Trends).
These are REAL URLs you may cite as sourceUrl/sourceTitle when they genuinely relate to a product. Never invent other URLs:\n${signalsToPromptContext(signals, max)}`;
  } catch {
    return "";
  }
};

/** Attach a REAL signal URL to products that came back without a source. */
const attachSignalSources = (products: WinningProductRaw[], signals: Awaited<ReturnType<typeof getLiveSignals>>) => {
  if (!signals.length) return;
  const unused = [...signals];
  const wordsOf = (s: string) =>
    s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  for (const p of products) {
    const ok = typeof p.sourceUrl === "string" && p.sourceUrl.startsWith("http");
    if (ok || !p.name) continue;
    const pw = new Set(wordsOf(p.name));
    const match =
      unused.find((s) => wordsOf(s.title).some((w) => pw.has(w))) || unused.shift();
    if (match) {
      p.sourceUrl = match.url;
      p.sourceTitle = p.sourceTitle || match.title;
      const idx = unused.indexOf(match);
      if (idx >= 0) unused.splice(idx, 1);
    }
  }
};

// ---------- public AI functions (signatures unchanged) ----------

export const huntWinningProducts = async (
  lang: Language = "es"
): Promise<WinningProductRaw[]> => {
  // Anti-abuse: hard local cap on expensive scans (user's own key pays).
  if (!rateLimitLocal("scan", 10, 10 * 60_000)) {
    throw new Error("RATE_LIMITED: too many scans in 10 minutes — wait a bit.");
  }

  const signals = await getLiveSignals();
  const run = async () => {
    const response = await aiGenerate({
      prompt: `[LIVE MARKET RESEARCH — today is ${dateContext()}]
Identify the 30 products with the highest sales momentum THIS WEEK on TikTok Shop, Amazon and global marketplaces.

RULES (CRITICAL):
1. sourceUrl: ONLY a real URL — from your own knowledge of live marketplace pages, or from the LIVE MARKET SIGNALS list below. Never fabricate URLs.
2. imageUrl: ONLY a direct public image URL (.jpg/.png/.webp); otherwise use exactly "placeholder".
3. Product names must be specific (Brand + Model).
4. trendScore: 0-100 based on current momentum signals (sales rank, social buzz, search volume).
5. Fill every field; if unknown, use "" instead of guessing.
6. Return STRICT JSON: {"products": [ ... ]} with each item containing keys: name, niche, priceEstimate, reasonWhyWinning, potentialMargin, trendScore (number), imageUrl, sourceUrl, sourceTitle.${langDirective(lang)}${await liveContext(18)}`,
      json: true,
      grounding: true,
      maxTokens: 8192,
      timeoutMs: 120_000,
    });

    const parsed = parseJsonSafe<any>(response.text || "{}", {});
    const products = unwrapArray<WinningProductRaw>(parsed, "products");

    // Merge REAL grounding URLs (Gemini) into products without a source.
    const unusedSources = [...response.sources];
    for (const p of products) {
      const urlOk = typeof p.sourceUrl === "string" && p.sourceUrl.startsWith("http");
      if (!urlOk) {
        const match =
          unusedSources.find((s) => p.name && s.title && p.name.toLowerCase().split(" ").some(w => w.length > 3 && s.title.toLowerCase().includes(w))) ||
          unusedSources.shift();
        if (match) {
          p.sourceUrl = match.uri;
          p.sourceTitle = p.sourceTitle || match.title;
          unusedSources.splice(unusedSources.indexOf(match), 1);
        }
      }
      if (typeof p.trendScore !== "number" || Number.isNaN(p.trendScore)) p.trendScore = 0;
      p.trendScore = Math.max(0, Math.min(100, Math.round(p.trendScore)));
    }
    // Free-source fallback: real scraped URLs for the remaining sourceless items.
    attachSignalSources(products, signals);
    return products;
  };
  return withRetry(run);
};

export const getDeepProductAnalysis = async (productName: string, lang: Language = "es") => {
  const run = async () => {
    const response = await aiGenerate({
      prompt: `[COMPETITIVE ANALYSIS — today is ${dateContext()}]
Research the product: "${productName}".
Return: real competitors, customer sentiment summary, top market risks, and sources.
'sources' must ONLY contain real URLs (from the LIVE MARKET SIGNALS list when relevant, or well-known marketplace/review pages you are certain exist). Return STRICT JSON object with keys: competitors (array of strings), customerSentiment (string), topRisks (array of strings), sources (array of {title, uri}).${langDirective(lang)}${await liveContext(12)}`,
      json: true,
      grounding: true,
      maxTokens: 4096,
      timeoutMs: 90_000,
    });

    const data = parseJsonSafe<any>(response.text || "{}", {});
    if (!Array.isArray(data.sources) || data.sources.length === 0) {
      if (response.sources.length) {
        data.sources = response.sources.map((s) => ({ title: s.title, uri: s.uri }));
      }
    }
    return data;
  };
  return withRetry(run);
};

export const analyzeNicheMarket = async (niche: string, lang: Language = "es") => {
  const run = async () => {
    const response = await aiGenerate({
      prompt: `Analyze the current competitive structure of the "${niche}" niche (today: ${dateContext()}): leading brands with approximate market share, a Gini concentration index (0-1), and one actionable insight. Use the LIVE MARKET SIGNALS when relevant. Return STRICT JSON object with keys: brands (array of {name, sharePercent}), giniIndex (number), insight (string).${langDirective(lang)}${await liveContext(12)}`,
      json: true,
      grounding: true,
      maxTokens: 4096,
      timeoutMs: 90_000,
    });
    return parseJsonSafe<any>(response.text || "{}", {});
  };
  return withRetry(run);
};

export const analyzeMarketTrends = async (query: string, lang: Language = "es") => {
  const run = async () => {
    const response = await aiGenerate({
      prompt: `Executive summary (max 120 words) based on THIS WEEK's real market signals (today: ${dateContext()}) for: "${query}". Reference concrete items from the LIVE MARKET SIGNALS where relevant; cite outlet names inline where possible.${langDirective(lang)}${await liveContext(14)}`,
      maxTokens: 1200,
      grounding: true,
      timeoutMs: 60_000,
    });
    return response.text || "";
  };
  return withRetry(run);
};

export const generateProductDescription = async (
  productInfo: string,
  tone: string,
  audience: string,
  lang: Language = "es"
) => {
  const run = async () => {
    const response = await aiGenerate({
      prompt: `Write conversion-focused sales copy for: ${productInfo}. Tone: ${tone}. Target audience: ${audience}. Include a short headline, a 3-bullet benefits list and a closing call to action.${langDirective(lang)}`,
      maxTokens: 2048,
      timeoutMs: 60_000,
    });
    return response.text || "";
  };
  return withRetry(run);
};

// Quick connectivity test used by Settings — walks the whole vault (failover)
// and returns a per-key report so the UI can show WHAT failed and WHY.
// Locally rate-limited to stop brute-force spam.
export const testConnection = async (): Promise<{
  ok: boolean; detail: string;
  attempts?: { provider: string; keyLabel: string; error: string }[];
}> => {
  if (!rateLimitLocal("conn_test", 12, 60_000)) {
    return { ok: false, detail: "RATE_LIMITED: too many tests per minute." };
  }
  try {
    const fast = await testConnectionFast();
    if (fast.ok && fast.provider) {
      return { ok: true, detail: `${fast.provider} · ${fast.model}`, attempts: fast.attempts };
    }
    if (fast.ok) {
      const { provider, model } = await resolveAi({ allowProbe: false });
      return { ok: true, detail: `${provider.name} · ${model}`, attempts: fast.attempts };
    }
    return fast;
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    return { ok: false, detail: msg };
  }
};

/** Which provider is currently active (for UI badges, no network). */
export const currentProviderInfo = () => providerSummary();

/** Side-by-side verdict for the Compare page (2-3 products). */
export const compareProducts = async (
  products: { name: string; niche: string; priceEstimate: string; potentialMargin: string; trendScore: number }[],
  lang: Language = "es"
): Promise<string> => {
  if (!rateLimitLocal("compare", 20, 10 * 60_000)) {
    throw new Error("RATE_LIMITED: too many comparisons in 10 minutes — wait a bit.");
  }
  const run = async () => {
    const lines = products
      .map((p, i) => `${i + 1}. ${p.name} | niche: ${p.niche} | price: ${p.priceEstimate} | margin: ${p.potentialMargin} | trendScore: ${p.trendScore}/100`)
      .join("\n");
    const response = await aiGenerate({
      prompt: `[PRODUCT COMPARISON — today is ${dateContext()}]
Compare these products for a dropshipper deciding what to sell THIS WEEK:

${lines}

Deliver, in this order:
1. One-line verdict naming the WINNER.
2. Three bullets: best margin logic, best trend momentum, biggest risk.
3. Final recommendation sentence (start/skip/watch).${langDirective(lang)}`,
      maxTokens: 1500,
      grounding: true,
      timeoutMs: 60_000,
    });
    return response.text || "";
  };
  return withRetry(run);
};
