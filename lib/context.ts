import { readFileSync } from 'fs';
import { join } from 'path';
import { getCurrentWeather } from './weather';

/**
 * Build the full system prompt for the DJ persona.
 * Assembles 5 fragments into a coherent context window.
 */
export async function buildContext(options: {
  recentPlays?: string[];
  userMessage?: string;
  mood?: string;
  likedPlays?: string[];
}): Promise<string> {
  const fragments: string[] = [];

  // ① System persona
  const persona = readMdFile('prompts/dj-persona.md');
  fragments.push(persona);

  // ② User taste profile
  const taste = readMdFile('user/taste.md');
  const routines = readMdFile('user/routines.md');
  const moodRules = readMdFile('user/mood-rules.md');

  if (taste) {
    fragments.push(`## 用户品味\n${taste}`);
  }
  if (routines) {
    fragments.push(`## 时段偏好\n${routines}`);
  }
  if (moodRules) {
    fragments.push(`## 情绪规则\n${moodRules}`);
  }

  // ③ Environment injection
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = getTimeOfDay(hour);

  let envContext = `## 当前环境\n- 时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n- 时段: ${timeOfDay}`;

  try {
    const weather = await getCurrentWeather();
    if (weather) {
      envContext += `\n- 天气: ${weather.city} ${weather.description} ${weather.temp}°C`;
    }
  } catch {
    // Weather is optional
  }

  fragments.push(envContext);

  // ④ Play history
  if (options.recentPlays && options.recentPlays.length > 0) {
    const recent = options.recentPlays.slice(-10).join('\n- ');
    fragments.push(`## 最近播放\n- ${recent}\n\n注意避免重复推荐这些歌曲，除非用户明确要求。`);
  }

  // ⑤ User favorites (from NCM playlists)
  try {
    const { sampleFavorites } = await import('./ncm');
    const favorites = await sampleFavorites(30);
    if (favorites.length > 0) {
      const favList = favorites.join('\n- ');
      fragments.push(
        `## 用户收藏歌单（随机采样）\n以下是用户在网易云音乐中收藏的部分歌曲。推荐歌曲时，优先从这个列表中选择，但也可以推荐风格相近的新歌。\n- ${favList}`
      );
    }
  } catch {
    // Favorites are optional
  }

  // ⑥ Mood hint
  if (options.mood) {
    fragments.push(`## 用户当前心情提示\n${options.mood}`);
  }

  // ⑦ Super favorites (Liked tracks)
  if (options.likedPlays && options.likedPlays.length > 0) {
    const likes = options.likedPlays.join('\n- ');
    fragments.push(`## 专属置顶红心单曲\n这是用户在此电台中主动点击 Like 标心的超级红心歌曲。生成歌单时，请**务必赋予最高优先级**，尝试从以下歌曲中挑选 1-2 首加入当前播放列表！\n- ${likes}`);
  }

  return fragments.join('\n\n---\n\n');
}

function readMdFile(relativePath: string): string {
  try {
    const fullPath = join(process.cwd(), relativePath);
    return readFileSync(fullPath, 'utf-8').trim();
  } catch (error) {
    console.error(`[Context] Failed to read ${relativePath}:`, error);
    return '';
  }
}

function getTimeOfDay(hour: number): string {
  if (hour >= 5 && hour < 8) return '清晨 · 适合轻柔唤醒';
  if (hour >= 8 && hour < 12) return '上午 · 适合提振精神';
  if (hour >= 12 && hour < 14) return '午后 · 适合放松小憩';
  if (hour >= 14 && hour < 18) return '下午 · 适合专注工作';
  if (hour >= 18 && hour < 21) return '傍晚 · 适合舒缓解压';
  if (hour >= 21 && hour < 24) return '深夜 · 适合沉浸氛围';
  return '凌晨 · 适合安静陪伴';
}
