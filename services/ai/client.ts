
/**
 * client.ts — unified AI client: ONE function, EVERY provider.
 *
 * Flow when any request arrives:
 *   1. Resolve key (BYOK localStorage → dev env fallback).
 *   2. Resolve provider: manual choice > cached detection > prefix rules >
 *      live probe of official /models endpoints (first 200 wins).
 *   3. Route to the provider adapter (Gemini / OpenAI-compatible / Anthropic).
 *   4. Return { text, sources, provider, model }.
 *
 * Security invariants:
 *   - Key is sanitized + charset-gated before ANY network use.
 *   - Key is sent ONLY to the official HTTPS endpoint of the provider
 *     (or the user's own custom endpoint). Never to Alicelabs servers.
 *   - Every request has a hard timeout; responses are size-capped.
 */

import {
  PROVIDERS, ProviderId, ProviderInfo, ProbeResult,
  detectFromPrefix, probeCandidates, supportsGrounding,
} from "./providers";
import { MissingApiKeyError, GroundingSource } from "./types";
import { sanitizeApiKey, looksLikeApiKey } from "../security";

// ---------- storage ----------

const K_PROVIDER = "prodintel_provider";     // 'auto' | ProviderId
const K_CUSTOM_BASE = "prodintel_custom_base";
const K_MODEL = "prodintel_model";           // '' = provider default
const K_DETECTED = "prodintel_detected";     // {fp, provider, models, at}

export function getProviderChoice(): ProviderId | "auto" {
  try {
    const v = localStorage.getItem(K_PROVIDER);
    if (v && (v === "auto" || v in PROVIDERS)) return v as ProviderId | "auto";
  } catch { /* ignore */ }
  return "auto";
}
export function setProviderChoice(p: ProviderId | "auto") {
  try {
    if (p === "auto") localStorage.removeItem(K_PROVIDER);
    else localStorage.setItem(K_PROVIDER, p);
  } catch { /* ignore */ }
}
export function getCustomBase(): string {
  try { return (localStorage.getItem(K_CUSTOM_BASE) || "").trim(); } catch { return ""; }
}
export function setCustomBase(base: string) {
  try {
    const b = base.trim();
    if (b) localStorage.setItem(K_CUSTOM_BASE, b);
    else localStorage.removeItem(K_CUSTOM_BASE);
  } catch { /* ignore */ }
}

interface DetectedCache { fp: string; provider: ProviderId; models: string[]; at: number }
function readDetected(): DetectedCache | null {
  try {
    const raw = localStorage.getItem(K_DETECTED);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d && d.fp && d.provider && (d.provider === "custom" || d.provider in PROVIDERS)) return d;
  } catch { /* ignore */ }
  return null;
}
function writeDetected(d: DetectedCache | null) {
  try {
    if (d) localStorage.setItem(K_DETECTED, JSON.stringify(d));
    else localStorage.removeItem(K_DETECTED);
  } catch { /* ignore */ }
}

/** Persisted model preference ('' = auto). Shared with legacy Settings flow. */
export function getStoredModel(): string {
  try { return (localStorage.getItem(K_MODEL) || "").trim(); } catch { return ""; }
}
export function setStoredModel(m: string) {
  try {
    const t = (m || "").trim();
    if (t) localStorage.setItem(K_MODEL, t);
    else localStorage.removeItem(K_MODEL);
  } catch { /* ignore */ }
}

// ---------- errors ----------

export class ProviderUnresolvedError extends Error {
  constructor(msg: string) { super(msg); this.name = "ProviderUnresolvedError"; }
}

// ---------- resolution ----------

export interface ResolvedAi {
  provider: ProviderInfo;
  model: string;
  baseUrl: string;      // for custom: normalized chat endpoint
  key: string;
  grounding: boolean;
}

