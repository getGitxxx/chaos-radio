'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'chaos-radio-liked';

interface LikedTrack {
  id: string | number;
  name: string;
  artist: string;
  likedAt: number;
}

export function useLikedTracks() {
  const [likedTracks, setLikedTracks] = useState<Record<string, LikedTrack>>({});

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setLikedTracks(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(likedTracks));
    } catch {
      // ignore
    }
  }, [likedTracks]);

  const toggleLike = useCallback((track: { id: string | number; name: string; artist: string }) => {
    setLikedTracks((prev) => {
      const key = String(track.id);
      if (prev[key]) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [key]: {
          id: track.id,
          name: track.name,
          artist: track.artist,
          likedAt: Date.now(),
        },
      };
    });
  }, []);

  const isLiked = useCallback(
    (trackId: string | number) => {
      return !!likedTracks[String(trackId)];
    },
    [likedTracks]
  );

  const getLikedIds = useCallback((): string[] => {
    return Object.keys(likedTracks);
  }, [likedTracks]);

  const getLikedArray = useCallback((): LikedTrack[] => {
    return Object.values(likedTracks).sort((a, b) => b.likedAt - a.likedAt);
  }, [likedTracks]);

  const clearLiked = useCallback(() => {
    setLikedTracks({});
  }, []);

  return { 
    likedTracks, 
    toggleLike, 
    isLiked, 
    getLikedIds, 
    getLikedArray,
    clearLiked 
  };
}
