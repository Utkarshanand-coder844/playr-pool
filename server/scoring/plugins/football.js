/**
 * Football / Futsal Live Scoring Plugin
 */

export const initialFootballState = (match, config = {}) => {
  const teamAName = match.team_a_name || 'Team A';
  const teamBName = match.team_b_name || 'Team B';
  const teamAId = match.team_a_id || 'team_a';
  const teamBId = match.team_b_id || 'team_b';

  return {
    sport: 'Football',
    config: {
      halfDurationMinutes: Number(config.halfDurationMinutes || 45),
      extraTimeAllowed: Boolean(config.extraTimeAllowed ?? true),
      penaltyShootoutAllowed: Boolean(config.penaltyShootoutAllowed ?? true)
    },
    teamA: { id: teamAId, name: teamAName, score: 0, yellowCards: 0, redCards: 0, penaltyScore: 0 },
    teamB: { id: teamBId, name: teamBName, score: 0, yellowCards: 0, redCards: 0, penaltyScore: 0 },
    period: '1st Half',
    currentMinute: 0,
    timeline: [],
    penaltyKicks: [],
    players: {}, // { [playerId]: { id, name, teamId, goals, assists, yellowCards, redCards, ownGoals } }
    isCompleted: false,
    resultText: ''
  };
};

export const footballReducer = (state, event) => {
  const s = JSON.parse(JSON.stringify(state));

  switch (event.type) {
    case 'GOAL': {
      const { teamId, scorer = 'Unknown', scorerId = null, assist = '', assistId = null, minute = s.currentMinute, isOwnGoal = false } = event.payload;
      const isTeamA = teamId === s.teamA.id;
      if (isTeamA) s.teamA.score += 1;
      else s.teamB.score += 1;

      const teamName = isTeamA ? s.teamA.name : s.teamB.name;

      // Per-player tracking: scorer
      const sPid = scorerId || (scorer && scorer !== 'Unknown' ? `name_${scorer}` : null);
      if (sPid) {
        if (!s.players[sPid]) s.players[sPid] = { id: sPid, name: scorer, teamId, goals: 0, assists: 0, yellowCards: 0, redCards: 0, ownGoals: 0 };
        if (isOwnGoal) s.players[sPid].ownGoals = (s.players[sPid].ownGoals || 0) + 1;
        else s.players[sPid].goals = (s.players[sPid].goals || 0) + 1;
        s.players[sPid].teamId = teamId;
      }

      // Per-player tracking: assist
      const aPid = assistId || (assist ? `name_${assist}` : null);
      if (aPid && !isOwnGoal) {
        if (!s.players[aPid]) s.players[aPid] = { id: aPid, name: assist, teamId, goals: 0, assists: 0, yellowCards: 0, redCards: 0, ownGoals: 0 };
        s.players[aPid].assists = (s.players[aPid].assists || 0) + 1;
        s.players[aPid].teamId = teamId;
      }

      s.timeline.unshift({
        type: 'GOAL',
        minute,
        teamId,
        teamName,
        text: `⚽ GOAL! ${scorer}${assist ? ` (assist: ${assist})` : ''} [${s.teamA.score} - ${s.teamB.score}]`
      });
      break;
    }

    case 'CARD': {
      const { teamId, cardType = 'YELLOW', player = 'Player', playerId = null, minute = s.currentMinute } = event.payload;
      const isTeamA = teamId === s.teamA.id;
      const targetTeam = isTeamA ? s.teamA : s.teamB;

      // Per-player tracking
      const pid = playerId || (player ? `name_${player}` : null);
      if (pid) {
        if (!s.players[pid]) s.players[pid] = { id: pid, name: player, teamId, goals: 0, assists: 0, yellowCards: 0, redCards: 0, ownGoals: 0 };
        if (cardType === 'YELLOW') s.players[pid].yellowCards = (s.players[pid].yellowCards || 0) + 1;
        else s.players[pid].redCards = (s.players[pid].redCards || 0) + 1;
        s.players[pid].teamId = teamId;
      }

      if (cardType === 'YELLOW') {
        targetTeam.yellowCards += 1;
        s.timeline.unshift({
          type: 'YELLOW_CARD',
          minute,
          teamId,
          teamName: targetTeam.name,
          text: `🟨 Yellow Card: ${player}`
        });
      } else {
        targetTeam.redCards += 1;
        s.timeline.unshift({
          type: 'RED_CARD',
          minute,
          teamId,
          teamName: targetTeam.name,
          text: `🟥 Red Card: ${player}`
        });
      }
      break;
    }

    case 'SUBSTITUTION': {
      const { teamId, playerIn, playerOut, minute = s.currentMinute } = event.payload;
      const isTeamA = teamId === s.teamA.id;
      const teamName = isTeamA ? s.teamA.name : s.teamB.name;
      s.timeline.unshift({
        type: 'SUBSTITUTION',
        minute,
        teamId,
        teamName,
        text: `🔄 Sub: ${playerIn} IN ⇄ ${playerOut} OUT`
      });
      break;
    }

    case 'SET_PERIOD': {
      const { period, minute } = event.payload;
      s.period = period;
      if (typeof minute === 'number') s.currentMinute = minute;
      s.timeline.unshift({
        type: 'PERIOD_CHANGE',
        minute: s.currentMinute,
        text: `⏱️ Period: ${period}`
      });
      if (period === 'Ended' || period === 'Full Time') {
        if (s.teamA.score > s.teamB.score) {
          s.isCompleted = true;
          s.resultText = `${s.teamA.name} won ${s.teamA.score} - ${s.teamB.score}`;
        } else if (s.teamB.score > s.teamA.score) {
          s.isCompleted = true;
          s.resultText = `${s.teamB.name} won ${s.teamB.score} - ${s.teamA.score}`;
        } else if (period === 'Ended') {
          s.isCompleted = true;
          s.resultText = `Match Drawn ${s.teamA.score} - ${s.teamB.score}`;
        }
      }
      break;
    }

    case 'PENALTY_SHOOTOUT': {
      const { teamId, scored } = event.payload;
      const isTeamA = teamId === s.teamA.id;
      if (scored) {
        if (isTeamA) s.teamA.penaltyScore += 1;
        else s.teamB.penaltyScore += 1;
      }
      s.penaltyKicks.push({ teamId, scored, kickIndex: s.penaltyKicks.length + 1 });
      const teamName = isTeamA ? s.teamA.name : s.teamB.name;
      s.timeline.unshift({
        type: 'PENALTY_KICK',
        minute: 'Shootout',
        text: `${scored ? '✅ Scored' : '❌ Missed'} penalty kick by ${teamName} (${s.teamA.penaltyScore} - ${s.teamB.penaltyScore})`
      });
      break;
    }

    case 'SET_MINUTE': {
      if (typeof event.payload.minute === 'number') {
        s.currentMinute = event.payload.minute;
      }
      break;
    }

    default:
      break;
  }

  return s;
};
