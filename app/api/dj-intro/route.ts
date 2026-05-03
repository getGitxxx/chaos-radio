import { NextResponse } from 'next/server';
import { buildContext } from '../../../lib/context';
import { callLLM } from '../../../lib/llm';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trackName, trackArtist, mood = '放松' } = body;

    if (!trackName) {
      return NextResponse.json({ success: false, error: 'Missing track info' }, { status: 400 });
    }

    // Build context
    const systemPrompt = await buildContext({ mood });

    // Ask LLM to generate a short intro for this specific track
    const userMessage = `现在电台即将播放 ${trackArtist} 的《${trackName}》。请用极简、有腔调的电台DJ口吻（1-2句话）来介绍这首歌，作为这首歌的前奏旁白。不要有任何多余的废话，直接说台词。`;

    const djResponse = await callLLM(systemPrompt, userMessage, [], 8000);

    return NextResponse.json({
      success: true,
      data: {
        djMessage: djResponse.say,
      },
    });
  } catch (error) {
    console.error('[DJ-Intro] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate DJ intro' },
      { status: 500 }
    );
  }
}