function normalizeCustomEndpoint(base: string): string {
  const b = base.replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(b)) return b;
  if (/\/v\d+$/.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

function envDevKey(): string {
  const k = String((process.env.API_KEY as unknown as string) || (process.env.GEMINI_API_KEY as unknown as string) || "").trim();
  return k && !k.startsWith("your_") ? k : "";
}

export function getApiKey(): string | null {
  try {
    const stored = localStorage.getItem("prodintel_api_key");
    if (stored && stored.trim().length > 10) return sanitizeApiKey(stored);
  } catch { /* fall through to env */ }
  const envKey = envDevKey();
  return envKey ? sanitizeApiKey(envKey) : null;
}

export function setApiKey(key: string) {
  try {
    const clean = sanitizeApiKey(key);
    if (clean && looksLikeApiKey(clean)) localStorage.setItem("prodintel_api_key", clean);
    else if (!clean) localStorage.removeItem("prodintel_api_key");
    // invalid-looking keys are NOT stored; caller validates first
  } catch { /* ignore */ }
}

/**
 * Resolve provider+model for the current key.
 * - Manual choice ('openai', 'custom', …) is honored as-is.
 * - 'auto': cached detection → prefix rules → live probe.
 * Throws MissingApiKeyError / ProviderUnresolvedError with honest messages.
 */
export async function resolveAi(opts?: { allowProbe?: boolean }): Promise<ResolvedAi> {
  const key = getApiKey();
  if (!key) throw new MissingApiKeyError();

  const choice = getProviderChoice();

  // --- custom endpoint (manual) ---
  if (choice === "custom") {
    const base = getCustomBase();
    if (!base) throw new ProviderUnresolvedError("CUSTOM_NO_BASE");
    const model = getStoredModel() || PROVIDERS.custom.defaultModel;
    if (!model) throw new ProviderUnresolvedError("CUSTOM_NO_MODEL");
    return {
      provider: PROVIDERS.custom, model,
      baseUrl: normalizeCustomEndpoint(base), key,
      grounding: false,
    };
  }

  if (choice !== "auto") {
    const info = PROVIDERS[choice];
    const stored = getStoredModel();
    const model = stored && (info.models.includes(stored) || info.kind !== "gemini") ? stored : info.defaultModel;
    return { provider: info, model, baseUrl: info.endpoint, key, grounding: supportsGrounding(info.id) };
  }

  // --- auto ---
  const detection = await detectFromPrefix(key);
  if (!detection) throw new ProviderUnresolvedError("KEY_FORMAT");

  const cached = readDetected();
  if (cached && cached.fp === detection.fingerprint) {
    const info = PROVIDERS[cached.provider];
    const stored = getStoredModel();
    const model = stored && stored !== "" ? stored : (cached.models[0] || info.defaultModel);
    return { provider: info, model, baseUrl: info.endpoint, key, grounding: supportsGrounding(info.id) };
  }

  // certain prefix: no network needed
  if (detection.sure) {
    const info = PROVIDERS[detection.sure];
    writeDetected({ fp: detection.fingerprint, provider: info.id, models: [], at: Date.now() });
    const stored = getStoredModel();
    const model = stored && info.models.includes(stored) ? stored : info.defaultModel;
    return { provider: info, model, baseUrl: info.endpoint, key, grounding: supportsGrounding(info.id) };
  }

  // ambiguous / unknown prefix → probe (Settings connection test or first AI call)
  let probe: ProbeResult | null = null;
  if (opts?.allowProbe !== false) {
    probe = await probeCandidates(detection.candidates, key);
  }
  if (probe) {
    writeDetected({ fp: detection.fingerprint, provider: probe.provider, models: probe.models, at: Date.now() });
    const info = PROVIDERS[probe.provider];
    const stored = getStoredModel();
    const model = stored && probe.models.includes(stored) ? stored : (probe.models[0] || info.defaultModel);
    return { provider: info, model, baseUrl: info.endpoint, key, grounding: supportsGrounding(info.id) };
  }

  // Probe failed (offline, CORS, or the key belongs to a non-AI service).
  // Optimistic fallback: first prefix candidate — the real call will confirm
  // (401 → honest auth error) without blocking legitimate setups.
  const fallbackId = detection.candidates[0];
  if (fallbackId) {
    const info = PROVIDERS[fallbackId];
    return { provider: info, model: info.defaultModel, baseUrl: info.endpoint, key, grounding: supportsGrounding(info.id) };
  }
  throw new ProviderUnresolvedError("NO_PROVIDER");
}

/** Clear cached detection (call when the key or manual provider changes). */
export function invalidateDetection() { writeDetected(null); }

// ---------- request/response ----------

export interface AiRequest {
  prompt: string;
  system?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Ask Gemini to use Google Search grounding (ignored by other providers). */
  grounding?: boolean;
  timeoutMs?: number;
}

export interface AiResponse {
  text: string;
  sources: GroundingSource[];
  provider: ProviderId;
  model: string;
}

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024; // 4MB sanity cap

async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.text();
      detail = body.slice(0, 300);
    } catch { /* ignore */ }
    const err = new Error(`HTTP_${res.status}${detail ? `: ${detail}` : ""}`);
    (err as any).status = res.status;
    throw err;
  }
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("RESPONSE_TOO_LARGE");
  return JSON.parse(text);
}

function authHeaders(info: ProviderInfo, key: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...(info.headers || {}) };
  if (info.kind === "anthropic") h["x-api-key"] = key;
  else if (info.kind === "gemini") h["x-goog-api-key"] = key;
  else h["Authorization"] = `Bearer ${key}`;
  return h;
}

// ---------- adapters ----------

