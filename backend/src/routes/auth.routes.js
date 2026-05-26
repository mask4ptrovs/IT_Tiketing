const router = require('express').Router();
const { body } = require('express-validator');
const { login, refreshToken, logout, getMe, changePassword } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate.middleware');

router.post('/login', authRateLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
], validate, login);

router.post('/refresh', [
  body('refreshToken').notEmpty().withMessage('Refresh token required'),
], validate, refreshToken);

router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

router.put('/change-password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
], validate, changePassword);

module.exports = router;
