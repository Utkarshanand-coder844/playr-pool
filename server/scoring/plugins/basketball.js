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
    quarter: 'Q1', // Q1, Q2, Q3, Q4, OT
    gameClock: '10:00',
    quarterScores: {
      Q1: { teamA: 0, teamB: 0 },
      Q2: { teamA: 0, teamB: 0 },
      Q3: { teamA: 0, teamB: 0 },
      Q4: { teamA: 0, teamB: 0 },
      OT: { teamA: 0, teamB: 0 }
    },
    timeline: [],
    isCompleted: false,
    resultText: ''
  };
};

export const basketballReducer = (state, event) => {
  const s = JSON.parse(JSON.stringify(state));

  switch (event.type) {
    case 'SCORE_POINTS': {
      const { teamId, points, player = '' } = event.payload; // points: 1, 2, or 3
      const isTeamA = teamId === s.teamA.id;
      const targetTeam = isTeamA ? s.teamA : s.teamB;
      const pts = Number(points) || 1;
      targetTeam.score += pts;

      if (s.quarterScores[s.quarter]) {
        if (isTeamA) s.quarterScores[s.quarter].teamA += pts;
        else s.quarterScores[s.quarter].teamB += pts;
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
      const { teamId, player = '' } = event.payload;
      const isTeamA = teamId === s.teamA.id;
      const targetTeam = isTeamA ? s.teamA : s.teamB;
      targetTeam.fouls += 1;
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
