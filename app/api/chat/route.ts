import { NextResponse } from 'next/server';
import { DJService } from '../../../lib/services/dj-service';

const djService = new DJService();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, history = [], recentPlays = [], likedPlays = [], dislikedPlays = [], skipSignals, replaySignals, mood, tasteOverride, djStyle } = body;

    // Validation
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(history) || history.length > 50) {
      return NextResponse.json({ success: false, error: 'Invalid history' }, { status: 400 });
    }
    if (!Array.isArray(recentPlays) || recentPlays.length > 20) {
      return NextResponse.json({ success: false, error: 'Invalid recent plays' }, { status: 400 });
    }

    const result = await djService.chatWithDJ({
      message,
      history,
      recentPlays,
      likedPlays,
      dislikedPlays,
      skipSignals: Array.isArray(skipSignals) ? skipSignals : [],
      replaySignals: Array.isArray(replaySignals) ? replaySignals : [],
      tasteOverride,
      djStyle,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Chat] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Chat failed' },
      { status: 500 }
    );
  }
}
