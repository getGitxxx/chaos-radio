'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { usePlayHistory } from '../../hooks/usePlayHistory';
import { useLikedTracks } from '../../hooks/useLikedTracks';
import { useDislikedTracks } from '../../hooks/useDislikedTracks';
import { useTouchGestures } from '../../hooks/useTouchGestures';
import { useBehaviorSignals } from '../../hooks/useBehaviorSignals';
import type { Track, PlaylistPlan } from '../../lib/types';
import { FALLBACK_TRACKS } from '../../lib/types';
import DotMatrix from '../../components/DotMatrix';
import s from './player.module.css';

/**
 * Shared helper: fetch a playlist plan from /api/plan and apply to player.
 * Returns the plan data or throws on failure.
 */
async function fetchAndApplyPlaylist(
  body: Record<string, unknown>,
  playerMethods: Pick<ReturnType<typeof useAudioPlayer>, 'setPlaylist' | 'playTTS'>,
  playerRef: React.MutableRefObject<ReturnType<typeof useAudioPlayer> | null>,
  options: {
    signal?: AbortSignal;
    clearCache?: boolean;
    onDJMessage: (msg: string) => void;
    onChatMessage: (msg: { role: 'dj'; content: string }) => void;
    onAutoplayResult: (blocked: boolean) => void;
  }
): Promise<PlaylistPlan | null> {
  const t0 = Date.now();
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const json = await res.json();
  console.log(`[Fetch] /api/plan response: ${Date.now() - t0}ms`);
  if (!json.success || !json.data) {
    throw new Error(json.error || 'API failed');
  }

  const data: PlaylistPlan = json.data;

  if (options.clearCache) {
    playerRef.current?.setPlaylist(data.tracks, 0);
  } else {
    playerMethods.setPlaylist(data.tracks, 0);
  }

  options.onDJMessage(data.djMessage);
  options.onChatMessage({ role: 'dj', content: data.djMessage });

  const tTTS = Date.now();
  const ttsSuccess = await playerMethods.playTTS(
    `/api/tts?text=${encodeURIComponent(data.djMessage)}`
  );
  console.log(`[Fetch] playTTS: ${Date.now() - tTTS}ms (success: ${ttsSuccess})`);
  options.onAutoplayResult(!ttsSuccess);

  localStorage.setItem('chaos-radio-cache', JSON.stringify(data));
  return data;
}

