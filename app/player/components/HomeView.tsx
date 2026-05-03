import React from 'react';
import DotMatrix from '../../../components/DotMatrix';
import type { Track } from '@/lib/types';
import s from './HomeView.module.css';

interface HomeViewProps {
  player: any;
  onOpenPlayback: () => void;
  time: Date;
  mounted: boolean;
}

export default function HomeView({ player, onOpenPlayback, time, mounted }: HomeViewProps) {
  const {
    currentTrack = null,
    isPlaying = false,
    playlist = [],
    currentIndex = -1,
  } = player.state || {};

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');

  return (
    <div className={s.homeWrapper}>
      
      {/* Header with Huge Clock */}
      <div className={s.header}>
        <div className={`${s.greeting} text-mono`}>
          <span>SYS.CHAOS_RADIO.INIT</span>
          <div className={s.status}>
            <span className={s.dot}></span>
            ONLINE
          </div>
        </div>
        <div className={s.clockWrapper}>
          {mounted ? <DotMatrix text={`${hours}:${minutes}`} /> : <div style={{height: '32px'}}/>}
        </div>
      </div>

      {/* Queue List */}
      <div className={s.queueSection}>
        <div className={`${s.sectionTitle} text-mono`}>UPCOMING QUEUE</div>
        {playlist.length > 0 ? (
          playlist.map((track: Track, idx: number) => (
            <div 
              key={`${track.id}-${idx}`} 
              className={`${s.queueItem} ${currentIndex === idx ? s.active : ''}`}
              onClick={() => {
                if (currentIndex === idx) {
                  player.togglePlay();
                } else {
                  player.setPlaylist(playlist, idx);
                }
              }}
            >
              <div className={`${s.qNum} text-mono`} style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', width: '16px' }}>
                {idx + 1}
              </div>
              <div className={s.trackInfo}>
                <div className={s.trackName}>{track.name}</div>
                <div className={`${s.trackArtist} text-mono`}>{track.artist}</div>
              </div>
              {currentIndex === idx && isPlaying && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#00ff66"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
              )}
            </div>
          ))
        ) : (
          <div className="text-mono" style={{ color: 'rgba(255,255,255,0.4)', marginTop: '20px', fontSize: '12px' }}>
            AWAITING SIGNAL...
          </div>
        )}
      </div>

      {/* Mini Player */}
      {currentTrack && (
        <div className={s.miniPlayer} onClick={onOpenPlayback}>
          <div className={s.miniCover}>
            {currentTrack.cover ? (
              <img src={currentTrack.cover} alt="cover" />
            ) : (
              <div style={{width:'100%', height:'100%', background:'#333'}} />
            )}
          </div>
          <div className={s.miniInfo}>
            <div className={s.trackName} style={{fontSize: '13px'}}>{currentTrack.name}</div>
            <div className={`${s.trackArtist} text-mono`} style={{fontSize: '10px'}}>{currentTrack.artist}</div>
          </div>
          <button 
            className={s.miniPlayBtn} 
            onClick={(e) => {
              e.stopPropagation();
              player.togglePlay();
            }}
          >
            {isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
        </div>
      )}
      
    </div>
  );
}
