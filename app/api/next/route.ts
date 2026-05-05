import { NextResponse } from 'next/server';
import { DJService } from '../../../lib/services/dj-service';

const djService = new DJService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const currentTrack = searchParams.get('current') || '';
    const recentPlaysRaw = searchParams.get('recent') || '';
    const recentPlays = recentPlaysRaw ? recentPlaysRaw.split('|') : [];
    const likedPlaysRaw = searchParams.get('liked') || '';
    const likedPlays = likedPlaysRaw ? likedPlaysRaw.split('|') : [];
    const dislikedPlaysRaw = searchParams.get('disliked') || '';
    const dislikedPlays = dislikedPlaysRaw ? dislikedPlaysRaw.split('|') : [];
    const djStyle = searchParams.get('djStyle') || '';
    const skipSignalsRaw = searchParams.get('skips') || '';
    const skipSignals = skipSignalsRaw ? skipSignalsRaw.split('|') : [];
    const replaySignalsRaw = searchParams.get('replays') || '';
    const replaySignals = replaySignalsRaw ? replaySignalsRaw.split('|') : [];

    // Validation
    if (recentPlays.length > 20) {
      return NextResponse.json({ success: false, error: 'Too many recent plays' }, { status: 400 });
    }
    if (likedPlays.length > 20) {
      return NextResponse.json({ success: false, error: 'Too many liked plays' }, { status: 400 });
    }

    const result = await djService.getNextTrack({
      currentTrack,
      recentPlays,
      likedPlays,
      dislikedPlays,
      skipSignals,
      replaySignals,
      djStyle,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Next] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get next track' },
      { status: 500 }
    );
  }
}
