const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const { getVendorPOs, getVendorPOById, createVendorPO, updateVendorPO, deleteVendorPO, generateVendorPOPDF, uploadVendorPOAttachments, deleteVendorPOAttachment } = require('../controllers/vendorpo.controller');
router.use(authenticate);
router.get('/',        getVendorPOs);
router.get('/:id/pdf', generateVendorPOPDF);
router.get('/:id',     getVendorPOById);
router.post('/',       createVendorPO);
router.put('/:id',     updateVendorPO);
router.delete('/:id',  authorize('ADMIN','IT_STAFF'), deleteVendorPO);

// Attachments
router.post('/:id/attachments', upload.array('photos', 10), uploadVendorPOAttachments);
router.delete('/:id/attachments/:attachId', deleteVendorPOAttachment);
module.exports = router;
