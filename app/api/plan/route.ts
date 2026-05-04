import { NextResponse } from 'next/server';
import { DJService } from '../../../lib/services/dj-service';

const djService = new DJService();

/**
 * Streaming playlist generation using Server-Sent Events.
 *
 * Response events:
 * - "say": DJ message text (as soon as LLM responds)
 * - "track": Individual track as it's resolved (emitted one by one)
 * - "done": Final summary with all tracks
 *
 * For non-SSE clients, returns standard JSON response.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mood, prompt, count = 5, recentPlays = [], likedPlays = [], dislikedPlays = [], tasteOverride, djStyle } = body;

    // Non-streaming fallback for simple clients
    if (!request.headers.get('accept')?.includes('text/event-stream')) {
      const result = await djService.generatePlaylist({
        prompt: prompt || mood,
        count,
        recentPlays,
        likedPlays,
        dislikedPlays,
        tasteOverride,
        djStyle,
      });
      return NextResponse.json({ success: true, data: result });
    }

    // Streaming: call LLM, then emit events as data becomes available
    const result = await djService.generatePlaylist({
      prompt: prompt || mood,
      count,
      recentPlays,
      likedPlays,
      dislikedPlays,
      tasteOverride,
      djStyle,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        // Emit DJ message immediately
        if (result.djMessage) {
          sendEvent('say', { message: result.djMessage, ttsUrl: result.ttsUrl, segue: result.segue });
        }

        // Emit tracks one by one
        result.tracks.forEach((track, idx) => {
          sendEvent('track', { index: idx, track, total: result.tracks.length });
        });

        // Emit completion
        sendEvent('done', { trackCount: result.tracks.length, segue: result.segue });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Plan] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate playlist' },
      { status: 500 }
    );
  }
}
