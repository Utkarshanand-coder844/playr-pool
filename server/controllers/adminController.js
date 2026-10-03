import { TeamModel } from '../models/teamModel.js';
import { MatchModel } from '../models/matchModel.js';
import { getIO } from '../config/socket.js';
import { PlayerStatModel } from '../models/playerStatModel.js';
import { RegistrationModel } from '../models/registrationModel.js';
import { AuditLogModel } from '../models/auditLogModel.js';
import { BracketModel } from '../models/bracketModel.js';
import { UserModel } from '../models/userModel.js';
import { AnnouncementModel } from '../models/announcementModel.js';
import { NotificationModel } from '../models/notificationModel.js';
import { PlayerSportProfileModel } from '../models/playerSportProfileModel.js';

const adminId = (req) => req.user.id || req.user.userId;
const audit = (req, action, entityType, entityId, details) =>
  AuditLogModel.record({ adminId: adminId(req), action, entityType, entityId, details });

const cleanAttachments = (value) => {
  if (!Array.isArray(value) || value.length > 8) return null;
  const allowed = ['poster', 'rules', 'venue_map', 'schedule', 'other'];
  const attachments = value.map(({ label, url, type }) => {
    let cleanUrl = typeof url === 'string' ? url.trim() : '';
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl) && !cleanUrl.startsWith('data:image/')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    const cleanLabel = typeof label === 'string' && label.trim() ? label.trim().slice(0, 120) : 'Event Photo / Attachment';
    return {
      label: cleanLabel,
      url: cleanUrl,
      type: allowed.includes(type) ? type : 'other'
    };
  });
  if (attachments.some(item => !item.url || (!/^https?:\/\//i.test(item.url) && !item.url.startsWith('data:image/')))) return null;
  return attachments;
};

export const createAnnouncement = async (req, res) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    const category = ['tournament', 'match', 'notice'].includes(req.body.category) ? req.body.category : 'notice';
    const eventAt = req.body.event_at || null;
    const campus = typeof req.body.campus === 'string' && req.body.campus.trim() ? req.body.campus.trim().slice(0, 100) : 'all';
    const attachments = cleanAttachments(req.body.attachments || []);
    if (!title || title.length > 120 || !message || message.length > 2000) {
      return res.status(400).json({ success: false, message: 'Provide a title (up to 120 characters) and message (up to 2,000 characters).' });
    }
    if (eventAt && Number.isNaN(new Date(eventAt).getTime())) return res.status(400).json({ success: false, message: 'Event date is invalid.' });
    if (!attachments) return res.status(400).json({ success: false, message: 'Provide up to 8 valid http(s) event attachments.' });
    const isPinned = req.body.is_pinned === true;
    const announcement = await AnnouncementModel.create({ title, message, category, eventAt, isPinned, campus, attachments, createdBy: adminId(req) });
    await audit(req, 'create_announcement', 'announcement', announcement.id, { title, category, campus, event_at: eventAt });
    const io = getIO();
    io.to('campus:all').to(`campus:${campus}`).emit('announcement:new', announcement);

    // Send an authenticated, personal alert to every registered player and
    // the admin who published the event. The public feed above remains
    // separate so visitors can still see announcements without receiving
    // private notification pop-ups.
    const recipientIds = await UserModel.getAnnouncementRecipientIds(adminId(req), campus);
    await NotificationModel.createForUsers({ userIds: recipientIds, announcement });
    const notification = { type: 'announcement', announcement };
    recipientIds.forEach((userId) => io.to(`user:${userId}`).emit('announcement:notification', notification));
    return res.status(201).json({ success: true, message: 'Announcement posted.', announcement });
  } catch (error) {
    console.error('Create announcement error:', error);
    return res.status(500).json({ success: false, message: 'Unable to post announcement' });
  }
};

