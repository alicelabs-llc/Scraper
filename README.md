<div align="center">

# ProdIntel
**AI product intelligence for ecommerce sellers — ANY AI provider, free live signals, UTA trust gate**

[![License](https://img.shields.io/badge/License-Alicelabs_(MIT)-238636?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![AI Providers](https://img.shields.io/badge/AI-Any_provider-8B5CF6?style=flat-square)]()
[![Live](https://img.shields.io/badge/Live-prodintel--two.vercel.app-135bec?style=flat-square)](https://prodintel-two.vercel.app)

Find winning products before your competitors do. ProdIntel works with **any AI API key** (Gemini, OpenAI, Claude, Groq, OpenRouter, DeepSeek, Mistral, xAI, Cerebras, Fireworks, Together, Z.ai — or any OpenAI-compatible endpoint), scrapes **free public market signals** (Reddit · Hacker News · Google Trends), and gates every source link through the **UTA reputation engine**.

Built by [AliceLabs LLC](https://alicelabs.site)

</div>

---

## What it does

- **Universal BYOK (v5)** — paste ANY API key: ProdIntel detects the provider from its prefix (and probes official `/models` + 1-token chat pings for ambiguous keys) and starts working immediately. Custom OpenAI-compatible endpoints supported (Ollama, LM Studio, vLLM, LiteLLM, gateways)
- **Key vault with automatic failover (v5.1)** — store MULTIPLE keys in priority order: if one fails (invalid, out of quota, provider down), ProdIntel silently jumps to the next one, mid-request. Failed keys are marked in the UI with an honest per-key diagnosis (rejected / quota / network) and free-key links to recover in one click
- **Infrastructure-token guard (v5.1)** — paste a Vercel (`vcp_`/`vci_`/`vca_`), GitHub (`ghp_`/`github_pat_`), Slack or AWS credential by mistake and ProdIntel explains EXACTLY what you pasted instead of showing a cryptic 401 "connection failure"
- **Deal Score (v5.1)** — every product gets one 0-100 number (trend momentum 55% + parsed margin 35% + real source link 10%); sort by it, filter by min trend / min margin
- **Free live market signals (v5)** — Reddit (r/dropship, r/ecommerce, r/Entrepreneur, r/BusinessIdeas, r/sidehustle), Hacker News (Algolia) and Google Trends (server-side via `/api/signals`) are scraped keylessly and fed into every AI prompt, so even non-grounding models cite REAL, just-scraped URLs
- **Compare (v5)** — select up to 3 products, see price/margin/trend/trust side-by-side and get an AI verdict
- **Winning product finder** — scans TikTok Shop, Amazon, and global marketplaces for trending products with high margins, grounded in live search with real source links
- **Source Safety Gate (UTA)** — every source link is assessed BEFORE you click it (known marketplaces, URL shorteners, punycode/homoglyphs, raw IPs, redirect params, http) with a visible badge, plus server-confirmed badges from the live reputation endpoint
- **Watchlist** — save products and track them across daily scans; CSV export included
- **Search, niche filter & sorting** — slice a 30-product scan in seconds; genuinely NEW findings vs. your previous scan are flagged
- **Honest dashboard** — every metric (products found, avg trend score, dominant niche, scan history, source safety breakdown) is computed from YOUR real scan data. No invented numbers.
- **Niche analysis** — scores niches by opportunity level with market concentration (Gini index)
- **AI assistant** — conversion copy for any product in seconds
- **Multi-language** — English, Spanish, French, German, Chinese (UI + AI responses)

## How it is different (honest competitive landscape)

The "winning product" space is crowded — here is where ProdIntel actually differs, no marketing fog:

| Tool | Model | Price | Data source | AI | BYOK | Source trust gate |
|---|---|---|---|---|---|---|
| **Minea** | Ad spy (FB/TikTok/Pinterest) | from ~$39/mo | Their ad-library index | Limited | ✗ | ✗ |
| **Dropship.io** | Store/sales tracking | from ~$29/mo | Shopify revenue tracking | Limited | ✗ | ✗ |
| **Sell The Trend** | Predictive Nexus AI | from ~$29.97/mo | Store + ad aggregates | Partial | ✗ | ✗ |
| **PiPiAds** | TikTok ad spy | paid tiers | TikTok ad library | Limited | ✗ | ✗ |
| **ProdIntel** | **AI research agent** | **free — your keys** | **Live AI search (Gemini grounding) + free public signals (Reddit/HN/Trends) with cited URLs** | **Full (12 providers + failover)** | ✓ | **✓ UTA reputation badges** |

The real differentiators: (1) **price** — competitors are subscriptions, ProdIntel is free software where you plug the AI keys you already have; (2) **provider freedom + failover** — nobody else runs your hunt across Gemini, OpenAI, Claude, Groq, etc. and survives an outage; (3) **trust-gated sources** — the only product-research tool that verifies every cited link through a reputation engine (UTA) before you click; (4) **privacy** — keys and data never leave your browser; (5) **citations or silence** — products come with REAL, clickable, trust-checked sources, not vague "trending" claims.

## Trust & privacy (anti-hacking)

- **Universal BYOK** — your key lives only in your browser's localStorage; it is never bundled, committed, or sent anywhere except the official HTTPS endpoint of the detected provider. Alicelabs servers never see a key
- **Key hygiene** — keys are sanitized (control/zero-width chars stripped), charset-validated and masked for display before any use
- **Local rate limits** — scans, connection tests and AI comparisons are rate-limited client-side (no runaway spend)
- **Server hardening** — CSP, HSTS, X-Frame-Options DENY, nosniff, strict referrer policy and permissions policy on every route; both public API endpoints (`/api/reputation`, `/api/signals`) are per-IP rate limited, size-capped and fetch ONLY internal allowlisted sources
- **Source Safety Gate** runs 100% locally and deterministically — it never claims a "verified" status it cannot back
- Built by [AliceLabs LLC](https://alicelabs.site) — the UTA/Sentinel trust ecosystem


## Tech stack

- React + TypeScript
- Vite
- Universal AI provider layer (Gemini, OpenAI, Anthropic, Groq, OpenRouter, DeepSeek, Mistral, xAI, Cerebras, Fireworks, Together, Z.ai, custom endpoints)
- Free-signal scrapers (Reddit · Hacker News · Google Trends) + `/api/signals` edge function
- Tailwind CSS

## Quick start

**This app is BYOK (Bring Your Own Key)** — no server, no accounts, no cost:

1. Grab any AI key you already have — Gemini (free at [aistudio.google.com](https://aistudio.google.com/)), OpenAI, Groq (free), OpenRouter, DeepSeek, Cerebras (free)…
2. Open ProdIntel → **Settings → AI Connection** → paste the key → the provider is detected automatically → **Test Connection**
3. Your key is stored **only in your browser** (localStorage) and is sent **only to that provider's official endpoint**. It is never bundled into the code, never committed to git, and never transmitted to Alicelabs servers.

```bash
git clone https://github.com/alicelabs-llc/Scraper.git
cd Scraper
npm install
npm run dev
```

Open `http://localhost:3000`, add your key in Settings, and run your first Daily Hunt.

> Developers only: you can optionally set `GEMINI_API_KEY` in a local `.env` file for dev convenience — but any key bundled by Vite `define` is visible in the build output, so prefer BYOK.


## Pages

| Page | Description |
|------|-------------|
| Dashboard | Market metrics overview with trend sparklines |
| Daily Finder | Today's top trending products with scores |
| Product Details | Deep dive into any product — margin, competition, why it's winning |
| Analysis | Niche-level breakdown and opportunity scoring |
| AI Assistant | Chat interface for market research questions |
| Settings | Language and user preferences |

## Use case

Built for dropshippers, Amazon FBA sellers, and TikTok Shop creators who need to identify winning products fast without manual research. Scraper automates the research process using live Google Search data grounded through Gemini.

## Domain Reputation API (`/api/reputation`)

**LIVE: `https://prodintel-two.vercel.app/api/reputation`** — free, public, keyless. Every source link shown in ProdIntel passes a **Source Safety Gate** before display: a deterministic domain-reputation engine (marketplace allowlist, shorteners, punycode, raw IPs, brand typosquats, low-barrier hosts, abused TLDs, redirect params). The same engine is exposed as a **public HTTP endpoint** so any app, bot, or AI agent can ask "can I trust this domain?" — no API key, no registration.

```bash
# Verdict for any URL or bare domain
curl "https://prodintel-two.vercel.app/api/reputation?domain=aliexpress.com"
curl "https://prodintel-two.vercel.app/api/reputation?url=https://bit.ly/x"

# POST also works
curl -X POST "https://prodintel-two.vercel.app/api/reputation" \
  -H "Content-Type: application/json" -d '{"url": "https://amaz0n-deals.net/shop"}'

# Availability probe
curl "https://prodintel-two.vercel.app/api/reputation?probe=1"
```

Response (deterministic per `engine` version, CDN-cacheable 24h):

```json
{
  "engine": "uta-reputation-v1.2",
  "domain": "bit.ly",
  "verdict": "risky",
  "score": 8,
  "reasons": ["URL shortener (destination hidden)"]
}
```

Verdicts: `trusted` (95) · `unknown` (55) · `caution` (35) · `risky` (8), always with transparent reasons. The client runs the identical engine locally — badges render instantly offline, then get server-confirmed (the `UTA` chip) when the endpoint is reachable; on failure it degrades silently. Fail-closed semantics for *actions* (as opposed to display) are the caller's policy — see the spec in [`alicelabs-llc/universal-trust-adapter · api/reputation-spec.md`](https://github.com/alicelabs-llc/universal-trust-adapter/blob/main/api/reputation-spec.md).

**Deploy:** the app + API are live at **https://prodintel-two.vercel.app** (static mirror: https://alicelabs-llc.github.io/Scraper/). The repo ships `vercel.json` + the API route in `api/` — import it into any Vercel account (or `npx vercel --prod`) and app + API deploy together in one shot.

---

© 2026 AliceLabs LLC · [alicelabs.site](https://alicelabs.site) · [contacto@alicelabs.site](mailto:contacto@alicelabs.site)
