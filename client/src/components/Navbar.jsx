import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { MessageToast } from './MessageToast';
import { getAuthHeaders } from '../utils/authFetch';

export const Navbar = ({ currentView, onViewChange }) => {
  const { user, token, isAuthenticated, logout } = useAuth();
  const { socket } = useSocket();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [messageToast, setMessageToast] = useState(null);
  const [openCategory, setOpenCategory] = useState(null);

  const handleNav = (view, params = null) => {
    setIsMobileMenuOpen(false);
    setOpenCategory(null);
    onViewChange(view, params);
  };

  useEffect(() => {
    if (!openCategory) return undefined;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.nav-cat-dropdown-wrap')) {
        setOpenCategory(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [openCategory]);

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
    if (!socket) return undefined;
    const onAnnouncement = () => setUnreadNotificationCount((c) => c + 1);
    const onSecurity = () => setUnreadNotificationCount((c) => c + 1);
    const onTeam = () => setUnreadNotificationCount((c) => c + 1);
    const onMessage = (message) => {
      setUnreadMessageCount((c) => c + 1);
      setUnreadNotificationCount((c) => c + 1);
      if (currentView !== 'chat') {
        setMessageToast({
          sender_id: message.sender_id,
          sender_name: message.sender_name || 'A player',
          body: message.body,
        });
      }
    };
    socket.on('announcement:notification', onAnnouncement);
    socket.on('security:password-changed', onSecurity);
    socket.on('team:notification', onTeam);
    socket.on('message:notification', onMessage);
    return () => {
      socket.off('announcement:notification', onAnnouncement);
      socket.off('security:password-changed', onSecurity);
      socket.off('team:notification', onTeam);
      socket.off('message:notification', onMessage);
    };
  }, [socket, currentView]);

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

        {/* ── TOP BAR: Brand + Categories + Auth / User cluster ── */}
        <div className="nav-top-bar">
          {/* Animated Sports Background (Strictly contained in the Topbar) */}
          <div className="topbar-sports-bg" aria-hidden="true">
            <div className="topbar-light-sweep" />
            <div className="topbar-pitch-lines" />
            <span className="floating-sport-item sport-item-1">⚽</span>
            <span className="floating-sport-item sport-item-2">🏏</span>
            <span className="floating-sport-item sport-item-3">🏀</span>
            <span className="floating-sport-item sport-item-4">🏸</span>
            <span className="floating-sport-item sport-item-5">🏐</span>
            <span className="floating-sport-item sport-item-6">🏆</span>
            <span className="floating-sport-item sport-item-7">⚡</span>
          </div>

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
                <img src="/logo.jpg" alt="Playr-Pool Logo" width="36" height="36" loading="lazy" decoding="async" />
              </button>
              <span className="brand-name">
                Playr<em>-Pool</em>
              </span>
              <span className="brand-badge">SPORTS</span>
            </div>
          </div>

          {/* Categorized Vertical Dropdowns in the Topbar */}
          <nav className="nav-categories desktop-only" aria-label="Categorized Navigation">
            {/* Category: Competitions */}
            <div className="nav-cat-dropdown-wrap">
              <button
                type="button"
                className={`nav-cat-trigger ${['schedule', 'scorehub', 'leaderboard', 'events', 'feedback', 'community', 'live-scoring', 'tournaments'].includes(currentView) ? 'active' : ''} ${openCategory === 'competitions' ? 'open' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenCategory(openCategory === 'competitions' ? null : 'competitions');
                }}
                aria-expanded={openCategory === 'competitions'}
              >
                <span className="cat-icon">🏆</span>
                <span>Competitions</span>
                <span className="cat-arrow">▾</span>
              </button>

              {openCategory === 'competitions' && (
                <div className="nav-cat-menu vertical-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="cat-menu-header">// COMPETITIONS</div>
                  <button
                    type="button"
                    className={`cat-menu-item ${currentView === 'schedule' ? 'active' : ''}`}
                    onClick={() => handleNav('schedule')}
                  >
                    <span className="item-icon">📅</span>
                    <span className="item-title">Matches &amp; Schedule</span>
                  </button>
                  <button
                    type="button"
                    className={`cat-menu-item ${currentView === 'scorehub' ? 'active' : ''}`}
                    onClick={() => handleNav('scorehub')}
                  >
                    <span className="item-icon">🏆</span>
                    <span className="item-title">ScoreHub &amp; Knockouts</span>
                  </button>
                  <button
                    type="button"
                    className={`cat-menu-item ${currentView === 'leaderboard' ? 'active' : ''}`}
                    onClick={() => handleNav('leaderboard')}
                  >
                    <span className="item-icon">📊</span>
                    <span className="item-title">Standings &amp; Leaderboard</span>
                  </button>
                  <button
                    type="button"
                    className={`cat-menu-item ${currentView === 'events' ? 'active' : ''}`}
                    onClick={() => handleNav('events')}
                  >
                    <span className="item-icon">📣</span>
                    <span className="item-title">Official Tournament Events</span>
                  </button>
                  <button
                    type="button"
                    className={`cat-menu-item ${currentView === 'feedback' || currentView === 'community' ? 'active' : ''}`}
                    onClick={() => handleNav('feedback')}
                  >
                    <span className="item-icon">💬</span>
                    <span className="item-title">Community Wall &amp; Feedback</span>
                  </button>
                  <button
                    type="button"
                    className={`cat-menu-item ${currentView === 'live-scoring' ? 'active' : ''}`}
                    onClick={() => handleNav('live-scoring')}
                  >
                    <span className="item-icon">🔴</span>
                    <span className="item-title">Live Scoring</span>
                  </button>
                  {isAuthenticated && (
                    <button
                      type="button"
                      className={`cat-menu-item ${currentView === 'tournaments' ? 'active' : ''}`}
                      onClick={() => handleNav('tournaments')}
                    >
                      <span className="item-icon">🥇</span>
                      <span className="item-title">Tournaments</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Category: Squads & Athletes */}
            {isAuthenticated && (
              <div className="nav-cat-dropdown-wrap">
                <button
                  type="button"
                  className={`nav-cat-trigger ${['my-team', 'chat', 'discover', 'sports-admins'].includes(currentView) ? 'active' : ''} ${openCategory === 'squads' ? 'open' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenCategory(openCategory === 'squads' ? null : 'squads');
                  }}
                  aria-expanded={openCategory === 'squads'}
                >
                  <span className="cat-icon">⚽</span>
                  <span>Squads &amp; Athletes</span>
                  {(pendingInviteCount > 0 || unreadMessageCount > 0) && (
                    <span className="nav-badge-dot" style={{ position: 'static', width: 8, height: 8 }} />
                  )}
                  <span className="cat-arrow">▾</span>
                </button>

                {openCategory === 'squads' && (
                  <div className="nav-cat-menu vertical-menu" onClick={(e) => e.stopPropagation()}>
                    <div className="cat-menu-header">// SQUADS &amp; ATHLETES</div>
                    <button
                      type="button"
                      className={`cat-menu-item ${currentView === 'my-team' ? 'active' : ''}`}
                      onClick={() => handleNav('my-team')}
                    >
                      <span className="item-icon">⚽</span>
                      <span className="item-title">My Squad &amp; Roster</span>
                      {pendingInviteCount > 0 && <span className="nav-counter-pill">{pendingInviteCount}</span>}
                    </button>
                    <button
                      type="button"
                      className={`cat-menu-item ${currentView === 'chat' ? 'active' : ''}`}
                      onClick={() => {
                        handleNav('chat');
                        setUnreadMessageCount(0);
                      }}
                    >
                      <span className="item-icon">💬</span>
                      <span className="item-title">Direct Athlete Chat</span>
                      {unreadMessageCount > 0 && <span className="nav-counter-pill highlight">{unreadMessageCount}</span>}
                    </button>
                    <button
                      type="button"
                      className={`cat-menu-item ${currentView === 'discover' ? 'active' : ''}`}
                      onClick={() => handleNav('discover')}
                    >
                      <span className="item-icon">🔎</span>
                      <span className="item-title">Discover Athletes &amp; Teams</span>
                    </button>
                    <button
                      type="button"
                      className={`cat-menu-item ${currentView === 'sports-admins' ? 'active' : ''}`}
                      onClick={() => handleNav('sports-admins')}
                    >
                      <span className="item-icon">🛡️</span>
                      <span className="item-title">Sports Administrators</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Category: Account & Settings */}
            {isAuthenticated && (
              <div className="nav-cat-dropdown-wrap">
                <button
                  type="button"
                  className={`nav-cat-trigger ${['dashboard', 'notifications', 'admin-dashboard', 'edit-profile'].includes(currentView) ? 'active' : ''} ${openCategory === 'account' ? 'open' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenCategory(openCategory === 'account' ? null : 'account');
                  }}
                  aria-expanded={openCategory === 'account'}
                >
                  <span className="cat-icon">⚡</span>
                  <span>Account &amp; Settings</span>
                  {unreadNotificationCount > 0 && (
                    <span className="nav-badge-dot" style={{ position: 'static', width: 8, height: 8 }} />
                  )}
                  <span className="cat-arrow">▾</span>
                </button>

                {openCategory === 'account' && (
                  <div className="nav-cat-menu vertical-menu" onClick={(e) => e.stopPropagation()}>
                    <div className="cat-menu-header">// ACCOUNT &amp; SETTINGS</div>
                    <button
                      type="button"
                      className={`cat-menu-item ${currentView === 'dashboard' ? 'active' : ''}`}
                      onClick={() => handleNav('dashboard')}
                    >
                      <span className="item-icon">⚡</span>
                      <span className="item-title">Verified Athlete Credential</span>
                    </button>
                    <button
                      type="button"
                      className={`cat-menu-item ${currentView === 'notifications' ? 'active' : ''}`}
                      onClick={() => handleNav('notifications')}
                    >
                      <span className="item-icon">🔔</span>
                      <span className="item-title">Notifications &amp; Alerts</span>
                      {unreadNotificationCount > 0 && <span className="nav-counter-pill highlight">{unreadNotificationCount}</span>}
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        type="button"
                        className={`cat-menu-item ${currentView === 'admin-dashboard' ? 'active' : ''}`}
                        onClick={() => handleNav('admin-dashboard')}
                      >
                        <span className="item-icon">⚙️</span>
                        <span className="item-title">Super Admin Dashboard</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="cat-menu-item"
                      onClick={() => setIsAboutOpen(true)}
                    >
                      <span className="item-icon">ℹ️</span>
                      <span className="item-title">About Playr-Pool Platform</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Desktop Auth / User Cluster */}
          <div className="nav-actions desktop-only">
            {isAuthenticated && user ? (
              <div className="nav-user-cluster">
                <button
                  type="button"
                  className={`nav-icon-btn ${currentView === 'feedback' || currentView === 'community' ? 'active' : ''}`}
                  onClick={() => handleNav('feedback')}
                  aria-label="Community Wall & Feedback"
                  title="Community Wall & Feedback"
                >
                  💬
                </button>

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
                {user.role !== 'admin' && (
                  <button
                    type="button"
                    className={`btn btn-sm ${currentView === 'admin-dashboard' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleNav('tournaments')}
                    title="Manage your tournaments"
                  >
                    🏆 Tournaments
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
              <div className="nav-auth-buttons" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <button
                  type="button"
                  className={`nav-icon-btn ${currentView === 'feedback' || currentView === 'community' ? 'active' : ''}`}
                  onClick={() => handleNav('feedback')}
                  aria-label="Community Wall & Feedback"
                  title="Community Wall & Feedback"
                >
                  💬
                </button>
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

          {/* Mobile Header Controls */}
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
        </div>
      </header>

      {/* Griffin-Style Full Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setIsMobileMenuOpen(false)}>
          <aside className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div className="brand-logo" onClick={() => handleNav(isAuthenticated ? 'dashboard' : 'schedule')}>
                <img src="/logo.jpg" alt="Playr-Pool" className="mobile-drawer-logo-img" width="40" height="40" loading="lazy" decoding="async" />
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
                  className={`mobile-nav-item ${currentView === 'feedback' || currentView === 'community' || currentView === 'experiences' || currentView === 'reviews' ? 'active' : ''}`}
                  onClick={() => handleNav('feedback')}
                >
                  <span className="mobile-item-icon">💬</span>
                  <span className="mobile-item-label">Community Wall &amp; Feedback</span>
                </button>
                <button
                  type="button"
                  className={`mobile-nav-item ${currentView === 'live-scoring' ? 'active' : ''}`}
                  onClick={() => handleNav('live-scoring')}
                >
                  <span className="mobile-item-icon">🔴</span>
                  <span className="mobile-item-label">Live Scoring</span>
                </button>
                {isAuthenticated && (
                  <button
                    type="button"
                    className={`mobile-nav-item ${currentView === 'tournaments' ? 'active' : ''}`}
                    onClick={() => handleNav('tournaments')}
                  >
                    <span className="mobile-item-icon">🏆</span>
                    <span className="mobile-item-label">Tournaments</span>
                  </button>
                )}
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
                        <span className="mobile-item-label">Super Admin Dashboard</span>
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
                <img src="/logo.jpg" alt="Playr-Pool Logo" width="48" height="48" loading="lazy" decoding="async" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-subtle)' }} />
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
                  <h3>Developer &amp; Owner</h3>
                  <p><strong>Utkarsh Anand</strong><br />B.Tech, Computer Science &amp; Engineering<br />FET, GKV, Haridwar</p>
                  <p><a href="tel:+918809853489">+91 8809853489</a><br /><a href="mailto:utkarshiit098@gmail.com">utkarshiit098@gmail.com</a></p>
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
