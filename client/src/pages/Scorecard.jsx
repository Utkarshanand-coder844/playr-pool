import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);

// ──────────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────────
const sr = (runs, balls) => (balls > 0 ? ((runs / balls) * 100).toFixed(1) : '—');
const eco = (runs, legalBalls) => (legalBalls > 0 ? ((runs / legalBalls) * 6).toFixed(2) : '—');

const tagStyle = (color) => ({
  fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em',
  color, background: `${color}22`, border: `1px solid ${color}44`,
  borderRadius: 100, padding: '1px 6px', fontFamily: 'var(--font-mono)',
  display: 'inline-block'
});

const cell = { padding: '0.65rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.82rem', color: '#e4e4e7' };
const hdr  = { ...cell, color: '#71717a', fontFamily: 'var(--font-mono)', fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(255,255,255,0.025)', padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' };

// ──────────────────────────────────────────────────────────────
// Cricket Batting Table
// ──────────────────────────────────────────────────────────────
function BattingCard({ batting = [], teamName, totalRuns, wickets, oversFormatted, extras, yetToBat = [], fallOfWickets = [] }) {
  const realBatsmen = batting.filter(b => !b.isFieldingOnlyCredit && b.balls > 0);
  const extrasTot = extras ? Object.values(extras).reduce((s, v) => typeof v === 'number' ? s + v : s, 0) - (extras.total || 0) : 0;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0.75rem', background: 'rgba(56,189,248,0.08)', borderRadius: '10px 10px 0 0', border: '1px solid rgba(56,189,248,0.15)', borderBottom: 'none' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 2 }}>BATTING</div>
          <div style={{ fontWeight: 700, color: '#f4f4f5', fontSize: '0.95rem' }}>{teamName}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 800, color: '#f4f4f5', lineHeight: 1 }}>
            {totalRuns}/{wickets}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({oversFormatted} ov)</div>
        </div>
      </div>

      <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...hdr, textAlign: 'left', width: '35%' }}>BATTER</th>
              <th style={{ ...hdr, textAlign: 'center' }}>R</th>
              <th style={{ ...hdr, textAlign: 'center' }}>B</th>
              <th style={{ ...hdr, textAlign: 'center' }}>4s</th>
              <th style={{ ...hdr, textAlign: 'center' }}>6s</th>
              <th style={{ ...hdr, textAlign: 'center' }}>SR</th>
            </tr>
          </thead>
          <tbody>
            {realBatsmen.length === 0 && (
              <tr><td colSpan={6} style={{ ...cell, textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>No batting data yet</td></tr>
            )}
            {realBatsmen.map((b, i) => (
              <tr key={b.id || i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <td style={{ ...cell }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontWeight: 600, color: b.isOut ? '#e4e4e7' : '#f4f4f5' }}>{b.name}</span>
                      {b.isCaptain && <span style={tagStyle('#f59e0b')}>C</span>}
                      {b.isWK && <span style={tagStyle('#a855f7')}>WK</span>}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {b.dismissalText || 'not out'}
                    </div>
                    {(b.catches > 0 || b.stumpings > 0 || b.runOuts > 0) && (
                      <div style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: 1 }}>
                        {b.catches > 0 ? `${b.catches}c ` : ''}{b.stumpings > 0 ? `${b.stumpings}st ` : ''}{b.runOuts > 0 ? `${b.runOuts}ro` : ''}
                      </div>
                    )}
                  </div>
                </td>
                <td style={{ ...cell, textAlign: 'center', fontWeight: 800, fontFamily: 'var(--font-mono)', color: b.runs >= 50 ? '#f59e0b' : b.runs >= 30 ? 'var(--accent-cyan)' : '#f4f4f5', fontSize: '0.95rem' }}>{b.runs}</td>
                <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{b.balls}</td>
                <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>{b.fours}</td>
                <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', color: '#a855f7' }}>{b.sixes}</td>
                <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', color: '#a1a1aa', fontSize: '0.78rem' }}>{sr(b.runs, b.balls)}</td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
              <td style={{ ...cell, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Extras {extras && `(w ${extras.wides} nb ${extras.noBalls} b ${extras.byes} lb ${extras.legByes})`}
              </td>
              <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{extras?.total ?? extrasTot}</td>
              <td colSpan={4} />
            </tr>
            <tr style={{ background: 'rgba(56,189,248,0.06)' }}>
              <td style={{ ...cell, fontWeight: 800, color: '#f4f4f5' }}>TOTAL</td>
              <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#f4f4f5', fontSize: '1rem' }} colSpan={2}>{totalRuns}/{wickets} ({oversFormatted} Ov)</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>

        {yetToBat.length > 0 && (
          <div style={{ padding: '0.6rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginRight: 6 }}>YET TO BAT:</span>
            {yetToBat.map((p, i) => (
              <span key={p.id || i} style={{ fontSize: '0.78rem', color: '#a1a1aa', marginRight: 8 }}>{p.name}{i < yetToBat.length - 1 ? ',' : ''}</span>
            ))}
          </div>
        )}

        {fallOfWickets.length > 0 && (
          <div style={{ padding: '0.6rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>FALL OF WICKETS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {fallOfWickets.map((fow, i) => (
                <span key={i} style={{ fontSize: '0.72rem', color: '#a1a1aa', background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '2px 6px' }}>
                  {fow.wickets}-{fow.runs} ({fow.batsmanName}, {fow.overs})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Cricket Bowling Table
// ──────────────────────────────────────────────────────────────
function BowlingCard({ bowling = [], bowlingTeamName }) {
  const realBowlers = bowling.filter(b => b.legalBalls > 0 || b.wickets > 0 || b.runs > 0);
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ padding: '0.6rem 0.75rem', background: 'rgba(168,85,247,0.08)', borderRadius: '10px 10px 0 0', border: '1px solid rgba(168,85,247,0.15)', borderBottom: 'none' }}>
        <div style={{ fontSize: '0.7rem', color: '#a855f7', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 1 }}>BOWLING</div>
        <div style={{ fontWeight: 700, color: '#f4f4f5', fontSize: '0.95rem' }}>{bowlingTeamName}</div>
      </div>
      <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...hdr, textAlign: 'left', width: '35%' }}>BOWLER</th>
              <th style={{ ...hdr, textAlign: 'center' }}>O</th>
              <th style={{ ...hdr, textAlign: 'center' }}>M</th>
              <th style={{ ...hdr, textAlign: 'center' }}>R</th>
              <th style={{ ...hdr, textAlign: 'center' }}>W</th>
              <th style={{ ...hdr, textAlign: 'center' }}>ECO</th>
            </tr>
          </thead>
          <tbody>
            {realBowlers.length === 0 && (
              <tr><td colSpan={6} style={{ ...cell, textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>No bowling data yet</td></tr>
            )}
            {realBowlers.map((b, i) => (
              <tr key={b.id || i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <td style={{ ...cell, fontWeight: 600, color: '#f4f4f5' }}>
                  {b.name}
                  {b.wickets >= 5 && <span style={{ ...tagStyle('#f43f5e'), marginLeft: 4 }}>5W</span>}
                  {(b.wickets === 3 || b.wickets === 4) ? <span style={{ ...tagStyle('#f59e0b'), marginLeft: 4 }}>{b.wickets}W</span> : null}
                </td>
                <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{b.oversFormatted || '0.0'}</td>
                <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{b.maidens ?? 0}</td>
                <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', color: '#e4e4e7' }}>{b.runs ?? 0}</td>
                <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, color: b.wickets > 0 ? '#f43f5e' : '#a1a1aa', fontSize: '0.95rem' }}>{b.wickets ?? 0}</td>
                <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: (b.economy ?? parseFloat(eco(b.runs, b.legalBalls))) <= 5 ? '#10b981' : (b.economy ?? parseFloat(eco(b.runs, b.legalBalls))) >= 10 ? '#f43f5e' : '#a1a1aa' }}>
                  {b.economy ?? eco(b.runs, b.legalBalls)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CricketInningsCard({ innings, index, bowlingTeamName }) {
  if (!innings) return null;
  const batting = Object.values(innings.batsmen || {});
  const bowling = Object.values(innings.bowlers || {});
  return (
    <div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 12, letterSpacing: '0.08em', padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, display: 'inline-block' }}>
        INNINGS {index}
      </div>
      <BattingCard batting={batting} teamName={innings.teamName} totalRuns={innings.totalRuns} wickets={innings.wickets} oversFormatted={innings.oversFormatted} extras={innings.extras} yetToBat={innings.yetToBat} fallOfWickets={innings.fallOfWickets} />
      <BowlingCard bowling={bowling} bowlingTeamName={bowlingTeamName} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Generic Team Scorecard
// ──────────────────────────────────────────────────────────────
function GenericScorecard({ scorecard }) {
  const { teamA, teamB, players = [], timeline = [], resultText, sport } = scorecard;
  const s = String(sport || '').toLowerCase();

  const teamAPlayers = players.filter(p => String(p.teamId) === String(teamA?.id));
  const teamBPlayers = players.filter(p => String(p.teamId) === String(teamB?.id));

  const renderPlayerStats = (p) => {
    if (s.includes('football')) return `${p.stats.goals ?? 0}G  ${p.stats.assists ?? 0}A  ${p.stats.yellowCards ?? 0}Y  ${p.stats.redCards ?? 0}R`;
    if (s.includes('basketball')) return `${p.stats.points ?? 0}pts (${p.stats.threes ?? 0}×3  ${p.stats.twos ?? 0}×2  ${p.stats.freeThrows ?? 0}×1)  ${p.stats.fouls ?? 0}F`;
    if (s.includes('kabaddi')) return `${p.stats.raidPoints ?? 0}Raid  ${p.stats.tacklePoints ?? 0}Tackle  ${p.stats.bonusPoints ?? 0}Bonus`;
    if (s.includes('badminton') || s.includes('tennis') || s.includes('volleyball') || s.includes('tt')) return `${p.stats.pointsWon ?? 0}pts  ${p.stats.setsWon ?? 0}sets`;
    return `${p.stats.points ?? 0}pts`;
  };

  const renderTeamSection = (teamPlayers, teamName, teamScore) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(56,189,248,0.07)', borderRadius: '10px 10px 0 0', border: '1px solid rgba(56,189,248,0.15)', borderBottom: 'none' }}>
        <div style={{ fontWeight: 700, color: '#f4f4f5' }}>{teamName}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 800, color: '#f4f4f5' }}>{teamScore ?? 0}</div>
      </div>
      <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...hdr, textAlign: 'left' }}>PLAYER</th>
              <th style={{ ...hdr, textAlign: 'left' }}>STATS</th>
              <th style={{ ...hdr, textAlign: 'center' }}>FP</th>
            </tr>
          </thead>
          <tbody>
            {teamPlayers.length === 0 && <tr><td colSpan={3} style={{ ...cell, textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>No player data yet</td></tr>}
            {teamPlayers.map((p, i) => (
              <tr key={p.playerId || i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <td style={{ ...cell, fontWeight: 600, color: '#f4f4f5' }}>{p.name}</td>
                <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#a1a1aa' }}>{renderPlayerStats(p)}</td>
                <td style={{ ...cell, textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#f59e0b' }}>{Math.round(p.fantasyPoints ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      {renderTeamSection(teamAPlayers, teamA?.name || 'Team A', teamA?.score)}
      {renderTeamSection(teamBPlayers, teamB?.name || 'Team B', teamB?.score)}
      {resultText && (
        <div style={{ padding: '1rem', textAlign: 'center', background: 'rgba(16,185,129,0.1)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.3)', fontWeight: 800, color: 'var(--accent-emerald)', fontSize: '1rem' }}>
          🏆 {resultText}
        </div>
      )}
      {timeline.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 8 }}>MATCH TIMELINE</div>
          {timeline.map((ev, i) => (
            <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '5px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, borderLeft: '2px solid rgba(255,255,255,0.08)', marginBottom: 4 }}>
              {ev.text || ev.detail || '—'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Fantasy leaderboard within a match
// ──────────────────────────────────────────────────────────────
function MatchPlayerLeaderboard({ matchId }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!matchId) return;
    setLoading(true);
    fetch(`/api/live-scoring/${matchId}/player-stats`)
      .then(r => r.json())
      .then(d => { if (d.success) setPlayers(d.players || []); })
      .finally(() => setLoading(false));
  }, [matchId]);

  if (loading) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading...</div>;
  if (!players.length) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', fontStyle: 'italic' }}>No player data yet — admin must credit actions to real players.</div>;

  return (
    <div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 12, letterSpacing: '0.08em' }}>FANTASY POINTS LEADERBOARD</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {players.slice(0, 20).map((p, i) => (
          <div key={p.playerId || i} style={{
            display: 'grid', gridTemplateColumns: '36px 1fr auto',
            alignItems: 'center', gap: 10,
            padding: '0.7rem 0.9rem',
            background: i === 0 ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.025)',
            border: `1px solid ${i === 0 ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 10
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '0.78rem',
              background: i === 0 ? 'linear-gradient(135deg,#f59e0b,#d97706)' : i === 1 ? 'rgba(148,163,184,0.3)' : i === 2 ? 'rgba(180,83,9,0.3)' : 'rgba(255,255,255,0.07)',
              color: '#fff'
            }}>
              {i < 3 ? ['🥇','🥈','🥉'][i] : `${i+1}`}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#f4f4f5', fontSize: '0.88rem' }}>{p.name}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.sport}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#f59e0b', fontSize: '1.05rem' }}>{Math.round(p.fantasyPoints)}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>FP</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main Scorecard export
// ──────────────────────────────────────────────────────────────
export function Scorecard({ matchId, onNavigate }) {
  const [tab, setTab] = useState('scorecard');
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchScorecard = useCallback(async () => {
    if (!matchId) return;
    try {
      const res = await fetch(`/api/live-scoring/${matchId}/scorecard`);
      const data = await res.json();
      if (data.success) {
        setScorecard(data.scorecard);
        setLastUpdated(new Date());
        setError('');
      } else {
        setError(data.message || 'Failed to load scorecard');
      }
    } catch (e) {
      setError('Connection error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    fetchScorecard();
    let socket;
    try {
      socket = io(SOCKET_URL);
      socket.on('match:live_state', ({ matchId: mid }) => { if (mid === matchId) fetchScorecard(); });
      socket.on('match:live_update', ({ matchId: mid }) => { if (mid === matchId) fetchScorecard(); });
    } catch (_) {}
    return () => { if (socket) socket.disconnect(); };
  }, [matchId, fetchScorecard]);

  const tabStyle = (t) => ({
    padding: '0.55rem 1.2rem', borderRadius: 100,
    fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
    background: tab === t ? 'rgba(56,189,248,0.15)' : 'transparent',
    color: tab === t ? 'var(--accent-cyan)' : 'var(--text-muted)',
    border: `1.5px solid ${tab === t ? 'rgba(56,189,248,0.4)' : 'transparent'}`,
    cursor: 'pointer', transition: 'all 0.2s ease', letterSpacing: '0.05em'
  });

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--accent-cyan)' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🏏</div>Loading scorecard...
    </div>
  );

  if (error || !scorecard) return (
    <div style={{ textAlign: 'center', padding: '3rem', color: '#f43f5e' }}>
      {error || 'Scorecard not found.'}
      <br />
      <button onClick={fetchScorecard} style={{ marginTop: '1rem', padding: '0.5rem 1.2rem', borderRadius: 8, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e', cursor: 'pointer' }}>Retry</button>
    </div>
  );

  const isCricket = (scorecard.sport || '').toLowerCase().includes('cricket');
  const { innings1, innings2, target, resultText, teamA, teamB, timeline } = scorecard;

  return (
    <div className="dashboard-container" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          {onNavigate && (
            <button onClick={() => onNavigate('live-scoring')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', marginBottom: 8, padding: 0 }}>
              ← Back to Matches
            </button>
          )}
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f4f4f5', margin: 0 }}>📋 Scorecard</h1>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {scorecard.sport}{lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            {scorecard.status === 'LIVE' && <span style={{ marginLeft: 8, padding: '1px 8px', background: '#f43f5e', borderRadius: 100, fontSize: '0.65rem', fontWeight: 800, color: '#fff' }}>● LIVE</span>}
          </div>
        </div>
        {resultText && (
          <div style={{ padding: '0.5rem 1rem', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, fontWeight: 700, color: 'var(--accent-emerald)', fontSize: '0.88rem', maxWidth: 280 }}>
            🏆 {resultText}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        <button style={tabStyle('scorecard')} onClick={() => setTab('scorecard')}>📋 Scorecard</button>
        <button style={tabStyle('players')} onClick={() => setTab('players')}>⭐ Fantasy Points</button>
        {!isCricket && <button style={tabStyle('commentary')} onClick={() => setTab('commentary')}>📻 Timeline</button>}
      </div>

      {tab === 'scorecard' && (
        <div>
          {isCricket ? (
            <>
              <CricketInningsCard innings={innings1} index={1} bowlingTeamName={innings2?.teamName || ''} />
              {innings2 && (
                <>
                  {target && (
                    <div style={{ padding: '0.6rem 1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, marginBottom: 16, fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b' }}>
                      🎯 Target: {target} · Need {target - innings2.totalRuns} runs
                    </div>
                  )}
                  <CricketInningsCard innings={innings2} index={2} bowlingTeamName={innings1?.teamName || ''} />
                </>
              )}
            </>
          ) : (
            <GenericScorecard scorecard={scorecard} />
          )}
        </div>
      )}

      {tab === 'players' && <MatchPlayerLeaderboard matchId={matchId} />}

      {tab === 'commentary' && !isCricket && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(timeline || []).length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', fontStyle: 'italic' }}>No events recorded yet.</div>}
          {(timeline || []).map((ev, i) => (
            <div key={i} style={{ padding: '0.65rem 1rem', background: 'rgba(255,255,255,0.025)', borderRadius: 8, borderLeft: '3px solid rgba(56,189,248,0.3)', fontSize: '0.82rem', color: '#e4e4e7' }}>
              {ev.text || ev.detail || JSON.stringify(ev)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Scorecard;
