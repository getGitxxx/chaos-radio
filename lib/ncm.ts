import type { Track, NCMSearchResult } from './types';
import { withRetry } from './retry';

/**
 * NCM API wrapper for Vercel serverless functions.
 * Uses NeteaseCloudMusicApi as a direct dependency.
 */

// Dynamic import to handle serverless bundling
async function ncmApi() {
  const api = await import('NeteaseCloudMusicApi');
  return api;
}

const NCM_TIMEOUT = 3000;

/**
 * Call an NCM API function with retry and timeout protection.
 * Uses Promise.race to enforce a hard deadline even if the NCM API hangs.
 */
async function callNcm<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
  const timeout = timeoutMs || NCM_TIMEOUT;
  return withRetry(async () => {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('NCM timeout')), timeout)
      ),
    ]);
    return result as T;
  }, { retries: 0 });
}

export async function searchSongs(
  keyword: string,
  limit: number = 10
): Promise<NCMSearchResult[]> {
  try {
    const api = await ncmApi();
    const result = await callNcm(() => api.cloudsearch({
      keywords: keyword,
      limit,
      type: 1, // 1 = songs
      cookie: process.env.NCM_COOKIE,
    }));

    const songs = ((result as any)?.body?.result?.songs ?? []) as any[];
    if (!Array.isArray(songs)) return [];

    return songs.map((song: Record<string, unknown>) => ({
      id: song.id as number,
      name: song.name as string,
      artists: (song.ar as Array<{ id: number; name: string }>)?.map((a) => ({
        id: a.id,
        name: a.name,
      })) || [],
      album: {
        id: (song.al as { id: number; name: string; picUrl: string })?.id || 0,
        name: (song.al as { id: number; name: string; picUrl: string })?.name || '',
        picUrl: (song.al as { id: number; name: string; picUrl: string })?.picUrl || '',
      },
      duration: song.dt as number,
    }));
  } catch (error) {
    console.error('[NCM] Search error:', error);
    return [];
  }
}

export async function getSongUrl(id: number): Promise<string | null> {
  try {
    const api = await ncmApi();
    const result = await callNcm(() => api.song_url({ 
      id, 
      br: 320000,
      cookie: process.env.NCM_COOKIE,
    }));

    const data = result?.body?.data;
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0]?.url || null;
  } catch (error) {
    console.error('[NCM] Song URL error:', error);
    return null;
  }
}

