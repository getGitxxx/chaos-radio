import { buildContext } from '../../../lib/context';
import { callLLM } from '../../../lib/llm';
import { resolveTrack } from '../../../lib/ncm';
import type { Track } from '../../../lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Suppress DEP0169 (url.parse) warning from NeteaseCloudMusicApi dependency
if (typeof process !== 'undefined') {
  const originalEmit = process.emit;
  // @ts-ignore
  process.emit = function (name, data, ...args) {
    if (name === 'warning' && typeof data === 'object' && (data as any).code === 'DEP0169') {
      return false;
    }
    return originalEmit.apply(process, [name, data, ...args] as any);
  };
}

/**
 * POST /api/plan — Generate a playlist via SSE (Server-Sent Events).
 *
 * Events emitted:
 *   event: dj_message  — LLM done; DJ commentary + TTS URL ready
 *   event: track       — One resolved track (with djIntro bound)
 *   event: track_error — A track query failed to resolve
 *   event: done        — All tracks attempted
 *   event: error       — Fatal failure
 *
 * This approach lets the frontend:
 *   1. Play DJ speech immediately after LLM finishes (~3-8s)
 *   2. Start playing the first resolved track without waiting for all 5
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    prompt,
    count = 5,
    recentPlays = [],
    likedPlays = [],
    dislikedPlays = [],
    skipSignals = [],
    replaySignals = [],
    tasteOverride,
    djStyle,
  } = body;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventName: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller may already be closed if client disconnected
        }
      };

      try {
        // 1. Build context
        const systemPrompt = await buildContext({
          recentPlays,
          likedPlays,
          dislikedPlays,
          skipSignals,
          replaySignals,
          tasteOverride,
          djStyle,
        });

        // 2. LLM call
        const userMessage = prompt
          ? `请根据我的特定要求为我生成一个${count}首歌的歌单：${prompt}`
          : `请为我生成一个${count}首歌的歌单，根据当前的时间和环境来选择合适的音乐`;

        const djResponse = await callLLM(systemPrompt, userMessage, [], 10000);

        // 3. Push DJ message immediately — frontend plays TTS right away
        send('dj_message', {
          say: djResponse.say,
          reason: djResponse.reason || '',
          segue: djResponse.segue || 'warm',
          ttsUrl: `/api/tts?text=${encodeURIComponent(djResponse.say)}`,
        });

        // 4. Resolve all tracks in parallel; push each one as it completes
        const playItems = (Array.isArray(djResponse.play) ? djResponse.play : []).slice(0, count);

        await Promise.allSettled(
          playItems.map(async (item: { query: string; intro: string }, index: number) => {
            try {
              const track: Track | null = await resolveTrack(item.query);
              if (track) {
                send('track', {
                  index,
                  track: { ...track, djIntro: item.intro || '' } satisfies Track,
                });
              } else {
                send('track_error', { index, query: item.query });
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[Plan SSE] resolveTrack[${index}] "${item.query}" failed:`, msg);
              send('track_error', { index, query: item.query });
            }
          })
        );

        send('done', { total: playItems.length });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[Plan SSE] Fatal error:', msg);
        send('error', { message: 'Failed to generate playlist' });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx/Vercel response buffering
    },
  });
}
