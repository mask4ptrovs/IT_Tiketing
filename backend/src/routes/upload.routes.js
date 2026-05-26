const router = require('express').Router();
const path = require('path');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const { successResponse, errorResponse } = require('../utils/response');

router.use(authenticate);

router.post('/ticket/:ticketId', upload.array('files', 5), async (req, res) => {
  const { ticketId } = req.params;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return errorResponse(res, 'Ticket not found', 404);

  if (!req.files || req.files.length === 0) {
    return errorResponse(res, 'No files uploaded', 400);
  }

  const attachments = await prisma.$transaction(
    req.files.map(file => {
      const relativePath = file.path.replace(process.cwd(), '').replace(/\\/g, '/');
      return prisma.attachment.create({
        data: {
          ticketId,
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: `${process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`}${relativePath}`,
        },
      });
    })
  );

  await prisma.activityLog.create({
    data: {
      ticketId,
      actorId: req.user.id,
      type: 'ATTACHMENT_ADDED',
      description: `${req.files.length} file(s) attached`,
    },
  });

  return successResponse(res, attachments, 'Files uploaded successfully', 201);
});

module.exports = router;
