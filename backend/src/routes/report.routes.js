const router = require('express').Router();
const { getReport, exportExcel, exportPDF } = require('../controllers/report.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate, authorize('ADMIN', 'IT_STAFF'));

router.get('/', getReport);
router.get('/export/excel', exportExcel);
router.get('/export/pdf', exportPDF);

module.exports = router;
