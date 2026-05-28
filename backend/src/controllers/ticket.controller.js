const { prisma } = require('../config/database');
const { generateTicketNumber } = require('../utils/ticketNumber');
const { successResponse, errorResponse, paginatedResponse, getPagination, getPaginationMeta } = require('../utils/response');
const { emitToUser, emitToRole, emitToTicket } = require('../config/socket');
const { sendEmailNotification } = require('../services/email.service');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { drawKopSurat, drawDocTitle } = require('../utils/pdfHelper');

const TICKET_INCLUDE = {
  creator: { select: { id: true, name: true, email: true, employeeId: true, avatar: true } },
  assignee: { select: { id: true, name: true, email: true, employeeId: true, avatar: true } },
  department: { select: { id: true, name: true, code: true } },
  category: { select: { id: true, name: true, code: true, color: true, icon: true } },
  _count: { select: { comments: true, attachments: true } },
};

const createTicket = async (req, res) => {
  const { title, description, priority, categoryId, departmentId } = req.body;
  const io = req.app.get('io');

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return errorResponse(res, 'Category not found', 404);

  const ticketNo = await generateTicketNumber();

  // Calculate SLA deadline
  const slaDeadline = new Date();
  slaDeadline.setHours(slaDeadline.getHours() + category.slaHours);

  const ticket = await prisma.ticket.create({
    data: {
      ticketNo,
      title,
      description,
      priority: priority || 'MEDIUM',
      categoryId,
      departmentId: departmentId || req.user.departmentId,
      branchId: req.user.branchId || null,
      creatorId: req.user.id,
      slaDeadline,
    },
    include: TICKET_INCLUDE,
  });

  // Activity log
  await prisma.activityLog.create({
    data: {
      ticketId: ticket.id,
      actorId: req.user.id,
      type: 'TICKET_CREATED',
      description: `Ticket #${ticket.ticketNo} created`,
    },
  });

  // -- Notify creator ----------------------------------------------------------
  await prisma.notification.create({
    data: {
      userId: req.user.id,
      ticketId: ticket.id,
      type: 'TICKET_CREATED',
      title: 'Tiket Berhasil Dibuat',
      message: `Tiket #${ticket.ticketNo} Anda telah dikirim dan sedang menunggu penanganan`,
    },
  });

  // -- Notify all IT_STAFF and ADMIN (scoped to same branch if set) -----------
  const staffAndAdmins = await prisma.user.findMany({
    where: {
      role: { in: ['IT_STAFF', 'ADMIN'] },
      isActive: true,
      id: { not: req.user.id },                      // don't double-notify creator
      ...(ticket.branchId ? { branchId: ticket.branchId } : {}),
    },
    select: { id: true },
  });

  if (staffAndAdmins.length > 0) {
    const shortTitle = title.length > 60 ? title.slice(0, 60) + '…' : title;
    await prisma.notification.createMany({
      data: staffAndAdmins.map(u => ({
        userId: u.id,
        ticketId: ticket.id,
        type: 'TICKET_CREATED',
        title: 'Tiket Baru Masuk',
        message: `#${ticket.ticketNo} — ${shortTitle}`,
      })),
      skipDuplicates: true,
    });
  }

  // -- Emit Socket events -------------------------------------------------------
  const socketPayload = {
    type: 'TICKET_CREATED',
    ticketId: ticket.id,
    ticketNo: ticket.ticketNo,
    title: 'Tiket Baru Masuk',
    message: `#${ticket.ticketNo} — ${title.length > 60 ? title.slice(0, 60) + '…' : title}`,
  };
  emitToRole(io, 'IT_STAFF', 'notification:new', socketPayload);
  emitToRole(io, 'ADMIN',    'notification:new', socketPayload);
  emitToRole(io, 'IT_STAFF', 'ticket:new', ticket);
  emitToRole(io, 'ADMIN',    'ticket:new', ticket);

  return successResponse(res, ticket, 'Ticket created successfully', 201);
};

