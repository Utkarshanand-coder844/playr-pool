import { query, DEFAULT_TOURNAMENT_ID } from '../config/db.js';

export const BracketModel = {
  async getForSport(sport, tournamentId = null) {
    if (tournamentId) {
      const { rows } = await query(`
        SELECT b.id, b.sport, b.round_number, b.slot_number, b.match_id, b.team_a_id, b.team_b_id,
          b.tournament_id, b.created_at, a.name AS team_a_name, c.name AS team_b_name, m.status, m.match_date
        FROM knockout_brackets b
        LEFT JOIN teams a ON a.id = b.team_a_id
        LEFT JOIN teams c ON c.id = b.team_b_id
        LEFT JOIN matches m ON m.id = b.match_id
        WHERE b.sport = $1 AND b.tournament_id = $2
        ORDER BY b.round_number, b.slot_number;
      `, [sport, tournamentId]);
      return rows;
    }
    const { rows } = await query(`
      SELECT b.id, b.sport, b.round_number, b.slot_number, b.match_id, b.team_a_id, b.team_b_id,
        b.tournament_id, b.created_at, a.name AS team_a_name, c.name AS team_b_name, m.status, m.match_date
      FROM knockout_brackets b
      LEFT JOIN teams a ON a.id = b.team_a_id
      LEFT JOIN teams c ON c.id = b.team_b_id
      LEFT JOIN matches m ON m.id = b.match_id
      WHERE b.sport = $1
      ORDER BY b.round_number, b.slot_number;
    `, [sport]);
    return rows;
  },

  async add({ sport, roundNumber, slotNumber, matchId, teamAId, teamBId, tournamentId = null }) {
    const { rows } = await query(`
      INSERT INTO knockout_brackets (sport, round_number, slot_number, match_id, team_a_id, team_b_id, tournament_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, sport, round_number, slot_number, match_id, team_a_id, team_b_id, tournament_id, created_at;
    `, [sport, roundNumber, slotNumber, matchId, teamAId, teamBId, tournamentId || DEFAULT_TOURNAMENT_ID]);
    return rows[0];
  }
};
