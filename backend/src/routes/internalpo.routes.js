const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const { getInternalPOs, getInternalPOById, createInternalPO, updateInternalPO, deleteInternalPO, generateInternalPOPDF, uploadInternalPOAttachments, deleteInternalPOAttachment } = require('../controllers/internalpo.controller');
router.use(authenticate);
router.get('/',        getInternalPOs);
router.get('/:id/pdf', generateInternalPOPDF);
router.get('/:id',     getInternalPOById);
router.post('/',       createInternalPO);
router.put('/:id',     updateInternalPO);
router.delete('/:id',  authorize('ADMIN','IT_STAFF'), deleteInternalPO);

// Attachments
router.post('/:id/attachments', upload.array('photos', 10), uploadInternalPOAttachments);
router.delete('/:id/attachments/:attachId', deleteInternalPOAttachment);
module.exports = router;
