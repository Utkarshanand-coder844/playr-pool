import express from 'express';
import { signup, login, getMe, updateProfile, requestPasswordReset, resetPassword, deleteAccount } from '../controllers/authController.js';
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware.js';
import { validateSignup, validateLogin } from '../middleware/validateMiddleware.js';
import { credentialRateLimit } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

// Public routes
router.post('/signup', validateSignup, signup);
router.post('/login', credentialRateLimit(), validateLogin, login);
router.post('/password-reset/request', credentialRateLimit({ max: 5 }), requestPasswordReset);
router.post('/password-reset/confirm', credentialRateLimit({ max: 5 }), resetPassword);

// Protected routes (JWT required)
router.get('/me', authenticateToken, getMe);
router.put('/profile', authenticateToken, updateProfile);
router.delete('/account', authenticateToken, deleteAccount);


// Admin-only route for testing and verification
router.get('/admin-only', authenticateToken, requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: 'Welcome Admin! You have access to admin-only sports controls.',
    user: req.user
  });
});

export default router;
