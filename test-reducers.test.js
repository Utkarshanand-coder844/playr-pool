import { describe, it } from 'node:test';
import assert from 'node:assert';

import { initialCricketState, cricketReducer } from './server/scoring/plugins/cricket.js';
import { initialFootballState, footballReducer } from './server/scoring/plugins/football.js';
import { initialBasketballState, basketballReducer } from './server/scoring/plugins/basketball.js';
import { initialRacketState, racketReducer } from './server/scoring/plugins/racket.js';
import { initialKabaddiState, kabaddiReducer } from './server/scoring/plugins/kabaddi.js';
import { initialGenericState, genericReducer } from './server/scoring/plugins/generic.js';

const mockMatch = {
  id: '00000000-0000-0000-0000-000000000001',
  team_a_name: 'Warriors',
  team_b_name: 'Titans',
  team_a_id: '11111111-1111-1111-1111-111111111111',
  team_b_id: '22222222-2222-2222-2222-222222222222'
};

describe('Cricket Scoring Reducer', () => {
  it('correctly manages lineups, strike rotation, wides, no-balls, and wickets', () => {
    let state = initialCricketState(mockMatch, { totalOvers: 2, maxWickets: 2 });

    // Set Lineup
    state = cricketReducer(state, {
      type: 'SET_LINEUP',
      payload: {
        striker: { name: 'Rohit', id: 'p1' },
        nonStriker: { name: 'Virat', id: 'p2' },
        bowler: { name: 'Bumrah', id: 'b1' }
      }
    });
    assert.strictEqual(state.striker.name, 'Rohit');
    assert.strictEqual(state.nonStriker.name, 'Virat');

    // 1 Run -> Strike Rotates
    state = cricketReducer(state, {
      type: 'RECORD_DELIVERY',
      payload: { runs: 1, deliveryType: 'LEGAL' }
    });
    assert.strictEqual(state.innings1.totalRuns, 1);
    assert.strictEqual(state.innings1.legalBalls, 1);
    assert.strictEqual(state.striker.name, 'Virat');
    assert.strictEqual(state.nonStriker.name, 'Rohit');

    // Wide -> +1 extra, ball count not incremented
    state = cricketReducer(state, {
      type: 'RECORD_DELIVERY',
      payload: { runs: 0, deliveryType: 'WIDE', extraRuns: 0 }
    });
    assert.strictEqual(state.innings1.totalRuns, 2);
    assert.strictEqual(state.innings1.legalBalls, 1);
    assert.strictEqual(state.innings1.extras.wides, 1);

    // No Ball -> +1 extra + runs off bat, Free Hit active
    state = cricketReducer(state, {
      type: 'RECORD_DELIVERY',
      payload: { runs: 4, deliveryType: 'NO_BALL', extraRuns: 0 }
    });
    assert.strictEqual(state.innings1.totalRuns, 7);
    assert.strictEqual(state.isFreeHit, true);
    assert.strictEqual(state.innings1.legalBalls, 1);

    // Delivery after No Ball clears Free Hit
    state = cricketReducer(state, {
      type: 'RECORD_DELIVERY',
      payload: { runs: 0, deliveryType: 'LEGAL' }
    });
    assert.strictEqual(state.isFreeHit, false);
    assert.strictEqual(state.innings1.legalBalls, 2);

    // Wicket via delivery
    state = cricketReducer(state, {
      type: 'RECORD_DELIVERY',
      payload: {
        runs: 0,
        deliveryType: 'LEGAL',
        wicket: { dismissalType: 'Bowled', playerOut: { name: 'Virat' } }
      }
    });
    assert.strictEqual(state.innings1.wickets, 1);
  });
});

describe('Football Scoring Reducer', () => {
  it('correctly updates goals, cards, and half times', () => {
    let state = initialFootballState(mockMatch);

    // Team A Goal
    state = footballReducer(state, {
      type: 'GOAL',
      payload: { teamId: mockMatch.team_a_id, scorer: 'Striker 1' }
    });
    assert.strictEqual(state.teamA.score, 1);
    assert.strictEqual(state.teamB.score, 0);

    // Yellow card
    state = footballReducer(state, {
      type: 'CARD',
      payload: { teamId: mockMatch.team_b_id, cardType: 'YELLOW', player: 'Defender 2' }
    });
    assert.strictEqual(state.teamB.yellowCards, 1);

    // Period change
    state = footballReducer(state, {
      type: 'SET_PERIOD',
      payload: { period: '2nd Half' }
    });
    assert.strictEqual(state.period, '2nd Half');
  });
});

