import React from 'react';
import { useRouter } from 'next/navigation';
import DotMatrix from '../../../components/DotMatrix';
import type { Track } from '@/lib/types';
import s from './PlaybackOverlay.module.css';

interface PlaybackOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  player: any;
  djMessage: string;
  chatInput: string;
  setChatInput: (v: string) => void;
  handleChat: () => void;
  chatLoading: boolean;
  loading: boolean;
  handleGeneratePlaylist: () => void;
  transcriptRef: React.RefObject<HTMLDivElement>;
  time: Date;
  mounted: boolean;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function PlaybackOverlay({
  isOpen, onClose, player, djMessage, chatInput, setChatInput,
  handleChat, chatLoading, loading, handleGeneratePlaylist, transcriptRef,
  time, mounted
}: PlaybackOverlayProps) {
  const router = useRouter();
  
  const {
    currentTrack = null,
    isPlaying = false,
    currentTime = 0,
    duration = 0,
    playlist = [],
    currentIndex = -1,
    isTTSPlaying = false
  } = player.state || {};

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const dayName = time.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

  return (
    <div className={`${s.overlayWrapper} ${isOpen ? s.open : ''}`}>
      <button className={s.closeBtn} onClick={onClose}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
      </button>

      {/* Top Header Section (Dark) */}
      <div className={s.topSection}>
        <div className={s.brandHeader}>
          <DotMatrix text="ChaosRadio" size="sm" />
          <div className={`${s.onAirIndicator} text-mono`}>
            <span className={s.dot}></span>
            {isTTSPlaying ? 'SPEAKING' : (isPlaying ? 'ON AIR' : 'STANDBY')}
          </div>
        </div>
        <div className={s.clockContainer}>
          {mounted ? (
            <>
              <div className={s.clockTime}><DotMatrix text={`${hours}:${minutes}`} /></div>
              <div className={`${s.clockDate} text-mono`}>{dayName} · {dateStr}</div>
            </>
          ) : (
             <div style={{ height: '80px' }} />
          )}
        </div>
      </div>

      {/* Bottom Content Card */}
      <div className={s.bottomCard}>
        {/* Track Info */}
        <div className={s.trackHeader}>
          <div className={s.trackMeta}>
            <div className={s.trackTitle}>{currentTrack?.name || 'No Track Selected'}</div>
            <div className={`${s.trackArtist} text-mono`}>{currentTrack?.artist || 'Waiting for signal...'}</div>
          </div>
        </div>

        {/* Player Controls */}
        <div className={s.playerControls}>
          <button className={s.playBtn} onClick={() => player.togglePlay()}>
            {isPlaying ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          
          <div className={s.progressBarWrapper}>
            <div className={s.progressBar} onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              player.seek(pct * duration);
            }}>
              <div className={s.progressFill} style={{ width: (currentTime / (duration || 1) * 100) + '%' }}></div>
            </div>
            <div className={`${s.timeText} text-mono`}>{formatTime(currentTime)} / {formatTime(duration)}</div>
          </div>
        </div>

        {/* Transcript & Queue Nested Card */}
        <div className={s.transcriptCard}>
          <div className={`${s.transcriptHeader} text-mono`}>
            <span>DJ CHAOS</span>
            <span>{playlist.length} TRACKS</span>
          </div>
          
          <div className={s.transcriptContent} ref={transcriptRef}>
            {/* AI DJ Message */}
            <div className={s.djMessage}>
              <div className={s.avatar}>
                <img src="https://api.dicebear.com/7.x/bottts/svg?seed=chaos&backgroundColor=000000" alt="DJ" />
              </div>
              <div className={`${s.messageText} ${isTTSPlaying ? s.highlight : ''}`}>
                {djMessage}
                {chatLoading && <span>...</span>}
              </div>
            </div>

            {/* Upcoming/Current Queue */}
            <div className={s.queueList}>
              {playlist.length > 0 ? (
                playlist.map((track: Track, idx: number) => (
                  <div 
                    key={`${track.id}-${idx}`} 
                    className={`${s.queueItem} ${currentIndex === idx ? s.active : ''}`}
                    onClick={() => currentIndex === idx ? player.togglePlay() : player.setPlaylist(playlist, idx)}
                  >
                    <div className={`${s.qNum} text-mono`}>{idx + 1}</div>
                    <div className={s.qInfo}>
                      <div className={s.qTitle}>{track.name}</div>
                      <div className={`${s.qArtist} text-mono`}>{track.artist}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className={`${s.timeText} text-mono`} style={{ textAlign: 'center', marginTop: '20px' }}>
                  {loading ? 'GENERATING PLAYLIST...' : 'QUEUE EMPTY'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Bar Controls */}
        <div className={s.bottomBar}>
          <button className={s.iconBtn} onClick={handleGeneratePlaylist} disabled={loading} style={{ opacity: loading ? 0.5 : 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
          </button>
          
          <div className={s.chatInputWrapper}>
            <input 
              type="text" 
              className={`${s.chatInput} text-mono`} 
              placeholder="Say something to DJ..." 
              value={chatInput} 
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChat()} 
            />
          </div>
          
          <button className={s.iconBtn} onClick={() => router.push('/settings')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
          </button>
        </div>
        
      </div>
    </div>
  );
}
