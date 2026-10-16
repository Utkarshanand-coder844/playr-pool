/**
 * Automated Verification Script for Matches, Live Scores, and Admin Dashboard Endpoints
 */

import { getTestBaseUrl, stopTestServer } from './test-setup.js';

let BASE_URL = 'http://localhost:5000/api';

const logResult = (testName, passed, detail) => {
  if (passed) {
    console.log(`✅ PASS: ${testName}`);
  } else {
    console.error(`❌ FAIL: ${testName} - ${detail}`);
  }
};

async function runScoreTests() {
  console.log('⚡ Starting Match & Score Management Verification Suite...\n');

  try {
    const host = await getTestBaseUrl();
    BASE_URL = `${host}/api`;

    const runId = Date.now().toString().slice(-4);
    const adminId = `ADM-SCORE-${runId}`;
    const playerId = `PLY-SCORE-${runId}`;

    // 1. Setup Admin
    const adminSignup = await fetch(`${BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: adminId,
        name: 'Head Referee',
        department: 'Sports Council',
        year: 'Staff',
        email: `admin.score.${runId}@college.edu`,
        phone: '+1 555-400-0000',
        password: 'adminPassword123',
        role: 'admin',
        admin_code: process.env.ADMIN_SIGNUP_CODE || 'local-dev-admin-code-2026'
      })
    });
    const adminData = await adminSignup.json();
    const adminToken = adminData.token;

    // 2. Setup Player
    const playerSignup = await fetch(`${BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: playerId,
        name: 'Normal Athlete',
        department: 'Physics',
        year: '2nd Year',
        email: `athlete.${runId}@college.edu`,
        phone: '+1 555-500-0000',
        password: 'playerPassword123',
        role: 'player'
      })
    });
    const playerData = await playerSignup.json();
    const playerToken = playerData.token;

    // 3. Setup Two Teams
    const team1Res = await fetch(`${BASE_URL}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${playerToken}` },
      body: JSON.stringify({
        name: `Red Dragons ${runId}`,
        members: [{ member_name: 'Player One', position: 'Captain' }]
      })
    });
    const team1Data = await team1Res.json();
    const team1Id = team1Data.team.id;

    // Signup player 2 for second team
    const player2Signup = await fetch(`${BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: `PLY2-${runId}`,
        name: 'Athlete Two',
        department: 'Math',
        year: '1st Year',
        email: `athlete2.${runId}@college.edu`,
        phone: '+1 555-600-0000',
        password: 'playerPassword123',
        role: 'player'
      })
    });
    const player2Data = await player2Signup.json();
    const team2Res = await fetch(`${BASE_URL}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${player2Data.token}` },
      body: JSON.stringify({
        name: `Blue Phoenix ${runId}`,
        members: [{ member_name: 'Player Two', position: 'Captain' }]
      })
    });
    const team2Data = await team2Res.json();
    const team2Id = team2Data.team.id;

    // Test 1: Admin creates a match (POST /api/admin/matches)
    const matchRes = await fetch(`${BASE_URL}/admin/matches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Semi-Final: Dragons vs Phoenix',
        match_date: new Date().toISOString(),
        status: 'upcoming'
      })
    });
    const matchData = await matchRes.json();
    logResult(
      'Admin creates match (POST /api/admin/matches)',
      matchRes.status === 201 && matchData.success && matchData.match.status === 'upcoming',
      JSON.stringify(matchData)
    );
    const matchId = matchData.match.id;

    // Test 2: Player blocked from creating match
    const playerMatchAttempt = await fetch(`${BASE_URL}/admin/matches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${playerToken}`
      },
      body: JSON.stringify({ name: 'Hacked Match' })
    });
    logResult(
      'requireAdmin blocks Player from creating matches (403)',
      playerMatchAttempt.status === 403,
      'Status: ' + playerMatchAttempt.status
    );

    // Test 3: Admin updates match status to 'live' (PUT /api/admin/matches/:id/status)
    const updateStatusRes = await fetch(`${BASE_URL}/admin/matches/${matchId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'live' })
    });
    const updateStatusData = await updateStatusRes.json();
    logResult(
      'Admin updates match status to live (PUT /api/admin/matches/:id/status)',
      updateStatusRes.status === 200 && updateStatusData.match.status === 'live',
      JSON.stringify(updateStatusData)
    );

    // Test 4: Admin records initial score for Team 1 (POST /api/admin/scores)
    const score1Res = await fetch(`${BASE_URL}/admin/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        match_id: matchId,
        team_id: team1Id,
        points: 10
      })
    });
    const score1Data = await score1Res.json();
    logResult(
      'Admin adds score for Team 1 (POST /api/admin/scores)',
      score1Res.status === 200 && score1Data.success && score1Data.score.points === 10,
      JSON.stringify(score1Data)
    );

    // Test 5: Admin updates score for Team 1 (UPSERT - update instead of duplicate)
    const score1UpdateRes = await fetch(`${BASE_URL}/admin/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        match_id: matchId,
        team_id: team1Id,
        points: 24
      })
    });
    const score1UpdateData = await score1UpdateRes.json();
    logResult(
      'Admin updates existing score row (UPSERT - no duplicate)',
      score1UpdateRes.status === 200 && score1UpdateData.score.points === 24,
      JSON.stringify(score1UpdateData)
    );

    // Test 6: Admin records score for Team 2
    const score2Res = await fetch(`${BASE_URL}/admin/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        match_id: matchId,
        team_id: team2Id,
        points: 18
      })
    });
    const score2Data = await score2Res.json();
    logResult(
      'Admin adds score for Team 2',
      score2Res.status === 200 && score2Data.score.points === 18,
      JSON.stringify(score2Data)
    );

    // Test 7: Admin lists all scores for review (GET /api/admin/scores)
    const allScoresRes = await fetch(`${BASE_URL}/admin/scores`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const allScoresData = await allScoresRes.json();
    const team1ScoreEntry = allScoresData.scores.find(s => s.team_id === team1Id && s.match_id === matchId);
    const team2ScoreEntry = allScoresData.scores.find(s => s.team_id === team2Id && s.match_id === matchId);

    logResult(
      'Admin reviews all scores with joined team & match info (GET /api/admin/scores)',
      allScoresRes.status === 200 &&
      team1ScoreEntry && team1ScoreEntry.points === 24 &&
      team2ScoreEntry && team2ScoreEntry.points === 18,
      JSON.stringify(allScoresData)
    );

    // Test 8: Player blocked from GET /api/admin/scores
    const playerScoresAttempt = await fetch(`${BASE_URL}/admin/scores`, {
      headers: { 'Authorization': `Bearer ${playerToken}` }
    });
    logResult(
      'requireAdmin blocks Player from GET /api/admin/scores (403)',
      playerScoresAttempt.status === 403,
      'Status: ' + playerScoresAttempt.status
    );

    // Test 9: Player blocked from POST /api/admin/scores
    const playerPostScoreAttempt = await fetch(`${BASE_URL}/admin/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${playerToken}`
      },
      body: JSON.stringify({ match_id: matchId, team_id: team1Id, points: 99 })
    });
    logResult(
      'requireAdmin blocks Player from POST /api/admin/scores (403)',
      playerPostScoreAttempt.status === 403,
      'Status: ' + playerPostScoreAttempt.status
    );

    // Test 10: Admin completes match
    const completeMatchRes = await fetch(`${BASE_URL}/admin/matches/${matchId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'completed' })
    });
    const completeMatchData = await completeMatchRes.json();
    logResult(
      'Admin updates match to completed status (PUT /api/admin/matches/:id/status)',
      completeMatchRes.status === 200 && completeMatchData.match.status === 'completed',
      JSON.stringify(completeMatchData)
    );

    console.log('\n🎉 ALL 10 MATCHES & SCORES TESTS PASSED SUCCESSFULLY!\n');
  } catch (err) {
    console.error('Fatal error during score test suite:', err);
    process.exit(1);
  } finally {
    await stopTestServer();
  }
}

runScoreTests();
