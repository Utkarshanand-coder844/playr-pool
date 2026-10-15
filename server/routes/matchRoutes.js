import express from 'express';
import { getMatches } from '../controllers/matchController.js';
import { deleteMatch } from '../controllers/adminController.js';
import { authenticateToken, requireTournamentAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public route — no authenticateToken middleware, anyone can view the schedule
router.get('/', getMatches);

// Tournament Admin route — delete match fixture
router.delete('/:id', authenticateToken, requireTournamentAdmin, deleteMatch);

export default router;
