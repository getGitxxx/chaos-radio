import { NextResponse } from 'next/server';
import type { Track } from '@/lib/types';
import { buildContext } from '../../../lib/context';
import { callLLM } from '../../../lib/llm';
import { resolveTracks } from '../../../lib/ncm';
import { synthesizeSpeech } from '../../../lib/tts';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, history = [], recentPlays = [], likedPlays = [] } = body;

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

    // Build context
    const systemPrompt = await buildContext({ recentPlays, likedPlays });

    // Convert chat history to LLM format
    const llmHistory = history
      .slice(-10)
      .filter((m: { role: string; content: string }) => !!m.content)
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'dj' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

    // Call LLM
    const djResponse = await callLLM(systemPrompt, message, llmHistory, 8000);

    // Resolve any recommended tracks
    let tracks: Track[] = [];
    const playQueries = Array.isArray(djResponse.play) ? djResponse.play.map(p => p.query) : [];
    if (playQueries.length > 0) {
      tracks = await resolveTracks(playQueries);
    }

    // Generate TTS
    let ttsUrl: string | null = null;
    if (djResponse.say) {
      ttsUrl = await synthesizeSpeech(djResponse.say);
    }

    return NextResponse.json({
      success: true,
      data: {
        message: djResponse.say,
        tracks,
        ttsUrl,
        segue: djResponse.segue,
      },
    });
  } catch (error) {
    console.error('[Chat] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Chat failed' },
      { status: 500 }
    );
  }
}
