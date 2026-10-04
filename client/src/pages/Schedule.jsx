import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import { Alert } from '../components/Alert';

// Socket.io connects directly to the backend origin — Vite's dev proxy only
// forwards plain HTTP under /api, not the WebSocket upgrade Socket.io needs.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);
const SITE_URL = 'https://playr-pool-two.vercel.app';
const DEFAULT_TITLE = 'Playr-Pool — Official Sports Tournament Platform | Connect, Play, Conquer';

const scoreLabel = (score) => (score === null || score === undefined ? '-' : score);

function setMatchSchema(match) {
  let el = document.getElementById('match-jsonld');
  if (!el) { el = document.createElement('script'); el.id = 'match-jsonld'; el.type = 'application/ld+json'; document.head.appendChild(el); }
  const statusMap = { live: 'https://schema.org/EventScheduled', upcoming: 'https://schema.org/EventScheduled', completed: 'https://schema.org/EventCompleted' };
  el.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'SportsEvent',
    'name': `${match.team_a_name} vs ${match.team_b_name}`,
    'sport': match.sport || 'Football',
    'homeTeam': { '@type': 'SportsTeam', 'name': match.team_a_name },
    'awayTeam': { '@type': 'SportsTeam', 'name': match.team_b_name },
    'startDate': match.match_date,
    'eventStatus': statusMap[match.status] || 'https://schema.org/EventScheduled',
    'description': `${match.team_a_name} ${scoreLabel(match.team_a_score)} - ${scoreLabel(match.team_b_score)} ${match.team_b_name} | ${match.sport || 'Football'} on Playr-Pool`,
    'url': `${SITE_URL}/?match=${match.id}`,
    'organizer': { '@type': 'Organization', 'name': 'Playr-Pool', 'url': SITE_URL },
  });
}

function removeMatchSchema() {
  const el = document.getElementById('match-jsonld');
  if (el) el.remove();
}

