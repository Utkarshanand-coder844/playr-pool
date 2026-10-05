import { MatchModel } from '../server/models/matchModel.js';
import { deleteMatch } from '../server/controllers/adminController.js';
import { AuditLogModel } from '../server/models/auditLogModel.js';

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

async function runTests() {
  console.log('🚀 Running Match Deletion Test Suite (upcoming, live, completed)...\n');

  try {
    // Setup dummy teams
    const teamA = { id: '11111111-2222-3333-4444-555555555551', name: 'Team Alpha', sport: 'Football' };
    const teamB = { id: '11111111-2222-3333-4444-555555555552', name: 'Team Beta', sport: 'Football' };

    // Test 1: Create and delete UPCOMING match
    console.log('📌 Test 1: Admin deletes UPCOMING match');
    const upcomingMatch = await MatchModel.createMatch({
      name: 'Upcoming Match 1',
      sport: 'Football',
      team_a_id: teamA.id,
      team_b_id: teamB.id,
      status: 'upcoming'
    });
    assert(upcomingMatch && upcomingMatch.status === 'upcoming', 'Upcoming match created');

    const deletedUpcoming = await MatchModel.deleteMatch(upcomingMatch.id);
    assert(deletedUpcoming && deletedUpcoming.id === upcomingMatch.id, 'Upcoming match deleted successfully');
    const checkUpcoming = await MatchModel.getMatchById(upcomingMatch.id);
    assert(checkUpcoming === null, 'Upcoming match no longer exists in database');

    // Test 2: Create and delete LIVE match
    console.log('\n📌 Test 2: Admin deletes LIVE match');
    const liveMatch = await MatchModel.createMatch({
      name: 'Live Match 2',
      sport: 'Football',
      team_a_id: teamA.id,
      team_b_id: teamB.id,
      status: 'live'
    });
    assert(liveMatch && liveMatch.status === 'live', 'Live match created');

    const deletedLive = await MatchModel.deleteMatch(liveMatch.id);
    assert(deletedLive && deletedLive.id === liveMatch.id, 'Live match deleted successfully');
    const checkLive = await MatchModel.getMatchById(liveMatch.id);
    assert(checkLive === null, 'Live match no longer exists in database');

    // Test 3: Create, score, and delete COMPLETED match
    console.log('\n📌 Test 3: Admin deletes COMPLETED match with recorded scores');
    const completedMatch = await MatchModel.createMatch({
      name: 'Completed Match 3',
      sport: 'Football',
      team_a_id: teamA.id,
      team_b_id: teamB.id,
      status: 'completed'
    });
    assert(completedMatch && completedMatch.status === 'completed', 'Completed match created');

    // Add score
    const adminUser = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    await MatchModel.upsertScore({
      match_id: completedMatch.id,
      team_id: teamA.id,
      points: 3,
      updated_by: adminUser
    });
    await MatchModel.upsertScore({
      match_id: completedMatch.id,
      team_id: teamB.id,
      points: 1,
      updated_by: adminUser
    });

    const scoresBefore = (await MatchModel.getAllScores()).filter(s => s.match_id === completedMatch.id);
    assert(scoresBefore.length === 2, '2 scores recorded before deletion');

    const deletedCompleted = await MatchModel.deleteMatch(completedMatch.id);
    assert(deletedCompleted && deletedCompleted.id === completedMatch.id, 'Completed match deleted successfully');

    const checkCompleted = await MatchModel.getMatchById(completedMatch.id);
    assert(checkCompleted === null, 'Completed match no longer exists in database');

    const scoresAfter = (await MatchModel.getAllScores()).filter(s => s.match_id === completedMatch.id);
    assert(scoresAfter.length === 0, 'Associated scores cascaded/cleaned up on match deletion');

    // Test 3b: Verify Player Fantasy Points (FP) are automatically deleted
    console.log('\n📌 Test 3b: Verify Player Fantasy Points (FP) are deleted when match is deleted');
    const fpMatch = await MatchModel.createMatch({
      name: 'FP Test Match',
      sport: 'Football',
      team_a_id: teamA.id,
      team_b_id: teamB.id,
      status: 'completed'
    });
    const testPlayerId = '99999999-8888-7777-6666-555555555555';
    await (await import('../server/config/db.js')).query(
      `INSERT INTO player_match_points (match_id, player_id, team_id, sport, fantasy_points, stats)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [fpMatch.id, testPlayerId, teamA.id, 'Football', 25, JSON.stringify({ goals: 2 })]
    );

    const fpRowsBefore = (await (await import('../server/config/db.js')).query(
      'SELECT * FROM player_match_points WHERE match_id = $1',
      [fpMatch.id]
    )).rows;
    assert(fpRowsBefore.length === 1 && fpRowsBefore[0].fantasy_points === 25, 'Player FP of 25 recorded for match');

    // Delete the match
    await MatchModel.deleteMatch(fpMatch.id);

    const fpRowsAfter = (await (await import('../server/config/db.js')).query(
      'SELECT * FROM player_match_points WHERE match_id = $1',
      [fpMatch.id]
    )).rows;
    assert(fpRowsAfter.length === 0, 'Player FP row deleted automatically when match is deleted');

    const playerRemainingFP = (await (await import('../server/config/db.js')).query(
      'SELECT * FROM player_match_points WHERE player_id = $1',
      [testPlayerId]
    )).rows;
    assert(playerRemainingFP.length === 0, 'Player total FP no longer includes points from deleted match');

    // Test 4: deleteMatch controller endpoint
    console.log('\n📌 Test 4: Admin Controller deleteMatch endpoint');
    const controllerMatch = await MatchModel.createMatch({
      name: 'Controller Test Match',
      sport: 'Basketball',
      team_a_id: teamA.id,
      team_b_id: teamB.id,
      status: 'live'
    });

    let jsonResponse = null;
    let statusCode = 200;
    const req = {
      params: { id: controllerMatch.id },
      user: { id: adminUser, role: 'admin' }
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    await deleteMatch(req, res);
    assert(statusCode === 200 && jsonResponse?.success === true, 'Controller returns success: true');
    assert(jsonResponse?.match?.id === controllerMatch.id, 'Controller returns deleted match details');

    // Test 5: Controller 404 for non-existent match
    console.log('\n📌 Test 5: Deleting non-existent match returns 404');
    let notFoundCode = 200;
    let notFoundResponse = null;
    const req404 = {
      params: { id: '00000000-0000-0000-0000-000000000000' },
      user: { id: adminUser, role: 'admin' }
    };
    const res404 = {
      status(code) {
        notFoundCode = code;
        return this;
      },
      json(data) {
        notFoundResponse = data;
        return this;
      }
    };

    await deleteMatch(req404, res404);
    assert(notFoundCode === 404 && notFoundResponse?.success === false, 'Returns 404 for non-existent match');

    // Test 6: Audit log verification
    console.log('\n📌 Test 6: Audit log captures delete_fixture action');
    const logs = await AuditLogModel.getRecent(10);
    const deleteAudit = logs.find(l => l.action === 'delete_fixture' && l.entity_id === controllerMatch.id);
    assert(deleteAudit !== undefined, 'Audit log recorded delete_fixture for the match');
    assert(deleteAudit?.details?.status === 'live', 'Audit log captured status of deleted match');

  } catch (err) {
    console.error('Test error:', err);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
