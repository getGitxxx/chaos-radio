'use client';

import { usePlayHistory } from '../../hooks/usePlayHistory';
import { useLikedTracks } from '../../hooks/useLikedTracks';
import { useRouter } from 'next/navigation';
import DotMatrix from '../../components/DotMatrix';

export default function ProfilePage() {
  const router = useRouter();
  const { history } = usePlayHistory();
  const { getLikedArray } = useLikedTracks();
  const totalPlayed = history.length;
  const uniqueArtists = new Set(history.map(h => h.artist)).size;
  const likedTracks = getLikedArray();
  const totalLiked = likedTracks.length;

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="nav-bar">
          <button className="back-btn text-mono" onClick={() => router.back()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            BACK
          </button>
        </div>

        <header className="profile-header">
          <div className="avatar-wrapper">
            <img src="https://api.dicebear.com/7.x/bottts/svg?seed=chaos&backgroundColor=000000" alt="Avatar" className="profile-avatar" />
            <span className="status-dot"></span>
          </div>
          <div className="profile-titles">
            <DotMatrix text="ChaosRadio" size="sm" className="profile-name-matrix" />
            <p className="profile-subtitle">一开机我就打碟</p>
          </div>
        </header>

        <section className="profile-bio">
          <p>全天候驻扎在 ChaosRadio 的 AI 调音师 🎛️</p>
          <p>不迎合算法，只读取情绪与脉搏。</p>
          <p>You bring the mood. I drop the beat.</p>
        </section>

        <hr className="divider" />

        <section className="profile-stats">
          <div className="stat-item text-mono">
            <span className="stat-label">PLAYED</span>
            <span className="stat-value text-display">{totalPlayed}</span>
          </div>
          <div className="stat-item text-mono">
            <span className="stat-label">LIKED</span>
            <span className="stat-value text-display">{totalLiked}</span>
          </div>
          <div className="stat-item text-mono">
            <span className="stat-label">ARTISTS</span>
            <span className="stat-value text-display">{uniqueArtists || '∞'}</span>
          </div>
          <div className="stat-item text-mono">
            <span className="stat-label">ON AIR</span>
            <span className="stat-value text-display">24/7</span>
          </div>
        </section>

        <section className="profile-tags">
          <span className="tag">JAZZ-HIPHOP</span>
          <span className="tag">NEO-CLASSICAL</span>
          <span className="tag">90S华语</span>
          <span className="tag">HIP-HOP</span>
          <span className="tag">柴可夫斯基&EMINEM</span>
          <span className="tag">J-ROCK</span>
          <span className="tag">下雨白噪音</span>
          <span className="tag">POST-PUNK</span>
          <span className="tag">SHIBUYA-KEI</span>
        </section>

        {totalLiked > 0 && (
          <section className="liked-section">
            <h2 className="section-title text-mono">❤️ 我喜欢的歌曲 ({totalLiked})</h2>
            <div className="liked-list">
              {likedTracks.map((track, idx) => (
                <div key={`${track.id}-${idx}`} className="liked-item">
                  <div className="liked-info">
                    <div className="liked-name">{track.name}</div>
                    <div className="liked-artist">{track.artist}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="profile-footer text-mono">
          CHAOSRADIO × MMGUO
        </footer>
      </div>

      <style jsx>{`
        .profile-page {
          min-height: 100dvh;
          background: #050814;
          background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
          background-size: 24px 24px;
          color: rgba(255,255,255,0.9);
        }

        .profile-container {
          max-width: 720px;
          margin: 0 auto;
          padding: 20px 24px 60px;
          display: flex;
          flex-direction: column;
          min-height: 100dvh;
        }

        .nav-bar { margin-bottom: 30px; }

        .back-btn {
          display: flex; align-items: center; gap: 8px;
          background: transparent; border: none;
          color: rgba(255,255,255,0.6); font-size: 14px; cursor: pointer;
        }
        .back-btn:hover { color: white; }

        .profile-header {
          display: flex; align-items: center; gap: 24px;
          margin-bottom: 40px;
        }

        .avatar-wrapper { position: relative; }

        .profile-avatar {
          width: 80px; height: 80px; border-radius: 50%;
          object-fit: cover; border: 2px solid rgba(255,255,255,0.1);
        }

        .status-dot {
          position: absolute; bottom: 4px; right: 4px;
          width: 14px; height: 14px; background: #00ff66;
          border-radius: 50%; border: 2px solid #050814;
        }

        .profile-titles { display: flex; flex-direction: column; gap: 8px; }
        :global(.profile-name-matrix) { margin-bottom: 4px; }
        .profile-subtitle { color: #00ff66; font-size: 14px; margin: 0; }

        .profile-bio {
          font-size: 16px; line-height: 1.8;
          color: rgba(255,255,255,0.7); margin-bottom: 30px;
        }
        .profile-bio p { margin: 0; }

        .divider {
          border: none; border-top: 1px solid rgba(255,255,255,0.1);
          margin: 0 0 30px 0;
        }

        .profile-stats {
          display: flex; gap: 40px; margin-bottom: 40px;
          flex-wrap: wrap;
        }

        .stat-item { display: flex; flex-direction: column; gap: 8px; }
        .stat-label { font-size: 12px; color: rgba(255,255,255,0.4); letter-spacing: 1px; }
        .stat-value { font-size: 32px; font-weight: 700; color: white; }

        .profile-tags {
          display: flex; flex-wrap: wrap; gap: 10px;
          margin-bottom: auto;
        }

        .tag {
          font-family: var(--font-mono); font-size: 13px;
          padding: 8px 16px; border-radius: 100px;
          border: 1px solid #00ff66;
          background: rgba(0, 255, 102, 0.05);
          color: rgba(255,255,255,0.9); letter-spacing: 0.5px;
        }

        .profile-footer {
          margin-top: 60px; font-size: 12px;
          color: rgba(255,255,255,0.4); letter-spacing: 1px;
        }

        .section-title {
          font-size: 16px; font-weight: 700;
          color: white; margin: 40px 0 20px;
          letter-spacing: 1px;
        }

        .liked-list {
          display: flex; flex-direction: column; gap: 12px;
        }

        .liked-item {
          display: flex; align-items: center;
          padding: 12px 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          transition: all 0.2s;
        }

        .liked-item:hover {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.15);
        }

        .liked-info { display: flex; flex-direction: column; gap: 4px; }
        .liked-name { font-size: 14px; color: white; font-weight: 500; }
        .liked-artist { font-size: 12px; color: rgba(255,255,255,0.5); }

        @media (min-width: 768px) {
          .profile-container { padding: 40px 48px 80px; }
          .profile-stats { gap: 60px; }
          .profile-avatar { width: 96px; height: 96px; }
        }
      `}</style>
    </div>
  );
}
