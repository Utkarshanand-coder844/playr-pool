/**
 * Basketball Live Scoring Plugin
 */

export const initialBasketballState = (match, config = {}) => {
  const teamAName = match.team_a_name || 'Team A';
  const teamBName = match.team_b_name || 'Team B';
  const teamAId = match.team_a_id || 'team_a';
  const teamBId = match.team_b_id || 'team_b';

  return {
    sport: 'Basketball',
    config: {
      quarterMinutes: Number(config.quarterMinutes || 10),
      totalQuarters: Number(config.totalQuarters || 4)
    },
    teamA: { id: teamAId, name: teamAName, score: 0, fouls: 0, timeouts: 0 },
    teamB: { id: teamBId, name: teamBName, score: 0, fouls: 0, timeouts: 0 },
    quarter: 'Q1',
    gameClock: '10:00',
    quarterScores: {
      Q1: { teamA: 0, teamB: 0 },
      Q2: { teamA: 0, teamB: 0 },
      Q3: { teamA: 0, teamB: 0 },
      Q4: { teamA: 0, teamB: 0 },
      OT: { teamA: 0, teamB: 0 }
    },
    players: {}, // { [playerId]: { id, name, teamId, points, threes, twos, freeThrows, fouls } }
    timeline: [],
    isCompleted: false,
    resultText: ''
  };
};

export const basketballReducer = (state, event) => {
  const s = JSON.parse(JSON.stringify(state));

  switch (event.type) {
    case 'SCORE_POINTS': {
      const { teamId, points, player = '', playerId = null } = event.payload;
      const isTeamA = teamId === s.teamA.id;
      const targetTeam = isTeamA ? s.teamA : s.teamB;
      const pts = Number(points) || 1;
      targetTeam.score += pts;

      if (s.quarterScores[s.quarter]) {
        if (isTeamA) s.quarterScores[s.quarter].teamA += pts;
        else s.quarterScores[s.quarter].teamB += pts;
      }

      // Per-player tracking
      const pid = playerId || (player ? `name_${player}` : null);
      if (pid) {
        if (!s.players[pid]) s.players[pid] = { id: pid, name: player, teamId, points: 0, threes: 0, twos: 0, freeThrows: 0, fouls: 0 };
        s.players[pid].points = (s.players[pid].points || 0) + pts;
        s.players[pid].teamId = teamId;
        if (pts === 3) s.players[pid].threes = (s.players[pid].threes || 0) + 1;
        else if (pts === 2) s.players[pid].twos = (s.players[pid].twos || 0) + 1;
        else if (pts === 1) s.players[pid].freeThrows = (s.players[pid].freeThrows || 0) + 1;
      }

      s.timeline.unshift({
        type: 'SCORE',
        quarter: s.quarter,
        clock: s.gameClock,
        text: `+${pts} PTS for ${targetTeam.name}${player ? ` (${player})` : ''} [${s.teamA.score} - ${s.teamB.score}]`
      });
      break;
    }

    case 'FOUL': {
      const { teamId, player = '', playerId = null } = event.payload;
      const isTeamA = teamId === s.teamA.id;
      const targetTeam = isTeamA ? s.teamA : s.teamB;
      targetTeam.fouls += 1;

      // Per-player tracking
      const pid = playerId || (player ? `name_${player}` : null);
      if (pid) {
        if (!s.players[pid]) s.players[pid] = { id: pid, name: player, teamId, points: 0, threes: 0, twos: 0, freeThrows: 0, fouls: 0 };
        s.players[pid].fouls = (s.players[pid].fouls || 0) + 1;
        s.players[pid].teamId = teamId;
      }

      s.timeline.unshift({
        type: 'FOUL',
        quarter: s.quarter,
        clock: s.gameClock,
        text: `🚨 Foul on ${targetTeam.name}${player ? ` (#${player})` : ''} (Team fouls: ${targetTeam.fouls})`
      });
      break;
    }

    case 'TIMEOUT': {
      const { teamId } = event.payload;
      const isTeamA = teamId === s.teamA.id;
      const targetTeam = isTeamA ? s.teamA : s.teamB;
      targetTeam.timeouts += 1;
      s.timeline.unshift({
        type: 'TIMEOUT',
        quarter: s.quarter,
        clock: s.gameClock,
        text: `⏸️ Timeout called by ${targetTeam.name}`
      });
      break;
    }

    case 'SET_QUARTER': {
      const { quarter, clock } = event.payload;
      s.quarter = quarter;
      if (clock) s.gameClock = clock;
      // Reset team fouls per quarter
      s.teamA.fouls = 0;
      s.teamB.fouls = 0;
      s.timeline.unshift({
        type: 'QUARTER_CHANGE',
        quarter: s.quarter,
        text: `🔔 Started ${quarter}`
      });
      break;
    }

    case 'SET_CLOCK': {
      s.gameClock = event.payload.clock;
      break;
    }

    case 'END_GAME': {
      s.isCompleted = true;
      if (s.teamA.score > s.teamB.score) {
        s.resultText = `${s.teamA.name} won by ${s.teamA.score - s.teamB.score} pts (${s.teamA.score} - ${s.teamB.score})`;
      } else if (s.teamB.score > s.teamA.score) {
        s.resultText = `${s.teamB.name} won by ${s.teamB.score - s.teamA.score} pts (${s.teamB.score} - ${s.teamA.score})`;
      } else {
        s.resultText = `Game Tied (${s.teamA.score} - ${s.teamB.score})`;
      }
      break;
    }

    default:
      break;
  }

  return s;
};
