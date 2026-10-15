import { query, DEFAULT_TOURNAMENT_ID } from '../config/db.js';

export const TournamentModel = {
  /**
   * Create a new tournament and grant creator 'owner' admin status in the same flow.
   */
  async create({ name, description = null, campus = 'Main Campus', sports = [], status = 'draft', registration_opens_at = null, registration_closes_at = null, created_by, verified = false }) {
    const text = `
      INSERT INTO tournaments (name, description, campus, sports, status, locked, registration_opens_at, registration_closes_at, created_by, verified)
      VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, $8, $9)
      RETURNING id, name, description, campus, sports, status, locked, registration_opens_at, registration_closes_at, created_by, verified, created_at;
    `;
    const params = [
      name.trim(),
      description ? description.trim() : null,
      (campus || 'Main Campus').trim(),
      Array.isArray(sports) ? sports : [],
      status || 'draft',
      registration_opens_at || null,
      registration_closes_at || null,
      created_by,
      Boolean(verified)
    ];

    const { rows } = await query(text, params);
    const tournament = rows[0];

    // Automatically make creator the owner
    await query(`
      INSERT INTO tournament_admins (tournament_id, user_id, role, granted_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tournament_id, user_id) DO NOTHING;
    `, [tournament.id, created_by, 'owner', created_by]);

    return tournament;
  },

  /**
   * Find tournament by ID
   */
  async findById(id) {
    if (!id) return null;
    const text = `
      SELECT t.*, u.name as creator_name, u.college_id as creator_college_id, u.email as creator_email,
        (SELECT COUNT(*)::integer FROM tournament_admins WHERE tournament_id = t.id) as admin_count,
        (SELECT COUNT(*)::integer FROM tournament_teams WHERE tournament_id = t.id AND status != 'removed') as team_count
      FROM tournaments t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = $1
      LIMIT 1;
    `;
    const { rows } = await query(text, [id]);
    return rows[0] || null;
  },

  /**
   * List all tournaments, prioritized by campus if specified
   */
  async getAll({ campus = null, status = null } = {}) {
    const text = `
      SELECT t.*, u.name as creator_name,
        (SELECT COUNT(*)::integer FROM tournament_admins WHERE tournament_id = t.id) as admin_count,
        (SELECT COUNT(*)::integer FROM tournament_teams WHERE tournament_id = t.id AND status != 'removed') as team_count
      FROM tournaments t
      LEFT JOIN users u ON t.created_by = u.id
      ${status ? 'WHERE t.status = $2' : ''}
      ORDER BY
        ${campus ? `CASE WHEN t.campus = $1 THEN 0 ELSE 1 END,` : ''}
        t.created_at DESC;
    `;
    const params = [];
    if (campus) params.push(campus);
    if (status) params.push(status);
    const { rows } = await query(text, params);
    return rows;
  },

  /**
   * Get all tournaments created or administered by a specific user
   */
  async getForUser(userId) {
    const text = `
      SELECT t.*, u.name as creator_name,
        COALESCE(ta.role, CASE WHEN t.created_by = $1 THEN 'owner' ELSE 'admin' END) as my_role,
        (SELECT COUNT(*)::integer FROM tournament_admins WHERE tournament_id = t.id) as admin_count,
        (SELECT COUNT(*)::integer FROM tournament_teams WHERE tournament_id = t.id AND status != 'removed') as team_count
      FROM tournaments t
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN tournament_admins ta ON ta.tournament_id = t.id AND ta.user_id = $1
      WHERE t.created_by = $1
         OR EXISTS (
           SELECT 1 FROM tournament_admins a WHERE a.tournament_id = t.id AND a.user_id = $1
         )
      ORDER BY t.created_at DESC;
    `;
    const { rows } = await query(text, [userId]);
    return rows;
  },

  /**
   * Count active tournaments created by a user (status != 'completed')
   */
  async countActiveByUser(userId) {
    const text = `
      SELECT COUNT(*)::integer as count
      FROM tournaments
      WHERE created_by = $1 AND status != 'completed';
    `;
    const { rows } = await query(text, [userId]);
    return rows[0] ? parseInt(rows[0].count, 10) : 0;
  },

  /**
   * Update tournament basic details
   */
  async update(id, { name, description, campus, sports, status, registration_opens_at, registration_closes_at }) {
    const text = `
      UPDATE tournaments
      SET name = $1, description = $2, campus = $3, sports = $4, status = $5,
          registration_opens_at = $6, registration_closes_at = $7
      WHERE id = $8
      RETURNING id, name, description, campus, sports, status, locked, registration_opens_at, registration_closes_at, created_by, verified, created_at;
    `;
    const params = [
      name.trim(),
      description ? description.trim() : null,
      campus.trim(),
      Array.isArray(sports) ? sports : [],
      status,
      registration_opens_at || null,
      registration_closes_at || null,
      id
    ];
    const { rows } = await query(text, params);
    return rows[0] || null;
  },

  /**
   * Set tournament lock status (true/false)
   */
  async setLocked(id, locked) {
    const text = `
      UPDATE tournaments
      SET locked = $1
      WHERE id = $2
      RETURNING id, name, locked, status;
    `;
    const { rows } = await query(text, [Boolean(locked), id]);
    return rows[0] || null;
  },

  /**
   * Set verified badge on tournament (super admin only)
   */
  async setVerified(id, verified) {
    const text = `
      UPDATE tournaments
      SET verified = $1
      WHERE id = $2
      RETURNING id, name, verified;
    `;
    const { rows } = await query(text, [Boolean(verified), id]);
    return rows[0] || null;
  },

  /**
   * Delete tournament
   */
  async delete(id) {
    const text = 'DELETE FROM tournaments WHERE id = $1 RETURNING id, name;';
    const { rows } = await query(text, [id]);
    return rows[0] || null;
  },

  // --------------------------------------------------------------------------
  // TOURNAMENT ADMINS
  // --------------------------------------------------------------------------

  async getAdmin(tournamentId, userId) {
    const text = `
      SELECT ta.*, u.name, u.email, u.college_id, u.role as global_role
      FROM tournament_admins ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.tournament_id = $1 AND ta.user_id = $2
      LIMIT 1;
    `;
    const { rows } = await query(text, [tournamentId, userId]);
    return rows[0] || null;
  },

  async getAllAdmins(tournamentId) {
    const text = `
      SELECT ta.id, ta.tournament_id, ta.user_id, ta.role, ta.granted_by, ta.created_at,
        u.name, u.email, u.college_id, u.department, u.campus,
        granter.name as granted_by_name
      FROM tournament_admins ta
      JOIN users u ON ta.user_id = u.id
      LEFT JOIN users granter ON ta.granted_by = granter.id
      WHERE ta.tournament_id = $1
      ORDER BY CASE WHEN ta.role = 'owner' THEN 0 ELSE 1 END, ta.created_at ASC;
    `;
    const { rows } = await query(text, [tournamentId]);
    return rows;
  },

  async addAdmin({ tournamentId, userId, role = 'admin', grantedBy = null }) {
    const text = `
      INSERT INTO tournament_admins (tournament_id, user_id, role, granted_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tournament_id, user_id) DO UPDATE SET role = EXCLUDED.role
      RETURNING id, tournament_id, user_id, role, granted_by, created_at;
    `;
    const { rows } = await query(text, [tournamentId, userId, role, grantedBy]);
    return rows[0];
  },

  async removeAdmin(tournamentId, userId) {
    const text = `
      DELETE FROM tournament_admins
      WHERE tournament_id = $1 AND user_id = $2
      RETURNING id, tournament_id, user_id, role;
    `;
    const { rows } = await query(text, [tournamentId, userId]);
    return rows[0] || null;
  },

  // --------------------------------------------------------------------------
  // TOURNAMENT TEAMS & ROSTER ELIGIBILITY
  // --------------------------------------------------------------------------

  async enterTeam({ tournamentId, teamId, status = 'pending' }) {
    const text = `
      INSERT INTO tournament_teams (tournament_id, team_id, status)
      VALUES ($1, $2, $3)
      ON CONFLICT (tournament_id, team_id) DO UPDATE SET status = EXCLUDED.status
      RETURNING id, tournament_id, team_id, status, created_at;
    `;
    const { rows } = await query(text, [tournamentId, teamId, status]);
    return rows[0];
  },

  async getTeamEntry(tournamentId, teamId) {
    const text = `
      SELECT tt.*, t.name as team_name, t.sport, t.owner_user_id
      FROM tournament_teams tt
      JOIN teams t ON tt.team_id = t.id
      WHERE tt.tournament_id = $1 AND tt.team_id = $2
      LIMIT 1;
    `;
    const { rows } = await query(text, [tournamentId, teamId]);
    return rows[0] || null;
  },

  async updateTeamStatus(tournamentId, teamId, status) {
    const text = `
      UPDATE tournament_teams
      SET status = $1
      WHERE tournament_id = $2 AND team_id = $3
      RETURNING id, tournament_id, team_id, status;
    `;
    const { rows } = await query(text, [status, tournamentId, teamId]);
    return rows[0] || null;
  },

  async getEnteredTeams(tournamentId, status = null) {
    const text = `
      SELECT tt.id as entry_id, tt.tournament_id, tt.team_id, tt.status, tt.created_at as entered_at,
        t.name as team_name, t.sport, t.campus, t.owner_user_id,
        u.name as owner_name, u.college_id as owner_college_id, u.email as owner_email
      FROM tournament_teams tt
      JOIN teams t ON tt.team_id = t.id
      LEFT JOIN users u ON t.owner_user_id = u.id
      WHERE tt.tournament_id = $1
        ${status ? 'AND tt.status = $2' : ''}
      ORDER BY t.sport ASC, t.name ASC;
    `;
    const params = status ? [tournamentId, status] : [tournamentId];
    const { rows } = await query(text, params);

    // Attach team roster members
    return Promise.all(rows.map(async (entry) => {
      const { rows: members } = await query(`
        SELECT tm.*, u.college_id, u.email, u.department, u.year, u.campus
        FROM team_members tm
        LEFT JOIN users u ON tm.member_user_id = u.id
        WHERE tm.team_id = $1
        ORDER BY tm.created_at ASC;
      `, [entry.team_id]);
      return { ...entry, members: members || [] };
    }));
  },

  /**
   * Check if a player is eligible to be promoted to tournament admin:
   * Target user must be on the roster (team_members.member_user_id) or
   * be the owner (teams.owner_user_id) of a team entered in this tournament.
   */
  async isUserEligibleForAdmin(tournamentId, userId) {
    if (!tournamentId || !userId) return false;

    // Check if user owns an entered team
    const ownerCheck = await query(`
      SELECT 1 FROM tournament_teams tt
      JOIN teams t ON tt.team_id = t.id
      WHERE tt.tournament_id = $1 AND tt.status != 'removed' AND t.owner_user_id = $2
      LIMIT 1;
    `, [tournamentId, userId]);
    if (ownerCheck.rows.length > 0) return true;

    // Check if user is on the roster of an entered team
    const memberCheck = await query(`
      SELECT 1 FROM tournament_teams tt
      JOIN team_members tm ON tt.team_id = tm.team_id
      WHERE tt.tournament_id = $1 AND tt.status != 'removed' AND tm.member_user_id = $2
      LIMIT 1;
    `, [tournamentId, userId]);
    return memberCheck.rows.length > 0;
  },

  /**
   * List all eligible players from entered teams who are not yet admins of this tournament.
   */
  async getEligibleAdmins(tournamentId) {
    const text = `
      WITH entered_users AS (
        -- Team owners
        SELECT t.owner_user_id as user_id, t.name as team_name, 'Captain / Owner' as team_role
        FROM tournament_teams tt
        JOIN teams t ON tt.team_id = t.id
        WHERE tt.tournament_id = $1 AND tt.status != 'removed'
        UNION
        -- Roster members
        SELECT tm.member_user_id as user_id, t.name as team_name, tm.position as team_role
        FROM tournament_teams tt
        JOIN team_members tm ON tt.team_id = tm.team_id
        JOIN teams t ON tt.team_id = t.id
        WHERE tt.tournament_id = $1 AND tt.status != 'removed' AND tm.member_user_id IS NOT NULL
      )
      SELECT DISTINCT eu.user_id, eu.team_name, eu.team_role,
        u.name, u.college_id, u.email, u.department, u.campus
      FROM entered_users eu
      JOIN users u ON eu.user_id = u.id
      WHERE NOT EXISTS (
        SELECT 1 FROM tournament_admins ta
        WHERE ta.tournament_id = $1 AND ta.user_id = eu.user_id
      )
      ORDER BY u.name ASC;
    `;
    const { rows } = await query(text, [tournamentId]);
    return rows;
  },

  /**
   * Get all tournaments where any of the user's teams are invited or participating.
   * Returns tournament details + team info + user's role on that team (captain / player)
   */
  async getTournamentsForUserTeams(userId) {
    const text = `
      SELECT DISTINCT ON (tt.tournament_id, tt.team_id)
        t.id as tournament_id, t.name as tournament_name, t.description, t.campus as tournament_campus,
        t.sports, t.status as tournament_status, t.locked, t.verified,
        t.registration_opens_at, t.registration_closes_at, t.created_at as tournament_created_at,
        creator.name as creator_name,
        tt.id as entry_id, tt.team_id, tt.status as entry_status, tt.created_at as entry_date,
        tm.name as team_name, tm.sport as team_sport, tm.owner_user_id,
        CASE WHEN tm.owner_user_id = $1 THEN true ELSE false END as is_team_owner
      FROM tournament_teams tt
      JOIN tournaments t ON tt.tournament_id = t.id
      JOIN teams tm ON tt.team_id = tm.id
      LEFT JOIN users creator ON t.created_by = creator.id
      WHERE tt.status != 'removed'
        AND (
          tm.owner_user_id = $1
          OR EXISTS (
            SELECT 1 FROM team_members mem
            WHERE mem.team_id = tm.id AND mem.member_user_id = $1
          )
        )
      ORDER BY tt.tournament_id, tt.team_id, tt.created_at DESC;
    `;
    const { rows } = await query(text, [userId]);
    return rows;
  },

  /**
   * Invite multiple teams to a tournament
   */
  async inviteTeams({ tournamentId, teamIds }) {
    const results = [];
    for (const teamId of teamIds) {
      const text = `
        INSERT INTO tournament_teams (tournament_id, team_id, status)
        VALUES ($1, $2, $3)
        ON CONFLICT (tournament_id, team_id) DO UPDATE SET status = EXCLUDED.status
        RETURNING id, tournament_id, team_id, status;
      `;
      const { rows } = await query(text, [tournamentId, teamId, 'invited']);
      if (rows[0]) results.push(rows[0]);
    }
    return results;
  },

  /**
   * Respond to tournament team invite (accept -> approved, decline -> removed)
   */
  async respondInvite({ tournamentId, teamId, action }) {
    const newStatus = action === 'accept' ? 'approved' : 'removed';
    const text = `
      UPDATE tournament_teams
      SET status = $1
      WHERE tournament_id = $2 AND team_id = $3
      RETURNING id, tournament_id, team_id, status;
    `;
    const { rows } = await query(text, [newStatus, tournamentId, teamId]);
    return rows[0] || null;
  }
};
