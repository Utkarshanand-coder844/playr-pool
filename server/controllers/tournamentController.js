import { TournamentModel } from '../models/tournamentModel.js';
import { TeamModel } from '../models/teamModel.js';
import { UserModel } from '../models/userModel.js';
import { AuditLogModel } from '../models/auditLogModel.js';
import { NotificationModel } from '../models/notificationModel.js';
import { getIO } from '../config/socket.js';
import { sendTournamentInviteEmail } from '../config/email.js';

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

      let invitedCount = 0;
      if (req.body.invite_all) {
        try {
          const { MatchModel } = await import('../models/matchModel.js');
          const allTeams = await MatchModel.getAllTeams();
          const eligibleTeams = allTeams.filter(t => {
            const matchesCampus = !tournamentCampus || !t.campus || t.campus === tournamentCampus;
            const matchesSport = !Array.isArray(tournament.sports) || tournament.sports.length === 0 || tournament.sports.some(s => s.toLowerCase() === (t.sport || '').toLowerCase());
            return matchesCampus && matchesSport;
          });

          if (eligibleTeams.length > 0) {
            const teamIds = eligibleTeams.map(t => t.id);
            await TournamentModel.inviteTeams({ tournamentId: tournament.id, teamIds });
            invitedCount = teamIds.length;

            for (const team of eligibleTeams) {
              const playerIds = [team.owner_user_id, ...(team.members || []).map(m => m.member_user_id)].filter(Boolean);
              const distinctPlayerIds = [...new Set(playerIds)];
              for (const pId of distinctPlayerIds) {
                try {
                  await NotificationModel.create({
                    userId: pId,
                    type: 'tournament_invite',
                    title: `🏆 Tournament Invitation: ${tournament.name}`,
                    message: `Your team "${team.name}" has been invited to compete in ${tournament.name} (${tournament.campus}). Open Tournaments to view details and join.`
                  });
                  getIO()?.to(`user:${pId}`).emit('team:notification', {
                    type: 'tournament_invite',
                    title: `🏆 Tournament Invitation: ${tournament.name}`,
                    message: `Your team "${team.name}" has been invited to compete in ${tournament.name} (${tournament.campus}).`
                  });
                } catch {}
              }
            }
          }
        } catch (inviteErr) {
          console.error('Auto invite error upon creation:', inviteErr);
        }
      }

      await audit(req, 'create_tournament', tournament.id, {
        tournament_id: tournament.id,
        name: tournament.name,
        campus: tournament.campus,
        sports: tournament.sports,
        invited_teams_count: invitedCount
      });

      return res.status(201).json({
        success: true,
        message: invitedCount > 0
          ? `Tournament created successfully! ${invitedCount} campus team(s) have been invited automatically.`
          : 'Tournament created successfully. You are now the tournament owner.',
        tournament,
        invited_teams_count: invitedCount
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

      const tournaments = await TournamentModel.getForUser(userId);

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
  },

  /**
   * DELETE /api/tournaments/:id
   * Only the tournament creator/owner or super admin can delete the tournament.
   */
  async deleteTournament(req, res) {
    try {
      const tournamentId = req.params.id;
      const tournament = await TournamentModel.findById(tournamentId);
      if (!tournament) return res.status(404).json({ success: false, message: 'Tournament not found' });

      const deleted = await TournamentModel.delete(tournamentId);

      await audit(req, 'delete_tournament', tournamentId, {
        tournament_id: tournamentId,
        name: tournament.name
      });

      try {
        const io = getIO();
        io.emit('tournament:deleted', { tournament_id: tournamentId, name: tournament.name });
      } catch {}

      return res.json({
        success: true,
        message: `Tournament "${tournament.name}" deleted successfully.`,
        deleted
      });
    } catch (err) {
      console.error('Delete tournament error:', err);
      return res.status(500).json({ success: false, message: 'Unable to delete tournament' });
    }
  },

  /**
   * GET /api/tournaments/:id/available-teams
   * List teams eligible to be invited to this tournament
   */
  async getAvailableTeamsToInvite(req, res) {
    try {
      const tournamentId = req.params.id;
      const tournament = await TournamentModel.findById(tournamentId);
      if (!tournament) return res.status(404).json({ success: false, message: 'Tournament not found' });

      const { MatchModel } = await import('../models/matchModel.js');
      const allTeams = await MatchModel.getAllTeams();
      const existingEntries = await TournamentModel.getEnteredTeams(tournamentId);
      const existingTeamIds = new Set(existingEntries.map(e => e.team_id));

      const available = allTeams
        .filter(t => !existingTeamIds.has(t.id))
        .filter(t => {
          if (Array.isArray(tournament.sports) && tournament.sports.length > 0) {
            return tournament.sports.some(s => s.toLowerCase() === (t.sport || '').toLowerCase());
          }
          return true;
        });

      return res.json({ success: true, teams: available });
    } catch (err) {
      console.error('Get available teams error:', err);
      return res.status(500).json({ success: false, message: 'Unable to load available teams' });
    }
  },

  /**
   * POST /api/tournaments/:id/invite-teams
   * Invite all teams or specific teams to the tournament
   */
  async inviteTeams(req, res) {
    try {
      const tournamentId = req.params.id;
      const tournament = await TournamentModel.findById(tournamentId);
      if (!tournament) return res.status(404).json({ success: false, message: 'Tournament not found' });

      if (tournament.locked) {
        return res.status(400).json({ success: false, message: 'This tournament is locked for team entries' });
      }

      let { teamIds } = req.body;
      const { inviteAll } = req.body;

      if (inviteAll) {
        const { MatchModel } = await import('../models/matchModel.js');
        const allTeams = await MatchModel.getAllTeams();
        const existingEntries = await TournamentModel.getEnteredTeams(tournamentId);
        const existingTeamIds = new Set(existingEntries.map(e => e.team_id));
        teamIds = allTeams
          .filter(t => !existingTeamIds.has(t.id))
          .filter(t => {
            if (Array.isArray(tournament.sports) && tournament.sports.length > 0) {
              return tournament.sports.some(s => s.toLowerCase() === (t.sport || '').toLowerCase());
            }
            return true;
          })
          .map(t => t.id);
      }

      if (!Array.isArray(teamIds) || teamIds.length === 0) {
        return res.status(400).json({ success: false, message: 'No eligible teams selected to invite' });
      }

      const entries = await TournamentModel.inviteTeams({ tournamentId, teamIds });

      // Notify ONLY the team captain (owner) with in-app + email notification
      for (const teamId of teamIds) {
        try {
          const team = await TeamModel.findById(teamId);
          if (team && team.owner_user_id) {
            const captainId = team.owner_user_id;

            // 1. In-app notification
            await NotificationModel.create({
              userId: captainId,
              type: 'tournament_invite',
              title: `🏆 Team Invitation Request: ${tournament.name}`,
              message: `Your team "${team.name}" (${team.sport}) has been invited to compete in "${tournament.name}" (${tournament.campus}). As team captain, please accept or decline this invitation in the Tournaments section.`
            });

            // 2. Real-time socket push
            try {
              getIO().to(`user:${captainId}`).emit('team:notification', {
                type: 'tournament_invite',
                title: `🏆 Team Invitation Request: ${tournament.name}`,
                message: `Your team "${team.name}" has been invited to "${tournament.name}". Open Tournaments → Invitations to accept or decline.`,
                tournament_id: tournamentId,
                team_id: teamId,
                action_required: true
              });
            } catch {}

            // 3. Email to captain's registered address (non-fatal)
            try {
              const captain = await UserModel.findById(captainId);
              if (captain?.email) {
                await sendTournamentInviteEmail({
                  captainEmail: captain.email,
                  captainName: captain.name,
                  teamName: team.name,
                  sport: team.sport || 'Sports',
                  tournamentName: tournament.name,
                  campus: tournament.campus,
                  frontendUrl: process.env.FRONTEND_URL
                });
              }
            } catch (emailErr) {
              console.warn(`[invite] Email to captain ${captainId} failed (non-fatal):`, emailErr.message);
            }
          }
        } catch {}
      }

      await audit(req, 'invite_tournament_teams', tournamentId, {
        tournament_id: tournamentId,
        team_count: teamIds.length
      });

      return res.status(201).json({
        success: true,
        message: `Successfully invited ${teamIds.length} team(s) to the tournament.`,
        entries
      });
    } catch (err) {
      console.error('Invite teams error:', err);
      return res.status(500).json({ success: false, message: 'Unable to invite teams' });
    }
  },

  /**
   * GET /api/tournaments/my-invitations
   * List all tournaments in which caller's teams are invited or participating
   */
  async getMyTeamTournaments(req, res) {
    try {
      const userId = getUserId(req);
      const tournaments = await TournamentModel.getTournamentsForUserTeams(userId);
      return res.json({ success: true, tournaments });
    } catch (err) {
      console.error('Get my team tournaments error:', err);
      return res.status(500).json({ success: false, message: 'Unable to load team tournaments' });
    }
  },

  /**
   * POST /api/tournaments/:id/respond-invite
   * Accept or decline a tournament invitation
   */
  async respondInvite(req, res) {
    try {
      const tournamentId = req.params.id;
      const { teamId, action } = req.body;
      const userId = getUserId(req);

      if (!['accept', 'decline'].includes(action)) {
        return res.status(400).json({ success: false, message: "Action must be 'accept' or 'decline'" });
      }

      const team = await TeamModel.findById(teamId);
      if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

      // Only team captain/owner can accept or decline for the team
      if (team.owner_user_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only the team captain can accept or decline tournament invitations' });
      }

      const entry = await TournamentModel.respondInvite({ tournamentId, teamId, action });
      if (!entry) return res.status(404).json({ success: false, message: 'Tournament invitation entry not found' });

      await audit(req, 'respond_tournament_invite', tournamentId, {
        tournament_id: tournamentId,
        team_id: teamId,
        action
      });

      return res.json({
        success: true,
        message: action === 'accept' ? 'Tournament invitation accepted! Your team is now entered.' : 'Tournament invitation declined.',
        entry
      });
    } catch (err) {
      console.error('Respond invite error:', err);
      return res.status(500).json({ success: false, message: 'Unable to respond to invitation' });
    }
  }
};
