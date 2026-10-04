import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../utils/authFetch';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);

// ─────────────────────────────────────────────
// Cricket Over Dots Visualizer
// ─────────────────────────────────────────────
function OverDots({ balls = [] }) {
  const getStyle = (b) => {
    if (!b || b === '•') return { bg: 'transparent', color: '#71717a', border: 'rgba(255,255,255,0.1)' };
    if (b === 'W' || b?.includes('/W')) return { bg: '#f43f5e22', color: '#f43f5e', border: '#f43f5e55' };
    if (b === '4' || b === '4NB') return { bg: '#38bdf822', color: '#38bdf8', border: '#38bdf855' };
    if (b === '6') return { bg: '#a855f722', color: '#a855f7', border: '#a855f755' };
    if (b?.includes('Wd')) return { bg: '#f59e0b22', color: '#f59e0b', border: '#f59e0b55' };
    if (b?.includes('NB')) return { bg: '#f97316aa', color: '#fff', border: '#f97316' };
    return { bg: 'rgba(255,255,255,0.06)', color: '#f4f4f5', border: 'rgba(255,255,255,0.18)' };
  };

  const slots = Array(6).fill('•');
  balls.slice(0, 20).forEach((b, i) => { if (i < 6) slots[i] = b; });

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      {slots.map((b, i) => {
        const st = getStyle(b);
        return (
          <div key={i} style={{
            width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
            background: st.bg, color: st.color, border: `1.5px solid ${st.border}`,
            transition: 'all 0.25s ease',
            ...(b && b !== '•' ? { boxShadow: `0 0 10px ${st.border}66` } : {})
          }}>
            {b === 'W' ? '🅆' : b}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Live Badge
// ─────────────────────────────────────────────
function LiveBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
      background: '#f43f5e', borderRadius: 100, fontSize: '0.7rem', fontWeight: 800,
      color: '#fff', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)',
      animation: 'livePulse 1.4s ease-in-out infinite'
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
      LIVE
    </span>
  );
}

// ─────────────────────────────────────────────
// Cricket Live Scoreboard (Spectator View)
// ─────────────────────────────────────────────
function CricketScoreboard({ match, liveState, isLive }) {
  if (!liveState) return null;

  const inn1 = liveState.innings1;
  const inn2 = liveState.innings2;
  const activeInnings = liveState.inningsNumber === 1 ? inn1 : inn2;
  const target = liveState.target;

  const batsmen = Object.values(activeInnings?.batsmen || {});
  const oncreaseR = batsmen.find(b => !b.isOut && b.id === liveState.striker?.id);
  const oncreaseL = batsmen.find(b => !b.isOut && b.id === liveState.nonStriker?.id);
  const bowler = liveState.currentBowler ? (activeInnings?.bowlers?.[liveState.currentBowler.name] || null) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Main Score */}
      <div style={{ textAlign: 'center', padding: '1.5rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', marginBottom: 4 }}>
          {activeInnings?.teamName?.toUpperCase()} — INNINGS {liveState.inningsNumber}
        </div>
        <div style={{ fontSize: '3.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f4f4f5', lineHeight: 1 }}>
          {activeInnings?.totalRuns ?? 0}<span style={{ opacity: 0.45, fontSize: '2rem' }}>/{activeInnings?.wickets ?? 0}</span>
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: 4 }}>
          ({activeInnings?.oversFormatted ?? '0.0'} ov) · CRR: <strong style={{ color: 'var(--accent-cyan)' }}>{liveState.currentRunRate ?? '0.00'}</strong>
        </div>
        {liveState.inningsNumber === 2 && target && (
          <div style={{ marginTop: 8, padding: '6px 14px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: 8, display: 'inline-block', border: '1px solid rgba(245,158,11,0.3)' }}>
            <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.88rem' }}>
              Target: {target} · Need {target - (activeInnings?.totalRuns ?? 0)} more · RRR: {liveState.requiredRunRate ?? '—'}
            </span>
          </div>
        )}
      </div>

      {/* This Over */}
      <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 8 }}>THIS OVER</div>
        <OverDots balls={activeInnings?.currentOverBalls ?? []} />
      </div>

      {/* Batsmen on crease */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[oncreaseR, oncreaseL].filter(Boolean).map((b, i) => (
          <div key={b?.id || i} style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px solid ${b?.id === liveState.striker?.id ? 'rgba(56,189,248,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#71717a', letterSpacing: '0.08em' }}>
                {b?.id === liveState.striker?.id ? '⚡ STRIKER' : 'NON-STRIKER'}
              </span>
            </div>
            <div style={{ fontWeight: 700, color: '#f4f4f5', fontSize: '0.92rem' }}>{b?.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontSize: '1.05rem', fontWeight: 800 }}>
              {b?.runs}({b?.balls})
            </div>
            <div style={{ fontSize: '0.72rem', color: '#71717a' }}>4s: {b?.fours} · 6s: {b?.sixes}</div>
          </div>
        ))}
      </div>

      {/* Bowler */}
      {bowler && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>BOWLING</div>
            <div style={{ fontWeight: 700, color: '#f4f4f5' }}>{bowler.name}</div>
          </div>
          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.92rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>
            {bowler.oversFormatted}-{bowler.maidens}-{bowler.runs}-{bowler.wickets}
          </div>
        </div>
      )}

      {/* Innings 1 summary when in innings 2 */}
      {liveState.inningsNumber === 2 && inn1 && (
        <div style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>{inn1.teamName} (Innings 1)</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#a1a1aa' }}>{inn1.totalRuns}/{inn1.wickets} ({inn1.oversFormatted})</span>
        </div>
      )}

      {/* Result */}
      {liveState.isCompleted && liveState.resultText && (
        <div style={{ padding: '1rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.15))', borderRadius: 12, border: '1px solid rgba(16,185,129,0.3)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>FINAL RESULT</div>
          <div style={{ fontWeight: 800, color: 'var(--accent-emerald)', fontSize: '1.05rem' }}>🏏 {liveState.resultText}</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Generic Scoreboard (Football, Basketball, Racket, Kabaddi, Generic)
// ─────────────────────────────────────────────
function GenericScoreboard({ match, liveState }) {
  if (!liveState) return null;
  const sport = (liveState.sport || match?.sport || '').toLowerCase();

  const renderTimeline = (events = [], maxItems = 8) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      {events.slice(0, maxItems).map((e, i) => (
        <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
          {e.text || '—'}
        </div>
      ))}
    </div>
  );

  // Badminton / Volleyball / Table Tennis / Tennis
  if (sport.includes('badminton') || sport.includes('volleyball') || sport.includes('table tennis') || sport.includes('tt') || sport.includes('tennis')) {
    const sets = liveState.setHistory || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          {[liveState.teamA, liveState.teamB].map((team, i) => (
            <div key={i} style={{
              textAlign: 'center',
              padding: '1rem 0.5rem',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 12,
              border: `1.5px solid ${liveState.servingTeamId === team?.id ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.07)'}`,
              boxShadow: liveState.servingTeamId === team?.id ? '0 0 16px rgba(56,189,248,0.12)' : 'none',
              overflow: 'hidden'
            }}>
              <div style={{
                fontSize: '0.72rem',
                color: '#a1a1aa',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                marginBottom: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                padding: '0 4px'
              }}>
                {team?.name?.toUpperCase()}
              </div>
              <div style={{
                fontSize: 'clamp(2.2rem, 8vw, 3rem)',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: '#f4f4f5',
                lineHeight: 1.1
              }}>
                {team?.currentPoints ?? 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontWeight: 600, marginTop: 4 }}>
                Sets: {team?.setsWon ?? 0}
              </div>
              {liveState.servingTeamId === team?.id ? (
                <div style={{
                  fontSize: '0.65rem',
                  color: '#f59e0b',
                  marginTop: 6,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  background: 'rgba(245,158,11,0.12)',
                  padding: '2px 8px',
                  borderRadius: 100,
                  display: 'inline-block'
                }}>
                  ● SERVING
                </div>
              ) : (
                <div style={{ height: '1.2rem', marginTop: 6 }} />
              )}
            </div>
          ))}
        </div>
        {sets.length > 0 && (
          <div style={{ fontSize: '0.75rem', color: '#71717a', flexWrap: 'wrap', display: 'flex', gap: 8 }}>
            {sets.map((s, i) => <span key={i} style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>Set {s.setNumber}: {s.scoreA}–{s.scoreB} ({s.winnerName})</span>)}
          </div>
        )}
        {liveState.isCompleted && <div style={{ padding: '0.75rem', textAlign: 'center', background: 'rgba(16,185,129,0.1)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.25)', fontWeight: 700, color: 'var(--accent-emerald)' }}>🏆 {liveState.resultText}</div>}
        {renderTimeline(liveState.timeline)}
      </div>
    );
  }

  // All others: Football, Basketball, Kabaddi, Generic
  const teamA = liveState.teamA;
  const teamB = liveState.teamB;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: 8, alignItems: 'center', padding: '1.25rem 0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: '0.72rem', color: '#a1a1aa', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
            {teamA?.name?.toUpperCase()}
          </div>
          <div style={{ fontSize: 'clamp(2.4rem, 8vw, 3.2rem)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f4f4f5', lineHeight: 1 }}>
            {teamA?.score ?? 0}
          </div>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#71717a', fontFamily: 'var(--font-mono)', padding: '0 4px' }}>VS</div>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: '0.72rem', color: '#a1a1aa', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
            {teamB?.name?.toUpperCase()}
          </div>
          <div style={{ fontSize: 'clamp(2.4rem, 8vw, 3.2rem)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f4f4f5', lineHeight: 1 }}>
            {teamB?.score ?? 0}
          </div>
        </div>
      </div>
      {(liveState.period || liveState.quarter || liveState.half) && (
        <div style={{ textAlign: 'center', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-amber)' }}>
          {liveState.period || liveState.quarter || liveState.half}
          {liveState.gameClock && ` · ${liveState.gameClock}`}
          {liveState.currentMinute > 0 && ` · ${liveState.currentMinute}'`}
        </div>
      )}
      {liveState.isCompleted && <div style={{ padding: '0.75rem', textAlign: 'center', background: 'rgba(16,185,129,0.1)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.25)', fontWeight: 700, color: 'var(--accent-emerald)' }}>🏆 {liveState.resultText}</div>}
      {renderTimeline(liveState.timeline)}
    </div>
  );
}

// ─────────────────────────────────────────────
// Admin Cricket Scoring Panel
// ─────────────────────────────────────────────
function CricketAdminPanel({ matchId, liveState, onEvent, undoing, onUndo }) {
  const [nb, setNb] = useState(0);
  const [wideExtra, setWideExtra] = useState(0);
  const [customRuns, setCustomRuns] = useState('');
  const [wicketType, setWicketType] = useState('');
  const [nextBatsmanName, setNextBatsmanName] = useState('');
  const [lineupMode, setLineupMode] = useState(false);
  const [strikerName, setStrikerName] = useState('');
  const [nonStrikerName, setNonStrikerName] = useState('');
  const [bowlerName, setBowlerName] = useState('');
  const [showInnings2, setShowInnings2] = useState(false);
  const [innings2Striker, setInnings2Striker] = useState('');
  const [innings2NonStriker, setInnings2NonStriker] = useState('');
  const [innings2Bowler, setInnings2Bowler] = useState('');

  const activeInnings = liveState?.inningsNumber === 1 ? liveState?.innings1 : liveState?.innings2;
  const needsBowler = liveState && !liveState.currentBowler && !liveState.isCompleted;
  const needsLineup = liveState && !liveState.striker && !liveState.isCompleted && !lineupMode;
  const needsInnings2 = liveState?.inningsNumber === 1 && liveState?.target !== null && liveState?.target !== undefined;

  const send = (type, payload = {}) => onEvent({ eventType: type, payload });

  const recordBall = (runs, type = 'LEGAL') => {
    send('RECORD_DELIVERY', {
      runs,
      deliveryType: type,
      striker: liveState?.striker,
      bowler: liveState?.currentBowler
    });
  };

  const recordWide = () => {
    send('RECORD_DELIVERY', {
      runs: 0,
      deliveryType: 'WIDE',
      extraRuns: Number(wideExtra) || 0,
      striker: liveState?.striker,
      bowler: liveState?.currentBowler
    });
    setWideExtra(0);
  };

  const recordNoBall = () => {
    send('RECORD_DELIVERY', {
      runs: Number(nb) || 0,
      deliveryType: 'NO_BALL',
      extraRuns: 0,
      striker: liveState?.striker,
      bowler: liveState?.currentBowler
    });
    setNb(0);
  };

  const recordWicket = () => {
    if (!wicketType.trim()) return;
    const payload = {
      runs: 0,
      deliveryType: 'LEGAL',
      wicket: {
        dismissalType: wicketType,
        playerOut: liveState?.striker,
        nextBatsman: nextBatsmanName.trim() ? { name: nextBatsmanName.trim(), id: `p_${Date.now()}` } : null
      },
      striker: liveState?.striker,
      bowler: liveState?.currentBowler
    };
    send('RECORD_DELIVERY', payload);
    setWicketType('');
    setNextBatsmanName('');
  };

  const applyLineup = () => {
    if (!strikerName.trim() || !nonStrikerName.trim() || !bowlerName.trim()) return;
    send('SET_LINEUP', {
      striker: { name: strikerName.trim(), id: `p_${strikerName.toLowerCase().replace(/\s/g, '_')}` },
      nonStriker: { name: nonStrikerName.trim(), id: `p_${nonStrikerName.toLowerCase().replace(/\s/g, '_')}` },
      bowler: { name: bowlerName.trim(), id: `b_${bowlerName.toLowerCase().replace(/\s/g, '_')}` }
    });
    setLineupMode(false);
  };

  const setBowler = () => {
    if (!bowlerName.trim()) return;
    send('CHANGE_BOWLER', { bowler: { name: bowlerName.trim(), id: `b_${bowlerName.toLowerCase().replace(/\s/g, '_')}` } });
    setBowlerName('');
  };

  const startInnings2 = () => {
    send('START_INNINGS_2', {
      striker: innings2Striker.trim() ? { name: innings2Striker.trim(), id: `p_${innings2Striker.toLowerCase().replace(/\s/g, '_')}` } : null,
      nonStriker: innings2NonStriker.trim() ? { name: innings2NonStriker.trim(), id: `p_${innings2NonStriker.toLowerCase().replace(/\s/g, '_')}` } : null,
      bowler: innings2Bowler.trim() ? { name: innings2Bowler.trim(), id: `b_${innings2Bowler.toLowerCase().replace(/\s/g, '_')}` } : null
    });
    setShowInnings2(false);
  };

  const btnStyle = (accent = '#f4f4f5') => ({
    padding: '0.85rem 0.6rem', borderRadius: 12, border: `1.5px solid ${accent}33`,
    background: `${accent}11`, color: accent, fontSize: '1rem', fontWeight: 800,
    fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 0.15s ease',
    minWidth: 52, textAlign: 'center', userSelect: 'none'
  });

  if (!liveState) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Lineup Setup */}
      {(needsLineup || lineupMode) && (
        <div style={{ padding: '1rem', background: 'rgba(56,189,248,0.08)', borderRadius: 12, border: '1px solid rgba(56,189,248,0.25)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 10 }}>SET LINEUP</div>
          {[['Striker (Batsman on Strike)', strikerName, setStrikerName], ['Non-Striker', nonStrikerName, setNonStrikerName], ['Opening Bowler', bowlerName, setBowlerName]].map(([label, val, setter]) => (
            <input key={label} placeholder={label} value={val} onChange={e => setter(e.target.value)}
              style={{ width: '100%', marginBottom: 8, padding: '0.55rem 0.75rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }} />
          ))}
          <button onClick={applyLineup} style={{ ...btnStyle('var(--accent-cyan)'), width: '100%', padding: '0.65rem' }}>Set Lineup & Start</button>
        </div>
      )}

      {/* Bowler change needed */}
      {needsBowler && !lineupMode && (
        <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.08)', borderRadius: 12, border: '1px solid rgba(245,158,11,0.3)' }}>
          <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 8 }}>🔄 OVER COMPLETE — SET NEXT BOWLER</div>
          <input placeholder="Next bowler name" value={bowlerName} onChange={e => setBowlerName(e.target.value)}
            style={{ width: '100%', marginBottom: 8, padding: '0.55rem 0.75rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }} />
          <button onClick={setBowler} style={{ ...btnStyle('#f59e0b'), width: '100%', padding: '0.65rem' }}>Confirm Bowler</button>
        </div>
      )}

      {/* Start Innings 2 */}
      {needsInnings2 && liveState.inningsNumber === 1 && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.08)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--accent-emerald)', fontWeight: 700 }}>🏏 Target set: {liveState.target}</span>
          <button onClick={() => setShowInnings2(true)} style={{ ...btnStyle('var(--accent-emerald)'), padding: '0.45rem 1rem', fontSize: '0.8rem' }}>Start Innings 2</button>
        </div>
      )}

      {showInnings2 && (
        <div style={{ padding: '1rem', background: 'rgba(16,185,129,0.08)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.25)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 10 }}>INNINGS 2 LINEUP</div>
          {[['Opener 1 (Striker)', innings2Striker, setInnings2Striker], ['Opener 2 (Non-Striker)', innings2NonStriker, setInnings2NonStriker], ['Opening Bowler', innings2Bowler, setInnings2Bowler]].map(([label, val, setter]) => (
            <input key={label} placeholder={label} value={val} onChange={e => setter(e.target.value)}
              style={{ width: '100%', marginBottom: 8, padding: '0.55rem 0.75rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }} />
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={startInnings2} style={{ ...btnStyle('var(--accent-emerald)'), flex: 1, padding: '0.65rem' }}>Start Innings 2</button>
            <button onClick={() => setShowInnings2(false)} style={{ ...btnStyle('#71717a'), padding: '0.65rem 1rem' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Main Ball Buttons */}
      {!needsBowler && !liveState.isCompleted && liveState.striker && (
        <>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.1em' }}>RUNS (TAP TO RECORD BALL)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[['•', 0, '#71717a'], ['1', 1, '#f4f4f5'], ['2', 2, '#f4f4f5'], ['3', 3, '#f4f4f5']].map(([label, runs, color]) => (
                <button key={label} onClick={() => recordBall(runs)} style={btnStyle(color)}>{label}</button>
              ))}
              {[['4', 4, 'var(--accent-cyan)'], ['6', 6, 'var(--accent-purple)']].map(([label, runs, color]) => (
                <button key={label} onClick={() => recordBall(runs)} style={{ ...btnStyle(color), fontSize: '1.25rem' }}>{label}</button>
              ))}
              <button onClick={() => recordBall(5)} style={btnStyle('#a1a1aa')}>5</button>
              <button onClick={() => { const n = parseInt(customRuns); if (!isNaN(n) && n >= 0) { recordBall(n); setCustomRuns(''); } }} style={{ ...btnStyle('#a1a1aa'), gridColumn: 'span 1' }}>
                {customRuns || '?'}
              </button>
            </div>
          </div>

          {/* Byes / Leg Byes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[[1, 'BYE', '#a1a1aa'], [1, 'LEG_BYE', '#a1a1aa'], [2, 'BYE', '#a1a1aa'], [2, 'LEG_BYE', '#a1a1aa']].map(([r, type, c], i) => (
              <button key={i} onClick={() => recordBall(r, type)} style={{ ...btnStyle(c), fontSize: '0.78rem', padding: '0.6rem' }}>
                {r} {type.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Wide */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={recordWide} style={{ ...btnStyle('#f59e0b'), flex: 1 }}>WIDE</button>
            <input type="number" min="0" max="6" value={wideExtra} onChange={e => setWideExtra(Number(e.target.value))} placeholder="Extra runs"
              style={{ width: 80, padding: '0.65rem', borderRadius: 10, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontFamily: 'var(--font-mono)', fontSize: '0.88rem', textAlign: 'center' }} />
          </div>

          {/* No Ball */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={recordNoBall} style={{ ...btnStyle('#f97316'), flex: 1 }}>NO BALL{liveState.isFreeHit ? ' 🎯' : ''}</button>
            <input type="number" min="0" max="6" value={nb} onChange={e => setNb(Number(e.target.value))} placeholder="Bat runs"
              style={{ width: 80, padding: '0.65rem', borderRadius: 10, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontFamily: 'var(--font-mono)', fontSize: '0.88rem', textAlign: 'center' }} />
          </div>

          {/* Wicket */}
          <div style={{ padding: '0.85rem', background: 'rgba(244,63,94,0.06)', borderRadius: 12, border: '1px solid rgba(244,63,94,0.2)' }}>
            <div style={{ fontSize: '0.65rem', color: '#f43f5e', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 8 }}>WICKET 🏏</div>
            <select value={wicketType} onChange={e => setWicketType(e.target.value)}
              style={{ width: '100%', marginBottom: 8, padding: '0.55rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontSize: '0.88rem' }}>
              <option value="">Select dismissal type...</option>
              {['Bowled', 'Caught', 'LBW', 'Run Out', 'Stumped', 'Hit Wicket', 'Handled Ball', 'Retired'].map(t => (
                <option key={t} value={t.toLowerCase()}>{t}</option>
              ))}
            </select>
            <input placeholder="Next batsman name (optional)" value={nextBatsmanName} onChange={e => setNextBatsmanName(e.target.value)}
              style={{ width: '100%', marginBottom: 8, padding: '0.5rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontSize: '0.88rem', fontFamily: 'var(--font-mono)' }} />
            <button onClick={recordWicket} disabled={!wicketType} style={{ ...btnStyle('#f43f5e'), width: '100%', opacity: wicketType ? 1 : 0.4, fontSize: '0.9rem' }}>
              W WICKET!
            </button>
          </div>

          {/* Swap / Undo */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => send('SWAP_STRIKE', {})} style={{ ...btnStyle('#71717a'), flex: 1, fontSize: '0.82rem', padding: '0.65rem 0.5rem' }}>⇄ Swap Strike</button>
            <button onClick={onUndo} disabled={undoing} style={{ ...btnStyle('#f43f5e'), flex: 1, fontSize: '0.82rem', padding: '0.65rem 0.5rem', opacity: undoing ? 0.5 : 1 }}>
              {undoing ? '⏳ Undoing...' : '↩ Undo'}
            </button>
          </div>

          {!lineupMode && (
            <button onClick={() => setLineupMode(true)} style={{ ...btnStyle('#71717a'), fontSize: '0.78rem', padding: '0.5rem', width: '100%' }}>
              Change Batsman / Lineup
            </button>
          )}
        </>
      )}

      {liveState.isCompleted && (
        <div style={{ padding: '1rem', textAlign: 'center', background: 'rgba(16,185,129,0.08)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.25)', color: 'var(--accent-emerald)', fontWeight: 700 }}>
          Match Completed — {liveState.resultText}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Generic Admin Scoring Panel
// ─────────────────────────────────────────────
function GenericAdminPanel({ match, liveState, onEvent, undoing, onUndo }) {
  const sport = (liveState?.sport || match?.sport || '').toLowerCase();
  const [goal, setGoal] = useState({ scorer: '', minute: '', assist: '', isOwnGoal: false });
  const [kickTeam, setKickTeam] = useState('A');
  const [kickScored, setKickScored] = useState(true);

  const send = (type, payload = {}) => onEvent({ eventType: type, payload });
  const teamAId = liveState?.teamA?.id || match?.team_a_id;
  const teamBId = liveState?.teamB?.id || match?.team_b_id;
  const teamAName = liveState?.teamA?.name || match?.team_a_name || 'Team A';
  const teamBName = liveState?.teamB?.name || match?.team_b_name || 'Team B';

  const btnStyle = (accent = '#f4f4f5', size = '1rem') => ({
    padding: '0.75rem 0.5rem', borderRadius: 12, border: `1.5px solid ${accent}33`,
    background: `${accent}11`, color: accent, fontSize: size, fontWeight: 800,
    fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 0.15s ease',
    textAlign: 'center', userSelect: 'none', boxSizing: 'border-box', width: '100%',
    minHeight: '44px'
  });

  if (!liveState) return null;

  // Badminton / Racket
  if (sport.includes('badminton') || sport.includes('volleyball') || sport.includes('table tennis') || sport.includes('tt') || sport.includes('tennis')) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          {[[teamAId, teamAName, 'var(--accent-cyan)'], [teamBId, teamBName, '#a855f7']].map(([id, name, color]) => (
            <button
              key={id}
              onClick={() => send('POINT', { teamId: id })}
              style={{
                ...btnStyle(color, '0.92rem'),
                padding: '1.1rem 0.5rem',
                minHeight: '68px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4
              }}
            >
              <span style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.04em' }}>⊕ POINT</span>
              <span style={{ fontSize: '0.74rem', fontWeight: 600, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', padding: '0 4px' }}>{name}</span>
            </button>
          ))}
        </div>
        <button onClick={() => send('TOGGLE_SERVICE', {})} style={{ ...btnStyle('#71717a', '0.84rem'), padding: '0.75rem' }}>⇄ Toggle Service</button>
        <button onClick={onUndo} disabled={undoing} style={{ ...btnStyle('#f43f5e', '0.84rem'), padding: '0.75rem', opacity: undoing ? 0.5 : 1 }}>↩ Undo Last Point</button>
      </div>
    );
  }

  // Football
  if (sport.includes('football') || sport.includes('futsal') || sport.includes('soccer')) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          {[[teamAId, teamAName, 'var(--accent-cyan)'], [teamBId, teamBName, '#a855f7']].map(([id, name, color]) => (
            <button
              key={id}
              onClick={() => send('GOAL', { teamId: id, scorer: goal.scorer, assist: goal.assist, minute: parseInt(goal.minute) || liveState.currentMinute })}
              style={{
                ...btnStyle(color, '0.92rem'),
                padding: '1.1rem 0.5rem',
                minHeight: '68px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4
              }}
            >
              <span style={{ fontSize: '1rem', fontWeight: 800 }}>⚽ GOAL</span>
              <span style={{ fontSize: '0.74rem', fontWeight: 600, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', padding: '0 4px' }}>{name}</span>
            </button>
          ))}
        </div>
        <input
          placeholder="Goal scorer name"
          value={goal.scorer}
          onChange={e => setGoal(g => ({ ...g, scorer: e.target.value }))}
          style={{ padding: '0.65rem 0.75rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontFamily: 'var(--font-mono)', fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
          <input
            placeholder="Minute"
            value={goal.minute}
            onChange={e => setGoal(g => ({ ...g, minute: e.target.value }))}
            style={{ padding: '0.65rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontFamily: 'var(--font-mono)', fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
          />
          <input
            placeholder="Assist (optional)"
            value={goal.assist}
            onChange={e => setGoal(g => ({ ...g, assist: e.target.value }))}
            style={{ padding: '0.65rem', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontFamily: 'var(--font-mono)', fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {[['🟨 Yellow', () => { const t = prompt(`Card: ${teamAName} or ${teamBName}?`) === teamAName ? teamAId : teamBId; send('CARD', { teamId: t, cardType: 'YELLOW', player: prompt('Player name?') || '' }); }, '#f59e0b'],
            ['🟥 Red', () => { const t = prompt(`Card: ${teamAName} or ${teamBName}?`) === teamAName ? teamAId : teamBId; send('CARD', { teamId: t, cardType: 'RED', player: prompt('Player name?') || '' }); }, '#f43f5e'],
            ['🔄 Sub', () => { const t = prompt(`Sub: ${teamAName} or ${teamBName}?`) === teamAName ? teamAId : teamBId; send('SUBSTITUTION', { teamId: t, playerIn: prompt('Player IN?') || '', playerOut: prompt('Player OUT?') || '' }); }, '#71717a'],
          ].map(([label, fn, c]) => (
            <button key={label} onClick={fn} style={{ ...btnStyle(c, '0.78rem'), padding: '0.75rem 0.3rem' }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {['1st Half', 'Half Time', '2nd Half', 'Full Time', 'Extra Time', 'Ended'].map(p => (
            <button key={p} onClick={() => send('SET_PERIOD', { period: p })} style={{ ...btnStyle('#71717a', '0.72rem'), padding: '0.6rem 0.2rem' }}>{p}</button>
          ))}
        </div>
        <button onClick={onUndo} disabled={undoing} style={{ ...btnStyle('#f43f5e', '0.84rem'), padding: '0.75rem', opacity: undoing ? 0.5 : 1 }}>↩ Undo</button>
      </div>
    );
  }

  // Basketball
  if (sport.includes('basketball')) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          {[[teamAId, teamAName, 'var(--accent-cyan)'], [teamBId, teamBName, '#a855f7']].map(([id, name, color]) => (
            <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.72rem', color: '#a1a1aa', fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name.toUpperCase()}</div>
              {[['+1', 1], ['+2', 2], ['+3', 3]].map(([label, pts]) => (
                <button key={pts} onClick={() => send('SCORE_POINTS', { teamId: id, points: pts })} style={{ ...btnStyle(color, '0.92rem'), padding: '0.8rem' }}>{label}</button>
              ))}
              <button onClick={() => send('FOUL', { teamId: id })} style={{ ...btnStyle('#f43f5e', '0.78rem'), padding: '0.6rem' }}>🚨 Foul</button>
              <button onClick={() => send('TIMEOUT', { teamId: id })} style={{ ...btnStyle('#71717a', '0.75rem'), padding: '0.55rem' }}>⏸ TO</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {['Q1', 'Q2', 'Q3', 'Q4', 'OT'].map(q => (
            <button key={q} onClick={() => send('SET_QUARTER', { quarter: q })} style={{ ...btnStyle('#71717a', '0.78rem'), padding: '0.65rem' }}>{q}</button>
          ))}
          <button onClick={() => send('END_GAME', {})} style={{ ...btnStyle('#f43f5e', '0.75rem'), padding: '0.65rem' }}>End</button>
        </div>
        <button onClick={onUndo} disabled={undoing} style={{ ...btnStyle('#f43f5e', '0.84rem'), padding: '0.75rem', opacity: undoing ? 0.5 : 1 }}>↩ Undo</button>
      </div>
    );
  }

  // Kabaddi
  if (sport.includes('kabaddi')) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
          {[[teamAId, teamAName, 'var(--accent-cyan)'], [teamBId, teamBName, '#a855f7']].map(([id, name, color]) => (
            <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.72rem', color: '#a1a1aa', fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name.toUpperCase()}</div>
              {[['🏃 Raid +1', 'RAID', 1], ['🔥 Super +3', 'SUPER_RAID', 3], ['🛡️ Tackle +1', 'TACKLE', 1], ['⚡ Super Tackle +2', 'SUPER_TACKLE', 2], ['💥 All Out +2', 'ALL_OUT', 2]].map(([label, action, pts]) => (
                <button key={action} onClick={() => send('SCORE_ACTION', { teamId: id, actionType: action, points: pts })} style={{ ...btnStyle(color, '0.75rem'), padding: '0.65rem 0.35rem' }}>{label}</button>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
          {['1st Half', 'Half Time', '2nd Half', 'Ended'].map(h => (
            <button key={h} onClick={() => send('SET_HALF', { half: h })} style={{ ...btnStyle('#71717a', '0.72rem'), padding: '0.6rem 0.2rem' }}>{h}</button>
          ))}
        </div>
        <button onClick={onUndo} disabled={undoing} style={{ ...btnStyle('#f43f5e', '0.84rem'), padding: '0.75rem', opacity: undoing ? 0.5 : 1 }}>↩ Undo</button>
      </div>
    );
  }

  // Generic
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        {[[teamAId, teamAName, 'var(--accent-cyan)'], [teamBId, teamBName, '#a855f7']].map(([id, name, color]) => (
          <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.72rem', color: '#a1a1aa', fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name.toUpperCase()}</div>
            {[['+1', 1], ['+2', 2], ['+3', 3], ['-1', -1]].map(([label, delta]) => (
              <button key={label} onClick={() => send('ADD_POINTS', { teamId: id, delta })} style={{ ...btnStyle(color, '0.92rem'), padding: '0.8rem' }}>{label}</button>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <button onClick={() => send('SET_RESULT', { outcome: 'WIN', winnerTeamId: teamAId })} style={{ ...btnStyle('var(--accent-emerald)', '0.75rem'), padding: '0.65rem 0.3rem' }}>{teamAName} Wins</button>
        <button onClick={() => send('SET_RESULT', { outcome: 'DRAW' })} style={{ ...btnStyle('#71717a', '0.75rem'), padding: '0.65rem 0.3rem' }}>Draw</button>
        <button onClick={() => send('SET_RESULT', { outcome: 'WIN', winnerTeamId: teamBId })} style={{ ...btnStyle('#a855f7', '0.75rem'), padding: '0.65rem 0.3rem' }}>{teamBName} Wins</button>
      </div>
      <button onClick={onUndo} disabled={undoing} style={{ ...btnStyle('#f43f5e', '0.84rem'), padding: '0.75rem', opacity: undoing ? 0.5 : 1 }}>↩ Undo</button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main LiveScoring Component
// ─────────────────────────────────────────────
export function LiveScoring({ onNavigate }) {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [liveDetail, setLiveDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileTab, setMobileTab] = useState('both'); // 'both' | 'scoreboard' | 'admin'
  const [filter, setFilter] = useState('all');  // 'all' | 'live' | 'upcoming' | 'completed'
  const [sportFilter, setSportFilter] = useState('All');
  const [undoing, setUndoing] = useState(false);
  const [toast, setToast] = useState('');
  const socketRef = useRef(null);
  const selectedMatchRef = useRef(selectedMatch?.id);

  useEffect(() => {
    selectedMatchRef.current = selectedMatch?.id;
  }, [selectedMatch?.id]);

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(''), 3500);
  }, []);

  // Fetch match list
  const loadMatches = useCallback(async () => {
    try {
      const res = await fetch('/api/live-scoring/matches');
      const data = await res.json();
      if (data.success) setMatches(data.matches || []);
      else setError(data.message || 'Failed to load matches');
    } catch (e) {
      setError('Connection error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load detail for selected match
  const loadDetail = useCallback(async (matchId) => {
    if (!matchId) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/live-scoring/${matchId}`);
      const data = await res.json();
      if (data.success) setLiveDetail(data);
      else showToast(data.message || 'Failed to load match detail', true);
    } catch (e) {
      showToast('Connection error: ' + e.message, true);
    } finally {
      setDetailLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadMatches();

    // Socket.io real-time listener
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('match:live_update', (payload) => {
      if (payload?.matchId === selectedMatchRef.current) {
        setLiveDetail(prev => prev ? { ...prev, liveState: payload.liveState } : prev);
      }
      // Also update mini-card in list
      setMatches(prev => prev.map(m => {
        if (m.id !== payload?.matchId) return m;
        return { ...m, liveState: payload.liveState, status: payload.status || m.status, team_a_score: payload.scoreA, team_b_score: payload.scoreB };
      }));
    });

    socket.on('match:status', ({ match_id, status }) => {
      setMatches(prev => prev.map(m => m.id === match_id ? { ...m, status } : m));
    });

    return () => socket.disconnect();
  }, [loadMatches]);

  useEffect(() => {
    if (selectedMatch?.id) {
      loadDetail(selectedMatch.id);
      socketRef.current?.emit('join:match', selectedMatch.id);
    }
    return () => {
      if (selectedMatch?.id) socketRef.current?.emit('leave:match', selectedMatch.id);
    };
  }, [selectedMatch?.id, loadDetail]);

  // Admin: record event
  const handleEvent = async ({ eventType, payload }) => {
    if (!selectedMatch?.id) {
      showToast('⚠️ Please select a match fixture to score', true);
      return;
    }
    if (!token) {
      showToast('⚠️ Admin session expired or not signed in. Please sign in as admin.', true);
      return;
    }
    try {
      const res = await fetch(`/api/live-scoring/${selectedMatch.id}/event`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ eventType, payload })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLiveDetail(prev => prev ? { ...prev, liveState: data.liveState } : prev);
        setMatches(prev => prev.map(m => {
          if (m.id !== selectedMatch.id) return m;
          return { ...m, liveState: data.liveState, status: data.status || m.status, team_a_score: data.scoreA, team_b_score: data.scoreB };
        }));
        showToast(`✓ ${eventType} recorded`);
      } else {
        showToast(`❌ ${data.message || 'Failed to record event'}`, true);
      }
    } catch (e) {
      showToast('❌ Connection error: ' + e.message, true);
    }
  };

  // Admin: undo
  const handleUndo = async () => {
    if (!selectedMatch?.id) {
      showToast('⚠️ Please select a match fixture', true);
      return;
    }
    if (!token) {
      showToast('⚠️ Admin session expired. Please sign in as admin.', true);
      return;
    }
    setUndoing(true);
    try {
      const res = await fetch(`/api/live-scoring/${selectedMatch.id}/undo`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLiveDetail(prev => prev ? { ...prev, liveState: data.liveState } : prev);
        setMatches(prev => prev.map(m => {
          if (m.id !== selectedMatch.id) return m;
          return { ...m, liveState: data.liveState, team_a_score: data.scoreA, team_b_score: data.scoreB };
        }));
        showToast('↩ Last action undone');
      } else {
        showToast(`❌ ${data.message || 'Nothing to undo'}`, true);
      }
    } catch (e) {
      showToast('❌ Connection error: ' + e.message, true);
    } finally {
      setUndoing(false);
    }
  };

  const allSports = ['All', ...new Set(matches.map(m => m.sport).filter(Boolean))];
  const filtered = matches.filter(m => {
    if (filter !== 'all' && m.status !== filter) return false;
    if (sportFilter !== 'All' && m.sport !== sportFilter) return false;
    return true;
  });

  const sport = selectedMatch?.sport || '';
  const isCricket = sport.toLowerCase().includes('cricket');
  const liveState = liveDetail?.liveState;

  return (
    <div className="live-scoring-page">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 80, right: 20, zIndex: 9999,
          padding: '0.85rem 1.25rem', borderRadius: 12, fontWeight: 700,
          background: toast.isError ? 'rgba(244,63,94,0.95)' : 'rgba(16,185,129,0.95)',
          color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          animation: 'slideDown 0.25s ease-out', display: 'flex', alignItems: 'center', gap: 8
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        @keyframes slideDown { from { transform: translateY(-12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .match-card:hover { border-color: rgba(255,255,255,0.18) !important; transform: translateY(-1px); }
        .score-highlight { animation: scoreFlash 0.6s ease-out; }
        @keyframes scoreFlash { 0% { background: rgba(56,189,248,0.2); } 100% { background: transparent; } }

        .live-scoring-page {
          max-width: 1100px;
          width: 100%;
          margin: 0 auto;
          padding: 1.5rem 1rem;
          box-sizing: border-box;
          overflow-x: hidden;
        }

        .live-detail-layout {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 20px;
          width: 100%;
          box-sizing: border-box;
          align-items: start;
        }
        .live-detail-layout.spectator-only {
          grid-template-columns: 1fr;
        }

        .live-card {
          background: rgba(18,20,25,0.88);
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          padding: 1.25rem;
          box-sizing: border-box;
          width: 100%;
          overflow: hidden;
        }

        .mobile-admin-tab-bar {
          display: none;
        }

        .match-grid-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr));
          gap: 14px;
          width: 100%;
          box-sizing: border-box;
        }

        .live-filter-bar {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          padding-bottom: 6px;
          margin-bottom: 20px;
          width: 100%;
          box-sizing: border-box;
        }
        .live-filter-bar::-webkit-scrollbar {
          display: none;
        }

        @media (max-width: 880px) {
          .live-scoring-page {
            padding: 1rem 0.5rem 5.5rem;
          }
          .live-detail-layout {
            grid-template-columns: 1fr !important;
            gap: 14px;
          }
          .live-card {
            padding: 1rem 0.75rem;
            border-radius: 14px;
          }
          .mobile-admin-tab-bar {
            display: flex;
            gap: 6px;
            padding: 4px;
            margin-bottom: 14px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            width: 100%;
            box-sizing: border-box;
          }
          .mobile-tab-btn {
            flex: 1;
            padding: 0.6rem 0.35rem;
            font-size: 0.8rem;
            font-weight: 700;
            border-radius: 8px;
            border: none;
            background: transparent;
            color: #a1a1aa;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: center;
            white-space: nowrap;
          }
          .mobile-tab-btn.active {
            background: rgba(56, 189, 248, 0.2);
            color: #38bdf8;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
          }
        }
      `}</style>

      <div style={{ marginBottom: 24, width: '100%', boxSizing: 'border-box' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 5vw, 2.4rem)', fontWeight: 700, color: '#f4f4f5', marginBottom: 4, wordBreak: 'break-word' }}>
          🏟️ <em>Live Scoring</em>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Real-time match scores, event-sourced for accuracy</p>
      </div>

      {/* Filters */}
      <div className="live-filter-bar">
        {[['all', 'All Matches'], ['live', '🔴 Live'], ['upcoming', 'Upcoming'], ['completed', 'Completed']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '0.45rem 1rem', borderRadius: 100, fontSize: '0.82rem', fontWeight: 600,
            border: `1px solid ${filter === val ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
            background: filter === val ? 'rgba(255,255,255,0.1)' : 'transparent', color: filter === val ? '#f4f4f5' : '#71717a',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0
          }}>{label}</button>
        ))}
        <select value={sportFilter} onChange={e => setSportFilter(e.target.value)}
          style={{ padding: '0.45rem 0.85rem', borderRadius: 100, fontSize: '0.82rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#a1a1aa', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {allSports.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {selectedMatch ? (
        // ── DETAIL VIEW ──
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => { setSelectedMatch(null); setLiveDetail(null); }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.45rem 1rem', borderRadius: 100, fontSize: '0.82rem', fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#a1a1aa', cursor: 'pointer'
            }}>← Back to matches</button>

            {isAdmin && (
              <span style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                ⚙ ADMIN SCORER
              </span>
            )}
          </div>

          {/* Mobile Tab Switcher for Admin on small screens */}
          {isAdmin && (
            <div className="mobile-admin-tab-bar">
              <button
                type="button"
                className={`mobile-tab-btn ${mobileTab === 'both' ? 'active' : ''}`}
                onClick={() => setMobileTab('both')}
              >
                📑 Full View
              </button>
              <button
                type="button"
                className={`mobile-tab-btn ${mobileTab === 'scoreboard' ? 'active' : ''}`}
                onClick={() => setMobileTab('scoreboard')}
              >
                📊 Scoreboard
              </button>
              <button
                type="button"
                className={`mobile-tab-btn ${mobileTab === 'admin' ? 'active' : ''}`}
                onClick={() => setMobileTab('admin')}
              >
                ⚙️ Controls
              </button>
            </div>
          )}

          <div className={`live-detail-layout ${!isAdmin ? 'spectator-only' : ''}`}>
            {/* Scoreboard panel */}
            {(!isAdmin || mobileTab === 'both' || mobileTab === 'scoreboard') && (
              <div className="live-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                      {selectedMatch.sport?.toUpperCase()} · {selectedMatch.name}
                    </div>
                    <div style={{ fontWeight: 700, color: '#f4f4f5', fontSize: 'clamp(0.95rem, 4vw, 1.15rem)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {selectedMatch.team_a_name} vs {selectedMatch.team_b_name}
                    </div>
                  </div>
                  {selectedMatch.status === 'live' && <LiveBadge />}
                </div>

                {detailLoading ? (
                  <div style={{ textAlign: 'center', color: '#71717a', padding: '2rem' }}>Loading live state…</div>
                ) : liveState ? (
                  isCricket ? (
                    <CricketScoreboard match={selectedMatch} liveState={liveState} isLive={selectedMatch.status === 'live'} />
                  ) : (
                    <GenericScoreboard match={selectedMatch} liveState={liveState} />
                  )
                ) : (
                  <div style={{ textAlign: 'center', color: '#71717a', padding: '2rem' }}>No scoring data yet</div>
                )}
              </div>
            )}

            {/* Admin Panel */}
            {isAdmin && (mobileTab === 'both' || mobileTab === 'admin') && (
              <div className="live-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.04em' }}>
                    ⚙ ADMIN SCORING PANEL
                  </div>
                  <span style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: 'var(--font-mono)' }}>TAP TO SCORE</span>
                </div>
                {isCricket ? (
                  <CricketAdminPanel matchId={selectedMatch.id} liveState={liveState} onEvent={handleEvent} undoing={undoing} onUndo={handleUndo} />
                ) : (
                  <GenericAdminPanel match={selectedMatch} liveState={liveState} onEvent={handleEvent} undoing={undoing} onUndo={handleUndo} />
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        // ── MATCH LIST ──
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#71717a', padding: '3rem' }}>Loading matches…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#71717a', padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
              No matches found for this filter
            </div>
          ) : (
            <div className="match-grid-list">
              {filtered.map(m => {
                const ls = m.liveState;
                const sport = (m.sport || '').toLowerCase();
                const isCricketMatch = sport.includes('cricket');
                const isRacketMatch = sport.includes('badminton') || sport.includes('volleyball') || sport.includes('table tennis') || sport.includes('tt') || sport.includes('tennis');
                let scoreA = m.team_a_score ?? 0;
                let scoreB = m.team_b_score ?? 0;
                let subInfo = null;

                if (isCricketMatch && ls) {
                  const inn1 = ls.innings1;
                  const inn2 = ls.innings2;
                  const active = ls.inningsNumber === 1 ? inn1 : inn2;
                  if (active) {
                    scoreA = inn1?.teamId === m.team_a_id ? inn1.totalRuns : (inn2?.totalRuns ?? 0);
                    scoreB = inn1?.teamId === m.team_b_id ? inn1.totalRuns : (inn2?.totalRuns ?? 0);
                    subInfo = `${active.oversFormatted} ov · ${active.teamName} batting`;
                  }
                } else if (isRacketMatch && ls) {
                  // Badminton/Volleyball/Tennis: show current set points (live) + sets won
                  const ptsA = ls.teamA?.currentPoints ?? 0;
                  const ptsB = ls.teamB?.currentPoints ?? 0;
                  const setsA = ls.teamA?.setsWon ?? 0;
                  const setsB = ls.teamB?.setsWon ?? 0;
                  scoreA = ptsA;
                  scoreB = ptsB;
                  if (setsA > 0 || setsB > 0) subInfo = `Sets: ${setsA}–${setsB}`;
                } else if (ls) {
                  scoreA = ls.teamA?.score ?? scoreA;
                  scoreB = ls.teamB?.score ?? scoreB;
                }

                const statusColors = { live: '#f43f5e', upcoming: 'var(--accent-cyan)', completed: '#71717a' };

                return (
                  <div key={m.id} className="match-card" onClick={() => { setSelectedMatch(m); setMobileTab('both'); }} style={{
                    background: 'rgba(18,20,25,0.88)', borderRadius: 14, border: `1px solid ${m.status === 'live' ? 'rgba(244,63,94,0.25)' : 'rgba(255,255,255,0.07)'}`,
                    padding: '1rem', cursor: 'pointer', transition: 'all 0.2s ease',
                    boxShadow: m.status === 'live' ? '0 0 20px rgba(244,63,94,0.1)' : 'none',
                    boxSizing: 'border-box', width: '100%', overflow: 'hidden'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: '#71717a', letterSpacing: '0.08em' }}>{m.sport?.toUpperCase()}</span>
                      {m.status === 'live' ? <LiveBadge /> : (
                        <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: statusColors[m.status] || '#71717a', fontWeight: 700 }}>{(m.status || 'upcoming').toUpperCase()}</span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.team_a_name || 'TBA'}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 800, color: '#f4f4f5', textAlign: 'center', letterSpacing: '-0.02em', padding: '0 4px' }}>
                        {m.status === 'upcoming' ? '–·–' : `${scoreA}–${scoreB}`}
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f4f4f5', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.team_b_name || 'TBA'}</div>
                    </div>
                    {subInfo && <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: 'var(--font-mono)' }}>{subInfo}</div>}
                    {ls?.resultText && <div style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)', fontWeight: 700, marginTop: 4 }}>{ls.resultText}</div>}
                    <div style={{ fontSize: '0.68rem', color: '#52525b', marginTop: 6 }}>
                      {m.match_date ? new Date(m.match_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LiveScoring;
