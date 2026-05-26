const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');
const { prisma } = require('../config/database');
const { successResponse, errorResponse, paginatedResponse, getPagination, getPaginationMeta } = require('../utils/response');
const { drawKopSurat, drawDocTitle } = require('../utils/pdfHelper');

// ── Helpers ────────────────────────────────────────────────────────────────────

const ASSET_INCLUDE = {
  assignedUser:  { select: { id: true, name: true, email: true, employeeId: true } },
  branch:        { select: { id: true, name: true, code: true, city: true } },
  department:    { select: { id: true, name: true } },
  createdBy:     { select: { id: true, name: true } },
};

// Auto-generate asset code: AST-YYYY-XXXX
const generateAssetCode = async () => {
  const year = new Date().getFullYear();
  const prefix = `AST-${year}-`;
  const last = await prisma.asset.findFirst({
    where: { assetCode: { startsWith: prefix } },
    orderBy: { assetCode: 'desc' },
    select: { assetCode: true },
  });
  const seq = last ? parseInt(last.assetCode.split('-')[2], 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// Build the public URL for an uploaded file
const buildFileUrl = (file) => {
  const relativePath = file.path.replace(process.cwd(), '').replace(/\\/g, '/');
  return `${process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`}${relativePath}`;
};

// Delete a stored file given its public URL
const deleteFileByUrl = (url) => {
  if (!url) return;
  try {
    const pathname = new URL(url).pathname;
    const filePath = path.join(process.cwd(), pathname);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
};

// Resolve a public URL to an absolute disk path (for embedding in PDF)
const urlToFilePath = (url) => {
  try {
    const pathname = new URL(url).pathname;
    return path.join(process.cwd(), pathname);
  } catch (_) {
    return null;
  }
};

// ── CRUD Controllers ───────────────────────────────────────────────────────────

// GET /assets
const getAssets = async (req, res) => {
  const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
  const { status, category, condition, branchId, departmentId, assignedUserId, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const where = {};

  if (req.user.role === 'IT_STAFF' && req.user.branchId) {
    where.branchId = req.user.branchId;
  } else if (req.user.role === 'ADMIN' && branchId) {
    where.branchId = branchId;
  }

  if (status)          where.status         = status;
  if (category)        where.category       = category;
  if (condition)       where.condition      = condition;
  if (departmentId)    where.departmentId   = departmentId;
  if (assignedUserId)  where.assignedUserId = assignedUserId;

  if (search) {
    where.OR = [
      { assetCode:    { contains: search, mode: 'insensitive' } },
      { name:         { contains: search, mode: 'insensitive' } },
      { brand:        { contains: search, mode: 'insensitive' } },
      { model:        { contains: search, mode: 'insensitive' } },
      { serialNumber: { contains: search, mode: 'insensitive' } },
      { location:     { contains: search, mode: 'insensitive' } },
    ];
  }

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({ where, include: ASSET_INCLUDE, orderBy: { [sortBy]: sortOrder }, skip, take: limit }),
    prisma.asset.count({ where }),
  ]);

  return paginatedResponse(res, assets, getPaginationMeta(total, page, limit));
};

// GET /assets/summary
const getAssetSummary = async (req, res) => {
  const where = {};
  if (req.user.role === 'IT_STAFF' && req.user.branchId) {
    where.branchId = req.user.branchId;
  } else if (req.query.branchId) {
    where.branchId = req.query.branchId;
  }

  const [total, byStatus, byCategory, byCondition] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.groupBy({ by: ['status'],    where, _count: true }),
    prisma.asset.groupBy({ by: ['category'],  where, _count: true }),
    prisma.asset.groupBy({ by: ['condition'], where, _count: true }),
  ]);

  const toMap = (arr, key) => Object.fromEntries(arr.map(r => [r[key], r._count]));

  return successResponse(res, {
    total,
    byStatus:    toMap(byStatus,    'status'),
    byCategory:  toMap(byCategory,  'category'),
    byCondition: toMap(byCondition, 'condition'),
  });
};

// GET /assets/:id
const getAssetById = async (req, res) => {
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id }, include: ASSET_INCLUDE });
  if (!asset) return errorResponse(res, 'Aset tidak ditemukan', 404);

  if (req.user.role === 'IT_STAFF' && req.user.branchId && asset.branchId !== req.user.branchId) {
    return errorResponse(res, 'Akses ditolak', 403);
  }
  return successResponse(res, asset);
};

// POST /assets  (multipart/form-data — optional photo file)
const createAsset = async (req, res) => {
  const { name, category, brand, model, serialNumber, purchaseDate, purchasePrice,
          condition, status, location, notes, assignedUserId, branchId, departmentId } = req.body;

  const assetCode = await generateAssetCode();

  let photoUrl = null;
  if (req.file) {
    photoUrl = buildFileUrl(req.file);
  }

  const asset = await prisma.asset.create({
    data: {
      assetCode,
      name,
      category,
      brand:         brand        || null,
      model:         model        || null,
      serialNumber:  serialNumber || null,
      purchaseDate:  purchaseDate ? new Date(purchaseDate) : null,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
      condition:     condition    || 'GOOD',
      status:        status       || 'AVAILABLE',
      location:      location     || null,
      notes:         notes        || null,
      photoUrl,
      assignedUserId: assignedUserId || null,
      branchId:      branchId || (req.user.role === 'IT_STAFF' ? req.user.branchId : null),
      departmentId:  departmentId || null,
      createdById:   req.user.id,
    },
    include: ASSET_INCLUDE,
  });

  return successResponse(res, asset, 'Aset berhasil ditambahkan', 201);
};

// PUT /assets/:id  (multipart/form-data — optional photo file)
const updateAsset = async (req, res) => {
  const { id } = req.params;
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return errorResponse(res, 'Aset tidak ditemukan', 404);

  if (req.user.role === 'IT_STAFF' && req.user.branchId && asset.branchId !== req.user.branchId) {
    return errorResponse(res, 'Akses ditolak', 403);
  }

  const { name, category, brand, model, serialNumber, purchaseDate, purchasePrice,
          condition, status, location, notes, assignedUserId, branchId, departmentId,
          removePhoto } = req.body;

  const data = {};
  if (name          !== undefined) data.name          = name;
  if (category      !== undefined) data.category      = category;
  if (brand         !== undefined) data.brand         = brand         || null;
  if (model         !== undefined) data.model         = model         || null;
  if (serialNumber  !== undefined) data.serialNumber  = serialNumber  || null;
  if (purchaseDate  !== undefined) data.purchaseDate  = purchaseDate  ? new Date(purchaseDate) : null;
  if (purchasePrice !== undefined) data.purchasePrice = purchasePrice ? parseFloat(purchasePrice) : null;
  if (condition     !== undefined) data.condition     = condition;
  if (status        !== undefined) data.status        = status;
  if (location      !== undefined) data.location      = location      || null;
  if (notes         !== undefined) data.notes         = notes         || null;
  if (assignedUserId !== undefined) data.assignedUserId = assignedUserId || null;
  if (branchId      !== undefined && req.user.role === 'ADMIN') data.branchId = branchId || null;
  if (departmentId  !== undefined) data.departmentId  = departmentId  || null;

  // Handle photo upload
  if (req.file) {
    // Delete old photo
    deleteFileByUrl(asset.photoUrl);
    data.photoUrl = buildFileUrl(req.file);
  } else if (removePhoto === 'true' || removePhoto === true) {
    deleteFileByUrl(asset.photoUrl);
    data.photoUrl = null;
  }

  const updated = await prisma.asset.update({ where: { id }, data, include: ASSET_INCLUDE });
  return successResponse(res, updated, 'Aset berhasil diperbarui');
};

// DELETE /assets/:id  (ADMIN only)
const deleteAsset = async (req, res) => {
  const { id } = req.params;
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return errorResponse(res, 'Aset tidak ditemukan', 404);
  // Delete photo file if exists
  deleteFileByUrl(asset.photoUrl);
  await prisma.asset.delete({ where: { id } });
  return successResponse(res, null, 'Aset berhasil dihapus');
};

// ── Surat Serah Terima Barang (PDF) ───────────────────────────────────────────

const CONDITION_LABEL = {
  EXCELLENT: 'Sangat Baik',
  GOOD:      'Baik',
  FAIR:      'Cukup',
  POOR:      'Buruk',
  DAMAGED:   'Rusak',
};

const CATEGORY_LABEL = {
  LAPTOP:         'Laptop',
  DESKTOP:        'Desktop/PC',
  PRINTER:        'Printer',
  MONITOR:        'Monitor',
  KEYBOARD:       'Keyboard',
  MOUSE:          'Mouse',
  NETWORK_DEVICE: 'Network Device',
  SERVER:         'Server',
  PHONE:          'Telepon',
  TABLET:         'Tablet',
  UPS:            'UPS',
  PROJECTOR:      'Projector',
  OTHER:          'Lainnya',
};

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
               'Juli','Agustus','September','Oktober','November','Desember'];

const fmtDate = (d) => {
  const dt = new Date(d);
  return `${dt.getDate()} ${BULAN[dt.getMonth()]} ${dt.getFullYear()}`;
};

// GET /assets/:id/handover-letter
const generateHandoverLetter = async (req, res) => {
  const { id } = req.params;

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      assignedUser: { select: { id: true, name: true, email: true, employeeId: true } },
      branch:       { select: { id: true, name: true, code: true, city: true, address: true,
                                sigCreator: true, sigChecker: true, sigApprover: true } },
      department:   { select: { id: true, name: true } },
      createdBy:    { select: { id: true, name: true } },
    },
  });

  if (!asset) return errorResponse(res, 'Aset tidak ditemukan', 404);
  if (!asset.assignedUser) {
    return errorResponse(res, 'Aset belum ditugaskan ke pengguna. Serah terima tidak dapat dibuat.', 400);
  }

  const settings = await prisma.companySetting.upsert({
    where: { id: 'singleton' }, create: {}, update: {},
  });

  const sigCreator  = (asset.branch?.sigCreator  || settings.sigCreator  || '').trim() || req.user.name;
  const sigApprover = (asset.branch?.sigApprover || settings.sigApprover || '').trim() || '(..................................)';

  const today = new Date();
  const docNo = `SSTB-${asset.assetCode}-${today.getFullYear()}`;

  const doc = new PDFDocument({ size: 'A4', margin: 55, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="SerahTerima-${asset.assetCode}.pdf"`);
  doc.pipe(res);

  // ── Constants ─────────────────────────────────────────────────────────────────
  const MARGIN_L = 55;
  const PAGE_W   = doc.page.width - MARGIN_L * 2;   // 485.28 pt on A4
  const PRIMARY  = '#2563eb';
  const DARK     = '#1e293b';
  const GRAY     = '#64748b';
  const LIGHT_BG = '#f1f5f9';
  const LINE_CLR = '#e2e8f0';
  const WHITE    = '#ffffff';

  // helper: draw a label:value pair at absolute position
  const kv = (k, v, x, y, kw, vw, fs = 9) => {
    doc.font('Helvetica-Bold').fontSize(fs).fillColor(GRAY)
       .text(k, x, y, { width: kw, lineBreak: false });
    doc.font('Helvetica').fontSize(fs).fillColor(DARK)
       .text(`: ${v}`, x + kw, y, { width: vw, lineBreak: false });
  };

  // ── Kop Surat standar — gunakan data cabang jika tersedia ───────────────────
  const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  const effectiveSettings = {
    companyName:    asset.branch?.name    || settings.companyName,
    companyAddress: asset.branch?.address || settings.companyAddress,
    companyCity:    asset.branch?.city    || settings.companyCity,
    companyPhone:   settings.companyPhone,
    companyEmail:   settings.companyEmail,
    companyLogo:    settings.companyLogo,
  };
  let y = drawKopSurat(doc, effectiveSettings, BACKEND_URL, MARGIN_L);
  y = drawDocTitle(doc, 'BERITA ACARA SERAH TERIMA BARANG', y, MARGIN_L);

  // No. dokumen di bawah judul
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
     .text(`No: ${docNo}`, MARGIN_L, y, { width: PAGE_W, align: 'center' });
  y += 10;

  doc.moveTo(MARGIN_L, y).lineTo(MARGIN_L + PAGE_W, y).strokeColor(LINE_CLR).lineWidth(1).stroke();
  y += 14;

  // ── Intro paragraph ───────────────────────────────────────────────────────────
  const DAY_NAMES = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  doc.font('Helvetica').fontSize(10).fillColor(DARK)
     .text(
       `Pada hari ini, ${DAY_NAMES[today.getDay()]} tanggal ${fmtDate(today)}, ` +
       `telah dilakukan serah terima barang inventaris IT antara pihak-pihak di bawah ini:`,
       MARGIN_L, y, { width: PAGE_W, align: 'justify' }
     );
  y = doc.y + 14;

  // ── Party boxes ───────────────────────────────────────────────────────────────
  const HALF_W = Math.floor((PAGE_W - 6) / 2);
  const PARTY_PAD = 10;
  const ROW_H = 17;

  const p1Rows = [
    ['Nama',    sigCreator],
    ['Jabatan', 'Staff IT / Admin'],
    ['Unit',    settings.companyName || 'IT Support'],
  ];
  const p2Rows = [
    ['Nama',       asset.assignedUser.name],
    ['NIP/NIK',    asset.assignedUser.employeeId || '-'],
    ['Departemen', asset.department?.name || '-'],
    ['Cabang',     asset.branch?.name || '-'],
  ];

  const drawPartyBox = (title, rows, bx, by, bw) => {
    const bh = PARTY_PAD * 2 + 14 + rows.length * ROW_H;
    doc.rect(bx, by, bw, bh).fill(LIGHT_BG);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(PRIMARY)
       .text(title, bx + PARTY_PAD, by + PARTY_PAD);
    let ry = by + PARTY_PAD + 16;
    const KW = 72, VW = bw - KW - PARTY_PAD * 2 - 4;
    rows.forEach(([k, v]) => {
      kv(k, v, bx + PARTY_PAD, ry, KW, VW, 9);
      ry += ROW_H;
    });
    return bh;
  };

  const bh1 = drawPartyBox('Pihak I - Penyerah',  p1Rows, MARGIN_L,              y, HALF_W);
  const bh2 = drawPartyBox('Pihak II - Penerima', p2Rows, MARGIN_L + HALF_W + 6, y, HALF_W);
  y += Math.max(bh1, bh2) + 16;

  // ── Section: Rincian Barang ───────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
     .text('Rincian Barang yang Diserahterimakan:', MARGIN_L, y);
  y += 16;

  // Table — total must equal PAGE_W exactly
  // [No, Nama Barang, Kode Aset, Merek/Model, Serial No., Kondisi]
  const COL  = [26, 130, 88, 100, 86, Math.round(PAGE_W - 26 - 130 - 88 - 100 - 86)];
  // COL[5] = 485 - 430 = 55 on A4 (rounded for safety)
  const COL_X = COL.reduce((acc, w, i) => {
    acc.push(i === 0 ? MARGIN_L : acc[i - 1] + COL[i - 1]);
    return acc;
  }, []);

  const HDR_LABELS = ['No.', 'Nama Barang', 'Kode Aset', 'Merek / Model', 'Serial No.', 'Kondisi'];
  const TBL_HDR_H = 22;

  doc.rect(MARGIN_L, y, PAGE_W, TBL_HDR_H).fill(PRIMARY);
  HDR_LABELS.forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(WHITE)
       .text(h, COL_X[i] + 4, y + 7, { width: COL[i] - 8, align: i === 0 ? 'center' : 'left', lineBreak: false });
  });
  y += TBL_HDR_H;

  // Data row
  const brandModel = [asset.brand, asset.model].filter(Boolean).join(' ') || '-';
  const rowVals = [
    '1',
    asset.name,
    asset.assetCode,
    brandModel,
    asset.serialNumber || '-',
    CONDITION_LABEL[asset.condition] || asset.condition,
  ];
  const DATA_ROW_H = 24;
  doc.rect(MARGIN_L, y, PAGE_W, DATA_ROW_H).fill('#f8fafc');
  doc.rect(MARGIN_L, y, PAGE_W, DATA_ROW_H).stroke(LINE_CLR);
  rowVals.forEach((v, i) => {
    doc.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(DARK)
       .text(v, COL_X[i] + 4, y + 8, { width: COL[i] - 8, align: i === 0 ? 'center' : 'left', lineBreak: false });
  });
  y += DATA_ROW_H + 8;

  // ── Detail info: 2-row x 2-col grid ──────────────────────────────────────────
  const fmtPrice = (n) => n != null
    ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
    : '-';

  const detailRows = [
    [
      ['Kategori', CATEGORY_LABEL[asset.category] || asset.category],
      ['Lokasi',   asset.location || '-'],
    ],
    [
      ['Harga Beli',    fmtPrice(asset.purchasePrice)],
      ['Tgl. Pembelian', asset.purchaseDate ? fmtDate(asset.purchaseDate) : '-'],
    ],
  ];

  const CELL_H  = 22;
  const CELL_W  = Math.floor((PAGE_W - 4) / 2);
  const D_KW    = 78;
  const D_VW    = CELL_W - D_KW - 14;

  detailRows.forEach((row, ri) => {
    const rowY = y + ri * CELL_H;
    row.forEach(([k, v], ci) => {
      const cx = MARGIN_L + ci * (CELL_W + 4);
      doc.rect(cx, rowY, CELL_W, CELL_H).fill(ri % 2 === 0 ? LIGHT_BG : WHITE);
      doc.rect(cx, rowY, CELL_W, CELL_H).stroke(LINE_CLR);
      kv(k, v, cx + 8, rowY + 7, D_KW, D_VW, 8);
    });
  });
  y += detailRows.length * CELL_H + 10;

  // ── Asset photo ───────────────────────────────────────────────────────────────
  if (asset.photoUrl) {
    const imgPath = urlToFilePath(asset.photoUrl);
    if (imgPath && fs.existsSync(imgPath)) {
      try {
        // Page-break: photo needs ~155pt — check before rendering
        if (y + 155 > doc.page.height - 80) { doc.addPage(); y = 55; }
        doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text('Foto Barang:', MARGIN_L, y);
        y += 12;
        doc.image(imgPath, MARGIN_L, y, { fit: [150, 120] });
        y += 130;
      } catch (_) {}
    }
  }

  // ── Notes (only if non-empty) ─────────────────────────────────────────────────
  const notesText = (asset.notes || '').trim();
  if (notesText && notesText !== '-') {
    const noteLineH  = 14;
    const approxLines = Math.ceil(notesText.length / 80) + 1;
    const noteBoxH   = Math.max(32, approxLines * noteLineH + 14);
    // Page-break: notes label (12) + box height + padding (10)
    if (y + 12 + noteBoxH + 10 > doc.page.height - 80) { doc.addPage(); y = 55; }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text('Catatan:', MARGIN_L, y);
    y += 12;
    doc.rect(MARGIN_L, y, PAGE_W, noteBoxH).fill(LIGHT_BG);
    doc.font('Helvetica').fontSize(9).fillColor(DARK)
       .text(notesText, MARGIN_L + 8, y + 8, { width: PAGE_W - 16 });
    y += noteBoxH + 10;
  }

  // ── Divider ───────────────────────────────────────────────────────────────────
  if (y + 140 > doc.page.height - 80) {
    doc.addPage();
    y = 55;
  }

  doc.moveTo(MARGIN_L, y).lineTo(MARGIN_L + PAGE_W, y).strokeColor(LINE_CLR).lineWidth(1).stroke();
  y += 12;

  // ── Declaration ───────────────────────────────────────────────────────────────
  doc.font('Helvetica').fontSize(9.5).fillColor(DARK)
     .text(
       'Demikian berita acara serah terima barang ini dibuat dengan sebenarnya dan ' +
       'ditandatangani oleh kedua belah pihak untuk dapat dipergunakan sebagaimana mestinya. ' +
       'Penerima bertanggung jawab atas pemeliharaan dan keselamatan barang yang telah diserahkan.',
       MARGIN_L, y, { width: PAGE_W, align: 'justify' }
     );
  y = doc.y + 20;

  // ── Signatures ────────────────────────────────────────────────────────────────
  if (y + 120 > doc.page.height - 80) {
    doc.addPage();
    y = 55;
  }

  const cityLine = (asset.branch?.city || settings.companyCity || '').toUpperCase();
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
     .text(
       `${cityLine ? cityLine + ', ' : ''}${fmtDate(today)}`,
       MARGIN_L, y, { width: PAGE_W, align: 'right' }
     );
  y += 18;

  const SIG_GAP = 10;
  const SIG_W   = Math.floor((PAGE_W - SIG_GAP * 2) / 3);
  const SIG_H   = 108;

  const sigCols = [
    { title: 'Pihak I - Penyerah',  name: sigCreator },
    { title: 'Pihak II - Penerima', name: asset.assignedUser.name },
    { title: 'Mengetahui',          name: sigApprover },
  ];

  sigCols.forEach((col, i) => {
    const sx = MARGIN_L + i * (SIG_W + SIG_GAP);
    doc.rect(sx, y, SIG_W, SIG_H).fill(LIGHT_BG);
    doc.rect(sx, y, SIG_W, SIG_H).stroke(LINE_CLR);

    // Title
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PRIMARY)
       .text(col.title, sx + 6, y + 10, { width: SIG_W - 12, align: 'center', lineBreak: false });

    // Signature line
    const lineY = y + SIG_H - 36;
    doc.moveTo(sx + 14, lineY).lineTo(sx + SIG_W - 14, lineY)
       .strokeColor('#94a3b8').lineWidth(0.5).stroke();

    // Name below line
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK)
       .text(col.name, sx + 6, lineY + 5, { width: SIG_W - 12, align: 'center' });
  });

  y += SIG_H + 10;

  // ── Footer on every page ──────────────────────────────────────────────────────
  const totalPages = doc.bufferedPageRange().count;
  for (let p = 0; p < totalPages; p++) {
    doc.switchToPage(p);
    // IMPORTANT: footerY must be ABOVE maxY() = page.height - margins.bottom
    // Using margin-aware formula prevents PDFKit from auto-adding blank pages
    const MB       = doc.page.margins.bottom;            // 55 for this doc
    const footerY  = doc.page.height - MB - 12;          // e.g. 841-55-12 = 774
    doc.moveTo(MARGIN_L, footerY - 6).lineTo(MARGIN_L + PAGE_W, footerY - 6)
       .strokeColor(LINE_CLR).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(GRAY)
       .text(
         `${settings.companyName || asset.branch?.name || 'IT Support'} - Berita Acara Serah Terima | Dicetak: ${fmtDate(today)}`,
         MARGIN_L, footerY, { width: PAGE_W * 0.65, lineBreak: false }
       );
    doc.font('Helvetica').fontSize(8).fillColor(GRAY)
       .text(`Hal. ${p + 1} / ${totalPages}`, MARGIN_L, footerY,
         { width: PAGE_W, align: 'right', lineBreak: false });
  }

  // Reset cursor to top of last page before doc.end() — prevents blank flush page
  doc.switchToPage(totalPages - 1);
  doc.y = doc.page.margins.top || 55;
  doc.end();
};

