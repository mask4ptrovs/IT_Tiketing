const router = require('express').Router();
const { prisma } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { successResponse, errorResponse } = require('../utils/response');

router.use(authenticate);

router.get('/', async (req, res) => {
  const categories = await prisma.category.findMany({
    where: req.query.active === 'true' ? { isActive: true } : {},
    include: { _count: { select: { tickets: true } } },
    orderBy: { name: 'asc' },
  });
  return successResponse(res, categories);
});

router.post('/', authorize('ADMIN'), async (req, res) => {
  const { name, code, description, color, slaHours } = req.body;
  const cat = await prisma.category.create({
    data: { name, code, description, color, slaHours: slaHours || 24 },
  });
  return successResponse(res, cat, 'Category created', 201);
});

router.put('/:id', authorize('ADMIN'), async (req, res) => {
  const cat = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!cat) return errorResponse(res, 'Category not found', 404);
  const updated = await prisma.category.update({
    where: { id: req.params.id },
    data: req.body,
  });
  return successResponse(res, updated);
});

module.exports = router;
