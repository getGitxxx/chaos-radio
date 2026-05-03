'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import DotMatrix from '../components/DotMatrix';

export default function LoginPage() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });

      if (res.ok) {
        // Blur active element to hide keyboard on mobile
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        // Give browser a moment to set cookies and hide keyboard
        setTimeout(() => {
          window.location.replace('/player');
        }, 500);
      } else {
        setError('密钥错误，请重试');
        setLoading(false);
      }
    } catch {
      setError('网络错误，请检查连接');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container animate-fade-in-up">
        {/* Logo area */}
        <div className="login-logo">
          <div className="logo-icon animate-glow">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" stroke="url(#grad)" strokeWidth="2.5" />
              <circle cx="24" cy="24" r="8" fill="url(#grad)" />
              <circle cx="24" cy="24" r="3" fill="var(--color-bg-deepest)" />
              <defs>
                <linearGradient id="grad" x1="4" y1="4" x2="44" y2="44">
                  <stop stopColor="var(--color-primary-light)" />
                  <stop offset="1" stopColor="var(--color-accent)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="login-title-wrapper">
            <DotMatrix text="ChaosRadio" size="sm" />
          </div>
          <p className="login-subtitle text-secondary">
            Your Personal AI DJ
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="login-form" suppressHydrationWarning>
          <div className="input-group">
            <input
              id="access-key-input"
              type="password"
              className="input login-input"
              placeholder="输入访问密钥"
              aria-label="Access Key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoFocus
              autoComplete="off"
              suppressHydrationWarning
            />
          </div>

          {error && (
            <p className="login-error animate-fade-in">{error}</p>
          )}

          <button
            id="login-button"
            type="submit"
            className="btn btn-primary login-btn"
            disabled={loading || !key.trim()}
          >
            {loading ? (
              <span className="loading-text">正在进入...</span>
            ) : (
              '进入电台'
            )}
          </button>
        </form>

        <p className="login-footer text-tertiary">
          ChaosRadio · AI-powered personal radio
        </p>
      </div>

      <style jsx>{`
        .login-page {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
          background: #050814;
          background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
          background-size: 24px 24px;
          color: rgba(255,255,255,0.9);
        }

        .login-container {
          width: 100%;
          max-width: 360px;
          text-align: center;
        }

        .login-logo {
          margin-bottom: var(--space-10);
        }

        .logo-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 80px;
          height: 80px;
          border-radius: var(--radius-full);
          background: var(--color-bg-card);
          margin-bottom: var(--space-6);
        }

        .login-title-wrapper {
          display: flex;
          justify-content: center;
          margin-bottom: var(--space-4);
          transform: scale(0.9);
        }

        .login-subtitle {
          font-size: var(--text-sm);
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .login-input {
          text-align: center;
          font-size: var(--text-lg);
          padding: var(--space-4) var(--space-6);
          border-radius: var(--radius-lg);
          letter-spacing: 0.1em;
        }

        .login-error {
          color: var(--color-error);
          font-size: var(--text-sm);
        }

        .login-btn {
          width: 100%;
          padding: var(--space-4) var(--space-6);
          font-size: var(--text-base);
        }

        .login-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .login-footer {
          margin-top: var(--space-10);
          font-size: var(--text-xs);
          letter-spacing: 0.05em;
        }

        .loading-dots span {
          animation: pulse 1.4s ease-in-out infinite;
          font-size: var(--text-2xl);
        }
        .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
        .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
      `}</style>
    </div>
  );
}
