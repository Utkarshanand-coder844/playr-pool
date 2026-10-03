import { query } from '../config/db.js';

export const TeamModel = {
  async transferOwnership({ teamId, currentOwnerId, newOwnerId }) {
    const { rows } = await query(`UPDATE teams SET owner_user_id = $1 WHERE id = $2 AND owner_user_id = $3
      RETURNING id, name, sport, owner_user_id, campus;`, [newOwnerId, teamId, currentOwnerId]);
    return rows[0] || null;
  },
  async addRegisteredMember({ teamId, user }) {
    const { rows } = await query(`INSERT INTO team_members (team_id, member_name, position, member_user_id)
      VALUES ($1, $2, 'Player', $3)
      RETURNING id, team_id, member_name, position, member_user_id, created_at;`, [teamId, user.name, user.id]);
    return rows[0];
  },
  /**
   * Check if tournament is globally locked
   * @returns {Promise<boolean>}
   */
  async isTournamentLocked() {
    const text = 'SELECT value FROM tournament_settings WHERE key = $1 LIMIT 1;';
    const { rows } = await query(text, ['tournament_started']);
    return rows[0] ? Boolean(rows[0].value) : false;
  },

  /**
   * Set tournament global lock flag
   * @param {boolean} locked 
   */
  async setTournamentLocked(locked) {
    const text = `
      INSERT INTO tournament_settings (key, value, updated_at)
      VALUES ('tournament_started', $1, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE 
      SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      RETURNING key, value;
    `;
    const { rows } = await query(text, [Boolean(locked)]);
    return rows[0] ? Boolean(rows[0].value) : Boolean(locked);
  },

  /**
   * Find team owned by a user, including its roster members
   * @param {string} ownerUserId 
   * @returns {Promise<object|null>}
   */
  async findByOwnerId(ownerUserId, sport = null) {
    const teamText = sport
      ? `SELECT t.*, u.name as owner_name, u.college_id as owner_college_id, u.campus as owner_campus
         FROM teams t LEFT JOIN users u ON t.owner_user_id = u.id
         WHERE t.owner_user_id = $1 AND t.sport = $2 LIMIT 1;`
      : `SELECT t.*, u.name as owner_name, u.college_id as owner_college_id, u.campus as owner_campus
         FROM teams t LEFT JOIN users u ON t.owner_user_id = u.id
         WHERE t.owner_user_id = $1 ORDER BY t.created_at ASC LIMIT 1;`;
    const { rows: teamRows } = await query(teamText, sport ? [ownerUserId, sport] : [ownerUserId]);
    const team = teamRows[0];
    if (!team) return null;

    const membersText = `SELECT tm.*, u.college_id, u.department, u.year, u.campus
      FROM team_members tm LEFT JOIN users u ON tm.member_user_id = u.id
      WHERE tm.team_id = $1 ORDER BY tm.created_at ASC;`;
    const { rows: memberRows } = await query(membersText, [team.id]);

    return {
      ...team,
      members: memberRows || []
    };
  },

  async findAllByOwnerId(ownerUserId) {
    const { rows } = await query(`
      SELECT t.*, u.name as owner_name, u.college_id as owner_college_id, u.campus as owner_campus
      FROM teams t LEFT JOIN users u ON t.owner_user_id = u.id
      WHERE t.owner_user_id = $1
      ORDER BY t.sport ASC, t.created_at ASC;
    `, [ownerUserId]);
    return Promise.all(rows.map(async (team) => {
      const { rows: members } = await query(`SELECT tm.*, u.college_id, u.department, u.year, u.campus FROM team_members tm LEFT JOIN users u ON tm.member_user_id = u.id WHERE tm.team_id = $1 ORDER BY tm.created_at ASC;`, [team.id]);
      return { ...team, members };
    }));
  },

  /**
   * Find every team a user owns or has been added to as a registered roster
   * member. This makes the same team visible on every participating player's
   * "My Team" screen, not only on the captain's screen.
   */
  async findAllForUserId(userId) {
    const { rows } = await query(`
      SELECT t.*, u.name as owner_name, u.college_id as owner_college_id, u.campus as owner_campus
      FROM teams t
      LEFT JOIN users u ON t.owner_user_id = u.id
      WHERE t.owner_user_id = $1
        OR EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = t.id AND tm.member_user_id = $1
        )
      ORDER BY CASE WHEN t.owner_user_id = $1 THEN 0 ELSE 1 END, t.sport ASC, t.created_at ASC;
    `, [userId]);

    return Promise.all(rows.map(async (team) => {
      const { rows: members } = await query(`SELECT tm.*, u.college_id, u.department, u.year, u.campus FROM team_members tm LEFT JOIN users u ON tm.member_user_id = u.id WHERE tm.team_id = $1 ORDER BY tm.created_at ASC;`, [team.id]);
      return { ...team, members };
    }));
  },

  /**
   * Find team by team UUID, including its roster members
   * @param {string} id 
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const teamText = `
      SELECT t.*, u.name as owner_name, u.college_id as owner_college_id, u.campus as owner_campus
      FROM teams t LEFT JOIN users u ON t.owner_user_id = u.id
      WHERE t.id = $1 LIMIT 1;
    `;
    const { rows: teamRows } = await query(teamText, [id]);
    const team = teamRows[0];
    if (!team) return null;

    const membersText = `SELECT tm.*, u.college_id, u.department, u.year, u.campus
      FROM team_members tm LEFT JOIN users u ON tm.member_user_id = u.id
      WHERE tm.team_id = $1 ORDER BY tm.created_at ASC;`;
    const { rows: memberRows } = await query(membersText, [team.id]);

    return {
      ...team,
      members: memberRows || []
    };
  },

  /**
   * Create team with optional roster members
   * @param {object} param0 
   * @returns {Promise<object>}
   */
  async createTeam({ name, sport, campus, owner_user_id, members = [] }) {
    const teamText = `
      INSERT INTO teams (name, owner_user_id, sport, campus, locked)
      VALUES ($1, $2, $3, $4, FALSE)
      RETURNING id, name, owner_user_id, sport, campus, locked, created_at;
    `;
    const { rows: teamRows } = await query(teamText, [name.trim(), owner_user_id, sport, campus || 'Main Campus']);
    const newTeam = teamRows[0];

    const insertedMembers = [];
    if (Array.isArray(members) && members.length > 0) {
      for (const m of members) {
        const memberName = typeof m === 'object' ? m.member_name || m.name : null;
        const position = typeof m === 'object' ? m.position || 'Player' : 'Player';
        const memberUserId = typeof m === 'object' ? m.member_user_id || m.user_id : null;
        if (memberName && memberName.trim() && memberUserId) {
          const memberText = `
            INSERT INTO team_members (team_id, member_name, position, member_user_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, team_id, member_name, position, member_user_id, created_at;
          `;
          const { rows: memberRows } = await query(memberText, [newTeam.id, memberName.trim(), position.trim(), memberUserId]);
          if (memberRows[0]) insertedMembers.push(memberRows[0]);
        }
      }
    }

    return {
      ...newTeam,
      members: insertedMembers
    };
  },

  /**
   * Update team name, sport, and replace/update roster members
   * @param {string} id 
   * @param {object} param1 
   * @returns {Promise<object>}
   */
  async updateTeam(id, { name, sport = null, members = null, locked = undefined }) {
    // 1. Update team basic info
    const updateText = `
      UPDATE teams 
      SET name = COALESCE($1, name), sport = COALESCE($2, sport), locked = COALESCE($3, locked)
      WHERE id = $4
      RETURNING id, name, sport, owner_user_id, campus, locked, created_at;
    `;
    const { rows: teamRows } = await query(updateText, [name ? name.trim() : null, sport ? sport.trim() : null, locked, id]);
    const updatedTeam = teamRows[0];

    // 2. Update members if provided
    if (Array.isArray(members)) {
      // Clear previous members
      await query('DELETE FROM team_members WHERE team_id = $1;', [id]);

      const updatedMembers = [];
      for (const m of members) {
        const memberName = typeof m === 'object' ? m.member_name || m.name : null;
        const position = typeof m === 'object' ? m.position || 'Player' : 'Player';
        const memberUserId = typeof m === 'object' ? m.member_user_id || m.user_id : null;
        if (memberName && memberName.trim() && memberUserId) {
          const memberText = `
            INSERT INTO team_members (team_id, member_name, position, member_user_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, team_id, member_name, position, member_user_id, created_at;
          `;
          const { rows: memberRows } = await query(memberText, [id, memberName.trim(), position.trim(), memberUserId]);
          if (memberRows[0]) updatedMembers.push(memberRows[0]);
        }
      }
      return {
        ...updatedTeam,
        members: updatedMembers
      };
    }

    // Otherwise fetch existing members
    const membersText = `SELECT tm.*, u.college_id, u.department, u.year, u.campus
      FROM team_members tm LEFT JOIN users u ON tm.member_user_id = u.id
      WHERE tm.team_id = $1 ORDER BY tm.created_at ASC;`;
    const { rows: existingMembers } = await query(membersText, [id]);

    return {
      ...updatedTeam,
      members: existingMembers || []
    };
  },

  /**
   * Delete team by id (foreign keys CASCADE cleanup for members, invites, requests, votes)
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async deleteTeam(id) {
    const { rows } = await query('DELETE FROM teams WHERE id = $1 RETURNING *;', [id]);
    return rows[0] || null;
  }
};
