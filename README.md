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
| `OPENWEATHER_API_KEY` | OpenWeather API key |
| `WEATHER_CITY` | Weather query city (default: Shanghai) |

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push to GitHub
2. Import in Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

## Tech Stack

- **Frontend**: Next.js (React)
- **LLM**: DeepSeek API
- **Music**: NeteaseCloudMusicApi
- **TTS**: Edge-TTS
- **Deploy**: Vercel
