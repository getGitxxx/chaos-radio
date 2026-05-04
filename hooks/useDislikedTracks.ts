'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'chaos-radio-disliked';

interface DislikedTrack {
  id: string | number;
  name: string;
  artist: string;
  dislikedAt: number;
}

export function useDislikedTracks() {
  const [dislikedTracks, setDislikedTracks] = useState<Record<string, DislikedTrack>>({});

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setDislikedTracks(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dislikedTracks));
    } catch {
      // ignore
    }
  }, [dislikedTracks]);

  const addDislike = useCallback((track: { id: string | number; name: string; artist: string }) => {
    setDislikedTracks((prev) => ({
      ...prev,
      [String(track.id)]: {
        id: track.id,
        name: track.name,
        artist: track.artist,
        dislikedAt: Date.now(),
      },
    }));
  }, []);

  const isDisliked = useCallback(
    (trackId: string | number) => {
      return !!dislikedTracks[String(trackId)];
    },
    [dislikedTracks]
  );

  const getDislikedIds = useCallback((): string[] => {
    return Object.keys(dislikedTracks);
  }, [dislikedTracks]);

  const getDislikedArray = useCallback((): DislikedTrack[] => {
    return Object.values(dislikedTracks).sort((a, b) => b.dislikedAt - a.dislikedAt);
  }, [dislikedTracks]);

  const clearDisliked = useCallback(() => {
    setDislikedTracks({});
  }, []);

  return { 
    dislikedTracks, 
    addDislike, 
    isDisliked, 
    getDislikedIds, 
    getDislikedArray,
    clearDisliked 
  };
}
