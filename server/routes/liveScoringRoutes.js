import express from 'express';
import { LiveScoringController } from '../controllers/liveScoringController.js';
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public spectator endpoints (no login required to watch live score)
router.get('/matches', LiveScoringController.getAllLiveMatches);
router.get('/:matchId', LiveScoringController.getMatchLiveDetail);

// Admin-only scoring controllers
router.post('/:matchId/event', authenticateToken, requireAdmin, LiveScoringController.recordEvent);
router.post('/:matchId/undo', authenticateToken, requireAdmin, LiveScoringController.undoEvent);
router.post('/:matchId/reset', authenticateToken, requireAdmin, LiveScoringController.resetMatch);

export default router;
