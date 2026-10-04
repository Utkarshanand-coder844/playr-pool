/**
 * Player Stats Derivation Engine
 * Derives per-player fantasy points from the live state produced by each sport plugin.
 * match_events stays the single source of truth — this is a pure read/derive function.
 *
 * Returns: Array of { playerId, name, teamId, sport, stats: {...}, fantasyPoints }
 * Only players with a real user id are intended for DB persistence; guests are
 * still returned here so scorecards can show them, but the caller filters before DB write.
 */

import { SCORING_RULES } from '../config/scoringRules.js';

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

/**
 * Determine whether a liveState represents a completed match and who won.
 * Returns: { isCompleted, winnerTeamId } — winnerTeamId may be null (tie or unknown).
 */
function matchResult(liveState, match) {
  if (!liveState?.isCompleted) return { isCompleted: false, winnerTeamId: null };

  const s = String(liveState.sport || '').toLowerCase();
  const teamAId = match?.team_a_id;
  const teamBId = match?.team_b_id;

  if (s.includes('cricket')) {
    const txt = (liveState.resultText || '').toLowerCase();
    if (txt.includes('tied') || txt.includes('draw') || txt.includes('no result')) return { isCompleted: true, winnerTeamId: null };
    const inn1 = liveState.innings1;
    const inn2 = liveState.innings2;
    if (!inn1 || !inn2) return { isCompleted: true, winnerTeamId: null };
    // Batting team of innings 2 wins if they passed the target
    if (inn2.totalRuns >= liveState.target) return { isCompleted: true, winnerTeamId: inn2.teamId };
    return { isCompleted: true, winnerTeamId: inn1.teamId }; // bowling team of inn2 won
  }

  // Football, Basketball, Kabaddi, Generic
  const teamA = liveState.teamA;
  const teamB = liveState.teamB;
  if (!teamA || !teamB) return { isCompleted: true, winnerTeamId: null };
  if (teamA.score > teamB.score) return { isCompleted: true, winnerTeamId: teamA.id };
  if (teamB.score > teamA.score) return { isCompleted: true, winnerTeamId: teamB.id };

  // Racket — sets won
  if (s.includes('badminton') || s.includes('volleyball') || s.includes('table tennis') || s.includes('tt') || s.includes('tennis')) {
    if (teamA.setsWon > teamB.setsWon) return { isCompleted: true, winnerTeamId: teamA.id };
    if (teamB.setsWon > teamA.setsWon) return { isCompleted: true, winnerTeamId: teamB.id };
  }

  return { isCompleted: true, winnerTeamId: null };
}

// ────────────────────────────────────────────────────────────────
// Per-sport derivation
// ────────────────────────────────────────────────────────────────

