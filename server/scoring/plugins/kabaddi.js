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
    half: '1st Half', // '1st Half', 'Half Time', '2nd Half', 'Ended'
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
      const { teamId, actionType, points = 1, raider = '', defender = '' } = event.payload;
      // actionType: 'RAID' | 'SUPER_RAID' | 'TACKLE' | 'SUPER_TACKLE' | 'ALL_OUT' | 'BONUS'
      const isTeamA = teamId === s.teamA.id;
      const targetTeam = isTeamA ? s.teamA : s.teamB;
      const pts = Number(points) || 1;

      targetTeam.score += pts;

      let actionLabel = '';
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
