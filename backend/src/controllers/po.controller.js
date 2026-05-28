const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');
const { prisma } = require('../config/database');
const {
  successResponse, errorResponse,
  paginatedResponse, getPagination, getPaginationMeta,
} = require('../utils/response');
const { drawKopSurat, drawDocTitle } = require('../utils/pdfHelper');

// ── Helpers ────────────────────────────────────────────────────────────────────

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
               'Juli','Agustus','September','Oktober','November','Desember'];

const fmtDate = (d) => {
  const dt = new Date(d);
  return `${dt.getDate()} ${BULAN[dt.getMonth()]} ${dt.getFullYear()}`;
};

const fmtRp = (n) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(n || 0);

const urlToFilePath = (url) => {
  try {
    const pathname = new URL(url).pathname;
    return path.join(process.cwd(), pathname);
  } catch (_) { return null; }
};

// Auto-generate PO number: PR-YYYY-XXXX
const generatePONumber = async () => {
  const year   = new Date().getFullYear();
  const prefix = `PR-${year}-`;
  const last   = await prisma.purchaseOrder.findFirst({
    where:   { poNumber: { startsWith: prefix } },
    orderBy: { poNumber: 'desc' },
    select:  { poNumber: true },
  });
  const seq = last ? parseInt(last.poNumber.split('-')[2], 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

const PO_INCLUDE = {
  createdBy:   { select: { id: true, name: true, email: true, employeeId: true } },
  approvedBy:  { select: { id: true, name: true } },
  branch:      { select: { id: true, name: true, code: true, city: true,
                            address: true, phone: true, email: true,
                            managerName: true, sigCreator: true, sigApprover: true } },
  items:       { orderBy: { itemNo: 'asc' } },
  attachments: { orderBy: { createdAt: 'asc' } },
};

const BACKEND_URL_BASE = () =>
  process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

const buildAttachmentUrl = (file) => {
  const rel = file.path.replace(process.cwd(), '').replace(/\\/g, '/');
  return `${BACKEND_URL_BASE()}${rel}`;
};

// ── CRUD ───────────────────────────────────────────────────────────────────────

// GET /purchase-orders
const getPOs = async (req, res) => {
  const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
  const { status, branchId, search, startDate, endDate,
          sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const where = {};

  // Scope: USER sees own; IT_STAFF sees own branch; ADMIN sees all
  if (req.user.role === 'USER') {
    where.createdById = req.user.id;
  } else if (req.user.role === 'IT_STAFF' && req.user.branchId) {
    where.branchId = req.user.branchId;
  } else if (req.user.role === 'ADMIN' && branchId) {
    where.branchId = branchId;
  }

  if (status)    where.status = status;
  if (startDate || endDate) {
    where.submissionDate = {};
    if (startDate) where.submissionDate.gte = new Date(startDate);
    if (endDate)   where.submissionDate.lte = new Date(new Date(endDate).setHours(23,59,59,999));
  }
  if (search) {
    where.OR = [
      { poNumber:     { contains: search, mode: 'insensitive' } },
      { companyName:  { contains: search, mode: 'insensitive' } },
      { workLocation: { contains: search, mode: 'insensitive' } },
      { createdBy:    { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [pos, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where, include: PO_INCLUDE,
      orderBy: { [sortBy]: sortOrder }, skip, take: limit,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return paginatedResponse(res, pos, getPaginationMeta(total, page, limit));
};

// GET /purchase-orders/summary
const getPOSummary = async (req, res) => {
  const where = {};
  if (req.user.role === 'USER') {
    where.createdById = req.user.id;
  } else if (req.user.role === 'IT_STAFF' && req.user.branchId) {
    where.branchId = req.user.branchId;
  } else if (req.user.role === 'ADMIN' && req.query.branchId) {
    where.branchId = req.query.branchId;
  }

  const [total, byStatus] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.groupBy({ by: ['status'], where, _count: true }),
  ]);

  const statusMap = Object.fromEntries(byStatus.map(r => [r.status, r._count]));

  return successResponse(res, { total, byStatus: statusMap });
};

// GET /purchase-orders/:id
const getPOById = async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: req.params.id }, include: PO_INCLUDE,
  });
  if (!po) return errorResponse(res, 'Purchase Request tidak ditemukan', 404);

  // Access control
  if (req.user.role === 'USER' && po.createdById !== req.user.id) {
    return errorResponse(res, 'Akses ditolak', 403);
  }
  if (req.user.role === 'IT_STAFF' && req.user.branchId && po.branchId !== req.user.branchId) {
    return errorResponse(res, 'Akses ditolak', 403);
  }

  return successResponse(res, po);
};

// POST /purchase-orders
const createPO = async (req, res) => {
  const { companyName, workLocation, position, deadline, justification, notes,
          branchId, items = [] } = req.body;

  if (!companyName || !workLocation) {
    return errorResponse(res, 'Nama perusahaan dan lokasi kerja wajib diisi', 400);
  }
  if (!items || items.length === 0) {
    return errorResponse(res, 'Minimal satu item barang/jasa harus diisi', 400);
  }

  const poNumber = await generatePONumber();
  const totalEstimate = items.reduce((sum, item) => {
    return sum + (parseFloat(item.qty || 0) * parseFloat(item.estimatedPrice || 0));
  }, 0);

  const effectiveBranchId = branchId
    || (req.user.role !== 'ADMIN' ? req.user.branchId : null)
    || null;

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      companyName,
      workLocation,
      position:      position      || null,
      deadline:      deadline      ? new Date(deadline) : null,
      justification: justification || null,
      notes:         notes         || null,
      totalEstimate,
      status:        'PENDING',
      branchId:      effectiveBranchId,
      createdById:   req.user.id,
      items: {
        create: items.map((item, idx) => ({
          itemNo:        idx + 1,
          itemName:      item.itemName,
          specification: item.specification || null,
          qty:           parseFloat(item.qty || 1),
          unit:          item.unit          || 'pcs',
          estimatedPrice: parseFloat(item.estimatedPrice || 0),
          notes:         item.notes         || null,
        })),
      },
    },
    include: PO_INCLUDE,
  });

  return successResponse(res, po, 'Purchase Request berhasil dibuat', 201);
};

