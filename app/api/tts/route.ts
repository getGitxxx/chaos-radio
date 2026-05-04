import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get('text');
    const voice = searchParams.get('voice') || 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoxiaoNeural)';

    if (!text) {
      return NextResponse.json({ success: false, error: 'Missing text' }, { status: 400 });
    }

    const baseUrl = process.env.EDGE_TTS_URL;
    const token = process.env.EDGE_TTS_TOKEN;

    if (!baseUrl) {
      return NextResponse.json({ success: false, error: 'TTS service not configured' }, { status: 500 });
    }

    // Validate upstream URL: must be HTTPS and not local/internal
    try {
      const parsedUrl = new URL(baseUrl);
      if (parsedUrl.protocol !== 'https:') {
        return NextResponse.json({ success: false, error: 'TTS upstream must use HTTPS' }, { status: 500 });
      }
      const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
      if (blockedHosts.includes(parsedUrl.hostname)) {
        return NextResponse.json({ success: false, error: 'Invalid TTS upstream host' }, { status: 500 });
      }
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid TTS service URL' }, { status: 500 });
    }

    // Build the upstream URL
    const upstreamUrl = new URL('/api/text-to-speech', baseUrl);
    upstreamUrl.searchParams.set('voice', voice);
    upstreamUrl.searchParams.set('text', text);
    upstreamUrl.searchParams.set('volume', '0');
    upstreamUrl.searchParams.set('rate', '0');
    upstreamUrl.searchParams.set('pitch', '0');

    // Fetch from upstream with auth and timeout
    const response = await fetch(upstreamUrl.toString(), {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
      signal: AbortSignal.timeout(10000), // 10s timeout for TTS
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS Proxy] Upstream error:', response.status, errorText);
      return NextResponse.json({ success: false, error: 'TTS upstream error' }, { status: response.status });
    }

    // Stream the audio back to the client
    const audioBuffer = await response.arrayBuffer();
    
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[TTS Proxy] Internal error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
