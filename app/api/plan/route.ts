import { DJService } from '../../../lib/services/dj-service';

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
  const djService = new DJService();

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
        await djService.generatePlaylistWithStream(
          {
            prompt,
            count,
            recentPlays,
            likedPlays,
            dislikedPlays,
            skipSignals,
            replaySignals,
            queueTracks,
            tasteOverride,
            djStyle,
          },
          (event) => {
            switch (event.type) {
              case 'dj_message':
                send('dj_message', {
                  say: event.say,
                  reason: event.reason,
                  segue: event.segue,
                  ttsUrl: event.ttsUrl,
                });
                break;
              case 'track':
                send('track', { index: event.index, track: event.track });
                break;
              case 'track_error':
                send('track_error', { index: event.index, query: event.query });
                break;
              case 'done':
                send('done', { total: event.total });
                break;
            }
          }
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[Plan SSE] Fatal error:', msg);
        send('error', { message: 'Failed to generate playlist' });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}