function deriveCricketStats(liveState, match) {
  const R = SCORING_RULES.Cricket;
  const { isCompleted, winnerTeamId } = matchResult(liveState, match);
  const players = {};

  const processInnings = (innings) => {
    if (!innings) return;
    const teamId = innings.teamId;

    // Batsmen
    for (const [key, b] of Object.entries(innings.batsmen || {})) {
      const pid = b.id || key;
      if (!players[pid]) {
        players[pid] = { playerId: pid, name: b.name || key, teamId, sport: 'Cricket', stats: {}, fantasyPoints: 0 };
      }
      const p = players[pid];
      p.teamId = teamId;

      // Merge batting stats
      p.stats.runs = (p.stats.runs || 0) + b.runs;
      p.stats.balls = (p.stats.balls || 0) + b.balls;
      p.stats.fours = (p.stats.fours || 0) + b.fours;
      p.stats.sixes = (p.stats.sixes || 0) + b.sixes;
      if (b.isOut) p.stats.isOut = true;
      if (b.dismissalText) p.stats.dismissalText = b.dismissalText;
      if (b.catches) p.stats.catches = (p.stats.catches || 0) + b.catches;
      if (b.stumpings) p.stats.stumpings = (p.stats.stumpings || 0) + b.stumpings;
      if (b.runOuts) p.stats.runOuts = (p.stats.runOuts || 0) + b.runOuts;

      const sr = b.balls > 0 ? parseFloat(((b.runs / b.balls) * 100).toFixed(1)) : 0;
      p.stats.strikeRate = sr;

      // Batting FP
      let fp = b.runs * R.runScored;
      fp += b.fours * R.fourBonus;
      fp += b.sixes * R.sixBonus;
      if (b.runs >= 100) fp += R.runs100Bonus + R.runs50Bonus + R.runs30Bonus;
      else if (b.runs >= 50) fp += R.runs50Bonus + R.runs30Bonus;
      else if (b.runs >= 30) fp += R.runs30Bonus;
      if (b.isOut && b.runs === 0) fp += R.duckPenalty;

      // Fielding FP (catches, stumpings, run-outs)
      fp += (b.catches || 0) * R.catchBonus;
      fp += (b.stumpings || 0) * R.stumpingBonus;
      fp += (b.runOuts || 0) * R.runOutBonus;

      p.fantasyPoints += fp;
    }

    // Bowlers
    for (const [key, bw] of Object.entries(innings.bowlers || {})) {
      const pid = bw.id || key;
      if (!players[pid]) {
        players[pid] = { playerId: pid, name: bw.name || key, teamId, sport: 'Cricket', stats: {}, fantasyPoints: 0 };
      }
      const p = players[pid];
      // Bowling team is opposite of batting team
      p.teamId = teamId === match?.team_a_id ? match?.team_b_id : match?.team_a_id;

      p.stats.overs = bw.oversFormatted || '0.0';
      p.stats.maidens = (p.stats.maidens || 0) + (bw.maidens || 0);
      p.stats.runsConceded = (p.stats.runsConceded || 0) + bw.runs;
      p.stats.wickets = (p.stats.wickets || 0) + bw.wickets;
      p.stats.economy = bw.economy || 0;
      p.stats.legalBalls = (p.stats.legalBalls || 0) + (bw.legalBalls || 0);

      let fp = bw.wickets * R.wicketTaken;
      fp += (bw.maidens || 0) * R.maidenBonus;
      if (bw.wickets >= 5) fp += R.fiveWicketBonus + R.threeWicketBonus;
      else if (bw.wickets >= 3) fp += R.threeWicketBonus;

      // Economy bonus/penalty (min 2 overs = 12 legal balls)
      if ((bw.legalBalls || 0) >= 12) {
        if (bw.economy <= 5) fp += R.economyBonusGt5;
        else if (bw.economy >= 10) fp += R.economyPenaltyGt10;
      }

      // LBW/Bowled bonus tracked via wicketTypes if available
      if (bw.lbwBowledCount) fp += bw.lbwBowledCount * R.lbwBowledBonus;

      p.fantasyPoints += fp;
    }
  };

  processInnings(liveState.innings1);
  processInnings(liveState.innings2);

  // Team win bonus
  if (isCompleted && winnerTeamId) {
    for (const p of Object.values(players)) {
      if (p.teamId === winnerTeamId) p.fantasyPoints += R.teamWinBonus;
    }
  }

  return Object.values(players);
}

function deriveFootballStats(liveState, match) {
  const R = SCORING_RULES.Football;
  const { isCompleted, winnerTeamId } = matchResult(liveState, match);
  const allPlayers = { ...(liveState.players || {}) };

  // Also build from timeline for backward compat if players map is missing
  if (Object.keys(allPlayers).length === 0) {
    for (const ev of (liveState.timeline || [])) {
      if (!ev.playerId && !ev.scorerId) continue;
      const pid = ev.playerId || ev.scorerId;
      if (!allPlayers[pid]) allPlayers[pid] = { id: pid, name: ev.playerName || 'Player', teamId: ev.teamId, goals: 0, assists: 0, yellowCards: 0, redCards: 0, ownGoals: 0 };
    }
  }

  const result = [];
  for (const [pid, p] of Object.entries(allPlayers)) {
    let fp = 0;
    fp += (p.goals || 0) * R.goal;
    fp += (p.assists || 0) * R.assist;
    fp += (p.yellowCards || 0) * R.yellowCard;
    fp += (p.redCards || 0) * R.redCard;
    fp += (p.ownGoals || 0) * R.ownGoal;
    if (isCompleted && winnerTeamId && p.teamId === winnerTeamId) fp += R.teamWinBonus;

    result.push({
      playerId: pid,
      name: p.name || pid,
      teamId: p.teamId,
      sport: 'Football',
      stats: {
        goals: p.goals || 0,
        assists: p.assists || 0,
        yellowCards: p.yellowCards || 0,
        redCards: p.redCards || 0,
        ownGoals: p.ownGoals || 0
      },
      fantasyPoints: fp
    });
  }
  return result;
}

function deriveBasketballStats(liveState, match) {
  const R = SCORING_RULES.Basketball;
  const { isCompleted, winnerTeamId } = matchResult(liveState, match);
  const allPlayers = { ...(liveState.players || {}) };
  const result = [];

  for (const [pid, p] of Object.entries(allPlayers)) {
    let fp = 0;
    fp += (p.points || 0) * R.pointScored;
    fp += (p.threes || 0) * R.threePointerBonus;
    fp += (p.fouls || 0) * R.foulPenalty;
    if (isCompleted && winnerTeamId && p.teamId === winnerTeamId) fp += R.teamWinBonus;

    result.push({
      playerId: pid,
      name: p.name || pid,
      teamId: p.teamId,
      sport: 'Basketball',
      stats: {
        points: p.points || 0,
        threes: p.threes || 0,
        twos: p.twos || 0,
        freeThrows: p.freeThrows || 0,
        fouls: p.fouls || 0
      },
      fantasyPoints: fp
    });
  }
  return result;
}

