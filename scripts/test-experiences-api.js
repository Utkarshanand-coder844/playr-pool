import request from 'supertest';
import app from '../server/server.js';
import { ensureDbReady } from '../server/server.js';

async function testApi() {
  console.log('Testing HTTP API endpoints for /api/experiences...');
  await ensureDbReady();

  // 1. GET /api/experiences (public)
  const getRes = await request(app).get('/api/experiences');
  console.log('GET /api/experiences status:', getRes.status, 'count:', getRes.body?.count);
  if (getRes.status !== 200 || !getRes.body.success) {
    throw new Error('Failed GET /api/experiences');
  }

  // 2. GET /api/experiences/stats (public)
  const statsRes = await request(app).get('/api/experiences/stats');
  console.log('GET /api/experiences/stats status:', statsRes.status, 'avg_rating:', statsRes.body?.stats?.overview?.avg_rating);
  if (statsRes.status !== 200 || !statsRes.body.success) {
    throw new Error('Failed GET /api/experiences/stats');
  }

  // 3. POST /api/experiences (guest player)
  const postRes = await request(app)
    .post('/api/experiences')
    .send({
      authorName: 'Guest Badminton Player',
      authorRole: 'Singles Player',
      campus: 'South Campus',
      sport: 'Badminton',
      rating: 5,
      experienceType: 'Court Feedback & Drills',
      title: 'Fast wooden court with minimal drift',
      experience: 'Lighting was well aligned with zero blind spots during high overhead clears.',
      recommendations: 'Bring grip powder if playing morning sessions due to court warmth.'
    });
  console.log('POST /api/experiences status:', postRes.status, 'created id:', postRes.body?.experience?.id);
  if (postRes.status !== 201 || !postRes.body.success) {
    throw new Error('Failed POST /api/experiences');
  }

  const newId = postRes.body.experience.id;

  // 4. POST /api/experiences/:id/upvote (guest upvote)
  const upvoteRes = await request(app).post(`/api/experiences/${newId}/upvote`);
  console.log('POST upvote status:', upvoteRes.status, 'upvoted:', upvoteRes.body?.upvoted, 'upvotes:', upvoteRes.body?.upvotes);
  if (upvoteRes.status !== 200 || !upvoteRes.body.success) {
    throw new Error('Failed upvote');
  }

  console.log('✅ ALL HTTP API ENDPOINT TESTS PASSED!');
  process.exit(0);
}

testApi().catch((err) => {
  console.error('❌ API test failed:', err);
  process.exit(1);
});
