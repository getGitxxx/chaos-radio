import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DJService as a class
const mockGeneratePlaylist = vi.fn().mockResolvedValue({
  tracks: [
    { id: 1, name: 'Song A', artist: 'Artist A', url: 'http://a.mp3', duration: 240000, djIntro: 'Intro A' },
    { id: 2, name: 'Song B', artist: 'Artist B', url: 'http://b.mp3', duration: 240000, djIntro: 'Intro B' },
  ],
  ttsUrl: '/api/tts?text=hello',
  djMessage: 'Welcome to the show',
  reason: 'test',
  segue: 'warm',
});

vi.mock('../../../lib/services/dj-service', () => ({
  DJService: class {
    generatePlaylist = mockGeneratePlaylist;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/plan streaming', () => {
  it('should return JSON when client does not accept SSE', async () => {
    const { POST } = await import('../plan/route');

    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'chill vibes' }),
    });

    const response = await POST(request);
    const data = await (response as any).json();

    expect(data.success).toBe(true);
    expect(data.data.tracks).toHaveLength(2);
    expect(data.data.djMessage).toBe('Welcome to the show');
  });

  it('should return SSE stream when client accepts text/event-stream', async () => {
    const { POST } = await import('../plan/route');

    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify({ prompt: 'chill vibes' }),
    });

    const response = await POST(request);

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');

    // Read the stream
    const reader = (response as any).body.getReader();
    const decoder = new TextDecoder();
    let chunks: string[] = [];
    let result: ReadableStreamReadResult<Uint8Array>;

    do {
      result = await reader.read();
      if (!result.done) {
        chunks.push(decoder.decode(result.value));
      }
    } while (!result.done);

    const fullText = chunks.join('');
    expect(fullText).toContain('event: say');
    expect(fullText).toContain('event: track');
    expect(fullText).toContain('event: done');
    expect(fullText).toContain('Welcome to the show');
  });
});
