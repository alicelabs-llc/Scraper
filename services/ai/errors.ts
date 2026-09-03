
/**
 * errors.ts — typed AI errors + honest, actionable classification (v5.1).
 *
 * "Fallo de conexión" is not enough. Every failure is classified so the UI
 * can tell the user EXACTLY what happened and what to do next:
 *   - INFRA key pasted (Vercel/GitHub/Slack/AWS token) → it will never be an AI key.
 *   - Key rejected (401/403) → invalid/expired credentials for that provider.
 *   - Quota (429) → usage limit; the vault already tried the next key.
 *   - Network → browser could not reach the provider (offline / blocked).
 *   - No provider accepted the key → with links to free AI keys.
 */

export type InfraKind = "vercel" | "github" | "slack" | "aws";

/** The pasted credential belongs to infrastructure, not to an AI provider. */
export class InfraKeyError extends Error {
  kind: InfraKind;
  name: string;
  constructor(kind: InfraKind) {
    super(`INFRA_KEY:${kind}`);
    this.name = "InfraKeyError";
    this.kind = kind;
  }
}

export interface FailoverAttempt {
  provider: string;   // provider display name
  keyLabel: string;   // masked key fragment
  error: string;      // short raw error
}

/** Every key in the vault was tried and none worked. */
export class AiFailoverError extends Error {
  attempts: FailoverAttempt[];
  name: string;
  constructor(attempts: FailoverAttempt[]) {
    super("ALL_PROVIDERS_FAILED");
    this.name = "AiFailoverError";
    this.attempts = attempts;
  }
}

export type AiErrorKind =
  | "missing" | "infra" | "rejected" | "quota" | "network"
  | "noprovider" | "rate" | "timeout" | "other";

export interface ParsedAiError {
  kind: AiErrorKind;
  /** infra kind when kind === 'infra' */
  infra?: InfraKind;
  /** provider display name when known */
  provider?: string;
  /** per-key attempts when the whole vault was tried */
  attempts?: FailoverAttempt[];
  raw?: string;
}

export function parseAiError(err: unknown): ParsedAiError {
  const name = (err as Error)?.name || "";
  const msg = String((err as Error)?.message || err || "");

  if (name === "MissingApiKeyError" || msg.includes("MISSING_API_KEY")) {
    return { kind: "missing" };
  }
  if (name === "InfraKeyError" || msg.startsWith("INFRA_KEY:")) {
    const kind = (msg.split(":")[1] || "vercel") as InfraKind;
    return { kind: "infra", infra: kind };
  }
  if (name === "AiFailoverError" || msg.includes("ALL_PROVIDERS_FAILED")) {
    const fe = err as AiFailoverError;
    const attempts = fe.attempts || [];
    // Classify by dominant failure reason across attempts.
    const all = attempts.map((a) => a.error).join(" | ");
    if (/HTTP_401|HTTP_403|API key not valid|API_KEY_INVALID/.test(all) ||
        (/HTTP_400/.test(all) && /api[_ ]?key/i.test(all))) {
      return { kind: "rejected", attempts, raw: msg };
    }
    if (/HTTP_429/.test(all)) return { kind: "quota", attempts, raw: msg };
    if (/Failed to fetch|NetworkError|Load failed|ERR_NAME/i.test(all)) {
      return { kind: "network", attempts, raw: msg };
    }
    return { kind: "other", attempts, raw: msg };
  }
  if (msg.includes("HTTP_401") || msg.includes("HTTP_403")) {
    return { kind: "rejected", raw: msg.slice(0, 200) };
  }
  // Gemini (and some gateways) answer 400 for INVALID keys:
  // "API key not valid. Please pass a valid API key."
  if (msg.includes("API key not valid") || msg.includes("API_KEY_INVALID") ||
      (/HTTP_400/.test(msg) && /api[_ ]?key/i.test(msg))) {
    return { kind: "rejected", raw: msg.slice(0, 200) };
  }
  if (msg.includes("HTTP_429")) {
    return { kind: "quota", raw: msg.slice(0, 200) };
  }
  if (/Failed to fetch|NetworkError|Load failed|ERR_NAME|ERR_INTERNET/i.test(msg)) {
    return { kind: "network", raw: msg.slice(0, 200) };
  }
  if (msg.includes("NO_PROVIDER") || msg.includes("KEY_FORMAT")) {
    return { kind: "noprovider", raw: msg.slice(0, 200) };
  }
  if (msg.includes("RATE_LIMITED")) {
    return { kind: "rate", raw: msg.slice(0, 200) };
  }
  if (name === "AbortError" || msg.includes("abort") || msg.includes("TIMEOUT")) {
    return { kind: "timeout", raw: msg.slice(0, 200) };
  }
  return { kind: "other", raw: msg.slice(0, 200) };
}

/** Local rate limit message → same classification pipeline. */
export function isLocalRateError(msg: string): boolean {
  return msg.includes("RATE_LIMITED");
}
