import { TeamModel } from '../models/teamModel.js';
import { MatchModel } from '../models/matchModel.js';
import { UserModel } from '../models/userModel.js';
import { InviteModel } from '../models/inviteModel.js';
import { PlayerStatModel } from '../models/playerStatModel.js';
import { RegistrationModel } from '../models/registrationModel.js';
import { CommunityModel } from '../models/communityModel.js';
import { NotificationModel } from '../models/notificationModel.js';
import { PlayerSportProfileModel } from '../models/playerSportProfileModel.js';
import { getIO } from '../config/socket.js';

const notify = async (userId, title, message) => {
  const notification = await NotificationModel.create({ userId, type: 'team', title, message });
  getIO().to(`user:${userId}`).emit('team:notification', notification);
  return notification;
};

const validateRegisteredMembers = async (members) => {
  if (!Array.isArray(members) || members.length === 0) return 'Add at least one registered player';
  const ids = members.map(member => member?.member_user_id || member?.user_id).filter(Boolean);
  if (ids.length !== members.length || new Set(ids).size !== ids.length) return 'Each roster member must be a different registered player';
  const players = await Promise.all(ids.map(id => UserModel.findById(id)));
  if (players.some(player => !player)) return 'Every roster member must be a registered user';
  return null;
};

/**
 * POST /api/teams
 * Create a new team owned by the authenticated player
 */
export const createTeam = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { name, sport, members } = req.body;
    const normalizedSport = typeof sport === 'string' ? sport.trim() : '';

    // 1. Check if tournament is globally locked
    const isLocked = await TeamModel.isTournamentLocked();
    if (isLocked) {
      return res.status(403).json({
        success: false,
        message: 'Tournament in progress — team creation is locked'
      });
    }

    // 2. Validate input
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Team name is required'
      });
    }
    if (!normalizedSport || normalizedSport.length > 60) {
      return res.status(400).json({ success: false, message: 'Choose a sport (up to 60 characters)' });
    }
    if (!(await RegistrationModel.isRegistrationOpen(normalizedSport))) {
      return res.status(403).json({ success: false, message: `Registration for ${normalizedSport} is currently closed` });
    }
    const membersError = await validateRegisteredMembers(members);
    if (membersError) return res.status(400).json({ success: false, message: membersError });

    // 3. Check if user already owns a team (one team per player)
    const existingTeam = await TeamModel.findByOwnerId(userId, normalizedSport);
    if (existingTeam) {
      return res.status(409).json({
        success: false,
        message: `You already have a ${normalizedSport} team.`
      });
    }

    // 4. Create team and roster members
    const owner = await UserModel.findById(userId);
    const newTeam = await TeamModel.createTeam({
      name: name.trim(),
      sport: normalizedSport,
      campus: owner?.campus,
      owner_user_id: userId,
      members: Array.isArray(members) ? members : []
    });

    return res.status(201).json({
      success: true,
      message: 'Team created successfully',
      team: newTeam
    });
  } catch (error) {
    console.error('Create team error:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: error.message || 'You already own a team. Each player can only create one team.'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating team'
    });
  }
};

/** PUT /api/teams/availability — player availability for a sport or one fixture */
export const setAvailability = async (req, res) => {
  try {
    const { sport, match_id: matchId = null, status, note = null } = req.body;
    if (!sport?.trim() || !['available', 'maybe', 'unavailable'].includes(status)) return res.status(400).json({ success: false, message: 'Sport and an availability status are required.' });
    if (note && (typeof note !== 'string' || note.length > 300)) return res.status(400).json({ success: false, message: 'Availability note must be 300 characters or fewer.' });
    if (matchId) {
      const match = await MatchModel.getMatchById(matchId);
      if (!match || match.sport !== sport.trim()) return res.status(400).json({ success: false, message: 'Select a valid match for this sport.' });
    }
    const availability = await CommunityModel.setAvailability({ userId: req.user.id || req.user.userId, sport: sport.trim(), matchId, status, note: note?.trim() || null });
    return res.json({ success: true, availability });
  } catch (error) { console.error('Set availability error:', error); return res.status(500).json({ success: false, message: 'Unable to save availability.' }); }
};

