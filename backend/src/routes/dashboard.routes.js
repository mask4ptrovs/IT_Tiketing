const router = require('express').Router();
const { getDashboardStats } = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);
router.get('/', getDashboardStats);

module.exports = router;
