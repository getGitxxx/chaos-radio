import { NextResponse } from 'next/server';
import { getLyric } from '../../../lib/ncm';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, error: 'Missing song id' }, { status: 400 });
  }

  try {
    const songId = parseInt(id, 10);
    const lyrics = await getLyric(songId);
    return NextResponse.json({ success: true, data: lyrics });
  } catch (error) {
    console.error(`[API Lyrics] Failed for id ${id}:`, error);
    return NextResponse.json({ success: false, error: 'Failed to fetch lyrics' }, { status: 500 });
  }
}
