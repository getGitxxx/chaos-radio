import type { Track, NCMSearchResult } from './types';
import * as NCMTypes from './types/ncm';
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
      type: 1,
      cookie: process.env.NCM_COOKIE,
    }));

    if (!NCMTypes.isNCMSearchResponse(result)) {
      console.error('[NCM] Invalid search response format');
      return [];
    }

    const songs = result.body.result.songs;
    if (!Array.isArray(songs)) return [];

    return songs
      .filter(NCMTypes.isNCMSong)
      .map((song) => ({
        id: song.id,
        name: song.name,
        artists: song.ar.map((a) => ({ id: a.id, name: a.name })),
        album: {
          id: song.al.id,
          name: song.al.name,
          picUrl: song.al.picUrl,
        },
        duration: song.dt,
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

    if (!NCMTypes.isNCMSongUrlResponse(result)) {
      return null;
    }

    const data = result.body.data;
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

    if (!NCMTypes.isNCMLyricResponse(result)) {
      return { lyric: '', tlyric: '' };
    }

    const body = result.body;
    return {
      lyric: body.lrc?.lyric ?? '',
      tlyric: body.tlyric?.lyric ?? '',
    };
  } catch (error) {
    console.error('[NCM] Lyric error:', error);
    return { lyric: '', tlyric: '' };
  }
}

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

  const url = await getSongUrl(match.id);
  if (!url) {
    console.log(`[NCM] resolveTrack "${query}" → no URL (${Date.now() - t0}ms)`);
    return null;
  }

  console.log(`[NCM] resolveTrack "${match.name}" → ${Date.now() - t0}ms (url only, lyric deferred)`);

  getLyric(match.id)
    .then((l) => lyricCache.set(match.id, l))
    .catch(() => {});

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

export function getTrackLyricsFromCache(id: number): { lyric: string; tlyric: string } | null {
  return lyricCache.get(id) ?? null;
}

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

export async function getUserPlaylists(uid: string | number): Promise<UserPlaylistInfo[]> {
  try {
    const api = await ncmApi();
    const result = await callNcm(() => api.user_playlist({ 
      uid: Number(uid), 
      limit: 50,
      offset: 0,
      cookie: process.env.NCM_COOKIE,
    }));

    if (!NCMTypes.isNCMUserPlaylistResponse(result)) {
      return [];
    }

    const playlists = result.body.playlist;
    if (!Array.isArray(playlists)) return [];

    return playlists.map((p) => ({
      id: p.id,
      name: p.name,
      trackCount: p.trackCount,
      creatorUserId: p.creator?.userId,
      createTime: p.createTime,
    }));
  } catch (error) {
    console.error('[NCM] getUserPlaylists error:', error);
    return [];
  }
}

export async function getUserLikedSongs(uid: string | number): Promise<FavoriteEntry[]> {
  try {
    const api = await ncmApi();
    const result = await callNcm(() => api.likelist({
      uid: Number(uid),
      cookie: process.env.NCM_COOKIE,
    }));

    if (!NCMTypes.isNCMLikeListResponse(result)) {
      return [];
    }

    const ids = result.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const MAX_LIKED = 300;
    const sampleIds = ids.length > MAX_LIKED ? ids.slice(0, MAX_LIKED) : ids;

    const allSongs: FavoriteEntry[] = [];
    const batchSize = 100;
    
    const batches: Promise<void>[] = [];
    for (let i = 0; i < sampleIds.length; i += batchSize) {
      const batch = sampleIds.slice(i, i + batchSize);
      batches.push(
        (async () => {
          const detailResult = await callNcm(() => api.song_detail({
            ids: batch.join(','),
            cookie: process.env.NCM_COOKIE,
          }), 6000);

          if (!NCMTypes.isNCMSongDetailResponse(detailResult)) return;

          const songs = detailResult.body.songs;
          if (!Array.isArray(songs)) return;

          for (const song of songs.filter(NCMTypes.isNCMSong)) {
            allSongs.push({
              name: song.name,
              artist: song.ar.map((a) => a.name).join(' / '),
            });
          }
        })()
      );
    }

    await Promise.all(batches);

    console.log(`[NCM] Liked songs: ${allSongs.length} tracks`);
    return allSongs;
  } catch (error) {
    console.error('[NCM] getUserLikedSongs error:', error);
    return [];
  }
}

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
    }), 10000);

    if (!NCMTypes.isNCMPlaylistTrackResponse(result)) {
      return [];
    }

    const songs = result.body.songs;
    if (!Array.isArray(songs)) return [];

    return songs
      .filter(NCMTypes.isNCMSong)
      .map((song) => ({
        name: song.name,
        artist: song.ar.map((a) => a.name).join(' / '),
      }));
  } catch (error) {
    console.error(`[NCM] getPlaylistTracks(${playlistId}) error:`, error);
    return [];
  }
}

export async function fetchAndCacheFavorites(uid: string | number): Promise<{
  tracks: FavoriteEntry[];
  likedCount: number;
  playlistCount: number;
}> {
  console.log('[NCM] Fetching favorites for user (UID redacted)');

  const SOFT_DEADLINE = 45000;
  const startTime = Date.now();

  try {
    const result = await doFetchAndCache(uid, startTime, SOFT_DEADLINE);
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[NCM] fetchAndCacheFavorites failed:', errMsg);

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

  const likedSongs = await getUserLikedSongs(uid);
  allTracks.push(...likedSongs);
  const likedCount = likedSongs.length;
  console.log(`[NCM] Liked songs synced: ${likedCount}`);

  checkDeadline();

  const playlists = await getUserPlaylists(uid);

  const ownPlaylists = playlists
    .filter((p) => p.creatorUserId === Number(uid))
    .sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0))
    .slice(0, 10);

  console.log(`[NCM] User-created playlists: ${ownPlaylists.length}/${playlists.length} (top 10)`);

  checkDeadline();

  const promises = ownPlaylists.map((p) => getPlaylistTracks(p.id, 200));
  const results = await Promise.allSettled(promises);

  for (const r of results) {
    if (r.status === 'fulfilled') {
      allTracks.push(...r.value);
    }
  }

  const seen = new Set<string>();
  const unique = allTracks.filter((t) => {
    const key = `${t.name}::${t.artist}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[NCM] Total unique tracks: ${unique.length} (liked: ${likedCount}, from ${ownPlaylists.length} playlists)`);

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

export async function sampleFavorites(count = 30): Promise<string[]> {
  const tracks = await loadCachedFavorites();
  if (tracks.length === 0) return [];

  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled
    .slice(0, Math.min(count, shuffled.length))
    .map((t) => `${t.name} - ${t.artist}`);
}