/** GET /api/teams/:id/availability — owner/admin roster availability dashboard */
export const getTeamAvailability = async (req, res) => {
  try {
    const team = await TeamModel.findById(req.params.id);
    const userId = req.user.id || req.user.userId;
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    if (team.owner_user_id !== userId && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only the team admin can view roster availability.' });
    return res.json({ success: true, availability: await CommunityModel.availabilityForTeam(team.id, team.sport, req.query.match_id || null) });
  } catch (error) { console.error('Get availability error:', error); return res.status(500).json({ success: false, message: 'Unable to load availability.' }); }
};

/** POST /api/teams/:id/requests — request to join or leave a roster */
export const createTeamRequest = async (req, res) => {
  try {
    const type = req.body.request_type;
    const userId = req.user.id || req.user.userId;
    const team = await TeamModel.findById(req.params.id);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    if (!['join', 'leave'].includes(type)) return res.status(400).json({ success: false, message: 'Request type must be join or leave.' });
    const isMember = team.members.some(member => member.member_user_id === userId);
    if (type === 'join' && isMember) return res.status(409).json({ success: false, message: 'You are already on this roster.' });
    if (type === 'leave' && !isMember) return res.status(400).json({ success: false, message: 'You can only leave a team you belong to.' });
    if (team.owner_user_id === userId) return res.status(400).json({ success: false, message: 'Team admins cannot use a roster request; transfer ownership first.' });
    if (await CommunityModel.countRecentRequests({ teamId: team.id, playerId: userId }) >= 5) return res.status(429).json({ success: false, message: 'You can send at most five requests to the same team in 24 hours.' });
    const request = await CommunityModel.createRequest({ teamId: team.id, playerId: userId, requestType: type, message: typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 500) : null });
    const player = await UserModel.findById(userId);
    await notify(team.owner_user_id, `New ${type} request`, `${player?.name || 'A player'} requested to ${type} ${team.name}.`);
    return res.status(201).json({ success: true, message: `Your ${type} request was sent to the team admin.`, request });
  } catch (error) { if (error.code === '23505') return res.status(409).json({ success: false, message: 'You already have this request pending.' }); console.error('Team request error:', error); return res.status(500).json({ success: false, message: 'Unable to create team request.' }); }
};

