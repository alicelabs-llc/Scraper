
/**
 * sourceTrust.ts — Source Safety Gate / Domain Reputation Engine for ProdIntel (v1.2).
 *
 * WHAT THIS IS (honest): a deterministic, transparent domain-reputation engine.
 * It runs in TWO places from this single source of truth:
 *   1. Client-side, for instant badges before the user clicks an external link
 *      (works offline; never blocks the UI — display is read-only).
 *   2. Server-side, inside /api/reputation (see api/reputation.ts), so ANY app
 *      or AI agent can request the same verdict over HTTP.
 *
 * WHAT THIS IS NOT (also honest): it does NOT claim Sentinel credential
 * verification and it is NOT a live threat feed. Signals are deterministic
 * heuristics, versioned via REPUTATION_ENGINE_VERSION. Live-feed upgrades
 * (Google Safe Browsing hook, OpenPhish) are spec'd in
 * alicelabs-llc/universal-trust-adapter · api/reputation-spec.md.
 *
 * Signals used (all real, all local):
 *  - KNOWN_MARKETPLACES  -> "marketplace"/trusted (high confidence source)
 *  - URL shorteners      -> "risky" (destination hidden)
 *  - punycode/IP hosts   -> "risky" (homoglyph / non-name hosts)
 *  - brand impersonation -> "risky" (typosquat or brand+login/secure pattern)
 *  - hosted store/site platforms -> "caution" (low barrier to publish)
 *  - plain http://       -> "caution" (unencrypted)
 *  - redirect params     -> "caution" (url=, redirect=, goto=)
 *  - high-abuse TLDs     -> "caution"
 *  - everything else     -> "external"/unknown (neutral)
 */

export type SourceStatus = 'marketplace' | 'external' | 'caution' | 'risky';
export type TrustVerdict = 'trusted' | 'unknown' | 'caution' | 'risky';

export const REPUTATION_ENGINE_VERSION = 'uta-reputation-v1.2';

export interface SourceAssessment {
  status: SourceStatus;
  verdict: TrustVerdict;
  /** 0-100. marketplace 95 · unknown 55 · caution 35 · risky 8, minus signal penalties. */
  score: number;
  domain: string;
  reasons: string[];
}

const VERDICT_BY_STATUS: Record<SourceStatus, TrustVerdict> = {
  marketplace: 'trusted',
  external: 'unknown',
  caution: 'caution',
  risky: 'risky',
};

const BASE_SCORE: Record<SourceStatus, number> = {
  marketplace: 95,
  external: 55,
  caution: 35,
  risky: 8,
};

const KNOWN_MARKETPLACES = [
  'amazon.', 'amzn.to', 'tiktok.com', 'aliexpress.', 'alibaba.',
  'etsy.com', 'ebay.', 'walmart.com', 'target.com', 'bestbuy.com',
  'shein.com', 'temu.com', 'mercadolibre.', 'mercadolibre.com',
  'shopify.com', 'flipkart.', 'jd.com', 'rakuten.', 'wayfair.',
  'homedepot.com', 'lowes.com', 'chinabrands.', 'dhgate.',
];

const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly',
  'rb.gy', 'shorturl.at', 'ow.ly', 'buff.ly', 'rebrand.ly', 'tiny.cc',
  'shorte.st', 'clk.sh', 'shrinkme.', 'urlshortener.',
];

const HIGH_ABUSE_TLDS = ['.zip', '.top', '.click', '.loan', '.review', '.country', '.download'];

/** Free-hosting / instant-store platforms: anyone can publish in minutes. */
const LOW_BARRIER_HOSTS = ['myshopify.', 'blogspot.', 'wixsite.', 'weebly.', '000webhostapp.'];

/** Typosquat lures: well-known brands deliberately misspelled (leetspeak). */
const BRAND_TYPOSQUAT = /(amaz[0o4]n|al[i1]express|payp[a4]l|go[o0]{2}gle|faceb[o0][o0]k|app[l1]e\.|m[i1]cr[o0]s[o0]ft|netf[l1]ix|st[r]?[i1]pe|w[a4]lm[a4]rt)/;

/** Brand impersonation amplifiers: credibility words paired with a brand token. */
const SUSPICIOUS_WORDS = /(login|secure|verify|account|support|billing|wallet|recovery|helpdesk)/;
const BRAND_TOKEN = /(amazon|aliexpress|paypal|google|facebook|apple|microsoft|netflix|stripe|walmart|tiktok|instagram|whatsapp|binance|metamask)/;

/** Normalize any user input (full URL or bare domain) to a parsable form. */
function toParsable(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed.replace(/^\/+/, '');
}

