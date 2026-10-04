/**
 * Kabaddi Live Scoring Plugin
 */

export const initialKabaddiState = (match, config = {}) => {
  const teamAName = match.team_a_name || 'Team A';
  const teamBName = match.team_b_name || 'Team B';
  const teamAId = match.team_a_id || 'team_a';
  const teamBId = match.team_b_id || 'team_b';

  return {
    sport: 'Kabaddi',
    config: {
      halfDurationMinutes: Number(config.halfDurationMinutes || 20)
    },
    teamA: { id: teamAId, name: teamAName, score: 0, raidPoints: 0, tacklePoints: 0, allOuts: 0, bonusPoints: 0 },
    teamB: { id: teamBId, name: teamBName, score: 0, raidPoints: 0, tacklePoints: 0, allOuts: 0, bonusPoints: 0 },
    half: '1st Half',
    players: {}, // { [playerId]: { id, name, teamId, raidPoints, tacklePoints, bonusPoints, superRaids, superTackles } }
    timeline: [],
    isCompleted: false,
    resultText: ''
  };
};

export const kabaddiReducer = (state, event) => {
  const s = JSON.parse(JSON.stringify(state));

  switch (event.type) {
    case 'SCORE_ACTION': {
      if (s.isCompleted) return s;
      const { teamId, actionType, points = 1, raider = '', raiderId = null, defender = '', defenderId = null } = event.payload;
      const isTeamA = teamId === s.teamA.id;
      const targetTeam = isTeamA ? s.teamA : s.teamB;
      const pts = Number(points) || 1;

      targetTeam.score += pts;

      let actionLabel = '';
      const isRaidAction = actionType === 'RAID' || actionType === 'SUPER_RAID' || actionType === 'BONUS';
      const isTackleAction = actionType === 'TACKLE' || actionType === 'SUPER_TACKLE';

      // Per-player tracking: raider
      const rpid = raiderId || (raider ? `name_${raider}` : null);
      if (rpid && isRaidAction) {
        if (!s.players[rpid]) s.players[rpid] = { id: rpid, name: raider, teamId, raidPoints: 0, tacklePoints: 0, bonusPoints: 0, superRaids: 0, superTackles: 0 };
        s.players[rpid].teamId = teamId;
        if (actionType === 'BONUS') s.players[rpid].bonusPoints = (s.players[rpid].bonusPoints || 0) + pts;
        else { s.players[rpid].raidPoints = (s.players[rpid].raidPoints || 0) + pts; }
        if (actionType === 'SUPER_RAID') s.players[rpid].superRaids = (s.players[rpid].superRaids || 0) + 1;
      }

      // Per-player tracking: defender
      const dpid = defenderId || (defender ? `name_${defender}` : null);
      if (dpid && isTackleAction) {
        if (!s.players[dpid]) s.players[dpid] = { id: dpid, name: defender, teamId, raidPoints: 0, tacklePoints: 0, bonusPoints: 0, superRaids: 0, superTackles: 0 };
        s.players[dpid].teamId = teamId;
        s.players[dpid].tacklePoints = (s.players[dpid].tacklePoints || 0) + pts;
        if (actionType === 'SUPER_TACKLE') s.players[dpid].superTackles = (s.players[dpid].superTackles || 0) + 1;
      }

      if (actionType === 'RAID') {
        targetTeam.raidPoints += pts;
        actionLabel = `🏃 Raid Point (+${pts})`;
      } else if (actionType === 'SUPER_RAID') {
        targetTeam.raidPoints += pts;
        actionLabel = `🔥 SUPER RAID! (+${pts})`;
      } else if (actionType === 'TACKLE') {
        targetTeam.tacklePoints += pts;
        actionLabel = `🛡️ Tackle Point (+${pts})`;
      } else if (actionType === 'SUPER_TACKLE') {
        targetTeam.tacklePoints += pts;
        actionLabel = `⚡ SUPER TACKLE! (+${pts})`;
      } else if (actionType === 'ALL_OUT') {
        targetTeam.allOuts += 1;
        actionLabel = `💥 ALL OUT! (+${pts} Bonus)`;
      } else if (actionType === 'BONUS') {
        targetTeam.bonusPoints += pts;
        actionLabel = `✨ Bonus Point (+${pts})`;
      }

      s.timeline.unshift({
        type: actionType,
        half: s.half,
        text: `${actionLabel} for ${targetTeam.name}${raider ? ` by ${raider}` : ''}${defender ? ` on ${defender}` : ''} [${s.teamA.score} - ${s.teamB.score}]`
      });
      break;
    }

    case 'SET_HALF': {
      s.half = event.payload.half;
      s.timeline.unshift({
        type: 'HALF_CHANGE',
        half: s.half,
        text: `⏱️ ${s.half}`
      });
      if (s.half === 'Ended') {
        s.isCompleted = true;
        if (s.teamA.score > s.teamB.score) {
          s.resultText = `${s.teamA.name} won by ${s.teamA.score - s.teamB.score} pts (${s.teamA.score} - ${s.teamB.score})`;
        } else if (s.teamB.score > s.teamA.score) {
          s.resultText = `${s.teamB.name} won by ${s.teamB.score - s.teamA.score} pts (${s.teamB.score} - ${s.teamA.score})`;
        } else {
          s.resultText = `Match Tied (${s.teamA.score} - ${s.teamB.score})`;
        }
      }
      break;
    }

    case 'END_MATCH': {
      s.isCompleted = true;
      if (event.payload?.resultText) s.resultText = event.payload.resultText;
      break;
    }

    default:
      break;
  }

  return s;
};