/** GET/PUT team requests is restricted to the team owner (team admin) or global admin. */
export const getTeamRequests = async (req, res) => {
  try { const team = await TeamModel.findById(req.params.id); const userId = req.user.id || req.user.userId; if (!team) return res.status(404).json({ success: false, message: 'Team not found.' }); if (team.owner_user_id !== userId && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only the team admin can review requests.' }); return res.json({ success: true, requests: await CommunityModel.getRequests(team.id) }); }
  catch (error) { console.error('Get requests error:', error); return res.status(500).json({ success: false, message: 'Unable to load team requests.' }); }
};

export const reviewTeamRequest = async (req, res) => {
  try {
    const team = await TeamModel.findById(req.params.id); const userId = req.user.id || req.user.userId; const status = req.body.status;
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    if (team.owner_user_id !== userId && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only the team admin can review requests.' });
    if (!['approved', 'declined'].includes(status)) return res.status(400).json({ success: false, message: 'Status must be approved or declined.' });
    const request = await CommunityModel.reviewRequest({ id: req.params.requestId, teamId: team.id, reviewerId: userId, status });
    if (!request) return res.status(404).json({ success: false, message: 'Pending request not found.' });
    if (status === 'approved') {
      if (request.request_type === 'join') { const player = await UserModel.findById(request.player_user_id); await TeamModel.addRegisteredMember({ teamId: team.id, user: player }); }
      else await CommunityModel.removeMember({ teamId: team.id, playerId: request.player_user_id });
    }
    await notify(request.player_user_id, `${team.name}: request ${status}`, `Your request to ${request.request_type} ${team.name} was ${status}.`);
    return res.json({ success: true, message: `Request ${status}.`, request });
  } catch (error) { console.error('Review request error:', error); return res.status(500).json({ success: false, message: 'Unable to review request.' }); }
};

/** DELETE /api/teams/:id/members/:playerId — team admin removal control */
export const removeTeamMember = async (req, res) => {
  try { const team = await TeamModel.findById(req.params.id); const userId = req.user.id || req.user.userId; if (!team) return res.status(404).json({ success: false, message: 'Team not found.' }); if (team.owner_user_id !== userId && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only the team admin can remove players.' }); if (req.params.playerId === team.owner_user_id) return res.status(400).json({ success: false, message: 'The team admin cannot be removed from this endpoint.' }); const removed = await CommunityModel.removeMember({ teamId: team.id, playerId: req.params.playerId }); if (!removed) return res.status(404).json({ success: false, message: 'Player is not on this roster.' }); await notify(req.params.playerId, `Removed from ${team.name}`, 'A team admin removed you from this roster.'); return res.json({ success: true, message: 'Player removed from team.' }); }
  catch (error) { console.error('Remove member error:', error); return res.status(500).json({ success: false, message: 'Unable to remove player.' }); }
};

/** GET /api/teams/:id/admin-removal-votes — Fetch current vote summary without casting a vote. */
export const getAdminRemovalVoteSummary = async (req, res) => {
  try {
    const team = await TeamModel.findById(req.params.id);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    const voterId = req.user.id || req.user.userId;
    const isMember = team.members.some(m => m.member_user_id === voterId) || team.owner_user_id === voterId;
    if (!isMember) return res.status(403).json({ success: false, message: 'Only team members can view this poll.' });
    const summary = await CommunityModel.removalVoteSummary(team.id, team.owner_user_id);
    const hasVoted = await CommunityModel.hasVoted({ teamId: team.id, targetAdminId: team.owner_user_id, voterId });
    return res.json({ success: true, vote_summary: summary, has_voted: hasVoted, admin_id: team.owner_user_id });
  } catch (error) { console.error('Vote summary error:', error); return res.status(500).json({ success: false, message: 'Unable to load vote summary.' }); }
};

/** POST /api/teams/:id/admin-removal-votes — 90% of non-admin roster members demotes the admin. */
export const voteToRemoveAdmin = async (req, res) => {
  try {
    const team = await TeamModel.findById(req.params.id); const voterId = req.user.id || req.user.userId;
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    if (team.owner_user_id !== req.body.target_admin_id) return res.status(400).json({ success: false, message: 'Votes can only target this team’s admin.' });
    if (voterId === team.owner_user_id || !team.members.some(member => member.member_user_id === voterId)) return res.status(403).json({ success: false, message: 'Only roster players may vote.' });
    const initialSummary = await CommunityModel.removalVoteSummary(team.id, team.owner_user_id);
    if (initialSummary.eligible_voters < 3) return res.status(400).json({ success: false, message: 'Admin removal voting requires at least three eligible roster players.' });
    await CommunityModel.castRemovalVote({ teamId: team.id, targetAdminId: team.owner_user_id, voterId });
    const summary = await CommunityModel.removalVoteSummary(team.id, team.owner_user_id);
    let removed = false;
    if (summary.eligible_voters > 0 && summary.votes >= summary.threshold) removed = Boolean(await CommunityModel.demoteAdmin(team.owner_user_id));
    return res.json({ success: true, removed, vote_summary: summary, message: removed ? 'The 90% threshold was met. The admin account is now a player account.' : `${summary.votes} of ${summary.threshold} votes required.` });
  } catch (error) { console.error('Admin removal vote error:', error); return res.status(500).json({ success: false, message: 'Unable to record vote.' }); }
};

/** PUT /api/teams/:id/ownership — captain can hand ownership to a current roster member. */
export const transferTeamOwnership = async (req, res) => {
  try {
    const currentOwnerId = req.user.id || req.user.userId;
    const newOwnerId = req.body.new_owner_user_id;
    const team = await TeamModel.findById(req.params.id);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    if (team.owner_user_id !== currentOwnerId) return res.status(403).json({ success: false, message: 'Only the current team admin can transfer ownership.' });
    if (team.locked || await TeamModel.isTournamentLocked()) return res.status(403).json({ success: false, message: 'Ownership transfers are locked while the tournament is in progress.' });
    if (!newOwnerId || newOwnerId === currentOwnerId || !team.members.some(member => member.member_user_id === newOwnerId)) return res.status(400).json({ success: false, message: 'Choose a different current roster member as the new team admin.' });
    const transferred = await TeamModel.transferOwnership({ teamId: team.id, currentOwnerId, newOwnerId });
    if (!transferred) return res.status(409).json({ success: false, message: 'Ownership changed before this request could be completed. Refresh and try again.' });
    await Promise.all([
      notify(newOwnerId, `You now manage ${team.name}`, 'Team ownership was transferred to you. You can now review roster requests and manage the team.'),
      notify(currentOwnerId, `Ownership transferred: ${team.name}`, 'You are now a roster player and no longer manage this team.')
    ]);
    return res.json({ success: true, message: 'Team ownership transferred successfully.', team: transferred });
  } catch (error) { console.error('Ownership transfer error:', error); return res.status(500).json({ success: false, message: 'Unable to transfer ownership.' }); }
};

/** GET /api/teams/discover — campus-prioritized search across players, teams, sports and events. */
export const discover = async (req, res) => {
  try { const requester = await UserModel.findById(req.user.id || req.user.userId); const campus = typeof req.query.campus === 'string' && req.query.campus.trim() ? req.query.campus : requester?.campus || ''; const results = await CommunityModel.search({ q: typeof req.query.q === 'string' ? req.query.q : '', campus, sport: typeof req.query.sport === 'string' ? req.query.sport : '', type: typeof req.query.type === 'string' ? req.query.type : '' }); return res.json({ success: true, campus, ...results }); }
  catch (error) { console.error('Discovery search error:', error); return res.status(500).json({ success: false, message: 'Unable to search campus community.' }); }
};

/**
 * GET /api/teams/mine
 * Get the authenticated player's team and roster
 */
export const getMyTeam = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    // A player can participate in a team created by another player. Return
    // those roster teams too, so every selected player sees the team.
    const teams = await TeamModel.findAllForUserId(userId);
    const isTournamentLocked = await TeamModel.isTournamentLocked();

    return res.json({
      success: true,
      team: teams[0] || null,
      teams,
      tournament_locked: isTournamentLocked
    });
  } catch (error) {
    console.error('Get my team error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving team'
    });
  }
};

/**
 * PUT /api/teams/:id
 * Edit team name, sport, and roster members. Only allowed if not locked and belongs to req.user
 */
export const updateTeam = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const teamId = req.params.id;
    const { name, sport, members } = req.body;

    // 1. Check if tournament is globally locked
    const isTournamentLocked = await TeamModel.isTournamentLocked();
    if (isTournamentLocked) {
      return res.status(403).json({
        success: false,
        message: 'Team locked — tournament in progress'
      });
    }

    // 2. Lookup target team
    const team = await TeamModel.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // 3. Verify ownership: must belong to req.user
    if (team.owner_user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You can only edit your own team'
      });
    }

    // 4. Check if this specific team is marked locked
    if (team.locked) {
      return res.status(403).json({
        success: false,
        message: 'Team locked — tournament in progress'
      });
    }

    // 5. Validate sport change if requested
    let normalizedSport = undefined;
    if (sport !== undefined) {
      normalizedSport = typeof sport === 'string' ? sport.trim() : '';
      if (!normalizedSport || normalizedSport.length > 60) {
        return res.status(400).json({ success: false, message: 'Choose a valid sport (up to 60 characters)' });
      }
      if (normalizedSport !== team.sport) {
        if (!(await RegistrationModel.isRegistrationOpen(normalizedSport))) {
          return res.status(403).json({ success: false, message: `Registration for ${normalizedSport} is currently closed` });
        }
        const existingTeam = await TeamModel.findByOwnerId(userId, normalizedSport);
        if (existingTeam && existingTeam.id !== teamId) {
          return res.status(409).json({
            success: false,
            message: `You already own another team for ${normalizedSport}.`
          });
        }
      }
    }

    // 6. Validate roster members if provided
    if (members !== undefined) {
      const membersError = await validateRegisteredMembers(members);
      if (membersError) return res.status(400).json({ success: false, message: membersError });
    }

    const updated = await TeamModel.updateTeam(teamId, {
      name: name !== undefined ? name : team.name,
      sport: normalizedSport !== undefined ? normalizedSport : team.sport,
      members: members !== undefined ? members : undefined
    });

    return res.json({
      success: true,
      message: 'Team updated successfully',
      team: updated
    });
  } catch (error) {
    console.error('Update team error:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'You already own a team for this sport.'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating team'
    });
  }
};

