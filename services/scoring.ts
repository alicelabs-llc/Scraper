
/**
 * scoring.ts — pure product scoring (v5.1), framework-free and testable.
 */

import type { WinningProduct } from "../types";

/** Parse "70%" / "3.2x" / "65" into a 0-100 margin estimate. NaN when absent. */
export function marginPct(p: WinningProduct): number {
  const raw = String(p.potentialMargin || "");
  const pct = raw.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (pct) return Math.min(100, parseFloat(pct[1].replace(",", ".")));
  const mult = raw.match(/(\d+(?:[.,]\d+)?)\s*x/i);
  if (mult) {
    const v = parseFloat(mult[1].replace(",", "."));
    if (v > 1) return Math.min(100, ((v - 1) / v) * 100);
  }
  const num = raw.match(/(\d+(?:[.,]\d+)?)/);
  if (num) {
    const v = parseFloat(num[1].replace(",", "."));
    if (v > 0 && v <= 100) return v;
  }
  return NaN;
}

/**
 * Deal Score 0-100 (v5.1): trend momentum (55%) + parsed margin (35%)
 * + a REAL source link (10%). One number to sort the hunt by.
 */
export function dealScore(p: WinningProduct): number {
  const trend = Math.max(0, Math.min(100, p.trendScore || 0));
  const margin = marginPct(p);
  const m = Number.isNaN(margin) ? 0 : margin;
  const sourced = p.sourceUrl && p.sourceUrl.startsWith("http") ? 100 : 0;
  return Math.round(0.55 * trend + 0.35 * m + 0.10 * sourced);
}
