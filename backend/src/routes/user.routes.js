const router = require('express').Router();
const { body } = require('express-validator');
const { getUsers, getUserById, createUser, updateUser, deleteUser, permanentDeleteUser, updateProfile, resetUserPassword } = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

router.use(authenticate);

router.get('/', authorize('ADMIN', 'IT_STAFF'), getUsers);
router.post('/', authorize('ADMIN'), [
  body('employeeId').notEmpty().withMessage('Employee ID required'),
  body('name').notEmpty().withMessage('Name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
], validate, createUser);

router.put('/profile', updateProfile);
router.get('/:id', getUserById);
router.put('/:id/reset-password', authorize('ADMIN'), [
  body('newPassword').isLength({ min: 8 }).withMessage('Password minimal 8 karakter'),
], validate, resetUserPassword);
router.put('/:id', authorize('ADMIN'), updateUser);
router.delete('/:id', authorize('ADMIN'), deleteUser);
router.delete('/:id/permanent', authorize('ADMIN'), permanentDeleteUser);

module.exports = router;
