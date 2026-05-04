# AGENTS.md — ChaosRadio

> Personal AI DJ radio station. Next.js 15 + DeepSeek LLM + NeteaseCloudMusicApi.

## Quick commands

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm run lint     # ESLint (next lint — no custom config)
```

Path alias: `@/*` → `./*` (set in `tsconfig.json`)

## Architecture overview

```
app/                    # Next.js App Router
  layout.tsx            # Root layout (font, global wrapper)
  page.tsx              # Login page (POST /api/auth → redirect /player)
  player/page.tsx       # Main DJ interface (orchestrator)
  profile/page.tsx      # Play history & stats
  settings/page.tsx     # Settings (reads taste via /api/taste)
  api/
    auth/route.ts       # POST — verify key, set auth cookie
    plan/route.ts       # POST — generate playlist via LLM
    chat/route.ts       # POST — chat with DJ via LLM
    dj-intro/route.ts   # POST — generate DJ track intro
    next/route.ts       # GET  — fetch next track
    favorites/route.ts  # GET/POST — favorites cache (NCM sync)
    tts/route.ts        # GET  — text-to-speech proxy
    taste/route.ts      # GET  — fetch user/taste.md content
components/             # Shared UI (all Client Components unless noted)
  ChatInterface.tsx      # Chat panel for DJ interaction
  DotMatrix.tsx          # Dot-matrix clock/label renderer (Server Component)
  DJBubble.tsx           # DJ status/message bubble
  LyricDisplay.tsx       # Synced lyric display
  PlaylistPanel.tsx      # Playlist queue
  TrackCard.tsx          # Track preview card with cover
hooks/
  useAudioPlayer.ts     # Core playback: dual audio (music + TTS), lyrics, MediaSession
  usePlayHistory.ts     # localStorage play history (max 50)
lib/
  auth.ts               # verifyKey, generateToken, getExpectedToken (SHA-256)
  llm.ts                # DeepSeek via openai client; DJ_OUTPUT_SCHEMA, callLLM
  ncm.ts                # NeteaseCloudMusicApi wrapper (search, song_url, lyric, playlists)
  weather.ts            # OpenWeather current weather fetch
  tts.ts                # Edge-TTS proxy (returns server-side URL)
  context.ts            # Assembles LLM system prompt from prompts/ and user/ MD files
  types.ts              # Track, DJResponse, PlaylistPlan types
  lyric-utils.ts         # LRC parser → LyricLine[]
prompts/
  dj-persona.md         # LLM system persona (DJ Chaos, Chinese, JSON output)
user/
  taste.md              # User music taste profile (genres, artists, dislikes)
  mood-rules.md         # Weather → mood → genre mapping table
  routines.md           # Time-of-day → energy → genre mapping table
  favorites-cache.json  # Cached NCM favorites (uid, tracks array)
middleware.ts           # Auth gate: cookie check on all non-public routes
```

## Auth flow

1. User enters key on `/` → `POST /api/auth` with `{ key }`
2. `verifyKey(key)` checks against `ACCESS_KEY` env var
3. If valid, `generateToken(key)` → SHA-256 hash → set in `chaos-radio-token` cookie
4. Client redirects to `/player`
5. Middleware checks cookie on every request to non-public routes
   - Public paths: `/`, `/api/auth`
   - API routes return 401 JSON; page routes redirect to `/`

## Env vars

| Variable | Required | Notes |
|----------|----------|-------|
| `ACCESS_KEY` | Yes | Login access key |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key |
| `DEEPSEEK_BASE_URL` | No | Default: https://api.deepseek.com |
| `DEEPSEEK_MODEL` | No | Default: deepseek-chat |
| `EDGE_TTS_URL` | Yes | Edge-TTS service URL |
| `EDGE_TTS_TOKEN` | No | Edge-TTS auth token |
| `OPENWEATHER_API_KEY` | No | Weather context for LLM prompts |
| `WEATHER_CITY` | No | Default: Shanghai |
| `NCM_USER_ID` | No | For favorites sync |
| `NCM_COOKIE` | No | Netease session cookie (for API access) |

## Key conventions

- **Client Components** must have `'use client'` directive. Server Components by default.
- **LLM output is strict JSON** — schema defined in `lib/llm.ts` `DJ_OUTPUT_SCHEMA`. Response always has `say`, `play`, `reason`, `segue`.
- **Dual audio approach**: `useAudioPlayer` manages two HTMLAudioElements — one for music, one for TTS. Volume ducks to ~15% during TTS, restores after.
- **NetEase API** is dynamically imported (serverless-friendly): `const api = await ncmApi()`.
- **Lyrics** use LRC format, parsed by `parseLrc()` in `lib/lyric-utils.ts`.
- **No Tailwind** — all styles are CSS Modules (`.module.css`) or global CSS.
- **No custom ESLint config** — uses `eslint-config-next` defaults.

## Extension points

- **Add new music source**: Create wrapper like `lib/ncm.ts`, update `types.ts` if needed.
- **Change LLM provider**: Modify `lib/llm.ts` — swap `baseURL`/`apiKey` for OpenAI-compatible API.
- **Add new API route**: Create `app/api/<name>/route.ts`, add to middleware public list if needed.
- **Modify DJ persona**: Edit `prompts/dj-persona.md` and optional `user/*.md` files — rebuilt each request via `lib/context.ts`.
- **Auth changes**: Edit `lib/auth.ts` and `middleware.ts` — keep them in sync.

## Gotchas

- `NeteaseCloudMusicApi` must be in `next.config.js` → `serverExternalPackages`. Without this, builds fail.
- Netease image domains must be in `next.config.js` → `images.remotePatterns` (p1/p2.music.126.net).
- `user/favorites-cache.json` is gitignored. Generated at runtime by `/api/favorites`.
- Edge runtime (`middleware.ts`, some API routes) → no Node.js APIs. Use Web Crypto for hashing.
- The LLM prompt is assembled at request time from 4+ MD files — changes to any user/ file take effect immediately with no rebuild.

## Development Conventions

**MANDATORY**: Read `DEV_CONVENTIONS.md` before any code change. It defines error handling, type safety, API route standards, audio rules, and anti-patterns for v2.0.

## Deploy

Targeted for Vercel. Set all env vars in Vercel dashboard. `npm run build` must pass in production.
