/**
 * Edge-TTS proxy — calls the user's deployed Edge-TTS service on Vercel.
 * Specification: GET /api/text-to-speech?voice=...&text=...
 */

export async function synthesizeSpeech(
  text: string,
  voice: string = 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoxiaoNeural)'
): Promise<string | null> {
  const baseUrl = process.env.EDGE_TTS_URL; // e.g. https://ms-edge-tts.vercel.app
  const token = process.env.EDGE_TTS_TOKEN; // e.g. Flzx3qc@

  if (!baseUrl) {
    console.error('[TTS] EDGE_TTS_URL not configured');
    return null;
  }

  try {
    const url = new URL('/api/text-to-speech', baseUrl);
    url.searchParams.set('voice', voice);
    url.searchParams.set('text', text);
    url.searchParams.set('volume', '0');
    url.searchParams.set('rate', '0');
    url.searchParams.set('pitch', '0');

    // Returning our proxy API URL to hide the token and simplify frontend
    const proxyUrl = `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}`;
    return proxyUrl;
  } catch (error) {
    console.error('[TTS] Synthesis error:', error);
    return null;
  }
}
