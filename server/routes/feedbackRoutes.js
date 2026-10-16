import express from 'express';
import {
  getFeedbackPosts,
  getFeedbackReplies,
  createFeedbackPost,
  createFeedbackReply,
  toggleFeedbackUpvote,
  deleteFeedbackPost,
  deleteFeedbackReply
} from '../controllers/feedbackController.js';
import { optionalAuth, authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Viewable by ANYONE (registered or not)
router.get('/', optionalAuth, getFeedbackPosts);
router.get('/:id/replies', getFeedbackReplies);

// Post something: Any REGISTERED person
router.post('/', authenticateToken, createFeedbackPost);

// Reply on a post: Anyone can reply (registered or guest)
router.post('/:id/replies', optionalAuth, createFeedbackReply);

// Upvote: Anyone can upvote
router.post('/:id/upvote', optionalAuth, toggleFeedbackUpvote);

// Deletions: Author or Admin only
router.delete('/:id', authenticateToken, deleteFeedbackPost);
router.delete('/:id/replies/:replyId', authenticateToken, deleteFeedbackReply);

export default router;
