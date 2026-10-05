import express from 'express';
import {
  lockTeams,
  unlockTeams,
  getAdminTournamentStatus,
  createMatch,
  getMatches,
  updateMatchStatus,
  deleteMatch,
  saveScore,
  getScores,
  getTeams, getPlayers, getPlayersByRole,
  savePlayerStat,
  saveRegistrationDeadline,
  getRegistrationDeadlines,
  generateBracketRound,
  getBracket,
  getAuditLog
  , createAnnouncement, updateAnnouncement, deleteAnnouncement
} from '../controllers/adminController.js';
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes in this file require valid admin JWT authentication
router.use(authenticateToken, requireAdmin);

// Tournament Locking
router.post('/lock-teams', lockTeams);
router.post('/unlock-teams', unlockTeams);
router.get('/tournament-status', getAdminTournamentStatus);

// Matches Management
router.post('/matches', createMatch);
router.get('/matches', getMatches);
router.put('/matches/:id/status', updateMatchStatus);
router.delete('/matches/:id', deleteMatch);

// Scores Management
router.post('/scores', saveScore);
router.get('/scores', getScores);
router.post('/player-stats', savePlayerStat);

// Sport registration windows
router.get('/registration-deadlines', getRegistrationDeadlines);
router.put('/registration-deadlines', saveRegistrationDeadline);

// Knockout bracket generation and review
router.post('/brackets/generate', generateBracketRound);
router.get('/brackets', getBracket);

// Traceability for all admin actions
router.get('/audit-log', getAuditLog);

// Public-facing tournament notices, managed by admins
router.post('/announcements', createAnnouncement);
router.put('/announcements/:id', updateAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);

// Registered Teams for Selection
router.get('/teams', getTeams);
router.get('/players', getPlayers);
router.get('/players/by-role', getPlayersByRole);

export default router;