export const updateAnnouncement = async (req, res) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    const category = ['tournament', 'match', 'notice'].includes(req.body.category) ? req.body.category : 'notice';
    const eventAt = req.body.event_at || null;
    const campus = typeof req.body.campus === 'string' && req.body.campus.trim() ? req.body.campus.trim().slice(0, 100) : 'all';
    const attachments = cleanAttachments(req.body.attachments || []);
    const isPinned = req.body.is_pinned === true;
    if (!title || title.length > 120 || !message || message.length > 2000) return res.status(400).json({ success: false, message: 'Provide a title (up to 120 characters) and message (up to 2,000 characters).' });
    if (eventAt && Number.isNaN(new Date(eventAt).getTime())) return res.status(400).json({ success: false, message: 'Event date is invalid.' });
    if (!attachments) return res.status(400).json({ success: false, message: 'Provide up to 8 valid http(s) event attachments.' });

    const announcement = await AnnouncementModel.update({ id: req.params.id, title, message, category, eventAt, isPinned, campus, attachments });
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
    await audit(req, 'update_announcement', 'announcement', announcement.id, { title, category, event_at: eventAt, is_pinned: isPinned });
    getIO().to('campus:all').to(`campus:${campus}`).emit('announcement:updated', announcement);
    return res.json({ success: true, message: 'Announcement updated.', announcement });
  } catch (error) {
    console.error('Update announcement error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update announcement' });
  }
};

export const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await AnnouncementModel.remove(req.params.id);
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
    await audit(req, 'delete_announcement', 'announcement', announcement.id, {});
    getIO().to('campus:all').to(`campus:${announcement.campus}`).emit('announcement:deleted', { id: announcement.id });
    return res.json({ success: true, message: 'Announcement removed.' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    return res.status(500).json({ success: false, message: 'Unable to remove announcement' });
  }
};

/**
 * POST /api/admin/lock-teams
 * Admin route: sets global "tournament_started" to true
 */
export const lockTeams = async (req, res) => {
  try {
    await TeamModel.setTournamentLocked(true);
    await audit(req, 'lock_teams', 'tournament', null, { locked: true });

    return res.json({
      success: true,
      message: 'Tournament started. All teams are now locked from creation and editing.',
      tournament_started: true
    });
  } catch (error) {
    console.error('Lock teams error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error locking teams'
    });
  }
};

/**
 * POST /api/admin/unlock-teams
 * Admin route: resets global "tournament_started" to false
 */
export const unlockTeams = async (req, res) => {
  try {
    await TeamModel.setTournamentLocked(false);
    await audit(req, 'unlock_teams', 'tournament', null, { locked: false });

    return res.json({
      success: true,
      message: 'Tournament unlocked. Players may create and edit teams.',
      tournament_started: false
    });
  } catch (error) {
    console.error('Unlock teams error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error unlocking teams'
    });
  }
};

/**
 * GET /api/admin/tournament-status
 * Get admin status of the tournament
 */
export const getAdminTournamentStatus = async (req, res) => {
  try {
    const isLocked = await TeamModel.isTournamentLocked();
    return res.json({
      success: true,
      tournament_started: isLocked
    });
  } catch (error) {
    console.error('Get admin tournament status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * POST /api/admin/matches
 * Admin route: create a match fixture
 */
export const createMatch = async (req, res) => {
  try {
    const { name, sport, team_a_id, team_b_id, match_date, status = 'upcoming' } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Match title/name is required'
      });
    }
    if (!sport || !sport.trim() || sport.trim().length > 60) {
      return res.status(400).json({ success: false, message: 'Choose a sport for this fixture' });
    }
    if (!team_a_id || !team_b_id || team_a_id === team_b_id) {
      return res.status(400).json({ success: false, message: 'Choose two different participating teams' });
    }
    const [teamA, teamB] = await Promise.all([TeamModel.findById(team_a_id), TeamModel.findById(team_b_id)]);
    if (!teamA || !teamB || teamA.sport !== sport.trim() || teamB.sport !== sport.trim()) {
      return res.status(400).json({ success: false, message: 'Both teams must be registered for this sport' });
    }

    const validStatuses = ['upcoming', 'live', 'completed'];
    if (status && !validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'upcoming', 'live', or 'completed'"
      });
    }

    const match = await MatchModel.createMatch({
      name: name.trim(),
      sport: sport.trim(),
      team_a_id,
      team_b_id,
      match_date,
      status: status.toLowerCase()
    });
    await audit(req, 'create_fixture', 'match', match.id, { name: match.name, sport: match.sport, team_a_id, team_b_id, status: match.status });

    return res.status(201).json({
      success: true,
      message: 'Match fixture created successfully',
      match
    });
  } catch (error) {
    console.error('Create match error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error creating match'
    });
  }
};

/**
 * GET /api/admin/matches
 * List all matches
 */
