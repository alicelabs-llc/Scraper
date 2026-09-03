
/**
 * vault.ts — ProdIntel Key Vault (v5.1 "Redundancy").
 *
 * The user asked: "pon varias apis, por si una no funciona". This vault is
 * exactly that: an ordered list of BYOK keys. Every AI call walks the list
 * top-down; when a key fails (invalid, quota, provider down), the next one
 * takes over transparently.
 *
 * Security invariants (unchanged):
 *  - Keys live ONLY in this browser (localStorage, integrity-tagged).
 *  - Keys are sent ONLY to the official endpoint of the detected provider.
 *  - Nothing ever reaches Alicelabs servers.
 */

import {
  loadWithIntegrity, saveWithIntegrity, sanitizeApiKey, looksLikeApiKey, maskKey,
} from "../security";
import { detectFromPrefix } from "./providers";

export type VaultStatus = "unknown" | "ok" | "invalid" | "error";

export interface VaultEntry {
  id: string;
  label: string;
  key: string;
  addedAt: number;
  status: VaultStatus;
  statusDetail?: string;
  provider?: string;      // detected provider id (when known)
  lastError?: string;     // last failure reason (short)
}

const K_VAULT = "prodintel_keys_v1";
const K_PRIMARY = "prodintel_api_key"; // legacy single-key slot = vault[0]

export const VAULT_EVENT = "prodintel-vault-changed";

function emitChanged() {
  try { window.dispatchEvent(new CustomEvent(VAULT_EVENT)); } catch { /* ignore */ }
}

function newId(): string {
  try {
    const b = new Uint8Array(8);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return String(Date.now()) + Math.random().toString(16).slice(2, 8);
  }
}

export async function getVault(): Promise<VaultEntry[]> {
  const list = await loadWithIntegrity<VaultEntry[]>(K_VAULT, [], true);
  if (!Array.isArray(list)) return [];

  // One-time migration: a legacy primary key becomes vault entry #1.
  let legacy: string | null = null;
  try {
    const raw = localStorage.getItem(K_PRIMARY);
    legacy = raw && raw.trim().length > 10 ? sanitizeApiKey(raw) : null;
  } catch { /* ignore */ }

  if (legacy) {
    const already = list.some((e) => e.key === legacy);
    if (!already) {
      list.unshift({
        id: newId(), label: maskKey(legacy), key: legacy,
        addedAt: Date.now(), status: "unknown",
      });
      await saveWithIntegrity(K_VAULT, list);
    }
  }
  return list;
}

/** Keys in priority order (vault[0] = primary). Max 5 keys are used per call. */
export async function orderedKeys(): Promise<string[]> {
  const list = await getVault();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of list) {
    if (e.key && !seen.has(e.key)) { seen.add(e.key); out.push(e.key); }
  }
  // Legacy slot still wins when the vault is empty (first-run compat).
  if (!out.length) {
    try {
      const raw = localStorage.getItem(K_PRIMARY);
      if (raw && raw.trim().length > 10) out.push(sanitizeApiKey(raw));
    } catch { /* ignore */ }
  }
  return out;
}

function syncPrimary(list: VaultEntry[]) {
  try {
    if (list[0]?.key) localStorage.setItem(K_PRIMARY, list[0].key);
    else localStorage.removeItem(K_PRIMARY);
  } catch { /* ignore */ }
}

async function persist(list: VaultEntry[]) {
  syncPrimary(list);
  await saveWithIntegrity(K_VAULT, list);
  emitChanged();
}

export async function addToVault(rawKey: string, label?: string): Promise<VaultEntry | null> {
  const key = sanitizeApiKey(rawKey);
  if (!key || !looksLikeApiKey(key)) return null;
  const list = await getVault();
  const existing = list.find((e) => e.key === key);
  if (existing) return existing;

  // Instant offline label: prefix detection when it is conclusive.
  let provider: string | undefined;
  let detected = "";
  try {
    const det = await detectFromPrefix(key);
    if (det?.sure) { provider = det.sure; detected = det.sure; }
  } catch { /* ignore */ }

  const entry: VaultEntry = {
    id: newId(),
    label: (label || "").trim() || maskKey(key),
    key,
    addedAt: Date.now(),
    status: "unknown",
    provider,
  };
  list.push(entry);
  await persist(list);
  void detected;
  return entry;
}

export async function removeFromVault(id: string): Promise<void> {
  const list = await getVault();
  const next = list.filter((e) => e.id !== id);
  await persist(next);
}

/** Move an entry up (-1) or down (+1) in priority. */
export async function moveVault(id: string, dir: -1 | 1): Promise<void> {
  const list = await getVault();
  const i = list.findIndex((e) => e.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const [e] = list.splice(i, 1);
  list.splice(j, 0, e);
  await persist(list);
}

export async function setVaultStatus(
  id: string, status: VaultStatus, detail?: string
): Promise<void> {
  const list = await getVault();
  const e = list.find((x) => x.id === id);
  if (!e) return;
  e.status = status;
  e.statusDetail = detail ? String(detail).slice(0, 200) : undefined;
  await saveWithIntegrity(K_VAULT, list);
  emitChanged();
}

/** Record the outcome of the last call that used this key (by key value). */
export async function markKeyByKey(
  key: string, status: VaultStatus, detail?: string
): Promise<void> {
  const list = await getVault();
  const e = list.find((x) => x.key === key);
  if (!e) return;
  e.status = status;
  e.statusDetail = detail ? String(detail).slice(0, 200) : undefined;
  await saveWithIntegrity(K_VAULT, list);
  emitChanged();
}

export async function clearVault(): Promise<void> {
  await persist([]);
}

/** Detected-provider labels for UI lists (cheap, offline). */
export async function vaultWithLabels(): Promise<(VaultEntry & { providerName?: string })[]> {
  const list = await getVault();
  return list;
}
