import { query } from '../config/db.js';

export const PaymentModel = {
  async create({ userId, orderId, amount, currency = 'INR', purpose = 'tournament_fee', metadata = {} }) {
    const text = `
      INSERT INTO payments (user_id, order_id, amount, currency, status, purpose, metadata)
      VALUES ($1, $2, $3, $4, 'created', $5, $6)
      RETURNING *;
    `;
    const { rows } = await query(text, [userId, orderId, amount, currency, purpose, JSON.stringify(metadata)]);
    return rows[0] || null;
  },

  async findByOrderId(orderId) {
    const text = `SELECT * FROM payments WHERE order_id = $1 LIMIT 1;`;
    const { rows } = await query(text, [orderId]);
    return rows[0] || null;
  },

  async markSuccess({ orderId, paymentId }) {
    const text = `
      UPDATE payments
      SET status = 'paid', payment_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = $2
      RETURNING *;
    `;
    const { rows } = await query(text, [paymentId, orderId]);
    return rows[0] || null;
  },

  async markFailed({ orderId, reason }) {
    const text = `
      UPDATE payments
      SET status = 'failed', metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{failure_reason}', to_jsonb($1::text)), updated_at = CURRENT_TIMESTAMP
      WHERE order_id = $2
      RETURNING *;
    `;
    const { rows } = await query(text, [reason || 'Payment failed', orderId]);
    return rows[0] || null;
  },

  async getForUser(userId) {
    const text = `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50;`;
    const { rows } = await query(text, [userId]);
    return rows;
  },

  async isWebhookProcessed(eventId) {
    const text = `SELECT 1 FROM processed_webhooks WHERE event_id = $1 LIMIT 1;`;
    const { rows } = await query(text, [eventId]);
    return rows.length > 0;
  },

  async recordWebhookProcessed(eventId, eventType) {
    const text = `
      INSERT INTO processed_webhooks (event_id, event_type)
      VALUES ($1, $2)
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id;
    `;
    const { rows } = await query(text, [eventId, eventType]);
    return rows[0] || null;
  }
};