describe('Basketball Scoring Reducer', () => {
  it('handles 1-pt, 2-pt, and 3-pt field goals and fouls', () => {
    let state = initialBasketballState(mockMatch);

    // 3-pointer Team A
    state = basketballReducer(state, {
      type: 'SCORE_POINTS',
      payload: { teamId: mockMatch.team_a_id, points: 3, player: 'Shooter' }
    });
    assert.strictEqual(state.teamA.score, 3);

    // 2-pointer Team B
    state = basketballReducer(state, {
      type: 'SCORE_POINTS',
      payload: { teamId: mockMatch.team_b_id, points: 2 }
    });
    assert.strictEqual(state.teamB.score, 2);

    // Free throw (1 pt)
    state = basketballReducer(state, {
      type: 'SCORE_POINTS',
      payload: { teamId: mockMatch.team_a_id, points: 1 }
    });
    assert.strictEqual(state.teamA.score, 4);

    // Advance quarter
    state = basketballReducer(state, {
      type: 'SET_QUARTER',
      payload: { quarter: 'Q2' }
    });
    assert.strictEqual(state.quarter, 'Q2');
  });
});

describe('Racket Sports Reducer (Badminton / Table Tennis)', () => {
  it('tracks points, deuce (win by 2), and set transitions', () => {
    let state = initialRacketState(mockMatch, { pointsPerSet: 21, bestOfSets: 3 });

    // Score point
    state = racketReducer(state, {
      type: 'POINT',
      payload: { teamId: mockMatch.team_a_id, playerName: 'Ace' }
    });
    assert.strictEqual(state.teamA.currentPoints, 1);
    assert.strictEqual(state.teamB.currentPoints, 0);

    // Fast-forward to 20-20 (Deuce)
    state.teamA.currentPoints = 20;
    state.teamB.currentPoints = 20;

    // Point Team A -> 21-20 (must win by 2)
    state = racketReducer(state, {
      type: 'POINT',
      payload: { teamId: mockMatch.team_a_id }
    });
    assert.strictEqual(state.teamA.currentPoints, 21);
    assert.strictEqual(state.teamA.setsWon, 0);

    // Point Team A -> 22-20 -> Set Won by Team A
    state = racketReducer(state, {
      type: 'POINT',
      payload: { teamId: mockMatch.team_a_id }
    });
    assert.strictEqual(state.teamA.setsWon, 1);
    assert.strictEqual(state.currentSetNumber, 2);
  });
});

describe('Kabaddi Scoring Reducer', () => {
  it('records raid points, tackle points, and all-out bonus (+2)', () => {
    let state = initialKabaddiState(mockMatch);

    // Successful Raid (2 pts)
    state = kabaddiReducer(state, {
      type: 'SCORE_ACTION',
      payload: { teamId: mockMatch.team_a_id, actionType: 'RAID', points: 2, raider: 'Pardeep' }
    });
    assert.strictEqual(state.teamA.score, 2);

    // Super Tackle (2 pts)
    state = kabaddiReducer(state, {
      type: 'SCORE_ACTION',
      payload: { teamId: mockMatch.team_b_id, actionType: 'TACKLE', points: 2 }
    });
    assert.strictEqual(state.teamB.score, 2);

    // All-Out bonus (+2)
    state = kabaddiReducer(state, {
      type: 'SCORE_ACTION',
      payload: { teamId: mockMatch.team_a_id, actionType: 'ALL_OUT', points: 2 }
    });
    assert.strictEqual(state.teamA.score, 4);
  });
});

describe('Generic Sports Reducer', () => {
  it('updates generic scores and periods', () => {
    let state = initialGenericState(mockMatch);

    state = genericReducer(state, {
      type: 'ADD_POINTS',
      payload: { teamId: mockMatch.team_a_id, delta: 5 }
    });
    assert.strictEqual(state.teamA.score, 5);

    state = genericReducer(state, {
      type: 'ADD_POINTS',
      payload: { teamId: mockMatch.team_b_id, delta: 3 }
    });
    assert.strictEqual(state.teamB.score, 3);
  });
});
