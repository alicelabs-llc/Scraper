
/**
 * providers.ts — Universal AI provider registry for ProdIntel v5.
 *
 * ANY API KEY works: paste it, ProdIntel identifies the provider from its
 * prefix, and when the prefix is ambiguous or unknown it PROBES the official
 * /models endpoints of every compatible provider (first HTTP 200 wins).
 * Detection result is cached by key fingerprint so "it just works" on the
 * very next call.
 *
 * All keys are BYOK: stored only in the user's browser (localStorage) and
 * sent ONLY to the official endpoint of the detected provider over HTTPS.
 * Alicelabs servers never see a key.
 */

import { looksLikeApiKey, sha256Hex } from "../security";

export type ProviderId =
  | "gemini" | "openai" | "anthropic" | "groq" | "openrouter" | "deepseek"
  | "mistral" | "xai" | "cerebras" | "fireworks" | "together" | "zai" | "custom";

export type ProviderKind = "gemini" | "openai" | "anthropic";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  kind: ProviderKind;
  /** Chat endpoint (POST). */
  endpoint: string;
  /** Models list endpoint (GET) used by the auto-detection probe. */
  modelsEndpoint: string;
  defaultModel: string;
  models: string[];
  /** Extra headers required by the provider (browser CORS opt-ins, etc.). */
  headers?: Record<string, string>;
  keyHint: string;
  freeTier?: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    kind: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    modelsEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    defaultModel: "gemini-flash-latest",
    models: ["gemini-flash-latest", "gemini-pro-latest", "gemini-2.5-flash", "gemini-2.5-pro"],
    keyHint: "AIza… (aistudio.google.com)",
    freeTier: true,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    kind: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    modelsEndpoint: "https://api.openai.com/v1/models",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
    keyHint: "sk-… (platform.openai.com)",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    kind: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    modelsEndpoint: "https://api.anthropic.com/v1/models",
    defaultModel: "claude-3-5-haiku-latest",
    models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-sonnet-4-5", "claude-opus-4-1"],
    headers: {
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    keyHint: "sk-ant-… (console.anthropic.com)",
  },
  groq: {
    id: "groq",
    name: "Groq",
    kind: "openai",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    modelsEndpoint: "https://api.groq.com/openai/v1/models",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b", "qwen/qwen3-32b"],
    keyHint: "gsk_… (console.groq.com)",
    freeTier: true,
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    kind: "openai",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    modelsEndpoint: "https://openrouter.ai/api/v1/models",
    defaultModel: "google/gemini-2.0-flash-001",
    models: [
      "google/gemini-2.0-flash-001",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-haiku",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    keyHint: "sk-or-… (openrouter.ai)",
    freeTier: true,
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    kind: "openai",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    modelsEndpoint: "https://api.deepseek.com/v1/models",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    keyHint: "sk-… (platform.deepseek.com)",
    freeTier: true,
  },
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    kind: "openai",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    modelsEndpoint: "https://api.mistral.ai/v1/models",
    defaultModel: "mistral-small-latest",
    models: ["mistral-small-latest", "mistral-large-latest", "open-mistral-nemo"],
    keyHint: "32 caracteres (console.mistral.ai)",
    freeTier: true,
  },
  xai: {
    id: "xai",
    name: "xAI Grok",
    kind: "openai",
    endpoint: "https://api.x.ai/v1/chat/completions",
    modelsEndpoint: "https://api.x.ai/v1/models",
    defaultModel: "grok-3-mini",
    models: ["grok-3-mini", "grok-4", "grok-3"],
    keyHint: "xai-… (console.x.ai)",
  },
  cerebras: {
    id: "cerebras",
    name: "Cerebras",
    kind: "openai",
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    modelsEndpoint: "https://api.cerebras.ai/v1/models",
    defaultModel: "llama-3.3-70b",
    models: ["llama-3.3-70b", "llama3.1-8b", "qwen-3-32b"],
    keyHint: "csk-… (cloud.cerebras.ai)",
    freeTier: true,
  },
  fireworks: {
    id: "fireworks",
    name: "Fireworks AI",
    kind: "openai",
    endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
    modelsEndpoint: "https://api.fireworks.ai/inference/v1/models",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    models: [
      "accounts/fireworks/models/llama-v3p3-70b-instruct",
      "accounts/fireworks/models/llama4-maverick-instruct-basic",
    ],
    keyHint: "fw_… (fireworks.ai)",
  },
  together: {
    id: "together",
    name: "Together AI",
    kind: "openai",
    endpoint: "https://api.together.xyz/v1/chat/completions",
    modelsEndpoint: "https://api.together.xyz/v1/models",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
    ],
    keyHint: "64 hex (api.together.ai)",
  },
  zai: {
    id: "zai",
    name: "Z.ai (GLM)",
    kind: "openai",
    endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
    modelsEndpoint: "https://api.z.ai/api/paas/v4/chat/completions",
    defaultModel: "glm-4.5-flash",
    models: ["glm-4.5-flash", "glm-4.5-air", "glm-4.6"],
    keyHint: "id.secret (z.ai)",
    freeTier: true,
  },
  custom: {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    kind: "openai",
    endpoint: "", // user-provided
    modelsEndpoint: "",
    defaultModel: "",
    models: [],
    keyHint: "Cualquier endpoint compatible con OpenAI",
  },
};

