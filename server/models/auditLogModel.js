import { query } from '../config/db.js';

export const AuditLogModel = {
  async record({ adminId, action, entityType, entityId = null, details = {} }) {
    const { rows } = await query(`INSERT INTO admin_audit_log (admin_user_id, action, entity_type, entity_id, details)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, admin_user_id, action, entity_type, entity_id, details, created_at;`, [adminId, action, entityType, entityId, JSON.stringify(details)]);
    return rows[0];
  },
  async getRecent(limit = 100) {
    const { rows } = await query(`SELECT l.id, l.action, l.entity_type, l.entity_id, l.details, l.created_at, u.name AS admin_name
      FROM admin_audit_log l JOIN users u ON u.id = l.admin_user_id ORDER BY l.created_at DESC LIMIT $1;`, [limit]);
    return rows;
  },
  async getRecentByTournament(tournamentId, limit = 100) {
    // Filter by tournament_id stored in the details JSONB field
    const { rows } = await query(`SELECT l.id, l.action, l.entity_type, l.entity_id, l.details, l.created_at, u.name AS admin_name
      FROM admin_audit_log l JOIN users u ON u.id = l.admin_user_id
      WHERE l.details->>'tournament_id' = $1
      ORDER BY l.created_at DESC LIMIT $2;`, [tournamentId, limit]);
    return rows;
  }
};
