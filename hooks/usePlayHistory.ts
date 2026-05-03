'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'chaos-radio-history';
const MAX_HISTORY = 50;

interface PlayRecord {
  name: string;
  artist: string;
  playedAt: number;
}

export function usePlayHistory() {
  const [history, setHistory] = useState<PlayRecord[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // ignore
    }
  }, [history]);

  const addPlay = useCallback((name: string, artist: string) => {
    setHistory((prev) => {
      const record: PlayRecord = { name, artist, playedAt: Date.now() };
      const updated = [record, ...prev].slice(0, MAX_HISTORY);
      return updated;
    });
  }, []);

  const getRecentNames = useCallback(
    (count = 10): string[] =>
      history.slice(0, count).map((r) => `${r.name} - ${r.artist}`),
    [history]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return { history, addPlay, getRecentNames, clearHistory };
}