export const getMatches = async (req, res) => {
  try {
    const matches = await MatchModel.getAllMatches();
    return res.json({
      success: true,
      matches
    });
  } catch (error) {
    console.error('Get matches error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error fetching matches'
    });
  }
};

/**
 * PUT /api/admin/matches/:id/status
 * Update match status ('upcoming', 'live', 'completed')
 */
export const updateMatchStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Match status is required'
      });
    }

    const validStatuses = ['upcoming', 'live', 'completed'];
    const normalizedStatus = status.toLowerCase().trim();
    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'upcoming', 'live', or 'completed'"
      });
    }

    const updatedMatch = await MatchModel.updateMatchStatus(id, normalizedStatus);
    if (!updatedMatch) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }
     await audit(req, 'update_match_status', 'match', id, { status: normalizedStatus });

    try {
      getIO().emit('match:status', { match_id: id, status: normalizedStatus });
    } catch (socketErr) {
      console.warn('Socket emit failed (non-fatal):', socketErr.message);
    }

    return res.json({
      success: true,
      message: `Match status updated to '${normalizedStatus}'`,
      match: updatedMatch
    });
  } catch (error) {
    console.error('Update match status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error updating match status'
    });
  }
};

/**
 * POST /api/admin/scores
 * Add or update a team's score for a match (UPSERT)
 */
export const saveScore = async (req, res) => {
  try {
    const { match_id, team_id, points } = req.body;
    const updatedBy = adminId(req);

    if (!match_id) {
      return res.status(400).json({
        success: false,
        message: 'Match ID is required'
      });
    }

    if (!team_id) {
      return res.status(400).json({
        success: false,
        message: 'Team ID is required'
      });
    }

    if (points === undefined || points === null || isNaN(points)) {
      return res.status(400).json({
        success: false,
        message: 'Points must be a valid number'
      });
    }
    const [match, team] = await Promise.all([MatchModel.getMatchById(match_id), TeamModel.findById(team_id)]);
    if (!match || !team) return res.status(404).json({ success: false, message: 'Match or team not found' });
    if (match.sport !== team.sport) {
      return res.status(400).json({ success: false, message: `Only ${match.sport} teams can be scored in this fixture` });
    }
    if (match.team_a_id && match.team_b_id && ![match.team_a_id, match.team_b_id].includes(team_id)) {
      return res.status(400).json({ success: false, message: 'Only a participating team can receive a score in this fixture' });
    }

    const score = await MatchModel.upsertScore({
      match_id,
      team_id,
      points: parseInt(points, 10),
      updated_by: updatedBy
    });

    // Real-time broadcast — emit fresh leaderboard to all clients
    try {
      const io = getIO();
      const leaderboard = await MatchModel.getLeaderboard(team.sport);
      io.emit('leaderboard:update', { sport: team.sport, leaderboard });

      // Public broadcast — anyone watching the Matches page (live view / search) sees the new score instantly
      io.emit('match:score', {
        match_id,
        team_id,
        team_name: team.name,
        points: parseInt(points, 10),
        sport: team.sport,
        updated_at: score.updated_at
      });

      // Targeted notification: find the team's owner and notify only them
      if (team.owner_user_id) {
        io.to(`user:${team.owner_user_id}`).emit('score:update', {
          team_name: team.name,
          points: parseInt(points, 10),
          match_id,
          updated_at: score.updated_at
        });
      }
    } catch (socketErr) {
      console.warn('Socket emit failed (non-fatal):', socketErr.message);
    }
    await audit(req, 'upsert_score', 'score', score.id, { match_id, team_id, points: parseInt(points, 10) });

    return res.status(200).json({
      success: true,
      message: 'Live score recorded successfully',
      score
    });
  } catch (error) {
    console.error('Save score error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error updating score'
    });
  }
};

/**
 * GET /api/admin/scores
 * List all scores for review
 */
export const getScores = async (req, res) => {
  try {
    const scores = await MatchModel.getAllScores();
    return res.json({
      success: true,
      scores
    });
  } catch (error) {
    console.error('Get scores error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error retrieving scores'
    });
  }
};

/**
 * GET /api/admin/teams
 * List all teams for admin selection dropdowns
 */
export const getTeams = async (req, res) => {
  try {
    const teams = await MatchModel.getAllTeams();
    return res.json({
      success: true,
      teams
    });
  } catch (error) {
    console.error('Get teams error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error fetching teams'
    });
  }
};

