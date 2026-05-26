const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const {
  getPOs, getPOSummary, getPOById,
  createPO, updatePO, updatePOStatus, deletePO,
  generatePOPDF, uploadPOAttachments, deletePOAttachment,
} = require('../controllers/po.controller');

router.use(authenticate);

// Summary + list (all authenticated users)
router.get('/summary', getPOSummary);
router.get('/',        getPOs);

// PDF — before /:id to avoid wildcard conflict
router.get('/:id/pdf', generatePOPDF);

// Single PR
router.get('/:id',  getPOById);

// Create (all roles)
router.post('/', createPO);

// Update (creator or ADMIN)
router.put('/:id', updatePO);

// Approve / Reject / Cancel — ADMIN only
router.patch('/:id/status', authorize('ADMIN'), updatePOStatus);

// Delete
router.delete('/:id', deletePO);

// Attachments
router.post('/:id/attachments', upload.array('photos', 10), uploadPOAttachments);
router.delete('/:id/attachments/:attachId', deletePOAttachment);

module.exports = router;
