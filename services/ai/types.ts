
/**
 * types.ts — shared AI-layer types (kept dependency-free to avoid cycles).
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
