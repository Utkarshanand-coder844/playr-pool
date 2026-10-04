import crypto from 'crypto';
import { PaymentModel } from '../models/paymentModel.js';
import { UserModel } from '../models/userModel.js';

/**
 * Constant-time string comparison to prevent timing side-channel attacks
 */
const safeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export const PaymentController = {
  /**
   * POST /api/payments/order
   * Create an authorized payment order
   */
  async createOrder(req, res) {
    try {
      const userId = req.user.id || req.user.userId;
      const { amount, currency = 'INR', purpose = 'tournament_entry' } = req.body;

      // 1. Strict validation of amount
      const parsedAmount = Number(amount);
      if (!Number.isInteger(parsedAmount) || parsedAmount < 100 || parsedAmount > 5000000) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment amount. Amount must be an integer between 100 and 5,000,000 (subunits).'
        });
      }

      // 2. Validate purpose
      const allowedPurposes = ['tournament_entry', 'team_registration', 'fan_pass', 'merchandise'];
      const cleanPurpose = allowedPurposes.includes(purpose) ? purpose : 'tournament_entry';

      // 3. Generate unique order ID
      const orderId = `order_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

      // 4. Save order to database
      const payment = await PaymentModel.create({
        userId,
        orderId,
        amount: parsedAmount,
        currency: currency.toUpperCase() === 'USD' ? 'USD' : 'INR',
        purpose: cleanPurpose,
        metadata: {
          client_ip: req.ip,
          created_at: new Date().toISOString()
        }
      });

      return res.status(201).json({
        success: true,
        message: 'Payment order created.',
        order: {
          order_id: payment.order_id,
          amount: payment.amount,
          currency: payment.currency,
          purpose: payment.purpose,
          key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_public_key'
        }
      });
    } catch (err) {
      console.error('Create payment order error:', err);
      return res.status(500).json({
        success: false,
        message: 'Unable to initiate payment order.'
      });
    }
  },

  /**
   * POST /api/payments/verify
   * Verify signature after client-side payment completion
   */
  async verifyPayment(req, res) {
    try {
      const { order_id, payment_id, signature } = req.body;

      if (!order_id || !payment_id || !signature) {
        return res.status(400).json({
          success: false,
          message: 'Missing required verification fields (order_id, payment_id, signature).'
        });
      }

      const payment = await PaymentModel.findByOrderId(order_id);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Order not found.'
        });
      }

      if (payment.status === 'paid') {
        return res.json({
          success: true,
          message: 'Payment was already verified.',
          payment
        });
      }

      // Verify HMAC SHA256 signature
      const secret = process.env.RAZORPAY_KEY_SECRET || process.env.PAYMENT_SECRET || 'dev_payment_secret_change_in_prod';
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${order_id}|${payment_id}`)
        .digest('hex');

      const isValid = safeCompare(signature, expectedSignature);

      // In development mode only, allow simulated test confirmations
      const isDev = process.env.NODE_ENV !== 'production';
      const isSimulatedTest = isDev && signature === 'test_signature_valid';

      if (!isValid && !isSimulatedTest) {
        await PaymentModel.markFailed({ orderId: order_id, reason: 'Invalid signature verification' });
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed: Signature mismatch.'
        });
      }

      const updated = await PaymentModel.markSuccess({ orderId: order_id, paymentId: payment_id });
      return res.json({
        success: true,
        message: 'Payment verified successfully.',
        payment: updated
      });
    } catch (err) {
      console.error('Verify payment error:', err);
      return res.status(500).json({
        success: false,
        message: 'Unable to verify payment.'
      });
    }
  },

  /**
   * POST /api/payments/webhook
   * Webhook endpoint for payment gateways (Razorpay, Stripe, etc.)
   * Enforces HMAC signature verification and idempotency protection
   */
  async handleWebhook(req, res) {
    try {
      const signatureHeader = req.headers['x-razorpay-signature'] || req.headers['x-webhook-signature'];
      const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.warn('⚠️ Webhook received but PAYMENT_WEBHOOK_SECRET is not configured.');
        return res.status(500).json({ success: false, message: 'Webhook processing unconfigured.' });
      }

      if (!signatureHeader) {
        return res.status(401).json({ success: false, message: 'Missing signature header.' });
      }

      // Verify cryptographic signature against raw payload
      const rawPayload = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      if (!safeCompare(signatureHeader, expectedSignature)) {
        return res.status(403).json({ success: false, message: 'Invalid webhook signature.' });
      }

      const event = req.body;
      const eventId = event?.id || event?.event_id || req.headers['x-razorpay-event-id'] || `evt_${Date.now()}`;
      const eventType = event?.event || event?.type || 'unknown';

      // Idempotency: skip if already processed
      const alreadyProcessed = await PaymentModel.isWebhookProcessed(eventId);
      if (alreadyProcessed) {
        return res.status(200).json({ received: true, note: 'Event already processed' });
      }

      // Process event types
      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const orderId = event.payload?.payment?.entity?.order_id || event.data?.object?.order_id;
        const paymentId = event.payload?.payment?.entity?.id || event.data?.object?.id;
        if (orderId) {
          await PaymentModel.markSuccess({ orderId, paymentId });
        }
      } else if (eventType === 'payment.failed') {
        const orderId = event.payload?.payment?.entity?.order_id || event.data?.object?.order_id;
        const reason = event.payload?.payment?.entity?.error_description || 'Payment failed';
        if (orderId) {
          await PaymentModel.markFailed({ orderId, reason });
        }
      }

      // Record idempotency
      await PaymentModel.recordWebhookProcessed(eventId, eventType);

      return res.status(200).json({ received: true, event_id: eventId });
    } catch (err) {
      console.error('Webhook processing error:', err);
      // Always return 500 for genuine internal errors so gateway will retry, but without leaking details
      return res.status(500).json({ success: false, message: 'Internal error processing webhook' });
    }
  },

  /**
   * GET /api/payments/mine
   * Fetch current user's transaction history
   */
  async getMyPayments(req, res) {
    try {
      const userId = req.user.id || req.user.userId;
      const history = await PaymentModel.getForUser(userId);
      return res.json({ success: true, payments: history });
    } catch (err) {
      console.error('Get my payments error:', err);
      return res.status(500).json({ success: false, message: 'Unable to retrieve payments' });
    }
  }
};
