import { buildContext } from '../../../lib/context';
import { callLLMStream } from '../../../lib/llm';
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
    queueTracks = [],
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
        // 1. Resolve user message first for intent detection
        const userMessage = prompt
          ? `请根据我的特定要求为我生成一个${count}首歌的歌单：${prompt}`
          : `请为我生成一个${count}首歌的歌单，根据当前的时间和环境来选择合适的音乐`;

        // 2. Build context
        const systemPrompt = await buildContext({
          recentPlays,
          likedPlays,
          dislikedPlays,
          skipSignals,
          replaySignals,
          queueTracks,
          tasteOverride,
          djStyle,
          userMessage,
        });

        // 3. LLM call & streaming
        let trackIndex = 0;
        let activePromises: Promise<void>[] = [];

        await callLLMStream(
          systemPrompt,
          userMessage,
          [],
          {
            onDJMessageReady: (data) => {
              send('dj_message', {
                say: data.say,
                reason: data.reason || '',
                segue: data.segue || 'warm',
                ttsUrl: `/api/tts?text=${encodeURIComponent(data.say)}`,
              });
            },
            onTrackReady: (item) => {
              if (trackIndex >= count) return;
              const currentIndex = trackIndex++;
              
              const resolvePromise = (async () => {
                try {
                  const track: Track | null = await resolveTrack(item.query);
                  if (track) {
                    send('track', {
                      index: currentIndex,
                      track: { ...track, djIntro: item.intro || '' } satisfies Track,
                    });
                  } else {
                    send('track_error', { index: currentIndex, query: item.query });
                  }
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  console.error(`[Plan SSE] resolveTrack[${currentIndex}] "${item.query}" failed:`, msg);
                  send('track_error', { index: currentIndex, query: item.query });
                }
              })();
              activePromises.push(resolvePromise);
            }
          },
          15000
        );

        // Wait for all track resolutions to finish before sending 'done'
        await Promise.all(activePromises);
        send('done', { total: trackIndex });
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
