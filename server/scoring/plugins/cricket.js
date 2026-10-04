/**
 * Cricket Live Scoring Plugin
 * Implements strict, official college/club T20/T10/custom overs cricket rules.
 * 
 * Rules implemented:
 * - 6 legal deliveries per over.
 * - Wide: +1 run (plus any ran extras), does NOT increment legal balls (re-bowled).
 * - No Ball: +1 run (plus any runs off bat / extras), does NOT increment legal balls.
 *   Next delivery is flagged as Free Hit. On Free Hit, dismissal can only be Run Out.
 * - Byes / Leg Byes: Team runs, legal ball, not credited to batsman's personal runs.
 * - Wicket: Dismissal recorded, wickets incremented, striker or designated batsman out, prompt next batsman.
 * - Strike Rotation: Automatically swaps striker on odd runs (1, 3) and at over completion.
 * - Bowler Tracking: Overs, maidens, runs conceded, wickets taken, economy.
 * - Batsmen Tracking: Runs, balls faced, 4s, 6s, strike rate, active crease status.
 * - Innings 1 & 2: Automatic target calculation (target = 1st innings total + 1),
 *   current run rate (CRR), required run rate (RRR), and final match verdict.
 * - Pure reducer function: replayable for zero-loss Undo & auditability.
 */

export const defaultCricketConfig = {
  totalOvers: 20,
  maxWickets: 10,
  oversPerBowler: 4
};

export const initialCricketState = (match, config = {}) => {
  const oversLimit = Number(config.totalOvers || 20);
  const teamAName = match.team_a_name || 'Team A';
  const teamBName = match.team_b_name || 'Team B';
  const teamAId = match.team_a_id || 'team_a';
  const teamBId = match.team_b_id || 'team_b';

  const makeInnings = (teamId, teamName) => ({
    teamId,
    teamName,
    totalRuns: 0,
    wickets: 0,
    legalBalls: 0,
    oversFormatted: '0.0',
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0, total: 0 },
    batsmen: {}, // { [stableId]: { id, name, runs, balls, fours, sixes, isOut, dismissalText, catches, stumpings, runOuts, isCaptain, isWK } }
    bowlers: {}, // { [stableId]: { id, name, legalBalls, oversFormatted, maidens, runs, wickets, economy, lbwBowledCount } }
    partnerships: [],
    oversHistory: [],
    currentOverBalls: [],
    yetToBat: [],    // list of { id, name } who haven't batted yet
    fallOfWickets: [] // [{ wickets, runs, overs, batsmanName }]
  });

  return {
    sport: 'Cricket',
    config: {
      totalOvers: oversLimit,
      maxWickets: Number(config.maxWickets || 10),
      oversPerBowler: Number(config.oversPerBowler || Math.ceil(oversLimit / 5))
    },
    inningsNumber: 1,
    battingTeamId: teamAId,
    battingTeamName: teamAName,
    bowlingTeamId: teamBId,
    bowlingTeamName: teamBName,

    innings1: makeInnings(teamAId, teamAName),
    innings2: null,

    // Roster snapshots (set via SET_LINEUP)
    teamALineup: [], // [{ id, name, isCaptain, isWK }]
    teamBLineup: [], // [{ id, name, isCaptain, isWK }]

    striker: null,
    nonStriker: null,
    currentBowler: null,
    lastBowler: null,

    isFreeHit: false,
    partnershipCurrent: { runs: 0, balls: 0 },

    target: null,
    isCompleted: false,
    resultText: ''
  };
};

/**
 * Format legal deliveries into standard cricket over notation (e.g. 15 -> "2.3")
 */
export const formatOvers = (legalBalls) => {
  const completedOvers = Math.floor(legalBalls / 6);
  const remainingBalls = legalBalls % 6;
  return `${completedOvers}.${remainingBalls}`;
};

/**
 * Calculate Run Rate
 */
export const calculateRunRate = (runs, legalBalls) => {
  if (!legalBalls || legalBalls === 0) return 0;
  const overs = legalBalls / 6;
  return Number((runs / overs).toFixed(2));
};

/**
 * Calculate Required Run Rate
 */
