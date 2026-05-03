import Link from 'next/link';

export default function NotFoundPage() {
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
      <h1 style={{ fontSize: '4rem', margin: 0, color: '#00ff66' }}>404</h1>
      <p style={{ fontSize: '1.2rem', margin: '1rem 0' }}>
        This frequency doesn&apos;t exist.
      </p>
      <Link
        href="/"
        style={{
          marginTop: '2rem',
          padding: '0.75rem 2rem',
          background: 'transparent',
          border: '1px solid #27272a',
          borderRadius: '8px',
          color: '#a1a1aa',
          textDecoration: 'none',
          fontSize: '0.9rem',
        }}
      >
        BACK TO STATION
      </Link>
    </div>
  );
}
