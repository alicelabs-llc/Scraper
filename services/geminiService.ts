
import { GoogleGenAI, Type } from "@google/genai";
import { Language } from "../types";

/**
 * ProdIntel AI service — v2 (BYOK, live dates, real grounding sources).
 *
 * Key resolution (BYOK first, env as dev fallback):
 *   1. localStorage 'prodintel_api_key' (user's own key — never bundled, never sent anywhere except Google)
 *   2. process.env.API_KEY (only for local development via vite define)
 *
 * Model: stable aliases by default ('gemini-flash-latest' / 'gemini-pro-latest'),
 * overridable via localStorage 'prodintel_model' so previews retiring never break the app.
 */

export class MissingApiKeyError extends Error {
  constructor() {
    super("MISSING_API_KEY");
    this.name = "MissingApiKeyError";
  }
}

export interface GroundingSource {
  title: string;
  uri: string;
}

const LANG_NAMES: Record<Language, string> = {
  es: "Spanish (Español)",
  en: "English",
  fr: "French (Français)",
  de: "German (Deutsch)",
  zh: "Simplified Chinese (简体中文)",
};

const API_KEY_STORAGE = "prodintel_api_key";
const MODEL_STORAGE = "prodintel_model";

export const getApiKey = (): string | null => {
  try {
    const stored = localStorage.getItem(API_KEY_STORAGE);
    if (stored && stored.trim().length > 10) return stored.trim();
  } catch {
    /* localStorage unavailable — fall through to env */
  }
  const envKey = (process.env.API_KEY || "").trim();
  return envKey && !envKey.startsWith("your_") ? envKey : null;
};

export const setApiKey = (key: string) => {
  const trimmed = key.trim();
  if (!trimmed) {
    localStorage.removeItem(API_KEY_STORAGE);
  } else {
    localStorage.setItem(API_KEY_STORAGE, trimmed);
  }
};

export const getModel = (quality = false): string => {
  try {
    const m = localStorage.getItem(MODEL_STORAGE);
    if (m) return m;
  } catch { /* ignore */ }
  return quality ? "gemini-pro-latest" : "gemini-flash-latest";
};

export const setModel = (model: string) => localStorage.setItem(MODEL_STORAGE, model);

// Singleton client — one instance per resolved key instead of one per call.
let cachedClient: { key: string; client: GoogleGenAI } | null = null;
const getClient = (): GoogleGenAI => {
  const apiKey = getApiKey();
  if (!apiKey) throw new MissingApiKeyError();
  if (!cachedClient || cachedClient.key !== apiKey) {
    cachedClient = { key: apiKey, client: new GoogleGenAI({ apiKey }) };
  }
  return cachedClient.client;
};

// Dynamic date — prompts always anchored to TODAY, never a stale hardcoded month.
const dateContext = () =>
  new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// Every AI answer respects the UI language selected by the user.
const langDirective = (lang: Language) =>
  `\n\nRESPONSE LANGUAGE (MANDATORY): write ALL text fields in ${LANG_NAMES[lang]}.`;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isFatal = (err: unknown): boolean => {
  const msg = String((err as Error)?.message || err || "");
  return (
    msg.includes("MISSING_API_KEY") ||
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

// REAL sources from the Google Search tool — groundingChunks carries the URLs
// the search actually used, instead of asking the model to "please not invent links".
const extractGrounding = (response: unknown): GroundingSource[] => {
  try {
    const chunks =
      (response as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const seen = new Set<string>();
    const out: GroundingSource[] = [];
    for (const c of chunks) {
      const web = c?.web;
      if (web?.uri && !seen.has(web.uri)) {
        seen.add(web.uri);
        out.push({ title: web.title || web.uri, uri: web.uri });
      }
    }
    return out;
  } catch {
    return [];
  }
};

export interface WinningProductRaw {
  name: string;
  niche: string;
  priceEstimate: string;
  reasonWhyWinning: string;
  potentialMargin: string;
  trendScore: number;
  imageUrl: string;
  sourceUrl: string;
  sourceTitle: string;
}

export const huntWinningProducts = async (
  lang: Language = "es"
): Promise<WinningProductRaw[]> => {
  const run = async () => {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: getModel(),
      contents: `[LIVE MARKET RESEARCH — today is ${dateContext()}]
Use Google Search to identify the 30 products with the highest sales momentum THIS WEEK on TikTok Shop, Amazon and global marketplaces.

RULES (CRITICAL):
1. sourceUrl: ONLY a URL that appeared in your search results. Never fabricate URLs.
2. imageUrl: ONLY a direct public image URL (.jpg/.png/.webp) seen in results; otherwise use exactly "placeholder".
3. Product names must be specific (Brand + Model).
4. trendScore: 0-100 based on current momentum signals (sales rank, social buzz, search volume).
5. Fill every field; if unknown, use "" instead of guessing.${langDirective(lang)}`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              niche: { type: Type.STRING },
              priceEstimate: { type: Type.STRING },
              reasonWhyWinning: { type: Type.STRING },
              potentialMargin: { type: Type.STRING },
              trendScore: { type: Type.NUMBER },
              imageUrl: { type: Type.STRING },
              sourceUrl: { type: Type.STRING },
              sourceTitle: { type: Type.STRING },
            },
            required: [
              "name", "niche", "priceEstimate", "reasonWhyWinning",
              "potentialMargin", "trendScore", "imageUrl", "sourceUrl", "sourceTitle",
            ],
          },
        },
      },
    });

    const sources = extractGrounding(response);
    const products = parseJsonSafe<WinningProductRaw[]>(response.text || "[]", []);

    // Merge REAL grounding URLs into products that came back without a source.
    const unused = [...sources];
    for (const p of products) {
      const urlOk = typeof p.sourceUrl === "string" && p.sourceUrl.startsWith("http");
      if (!urlOk) {
        const match =
          unused.find((s) => p.name && s.title && p.name.toLowerCase().split(" ").some(w => w.length > 3 && s.title.toLowerCase().includes(w))) ||
          unused.shift();
        if (match) {
          p.sourceUrl = match.uri;
          p.sourceTitle = p.sourceTitle || match.title;
          unused.splice(unused.indexOf(match), 1);
        }
      }
      if (typeof p.trendScore !== "number" || Number.isNaN(p.trendScore)) p.trendScore = 0;
      p.trendScore = Math.max(0, Math.min(100, Math.round(p.trendScore)));
    }
    return products;
  };
  return withRetry(run);
};