// ── Laporan Inventaris Aset (semua aset) ──────────────────────────────────────
// GET /assets/report?branchId=&category=&status=
const generateAssetReport = async (req, res) => {
  const { branchId, category, status } = req.query;

  // Build filter based on role
  const where = {};
  if (req.user.role === 'IT_STAFF' && req.user.branchId) where.branchId = req.user.branchId;
  else if (branchId) where.branchId = branchId;
  if (category) where.category = category;
  if (status)   where.status   = status;

  const assets = await prisma.asset.findMany({
    where,
    include: {
      assignedUser: { select: { id: true, name: true, employeeId: true } },
      branch:       { select: { id: true, name: true, code: true, city: true, address: true, phone: true, email: true } },
      department:   { select: { id: true, name: true } },
    },
    orderBy: [{ category: 'asc' }, { assetCode: 'asc' }],
  });

  const settings = await prisma.companySetting.upsert({ where: { id: 'singleton' }, create: {}, update: {} });

  // Branch info for effectiveSettings (use first asset's branch or filtered branchId)
  const effectiveBranchId = (req.user.role === 'IT_STAFF' && req.user.branchId) ? req.user.branchId : branchId || null;
  let branchInfo = null;
  if (effectiveBranchId) {
    branchInfo = await prisma.branch.findUnique({
      where: { id: effectiveBranchId },
      select: { name: true, code: true, city: true, address: true, phone: true, email: true, isHeadOffice: true },
    });
  }

  const BURL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  const effectiveSettings = {
    companyName:    branchInfo?.name    || settings.companyName,
    companyAddress: branchInfo?.address || settings.companyAddress,
    companyCity:    branchInfo?.city    || settings.companyCity,
    companyPhone:   branchInfo?.phone   || settings.companyPhone,
    companyEmail:   branchInfo?.email   || settings.companyEmail,
    companyLogo:    settings.companyLogo,
  };

  const CATEGORY_LABEL = {
    LAPTOP:'Laptop', DESKTOP:'Desktop/PC', PRINTER:'Printer', MONITOR:'Monitor',
    KEYBOARD:'Keyboard', MOUSE:'Mouse', NETWORK_DEVICE:'Network Device', SERVER:'Server',
    PHONE:'Telepon', TABLET:'Tablet', UPS:'UPS', PROJECTOR:'Projector', OTHER:'Lainnya',
  };
  const STATUS_LABEL = {
    AVAILABLE:'Tersedia', IN_USE:'Digunakan', MAINTENANCE:'Maintenance', RETIRED:'Pensiun', LOST:'Hilang',
  };
  const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const fmtDate = (d) => { if (!d) return '-'; const dt = new Date(d); return `${dt.getDate()} ${BULAN[dt.getMonth()]} ${dt.getFullYear()}`; };

  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Laporan-Aset-IT-${Date.now()}.pdf"`);
  doc.pipe(res);

  const ML   = 50;
  const PW   = doc.page.width - ML * 2;   // 495pt
  const DARK = '#1a1a1a';
  const GRAY = '#475569';
  const BLUE = '#2563eb';
  const LINE = '#e2e8f0';
  const LIGHT= '#f8fafc';
  const GREEN= '#16a34a';
  const RED  = '#dc2626';
  const AMBER= '#d97706';

  // ── Kop Surat ────────────────────────────────────────────────────────────────
  let y = drawKopSurat(doc, effectiveSettings, BURL, ML);
  y = drawDocTitle(doc, 'LAPORAN INVENTARIS ASET IT', y, ML);

  // ── Sub-info: tanggal cetak & cakupan ─────────────────────────────────────
  const branchLabel = branchInfo
    ? `${branchInfo.isHeadOffice ? '★ ' : ''}${branchInfo.name} (${branchInfo.code})`
    : 'Semua Cabang';
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY)
    .text(`Cabang: ${branchLabel}   |   Dicetak: ${fmtDate(new Date())}   |   Total Aset: ${assets.length}`, ML, y, { width: PW, align: 'center' });
  y += 18;

  // ── Ringkasan statistik ──────────────────────────────────────────────────────
  const statsStatus = Object.entries(
    assets.reduce((acc, a) => { acc[a.status] = (acc[a.status]||0)+1; return acc; }, {})
  ).sort((a,b)=>b[1]-a[1]);

  const statsCat = Object.entries(
    assets.reduce((acc, a) => { acc[a.category] = (acc[a.category]||0)+1; return acc; }, {})
  ).sort((a,b)=>b[1]-a[1]);

  // Status stat cards (max 5 statuses, 1 row)
  const cardW = Math.floor(PW / 5) - 4;
  const allStatuses = ['AVAILABLE','IN_USE','MAINTENANCE','RETIRED','LOST'];
  const statusColors = { AVAILABLE:'#16a34a', IN_USE:BLUE, MAINTENANCE:AMBER, RETIRED:'#64748b', LOST:RED };

  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text('RINGKASAN STATUS', ML, y);
  doc.moveTo(ML, y+14).lineTo(ML+PW, y+14).strokeColor(BLUE).lineWidth(0.8).stroke();
  y += 22;

  allStatuses.forEach((st, i) => {
    const count = assets.filter(a => a.status === st).length;
    const cx = ML + i * (cardW + 5);
    doc.roundedRect(cx, y, cardW, 40, 5).fill(statusColors[st]);
    doc.font('Helvetica-Bold').fontSize(16).fillColor('white')
       .text(String(count), cx+4, y+5, { width: cardW-8, align: 'center' });
    doc.font('Helvetica').fontSize(7).fillColor('rgba(255,255,255,0.9)')
       .text(STATUS_LABEL[st]||st, cx+4, y+26, { width: cardW-8, align: 'center' });
  });
  y += 52;

  // Category distribution bars
  if (statsCat.length > 0) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text('DISTRIBUSI KATEGORI', ML, y);
    doc.moveTo(ML, y+14).lineTo(ML+PW, y+14).strokeColor(BLUE).lineWidth(0.8).stroke();
    y += 22;

    const maxCat = statsCat[0][1];
    const BAR_COLORS = [BLUE,'#7c3aed',GREEN,AMBER,RED,'#0891b2','#9333ea','#dc2626'];
    statsCat.slice(0,8).forEach(([cat, cnt], i) => {
      const barW = Math.max(16, Math.round((cnt / maxCat) * (PW - 130)));
      doc.rect(ML, y, barW, 13).fill(BAR_COLORS[i % BAR_COLORS.length]);
      doc.font('Helvetica').fontSize(8).fillColor(DARK)
         .text(CATEGORY_LABEL[cat]||cat, ML + barW + 6, y+3, { width: 90, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8).fillColor(BAR_COLORS[i % BAR_COLORS.length])
         .text(String(cnt), ML + barW + 100, y+3, { lineBreak: false });
      y += 18;
    });
    y += 8;
  }

  // ── Tabel Aset ───────────────────────────────────────────────────────────────
  if (y > 580) { doc.addPage(); y = 50; }
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text('DAFTAR ASET', ML, y);
  doc.moveTo(ML, y+14).lineTo(ML+PW, y+14).strokeColor(BLUE).lineWidth(0.8).stroke();
  y += 22;

  // Column defs — total = 495
  const cols = [
    { label: 'Kode Aset',  w: 70 },
    { label: 'Nama Aset',  w: 120 },
    { label: 'Kategori',   w: 70 },
    { label: 'Merek',      w: 60 },
    { label: 'Status',     w: 62 },
    { label: 'Pengguna',   w: 65 },
    { label: 'Departemen', w: 48 },
  ];
  // total = 70+120+70+60+62+65+48 = 495 ✓

  const statusBg   = { AVAILABLE:'#dcfce7', IN_USE:'#dbeafe', MAINTENANCE:'#fef9c3', RETIRED:'#f1f5f9', LOST:'#fee2e2' };
  const statusText = { AVAILABLE:'#166534', IN_USE:'#1e40af', MAINTENANCE:'#92400e', RETIRED:'#475569', LOST:'#991b1b' };

  const drawTableHeader = (yPos) => {
    doc.rect(ML, yPos, PW, 18).fill(DARK);
    let cx = ML;
    cols.forEach(col => {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('white')
         .text(col.label, cx+4, yPos+5, { width: col.w-8, ellipsis: true });
      cx += col.w;
    });
    return yPos + 18;
  };

  y = drawTableHeader(y);

  const PB = doc.page.height - doc.page.margins.bottom - 60;
  assets.forEach((asset, idx) => {
    if (y + 16 > PB) { doc.addPage(); y = drawTableHeader(50); }
    const rowH = 16;
    const bg = idx % 2 === 0 ? 'white' : LIGHT;
    doc.rect(ML, y, PW, rowH).fill(bg);

    const rowData = [
      asset.assetCode,
      asset.name,
      CATEGORY_LABEL[asset.category] || asset.category,
      asset.brand || '-',
      STATUS_LABEL[asset.status]  || asset.status,
      asset.assignedUser?.name || '-',
      asset.department?.name   || '-',
    ];

    let cx = ML;
    rowData.forEach((val, ci) => {
      if (ci === 4) { // Status — colored badge background
        const sbg  = statusBg[asset.status]  || '#f1f5f9';
        const stxt = statusText[asset.status] || DARK;
        doc.rect(cx+2, y+2, cols[ci].w-4, rowH-4).fill(sbg);
        doc.font('Helvetica').fontSize(7).fillColor(stxt)
           .text(String(val), cx+4, y+5, { width: cols[ci].w-8, ellipsis: true });
      } else {
        doc.font('Helvetica').fontSize(7).fillColor(DARK)
           .text(String(val), cx+4, y+5, { width: cols[ci].w-8, ellipsis: true });
      }
      cx += cols[ci].w;
    });
    doc.moveTo(ML, y+rowH).lineTo(ML+PW, y+rowH).strokeColor(LINE).lineWidth(0.3).stroke();
    y += rowH;
  });

  if (assets.length === 0) {
    doc.rect(ML, y, PW, 32).fill(LIGHT);
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
       .text('Tidak ada data aset.', ML, y+10, { width: PW, align: 'center' });
    y += 32;
  }
  y += 16;

  // ── Halaman TTD ─────────────────────────────────────────────────────────────
  doc.addPage();
  let yS = drawKopSurat(doc, effectiveSettings, BURL, ML);
  yS = drawDocTitle(doc, 'LEMBAR PENGESAHAN', yS, ML);

  // Info box
  const cityLine = (effectiveSettings.companyCity || '').toUpperCase();
  const nowDate  = fmtDate(new Date());
  doc.roundedRect(ML, yS, PW, 56, 6).fill(LIGHT).stroke(LINE);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text('INFORMASI LAPORAN', ML+14, yS+10);
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY);
  doc.text(`Total Aset     : ${assets.length} aset`, ML+14, yS+24);
  doc.text(`Cabang         : ${branchLabel}`,         ML+14, yS+36);
  doc.text(`Dicetak        : ${nowDate}`,              ML+PW/2, yS+24);
  doc.text(`Dibuat oleh    : ${req.user.name}`,        ML+PW/2, yS+36);
  yS += 70;

  doc.font('Helvetica').fontSize(9).fillColor(DARK)
     .text('Dengan ini kami menyatakan bahwa daftar inventaris aset IT di atas adalah benar dan telah diperiksa sesuai kondisi fisik dan data sistem yang berlaku.', ML, yS, { width: PW, align: 'justify', lineGap: 3 });
  yS += 48;
  doc.moveTo(ML, yS).lineTo(ML+PW, yS).strokeColor('#cbd5e1').lineWidth(0.8).stroke();
  yS += 20;

  // 3 TTD boxes
  const sigW2 = Math.floor(PW/3) - 10;
  const sigs  = [
    { title: 'Dibuat oleh,',    role: 'Staff IT / Teknisi',    dept: 'Divisi Teknologi Informasi' },
    { title: 'Diperiksa oleh,', role: 'Kepala IT / Supervisor', dept: 'Divisi Teknologi Informasi' },
    { title: 'Disetujui oleh,', role: 'Manager / Direktur',     dept: 'Manajemen Perusahaan' },
  ];
  const sigColors = ['#eef2ff','#f0fdf4','#fff7ed'];
  const sigLabel  = ['#4f46e5','#059669','#d97706'];
  sigs.forEach((sig, i) => {
    const sx = ML + i * (sigW2 + 15);
    doc.roundedRect(sx, yS, sigW2, 130, 8).fill('#fafafa').stroke(LINE);
    doc.roundedRect(sx, yS, sigW2, 24, 8).fill(sigColors[i]);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(sigLabel[i])
       .text(sig.title, sx, yS+8, { width: sigW2, align: 'center' });
    const lineY = yS + 92;
    doc.moveTo(sx+14, lineY).lineTo(sx+sigW2-14, lineY).strokeColor('#9ca3af').lineWidth(0.8).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
       .text(sig.role, sx, lineY+8, { width: sigW2, align: 'center' });
    doc.font('Helvetica').fontSize(7).fillColor(GRAY)
       .text(sig.dept, sx, lineY+19, { width: sigW2, align: 'center' });
  });
  yS += 145;

  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
     .text(`${cityLine ? cityLine+', ' : ''}${nowDate}`, ML, yS, { width: PW, align: 'right' });

  // ── Footer semua halaman ─────────────────────────────────────────────────────
  const totalPgs = doc.bufferedPageRange().count;
  for (let p = 0; p < totalPgs; p++) {
    doc.switchToPage(p);
    const fY = doc.page.height - doc.page.margins.bottom - 12;
    doc.moveTo(ML, fY-6).lineTo(ML+PW, fY-6).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
       .text(`${effectiveSettings.companyName||'IT Support'}  ·  Laporan Inventaris Aset IT`, ML, fY, { width: PW/2, lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
       .text(`Hal. ${p+1} / ${totalPgs}`, ML+PW/2, fY, { width: PW/2, align: 'right', lineBreak: false });
  }
  doc.switchToPage(totalPgs-1);
  doc.y = doc.page.margins.top || 50;
  doc.end();
};

module.exports = {
  getAssets, getAssetSummary, getAssetById,
  createAsset, updateAsset, deleteAsset,
  generateHandoverLetter, generateAssetReport,
};
