import { query } from '../config/db.js';
import { PlayerSportProfileModel } from './playerSportProfileModel.js';

export const UserModel = {
  /**
   * Event notices go to every registered player and the admin who published
   * the notice. Returning IDs keeps the Socket.IO delivery server-side and
   * prevents anonymous clients from subscribing to these alerts.
   */
  async getAnnouncementRecipientIds(postingAdminId, campus = 'all') {
    const { rows } = await query(
      "SELECT id FROM users WHERE (role = 'player' AND ($2 = 'all' OR campus = $2)) OR id = $1;",
      [postingAdminId, campus]
    );
    return rows.map(({ id }) => id);
  },

  async getRegisteredPlayers() {
    const { rows } = await query(`
      SELECT id, college_id, name, department, campus, year, role
      FROM users
      ORDER BY name ASC;
    `);
    return rows;
  },

  async getRegisteredPlayersWithProfiles() {
    return PlayerSportProfileModel.getAllPlayersWithProfiles();
  },
  async getAdminExportUsers() {
    const { rows } = await query(`SELECT id, college_id, name, department, campus, year, email, phone, role, created_at FROM users ORDER BY name ASC;`);
    return rows;
  },
  /**
   * Find user by college ID
   * @param {string} collegeId 
   * @returns {Promise<object|null>}
   */
  async findByCollegeId(collegeId) {
    const text = 'SELECT * FROM users WHERE LOWER(college_id) = LOWER($1) LIMIT 1;';
    const { rows } = await query(text, [collegeId]);
    return rows[0] || null;
  },

  async findByEmail(email) {
    const { rows } = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;', [email]);
    return rows[0] || null;
  },

  /**
   * Find user by UUID id
   * @param {string} id 
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const text = `
      SELECT id, college_id, name, department, campus, year, email, phone, profile_photo, role, created_at 
      FROM users 
      WHERE id = $1 
      LIMIT 1;
    `;
    const { rows } = await query(text, [id]);
    return rows[0] || null;
  },

  /** Contact details are shared only through an authenticated player-profile route. */
  async findPublicProfileById(id) {
    const { rows } = await query(`SELECT id, college_id, name, department, campus, year, email, phone, profile_photo, role, created_at FROM users WHERE id = $1 LIMIT 1;`, [id]);
    return rows[0] || null;
  },

  /**
   * Create a new user record
   * @param {object} userData 
   * @returns {Promise<object>}
   */
  async create({ college_id, name, department, campus, year, email, phone, password_hash, role = 'player', profile_photo = null }) {
    const text = `
      INSERT INTO users (college_id, name, department, campus, year, email, phone, password_hash, role, profile_photo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, college_id, name, department, campus, year, email, phone, profile_photo, role, created_at;
    `;
    const params = [
      college_id.trim(),
      name.trim(),
      department.trim(),
      (campus || 'Main Campus').trim(),
      year.toString().trim(),
      email.trim().toLowerCase(),
      phone.trim(),
      password_hash,
      role,
      profile_photo
    ];

    const { rows } = await query(text, params);
    return rows[0];
  },

  async savePasswordReset({ userId, tokenHash, expiresAt }) {
    const { rows } = await query(`UPDATE users SET password_reset_token_hash = $1, password_reset_expires = $2 WHERE id = $3 RETURNING id;`, [tokenHash, expiresAt, userId]);
    return rows[0] || null;
  },

  async resetPassword({ tokenHash, passwordHash }) {
    const { rows } = await query(`UPDATE users SET password_hash = $1, password_reset_token_hash = NULL, password_reset_expires = NULL
      WHERE password_reset_token_hash = $2 AND password_reset_expires > CURRENT_TIMESTAMP
      RETURNING id, name, email, role;`, [passwordHash, tokenHash]);
    return rows[0] || null;
  },

  async deleteAccount(id) {
    await query('DELETE FROM admin_audit_log WHERE admin_user_id = $1;', [id]);
    const { rows } = await query('DELETE FROM users WHERE id = $1 RETURNING id;', [id]);
    return rows[0] || null;
  },

  /**
   * Update editable profile fields for a user.
   * College ID and role are intentionally excluded — use admin tools for those.
   */
  async updateProfile(id, { name, department, campus, year, email, phone, profile_photo }) {
    const { rows } = await query(
      `UPDATE users
       SET name = $1, department = $2, campus = $3, year = $4,
           email = $5, phone = $6, profile_photo = $7
       WHERE id = $8
       RETURNING id, college_id, name, department, campus, year, email, phone, profile_photo, role, created_at;`,
      [
        name.trim(),
        department.trim(),
        (campus || 'Main Campus').trim(),
        year.toString().trim(),
        email.trim().toLowerCase(),
        phone.trim(),
        profile_photo || null,
        id
      ]
    );
    return rows[0] || null;
  }
};

