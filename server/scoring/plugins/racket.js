/**
 * Racket & Net Sports Live Scoring Plugin
 * Supports Badminton, Volleyball, Table Tennis, Tennis
 */

export const initialRacketState = (match, config = {}) => {
  const sportName = match.sport || 'Badminton';
  const teamAName = match.team_a_name || 'Player/Team A';
  const teamBName = match.team_b_name || 'Player/Team B';
  const teamAId = match.team_a_id || 'team_a';
  const teamBId = match.team_b_id || 'team_b';

  // Sport specific target defaults
  let targetSetPoints = 21; // Badminton
  let maxCapPoints = 30;
  let defaultSetTargets = null;

  if (sportName.toLowerCase().includes('table tennis') || sportName.toLowerCase().includes('tt')) {
    targetSetPoints = 11;
    maxCapPoints = 99;
  } else if (sportName.toLowerCase().includes('volleyball')) {
    targetSetPoints = 25;
    maxCapPoints = 99;
    // Volleyball best of 3: Set 1 & 2 to 25 pts, Set 3 decider to 15 pts
    defaultSetTargets = { 1: 25, 2: 25, 3: 15, 4: 25, 5: 15 };
  } else if (sportName.toLowerCase().includes('tennis')) {
    targetSetPoints = 6; // games
    maxCapPoints = 99;
    // Tennis: Sets 1 & 2 to 6 games, Set 3 Super Tiebreak to 10 pts
    defaultSetTargets = { 1: 6, 2: 6, 3: 10 };
  }

  const bestOfSets = Number(config.bestOfSets || 3);
  const setsToWin = Math.ceil(bestOfSets / 2);

  return {
    sport: sportName,
    config: {
      bestOfSets,
      setsToWin,
      pointsPerSet: Number(config.pointsPerSet || targetSetPoints),
      setTargets: config.setTargets || defaultSetTargets || null,
      maxCapPoints: Number(config.maxCapPoints || maxCapPoints),
      winByTwo: Boolean(config.winByTwo ?? true)
    },
    teamA: { id: teamAId, name: teamAName, currentPoints: 0, setsWon: 0 },
    teamB: { id: teamBId, name: teamBName, currentPoints: 0, setsWon: 0 },
    currentSetNumber: 1,
    servingTeamId: teamAId,
    setHistory: [],
    players: {}, // { [playerId]: { id, name, teamId, pointsWon, setsWon, aces, smashes } }
    timeline: [],
    isCompleted: false,
    resultText: ''
  };
};

/**
 * Determine target points for the current set (supports 15-15-21 custom formats)
 */
export const getCurrentSetTarget = (s) => {
  if (s.config?.setTargets && s.config.setTargets[s.currentSetNumber]) {
    return Number(s.config.setTargets[s.currentSetNumber]);
  }
  if (Array.isArray(s.config?.pointsPerSet)) {
    return Number(s.config.pointsPerSet[s.currentSetNumber - 1] || s.config.pointsPerSet[0] || 21);
  }
  return Number(s.config?.pointsPerSet || 21);
};

