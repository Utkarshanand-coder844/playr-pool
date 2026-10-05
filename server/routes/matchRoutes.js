import express from 'express';
import { getMatches } from '../controllers/matchController.js';
import { deleteMatch } from '../controllers/adminController.js';
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public route — no authenticateToken middleware, anyone can view the schedule
router.get('/', getMatches);

// Admin route — delete match fixture
router.delete('/:id', authenticateToken, requireAdmin, deleteMatch);

export default router;
