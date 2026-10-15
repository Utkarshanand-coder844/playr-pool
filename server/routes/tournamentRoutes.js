import express from 'express';
import { TournamentController } from '../controllers/tournamentController.js';
import {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  requireTournamentAdmin,
  requireTournamentOwner
} from '../middleware/authMiddleware.js';
import {
  validateCreateTournament,
  validateUpdateTournament,
  validateTournamentAdminPromotion,
  validateTournamentTeamEntry
} from '../middleware/validateMiddleware.js';
import { tournamentCreationRateLimit } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

// Public / Player browse endpoints
router.get('/', optionalAuth, TournamentController.getTournaments);
router.get('/mine', authenticateToken, TournamentController.getMyTournaments);
router.get('/:id', optionalAuth, TournamentController.getTournamentById);

// Tournament creation (any logged-in player)
router.post(
  '/',
  authenticateToken,
  tournamentCreationRateLimit,
  validateCreateTournament,
  TournamentController.createTournament
);

// Tournament configuration (tournament admin/owner or super admin)
router.put(
  '/:id',
  authenticateToken,
  requireTournamentAdmin,
  validateUpdateTournament,
  TournamentController.updateTournament
);

router.post(
  '/:id/lock',
  authenticateToken,
  requireTournamentAdmin,
  TournamentController.lockTournament
);

router.post(
  '/:id/unlock',
  authenticateToken,
  requireTournamentAdmin,
  TournamentController.unlockTournament
);

// Platform super admin only: verify badge
router.put(
  '/:id/verify',
  authenticateToken,
  requireAdmin,
  TournamentController.verifyTournament
);

// Teams in tournament
router.get(
  '/:id/teams',
  optionalAuth,
  TournamentController.getTournamentTeams
);

router.post(
  '/:id/teams',
  authenticateToken,
  validateTournamentTeamEntry,
  TournamentController.enterTeam
);

router.put(
  '/:id/teams/:teamId',
  authenticateToken,
  requireTournamentAdmin,
  TournamentController.updateTeamStatus
);

// Tournament Admins management
router.get(
  '/:id/admins',
  authenticateToken,
  requireTournamentAdmin,
  TournamentController.getTournamentAdmins
);

router.get(
  '/:id/eligible-admins',
  authenticateToken,
  requireTournamentAdmin,
  TournamentController.getEligibleAdmins
);

router.post(
  '/:id/admins',
  authenticateToken,
  requireTournamentAdmin,
  validateTournamentAdminPromotion,
  TournamentController.addAdmin
);

router.delete(
  '/:id/admins/:userId',
  authenticateToken,
  requireTournamentOwner,
  TournamentController.removeAdmin
);

export default router;
