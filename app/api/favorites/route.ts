import { NextResponse } from 'next/server';
import { fetchAndCacheFavorites, loadCachedFavorites } from '../../../lib/ncm';

/**
 * GET /api/favorites — Return cached favorites
 * POST /api/favorites — Trigger a fresh sync from NCM
 */

export async function GET() {
  const tracks = loadCachedFavorites();
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
    const tracks = await fetchAndCacheFavorites(uid);

    return NextResponse.json({
      success: true,
      data: {
        count: tracks.length,
        message: `Successfully synced ${tracks.length} unique tracks from NCM`,
      },
    });
  } catch (error) {
    console.error('[Favorites] Sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync favorites' },
      { status: 500 }
    );
  }
}
