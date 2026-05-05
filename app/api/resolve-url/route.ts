import { NextResponse } from 'next/server';
import { getSongUrl } from '../../../lib/ncm';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
  }

  try {
    const url = await getSongUrl(id);
    return NextResponse.json({ success: true, url });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'NCM error' }, { status: 500 });
  }
}
