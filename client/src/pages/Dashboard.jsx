import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { getAuthHeaders } from '../utils/authFetch';

export const Dashboard = ({ onNavigate }) => {
  const { user, token, fetchProfile, deleteAccount } = useAuth();
  const [adminTestStatus, setAdminTestStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  React.useEffect(() => {
    if (user && !user.sports) {
      fetchProfile();
    }
  }, [user, fetchProfile]);

  if (!user) {
    return (
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h2>No Active Session</h2>
        <p>Your session was cleared or you have not logged in yet.</p>
      </div>
    );
  }

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount();
      if (onNavigate) onNavigate('signup');
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account');
      setDeleting(false);
    }
  };


  // Get initials for avatar
  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'AT';

  // Test the /api/auth/admin-only endpoint to verify requireAdmin middleware
  const testAdminRoute = async () => {
    setAdminTestStatus(null);
    try {
      const res = await fetch('/api/auth/admin-only', {
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAdminTestStatus({ type: 'success', message: `✅ Admin Access Granted: ${data.message}` });
      } else {
        setAdminTestStatus({ type: 'error', message: `🔒 ${data.message || 'Forbidden: requireAdmin blocked this route'}` });
      }
    } catch (err) {
      setAdminTestStatus({ type: 'error', message: `Connection error: ${err.message}` });
    }
  };

  const handleRefreshProfile = async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  };

  return (
    <div className="dashboard-container">
      {/* Athlete ID Card Hero */}
      <div className="id-card-hero">
        <div className="id-card-header">
          <div className="id-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span>Verified Campus Clash Athlete Credential</span>
          </div>

          <span className={`role-pill ${user.role}`}>
            {user.role === 'admin' ? '🛡️ Tournament Admin' : '⚡ Player Member'}
          </span>
        </div>

        <div className="profile-avatar-wrap">
          <div className="profile-avatar">{user.profile_photo ? <img src={user.profile_photo} alt={`${user.name}'s profile`} /> : initials}</div>
          <div className="profile-info">
            <h2>{user.name}</h2>
            <div className="profile-sub">
              <span><strong>ID:</strong> {user.college_id}</span>
              <span>•</span>
              <span>{user.department}</span>
              <span>•</span>
              <span>{user.year}</span>
            </div>
          </div>
        </div>

        <div className="details-grid">
          <div className="detail-item">
            <div className="detail-label">College ID</div>
            <div className="detail-value">{user.college_id}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Department / Branch</div>
            <div className="detail-value">{user.department}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Email Contact</div>
            <div className="detail-value" style={{ fontSize: '0.95rem' }}>{user.email}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Phone</div>
            <div className="detail-value">{user.phone}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Account Role</div>
            <div className="detail-value" style={{ textTransform: 'capitalize' }}>{user.role}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Session Token Storage</div>
            <div className="detail-value" style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>
              In-Memory Context (Safe)
            </div>
          </div>
        </div>

        {/* Registered / Administered Sports */}
        {user.sports && user.sports.length > 0 && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div className="detail-label" style={{ marginBottom: '0.6rem' }}>
              {user.role === 'admin' ? '🛡️ Administered Sports' : '🏅 Registered Sports'}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {user.sports.map((sp) => (
                <span key={sp} className={`role-pill ${user.role === 'admin' ? 'admin' : 'player'}`} style={{ fontSize: '0.85rem' }}>
                  {sp}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={handleRefreshProfile}
            disabled={refreshing}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? 'Refreshing...' : 'Verify GET /api/auth/me'}
          </button>

          <button 
            className="btn btn-secondary btn-sm"
            onClick={testAdminRoute}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Test Admin Middleware Guard
          </button>
        </div>

        {adminTestStatus && (
          <div style={{ marginTop: '1rem' }}>
            <Alert type={adminTestStatus.type} message={adminTestStatus.message} />
          </div>
        )}
      </div>

      {/* Quick Action Preview for Subsequent Tournament Prompts */}
      <div>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          TOURNAMENT WORKSPACE
        </h3>
        <div className="actions-row">
          <div className="action-card">
            <div>
              <h3>
                <span style={{ color: 'var(--accent-cyan)' }}>⚽</span> 
                Create or Manage Squad
              </h3>
              <p>Form a squad with your classmates, assign team positions, or view your current roster.</p>
            </div>
            <button 
              className="btn btn-primary btn-sm" 
              style={{ width: '100%' }}
              onClick={() => onNavigate && onNavigate('my-team')}
            >
              Go to My Team →
            </button>
          </div>

          <div className="action-card">
            <div>
              <h3>
                <span style={{ color: 'var(--accent-amber)' }}>🏆</span> 
                Live Match Scores
              </h3>
              <p>Real-time match scores updated live by tournament referees and admins.</p>
            </div>
            <button 
              className="btn btn-primary btn-sm" 
              style={{ width: '100%' }}
              onClick={() => onNavigate && onNavigate(user.role === 'admin' ? 'admin-dashboard' : 'leaderboard')}
            >
              {user.role === 'admin' ? 'Go to Admin Desk →' : 'View Live Scores →'}
            </button>
          </div>

          <div className="action-card">
            <div>
              <h3>
                <span style={{ color: 'var(--accent-purple)' }}>📊</span> 
                Tournament Leaderboard
              </h3>
              <p>League points tables, fixtures, knockout rounds, and championship standings.</p>
            </div>
            <button 
              className="btn btn-primary btn-sm" 
              style={{ width: '100%' }}
              onClick={() => onNavigate && onNavigate('scorehub')}
            >
              Open ScoreHub →
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone: Permanent Account Deletion */}
      <div style={{ marginTop: '2.5rem', borderTop: '1px solid rgba(255, 77, 77, 0.2)', paddingTop: '1.5rem' }}>
        <div style={{ background: 'rgba(255, 68, 68, 0.05)', border: '1px solid rgba(255, 68, 68, 0.25)', borderRadius: '12px', padding: '1.25rem' }}>
          <h4 style={{ color: '#ff4d4d', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem' }}>
            ⚠️ Danger Zone — Permanent Account Deletion
          </h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.5', margin: '0 0 1rem 0' }}>
            <strong>Note:</strong> To simply leave your session on this computer, use <strong>Sign Out</strong> in the top menu. <br />
            Clicking <strong>Permanently Delete Account</strong> below will completely erase your player profile, team memberships, sports data, and chat history from the tournament database forever.
          </p>
          <button 
            className="btn btn-danger btn-sm"
            onClick={() => setShowDeleteModal(true)}
            style={{ width: 'auto' }}
          >
            🗑️ Permanently Delete My Account
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showDeleteModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <div 
            style={{
              backgroundColor: 'var(--bg-card, #121c26)',
              border: '1px solid rgba(255, 77, 77, 0.4)',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ color: '#ff4d4d', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🗑️ Delete Account Permanently?
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: '1.6' }}>
              Are you sure you want to permanently delete the account for <strong>{user.name}</strong> (College ID: <code>{user.college_id}</code>)?
            </p>
            <div style={{ background: 'rgba(255, 77, 77, 0.1)', borderLeft: '3px solid #ff4d4d', padding: '0.75rem', borderRadius: '4px', margin: '1rem 0', fontSize: '0.85rem', color: '#ffaaaa' }}>
              This will permanently wipe all your athlete profiles, squad memberships, and statistics. <strong>This action cannot be undone.</strong>
            </div>

            {deleteError && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert type="error" message={deleteError} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{ width: 'auto' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleDeleteAccount}
                disabled={deleting}
                style={{ width: 'auto' }}
              >
                {deleting ? 'Deleting...' : 'Yes, Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

