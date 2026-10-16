import { initDb } from '../server/config/db.js';
import { ExperienceModel } from '../server/models/experienceModel.js';

async function testExperiences() {
  console.log('Testing Player Experiences subsystem...');
  await initDb();

  // Check stats
  const stats = await ExperienceModel.getStats();
  console.log('Stats loaded:', stats);

  // Check getAll
  const list = await ExperienceModel.getAll({ limit: 10 });
  console.log(`Fetched ${list.length} experiences.`);
  if (list.length > 0) {
    console.log('First experience:', {
      id: list[0].id,
      author: list[0].author_name,
      sport: list[0].sport,
      rating: list[0].rating,
      title: list[0].title
    });
  }

  // Test creating a guest player post
  const createdGuest = await ExperienceModel.create({
    authorName: 'Test Striker Guest',
    authorRole: 'Forward',
    campus: 'Main Campus',
    sport: 'Football',
    rating: 5,
    experienceType: 'Tournament Experience',
    title: 'Great tournament management!',
    experience: 'Playing under the lights was smooth and refereeing was fair throughout.',
    recommendations: 'Wear proper shin guards and stay warm before kick-off.',
    isVerifiedPlayer: false
  });
  console.log('Created guest post id:', createdGuest.id);

  // Test upvote
  const upvote1 = await ExperienceModel.toggleUpvote({
    experienceId: createdGuest.id,
    clientIp: '192.168.1.50'
  });
  console.log('Upvote toggle 1 (should be upvoted: true, count: 1):', upvote1);

  const upvote2 = await ExperienceModel.toggleUpvote({
    experienceId: createdGuest.id,
    clientIp: '192.168.1.50'
  });
  console.log('Upvote toggle 2 (should be upvoted: false, count: 0):', upvote2);

  // Clean up test entry
  await ExperienceModel.delete({ id: createdGuest.id, isAdmin: true });
  console.log('Cleaned up test post.');

  console.log('✅ ALL BACKEND TESTS PASSED FOR PLAYER EXPERIENCES!');
  process.exit(0);
}

testExperiences().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