/** Admin-only participant list, including contact data and sport role profiles. */
export const getPlayers = async (_req, res) => {
  try {
    const allUsers = await UserModel.getAdminExportUsers();
    // Attach sport profiles so admin can see roles without extra requests
    const playersWithProfiles = await PlayerSportProfileModel.getAllPlayersWithProfiles();
    const profileMap = {};
    for (const p of playersWithProfiles) profileMap[p.id] = p.sport_profiles || {};
    const players = allUsers.map(u => ({
      ...u,
      sport_profiles: profileMap[u.id] || {}
    }));
    return res.json({ success: true, players });
  } catch (error) {
    console.error('Get players error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load registered players' });
  }
};

/** GET /api/admin/players/by-role — filter players by sport + role/position */
export const getPlayersByRole = async (req, res) => {
  try {
    const sport = typeof req.query.sport === 'string' ? req.query.sport.trim() : '';
    if (!sport) return res.status(400).json({ success: false, message: 'Sport is required.' });
    const players = await PlayerSportProfileModel.searchByRole({
      sport,
      role:          typeof req.query.role === 'string' ? req.query.role.trim() : '',
      position:      typeof req.query.position === 'string' ? req.query.position.trim() : '',
      bowlingStyle:  typeof req.query.bowling_style === 'string' ? req.query.bowling_style.trim() : '',
      bathand:       typeof req.query.batting_hand === 'string' ? req.query.batting_hand.trim() : ''
    });
    return res.json({ success: true, sport, players });
  } catch (error) {
    console.error('Get players by role error:', error);
    return res.status(500).json({ success: false, message: 'Unable to filter players by role' });
  }
};

/** POST /api/admin/player-stats — add/update an individual player's match statistic */
export const savePlayerStat = async (req, res) => {
  try {
    const { match_id, team_id, player_id, stat_type, value } = req.body;
    if (!match_id || !team_id || !player_id || !stat_type || value === undefined || !Number.isInteger(Number(value)) || Number(value) < 0) {
      return res.status(400).json({ success: false, message: 'Match, team, player, stat type, and a non-negative whole value are required' });
    }
    const [match, team] = await Promise.all([MatchModel.getMatchById(match_id), TeamModel.findById(team_id)]);
    if (!match || !team || ![match.team_a_id, match.team_b_id].includes(team_id)) return res.status(400).json({ success: false, message: 'Choose a participating team in the selected fixture' });
    if (!team.members.some(member => member.member_user_id === player_id)) return res.status(400).json({ success: false, message: 'That player is not in the selected team roster' });
    const stat = await PlayerStatModel.upsert({ matchId: match_id, teamId: team_id, playerId: player_id, statType: stat_type.trim().slice(0, 60), value: Number(value), recordedBy: req.user.id || req.user.userId });
    await audit(req, 'upsert_player_stat', 'player_stat', stat.id, { match_id, team_id, player_id, stat_type: stat.stat_type, value: Number(value) });
    return res.json({ success: true, message: 'Player statistic saved', stat });
  } catch (error) {
    console.error('Save player stat error:', error);
    return res.status(500).json({ success: false, message: 'Unable to save player statistic' });
  }
};

/** PUT /api/admin/registration-deadlines — set opening/closing window for one sport */
export const saveRegistrationDeadline = async (req, res) => {
  try {
    const sport = typeof req.body.sport === 'string' ? req.body.sport.trim() : '';
    const opensAt = req.body.opens_at || null;
    const closesAt = req.body.closes_at || null;
    if (!sport || sport.length > 60) return res.status(400).json({ success: false, message: 'A sport is required' });
    if (opensAt && Number.isNaN(new Date(opensAt).getTime())) return res.status(400).json({ success: false, message: 'Opening time is invalid' });
    if (closesAt && Number.isNaN(new Date(closesAt).getTime())) return res.status(400).json({ success: false, message: 'Closing time is invalid' });
    if (opensAt && closesAt && new Date(opensAt) >= new Date(closesAt)) return res.status(400).json({ success: false, message: 'Closing time must be after opening time' });
    const deadline = await RegistrationModel.saveDeadline({ sport, opensAt, closesAt });
    await audit(req, 'set_registration_deadline', 'registration_deadline', null, deadline);
    return res.json({ success: true, deadline });
  } catch (error) {
    console.error('Save registration deadline error:', error);
    return res.status(500).json({ success: false, message: 'Unable to save registration deadline' });
  }
};

