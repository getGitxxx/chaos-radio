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

const NCM_TIMEOUT = 8000; // 8s timeout for NCM calls

/**
 * Call an NCM API function with retry and timeout protection.
 * Uses Promise.race to enforce a hard deadline even if the NCM API hangs.
 */
async function callNcm<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(async () => {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('NCM timeout')), NCM_TIMEOUT)
      ),
    ]);
    return result as T;
  }, { retries: 2, delayMs: 1000 });
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

export async function getSongDetail(id: number): Promise<Track | null> {
  try {
    const api = await ncmApi();
    const result = await callNcm(() => api.song_detail({ 
      ids: String(id),
      cookie: process.env.NCM_COOKIE,
    }));

    const body = (result as unknown as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
    const songs = body?.songs as unknown[] | undefined;
    if (!Array.isArray(songs) || songs.length === 0) return null;

    const song = songs[0] as Record<string, unknown>;
    return {
      id: song.id as number,
      name: song.name as string,
      artist: ((song.ar ?? []) as Array<{ name: string }>).map((a) => a.name).join(' / ') || 'Unknown Artist',
      album: (song.al as { name: string })?.name || '',
      cover: (song.al as { picUrl: string })?.picUrl || '',
      duration: song.dt as number,
    };
  } catch (error) {
    console.error('[NCM] Song detail error:', error);
    return null;
  }
}

/**
 * Search for a song and return a fully resolved Track with URL, cover, and lyrics.
 */
export async function resolveTrack(query: string): Promise<Track | null> {
  const results = await searchSongs(query, 1);
  if (results.length === 0) return null;

  const match = results[0];
  const [url, lyrics, detail] = await Promise.all([
    getSongUrl(match.id),
    getLyric(match.id),
    getSongDetail(match.id),
  ]);

  if (!url) return null;

  return {
    id: match.id,
    name: match.name,
    artist: match.artists.map((a) => a.name).join(' / '),
    album: match.album.name,
    cover: match.album.picUrl,
    url,
    duration: match.duration,
    lyric: lyrics.lyric,
    tlyric: lyrics.tlyric,
  };
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

    // Fetch song details in batches of 100
    const allSongs: FavoriteEntry[] = [];
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const detailResult = await callNcm(() => api.song_detail({
        ids: batch.join(','),
        cookie: process.env.NCM_COOKIE,
      }));

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
    }));

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
 * 1. "我喜欢的音乐" (liked songs) — fetched first
 * 2. User-created playlists (creator.userId === uid), top 10 most recently created
 *
 * Protected by a 30s overall timeout.
 */
export async function fetchAndCacheFavorites(uid: string | number): Promise<{
  tracks: FavoriteEntry[];
  likedCount: number;
  playlistCount: number;
}> {
  console.log('[NCM] Fetching favorites for user (UID redacted)');

  // Overall timeout: 30s
  const OVERALL_TIMEOUT = 30000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Favorites sync timed out after 30s')), OVERALL_TIMEOUT)
  );

  try {
    const result = await Promise.race([
      doFetchAndCache(uid),
      timeoutPromise,
    ]);
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[NCM] fetchAndCacheFavorites failed:', errMsg);
    throw error;
  }
}

async function doFetchAndCache(uid: string | number): Promise<{
  tracks: FavoriteEntry[];
  likedCount: number;
  playlistCount: number;
}> {
  const allTracks: FavoriteEntry[] = [];

  // 1. Fetch "我喜欢的音乐" first
  const likedSongs = await getUserLikedSongs(uid);
  allTracks.push(...likedSongs);
  const likedCount = likedSongs.length;
  console.log(`[NCM] Liked songs synced: ${likedCount}`);

  // 2. Fetch only user-created playlists, sorted by recency, top 10
  const playlists = await getUserPlaylists(uid);

  // Filter: only user's own playlists
  const ownPlaylists = playlists
    .filter((p) => p.creatorUserId === Number(uid))
    .sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0))
    .slice(0, 10);

  console.log(`[NCM] User-created playlists: ${ownPlaylists.length}/${playlists.length} (top 10)`);

  // 3. Fetch tracks from each playlist (in batches of 3 parallel)
  const batchSize = 3;
  for (let i = 0; i < ownPlaylists.length; i += batchSize) {
    const batch = ownPlaylists.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((p) => getPlaylistTracks(p.id, 200))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        allTracks.push(...r.value);
      }
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

  // 5. Cache to /tmp for serverless compatibility
  const cachePath = '/tmp/chaos-radio-favorites-cache.json';
  const cacheData = {
    uid,
    fetchedAt: new Date().toISOString(),
    count: unique.length,
    likedCount,
    playlistCount: ownPlaylists.length,
    tracks: unique,
  };

  // Dynamic imports for filesystem (serverless-safe: only used in Node.js runtime)
  const { writeFileSync } = await import('fs');
  try {
    writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
    console.log(`[NCM] Favorites cached to ${cachePath}`);
  } catch (e) {
    console.error('[NCM] Failed to write cache:', e);
  }

  return {
    tracks: unique,
    likedCount,
    playlistCount: ownPlaylists.length,
  };
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
