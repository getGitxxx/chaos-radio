/**
 * Taste Profile Generator — LLM-powered musical taste analysis.
 *
 * Takes liked/disliked/favorites data and produces a condensed 200-300 char
 * Chinese taste profile for injection into the DJ system prompt.
 *
 * Caching: profile is cached by input hash and only regenerated when the
 * input changes significantly (>10 new items or >1 hour since last refresh).
 *
 * Serverless-safe: uses /tmp for caching (ephemeral per-function-instance).
 */

import { callLLM } from './llm';

const TASTE_ANALYSIS_PROMPT = `你是一位专业的音乐品味分析师。根据下面提供的用户数据，用简洁的中文（200字以内）分析用户的音乐品味画像。

请包含以下维度：
1. 偏好的音乐流派和风格（注意歌曲名称和艺人的风格暗示）
2. 偏好的年代范围
3. 偏好的语言（中文/日语/英语/韩语/纯音乐等）
4. 不喜欢哪些特征（从 dislikes 推断）
5. 一句话推荐方向

格式：连贯的段落，不要用列表格式，不要用 Markdown。直接说人话。`;

interface TasteData {
  liked: string[];
  disliked: string[];
  favorites: string[];
}

function hashInput(data: TasteData): string {
  const parts = [
    ...data.liked.slice(0, 50).sort(),
    ...data.disliked.slice(0, 50).sort(),
    ...data.favorites.slice(0, 100).sort(),
  ];
  return `v2-${parts.length}-${parts.join('|').slice(0, 2000)}`;
}

interface CachedProfile {
  hash: string;
  profile: string;
  generatedAt: number;
  inputSize: { liked: number; disliked: number; favorites: number };
}

let memoryCache: CachedProfile | null = null;

export async function getTasteProfile(data: TasteData): Promise<string> {
  // Return empty if not enough data
  const totalItems = data.liked.length + data.disliked.length + data.favorites.length;
  if (totalItems < 10) return '';

  const newHash = hashInput(data);

  // Check memory cache first
  if (memoryCache && memoryCache.hash === newHash) {
    return memoryCache.profile;
  }

  // Check /tmp cache
  try {
    const { readFile, writeFile } = await import('fs/promises');
    const cachePath = '/tmp/chaos-radio-taste-profile.json';
    const raw = await readFile(cachePath, 'utf-8');
    const cached = JSON.parse(raw) as CachedProfile;
    if (cached.hash === newHash) {
      memoryCache = cached;
      return cached.profile;
    }
    // Stale — but check if input only grew by <10 items (avoid unnecessary LLM calls)
    const likedDiff = Math.abs((cached.inputSize?.liked ?? 0) - data.liked.length);
    const dislikedDiff = Math.abs((cached.inputSize?.disliked ?? 0) - data.disliked.length);
    const favDiff = Math.abs((cached.inputSize?.favorites ?? 0) - data.favorites.length);
    if (likedDiff + dislikedDiff + favDiff <= 5) {
      memoryCache = cached;
      return cached.profile;
    }
  } catch {
    // No cache yet or read error — proceed to generate
  }

  // Generate via LLM
  try {
    const userMessage = buildAnalysisInput(data);
    const response = await callLLM(TASTE_ANALYSIS_PROMPT, userMessage, [], 6000);

    const profile = response.say.slice(0, 400).trim();
    if (!profile) return '';

    // Cache to /tmp
    const cached: CachedProfile = {
      hash: newHash,
      profile,
      generatedAt: Date.now(),
      inputSize: {
        liked: data.liked.length,
        disliked: data.disliked.length,
        favorites: data.favorites.length,
      },
    };

    memoryCache = cached;

    try {
      const { writeFile } = await import('fs/promises');
      await writeFile('/tmp/chaos-radio-taste-profile.json', JSON.stringify(cached), 'utf-8');
    } catch {
      // Cache write failure is non-critical
    }

    return profile;
  } catch (error) {
    console.error('[TasteProfile] Generation failed:', error);
    // Fall back to stale cache if LLM fails
    return memoryCache?.profile ?? '';
  }
}

function buildAnalysisInput(data: TasteData): string {
  const parts: string[] = [];

  if (data.liked.length > 0) {
    parts.push(`## 用户主动点赞的歌曲 (${data.liked.length} 首)\n${
      data.liked.slice(0, 30).map((t, i) => `${i + 1}. ${t}`).join('\n')
    }`);
  }

  if (data.disliked.length > 0) {
    parts.push(`## 用户明确不喜欢的歌曲 (${data.disliked.length} 首)\n${
      data.disliked.slice(0, 20).map((t, i) => `${i + 1}. ${t}`).join('\n')
    }`);
  }

  if (data.favorites.length > 0) {
    parts.push(`## 用户网易云收藏 (采样 ${Math.min(data.favorites.length, 50)} 首)\n${
      data.favorites.slice(0, 50).map((t, i) => `${i + 1}. ${t}`).join('\n')
    }`);
  }

  return parts.join('\n\n');
}
