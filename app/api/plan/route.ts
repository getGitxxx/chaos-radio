import { NextResponse } from 'next/server';
import { DJService } from '../../../lib/services/dj-service';

const djService = new DJService();

/**
 * POST /api/plan — Generate a playlist via DJ service.
 *
 * Returns a standard JSON response with tracks, DJ message, and TTS URL.
 * NOTE: SSE streaming was removed because generatePlaylist() completes
 * all async work before returning — true progressive streaming would require
 * restructuring DJService to yield partial results.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mood, prompt, count = 5, recentPlays = [], likedPlays = [], dislikedPlays = [], tasteOverride, djStyle } = body;

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
  } catch (error) {
    console.error('[Plan] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate playlist' },
      { status: 500 }
    );
  }
}
