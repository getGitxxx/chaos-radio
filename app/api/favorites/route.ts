import { NextResponse } from 'next/server';
import { fetchAndCacheFavorites, loadCachedFavorites } from '../../../lib/ncm';

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
    const isTimeout = errMsg.includes('timed out');

    console.error('[Favorites] Sync error:', errMsg);
    return NextResponse.json(
      {
        success: false,
        error: isTimeout ? '同步超时，请稍后重试（NCM API 响应较慢）' : '同步失败，请确保 NCM 环境变量配置正确',
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
