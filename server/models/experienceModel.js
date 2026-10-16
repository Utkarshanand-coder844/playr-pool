import { query, withTransaction } from '../config/db.js';

export const ExperienceModel = {
  /**
   * Fetch all experiences with optional filtering, search, sorting and current user upvote status.
   */
  async getAll({
    sport = '',
    campus = '',
    search = '',
    type = '',
    sort = 'recent',
    limit = 50,
    offset = 0,
    userId = null,
    clientIp = null
  } = {}) {
    const conditions = [];
    const params = [];

    if (sport && sport.toLowerCase() !== 'all') {
      params.push(sport);
      conditions.push(`pe.sport = $${params.length}`);
    }

    if (campus && campus.toLowerCase() !== 'all') {
      params.push(campus);
      conditions.push(`pe.campus = $${params.length}`);
    }

    if (type && type.toLowerCase() !== 'all') {
      params.push(type);
      conditions.push(`pe.experience_type = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      conditions.push(`(
        pe.title ILIKE $${pIdx} OR 
        pe.experience ILIKE $${pIdx} OR 
        pe.recommendations ILIKE $${pIdx} OR 
        pe.author_name ILIKE $${pIdx} OR
        pe.sport ILIKE $${pIdx}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'pe.created_at DESC';
    if (sort === 'top') {
      orderBy = 'pe.upvotes DESC, pe.created_at DESC';
    } else if (sort === 'rating') {
      orderBy = 'pe.rating DESC, pe.created_at DESC';
    } else if (sort === 'oldest') {
      orderBy = 'pe.created_at ASC';
    }

    params.push(userId);
    const userParamIdx = params.length;
    params.push(clientIp);
    const ipParamIdx = params.length;
    params.push(Math.min(Number(limit) || 50, 100));
    const limitParamIdx = params.length;
    params.push(Number(offset) || 0);
    const offsetParamIdx = params.length;

    const sql = `
      SELECT 
        pe.*,
        u.profile_photo AS author_photo,
        u.department AS author_department,
        u.year AS author_year,
        EXISTS (
          SELECT 1 FROM player_experience_upvotes peu 
          WHERE peu.experience_id = pe.id AND (
            ($${userParamIdx}::uuid IS NOT NULL AND peu.user_id = $${userParamIdx}::uuid) OR
            ($${userParamIdx}::uuid IS NULL AND $${ipParamIdx}::varchar IS NOT NULL AND peu.client_ip = $${ipParamIdx}::varchar)
          )
        ) AS has_upvoted
      FROM player_experiences pe
      LEFT JOIN users u ON u.id = pe.user_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
    `;

    const { rows } = await query(sql, params);
    return rows;
  },

  /**
   * Get aggregate stats for user experiences
   */
  async getStats() {
    const statsSql = `
      SELECT 
        COUNT(*)::int AS total_experiences,
        COALESCE(ROUND(AVG(rating)::numeric, 1), 5.0) AS avg_rating,
        COALESCE(SUM(upvotes)::int, 0) AS total_upvotes,
        COUNT(CASE WHEN is_verified_player THEN 1 END)::int AS verified_count,
        COUNT(DISTINCT sport)::int AS sports_count
      FROM player_experiences;
    `;

    const ratingsSql = `
      SELECT rating, COUNT(*)::int AS count
      FROM player_experiences
      GROUP BY rating
      ORDER BY rating DESC;
    `;

    const sportsSql = `
      SELECT sport, COUNT(*)::int AS count
      FROM player_experiences
      GROUP BY sport
      ORDER BY count DESC
      LIMIT 10;
    `;

    const [statsRes, ratingsRes, sportsRes] = await Promise.all([
      query(statsSql),
      query(ratingsSql),
      query(sportsSql)
    ]);

    return {
      overview: statsRes.rows[0] || {
        total_experiences: 0,
        avg_rating: 5.0,
        total_upvotes: 0,
        verified_count: 0,
        sports_count: 0
      },
      ratingBreakdown: ratingsRes.rows,
      topSports: sportsRes.rows
    };
  },

  /**
   * Create a new player experience & recommendations post
   */
  async create({
    userId = null,
    authorName,
    authorRole = 'Player',
    campus = 'Main Campus',
    sport = 'General',
    rating = 5,
    experienceType = 'Tournament Experience',
    title = '',
    experience,
    recommendations = '',
    isVerifiedPlayer = false
  }) {
    const sql = `
      INSERT INTO player_experiences (
        user_id, author_name, author_role, campus, sport,
        rating, experience_type, title, experience, recommendations,
        is_verified_player
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    const params = [
      userId || null,
      authorName.trim(),
      (authorRole || 'Player').trim(),
      (campus || 'Main Campus').trim(),
      (sport || 'General').trim(),
      Math.max(1, Math.min(5, parseInt(rating, 10) || 5)),
      (experienceType || 'Tournament Experience').trim(),
      (title || '').trim(),
      experience.trim(),
      (recommendations || '').trim(),
      Boolean(isVerifiedPlayer)
    ];

    const { rows } = await query(sql, params);
    return rows[0];
  },

  /**
   * Toggle upvote on an experience post
   */
  async toggleUpvote({ experienceId, userId = null, clientIp = null }) {
    return await withTransaction(async (client) => {
      // Check existing upvote
      let checkSql;
      let checkParams;
      if (userId) {
        checkSql = `SELECT id FROM player_experience_upvotes WHERE experience_id = $1 AND user_id = $2 LIMIT 1;`;
        checkParams = [experienceId, userId];
      } else {
        checkSql = `SELECT id FROM player_experience_upvotes WHERE experience_id = $1 AND client_ip = $2 AND user_id IS NULL LIMIT 1;`;
        checkParams = [experienceId, clientIp];
      }

      const { rows: existing } = await client.query(checkSql, checkParams);

      if (existing.length > 0) {
        // Remove upvote
        await client.query(`DELETE FROM player_experience_upvotes WHERE id = $1;`, [existing[0].id]);
        const { rows: updated } = await client.query(
          `UPDATE player_experiences SET upvotes = GREATEST(0, upvotes - 1), updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING upvotes;`,
          [experienceId]
        );
        return {
          upvoted: false,
          upvotes: updated[0]?.upvotes ?? 0
        };
      } else {
        // Add upvote
        await client.query(
          `INSERT INTO player_experience_upvotes (experience_id, user_id, client_ip) VALUES ($1, $2, $3);`,
          [experienceId, userId || null, userId ? null : clientIp]
        );
        const { rows: updated } = await client.query(
          `UPDATE player_experiences SET upvotes = upvotes + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING upvotes;`,
          [experienceId]
        );
        return {
          upvoted: true,
          upvotes: updated[0]?.upvotes ?? 1
        };
      }
    });
  },

  /**
   * Delete an experience post (author or admin only)
   */
  async delete({ id, userId, isAdmin = false }) {
    if (isAdmin) {
      const { rows } = await query(`DELETE FROM player_experiences WHERE id = $1 RETURNING id;`, [id]);
      return rows[0] || null;
    }
    const { rows } = await query(
      `DELETE FROM player_experiences WHERE id = $1 AND user_id = $2 RETURNING id;`,
      [id, userId]
    );
    return rows[0] || null;
  }
};