/**
 * DELETE /api/teams/:id
 * Disband/Delete team. Only allowed if not locked and belongs to req.user
 */
export const deleteTeam = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const teamId = req.params.id;

    // 1. Lookup target team
    const team = await TeamModel.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // 2. Verify ownership: must belong to req.user
    if (team.owner_user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only the team owner can disband or delete this team'
      });
    }

    // 3. Check if tournament is globally locked or team is marked locked
    const isTournamentLocked = await TeamModel.isTournamentLocked();
    if (isTournamentLocked || team.locked) {
      return res.status(403).json({
        success: false,
        message: 'Tournament in progress — team cannot be disbanded while locked'
      });
    }

    // 4. Notify roster members before deletion
    if (Array.isArray(team.members)) {
      const otherMembers = team.members.filter(m => m.member_user_id && m.member_user_id !== userId);
      await Promise.all(
        otherMembers.map(m =>
          notify(m.member_user_id, 'Team Disbanded', `The squad "${team.name}" (${team.sport}) has been disbanded by its owner.`).catch(() => {})
        )
      );
    }

    // 5. Delete team (cascades to team_members, team_invites, team_requests, votes, scores)
    await TeamModel.deleteTeam(teamId);

    return res.json({
      success: true,
      message: `Team "${team.name}" has been successfully disbanded.`
    });
  } catch (error) {
    console.error('Delete team error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while disbanding team'
    });
  }
};

