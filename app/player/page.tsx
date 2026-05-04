'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { usePlayHistory } from '../../hooks/usePlayHistory';
import { useLikedTracks } from '../../hooks/useLikedTracks';
import { useDislikedTracks } from '../../hooks/useDislikedTracks';
import { useTouchGestures } from '../../hooks/useTouchGestures';
import type { Track, PlaylistPlan } from '../../lib/types';
import DotMatrix from '../../components/DotMatrix';
import s from './player.module.css';

export default function PlayerPage() {
  const router = useRouter();
  const playerRef = useRef<any>(null);
  const playedIntrosRef = useRef(new Set<string | number>());

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
  const { addDislike, isDisliked, getDislikedIds } = useDislikedTracks();
  const transcriptRef = useRef<HTMLDivElement>(null);

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
  const preloadRef = useRef(false);

  // Load DJ style and taste override from localStorage on mount
  const [djStyle, setDjStyle] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chaos-radio-dj-style') || '深夜电台';
    }
    return '深夜电台';
  });
  const [tasteOverride, setTasteOverride] = useState<string | undefined>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chaos-radio-taste-override');
      return saved || undefined;
    }
    return undefined;
  });

  // Touch gestures: double tap = play/pause, swipe left = next, swipe right = prev
  const { onTouchStart, onTouchEnd, gestureFeedback } = useTouchGestures({
    onDoubleTap: () => player.togglePlay(),
    onSwipeLeft: () => player.nextTrack(),
    onSwipeRight: () => player.prevTrack(),
  });

  const handlePlaylistNearEnd = useCallback(async (currentTrack: Track) => {
    if (preloadRef.current) return;
    preloadRef.current = true;

    console.log('[Player] Playlist near-end: preloading next batch...');
    try {
      const recent = getRecentNames();
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recent,
          liked: getLikedIds(),
          disliked: getDislikedIds(),
          prompt: '继续推荐下一批歌曲，保持当前的音乐风格和情绪连贯。',
          djStyle,
          tasteOverride,
        })
      });
      const json = await res.json();
      if (!json.success || !json.data) {
        console.error('[Player] Preload failed:', json.error);
        setDjMessage('下一批歌曲没信号，让我再试试...');
        return;
      }

      const data: PlaylistPlan = json.data;
      playerRef.current?.addToPlaylist(data.tracks);
      setDjMessage(data.djMessage);
      setChatMessages(prev => [...prev, { role: 'dj', content: data.djMessage }]);
      playerRef.current?.playTTS(`/api/tts?text=${encodeURIComponent(data.djMessage)}`);
      localStorage.setItem('chaos-radio-cache', JSON.stringify(data));
    } catch (error) {
      console.error('[Player] Preload error:', error);
      setDjMessage('下一批歌曲信号中断，但我会继续播放...');
    }
  }, [getRecentNames, getLikedIds, getDislikedIds, djStyle, tasteOverride]);

  const player = useAudioPlayer({ onTrackNearEnd: handleTrackNearEnd, onPlaylistNearEnd: handlePlaylistNearEnd });
  playerRef.current = player;

  const { currentTrack, isPlaying, currentTime, duration, playlist: rawPlaylist, currentIndex, isTTSPlaying, lyrics, activeLyricIndex } = player.state || {};
  const playlist = Array.isArray(rawPlaylist) ? rawPlaylist : [];

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
      // If viewport height shrinks significantly, keyboard is likely visible
      const isKb = window.innerHeight - vp.height > 150;
      setIsKeyboardVisible(isKb);
    };

    vp.addEventListener('resize', handleResize);
    // Check initial state
    handleResize();
    return () => vp.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      switch (e.code) {
        case 'Space': e.preventDefault(); player.togglePlay(); break;
        case 'ArrowRight': e.preventDefault(); player.nextTrack(); break;
        case 'ArrowLeft': e.preventDefault(); player.prevTrack(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [player]);

  const initialWelcomeRef = useRef<string | null>(null);

  const handleGeneratePlaylist = useCallback(async () => {
    player.unlockAudio();
    const requirement = chatInput.trim();
    setUiHidden(true);
    setLoading(true);
    setLoadingStage('selecting');
    setDjMessage(requirement ? `正在为你挑选「${requirement}」相关的歌曲...` : 'DJ 正在选歌...');
    
    // Stage 1: Selecting songs (simulate progress)
    const stage1Timer = setTimeout(() => {
      setLoadingStage('resolving');
      setDjMessage('正在解析曲目，准备串场词...');
    }, 2000);

    try {
      const recent = getRecentNames();
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recent,
          liked: getLikedIds(),
          disliked: getDislikedIds(),
          prompt: requirement,
          djStyle,
          tasteOverride,
        })
      });
      const json = await res.json();
      if (!json.success || !json.data) throw new Error('API failed');
      const data: PlaylistPlan = json.data;

      clearTimeout(stage1Timer);
      setLoadingStage('ready');
      setDjMessage('即将开始播放...');

      playedIntrosRef.current.clear();
      preloadRef.current = false;
      player.setPlaylist(data.tracks, 0);
      setDjMessage(data.djMessage);
      setChatMessages(prev => [...prev, { role: 'dj', content: data.djMessage }]);
      
      // Try to play TTS, handle autoplay block
      const ttsSuccess = await player.playTTS(`/api/tts?text=${encodeURIComponent(data.djMessage)}`);
      if (!ttsSuccess) {
        setAutoplayBlocked(true);
        setDjMessage('点击播放按钮开始收听 🎧');
      } else {
        setAutoplayBlocked(false);
      }
      
      localStorage.setItem('chaos-radio-cache', JSON.stringify(data));
      if (requirement) setChatInput('');
    } catch (e) {
      clearTimeout(stage1Timer);
      setDjMessage('信号丢失，再试一次？');
    } finally {
      setLoading(false);
      setLoadingStage('idle');
    }
  }, [chatInput, getRecentNames, getLikedIds, getDislikedIds, player, djStyle, tasteOverride]);

  // Load from cache on mount - auto generate playlist
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    const loadPlan = async () => {
      setLoading(true);
      setLoadingStage('selecting');
      setDjMessage('DJ 正在选歌...');
      
      // Stage transition
      const stageTimer = setTimeout(() => {
        setLoadingStage('resolving');
        setDjMessage('正在解析曲目，准备串场词...');
      }, 2500);

      try {
        const cachedStr = localStorage.getItem('chaos-radio-cache');
        if (cachedStr) {
          const data: PlaylistPlan = JSON.parse(cachedStr);
          clearTimeout(stageTimer);
          setLoadingStage('ready');
          setDjMessage('即将开始播放...');
          
          setChatMessages([{ role: 'dj', content: data.djMessage }]);
          playedIntrosRef.current.clear();
          preloadRef.current = false;
          player.setPlaylist(data.tracks, 0);
          setDjMessage(data.djMessage);
          
          // Try to play, handle autoplay block
          const ttsSuccess = await player.playTTS(`/api/tts?text=${encodeURIComponent(data.djMessage)}`);
          if (!ttsSuccess) {
            setAutoplayBlocked(true);
            setDjMessage('点击播放按钮开始收听 🎧');
          } else {
            setAutoplayBlocked(false);
          }
        } else {
          // No cache - generate new playlist with stage transitions
          const recent = getRecentNames();
          const res = await fetch('/api/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recent,
              liked: getLikedIds(),
              disliked: getDislikedIds(),
              prompt: '',
              djStyle,
              tasteOverride,
            })
          });
          const json = await res.json();
          
          clearTimeout(stageTimer);
          
          if (json.success && json.data) {
            setLoadingStage('ready');
            setDjMessage('即将开始播放...');
            
            const data: PlaylistPlan = json.data;
            playedIntrosRef.current.clear();
            preloadRef.current = false;
            player.setPlaylist(data.tracks, 0);
            setDjMessage(data.djMessage);
            setChatMessages([{ role: 'dj', content: data.djMessage }]);
            
            // Try to play, handle autoplay block
            const ttsSuccess = await player.playTTS(`/api/tts?text=${encodeURIComponent(data.djMessage)}`);
            if (!ttsSuccess) {
              setAutoplayBlocked(true);
              setDjMessage('点击播放按钮开始收听 🎧');
            } else {
              setAutoplayBlocked(false);
            }
            
            localStorage.setItem('chaos-radio-cache', JSON.stringify(data));
          } else {
            setDjMessage('信号丢失，点击生成按钮重试');
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
  }, [initialized, player, getRecentNames, getLikedIds, getDislikedIds, djStyle, tasteOverride]);

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

    const onMouseMove = (e: MouseEvent) => {
      handleDrag(e);
    };

    const onMouseUp = (e: MouseEvent) => {
      handleDrag(e);
      setIsDragging(false);

      // Calculate final pct to seek
      if (progressBarRef.current && duration) {
        const rect = progressBarRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const pct = x / rect.width;
        player.seek(pct * duration);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, handleDrag, duration, player]);

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
              <div className={`${s.trackTitleLg} ${s.mono}`}>
                {currentTrack ? `${currentTrack.name} - ${currentTrack.artist}` : 'No Signal'}
              </div>
              {/* Like Button */}
              {currentTrack && (
                <button 
                  className={`${s.likeBtn} ${isLiked(currentTrack.id) ? s.liked : ''}`} 
                  onClick={() => toggleLike(currentTrack)}
                  title={isLiked(currentTrack.id) ? '取消收藏' : '收藏这首'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked(currentTrack.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
              )}
              {/* Lyrics Display */}
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
              onMouseDown={(e) => {
                setIsDragging(true);
                handleDrag(e);
              }}
            >
              <div
                className={`${s.progressFill} ${isDragging ? s.dragging : ''}`}
                style={{ width: `${progressPct}%` }}
              ></div>
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
              {/* Skip + Dislike buttons */}
              {currentTrack && (
                <div className={s.feedbackBtns}>
                  <button 
                    className={`${s.feedbackBtn} ${s.skipBtn}`} 
                    onClick={() => {
                      player.nextTrack();
                      setDjMessage('跳过这首，换个口味...');
                    }}
                    title="跳过这首"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button 
                    className={`${s.feedbackBtn} ${isDisliked(currentTrack.id) ? s.dislikedBtn : ''}`} 
                    onClick={() => {
                      addDislike(currentTrack);
                      player.nextTrack();
                      setDjMessage('这首不喜欢，换一首...');
                    }}
                    title="不喜欢，换一首"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={isDisliked(currentTrack.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M10 15v4h3v-4h4l-5-5-5 5h4zm9-1V8l-4.5 4.5L14 12l.5.5L15 13l-4 4-4-4 .5-.5L8 12l-.5-.5L7 7v6h4z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            <div className={s.sideControls}>
              <div className={s.volWrap}>
                VOL
                <input
                  type="range"
                  min="0" max="1" step="0.01"
                  value={player.state?.volume ?? 1}
                  onChange={(e) => player.setVolume(parseFloat(e.target.value))}
                  className={s.volSlider}
                />
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
            {playlist.map((track: Track, idx: number) => {
              const isActive = currentIndex === idx;
              return (
                <div key={idx} className={`${s.qItem} ${isActive ? s.active : ''} ${s.mono}`} onClick={() => player.setPlaylist(playlist, idx, true)}>
                  <div className={s.qLeft}>
                    <div className={s.qNumWrap}>
                      {isActive ? (
                        isPlaying ? (
                          <div className={s.miniVis}>
                            <div className={s.visBar} style={{ height: '8px', animationDelay: '0s' }}></div>
                            <div className={s.visBar} style={{ height: '12px', animationDelay: '0.2s' }}></div>
                            <div className={s.visBar} style={{ height: '6px', animationDelay: '0.4s' }}></div>
                          </div>
                        ) : (
                          <div className={s.activePlayIcon}></div>
                        )
                      ) : (
                        <div className={s.qNum}>{idx + 1}</div>
                      )}
                    </div>
                    <div className={s.qTitle}>{track.name}</div>
                  </div>
                  <div className={s.qArtist}>{track.artist}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gesture Feedback Toast */}
        {gestureFeedback && (
          <div className={s.gestureToast}>{gestureFeedback}</div>
        )}

        {/* DJ Chat Section */}
        <div className={`${s.chatSection} ${s.z1} ${isKeyboardVisible ? s.keyboardMode : ''}`} ref={transcriptRef}>
          <div className={`${s.chatHeader} ${s.mono}`}>
            <div className={s.chatBrand}>
              <div className={s.brandDot}></div>
              ChaosRadio
            </div>
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
                      <div className={s.bubble}>
                        {msg.content}
                      </div>
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
            <button
              className={s.actionBtn}
              onClick={handleGeneratePlaylist}
              disabled={loading}
              title="Generate new playlist based on input"
            >
              {loading ? (
                <div className={s.miniLoader}></div>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.912 5.813L21 12l-7.088 3.187L12 21l-1.912-5.813L3 12l7.088-3.187z" />
                </svg>
              )}
            </button>
            <input
              className={`${s.inputBox} ${s.mono}`}
              placeholder="Suggest a mood, theme, or genre..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChat()}
            />
            <button className={s.iconBtn} onClick={handleChat} disabled={chatLoading}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
