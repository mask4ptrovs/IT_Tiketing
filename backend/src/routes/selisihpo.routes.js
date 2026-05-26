const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const { getSelisihPOs, getSelisihPOById, createSelisihPO, updateSelisihPO, deleteSelisihPO, generateSelisihPOPDF, uploadSelisihPOAttachments, deleteSelisihPOAttachment } = require('../controllers/selisihpo.controller');
router.use(authenticate);
router.get('/',        getSelisihPOs);
router.get('/:id/pdf', generateSelisihPOPDF);
router.get('/:id',     getSelisihPOById);
router.post('/',       createSelisihPO);
router.put('/:id',     updateSelisihPO);
router.delete('/:id',  authorize('ADMIN','IT_STAFF'), deleteSelisihPO);

// Attachments
router.post('/:id/attachments', upload.array('photos', 10), uploadSelisihPOAttachments);
router.delete('/:id/attachments/:attachId', deleteSelisihPOAttachment);
module.exports = router;
