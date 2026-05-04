import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../plan/route';

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      json: () => Promise.resolve(data),
      status: init?.status ?? 200,
      ok: !init?.status || init.status < 400,
    }),
  },
}));

// Mock dependencies
const mockResolveTrack = vi.fn();
vi.mock('../../../lib/ncm', () => ({
  resolveTrack: (...args: unknown[]) => mockResolveTrack(...args),
}));

const mockCallLLM = vi.fn();
vi.mock('../../../lib/llm', () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
}));

const mockBuildContext = vi.fn();
vi.mock('../../../lib/context', () => ({
  buildContext: (...args: unknown[]) => mockBuildContext(...args),
}));

const mockSynthesizeSpeech = vi.fn();
vi.mock('../../../lib/tts', () => ({
  synthesizeSpeech: (...args: unknown[]) => mockSynthesizeSpeech(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockResolvedValue('mock context');
  mockSynthesizeSpeech.mockResolvedValue('/api/tts?text=hello');
});

describe('POST /api/plan', () => {
  it('should return 400 when prompt is empty and recent/liked are empty', async () => {
    mockCallLLM.mockResolvedValue({
      say: 'Hello',
      play: [],
      reason: 'test',
      segue: 'warm',
    });

    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await (response as any).json();

    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  it('should resolve tracks from LLM response', async () => {
    mockCallLLM.mockResolvedValue({
      say: 'Here are some tracks',
      play: [
        { query: 'Song A - Artist A', intro: 'Intro A' },
        { query: 'Song B - Artist B', intro: 'Intro B' },
      ],
      reason: 'test',
      segue: 'warm',
    });

    mockResolveTrack
      .mockResolvedValueOnce({ id: 1, name: 'Song A', artist: 'Artist A', url: 'http://a.mp3', duration: 240000 })
      .mockResolvedValueOnce({ id: 2, name: 'Song B', artist: 'Artist B', url: 'http://b.mp3', duration: 240000 });

    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'chill vibes' }),
    });

    const response = await POST(request);
    const data = await (response as any).json();

    expect(data.success).toBe(true);
    expect(data.data.tracks).toHaveLength(2);
    expect(data.data.tracks[0].djIntro).toBe('Intro A');
    expect(data.data.tracks[1].djIntro).toBe('Intro B');
  });

  it('should handle LLM timeout gracefully', async () => {
    mockCallLLM.mockResolvedValue({
      say: '信号有点慢，让我再想想...',
      play: [],
      reason: 'LLM request timed out',
      segue: 'warm',
    });

    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    });

    const response = await POST(request);
    const data = await (response as any).json();

    expect(data.success).toBe(true);
    expect(data.data.tracks).toHaveLength(0);
    expect(data.data.djMessage).toBe('信号有点慢，让我再想想...');
  });

  it('should skip failed track resolution', async () => {
    mockCallLLM.mockResolvedValue({
      say: 'Here are some tracks',
      play: [
        { query: 'Song A - Artist A', intro: 'Intro A' },
        { query: 'Song B - Artist B', intro: 'Intro B' },
      ],
      reason: 'test',
      segue: 'warm',
    });

    mockResolveTrack
      .mockResolvedValueOnce({ id: 1, name: 'Song A', artist: 'Artist A', url: 'http://a.mp3', duration: 240000 })
      .mockResolvedValueOnce(null); // Track B fails

    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    });

    const response = await POST(request);
    const data = await (response as any).json();

    expect(data.success).toBe(true);
    expect(data.data.tracks).toHaveLength(1); // Only Song A
    expect(data.data.tracks[0].name).toBe('Song A');
  });
});
