import React, { useState, useEffect, useRef } from 'react';
import { Alert } from '../components/Alert';
import { useSocket } from '../context/SocketContext';

export const Leaderboard = ({ onNavigate }) => {
  const { socket } = useSocket();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [flashedTeams, setFlashedTeams] = useState({});
  const [selectedSport, setSelectedSport] = useState('Football');
  const [customSport, setCustomSport] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const prevRanksRef = useRef({});

  const applyLeaderboard = (data) => {
    // Figure out which teams moved rank since last time, so we can flash them
    const newFlashed = {};
    data.forEach((row) => {
      const prevRank = prevRanksRef.current[row.team_id];
      if (prevRank !== undefined && prevRank !== row.rank) {
        newFlashed[row.team_id] = true;
      }
    });

    setFlashedTeams(newFlashed);
    setLeaderboard(data);
    setLastUpdated(new Date());

    const ranksMap = {};
    data.forEach((row) => { ranksMap[row.team_id] = row.rank; });
    prevRanksRef.current = ranksMap;

    if (Object.keys(newFlashed).length > 0) {
      setTimeout(() => setFlashedTeams({}), 1500);
    }
  };

  useEffect(() => {
    let socket;

    const fetchInitial = async () => {
      setLoading(true);
      setError('');
      try {
        const sportToLoad = selectedSport === 'Other' ? customSport.trim() : selectedSport;
        if (!sportToLoad) { setLeaderboard([]); setLoading(false); return; }
        const res = await fetch(`/api/leaderboard?sport=${encodeURIComponent(sportToLoad)}`);
        const data = await res.json();
        if (res.ok && data.success) {
          applyLeaderboard(data.leaderboard);
        } else {
          setError(data.message || 'Failed to load leaderboard');
        }
      } catch (err) {
        setError('Connection error loading leaderboard: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInitial();

    if (socket) {
      const onUpdate = (data) => {
        if (Array.isArray(data)) applyLeaderboard(data);
        else if (data.sport === (selectedSport === 'Other' ? customSport.trim() : selectedSport))
          applyLeaderboard(data.leaderboard || []);
      };
      socket.on('leaderboard:update', onUpdate);
      return () => socket.off('leaderboard:update', onUpdate);
    }
  }, [selectedSport, customSport, socket]);

  const visibleLeaderboard = leaderboard.filter((row) => row.team_name.toLowerCase().includes(teamSearch.trim().toLowerCase()));

  if (loading) {
    return (
      <div className="auth-card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--accent-cyan)' }}>Loading leaderboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ maxWidth: '960px' }}>
      <div className="auth-header" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
        <h1>🏆 Live Leaderboard</h1>
        <p>
          Standings update automatically as scores come in — no refresh needed.
          <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Win = 3 pts · Draw = 1 pt · Score difference breaks ties.</span>
          {lastUpdated && (
            <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {['Badminton', 'Table Tennis', 'Cricket', 'Football', 'Other'].map((sport) => (
          <button key={sport} className={`btn btn-sm ${selectedSport === sport ? 'btn-primary' : 'btn-secondary'}`} style={{ width: 'auto' }} onClick={() => setSelectedSport(sport)}>
            {sport}
          </button>
        ))}
      </div>
      {selectedSport === 'Other' && (
        <div className="form-group" style={{ maxWidth: '320px' }}>
          <label className="form-label">Custom sport leaderboard</label>
          <input className="form-input no-icon" placeholder="Enter sport name" value={customSport} onChange={(e) => setCustomSport(e.target.value)} />
        </div>
      )}
      <div className="form-group" style={{ maxWidth: '420px' }}>
        <label className="form-label">Search team name</label>
        <input className="form-input no-icon" placeholder="Type a team name" value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} />
      </div>

      <Alert type="error" message={error} />

      {visibleLeaderboard.length === 0 ? (
        <div className="auth-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>{leaderboard.length ? 'No teams match that search.' : `No ${selectedSport === 'Other' ? customSport || 'custom sport' : selectedSport} teams have scored yet. Check back once matches begin.`}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {visibleLeaderboard.map((row) => (
            <div
              key={row.team_id}
              onClick={() => onNavigate && onNavigate('team-profile', row.team_id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '48px 1fr auto',
                alignItems: 'center',
                gap: '1rem',
                background: flashedTeams[row.team_id] ? 'rgba(0, 242, 254, 0.15)' : 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem 1.25rem',
                transition: 'background 1.2s ease',
                cursor: 'pointer'
              }}
            >
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: row.rank === 1
                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                  : row.rank === 2
                  ? 'linear-gradient(135deg, #94a3b8, #64748b)'
                  : row.rank === 3
                  ? 'linear-gradient(135deg, #b45309, #78350f)'
                  : 'rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                color: '#fff'
              }}>
                {row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : `#${row.rank}`}
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff' }}>
                  {row.team_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  P {row.played ?? row.matches_recorded} · W {row.wins ?? 0} · D {row.draws ?? 0} · L {row.losses ?? 0} · Diff {row.score_difference > 0 ? '+' : ''}{row.score_difference ?? 0}
                </div>
              </div>

              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--accent-emerald)' }}>
                {row.total_points} pts
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
