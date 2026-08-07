import { Router } from 'express';
import {
  register,
  verifyEmail,
  sendOtp,
  login,
  forgotPassword,
  resetPassword,
  logout,
  getMe,
  seedTestAccounts,
} from '../controllers/authController';
import { authMiddleware, requireAdmin } from '../middleware/authMiddleware';
import { authLimiter, otpLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public auth endpoints with rate limiting
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/send-otp', otpLimiter, sendOtp);
router.post('/verify-email', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected auth endpoints
router.post('/logout', authMiddleware, logout);
router.get('/me', authMiddleware, getMe);

// Admin-only: seed predefined test accounts with payment bypass
router.post('/seed-test-accounts', authMiddleware, requireAdmin, seedTestAccounts);

export default router;

