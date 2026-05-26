const router = require('express').Router();
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { successResponse, paginatedResponse, getPagination, getPaginationMeta } = require('../utils/response');

router.use(authenticate);

// GET /notifications — list for current user (with unread count)
router.get('/', async (req, res) => {
  const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
  const where = { userId: req.user.id };
  if (req.query.unread === 'true') where.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
  ]);

  return paginatedResponse(res, { notifications, unreadCount }, getPaginationMeta(total, page, limit));
});

// PATCH /notifications/read-all — MUST be before /:id routes to avoid param capture
router.patch('/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, isRead: false },
    data: { isRead: true },
  });
  return successResponse(res, null, 'All notifications marked as read');
});

// PATCH /notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id },
    data: { isRead: true },
  });
  return successResponse(res, null, 'Notification marked as read');
});

// DELETE /notifications/:id
router.delete('/:id', async (req, res) => {
  await prisma.notification.deleteMany({
    where: { id: req.params.id, userId: req.user.id },
  });
  return successResponse(res, null, 'Notification deleted');
});

module.exports = router;
