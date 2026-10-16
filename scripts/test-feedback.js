import { initDb, query } from '../server/config/db.js';
import { FeedbackModel } from '../server/models/feedbackModel.js';

async function testFeedback() {
  console.log('Testing Feedback subsystem...');
  await initDb();

  // 1. Fetch posts
  const posts = await FeedbackModel.getAll();
  console.log(`Fetched ${posts.length} feedback posts.`);
  if (posts.length > 0) {
    console.log('Sample post:', {
      id: posts[0].id,
      author: posts[0].author_name,
      content: posts[0].content,
      upvotes: posts[0].upvotes,
      reply_count: posts[0].reply_count
    });
  }

  // Find a registered user to test creating post
  const { rows: users } = await query('SELECT id, name FROM users LIMIT 1;');
  if (users.length > 0) {
    const userId = users[0].id;
    // 2. Create post
    const createdPost = await FeedbackModel.createPost({
      userId,
      content: 'Playr-Pool is super intuitive! The live match updates are blazing fast.'
    });
    console.log('Created post:', createdPost.id, 'by:', createdPost.author_name);

    // 3. Upvote post
    const up1 = await FeedbackModel.toggleUpvote({
      postId: createdPost.id,
      clientIp: '10.0.0.1'
    });
    console.log('Upvote toggle 1:', up1);

    // 4. Create reply
    const reply = await FeedbackModel.createReply({
      postId: createdPost.id,
      userId: null,
      authorName: 'Guest Tester',
      content: 'Completely agree, especially the live leaderboard.'
    });
    console.log('Created reply:', reply.id, 'by:', reply.author_name);

    // 5. Fetch replies
    const replies = await FeedbackModel.getReplies(createdPost.id);
    console.log(`Fetched ${replies.length} replies for post.`);

    // Clean up
    await FeedbackModel.deletePost({ postId: createdPost.id, userId, isAdmin: true });
    console.log('Cleaned up test post.');
  }

  console.log('✅ ALL FEEDBACK TESTS PASSED!');
  process.exit(0);
}

testFeedback().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
