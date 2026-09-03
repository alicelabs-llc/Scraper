
/**
 * security.ts — ProdIntel hardening layer (v5 "Alicelabs Secure").
 *
 * Client-side defenses, all local, zero network:
 *  - API key hygiene: sanitize (strip control/zero-width chars), validate
 *    charset/length, mask for display. Keys never leave the browser except
 *    to the detected provider's official endpoint over HTTPS.
 *  - localStorage tamper detection: JSON payloads are stored with a SHA-256
 *    integrity tag (key + per-install random salt). A modified payload is
 *    discarded instead of executed/rendered.
 *  - Local rate limiting for expensive actions (scan button spam, etc.).
 *  - Safe external URL gate: only http(s), blocks javascript:/data: and
 *    absurd lengths before anything is rendered as a link.
 */

// ---------- API key hygiene ----------

/** Max plausible key length across known providers. */
export const MAX_KEY_LENGTH = 300;

/** Strip whitespace, control chars and zero-width/invisible characters. */
export function sanitizeApiKey(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "") // zero-width / joiners
    .replace(/[\s\u0000-\u001F\u007F-\u009F]/g, "") // whitespace + control
    .slice(0, MAX_KEY_LENGTH);
}

/**
 * Charset gate accepted BEFORE any network call. Deliberately generous:
 * covers Google (AIza…), OpenAI (sk-…), Anthropic (sk-ant-…), Groq (gsk_…),
 * OpenRouter (sk-or-…), xAI (xai-…), Cerebras (csk-…), Fireworks (fw_…),
 * Together (tgp_v1_…), Mistral (32 alnum), Z.ai (hex.hex) and custom gateways.
 * Rejects injection attempts (quotes, html, spaces, unicode tricks).
 */
export function looksLikeApiKey(key: string): boolean {
  if (!key || key.length < 12 || key.length > MAX_KEY_LENGTH) return false;
  return /^[A-Za-z0-9_\-.=+:]+$/.test(key);
}

/** Human-safe display: keep first/last 4 chars only. */
export function maskKey(key: string): string {
  const k = sanitizeApiKey(key);
  if (k.length <= 10) return "•".repeat(k.length);
  return `${k.slice(0, 4)}${"•".repeat(Math.min(10, k.length - 8))}${k.slice(-4)}`;
}

// ---------- Integrity-tagged storage ----------

const SALT_KEY = "prodintel_salt";

function getSalt(): string {
  try {
    let s = localStorage.getItem(SALT_KEY);
    if (!s) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      s = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(SALT_KEY, s);
    }
    return s;
  } catch {
    return "prodintel-fallback-salt";
  }
}

export async function sha256Hex(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Very old browsers: degrade to no-integrity mode (feature, not security)
    return "";
  }
}

/** Store JSON with an integrity tag. Throws only if storage itself fails. */
export async function saveWithIntegrity(storageKey: string, value: unknown): Promise<void> {
  const data = JSON.stringify(value);
  const tag = await sha256Hex(data + getSalt());
  localStorage.setItem(storageKey, JSON.stringify({ __pi: 1, d: value, h: tag }));
}

/**
 * Read an integrity-tagged payload. Accepts legacy plain-JSON payloads
 * (migrates them transparently); returns `fallback` when the tag mismatches
 * (tampered or corrupted) AND clears the tampered entry.
 */
export async function loadWithIntegrity<T>(
  storageKey: string,
  fallback: T,
  reSave = true
): Promise<T> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    return fallback;
  }
  if (!raw) return fallback;

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.removeItem(storageKey);
    return fallback;
  }

  // Legacy plain payload (array or object without our marker): migrate.
  if (parsed === null || typeof parsed !== "object" || parsed.__pi !== 1) {
    const migrated = parsed as unknown as T;
    if (reSave) {
      try { await saveWithIntegrity(storageKey, migrated); } catch { /* best effort */ }
    }
    return migrated;
  }

  const tag = await sha256Hex(JSON.stringify(parsed.d) + getSalt());
  if (!tag || tag !== parsed.h) {
    localStorage.removeItem(storageKey);
    return fallback;
  }
  return parsed.d as T;
}

// ---------- Local rate limiting ----------

const RL_KEY = "prodintel_rl";

/**
 * Sliding-window limiter for expensive user-triggered actions.
 * Returns true when the action is allowed (and records it), false when the
 * user should wait. State lives in localStorage so it survives reloads.
 */
export function rateLimitLocal(action: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  let buckets: Record<string, number[]> = {};
  try { buckets = JSON.parse(localStorage.getItem(RL_KEY) || "{}"); } catch { /* fresh */ }
  const hits = (buckets[action] || []).filter((ts) => now - ts < windowMs);
  if (hits.length >= max) {
    try { localStorage.setItem(RL_KEY, JSON.stringify(buckets)); } catch { /* ignore */ }
    return false;
  }
  hits.push(now);
  buckets[action] = hits;
  // prune stale actions entirely
  for (const k of Object.keys(buckets)) {
    if (!buckets[k].some((ts) => now - ts < 3600_000)) delete buckets[k];
  }
  try { localStorage.setItem(RL_KEY, JSON.stringify(buckets)); } catch { /* ignore */ }
  return true;
}

// ---------- Safe external links ----------

/**
 * Gate for ANY url that will become an <a href>. Blocks javascript:/data:/
 * vbscript: injection, embedded credentials and absurd lengths.
 * Returns null when the URL must not be linked.
 */
export function safeExternalUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== "string" || url.length > 2048) return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    if (u.username || u.password) return null;
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** True when hostname looks like a private/internal target (SSRF hygiene). */
export function isPrivateHost(hostname: string): boolean {
  const h = (hostname || "").toLowerCase();
  if (!h) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal" || h.startsWith("169.254")) return true;
  return false;
}
