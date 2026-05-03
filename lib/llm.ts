import OpenAI from 'openai';
import type { DJResponse } from './types';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
});

const DJ_OUTPUT_SCHEMA = `You MUST respond with valid JSON in this exact format:
{
  "say": "your general welcome/intro commentary in Chinese for the whole playlist, natural and warm",
  "play": [
    {
      "query": "song name - artist name",
      "intro": "your DJ commentary for this song. IMPORTANT: 1. Use bridge phrases to connect from the previous track. 2. For vocal tracks, distill the core emotional/lyrical essence. 3. Keep it within 20-30 seconds of speech."
    }
  ],
  "reason": "brief explanation of your choices",
  "segue": "transition style: warm | energetic | chill | dramatic | reflective"
}`;

/**
 * Call DeepSeek to generate a DJ response.
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  timeoutMs: number = 12000
): Promise<DJResponse> {
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `${systemPrompt}\n\n${DJ_OUTPUT_SCHEMA}`,
      },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];
    // Implement timeout-aware LLM call using Promise.race for broad compatibility
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LLM timeout')), timeoutMs)
    );

    const completion = await Promise.race([
      client.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages,
        temperature: 0.85,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      } as any),
      timeoutPromise
    ]);

    const raw = (completion as any).choices?.[0]?.message?.content || '';
    return parseResponse(raw);
  } catch (error) {
    console.error('[LLM] Call error:', error);
    // Graceful timeout fallback
    if (error instanceof Error && error.message === 'LLM timeout') {
      console.error('[LLM] Timeout after', timeoutMs, 'ms');
      return {
        say: '信号有点慢，让我再想想...',
        play: [],
        reason: 'LLM request timed out',
        segue: 'warm',
      };
    }
    return {
      say: '信号有点不稳定，让我再想想...',
      play: [],
      reason: `Error: ${error}`,
      segue: 'warm',
    };
  }
}

function parseResponse(raw: string): DJResponse {
  try {
    const data = JSON.parse(raw);
    return {
      say: String(data.say || ''),
      play: Array.isArray(data.play) ? data.play.map((p: any) => ({
        query: String(p.query || p),
        intro: String(p.intro || '')
      })) : [],
      reason: String(data.reason || ''),
      segue: String(data.segue || 'warm'),
    };
  } catch {
    console.error('[LLM] Parse error, raw:', raw);
    // Try to extract JSON from markdown code block
    const jsonMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        return parseResponse(jsonMatch[1]);
      } catch { /* fall through */ }
    }
    return {
      say: raw.slice(0, 200),
      play: [],
      reason: 'Failed to parse LLM output',
      segue: 'warm',
    };
  }
}