/**
 * Total function: evaluate ANY input (URL, bare domain, garbage) and return a
 * verdict with transparent reasons. Never throws, never returns null.
 */
export function evaluateDomain(input: string): SourceAssessment {
  if (!input || typeof input !== 'string' || input.length > 2048) {
    return { status: 'caution', verdict: 'caution', score: 20, domain: 'invalid-input', reasons: ['empty or malformed input'] };
  }

  let parsed: URL;
  try {
    parsed = new URL(toParsable(input));
  } catch {
    return { status: 'caution', verdict: 'caution', score: 20, domain: 'invalid-url', reasons: ['malformed URL'] };
  }

  const host = parsed.hostname.toLowerCase();
  const reasons: string[] = [];
  let penalties = 0;

  // Risky: IP literal instead of a name
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { status: 'risky', verdict: 'risky', score: 8, domain: host, reasons: ['host is a raw IP address'] };
  }

  // Risky: punycode (possible homoglyph attack: xn--)
  if (host.includes('xn--')) {
    return { status: 'risky', verdict: 'risky', score: 8, domain: host, reasons: ['punycode domain (possible look-alike)'] };
  }

  // Risky: URL shortener hides the real destination
  // v1.2 fix: match by exact host / subdomain (or platform prefix for dotted
  // patterns). Plain substring matching flagged legit marketplaces whose names
  // contain "t.co" inside "<name>.com" (walmart.com, target.com, homedepot.com,
  // flipkart.com) and hosts like blogspot.com — all wrongly scored risky 8.
  if (URL_SHORTENERS.some((s) =>
    s.endsWith('.') ? host.startsWith(s) : (host === s || host.endsWith('.' + s))
  )) {
    return { status: 'risky', verdict: 'risky', score: 8, domain: host, reasons: ['URL shortener (destination hidden)'] };
  }

  const lowBarrier = LOW_BARRIER_HOSTS.some((h) => host.includes(h));
  const marketplace = !lowBarrier && KNOWN_MARKETPLACES.some((m) => host.includes(m));

  // Risky: brand typosquat (amaz0n-pay.net) or brand + credibility word (amazon-secure.xyz).
  // Legit brand hosts (amazon.com, paypal.com) do not match: they lack typos AND amplifiers.
  const typo = BRAND_TYPOSQUAT.test(host);
  const amplified = BRAND_TOKEN.test(host) && SUSPICIOUS_WORDS.test(host);
  if ((typo || amplified) && !marketplace) {
    reasons.push(typo ? 'brand typosquat pattern (possible look-alike)' : 'brand name paired with credential-phishing word');
    return { status: 'risky', verdict: 'risky', score: 8, domain: host, reasons };
  }

  // Caution signals (each adds a penalty)
  if (parsed.protocol === 'http:') { reasons.push('unencrypted (http)'); penalties += 15; }

  const params = [...parsed.searchParams.keys()];
  if (['url', 'redirect', 'goto', 'next', 'dest'].some((p) => params.includes(p))) {
    reasons.push('redirect parameter in URL'); penalties += 10;
  }

  if (HIGH_ABUSE_TLDS.some((t) => host.endsWith(t))) {
    reasons.push(`high-abuse TLD (${host.slice(host.lastIndexOf('.'))})`); penalties += 10;
  }

  if (lowBarrier) {
    reasons.push('hosted on instant-publish platform (low barrier)'); penalties += 10;
  }

  const hyphens = (host.match(/-/g) || []).length;
  if (!marketplace && hyphens >= 4) { reasons.push(`unusual domain structure (${hyphens} hyphens)`); penalties += 5; }

  if (marketplace) {
    return { status: 'marketplace', verdict: 'trusted', score: BASE_SCORE.marketplace - Math.min(penalties, 20), domain: host, reasons: ['known marketplace'] };
  }
  if (reasons.length > 0) {
    return { status: 'caution', verdict: 'caution', score: Math.max(5, BASE_SCORE.caution - penalties), domain: host, reasons };
  }
  return { status: 'external', verdict: 'unknown', score: BASE_SCORE.external, domain: host, reasons: [] };
}

/**
 * Legacy badge entry point: null when there is nothing to assess (no URL),
 * otherwise a full assessment. Used by TrustBadge.
 */
export function assessSource(url: string | undefined | null): SourceAssessment | null {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;
  return evaluateDomain(url);
}

/** Aggregate the safety profile of a set of source URLs (for the Dashboard panel). */
export function summarizeSources(urls: (string | undefined)[]): Record<SourceStatus, number> {
  const out: Record<SourceStatus, number> = { marketplace: 0, external: 0, caution: 0, risky: 0 };
  for (const u of urls) {
    const a = assessSource(u);
    if (a) out[a.status] += 1;
  }
  return out;
}