export const getDeepProductAnalysis = async (productName: string, lang: Language = "es") => {
  const run = async () => {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: getModel(),
      contents: `[COMPETITIVE ANALYSIS — today is ${dateContext()}]
Research the product: "${productName}".
Use Google Search and return: real competitors, customer sentiment summary, top market risks, and sources.
'sources' must ONLY contain URLs from your search results (never invented).${langDirective(lang)}`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            competitors: { type: Type.ARRAY, items: { type: Type.STRING } },
            customerSentiment: { type: Type.STRING },
            topRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
            sources: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { title: { type: Type.STRING }, uri: { type: Type.STRING } },
              },
            },
          },
          required: ["competitors", "customerSentiment", "topRisks", "sources"],
        },
      },
    });

    const data = parseJsonSafe<any>(response.text || "{}", {});
    if (!Array.isArray(data.sources) || data.sources.length === 0) {
      const sources = extractGrounding(response);
      if (sources.length) data.sources = sources.map((s) => ({ title: s.title, uri: s.uri }));
    }
    return data;
  };
  return withRetry(run);
};

export const analyzeNicheMarket = async (niche: string, lang: Language = "es") => {
  const run = async () => {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: getModel(),
      contents: `Analyze the current competitive structure of the "${niche}" niche (today: ${dateContext()}) using Google Search: leading brands with approximate market share, a Gini concentration index (0-1), and one actionable insight.${langDirective(lang)}`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            brands: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  sharePercent: { type: Type.NUMBER },
                },
              },
            },
            giniIndex: { type: Type.NUMBER },
            insight: { type: Type.STRING },
          },
          required: ["brands", "giniIndex", "insight"],
        },
      },
    });
    return parseJsonSafe<any>(response.text || "{}", {});
  };
  return withRetry(run);
};

export const analyzeMarketTrends = async (query: string, lang: Language = "es") => {
  const run = async () => {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: getModel(),
      contents: `Executive summary (max 120 words) based on THIS WEEK's news (today: ${dateContext()}) for: "${query}". Cite outlet names inline where possible.${langDirective(lang)}`,
      config: { tools: [{ googleSearch: {} }] },
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
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: getModel(true),
      contents: `Write conversion-focused sales copy for: ${productInfo}. Tone: ${tone}. Target audience: ${audience}. Include a short headline, a 3-bullet benefits list and a closing call to action.${langDirective(lang)}`,
    });
    return response.text || "";
  };
  return withRetry(run);
};

// Quick connectivity test used by Settings — cheap (5 output tokens), no tools.
export const testConnection = async (): Promise<{ ok: boolean; detail: string }> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: getModel(),
      contents: "ping",
      config: { maxOutputTokens: 5 },
    });
    return { ok: true, detail: response.text?.trim() || "ok" };
  } catch (err) {
    return { ok: false, detail: String((err as Error)?.message || err) };
  }
};
