
/**
 * client.ts — unified AI client: ONE function, EVERY provider.
 *
 * v5.1 "Redundancy": the user asked for "varias apis, por si una no funciona".
 * Every request now walks the Key Vault (services/ai/vault.ts) top-down:
 *   key 1 (invalid/quota/provider-down) → key 2 → key 3 … until one answers.
 * The response reports which key/provider served it; failed keys are marked
 * in the vault so the UI can show honest, per-key diagnostics.
 *
 * Flow when any request arrives:
 *   1. Load vault keys (BYOK localStorage → dev env fallback).
 *   2. For each key: resolve provider (manual choice > cached detection >
 *      prefix rules > live probe: /models, then 1-token chat ping).
 *   3. Call the provider adapter (Gemini / OpenAI-compatible / Anthropic).
 *   4. First success wins; every failure is recorded and classified.
 *
 * Security invariants:
 *   - Key is sanitized + charset-gated before ANY network use.
 *   - Keys are sent ONLY to the official HTTPS endpoint of the provider
 *     (or the user's own custom endpoint). Never to Alicelabs servers.
 *   - Every request has a hard timeout; responses are size-capped.
 */

import {
  PROVIDERS, ProviderId, ProviderInfo, ProbeResult,
  detectFromPrefix, probeCandidates, pingProbe, supportsGrounding,
} from "./providers";
import { MissingApiKeyError, GroundingSource } from "./types";
import { InfraKeyError, AiFailoverError, FailoverAttempt } from "./errors";
import { sanitizeApiKey, looksLikeApiKey, maskKey } from "../security";
import { orderedKeys, markKeyByKey } from "./vault";

export { InfraKeyError, AiFailoverError } from "./errors";

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
  try {
    const k = String((process.env.API_KEY as unknown as string) || (process.env.GEMINI_API_KEY as unknown as string) || "").trim();
    return k && !k.startsWith("your_") ? k : "";
  } catch { return ""; }
}

