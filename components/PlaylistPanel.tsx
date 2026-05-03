'use client';

import type { Track } from '@/lib/types';

interface PlaylistPanelProps {
  playlist: Track[];
  currentIndex: number;
  isPlaying: boolean;
  onTrackSelect: (track: Track, index: number) => void;
}

export default function PlaylistPanel({
  playlist,
  currentIndex,
  isPlaying,
  onTrackSelect,
}: PlaylistPanelProps) {
  return (
    <div className="playlist-panel animate-fade-in">
      {playlist.length === 0 ? (
        <p className="empty-text text-tertiary">还没有歌单，点击「生成歌单」开始吧</p>
      ) : (
        playlist.map((track, i) => (
          <div
            key={`${track.id}-${i}`}
            className={`playlist-item ${i === currentIndex ? 'active' : ''}`}
            onClick={() => onTrackSelect(track, i)}
            onKeyDown={(e) => { if (e.key === 'Enter') onTrackSelect(track, i); }}
            role="button"
            tabIndex={0}
          >
            <div className="playlist-item-cover">
              {track.cover ? (
                <img src={track.cover} alt={track.name || 'Track cover'} width={44} height={44} />
              ) : (
                <div className="cover-mini-placeholder" />
              )}
              {i === currentIndex && isPlaying && (
                <div className="playing-indicator">
                  <span /><span /><span />
                </div>
              )}
            </div>
            <div className="playlist-item-info">
              <p className="playlist-item-name">{track.name}</p>
              <p className="playlist-item-artist text-secondary">{track.artist}</p>
            </div>
          </div>
        ))
      )}

      <style jsx>{`
        .playlist-panel {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          margin-top: var(--space-2);
        }

        .playlist-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background var(--transition-fast);
        }

        .playlist-item:hover {
          background: var(--color-bg-hover);
        }

        .playlist-item.active {
          background: var(--color-primary-subtle);
        }

        .playlist-item-cover {
          width: 44px;
          height: 44px;
          border-radius: var(--radius-sm);
          overflow: hidden;
          flex-shrink: 0;
          position: relative;
        }

        .playlist-item-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .cover-mini-placeholder {
          width: 100%;
          height: 100%;
          background: var(--color-bg-active);
        }

        .playing-indicator {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2px;
        }

        .playing-indicator span {
          display: block;
          width: 3px;
          height: 12px;
          background: var(--color-primary-light);
          border-radius: 1px;
          animation: equalizer 0.8s ease-in-out infinite alternate;
        }

        .playing-indicator span:nth-child(2) { animation-delay: 0.2s; height: 18px; }
        .playing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes equalizer {
          from { height: 4px; }
          to { height: 16px; }
        }

        .playlist-item-name {
          font-size: var(--text-sm);
          font-weight: var(--weight-medium);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .playlist-item-artist {
          font-size: var(--text-xs);
        }

        .empty-text {
          text-align: center;
          padding: var(--space-8) 0;
          font-size: var(--text-sm);
        }
      `}</style>
    </div>
  );
}
