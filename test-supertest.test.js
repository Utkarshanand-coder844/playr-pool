import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app, ensureDbReady } from './server/server.js';

await ensureDbReady();

describe('Playr-Pool Supertest In-Process Integration Suite', () => {
  const timestamp = Date.now().toString().slice(-4);
  const adminCode = process.env.ADMIN_SIGNUP_CODE || 'local-dev-admin-code-2026';

  let playerToken = '';
  let adminToken = '';
  let playerId = '';
  let teamId = '';
  let matchId = '';
  let tournamentId = '';

  describe('Authentication API (supertest)', () => {
    it('rejects signup with missing required fields', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ college_id: 'BAD01', password: '123' });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('successfully signs up a new player and returns JWT', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          college_id: `PLY-ST-${timestamp}`,
          name: 'Supertest Athlete',
          department: 'Computer Science',
          year: '2nd Year',
          campus: 'Main Campus',
          email: `athlete.${timestamp}@college.edu`,
          phone: '+1 555-010-0001',
          password: 'password123',
          role: 'player'
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token);
      playerToken = res.body.token;
      playerId = res.body.user.id;
    });

    it('rejects duplicate college_id signup with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          college_id: `PLY-ST-${timestamp}`,
          name: 'Supertest Athlete Copy',
          department: 'CS',
          year: '2nd Year',
          campus: 'Main Campus',
          email: `dup.${timestamp}@college.edu`,
          phone: '+1 555-010-0002',
          password: 'password123',
          role: 'player'
        });

      assert.strictEqual(res.status, 409);
    });

    it('signs in player and provides valid session', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          college_id: `PLY-ST-${timestamp}`,
          password: 'password123'
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token);
    });

    it('rejects login with invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          college_id: `PLY-ST-${timestamp}`,
          password: 'wrongpassword'
        });

      assert.strictEqual(res.status, 401);
    });

    it('returns player profile for valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${playerToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.name, 'Supertest Athlete');
    });

    it('signs up admin and grants access to admin routes', async () => {
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({
          college_id: `ADM-ST-${timestamp}`,
          name: 'Supertest Referee',
          department: 'Athletics Board',
          year: 'Staff',
          campus: 'Main Campus',
          email: `admin.${timestamp}@college.edu`,
          phone: '+1 555-010-0009',
          password: 'adminPassword123',
          role: 'admin',
          admin_code: adminCode
        });

      assert.strictEqual(signupRes.status, 201);
      adminToken = signupRes.body.token;

      // Access admin-only route
      const adminRouteRes = await request(app)
        .get('/api/auth/admin-only')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.strictEqual(adminRouteRes.status, 200);

      // Block normal player from admin-only route
      const blockedRes = await request(app)
        .get('/api/auth/admin-only')
        .set('Authorization', `Bearer ${playerToken}`);

      assert.strictEqual(blockedRes.status, 403);
    });
  });

  describe('Teams API (supertest)', () => {
    it('creates a new team with roster members', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${playerToken}`)
        .send({
          name: `Supertest FC ${timestamp}`,
          sport: 'Football',
          members: [
            { member_name: 'Supertest Athlete', position: 'Captain' },
            { member_name: 'Winger One', position: 'Forward' }
          ]
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.team.id);
      assert.strictEqual(res.body.team.members.length, 2);
      teamId = res.body.team.id;
    });

    it('rejects team creation without roster members', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${playerToken}`)
        .send({
          name: 'Empty Team',
          sport: 'Football',
          members: []
        });

      assert.strictEqual(res.status, 400);
    });

    it('fetches player team with GET /api/teams/mine', async () => {
      const res = await request(app)
        .get('/api/teams/mine')
        .set('Authorization', `Bearer ${playerToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.team);
    });
  });

  describe('Tournaments API (supertest)', () => {
    it('allows a player to create a tournament and become owner', async () => {
      const res = await request(app)
        .post('/api/tournaments')
        .set('Authorization', `Bearer ${playerToken}`)
        .send({
          name: `Championship Cup ${timestamp}`,
          description: 'Annual inter-department cup',
          campus: 'Main Campus',
          sports: ['Football', 'Cricket'],
          status: 'registration'
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.tournament.id);
      tournamentId = res.body.tournament.id;
    });

    it('lists tournaments publicly with GET /api/tournaments', async () => {
      const res = await request(app)
        .get('/api/tournaments');

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.tournaments));
      const found = res.body.tournaments.some(t => t.id === tournamentId);
      assert.strictEqual(found, true);
    });

    it('retrieves tournament details by ID', async () => {
      const res = await request(app)
        .get(`/api/tournaments/${tournamentId}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.tournament.name, `Championship Cup ${timestamp}`);
    });
  });

  describe('Scoring & Fixtures API (supertest)', () => {
    it('admin creates a match fixture', async () => {
      const res = await request(app)
        .post('/api/admin/matches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Supertest Cup Final',
          sport: 'Football',
          status: 'upcoming'
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.match.id);
      matchId = res.body.match.id;
    });

    it('blocks player from creating match fixtures in tournament they do not manage', async () => {
      const res = await request(app)
        .post('/api/admin/matches')
        .set('Authorization', `Bearer ${playerToken}`)
        .set('x-tournament-id', '00000000-0000-0000-0000-000000000001')
        .send({
          name: 'Illegal Match',
          sport: 'Football'
        });

      assert.strictEqual(res.status, 403);
    });

    it('admin updates match score', async () => {
      const res = await request(app)
        .post('/api/admin/scores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          match_id: matchId,
          team_id: teamId,
          points: 14
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.score.points, 14);
    });

    it('blocks non-admin player from posting scores', async () => {
      const res = await request(app)
        .post('/api/admin/scores')
        .set('Authorization', `Bearer ${playerToken}`)
        .send({
          match_id: matchId,
          team_id: teamId,
          points: 99
        });

      assert.strictEqual(res.status, 403);
    });
  });
});
