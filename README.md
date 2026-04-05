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

- **Winning product finder** — scans TikTok Shop, Amazon, and global marketplaces for trending products with high margins
- **Niche analysis** — scores niches by opportunity level (High Opportunity / Moderate / Saturated / Stable)
- **Market trends dashboard** — visualizes revenue trends, growth rates, and seller competition
- **AI assistant** — ask questions about any niche or product and get instant market intelligence
- **Multi-language** — supports English, Spanish, French, German, and Chinese

## Tech stack

- React + TypeScript
- Vite
- Google Gemini API (with Google Search grounding)
- Tailwind CSS

## Quick start

**Prerequisites:** Node.js 18+, Gemini API key

```bash
git clone https://github.com/alicelabs-llc/Scraper.git
cd Scraper
npm install
```

Create a `.env.local` file:

```env
API_KEY=your_gemini_api_key_here
```

Run locally:

```bash
npm run dev
```

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

---

© 2026 AliceLabs LLC · [alicelabs.site](https://alicelabs.site) · [contacto@alicelabs.site](mailto:contacto@alicelabs.site)
