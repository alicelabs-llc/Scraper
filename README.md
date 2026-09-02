<div align="center">

# Scraper
**AI-powered product research tool for ecommerce sellers**

[![License: MIT](https://img.shields.io/badge/License-MIT-238636?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Gemini](https://img.shields.io/badge/Powered%20by-Gemini-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)

Find winning products before your competitors do. Scraper uses Gemini + Google Search to surface trending products across TikTok Shop, Amazon, and global marketplaces in real time.

Built by [AliceLabs LLC](https://alicelabs.site)

</div>

---

## What it does

- **Winning product finder** — scans TikTok Shop, Amazon, and global marketplaces for trending products with high margins, grounded in live Google Search with real source links
- **Source Safety Gate** — every source link is assessed BEFORE you click it (known marketplaces, URL shorteners, punycode/homoglyphs, raw IPs, redirect params, http) with a visible badge and reasons
- **Watchlist** — save products and track them across daily scans; CSV export included
- **Search, niche filter & sorting** — slice a 30-product scan in seconds; genuinely NEW findings vs. your previous scan are flagged
- **Honest dashboard** — every metric (products found, avg trend score, dominant niche, scan history, source safety breakdown) is computed from YOUR real scan data. No invented numbers.
- **Niche analysis** — scores niches by opportunity level with market concentration (Gini index)
- **AI assistant** — ask questions about any niche or product and get instant market intelligence
- **Multi-language** — English, Spanish, French, German, Chinese (UI + AI responses)

## Trust & privacy

- **BYOK** — your Gemini key lives only in your browser's localStorage; it is never bundled, committed, or sent to any server other than Google's API
- **Source Safety Gate** runs 100% locally and deterministically — it never claims a "verified" status it cannot back
- Built by [AliceLabs LLC](https://alicelabs.site) — the UTA/Sentinel trust ecosystem


## Tech stack

- React + TypeScript
- Vite
- Google Gemini API (with Google Search grounding)
- Tailwind CSS

## Quick start

**This app is BYOK (Bring Your Own Key)** — no server, no accounts, no cost:

1. Get a **free Gemini API key** at [aistudio.google.com](https://aistudio.google.com/)
2. Open ProdIntel → **Settings → AI Connection (BYOK)** → paste your key → **Test Connection**
3. Your key is stored **only in your browser** (localStorage) and is sent **only to Google's API**. It is never bundled into the code, never committed to git, and never transmitted to AliceLabs servers.

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
