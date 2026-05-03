'use client';

interface LyricDisplayProps {
  lyrics: { time: number; text: string }[];
  currentIndex: number;
}

export default function LyricDisplay({ lyrics, currentIndex }: LyricDisplayProps) {
  if (lyrics.length === 0) return null;

  // Show only 7 lines for better focus
  const visibleLyrics = lyrics.slice(
    Math.max(0, currentIndex - 2),
    currentIndex + 5
  );

  return (
    <div className="lyrics-section">
      {visibleLyrics.map((line, i) => {
        const actualIndex = Math.max(0, currentIndex - 2) + i;
        return (
          <p
            key={`${line.time}-${i}`}
            className={`lyric-line ${actualIndex === currentIndex ? 'active' : ''}`}
          >
            {line.text}
          </p>
        );
      })}

      <style jsx>{`
        .lyrics-section {
          text-align: center;
          min-height: 140px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: var(--space-4) 0;
        }

        .lyric-line {
          font-size: var(--text-sm);
          color: var(--color-text-tertiary);
          transition: all var(--transition-base);
          line-height: var(--leading-relaxed);
        }

        .lyric-line.active {
          font-size: var(--text-base);
          color: var(--color-text-primary);
          font-weight: var(--weight-medium);
          transform: scale(1.05);
        }
      `}</style>
    </div>
  );
}
