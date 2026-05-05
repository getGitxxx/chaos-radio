import { getCurrentWeather } from './weather';
import persona from '@/prompts/dj-persona.md';
import routines from '@/user/routines.md';
import moodRules from '@/user/mood-rules.md';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getCachedTasteProfile } from './taste-profile';

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
  queueTracks?: string[]; // Songs currently in the player queue
}): Promise<string> {
  const t0 = Date.now();
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
  let favoritesSample: string[] = [];
  try {
    const tTaste = Date.now();
    const { sampleFavorites } = await import('./ncm');
    favoritesSample = await sampleFavorites(200);
    if (likedPlays.length + dislikedPlays.length + favoritesSample.length >= 10) {
      tasteProfile = await getCachedTasteProfile({
        liked: likedPlays,
        disliked: dislikedPlays,
        favorites: favoritesSample,
      });
    }
    console.log(`[Context] tasteProfile: ${Date.now() - tTaste}ms (${tasteProfile ? 'hit' : 'miss'})`);
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
    const tWeather = Date.now();
    const weather = await getCurrentWeather();
    console.log(`[Context] weather: ${Date.now() - tWeather}ms (${weather ? 'ok' : 'null'})`);
    if (weather) {
      envContext += `\n- 天气: ${weather.city} ${weather.description} ${weather.temp}°C`;
    }
  } catch {
    // Weather is optional
  }

  fragments.push(envContext);

  // ⑤ Play history & Anti-repetition
  const forbiddenList = new Set([
    ...(options.recentPlays || []).slice(-20),
    ...(options.queueTracks || [])
  ]);

  if (forbiddenList.size > 0) {
    const forbidden = Array.from(forbiddenList).join('\n- ');
    fragments.push(`## 禁止重复推荐 (Negative Constraints)\n以下歌曲是用户最近听过的或已经在播放队列中的。**绝对禁止**再次推荐这些具体的歌曲：\n- ${forbidden}`);
  }

  // ⑥ User favorites (from NCM playlists) & Anchor Seeds
  try {
    const favSlice = favoritesSample;
    console.log(`[Context] favorites: ${Date.now() - t0}ms (${favSlice.length} tracks)`);
    if (favSlice.length > 0) {
      // Pick 5 random anchors for targeted discovery
      const shuffled = [...favSlice].sort(() => 0.5 - Math.random());
      const anchors = shuffled.slice(0, 5);
      const remaining = shuffled.slice(5, 85);

      fragments.push(`## 推荐锚点 (Discovery Seeds)
以下是用户收藏中的 5 首随机采样作为本次生成的“种子”。请针对每一首，挖掘 1 首风格深度契合、但相对冷门的“宝藏歌曲”：
- ${anchors.join('\n- ')}

## 更多品味参考
以下是用户其他的收藏列表，用于辅助理解其审美广度：
${remaining.join('; ')}`);
    }
  } catch {
    // Favorites are optional
  }

  if (dislikedPlays.length > 0) {
    const dislikes = dislikedPlays.join('\n- ');
    fragments.push(`## 用户不喜欢的歌曲\n以下歌曲是用户明确表示不喜欢的。请**绝对避免**推荐这些歌曲，以及风格相近的作品。\n- ${dislikes}`);
  }

  if (options.skipSignals && options.skipSignals.length > 0) {
    const skips = options.skipSignals.slice(0, 15).join('\n- ');
    fragments.push(`## 秒跳信号\n以下歌曲用户在播放不到 30 秒就跳过了（隐式不喜欢），请倾向于避免这些风格：\n- ${skips}`);
  }

  if (options.replaySignals && options.replaySignals.length > 0) {
    const replays = options.replaySignals.join('\n- ');
    fragments.push(`## 重播信号\n以下歌曲用户最近反复播放了多次。在自动推荐模式下，请参考它们的风格推荐新歌，而不是直接重播原曲。除非用户明确要求，否则不要让这些歌曲占据太多位置。\n- ${replays}`);
  }

  if (options.mood) {
    fragments.push(`## 用户当前心情提示\n${options.mood}`);
  }

  if (likedPlays.length > 0) {
    const likes = likedPlays.join('\n- ');
    fragments.push(`## 专属红心参考\n这是用户主动点赞的超级红心歌曲。它们定义了用户的审美核心。
- **选歌逻辑**：优先推荐与这些歌曲风格、情绪相近的“新发现”。
- **频率限制**：除非用户点名要求，否则在生成的 5 首歌中，直接来自此列表的原曲**不得超过 1 首**。
- **推荐列表**：\n- ${likes}`);
  }

  // ⑦ Intent Awareness & Diversity Rules
  const hasSpecificIntent = options.userMessage && (
    options.userMessage.includes('听') || 
    options.userMessage.includes('放') || 
    options.userMessage.includes('推荐')
  ) && options.userMessage.length > 4;

  fragments.push(`## 动态推荐策略
1. **探索优先 (3+2 策略)**：5 首歌中，至少 3 首应是用户未听过的“深度发现”，最多 2 首来自红心/收藏。
2. **拒绝平庸**：除非用户明确点名，否则禁止推荐大众口水歌、短视频神曲或毫无营养的商业流行乐。
3. **锚点驱动**：请优先针对上面的“推荐锚点”进行联想，在 \`reason\` 中注明该歌曲是基于哪个锚点推荐的。
4. **艺人多样性**：${hasSpecificIntent ? '由于用户提供了具体的听歌指令，你可以根据指令推荐同一艺人的多首歌曲。' : '在自动推荐模式下，单次生成的 5 首歌中应避免出现同一艺人的多首作品。'}
5. **意图尊重**：如果用户指令中提到了具体的艺人、专辑或风格，请以此为绝对中心进行推荐，忽略多样性限制。`);

  const result = fragments.join('\n\n---\n\n');
  console.log(`[Context] TOTAL buildContext: ${Date.now() - t0}ms (${result.length} chars)`);
  return result;
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