// PUT /purchase-orders/:id
const updatePO = async (req, res) => {
  const { id } = req.params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) return errorResponse(res, 'Purchase Request tidak ditemukan', 404);

  // Only creator or ADMIN can edit; only if status is PENDING (not approved)
  if (req.user.role === 'USER' && po.createdById !== req.user.id) {
    return errorResponse(res, 'Akses ditolak', 403);
  }
  if (po.status === 'APPROVED' && req.user.role !== 'ADMIN') {
    return errorResponse(res, 'PR yang sudah disetujui tidak dapat diubah', 400);
  }

  const { companyName, workLocation, position, deadline, justification, notes,
          branchId, items } = req.body;

  const data = {};
  if (companyName  !== undefined) data.companyName  = companyName;
  if (workLocation !== undefined) data.workLocation = workLocation;
  if (position     !== undefined) data.position     = position     || null;
  if (deadline     !== undefined) data.deadline     = deadline     ? new Date(deadline) : null;
  if (justification !== undefined) data.justification = justification || null;
  if (notes        !== undefined) data.notes        = notes        || null;
  if (branchId     !== undefined && req.user.role === 'ADMIN') data.branchId = branchId || null;

  // Recalculate total if items provided
  if (items && Array.isArray(items)) {
    data.totalEstimate = items.reduce((sum, item) => {
      return sum + (parseFloat(item.qty || 0) * parseFloat(item.estimatedPrice || 0));
    }, 0);

    // Replace items: delete all then recreate
    await prisma.purchaseOrderItem.deleteMany({ where: { poId: id } });
    data.items = {
      create: items.map((item, idx) => ({
        itemNo:        idx + 1,
        itemName:      item.itemName,
        specification: item.specification || null,
        qty:           parseFloat(item.qty || 1),
        unit:          item.unit          || 'pcs',
        estimatedPrice: parseFloat(item.estimatedPrice || 0),
        notes:         item.notes         || null,
      })),
    };
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id }, data, include: PO_INCLUDE,
  });
  return successResponse(res, updated, 'Purchase Request berhasil diperbarui');
};

