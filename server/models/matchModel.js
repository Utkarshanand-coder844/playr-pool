import { query } from '../config/db.js';

export const MatchModel = {
  /**
   * Create a new match fixture
   * @param {object} param0 
   * @returns {Promise<object>}
   */
  async createMatch({ name, sport, team_a_id, team_b_id, match_date, status = 'upcoming' }) {
    const text = `
      INSERT INTO matches (name, match_date, status, sport, team_a_id, team_b_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, match_date, status, sport, team_a_id, team_b_id, created_at;
    `;
    const params = [
      name.trim(),
      match_date ? new Date(match_date).toISOString() : new Date().toISOString(),
      status.toLowerCase(), sport, team_a_id, team_b_id
    ];
    const { rows } = await query(text, params);
    return rows[0];
  },

  /**
   * Retrieve all matches
   * @returns {Promise<Array>}
   */
  async getAllMatches() {
    const text = `
      SELECT m.id, m.name, m.match_date, m.status, m.sport, m.team_a_id, m.team_b_id, m.created_at,
        ta.name AS team_a_name, tb.name AS team_b_name,
        sa.points AS team_a_score, sb.points AS team_b_score
      FROM matches m
      LEFT JOIN teams ta ON ta.id = m.team_a_id
      LEFT JOIN teams tb ON tb.id = m.team_b_id
      LEFT JOIN scores sa ON sa.match_id = m.id AND sa.team_id = m.team_a_id
      LEFT JOIN scores sb ON sb.match_id = m.id AND sb.team_id = m.team_b_id
      ORDER BY m.match_date ASC;
    `;
    const { rows } = await query(text);
    return rows;
  },

  /**
   * Find match by ID
   * @param {string} id 
   * @returns {Promise<object|null>}
   */
  async getMatchById(id) {
    const text = `SELECT m.id, m.name, m.match_date, m.status, m.sport, m.team_a_id, m.team_b_id, m.created_at,
      ta.name AS team_a_name, tb.name AS team_b_name FROM matches m
      LEFT JOIN teams ta ON ta.id = m.team_a_id LEFT JOIN teams tb ON tb.id = m.team_b_id WHERE m.id = $1 LIMIT 1;`;
    const { rows } = await query(text, [id]);
    return rows[0] || null;
  },

  /**
   * Update match status ('upcoming', 'live', 'completed')
   * @param {string} id 
   * @param {string} status 
   * @returns {Promise<object|null>}
   */
  async updateMatchStatus(id, status) {
    const text = `
      UPDATE matches 
      SET status = $1 
      WHERE id = $2 
      RETURNING id, name, match_date, status, sport, created_at;
    `;
    const { rows } = await query(text, [status.toLowerCase(), id]);
    return rows[0] || null;
  },

  /**
   * Delete match fixture by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async deleteMatch(id) {
    const text = `
      DELETE FROM matches
      WHERE id = $1
      RETURNING id, name, match_date, status, sport, team_a_id, team_b_id;
    `;
    const { rows } = await query(text, [id]);
    return rows[0] || null;
  },

  /**
   * Add or update a team's score for a match (UPSERT on conflict team_id, match_id)
   * @param {object} param0 
   * @returns {Promise<object>}
   */
  async upsertScore({ team_id, match_id, points, updated_by }) {
    const text = `
      INSERT INTO scores (team_id, match_id, points, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (team_id, match_id) 
      DO UPDATE SET 
        points = EXCLUDED.points,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, team_id, match_id, points, updated_by, updated_at;
    `;
    const params = [team_id, match_id, parseInt(points, 10) || 0, updated_by];
    const { rows } = await query(text, params);
    return rows[0];
  },

  /**
   * Retrieve all scores joined with team name, match name, and updated_by username
   * @returns {Promise<Array>}
   */
  async getAllScores() {
    const text = `
      SELECT 
        s.id, 
        s.team_id, 
        s.match_id, 
        s.points, 
        s.updated_by, 
        s.updated_at,
        t.name AS team_name,
        m.name AS match_name,
        m.status AS match_status,
        m.sport,
        u.name AS updated_by_name
      FROM scores s
      LEFT JOIN teams t ON s.team_id = t.id
      LEFT JOIN matches m ON s.match_id = m.id
      LEFT JOIN users u ON s.updated_by = u.id
      ORDER BY s.updated_at DESC;
    `;
    const { rows } = await query(text);
    return rows;
  },

  /**
   * Get all registered teams for selection dropdowns
   * @returns {Promise<Array>}
   */
  async getAllTeams() {
    const text = 'SELECT id, name, sport, owner_user_id, locked, created_at FROM teams ORDER BY sport ASC, name ASC;';
    const { rows } = await query(text);
    return rows;
  },

  /**
   * Get a single team's match-by-match score history, joined with match info.
   * Used by the public team profile page.
   * @param {string} teamId
   * @returns {Promise<Array>}
   */
  async getScoresForTeam(teamId) {
    const text = `
      SELECT
        s.id,
        s.match_id,
        s.points,
        s.updated_at,
        m.name AS match_name,
        m.status AS match_status,
        m.sport,
        m.match_date
      FROM scores s
      LEFT JOIN matches m ON s.match_id = m.id
      WHERE s.team_id = $1
      ORDER BY m.match_date ASC;
    `;
    const { rows } = await query(text, [teamId]);
    return rows;
  },

  /**
   * Calculate public leaderboard: SUM(scores.points) grouped by team_id,
   * joined with team name, sorted descending by total points, with rank included.
   * @returns {Promise<Array>}
   */
  async getLeaderboard(sport = null) {
    const text = `
      SELECT 
        t.id AS team_id,
        t.name AS team_name,
        COUNT(m.id)::INTEGER AS played,
        COUNT(m.id)::INTEGER AS matches_recorded,
        COUNT(*) FILTER (WHERE m.id IS NOT NULL AND COALESCE(s.points, 0) > COALESCE(opponent.points, 0))::INTEGER AS wins,
        COUNT(*) FILTER (WHERE m.id IS NOT NULL AND COALESCE(s.points, 0) = COALESCE(opponent.points, 0))::INTEGER AS draws,
        COUNT(*) FILTER (WHERE m.id IS NOT NULL AND COALESCE(s.points, 0) < COALESCE(opponent.points, 0))::INTEGER AS losses,
        COALESCE(SUM(s.points), 0)::INTEGER AS score_for,
        COALESCE(SUM(opponent.points), 0)::INTEGER AS score_against,
        (COALESCE(SUM(s.points), 0) - COALESCE(SUM(opponent.points), 0))::INTEGER AS score_difference,
        (COUNT(*) FILTER (WHERE m.id IS NOT NULL AND COALESCE(s.points, 0) > COALESCE(opponent.points, 0)) * 3 +
         COUNT(*) FILTER (WHERE m.id IS NOT NULL AND COALESCE(s.points, 0) = COALESCE(opponent.points, 0)))::INTEGER AS total_points
      FROM teams t
      LEFT JOIN matches m ON (m.team_a_id = t.id OR m.team_b_id = t.id) AND m.status = 'completed'
      LEFT JOIN scores s ON s.match_id = m.id AND s.team_id = t.id
      LEFT JOIN scores opponent ON opponent.match_id = m.id AND opponent.team_id = CASE WHEN m.team_a_id = t.id THEN m.team_b_id ELSE m.team_a_id END
      ${sport ? 'WHERE t.sport = $1' : ''}
      GROUP BY t.id, t.name
      ORDER BY total_points DESC, score_difference DESC, score_for DESC, t.name ASC;
    `;
    const { rows } = await query(text, sport ? [sport] : []);

    return rows.map((row, index) => ({
      rank: index + 1,
      team_id: row.team_id,
      team_name: row.team_name,
      total_points: parseInt(row.total_points, 10) || 0,
      matches_recorded: parseInt(row.matches_recorded, 10) || 0,
      played: parseInt(row.played, 10) || 0,
      wins: parseInt(row.wins, 10) || 0,
      draws: parseInt(row.draws, 10) || 0,
      losses: parseInt(row.losses, 10) || 0,
      score_for: parseInt(row.score_for, 10) || 0,
      score_against: parseInt(row.score_against, 10) || 0,
      score_difference: parseInt(row.score_difference, 10) || 0
    }));
  }
};