function deriveKabaddiStats(liveState, match) {
  const R = SCORING_RULES.Kabaddi;
  const { isCompleted, winnerTeamId } = matchResult(liveState, match);
  const allPlayers = { ...(liveState.players || {}) };
  const result = [];

  for (const [pid, p] of Object.entries(allPlayers)) {
    let fp = 0;
    fp += (p.raidPoints || 0) * R.raidPoint;
    fp += (p.tacklePoints || 0) * R.tacklePoint;
    fp += (p.bonusPoints || 0) * R.bonusPoint;
    fp += (p.superRaids || 0) * R.superRaidExtra;
    fp += (p.superTackles || 0) * R.superTackleExtra;
    if (isCompleted && winnerTeamId && p.teamId === winnerTeamId) fp += R.teamWinBonus;

    result.push({
      playerId: pid,
      name: p.name || pid,
      teamId: p.teamId,
      sport: 'Kabaddi',
      stats: {
        raidPoints: p.raidPoints || 0,
        tacklePoints: p.tacklePoints || 0,
        bonusPoints: p.bonusPoints || 0,
        superRaids: p.superRaids || 0,
        superTackles: p.superTackles || 0,
        totalPoints: (p.raidPoints || 0) + (p.tacklePoints || 0) + (p.bonusPoints || 0)
      },
      fantasyPoints: fp
    });
  }
  return result;
}

function deriveRacketStats(liveState, match) {
  const R = SCORING_RULES.Racket;
  const { isCompleted, winnerTeamId } = matchResult(liveState, match);
  const allPlayers = { ...(liveState.players || {}) };
  const result = [];

  for (const [pid, p] of Object.entries(allPlayers)) {
    let fp = 0;
    fp += (p.pointsWon || 0) * R.pointWon;
    fp += (p.setsWon || 0) * R.setWon;
    if (isCompleted && winnerTeamId && p.teamId === winnerTeamId) fp += R.matchWon;
    if (isCompleted && winnerTeamId && p.teamId === winnerTeamId) fp += R.teamWinBonus;

    result.push({
      playerId: pid,
      name: p.name || pid,
      teamId: p.teamId,
      sport: liveState.sport || 'Racket/Net',
      stats: {
        pointsWon: p.pointsWon || 0,
        setsWon: p.setsWon || 0,
        aces: p.aces || 0,
        smashes: p.smashes || 0
      },
      fantasyPoints: fp
    });
  }
  return result;
}

function deriveGenericStats(liveState, match) {
  const R = SCORING_RULES.Generic;
  const { isCompleted, winnerTeamId } = matchResult(liveState, match);
  const allPlayers = { ...(liveState.players || {}) };
  const result = [];

  for (const [pid, p] of Object.entries(allPlayers)) {
    let fp = (p.points || 0) * R.pointScored;
    if (isCompleted && winnerTeamId && p.teamId === winnerTeamId) fp += R.teamWinBonus;

    result.push({
      playerId: pid,
      name: p.name || pid,
      teamId: p.teamId,
      sport: liveState.sport || 'Generic',
      stats: { points: p.points || 0 },
      fantasyPoints: fp
    });
  }
  return result;
}

// ────────────────────────────────────────────────────────────────
// Main exported function
// ────────────────────────────────────────────────────────────────

/**
 * Derive per-player stats and fantasy points from the live state.
 * @param {string} sport - e.g. "Cricket", "Football", "Basketball"
 * @param {object} liveState - output from plugin reducer chain
 * @param {object} match - match row from DB (has team_a_id, team_b_id etc.)
 * @returns {Array} - [ { playerId, name, teamId, sport, stats, fantasyPoints } ]
 */
export function derivePlayerStats(sport, liveState, match) {
  if (!liveState || !match) return [];

  const s = String(sport).toLowerCase();

  try {
    if (s.includes('cricket')) return deriveCricketStats(liveState, match);
    if (s.includes('football') || s.includes('futsal') || s.includes('soccer')) return deriveFootballStats(liveState, match);
    if (s.includes('basketball')) return deriveBasketballStats(liveState, match);
    if (s.includes('kabaddi')) return deriveKabaddiStats(liveState, match);
    if (s.includes('badminton') || s.includes('volleyball') || s.includes('table tennis') || s.includes('tt') || s.includes('tennis')) return deriveRacketStats(liveState, match);
    return deriveGenericStats(liveState, match);
  } catch (err) {
    console.error('derivePlayerStats error:', err);
    return [];
  }
}

export default derivePlayerStats;
