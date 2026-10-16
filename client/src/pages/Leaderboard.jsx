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
      <div className="dashboard-container" style={{ maxWidth: '960px' }}>
        <div className="skeleton" style={{ height: 90, marginBottom: '1.25rem' }} />
        <div className="chip-row" style={{ marginBottom: '1.25rem' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ width: 90, height: 40, borderRadius: '9999px' }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 260 }} />
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

      <div className="chip-row" style={{ marginBottom: '1.25rem' }}>
        {['Badminton', 'Table Tennis', 'Cricket', 'Football', 'Other'].map((sport) => (
          <button
            key={sport}
            type="button"
            className={`sport-chip ${selectedSport === sport ? 'active' : ''}`}
            onClick={() => setSelectedSport(sport)}
          >
            {sport}
          </button>
        ))}
      </div>
      {selectedSport === 'Other' && (
        <div className="form-group" style={{ maxWidth: '320px', marginBottom: '1rem' }}>
          <label className="form-label">Custom sport leaderboard</label>
          <input className="form-input no-icon" placeholder="Enter sport name" value={customSport} onChange={(e) => setCustomSport(e.target.value)} />
        </div>
      )}
      <div className="form-group" style={{ maxWidth: '420px', marginBottom: '1.5rem' }}>
        <label className="form-label">Search team name</label>
        <input className="form-input no-icon" placeholder="Type a team name" value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} />
      </div>

      <Alert type="error" message={error} />

      {visibleLeaderboard.length === 0 ? (
        <div className="auth-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>{leaderboard.length ? 'No teams match that search.' : `No ${selectedSport === 'Other' ? customSport || 'custom sport' : selectedSport} teams have scored yet. Check back once matches begin.`}</p>
        </div>
      ) : (
        <div className="scorehub-table-wrap">
          <table className="scorehub-table">
            <thead>
              <tr>
                <th style={{ width: 60, textAlign: 'center' }}>Rank</th>
                <th>Team</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>Diff</th>
                <th style={{ textAlign: 'right' }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {visibleLeaderboard.map((row) => (
                <tr
                  key={row.team_id}
                  onClick={() => onNavigate && onNavigate('team-profile', row.team_id)}
                  style={{
                    cursor: 'pointer',
                    background: flashedTeams[row.team_id] ? 'var(--lime-soft)' : undefined
                  }}
                >
                  <td style={{ textAlign: 'center', fontWeight: 800 }}>
                    {row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : `#${row.rank}`}
                  </td>
                  <td>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{row.team_name}</strong>
                  </td>
                  <td>{row.played ?? row.matches_recorded}</td>
                  <td>{row.wins ?? 0}</td>
                  <td>{row.draws ?? 0}</td>
                  <td>{row.losses ?? 0}</td>
                  <td>{row.score_difference > 0 ? `+${row.score_difference}` : (row.score_difference ?? 0)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <strong style={{ color: 'var(--lime)', fontSize: '1.1rem', fontFamily: 'var(--font-heading)' }}>
                      {row.total_points}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