// PATCH /purchase-orders/:id/status  (ADMIN only)
const updatePOStatus = async (req, res) => {
  const { id } = req.params;
  const { status, rejectedReason } = req.body;

  const VALID = ['APPROVED', 'REJECTED', 'CANCELLED'];
  if (!VALID.includes(status)) {
    return errorResponse(res, `Status tidak valid. Pilih salah satu: ${VALID.join(', ')}`, 400);
  }

  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) return errorResponse(res, 'Purchase Request tidak ditemukan', 404);

  const data = {
    status,
    approvedById:   req.user.id,
    rejectedReason: status === 'REJECTED' ? (rejectedReason || null) : null,
  };

  const updated = await prisma.purchaseOrder.update({
    where: { id }, data, include: PO_INCLUDE,
  });
  return successResponse(res, updated, `Status PR berhasil diubah ke ${status}`);
};

// DELETE /purchase-orders/:id
const deletePO = async (req, res) => {
  const { id } = req.params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) return errorResponse(res, 'Purchase Request tidak ditemukan', 404);

  if (req.user.role === 'USER' && po.createdById !== req.user.id) {
    return errorResponse(res, 'Akses ditolak', 403);
  }
  if (po.status === 'APPROVED' && req.user.role !== 'ADMIN') {
    return errorResponse(res, 'PR yang sudah disetujui tidak dapat dihapus', 400);
  }

  await prisma.purchaseOrder.delete({ where: { id } });
  return successResponse(res, null, 'Purchase Request berhasil dihapus');
};

// ── PDF Generator ─────────────────────────────────────────────────────────────

