const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const { getTandaTerimas, getTandaTerimaById, createTandaTerima, updateTandaTerima, deleteTandaTerima, generateTandaTerimaPDF, uploadTandaTerimaAttachments, deleteTandaTerimaAttachment } = require('../controllers/tandaterima.controller');
router.use(authenticate);
router.get('/',        getTandaTerimas);
router.get('/:id/pdf', generateTandaTerimaPDF);
router.get('/:id',     getTandaTerimaById);
router.post('/',       createTandaTerima);
router.put('/:id',     updateTandaTerima);
router.delete('/:id',  authorize('ADMIN','IT_STAFF'), deleteTandaTerima);

// Attachments
router.post('/:id/attachments', upload.array('photos', 10), uploadTandaTerimaAttachments);
router.delete('/:id/attachments/:attachId', deleteTandaTerimaAttachment);
module.exports = router;
