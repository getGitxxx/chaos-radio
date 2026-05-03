'use client';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#09090b',
      color: '#a1a1aa',
      fontFamily: 'system-ui, sans-serif',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: '4rem', margin: 0, color: '#ef4444' }}>ERROR</h1>
      <p style={{ fontSize: '1.2rem', margin: '1rem 0' }}>
        Signal interference detected.
      </p>
      <p style={{ fontSize: '0.85rem', color: '#52525b', maxWidth: '400px' }}>
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: '2rem',
          padding: '0.75rem 2rem',
          background: 'transparent',
          border: '1px solid #27272a',
          borderRadius: '8px',
          color: '#a1a1aa',
          cursor: 'pointer',
          fontSize: '0.9rem',
        }}
      >
        RETRY
      </button>
    </div>
  );
}
