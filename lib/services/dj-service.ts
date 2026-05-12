/**
 * DJService — Encapsulates the full orchestration pipeline for DJ operations.
 *
 * All DJ-related API routes (plan, chat, next, dj-intro) share a common pattern:
 * 1. Build LLM context from user taste + environment
 * 2. Call LLM to get DJ response
 * 3. (Optional) Resolve recommended tracks from NCM
 * 4. (Optional) Synthesize speech for DJ commentary
 *
 * This service extracts that pipeline into reusable methods.
 */

import { buildContext } from '../context';
import { callLLM } from '../llm';
import { resolveTrack, resolveTracks } from '../ncm';
import { synthesizeSpeech } from '../tts';
import type { Track, DJResponse } from '../types';

export interface BuildContextOptions {
  recentPlays?: string[];
  likedPlays?: string[];
  dislikedPlays?: string[];
  skipSignals?: string[];
  replaySignals?: string[];
  queueTracks?: string[];
  mood?: string;
  tasteOverride?: string;
  djStyle?: string;
  userMessage?: string;
}

export interface GeneratePlaylistOptions extends BuildContextOptions {
  prompt?: string;
  count?: number;
}

export type PlaylistStreamEvent =
  | { type: 'dj_message'; say: string; reason: string; segue: string; ttsUrl: string | null }
  | { type: 'track'; index: number; track: Track }
  | { type: 'track_error'; index: number; query: string }
  | { type: 'done'; total: number };

export interface ChatWithDJOptions extends BuildContextOptions {
  message: string;
  history?: { role: 'user' | 'dj'; content: string }[];
}

export interface GenerateIntroOptions extends BuildContextOptions {
  trackName: string;
  trackArtist?: string;
}

export interface PlaylistResult {
  tracks: Track[];
  ttsUrl: string | null;
  djMessage: string;
  reason: string;
  segue: string;
}

export interface ChatResult {
  message: string;
  tracks: Track[];
  ttsUrl: string | null;
  segue: string;
}

export interface IntroResult {
  djMessage: string;
}

/**
 * DJ Service — single entry point for all DJ operations.
 */
export class DJService {
  /**
   * Generate a full playlist with DJ commentary, resolved tracks, and TTS.
   * Used by: /api/plan
   */
  async generatePlaylist(options: GeneratePlaylistOptions): Promise<PlaylistResult> {
    const { prompt, count = 5, ...contextOptions } = options;
    const t0 = Date.now();

    // 1. Build context
    const t1 = Date.now();
    const systemPrompt = await buildContext({ ...contextOptions });
    console.log(`[DJService] buildContext: ${Date.now() - t1}ms`);

    // 2. Ask LLM
    const t2 = Date.now();
    const userMessage = prompt
      ? `请根据我的特定要求为我生成一个${count}首歌的歌单：${prompt}`
      : `请为我生成一个${count}首歌的歌单，根据当前的时间和环境来选择合适的音乐`;

    const djResponse = await callLLM(systemPrompt, userMessage, [], 6000);
    console.log(`[DJService] callLLM: ${Date.now() - t2}ms`);

    // 3 & 4. Resolve tracks and synthesize speech in parallel (no dependency between them)
    const t3 = Date.now();
    const playItems = Array.isArray(djResponse.play) ? djResponse.play.slice(0, count) : [];
    const [tracks, ttsUrl] = await Promise.all([
      this._resolveTracksWithIntros(playItems),
      djResponse.say ? synthesizeSpeech(djResponse.say) : Promise.resolve(null),
    ]);
    console.log(`[DJService] resolveTracks (${tracks.length}/${playItems.length}) + synthesizeSpeech: ${Date.now() - t3}ms`);

    console.log(`[DJService] TOTAL generatePlaylist: ${Date.now() - t0}ms`);

    return {
      tracks,
      ttsUrl,
      djMessage: djResponse.say,
      reason: djResponse.reason || '',
      segue: djResponse.segue || 'warm',
    };
  }

