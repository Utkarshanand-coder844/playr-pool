import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from '../components/Alert';

export const ScoreHub = () => {
  const [sport, setSport] = useState('Football');
  const [format, setFormat] = useState('league');
  const [knockoutFixtures, setKnockoutFixtures] = useState([]);
  const [leagueFixtures, setLeagueFixtures] = useState([]);
  const [standings, setStandings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = async () => {
      setLoading(true); setError('');
      try {
        const [bracketResponse, leaderboardResponse, matchesResponse] = await Promise.all([
          fetch(`/api/brackets?sport=${encodeURIComponent(sport)}`),
          fetch(`/api/leaderboard?sport=${encodeURIComponent(sport)}`),
          fetch('/api/matches')
        ]);
        const [bracketData, leaderboardData, matchesData] = await Promise.all([bracketResponse.json(), leaderboardResponse.json(), matchesResponse.json()]);
        if (!bracketResponse.ok || !bracketData.success) throw new Error(bracketData.message || 'Unable to load knockout fixtures');
        if (!leaderboardResponse.ok || !leaderboardData.success) throw new Error(leaderboardData.message || 'Unable to load league standings');
        if (!matchesResponse.ok || !matchesData.success) throw new Error(matchesData.message || 'Unable to load league fixtures');
        const bracketItems = bracketData.fixtures || [];
        const knockoutMatchIds = new Set(bracketItems.map((fixture) => fixture.match_id));
        setKnockoutFixtures(bracketItems);
        setStandings(leaderboardData.leaderboard || []);
        setLeagueFixtures((matchesData.matches || []).filter((match) => match.sport === sport && !knockoutMatchIds.has(match.id)));
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    };
    load();
  }, [sport]);
  const rounds = useMemo(() => knockoutFixtures.reduce((result, fixture) => { (result[fixture.round_number] ||= []).push(fixture); return result; }, {}), [knockoutFixtures]);
  return (
    <div className="dashboard-container" style={{ maxWidth: '1080px' }}>
      <div className="auth-header" style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
        <h1>🏆 ScoreHub</h1>
        <p>Your tournament center for league standings, fixtures, knockout rounds, and results.</p>
      </div>

      <div className="chip-row" style={{ marginBottom: '1rem' }}>
        {['Badminton', 'Table Tennis', 'Cricket', 'Football'].map((item) => (
          <button
            key={item}
            type="button"
            className={`sport-chip ${sport === item ? 'active' : ''}`}
            onClick={() => setSport(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="scorehub-tabs" role="tablist" aria-label="Tournament format" style={{ marginBottom: '1.25rem' }}>
        <button
          role="tab"
          aria-selected={format === 'league'}
          className={`btn btn-sm ${format === 'league' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFormat('league')}
        >
          📊 League format
        </button>
        <button
          role="tab"
          aria-selected={format === 'knockout'}
          className={`btn btn-sm ${format === 'knockout' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFormat('knockout')}
        >
          🏁 Knockout format
        </button>
      </div>

      <Alert type="error" message={error} />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="skeleton" style={{ height: 60 }} />
          <div className="skeleton" style={{ height: 240 }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      ) : format === 'league' ? (
        <>
          <div className="scorehub-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1rem 0' }}>
            <div>
              <h2>League standings</h2>
              <p>Teams earn 3 points for a win and 1 point for a draw.</p>
            </div>
            <span className="role-pill player">{sport}</span>
          </div>

          {standings.length === 0 ? (
            <div className="auth-card" style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)' }}>No completed league matches have been recorded for {sport} yet.</p>
            </div>
          ) : (
            <div className="scorehub-table-wrap">
              <table className="scorehub-table">
                <thead>
                  <tr>
                    <th style={{ width: 60, textAlign: 'center' }}>#</th>
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
                  {standings.map((team) => (
                    <tr key={team.team_id}>
                      <td style={{ textAlign: 'center', fontWeight: 800 }}>{team.rank}</td>
                      <td>
                        <strong style={{ color: 'var(--text-primary)' }}>{team.team_name}</strong>
                      </td>
                      <td>{team.played}</td>
                      <td>{team.wins}</td>
                      <td>{team.draws}</td>
                      <td>{team.losses}</td>
                      <td>{team.score_difference > 0 ? `+${team.score_difference}` : team.score_difference}</td>
                      <td style={{ textAlign: 'right' }}>
                        <strong style={{ color: 'var(--lime)', fontSize: '1.05rem', fontFamily: 'var(--font-heading)' }}>
                          {team.total_points}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="scorehub-section-heading" style={{ margin: '1.75rem 0 1rem' }}>
            <div>
              <h2>League fixtures</h2>
              <p>Round-robin or group-stage fixtures created by the administrator.</p>
            </div>
          </div>

          {leagueFixtures.length === 0 ? (
            <div className="auth-card" style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)' }}>No league fixtures have been scheduled for {sport} yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {leagueFixtures.map((match) => (
                <div
                  key={match.id}
                  className={`match-board ${match.status === 'live' ? 'live' : ''}`}
                  data-sport={sport.toLowerCase()}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {match.status === 'live' ? <span className="live-badge">Live</span> : <span className="role-pill player">{match.status}</span>}
                    <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                      {match.team_a_name || 'TBD'} <em style={{ fontStyle: 'normal', color: 'var(--text-muted)' }}>vs</em> {match.team_b_name || 'TBD'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(match.match_date).toLocaleString()}</span>
                    {match.status !== 'upcoming' && (
                      <span className="score-big lime" style={{ fontSize: '1.4rem' }}>
                        {match.team_a_score ?? '-'} – {match.team_b_score ?? '-'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : knockoutFixtures.length === 0 ? (
        <div className="auth-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>No knockout format has been generated for {sport} yet.</p>
        </div>
      ) : (
        <div className="bracket-board">
          {Object.entries(rounds).map(([round, matches]) => (
            <section key={round} className="bracket-round">
              <h3 style={{ marginBottom: '0.75rem', color: 'var(--lime)' }}>Round {round}</h3>
              {matches.map((match) => (
                <div className="bracket-fixture" key={match.id} data-sport={sport.toLowerCase()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <strong>{match.team_a_name || 'TBD'}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>vs</span>
                    <strong>{match.team_b_name || 'TBD'}</strong>
                  </div>
                  <small style={{ color: 'var(--text-muted)' }}>
                    {match.status} · {new Date(match.match_date).toLocaleString()}
                  </small>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