/** GET /api/teams/players — registered players for authenticated roster selection, with sport profiles */
export const getRegisteredPlayers = async (req, res) => {
  try {
    const players = await UserModel.getRegisteredPlayers();
    // Attach all sport profiles to each player so the team builder can show
    // role info without an additional per-player request.
    const profilesRes = await PlayerSportProfileModel.getAllPlayersWithProfiles();
    const profileMap = {};
    for (const p of profilesRes) profileMap[p.id] = p.sport_profiles || {};
    const enriched = players.map(player => ({
      ...player,
      sport_profiles: profileMap[player.id] || {}
    }));
    return res.json({ success: true, players: enriched });
  } catch (error) {
    console.error('Get registered players error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load registered players' });
  }
};

/** POST /api/teams/:id/invites — team owner invites a registered user */
export const createTeamInvite = async (req, res) => {
  try {
    const ownerId = req.user.id || req.user.userId;
    const { invited_user_id } = req.body;
    const team = await TeamModel.findById(req.params.id);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    if (team.owner_user_id !== ownerId) return res.status(403).json({ success: false, message: 'Only the team owner can send invitations' });
    if (team.locked || await TeamModel.isTournamentLocked()) return res.status(403).json({ success: false, message: 'Team registration is locked' });
    const player = await UserModel.findById(invited_user_id);
    if (!player) return res.status(404).json({ success: false, message: 'Registered player not found' });
    if (team.members.some(member => member.member_user_id === player.id)) return res.status(409).json({ success: false, message: 'This player is already on the roster' });
    const invite = await InviteModel.create({ teamId: team.id, invitedUserId: player.id, invitedBy: ownerId });
    return res.status(201).json({ success: true, message: `Invitation sent to ${player.name}`, invite });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'This player already has an invitation for this team' });
    console.error('Create team invite error:', error);
    return res.status(500).json({ success: false, message: 'Unable to send team invitation' });
  }
};

