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
  if (sportName.toLowerCase().includes('table tennis') || sportName.toLowerCase().includes('tt')) {
    targetSetPoints = 11;
    maxCapPoints = 99;
  } else if (sportName.toLowerCase().includes('volleyball')) {
    targetSetPoints = 25;
    maxCapPoints = 99;
  } else if (sportName.toLowerCase().includes('tennis')) {
    targetSetPoints = 6; // games
    maxCapPoints = 99;
  }

  const bestOfSets = Number(config.bestOfSets || 3);
  const setsToWin = Math.ceil(bestOfSets / 2);

  return {
    sport: sportName,
    config: {
      bestOfSets,
      setsToWin,
      pointsPerSet: Number(config.pointsPerSet || targetSetPoints),
      maxCapPoints: Number(config.maxCapPoints || maxCapPoints),
      winByTwo: Boolean(config.winByTwo ?? true)
    },
    teamA: { id: teamAId, name: teamAName, currentPoints: 0, setsWon: 0 },
    teamB: { id: teamBId, name: teamBName, currentPoints: 0, setsWon: 0 },
    currentSetNumber: 1,
    servingTeamId: teamAId,
    setHistory: [], // array of { setNumber: 1, scoreA: 21, scoreB: 18, winnerTeamId }
    timeline: [],
    isCompleted: false,
    resultText: ''
  };
};

export const racketReducer = (state, event) => {
  const s = JSON.parse(JSON.stringify(state));

  switch (event.type) {
    case 'POINT': {
      if (s.isCompleted) return s;

      const { teamId } = event.payload;
      const isTeamA = teamId === s.teamA.id;
      if (isTeamA) s.teamA.currentPoints += 1;
      else s.teamB.currentPoints += 1;

      s.servingTeamId = teamId; // point winner serves

      const ptsA = s.teamA.currentPoints;
      const ptsB = s.teamB.currentPoints;
      const target = s.config.pointsPerSet;
      const cap = s.config.maxCapPoints;
      const winByTwo = s.config.winByTwo;

      s.timeline.unshift({
        type: 'POINT',
        set: s.currentSetNumber,
        text: `Point for ${isTeamA ? s.teamA.name : s.teamB.name} [${ptsA} - ${ptsB}] (Set ${s.currentSetNumber})`
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

        s.setHistory.push({
          setNumber: s.currentSetNumber,
          scoreA: ptsA,
          scoreB: ptsB,
          winnerTeamId: setWonBy,
          winnerName: isSetWonByA ? s.teamA.name : s.teamB.name
        });

        s.timeline.unshift({
          type: 'SET_COMPLETE',
          set: s.currentSetNumber,
          text: `🏆 Set ${s.currentSetNumber} won by ${isSetWonByA ? s.teamA.name : s.teamB.name} (${ptsA} - ${ptsB})`
        });

        // Check if overall match is won
        if (s.teamA.setsWon >= s.config.setsToWin) {
          s.isCompleted = true;
          s.resultText = `${s.teamA.name} won ${s.teamA.setsWon} - ${s.teamB.setsWon} sets`;
        } else if (s.teamB.setsWon >= s.config.setsToWin) {
          s.isCompleted = true;
          s.resultText = `${s.teamB.name} won ${s.teamB.setsWon} - ${s.teamA.setsWon} sets`;
        } else {
          // Advance to next set
          s.currentSetNumber += 1;
          s.teamA.currentPoints = 0;
          s.teamB.currentPoints = 0;
        }
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
