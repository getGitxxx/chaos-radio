'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'chaos-radio-behavior';

interface SkipSignal {
  trackId: number;
  name: string;
  artist: string;
  timestamp: number;
}

interface ReplaySignal {
  trackId: number;
  name: string;
  artist: string;
  count: number;
  lastPlayed: number;
}

interface BehaviorData {
  skips: SkipSignal[];
  replays: ReplaySignal[];
}

/**
 * Hook for tracking implicit behavior signals:
 * - Skip: track played < 30s before skipping
 * - Replay: same track played > 2 times in 24h window
 *
 * These signals feed into the LLM context as implicit taste indicators.
 */
export function useBehaviorSignals() {
  const [data, setData] = useState<BehaviorData>({ skips: [], replays: [] });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setData(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const persist = useCallback((newData: BehaviorData) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
      setData(newData);
    } catch { /* ignore */ }
  }, []);

  /**
   * Record a skip signal — track was played for less than threshold seconds.
   */
  const recordSkip = useCallback((track: { id: number; name: string; artist: string }, playedSeconds: number) => {
    if (playedSeconds >= 30) return; // Only count quick skips

    setData((prev) => {
      const newSkips = [
        { trackId: track.id, name: track.name, artist: track.artist, timestamp: Date.now() },
        ...prev.skips,
      ].slice(0, 100); // Keep last 100 skips

      const newData = { ...prev, skips: newSkips };
      persist(newData);
      return newData;
    });
  }, [persist]);

  /**
   * Record a replay signal — track is being played again within 24 hours.
   */
  const recordPlay = useCallback((track: { id: number; name: string; artist: string }) => {
    setData((prev) => {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      // Clean old replays
      const activeReplays = prev.replays.filter((r) => r.lastPlayed > oneDayAgo);

      // Find existing or create new
      const existing = activeReplays.find((r) => r.trackId === track.id);
      let newReplays: ReplaySignal[];

      if (existing) {
        newReplays = activeReplays.map((r) =>
          r.trackId === track.id
            ? { ...r, count: r.count + 1, lastPlayed: now }
            : r
        );
      } else {
        newReplays = [
          ...activeReplays,
          { trackId: track.id, name: track.name, artist: track.artist, count: 1, lastPlayed: now },
        ];
      }

      const newData = { ...prev, replays: newReplays };
      persist(newData);
      return newData;
    });
  }, [persist]);

  /**
   * Get replay signals where count >= 2 (user replayed at least twice in 24h).
   */
  const getReplaySignals = useCallback((): string[] => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    return data.replays
      .filter((r) => r.count >= 2 && r.lastPlayed > oneDayAgo)
      .map((r) => `${r.name} - ${r.artist}（${r.count}次）`);
  }, [data.replays]);

  /**
   * Get recent skip signals (last 7 days).
   */
  const getSkipSignals = useCallback((): string[] => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return data.skips
      .filter((s) => s.timestamp > sevenDaysAgo)
      .map((s) => `${s.name} - ${s.artist}`);
  }, [data.skips]);

  return { recordSkip, recordPlay, getSkipSignals, getReplaySignals };
}
