# Changelog

All notable changes to this project will be documented in this file.
## [5.0.0] - 2026-09-03

### Added
- **Universal BYOK**: paste ANY AI API key — Gemini, OpenAI, Anthropic, Groq, OpenRouter, DeepSeek, Mistral, xAI, Cerebras, Fireworks, Together, Z.ai — auto-detected from its prefix, with live probe of official /models endpoints for ambiguous/unknown prefixes; custom OpenAI-compatible endpoints supported (Ollama, LM Studio, vLLM, LiteLLM, gateways)
- **Free live market signals**: keyless scraping of Reddit (5 e-commerce subs), Hacker News (Algolia) and Google Trends (server-side via new `/api/signals` edge function); merged, deduped, cached 30 min and injected into every AI prompt so all providers can cite REAL just-scraped URLs; works with zero configuration
- **Compare page**: up to 3 products side-by-side (price, margin, trend, UTA trust score) with AI verdict through the active provider
- **Market Radar panel** on Dashboard and Daily Hunt (works before any API key is entered)

### Security (anti-hacking)
- CSP + HSTS + X-Frame-Options DENY + nosniff + strict referrer/permissions policy on every route (vercel.json headers + meta CSP)
- Per-IP rate limiting on `/api/reputation` (60/min) and `/api/signals` (40/min), request size caps, strict country allowlist for Google Trends (SSRF hygiene)
- API key hygiene: sanitization (control/zero-width chars), charset validation, masked display; keys sent ONLY to the provider's official HTTPS endpoint
- Local rate limits on scans (10/10min), connection tests (12/min) and comparisons (20/10min)
- `safeExternalUrl` gate on every rendered external link (blocks javascript:/data:, embedded credentials)
- Chromium-grade response size caps + hard timeouts on all AI and scraping calls

### Changed
- `@google/genai` SDK removed from the runtime path (uniform fetch adapters per provider) — bundle 550KB → 323KB gzip 97KB
- Gemini-only prompt enrichment replaced by grounding (when available) + live free-source signals (always)
- README/LICENSE rebranded: ProdIntel by Alicelabs LLC (v5)


## [0.1.0] - 2026-04-04

### Added
- Winning product finder with Gemini + Google Search grounding
- Niche analysis with opportunity scoring
- Market trends dashboard with sparklines
- AI assistant for market research queries
- Multi-language support (EN, ES, FR, DE, ZH)
- Product details page with margin and competition analysis