export const getRegistrationDeadlines = async (_req, res) => {
  try { return res.json({ success: true, deadlines: await RegistrationModel.getAllDeadlines() }); }
  catch (error) { return res.status(500).json({ success: false, message: 'Unable to load registration deadlines' }); }
};

/** Generate the first round, then subsequent rounds after every current fixture has a decisive completed result. */
export const generateBracketRound = async (req, res) => {
  try {
    const sport = typeof req.body.sport === 'string' ? req.body.sport.trim() : '';
    if (!sport) return res.status(400).json({ success: false, message: 'A sport is required' });
    const existing = await BracketModel.getForSport(sport);
    let entrants;
    let roundNumber;
    if (existing.length === 0) {
      entrants = (await MatchModel.getAllTeams()).filter(team => team.sport === sport).map(team => team.id);
      if (entrants.length < 2 || (entrants.length & (entrants.length - 1)) !== 0) {
        return res.status(400).json({ success: false, message: 'A knockout bracket needs a power-of-two number of registered teams (2, 4, 8, …).' });
      }
      roundNumber = 1;
    } else {
      const currentRound = Math.max(...existing.map(item => item.round_number));
      const currentFixtures = existing.filter(item => item.round_number === currentRound);
      const scores = await MatchModel.getAllScores();
      entrants = currentFixtures.map(fixture => {
        const fixtureScores = scores.filter(score => score.match_id === fixture.match_id);
        const a = fixtureScores.find(score => score.team_id === fixture.team_a_id)?.points;
        const b = fixtureScores.find(score => score.team_id === fixture.team_b_id)?.points;
        if (fixture.status !== 'completed' || a === undefined || b === undefined || a === b) return null;
        return a > b ? fixture.team_a_id : fixture.team_b_id;
      });
      if (entrants.some(team => !team)) return res.status(400).json({ success: false, message: 'Complete every fixture in the latest round with a decisive score before generating the next round.' });
      if (entrants.length < 2) return res.status(400).json({ success: false, message: 'The bracket already has a champion.' });
      roundNumber = currentRound + 1;
    }

    const teams = await MatchModel.getAllTeams();
    const fixtures = [];
    for (let index = 0; index < entrants.length; index += 2) {
      const teamAId = entrants[index]; const teamBId = entrants[index + 1];
      const teamA = teams.find(team => team.id === teamAId); const teamB = teams.find(team => team.id === teamBId);
      const match = await MatchModel.createMatch({ name: `${sport} Knockout — Round ${roundNumber}, Match ${index / 2 + 1}`, sport, team_a_id: teamAId, team_b_id: teamBId, match_date: new Date().toISOString(), status: 'upcoming' });
      fixtures.push(await BracketModel.add({ sport, roundNumber, slotNumber: index / 2 + 1, matchId: match.id, teamAId, teamBId }));
      fixtures[fixtures.length - 1].team_a_name = teamA?.name; fixtures[fixtures.length - 1].team_b_name = teamB?.name;
    }
    await audit(req, 'generate_bracket_round', 'knockout_bracket', null, { sport, round_number: roundNumber, fixture_count: fixtures.length });
    return res.status(201).json({ success: true, message: `Knockout round ${roundNumber} generated`, fixtures });
  } catch (error) {
    console.error('Generate bracket error:', error);
    return res.status(500).json({ success: false, message: 'Unable to generate bracket round' });
  }
};

export const getBracket = async (req, res) => {
  try {
    const sport = typeof req.query.sport === 'string' ? req.query.sport.trim() : '';
    if (!sport) return res.status(400).json({ success: false, message: 'Sport is required' });
    return res.json({ success: true, fixtures: await BracketModel.getForSport(sport) });
  } catch (error) { return res.status(500).json({ success: false, message: 'Unable to load bracket' }); }
};

export const getAuditLog = async (req, res) => {
  try { return res.json({ success: true, entries: await AuditLogModel.getRecent(Math.min(Number(req.query.limit) || 100, 250)) }); }
  catch (error) { return res.status(500).json({ success: false, message: 'Unable to load audit log' }); }
};
