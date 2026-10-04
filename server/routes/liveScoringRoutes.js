import express from 'express';
import { LiveScoringController } from '../controllers/liveScoringController.js';
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public spectator endpoints (no login required to watch live score)
router.get('/matches', LiveScoringController.getAllLiveMatches);

// Player history endpoint (public — player profile page)
router.get('/player/:playerId/stats', LiveScoringController.getPlayerHistory);

// Match-specific endpoints
router.get('/:matchId', LiveScoringController.getMatchLiveDetail);
router.get('/:matchId/scorecard', LiveScoringController.getScorecard);
router.get('/:matchId/player-stats', LiveScoringController.getPlayerMatchStats);

// Admin-only scoring controllers
router.post('/:matchId/event', authenticateToken, requireAdmin, LiveScoringController.recordEvent);
router.post('/:matchId/undo', authenticateToken, requireAdmin, LiveScoringController.undoEvent);
router.post('/:matchId/reset', authenticateToken, requireAdmin, LiveScoringController.resetMatch);

export default router;
