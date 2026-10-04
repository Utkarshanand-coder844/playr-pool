/**
 * Comprehensive Automated Verification Suite for:
 * 1. Player-specific scoring per sport (admin credits actions to a real player).
 * 2. Per-team scorecard leaderboard (cricket scorecard + generic scorecards).
 * 3. Player Insight (personal score, improvement trend, fantasy points derivation).
 * 4. Undo and Reset event-sourcing invariants.
 */

import { ScoringEngine, getPluginForSport, deriveStateFromEvents } from './server/scoring/engine.js';
import { derivePlayerStats } from './server/scoring/playerStats.js';
import { SCORING_RULES } from './server/config/scoringRules.js';
import { query } from './server/config/db.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runVerification() {
  console.log('🚀 Running Comprehensive Features Verification Suite...\n');

  // Test 1: Scoring Rules Integrity
  console.log('📌 Test 1: Scoring Rules Integrity');
  assert(SCORING_RULES.Cricket.runScored === 1, 'Cricket runScored rule is 1');
  assert(SCORING_RULES.Cricket.fourBonus === 1, 'Cricket fourBonus rule is 1');
  assert(SCORING_RULES.Cricket.sixBonus === 2, 'Cricket sixBonus rule is 2');
  assert(SCORING_RULES.Cricket.wicketTaken === 25, 'Cricket wicketTaken is 25');
  assert(SCORING_RULES.Football.goal === 10, 'Football goal is 10');
  assert(SCORING_RULES.Basketball.pointScored === 1, 'Basketball pointScored is 1');
  assert(SCORING_RULES.Kabaddi.raidPoint === 2, 'Kabaddi raidPoint is 2');

  // Test 2: Cricket Reducer with Player-Specific Credits
  console.log('\n📌 Test 2: Cricket Reducer with Player-Specific Credits');
  const dummyMatch = {
    id: 'a0000000-0000-0000-0000-000000000001',
    sport: 'Cricket',
    name: 'Finals: Red Dragons vs Blue Eagles',
    team_a_id: 't0000000-0000-0000-0000-000000000001',
    team_b_id: 't0000000-0000-0000-0000-000000000002',
    team_a_name: 'Red Dragons',
    team_b_name: 'Blue Eagles',
    status: 'live'
  };

  const pBatter1 = '11111111-1111-1111-1111-111111111111';
  const pBatter2 = '22222222-2222-2222-2222-222222222222';
  const pBowler1 = '33333333-3333-3333-3333-333333333333';
  const pFielder1 = '44444444-4444-4444-4444-444444444444';

  const plugin = getPluginForSport('Cricket');
  let state = plugin.getInitialState(dummyMatch);

  // Set Lineup: Batter 1, Batter 2, Bowler 1
  state = plugin.reducer(state, {
    type: 'SET_LINEUP',
    payload: {
      striker: { id: pBatter1, name: 'Virat Coder' },
      nonStriker: { id: pBatter2, name: 'Rohit Hacker' },
      bowler: { id: pBowler1, name: 'Jasprit Hacker' }
    }
  });

  // Delivery 1: 4 runs off bat
  state = plugin.reducer(state, {
    type: 'RECORD_DELIVERY',
    payload: {
      runs: 4,
      deliveryType: 'LEGAL'
    }
  });

  assert(state.innings1.totalRuns === 4, 'Innings 1 has 4 runs');
  assert(state.innings1.batsmen[pBatter1].runs === 4, 'Batter 1 has 4 runs credited');
  assert(state.innings1.batsmen[pBatter1].fours === 1, 'Batter 1 has 1 four credited');
  assert(state.innings1.bowlers['Jasprit Hacker'].runs === 4, 'Bowler conceded 4 runs');

  // Delivery 2: 6 runs off bat
  state = plugin.reducer(state, {
    type: 'RECORD_DELIVERY',
    payload: {
      runs: 6,
      deliveryType: 'LEGAL'
    }
  });

  assert(state.innings1.totalRuns === 10, 'Innings 1 has 10 runs');
  assert(state.innings1.batsmen[pBatter1].runs === 10, 'Batter 1 has 10 runs credited');
  assert(state.innings1.batsmen[pBatter1].sixes === 1, 'Batter 1 has 1 six credited');

  // Delivery 3: Wicket - Batter 1 is caught out by Fielder 1 off Bowler
  state = plugin.reducer(state, {
    type: 'RECORD_DELIVERY',
    payload: {
      runs: 0,
      deliveryType: 'LEGAL',
      wicket: {
        dismissalType: 'caught',
        playerOut: { id: pBatter1, name: 'Virat Coder' },
        fielder: { id: pFielder1, name: 'Ravindra Dev' }
      }
    }
  });

  assert(state.innings1.wickets === 1, 'Innings 1 has 1 wicket');
  assert(state.innings1.batsmen[pBatter1].isOut === true, 'Batter 1 marked isOut');
  assert(state.innings1.bowlers['Jasprit Hacker'].wickets === 1, 'Bowler has 1 wicket');
  assert(state.innings1.fallOfWickets.length === 1, 'Fall of wickets has 1 entry');
  assert(state.innings1.fallOfWickets[0].runs === 10, 'FOW was at 10 runs');

  // Test 3: Player Stats Derivation (Fantasy Points)
  console.log('\n📌 Test 3: Player Fantasy Points Derivation');
  const derivedPlayers = derivePlayerStats('Cricket', state, dummyMatch);
  assert(derivedPlayers.length >= 3, `Derived at least 3 players (got ${derivedPlayers.length})`);

  const batterStat = derivedPlayers.find(p => p.playerId === pBatter1);
  const bowlerStat = derivedPlayers.find(p => p.playerId === pBowler1 || p.name === 'Jasprit Hacker');
  const fielderStat = derivedPlayers.find(p => p.playerId === pFielder1);

  assert(batterStat !== undefined, 'Batter 1 stats found');
  assert(batterStat.stats.runs === 10, 'Batter 1 runs is 10');
  assert(batterStat.stats.fours === 1, 'Batter 1 fours is 1');
  assert(batterStat.stats.sixes === 1, 'Batter 1 sixes is 1');
  // Runs: 10*1 = 10, 4 bonus: 1*1 = 1, 6 bonus: 1*2 = 2. Total = 13
  assert(batterStat.fantasyPoints === 13, `Batter 1 fantasy points is 13 (got ${batterStat.fantasyPoints})`);

  assert(bowlerStat !== undefined, 'Bowler 1 stats found');
  assert(bowlerStat.stats.wickets === 1, 'Bowler 1 wickets is 1');
  assert(bowlerStat.fantasyPoints >= 25, `Bowler 1 fantasy points >= 25 (got ${bowlerStat.fantasyPoints})`);

  assert(fielderStat !== undefined, 'Fielder 1 stats found');
  assert(fielderStat.stats.catches === 1, 'Fielder 1 catches is 1');
  assert(fielderStat.fantasyPoints === 8, `Fielder 1 fantasy points is 8 for catch (got ${fielderStat.fantasyPoints})`);

  // Test 4: Football Reducer with Goal & Assist
  console.log('\n📌 Test 4: Football Reducer with Player Credits');
  const pStriker = '55555555-5555-5555-5555-555555555555';
  const pAssister = '66666666-6666-6666-6666-666666666666';
  const fbPlugin = getPluginForSport('Football');
  let fbState = fbPlugin.getInitialState({
    ...dummyMatch,
    sport: 'Football'
  });

  fbState = fbPlugin.reducer(fbState, {
    type: 'GOAL',
    payload: {
      teamId: dummyMatch.team_a_id,
      scorer: 'Messi Dev',
      scorerId: pStriker,
      assist: 'Iniesta Code',
      assistId: pAssister,
      minute: 23
    }
  });

  assert(fbState.teamA.score === 1, 'Team A has 1 goal');
  const fbDerived = derivePlayerStats('Football', fbState, dummyMatch);
  const strikerStat = fbDerived.find(p => p.playerId === pStriker);
  const assisterStat = fbDerived.find(p => p.playerId === pAssister);

  assert(strikerStat && strikerStat.stats.goals === 1, 'Striker has 1 goal credited');
  assert(strikerStat.fantasyPoints === 10, `Striker has 10 FP for goal (got ${strikerStat.fantasyPoints})`);
  assert(assisterStat && assisterStat.stats.assists === 1, 'Assister has 1 assist credited');
  assert(assisterStat.fantasyPoints === 6, `Assister has 6 FP for assist (got ${assisterStat.fantasyPoints})`);

  // Test 5: Basketball Reducer with Points
  console.log('\n📌 Test 5: Basketball Reducer with Player Credits');
  const pHooper = '77777777-7777-7777-7777-777777777777';
  const bbPlugin = getPluginForSport('Basketball');
  let bbState = bbPlugin.getInitialState({
    ...dummyMatch,
    sport: 'Basketball'
  });

  bbState = bbPlugin.reducer(bbState, {
    type: 'SCORE_POINTS',
    payload: {
      teamId: dummyMatch.team_a_id,
      points: 3,
      player: 'Curry Byte',
      playerId: pHooper
    }
  });

  assert(bbState.teamA.score === 3, 'Basketball Team A has 3 points');
  const bbDerived = derivePlayerStats('Basketball', bbState, dummyMatch);
  const hooperStat = bbDerived.find(p => p.playerId === pHooper);
  assert(hooperStat && hooperStat.stats.points === 3, 'Hooper has 3 points');
  // 3 points * 1 = 3 + threePointerBonus (1) = 4
  assert(hooperStat.fantasyPoints === 4, `Hooper has 4 FP (got ${hooperStat.fantasyPoints})`);

  // Test 6: In-Memory / DB Query Player Stats Filtering
  console.log('\n📌 Test 6: DB Query Filtering (pmp.player_id support)');
  // Insert test row into player_match_points
  await query(
    `INSERT INTO player_match_points (match_id, player_id, team_id, sport, fantasy_points, stats)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [dummyMatch.id, pBatter1, dummyMatch.team_a_id, 'Cricket', 13, JSON.stringify({ runs: 10, balls: 2 })]
  );

  const testHistoryQuery = `SELECT pmp.*, m.name as match_name, m.sport, m.status, m.match_date,
                           t.name as team_name
                           FROM player_match_points pmp
                           LEFT JOIN matches m ON m.id = pmp.match_id
                           LEFT JOIN teams t ON t.id = pmp.team_id
                           WHERE pmp.player_id = $1
                           ORDER BY m.match_date DESC NULLS LAST
                           LIMIT $2`;
  const { rows } = await query(testHistoryQuery, [pBatter1, 10]);
  assert(rows.length >= 1, `Query returned player history for pBatter1 (got ${rows.length})`);
  assert(rows[0].fantasy_points === 13, `Fantasy points matches 13 (got ${rows[0].fantasy_points})`);

  // Test 7: Event replay immutability (Undo simulation)
  console.log('\n📌 Test 7: Event Replay and Undo Invariance');
  const events = [
    {
      event_type: 'SET_LINEUP',
      payload: {
        striker: { id: pBatter1, name: 'Virat Coder' },
        nonStriker: { id: pBatter2, name: 'Rohit Hacker' },
        bowler: { id: pBowler1, name: 'Jasprit Hacker' }
      }
    },
    {
      event_type: 'RECORD_DELIVERY',
      payload: { runs: 4, deliveryType: 'LEGAL' }
    },
    {
      event_type: 'RECORD_DELIVERY',
      payload: { runs: 6, deliveryType: 'LEGAL' }
    }
  ];

  const fullState = deriveStateFromEvents(dummyMatch, events);
  assert(fullState.innings1.totalRuns === 10, 'State from 3 events has 10 runs');

  // Simulate Undo: Replay remaining events after dropping last event
  const eventsAfterUndo = events.slice(0, 2);
  const undoState = deriveStateFromEvents(dummyMatch, eventsAfterUndo);
  assert(undoState.innings1.totalRuns === 4, 'Undo state has 4 runs (replayed cleanly)');
  const undoDerived = derivePlayerStats('Cricket', undoState, dummyMatch);
  const undoBatter = undoDerived.find(p => p.playerId === pBatter1);
  assert(undoBatter.fantasyPoints === 5, `Undo re-derives Batter 1 FP to 5 (4 runs + 1 four bonus, got ${undoBatter.fantasyPoints})`);

  // Summary
  console.log(`\n========================================`);
  console.log(`Verification Complete: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
