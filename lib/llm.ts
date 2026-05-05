import OpenAI from 'openai';
import type { DJResponse } from './types';
import { withRetry } from './retry';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
});

/** Extended create params — DeepSeek supports response_format but OpenAI types don't expose it */
interface DeepSeekCreateParams {
  model: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  temperature: number;
  max_tokens: number;
  response_format: { type: 'json_object' };
}

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
 * Call DeepSeek to generate a DJ response with retry and timeout.
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  timeoutMs: number = 12000
): Promise<DJResponse> {
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

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  console.log('[LLM] Calling', model, 'base:', process.env.DEEPSEEK_BASE_URL || 'default');

  try {
    const raw = await withRetry(async () => {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout')), timeoutMs)
      );

      const createParams: DeepSeekCreateParams = {
        model,
        messages,
        temperature: 0.85,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      };

      const completion = await Promise.race([
        client.chat.completions.create(createParams as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming),
        timeoutPromise
      ]);

      const content = (completion as OpenAI.Chat.Completions.ChatCompletion)?.choices?.[0]?.message?.content;
      if (!content) throw new Error('LLM returned empty content');
      return content;
    }, { retries: 2, delayMs: 2000 });

    return parseResponse(raw);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[LLM] All retries exhausted:', errMsg);

    // Distinguish timeout from other errors for user-friendly messaging
    const isTimeout = error instanceof Error && error.message === 'LLM timeout';
    if (isTimeout) {
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
      reason: `LLM call failed after retries: ${errMsg}`,
      segue: 'warm',
    };
  }
}

function parseResponse(raw: string): DJResponse {
  try {
    const data = JSON.parse(raw);
    return {
      say: String(data.say || ''),
      play: Array.isArray(data.play) ? data.play.map((p: unknown) => {
        const item = p as Record<string, unknown>;
        return {
          query: String(item.query || p),
          intro: String(item.intro || '')
        };
      }) : [],
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