/** GET /api/teams/invites/mine — invitations for the signed-in user */
export const getMyInvites = async (req, res) => {
  try {
    const invites = await InviteModel.getForUser(req.user.id || req.user.userId);
    return res.json({ success: true, invites });
  } catch (error) {
    console.error('Get team invites error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load team invitations' });
  }
};

/** PUT /api/teams/invites/:id — invited user accepts or declines */
export const respondToTeamInvite = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const status = req.body.status === 'accepted' ? 'accepted' : req.body.status === 'declined' ? 'declined' : null;
    if (!status) return res.status(400).json({ success: false, message: 'Response must be accepted or declined' });
    const invite = await InviteModel.respond({ inviteId: req.params.id, userId, status });
    if (!invite) return res.status(404).json({ success: false, message: 'Pending invitation not found' });
    if (status === 'accepted') {
      const player = await UserModel.findById(userId);
      await TeamModel.addRegisteredMember({ teamId: invite.team_id, user: player });
    }
    return res.json({ success: true, message: status === 'accepted' ? 'You joined the team.' : 'Invitation declined.', invite });
  } catch (error) {
    console.error('Respond to team invite error:', error);
    return res.status(500).json({ success: false, message: 'Unable to respond to invitation' });
  }
};

/** GET /api/teams/players/:id — safe player dashboard profile with all sport profiles */
export const getPlayerProfile = async (req, res) => {
  try {
    const player = await UserModel.findPublicProfileById(req.params.id);
    if (!player) return res.status(404).json({ success: false, message: 'Registered player not found' });
    const stats = await PlayerStatModel.getForPlayer(player.id);
    // Include all sport profiles so the profile page can display roles
    const profileRows = await PlayerSportProfileModel.getForUser(player.id);
    const sport_profiles = {};
    for (const p of profileRows) sport_profiles[p.sport] = p;
    return res.json({ success: true, player: { ...player, sport_profiles }, stats });
  } catch (error) {
    console.error('Get player profile error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load player profile' });
  }
};

/** GET /api/teams/registration-status?sport=Football — public deadline status */
export const getRegistrationStatus = async (req, res) => {
  try {
    const sport = typeof req.query.sport === 'string' ? req.query.sport.trim() : '';
    if (!sport) return res.status(400).json({ success: false, message: 'Sport is required' });
    const deadline = await RegistrationModel.getDeadline(sport);
    return res.json({ success: true, sport, registration_open: await RegistrationModel.isRegistrationOpen(sport), deadline });
  } catch (error) {
    console.error('Get registration status error:', error);
    return res.status(500).json({ success: false, message: 'Unable to get registration status' });
  }
};

/**
 * GET /api/teams/status
 * Get current tournament lock status
 */
export const getTournamentStatus = async (req, res) => {
  try {
    const locked = await TeamModel.isTournamentLocked();
    return res.json({
      success: true,
      tournament_started: locked
    });
  } catch (error) {
    console.error('Get status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error checking tournament status'
    });
  }
};

/**
 * GET /api/teams/:id
 * Public route — view any team's profile: roster + match-by-match score history
 */
export const getTeamById = async (req, res) => {
  try {
    const team = await TeamModel.findById(req.params.id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    const scores = await MatchModel.getScoresForTeam(team.id);

    return res.json({
      success: true,
      team: { ...team, scores }
    });
  } catch (error) {
    console.error('Get team by id error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving team'
    });
  }
};
