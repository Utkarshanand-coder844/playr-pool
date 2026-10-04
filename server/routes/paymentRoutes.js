import express from 'express';
import { PaymentController } from '../controllers/paymentController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { actionRateLimit } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

// Order initiation — protected, rate-limited per user
router.post('/order', authenticateToken, actionRateLimit({ windowMs: 60 * 1000, max: 10 }), PaymentController.createOrder);

// Order client verification — protected, rate-limited
router.post('/verify', authenticateToken, actionRateLimit({ windowMs: 60 * 1000, max: 10 }), PaymentController.verifyPayment);

// Webhook endpoint from payment provider — verified by HMAC signature
router.post('/webhook', PaymentController.handleWebhook);

// User's payment history
router.get('/mine', authenticateToken, PaymentController.getMyPayments);

export default router;