export async function getLyric(id: number): Promise<{ lyric: string; tlyric: string }> {
  try {
    const api = await ncmApi();
    const result = await callNcm(() => api.lyric({ 
      id,
      cookie: process.env.NCM_COOKIE,
    }));

    const body = (result as unknown as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
    return {
      lyric: ((body?.lrc as Record<string, string> | undefined)?.lyric) ?? '',
      tlyric: ((body?.tlyric as Record<string, string> | undefined)?.lyric) ?? '',
    };
  } catch (error) {
    console.error('[NCM] Lyric error:', error);
    return { lyric: '', tlyric: '' };
  }
}

/**
 * Search for a song and return a fully resolved Track with URL and lyrics.
 */
/**
 * In-memory lyric cache: filled by background fetches in resolveTrack.
 * Keys are NCM song IDs.
 */
const lyricCache = new Map<number, { lyric: string; tlyric: string }>();

export async function resolveTrack(query: string): Promise<Track | null> {
  const t0 = Date.now();
  const results = await searchSongs(query, 1);
  if (results.length === 0) {
    console.log(`[NCM] resolveTrack "${query}" → 0 results`);
    return null;
  }

  const match = results[0];

  // Only await URL — lyrics are non-blocking and loaded in background
  const url = await getSongUrl(match.id);
  if (!url) {
    console.log(`[NCM] resolveTrack "${query}" → no URL (${Date.now() - t0}ms)`);
    return null;
  }

  console.log(`[NCM] resolveTrack "${match.name}" → ${Date.now() - t0}ms (url only, lyric deferred)`);

  // Kick off lyric fetch in background — don't await
  getLyric(match.id)
    .then((l) => lyricCache.set(match.id, l))
    .catch(() => {});

  // Return cached lyrics if already available (e.g. second call for same track)
  const cachedLyric = lyricCache.get(match.id) ?? { lyric: '', tlyric: '' };

  return {
    id: match.id,
    name: match.name,
    artist: match.artists.map((a) => a.name).join(' / '),
    album: match.album.name,
    cover: match.album.picUrl,
    url,
    duration: match.duration,
    lyric: cachedLyric.lyric,
    tlyric: cachedLyric.tlyric,
  };
}

/**
 * Read lyrics for a track that was previously resolved.
 * Returns null if lyrics are not yet cached (still loading in background).
 */
export function getTrackLyricsFromCache(id: number): { lyric: string; tlyric: string } | null {
  return lyricCache.get(id) ?? null;
}

/**
 * Resolve multiple track queries in parallel.
 */
export async function resolveTracks(queries: string[]): Promise<Track[]> {
  const results = await Promise.allSettled(
    queries.map((q) => resolveTrack(q))
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<Track> =>
        r.status === 'fulfilled' && r.value !== null
    )
    .map((r) => r.value);
}

/* ---- User Favorites ---- */

export interface FavoriteEntry {
  name: string;
  artist: string;
}

export interface UserPlaylistInfo {
  id: number;
  name: string;
  trackCount: number;
  creatorUserId?: number;
  createTime?: number;
}

/**
 * Fetch all playlists owned by a user.
 * Returns full playlist info including creator and creation time.
 */
export async function getUserPlaylists(uid: string | number): Promise<UserPlaylistInfo[]> {
  try {
    const api = await ncmApi();
    const result = await callNcm(() => api.user_playlist({ 
      uid: Number(uid), 
      limit: 50,
      offset: 0,
      cookie: process.env.NCM_COOKIE,
    }));

    const body = (result as unknown as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
    const playlists = body?.playlist as unknown[] | undefined;
    if (!Array.isArray(playlists)) return [];

    return playlists.map((p) => {
      const pl = p as Record<string, unknown>;
      const creator = pl.creator as Record<string, unknown> | undefined;
      return {
        id: pl.id as number,
        name: pl.name as string,
        trackCount: pl.trackCount as number,
        creatorUserId: creator?.userId as number | undefined,
        createTime: pl.createTime as number | undefined,
      };
    });
  } catch (error) {
    console.error('[NCM] getUserPlaylists error:', error);
    return [];
  }
}

/**
 * Fetch the user's liked songs (我喜欢的音乐 / Liked Songs).
 * This is always playlist ID 0 with special handling — uses /likelist endpoint.
 */
export async function getUserLikedSongs(uid: string | number): Promise<FavoriteEntry[]> {
  try {
    const api = await ncmApi();
    const result = await callNcm(() => api.likelist({
      uid: Number(uid),
      cookie: process.env.NCM_COOKIE,
    }));

    const body = (result as unknown as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
    const ids = body?.ids as number[] | undefined;
    if (!Array.isArray(ids) || ids.length === 0) return [];

    // Limit to 300 most recent (NCM returns newest first by default)
    // 300 liked songs provide excellent taste signal without exceeding Vercel timeout
    const MAX_LIKED = 300;
    const sampleIds = ids.length > MAX_LIKED ? ids.slice(0, MAX_LIKED) : ids;

    // Fetch song details in batches of 100
    const allSongs: FavoriteEntry[] = [];
    const batchSize = 100;
    for (let i = 0; i < sampleIds.length; i += batchSize) {
      const batch = sampleIds.slice(i, i + batchSize);
      const detailResult = await callNcm(() => api.song_detail({
        ids: batch.join(','),
        cookie: process.env.NCM_COOKIE,
      }), 6000);

      const body = (detailResult as unknown as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
      const songs = body?.songs as unknown[] | undefined;
      if (!Array.isArray(songs)) continue;

      for (const song of songs) {
        const s = song as Record<string, unknown>;
        allSongs.push({
          name: s.name as string,
          artist: ((s.ar as Array<{ name: string }>) || []).map((a) => a.name).join(' / '),
        });
      }
    }

    console.log(`[NCM] Liked songs: ${allSongs.length} tracks`);
    return allSongs;
  } catch (error) {
    console.error('[NCM] getUserLikedSongs error:', error);
    return [];
  }
}

/**
 * Fetch max N tracks from a specific playlist.
 */
export async function getPlaylistTracks(
  playlistId: number,
  maxTracks = 200
): Promise<FavoriteEntry[]> {
  try {
    const api = await ncmApi();
    const result = await callNcm(() => api.playlist_track_all({ 
      id: playlistId, 
      limit: maxTracks,
      cookie: process.env.NCM_COOKIE,
    }), 10000); // 10s for bulk track fetch

    const body = (result as unknown as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
    const songs = body?.songs as unknown[] | undefined;
    if (!Array.isArray(songs)) return [];

    return songs.map((song) => {
      const s = song as Record<string, unknown>;
      return {
        name: s.name as string,
        artist: ((s.ar as Array<{ name: string }>) || []).map((a) => a.name).join(' / '),
      };
    });
  } catch (error) {
    console.error(`[NCM] getPlaylistTracks(${playlistId}) error:`, error);
    return [];
  }
}

/**
 * Fetch all user favorites and cache to /tmp for serverless use.
 *
 * Priority:
 * 1. "我喜欢的音乐" (liked songs, max 300) — fetched first
 * 2. User-created playlists (creator.userId === uid), top 10 by recency
 *
 * Soft timeout: if total time exceeds 45s, returns partial result from cache
 * rather than failing. Individual NCM calls have their own 8s timeout.
 */
export async function fetchAndCacheFavorites(uid: string | number): Promise<{
  tracks: FavoriteEntry[];
  likedCount: number;
  playlistCount: number;
}> {
  console.log('[NCM] Fetching favorites for user (UID redacted)');

  const SOFT_DEADLINE = 45000; // 45s soft deadline (Vercel allows 60s)
  const startTime = Date.now();

  try {
    const result = await doFetchAndCache(uid, startTime, SOFT_DEADLINE);
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[NCM] fetchAndCacheFavorites failed:', errMsg);

    // If timeout fired but data may have been cached, try loading it
    if (errMsg.includes('deadline')) {
      console.log('[NCM] Deadline reached, checking for partial cache...');
      try {
        const { readFile } = await import('fs/promises');
        const cachePath = '/tmp/chaos-radio-favorites-cache.json';
        const raw = await readFile(cachePath, 'utf-8');
        const cached = JSON.parse(raw);
        if (cached.tracks && cached.tracks.length > 0) {
          console.log(`[NCM] Loaded ${cached.tracks.length} tracks from partial cache`);
          return {
            tracks: cached.tracks,
            likedCount: cached.likedCount ?? 0,
            playlistCount: cached.playlistCount ?? 0,
          };
        }
      } catch {
        // No partial cache available
      }
    }

    throw error;
  }
}

async function doFetchAndCache(
  uid: string | number,
  startTime: number,
  deadlineMs: number
): Promise<{
  tracks: FavoriteEntry[];
  likedCount: number;
  playlistCount: number;
}> {
  const allTracks: FavoriteEntry[] = [];

  function checkDeadline() {
    if (Date.now() - startTime >= deadlineMs) {
      throw new Error(`Favorites sync soft deadline reached (${deadlineMs / 1000}s)`);
    }
  }

  // 1. Fetch "我喜欢的音乐" first
  const likedSongs = await getUserLikedSongs(uid);
  allTracks.push(...likedSongs);
  const likedCount = likedSongs.length;
  console.log(`[NCM] Liked songs synced: ${likedCount}`);

  checkDeadline();

  // 2. Fetch only user-created playlists, sorted by recency, top 10
  const playlists = await getUserPlaylists(uid);

  // Filter: only user's own playlists
  const ownPlaylists = playlists
    .filter((p) => p.creatorUserId === Number(uid))
    .sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0))
    .slice(0, 10);

  console.log(`[NCM] User-created playlists: ${ownPlaylists.length}/${playlists.length} (top 10)`);

  // 3. Fetch tracks from each playlist, checking deadline between batches
  const batchSize = 3;
  for (let i = 0; i < ownPlaylists.length; i += batchSize) {
    checkDeadline();

    const batch = ownPlaylists.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((p) => getPlaylistTracks(p.id, 200))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        allTracks.push(...r.value);
      }
    }

    // Cache incrementally if we have data so far (crash recovery)
    if (allTracks.length > 0 && i > 0 && i % 6 === 0) {
      writeCacheIncremental(uid, allTracks, likedCount, i / batchSize);
    }
  }

  // 4. Deduplicate by name + artist
  const seen = new Set<string>();
  const unique = allTracks.filter((t) => {
    const key = `${t.name}::${t.artist}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[NCM] Total unique tracks: ${unique.length} (liked: ${likedCount}, from ${ownPlaylists.length} playlists)`);

  // 5. Final cache write
  writeFinalCache(uid, unique, likedCount, ownPlaylists.length);

  return {
    tracks: unique,
    likedCount,
    playlistCount: ownPlaylists.length,
  };
}

async function writeCacheIncremental(
  uid: string | number,
  tracks: FavoriteEntry[],
  likedCount: number,
  playlistBatchCount: number,
) {
  try {
    const { writeFileSync } = await import('fs');
    const cachePath = '/tmp/chaos-radio-favorites-cache.json';
    const cacheData = {
      uid,
      fetchedAt: new Date().toISOString(),
      count: tracks.length,
      likedCount,
      playlistCount: playlistBatchCount,
      partial: true,
      tracks,
    };
    writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
    console.log(`[NCM] Incremental cache: ${tracks.length} tracks`);
  } catch {
    // Non-critical
  }
}

function writeFinalCache(
  uid: string | number,
  tracks: { name: string; artist: string }[],
  likedCount: number,
  playlistCount: number,
) {
  try {
    const { writeFileSync } = require('fs');
    const cachePath = '/tmp/chaos-radio-favorites-cache.json';
    const cacheData = {
      uid,
      fetchedAt: new Date().toISOString(),
      count: tracks.length,
      likedCount,
      playlistCount,
      tracks,
    };
    writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
    console.log(`[NCM] Favorites cached to ${cachePath}`);
  } catch (e) {
    console.error('[NCM] Failed to write cache:', e);
  }
}

/**
 * Load cached favorites from /tmp. Returns empty array if no cache exists.
 */
export async function loadCachedFavorites(): Promise<FavoriteEntry[]> {
  try {
    const { readFile } = await import('fs/promises');
    const cachePath = '/tmp/chaos-radio-favorites-cache.json';
    const raw = await readFile(cachePath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.tracks) ? data.tracks : [];
  } catch {
    return [];
  }
}

/**
 * Get a random sample of favorites for LLM context injection.
 * Picks N random tracks to keep the prompt concise.
 */
export async function sampleFavorites(count = 30): Promise<string[]> {
  const tracks = await loadCachedFavorites();
  if (tracks.length === 0) return [];

  // Fisher-Yates shuffle + take first N
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled
    .slice(0, Math.min(count, shuffled.length))
    .map((t) => `${t.name} - ${t.artist}`);
}
