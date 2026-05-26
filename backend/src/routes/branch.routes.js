const router = require('express').Router();
const { body } = require('express-validator');
const {
  getBranches, getBranchById, createBranch, updateBranch, deleteBranch,
  updateBranchSignatures,
  getRegulations, createRegulation, updateRegulation, deleteRegulation,
} = require('../controllers/branch.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

router.use(authenticate);

// ── Branches ────────────────────────────────────────────────────────────────
router.get('/', getBranches);
router.get('/:id', getBranchById);

router.post('/', authorize('ADMIN'), [
  body('name').notEmpty().withMessage('Nama cabang wajib diisi'),
  body('code').notEmpty().withMessage('Kode cabang wajib diisi'),
], validate, createBranch);

router.put('/:id', authorize('ADMIN'), updateBranch);
router.patch('/:id/signatures', authorize('ADMIN', 'IT_STAFF'), updateBranchSignatures);
router.delete('/:id', authorize('ADMIN'), deleteBranch);

// ── Regulations (nested under branch) ───────────────────────────────────────
router.get('/:branchId/regulations', getRegulations);

router.post('/:branchId/regulations', authorize('ADMIN'), [
  body('title').notEmpty().withMessage('Judul regulasi wajib diisi'),
  body('content').notEmpty().withMessage('Isi regulasi wajib diisi'),
], validate, createRegulation);

router.put('/:branchId/regulations/:regulationId', authorize('ADMIN'), updateRegulation);
router.delete('/:branchId/regulations/:regulationId', authorize('ADMIN'), deleteRegulation);

module.exports = router;
