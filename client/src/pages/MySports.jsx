import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { SPORT_LIST, emptyProfile, formatSportProfile } from '../utils/sportRoles';
import { SportRoleFields } from '../components/SportRoleFields';
import { getAuthHeaders } from '../utils/authFetch';

export const MySports = () => {
  const { token, user } = useAuth();
  const [sports, setSports] = useState([]);
  const [sportProfiles, setSportProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;

    setLoading(true);
    Promise.all([
      fetch('/api/player-sports/mine', {
        headers: getAuthHeaders(token)
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load sports');
        return data.sports || [];
      }),
      fetch('/api/player-sports/profiles', {
        headers: getAuthHeaders(token)
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load profiles');
        return data.profiles || {};
      })
    ])
      .then(([userSports, userProfiles]) => {
        setSports(userSports);
        setSportProfiles(userProfiles);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const toggleSport = (sport) => {
    setSports((prev) => {
      if (prev.includes(sport)) {
        return prev.filter((item) => item !== sport);
      } else {
        // Initialize an empty profile for this sport if not already present
        if (!sportProfiles[sport]) {
          setSportProfiles((p) => ({
            ...p,
            [sport]: emptyProfile(sport)
          }));
        }
        return [...prev, sport];
      }
    });
  };

  const handleProfileFieldChange = (sport, field, value) => {
    setSportProfiles((prev) => ({
      ...prev,
      [sport]: {
        ...(prev[sport] || emptyProfile(sport)),
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    setError('');
    setMessage('');

    if (sports.length === 0) {
      setError('Please select at least one sport.');
      return;
    }

    setSaving(true);
    try {
      // 1. Update registered sports list
      const sportsRes = await fetch('/api/player-sports/mine', {
        method: 'PUT',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sports })
      });
      const sportsData = await sportsRes.json();
      if (!sportsRes.ok || !sportsData.success) {
        throw new Error(sportsData.message || 'Failed to update registered sports');
      }

      // 2. Prepare only profiles for selected sports
      const activeProfiles = {};
      for (const s of sports) {
        if (sportProfiles[s]) {
          activeProfiles[s] = sportProfiles[s];
        }
      }

      // 3. Batch save sport profiles
      if (Object.keys(activeProfiles).length > 0) {
        const profRes = await fetch('/api/player-sports/profiles/batch', {
          method: 'PUT',
          headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ profiles: activeProfiles })
        });
        const profData = await profRes.json();
        if (!profRes.ok || !profData.success) {
          throw new Error(profData.message || 'Failed to save sport role attributes');
        }
        setSportProfiles((prev) => ({ ...prev, ...profData.profiles }));
      }

      setSports(sportsData.sports);
      setMessage('✅ Your registered sports and playing roles have been updated successfully!');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  /* Sports management is available for all account types (players and admins) */

  if (loading) {
    return (
      <div className="auth-card" style={{ maxWidth: '780px', margin: '2rem auto', textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--accent-cyan)' }}>Loading your registered sports and roles...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div className="auth-header" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span>🏅</span>
          <span>My Sports & Playing Roles</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Select the sports you compete in and configure your specific playing roles, positions, and styles.
          Captains and coaches will see these details when assembling tournament teams.
        </p>
      </div>

      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      {/* Sport Selector Pills */}
      <div className="auth-card" style={{ maxWidth: '100%', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Available Tournament Sports</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Check or uncheck sports to enroll in tournaments (maximum 10 sports).
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          {SPORT_LIST.map((sport) => {
            const isSelected = sports.includes(sport);
            return (
              <label
                key={sport}
                className={`role-pill ${isSelected ? 'player' : 'admin'}`}
                style={{
                  cursor: 'pointer',
                  userSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 0.9rem',
                  fontSize: '0.9rem',
                  border: isSelected ? '1px solid var(--accent-cyan)' : '1px solid rgba(255,255,255,0.1)'
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSport(sport)}
                  style={{ accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                />
                <span>{sport}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Role Details Accordion / Cards for each selected sport */}
      {sports.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--text-secondary)' }}>
            Playing Roles & Attributes ({sports.length} Selected)
          </h3>

          {sports.map((sport) => {
            const currentProfile = sportProfiles[sport] || emptyProfile(sport);
            const summaryLabels = formatSportProfile(sport, currentProfile);

            return (
              <div
                key={sport}
                className="auth-card"
                style={{
                  maxWidth: '100%',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    paddingBottom: '0.75rem',
                    marginBottom: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.3rem' }}>
                      {sport === 'Cricket'
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
                        : '♟️'}
                    </span>
                    <strong style={{ fontSize: '1.1rem', color: '#fff' }}>{sport}</strong>
                  </div>

                  {summaryLabels.length > 0 ? (
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {summaryLabels.map((tag, i) => (
                        <span
                          key={i}
                          style={{
                            background: 'rgba(0, 242, 254, 0.12)',
                            color: 'var(--accent-cyan)',
                            border: '1px solid rgba(0, 242, 254, 0.25)',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Role not specified yet
                    </span>
                  )}
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Define your playing position and attributes for {sport}:
                </p>

                <SportRoleFields
                  sport={sport}
                  profile={currentProfile}
                  onChange={(field, value) => handleProfileFieldChange(sport, field, value)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Save Button */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem' }}>
        <button
          className="btn btn-primary"
          style={{ width: 'auto', padding: '0.75rem 2rem', fontSize: '1rem' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving Sports & Roles...' : '💾 Save Sports & Roles'}
        </button>
      </div>
    </div>
  );
};
