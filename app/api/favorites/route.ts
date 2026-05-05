import { NextResponse } from 'next/server';
import { fetchAndCacheFavorites, loadCachedFavorites } from '../../../lib/ncm';
import { generateTasteProfile } from '../../../lib/taste-profile';

/**
 * GET /api/favorites — Return cached favorites
 * POST /api/favorites — Trigger a fresh sync from NCM
 */

export async function GET() {
  const tracks = await loadCachedFavorites();
  const safeTracks = Array.isArray(tracks) ? tracks : [];

  return NextResponse.json({
    success: true,
    data: {
      count: safeTracks.length,
      tracks: safeTracks.slice(0, 50),
    },
  });
}

export async function POST() {
  const uid = process.env.NCM_USER_ID;

  if (!uid) {
    return NextResponse.json(
      { success: false, error: 'NCM_USER_ID not configured in .env.local' },
      { status: 400 }
    );
  }

  try {
    const { tracks, likedCount, playlistCount } = await fetchAndCacheFavorites(uid);

    void generateTasteProfile({
      liked: [],
      disliked: [],
      favorites: tracks.map(t => `${t.name} - ${t.artist}`),
    }).then(profile => {
      if (profile) console.log('[Favorites] Taste profile regenerated');
    }).catch(e => console.error('[Favorites] Taste profile gen failed:', e.message));

    return NextResponse.json({
      success: true,
      data: {
        count: tracks.length,
        likedCount,
        playlistCount,
        message: `已同步 ${tracks.length} 首歌曲（我喜欢的: ${likedCount} 首，来自 ${playlistCount} 个歌单）`,
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errMsg.includes('deadline') || errMsg.includes('timed out');

    console.error('[Favorites] Sync error:', errMsg);
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? '同步部分完成（NCM API 响应较慢）。已缓存的数据会在下次推荐时生效。'
          : '同步失败，请确保 NCM 环境变量配置正确',
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