export default function PlayerPage() {
  const router = useRouter();
  const playerRef = useRef<ReturnType<typeof useAudioPlayer> | null>(null);
  const playedIntrosRef = useRef(new Set<string | number>());

  // ---- Stable player method refs (avoids player in callback deps) ----
  const playerMethodsRef = useRef<Pick<ReturnType<typeof useAudioPlayer>, 'setPlaylist' | 'playTTS' | 'togglePlay' | 'nextTrack' | 'prevTrack' | 'addToPlaylist' | 'seek' | 'unlockAudio' | 'setVolume'> | null>(null);

  const handleTrackNearEnd = useCallback((curr: Track, next?: Track) => {
    if (next && next.djIntro && !playedIntrosRef.current.has(next.id)) {
      playedIntrosRef.current.add(next.id);
      const intro = next.djIntro;
      playerRef.current?.playTTS(`/api/tts?text=${encodeURIComponent(intro)}`);
      setDjMessage(intro);
      setChatMessages(prev => [...prev, { role: 'dj', content: intro }]);
    }
  }, []);

  const { addPlay, getRecentNames } = usePlayHistory();
  const { toggleLike, isLiked, getLikedIds, getLikedArray } = useLikedTracks();
  const { addDislike, getDislikedIds } = useDislikedTracks();
  const { recordSkip, recordPlay, getSkipSignals, getReplaySignals } = useBehaviorSignals();
  const transcriptRef = useRef<HTMLDivElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  // Pull-up chat state
  const [isChatExpanded, setIsChatExpanded] = useState(false);

  const handleInputFocus = () => {
    setIsChatExpanded(true);
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Only collapse if focus moves completely outside the chat section
    // We use a small timeout to allow "click" events to register first
    setTimeout(() => {
      const activeEl = document.activeElement;
      if (!activeEl || !chatSectionRef.current?.contains(activeEl)) {
        setIsChatExpanded(false);
      }
    }, 150);
  };

  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'idle' | 'selecting' | 'resolving' | 'ready'>('idle');
  const [djMessage, setDjMessage] = useState('Always here, spinning through the night. What\'s next on your mind?');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'dj'; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [time, setTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Queue Swipe State
  const [swipedTrackId, setSwipedTrackId] = useState<number | null>(null);
  const touchStartX = useRef<number>(0);

  const handleQueueItemTouchStart = (e: React.TouchEvent, trackId: number) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleQueueItemTouchEnd = (e: React.TouchEvent, track: Track) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartX.current;

    // Right swipe threshold (50px)
    if (diff > 50) {
      addDislike(track);
      player.nextTrack(); // Trigger skip to move on
      setDjMessage('这首歌不太对味，跳过...');
      
      // Visual feedback (remove from DOM)
      setSwipedTrackId(track.id);
      setTimeout(() => setSwipedTrackId(null), 500);
    }
  };

  const [djStyle, setDjStyle] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('chaos-radio-dj-style') || '深夜电台';
    return '深夜电台';
  });
  const [tasteOverride, setTasteOverride] = useState<string | undefined>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('chaos-radio-taste-override') || undefined;
    return undefined;
  });

  const preloadRef = useRef(false);

  const handlePlaylistNearEnd = useCallback(async (currentTrack: Track) => {
    if (preloadRef.current) return;
    preloadRef.current = true;

    console.log('[Player] Playlist near-end: preloading next batch...');
    try {
      const playTTSStable = (url: string) => playerRef.current?.playTTS(url);
      const addToPlaylistStable = (tracks: Track[]) => playerRef.current?.addToPlaylist(tracks);

      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recentPlays: getRecentNames(),
          likedPlays: getLikedIds(),
          dislikedPlays: getDislikedIds(),
          skipSignals: getSkipSignals(),
          replaySignals: getReplaySignals(),
          prompt: '继续推荐下一批歌曲，保持当前的音乐风格和情绪连贯。',
          djStyle,
          tasteOverride,
        })
      });
      const json = await res.json();
      if (!json.success || !json.data) {
        console.error('[Player] Preload failed:', json.error);
        setDjMessage('下一批歌曲没信号，让我再试试...');
        preloadRef.current = false;
        return;
      }

      const data: PlaylistPlan = json.data;
      addToPlaylistStable?.(data.tracks);
      setDjMessage(data.djMessage);
      setChatMessages(prev => [...prev, { role: 'dj', content: data.djMessage }]);
      playTTSStable?.(`/api/tts?text=${encodeURIComponent(data.djMessage)}`);
      localStorage.setItem('chaos-radio-cache', JSON.stringify(data));
      preloadRef.current = false;
    } catch (error) {
      console.error('[Player] Preload error:', error);
      setDjMessage('下一批歌曲信号中断，但我会继续播放...');
      preloadRef.current = false;
    }
  }, [getRecentNames, getLikedIds, getDislikedIds, djStyle, tasteOverride]);

  const player = useAudioPlayer({ onTrackNearEnd: handleTrackNearEnd, onPlaylistNearEnd: handlePlaylistNearEnd });
  playerRef.current = player;

  const { onTouchStart, onTouchEnd, gestureFeedback } = useTouchGestures({
    onDoubleTap: () => player.togglePlay(),
    onSwipeLeft: () => player.nextTrack(),
    onSwipeRight: () => player.prevTrack(),
  });

  // Populate stable refs once player is available
  useEffect(() => {
    if (player) {
      playerMethodsRef.current = {
        setPlaylist: player.setPlaylist,
        playTTS: player.playTTS,
        togglePlay: player.togglePlay,
        nextTrack: player.nextTrack,
        prevTrack: player.prevTrack,
        addToPlaylist: player.addToPlaylist,
        seek: player.seek,
        unlockAudio: player.unlockAudio,
        setVolume: player.setVolume,
      };
    }
  }, [player]);

  const { currentTrack, isPlaying, currentTime, duration, playlist: rawPlaylist, currentIndex, isTTSPlaying, lyrics, activeLyricIndex } = player.state || {};
  const playlist = Array.isArray(rawPlaylist) ? rawPlaylist : [];

  // Record play on track change, and skip on manual advance
  const lastTrackRef = useRef<number | null>(null);
  const trackLastChangedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (currentTrack?.id && currentTrack.id !== lastTrackRef.current) {
      // Record previous track as potential skip
      if (lastTrackRef.current && trackLastChangedAtRef.current) {
        const playedMs = Date.now() - trackLastChangedAtRef.current;
        if (playedMs < 30000 && playedMs > 1000) {
          recordSkip({ id: lastTrackRef.current, name: '', artist: '' }, Math.round(playedMs / 1000));
        }
      }
      // Record new track play
      recordPlay({ id: currentTrack.id, name: currentTrack.name, artist: currentTrack.artist });
      lastTrackRef.current = currentTrack.id;
      trackLastChangedAtRef.current = Date.now();
    }
  }, [currentTrack?.id, currentTrack?.name, recordPlay, recordSkip]);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard detection for iOS PWA
  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;

    const handleResize = () => {
      const isKb = window.innerHeight - vp.height > 150;
      setIsKeyboardVisible(isKb);
    };

    vp.addEventListener('resize', handleResize);
    handleResize();
    return () => vp.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      const p = playerMethodsRef.current;
      if (!p) return;
      switch (e.code) {
        case 'Space': e.preventDefault(); p.togglePlay(); break;
        case 'ArrowRight': e.preventDefault(); p.nextTrack(); break;
        case 'ArrowLeft': e.preventDefault(); p.prevTrack(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const initialWelcomeRef = useRef<string | null>(null);

  // ---- Generate playlist (used by both manual input and auto-init) ----
  const doGeneratePlaylist = useCallback(async (requirement: string) => {
    setUiHidden(true);
    setLoading(true);
    setLoadingStage('selecting');
    setDjMessage(requirement ? `正在为你挑选「${requirement}」相关的歌曲...` : 'DJ 正在选歌...');

    const stage1Timer = setTimeout(() => {
      setLoadingStage('resolving');
      setDjMessage('正在解析曲目，准备串场词...');
    }, 2000);

    try {
      const p = playerMethodsRef.current;
      if (!p) throw new Error('Player not ready');

      await fetchAndApplyPlaylist(
        {
          recentPlays: getRecentNames(),
          likedPlays: getLikedIds(),
          dislikedPlays: getDislikedIds(),
          skipSignals: getSkipSignals(),
          replaySignals: getReplaySignals(),
          prompt: requirement,
          djStyle,
          tasteOverride,
        },
        p,
        playerRef,
        {
          clearCache: true,
          onDJMessage: (msg) => { setDjMessage(msg); },
          onChatMessage: (msg) => {
            setChatMessages(prev => [...prev, msg]);
            playedIntrosRef.current.clear();
            preloadRef.current = false;
          },
          onAutoplayResult: (blocked) => {
            setAutoplayBlocked(blocked);
            if (blocked) setDjMessage('点击播放按钮开始收听 🎧');
          },
        }
      );

      clearTimeout(stage1Timer);
      if (requirement) setChatInput('');
    } catch (e) {
      clearTimeout(stage1Timer);
      setDjMessage('信号丢失，再试一次？');
    } finally {
      setLoading(false);
      setLoadingStage('idle');
    }
  }, [getRecentNames, getLikedIds, getDislikedIds, djStyle, tasteOverride]);

  const handleGeneratePlaylist = useCallback(async () => {
    player.unlockAudio();
    await doGeneratePlaylist(chatInput.trim());
  }, [chatInput, doGeneratePlaylist, player]);

  // ---- Initialize: load from cache or auto-generate ----
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    const tInit = Date.now();

    const loadPlan = async () => {
      setLoading(true);
      setLoadingStage('selecting');
      setDjMessage('DJ 正在选歌...');

      const stageTimer = setTimeout(() => {
        setLoadingStage('resolving');
        setDjMessage('正在解析曲目，准备串场词...');
      }, 2500);

      try {
        const cachedStr = localStorage.getItem('chaos-radio-cache');
        if (cachedStr) {
          console.log(`[Init] Loading from cache (${Date.now() - tInit}ms to start)`);
          const data: PlaylistPlan = JSON.parse(cachedStr);
          clearTimeout(stageTimer);
          setLoadingStage('ready');

          const p = playerMethodsRef.current;
          if (!p) throw new Error('Player not ready');

          player.setPlaylist(data.tracks, 0);
          setChatMessages([{ role: 'dj', content: data.djMessage }]);
          setDjMessage(data.djMessage);
          playedIntrosRef.current.clear();
          preloadRef.current = false;

          const ttsSuccess = await player.playTTS(`/api/tts?text=${encodeURIComponent(data.djMessage)}`);
          if (!ttsSuccess) {
            setAutoplayBlocked(true);
            setDjMessage('点击播放按钮开始收听 🎧');
          } else {
            setAutoplayBlocked(false);
          }
          console.log(`[Init] Cache path done (${Date.now() - tInit}ms total)`);
        } else {
          console.log(`[Init] No cache, optimistic fallback (${Date.now() - tInit}ms to start)`);
          const p = playerMethodsRef.current;
          if (!p) throw new Error('Player not ready');

          setLoading(false);
          setLoadingStage('idle');

          p.setPlaylist(FALLBACK_TRACKS, 0);
          setDjMessage('正在为您精选个性歌单...');
          setChatMessages([{ role: 'dj', content: '欢迎收听 ChaosRadio！正在为您生成专属推荐，先听点经典好歌吧。' }]);

          const controller = new AbortController();
          const initTimeout = setTimeout(() => controller.abort(), 12000);

          const tFetch = Date.now();
          try {
            await fetchAndApplyPlaylist(
              {
                recentPlays: getRecentNames(),
                likedPlays: getLikedIds(),
                dislikedPlays: getDislikedIds(),
                skipSignals: getSkipSignals(),
                replaySignals: getReplaySignals(),
                prompt: '',
                djStyle,
                tasteOverride,
              },
              p,
              playerRef,
              {
                signal: controller.signal,
                clearCache: true,
                onDJMessage: (msg) => { setDjMessage(msg); },
                onChatMessage: (msg) => {
                  setChatMessages(prev => [...prev, msg]);
                  playedIntrosRef.current.clear();
                  preloadRef.current = false;
                },
                onAutoplayResult: (blocked) => {
                  setAutoplayBlocked(blocked);
                  if (blocked) setDjMessage('点击播放按钮开始收听 🎧');
                },
              }
            );
            clearTimeout(initTimeout);
            console.log(`[Init] Background fetch done (${Date.now() - tInit}ms total)`);
          } catch (e) {
            clearTimeout(initTimeout);
            console.log('[Init] Background fetch failed, keeping fallback');
          }
        }
      } catch (e) {
        clearTimeout(stageTimer);
        setDjMessage('信号中断，点击生成按钮重试');
      } finally {
        setLoading(false);
        setLoadingStage('idle');
      }
    };
    loadPlan();
  }, [initialized, getRecentNames, getLikedIds, getDislikedIds, djStyle, tasteOverride]);

  // Dragging logic
  const progressBarRef = useRef<HTMLDivElement>(null);

  const handleDrag = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    setDragTime(pct * duration);
  }, [duration]);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => { handleDrag(e); };

    const onMouseUp = (e: MouseEvent) => {
      handleDrag(e);
      setIsDragging(false);

      if (progressBarRef.current && duration) {
        const rect = progressBarRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const pct = x / rect.width;
        const p = playerMethodsRef.current;
        p?.seek(pct * duration);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, handleDrag, duration]);

  const displayTime = isDragging ? dragTime : currentTime;
  const progressPct = (duration && duration > 0) ? ((displayTime || 0) / duration) * 100 : 0;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    player.unlockAudio();
    setUiHidden(true);
    const msg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: chatMessages,
          currentTrack: currentTrack ? `${currentTrack.name} - ${currentTrack.artist}` : 'None'
        })
      });
      const json = await res.json();
      if (json.success && json.data) {
        const reply = json.data.message || '...';
        setChatMessages(prev => [...prev, { role: 'dj', content: reply }]);
        setDjMessage(reply);

        if (json.data.tracks && json.data.tracks.length > 0) {
          player.addToPlaylist(json.data.tracks);
        }

        if (json.data.ttsUrl) {
          player.playTTS(json.data.ttsUrl);
        } else if (reply) {
          player.playTTS(`/api/tts?text=${encodeURIComponent(reply)}`);
        }
      } else {
        const errorMsg = json.error || 'Signal lost...';
        setChatMessages(prev => [...prev, { role: 'dj', content: errorMsg }]);
        setDjMessage(errorMsg);
      }
    } catch (e) { } finally { setChatLoading(false); }
  };

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const dayName = time.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

  function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  return (
    <div className={s.radioLayout}>
      <div className={`${s.phoneWrapper} ${isKeyboardVisible ? s.keyboardMode : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {!uiHidden && (
          <>
            {/* Top Header */}
            <div className={`${s.topHeader} ${s.z1}`}>
              <div style={{ '--px': '1.5px', '--pg': '1px', '--gap': '2px' } as React.CSSProperties}>
                <DotMatrix text="ChaosRadio" size="sm" />
              </div>
              <div className={s.rightControls}>
                <button className={s.iconBtn} onClick={() => router.push('/settings')} title="Settings" style={{ width: '32px', height: '32px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"></path>
                  </svg>
                </button>
              </div>
            </div>

            {/* Clock Section */}
            <div className={`${s.clockSection} ${s.z1}`}>
              {mounted ? (
                <>
                  <div className={s.clockTime} style={{ '--px': '5px', '--pg': '2px', '--gap': '8px' } as React.CSSProperties}>
                    <DotMatrix text={`${hours}:${minutes}`} />
                  </div>
                  <div className={`${s.clockDay} ${s.mono}`}>{dayName}</div>
                  <div className={`${s.clockDate} ${s.mono}`}>{time.getDate()} {time.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} {time.getFullYear()}</div>
                </>
              ) : <div style={{ height: '100px' }} />}
              <div className={`${s.onAirBadge} ${s.mono}`}>
                <span className={s.onAirDot}></span>
                {isTTSPlaying ? 'SPEAKING' : (isPlaying ? 'ON AIR' : 'STANDBY')}
              </div>
            </div>
          </>
        )}

        {/* Player Section */}
        <div className={`${s.playerSection} ${s.z1}`}>
            <div className={s.playerTopRow}>
            <div className={s.trackMetaLg}>
              <div className={s.trackHeaderWrap}>
                <div className={`${s.trackTitleLg} ${s.mono}`}>
                  {currentTrack ? `${currentTrack.name} - ${currentTrack.artist}` : 'No Signal'}
                </div>
                {currentTrack && (
                  <button 
                    className={`${s.likeBtnSm} ${isLiked(currentTrack.id) ? s.liked : ''}`} 
                    onClick={() => toggleLike(currentTrack)}
                    title={isLiked(currentTrack.id) ? '取消收藏' : '收藏这首'}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={isLiked(currentTrack.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                )}
              </div>
              
              <div className={s.lyricRow}>
                {activeLyricIndex !== -1 && lyrics && lyrics[activeLyricIndex] ? (
                  <div className={`${s.lyricText} ${s.mono} animate-fade-in`} key={activeLyricIndex}>
                    {lyrics[activeLyricIndex].text}
                    {lyrics[activeLyricIndex].translation && (
                      <div className={s.lyricTranslation}>{lyrics[activeLyricIndex].translation}</div>
                    )}
                  </div>
                ) : (
                  <div className={`${s.lyricPlaceholder} ${s.mono}`}>
                    {currentTrack ? '...' : ''}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={s.progressWrapLg}>
            <span>{formatTime(displayTime)}</span>
            <div
              className={s.progressBar}
              ref={progressBarRef}
              onMouseDown={(e) => { setIsDragging(true); handleDrag(e); }}
            >
              <div className={`${s.progressFill} ${isDragging ? s.dragging : ''}`} style={{ width: `${progressPct}%` }}></div>
            </div>
            <span>{formatTime(duration)}</span>
          </div>

          <div className={s.playerControlsRow}>
            <div className={s.sideControls}>
              <button className={`${s.hideBtn} ${s.mono}`} onClick={() => setUiHidden(!uiHidden)}>
                {uiHidden ? 'SHOW' : 'HIDE'}
              </button>
            </div>

            <div className={s.mainControlsCenter}>
              {/* Tier 1: Core Transport */}
              <div className={s.coreTransport}>
                <button className={s.ctrlBtnLg} onClick={() => player.prevTrack()}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                </button>
                <button className={s.playBtnLg} onClick={() => player.togglePlay()}>
                  {isPlaying ? (
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>
                <button className={s.ctrlBtnLg} onClick={() => player.nextTrack()}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                </button>
              </div>
            </div>

            <div className={s.sideControls}>
              <div className={s.volWrap}>
                VOL
                <input type="range" min="0" max="1" step="0.01" value={player.state?.volume ?? 1} onChange={(e) => player.setVolume(parseFloat(e.target.value))} className={s.volSlider} />
              </div>
            </div>
          </div>
        </div>

        {/* Queue Section */}
        <div className={`${s.queueSection} ${s.z1}`}>
          <div className={`${s.queueHeader} ${s.mono}`}>
            <span>QUEUE</span>
            <span>{playlist.length} TRACKS</span>
          </div>
            <div className={s.queueList}>
              {playlist.filter(t => t.id !== swipedTrackId).map((track: Track, idx: number) => {
                const isActive = currentIndex === idx;
                return (
                  <div key={track.id} className={`${s.qItem} ${isActive ? s.active : ''} ${s.mono}`} 
                       onClick={() => player.setPlaylist(playlist, idx, true)}
                       onTouchStart={(e) => handleQueueItemTouchStart(e, track.id)}
                       onTouchEnd={(e) => handleQueueItemTouchEnd(e, track)}>
                    <div className={s.qLeft}>
                      <div className={s.qNumWrap}>
                        {isActive ? (isPlaying ? (
                          <div className={s.miniVis}>
                            <div className={s.visBar} style={{ height: '8px', animationDelay: '0s' }}></div>
                            <div className={s.visBar} style={{ height: '12px', animationDelay: '0.2s' }}></div>
                            <div className={s.visBar} style={{ height: '6px', animationDelay: '0.4s' }}></div>
                          </div>
                        ) : (<div className={s.activePlayIcon}></div>)) : (<div className={s.qNum}>{idx + 1}</div>)}
                      </div>
                      <div className={s.qTitle}>{track.name}</div>
                    </div>
                    <div className={s.qArtist}>{track.artist}</div>
                  </div>
                );
              })}
            </div>
        </div>

        {gestureFeedback && (
          <div className={s.gestureToast}>{gestureFeedback}</div>
        )}

        {/* DJ Chat Section */}
        <div className={`${s.chatSection} ${s.z1} ${isKeyboardVisible ? s.keyboardMode : ''} ${isChatExpanded ? s.expanded : ''}`} ref={chatSectionRef}>
          <div className={`${s.chatHeader} ${s.mono}`}>
            <div className={s.chatBrand}><div className={s.brandDot}></div>ChaosRadio</div>
            <div className={s.visualizer}>
              <div className={s.visBar} style={{ background: 'rgba(0,255,102,0.5)', height: '8px' }}></div>
              <div className={s.visBar} style={{ background: 'rgba(0,255,102,0.8)', height: '12px' }}></div>
              <div className={s.visBar} style={{ background: 'rgba(0,255,102,0.5)', height: '6px' }}></div>
              <div className={s.visBar} style={{ background: 'rgba(0,255,102,0.8)', height: '10px' }}></div>
            </div>
          </div>

          <div className={s.chatHistory}>
            {chatMessages.length === 0 ? (
              <div className={s.chatMessage}>
                <div className={s.avatar} onClick={() => router.push('/profile')} title="View DJ Profile">
                  <img src="https://api.dicebear.com/7.x/bottts/svg?seed=chaos&backgroundColor=000000" alt="DJ" />
                </div>
                <div className={s.bubbleWrap}>
                  <div className={s.bubble}>
                    {djMessage}
                    {loading && loadingStage !== 'idle' && (
                      <div className={s.loadingStages}>
                        <span className={loadingStage === 'selecting' ? s.stageActive : s.stagePending}>选歌</span>
                        <span className={s.stageDivider}>→</span>
                        <span className={loadingStage === 'resolving' ? s.stageActive : s.stagePending}>解析</span>
                        <span className={s.stageDivider}>→</span>
                        <span className={loadingStage === 'ready' ? s.stageActive : s.stagePending}>播放</span>
                      </div>
                    )}
                    {autoplayBlocked && !loading && (
                      <button className={s.playPromptBtn} onClick={() => player.togglePlay()}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        点击开始播放
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`${s.chatMessage} ${msg.role === 'user' ? s.userMessage : ''}`}>
                    {msg.role === 'dj' && (
                      <div className={s.avatar} onClick={() => router.push('/profile')} title="View DJ Profile">
                        <img src="https://api.dicebear.com/7.x/bottts/svg?seed=chaos&backgroundColor=000000" alt="DJ" />
                      </div>
                    )}
                    <div className={s.bubbleWrap}>
                      <div className={s.bubble}>{msg.content}</div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
                {chatLoading && (
                  <div className={s.chatMessage}>
                    <div className={s.avatar} onClick={() => router.push('/profile')} title="View DJ Profile">
                      <img src="https://api.dicebear.com/7.x/bottts/svg?seed=chaos&backgroundColor=000000" alt="DJ" />
                    </div>
                    <div className={s.bubbleWrap}>
                      <div className={s.bubble}>...</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={s.inputArea}>
              <button className={s.actionBtn} onClick={() => { handleInputFocus(); handleGeneratePlaylist(); }} disabled={loading} title="Generate new playlist based on input">
                {loading ? (<div className={s.miniLoader}></div>) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.912 5.813L21 12l-7.088 3.187L12 21l-1.912-5.813L3 12l7.088-3.187z" />
                  </svg>
                )}
              </button>
              <input className={`${s.inputBox} ${s.mono}`} placeholder="Suggest a mood, theme, or genre..." value={chatInput}
                onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                onFocus={handleInputFocus} onBlur={handleInputBlur} />
            <button className={s.iconBtn} onClick={handleChat} disabled={chatLoading}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
