import assert from 'assert';
import { initialCricketState, cricketReducer } from './plugins/cricket.js';

console.log('🏏 Running Cricket Rules Unit Tests...');

const match = {
  id: 'm1',
  team_a_name: 'Warriors',
  team_b_name: 'Titans',
  team_a_id: 'team_warriors',
  team_b_id: 'team_titans'
};

let state = initialCricketState(match, { totalOvers: 2, maxWickets: 2 });

// 1. Initial State Setup
state = cricketReducer(state, {
  type: 'SET_LINEUP',
  payload: {
    striker: { name: 'Rohit', id: 'p1' },
    nonStriker: { name: 'Virat', id: 'p2' },
    bowler: { name: 'Bumrah', id: 'b1' }
  }
});

assert.strictEqual(state.striker.name, 'Rohit', 'Initial striker should be Rohit');
assert.strictEqual(state.nonStriker.name, 'Virat', 'Initial non-striker should be Virat');
assert.strictEqual(state.currentBowler.name, 'Bumrah', 'Initial bowler should be Bumrah');

// 2. Ball 1: 1 run (Strike should swap)
state = cricketReducer(state, {
  type: 'RECORD_DELIVERY',
  payload: { runs: 1, deliveryType: 'LEGAL' }
});

assert.strictEqual(state.innings1.totalRuns, 1, 'Runs should be 1');
assert.strictEqual(state.innings1.legalBalls, 1, 'Legal balls should be 1');
assert.strictEqual(state.innings1.oversFormatted, '0.1', 'Overs should be 0.1');
assert.strictEqual(state.striker.name, 'Virat', 'Strike should have rotated to Virat on 1 run');
assert.strictEqual(state.nonStriker.name, 'Rohit', 'Non-striker should now be Rohit');
assert.strictEqual(state.innings1.batsmen['Rohit'].runs, 1, 'Rohit has 1 run');
assert.strictEqual(state.innings1.batsmen['Rohit'].balls, 1, 'Rohit faced 1 ball');

// 3. Ball 2: Wide (+1 extra run, ball count NOT incremented)
state = cricketReducer(state, {
  type: 'RECORD_DELIVERY',
  payload: { runs: 0, deliveryType: 'WIDE', extraRuns: 0 }
});

assert.strictEqual(state.innings1.totalRuns, 2, 'Runs should be 2 after Wide');
assert.strictEqual(state.innings1.legalBalls, 1, 'Legal balls MUST still be 1 after Wide');
assert.strictEqual(state.innings1.oversFormatted, '0.1', 'Overs should still be 0.1');
assert.strictEqual(state.striker.name, 'Virat', 'Striker remains Virat after Wide');
assert.strictEqual(state.innings1.extras.wides, 1, 'Extras should record 1 wide');

// 4. Ball 3: No Ball + 4 runs off bat (5 total runs, Free Hit active)
state = cricketReducer(state, {
  type: 'RECORD_DELIVERY',
  payload: { runs: 4, deliveryType: 'NO_BALL', extraRuns: 0 }
});

assert.strictEqual(state.innings1.totalRuns, 7, 'Runs should be 7 (2 + 1 NB + 4 bat)');
assert.strictEqual(state.innings1.legalBalls, 1, 'Legal balls MUST still be 1 after No Ball');
assert.strictEqual(state.isFreeHit, true, 'Next delivery MUST be a Free Hit');
assert.strictEqual(state.innings1.batsmen['Virat'].runs, 4, 'Virat credited with 4 runs on No Ball');
assert.strictEqual(state.innings1.batsmen['Virat'].fours, 1, 'Virat credited with 1 four');

// 5. Ball 4: Free Hit delivery (4 runs off bat, free hit clears)
state = cricketReducer(state, {
  type: 'RECORD_DELIVERY',
  payload: { runs: 4, deliveryType: 'LEGAL' }
});

assert.strictEqual(state.innings1.totalRuns, 11, 'Runs should be 11');
assert.strictEqual(state.innings1.legalBalls, 2, 'Legal balls should be 2');
assert.strictEqual(state.isFreeHit, false, 'Free hit cleared after delivery');

// 6. Complete the over: bowl 4 more legal dots (balls 3, 4, 5, 6)
for (let i = 0; i < 4; i++) {
  state = cricketReducer(state, {
    type: 'RECORD_DELIVERY',
    payload: { runs: 0, deliveryType: 'LEGAL' }
  });
}

assert.strictEqual(state.innings1.legalBalls, 6, 'Over completes at 6 legal balls');
assert.strictEqual(state.innings1.oversFormatted, '1.0', 'Overs formatted as 1.0');
assert.strictEqual(state.innings1.oversHistory.length, 1, 'Overs history recorded 1 completed over');
assert.strictEqual(state.currentBowler, null, 'Bowler should be null at end of over to prompt change');
assert.strictEqual(state.striker.name, 'Rohit', 'Strike swapped at the end of the over');

console.log('✅ All Cricket rules unit tests PASSED successfully!');
