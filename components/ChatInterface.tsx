'use client';

interface ChatInterfaceProps {
  messages: { role: 'user' | 'dj'; content: string }[];
  loading: boolean;
  inputValue: string;
  onInputChange: (val: string) => void;
  onSend: () => void;
}

export default function ChatInterface({
  messages,
  loading,
  inputValue,
  onInputChange,
  onSend,
}: ChatInterfaceProps) {
  return (
    <div className="chat-panel animate-fade-in">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="empty-text text-tertiary">和 DJ Chaos 聊聊吧...</p>
        )}
        {messages.map((msg, i) => (
          <div key={`${msg.role}-${i}-${msg.content.slice(0, 20)}`} className={`chat-msg ${msg.role}`}>
            {msg.role === 'dj' && <span className="chat-avatar">🎙️</span>}
            <div className="chat-bubble">
              <p>{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg dj">
            <span className="chat-avatar">🎙️</span>
            <div className="chat-bubble"><p className="animate-pulse">思考中...</p></div>
          </div>
        )}
      </div>
      <div className="chat-input-row">
        <input
          className="input chat-input"
          placeholder="对 DJ 说点什么..."
          aria-label="Chat message"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSend(); }}
        />
        <button
          className="btn btn-primary chat-send"
          onClick={onSend}
          disabled={loading || !inputValue.trim()}
        >
          发送
        </button>
      </div>

      <style jsx>{`
        .chat-panel {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .chat-messages {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          max-height: 280px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .chat-msg {
          display: flex;
          gap: var(--space-2);
          align-items: flex-start;
        }

        .chat-msg.user {
          justify-content: flex-end;
        }

        .chat-avatar {
          font-size: 16px;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .chat-bubble {
          max-width: 85%;
          padding: var(--space-3) var(--space-4);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          line-height: var(--leading-relaxed);
        }

        .chat-msg.dj .chat-bubble {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
        }

        .chat-msg.user .chat-bubble {
          background: var(--color-primary-dark);
          color: white;
        }

        .chat-input-row {
          display: flex;
          gap: var(--space-2);
        }

        .chat-input {
          flex: 1;
          font-size: var(--text-sm);
          padding: var(--space-3);
        }

        .chat-send {
          padding: var(--space-3) var(--space-5);
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
