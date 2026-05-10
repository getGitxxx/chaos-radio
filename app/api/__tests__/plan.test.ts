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

const mockCallLLMStream = vi.fn();
vi.mock('../../../lib/llm', () => ({
  callLLMStream: (...args: unknown[]) => mockCallLLMStream(...args),
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
    mockCallLLMStream.mockImplementation(async (systemPrompt, userMessage, history, callbacks) => {
      if (callbacks.onDJMessageReady) {
        callbacks.onDJMessageReady({ say: 'Hello', reason: 'test', segue: 'warm' });
      }
    });

    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const text = await response.text();

    expect(text).toContain('event: dj_message');
    expect(text).toContain('event: done');
  });

  it('should resolve tracks from LLM response', async () => {
    mockCallLLMStream.mockImplementation(async (systemPrompt, userMessage, history, callbacks) => {
      if (callbacks.onDJMessageReady) {
        callbacks.onDJMessageReady({ say: 'Here are some tracks', reason: 'test', segue: 'warm' });
      }
      if (callbacks.onTrackReady) {
        callbacks.onTrackReady({ query: 'Song A - Artist A', intro: 'Intro A' });
        callbacks.onTrackReady({ query: 'Song B - Artist B', intro: 'Intro B' });
      }
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
    const text = await response.text();

    expect(text).toContain('event: dj_message');
    expect(text).toContain('event: track');
    expect(text).toContain('Song A');
    expect(text).toContain('Song B');
  });

  it('should handle LLM timeout gracefully', async () => {
    mockCallLLMStream.mockImplementation(async (systemPrompt, userMessage, history, callbacks) => {
      throw new Error('LLM timeout');
    });

    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    });

    const response = await POST(request);
    const text = await response.text();

    expect(text).toContain('event: error');
  });

  it('should skip failed track resolution', async () => {
    mockCallLLMStream.mockImplementation(async (systemPrompt, userMessage, history, callbacks) => {
      if (callbacks.onDJMessageReady) {
        callbacks.onDJMessageReady({ say: 'Here are some tracks', reason: 'test', segue: 'warm' });
      }
      if (callbacks.onTrackReady) {
        callbacks.onTrackReady({ query: 'Song A - Artist A', intro: 'Intro A' });
        callbacks.onTrackReady({ query: 'Song B - Artist B', intro: 'Intro B' });
      }
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
    const text = await response.text();

    expect(text).toContain('event: track');
    expect(text).toContain('event: track_error');
    expect(text).toContain('Song A');
  });
});
