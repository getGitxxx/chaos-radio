import { NextResponse } from 'next/server';
import { DJService } from '../../../lib/services/dj-service';

const djService = new DJService();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trackName, trackArtist, mood = '放松' } = body;

    if (!trackName) {
      return NextResponse.json({ success: false, error: 'Missing track info' }, { status: 400 });
    }

    const result = await djService.generateIntro({
      trackName,
      trackArtist,
      mood,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[DJ-Intro] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate DJ intro' },
      { status: 500 }
    );
  }
}
