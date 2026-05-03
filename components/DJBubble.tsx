'use client';

interface DJBubbleProps {
  message: string;
  isSpeaking: boolean;
}

export default function DJBubble({ message, isSpeaking }: DJBubbleProps) {
  if (!message && !isSpeaking) return null;

  return (
    <div className="dj-bubble animate-fade-in-up">
      <div className="dj-avatar">🎙️</div>
      <div className="dj-content">
        <p className="dj-text">{message}</p>
        {isSpeaking && <span className="dj-speaking animate-pulse">播报中...</span>}
      </div>

      <style jsx>{`
        .dj-bubble {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin: var(--space-2) 0;
        }

        .dj-avatar {
          font-size: 20px;
          flex-shrink: 0;
        }

        .dj-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .dj-text {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          line-height: var(--leading-relaxed);
        }

        .dj-speaking {
          font-size: var(--text-xs);
          color: var(--color-primary-light);
          font-weight: var(--weight-medium);
        }
      `}</style>
    </div>
  );
}
