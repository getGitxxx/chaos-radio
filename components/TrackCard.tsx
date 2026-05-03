'use client';

import type { Track } from '@/lib/types';

interface TrackCardProps {
  track: Track | null;
  isPlaying: boolean;
}

export default function TrackCard({ track, isPlaying }: TrackCardProps) {
  return (
    <div className="track-card">
      <div className="cover-section">
        <div className={`cover-container ${isPlaying ? 'spinning' : ''}`}>
          {track?.cover ? (
            <img src={track.cover} alt={track.name} className="cover-image" />
          ) : (
            <div className="cover-placeholder">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
          )}
        </div>
      </div>

      <div className="track-info">
        <h1 className="track-name text-display">
          {track?.name || 'ChaosRadio'}
        </h1>
        <p className="track-artist text-secondary">
          {track?.artist || '准备好你的耳朵了吗？'}
        </p>
      </div>

      <style jsx>{`
        .track-card {
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
          text-align: center;
        }

        .cover-section {
          display: flex;
          justify-content: center;
          padding: var(--space-4) 0;
        }

        .cover-container {
          width: 260px;
          height: 260px;
          border-radius: var(--radius-xl);
          overflow: hidden;
          box-shadow: var(--shadow-lg), var(--shadow-glow);
          transition: transform 20s linear;
        }

        .cover-container.spinning {
          animation: spin 20s linear infinite;
          border-radius: 50%;
        }

        .cover-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .cover-placeholder {
          width: 100%;
          height: 100%;
          background: var(--color-bg-card);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .track-name {
          font-size: var(--text-xl);
          margin-bottom: var(--space-1);
        }

        .track-artist {
          font-size: var(--text-sm);
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