// GET /purchase-orders/:id/pdf
const generatePOPDF = async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: req.params.id }, include: PO_INCLUDE,
  });
  if (!po) return errorResponse(res, 'Purchase Request tidak ditemukan', 404);

  if (req.user.role === 'USER' && po.createdById !== req.user.id) {
    return errorResponse(res, 'Akses ditolak', 403);
  }

  const settings = await prisma.companySetting.upsert({
    where: { id: 'singleton' }, create: {}, update: {},
  });

  // Signatures — Diajukan: pembuat dokumen, Disetujui: manager/direktur cabang
  const sigDiajukan      = po.createdBy.name.trim();
  const jabatanDiajukan  = (po.position || '').trim();
  // Gunakan managerName cabang → fallback sigApprover (ambil baris pertama saja) → approvedBy
  const rawApprover      = po.branch?.managerName || po.branch?.sigApprover || settings.sigApprover || po.approvedBy?.name || '(..................................)';
  const sigDisetujui     = rawApprover.split(/[\r\n]+/)[0].trim();
  const jabatanDisetujui = 'Manager Cabang';

  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="PR-${po.poNumber}.pdf"`);
  doc.pipe(res);

  // ── Layout constants ──────────────────────────────────────────────────────────
  const ML   = 50;                          // left margin
  const PW   = doc.page.width - ML * 2;    // ~495pt on A4
  const DARK = '#1a1a1a';
  const GRAY = '#555555';
  const BORDER = '#333333';
  const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

  // ── Kop Surat — gunakan data cabang jika tersedia ───────────────────────────
  const effectiveSettings = {
    companyName:    po.branch?.name    || settings.companyName,
    companyAddress: po.branch?.address || settings.companyAddress,
    companyCity:    po.branch?.city    || settings.companyCity,
    companyPhone:   po.branch?.phone   || settings.companyPhone,
    companyEmail:   po.branch?.email   || settings.companyEmail,
    companyLogo:    settings.companyLogo,
  };
  let y = await drawKopSurat(doc, effectiveSettings, BACKEND_URL, ML);
  y = drawDocTitle(doc, 'PURCHASE REQUEST', y, ML);

  // ── Info fields ───────────────────────────────────────────────────────────────
  const KW    = 130;   // key width
  const COLON = 8;
  const VW    = PW - KW - COLON;
  const LH    = 17;   // line height

  const infoFields = [
    ['Nomor',              po.poNumber],
    ['Tanggal Pengajuan',  fmtDate(po.submissionDate)],
    ['Nama Perusahaan',    po.companyName],
    ['Lokasi Kerja',       po.workLocation],
    ['Jabatan',            po.position || '-'],
    ['Deadline Kebutuhan', po.deadline ? fmtDate(po.deadline) : '-'],
  ];

  infoFields.forEach(([k, v]) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
       .text(k, ML, y, { width: KW, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
       .text(':', ML + KW, y, { width: COLON, lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor(DARK)
       .text(v, ML + KW + COLON, y, { width: VW, lineBreak: false });
    y += LH;
  });

  y += 8;
  doc.moveTo(ML, y).lineTo(ML + PW, y).strokeColor(BORDER).lineWidth(0.8).stroke();
  y += 10;

  // ── Items Table ───────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
     .text('Detail Permintaan Barang / Jasa', ML, y);
  y += 14;

  // Column widths — must sum to PW (495)
  // No | Nama Barang/Jasa | Spesifikasi | Qty | Satuan | Estimasi Harga | Keterangan
  const COL  = [24, 120, 100, 34, 48, 88, Math.round(PW - 24 - 120 - 100 - 34 - 48 - 88)];
  // COL[6] = 495 - 414 = 81
  const COL_X = COL.reduce((acc, w, i) => {
    acc.push(i === 0 ? ML : acc[i - 1] + COL[i - 1]);
    return acc;
  }, []);

  const HDR_LABELS = ['No', 'Nama Barang / Jasa', 'Spesifikasi', 'Qty', 'Satuan', 'Estimasi Harga', 'Keterangan'];
  const TH = 24;

  // Draw table header with double border (matching template)
  doc.rect(ML, y, PW, TH).fill('#e8e8e8');
  doc.rect(ML, y, PW, TH).stroke(BORDER);

  HDR_LABELS.forEach((h, i) => {
    // vertical divider
    if (i > 0) {
      doc.moveTo(COL_X[i], y).lineTo(COL_X[i], y + TH).strokeColor(BORDER).lineWidth(0.8).stroke();
    }
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK)
       .text(h, COL_X[i] + 3, y + 7, {
         width: COL[i] - 6,
         align: i === 3 || i === 5 ? 'center' : 'left',
         lineBreak: false,
       });
  });
  y += TH;

  // Data rows — with page-break support
  const ROW_H   = 22;
  const minRows = Math.max(po.items.length, 3); // at least 3 rows like template
  const PAGE_BOTTOM = doc.page.height - 60;     // safe bottom threshold

  // Helper: redraw table header on a continuation page
  const drawTableHeader = (topY) => {
    doc.rect(ML, topY, PW, TH).fill('#e8e8e8');
    doc.rect(ML, topY, PW, TH).stroke(BORDER);
    HDR_LABELS.forEach((h, i) => {
      if (i > 0) {
        doc.moveTo(COL_X[i], topY).lineTo(COL_X[i], topY + TH)
           .strokeColor(BORDER).lineWidth(0.8).stroke();
      }
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK)
         .text(h, COL_X[i] + 3, topY + 7, {
           width: COL[i] - 6,
           align: i === 3 || i === 5 ? 'center' : 'left',
           lineBreak: false,
         });
    });
    return topY + TH;
  };

  let rowCursor = y; // tracks current row Y across pages

  for (let ri = 0; ri < minRows; ri++) {
    // Page-break: if the next row won't fit, add a new page and redraw header
    if (rowCursor + ROW_H > PAGE_BOTTOM) {
      doc.addPage();
      rowCursor = 50;
      rowCursor = drawTableHeader(rowCursor);
    }

    const item = po.items[ri];

    doc.rect(ML, rowCursor, PW, ROW_H).fill(ri % 2 === 0 ? '#ffffff' : '#fafafa');
    doc.rect(ML, rowCursor, PW, ROW_H).stroke(BORDER);

    COL.forEach((_, ci) => {
      if (ci > 0) {
        doc.moveTo(COL_X[ci], rowCursor).lineTo(COL_X[ci], rowCursor + ROW_H)
           .strokeColor(BORDER).lineWidth(0.5).stroke();
      }
    });

    if (item) {
      const rowVals = [
        String(item.itemNo),
        item.itemName,
        item.specification || '',
        String(item.qty),
        item.unit,
        fmtRp(item.estimatedPrice),
        item.notes || '',
      ];
      rowVals.forEach((v, ci) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(DARK)
           .text(v, COL_X[ci] + 3, rowCursor + 7, {
             width: COL[ci] - 6,
             align: ci === 3 || ci === 5 ? 'center' : 'left',
             lineBreak: false,
           });
      });
    }

    rowCursor += ROW_H;
  }

  y = rowCursor + 10;

  // ── Total ─────────────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK)
     .text(`Total Estimasi Biaya : ${fmtRp(po.totalEstimate)}`, ML, y);
  y += 10;

  doc.moveTo(ML, y).lineTo(ML + PW, y).strokeColor(BORDER).lineWidth(0.8).stroke();
  y += 10;

  // ── Justification ─────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
     .text('Alasan / Justifikasi Kebutuhan', ML, y);
  y += 14;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY)
     .text('(Jelaskan alasan pengadaan barang/jasa tersebut)', ML, y);
  y += 14;

  const justText = (po.justification || '-').trim();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
     .text(justText, ML, y, { width: PW });
  y = doc.y + 20;

  // ── Status note (if rejected) ─────────────────────────────────────────────────
  if (po.status === 'REJECTED' && po.rejectedReason) {
    doc.rect(ML, y, PW, 30).fill('#fff3f3');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#cc0000')
       .text(`Ditolak: ${po.rejectedReason}`, ML + 8, y + 10, { width: PW - 16, lineBreak: false });
    y += 40;
  }

  // ── Signature section ─────────────────────────────────────────────────────────
  if (y + 130 > doc.page.height - 50) {
    doc.addPage();
    y = 50;
  }

  const SIG_W   = Math.floor((PW - 10) / 2);
  const SIG_H   = 110;
  const sigBoxes = [
    { label: 'Diajukan',  name: sigDiajukan,  jabatan: jabatanDiajukan },
    { label: 'Disetujui', name: sigDisetujui, jabatan: jabatanDisetujui },
  ];

  sigBoxes.forEach((sig, i) => {
    const sx = ML + i * (SIG_W + 10);
    doc.rect(sx, y, SIG_W, SIG_H).fill('#ffffff').stroke(BORDER);

    // Label row
    doc.rect(sx, y, SIG_W, 20).fill('#f0f0f0');
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
       .text(sig.label, sx, y + 5, { width: SIG_W, align: 'center', lineBreak: false });

    // Signature line
    const lineY = y + SIG_H - 38;
    doc.moveTo(sx + 16, lineY).lineTo(sx + SIG_W - 16, lineY)
       .strokeColor(BORDER).lineWidth(0.5).stroke();

    // Name
    doc.font('Helvetica').fontSize(9).fillColor(DARK)
       .text(`( ${sig.name} )`, sx, lineY + 4, { width: SIG_W, align: 'center', lineBreak: false });

    // Jabatan
    if (sig.jabatan) {
      doc.font('Helvetica').fontSize(8).fillColor(GRAY)
         .text(sig.jabatan, sx, lineY + 17, { width: SIG_W, align: 'center', lineBreak: false });
    }
  });

  y += SIG_H + 10;

  // ── Attachment / Photo pages ──────────────────────────────────────────────────
  const IMG_MIME = new Set(['image/png','image/jpeg','image/jpg','image/gif','image/webp']);
  const imgAttachments = (po.attachments || []).filter(a => IMG_MIME.has(a.mimeType));

  imgAttachments.forEach((att, idx) => {
    const imgPath = urlToFilePath(att.url);
    if (!imgPath || !fs.existsSync(imgPath)) return;

    doc.addPage();
    const pageW = doc.page.width;
    const pageH = doc.page.height;

    // Mini header on photo pages
    doc.rect(0, 0, pageW, 50).fill('#f8fafc');
    doc.moveTo(0, 50).lineTo(pageW, 50).strokeColor('#e2e8f0').lineWidth(1).stroke();

    let hx = ML;
    const BURL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    if (effectiveSettings.companyLogo) {
      const lp = urlToFilePath(`${BURL}${effectiveSettings.companyLogo}`);
      if (lp && fs.existsSync(lp)) {
        try { doc.image(lp, ML, 8, { fit: [32, 32] }); hx += 40; } catch (_) {}
      }
    }
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1e293b')
       .text(effectiveSettings.companyName || 'IT Support', hx, 16,
         { width: pageW - hx - ML - 10, lineBreak: false });

    // PR number + attachment index (right side)
    doc.font('Helvetica').fontSize(8).fillColor('#64748b')
       .text(
         `${po.poNumber}  ·  Lampiran ${idx + 1} / ${imgAttachments.length}`,
         ML, 34, { width: pageW - ML * 2, align: 'right', lineBreak: false }
       );

    // ── Image ──
    const imgY    = 62;
    const maxImgH = pageH - imgY - 70;  // leave room for caption + footer (70pt)
    try {
      doc.image(imgPath, ML, imgY, {
        fit:    [pageW - ML * 2, maxImgH],
        align:  'center',
        valign: 'center',
      });
    } catch (_) {}

    // Caption above footer area
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
       .text(att.originalName, ML, pageH - 62,
         { width: pageW - ML * 2, align: 'center', lineBreak: false });
  });

  // ── Per-page footer (all pages) ───────────────────────────────────────────────
  const totalPages = doc.bufferedPageRange().count;
  for (let pi = 0; pi < totalPages; pi++) {
    doc.switchToPage(pi);
    // IMPORTANT: footerY must stay ABOVE maxY() = page.height - margins.bottom
    // Margin-aware formula prevents PDFKit from auto-adding blank pages
    const PH      = doc.page.height;
    const MB      = doc.page.margins.bottom;        // 50 for this doc
    const footerY = PH - MB - 12;                   // e.g. 841-50-12 = 779
    doc.moveTo(ML, footerY - 6).lineTo(ML + PW, footerY - 6)
       .strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#888888')
       .text(
         `${effectiveSettings.companyName || 'IT Support'}  ·  ${po.poNumber}`,
         ML, footerY, { width: PW / 2, align: 'left', lineBreak: false }
       );
    doc.font('Helvetica').fontSize(8).fillColor('#888888')
       .text(
         `Halaman ${pi + 1} / ${totalPages}`,
         ML + PW / 2, footerY, { width: PW / 2, align: 'right', lineBreak: false }
       );
  }

  // Reset cursor to top of last page before doc.end() — prevents blank flush page
  doc.switchToPage(totalPages - 1);
  doc.y = doc.page.margins.top || 50;
  doc.end();
};

// ── Attachment CRUD ────────────────────────────────────────────────────────────

// POST /purchase-orders/:id/attachments
const uploadPOAttachments = async (req, res) => {
  const { id } = req.params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) return errorResponse(res, 'Purchase Request tidak ditemukan', 404);

  if (req.user.role === 'USER' && po.createdById !== req.user.id) {
    return errorResponse(res, 'Akses ditolak', 403);
  }

  if (!req.files || req.files.length === 0) {
    return errorResponse(res, 'Tidak ada file yang diupload', 400);
  }

  const created = await Promise.all(req.files.map(file => {
    const url = buildAttachmentUrl(file);
    return prisma.pOAttachment.create({
      data: {
        filename:     file.filename,
        originalName: file.originalname,
        mimeType:     file.mimetype,
        size:         file.size,
        url,
        poId: id,
      },
    });
  }));

  return successResponse(res, created, 'Lampiran berhasil diupload', 201);
};

// DELETE /purchase-orders/:id/attachments/:attachId
const deletePOAttachment = async (req, res) => {
  const { id, attachId } = req.params;

  const att = await prisma.pOAttachment.findFirst({
    where: { id: attachId, poId: id },
  });
  if (!att) return errorResponse(res, 'Lampiran tidak ditemukan', 404);

  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (req.user.role === 'USER' && po?.createdById !== req.user.id) {
    return errorResponse(res, 'Akses ditolak', 403);
  }

  // Delete file from disk
  const filePath = urlToFilePath(att.url);
  if (filePath && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }

  await prisma.pOAttachment.delete({ where: { id: attachId } });
  return successResponse(res, null, 'Lampiran berhasil dihapus');
};

module.exports = {
  getPOs, getPOSummary, getPOById,
  createPO, updatePO, updatePOStatus, deletePO,
  generatePOPDF, uploadPOAttachments, deletePOAttachment,
};
