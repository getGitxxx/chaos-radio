import { NextResponse } from 'next/server';
import { DJService } from '../../../lib/services/dj-service';

const djService = new DJService();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mood, prompt, count = 5, recentPlays = [], likedPlays = [] } = body;

    const result = await djService.generatePlaylist({
      prompt: prompt || mood,
      count,
      recentPlays,
      likedPlays,
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
