import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);

// ──────────────────────────────────────────────────────────────
// Mini sparkline chart (SVG)
// ──────────────────────────────────────────────────────────────
function Sparkline({ data = [], color = '#38bdf8', height = 40, width = 120 }) {
  if (!data.length || data.every(v => v === 0)) {
    return <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>—</div>;
  }
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * (width - 8) + 4;
    const y = height - 4 - ((v / max) * (height - 8));
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((v, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * (width - 8) + 4;
        const y = height - 4 - ((v / max) * (height - 8));
        return <circle key={i} cx={x} cy={y} r={3} fill={color} />;
      })}
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────
// Stat card (metric tile)
// ──────────────────────────────────────────────────────────────
function StatTile({ label, value, sub, color = 'var(--accent-cyan)', icon }) {
  return (
    <div style={{
      padding: '1.1rem 1.2rem',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      display: 'flex', flexDirection: 'column', gap: 4,
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 10, right: 12, fontSize: '1.4rem', opacity: 0.15 }}>{icon}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: '1.9rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Match history row
// ──────────────────────────────────────────────────────────────
function MatchRow({ match, onNavigate }) {
  const { match_name, sport, status, fantasy_points, stats, match_date, team_name } = match;
  const date = match_date ? new Date(match_date).toLocaleDateString() : '—';
  const fp = Math.round(fantasy_points || 0);

  // Build a compact stats string from the stats JSON
  const s = stats || {};
  let statStr = '';
  const sp = (sport || '').toLowerCase();
  if (sp.includes('cricket')) {
    const parts = [];
    if (s.runs !== undefined) parts.push(`${s.runs}R(${s.balls}B)`);
    if (s.wickets) parts.push(`${s.wickets}W`);
    if (s.catches) parts.push(`${s.catches}ct`);
    statStr = parts.join('  ');
  } else if (sp.includes('football')) {
    statStr = `${s.goals ?? 0}G  ${s.assists ?? 0}A`;
  } else if (sp.includes('basketball')) {
    statStr = `${s.points ?? 0}pts`;
  } else if (sp.includes('kabaddi')) {
    statStr = `${s.raidPoints ?? 0}R  ${s.tacklePoints ?? 0}T`;
  } else if (s.pointsWon !== undefined) {
    statStr = `${s.pointsWon ?? 0}pts`;
  } else {
    statStr = Object.entries(s).map(([k, v]) => `${k}: ${v}`).join('  ') || '—';
  }

  const fpColor = fp >= 50 ? '#f59e0b' : fp >= 30 ? '#10b981' : fp >= 10 ? '#38bdf8' : '#a1a1aa';
  const statusColor = status === 'LIVE' ? '#f43f5e' : status === 'COMPLETED' ? '#10b981' : '#71717a';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: 12,
      padding: '0.9rem 1rem',
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12,
      cursor: 'pointer',
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 700, color: '#f4f4f5', fontSize: '0.88rem' }}>{match_name || 'Match'}</span>
          <span style={{ fontSize: '0.62rem', fontWeight: 800, color: statusColor, background: `${statusColor}22`, border: `1px solid ${statusColor}44`, borderRadius: 100, padding: '0 6px', fontFamily: 'var(--font-mono)' }}>{status}</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {sport} · {team_name || '—'} · {date}
        </div>
        {statStr && (
          <div style={{ fontSize: '0.75rem', color: '#a1a1aa', fontFamily: 'var(--font-mono)', marginTop: 3 }}>{statStr}</div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.2rem', color: fpColor }}>{fp}</div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>FP</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Improvement trend indicator
// ──────────────────────────────────────────────────────────────
function TrendBadge({ trend = [] }) {
  if (trend.length < 2) return null;
  const last = trend[0];
  const prev = trend[1];
  const diff = last - prev;
  if (diff === 0) return <span style={{ color: '#71717a', fontSize: '0.78rem' }}>→ steady</span>;
  const up = diff > 0;
  return (
    <span style={{ color: up ? '#10b981' : '#f43f5e', fontSize: '0.78rem', fontWeight: 700 }}>
      {up ? '↑' : '↓'} {Math.abs(diff)} FP vs last match
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Main PlayerInsights page
// ──────────────────────────────────────────────────────────────
export function PlayerInsights({ playerId: propPlayerId, onNavigate }) {
  const { user } = useAuth();
  const playerId = propPlayerId || user?.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sport, setSport] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    if (!playerId) { setError('No player ID provided.'); setLoading(false); return; }
    try {
      const params = new URLSearchParams({ limit: 30 });
      if (sport) params.set('sport', sport);
      const res = await fetch(`/api/live-scoring/player/${playerId}/stats?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        setLastUpdated(new Date());
        setError('');
      } else {
        setError(json.message || 'Failed to load player stats');
      }
    } catch (e) {
      setError('Connection error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [playerId, sport]);

  useEffect(() => {
    fetchData();
    let socket;
    try {
      socket = io(SOCKET_URL);
      socket.on('player:stats_update', () => fetchData());
    } catch (_) {}
    return () => { if (socket) socket.disconnect(); };
  }, [fetchData]);

  const sports = ['Cricket', 'Football', 'Basketball', 'Kabaddi', 'Badminton', 'Table Tennis', 'Volleyball', 'Tennis'];

  if (!playerId) {
    return (
      <div className="dashboard-container" style={{ maxWidth: 800, textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>👤</div>
        <h2 style={{ color: '#f4f4f5' }}>Player Insights</h2>
        <p style={{ color: 'var(--text-muted)' }}>Please log in to view your personal insights.</p>
        {onNavigate && <button onClick={() => onNavigate('login')} className="btn btn-primary" style={{ marginTop: '1rem', width: 'auto' }}>Sign In</button>}
      </div>
    );
  }

  const { summary = {}, matches = [] } = data || {};
  const { totalMatches = 0, totalFantasyPoints = 0, avgFantasyPoints = 0, bestSingleMatchFP = 0, recentTrend = [] } = summary;

  // Build sparkline data from match history (reverse to show oldest first)
  const sparkData = [...matches].slice(0, 10).map(m => m.fantasy_points || 0).reverse();

  // Compute sport distribution for the donut-like stat
  const sportCounts = {};
  for (const m of matches) { sportCounts[m.sport || 'Unknown'] = (sportCounts[m.sport || 'Unknown'] || 0) + 1; }
  const topSport = Object.entries(sportCounts).sort((a, b) => b[1] - a[1])[0];

  // Improvement badge: compare last 5 avg vs prev 5 avg
  const last5Avg = matches.slice(0, 5).reduce((s, m) => s + (m.fantasy_points || 0), 0) / Math.max(matches.slice(0, 5).length, 1);
  const prev5Avg = matches.slice(5, 10).reduce((s, m) => s + (m.fantasy_points || 0), 0) / Math.max(matches.slice(5, 10).length, 1);
  const improvement = prev5Avg > 0 ? Math.round(((last5Avg - prev5Avg) / prev5Avg) * 100) : null;

  const isOwnProfile = user?.id === playerId;

  return (
    <div className="dashboard-container" style={{ maxWidth: 860 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          {onNavigate && (
            <button onClick={() => onNavigate('player-profile', playerId)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', marginBottom: 8, padding: 0 }}>
              ← Back to Profile
            </button>
          )}
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f4f4f5', margin: 0 }}>
            {isOwnProfile ? '📊 My Insights' : '📊 Player Insights'}
          </h1>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Fantasy points are derived in real-time from match events · Updated live
            {lastUpdated && ` · ${lastUpdated.toLocaleTimeString()}`}
          </div>
        </div>

        {/* Sport filter */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setSport('')}
            style={{ padding: '0.3rem 0.8rem', borderRadius: 100, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)', border: '1.5px solid', background: !sport ? 'rgba(56,189,248,0.15)' : 'transparent', color: !sport ? 'var(--accent-cyan)' : 'var(--text-muted)', borderColor: !sport ? 'rgba(56,189,248,0.4)' : 'transparent', transition: 'all 0.2s' }}
          >ALL</button>
          {sports.map(s => (
            <button key={s} onClick={() => setSport(s)}
              style={{ padding: '0.3rem 0.8rem', borderRadius: 100, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)', border: '1.5px solid', background: sport === s ? 'rgba(56,189,248,0.15)' : 'transparent', color: sport === s ? 'var(--accent-cyan)' : 'var(--text-muted)', borderColor: sport === s ? 'rgba(56,189,248,0.4)' : 'transparent', transition: 'all 0.2s' }}
            >{s}</button>
          ))}
        </div>
      </div>

      {error && <div style={{ color: '#f43f5e', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: 16, fontSize: '0.85rem' }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--accent-cyan)' }}>Loading insights...</div>
      ) : (
        <>
          {/* Summary Stat Tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatTile label="TOTAL FP" value={totalFantasyPoints} icon="⭐" color="#f59e0b" sub={`${totalMatches} match${totalMatches !== 1 ? 'es' : ''}`} />
            <StatTile label="AVG FP" value={avgFantasyPoints} icon="📊" color="var(--accent-cyan)" sub="per match" />
            <StatTile label="BEST MATCH" value={bestSingleMatchFP} icon="🏆" color="#a855f7" sub="all time" />
            <StatTile label="TOP SPORT" value={topSport?.[0] || '—'} icon="🎮" color="#10b981" sub={topSport ? `${topSport[1]} match${topSport[1] !== 1 ? 'es' : ''}` : ''} />
          </div>

          {/* Trend sparkline + improvement */}
          {matches.length > 1 && (
            <div style={{ padding: '1.1rem 1.25rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>RECENT FORM (last {Math.min(matches.length, 10)} matches)</div>
                <Sparkline data={sparkData} color={improvement > 0 ? '#10b981' : improvement < 0 ? '#f43f5e' : '#38bdf8'} height={44} width={140} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>IMPROVEMENT TREND</div>
                {improvement !== null ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 800, color: improvement > 0 ? '#10b981' : improvement < 0 ? '#f43f5e' : '#71717a' }}>
                      {improvement > 0 ? '+' : ''}{improvement}%
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>vs previous 5 matches</span>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Not enough data to compute trend.</div>
                )}
                <TrendBadge trend={recentTrend} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>LAST 5 AVG</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 800, color: improvement > 0 ? '#10b981' : improvement < 0 ? '#f43f5e' : '#38bdf8' }}>{Math.round(last5Avg)}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>FP / match</div>
              </div>
            </div>
          )}

          {/* Match History */}
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>
              MATCH HISTORY {sport ? `· ${sport}` : ''} {matches.length > 0 ? `(${matches.length})` : ''}
            </div>

            {matches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {sport ? `No ${sport} matches played yet.` : 'No matches recorded yet. Play some matches!'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 6 }}>Fantasy points accumulate as admins record actions with your player ID.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {matches.map((m, i) => (
                  <MatchRow key={m.id || i} match={m} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </div>

          {/* Footer note */}
          {matches.length > 0 && (
            <div style={{ marginTop: 24, padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              ℹ️ Fantasy points are derived automatically from live match events. They update in real-time and are fully rebuilt if an admin uses Undo or Reset — so your score always reflects the truth.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PlayerInsights;
