const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const {
  getAssets, getAssetSummary, getAssetById,
  createAsset, updateAsset, deleteAsset,
  generateHandoverLetter, generateAssetReport,
} = require('../controllers/asset.controller');

router.use(authenticate);

// Static routes (before /:id to avoid wildcard conflicts)
router.get('/report',  authorize('IT_STAFF', 'ADMIN'), generateAssetReport);
router.get('/summary', authorize('IT_STAFF', 'ADMIN'), getAssetSummary);
router.get('/',        authorize('IT_STAFF', 'ADMIN'), getAssets);

// Per-asset
router.get('/:id/handover-letter', authorize('IT_STAFF', 'ADMIN'), generateHandoverLetter);
router.get('/:id',                 authorize('IT_STAFF', 'ADMIN'), getAssetById);

// Create & update with optional photo upload (multipart/form-data)
router.post('/',    authorize('IT_STAFF', 'ADMIN'), upload.single('photo'), createAsset);
router.put('/:id',  authorize('IT_STAFF', 'ADMIN'), upload.single('photo'), updateAsset);

// Delete — ADMIN only
router.delete('/:id', authorize('ADMIN'), deleteAsset);

module.exports = router;
