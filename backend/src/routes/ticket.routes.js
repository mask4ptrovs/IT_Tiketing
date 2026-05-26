const router = require('express').Router();
const { body } = require('express-validator');
const {
  createTicket, getTickets, getTicketById,
  updateTicket, addComment, deleteTicket, generateTicketReport,
} = require('../controllers/ticket.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { upload } = require('../middleware/upload.middleware');

router.use(authenticate);

router.get('/', getTickets);
router.post('/', [
  body('title').notEmpty().trim().isLength({ max: 200 }).withMessage('Title is required (max 200 chars)'),
  body('description').notEmpty().trim().withMessage('Description is required'),
  body('categoryId').notEmpty().withMessage('Category is required'),
], validate, createTicket);

router.get('/:id/report', generateTicketReport);
router.get('/:id', getTicketById);
router.put('/:id', updateTicket);
router.delete('/:id', authorize('ADMIN'), deleteTicket);

router.post('/:id/comments', [
  body('content').notEmpty().trim().withMessage('Comment content is required'),
], validate, addComment);

module.exports = router;
