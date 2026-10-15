import { TournamentModel } from '../models/tournamentModel.js';
import { TeamModel } from '../models/teamModel.js';
import { UserModel } from '../models/userModel.js';
import { AuditLogModel } from '../models/auditLogModel.js';
import { NotificationModel } from '../models/notificationModel.js';
import { getIO } from '../config/socket.js';

const getUserId = (req) => req.user?.id || req.user?.userId;

const audit = (req, action, entityId, details = {}) => {
  const adminId = getUserId(req);
  return AuditLogModel.record({
    adminId,
    action,
    entityType: 'tournament',
    entityId,
    details: {
      ...details,
      tournament_id: details.tournament_id || entityId
    }
  });
};

export const TournamentController = {
  /**
   * POST /api/tournaments
   * Any logged-in player can create a tournament. Creator automatically becomes owner.
   */
  async createTournament(req, res) {
    try {
      const userId = getUserId(req);
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      // Check max active tournaments limit
      const maxActive = parseInt(process.env.MAX_ACTIVE_TOURNAMENTS_PER_USER || '3', 10);
      const activeCount = await TournamentModel.countActiveByUser(userId);
      if (activeCount >= maxActive && user.role !== 'admin') {
        return res.status(400).json({
          success: false,
          message: `You have reached the maximum limit of ${maxActive} active tournaments. Complete or delete an existing tournament before creating a new one.`
        });
      }

      const {
        name,
        description,
        campus,
        sports,
        status = 'draft',
        registration_opens_at,
        registration_closes_at
      } = req.body;

      const tournamentCampus = (campus && campus.trim()) ? campus.trim() : (user.campus || 'Main Campus');

      const tournament = await TournamentModel.create({
        name: name.trim(),
        description: description ? description.trim() : null,
        campus: tournamentCampus,
        sports: Array.isArray(sports) ? sports : [],
        status: status || 'draft',
        registration_opens_at: registration_opens_at || null,
        registration_closes_at: registration_closes_at || null,
        created_by: userId,
        verified: user.role === 'admin' && req.body.verified === true
      });

      await audit(req, 'create_tournament', tournament.id, {
        tournament_id: tournament.id,
        name: tournament.name,
        campus: tournament.campus,
        sports: tournament.sports
      });

      return res.status(201).json({
        success: true,
        message: 'Tournament created successfully. You are now the tournament owner.',
        tournament
      });
    } catch (err) {
      console.error('Create tournament error:', err);
      return res.status(500).json({ success: false, message: 'Unable to create tournament' });
    }
  },

  /**
   * GET /api/tournaments
   * Public list with optional campus priority
   */
  async getTournaments(req, res) {
    try {
      const preferredCampus = req.query.campus || req.user?.campus || null;
      const status = req.query.status || null;
      const tournaments = await TournamentModel.getAll({ campus: preferredCampus, status });
      return res.json({ success: true, tournaments });
    } catch (err) {
      console.error('Get tournaments error:', err);
      return res.status(500).json({ success: false, message: 'Unable to load tournaments' });
    }
  },

  /**
   * GET /api/tournaments/mine
   * Tournaments created or administered by the caller
   */
  async getMyTournaments(req, res) {
    try {
      const userId = getUserId(req);
      const isSuperAdmin = req.user?.role === 'admin';

      let tournaments = await TournamentModel.getForUser(userId);

      // Super admins manage all tournaments
      if (isSuperAdmin) {
        const allTournaments = await TournamentModel.getAll();
        const myIds = new Set(tournaments.map(t => t.id));
        for (const t of allTournaments) {
          if (!myIds.has(t.id)) {
            tournaments.push({ ...t, my_role: 'owner' });
          }
        }
      }

      return res.json({ success: true, tournaments });
    } catch (err) {
      console.error('Get my tournaments error:', err);
      return res.status(500).json({ success: false, message: 'Unable to load user tournaments' });
    }
  },

  /**
   * GET /api/tournaments/:id
   */
  async getTournamentById(req, res) {
    try {
      const tournament = await TournamentModel.findById(req.params.id);
      if (!tournament) {
        return res.status(404).json({ success: false, message: 'Tournament not found' });
      }

      const userId = req.user?.id || req.user?.userId;
      let myRole = null;
      if (userId) {
        if (req.user?.role === 'admin') {
          myRole = 'owner';
        } else {
          const adminRecord = await TournamentModel.getAdmin(tournament.id, userId);
          if (adminRecord) myRole = adminRecord.role;
        }
      }

      return res.json({
        success: true,
        tournament: {
          ...tournament,
          my_role: myRole
        }
      });
    } catch (err) {
      console.error('Get tournament detail error:', err);
      return res.status(500).json({ success: false, message: 'Unable to retrieve tournament' });
    }
  },

  /**
   * PUT /api/tournaments/:id
   * Edit tournament details (owner or admin)
   */
  async updateTournament(req, res) {
    try {
      const tournament = await TournamentModel.findById(req.params.id);
      if (!tournament) {
        return res.status(404).json({ success: false, message: 'Tournament not found' });
      }

      const {
        name,
        description,
        campus,
        sports,
        status,
        registration_opens_at,
        registration_closes_at
      } = req.body;

      const updated = await TournamentModel.update(req.params.id, {
        name: name !== undefined ? name : tournament.name,
        description: description !== undefined ? description : tournament.description,
        campus: campus !== undefined ? campus : tournament.campus,
        sports: sports !== undefined ? sports : tournament.sports,
        status: status !== undefined ? status : tournament.status,
        registration_opens_at: registration_opens_at !== undefined ? registration_opens_at : tournament.registration_opens_at,
        registration_closes_at: registration_closes_at !== undefined ? registration_closes_at : tournament.registration_closes_at
      });

      await audit(req, 'update_tournament', tournament.id, {
        tournament_id: tournament.id,
        name: updated.name,
        status: updated.status
      });

      return res.json({
        success: true,
        message: 'Tournament updated successfully',
        tournament: updated
      });
    } catch (err) {
      console.error('Update tournament error:', err);
      return res.status(500).json({ success: false, message: 'Unable to update tournament' });
    }
  },

  /**
   * POST /api/tournaments/:id/lock
   */
  async lockTournament(req, res) {
    try {
      const tournament = await TournamentModel.findById(req.params.id);
      if (!tournament) return res.status(404).json({ success: false, message: 'Tournament not found' });

      const updated = await TournamentModel.setLocked(req.params.id, true);
      await audit(req, 'lock_tournament', tournament.id, {
        tournament_id: tournament.id,
        locked: true
      });

      try {
        const io = getIO();
        io.to(`tournament:${req.params.id}`).emit('tournament:lock_change', {
          tournament_id: req.params.id,
          locked: true
        });
      } catch {}

      return res.json({
        success: true,
        message: 'Tournament locked. Team entries are now closed.',
        tournament: updated
      });
    } catch (err) {
      console.error('Lock tournament error:', err);
      return res.status(500).json({ success: false, message: 'Unable to lock tournament' });
    }
  },

  /**
   * POST /api/tournaments/:id/unlock
   */
  async unlockTournament(req, res) {
    try {
      const tournament = await TournamentModel.findById(req.params.id);
      if (!tournament) return res.status(404).json({ success: false, message: 'Tournament not found' });

      const updated = await TournamentModel.setLocked(req.params.id, false);
      await audit(req, 'unlock_tournament', tournament.id, {
        tournament_id: tournament.id,
        locked: false
      });

      try {
        const io = getIO();
        io.to(`tournament:${req.params.id}`).emit('tournament:lock_change', {
          tournament_id: req.params.id,
          locked: false
        });
      } catch {}

      return res.json({
        success: true,
        message: 'Tournament unlocked. Team entries are now open.',
        tournament: updated
      });
    } catch (err) {
      console.error('Unlock tournament error:', err);
      return res.status(500).json({ success: false, message: 'Unable to unlock tournament' });
    }
  },

  /**
   * PUT /api/tournaments/:id/verify
   * Super admin only
   */
  async verifyTournament(req, res) {
    try {
      const tournament = await TournamentModel.findById(req.params.id);
      if (!tournament) return res.status(404).json({ success: false, message: 'Tournament not found' });

      const verified = req.body.verified !== false;
      const updated = await TournamentModel.setVerified(req.params.id, verified);
      await audit(req, 'verify_tournament', tournament.id, {
        tournament_id: tournament.id,
        verified
      });

      return res.json({
        success: true,
        message: `Tournament verification status updated to ${verified}`,
        tournament: updated
      });
    } catch (err) {
      console.error('Verify tournament error:', err);
      return res.status(500).json({ success: false, message: 'Unable to set verification status' });
    }
  },

  /**
   * POST /api/tournaments/:id/teams
   * Team owner enters their team into the tournament
   */
  async enterTeam(req, res) {
    try {
      const tournamentId = req.params.id;
      const teamId = req.teamId || req.body?.teamId || req.body?.team_id;
      const userId = getUserId(req);

      const tournament = await TournamentModel.findById(tournamentId);
      if (!tournament) return res.status(404).json({ success: false, message: 'Tournament not found' });

      if (tournament.locked) {
        return res.status(400).json({ success: false, message: 'This tournament is currently locked for team entries' });
      }

      // Check registration window if configured
      const now = Date.now();
      if (tournament.registration_opens_at && new Date(tournament.registration_opens_at).getTime() > now) {
        return res.status(400).json({ success: false, message: 'Registration has not opened yet for this tournament' });
      }
      if (tournament.registration_closes_at && new Date(tournament.registration_closes_at).getTime() < now) {
        return res.status(400).json({ success: false, message: 'Registration has closed for this tournament' });
      }

      const team = await TeamModel.findById(teamId);
      if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

      // Must be team owner or super admin
      if (team.owner_user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only the team captain/owner can enter their team into a tournament' });
      }

      // Verify team's sport is included in tournament's sports list if specified
      if (Array.isArray(tournament.sports) && tournament.sports.length > 0) {
        const sportAllowed = tournament.sports.some(s => s.toLowerCase() === (team.sport || '').toLowerCase());
        if (!sportAllowed) {
          return res.status(400).json({
            success: false,
            message: `Team sport "${team.sport}" is not part of this tournament. Allowed sports: ${tournament.sports.join(', ')}`
          });
        }
      }

      const entry = await TournamentModel.enterTeam({
        tournamentId,
        teamId,
        status: 'pending'
      });

      await audit(req, 'enter_tournament_team', tournamentId, {
        tournament_id: tournamentId,
        team_id: teamId,
        team_name: team.name,
        sport: team.sport
      });

      try {
        getIO().to(`tournament:${tournamentId}`).emit('tournament:team_entered', {
          tournament_id: tournamentId,
          team_id: teamId,
          team_name: team.name
        });
      } catch {}

      return res.status(201).json({
        success: true,
        message: 'Team entered successfully. Awaiting tournament administrator approval.',
        entry
      });
    } catch (err) {
      console.error('Enter tournament team error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Unable to enter tournament' });
    }
  },

  /**
   * PUT /api/tournaments/:id/teams/:teamId
   * Tournament admin approves or removes a team
   */
  async updateTeamStatus(req, res) {
    try {
      const { id: tournamentId, teamId } = req.params;
      const status = (req.body?.status || '').toLowerCase().trim();

      if (!['approved', 'removed', 'pending'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be 'approved', 'removed', or 'pending'"
        });
      }

      const entry = await TournamentModel.updateTeamStatus(tournamentId, teamId, status);
      if (!entry) return res.status(404).json({ success: false, message: 'Team entry not found' });

      await audit(req, 'update_tournament_team_status', tournamentId, {
        tournament_id: tournamentId,
        team_id: teamId,
        status
      });

      return res.json({
        success: true,
        message: `Team entry status set to '${status}'`,
        entry
      });
    } catch (err) {
      console.error('Update tournament team status error:', err);
      return res.status(500).json({ success: false, message: 'Unable to update team status' });
    }
  },

  /**
   * GET /api/tournaments/:id/teams
   */
  async getTournamentTeams(req, res) {
    try {
      const tournamentId = req.params.id;
      const status = req.query.status || null;
      const teams = await TournamentModel.getEnteredTeams(tournamentId, status);
      return res.json({ success: true, teams });
    } catch (err) {
      console.error('Get tournament teams error:', err);
      return res.status(500).json({ success: false, message: 'Unable to load tournament teams' });
    }
  },

  /**
   * GET /api/tournaments/:id/admins
   */
  async getTournamentAdmins(req, res) {
    try {
      const admins = await TournamentModel.getAllAdmins(req.params.id);
      return res.json({ success: true, admins });
    } catch (err) {
      console.error('Get tournament admins error:', err);
      return res.status(500).json({ success: false, message: 'Unable to load tournament admins' });
    }
  },

  /**
   * GET /api/tournaments/:id/eligible-admins
   * Players from entered teams who are not yet admins
   */
  async getEligibleAdmins(req, res) {
    try {
      const tournamentId = req.params.id;
      const players = await TournamentModel.getEligibleAdmins(tournamentId);
      return res.json({ success: true, players });
    } catch (err) {
      console.error('Get eligible admins error:', err);
      return res.status(500).json({ success: false, message: 'Unable to load eligible players' });
    }
  },

  /**
   * POST /api/tournaments/:id/admins { userId }
   * Promotes an eligible player from entered teams to tournament admin
   */
  async addAdmin(req, res) {
    try {
      const tournamentId = req.params.id;
      const targetUserId = req.targetUserId || req.body?.userId || req.body?.user_id;
      const callerId = getUserId(req);

      const tournament = await TournamentModel.findById(tournamentId);
      if (!tournament) return res.status(404).json({ success: false, message: 'Tournament not found' });

      // Check if target user is already an admin
      const existing = await TournamentModel.getAdmin(tournamentId, targetUserId);
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'This user is already an administrator of this tournament'
        });
      }

      // Check if target user is eligible (must be owner or roster member of an entered team)
      const isEligible = await TournamentModel.isUserEligibleForAdmin(tournamentId, targetUserId);
      if (!isEligible) {
        return res.status(400).json({
          success: false,
          message: 'Target user must be on the roster or be the owner of a team entered in this tournament to be promoted.'
        });
      }

      const admin = await TournamentModel.addAdmin({
        tournamentId,
        userId: targetUserId,
        role: 'admin',
        grantedBy: callerId
      });

      // Send notification to promoted player
      try {
        await NotificationModel.create({
          userId: targetUserId,
          type: 'tournament_admin_promoted',
          title: 'Tournament Admin Promotion',
          message: `You have been promoted to administrator for tournament "${tournament.name}".`
        });

        getIO().to(`user:${targetUserId}`).emit('team:notification', {
          type: 'tournament_admin_promoted',
          title: 'Tournament Admin Promotion',
          message: `You have been promoted to administrator for tournament "${tournament.name}".`,
          tournament_id: tournamentId
        });
      } catch (notifyErr) {
        console.warn('Failed to send admin promotion notification (non-fatal):', notifyErr.message);
      }

      await audit(req, 'promote_tournament_admin', tournamentId, {
        tournament_id: tournamentId,
        target_user_id: targetUserId,
        role: 'admin'
      });

      return res.status(201).json({
        success: true,
        message: 'Player promoted to tournament administrator successfully',
        admin
      });
    } catch (err) {
      console.error('Add tournament admin error:', err);
      return res.status(500).json({ success: false, message: 'Unable to promote player to admin' });
    }
  },

  /**
   * DELETE /api/tournaments/:id/admins/:userId
   * Owner only. Owner can never be removed or demoted.
   */
  async removeAdmin(req, res) {
    try {
      const tournamentId = req.params.id;
      const targetUserId = req.params.userId;

      const tournament = await TournamentModel.findById(tournamentId);
      if (!tournament) return res.status(404).json({ success: false, message: 'Tournament not found' });

      const targetAdmin = await TournamentModel.getAdmin(tournamentId, targetUserId);
      if (!targetAdmin) {
        return res.status(404).json({ success: false, message: 'Admin record not found for this tournament' });
      }

      // The owner can never be removed or demoted
      if (targetAdmin.role === 'owner' || tournament.created_by === targetUserId) {
        return res.status(400).json({
          success: false,
          message: 'The tournament owner cannot be removed or demoted'
        });
      }

      await TournamentModel.removeAdmin(tournamentId, targetUserId);

      await audit(req, 'remove_tournament_admin', tournamentId, {
        tournament_id: tournamentId,
        target_user_id: targetUserId
      });

      return res.json({
        success: true,
        message: 'Administrator removed from tournament successfully'
      });
    } catch (err) {
      console.error('Remove tournament admin error:', err);
      return res.status(500).json({ success: false, message: 'Unable to remove administrator' });
    }
  }
};
