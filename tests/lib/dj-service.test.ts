import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DJService } from '@/lib/services/dj-service';

// Mock all dependencies
vi.mock('@/lib/context', () => ({
  buildContext: vi.fn().mockResolvedValue('mock context'),
}));

vi.mock('@/lib/llm', () => ({
  callLLM: vi.fn(),
}));

vi.mock('@/lib/ncm', () => ({
  resolveTrack: vi.fn(),
  resolveTracks: vi.fn(),
}));

vi.mock('@/lib/tts', () => ({
  synthesizeSpeech: vi.fn().mockResolvedValue('/api/tts?text=hello'),
}));

const { buildContext } = await import('@/lib/context');
const { callLLM } = await import('@/lib/llm');
const { resolveTrack, resolveTracks } = await import('@/lib/ncm');
const { synthesizeSpeech } = await import('@/lib/tts');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildContext).mockResolvedValue('mock context');
  vi.mocked(synthesizeSpeech).mockResolvedValue('/api/tts?text=hello');
});

describe('DJService', () => {
  describe('generatePlaylist', () => {
    it('should generate playlist with tracks, tts, and djMessage', async () => {
      vi.mocked(callLLM).mockResolvedValue({
        say: 'Welcome to the show',
        play: [{ query: 'Song A - Artist A', intro: 'Intro A' }],
        reason: 'test',
        segue: 'warm',
      });
      vi.mocked(resolveTrack).mockResolvedValue({
        id: 1, name: 'Song A', artist: 'Artist A', url: 'http://a.mp3', duration: 240000,
      });

      const service = new DJService();
      const result = await service.generatePlaylist({ prompt: 'chill', count: 1 });

      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0].name).toBe('Song A');
      expect(result.tracks[0].djIntro).toBe('Intro A');
      expect(result.djMessage).toBe('Welcome to the show');
      expect(result.ttsUrl).toBe('/api/tts?text=hello');
      expect(result.segue).toBe('warm');
    });

    it('should handle empty play list from LLM', async () => {
      vi.mocked(callLLM).mockResolvedValue({
        say: 'No tracks today',
        play: [],
        reason: 'none',
        segue: 'warm',
      });

      const service = new DJService();
      const result = await service.generatePlaylist({ count: 3 });

      expect(result.tracks).toHaveLength(0);
      expect(result.djMessage).toBe('No tracks today');
    });

    it('should skip failed track resolution', async () => {
      vi.mocked(callLLM).mockResolvedValue({
        say: 'Here are tracks',
        play: [{ query: 'Good Track', intro: 'Good' }, { query: 'Bad Track', intro: 'Bad' }],
        reason: 'test',
        segue: 'warm',
      });
      vi.mocked(resolveTrack)
        .mockResolvedValueOnce({ id: 1, name: 'Good Track', artist: 'A', url: 'http://a.mp3', duration: 240000 })
        .mockResolvedValueOnce(null);

      const service = new DJService();
      const result = await service.generatePlaylist({ count: 2 });

      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0].name).toBe('Good Track');
    });
  });

  describe('chatWithDJ', () => {
    it('should return chat result with tracks if LLM recommends any', async () => {
      vi.mocked(callLLM).mockResolvedValue({
        say: 'Great choice!',
        play: [{ query: 'Song B - Artist B', intro: 'Intro B' }],
        reason: 'test',
        segue: 'energetic',
      });
      vi.mocked(resolveTracks).mockResolvedValue([
        { id: 2, name: 'Song B', artist: 'Artist B', url: 'http://b.mp3', duration: 240000 },
      ]);

      const service = new DJService();
      const result = await service.chatWithDJ({
        message: 'Play something upbeat',
        history: [],
      });

      expect(result.message).toBe('Great choice!');
      expect(result.tracks).toHaveLength(1);
      expect(result.segue).toBe('energetic');
    });

    it('should not call resolveTracks when no tracks recommended', async () => {
      vi.mocked(callLLM).mockResolvedValue({
        say: 'Just talking',
        play: [],
        reason: 'none',
        segue: 'warm',
      });

      const service = new DJService();
      const result = await service.chatWithDJ({
        message: 'How are you?',
        history: [],
      });

      expect(resolveTracks).not.toHaveBeenCalled();
      expect(result.tracks).toHaveLength(0);
      expect(result.message).toBe('Just talking');
    });
  });

  describe('getNextTrack', () => {
    it('should return single track with djMessage', async () => {
      vi.mocked(callLLM).mockResolvedValue({
        say: 'Here is the next one',
        play: [{ query: 'Next Song - Next Artist', intro: 'Next intro' }],
        reason: 'test',
        segue: 'chill',
      });
      vi.mocked(resolveTrack).mockResolvedValue({
        id: 3, name: 'Next Song', artist: 'Next Artist', url: 'http://c.mp3', duration: 240000,
      });

      const service = new DJService();
      const result = await service.getNextTrack({});

      expect(result.track).not.toBeNull();
      expect(result.track?.name).toBe('Next Song');
      expect(result.djMessage).toBe('Here is the next one');
    });

    it('should handle empty LLM play list', async () => {
      vi.mocked(callLLM).mockResolvedValue({
        say: 'No song right now',
        play: [],
        reason: 'none',
        segue: 'warm',
      });

      const service = new DJService();
      const result = await service.getNextTrack({ currentTrack: 'Current Song' });

      expect(result.track).toBeNull();
      expect(result.djMessage).toBe('No song right now');
    });
  });

  describe('generateIntro', () => {
    it('should generate intro for a specific track', async () => {
      vi.mocked(callLLM).mockResolvedValue({
        say: 'Coming up next...',
        play: [],
        reason: 'test',
        segue: 'warm',
      });

      const service = new DJService();
      const result = await service.generateIntro({
        trackName: 'Bohemian Rhapsody',
        trackArtist: 'Queen',
      });

      expect(result.djMessage).toBe('Coming up next...');
      expect(callLLM).toHaveBeenCalledWith(
        'mock context',
        expect.stringContaining('Queen'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should handle missing trackArtist', async () => {
      vi.mocked(callLLM).mockResolvedValue({
        say: 'Here comes a song',
        play: [],
        reason: 'none',
        segue: 'warm',
      });

      const service = new DJService();
      const result = await service.generateIntro({
        trackName: 'Unknown Song',
      });

      expect(callLLM).toHaveBeenCalledWith(
        'mock context',
        expect.stringContaining('Unknown Song'),
        expect.anything(),
        expect.anything(),
      );
      expect(result.djMessage).toBe('Here comes a song');
    });
  });
});
