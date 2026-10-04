/**
 * Generic & Board Game Scoring Plugin (Chess, Carrom, Custom Sports)
 */

export const initialGenericState = (match, config = {}) => {
  const sportName = match.sport || 'Custom Sport';
  const teamAName = match.team_a_name || 'Participant A';
  const teamBName = match.team_b_name || 'Participant B';
  const teamAId = match.team_a_id || 'team_a';
  const teamBId = match.team_b_id || 'team_b';

  return {
    sport: sportName,
    config: {
      scoringType: config.scoringType || 'POINTS',
      winTarget: Number(config.winTarget || 0)
    },
    teamA: { id: teamAId, name: teamAName, score: 0, roundsWon: 0 },
    teamB: { id: teamBId, name: teamBName, score: 0, roundsWon: 0 },
    currentRound: 1,
    roundHistory: [],
    players: {}, // { [playerId]: { id, name, teamId, points } }
    timeline: [],
    isCompleted: false,
    resultText: ''
  };
};

export const genericReducer = (state, event) => {
  const s = JSON.parse(JSON.stringify(state));

  switch (event.type) {
    case 'ADD_POINTS': {
      const { teamId, delta = 1, note = '', playerId = null, playerName = '' } = event.payload;
      const isTeamA = teamId === s.teamA.id;
      const targetTeam = isTeamA ? s.teamA : s.teamB;
      targetTeam.score += Number(delta);

      // Per-player tracking
      const pid = playerId || (playerName ? `name_${playerName}` : null);
      if (pid && delta > 0) {
        if (!s.players[pid]) s.players[pid] = { id: pid, name: playerName || pid, teamId, points: 0 };
        s.players[pid].points = (s.players[pid].points || 0) + Number(delta);
        s.players[pid].teamId = teamId;
      }

      s.timeline.unshift({
        type: 'POINTS_ADJUST',
        round: s.currentRound,
        text: `${delta >= 0 ? `+${delta}` : delta} for ${targetTeam.name}${note ? ` (${note})` : ''} [${s.teamA.score} - ${s.teamB.score}]`
      });

      if (s.config.winTarget > 0 && targetTeam.score >= s.config.winTarget) {
        s.isCompleted = true;
        s.resultText = `${targetTeam.name} reached target ${s.config.winTarget} and won!`;
      }
      break;
    }

    case 'ROUND_RESULT': {
      const { winnerTeamId, scoreA = 0, scoreB = 0, note = '' } = event.payload;
      const isTeamAWinner = winnerTeamId === s.teamA.id;
      const isDraw = winnerTeamId === 'DRAW' || !winnerTeamId;

      if (!isDraw) {
        if (isTeamAWinner) s.teamA.roundsWon += 1;
        else s.teamB.roundsWon += 1;
      }

      s.roundHistory.push({
        round: s.currentRound,
        scoreA,
        scoreB,
        winnerTeamId,
        winnerName: isDraw ? 'Draw' : isTeamAWinner ? s.teamA.name : s.teamB.name
      });

      s.timeline.unshift({
        type: 'ROUND_END',
        round: s.currentRound,
        text: `🏁 Round ${s.currentRound}: ${isDraw ? 'Draw' : `Won by ${isTeamAWinner ? s.teamA.name : s.teamB.name}`}${note ? ` (${note})` : ''}`
      });

      s.currentRound += 1;
      break;
    }

    case 'SET_RESULT': {
      const { outcome, winnerTeamId, details = '' } = event.payload; // 'WIN' | 'DRAW'
      s.isCompleted = true;
      if (outcome === 'DRAW') {
        s.resultText = `Match Drawn${details ? ` · ${details}` : ''}`;
      } else {
        const winnerName = winnerTeamId === s.teamA.id ? s.teamA.name : s.teamB.name;
        s.resultText = `${winnerName} won the match${details ? ` (${details})` : ''}`;
      }
      s.timeline.unshift({
        type: 'FINAL_RESULT',
        text: `🏆 Final: ${s.resultText}`
      });
      break;
    }

    default:
      break;
  }

  return s;
};
