const router = require('express').Router();
const { body } = require('express-validator');
const { prisma } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { successResponse, errorResponse } = require('../utils/response');
const { validate } = require('../middleware/validate.middleware');

router.use(authenticate);

router.get('/', async (req, res) => {
  const departments = await prisma.department.findMany({
    where: req.query.active === 'true' ? { isActive: true } : {},
    include: { _count: { select: { users: true, tickets: true } } },
    orderBy: { name: 'asc' },
  });
  return successResponse(res, departments);
});

router.post('/', authorize('ADMIN'), [
  body('name').notEmpty().withMessage('Name required'),
  body('code').notEmpty().toUpperCase().withMessage('Code required'),
], validate, async (req, res) => {
  const { name, code, description } = req.body;
  const dept = await prisma.department.create({
    data: { name, code: code.toUpperCase(), description },
  });
  return successResponse(res, dept, 'Department created', 201);
});

router.put('/:id', authorize('ADMIN'), async (req, res) => {
  const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!dept) return errorResponse(res, 'Department not found', 404);
  const updated = await prisma.department.update({
    where: { id: req.params.id },
    data: { name: req.body.name, description: req.body.description, isActive: req.body.isActive },
  });
  return successResponse(res, updated);
});

router.delete('/:id', authorize('ADMIN'), async (req, res) => {
  const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!dept) return errorResponse(res, 'Department not found', 404);
  await prisma.department.update({ where: { id: req.params.id }, data: { isActive: false } });
  return successResponse(res, null, 'Department deactivated');
});

module.exports = router;
