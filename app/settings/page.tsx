'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [taste, setTaste] = useState('加载中...');
  const [city, setCity] = useState('');
  const [favCount, setFavCount] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Load taste profile
    fetch('/api/taste')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setTaste(data.data.content || '未设置');
      })
      .catch(() => setTaste('加载失败'));

    // Load city from localStorage
    const savedCity = localStorage.getItem('chaos-radio-city');
    if (savedCity) setCity(savedCity);

    // Load favorites count
    fetch('/api/favorites')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setFavCount(data.data.count);
        }
      })
      .catch(console.error);
  }, []);

  const handleCityChange = (value: string) => {
    setCity(value);
    localStorage.setItem('chaos-radio-city', value);
  };

  const handleSyncFavorites = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/favorites', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data) {
        setFavCount(data.data.count);
        alert(data.data.message || '同步成功！');
      } else {
        alert('同步失败: ' + (data.error || '未知错误'));
      }
    } catch (err) {
      alert('同步请求失败');
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    document.cookie = 'chaos-radio-token=; Path=/; Max-Age=0';
    router.push('/');
  };

  return (
    <div className="settings-page">
      <header className="page-header">
        <button className="back-btn text-mono" onClick={() => router.back()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 className="page-title text-mono">SETTINGS</h1>
        <div style={{width: 20}}></div>
      </header>

      <main className="settings-main">
        {/* Taste profile */}
        <section className="settings-section">
          <h2 className="section-title text-mono">🎵 音乐品味</h2>
          <p className="section-desc">
            编辑品味需修改 <code>user/taste.md</code> 后重新部署
          </p>
          <div className="taste-preview">
            <pre className="taste-content">{taste}</pre>
          </div>
        </section>

        {/* NCM Sync */}
        <section className="settings-section">
          <h2 className="section-title text-mono">☁️ 云音乐联动</h2>
          <p className="section-desc">同步网易云收藏，让推荐更精准。请确保歌单设为公开。</p>
          <div className="sync-card">
            <div className="sync-info">
              <span className="text-secondary" style={{fontSize: '13px'}}>当前已同步曲目</span>
              <span className="text-display" style={{fontSize: '20px', color: '#00ff66'}}>{favCount !== null ? favCount : '--'}</span>
            </div>
            <button 
              className="sync-btn text-mono" 
              onClick={handleSyncFavorites} 
              disabled={isSyncing}
            >
              {isSyncing ? 'SYNCING...' : 'SYNC NOW'}
            </button>
          </div>
        </section>

        {/* Weather city */}
        <section className="settings-section">
          <h2 className="section-title text-mono">🌤 天气城市</h2>
          <p className="section-desc">DJ 会根据你的城市天气推荐音乐</p>
          <input
            className="settings-input text-mono"
            placeholder="输入城市名 (英文，如 Shanghai)"
            aria-label="City"
            value={city}
            onChange={(e) => handleCityChange(e.target.value)}
          />
        </section>

        {/* About */}
        <section className="settings-section">
          <h2 className="section-title text-mono">ℹ️ 关于</h2>
          <div className="about-card">
            <p className="about-name">
              Chaos<span style={{color: '#00ff66'}}>Radio</span>
            </p>
            <p className="about-sub">Your Personal AI DJ</p>
            <p className="about-version text-mono">v0.1.0 · MVP</p>
          </div>
        </section>

        {/* Logout */}
        <button className="logout-btn text-mono" onClick={handleLogout}>
          退出登录
        </button>
      </main>

      <style jsx>{`
        .settings-page {
          min-height: 100dvh;
          background: #050814;
          background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
          background-size: 24px 24px;
          color: rgba(255,255,255,0.9);
          padding-bottom: 100px;
        }

        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px;
          padding-top: calc(env(safe-area-inset-top, 0px) + 24px);
          border-bottom: 1px solid rgba(0, 136, 255, 0.15);
          background: linear-gradient(180deg, rgba(0, 80, 255, 0.1) 0%, transparent 100%);
          max-width: 800px;
          margin: 0 auto;
          width: 100%;
        }

        .back-btn {
          display: flex;
          align-items: center;
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.6);
          cursor: pointer;
        }

        .back-btn:hover {
          color: white;
        }

        .page-title {
          font-size: 18px;
          letter-spacing: 2px;
        }

        .settings-main {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 32px;
          max-width: 640px;
          margin: 0 auto;
          width: 100%;
        }

        .section-title {
          font-size: 16px;
          margin-bottom: 8px;
          letter-spacing: 0.5px;
        }

        .section-desc {
          font-size: 13px;
          color: rgba(255,255,255,0.5);
          margin-bottom: 12px;
        }

        .section-desc code {
          background: rgba(255,255,255,0.08);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
          font-family: var(--font-mono);
        }

        .taste-preview {
          padding: 16px;
          max-height: 240px;
          overflow-y: auto;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
        }

        .taste-content {
          font-size: 12px;
          line-height: 1.6;
          color: rgba(255,255,255,0.6);
          white-space: pre-wrap;
          word-break: break-word;
          margin: 0;
        }

        .sync-card {
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .sync-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .sync-btn {
          background: rgba(0, 255, 102, 0.1);
          color: #00ff66;
          border: 1px solid rgba(0, 255, 102, 0.3);
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .sync-btn:hover:not(:disabled) {
          background: rgba(0, 255, 102, 0.2);
        }
        
        .sync-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .settings-input {
          width: 100%;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 13px;
          color: white;
        }

        .settings-input:focus {
          outline: none;
          border-color: rgba(0, 136, 255, 0.4);
        }

        .about-card {
          padding: 24px;
          text-align: center;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
        }

        .about-name {
          font-size: 22px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .about-sub {
          font-size: 13px;
          color: rgba(255,255,255,0.5);
        }

        .about-version {
          margin-top: 8px;
          font-size: 11px;
          color: rgba(255,255,255,0.3);
        }

        .logout-btn {
          width: 100%;
          padding: 14px;
          border-radius: 8px;
          border: 1px solid rgba(248, 113, 113, 0.3);
          background: transparent;
          color: #f87171;
          font-size: 14px;
          cursor: pointer;
          letter-spacing: 1px;
        }

        .logout-btn:hover {
          background: rgba(248, 113, 113, 0.1);
        }

        @media (min-width: 768px) {
          .settings-main {
            padding: 40px 24px;
            gap: 40px;
          }

          .page-header {
            padding: 32px 40px;
          }
        }
      `}</style>
    </div>
  );
}
