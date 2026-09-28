import express from 'express';
import { createTeam, getMyTeam, updateTeam, deleteTeam, getTournamentStatus, getTeamById, getRegisteredPlayers, getPlayerProfile, createTeamInvite, getMyInvites, respondToTeamInvite, getRegistrationStatus, setAvailability, getTeamAvailability, createTeamRequest, getTeamRequests, reviewTeamRequest, removeTeamMember, voteToRemoveAdmin, getAdminRemovalVoteSummary, discover, transferTeamOwnership } from '../controllers/teamController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { actionRateLimit } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

// Tournament status
router.get('/status', getTournamentStatus);
router.get('/registration-status', getRegistrationStatus);

// Authenticated team routes
router.post('/', authenticateToken, createTeam);
router.get('/mine', authenticateToken, getMyTeam);
router.get('/players', authenticateToken, getRegisteredPlayers);
router.get('/players/:id', authenticateToken, getPlayerProfile);
router.get('/discover', authenticateToken, discover);
router.put('/availability', authenticateToken, setAvailability);
router.get('/invites/mine', authenticateToken, getMyInvites);
router.put('/invites/:id', authenticateToken, respondToTeamInvite);
router.post('/:id/invites', authenticateToken, createTeamInvite);
router.get('/:id/availability', authenticateToken, getTeamAvailability);
router.post('/:id/requests', authenticateToken, actionRateLimit({ windowMs: 60 * 60 * 1000, max: 8 }), createTeamRequest);
router.get('/:id/requests', authenticateToken, getTeamRequests);
router.put('/:id/requests/:requestId', authenticateToken, reviewTeamRequest);
router.delete('/:id/members/:playerId', authenticateToken, actionRateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), removeTeamMember);
router.put('/:id/ownership', authenticateToken, actionRateLimit({ windowMs: 60 * 60 * 1000, max: 3 }), transferTeamOwnership);
router.get('/:id/admin-removal-votes', authenticateToken, getAdminRemovalVoteSummary);
router.post('/:id/admin-removal-votes', authenticateToken, actionRateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 3 }), voteToRemoveAdmin);
router.put('/:id', authenticateToken, updateTeam);
router.delete('/:id', authenticateToken, actionRateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), deleteTeam);

// Public route — view any team's profile page. Kept after the literal
// routes above so Express matches /status and /mine before falling
// through to this :id wildcard.
router.get('/:id', getTeamById);

export default router;
