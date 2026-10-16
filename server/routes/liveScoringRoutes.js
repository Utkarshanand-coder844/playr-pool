import express from 'express';
import { LiveScoringController } from '../controllers/liveScoringController.js';
import { authenticateToken, requireTournamentAdmin } from '../middleware/authMiddleware.js';

import { validateBody, scoringEventSchema } from '../middleware/validateMiddleware.js';

const router = express.Router();

// Public spectator endpoints (no login required to watch live score)
router.get('/matches', LiveScoringController.getAllLiveMatches);

// Player history endpoint (public — player profile page)
router.get('/player/:playerId/stats', LiveScoringController.getPlayerHistory);

// Match-specific endpoints
router.get('/:matchId', LiveScoringController.getMatchLiveDetail);
router.get('/:matchId/scorecard', LiveScoringController.getScorecard);
router.get('/:matchId/player-stats', LiveScoringController.getPlayerMatchStats);

// Tournament admin scoring controllers
router.post('/:matchId/event', authenticateToken, requireTournamentAdmin, validateBody(scoringEventSchema), LiveScoringController.recordEvent);
router.post('/:matchId/undo', authenticateToken, requireTournamentAdmin, LiveScoringController.undoEvent);
router.post('/:matchId/reset', authenticateToken, requireTournamentAdmin, LiveScoringController.resetMatch);

export default router;
