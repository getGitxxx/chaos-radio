import { getCurrentWeather } from './weather';
import persona from '@/prompts/dj-persona.md';
import routines from '@/user/routines.md';
import moodRules from '@/user/mood-rules.md';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getTasteProfile } from './taste-profile';

const DJ_STYLES: Record<string, string> = {
  '文艺范': '- 你是一个文艺范儿的 DJ，说话像诗人一样，善用隐喻和意象，语气温柔有深度',
  '深夜电台': '- 你是一个深夜电台主持人，声音温暖有磁性，语气亲切像老朋友，适合夜晚陪伴',
  '毒舌': '- 你是一个毒舌 DJ，说话带刺但有道理，会吐槽用户的品味但依然推荐好歌，幽默但不刻薄',
  '搞笑': '- 你是一个搞笑 DJ，说话轻松幽默，爱讲冷笑话，能让用户边听边笑',
  '治愈': '- 你是一个治愈系 DJ，说话温柔体贴，会关心用户的情绪，像一个温暖的拥抱',
};

export async function buildContext(options: {
  recentPlays?: string[];
  userMessage?: string;
  mood?: string;
  likedPlays?: string[];
  dislikedPlays?: string[];
  tasteOverride?: string;
  djStyle?: string;
  skipSignals?: string[];
  replaySignals?: string[];
}): Promise<string> {
  const fragments: string[] = [];

  // ① System persona (with style override if specified)
  let personaText = persona.trim();
  if (options.djStyle && DJ_STYLES[options.djStyle]) {
    const lines = personaText.split('\n');
    const insertIdx = lines.findIndex(l => l.startsWith('## 你的风格'));
    if (insertIdx !== -1) {
      lines.splice(insertIdx + 1, 0, DJ_STYLES[options.djStyle]);
      personaText = lines.join('\n');
    }
  }
  fragments.push(personaText);

  // ② User taste profile (dynamic or static)
  let tasteContent = options.tasteOverride;
  if (!tasteContent) {
    try {
      const tastePath = join(process.cwd(), 'user/taste.md');
      tasteContent = (await readFile(tastePath, 'utf-8')).trim();
    } catch {
      tasteContent = '';
    }
  }

  const r = routines.trim();
  const m = moodRules.trim();

  // ---- Generate AI-powered taste profile if enough data available ----
  const likedPlays = options.likedPlays ?? [];
  const dislikedPlays = options.dislikedPlays ?? [];

  let tasteProfile = '';
  try {
    const { sampleFavorites } = await import('./ncm');
    const favorites = await sampleFavorites(50);
    if (likedPlays.length + dislikedPlays.length + favorites.length >= 10) {
      tasteProfile = await getTasteProfile({
        liked: likedPlays,
        disliked: dislikedPlays,
        favorites,
      });
    }
  } catch {
    // Taste profile is optional — falls back to raw data
  }

  // ③ Taste section: prefer AI-generated profile, fall back to raw taste.md
  if (tasteProfile) {
    fragments.push(`## AI 品味画像\n${tasteProfile}\n\n注意：这是根据你听歌行为自动分析的音乐品味，请重点参考此画像进行推荐。`);
  }
  if (tasteContent) {
    const label = tasteProfile ? '## 用户自述品味' : '## 用户品味';
    fragments.push(`${label}\n${tasteContent}`);
  }
  if (r) fragments.push(`## 时段偏好\n${r}`);
  if (m) fragments.push(`## 情绪规则\n${m}`);

  // ④ Environment injection
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

  // ⑤ Play history
  if (options.recentPlays && options.recentPlays.length > 0) {
    const recent = options.recentPlays.slice(-10).join('\n- ');
    fragments.push(`## 最近播放\n- ${recent}\n\n注意避免重复推荐这些歌曲，除非用户明确要求。`);
  }

  // ⑥ User favorites (from NCM playlists)
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

  // ⑦ Disliked tracks - avoid these
  if (dislikedPlays.length > 0) {
    const dislikes = dislikedPlays.join('\n- ');
    fragments.push(`## 用户不喜欢的歌曲\n以下歌曲是用户明确表示不喜欢的。请**绝对避免**推荐这些歌曲，以及风格相近的作品。\n- ${dislikes}`);
  }

  // ⑧ Behavior signals: implicit dislike from fast skips
  if (options.skipSignals && options.skipSignals.length > 0) {
    const skips = options.skipSignals.slice(0, 15).join('\n- ');
    fragments.push(`## 秒跳信号\n以下歌曲用户在播放不到 30 秒就跳过了（隐式不喜欢），请倾向于避免这些风格：\n- ${skips}`);
  }

  // ⑨ Behavior signals: replay signals (implicit super-like)
  if (options.replaySignals && options.replaySignals.length > 0) {
    const replays = options.replaySignals.join('\n- ');
    fragments.push(`## 重播信号\n以下歌曲用户在 24 小时内反复播放了多次（隐式超级喜欢），请优先推荐这些歌曲或风格相近的作品：\n- ${replays}`);
  }

  // ⑩ Mood hint
  if (options.mood) {
    fragments.push(`## 用户当前心情提示\n${options.mood}`);
  }

  // ⑪ Liked tracks
  if (likedPlays.length > 0) {
    const likes = likedPlays.join('\n- ');
    fragments.push(`## 专属置顶红心单曲\n这是用户在此电台中主动点击 Like 标心的超级红心歌曲。生成歌单时，请**务必赋予最高优先级**，尝试从以下歌曲中挑选 1-2 首加入当前播放列表！\n- ${likes}`);
  }

  return fragments.join('\n\n---\n\n');
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
