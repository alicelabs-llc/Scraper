# Changelog

All notable changes to this project will be documented in this file.
## [5.1.0] - 2026-09-03

### Fixed (the "connection failure" report)
- Root cause: the pasted credential was a VERCEL token (vcp_ family, introduced Feb 2026), not an AI API key — no AI provider can accept it. ProdIntel now detects infrastructure tokens (Vercel vcp_/vci_/vca_/vercel_, GitHub ghp_/github_pat_, Slack xox*, AWS AKIA) and explains exactly what was pasted, instead of a cryptic 401
- BUGFIX: probeCandidates used Promise.any over promises that never reject, so live provider detection resolved with the FIRST settled result (usually an early 401's null) — a valid DeepSeek/OpenRouter key could fail detection. Replaced with allSettled + first real winner
- Detection now also probes via a 1-token chat ping when /models endpoints are CORS-blocked or missing (Mistral, Z.ai, gateways)
- AI errors are classified and translated (rejected / quota / network / timeout / no-provider) with a "Go to Settings" shortcut and free-key links instead of raw "connection failure"

### Added
- Key Vault with automatic failover: store multiple BYOK keys in priority order; every AI call walks the list and jumps to the next key on invalid/quota/down; per-key status dots (OK / rejected / error), reorder, per-key test
- Instant connect: pasting a recognizable key auto-adds it to the vault and tests it immediately — "paste and it works"
- Deal Score 0-100 (trend 55% + margin 35% + real source 10%) with sort-by-score (default) and min-trend / min-margin filters
- Engine chip showing which provider+model served the last scan
- scripts/smoke_v51.mjs (30 checks) covering infra detection, scoring, error classification and vault behavior

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
