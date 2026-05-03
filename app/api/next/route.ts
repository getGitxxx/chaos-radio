import { NextResponse } from 'next/server';
import { buildContext } from '../../../lib/context';
import { callLLM } from '../../../lib/llm';
import { resolveTrack } from '../../../lib/ncm';
import { synthesizeSpeech } from '../../../lib/tts';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const currentTrack = searchParams.get('current') || '';
    const recentPlaysRaw = searchParams.get('recent') || '';
    const recentPlays = recentPlaysRaw ? recentPlaysRaw.split('|') : [];
    const likedPlaysRaw = searchParams.get('liked') || '';
    const likedPlays = likedPlaysRaw ? likedPlaysRaw.split('|') : [];

    if (recentPlays.length > 20) {
      return NextResponse.json({ success: false, error: 'Too many recent plays' }, { status: 400 });
    }
    if (likedPlays.length > 20) {
      return NextResponse.json({ success: false, error: 'Too many liked plays' }, { status: 400 });
    }

    // Build context
    const systemPrompt = await buildContext({ recentPlays, likedPlays });

    // Ask for just one next song
    const userMessage = currentTrack
      ? `当前正在播放「${currentTrack}」，请推荐下一首歌，并给出一句简短的串场词`
      : `请推荐一首适合现在听的歌，并给出一句简短的串场词`;

    const djResponse = await callLLM(systemPrompt, userMessage, [], 8000);

    // Resolve the first recommended track
    const trackQuery = Array.isArray(djResponse.play) && djResponse.play.length > 0 ? djResponse.play[0].query : '';
    const track = trackQuery ? await resolveTrack(trackQuery) : null;

    // TTS
    let ttsUrl: string | null = null;
    if (djResponse.say) {
      ttsUrl = await synthesizeSpeech(djResponse.say);
    }

    return NextResponse.json({
      success: true,
      data: {
        track,
        djMessage: djResponse.say,
        ttsUrl,
        segue: djResponse.segue,
      },
    });
  } catch (error) {
    console.error('[Next] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get next track' },
      { status: 500 }
    );
  }
}
