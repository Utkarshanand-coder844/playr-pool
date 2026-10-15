import React from 'react';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute = ({ children, onNavigate }) => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h2>Authentication Required</h2>
        <p style={{ margin: '1rem 0', color: 'var(--text-secondary)' }}>
          Please sign in with your College ID to view this section.
        </p>
        <button 
          className="btn btn-primary"
          onClick={() => onNavigate('login')}
        >
          Go to Sign In
        </button>
      </div>
    );
  }

  return children;
};

/**
 * AdminRoute
 * Guards admin-dashboard access. Allows:
 * 1. Global super admins (role === 'admin')
 * 2. Tournament admins (users who manage at least one tournament — checked async)
 * 
 * The component checks for tournament admin status on mount using the API,
 * so tournament admins are not blocked from the dashboard.
 */
export const AdminRoute = ({ children, onNavigate }) => {
  const { isAuthenticated, user, token } = useAuth();
  const [checking, setChecking] = React.useState(true);
  const [hasTournamentAccess, setHasTournamentAccess] = React.useState(false);

  React.useEffect(() => {
    if (!isAuthenticated || !token) {
      setChecking(false);
      return;
    }
    // Super admins always have access
    if (user?.role === 'admin') {
      setHasTournamentAccess(true);
      setChecking(false);
      return;
    }
    // Check if user manages any tournament
    const checkAccess = async () => {
      try {
        const res = await fetch('/api/tournaments/mine', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-authorization': `Bearer ${token}`,
            'x-access-token': token
          }
        });
        const data = await res.json();
        if (res.ok && data.success && data.tournaments?.length > 0) {
          setHasTournamentAccess(true);
        }
      } catch { /* ignore */ }
      setChecking(false);
    };
    checkAccess();
  }, [isAuthenticated, token, user?.role]);

  // Not logged in at all
  if (!isAuthenticated) {
    return (
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h2>Authentication Required</h2>
        <p style={{ margin: '1rem 0', color: 'var(--text-secondary)' }}>
          Please sign in with your College ID to view this section.
        </p>
        <button className="btn btn-primary" onClick={() => onNavigate('login')}>
          Go to Sign In
        </button>
      </div>
    );
  }

  // Still checking tournament access
  if (checking) {
    return (
      <div className="auth-card" style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>Checking access…</div>
      </div>
    );
  }

  // Logged in but no admin access
  if (!hasTournamentAccess) {
    return (
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
        <h2 style={{ color: 'var(--danger, #ef4444)' }}>Access Denied</h2>
        <p style={{ margin: '1rem 0', color: 'var(--text-secondary)' }}>
          This section is reserved for tournament administrators. Create a tournament or get promoted to admin by a tournament owner.
        </p>
        <button className="btn btn-primary" onClick={() => onNavigate('tournaments')}>
          Browse Tournaments
        </button>
        <button className="btn btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={() => onNavigate('dashboard')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  return children;
};
