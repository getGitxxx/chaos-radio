import { describe, it, expect, vi } from 'vitest';

describe('GET /api/health', () => {
  it('should return ok status with all required env vars configured', async () => {
    vi.resetModules();

    const origAccess = process.env.ACCESS_KEY;
    const origDeep = process.env.DEEPSEEK_API_KEY;
    const origTts = process.env.EDGE_TTS_URL;

    process.env.ACCESS_KEY = 'test-key';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.EDGE_TTS_URL = 'https://test-tts.example.com';

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const data = await response.json();

    expect(data.status).toBe('ok');
    expect(data.uptime).toBeGreaterThanOrEqual(0);
    expect(data.timestamp).toBeDefined();
    expect(data.version).toBeDefined();
    expect(data.env.missing).toHaveLength(0);

    // Restore
    process.env.ACCESS_KEY = origAccess;
    process.env.DEEPSEEK_API_KEY = origDeep;
    process.env.EDGE_TTS_URL = origTts;
  });

  it('should return degraded status when env vars are missing', async () => {
    vi.resetModules();

    const origAccess = process.env.ACCESS_KEY;
    const origDeep = process.env.DEEPSEEK_API_KEY;
    const origTts = process.env.EDGE_TTS_URL;
    delete process.env.ACCESS_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.EDGE_TTS_URL;

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const data = await response.json();

    expect(data.status).toBe('degraded');
    expect(data.env.missing).toContain('ACCESS_KEY');
    expect(data.env.missing).toContain('DEEPSEEK_API_KEY');
    expect(data.env.missing).toContain('EDGE_TTS_URL');

    // Restore
    process.env.ACCESS_KEY = origAccess;
    process.env.DEEPSEEK_API_KEY = origDeep;
    process.env.EDGE_TTS_URL = origTts;
  });
});
