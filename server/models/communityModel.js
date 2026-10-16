import { query } from '../config/db.js';
import { PlayerSportProfileModel } from './playerSportProfileModel.js';

export const CommunityModel = {
  async setAvailability({ userId, sport, matchId = null, status, note = null }) {
    const sql = matchId ? `INSERT INTO player_availability (user_id, sport, match_id, status, note)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, sport, match_id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = CURRENT_TIMESTAMP RETURNING *;`
      : `INSERT INTO player_availability (user_id, sport, match_id, status, note)
      VALUES ($1, $2, NULL, $3, $4) ON CONFLICT (user_id, sport) WHERE match_id IS NULL DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = CURRENT_TIMESTAMP RETURNING *;`;
    const { rows } = await query(sql, matchId ? [userId, sport, matchId, status, note] : [userId, sport, status, note]);
    return rows[0];
  },

  async availabilityForTeam(teamId, sport, matchId = null) {
    const { rows } = await query(`SELECT tm.member_user_id AS user_id, tm.member_name, tm.position,
      COALESCE(pa.status, 'maybe') AS status, pa.note, pa.updated_at
      FROM team_members tm LEFT JOIN player_availability pa
        ON pa.user_id = tm.member_user_id AND pa.sport = $2 AND pa.match_id IS NOT DISTINCT FROM $3
      WHERE tm.team_id = $1 ORDER BY tm.member_name;`, [teamId, sport, matchId]);
    return rows;
  },

  async createRequest({ teamId, playerId, requestType, message }) {
    const { rows } = await query(`INSERT INTO team_requests (team_id, player_user_id, request_type, message)
      VALUES ($1, $2, $3, $4) RETURNING *;`, [teamId, playerId, requestType, message || null]);
    return rows[0];
  },

  async countRecentRequests({ teamId, playerId }) {
    const { rows } = await query(`SELECT COUNT(*)::int AS count FROM team_requests
      WHERE team_id = $1 AND player_user_id = $2 AND created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours';`, [teamId, playerId]);
    return rows[0].count;
  },

  async getRequests(teamId) {
    const { rows } = await query(`SELECT tr.*, u.name AS player_name, u.college_id, u.campus, u.department, u.year
      FROM team_requests tr JOIN users u ON u.id = tr.player_user_id
      WHERE tr.team_id = $1 ORDER BY CASE WHEN tr.status = 'pending' THEN 0 ELSE 1 END, tr.created_at DESC;`, [teamId]);
    return rows;
  },

  async reviewRequest({ id, teamId, reviewerId, status }) {
    const { rows } = await query(`UPDATE team_requests SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND team_id = $4 AND status = 'pending' RETURNING *;`, [status, reviewerId, id, teamId]);
    return rows[0] || null;
  },

  async removeMember({ teamId, playerId }) {
    const { rows } = await query('DELETE FROM team_members WHERE team_id = $1 AND member_user_id = $2 RETURNING *;', [teamId, playerId]);
    return rows[0] || null;
  },

  async castRemovalVote({ teamId, targetAdminId, voterId }) {
    const { rows } = await query(`INSERT INTO team_admin_removal_votes (team_id, target_admin_id, voter_user_id)
      VALUES ($1, $2, $3) ON CONFLICT (team_id, target_admin_id, voter_user_id) DO NOTHING RETURNING *;`, [teamId, targetAdminId, voterId]);
    return rows[0] || null;
  },

  async hasVoted({ teamId, targetAdminId, voterId }) {
    const { rows } = await query(`SELECT 1 FROM team_admin_removal_votes WHERE team_id = $1 AND target_admin_id = $2 AND voter_user_id = $3;`, [teamId, targetAdminId, voterId]);
    return rows.length > 0;
  },

  async removalVoteSummary(teamId, targetAdminId) {
    const { rows } = await query(`SELECT
      (SELECT COUNT(*)::int FROM team_members WHERE team_id = $1 AND member_user_id <> $2) AS eligible_voters,
      (SELECT COUNT(*)::int FROM team_admin_removal_votes WHERE team_id = $1 AND target_admin_id = $2) AS votes;`, [teamId, targetAdminId]);
    const summary = rows[0];
    return { ...summary, threshold: Math.ceil(Number(summary.eligible_voters) * 0.9) };
  },

  async demoteAdmin(userId) {
    const { rows } = await query("UPDATE users SET role = 'player' WHERE id = $1 AND role = 'admin' RETURNING id, name, role;", [userId]);
    return rows[0] || null;
  },

  async search({ q = '', campus = '', sport = '', type = '' }) {
    const term = `%${q.trim()}%`;
    const campusValue = campus.trim();
    const sportValue = sport.trim();
    const [players, teams, events] = await Promise.all([
      type && type !== 'players' ? [] : query(`SELECT id, name, college_id, department, campus, year FROM users
        WHERE role = 'player' AND ($1 = '%%' OR name ILIKE $1 OR college_id ILIKE $1 OR department ILIKE $1)
          AND ($2 = '' OR campus = $2) ORDER BY CASE WHEN campus = $2 THEN 0 ELSE 1 END, name LIMIT 50;`, [term, campusValue]).then(r => r.rows),
      type && type !== 'teams' ? [] : query(`SELECT t.id, t.name, t.sport, t.campus, u.name AS owner_name, COUNT(tm.id)::int AS member_count
        FROM teams t JOIN users u ON u.id = t.owner_user_id LEFT JOIN team_members tm ON tm.team_id = t.id
        WHERE ($1 = '%%' OR t.name ILIKE $1 OR t.sport ILIKE $1) AND ($2 = '' OR t.campus = $2) AND ($3 = '' OR t.sport = $3)
        GROUP BY t.id, u.name ORDER BY CASE WHEN t.campus = $2 THEN 0 ELSE 1 END, t.name LIMIT 50;`, [term, campusValue, sportValue]).then(r => r.rows),
      type && type !== 'events' ? [] : query(`SELECT id, title, category, event_at, campus FROM announcements
        WHERE ($1 = '%%' OR title ILIKE $1 OR message ILIKE $1) AND ($2 = '' OR campus IN ('all', $2))
        ORDER BY event_at NULLS LAST, created_at DESC LIMIT 50;`, [term, campusValue]).then(r => r.rows)
    ]);

    // Also search player sport profiles (roles, positions, bowling styles, etc.)
    // Merge any role-matched players into the players list and deduplicate by id.
    const mergedPlayers = [...players];
    if ((!type || type === 'players') && q.trim()) {
      try {
        const roleMatches = await PlayerSportProfileModel.searchByText(q.trim());
        for (const rm of roleMatches) {
          const matchLabel = `${rm.sport}: ${[rm.primary_role, rm.position, rm.bowling_style, rm.batting_hand].filter(Boolean).join(', ')}`;
          const existing = mergedPlayers.find(p => p.id === rm.id);
          if (existing) {
            if (!existing.sport_role_match) {
              existing.sport_role_match = matchLabel;
            }
          } else {
            mergedPlayers.push({
              id: rm.id,
              name: rm.name,
              college_id: rm.college_id,
              department: rm.department,
              campus: rm.campus,
              year: null,
              sport_role_match: matchLabel
            });
          }
        }
      } catch (e) {
        // Non-fatal: role search enhancement
      }
    }

    return { players: mergedPlayers, teams, events };
  }
};