export function getApiKey(): string | null {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("prodintel_api_key");
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
 * Resolve provider+model for ONE key.
 * - Manual choice ('openai', 'custom', …) is honored as-is.
 * - 'auto': cached detection → prefix rules → live probe (/models → chat ping).
 * Throws MissingApiKeyError / ProviderUnresolvedError / InfraKeyError.
 */
export async function resolveForKey(key: string, opts?: { allowProbe?: boolean }): Promise<ResolvedAi> {
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
  if (detection.infra) throw new InfraKeyError(detection.infra.kind);

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
  if (opts?.allowProbe !== false && detection.candidates.length) {
    probe = await probeCandidates(detection.candidates, key);
    if (!probe) probe = await pingProbe(detection.candidates, key);
  }
  if (probe) {
    writeDetected({ fp: detection.fingerprint, provider: probe.provider, models: probe.models, at: Date.now() });
    const info = PROVIDERS[probe.provider];
    const stored = getStoredModel();
    const model = stored && probe.models.includes(stored) ? stored : (probe.models[0] || info.defaultModel);
    return { provider: info, model, baseUrl: info.endpoint, key, grounding: supportsGrounding(info.id) };
  }

  // Single-candidate keys (e.g. plain sk-… → OpenAI) still get one honest
  // optimistic attempt: the real call produces a clear 401, not a dead end.
  if (detection.candidates.length === 1) {
    const info = PROVIDERS[detection.candidates[0]];
    return { provider: info, model: info.defaultModel, baseUrl: info.endpoint, key, grounding: supportsGrounding(info.id) };
  }

  throw new ProviderUnresolvedError("NO_PROVIDER");
}

/** Legacy single-key resolution (first vault key / env fallback). */
export async function resolveAi(opts?: { allowProbe?: boolean }): Promise<ResolvedAi> {
  const key = getApiKey();
  if (!key) throw new MissingApiKeyError();
  return resolveForKey(key, opts);
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
const MAX_FAILOVER_KEYS = 4;                // per request: vault[0..3]

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

async function callWith(ai: ResolvedAi, req: AiRequest, signal: AbortSignal): Promise<AiResponse> {
  switch (ai.provider.kind) {
    case "gemini": return callGemini(ai, req, signal);
    case "anthropic": return callAnthropic(ai, req, signal);
    default: return callOpenAiCompatible(ai, req, signal);
  }
}

// ---------- public API (failover across the vault) ----------

let lastServedInfo: { provider: string; model: string; at: number } | null = null;

/** Which key/provider served the last successful AI call (for UI badges). */
export function lastServed(): { provider: string; model: string } | null {
  return lastServedInfo ? { provider: lastServedInfo.provider, model: lastServedInfo.model } : null;
}

export async function aiGenerate(req: AiRequest): Promise<AiResponse> {
  // Build the ordered candidate list: vault keys first, dev env as last resort.
  const keys = await orderedKeys();
  if (getApiKey() && !keys.includes(getApiKey()!)) keys.unshift(getApiKey()!);
  if (!keys.length) {
    const envKey = envDevKey();
    if (envKey) keys.push(sanitizeApiKey(envKey));
  }
  if (!keys.length) throw new MissingApiKeyError();

  const attempts: FailoverAttempt[] = [];
  for (const key of keys.slice(0, MAX_FAILOVER_KEYS)) {
    let ai: ResolvedAi;
    try {
      ai = await resolveForKey(key, { allowProbe: true });
    } catch (err) {
      const name = (err as Error)?.name || "";
      const msg = String((err as Error)?.message || err || "");
      if (name === "InfraKeyError") {
        attempts.push({ provider: "—", keyLabel: maskKey(key).slice(0, 10), error: msg });
        continue; // infra tokens are skipped, the vault tries the next key
      }
      if (name === "ProviderUnresolvedError" && msg !== "CUSTOM_NO_BASE") {
        attempts.push({ provider: "—", keyLabel: maskKey(key).slice(0, 10), error: msg });
        continue;
      }
      attempts.push({ provider: "—", keyLabel: maskKey(key).slice(0, 10), error: msg.slice(0, 80) });
      continue;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), req.timeoutMs || 90_000);
    try {
      const res = await callWith(ai, req, ctrl.signal);
      lastServedInfo = { provider: res.provider, model: res.model, at: Date.now() };
      void markKeyByKey(key, "ok");
      return res;
    } catch (err) {
      const msg = String((err as Error)?.message || err || "");
      const status = (err as any)?.status;
      if (status === 401 || status === 403) {
        void markKeyByKey(key, "invalid", msg.slice(0, 120));
      } else {
        void markKeyByKey(key, "error", msg.slice(0, 120));
      }
      attempts.push({ provider: ai.provider.name, keyLabel: maskKey(key).slice(0, 10), error: msg.slice(0, 120) });
      // 401/403/429/5xx/network → try the next key in the vault.
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AiFailoverError(attempts);
}

/** Cheap connectivity check used by Settings: full failover walk + per-key report. */
export async function testConnectionFast(): Promise<{
  ok: boolean; detail: string; provider?: string; model?: string;
  attempts?: FailoverAttempt[];
}> {
  try {
    const res = await aiGenerate({ prompt: "ping", maxTokens: 5, timeoutMs: 20_000 });
    return { ok: true, detail: res.text?.trim().slice(0, 40) || "ok", provider: res.provider, model: res.model };
  } catch (err: any) {
    const name = err?.name || "Error";
    const msg = String(err?.message || err);
    if (name === "AiFailoverError") {
      return { ok: false, detail: "ALL_PROVIDERS_FAILED", attempts: (err as AiFailoverError).attempts };
    }
    if (name === "MissingApiKeyError") return { ok: false, detail: "MISSING_API_KEY" };
    if (name === "InfraKeyError") return { ok: false, detail: msg };
    if (msg.includes("HTTP_401") || msg.includes("HTTP_403")) return { ok: false, detail: `KEY_REJECTED (${msg.slice(0, 60)})` };
    return { ok: false, detail: `${name}: ${msg.slice(0, 100)}` };
  }
}

/** Test ONE key in isolation (Settings vault row "Test" button). */
export async function pingKey(key: string): Promise<{
  ok: boolean; provider?: string; model?: string; error?: string;
}> {
  try {
    const ai = await resolveForKey(key, { allowProbe: true });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await callWith(ai, { prompt: "ping", maxTokens: 5, timeoutMs: 20_000 }, ctrl.signal);
      lastServedInfo = { provider: res.provider, model: res.model, at: Date.now() };
      return { ok: true, provider: res.provider, model: res.model };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err).slice(0, 120) };
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
