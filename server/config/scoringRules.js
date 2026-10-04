/**
 * Fantasy Points Scoring Rules
 * Admins can tweak these values without touching plugin code.
 * All values are in fantasy points (FP).
 */

export const SCORING_RULES = {
  Cricket: {
    // Batting
    runScored: 1,          // per run
    fourBonus: 1,          // extra FP for a four
    sixBonus: 2,           // extra FP for a six
    runs30Bonus: 4,        // 30+ run milestone bonus
    runs50Bonus: 8,        // 50 milestone bonus (cumulative)
    runs100Bonus: 16,      // century milestone bonus (cumulative)
    duckPenalty: -2,       // out for 0 (batter)

    // Bowling
    wicketTaken: 25,       // per wicket (not run-out)
    lbwBowledBonus: 8,     // extra FP for LBW or bowled
    maidenBonus: 8,        // per maiden over
    threeWicketBonus: 4,   // haul bonus
    fiveWicketBonus: 8,    // additional bonus
    economyBonusGt5: 4,    // economy <= 5 (min 2 overs)
    economyPenaltyGt10: -4,// economy >= 10 (min 2 overs)

    // Fielding
    catchBonus: 8,
    stumpingBonus: 12,
    runOutBonus: 10,

    // Match win bonus (applied to all players on winning team)
    teamWinBonus: 5
  },

  Football: {
    goal: 10,
    assist: 6,
    yellowCard: -2,
    redCard: -5,
    ownGoal: -3,
    teamWinBonus: 5
  },

  Basketball: {
    pointScored: 1,        // per point
    threePointerBonus: 1,  // extra for 3-pointer
    foulPenalty: -1,
    teamWinBonus: 5
  },

  Kabaddi: {
    raidPoint: 2,
    tacklePoint: 3,
    bonusPoint: 1,
    superRaidExtra: 3,     // extra FP on top of raidPoint for SUPER_RAID
    superTackleExtra: 3,   // extra FP on top of tacklePoint for SUPER_TACKLE
    teamWinBonus: 5
  },

  Racket: {
    pointWon: 1,
    setWon: 5,
    matchWon: 10,
    teamWinBonus: 5
  },

  Generic: {
    pointScored: 1,
    teamWinBonus: 5
  }
};

export default SCORING_RULES;