  /**
   * Chat with the DJ, optionally resolving recommended tracks.
   * Used by: /api/chat
   */
  async chatWithDJ(options: ChatWithDJOptions): Promise<ChatResult> {
    const { message, history = [], ...contextOptions } = options;

    // 1. Build context
    const systemPrompt = await buildContext(contextOptions);

    // 2. Convert history to LLM format
    const llmHistory = history
      .slice(-10)
      .filter((m) => !!m.content)
      .map((m) => ({
        role: m.role === 'dj' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

    // 3. Call LLM
    const djResponse = await callLLM(systemPrompt, message, llmHistory, 8000);

    // 4. Resolve tracks if any
    const playQueries = Array.isArray(djResponse.play) ? djResponse.play.map((p) => p.query) : [];
    const tracks = playQueries.length > 0 ? await resolveTracks(playQueries) : [];

    // 5. Synthesize speech
    const ttsUrl = djResponse.say ? await synthesizeSpeech(djResponse.say) : null;

    return {
      message: djResponse.say,
      tracks,
      ttsUrl,
      segue: djResponse.segue || 'warm',
    };
  }

  /**
   * Get the next single track recommendation.
   * Used by: /api/next
   */
  async getNextTrack(options: BuildContextOptions & { currentTrack?: string }): Promise<{
    track: Track | null;
    djMessage: string;
    ttsUrl: string | null;
    segue: string;
  }> {
    const { currentTrack, ...contextOptions } = options;

    // 1. Build context
    const systemPrompt = await buildContext(contextOptions);

    // 2. Ask for one song
    const userMessage = currentTrack
      ? `当前正在播放「${currentTrack}」，请推荐下一首歌，并给出一句简短的串场词`
      : `请推荐一首适合现在听的歌，并给出一句简短的串场词`;

    const djResponse = await callLLM(systemPrompt, userMessage, [], 8000);

    // 3. Resolve first track
    const trackQuery = Array.isArray(djResponse.play) && djResponse.play.length > 0 ? djResponse.play[0].query : '';
    const track = trackQuery ? await resolveTrack(trackQuery) : null;

    // 4. Synthesize speech
    const ttsUrl = djResponse.say ? await synthesizeSpeech(djResponse.say) : null;

    return {
      track,
      djMessage: djResponse.say,
      ttsUrl,
      segue: djResponse.segue || 'warm',
    };
  }

  /**
   * Generate a DJ intro for a specific track.
   * Used by: /api/dj-intro
   */
  async generateIntro(options: GenerateIntroOptions): Promise<IntroResult> {
    const { trackName, trackArtist, ...contextOptions } = options;

    // 1. Build context
    const systemPrompt = await buildContext(contextOptions);

    // 2. Generate intro
    const artistStr = trackArtist ? `${trackArtist} 的` : '';
    const userMessage = `现在电台即将播放 ${artistStr}《${trackName}》。请用极简、有腔调的电台DJ口吻（1-2句话）来介绍这首歌，作为这首歌的前奏旁白。不要有任何多余的废话，直接说台词。`;

    const djResponse = await callLLM(systemPrompt, userMessage, [], 8000);

    return {
      djMessage: djResponse.say,
    };
  }

  /**
   * Generate playlist with stream callback.
   * Used by: /api/plan
   */
  async generatePlaylistWithStream(
    options: GeneratePlaylistOptions,
    onEvent: (event: PlaylistStreamEvent) => void
  ): Promise<void> {
    const { prompt, count = 5, ...contextOptions } = options;

    const userMessage = prompt
      ? `请根据我的特定要求为我生成一个${count}首歌的歌单：${prompt}`
      : `请为我生成一个${count}首歌的歌单，根据当前的时间和环境来选择合适的音乐`;

    const systemPrompt = await buildContext({ ...contextOptions, userMessage });
    const djResponse = await callLLM(systemPrompt, userMessage, [], 15000);

    const ttsUrl = djResponse.say ? `/api/tts?text=${encodeURIComponent(djResponse.say)}` : null;
    
    onEvent({
      type: 'dj_message',
      say: djResponse.say,
      reason: djResponse.reason || '',
      segue: djResponse.segue || 'warm',
      ttsUrl,
    });

    const playItems = (Array.isArray(djResponse.play) ? djResponse.play : []).slice(0, count);

    await Promise.allSettled(
      playItems.map(async (item: { query: string; intro: string }, index: number) => {
        try {
          const track = await resolveTrack(item.query);
          if (track) {
            onEvent({
              type: 'track',
              index,
              track: { ...track, djIntro: item.intro || '' },
            });
          } else {
            onEvent({ type: 'track_error', index, query: item.query });
          }
        } catch {
          onEvent({ type: 'track_error', index, query: item.query });
        }
      })
    );

    onEvent({ type: 'done', total: playItems.length });
  }

  // ---- Private helpers ----

  /**
   * Resolve tracks and attach their DJ intros.
   */
  private async _resolveTracksWithIntros(
    playItems: { query: string; intro: string }[]
  ): Promise<Track[]> {
    const results = await Promise.allSettled(
      playItems.map((item) => resolveTrack(item.query))
    );

    const tracks: Track[] = [];
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value !== null) {
        tracks.push({ ...r.value, djIntro: playItems[idx]?.intro || '' });
      }
    });
    return tracks;
  }
}