export const PROVIDER_ORDER: ProviderId[] = [
  "gemini", "openai", "anthropic", "groq", "openrouter", "deepseek",
  "mistral", "xai", "cerebras", "fireworks", "together", "zai",
];

// ---------- Prefix detection (fast path, zero network) ----------

interface PrefixRule {
  test: (key: string) => boolean;
  /** Certain when true; candidates to probe when several. */
  sure?: ProviderId;
  candidates?: ProviderId[];
}

/**
 * Infrastructure credentials that will NEVER be an AI key. Users paste
 * deploy tokens by mistake (it happened: a Vercel vcp_ token) — detecting
 * them here lets the UI explain instead of a cryptic 401.
 */
export interface InfraIdentity { kind: "vercel" | "github" | "slack" | "aws"; name: string }
const INFRA_RULES: { test: (k: string) => boolean; id: InfraIdentity }[] = [
  { test: (k) => /^vcp_/.test(k), id: { kind: "vercel", name: "Vercel" } },
  { test: (k) => /^vci_/.test(k), id: { kind: "vercel", name: "Vercel" } },
  { test: (k) => /^vca_/.test(k), id: { kind: "vercel", name: "Vercel" } },
  { test: (k) => /^vercel_/.test(k), id: { kind: "vercel", name: "Vercel" } },
  { test: (k) => /^gh[pousr]_/.test(k) || k.startsWith("github_pat_"), id: { kind: "github", name: "GitHub" } },
  { test: (k) => /^xox[bpas]-/.test(k), id: { kind: "slack", name: "Slack" } },
  { test: (k) => /^AKIA/.test(k), id: { kind: "aws", name: "AWS" } },
];
export function detectInfraKey(key: string): InfraIdentity | null {
  for (const r of INFRA_RULES) if (r.test(key)) return r.id;
  return null;
}

const PREFIX_RULES: PrefixRule[] = [
  { test: (k) => k.startsWith("AIza"), sure: "gemini" },
  { test: (k) => k.startsWith("sk-ant-"), sure: "anthropic" },
  { test: (k) => k.startsWith("sk-or-"), sure: "openrouter" },
  { test: (k) => k.startsWith("sk-proj-") || k.startsWith("sk-svcacct-"), sure: "openai" },
  { test: (k) => k.startsWith("gsk_"), sure: "groq" },
  { test: (k) => k.startsWith("xai-"), sure: "xai" },
  { test: (k) => k.startsWith("csk-"), sure: "cerebras" },
  { test: (k) => k.startsWith("fw_"), sure: "fireworks" },
  { test: (k) => k.startsWith("tgp_v1_"), sure: "together" },
  { test: (k) => k.startsWith("sk-"), candidates: ["openai", "deepseek"] },
  // Z.ai keys look like "xxxxxxxx.yyyyyyyy"
  { test: (k) => /^[a-f0-9]{24,}\.[A-Za-z0-9]{8,}$/.test(k), candidates: ["zai", "mistral"] },
  { test: (k) => /^[A-Za-z0-9]{32}$/.test(k), candidates: ["mistral", "together"] },
];

export interface PrefixDetection {
  key: string;
  /** certain → no probe needed. */
  sure?: ProviderId;
  candidates: ProviderId[];
  fingerprint: string;
  /** Set when the key is an infrastructure token (Vercel/GitHub/…), not AI. */
  infra?: InfraIdentity;
}