export const racketReducer = (state, event) => {
  const s = JSON.parse(JSON.stringify(state));

  switch (event.type) {
    case 'POINT': {
      if (s.isCompleted) return s;

      const { teamId, playerId = null, playerName = '' } = event.payload || {};
      const isTeamA = String(teamId) === String(s.teamA?.id) || teamId === 'team_a' || teamId === 'A' || (teamId && teamId === s.teamA?.name);
      const isTeamB = String(teamId) === String(s.teamB?.id) || teamId === 'team_b' || teamId === 'B' || (teamId && teamId === s.teamB?.name);
      if (isTeamA) {
        s.teamA.currentPoints += 1;
        s.servingTeamId = s.teamA.id;
      } else if (isTeamB) {
        s.teamB.currentPoints += 1;
        s.servingTeamId = s.teamB.id;
      } else {
        s.teamA.currentPoints += 1;
        s.servingTeamId = s.teamA.id;
      }

      // Per-player tracking
      const pid = playerId || (playerName ? `name_${playerName}` : null);
      if (pid) {
        const pTeamId = isTeamA ? s.teamA.id : s.teamB.id;
        if (!s.players[pid]) s.players[pid] = { id: pid, name: playerName || pid, teamId: pTeamId, pointsWon: 0, setsWon: 0, aces: 0, smashes: 0 };
        s.players[pid].pointsWon = (s.players[pid].pointsWon || 0) + 1;
        s.players[pid].teamId = pTeamId;
      }

      const ptsA = s.teamA.currentPoints;
      const ptsB = s.teamB.currentPoints;
      const target = getCurrentSetTarget(s);
      const cap = s.config.maxCapPoints;
      const winByTwo = s.config.winByTwo;

      s.timeline.unshift({
        type: 'POINT',
        set: s.currentSetNumber,
        text: `Point for ${isTeamA ? s.teamA.name : s.teamB.name} [${ptsA} - ${ptsB}] (Set ${s.currentSetNumber}, Target: ${target})`
      });

      // Check if set is won
      let setWonBy = null;
      if (ptsA >= target || ptsB >= target) {
        if (!winByTwo) {
          setWonBy = ptsA > ptsB ? s.teamA.id : s.teamB.id;
        } else {
          if (ptsA >= cap) setWonBy = s.teamA.id;
          else if (ptsB >= cap) setWonBy = s.teamB.id;
          else if (Math.abs(ptsA - ptsB) >= 2) {
            setWonBy = ptsA > ptsB ? s.teamA.id : s.teamB.id;
          }
        }
      }

      if (setWonBy) {
        const isSetWonByA = setWonBy === s.teamA.id;
        if (isSetWonByA) s.teamA.setsWon += 1;
        else s.teamB.setsWon += 1;

        // Track sets won per player
        if (pid) {
          s.players[pid].setsWon = (s.players[pid].setsWon || 0) + 1;
        }

        s.setHistory.push({
          setNumber: s.currentSetNumber,
          scoreA: ptsA,
          scoreB: ptsB,
          target,
          winnerTeamId: setWonBy,
          winnerName: isSetWonByA ? s.teamA.name : s.teamB.name
        });

        s.timeline.unshift({
          type: 'SET_COMPLETE',
          set: s.currentSetNumber,
          text: `🏆 Set ${s.currentSetNumber} won by ${isSetWonByA ? s.teamA.name : s.teamB.name} (${ptsA} - ${ptsB})`
        });

        if (s.teamA.setsWon >= s.config.setsToWin) {
          s.isCompleted = true;
          s.resultText = `${s.teamA.name} won ${s.teamA.setsWon} - ${s.teamB.setsWon} sets`;
        } else if (s.teamB.setsWon >= s.config.setsToWin) {
          s.isCompleted = true;
          s.resultText = `${s.teamB.name} won ${s.teamB.setsWon} - ${s.teamA.setsWon} sets`;
        } else {
          s.currentSetNumber += 1;
          s.teamA.currentPoints = 0;
          s.teamB.currentPoints = 0;
        }
      }
      break;
    }

    case 'SET_TARGET_POINTS': {
      const { pointsPerSet, setTargets, maxCapPoints } = event.payload || {};
      if (pointsPerSet) s.config.pointsPerSet = pointsPerSet;
      if (setTargets) s.config.setTargets = { ...(s.config.setTargets || {}), ...setTargets };
      if (maxCapPoints) s.config.maxCapPoints = Number(maxCapPoints);
      s.timeline.unshift({
        type: 'CONFIG_CHANGE',
        text: `⚙️ Set Target updated to ${getCurrentSetTarget(s)} pts for Set ${s.currentSetNumber}`
      });
      break;
    }

    case 'COMPLETE_SET': {
      if (s.isCompleted) return s;
      const { winnerTeamId } = event.payload || {};
      const ptsA = s.teamA.currentPoints;
      const ptsB = s.teamB.currentPoints;
      const setWonBy = winnerTeamId || (ptsA >= ptsB ? s.teamA.id : s.teamB.id);
      const isSetWonByA = setWonBy === s.teamA.id;

      if (isSetWonByA) s.teamA.setsWon += 1;
      else s.teamB.setsWon += 1;

      s.setHistory.push({
        setNumber: s.currentSetNumber,
        scoreA: ptsA,
        scoreB: ptsB,
        target: getCurrentSetTarget(s),
        winnerTeamId: setWonBy,
        winnerName: isSetWonByA ? s.teamA.name : s.teamB.name
      });

      s.timeline.unshift({
        type: 'SET_COMPLETE',
        set: s.currentSetNumber,
        text: `🏆 Set ${s.currentSetNumber} completed (${isSetWonByA ? s.teamA.name : s.teamB.name} won ${ptsA} - ${ptsB})`
      });

      if (s.teamA.setsWon >= s.config.setsToWin) {
        s.isCompleted = true;
        s.resultText = `${s.teamA.name} won ${s.teamA.setsWon} - ${s.teamB.setsWon} sets`;
      } else if (s.teamB.setsWon >= s.config.setsToWin) {
        s.isCompleted = true;
        s.resultText = `${s.teamB.name} won ${s.teamB.setsWon} - ${s.teamA.setsWon} sets`;
      } else {
        s.currentSetNumber += 1;
        s.teamA.currentPoints = 0;
        s.teamB.currentPoints = 0;
      }
      break;
    }

    case 'TOGGLE_SERVICE': {
      s.servingTeamId = s.servingTeamId === s.teamA.id ? s.teamB.id : s.teamA.id;
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
