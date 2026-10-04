import React, { useState, useEffect } from 'react';
import { Alert } from '../components/Alert';

export const TeamProfile = ({ teamId, onNavigate }) => {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!teamId) return;
    const fetchTeam = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/teams/${teamId}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setTeam(data.team);
        } else {
          setError(data.message || 'Failed to load team profile');
        }
      } catch (err) {
        setError('Connection error loading team profile: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTeam();
  }, [teamId]);

  if (!teamId) {
    return (
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h2>No Team Selected</h2>
        <p style={{ margin: '1rem 0', color: 'var(--text-secondary)' }}>
          Pick a team from the leaderboard to view its profile.
        </p>
        <button className="btn btn-primary" onClick={() => onNavigate && onNavigate('leaderboard')}>
          Go to Leaderboard
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="auth-card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--accent-cyan)' }}>Loading team profile...</p>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <Alert type="error" message={error || 'Team not found'} />
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginTop: '1rem' }}
          onClick={() => onNavigate && onNavigate('leaderboard')}
        >
          Back to Leaderboard
        </button>
      </div>
    );
  }

  const totalPoints = (team.scores || []).reduce((sum, s) => sum + (s.points || 0), 0);

  return (
    <div className="dashboard-container" style={{ maxWidth: '960px' }}>
      <div className="id-card-hero">
        <div className="id-card-header">
          <div className="id-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span>TEAM PROFILE</span>
          </div>
          {team.locked && <span className="role-pill admin">🔒 LOCKED</span>}
        </div>

        <div className="profile-avatar-wrap">
          <div className="profile-avatar" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
            ⚽
          </div>
          <div className="profile-info">
            <h2>{team.name}</h2>
            <div className="profile-sub">
              <span>{team.members ? team.members.length : 0} Roster Athletes</span>
              <span>•</span>
              <span>{totalPoints} Total Points</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          ROSTER ({team.members ? team.members.length : 0})
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1rem'
        }}>
          {team.members && team.members.length > 0 ? (
            team.members.map((m, i) => (
              <div
                key={m.id || i}
                onClick={() => m.member_user_id && onNavigate && onNavigate('player-profile', m.member_user_id)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  cursor: m.member_user_id ? 'pointer' : 'default'
                }}
              >
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  color: '#fff'
                }}>
                  {i === 0 ? '👑' : `#${i + 1}`}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#fff' }}>{m.member_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>
                    {m.position || 'Player'}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>No members registered.</p>
          )}
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          MATCH-BY-MATCH SCORE HISTORY
        </h3>
        {team.scores && team.scores.length > 0 ? (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}>
            <table style={{ width: '100%', minWidth: '380px', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Match</th>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Points</th>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {team.scores.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '1rem', fontWeight: 600, color: '#fff' }}>{s.match_name}</td>
                    <td style={{ padding: '1rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>{s.points} pts</td>
                    <td style={{ padding: '1rem' }}>
                      <span className={`role-pill ${s.match_status === 'live' ? 'admin' : 'player'}`}>
                        {s.match_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="auth-card" style={{ textAlign: 'center', padding: '1.5rem' }}>
            <p style={{ color: 'var(--text-muted)' }}>No scores recorded for this team yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};
