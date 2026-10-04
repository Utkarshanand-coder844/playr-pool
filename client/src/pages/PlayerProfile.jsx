import React, { useEffect, useState } from 'react';
import { Alert } from '../components/Alert';
import { useAuth } from '../context/AuthContext';
import { formatSportProfile } from '../utils/sportRoles';
import { getAuthHeaders } from '../utils/authFetch';

export const PlayerProfile = ({ playerId, onNavigate }) => {
  const { token, user } = useAuth();
  const [player, setPlayer] = useState(null);
  const [stats, setStats] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId || !token) return;

    setLoading(true);
    fetch(`/api/teams/players/${playerId}`, {
      headers: getAuthHeaders(token)
    })
      .then(async (res) => ({ res, data: await res.json() }))
      .then(({ res, data }) => {
        if (!res.ok || !data.success) throw new Error(data.message || 'Player not found');
        setPlayer(data.player);
        setStats(data.stats || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [playerId, token]);

  if (error) {
    return (
      <div className="auth-card" style={{ maxWidth: '640px', margin: '2rem auto' }}>
        <Alert type="error" message={error} />
        <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('my-team')}>
          ← Back to My Team
        </button>
      </div>
    );
  }

  if (loading || !player) {
    return (
      <div className="auth-card" style={{ textAlign: 'center', padding: '3rem', maxWidth: '640px', margin: '2rem auto' }}>
        <p style={{ color: 'var(--accent-cyan)' }}>Loading player athletic profile...</p>
      </div>
    );
  }

  const initials = player.name
    ? player.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'PL';

  const sportProfiles = player.sport_profiles || {};
  const sportsWithRoles = Object.keys(sportProfiles);

  return (
    <div className="dashboard-container" style={{ maxWidth: '820px', margin: '0 auto' }}>
      {/* ID Card Hero */}
      <div className="id-card-hero">
        <div className="id-card-header">
          <div className="id-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span>{player.role === 'admin' ? 'TOURNAMENT ADMIN' : 'REGISTERED ATHLETE'}</span>
          </div>
          <span className={`role-pill ${player.role === 'admin' ? 'admin' : 'player'}`}>{player.campus || 'Main Campus'}</span>
        </div>

        <div className="profile-avatar-wrap">
          <div className="profile-avatar">
            {player.profile_photo ? (
              <img src={player.profile_photo} alt={`${player.name}'s profile`} />
            ) : (
              initials
            )}
          </div>
          <div className="profile-info">
            <h2>{player.name}</h2>
            <div className="profile-sub">
              <span>{player.department}</span>
              <span>•</span>
              <span>{player.year}</span>
              <span>•</span>
              <span>ID: {player.college_id}</span>
            </div>
          </div>
        </div>

        <div className="details-grid">
          <div className="detail-item">
            <div className="detail-label">College ID</div>
            <div className="detail-value">{player.college_id}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Department</div>
            <div className="detail-value">{player.department}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Academic Year</div>
            <div className="detail-value">{player.year}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Email</div>
            <div className="detail-value">{player.email || '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Phone</div>
            <div className="detail-value">{player.phone || '—'}</div>
          </div>
        </div>
      </div>

      {/* Player Insights Quick Link */}
      {onNavigate && (
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            onClick={() => onNavigate('player-insights', playerId)}
            style={{
              padding: '0.6rem 1.2rem', borderRadius: 100, fontSize: '0.8rem', fontWeight: 700,
              fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 0.2s',
              background: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.35)',
              color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            📊 View Player Insights & Fantasy Points
          </button>
        </div>
      )}

      {/* Sport Roles & Positions Section */}
      <div className="auth-card" style={{ maxWidth: '100%', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{player.role === 'admin' ? '🛡️' : '🏅'}</span>
            <span>{player.role === 'admin' ? 'Administered & Registered Sports' : 'Registered Sports & Playing Roles'}</span>
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {sportsWithRoles.length} {sportsWithRoles.length === 1 ? 'Sport' : 'Sports'} Configured
          </span>
        </div>

        {sportsWithRoles.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
            <p>{player.role === 'admin' ? 'No sports assigned to this administrator yet.' : 'No sport role attributes have been set for this player yet.'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {sportsWithRoles.map((sport) => {
              const profile = sportProfiles[sport];
              const summaryTags = formatSportProfile(sport, profile);
              const sportIcon =
                sport === 'Cricket'
                  ? '🏏'
                  : sport === 'Football'
                  ? '⚽'
                  : sport === 'Basketball'
                  ? '🏀'
                  : sport === 'Volleyball'
                  ? '🏐'
                  : sport === 'Badminton'
                  ? '🏸'
                  : sport === 'Table Tennis'
                  ? '🏓'
                  : sport === 'Athletics'
                  ? '🏃'
                  : '♟️';

              return (
                <div
                  key={sport}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem 1.25rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.3rem' }}>{sportIcon}</span>
                      <strong style={{ fontSize: '1.05rem', color: '#fff' }}>{sport}</strong>
                    </div>
                  </div>

                  {summaryTags.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                      {summaryTags.map((tag, idx) => (
                        <span
                          key={idx}
                          style={{
                            background: 'rgba(0, 242, 254, 0.1)',
                            color: 'var(--accent-cyan)',
                            border: '1px solid rgba(0, 242, 254, 0.25)',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '12px',
                            fontSize: '0.78rem',
                            fontWeight: 600
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.8rem', color: player.role === 'admin' ? 'var(--accent-cyan)' : 'var(--text-muted)', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                      {player.role === 'admin' ? '🛡️ Tournament Administrator' : 'Enrolled (no specific role chosen)'}
                    </p>
                  )}

                  {/* Detailed Key-Value Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem', fontSize: '0.82rem' }}>
                    {profile.primary_role && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Primary Role:</span>
                        <span style={{ fontWeight: 600, color: '#fff' }}>{profile.primary_role}</span>
                      </div>
                    )}
                    {profile.position && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Position:</span>
                        <span style={{ fontWeight: 600, color: '#fff' }}>{profile.position}</span>
                      </div>
                    )}
                    {profile.batting_hand && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Batting Hand:</span>
                        <span style={{ fontWeight: 600, color: '#fff' }}>{profile.batting_hand}</span>
                      </div>
                    )}
                    {profile.bowling_style && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Bowling Style:</span>
                        <span style={{ fontWeight: 600, color: '#fff' }}>{profile.bowling_style}</span>
                      </div>
                    )}
                    {profile.preferred_foot && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Preferred Foot:</span>
                        <span style={{ fontWeight: 600, color: '#fff' }}>{profile.preferred_foot}</span>
                      </div>
                    )}
                    {profile.playing_style && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Playing Style:</span>
                        <span style={{ fontWeight: 600, color: '#fff' }}>{profile.playing_style}</span>
                      </div>
                    )}
                    {profile.handedness && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Hand:</span>
                        <span style={{ fontWeight: 600, color: '#fff' }}>{profile.handedness}</span>
                      </div>
                    )}
                    {profile.event_category && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Event / Format:</span>
                        <span style={{ fontWeight: 600, color: '#fff' }}>{profile.event_category}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tournament Performance Stats if available */}
      {stats && stats.length > 0 && (
        <div className="auth-card" style={{ maxWidth: '100%', marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>📊 Tournament Statistics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            {stats.map((st, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{st.stat_type}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-cyan)', marginTop: '0.2rem' }}>{st.value}</div>
                {st.match_name && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>vs {st.match_name}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
        {user && user.id !== player.id && (
          <button
            className="btn btn-primary btn-sm"
            style={{ width: 'fit-content' }}
            onClick={() => onNavigate('chat', player.id)}
          >
            💬 Message {player.name}
          </button>
        )}
        <button
          className="btn btn-secondary btn-sm"
          style={{ width: 'fit-content' }}
          onClick={() => onNavigate('my-team')}
        >
          ← Back to My Team
        </button>
      </div>
    </div>
  );
};
