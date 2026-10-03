import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { MessageToast } from './MessageToast';
import { getAuthHeaders } from '../utils/authFetch';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);

export const Navbar = ({ currentView, onViewChange }) => {
  const { user, token, isAuthenticated, logout } = useAuth();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [messageToast, setMessageToast] = useState(null);

  const handleNav = (view, params = null) => {
    setIsMobileMenuOpen(false);
    onViewChange(view, params);
  };

  useEffect(() => {
    if (!isAboutOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsAboutOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isAboutOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      document.body.style.overflow = '';
      return undefined;
    }
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!token) { setPendingInviteCount(0); return undefined; }
    const loadInvites = async () => {
      try {
        const res = await fetch('/api/teams/invites/mine', { headers: getAuthHeaders(token) });
        const data = await res.json();
        if (res.ok && data.success) setPendingInviteCount(data.invites.filter(invite => invite.status === 'pending').length);
      } catch { /* Ignored */ }
    };
    loadInvites();
    const interval = window.setInterval(loadInvites, 60000);
    return () => window.clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!token) { setUnreadMessageCount(0); return undefined; }
    const loadUnreadMessages = async () => {
      try {
        const res = await fetch('/api/chat/unread/count', { headers: getAuthHeaders(token) });
        const data = await res.json();
        if (res.ok && data.success) setUnreadMessageCount(data.count || 0);
      } catch { /* Ignored */ }
    };
    loadUnreadMessages();
    const interval = window.setInterval(loadUnreadMessages, 60000);
    return () => window.clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(SOCKET_URL, { auth: { token } });
    socket.on('connect', () => socket.emit('join:user'));
    socket.on('announcement:notification', () => setUnreadNotificationCount(count => count + 1));
    socket.on('security:password-changed', () => setUnreadNotificationCount(count => count + 1));
    socket.on('team:notification', () => setUnreadNotificationCount(count => count + 1));

    const handleMessageReceived = (message) => {
      setUnreadMessageCount(count => count + 1);
      setUnreadNotificationCount(count => count + 1);
      if (currentView !== 'chat') {
        setMessageToast({
          sender_id: message.sender_id,
          sender_name: message.sender_name || 'A player',
          body: message.body
        });
      }
    };

    socket.on('message:notification', handleMessageReceived);
    return () => socket.disconnect();
  }, [token, currentView]);

  useEffect(() => {
    if (!token) { setUnreadNotificationCount(0); return undefined; }
    const loadNotifications = async () => {
      try {
        const res = await fetch('/api/notifications', { headers: getAuthHeaders(token) });
        const data = await res.json();
        if (res.ok && data.success) setUnreadNotificationCount(data.unreadCount || 0);
      } catch { /* Ignored */ }
    };
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60000);
    return () => window.clearInterval(interval);
  }, [token]);

  return (
    <>
      <header className="navbar">
        {/* Brand Area */}
        <div className="nav-brand-area">
          <div className="brand-logo" onClick={() => handleNav(isAuthenticated ? 'dashboard' : 'schedule')} style={{ cursor: 'pointer' }}>
            <button
              type="button"
              className="brand-icon"
              onClick={(e) => { e.stopPropagation(); setIsAboutOpen(true); }}
              aria-haspopup="dialog"
              aria-expanded={isAboutOpen}
              aria-label="Open information about Playr-Pool"
            >
              <img src="/logo.jpg" alt="Playr-Pool Logo" />
            </button>
            <span className="brand-name">
              Playr<em>-Pool</em>
            </span>
            <span className="brand-badge">SPORTS</span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="nav-desktop-links" aria-label="Main Navigation">
          <button
            type="button"
            className={`nav-link-item ${currentView === 'schedule' ? 'active' : ''}`}
            onClick={() => handleNav('schedule')}
          >
            Matches
          </button>
          <button
            type="button"
            className={`nav-link-item ${currentView === 'scorehub' ? 'active' : ''}`}
            onClick={() => handleNav('scorehub')}
          >
            ScoreHub
          </button>
          <button
            type="button"
            className={`nav-link-item ${currentView === 'leaderboard' ? 'active' : ''}`}
            onClick={() => handleNav('leaderboard')}
          >
            Leaderboard
          </button>
          <button
            type="button"
            className={`nav-link-item ${currentView === 'events' ? 'active' : ''}`}
            onClick={() => handleNav('events')}
          >
            Events
          </button>
          <button
            type="button"
            className={`nav-link-item ${currentView === 'live-scoring' ? 'active' : ''}`}
            onClick={() => handleNav('live-scoring')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f43f5e', display: 'inline-block', animation: 'liveDot 1.4s ease-in-out infinite' }} />
            Live
          </button>
          {isAuthenticated && (
            <>
              <button
                type="button"
                className={`nav-link-item ${currentView === 'my-team' ? 'active' : ''}`}
                onClick={() => handleNav('my-team')}
              >
                My Team {pendingInviteCount > 0 && <span className="nav-counter-pill">{pendingInviteCount}</span>}
              </button>
              <button
                type="button"
                className={`nav-link-item ${currentView === 'chat' ? 'active' : ''}`}
                onClick={() => {
                  handleNav('chat');
                  setUnreadMessageCount(0);
                }}
              >
                Messages {unreadMessageCount > 0 && <span className="nav-counter-pill highlight">{unreadMessageCount}</span>}
              </button>
              <button
                type="button"
                className={`nav-link-item ${currentView === 'discover' ? 'active' : ''}`}
                onClick={() => handleNav('discover')}
              >
                Discover
              </button>
              <button
                type="button"
                className={`nav-link-item ${currentView === 'sports-admins' ? 'active' : ''}`}
                onClick={() => handleNav('sports-admins')}
              >
                Admins
              </button>
            </>
          )}
        </nav>

        {/* Desktop Actions & User Controls */}
        <div className="nav-actions desktop-only">
          {isAuthenticated && user ? (
            <div className="nav-user-cluster">
              <button
                type="button"
                className={`nav-icon-btn ${currentView === 'notifications' ? 'active' : ''}`}
                onClick={() => handleNav('notifications')}
                aria-label="Notifications"
                title="Notifications"
              >
                🔔
                {unreadNotificationCount > 0 && <span className="nav-badge-dot" />}
              </button>

              <button
                type="button"
                className={`nav-user-pill ${currentView === 'dashboard' ? 'active' : ''}`}
                onClick={() => handleNav('dashboard')}
              >
                <div className="user-mini-avatar">
                  {user.profile_photo ? (
                    <img src={user.profile_photo} alt={user.name} />
                  ) : (
                    user.name ? user.name[0].toUpperCase() : 'U'
                  )}
                </div>
                <span className="user-pill-name">{user.name?.split(' ')[0]}</span>
                <span className={`role-pill ${user.role}`}>{user.role}</span>
              </button>

              {user.role === 'admin' && (
                <button
                  type="button"
                  className={`btn btn-sm ${currentView === 'admin-dashboard' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleNav('admin-dashboard')}
                >
                  ⚙️ Admin Desk
                </button>
              )}

              <button 
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  logout();
                  handleNav('login');
                }}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="nav-auth-buttons">
              <button 
                type="button"
                className={`btn btn-sm ${currentView === 'login' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleNav('login')}
              >
                Log In
              </button>
              <button 
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => handleNav('signup')}
              >
                Register
              </button>
            </div>
          )}
        </div>

        {/* Mobile Header Controls: Clean Three Dots Menu */}
        <div className="nav-mobile-controls">
          <button
            type="button"
            className={`mobile-dots-btn ${isMobileMenuOpen ? 'open' : ''}`}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
            title="Navigation Menu"
          >
            {isMobileMenuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2.2" />
                <circle cx="12" cy="12" r="2.2" />
                <circle cx="12" cy="19" r="2.2" />
              </svg>
            )}
            {(unreadNotificationCount > 0 || unreadMessageCount > 0) && (
              <span className="nav-badge-dot" />
            )}
          </button>
        </div>
      </header>

      {/* Griffin-Style Full Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setIsMobileMenuOpen(false)}>
          <aside className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div className="brand-logo" onClick={() => handleNav(isAuthenticated ? 'dashboard' : 'schedule')}>
                <img src="/logo.jpg" alt="Playr-Pool" className="mobile-drawer-logo-img" />
                <span className="brand-name">Playr<em>-Pool</em></span>
              </div>
              <button
                type="button"
                className="mobile-drawer-close"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            {/* Mobile User Card */}
            {isAuthenticated && user && (
              <div className="mobile-user-card" onClick={() => handleNav('dashboard')}>
                <div className="mobile-user-avatar">
                  {user.profile_photo ? (
                    <img src={user.profile_photo} alt={user.name} />
                  ) : (
                    user.name ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'PP'
                  )}
                </div>
                <div className="mobile-user-meta">
                  <div className="mobile-user-name">{user.name}</div>
                  <div className="mobile-user-sub">
                    <span>{user.college_id}</span>
                    <span>•</span>
                    <span className={`role-pill ${user.role}`}>{user.role}</span>
                  </div>
                </div>
                <span className="mobile-user-arrow">→</span>
              </div>
            )}

            <div className="mobile-drawer-body">
              {/* Category: Competitions */}
              <div className="mobile-nav-group">
                <div className="mobile-nav-eyebrow">// COMPETITIONS</div>
                <button
                  type="button"
                  className={`mobile-nav-item ${currentView === 'schedule' ? 'active' : ''}`}
                  onClick={() => handleNav('schedule')}
                >
                  <span className="mobile-item-icon">📅</span>
                  <span className="mobile-item-label">Matches &amp; Schedule</span>
                </button>
                <button
                  type="button"
                  className={`mobile-nav-item ${currentView === 'scorehub' ? 'active' : ''}`}
                  onClick={() => handleNav('scorehub')}
                >
                  <span className="mobile-item-icon">🏆</span>
                  <span className="mobile-item-label">ScoreHub &amp; Knockouts</span>
                </button>
                <button
                  type="button"
                  className={`mobile-nav-item ${currentView === 'leaderboard' ? 'active' : ''}`}
                  onClick={() => handleNav('leaderboard')}
                >
                  <span className="mobile-item-icon">📊</span>
                  <span className="mobile-item-label">Standings &amp; Leaderboard</span>
                </button>
                <button
                  type="button"
                  className={`mobile-nav-item ${currentView === 'events' ? 'active' : ''}`}
                  onClick={() => handleNav('events')}
                >
                  <span className="mobile-item-icon">📣</span>
                  <span className="mobile-item-label">Official Tournament Events</span>
                </button>
                <button
                  type="button"
                  className={`mobile-nav-item ${currentView === 'live-scoring' ? 'active' : ''}`}
                  onClick={() => handleNav('live-scoring')}
                >
                  <span className="mobile-item-icon">🔴</span>
                  <span className="mobile-item-label">Live Scoring</span>
                </button>
              </div>

              {/* Category: Squad & Social */}
              {isAuthenticated && (
                <div className="mobile-nav-group">
                  <div className="mobile-nav-eyebrow">// SQUADS &amp; ATHLETES</div>
                  <button
                    type="button"
                    className={`mobile-nav-item ${currentView === 'my-team' ? 'active' : ''}`}
                    onClick={() => handleNav('my-team')}
                  >
                    <span className="mobile-item-icon">⚽</span>
                    <span className="mobile-item-label">My Squad &amp; Roster</span>
                    {pendingInviteCount > 0 && <span className="nav-counter-pill">{pendingInviteCount}</span>}
                  </button>
                  <button
                    type="button"
                    className={`mobile-nav-item ${currentView === 'chat' ? 'active' : ''}`}
                    onClick={() => {
                      handleNav('chat');
                      setUnreadMessageCount(0);
                    }}
                  >
                    <span className="mobile-item-icon">💬</span>
                    <span className="mobile-item-label">Direct Athlete Chat</span>
                    {unreadMessageCount > 0 && <span className="nav-counter-pill highlight">{unreadMessageCount}</span>}
                  </button>
                  <button
                    type="button"
                    className={`mobile-nav-item ${currentView === 'discover' ? 'active' : ''}`}
                    onClick={() => handleNav('discover')}
                  >
                    <span className="mobile-item-icon">🔎</span>
                    <span className="mobile-item-label">Discover Athletes &amp; Teams</span>
                  </button>
                  <button
                    type="button"
                    className={`mobile-nav-item ${currentView === 'sports-admins' ? 'active' : ''}`}
                    onClick={() => handleNav('sports-admins')}
                  >
                    <span className="mobile-item-icon">🛡️</span>
                    <span className="mobile-item-label">Sports Administrators</span>
                  </button>
                  {user?.role === 'player' && (
                    <button
                      type="button"
                      className={`mobile-nav-item ${currentView === 'my-sports' ? 'active' : ''}`}
                      onClick={() => handleNav('my-sports')}
                    >
                      <span className="mobile-item-icon">🏅</span>
                      <span className="mobile-item-label">My Registered Sports</span>
                    </button>
                  )}
                </div>
              )}

              {/* Category: Account & Admin */}
              <div className="mobile-nav-group">
                <div className="mobile-nav-eyebrow">// ACCOUNT &amp; SETTINGS</div>
                {isAuthenticated ? (
                  <>
                    <button
                      type="button"
                      className={`mobile-nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
                      onClick={() => handleNav('dashboard')}
                    >
                      <span className="mobile-item-icon">⚡</span>
                      <span className="mobile-item-label">Verified Athlete Credential</span>
                    </button>
                    <button
                      type="button"
                      className={`mobile-nav-item ${currentView === 'notifications' ? 'active' : ''}`}
                      onClick={() => handleNav('notifications')}
                    >
                      <span className="mobile-item-icon">🔔</span>
                      <span className="mobile-item-label">Notifications &amp; Alerts</span>
                      {unreadNotificationCount > 0 && (
                        <span className="nav-counter-pill highlight">{unreadNotificationCount}</span>
                      )}
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        type="button"
                        className={`mobile-nav-item ${currentView === 'admin-dashboard' ? 'active' : ''}`}
                        onClick={() => handleNav('admin-dashboard')}
                      >
                        <span className="mobile-item-icon">⚙️</span>
                        <span className="mobile-item-label">Tournament Admin Desk</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="mobile-nav-item"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsAboutOpen(true);
                      }}
                    >
                      <span className="mobile-item-icon">ℹ️</span>
                      <span className="mobile-item-label">About Playr-Pool Platform</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`mobile-nav-item ${currentView === 'login' ? 'active' : ''}`}
                      onClick={() => handleNav('login')}
                    >
                      <span className="mobile-item-icon">🔑</span>
                      <span className="mobile-item-label">Sign In</span>
                    </button>
                    <button
                      type="button"
                      className={`mobile-nav-item ${currentView === 'signup' ? 'active' : ''}`}
                      onClick={() => handleNav('signup')}
                    >
                      <span className="mobile-item-icon">✨</span>
                      <span className="mobile-item-label">Create Athlete Account</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Mobile Drawer Footer */}
            <div className="mobile-drawer-footer">
              {isAuthenticated ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    logout();
                    handleNav('login');
                  }}
                >
                  Sign Out
                </button>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', width: '100%' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleNav('login')}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleNav('signup')}
                  >
                    Register
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Griffin-Style Mobile Bottom Dock for Thumb-Friendly Quick Navigation */}
      <nav className="mobile-bottom-dock" aria-label="Mobile Bottom Navigation">
        <button
          type="button"
          className={`dock-item ${currentView === 'schedule' ? 'active' : ''}`}
          onClick={() => handleNav('schedule')}
        >
          <span className="dock-icon">📅</span>
          <span className="dock-label">Matches</span>
        </button>

        <button
          type="button"
          className={`dock-item ${currentView === 'scorehub' ? 'active' : ''}`}
          onClick={() => handleNav('scorehub')}
        >
          <span className="dock-icon">🏆</span>
          <span className="dock-label">Scores</span>
        </button>

        <button
          type="button"
          className={`dock-item ${currentView === 'live-scoring' ? 'active' : ''}`}
          onClick={() => handleNav('live-scoring')}
        >
          <span className="dock-icon" style={{ position: 'relative' }}>
            🔴
          </span>
          <span className="dock-label">Live</span>
        </button>

        <button
          type="button"
          className={`dock-item ${currentView === 'dashboard' || (!isAuthenticated && currentView === 'login') ? 'active' : ''}`}
          onClick={() => handleNav(isAuthenticated ? 'dashboard' : 'login')}
        >
          <span className="dock-icon">⚡</span>
          <span className="dock-label">{isAuthenticated ? 'Profile' : 'Sign In'}</span>
        </button>

        {isAuthenticated && (
          <button
            type="button"
            className={`dock-item ${currentView === 'my-team' ? 'active' : ''}`}
            onClick={() => handleNav('my-team')}
          >
            <span className="dock-icon" style={{ position: 'relative' }}>
              ⚽
              {pendingInviteCount > 0 && <span className="dock-badge-dot" />}
            </span>
            <span className="dock-label">My Team</span>
          </button>
        )}

        {isAuthenticated ? (
          <button
            type="button"
            className={`dock-item ${currentView === 'chat' ? 'active' : ''}`}
            onClick={() => {
              handleNav('chat');
              setUnreadMessageCount(0);
            }}
          >
            <span className="dock-icon" style={{ position: 'relative' }}>
              💬
              {unreadMessageCount > 0 && <span className="dock-badge-dot highlight" />}
            </span>
            <span className="dock-label">Chat</span>
          </button>
        ) : (
          <button
            type="button"
            className={`dock-item ${currentView === 'leaderboard' ? 'active' : ''}`}
            onClick={() => handleNav('leaderboard')}
          >
            <span className="dock-icon">📊</span>
            <span className="dock-label">Rankings</span>
          </button>
        )}
      </nav>

      {/* About Playr-Pool Modal */}
      {isAboutOpen && createPortal(
        <div className="about-overlay" role="presentation" onMouseDown={() => setIsAboutOpen(false)}>
          <section
            className="about-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="playrpool-about-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="about-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <img src="/logo.jpg" alt="Playr-Pool Logo" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-subtle)' }} />
                <div>
                  <p className="about-eyebrow">// ABOUT PLAYR-POOL</p>
                  <h2 id="playrpool-about-title">Connect, Play, <em>Conquer</em></h2>
                </div>
              </div>
              <button type="button" className="about-close" onClick={() => setIsAboutOpen(false)} aria-label="Close Playr-Pool information">Close <span aria-hidden="true">×</span></button>
            </div>

            <div className="about-modal-content">
              <p>Playr-Pool is a digital sports tournament management platform that makes college and outdoor sports organized, interactive, and engaging.</p>
              <p>Built for the players who have guts to compete and conquer — bringing squads, fixtures, real-time scores, and standings into a unified, secure platform.</p>

              <div className="about-columns">
                <div>
                  <h3>Capabilities</h3>
                  <ul>
                    <li>Create and manage multiple squads</li>
                    <li>Discover athletes &amp; follow matches</li>
                    <li>Real-time scores &amp; knockout brackets</li>
                    <li>Verified college athletic credentials</li>
                    <li>Real-time peer chat &amp; announcements</li>
                  </ul>
                </div>
                <div>
                  <h3>Platform Team</h3>
                  <p><strong>Utkarsh Anand</strong><br />B.Tech, Computer Science &amp; Engineering<br />FET, GKV, Haridwar</p>
                  <p><a href="tel:+918809853489">+91 8809853489</a><br /><a href="mailto:utkarshiit098@gmail.com">utkarshiit098@gmail.com</a></p>
                  <p style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>Made with the Playr-Pool Team: Rishav Raj, Utkarsh Kumar Singh, Priyanshu Raj, Anal Roy, and Shivam.</p>
                </div>
              </div>

              <div className="about-purpose">
                <div><h3>Our mission</h3><p>Make collegiate sports organized, accessible, and thrilling through modern, resilient technology.</p></div>
                <div><h3>Our vision</h3><p>A digital sports ecosystem connecting athletes, squads, and organizers across universities.</p></div>
              </div>

              <p className="about-signoff"><em>“I don't chase victory. I chase the version of me that deserves it.”</em><br />Have a nice day 🫡</p>
              <p className="about-signoff" style={{ marginTop: '0.6rem !important', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Made with precision for student welfare. <strong>Playr-Pool</strong></p>
            </div>
          </section>
        </div>
      , document.body)}

      {messageToast && (
        <MessageToast
          toast={messageToast}
          onClose={() => setMessageToast(null)}
          onOpenChat={(senderId) => {
            handleNav('chat', senderId);
            setUnreadMessageCount(0);
          }}
        />
      )}
    </>
  );
};
