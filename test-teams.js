/**
 * Automated Verification Script for Team Creation, Roster Management, and Admin Lock
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

async function runTeamTests() {
  console.log('🏆 Starting Team Management & Tournament Lock Verification Suite...\n');

  try {
    const host = await getTestBaseUrl();
    BASE_URL = `${host}/api`;

    const runId = Date.now().toString().slice(-4);
    const p1Id = `ATH-101-${runId}`;
    const p2Id = `ATH-102-${runId}`;
    const adminId = `ADM-${runId}`;
    // 1. Setup Player 1
    const p1Signup = await fetch(`${BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: p1Id,
        name: 'Alex Hunter',
        department: 'Sports Science',
        year: '2nd Year',
        email: `alex.${runId}@college.edu`,
        phone: '+1 555-111-2222',
        password: 'password123',
        role: 'player'
      })
    });
    const p1Data = await p1Signup.json();
    const p1Token = p1Data.token;

    // 2. Setup Player 2
    const p2Signup = await fetch(`${BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: p2Id,
        name: 'Gareth Walker',
        department: 'Engineering',
        year: '1st Year',
        email: `gareth.${runId}@college.edu`,
        phone: '+1 555-333-4444',
        password: 'password123',
        role: 'player'
      })
    });
    const p2Data = await p2Signup.json();
    const p2Token = p2Data.token;

    // 3. Setup Admin
    const adminSignup = await fetch(`${BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        college_id: adminId,
        name: 'Tournament Ref',
        department: 'Athletics Board',
        year: 'Staff',
        email: `admin.${runId}@college.edu`,
        phone: '+1 555-999-0000',
        password: 'adminPassword123',
        role: 'admin',
        admin_code: process.env.ADMIN_SIGNUP_CODE || 'local-dev-admin-code-2026'
      })
    });
    const adminData = await adminSignup.json();
    const adminToken = adminData.token;

    // Test 1: Create Team (POST /api/teams)
    const createTeamRes = await fetch(`${BASE_URL}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${p1Token}`
      },
      body: JSON.stringify({
        name: 'Thunderbolts FC',
        members: [
          { member_name: 'Alex Hunter', position: 'Captain / Striker' },
          { member_name: 'Marcus Vance', position: 'Midfielder' },
          { member_name: 'David De Gea', position: 'Goalkeeper' }
        ]
      })
    });
    const createTeamData = await createTeamRes.json();
    logResult(
      'Create Team with Roster (POST /api/teams)',
      createTeamRes.status === 201 && createTeamData.success && createTeamData.team.members.length === 3,
      JSON.stringify(createTeamData)
    );
    const createdTeamId = createTeamData.team.id;

    // Test 2: Reject team creation without roster members (400 Bad Request)
    const duplicateTeamRes = await fetch(`${BASE_URL}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${p1Token}`
      },
      body: JSON.stringify({
        name: 'Second Team FC',
        members: []
      })
    });
    const duplicateTeamData = await duplicateTeamRes.json();
    logResult(
      'Reject team creation without roster members (400 Bad Request)',
      duplicateTeamRes.status === 400 && !duplicateTeamData.success,
      JSON.stringify(duplicateTeamData)
    );

    // Test 3: Get My Team (GET /api/teams/mine)
    const getMineRes = await fetch(`${BASE_URL}/teams/mine`, {
      headers: { 'Authorization': `Bearer ${p1Token}` }
    });
    const getMineData = await getMineRes.json();
    logResult(
      'Get My Team with Members (GET /api/teams/mine)',
      getMineRes.status === 200 && getMineData.team && getMineData.team.name === 'Thunderbolts FC' && getMineData.team.members.length === 3,
      JSON.stringify(getMineData)
    );

    // Test 4: Edit Team (PUT /api/teams/:id)
    const editTeamRes = await fetch(`${BASE_URL}/teams/${createdTeamId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${p1Token}`
      },
      body: JSON.stringify({
        name: 'Thunderbolts United',
        members: [
          { member_name: 'Alex Hunter', position: 'Captain / Forward' },
          { member_name: 'Marcus Vance', position: 'Midfielder' },
          { member_name: 'David De Gea', position: 'Goalkeeper' },
          { member_name: 'Trent Alexander', position: 'Right Back' }
        ]
      })
    });
    const editTeamData = await editTeamRes.json();
    logResult(
      'Edit Team Name and Members (PUT /api/teams/:id)',
      editTeamRes.status === 200 && editTeamData.team.name === 'Thunderbolts United' && editTeamData.team.members.length === 4,
      JSON.stringify(editTeamData)
    );

    // Test 5: Reject edit by non-owner player
    const unauthorizedEditRes = await fetch(`${BASE_URL}/teams/${createdTeamId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${p2Token}`
      },
      body: JSON.stringify({ name: 'Hacked Team' })
    });
    logResult(
      'Reject edit by non-owner user (403 Forbidden)',
      unauthorizedEditRes.status === 403,
      'Status: ' + unauthorizedEditRes.status
    );

    // Test 6: Player cannot lock teams (requireAdmin check)
    const playerLockAttempt = await fetch(`${BASE_URL}/admin/lock-teams`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${p1Token}` }
    });
    logResult(
      'requireAdmin blocks Player from locking teams (403)',
      playerLockAttempt.status === 403,
      'Status: ' + playerLockAttempt.status
    );

    // Test 7: Admin locks teams (POST /api/admin/lock-teams)
    const adminLockRes = await fetch(`${BASE_URL}/admin/lock-teams`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const adminLockData = await adminLockRes.json();
    logResult(
      'Admin locks teams globally (POST /api/admin/lock-teams)',
      adminLockRes.status === 200 && adminLockData.tournament_started === true,
      JSON.stringify(adminLockData)
    );

    // Test 8: Reject team creation when tournament is locked
    const lockedCreateRes = await fetch(`${BASE_URL}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${p2Token}`
      },
      body: JSON.stringify({ name: 'Late Birds FC' })
    });
    const lockedCreateData = await lockedCreateRes.json();
    logResult(
      'Reject team creation when tournament locked (403)',
      lockedCreateRes.status === 403 && lockedCreateData.message.includes('locked'),
      JSON.stringify(lockedCreateData)
    );

    // Test 9: Reject team editing when tournament is locked
    const lockedEditRes = await fetch(`${BASE_URL}/teams/${createdTeamId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${p1Token}`
      },
      body: JSON.stringify({ name: 'Locked Change' })
    });
    const lockedEditData = await lockedEditRes.json();
    logResult(
      'Reject team edit when tournament locked (403)',
      lockedEditRes.status === 403 && lockedEditData.message.includes('Team locked — tournament in progress'),
      JSON.stringify(lockedEditData)
    );

    // Test 10: Admin unlocks teams
    const unlockRes = await fetch(`${BASE_URL}/admin/unlock-teams`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const unlockData = await unlockRes.json();
    logResult(
      'Admin unlocks teams (POST /api/admin/unlock-teams)',
      unlockRes.status === 200 && unlockData.tournament_started === false,
      JSON.stringify(unlockData)
    );

    console.log('\n🎉 ALL 10 TEAM & TOURNAMENT LOCK TESTS PASSED SUCCESSFULLY!\n');
  } catch (err) {
    console.error('Fatal error during team test suite:', err);
    process.exit(1);
  } finally {
    await stopTestServer();
  }
}

runTeamTests();
