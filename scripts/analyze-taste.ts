#!/usr/bin/env npx tsx
/**
 * analyze-taste.ts — NCM 收藏全量抓取 + 音乐品味分析 + taste.md 生成
 *
 * Usage: npx tsx scripts/analyze-taste.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

function loadEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 未找到 ${filePath}，请先创建 .env.local`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const ROOT = path.resolve(__dirname, '..');
loadEnv(path.join(ROOT, '.env.local'));

const NCM_UID = process.env.NCM_USER_ID;
const NCM_COOKIE = process.env.NCM_COOKIE;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

if (!NCM_UID) { console.error('❌ 请在 .env.local 中设置 NCM_USER_ID'); process.exit(1); }
if (!NCM_COOKIE) { console.error('❌ 请在 .env.local 中设置 NCM_COOKIE'); process.exit(1); }
if (!DEEPSEEK_KEY) console.error('⚠️  未设置 DEEPSEEK_API_KEY，将跳过 LLM 分析');

interface TrackEntry { name: string; artist: string }

interface ClassifiedTrack extends TrackEntry {
  genre: string; subgenre: string; language: string; era: string;
}

interface GenreStats { genre: string; count: number; percentage: number }

const BATCH_DELAY_MS = 500;
const LLM_CLASSIFY_BATCH_SIZE = 30;
const MAX_LLM_SAMPLE = 300;

async function ncmApi(): Promise<any> {
  const mod = await import('NeteaseCloudMusicApi');
  return (mod as any).default ?? mod;
}

async function fetchLikedSongs(): Promise<TrackEntry[]> {
  console.log('🎵 正在获取「我喜欢的音乐」列表...');
  const api = await ncmApi();

  const likelistResult = await api.likelist({ uid: Number(NCM_UID), cookie: NCM_COOKIE });
  const ids: number[] = ((likelistResult as any)?.body?.ids) ?? [];
  console.log(`   获取到 ${ids.length} 首红心歌曲 ID`);

  if (ids.length === 0) return [];

  const allTracks: TrackEntry[] = [];
  const batchSize = 100;
  const totalBatches = Math.ceil(ids.length / batchSize);

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    process.stdout.write(`   [${batchNum}/${totalBatches}] 获取歌曲详情... `);

    try {
      const detailResult = await api.song_detail({
        ids: batch.join(','),
        cookie: NCM_COOKIE,
      });
      const songs = ((detailResult as any)?.body?.songs ?? []) as any[];

      for (const song of songs) {
        const name = String(song.name || '').trim();
        if (!name) continue;
        const artist = (song.ar || []).map((a: any) => a.name).join(' / ');
        allTracks.push({ name, artist });
      }
      console.log(`✓ (${songs.length} 首)`);
    } catch (err: any) {
      console.log(`✗ (失败: ${err.message})`);
    }

    if (i + batchSize < ids.length) await sleep(BATCH_DELAY_MS);
  }

  console.log(`   ✅ 共解析 ${allTracks.length} 首红心歌曲`);
  return allTracks;
}

async function fetchUserPlaylists(maxCount = 10) {
  console.log('📋 正在获取用户歌单列表...');
  const api = await ncmApi();

  const result = await api.user_playlist({
    uid: Number(NCM_UID), limit: 50, offset: 0, cookie: NCM_COOKIE,
  });

  const playlists = ((result as any)?.body?.playlist ?? []) as any[];
  const own = playlists
    .filter((p: any) => p.creator?.userId === Number(NCM_UID))
    .sort((a: any, b: any) => (b.createTime || 0) - (a.createTime || 0))
    .slice(0, maxCount);

  console.log(`   用户自建歌单: ${own.length} 个 (共 ${playlists.length} 个)`);
  for (const p of own) console.log(`   - ${p.name} (${p.trackCount} 首)`);

  return own.map((p: any) => ({ id: p.id, name: p.name, trackCount: p.trackCount }));
}

async function fetchPlaylistTracks(playlistId: number, playlistName: string): Promise<TrackEntry[]> {
  const api = await ncmApi();
  process.stdout.write(`   📥 "${playlistName}" ... `);

  try {
    const result = await api.playlist_track_all({
      id: playlistId, limit: 9999, cookie: NCM_COOKIE,
    });
    const songs = ((result as any)?.body?.songs ?? []) as any[];
    const tracks = songs.map((s: any) => ({
      name: String(s.name || '').trim(),
      artist: (s.ar || []).map((a: any) => a.name).join(' / '),
    })).filter((t: TrackEntry) => t.name);

    console.log(`✓ (${tracks.length} 首)`);
    return tracks;
  } catch (err: any) {
    console.log(`✗ (失败: ${err.message})`);
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanAndDeduplicate(tracks: TrackEntry[]): TrackEntry[] {
  console.log('🧹 正在清洗数据...');
  const seen = new Set<string>();
  const unique: TrackEntry[] = [];

  for (const t of tracks) {
    const key = `${t.name}::${t.artist}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!t.name || t.name.length < 1) continue;
    if (t.name === '未知' || t.name === '未知歌曲') continue;

    const name = t.name
      .replace(/\s*\(Live\)\s*$/i, '')
      .replace(/\s*（Live）\s*$/i, '')
      .trim();

    unique.push({ name: name || t.name, artist: t.artist || '未知艺人' });
  }

  console.log(`   原始 ${tracks.length} → 去重后 ${unique.length} 首`);
  return unique;
}

function saveFavoritesCache(tracks: TrackEntry[], likedCount: number, playlistCount: number): void {
  const cachePath = path.join(ROOT, 'user', 'favorites-cache.json');
  const data = {
    uid: NCM_UID,
    fetchedAt: new Date().toISOString(),
    count: tracks.length,
    likedCount,
    playlistCount,
    tracks,
  };
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`💾 已保存 ${tracks.length} 首歌曲到 user/favorites-cache.json`);
}

const CLASSIFY_PROMPT = `你是一位专业的音乐分类专家。请对下列歌曲逐一分类，返回严格 JSON 格式。

## 流派 (genre) 请从以下选择（可适当泛化）：
摇滚、电子、流行、爵士、民谣、嘻哈、古典、后摇、氛围、金属、世界音乐、R&B、灵魂乐、雷鬼、朋克、独立、实验、原声

## 子流派 (subgenre) 更具体的风格描述（如：迷幻摇滚、合成器浪潮、bossa nova、lo-fi hip hop、英伦摇滚 等）

## 语言 (language)：
中文、英语、日语、韩语、纯音乐、其他

## 年代 (era)：
60年代及以前、70年代、80年代、90年代、00年代、10年代、20年代、未知

返回格式：{ "songs": [ { "name": "歌名", "artist": "艺人", "genre": "流派", "subgenre": "子流派", "language": "语言", "era": "年代" } ] }`;

interface BatchClassificationResult {
  songs: { name: string; artist: string; genre: string; subgenre: string; language: string; era: string }[];
}

function extractJson(raw: string): any {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch {}

  const codeMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1]); } catch {}
  }

  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }

  try {
    const fixed = trimmed
      .replace(/,\s*}/g, '}')
      .replace(/,\s*\]/g, ']')
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
    return JSON.parse(fixed);
  } catch {}

  throw new Error('Cannot extract valid JSON');
}

async function classifyBatch(
  client: OpenAI,
  tracks: TrackEntry[],
  batchNum: number,
  totalBatches: number
): Promise<ClassifiedTrack[]> {
  const trackList = tracks.map((t, i) => `${i + 1}. ${t.name} - ${t.artist}`).join('\n');
  const userMsg = `以下是 ${tracks.length} 首歌曲，请逐一分类：\n\n${trackList}`;

  process.stdout.write(`   [LLM ${batchNum}/${totalBatches}] 正在分类 ${tracks.length} 首歌... `);

  try {
    const completion = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: CLASSIFY_PROMPT },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.3,
      max_tokens: 8192,
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) throw new Error('LLM returned empty');

    const data = extractJson(raw);
    if (!data || !Array.isArray(data.songs)) throw new Error('No songs array in response');

    const classified = data.songs.map((s: any) => ({
      name: s.name || '',
      artist: s.artist || '',
      genre: s.genre || '未知',
      subgenre: s.subgenre || '未知',
      language: s.language || '未知',
      era: s.era || '未知',
    }));

    console.log('✓');
    return classified;
  } catch (err: any) {
    console.log(`✗ (${err.message})`);
    return tracks.map(t => ({ ...t, genre: '未知', subgenre: '未知', language: '未知', era: '未知' }));
  }
}

async function classifyAll(tracks: TrackEntry[]): Promise<ClassifiedTrack[]> {
  const sample = tracks.length > MAX_LLM_SAMPLE
    ? shuffleAndPick(tracks, MAX_LLM_SAMPLE)
    : tracks;

  console.log(`\n🤖 开始 LLM 流派分类 (${sample.length} 首, 每批 ${LLM_CLASSIFY_BATCH_SIZE} 首)`);

  const client = new OpenAI({ apiKey: DEEPSEEK_KEY!, baseURL: DEEPSEEK_BASE });

  const batches: TrackEntry[][] = [];
  for (let i = 0; i < sample.length; i += LLM_CLASSIFY_BATCH_SIZE) {
    batches.push(sample.slice(i, i + LLM_CLASSIFY_BATCH_SIZE));
  }

  const allClassified: ClassifiedTrack[] = [];
  for (let i = 0; i < batches.length; i++) {
    const result = await classifyBatch(client, batches[i], i + 1, batches.length);
    allClassified.push(...result);
    if (i < batches.length - 1) await sleep(1000);
  }

  console.log(`   ✅ 共分类 ${allClassified.length} 首歌曲`);
  return allClassified;
}

function shuffleAndPick<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

function aggregateStats(tracks: ClassifiedTrack[]) {
  const genreMap = new Map<string, number>();
  const langMap = new Map<string, number>();
  const eraMap = new Map<string, number>();
  const artistMap = new Map<string, { count: number; genres: Set<string> }>();

  for (const t of tracks) {
    genreMap.set(t.genre, (genreMap.get(t.genre) || 0) + 1);
    langMap.set(t.language, (langMap.get(t.language) || 0) + 1);
    eraMap.set(t.era, (eraMap.get(t.era) || 0) + 1);

    const existing = artistMap.get(t.artist) || { count: 0, genres: new Set() };
    existing.count++;
    existing.genres.add(t.genre);
    artistMap.set(t.artist, existing);
  }

  const total = tracks.length;
  const sortByCount = (a: { count: number }, b: { count: number }) => b.count - a.count;

  const genres: GenreStats[] = [...genreMap.entries()]
    .map(([genre, count]) => ({ genre, count, percentage: Math.round((count / total) * 1000) / 10 }))
    .sort(sortByCount);

  const languages: GenreStats[] = [...langMap.entries()]
    .map(([genre, count]) => ({ genre, count, percentage: Math.round((count / total) * 1000) / 10 }))
    .sort(sortByCount);

  const eras: GenreStats[] = [...eraMap.entries()]
    .map(([genre, count]) => ({ genre, count, percentage: Math.round((count / total) * 1000) / 10 }))
    .sort(sortByCount);

  const topArtists = [...artistMap.entries()]
    .map(([artist, data]) => ({ artist, count: data.count, genres: [...data.genres] }))
    .sort(sortByCount)
    .slice(0, 30);

  return { genres, languages, eras, topArtists };
}

let _subgenreSamples: string[] = [];

const TASTE_MD_PROMPT = `你是一位专业的音乐品味分析师。根据下面提供的用户收藏歌曲的分类统计，生成一份详细的中文音乐品味报告 (taste.md)。

## 要求：
1. **喜欢的风格**：按流派整理，说出特征和代表艺人。不要列太多，抓重点。
2. **不太喜欢的**：根据缺失的流派和低频流派推断。如果你发现某些流行风格几乎没有出现，可以合理推测用户不太喜欢。
3. **偏好特征**：从数据中提炼出的听歌习惯（语言偏好、年代偏好、器乐 vs 人声、情绪倾向等）。
4. **语言自然**：像人写的品味随笔，不要 AI 腔。不要用"该用户"这种生硬的表述。用"我"的第一人称视角。
5. **格式**：Markdown。结构参考：# 音乐品味 / ## 喜欢的风格（含子流派）/ ## 不太喜欢 / ## 偏好特征 / ## 高频艺人
6. 字数：500-800 字`;

async function generateTasteMd(stats: ReturnType<typeof aggregateStats>, totalUniqueTracks: number): Promise<string> {
  if (!DEEPSEEK_KEY) {
    console.log('⚠️  无 DeepSeek API key，生成基础版 taste.md');
    return generateBasicTasteMd(stats, totalUniqueTracks);
  }

  console.log('\n✍️  正在通过 LLM 生成 taste.md...');

  const client = new OpenAI({ apiKey: DEEPSEEK_KEY, baseURL: DEEPSEEK_BASE });

  const genreStr = stats.genres
    .filter(g => g.percentage >= 1)
    .map(g => `- ${g.genre}: ${g.count} 首 (${g.percentage}%)`)
    .join('\n');

  const langStr = stats.languages
    .map(l => `- ${l.genre}: ${l.count} 首 (${l.percentage}%)`)
    .join('\n');

  const eraStr = stats.eras
    .map(e => `- ${e.genre}: ${e.count} 首 (${e.percentage}%)`)
    .join('\n');

  const artistStr = stats.topArtists.slice(0, 15)
    .map(a => `- ${a.artist}: ${a.count} 首 (${a.genres.join('、')})`)
    .join('\n');

  const subgenreSample = _subgenreSamples.length > 0
    ? [..._subgenreSamples].sort(() => 0.5 - Math.random()).slice(0, 60).join('、')
    : '(无)';

  const statsMsg = `## 收藏统计 (共 ${totalUniqueTracks} 首，采样分析 ${stats.genres.reduce((s, g) => s + g.count, 0)} 首)

### 流派分布
${genreStr}

### 语言分布
${langStr}

### 年代分布
${eraStr}

### 高频艺人 (Top 15)
${artistStr}

### 子流派采样
${subgenreSample}`;

  try {
    const completion = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: TASTE_MD_PROMPT },
        { role: 'user', content: statsMsg },
      ],
      temperature: 0.7,
      max_tokens: 2400,
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) throw new Error('LLM returned empty');

    const cleaned = raw
      .replace(/^```markdown\s*\n?/i, '')
      .replace(/^```\s*\n?/i, '')
      .replace(/\n```\s*$/i, '')
      .trim();

    console.log('   ✅ taste.md 生成完成');
    return cleaned;
  } catch (err: any) {
    console.log(`   ⚠️  LLM 生成失败 (${err.message})，回退到基础版`);
    return generateBasicTasteMd(stats, totalUniqueTracks);
  }
}

function generateBasicTasteMd(stats: ReturnType<typeof aggregateStats>, totalUniqueTracks: number): string {
  const genreLines = stats.genres
    .filter(g => g.percentage >= 2)
    .map(g => `- ${g.genre}: ${g.percentage}%`)
    .join('\n');

  const langLines = stats.languages.map(l => `- ${l.genre}: ${l.percentage}%`).join('\n');
  const eraLines = stats.eras.filter(e => e.percentage >= 2).map(e => `- ${e.genre}: ${e.percentage}%`).join('\n');
  const artistLines = stats.topArtists.slice(0, 10).map(a => `- ${a.artist}: ${a.count} 首`).join('\n');
  const subgenreSample = _subgenreSamples.length > 0
    ? [..._subgenreSamples].sort(() => 0.5 - Math.random()).slice(0, 40).join('、')
    : '(无)';

  return `# 音乐品味

> 基于 ${totalUniqueTracks} 首网易云收藏的自动分析 (${new Date().toLocaleDateString('zh-CN')})

## 喜欢的风格

### 流派分布
${genreLines}

### 子流派 (部分采样)
${subgenreSample}

## 语言偏好
${langLines}

## 年代偏好
${eraLines}

## 高频艺人
${artistLines}

## 偏好特征
- 根据流派分布自动推断
- 请手动补充具体偏好描述

## 不太喜欢
- 低频或零出现的流派可能是不太喜欢的类型
- 请手动补充`;
}

async function main() {
  const skipFetch = process.argv.includes('--skip-fetch');

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🎵 ChaosRadio 音乐品味分析器         ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const t0 = Date.now();

  if (skipFetch) {
    console.log('⚡ --skip-fetch: 跳过数据抓取，直接从缓存加载\n');
    const cachePath = path.join(ROOT, 'user', 'favorites-cache.json');
    if (!fs.existsSync(cachePath)) {
      console.error('❌ 未找到 favorites-cache.json，请先完整运行一次');
      process.exit(1);
    }
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const cleaned: TrackEntry[] = cached.tracks;
    const likedCount = cached.likedCount || 0;
    console.log(`   加载缓存: ${cleaned.length} 首 (红心 ${likedCount})`);

    console.log('\n' + '━'.repeat(40));
    console.log('🤖 Phase 4: LLM 流派分类\n');
    const classified = await classifyAll(cleaned);
    _subgenreSamples = [...new Set(classified.map(c => c.subgenre).filter(s => s !== '未知'))];

    console.log('\n' + '━'.repeat(40));
    console.log('📊 Phase 5: 统计分析\n');
    const stats = aggregateStats(classified);

    console.log('\n流派 TOP 10:');
    stats.genres.slice(0, 10).forEach(g => console.log(`   ${g.genre}: ${g.count} 首 (${g.percentage}%)`));

    console.log('\n语言分布:');
    stats.languages.forEach(l => console.log(`   ${l.genre}: ${l.count} 首 (${l.percentage}%)`));

    console.log('\n年代分布:');
    stats.eras.forEach(e => console.log(`   ${e.genre}: ${e.count} 首 (${e.percentage}%)`));

    console.log('\n高频艺人 TOP 10:');
    stats.topArtists.slice(0, 10).forEach(a => console.log(`   ${a.artist}: ${a.count} 首`));

    console.log('\n' + '━'.repeat(40));
    console.log('📝 Phase 6: 生成 taste.md\n');
    const tasteMd = await generateTasteMd(stats, cleaned.length);
    const tastePath = path.join(ROOT, 'user', 'taste.md');
    fs.writeFileSync(tastePath, tasteMd, 'utf-8');
    console.log(`💾 已保存到 user/taste.md (${tasteMd.length} 字)`);

    console.log(`\n⏱️  总耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log('✅ 分析完成！');
    return;
  }

  console.log('━'.repeat(40));
  console.log('📡 Phase 1: 抓取 NCM 数据\n');

  const [likedSongs, playlists] = await Promise.all([
    fetchLikedSongs(),
    fetchUserPlaylists(10),
  ]);

  const likedCount = likedSongs.length;

  const playlistTracks: TrackEntry[] = [];
  let playlistTrackCount = 0;
  for (const pl of playlists) {
    await sleep(300);
    const tracks = await fetchPlaylistTracks(pl.id, pl.name);
    playlistTracks.push(...tracks);
    playlistTrackCount += tracks.length;
  }

  const rawTotal = likedSongs.length + playlistTrackCount;
  console.log(`\n   📊 原始数据: ${likedCount} 首红心 + ${playlistTrackCount} 首歌单 = ${rawTotal} 首\n`);

  console.log('━'.repeat(40));
  console.log('🧹 Phase 2: 清洗去重\n');
  const allTracks = [...likedSongs, ...playlistTracks];
  const cleaned = cleanAndDeduplicate(allTracks);

  console.log('\n' + '━'.repeat(40));
  console.log('💾 Phase 3: 保存缓存\n');
  saveFavoritesCache(cleaned, likedCount, playlists.length);

  console.log('\n' + '━'.repeat(40));
  console.log('🤖 Phase 4: LLM 流派分类\n');
  const classified = await classifyAll(cleaned);
  _subgenreSamples = [...new Set(classified.map(c => c.subgenre).filter(s => s !== '未知'))];

  console.log('\n' + '━'.repeat(40));
  console.log('📊 Phase 5: 统计分析\n');
  const stats = aggregateStats(classified);

  console.log('\n流派 TOP 10:');
  stats.genres.slice(0, 10).forEach(g => console.log(`   ${g.genre}: ${g.count} 首 (${g.percentage}%)`));

  console.log('\n语言分布:');
  stats.languages.forEach(l => console.log(`   ${l.genre}: ${l.count} 首 (${l.percentage}%)`));

  console.log('\n年代分布:');
  stats.eras.forEach(e => console.log(`   ${e.genre}: ${e.count} 首 (${e.percentage}%)`));

  console.log('\n高频艺人 TOP 10:');
  stats.topArtists.slice(0, 10).forEach(a => console.log(`   ${a.artist}: ${a.count} 首`));

  console.log('\n' + '━'.repeat(40));
  console.log('📝 Phase 6: 生成 taste.md\n');
  const tasteMd = await generateTasteMd(stats, cleaned.length);
  const tastePath = path.join(ROOT, 'user', 'taste.md');
  fs.writeFileSync(tastePath, tasteMd, 'utf-8');
  console.log(`💾 已保存到 user/taste.md (${tasteMd.length} 字)`);

  console.log(`\n⏱️  总耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('✅ 分析完成！');
}

main().catch((err) => {
  console.error('\n❌ 脚本执行失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
