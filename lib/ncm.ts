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

async function callNcm<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(async () => {
    // Note: NCM API doesn't support AbortController natively, so we rely on its internal timeout
    // and our retry mechanism for resilience.
    return fn();
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

    return {
      lyric: ((result as any)?.body?.lrc?.lyric) ?? '',
      tlyric: ((result as any)?.body?.tlyric?.lyric) ?? '',
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

    const songs = result?.body?.songs;
    if (!Array.isArray(songs) || songs.length === 0) return null;

    const song = songs[0];
    return {
      id: song.id,
      name: song.name,
      artist: (song.ar ?? []).map((a: { name: string }) => a.name).join(' / ') || 'Unknown Artist',
      album: song.al?.name || '',
      cover: song.al?.picUrl || '',
      duration: song.dt,
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
}

/**
 * Fetch all playlists owned by a user.
 */
export async function getUserPlaylists(uid: string | number): Promise<UserPlaylistInfo[]> {
  try {
    const api = await ncmApi();
    const result = await api.user_playlist({ 
      uid: Number(uid), 
      limit: 30,
      cookie: process.env.NCM_COOKIE,
    });

    const playlists = result?.body?.playlist;
    if (!Array.isArray(playlists)) return [];

    return playlists.map((p: Record<string, unknown>) => ({
      id: p.id as number,
      name: p.name as string,
      trackCount: p.trackCount as number,
    }));
  } catch (error) {
    console.error('[NCM] getUserPlaylists error:', error);
    return [];
  }
}

/**
 * Fetch all tracks from a single playlist.
 */
export async function getPlaylistTracks(playlistId: number, limit = 200): Promise<FavoriteEntry[]> {
  try {
    const api = await ncmApi();
    const result = await api.playlist_track_all({ 
      id: playlistId, 
      limit,
      cookie: process.env.NCM_COOKIE,
    });

    const songs = result?.body?.songs;
    if (!Array.isArray(songs)) return [];

    return songs.map((song: Record<string, unknown>) => ({
      name: song.name as string,
      artist: ((song.ar as Array<{ name: string }>) || []).map((a) => a.name).join(' / '),
    }));
  } catch (error) {
    console.error(`[NCM] getPlaylistTracks(${playlistId}) error:`, error);
    return [];
  }
}

/**
 * Fetch all user favorites and cache to a local JSON file.
 * Returns the list of unique tracks.
 */
export async function fetchAndCacheFavorites(uid: string | number): Promise<FavoriteEntry[]> {
  const { writeFileSync } = await import('fs');
  const { join } = await import('path');

  console.log('[NCM] Fetching favorites for user (UID redacted)');

  // 1. Get all user playlists
  const playlists = await getUserPlaylists(uid);
  if (playlists.length === 0) {
    console.warn('[NCM] No playlists found for user');
    return [];
  }

  console.log(`[NCM] Found ${playlists.length} playlists, fetching tracks...`);

  // 2. Fetch tracks from each playlist (parallel, max 5 at a time)
  const allTracks: FavoriteEntry[] = [];
  const batchSize = 5;

  for (let i = 0; i < playlists.length; i += batchSize) {
    const batch = playlists.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((p) => getPlaylistTracks(p.id, 200))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        allTracks.push(...r.value);
      }
    }
  }

  // 3. Deduplicate by name + artist
  const seen = new Set<string>();
  const unique = allTracks.filter((t) => {
    const key = `${t.name}::${t.artist}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[NCM] Total unique tracks: ${unique.length}`);

  // 4. Cache to /tmp for serverless compatibility
  const cachePath = '/tmp/chaos-radio-favorites-cache.json';
  const cacheData = {
    uid,
    fetchedAt: new Date().toISOString(),
    count: unique.length,
    tracks: unique,
  };

  try {
    writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
    console.log(`[NCM] Favorites cached to ${cachePath}`);
  } catch (e) {
    console.error('[NCM] Failed to write cache:', e);
  }

  return unique;
}

/**
 * Load cached favorites from disk. Returns empty array if no cache exists.
 */
export async function loadCachedFavorites(): Promise<FavoriteEntry[]> {
  try {
    const { readFile } = await import('fs/promises');
    const pathModule = await import('path');
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