async function callGemini(ai: ResolvedAi, req: AiRequest, signal: AbortSignal): Promise<AiResponse> {
  const parts: any = [{ text: req.prompt }];
  const body: any = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      ...(req.json ? { responseMimeType: "application/json" } : {}),
      ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    },
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  if (req.grounding && ai.grounding) body.tools = [{ googleSearch: {} }];

  const data = await fetchJson(
    `${ai.baseUrl}/${ai.model}:generateContent`,
    { method: "POST", headers: authHeaders(ai.provider, ai.key), body: JSON.stringify(body), signal }
  );

  const cand = data?.candidates?.[0];
  const text: string = (cand?.content?.parts || []).map((p: any) => p?.text || "").join("") || "";
  const chunks = cand?.groundingMetadata?.groundingChunks || [];
  const seen = new Set<string>();
  const sources: GroundingSource[] = [];
  for (const c of chunks) {
    const uri = c?.web?.uri;
    if (uri && !seen.has(uri)) { seen.add(uri); sources.push({ title: c.web.title || uri, uri }); }
  }
  return { text, sources, provider: "gemini", model: ai.model };
}

async function callOpenAiCompatible(ai: ResolvedAi, req: AiRequest, signal: AbortSignal): Promise<AiResponse> {
  const messages: any[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.prompt });

  const body: any = {
    model: ai.model,
    messages,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    // OpenRouter etiquette: identify the calling app.
    ...(ai.provider.id === "openrouter" ? {
      "HTTP-Referer": typeof location !== "undefined" ? location.origin : "https://prodintel.app",
      "X-Title": "ProdIntel",
    } : {}),
  };
  if (req.json) body.response_format = { type: "json_object" };

  let data;
  try {
    data = await fetchJson(ai.baseUrl, {
      method: "POST", headers: authHeaders(ai.provider, ai.key), body: JSON.stringify(body), signal,
    });
  } catch (err: any) {
    // Some compatible gateways reject response_format — retry once without it.
    if (req.json && (err?.status === 400 || err?.status === 422)) {
      const { response_format, ...rest } = body;
      data = await fetchJson(ai.baseUrl, {
        method: "POST", headers: authHeaders(ai.provider, ai.key), body: JSON.stringify(rest), signal,
      });
    } else {
      throw err;
    }
  }

  const msg = data?.choices?.[0]?.message;
  const text: string = typeof msg?.content === "string" ? msg.content : Array.isArray(msg?.content)
    ? msg.content.map((p: any) => p?.text || "").join("")
    : (typeof data?.choices?.[0]?.text === "string" ? data.choices[0].text : "");
  return { text, sources: [], provider: ai.provider.id, model: data?.model || ai.model };
}

async function callAnthropic(ai: ResolvedAi, req: AiRequest, signal: AbortSignal): Promise<AiResponse> {
  const body: any = {
    model: ai.model,
    max_tokens: req.maxTokens || 4096,
    messages: [{ role: "user", content: req.prompt }],
    ...(req.system ? { system: req.system } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
  };
  const data = await fetchJson(ai.baseUrl, {
    method: "POST", headers: authHeaders(ai.provider, ai.key), body: JSON.stringify(body), signal,
  });
  const text: string = (data?.content || []).map((b: any) => (b?.type === "text" ? b.text : "")).join("");
  return { text, sources: [], provider: "anthropic", model: data?.model || ai.model };
}

// ---------- public API ----------

export async function aiGenerate(req: AiRequest): Promise<AiResponse> {
  const ai = await resolveAi({ allowProbe: true });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs || 90_000);
  try {
    switch (ai.provider.kind) {
      case "gemini": return await callGemini(ai, req, ctrl.signal);
      case "anthropic": return await callAnthropic(ai, req, ctrl.signal);
      default: return await callOpenAiCompatible(ai, req, ctrl.signal);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Cheap connectivity check used by Settings: resolve + 1-token ping. */
export async function testConnectionFast(): Promise<{
  ok: boolean; detail: string; provider?: string; model?: string;
}> {
  try {
    const ai = await resolveAi({ allowProbe: true });
    const res = await aiGenerate({
      prompt: "ping",
      maxTokens: 5,
      timeoutMs: 20_000,
    });
    return { ok: true, detail: res.text?.trim().slice(0, 40) || "ok", provider: res.provider, model: res.model };
  } catch (err: any) {
    const name = err?.name || "Error";
    const msg = String(err?.message || err);
    if (name === "MissingApiKeyError") return { ok: false, detail: "MISSING_API_KEY" };
    if (msg.includes("HTTP_401") || msg.includes("HTTP_403")) return { ok: false, detail: `KEY_REJECTED (${msg.slice(0, 60)})` };
    return { ok: false, detail: `${name}: ${msg.slice(0, 100)}` };
  }
}

/** Quick UI summary of the currently resolved provider (no network). */
export function providerSummary(): { name: string; model: string } | null {
  try {
    const key = getApiKey();
    if (!key) return null;
    const choice = getProviderChoice();
    if (choice === "custom") {
      return { name: PROVIDERS.custom.name, model: getStoredModel() || "—" };
    }
    if (choice !== "auto") {
      return { name: PROVIDERS[choice].name, model: getStoredModel() || PROVIDERS[choice].defaultModel };
    }
    const cached = readDetected();
    if (cached) {
      const info = PROVIDERS[cached.provider];
      return { name: info.name, model: getStoredModel() || cached.models[0] || info.defaultModel };
    }
    return null;
  } catch {
    return null;
  }
}
