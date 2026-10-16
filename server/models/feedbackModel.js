import { query, withTransaction } from '../config/db.js';

export const FeedbackModel = {
  /**
   * Fetch all feedback posts with author details, reply count, and upvote status.
   */
  async getAll({ userId = null, clientIp = null, limit = 50, offset = 0 } = {}) {
    const sql = `
      SELECT 
        fp.id,
        fp.user_id,
        fp.content,
        fp.upvotes,
        fp.created_at,
        u.name AS author_name,
        u.campus AS author_campus,
        u.department AS author_department,
        u.role AS author_role,
        u.profile_photo AS author_photo,
        (SELECT COUNT(*)::int FROM feedback_replies fr WHERE fr.post_id = fp.id) AS reply_count,
        EXISTS (
          SELECT 1 FROM feedback_upvotes fu 
          WHERE fu.post_id = fp.id AND (
            ($1::uuid IS NOT NULL AND fu.user_id = $1::uuid) OR
            ($1::uuid IS NULL AND $2::varchar IS NOT NULL AND fu.client_ip = $2::varchar)
          )
        ) AS has_upvoted
      FROM feedback_posts fp
      JOIN users u ON u.id = fp.user_id
      ORDER BY fp.created_at DESC
      LIMIT $3 OFFSET $4;
    `;

    const { rows } = await query(sql, [
      userId,
      clientIp,
      Math.min(Number(limit) || 50, 100),
      Number(offset) || 0
    ]);
    return rows;
  },

  /**
   * Fetch all replies for a specific post.
   */
  async getReplies(postId) {
    const sql = `
      SELECT 
        fr.id,
        fr.post_id,
        fr.user_id,
        fr.author_name,
        fr.content,
        fr.created_at,
        u.profile_photo AS author_photo,
        u.role AS author_role,
        u.campus AS author_campus
      FROM feedback_replies fr
      LEFT JOIN users u ON u.id = fr.user_id
      WHERE fr.post_id = $1
      ORDER BY fr.created_at ASC;
    `;

    const { rows } = await query(sql, [postId]);
    return rows;
  },

  /**
   * Create a new post (Registered users only).
   */
  async createPost({ userId, content }) {
    const sql = `
      INSERT INTO feedback_posts (user_id, content)
      VALUES ($1, $2)
      RETURNING *;
    `;

    const { rows } = await query(sql, [userId, content.trim()]);
    
    // Fetch with author details attached
    const detailSql = `
      SELECT 
        fp.id,
        fp.user_id,
        fp.content,
        fp.upvotes,
        fp.created_at,
        u.name AS author_name,
        u.campus AS author_campus,
        u.department AS author_department,
        u.role AS author_role,
        u.profile_photo AS author_photo,
        0 AS reply_count,
        false AS has_upvoted
      FROM feedback_posts fp
      JOIN users u ON u.id = fp.user_id
      WHERE fp.id = $1;
    `;
    const detailRes = await query(detailSql, [rows[0].id]);
    return detailRes.rows[0];
  },

  /**
   * Add a reply to a post (Registered or Guest).
   */
  async createReply({ postId, userId = null, authorName, content }) {
    const sql = `
      INSERT INTO feedback_replies (post_id, user_id, author_name, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const { rows } = await query(sql, [postId, userId || null, authorName.trim(), content.trim()]);

    const detailSql = `
      SELECT 
        fr.id,
        fr.post_id,
        fr.user_id,
        fr.author_name,
        fr.content,
        fr.created_at,
        u.profile_photo AS author_photo,
        u.role AS author_role,
        u.campus AS author_campus
      FROM feedback_replies fr
      LEFT JOIN users u ON u.id = fr.user_id
      WHERE fr.id = $1;
    `;
    const detailRes = await query(detailSql, [rows[0].id]);
    return detailRes.rows[0];
  },

  /**
   * Toggle upvote on a post.
   */
  async toggleUpvote({ postId, userId = null, clientIp = null }) {
    return await withTransaction(async (client) => {
      let checkSql;
      let checkParams;
      if (userId) {
        checkSql = `SELECT id FROM feedback_upvotes WHERE post_id = $1 AND user_id = $2 LIMIT 1;`;
        checkParams = [postId, userId];
      } else {
        checkSql = `SELECT id FROM feedback_upvotes WHERE post_id = $1 AND client_ip = $2 AND user_id IS NULL LIMIT 1;`;
        checkParams = [postId, clientIp];
      }

      const { rows: existing } = await client.query(checkSql, checkParams);

      if (existing.length > 0) {
        await client.query(`DELETE FROM feedback_upvotes WHERE id = $1;`, [existing[0].id]);
        const { rows: updated } = await client.query(
          `UPDATE feedback_posts SET upvotes = GREATEST(0, upvotes - 1) WHERE id = $1 RETURNING upvotes;`,
          [postId]
        );
        return {
          upvoted: false,
          upvotes: updated[0]?.upvotes ?? 0
        };
      } else {
        await client.query(
          `INSERT INTO feedback_upvotes (post_id, user_id, client_ip) VALUES ($1, $2, $3);`,
          [postId, userId || null, userId ? null : clientIp]
        );
        const { rows: updated } = await client.query(
          `UPDATE feedback_posts SET upvotes = upvotes + 1 WHERE id = $1 RETURNING upvotes;`,
          [postId]
        );
        return {
          upvoted: true,
          upvotes: updated[0]?.upvotes ?? 1
        };
      }
    });
  },

  /**
   * Delete a post.
   */
  async deletePost({ postId, userId, isAdmin = false }) {
    if (isAdmin) {
      const { rows } = await query(`DELETE FROM feedback_posts WHERE id = $1 RETURNING id;`, [postId]);
      return rows[0] || null;
    }
    const { rows } = await query(
      `DELETE FROM feedback_posts WHERE id = $1 AND user_id = $2 RETURNING id;`,
      [postId, userId]
    );
    return rows[0] || null;
  },

  /**
   * Delete a reply.
   */
  async deleteReply({ replyId, userId, isAdmin = false }) {
    if (isAdmin) {
      const { rows } = await query(`DELETE FROM feedback_replies WHERE id = $1 RETURNING id;`, [replyId]);
      return rows[0] || null;
    }
    const { rows } = await query(
      `DELETE FROM feedback_replies WHERE id = $1 AND user_id = $2 RETURNING id;`,
      [replyId, userId]
    );
    return rows[0] || null;
  }
};