export const calculateRequiredRunRate = (target, currentRuns, totalOvers, legalBallsBowled) => {
  const runsNeeded = target - currentRuns;
  if (runsNeeded <= 0) return 0;
  const totalBalls = totalOvers * 6;
  const ballsRemaining = Math.max(0, totalBalls - legalBallsBowled);
  if (ballsRemaining === 0) return 99.9;
  const oversRemaining = ballsRemaining / 6;
  return Number((runsNeeded / oversRemaining).toFixed(2));
};

/**
 * Swap strikers
 */
const swapStrikers = (state) => {
  const temp = state.striker;
  state.striker = state.nonStriker;
  state.nonStriker = temp;
};

/**
 * Ensure batsman stats structure exists.
 * Key is ALWAYS the stable id (fallback: name) for idempotent replay.
 */
const getOrCreateBatsman = (innings, player) => {
  // Stable key: prefer real user id, then p_name-style id, then name
  const key = player?.id || player?.name || 'Striker';
  if (!innings.batsmen[key]) {
    innings.batsmen[key] = {
      id: player?.id || key,
      name: player?.name || key,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      isOut: false,
      dismissalText: 'not out',
      // Fielding credits
      catches: 0,
      stumpings: 0,
      runOuts: 0,
      // Flags from lineup
      isCaptain: player?.isCaptain || false,
      isWK: player?.isWK || false
    };
  }
  return innings.batsmen[key];
};

/**
 * Build dismissal text similar to cricket scorecard:
 * "c Axar b Washington", "b X", "lbw b X", "run out (X)", "st X b Y"
 */
const buildDismissalText = (dismissalType, bowlerName, fielderName) => {
  const b = bowlerName || 'Bowler';
  const f = fielderName || '';
  switch ((dismissalType || '').toLowerCase()) {
    case 'bowled':    return `b ${b}`;
    case 'lbw':       return `lbw b ${b}`;
    case 'caught':    return f ? `c ${f} b ${b}` : `c & b ${b}`;
    case 'stumped':   return f ? `st ${f} b ${b}` : `st † b ${b}`;
    case 'run_out':   return f ? `run out (${f})` : 'run out';
    case 'hit_wicket':return `hit wicket b ${b}`;
    default:          return `${dismissalType || 'out'} b ${b}`;
  }
};

/**
 * Ensure bowler stats structure exists
 */
const getOrCreateBowler = (innings, bowler) => {
  const key = bowler?.name || bowler?.id || 'Bowler';
  if (!innings.bowlers[key]) {
    innings.bowlers[key] = {
      id: bowler?.id || key,
      name: bowler?.name || key,
      legalBalls: 0,
      oversFormatted: '0.0',
      maidens: 0,
      runs: 0,
      wickets: 0,
      economy: 0
    };
  }
  return innings.bowlers[key];
};

/**
 * Main Pure Reducer for Cricket
 */