/** Fast, offline detection. Returns candidates (≥1) for ANY plausible key. */
export async function detectFromPrefix(rawKey: string): Promise<PrefixDetection | null> {
  const key = rawKey.trim();
  if (!looksLikeApiKey(key)) return null;
  const fingerprint = (await sha256Hex(key)).slice(0, 16);
  const infra = detectInfraKey(key);
  if (infra) {
    return { key, candidates: [], fingerprint, infra };
  }
  for (const rule of PREFIX_RULES) {
    if (rule.test(key)) {
      return { key, sure: rule.sure, candidates: rule.sure ? [rule.sure] : (rule.candidates || []), fingerprint };
    }
  }
  // Unknown prefix: probe every OpenAI-compatible provider (e.g. gateways).
  return {
    key,
    candidates: ["openai", "groq", "openrouter", "deepseek", "mistral", "xai", "cerebras", "together", "zai"],
    fingerprint,
  };
}

// ---------- Network probe (slow path, only for ambiguous/unknown keys) ----------

export interface ProbeResult {
  provider: ProviderId;
  models: string[];
}

async function probeOne(provider: ProviderId, key: string, timeoutMs = 6000): Promise<ProbeResult | null> {
  const info = PROVIDERS[provider];
  if (!info.modelsEndpoint) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { ...(info.headers || {}) };
    if (info.kind === "anthropic") {
      headers["x-api-key"] = key;
    } else {
      headers["Authorization"] = `Bearer ${key}`;
    }
    const res = await fetch(info.modelsEndpoint, { headers, signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    // OpenAI-style {data:[{id}]} · Anthropic {data:[{id}]} · Gemini {models:[{name}]}
    const ids: string[] = Array.isArray(data?.data)
      ? data.data.map((m: any) => m?.id).filter(Boolean)
      : Array.isArray(data?.models)
        ? data.models.map((m: any) => (m?.name || "").replace(/^models\//, "")).filter(Boolean)
        : [];
    return { provider, models: ids };
  } catch {
    return null; // CORS block, network down, or wrong key — caller decides
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe ambiguous candidates in parallel; first provider that answers 200
 * with a model list wins. Returns null when nobody accepts the key.
 *
 * v5.1 FIX: probeOne never rejects (it resolves null on failure), so the
 * old Promise.any resolved with the FIRST settled value — usually an early
 * 401's null — without waiting for the other probes. A valid DeepSeek key,
 * for example, could end up "unresolved" just because OpenAI answered 401
 * faster. We now use allSettled and pick the first REAL winner.
 */
export async function probeCandidates(candidates: ProviderId[], key: string): Promise<ProbeResult | null> {
  const settled = await Promise.allSettled(candidates.map((c) => probeOne(c, key)));
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) return s.value;
  }
  return null;
}

/**
 * Chat-ping probe (v5.1): some /models endpoints are CORS-blocked or don't
 * exist, which made live detection fail even for VALID keys. A 1-token chat
 * request is the honest test — it uses exactly the path the app will use.
 * Costs ~1 token on success; failed auth (401) costs nothing.
 */
export async function pingProbe(candidates: ProviderId[], key: string): Promise<ProbeResult | null> {
  const attempts = candidates.map(async (c) => {
    const info = PROVIDERS[c];
    if (!info.endpoint) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      let url = info.endpoint;
      const headers: Record<string, string> = { "Content-Type": "application/json", ...(info.headers || {}) };
      let body: string;
      if (info.kind === "gemini") {
        url = `${info.endpoint}/${info.defaultModel}:generateContent`;
        headers["x-goog-api-key"] = key;
        body = JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 1 } });
      } else if (info.kind === "anthropic") {
        headers["x-api-key"] = key;
        body = JSON.stringify({ model: info.defaultModel, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
      } else {
        headers["Authorization"] = `Bearer ${key}`;
        body = JSON.stringify({ model: info.defaultModel, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
      }
      const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
      if (res.status === 200) return { provider: c, models: [] as string[] };
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
  const settled = await Promise.allSettled(attempts);
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) return s.value;
  }
  return null;
}

/** Does this provider expose the Google Search grounding tool? */
export function supportsGrounding(id: ProviderId): boolean {
  return id === "gemini";
}
