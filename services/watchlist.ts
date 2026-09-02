
import { WinningProduct } from '../types';

/**
 * watchlist.ts — products saved by the user, persisted in localStorage.
 * Survives scans so the seller can track items across days.
 */

const KEY = 'prodintel_watchlist';

export interface WatchItem extends WinningProduct {
  addedAt: string; // ISO date
  lastScore: number;
}

export function loadWatchlist(): WatchItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(items: WatchItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('prodintel-watchlist-changed'));
}

export function isWatched(name: string): boolean {
  return loadWatchlist().some((w) => w.name === name);
}

export function addToWatchlist(p: WinningProduct): WatchItem[] {
  const items = loadWatchlist();
  if (items.some((w) => w.name === p.name)) return items;
  items.unshift({
    ...p,
    addedAt: new Date().toISOString(),
    lastScore: Number(p.trendScore) || 0,
  });
  persist(items);
  return items;
}

export function removeFromWatchlist(name: string): WatchItem[] {
  const items = loadWatchlist().filter((w) => w.name !== name);
  persist(items);
  return items;
}

export function toggleWatchlist(p: WinningProduct): WatchItem[] {
  return isWatched(p.name) ? removeFromWatchlist(p.name) : addToWatchlist(p);
}

/** Names saved from the PREVIOUS scan — used to mark new findings as NEW. */
export function rememberScanNames(names: string[], lang: string) {
  try {
    localStorage.setItem(`prodintel_prev_names_${lang}`, JSON.stringify(names.slice(0, 100)));
  } catch { /* ignore */ }
}

export function previousScanNames(lang: string): string[] {
  try {
    const raw = localStorage.getItem(`prodintel_prev_names_${lang}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
