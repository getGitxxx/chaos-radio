'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Track } from '../lib/types';
import { parseLrc, findActiveLyricIndex, LyricLine } from '../lib/lyric-utils';

export interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  currentTrack: Track | null;
  currentIndex: number;
  playlist: Track[];
  isTTSPlaying: boolean;
  lyrics: LyricLine[];
  activeLyricIndex: number;
}

export interface AudioPlayerOptions {
  onTrackNearEnd?: (currentTrack: Track, nextTrack?: Track) => void;
  /** Fires when the last track of the playlist reaches the given remaining seconds (default: 30). */
  onPlaylistNearEnd?: (currentTrack: Track) => void;
}

export function useAudioPlayer(options?: AudioPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const userVolumeRef = useRef<number>(1);

  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    currentTrack: null,
    currentIndex: -1,
    playlist: [],
    isTTSPlaying: false,
    lyrics: [],
    activeLyricIndex: -1,
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const onTrackNearEndRef = useRef(options?.onTrackNearEnd);
  useEffect(() => {
    onTrackNearEndRef.current = options?.onTrackNearEnd;
  }, [options?.onTrackNearEnd]);

  const onPlaylistNearEndRef = useRef(options?.onPlaylistNearEnd);
  useEffect(() => {
    onPlaylistNearEndRef.current = options?.onPlaylistNearEnd;
  }, [options?.onPlaylistNearEnd]);

  const nearEndTriggeredRef = useRef<boolean>(false);
  const playlistNearEndTriggeredRef = useRef<number | null>(null); // last track id that triggered
  const nextTrackRef = useRef<(() => void) | null>(null);

  // Initialize audio elements
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const audio = new Audio();
    audio.preload = 'auto';

    // Load saved volume
    const savedVol = localStorage.getItem('chaos-radio-vol');
    if (savedVol) {
      const vol = parseFloat(savedVol);
      if (!isNaN(vol)) {
        audio.volume = vol;
        userVolumeRef.current = vol;
        setState((prev) => ({ ...prev, volume: vol }));
      }
    }

    audioRef.current = audio;

    const ttsAudio = new Audio();
    ttsAudioRef.current = ttsAudio;

    // Main audio event handlers (named for cleanup)
    const handleTimeUpdate = () => {
      const currentTime = audio.currentTime;
      const duration = audio.duration || 0;
      setState((prev) => ({
        ...prev,
        currentTime,
        duration,
        activeLyricIndex: findActiveLyricIndex(prev.lyrics, currentTime),
      }));

      // Track near-end (15s remaining) — for DJ intro
      if (duration > 0 && duration - currentTime <= 15 && !nearEndTriggeredRef.current) {
        nearEndTriggeredRef.current = true;
        const currentS = stateRef.current;
        if (onTrackNearEndRef.current && currentS.currentTrack) {
          const nextTrack = currentS.playlist[currentS.currentIndex + 1];
          onTrackNearEndRef.current(currentS.currentTrack, nextTrack);
        }
      }

      // Playlist near-end (30s remaining on last track) — for auto-preload
      const currentS2 = stateRef.current;
      const isLastTrack = currentS2.currentIndex === currentS2.playlist.length - 1 && currentS2.currentIndex >= 0;
      if (duration > 0 && isLastTrack && duration - currentTime <= 30) {
        const trackId = currentS2.currentTrack?.id;
        if (trackId !== undefined && playlistNearEndTriggeredRef.current !== trackId) {
          playlistNearEndTriggeredRef.current = trackId;
          if (onPlaylistNearEndRef.current && currentS2.currentTrack) {
            onPlaylistNearEndRef.current(currentS2.currentTrack);
          }
        }
      }
    };

    const handleEnded = () => {
      setState((prev) => ({ ...prev, isPlaying: false }));
      if (nextTrackRef.current) {
        nextTrackRef.current();
      }
    };

    const handlePlay = () => {
      setState((prev) => ({ ...prev, isPlaying: true }));
    };

    const handlePause = () => {
      setState((prev) => ({ ...prev, isPlaying: false }));
    };

    const handleTTSEnded = () => {
      setState((prev) => ({ ...prev, isTTSPlaying: false }));
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    ttsAudio.addEventListener('ended', handleTTSEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      ttsAudio.removeEventListener('ended', handleTTSEnded);
      audio.pause();
      audio.src = '';
      ttsAudio.pause();
      ttsAudio.src = '';
    };
  }, []);

  const play = useCallback(() => {
    const playPromise = audioRef.current?.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => console.warn('Play interrupted:', e.message));
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    if (audioRef.current?.paused) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => console.warn('Play interrupted:', e.message));
      }
    } else {
      audioRef.current?.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    if (audioRef.current && isFinite(vol)) {
      audioRef.current.volume = vol;
      userVolumeRef.current = vol;
      setState((prev) => ({ ...prev, volume: vol }));
      if (typeof window !== 'undefined') {
        localStorage.setItem('chaos-radio-vol', vol.toString());
      }
    }
  }, []);

  const loadTrack = useCallback((track: Track, autoPlay = false) => {
    if (!audioRef.current || !track.url) return;

    nearEndTriggeredRef.current = false;
    audioRef.current.src = track.url;
    setState((prev) => ({
      ...prev,
      currentTrack: track,
      currentTime: 0,
      duration: 0,
      lyrics: track.lyric ? parseLrc(track.lyric, track.tlyric) : [],
      activeLyricIndex: -1,
    }));

    if (autoPlay) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => console.warn('Auto-play interrupted:', e.message));
      }
    }
  }, []);

  const setPlaylist = useCallback((tracks: Track[], startIndex = 0, autoPlay = false) => {
    setState((prev) => ({
      ...prev,
      playlist: tracks,
      currentIndex: startIndex,
    }));

    if (tracks[startIndex]) {
      loadTrack(tracks[startIndex], autoPlay);
    }
  }, [loadTrack]);

  const nextTrack = useCallback(() => {
    setState((prev) => {
      const nextIdx = prev.currentIndex + 1;
      if (nextIdx < prev.playlist.length) {
        const track = prev.playlist[nextIdx];
        loadTrack(track, true);
        return { ...prev, currentIndex: nextIdx };
      }
      return prev;
    });
  }, [loadTrack]);

  useEffect(() => {
    nextTrackRef.current = nextTrack;
  }, [nextTrack]);

  const prevTrack = useCallback(() => {
    setState((prev) => {
      const prevIdx = prev.currentIndex - 1;
      if (prevIdx >= 0) {
        const track = prev.playlist[prevIdx];
        loadTrack(track, true);
        return { ...prev, currentIndex: prevIdx };
      }
      return prev;
    });
  }, [loadTrack]);

  const fadeVolume = useCallback((audio: HTMLAudioElement, targetVolume: number, durationMs: number = 1000) => {
    return new Promise<void>((resolve) => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

      const startVolume = audio.volume;
      const steps = 20;
      const stepTime = durationMs / steps;
      const volumeStep = (targetVolume - startVolume) / steps;
      let currentStep = 0;

      fadeIntervalRef.current = setInterval(() => {
        currentStep++;
        let nextVol = startVolume + (volumeStep * currentStep);
        nextVol = Math.max(0, Math.min(1, nextVol));
        audio.volume = nextVol;

        if (currentStep >= steps) {
          if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
          audio.volume = targetVolume;
          resolve();
        }
      }, stepTime);
    });
  }, []);

  const playTTS = useCallback(async (url: string): Promise<boolean> => {
    if (!ttsAudioRef.current) return false;

    const mainAudio = audioRef.current;
    const originalVol = userVolumeRef.current;
    const duckingVol = originalVol * 0.15; // Duck to 15% of user's set volume

    if (mainAudio) {
      if (!mainAudio.paused) {
        // Fade down if playing
        fadeVolume(mainAudio, duckingVol, 800);
      } else if (mainAudio.src) {
        // If it's paused (e.g. just loaded new track), start playing at low volume after 1.5s!
        setTimeout(() => {
          if (!mainAudio.src || !ttsAudioRef.current || ttsAudioRef.current.paused && ttsAudioRef.current.currentTime === 0) return;
          mainAudio.volume = duckingVol;
          const playPromise = mainAudio.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => console.warn('Music auto-play interrupted:', e.message));
          }
        }, 1500);
      }
    }

    setState((prev) => ({ ...prev, isTTSPlaying: true }));
    ttsAudioRef.current.src = url;

    return new Promise((resolve) => {
      if (!ttsAudioRef.current) { resolve(false); return; }

      const onEnd = () => {
        setState((prev) => ({ ...prev, isTTSPlaying: false }));
        ttsAudioRef.current?.removeEventListener('ended', onEnd);
        ttsAudioRef.current?.removeEventListener('error', onEnd);

        // Fade main audio back up
        if (mainAudio) {
          fadeVolume(mainAudio, originalVol, 1500);
        }
        resolve(true);
      };

      ttsAudioRef.current.addEventListener('ended', onEnd);
      ttsAudioRef.current.addEventListener('error', onEnd);

      const playPromise = ttsAudioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          console.warn('TTS play interrupted:', e.message);
          // If autoplay is blocked, return false
          if (e.name === 'NotAllowedError') {
            setState((prev) => ({ ...prev, isTTSPlaying: false }));
            ttsAudioRef.current?.removeEventListener('ended', onEnd);
            ttsAudioRef.current?.removeEventListener('error', onEnd);
            resolve(false); // Signal autoplay blocked
          } else {
            onEnd();
          }
        });
      }
    });
  }, [fadeVolume]);

  const addToPlaylist = useCallback((tracks: Track[]) => {
    setState((prev) => ({
      ...prev,
      playlist: [...prev.playlist, ...tracks],
    }));
  }, []);

  // Lazy load lyrics if missing
  useEffect(() => {
    const track = state.currentTrack;
    if (!track || (track.lyric && track.lyric.length > 0)) return;

    let isMounted = true;
    const fetchLyrics = async () => {
      try {
        const res = await fetch(`/api/lyrics?id=${track.id}`);
        const json = await res.json();
        if (json.success && json.data && isMounted) {
          const { lyric, tlyric } = json.data;
          setState((prev) => {
            if (prev.currentTrack?.id !== track.id) return prev;
            return {
              ...prev,
              lyrics: parseLrc(lyric, tlyric),
              currentTrack: { ...prev.currentTrack, lyric, tlyric },
            };
          });
        }
      } catch (e) {
        console.error('[AudioPlayer] Failed to lazy-load lyrics:', e);
      }
    };

    fetchLyrics();
    return () => { isMounted = false; };
  }, [state.currentTrack?.id]);

  // MediaSession API setup
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
      navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
    }
  }, [play, pause, prevTrack, nextTrack]);

  // MediaSession Metadata sync
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && state.currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: state.currentTrack.name,
        artist: state.currentTrack.artist,
        album: 'ChaosRadio',
        artwork: [
          { src: state.currentTrack.cover || '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: state.currentTrack.cover || '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
    }
  }, [state.currentTrack]);

  const unlockAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().then(() => audioRef.current?.pause()).catch(() => { });
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.play().then(() => ttsAudioRef.current?.pause()).catch(() => { });
    }
  }, []);

  return {
    state,
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    loadTrack,
    setPlaylist,
    nextTrack,
    prevTrack,
    playTTS,
    addToPlaylist,
    unlockAudio,
  };
}