const getTickets = async (req, res) => {
  const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
  const {
    status, priority, category, departmentId, assigneeId,
    search, sortBy = 'createdAt', sortOrder = 'desc',
    slaBreached, dateFrom, dateTo,
  } = req.query;

  const where = {};

  // Role-based filtering
  if (req.user.role === 'USER') {
    where.creatorId = req.user.id;
  } else if (req.user.role === 'IT_STAFF' && req.user.branchId) {
    where.branchId = req.user.branchId;
  }
  // ADMIN: no branch restriction by default, but can filter via query
  if (req.user.role === 'ADMIN' && req.query.branchId) {
    where.branchId = req.query.branchId;
  }

  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = { code: category };
  if (departmentId) where.departmentId = departmentId;
  if (assigneeId) where.assigneeId = assigneeId;
  if (slaBreached !== undefined) where.slaBreached = slaBreached === 'true';

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  if (search) {
    where.OR = [
      { ticketNo: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: TICKET_INCLUDE,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  return paginatedResponse(res, tickets, getPaginationMeta(total, page, limit));
};

const getTicketById = async (req, res) => {
  const { id } = req.params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      ...TICKET_INCLUDE,
      comments: {
        include: {
          author: { select: { id: true, name: true, avatar: true, role: true } },
          attachments: true,
        },
        where: req.user.role === 'USER' ? { isInternal: false } : {},
        orderBy: { createdAt: 'asc' },
      },
      attachments: true,
      activityLogs: {
        include: {
          actor: { select: { id: true, name: true, avatar: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!ticket) return errorResponse(res, 'Ticket not found', 404);

  // Check access for USER role
  if (req.user.role === 'USER' && ticket.creatorId !== req.user.id) {
    return errorResponse(res, 'Access denied', 403);
  }

  return successResponse(res, ticket);
};

const updateTicket = async (req, res) => {
  const { id } = req.params;
  const io = req.app.get('io');

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) return errorResponse(res, 'Ticket not found', 404);

  // Permission check
  if (req.user.role === 'USER' && ticket.creatorId !== req.user.id) {
    return errorResponse(res, 'Access denied', 403);
  }

  const updateData = {};
  const activityLogs = [];

  const allowedFields = req.user.role === 'USER'
    ? ['title', 'description']
    : ['title', 'description', 'status', 'priority', 'assigneeId', 'departmentId'];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined && req.body[field] !== ticket[field]) {
      const oldVal = ticket[field];
      updateData[field] = req.body[field];

      if (field === 'status') {
        activityLogs.push({
          type: 'STATUS_CHANGED',
          description: `Status changed from ${oldVal} to ${req.body[field]}`,
          oldValue: oldVal,
          newValue: req.body[field],
        });

        if (req.body[field] === 'RESOLVED') updateData.resolvedAt = new Date();
        if (req.body[field] === 'CLOSED') updateData.closedAt = new Date();
      }
      if (field === 'priority') {
        activityLogs.push({
          type: 'PRIORITY_CHANGED',
          description: `Priority changed from ${oldVal} to ${req.body[field]}`,
          oldValue: oldVal,
          newValue: req.body[field],
        });
      }
      if (field === 'assigneeId') {
        activityLogs.push({
          type: 'ASSIGNED',
          description: `Ticket assigned`,
          newValue: req.body[field],
        });
      }
    }
  }

  const updatedTicket = await prisma.ticket.update({
    where: { id },
    data: updateData,
    include: TICKET_INCLUDE,
  });

  // Create activity logs
  if (activityLogs.length > 0) {
    await prisma.activityLog.createMany({
      data: activityLogs.map(log => ({
        ...log,
        ticketId: id,
        actorId: req.user.id,
      })),
    });
  }

  // -- Notify creator when status changed by staff ----------------------------
  if (req.user.id !== ticket.creatorId && updateData.status) {
    const statusLabel = {
      OPEN: 'Open', ON_PROGRESS: 'On Progress', PENDING: 'Pending',
      RESOLVED: 'Resolved', CLOSED: 'Closed',
    }[updateData.status] || updateData.status;

    await prisma.notification.create({
      data: {
        userId: ticket.creatorId,
        ticketId: id,
        type: 'TICKET_UPDATED',
        title: 'Status Tiket Diperbarui',
        message: `Tiket #${ticket.ticketNo} berubah menjadi ${statusLabel}`,
      },
    });
    emitToUser(io, ticket.creatorId, 'notification:new', {
      type: 'TICKET_UPDATED',
      ticketId: id,
      ticketNo: ticket.ticketNo,
      title: 'Status Tiket Diperbarui',
      message: `Tiket #${ticket.ticketNo} berubah menjadi ${statusLabel}`,
    });
  }

  // -- Notify assignee when ticket assigned ------------------------------------
  if (updateData.assigneeId && updateData.assigneeId !== req.user.id) {
    await prisma.notification.create({
      data: {
        userId: updateData.assigneeId,
        ticketId: id,
        type: 'TICKET_ASSIGNED',
        title: 'Tiket Ditugaskan',
        message: `Tiket #${ticket.ticketNo} telah ditugaskan kepada Anda`,
      },
    });
    emitToUser(io, updateData.assigneeId, 'notification:new', {
      type: 'TICKET_ASSIGNED',
      ticketId: id,
      ticketNo: ticket.ticketNo,
      title: 'Tiket Ditugaskan',
      message: `Tiket #${ticket.ticketNo} telah ditugaskan kepada Anda`,
    });
  }

  emitToTicket(io, id, 'ticket:updated', updatedTicket);

  return successResponse(res, updatedTicket, 'Ticket updated successfully');
};

const addComment = async (req, res) => {
  const { id } = req.params;
  const { content, isInternal = false } = req.body;
  const io = req.app.get('io');

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) return errorResponse(res, 'Ticket not found', 404);

  // Check access
  if (req.user.role === 'USER' && ticket.creatorId !== req.user.id) {
    return errorResponse(res, 'Access denied', 403);
  }

  // Only IT staff can post internal comments
  const internal = req.user.role !== 'USER' && isInternal;

  const comment = await prisma.ticketComment.create({
    data: {
      content,
      isInternal: internal,
      ticketId: id,
      authorId: req.user.id,
    },
    include: {
      author: { select: { id: true, name: true, avatar: true, role: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      ticketId: id,
      actorId: req.user.id,
      type: 'COMMENT_ADDED',
      description: `Comment added by ${req.user.name}`,
    },
  });

  // -- Notify relevant parties about new comment ------------------------------
  const commentNotifBase = {
    ticketId: id,
    type: 'COMMENT_ADDED',
    title: 'Komentar Baru',
    message: `Komentar baru pada tiket #${ticket.ticketNo}`,
  };
  const socketCommentPayload = {
    ...commentNotifBase,
    ticketNo: ticket.ticketNo,
  };

  if (req.user.id === ticket.creatorId) {
    // -- User/Creator komentar → notif assignee atau semua IT_STAFF di branch --
    if (ticket.assigneeId) {
      await prisma.notification.create({ data: { userId: ticket.assigneeId, ...commentNotifBase } });
      emitToUser(io, ticket.assigneeId, 'notification:new', socketCommentPayload);
    } else {
      // Belum ada assignee → notif semua IT_STAFF (scoped ke branch jika ada)
      const staffList = await prisma.user.findMany({
        where: {
          role: 'IT_STAFF',
          isActive: true,
          id: { not: req.user.id },
          ...(ticket.branchId ? { branchId: ticket.branchId } : {}),
        },
        select: { id: true },
      });
      if (staffList.length > 0) {
        await prisma.notification.createMany({
          data: staffList.map(s => ({ userId: s.id, ...commentNotifBase })),
          skipDuplicates: true,
        });
        emitToRole(io, 'IT_STAFF', 'notification:new', socketCommentPayload);
      }
      // Also notify ADMIN
      emitToRole(io, 'ADMIN', 'notification:new', socketCommentPayload);
    }
  } else {
    // -- IT/Admin komentar → notif creator ----------------------------------
    if (!internal) {                                  // skip for internal-only notes
      await prisma.notification.create({ data: { userId: ticket.creatorId, ...commentNotifBase } });
      emitToUser(io, ticket.creatorId, 'notification:new', socketCommentPayload);
    }
    // Also notify assignee if different from commenter
    if (ticket.assigneeId && ticket.assigneeId !== req.user.id) {
      await prisma.notification.create({ data: { userId: ticket.assigneeId, ...commentNotifBase } });
      emitToUser(io, ticket.assigneeId, 'notification:new', socketCommentPayload);
    }
  }

  emitToTicket(io, id, 'ticket:comment', comment);

  return successResponse(res, comment, 'Comment added', 201);
};

const deleteTicket = async (req, res) => {
  const { id } = req.params;
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) return errorResponse(res, 'Ticket not found', 404);

  await prisma.ticket.delete({ where: { id } });
  return successResponse(res, null, 'Ticket deleted successfully');
};

// -----------------------------------------------------------------------------
// PER-TICKET PDF REPORT
// -----------------------------------------------------------------------------
const generateTicketReport = async (req, res) => {
  const { id } = req.params;

  // Fetch full ticket with all related data
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, email: true, employeeId: true, department: { select: { name: true } } } },
      assignee: { select: { id: true, name: true, email: true, employeeId: true } },
      department: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, code: true, slaHours: true } },
      branch: { select: { id: true, name: true, code: true, city: true, address: true, phone: true, email: true, isHeadOffice: true, sigCreator: true, sigChecker: true, sigApprover: true } },
      comments: {
        where: req.user.role === 'USER' ? { isInternal: false } : {},
        include: { author: { select: { name: true, role: true, avatar: true } } },
        orderBy: { createdAt: 'asc' },
      },
      attachments: true,
      activityLogs: {
        include: { actor: { select: { name: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!ticket) return errorResponse(res, 'Ticket not found', 404);

  // Access check for USER
  if (req.user.role === 'USER' && ticket.creatorId !== req.user.id) {
    return errorResponse(res, 'Access denied', 403);
  }

  // Load company settings
  const company = await prisma.companySetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  // Signature data — from branch (preferred) or query params fallback
  const sigCreator  = ticket.branch?.sigCreator  || req.query.sigCreator  || '';
  const sigChecker  = ticket.branch?.sigChecker  || req.query.sigChecker  || '';
  const sigApprover = ticket.branch?.sigApprover || req.query.sigApprover || '';

  // -- Create PDF ------------------------------------------------------------
  const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Laporan-Tiket-${ticket.ticketNo}.pdf"`);
  doc.pipe(res);

  const ML  = 50;
  const W   = doc.page.width - ML * 2; // usable width (595 - 100 = 495)
  const PURPLE = '#4F46E5';
  const DARK   = '#1F2937';
  const GRAY   = '#6B7280';
  const GREEN  = '#059669';
  const RED    = '#DC2626';
  const AMBER  = '#D97706';
  const BURL   = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

  const statusColor = { OPEN: '#3B82F6', ON_PROGRESS: '#F59E0B', PENDING: '#6B7280', RESOLVED: '#059669', CLOSED: '#374151' };
  const priorityColor = { LOW: '#059669', MEDIUM: '#3B82F6', HIGH: '#F59E0B', CRITICAL: '#DC2626' };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

  const drawHLine = (y, color = '#E5E7EB', w = W) => {
    doc.moveTo(ML, y).lineTo(ML + w, y).strokeColor(color).lineWidth(0.5).stroke();
  };

  // -- Kop Surat — gunakan data cabang jika tersedia -------------------------
  const effectiveSettings = {
    companyName:    ticket.branch?.name    || company.companyName,
    companyAddress: ticket.branch?.address || company.companyAddress,
    companyCity:    ticket.branch?.city    || company.companyCity,
    companyPhone:   ticket.branch?.phone   || company.companyPhone,
    companyEmail:   ticket.branch?.email   || company.companyEmail,
    companyLogo:    company.companyLogo,
  };
  let y = await drawKopSurat(doc, effectiveSettings, BURL, ML);
  y = drawDocTitle(doc, 'LAPORAN DETAIL TIKET', y, ML);

  // -- TICKET INFO GRID ------------------------------------------------------

  // Title
  doc.fontSize(14).font('Helvetica-Bold').fillColor(DARK)
    .text(ticket.title, 50, y, { width: W });
  y += doc.heightOfString(ticket.title, { width: W, fontSize: 14 }) + 6;

  // Status + Priority chips
  const sColor = statusColor[ticket.status] || GRAY;
  const pColor = priorityColor[ticket.priority] || GRAY;
  const sLabel = ticket.status.replace('_', ' ');
  const pLabel = ticket.priority;

  doc.roundedRect(50, y, 74, 16, 4).fill(sColor);
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('white')
    .text(sLabel, 50, y + 4, { width: 74, align: 'center' });

  doc.roundedRect(132, y, 60, 16, 4).fill(pColor);
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('white')
    .text(pLabel, 132, y + 4, { width: 60, align: 'center' });

  if (ticket.slaBreached) {
    doc.roundedRect(200, y, 68, 16, 4).fill('#FEE2E2');
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(RED)
      .text('SLA BREACHED', 200, y + 4, { width: 68, align: 'center' });
  }

  y += 26;
  drawHLine(y, '#E5E7EB');
  y += 14;

  // Info table (2 columns)
  const infoRows = [
    ['No. Tiket',     ticket.ticketNo,                         'Kategori',    ticket.category?.name || '-'],
    ['Pelapor',       ticket.creator?.name || '-',             'Departemen',  ticket.department?.name || '-'],
    ['Teknisi',       ticket.assignee?.name || '-',            'Cabang',      ticket.branch ? `${ticket.branch.name} (${ticket.branch.code})` : '-'],
    ['SLA Deadline',  fmt(ticket.slaDeadline),                 'SLA (Jam)',   ticket.category?.slaHours ? `${ticket.category.slaHours} jam` : '-'],
    ['Dibuat',        fmt(ticket.createdAt),                   'Selesai',     ticket.resolvedAt ? fmt(ticket.resolvedAt) : '-'],
  ];

  const col1W = Math.floor(W / 2) - 8;
  infoRows.forEach(([l1, v1, l2, v2]) => {
    // Left cell
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(GRAY).text(l1 + ':', 50, y, { width: 80 });
    doc.fontSize(8).font('Helvetica').fillColor(DARK).text(String(v1), 140, y, { width: col1W - 90 });
    // Right cell
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(GRAY).text(l2 + ':', 50 + col1W + 8, y, { width: 80 });
    doc.fontSize(8).font('Helvetica').fillColor(DARK).text(String(v2), 50 + col1W + 98, y, { width: col1W - 90 });
    y += 16;
  });

  y += 6;
  drawHLine(y, '#E5E7EB');
  y += 14;

  // -- DESCRIPTION -----------------------------------------------------------
  doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text('DESKRIPSI MASALAH', 50, y);
  y += 16;

  doc.roundedRect(50, y, W, 8 + doc.heightOfString(ticket.description || '-', { width: W - 24, lineGap: 2 }) + 8, 6)
    .fill('#F8FAFC').stroke('#E5E7EB');
  y += 8;
  doc.fontSize(8.5).font('Helvetica').fillColor(DARK)
    .text(ticket.description || '-', 62, y, { width: W - 24, lineGap: 2 });
  y += doc.heightOfString(ticket.description || '-', { width: W - 24, lineGap: 2 }) + 16;

  // -- ATTACHMENTS -----------------------------------------------------------
  if (ticket.attachments?.length > 0) {
    // Need at least header(30) + first item before page break
    if (y + 50 > doc.page.height - 60) { doc.addPage(); y = 50; }
    drawHLine(y, '#E5E7EB');
    y += 14;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text('LAMPIRAN', 50, y);
    y += 16;

    // Helper: resolve URL -> absolute file path on disk
    const urlToFilePath = (url) => {
      try {
        // URL format: http://host:port/uploads/YYYY/MM/filename.ext
        const parsed = new URL(url);
        const relPath = parsed.pathname; // e.g. /uploads/2026/05/uuid.png
        return path.join(process.cwd(), relPath);
      } catch {
        return null;
      }
    };

    const IMG_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);
    const IMG_W = 200; // thumbnail width in PDF
    const IMG_PER_ROW = 2;
    const IMG_GAP = 12;
    const IMG_H_MAX = 140;

    // Separate images from other files
    const imgAttachments = ticket.attachments.filter(a => IMG_MIME.has(a.mimeType));
    const otherAttachments = ticket.attachments.filter(a => !IMG_MIME.has(a.mimeType));

    // -- Render image grid --
    if (imgAttachments.length > 0) {
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(GRAY).text('Gambar / Foto:', 50, y);
      y += 14;

      let col = 0;
      let rowMaxH = 0;
      const startX = 50;

      imgAttachments.forEach((att, i) => {
        const filePath = urlToFilePath(att.url);
        const fileOk = filePath && fs.existsSync(filePath);

        const cx = startX + col * (IMG_W + IMG_GAP);

        if (fileOk) {
          try {
            // Let PDFKit size the image maintaining aspect ratio, max IMG_W x IMG_H_MAX
            doc.image(filePath, cx, y, { fit: [IMG_W, IMG_H_MAX] });
            const imgDims = doc._imageRegistry
              ? null  // can't easily get rendered height here; use max
              : null;
            const renderedH = IMG_H_MAX; // conservative — keeps rows uniform
            rowMaxH = Math.max(rowMaxH, renderedH);
          } catch {
            // Image unreadable — fall back to placeholder
            doc.rect(cx, y, IMG_W, 80).fill('#F3F4F6').stroke('#E5E7EB');
            doc.fontSize(7).fillColor(GRAY).text('[Gambar tidak dapat ditampilkan]', cx + 4, y + 36, { width: IMG_W - 8, align: 'center' });
            rowMaxH = Math.max(rowMaxH, 80);
          }
        } else {
          // File missing on disk
          doc.rect(cx, y, IMG_W, 80).fill('#F3F4F6').stroke('#E5E7EB');
          doc.fontSize(7).fillColor(GRAY).text('[File tidak tersedia]', cx + 4, y + 36, { width: IMG_W - 8, align: 'center' });
          rowMaxH = Math.max(rowMaxH, 80);
        }

        // Caption below image
        doc.fontSize(6.5).font('Helvetica').fillColor(GRAY)
          .text(att.originalName || att.filename, cx, y + rowMaxH + 3, { width: IMG_W, ellipsis: true });

        col++;
        if (col >= IMG_PER_ROW) {
          col = 0;
          y += rowMaxH + 18;
          rowMaxH = 0;
          // Page-break: check if next row fits before starting it
          if (y + IMG_H_MAX + 20 > doc.page.height - 60) { doc.addPage(); y = 50; }
        }
      });

      // Flush last partial row
      if (col > 0) {
        y += rowMaxH + 18;
      }
    }

    // -- Render other file attachments --
    if (otherAttachments.length > 0) {
      if (imgAttachments.length > 0) y += 4;
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(GRAY).text('Dokumen lainnya:', 50, y);
      y += 14;
      otherAttachments.forEach((att, i) => {
        if (y + 20 > doc.page.height - 60) { doc.addPage(); y = 50; }
        // Small file-type pill
        const ext = (att.originalName || att.filename || '').split('.').pop().toUpperCase();
        doc.roundedRect(50, y, 28, 13, 2).fill(PURPLE);
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor('white')
          .text(ext.slice(0, 4), 50, y + 3, { width: 28, align: 'center' });
        doc.fontSize(8).font('Helvetica').fillColor(DARK)
          .text(att.originalName || att.filename, 84, y + 1, { width: W - 90 });
        y += 16;
      });
    }

    y += 8;
  }

  // -- TIMELINE / ACTIVITY LOG -----------------------------------------------
  if (ticket.activityLogs?.length > 0) {
    // Need at least header(30) + first item(24) = 54pt before page break
    if (y + 54 > doc.page.height - 60) { doc.addPage(); y = 50; }
    drawHLine(y, '#E5E7EB');
    y += 14;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text('RIWAYAT AKTIVITAS', 50, y);
    y += 16;

    // ASCII-only icons — safe for Helvetica (no emoji, no Unicode arrows)
    const logTypeLabel = {
      TICKET_CREATED:   '[C]',
      STATUS_CHANGED:   '[S]',
      PRIORITY_CHANGED: '[P]',
      ASSIGNED:         '[A]',
      COMMENT_ADDED:    '[M]',
      ATTACHMENT_ADDED: '[F]',
    };
    const logDotColor = {
      TICKET_CREATED:   PURPLE,
      STATUS_CHANGED:   '#3B82F6',
      PRIORITY_CHANGED: AMBER,
      ASSIGNED:         GREEN,
      COMMENT_ADDED:    GRAY,
      ATTACHMENT_ADDED: '#8B5CF6',
    };

    ticket.activityLogs.forEach(log => {
      // Each log entry is ~24pt; require it fits before rendering
      if (y + 24 > doc.page.height - 60) { doc.addPage(); y = 50; }

      const tag   = logTypeLabel[log.type] || '[-]';
      const color = logDotColor[log.type]  || GRAY;

      // Colored tag pill
      doc.roundedRect(50, y, 22, 12, 2).fill(color);
      doc.fontSize(6).font('Helvetica-Bold').fillColor('white')
        .text(tag, 50, y + 3, { width: 22, align: 'center' });

      // Description
      doc.fontSize(8).font('Helvetica').fillColor(DARK)
        .text(log.description, 78, y, { width: W - 100 });

      // Meta — actor + date
      doc.fontSize(6.5).fillColor(GRAY)
        .text(`${log.actor?.name || 'System'}  -  ${fmt(log.createdAt)}`, 78, y + 11, { width: W - 100 });

      y += 24;
    });
    y += 6;
  }

  // -- COMMENTS -------------------------------------------------------------
  const publicComments = ticket.comments?.filter(c => !c.isInternal) || [];
  if (publicComments.length > 0) {
    // Need at least header(30) + first bubble min(~60) before page break
    if (y + 90 > doc.page.height - 60) { doc.addPage(); y = 50; }
    drawHLine(y, '#E5E7EB');
    y += 14;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text('KOMENTAR & KOMUNIKASI', 50, y);
    y += 16;

    publicComments.forEach((comment, i) => {
      const isIT = comment.author?.role !== 'USER';
      const bubbleColor = isIT ? '#EEF2FF' : '#F0FDF4';
      const textH = doc.heightOfString(comment.content, { width: W - 40, lineGap: 1.5 }) + 26;
      // Page-break: ensure the bubble fits before rendering it
      if (y + textH > doc.page.height - 60) { doc.addPage(); y = 50; }
      doc.roundedRect(50, y, W, textH, 6).fill(bubbleColor).stroke('#E5E7EB');
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(isIT ? PURPLE : GREEN)
        .text(comment.author?.name || 'Unknown', 62, y + 7, { width: W - 80 });
      doc.fontSize(7).font('Helvetica').fillColor(GRAY)
        .text(fmt(comment.createdAt), 62, y + 7, { width: W - 80, align: 'right' });
      doc.fontSize(8.5).font('Helvetica').fillColor(DARK)
        .text(comment.content, 62, y + 18, { width: W - 40, lineGap: 1.5 });
      y += textH + 8;
    });
    y += 6;
  }

  // ---
  doc.addPage();
  let yy = 0;

  // Header strip
  doc.rect(0, 0, doc.page.width, 80).fill(PURPLE);
  doc.fontSize(15).font('Helvetica-Bold').fillColor('white')
    .text('LEMBAR PENGESAHAN', 50, 20, { align: 'center', width: doc.page.width - 100 });
  doc.fontSize(9).font('Helvetica').fillColor('rgba(255,255,255,0.8)')
    .text('Laporan Tiket #' + ticket.ticketNo, 50, 42, { align: 'center', width: doc.page.width - 100 });

  yy = 100;

  // Summary box
  const resolvedDuration = ticket.resolvedAt && ticket.createdAt
    ? Math.round((new Date(ticket.resolvedAt) - new Date(ticket.createdAt)) / 3600000)
    : null;

  doc.roundedRect(50, yy, W, 80, 6).fill('#F8FAFC').stroke('#E5E7EB');
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(DARK).text('INFORMASI TIKET', 66, yy + 10);
  doc.fontSize(8).font('Helvetica').fillColor(GRAY);
  doc.text('No. Tiket   : #' + ticket.ticketNo, 66, yy + 24);
  doc.text('Judul       : ' + ticket.title, 66, yy + 36, { width: 210 });
  doc.text('Status      : ' + ticket.status.replace('_', ' '), 66, yy + 48);
  doc.text('Kategori    : ' + (ticket.category ? ticket.category.name : '-'), 300, yy + 24);
  doc.text('Prioritas   : ' + ticket.priority, 300, yy + 36);
  doc.text('Pelapor     : ' + (ticket.creator ? ticket.creator.name : '-'), 300, yy + 48);
  if (resolvedDuration !== null) {
    doc.text('Waktu selesai: ' + resolvedDuration + ' jam', 66, yy + 60);
  }
  if (ticket.branch) {
    doc.font('Helvetica-Bold').fillColor(PURPLE)
      .text('Cabang: ' + ticket.branch.name + ' (' + ticket.branch.code + ')' + (ticket.branch.city ? ' - ' + ticket.branch.city : ''), 300, yy + 60);
  }

  yy += 96;

  // Declaration
  doc.fontSize(8.5).font('Helvetica').fillColor(DARK)
    .text(
      'Dengan ini kami menyatakan bahwa laporan tiket IT di atas adalah benar dan telah diperiksa sesuai dengan data yang ada pada sistem. ' +
      'Laporan ini dibuat untuk keperluan dokumentasi dan penyelesaian masalah teknis.',
      50, yy, { width: W, align: 'justify', lineGap: 3 }
    );

  yy += 46;
  doc.moveTo(50, yy).lineTo(50 + W, yy).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
  yy += 20;

  // 3 signature columns
  const sigW = Math.floor(W / 3) - 10;
  const signatures = [
    { title: 'Dibuat oleh,', role: 'Staff IT / Teknisi', name: sigCreator },
    { title: 'Diperiksa oleh,', role: 'Kepala IT / Supervisor', name: sigChecker },
    { title: 'Disetujui oleh,', role: 'Manager / Direktur', name: sigApprover },
  ];

  signatures.forEach(function(sig, i) {
    const sx = 50 + i * (sigW + 15);

    doc.roundedRect(sx, yy, sigW, 155, 8).fill('#FAFAFA').stroke('#E5E7EB');
    doc.roundedRect(sx, yy, sigW, 26, 8).fill(i === 0 ? '#EEF2FF' : i === 1 ? '#F0FDF4' : '#FFF7ED');
    const lColor = i === 0 ? PURPLE : i === 1 ? GREEN : AMBER;
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(lColor)
      .text(sig.title, sx, yy + 8, { width: sigW, align: 'center' });

    const lineY = yy + 110;
    doc.moveTo(sx + 15, lineY).lineTo(sx + sigW - 15, lineY)
      .strokeColor('#9CA3AF').lineWidth(1).stroke();

    if (sig.name && sig.name.trim()) {
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(DARK)
        .text(sig.name.trim(), sx, lineY + 6, { width: sigW, align: 'center' });
    } else {
      doc.fontSize(8).font('Helvetica').fillColor('#D1D5DB')
        .text('(                              )', sx, lineY + 6, { width: sigW, align: 'center' });
    }

    doc.fontSize(7.5).font('Helvetica').fillColor(GRAY)
      .text(sig.role, sx, lineY + 22, { width: sigW, align: 'center' });
  });

  yy += 170;

  // Date
  const cityName = company.companyCity || 'Jakarta';
  doc.fontSize(9).font('Helvetica').fillColor(DARK)
    .text(cityName + ', ' + fmtDate(new Date()), 50, yy, { align: 'right', width: W });

  yy += 20;
  doc.moveTo(50, yy).lineTo(50 + W, yy).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
  yy += 12;
  doc.fontSize(7).fillColor(GRAY)
    .text(
      'Dokumen ini digenerate secara otomatis oleh Sistem IT Ticketing. ' +
      'Sah untuk keperluan internal tanpa tanda tangan basah.',
      50, yy, { width: W, align: 'center' }
    );

  doc.end();
};

module.exports = { createTicket, getTickets, getTicketById, updateTicket, addComment, deleteTicket, generateTicketReport };
