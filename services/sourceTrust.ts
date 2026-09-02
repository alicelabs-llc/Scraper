
/**
 * sourceTrust.ts — Source Safety Gate for ProdIntel (v1).
 *
 * WHAT THIS IS (honest): a deterministic, client-side safety assessment of the
 * URLs shown to the user, executed BEFORE any source link is displayed.
 *
 * WHAT THIS IS NOT (also honest): it does NOT claim Sentinel/UTA verification.
 * The UTA API (atc.alicelabs.site/api/trust) verifies trust CREDENTIALS; a
 * domain-reputation endpoint does not exist yet. When it ships, `assessSource`
 * is the single hook point to upgrade badges automatically (see TODO below).
 *
 * Signals used (all real, all local):
 *  - KNOWN_MARKETPLACES  -> "marketplace" (high confidence source)
 *  - URL shorteners      -> "risky" (destination hidden)
 *  - punycode/IP hosts   -> "risky" (homoglyph / non-name hosts)
 *  - plain http://       -> "caution" (unencrypted)
 *  - redirect params     -> "caution" (url=, redirect=, goto=)
 *  - high-abuse TLDs     -> "caution"
 *  - everything else     -> "external" (neutral, unknown)
 */

export type SourceStatus = 'marketplace' | 'external' | 'caution' | 'risky';

export interface SourceAssessment {
  status: SourceStatus;
  domain: string;
  reasons: string[];
}

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

export function assessSource(url: string | undefined | null): SourceAssessment | null {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: 'caution', domain: 'invalid-url', reasons: ['malformed URL'] };
  }

  const host = parsed.hostname.toLowerCase();
  const reasons: string[] = [];

  // Risky: IP literal instead of a name
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { status: 'risky', domain: host, reasons: ['host is a raw IP address'] };
  }

  // Risky: punycode (possible homoglyph attack: xn--)
  if (host.includes('xn--')) {
    return { status: 'risky', domain: host, reasons: ['punycode domain (possible look-alike)'] };
  }

  // Risky: URL shortener hides the real destination
  if (URL_SHORTENERS.some((s) => host === s || host.endsWith('.' + s) || host.includes(s))) {
    return { status: 'risky', domain: host, reasons: ['URL shortener (destination hidden)'] };
  }

  // Caution: unencrypted
  if (parsed.protocol === 'http:') reasons.push('unencrypted (http)');

  // Caution: open-redirect style params
  const params = [...parsed.searchParams.keys()];
  if (['url', 'redirect', 'goto', 'next', 'dest'].some((p) => params.includes(p))) {
    reasons.push('redirect parameter in URL');
  }

  // Caution: high-abuse TLD
  if (HIGH_ABUSE_TLDS.some((t) => host.endsWith(t))) {
    reasons.push(`high-abuse TLD (${host.slice(host.lastIndexOf('.'))})`);
  }

  const marketplace = KNOWN_MARKETPLACES.some((m) => host.includes(m));

  if (marketplace) {
    return { status: 'marketplace', domain: host, reasons: ['known marketplace'] };
  }
  if (reasons.length > 0) {
    const riskyCount = reasons.filter((r) => r !== 'unencrypted (http)' && !r.startsWith('redirect') && !r.startsWith('high-abuse')).length;
    return { status: 'caution', domain: host, reasons };
  }
  return { status: 'external', domain: host, reasons: [] };
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

// TODO(UTA): when atc.alicelabs.site ships a domain-reputation endpoint,
// call it here (async upgrade path) and keep the local result as fallback.