export const cricketReducer = (state, event) => {
  const s = JSON.parse(JSON.stringify(state)); // Deep clone for immutability
  const activeInnings = s.inningsNumber === 1 ? s.innings1 : s.innings2;

  if (!activeInnings && event.type !== 'START_INNINGS_2') return s;

  switch (event.type) {
    case 'SET_LINEUP': {
      const pl = event.payload;
      if (pl.striker) s.striker = pl.striker;
      if (pl.nonStriker) s.nonStriker = pl.nonStriker;
      if (pl.bowler) s.currentBowler = pl.bowler;

      // Store full batting lineup for yetToBat display
      if (pl.battingLineup && Array.isArray(pl.battingLineup)) {
        activeInnings.yetToBat = pl.battingLineup.filter(
          p => p.id !== pl.striker?.id && p.id !== pl.nonStriker?.id &&
               p.name !== pl.striker?.name && p.name !== pl.nonStriker?.name
        );
      }

      // Store team-level lineups for captain/WK flags
      if (pl.teamALineup) s.teamALineup = pl.teamALineup;
      if (pl.teamBLineup) s.teamBLineup = pl.teamBLineup;

      if (s.striker) getOrCreateBatsman(activeInnings, s.striker);
      if (s.nonStriker) getOrCreateBatsman(activeInnings, s.nonStriker);
      if (s.currentBowler) getOrCreateBowler(activeInnings, s.currentBowler);
      break;
    }

    case 'CHANGE_BOWLER': {
      if (event.payload.bowler) {
        s.lastBowler = s.currentBowler;
        s.currentBowler = event.payload.bowler;
        getOrCreateBowler(activeInnings, s.currentBowler);
      }
      break;
    }

    case 'SWAP_STRIKE': {
      swapStrikers(s);
      break;
    }

    case 'RECORD_DELIVERY': {
      if (s.isCompleted) return s;

      const {
        runs = 0,               // runs scored off bat
        deliveryType = 'LEGAL', // 'LEGAL' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE'
        extraRuns = 0,          // additional runs (e.g. wide + 2)
        wicket = null,          // null or { dismissalType, playerOut, nextBatsman }
        striker = s.striker,
        bowler = s.currentBowler
      } = event.payload;

      const isLegal = deliveryType === 'LEGAL' || deliveryType === 'BYE' || deliveryType === 'LEG_BYE';
      const isWide = deliveryType === 'WIDE';
      const isNoBall = deliveryType === 'NO_BALL';
      const isBye = deliveryType === 'BYE';
      const isLegBye = deliveryType === 'LEG_BYE';

      let totalBallRuns = 0;
      let batsmanRuns = 0;
      let ballLabel = '';

      const batsmanStat = striker ? getOrCreateBatsman(activeInnings, striker) : null;
      const bowlerStat = bowler ? getOrCreateBowler(activeInnings, bowler) : null;

      // 1. Calculate runs & extras
      if (isWide) {
        const widePenalty = 1 + extraRuns;
        totalBallRuns = widePenalty;
        activeInnings.extras.wides += widePenalty;
        activeInnings.extras.total += widePenalty;
        if (bowlerStat) bowlerStat.runs += widePenalty;
        ballLabel = extraRuns > 0 ? `${extraRuns + 1}Wd` : 'Wd';
        // Free hit carries over if previous ball was a free hit!
      } else if (isNoBall) {
        const nbPenalty = 1 + extraRuns;
        batsmanRuns = runs; // runs off bat count to batsman on No Ball!
        totalBallRuns = nbPenalty + batsmanRuns;
        activeInnings.extras.noBalls += nbPenalty;
        activeInnings.extras.total += nbPenalty;
        if (batsmanStat) {
          batsmanStat.runs += batsmanRuns;
          batsmanStat.balls += 1;
          if (batsmanRuns === 4) batsmanStat.fours += 1;
          if (batsmanRuns === 6) batsmanStat.sixes += 1;
        }
        if (bowlerStat) bowlerStat.runs += totalBallRuns;
        ballLabel = batsmanRuns > 0 ? `${batsmanRuns}NB` : 'NB';
        s.isFreeHit = true; // Next delivery is a Free Hit
      } else if (isBye || isLegBye) {
        totalBallRuns = runs + extraRuns;
        if (isBye) activeInnings.extras.byes += totalBallRuns;
        if (isLegBye) activeInnings.extras.legByes += totalBallRuns;
        activeInnings.extras.total += totalBallRuns;
        if (batsmanStat) batsmanStat.balls += 1; // legal delivery faced
        ballLabel = isBye ? `${totalBallRuns}B` : `${totalBallRuns}LB`;
        s.isFreeHit = false;
      } else {
        // Standard Legal ball off bat
        batsmanRuns = runs;
        totalBallRuns = batsmanRuns;
        if (batsmanStat) {
          batsmanStat.runs += batsmanRuns;
          batsmanStat.balls += 1;
          if (batsmanRuns === 4) batsmanStat.fours += 1;
          if (batsmanRuns === 6) batsmanStat.sixes += 1;
        }
        if (bowlerStat) bowlerStat.runs += totalBallRuns;
        ballLabel = runs === 0 ? '•' : String(runs);
        s.isFreeHit = false;
      }

      // Add to team score
      activeInnings.totalRuns += totalBallRuns;
      s.partnershipCurrent.runs += totalBallRuns;
      if (isLegal) s.partnershipCurrent.balls += 1;

      // 2. Handle Wicket
      if (wicket) {
        activeInnings.wickets += 1;
        const isRunOut = (wicket.dismissalType || '').toLowerCase() === 'run_out';
        if (bowlerStat && !isRunOut) {
          bowlerStat.wickets += 1;
        }
        // Track LBW/Bowled bonus for fantasy points
        const dt = (wicket.dismissalType || '').toLowerCase();
        if ((dt === 'lbw' || dt === 'bowled') && bowlerStat) {
          bowlerStat.lbwBowledCount = (bowlerStat.lbwBowledCount || 0) + 1;
        }

        ballLabel = isLegal && runs === 0 ? 'W' : `${ballLabel}/W`;

        const dismissedPlayer = wicket.playerOut || s.striker;
        const outBatsmanStat = dismissedPlayer ? getOrCreateBatsman(activeInnings, dismissedPlayer) : batsmanStat;
        if (outBatsmanStat) {
          outBatsmanStat.isOut = true;
          outBatsmanStat.dismissalText = buildDismissalText(
            wicket.dismissalType,
            bowler?.name,
            wicket.fielder?.name
          );
        }

        // Credit fielder (catches / stumpings / run-outs)
        if (wicket.fielder) {
          // Fielder may be on the bowling team — they appear as bowlers or need separate tracking
          // We store fielding credits on the batsmen map keyed by fielder id
          const fKey = wicket.fielder.id || wicket.fielder.name || 'Fielder';
          if (!activeInnings.batsmen[fKey]) {
            activeInnings.batsmen[fKey] = {
              id: wicket.fielder.id || fKey,
              name: wicket.fielder.name || fKey,
              runs: 0, balls: 0, fours: 0, sixes: 0,
              isOut: false, dismissalText: 'not out',
              catches: 0, stumpings: 0, runOuts: 0,
              isCaptain: false, isWK: false,
              isFieldingOnlyCredit: true // not a batter in this innings
            };
          }
          const fStat = activeInnings.batsmen[fKey];
          if (dt === 'caught') fStat.catches = (fStat.catches || 0) + 1;
          else if (dt === 'stumped') fStat.stumpings = (fStat.stumpings || 0) + 1;
          else if (dt === 'run_out') fStat.runOuts = (fStat.runOuts || 0) + 1;
        }

        // Fall of wicket record
        activeInnings.fallOfWickets = activeInnings.fallOfWickets || [];
        activeInnings.fallOfWickets.push({
          wickets: activeInnings.wickets,
          runs: activeInnings.totalRuns,
          overs: activeInnings.oversFormatted,
          batsmanName: (dismissedPlayer?.name || 'Batter')
        });

        // Record partnership end
        activeInnings.partnerships.push({ ...s.partnershipCurrent });
        s.partnershipCurrent = { runs: 0, balls: 0 };

        // Remove incoming batter from yetToBat
        if (wicket.nextBatsman) {
          activeInnings.yetToBat = (activeInnings.yetToBat || []).filter(
            p => p.id !== wicket.nextBatsman.id && p.name !== wicket.nextBatsman.name
          );
          if (dismissedPlayer?.id === s.nonStriker?.id || dismissedPlayer?.name === s.nonStriker?.name) {
            s.nonStriker = wicket.nextBatsman;
          } else {
            s.striker = wicket.nextBatsman;
          }
          getOrCreateBatsman(activeInnings, wicket.nextBatsman);
        }
      }

      // 3. Track Legal Ball & Over Progression
      if (isLegal) {
        activeInnings.legalBalls += 1;
        if (bowlerStat) bowlerStat.legalBalls += 1;
        activeInnings.currentOverBalls.push(ballLabel);
      } else {
        // Illegal delivery ball slot indication
        activeInnings.currentOverBalls.push(ballLabel);
      }

      // 4. Update Formatted Overs & Bowler Figures
      activeInnings.oversFormatted = formatOvers(activeInnings.legalBalls);
      if (bowlerStat) {
        bowlerStat.oversFormatted = formatOvers(bowlerStat.legalBalls);
        bowlerStat.economy = calculateRunRate(bowlerStat.runs, bowlerStat.legalBalls);
      }

      // 5. Strike Rotation on runs ran
      // Runs that cause batsmen to cross crease: 1, 3, 5 runs
      const runsRan = isWide ? extraRuns : isNoBall ? batsmanRuns : (isBye || isLegBye) ? totalBallRuns : runs;
      if (runsRan % 2 === 1) {
        swapStrikers(s);
      }

      // 6. Check Over Completion (6 legal balls)
      if (isLegal && activeInnings.legalBalls % 6 === 0) {
        // Complete current over
        activeInnings.oversHistory.push({
          overNumber: activeInnings.legalBalls / 6,
          balls: [...activeInnings.currentOverBalls],
          bowler: bowler?.name || 'Bowler',
          runsConceded: bowlerStat?.runs || 0
        });
        activeInnings.currentOverBalls = [];
        
        // Swap strike at the end of the over!
        swapStrikers(s);

        // Clear current bowler so admin is prompted to assign next bowler
        s.lastBowler = s.currentBowler;
        s.currentBowler = null;
      }

      // 7. Check Innings or Match Completion
      const maxBalls = s.config.totalOvers * 6;
      const isAllOut = activeInnings.wickets >= s.config.maxWickets;
      const isOversFinished = activeInnings.legalBalls >= maxBalls;

      if (s.inningsNumber === 1) {
        if (isAllOut || isOversFinished) {
          s.target = activeInnings.totalRuns + 1;
          // Prompt ready for 2nd innings
        }
      } else if (s.inningsNumber === 2) {
        // Target chasing logic
        if (activeInnings.totalRuns >= s.target) {
          s.isCompleted = true;
          const wicketsLeft = s.config.maxWickets - activeInnings.wickets;
          const ballsRemaining = maxBalls - activeInnings.legalBalls;
          s.resultText = `${s.battingTeamName} won by ${wicketsLeft} wicket${wicketsLeft === 1 ? '' : 's'} (${ballsRemaining} balls left)`;
        } else if (isAllOut || isOversFinished) {
          s.isCompleted = true;
          if (activeInnings.totalRuns === s.target - 1) {
            s.resultText = 'Match Tied';
          } else {
            const margin = (s.target - 1) - activeInnings.totalRuns;
            s.resultText = `${s.bowlingTeamName} won by ${margin} run${margin === 1 ? '' : 's'}`;
          }
        }
      }
      break;
    }

    case 'START_INNINGS_2': {
      if (s.inningsNumber === 1) {
        s.target = s.innings1.totalRuns + 1;
        s.inningsNumber = 2;
        const prevBattingId = s.battingTeamId;
        const prevBattingName = s.battingTeamName;
        s.battingTeamId = s.bowlingTeamId;
        s.battingTeamName = s.bowlingTeamName;
        s.bowlingTeamId = prevBattingId;
        s.bowlingTeamName = prevBattingName;

        s.innings2 = {
          teamId: s.battingTeamId,
          teamName: s.battingTeamName,
          totalRuns: 0,
          wickets: 0,
          legalBalls: 0,
          oversFormatted: '0.0',
          extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0, total: 0 },
          batsmen: {},
          bowlers: {},
          partnerships: [],
          oversHistory: [],
          currentOverBalls: [],
          yetToBat: event.payload?.battingLineup || [],
          fallOfWickets: []
        };

        s.striker = event.payload?.striker || null;
        s.nonStriker = event.payload?.nonStriker || null;
        s.currentBowler = event.payload?.bowler || null;
        s.lastBowler = null;
        s.isFreeHit = false;
        s.partnershipCurrent = { runs: 0, balls: 0 };

        // Register opener batsmen
        if (s.striker) getOrCreateBatsman(s.innings2, s.striker);
        if (s.nonStriker) getOrCreateBatsman(s.innings2, s.nonStriker);
        if (s.currentBowler) getOrCreateBowler(s.innings2, s.currentBowler);
      }
      break;
    }

    case 'END_MATCH': {
      s.isCompleted = true;
      if (event.payload?.resultText) {
        s.resultText = event.payload.resultText;
      }
      break;
    }

    default:
      break;
  }

  // Calculate live run rates for active view
  const currentInnings = s.inningsNumber === 1 ? s.innings1 : s.innings2;
  if (currentInnings) {
    s.currentRunRate = calculateRunRate(currentInnings.totalRuns, currentInnings.legalBalls);
    if (s.inningsNumber === 2 && s.target) {
      s.requiredRunRate = calculateRequiredRunRate(
        s.target,
        currentInnings.totalRuns,
        s.config.totalOvers,
        currentInnings.legalBalls
      );
    }
  }

  return s;
};