export const Schedule = ({ focusMatchId }) => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('All');
  const [focusedId, setFocusedId] = useState(focusMatchId ? Number(focusMatchId) : null);
  const [copiedId, setCopiedId] = useState(null);
  const focusedRef = useRef(null);

  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/matches');
        const data = await res.json();
        if (res.ok && data.success) {
          setMatches(data.matches || []);
        } else {
          setError(data.message || 'Failed to load match schedule');
        }
      } catch (err) {
        setError('Connection error loading schedule: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchMatches();

    let socket;
    try {
      socket = io(SOCKET_URL);

      // A score was recorded/updated somewhere — patch just that team's score in place
      socket.on('match:score', ({ match_id, team_id, points }) => {
        setMatches((prev) => prev.map((m) => {
          if (m.id !== match_id) return m;
          if (m.team_a_id === team_id) return { ...m, team_a_score: points };
          if (m.team_b_id === team_id) return { ...m, team_b_score: points };
          return m;
        }));
      });

      // A match moved between upcoming / live / completed
      socket.on('match:status', ({ match_id, status }) => {
        setMatches((prev) => prev.map((m) => (m.id === match_id ? { ...m, status } : m)));
      });
    } catch (err) {
      console.warn('Socket connection failed, live match updates disabled:', err);
    }

    return () => { if (socket) socket.disconnect(); };
  }, []);

  // When focusedId changes: update title, inject schema, update URL
  useEffect(() => {
    if (!focusedId || matches.length === 0) return;
    const match = matches.find(m => m.id === focusedId);
    if (!match) return;
    const matchName = match.team_a_name && match.team_b_name ? `${match.team_a_name} vs ${match.team_b_name}` : (match.name || 'Match');
    const scoreStr = match.status !== 'upcoming' && match.team_a_name ? ` (${scoreLabel(match.team_a_score)}-${scoreLabel(match.team_b_score)})` : '';
    document.title = `${matchName}${scoreStr} | ${match.sport || 'Football'} – Playr-Pool`;
    if (match.team_a_name && match.team_b_name) setMatchSchema(match);
    const url = new URL(window.location.href);
    url.searchParams.set('match', focusedId);
    window.history.replaceState({}, '', url.toString());
    setTimeout(() => focusedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    return () => {
      document.title = DEFAULT_TITLE;
      removeMatchSchema();
      const url2 = new URL(window.location.href);
      url2.searchParams.delete('match');
      window.history.replaceState({}, '', url2.toString());
    };
  }, [focusedId, matches]);

  // Cleanup on unmount
  useEffect(() => () => { document.title = DEFAULT_TITLE; removeMatchSchema(); }, []);

  const handleCopyLink = (matchId, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${SITE_URL}/?match=${matchId}`).then(() => {
      setCopiedId(matchId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Matches "Team A" or "Team B" typed alone, or "Team A vs Team B" / "Team A v Team B" typed together
  const filteredMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesForSport = sportFilter === 'All' ? matches : matches.filter(match => match.sport === sportFilter);
    if (!q) return matchesForSport;

    const parts = q.split(/\s+(?:vs\.?|v\.?)\s+/i).map((p) => p.trim()).filter(Boolean);

    return matchesForSport.filter((m) => {
      const teamA = (m.team_a_name || '').toLowerCase();
      const teamB = (m.team_b_name || '').toLowerCase();
      const name = (m.name || '').toLowerCase();
      const sport = (m.sport || '').toLowerCase();

      if (parts.length >= 2) {
        // "Team A vs Team B" — match regardless of which side each team is listed on
        const [a, b] = parts;
        return (teamA.includes(a) && teamB.includes(b)) || (teamA.includes(b) && teamB.includes(a));
      }

      return teamA.includes(q) || teamB.includes(q) || name.includes(q) || sport.includes(q);
    });
  }, [matches, search, sportFilter]);

  if (loading) {
    return (
      <div className="auth-card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--accent-cyan)' }}>Loading schedule...</p>
      </div>
    );
  }

  const groups = [
    { key: 'live', label: '🔴 Live Now', matches: filteredMatches.filter(m => m.status === 'live'), showScore: true },
    { key: 'upcoming', label: '⚪ Upcoming', matches: filteredMatches.filter(m => m.status === 'upcoming'), showScore: false },
    {
      key: 'completed',
      label: '🟢 Match History',
      // Most recently played first, so history reads newest-to-oldest
      matches: filteredMatches.filter(m => m.status === 'completed').slice().sort((a, b) => new Date(b.match_date) - new Date(a.match_date)),
      showScore: true
    }
  ];

  const hasAnyMatches = matches.length > 0;
  const hasVisibleMatches = filteredMatches.length > 0;

  return (
    <div className="dashboard-container" style={{ maxWidth: '960px' }}>
      <div className="auth-header" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
        <h1>📅 Matches</h1>
        <p>Live scores, upcoming fixtures, and full match history — all in one place</p>
      </div>

      {hasAnyMatches && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <input
            className="form-input no-icon"
            placeholder="Search by team, e.g. 'Titans' or 'Titans vs Warriors'"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="form-select no-icon" value={sportFilter} onChange={(e) => setSportFilter(e.target.value)}><option>All</option>{[...new Set(matches.map(match => match.sport).filter(Boolean))].sort().map(item => <option key={item}>{item}</option>)}</select>
        </div>
      )}

      <Alert type="error" message={error} />

      {!hasAnyMatches ? (
        <div className="auth-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No matches have been scheduled yet.</p>
        </div>
      ) : !hasVisibleMatches ? (
        <div className="auth-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No matches found for "{search}".</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {groups.map(group => group.matches.length > 0 && (
            <div key={group.key}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
                {group.label} ({group.matches.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {group.matches.map(m => {
                  const isFocused = focusedId === m.id;
                  return (
                    <div
                      key={m.id}
                      ref={isFocused ? focusedRef : null}
                      onClick={() => setFocusedId(prev => prev === m.id ? null : m.id)}
                      className="schedule-match-card"
                      style={{
                        background: isFocused ? 'rgba(0,242,254,0.06)' : 'var(--bg-card)',
                        border: isFocused ? '1px solid rgba(0,242,254,0.5)' : group.key === 'live' ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        cursor: 'pointer',
                        transition: 'border-color 0.2s, background 0.2s',
                        boxShadow: isFocused ? '0 0 18px rgba(0,242,254,0.12)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff' }}>
                          {m.team_a_name && m.team_b_name ? `${m.team_a_name} vs ${m.team_b_name}` : m.name}{' '}
                          <span className="role-pill player">{m.sport || 'Football'}</span>
                        </span>
                        {group.showScore && (m.team_a_name && m.team_b_name) && (
                          <span style={{ fontWeight: 800, fontSize: '1.3rem', color: group.key === 'live' ? '#ef4444' : 'var(--accent-emerald)' }}>
                            {scoreLabel(m.team_a_score)} <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>-</span> {scoreLabel(m.team_b_score)}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {new Date(m.match_date).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          title="Copy shareable link"
                          onClick={e => handleCopyLink(m.id, e)}
                          style={{
                            background: copiedId === m.id ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
                            border: copiedId === m.id ? '1px solid rgba(16,185,129,0.5)' : '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            color: copiedId === m.id ? 'var(--accent-emerald)' : 'var(--text-muted)',
                            cursor: 'pointer', fontSize: '0.75rem', padding: '0.25rem 0.55rem',
                            transition: 'all 0.2s', whiteSpace: 'nowrap',
                          }}
                        >
                          {copiedId === m.id ? '✓ Copied!' : '🔗 Share'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
