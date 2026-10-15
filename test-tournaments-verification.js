/**
 * Comprehensive Verification Suite for Scoped Tournament Architecture
 * Tests:
 * 1. Tournament Creation (player automatically becomes owner)
 * 2. Team Entry & Status Updates
 * 3. Eligible Admin Filtering (only players of entered teams)
 * 4. Admin Promotion & Demotion
 * 5. Scoped Access Middleware (requireTournamentAdmin & requireTournamentOwner)
 * 6. Scoped Matches & Tournament Isolation
 * 7. Lock / Unlock & Super Admin Verification
 */

import { TournamentModel } from './server/models/tournamentModel.js';
import { MatchModel } from './server/models/matchModel.js';
import { BracketModel } from './server/models/bracketModel.js';
import { TeamModel } from './server/models/teamModel.js';
import { UserModel } from './server/models/userModel.js';
import { requireTournamentAdmin, requireTournamentOwner } from './server/middleware/authMiddleware.js';
import { DEFAULT_TOURNAMENT_ID } from './server/config/db.js';

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

async function runTournamentVerification() {
  console.log('🚀 Running Tournament Scoped Architecture Verification Suite...\n');

  try {
    const timestamp = Date.now().toString().slice(-4);

    // ─────────────────────────────────────────────────────────────
    // Setup Users: Creator/Owner (Player), Team Member (Player), Outside Player, Super Admin
    // ─────────────────────────────────────────────────────────────
    console.log('📌 Test 1: Setup test users in system');
    const ownerUser = await UserModel.create({
      college_id: `COL-OWNER-${timestamp}`,
      name: 'Tournament Founder',
      department: 'Computer Science',
      year: '3rd Year',
      email: `owner.${timestamp}@college.edu`,
      phone: '+1 555-001-0001',
      password: 'password123',
      role: 'player',
      campus: 'North Campus'
    });
    assert(ownerUser && ownerUser.id, 'Created tournament founder (role: player)');

    const memberPlayer = await UserModel.create({
      college_id: `COL-MEMBER-${timestamp}`,
      name: 'Star Striker',
      department: 'Engineering',
      year: '2nd Year',
      email: `member.${timestamp}@college.edu`,
      phone: '+1 555-001-0002',
      password: 'password123',
      role: 'player',
      campus: 'North Campus'
    });
    assert(memberPlayer && memberPlayer.id, 'Created team member player (role: player)');

    const outsidePlayer = await UserModel.create({
      college_id: `COL-OUTSIDE-${timestamp}`,
      name: 'Unentered Player',
      department: 'Literature',
      year: '1st Year',
      email: `outside.${timestamp}@college.edu`,
      phone: '+1 555-001-0003',
      password: 'password123',
      role: 'player',
      campus: 'South Campus'
    });
    assert(outsidePlayer && outsidePlayer.id, 'Created outside player (not in any tournament team)');

    const superAdmin = await UserModel.create({
      college_id: `COL-SUPER-${timestamp}`,
      name: 'Platform Overseer',
      department: 'Athletics Board',
      year: 'Staff',
      email: `super.${timestamp}@college.edu`,
      phone: '+1 555-001-0004',
      password: 'password123',
      role: 'admin',
      campus: 'Main Campus'
    });
    assert(superAdmin && superAdmin.role === 'admin', 'Created global platform super admin');

    // ─────────────────────────────────────────────────────────────
    // Test 2: Create Tournament (Player automatically becomes owner)
    // ─────────────────────────────────────────────────────────────
    console.log('\n📌 Test 2: Any player can create a tournament & automatically become owner');
    const tournament = await TournamentModel.create({
      name: `North Campus Cup ${timestamp}`,
      description: 'Annual inter-department cup',
      campus: 'North Campus',
      sports: ['Football', 'Basketball'],
      status: 'registration',
      created_by: ownerUser.id
    });
    assert(tournament && tournament.id, 'Tournament created with UUID');
    assert(tournament.campus === 'North Campus', 'Tournament campus set correctly');
    assert(tournament.locked === false, 'Tournament locked starts as false');
    assert(tournament.verified === false, 'Tournament verified starts as false');

    // Check that owner was automatically added to tournament_admins with role 'owner'
    const admins = await TournamentModel.getAllAdmins(tournament.id);
    assert(admins.length === 1, 'Tournament has 1 initial admin');
    assert(admins[0].user_id === ownerUser.id, 'Initial admin is the creator user');
    assert(admins[0].role === 'owner', 'Creator has role "owner" in tournament');

    const adminRecord = await TournamentModel.getAdmin(tournament.id, ownerUser.id);
    assert(adminRecord && adminRecord.role === 'owner', 'getAdmin returns "owner" for creator');

    // ─────────────────────────────────────────────────────────────
    // Test 3: Team Entry & Status Updates
    // ─────────────────────────────────────────────────────────────
    console.log('\n📌 Test 3: Teams entering tournament & status management');
    const teamA = await TeamModel.createTeam({
      name: `Dragons FC ${timestamp}`,
      sport: 'Football',
      owner_user_id: memberPlayer.id,
      campus: 'North Campus'
    });
    assert(teamA && teamA.id, 'Created Team A owned by memberPlayer');

    // Enter Team A into Tournament
    const entry = await TournamentModel.enterTeam({
      tournamentId: tournament.id,
      teamId: teamA.id,
      status: 'pending'
    });
    assert(entry && entry.team_id === teamA.id, 'Team entered tournament with status pending');

    let enteredTeams = await TournamentModel.getEnteredTeams(tournament.id);
    assert(enteredTeams.length === 1, 'Tournament has 1 entered team');
    assert(enteredTeams[0].status === 'pending', 'Team entry status is pending');

    // Approve Team
    const updatedTeam = await TournamentModel.updateTeamStatus(tournament.id, teamA.id, 'approved');
    assert(updatedTeam && updatedTeam.status === 'approved', 'Tournament admin approved team');

    // ─────────────────────────────────────────────────────────────
    // Test 4: Eligible Admin Promotion Restriction
    // Requirement: "The tournament admin can promote players from the teams entered in that tournament to admin of that tournament."
    // ─────────────────────────────────────────────────────────────
    console.log('\n📌 Test 4: Eligible admin detection and promotion scoping');
    const isMemberEligible = await TournamentModel.isUserEligibleForAdmin(tournament.id, memberPlayer.id);
    assert(isMemberEligible === true, 'memberPlayer IS eligible for admin (owner/member of entered team)');

    const isOutsideEligible = await TournamentModel.isUserEligibleForAdmin(tournament.id, outsidePlayer.id);
    assert(isOutsideEligible === false, 'outsidePlayer is NOT eligible for admin (not in entered team)');

    const eligibleList = await TournamentModel.getEligibleAdmins(tournament.id);
    assert(
      eligibleList.some(p => p.user_id === memberPlayer.id || p.id === memberPlayer.id),
      'getEligibleAdmins includes memberPlayer'
    );
    assert(
      !eligibleList.some(p => p.user_id === outsidePlayer.id || p.id === outsidePlayer.id),
      'getEligibleAdmins excludes outsidePlayer'
    );

    // Promote eligible player
    const promoted = await TournamentModel.addAdmin({
      tournamentId: tournament.id,
      userId: memberPlayer.id,
      role: 'admin',
      grantedBy: ownerUser.id
    });
    assert(promoted && promoted.role === 'admin', 'Successfully promoted memberPlayer to tournament admin');

    const checkMemberAdmin = await TournamentModel.getAdmin(tournament.id, memberPlayer.id);
    assert(checkMemberAdmin && checkMemberAdmin.role === 'admin', 'memberPlayer now has "admin" role for tournament');

    // ─────────────────────────────────────────────────────────────
    // Test 5: Scoped Access Middleware
    // ─────────────────────────────────────────────────────────────
    console.log('\n📌 Test 5: Scoped authorization middleware (requireTournamentAdmin & requireTournamentOwner)');

    // Helper to test middleware
    const testAdminMiddleware = async (reqUser, targetTourneyId) => {
      let statusSent = null;
      let jsonSent = null;
      let nextCalled = false;
      const req = {
        user: reqUser,
        headers: { 'x-tournament-id': targetTourneyId },
        params: {},
        body: {},
        query: {}
      };
      const res = {
        status: (code) => { statusSent = code; return res; },
        json: (data) => { jsonSent = data; return res; }
      };
      const next = () => { nextCalled = true; };

      await requireTournamentAdmin(req, res, next);
      return { statusSent, jsonSent, nextCalled, req };
    };

    const testOwnerMiddleware = async (reqUser, targetTourneyId) => {
      let statusSent = null;
      let jsonSent = null;
      let nextCalled = false;
      const req = {
        user: reqUser,
        headers: { 'x-tournament-id': targetTourneyId },
        params: {},
        body: {},
        query: {}
      };
      const res = {
        status: (code) => { statusSent = code; return res; },
        json: (data) => { jsonSent = data; return res; }
      };
      const next = () => { nextCalled = true; };

      await requireTournamentOwner(req, res, next);
      return { statusSent, jsonSent, nextCalled, req };
    };

    // 1. Owner user passes requireTournamentAdmin & requireTournamentOwner
    const ownerRes = await testAdminMiddleware(ownerUser, tournament.id);
    assert(ownerRes.nextCalled, 'Tournament owner passes requireTournamentAdmin');
    assert(ownerRes.req.tournamentRole === 'owner', 'Owner role attached to req');

    const ownerOwnerRes = await testOwnerMiddleware(ownerUser, tournament.id);
    assert(ownerOwnerRes.nextCalled, 'Tournament owner passes requireTournamentOwner');

    // 2. Promoted admin player passes requireTournamentAdmin but NOT requireTournamentOwner
    const memberRes = await testAdminMiddleware(memberPlayer, tournament.id);
    assert(memberRes.nextCalled, 'Promoted tournament admin passes requireTournamentAdmin');
    assert(memberRes.req.tournamentRole === 'admin', 'Admin role attached to req');

    const memberOwnerRes = await testOwnerMiddleware(memberPlayer, tournament.id);
    assert(!memberOwnerRes.nextCalled && memberOwnerRes.statusSent === 403, 'Tournament admin is blocked by requireTournamentOwner (only owner can do owner actions)');

    // 3. Super admin passes any tournament
    const superRes = await testAdminMiddleware(superAdmin, tournament.id);
    assert(superRes.nextCalled, 'Global super admin passes requireTournamentAdmin for any tournament');

    const superOwnerRes = await testOwnerMiddleware(superAdmin, tournament.id);
    assert(superOwnerRes.nextCalled, 'Global super admin passes requireTournamentOwner for any tournament');

    // 4. Outside player is blocked with 403 Forbidden
    const outsideRes = await testAdminMiddleware(outsidePlayer, tournament.id);
    assert(!outsideRes.nextCalled && outsideRes.statusSent === 403, 'Outside player is blocked with 403 Forbidden');

    // ─────────────────────────────────────────────────────────────
    // Test 6: Scoped Matches & Tournament Isolation
    // ─────────────────────────────────────────────────────────────
    console.log('\n📌 Test 6: Matches and Brackets scoping to tournament_id');
    const teamB = await TeamModel.createTeam({
      name: `Tigers FC ${timestamp}`,
      sport: 'Football',
      owner_user_id: outsidePlayer.id,
      campus: 'North Campus'
    });
    await TournamentModel.enterTeam({ tournamentId: tournament.id, teamId: teamB.id, status: 'approved' });

    // Create match scoped to this tournament
    const match = await MatchModel.createMatch({
      name: `Cup Match 1 ${timestamp}`,
      sport: 'Football',
      team_a_id: teamA.id,
      team_b_id: teamB.id,
      tournament_id: tournament.id,
      status: 'upcoming'
    });
    assert(match && match.tournament_id === tournament.id, 'Match created with tournament_id');

    // Query matches scoped to tournament
    const tourneyMatches = await MatchModel.getAllMatches(tournament.id);
    assert(
      tourneyMatches.some(m => m.id === match.id),
      'getAllMatches(tournament.id) includes the tournament match'
    );

    // Query matches for default tournament does NOT leak this match
    const defaultMatches = await MatchModel.getAllMatches(DEFAULT_TOURNAMENT_ID);
    assert(
      !defaultMatches.some(m => m.id === match.id),
      'Matches from other tournaments do not leak into default tournament'
    );

    // ─────────────────────────────────────────────────────────────
    // Test 7: Lock / Unlock & Verification
    // ─────────────────────────────────────────────────────────────
    console.log('\n📌 Test 7: Lock, unlock, and super admin verification');
    const lockedT = await TournamentModel.setLocked(tournament.id, true);
    assert(lockedT && lockedT.locked === true, 'Tournament locked successfully');

    const unlockedT = await TournamentModel.setLocked(tournament.id, false);
    assert(unlockedT && unlockedT.locked === false, 'Tournament unlocked successfully');

    const verifiedT = await TournamentModel.setVerified(tournament.id, true);
    assert(verifiedT && verifiedT.verified === true, 'Super admin verified tournament badge');

    // ─────────────────────────────────────────────────────────────
    // Test 8: Admin Demotion by Owner
    // ─────────────────────────────────────────────────────────────
    console.log('\n📌 Test 8: Admin removal by owner');
    const removedAdmin = await TournamentModel.removeAdmin(tournament.id, memberPlayer.id);
    assert(removedAdmin && removedAdmin.user_id === memberPlayer.id, 'Owner removed admin successfully');

    const roleAfterRemoval = await TournamentModel.getAdmin(tournament.id, memberPlayer.id);
    assert(roleAfterRemoval === null, 'Removed user no longer has tournament admin role');

    console.log(`\n========================================`);
    console.log(`Verification Complete: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Fatal error in tournament verification:', err);
    process.exit(1);
  }
}

runTournamentVerification();
