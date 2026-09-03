
import { WinningProduct } from '../types';

/**
 * compare.ts — side-by-side product comparison (up to 3 items), persisted in
 * localStorage. Same event pattern as the watchlist so pages stay in sync.
 */

const KEY = 'prodintel_compare';
export const MAX_COMPARE = 3;
export const COMPARE_EVENT = 'prodintel-compare-changed';

export function loadCompare(): WinningProduct[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_COMPARE) : [];
  } catch {
    return [];
  }
}

function persist(items: WinningProduct[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_COMPARE)));
    window.dispatchEvent(new CustomEvent(COMPARE_EVENT));
  } catch { /* quota: comparison is best-effort */ }
}

export function isCompared(name: string): boolean {
  return loadCompare().some((p) => p.name === name);
}

export function toggleCompare(p: WinningProduct): WinningProduct[] {
  const items = loadCompare();
  const idx = items.findIndex((x) => x.name === p.name);
  if (idx >= 0) items.splice(idx, 1);
  else if (items.length < MAX_COMPARE) items.push(p);
  persist(items);
  return items;
}

export function removeFromCompare(name: string): WinningProduct[] {
  const items = loadCompare().filter((p) => p.name !== name);
  persist(items);
  return items;
}

export function clearCompare(): WinningProduct[] {
  persist([]);
  return [];
}
