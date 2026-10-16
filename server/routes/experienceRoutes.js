import express from 'express';
import {
  getExperiences,
  getExperienceStats,
  createExperience,
  toggleUpvoteExperience,
  deleteExperience
} from '../controllers/experienceController.js';
import { optionalAuth, authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Publicly visible to everyone (registered or not)
router.get('/', optionalAuth, getExperiences);
router.get('/stats', getExperienceStats);

// Any player can post (registered or guest)
router.post('/', optionalAuth, createExperience);

// Upvote an experience (registered or guest)
router.post('/:id/upvote', optionalAuth, toggleUpvoteExperience);

// Delete an experience (author or admin only)
router.delete('/:id', authenticateToken, deleteExperience);

export default router;
