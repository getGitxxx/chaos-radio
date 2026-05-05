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

describe('POST /api/plan', () => {
  it('should return JSON playlist response', async () => {
    const { POST } = await import('../plan/route');

    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'chill vibes' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data.tracks).toHaveLength(2);
    expect(data.data.djMessage).toBe('Welcome to the show');
  });

  it('should always return application/json (SSE was removed)', async () => {
    const { POST } = await import('../plan/route');

    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify({ prompt: 'chill vibes' }),
    });

    const response = await POST(request);
    const data = await response.json();

    // SSE path was removed — route always returns JSON now
    expect(data.success).toBe(true);
    expect(data.data.tracks).toHaveLength(2);
    expect(data.data.djMessage).toBe('Welcome to the show');
  });
});
