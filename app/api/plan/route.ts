import { NextResponse } from 'next/server';
import { buildContext } from '../../../lib/context';
import { callLLM } from '../../../lib/llm';
import { resolveTrack } from '../../../lib/ncm';
import { synthesizeSpeech } from '../../../lib/tts';
import type { PlaylistPlan, Track } from '../../../lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mood, prompt, count = 5, recentPlays = [], likedPlays = [] } = body;

    const requirement = prompt || mood;

    // 1. Build context
    const systemPrompt = await buildContext({ mood: requirement, recentPlays, likedPlays });

    // 2. Ask LLM to generate playlist
    const userMessage = requirement
      ? `请根据我的这个特定要求为我生成一个${count}首歌的歌单：${requirement}`
      : `请为我生成一个${count}首歌的歌单，根据当前的时间和环境来选择合适的音乐`;

    const djResponse = await callLLM(systemPrompt, userMessage, [], 12000);

    // 3. Resolve tracks from NCM and attach intros
    const playItems = Array.isArray(djResponse?.play) ? djResponse.play.slice(0, count) : [];
    const resolvedPromises = await Promise.allSettled(
      playItems.map(item => resolveTrack(item.query))
    );
    
    const tracks: Track[] = [];
    resolvedPromises.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value !== null) {
        const intro = playItems[idx]?.intro;
        tracks.push({ ...r.value, djIntro: intro });
      }
    });

    // 4. Generate TTS for DJ commentary
    let ttsUrl: string | null = null;
    if (djResponse.say) {
      ttsUrl = await synthesizeSpeech(djResponse.say);
    }

    const plan: PlaylistPlan = {
      tracks,
      ttsUrl: ttsUrl || undefined,
      djMessage: djResponse.say,
    };

    return NextResponse.json({ success: true, data: plan });
  } catch (error) {
    console.error('[Plan] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate playlist' },
      { status: 500 }
    );
  }
}
