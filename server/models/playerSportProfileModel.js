import { query } from '../config/db.js';

export const PlayerSportProfileModel = {
  /**
   * Upsert a sport-specific profile for a player.
   * One row per (user_id, sport) — conflicts update in place.
   */
  async upsertProfile({ userId, sport, primary_role, batting_hand, bowling_style, position, playing_style, handedness, preferred_foot, event_category, extra_attributes = {} }) {
    const { rows } = await query(`
      INSERT INTO player_sport_profiles
        (user_id, sport, primary_role, batting_hand, bowling_style, position, playing_style, handedness, preferred_foot, event_category, extra_attributes, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, sport)
      DO UPDATE SET
        primary_role     = EXCLUDED.primary_role,
        batting_hand     = EXCLUDED.batting_hand,
        bowling_style    = EXCLUDED.bowling_style,
        position         = EXCLUDED.position,
        playing_style    = EXCLUDED.playing_style,
        handedness       = EXCLUDED.handedness,
        preferred_foot   = EXCLUDED.preferred_foot,
        event_category   = EXCLUDED.event_category,
        extra_attributes = EXCLUDED.extra_attributes,
        updated_at       = CURRENT_TIMESTAMP
      RETURNING *;
    `, [userId, sport, primary_role || null, batting_hand || null, bowling_style || null,
        position || null, playing_style || null, handedness || null, preferred_foot || null,
        event_category || null, JSON.stringify(extra_attributes)]);
    return rows[0];
  },

  /** Get all sport profiles for a user (keyed by sport for easy lookup). */
  async getForUser(userId) {
    const { rows } = await query(`
      SELECT * FROM player_sport_profiles WHERE user_id = $1 ORDER BY sport ASC;
    `, [userId]);
    return rows;
  },

  /** Get a single sport profile for a user. */
  async getForUserAndSport(userId, sport) {
    const { rows } = await query(`
      SELECT * FROM player_sport_profiles WHERE user_id = $1 AND sport = $2 LIMIT 1;
    `, [userId, sport]);
    return rows[0] || null;
  },

  /**
   * Get all registered players with their sport profile for a given sport.
   * Used by team creation to show roles alongside player names.
   */
  async getPlayersWithProfileForSport(sport) {
    const { rows } = await query(`
      SELECT
        u.id, u.name, u.college_id, u.department, u.year, u.campus,
        psp.primary_role, psp.batting_hand, psp.bowling_style,
        psp.position, psp.playing_style, psp.handedness,
        psp.preferred_foot, psp.event_category
      FROM users u
      LEFT JOIN player_sport_profiles psp ON psp.user_id = u.id AND psp.sport = $1
      WHERE u.role = 'player'
      ORDER BY u.name ASC;
    `, [sport]);
    return rows;
  },

  /**
   * Get all registered players with ALL their sport profiles attached.
   * Used by admin and player list endpoints.
   */
  async getAllPlayersWithProfiles() {
    const usersRes = await query(`
      SELECT u.id, u.name, u.college_id, u.department, u.year, u.campus, u.role
      FROM users u ORDER BY u.name ASC;
    `);
    const users = usersRes.rows;
    if (!users.length) return [];

    const profilesRes = await query(`
      SELECT * FROM player_sport_profiles ORDER BY user_id, sport;
    `);
    const profilesByUser = {};
    for (const p of profilesRes.rows) {
      if (!profilesByUser[p.user_id]) profilesByUser[p.user_id] = {};
      profilesByUser[p.user_id][p.sport] = p;
    }

    try {
      const playerSportsRes = await query(`SELECT user_id, sport FROM player_sports;`);
      for (const ps of (playerSportsRes.rows || [])) {
        if (!profilesByUser[ps.user_id]) profilesByUser[ps.user_id] = {};
        if (!profilesByUser[ps.user_id][ps.sport]) profilesByUser[ps.user_id][ps.sport] = { sport: ps.sport };
      }
    } catch { /* optional table fallback */ }

    try {
      const sportAdminsRes = await query(`SELECT admin_user_id, sport FROM sport_admins;`);
      for (const sa of (sportAdminsRes.rows || [])) {
        if (!profilesByUser[sa.admin_user_id]) profilesByUser[sa.admin_user_id] = {};
        if (!profilesByUser[sa.admin_user_id][sa.sport]) profilesByUser[sa.admin_user_id][sa.sport] = { sport: sa.sport };
      }
    } catch { /* optional table fallback */ }

    return users.map(u => ({ ...u, sport_profiles: profilesByUser[u.id] || {} }));
  },

  /**
   * Search/filter players by sport role, position, or bowling style.
   * Used by admin "Filter by Role" feature.
   */
  async searchByRole({ sport, role, position, bowlingStyle, bathand }) {
    const text = `
      SELECT
        u.id, u.name, u.college_id, u.department, u.year, u.campus, u.email, u.phone,
        psp.sport, psp.primary_role, psp.batting_hand, psp.bowling_style,
        psp.position, psp.playing_style, psp.handedness, psp.preferred_foot, psp.event_category
      FROM player_sport_profiles psp
      JOIN users u ON u.id = psp.user_id
      WHERE psp.sport = $1
        AND ($2::text IS NULL OR psp.primary_role ILIKE $2)
        AND ($3::text IS NULL OR psp.position ILIKE $3)
        AND ($4::text IS NULL OR psp.bowling_style ILIKE $4)
        AND ($5::text IS NULL OR psp.batting_hand ILIKE $5)
      ORDER BY u.name ASC;
    `;
    const params = [
      sport,
      role ? `%${role}%` : null,
      position ? `%${position}%` : null,
      bowlingStyle ? `%${bowlingStyle}%` : null,
      bathand ? `%${bathand}%` : null
    ];
    const { rows } = await query(text, params);
    return rows;
  },

  /**
   * Full-text search across all role fields.
   * Used by the discover/search feature.
   */
  async searchByText(term) {
    const like = `%${term}%`;
    const { rows } = await query(`
      SELECT
        u.id, u.name, u.college_id, u.department, u.campus,
        psp.sport, psp.primary_role, psp.position, psp.bowling_style,
        psp.batting_hand, psp.playing_style, psp.handedness, psp.event_category
      FROM player_sport_profiles psp
      JOIN users u ON u.id = psp.user_id
      WHERE
        psp.primary_role ILIKE $1 OR
        psp.position ILIKE $1 OR
        psp.bowling_style ILIKE $1 OR
        psp.batting_hand ILIKE $1 OR
        psp.playing_style ILIKE $1 OR
        psp.handedness ILIKE $1 OR
        psp.event_category ILIKE $1 OR
        psp.preferred_foot ILIKE $1
      ORDER BY u.name ASC
      LIMIT 50;
    `, [like]);
    return rows;
  }
};
