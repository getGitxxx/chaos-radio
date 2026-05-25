# ChaosRadio

Personal AI DJ radio station — reads your music taste, plans sounds, and broadcasts like a real DJ.

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local with your keys

# Run development server
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ACCESS_KEY` | Login access key |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `DEEPSEEK_BASE_URL` | DeepSeek API URL (default: https://api.deepseek.com) |
| `EDGE_TTS_URL` | Your Edge-TTS service URL |
| `EDGE_TTS_TOKEN` | Edge-TTS auth token (optional) |
| `OPENWEATHER_API_KEY` | OpenWeather API key |
| `WEATHER_CITY` | Weather query city (default: Shanghai) |
| `NCM_USER_ID` | Your NetEase Cloud Music user ID (for taste analysis) |
| `NCM_COOKIE` | NCM session cookie (for API access, get from browser) |

## Music Taste Analysis

Automatically fetch your NetEase Cloud Music favorites, classify genres via LLM, and generate a personalized `user/taste.md` that influences DJ song recommendations.

```bash
# Full run: fetch all favorites + analyze taste
npx tsx scripts/analyze-taste.ts

# Quick re-analyze from cached data (skip NCM API)
npx tsx scripts/analyze-taste.ts --skip-fetch
```

**What it does:**
1. Fetches all your ❤️ liked songs (no 300 limit) + top 10 self-created playlists
2. Cleans duplicates, normalizes names, saves to `user/favorites-cache.json`
3. Samples 300 tracks → sends to DeepSeek for genre/language/era classification
4. Aggregates stats → generates `user/taste.md` in natural first-person Chinese

**Requirements:** `DEEPSEEK_API_KEY`, `NCM_USER_ID`, and `NCM_COOKIE` must be set in `.env.local`. Find your UID in the NCM profile page URL; grab the cookie from browser DevTools after logging into music.163.com.

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push to GitHub
2. Import in Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

## Documentation

Detailed documentation is organized under the [docs](docs/) directory:

- **Development**:
  - [Development Conventions](docs/development/dev-conventions.md) — Coding conventions, guidelines, and anti-patterns.
  - [Agent Developer Guide](docs/development/agents.md) — Reference guide for AI agents and developers.
- **Architecture**:
  - [System Architecture Analysis](docs/architecture/architecture-analysis.md) — Context flow, service maps, and tech stack details.
- **Deployment**:
  - [Vercel Deployment Guide](docs/deployment/deploy.md) — Step-by-step production deployment on Vercel.
- **Archive / History**:
  - [Code Review v1.0 Report](docs/archive/code-review-v1.0.md) — Historical code audit findings.
  - [Defect Repair Plan](docs/archive/defect-repair-plan.md) — History of defect remediation plans.

## Tech Stack

- **Frontend**: Next.js (React)
- **LLM**: DeepSeek API
- **Music**: NeteaseCloudMusicApi
- **TTS**: Edge-TTS
- **Deploy**: Vercel
