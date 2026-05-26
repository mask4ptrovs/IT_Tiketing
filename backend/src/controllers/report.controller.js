const { prisma } = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { drawKopSurat, drawDocTitle } = require('../utils/pdfHelper');

const getReportData = async (filters, userBranchId = null) => {
  const { dateFrom, dateTo, departmentId, assigneeId, status, priority, branchId } = filters;

  const where = {};
  // Branch scoping: explicit query param > user's branch (IT_STAFF) > none (ADMIN all)
  const effectiveBranchId = branchId || userBranchId || null;
  if (effectiveBranchId) where.branchId = effectiveBranchId;

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59');
  }
  if (departmentId) where.departmentId = departmentId;
  if (assigneeId) where.assigneeId = assigneeId;
  if (status) where.status = status;
  if (priority) where.priority = priority;

  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      creator: { select: { name: true, email: true, employeeId: true, department: { select: { name: true } } } },
      assignee: { select: { name: true, email: true, employeeId: true } },
      department: { select: { name: true } },
      category: { select: { name: true, color: true } },
      branch: { select: { name: true, code: true, city: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return tickets;
};

const getReport = async (req, res) => {
  const userBranchId = req.user.role === 'IT_STAFF' ? (req.user.branchId || null) : null;
  const tickets = await getReportData(req.query, userBranchId);

  const summary = {
    total: tickets.length,
    byStatus: {},
    byPriority: {},
    byCategory: {},
    slaBreached: tickets.filter(t => t.slaBreached).length,
    resolvedWithinSLA: tickets.filter(t =>
      (t.status === 'RESOLVED' || t.status === 'CLOSED') && !t.slaBreached
    ).length,
    avgResolutionHours: 0,
  };

  let totalResolutionMs = 0;
  let resolvedCount = 0;
  tickets.forEach(t => {
    summary.byStatus[t.status] = (summary.byStatus[t.status] || 0) + 1;
    summary.byPriority[t.priority] = (summary.byPriority[t.priority] || 0) + 1;
    summary.byCategory[t.category?.name || 'Unknown'] = (summary.byCategory[t.category?.name || 'Unknown'] || 0) + 1;
    if (t.resolvedAt) {
      totalResolutionMs += new Date(t.resolvedAt) - new Date(t.createdAt);
      resolvedCount++;
    }
  });

  if (resolvedCount > 0) {
    summary.avgResolutionHours = Math.round(totalResolutionMs / resolvedCount / 3600000);
  }

  return successResponse(res, { tickets, summary });
};

// ─────────────────────────────────────────────
// EXCEL EXPORT — Modern & Styled
// ─────────────────────────────────────────────
const exportExcel = async (req, res) => {
  const userBranchId = req.user.role === 'IT_STAFF' ? (req.user.branchId || null) : null;
  const tickets = await getReportData(req.query, userBranchId);
  const { dateFrom, dateTo, sigCreator = '', sigChecker = '', sigApprover = '', branchId } = req.query;

  // Load company settings
  const { prisma: db } = require('../config/database');
  const company = await db.companySetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  // Load branch name if scoped
  const effectiveBranchId = branchId || userBranchId;
  let branchName = null;
  if (effectiveBranchId) {
    const br = await db.branch.findUnique({ where: { id: effectiveBranchId }, select: { name: true, code: true, city: true } });
    if (br) branchName = `${br.name} (${br.code})${br.city ? ' — ' + br.city : ''}`;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = company.companyName || 'IT Ticketing System';
  workbook.created = new Date();

  // ── Summary Sheet ──
  const summarySheet = workbook.addWorksheet('Ringkasan', {
    properties: { tabColor: { argb: 'FF4F46E5' } },
  });

  summarySheet.mergeCells('A1:F1');
  summarySheet.getCell('A1').value = `LAPORAN SISTEM TICKETING IT — ${(company.companyName || 'IT Support').toUpperCase()}`;
  summarySheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  summarySheet.getRow(1).height = 40;

  summarySheet.mergeCells('A2:F2');
  const period = dateFrom && dateTo
    ? `Periode: ${new Date(dateFrom).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} — ${new Date(dateTo).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : 'Semua Periode';
  summarySheet.getCell('A2').value = period;
  summarySheet.getCell('A2').font = { size: 11, color: { argb: 'FF6B7280' } };
  summarySheet.getCell('A2').alignment = { horizontal: 'center' };
  summarySheet.getRow(2).height = 22;

  // Company info row
  const companyInfo = [
    company.companyAddress,
    company.companyCity,
    company.companyPhone,
    company.companyEmail,
  ].filter(Boolean).join('  |  ');
  if (companyInfo) {
    summarySheet.mergeCells('A3:F3');
    summarySheet.getCell('A3').value = companyInfo;
    summarySheet.getCell('A3').font = { size: 9, color: { argb: 'FF9CA3AF' } };
    summarySheet.getCell('A3').alignment = { horizontal: 'center' };
    summarySheet.getRow(3).height = 16;
  }

  // Branch row (only if scoped)
  if (branchName) {
    summarySheet.mergeCells('A4:F4');
    summarySheet.getCell('A4').value = `📍 Cabang: ${branchName}`;
    summarySheet.getCell('A4').font = { size: 9, bold: true, color: { argb: 'FF4F46E5' } };
    summarySheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    summarySheet.getCell('A4').alignment = { horizontal: 'center' };
    summarySheet.getRow(4).height = 16;
  }

  summarySheet.addRow([]);

  // Stats
  const statsData = [
    ['STATISTIK', '', '', '', '', ''],
    ['Total Tiket', tickets.length, '', 'SLA Breached', tickets.filter(t => t.slaBreached).length, ''],
    ['Open', tickets.filter(t => t.status === 'OPEN').length, '', 'Pending', tickets.filter(t => t.status === 'PENDING').length, ''],
    ['On Progress', tickets.filter(t => t.status === 'ON_PROGRESS').length, '', 'Resolved', tickets.filter(t => t.status === 'RESOLVED').length, ''],
    ['Closed', tickets.filter(t => t.status === 'CLOSED').length, '', 'Diselesaikan Tepat Waktu', tickets.filter(t => (t.status === 'RESOLVED' || t.status === 'CLOSED') && !t.slaBreached).length, ''],
  ];

  statsData.forEach((row, i) => {
    const r = summarySheet.addRow(row);
    if (i === 0) {
      r.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
      });
      r.height = 22;
    } else {
      r.getCell(1).font = { bold: true, color: { argb: 'FF374151' } };
      r.getCell(2).font = { bold: true, size: 14, color: { argb: 'FF4F46E5' } };
      r.getCell(4).font = { bold: true, color: { argb: 'FF374151' } };
      r.getCell(5).font = { bold: true, size: 14, color: { argb: 'FF4F46E5' } };
    }
  });

  summarySheet.columns = [
    { width: 22 }, { width: 14 }, { width: 4 },
    { width: 28 }, { width: 14 }, { width: 4 },
  ];

  // ── Tickets Sheet ──
  const sheet = workbook.addWorksheet('Data Tiket', {
    properties: { tabColor: { argb: 'FF10B981' } },
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  // Title
  sheet.mergeCells('A1:L1');
  sheet.getCell('A1').value = 'DATA TIKET IT — ' + (period);
  sheet.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  sheet.addRow([]);

  const headerRow = sheet.addRow([
    'No', 'No. Tiket', 'Judul Masalah', 'Kategori', 'Prioritas', 'Status',
    'Departemen', 'Pelapor', 'Teknisi', 'SLA', 'Tgl Dibuat', 'Tgl Selesai',
  ]);

  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF374151' } },
      bottom: { style: 'thin', color: { argb: 'FF374151' } },
      left: { style: 'thin', color: { argb: 'FF374151' } },
      right: { style: 'thin', color: { argb: 'FF374151' } },
    };
  });
  headerRow.height = 28;

  const statusColors = {
    OPEN: 'FFdbeafe', ON_PROGRESS: 'FFfef3c7', PENDING: 'FFf3f4f6',
    RESOLVED: 'FFd1fae5', CLOSED: 'FFe5e7eb',
  };
  const priorityColors = {
    LOW: 'FFd1fae5', MEDIUM: 'FFdbeafe', HIGH: 'FFfef3c7', CRITICAL: 'FFfee2e2',
  };

  tickets.forEach((ticket, idx) => {
    const row = sheet.addRow([
      idx + 1,
      ticket.ticketNo,
      ticket.title,
      ticket.category?.name || '-',
      ticket.priority,
      ticket.status.replace('_', ' '),
      ticket.department?.name || '-',
      ticket.creator?.name || '-',
      ticket.assignee?.name || '-',
      ticket.slaBreached ? 'BREACHED' : 'OK',
      ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('id-ID') : '-',
      ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleDateString('id-ID') : '-',
    ]);

    const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9FAFB';
    row.eachCell((cell, colNo) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
        right: { style: 'hair', color: { argb: 'FFE5E7EB' } },
      };
    });

    // Color priority and status cells
    const statusCell = row.getCell(6);
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors[ticket.status] || 'FFf3f4f6' } };
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
    statusCell.font = { bold: true, size: 9 };

    const priorityCell = row.getCell(5);
    priorityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priorityColors[ticket.priority] || 'FFf3f4f6' } };
    priorityCell.alignment = { horizontal: 'center', vertical: 'middle' };
    priorityCell.font = { bold: true, size: 9 };

    const slaCell = row.getCell(10);
    slaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ticket.slaBreached ? 'FFfee2e2' : 'FFd1fae5' } };
    slaCell.font = { bold: true, color: { argb: ticket.slaBreached ? 'FFDC2626' : 'FF059669' } };
    slaCell.alignment = { horizontal: 'center', vertical: 'middle' };

    row.height = 22;
  });

  sheet.columns = [
    { width: 5 }, { width: 18 }, { width: 35 }, { width: 14 }, { width: 12 },
    { width: 14 }, { width: 18 }, { width: 20 }, { width: 20 }, { width: 12 },
    { width: 14 }, { width: 14 },
  ];

  // ── Signature Sheet ──
  const sigSheet = workbook.addWorksheet('Tanda Tangan');

  sigSheet.mergeCells('A1:F1');
  sigSheet.getCell('A1').value = 'LEMBAR PENGESAHAN LAPORAN';
  sigSheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sigSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  sigSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sigSheet.getRow(1).height = 36;

  sigSheet.addRow([]);
  sigSheet.addRow(['Laporan ini telah diperiksa dan disetujui oleh pihak yang bertanda tangan di bawah ini:']);
  sigSheet.addRow([]);

  // Signature blocks
  const sigData = [
    { title: 'Dibuat oleh', role: 'Staff IT / Teknisi', col: 'A' },
    { title: 'Diperiksa oleh', role: 'Kepala IT / Supervisor', col: 'C' },
    { title: 'Disetujui oleh', role: 'Manager / Admin', col: 'E' },
  ];

  // Row 5 - titles
  sigSheet.getCell('A5').value = 'Dibuat oleh,';
  sigSheet.getCell('C5').value = 'Diperiksa oleh,';
  sigSheet.getCell('E5').value = 'Disetujui oleh,';
  ['A5', 'C5', 'E5'].forEach(c => {
    sigSheet.getCell(c).font = { bold: true, size: 11 };
    sigSheet.getCell(c).alignment = { horizontal: 'center' };
  });

  // Row 6-10 - blank for signature
  for (let r = 6; r <= 11; r++) sigSheet.getRow(r).height = 18;

  // Row 12 - signature lines (names if provided)
  const sigNames = [sigCreator, sigChecker, sigApprover];
  ['A12', 'C12', 'E12'].forEach((c, i) => {
    sigSheet.getCell(c).value = sigNames[i] ? `( ${sigNames[i]} )` : '( ________________________________ )';
    sigSheet.getCell(c).alignment = { horizontal: 'center' };
    sigSheet.getCell(c).font = { size: 11, bold: !!sigNames[i] };
  });

  // Row 13 - role labels
  sigSheet.getCell('A13').value = 'Staff IT / Teknisi';
  sigSheet.getCell('C13').value = 'Kepala IT / Supervisor';
  sigSheet.getCell('E13').value = 'Manager / Admin';
  ['A13', 'C13', 'E13'].forEach(c => {
    sigSheet.getCell(c).font = { bold: true, size: 10 };
    sigSheet.getCell(c).alignment = { horizontal: 'center' };
  });

  // Row 14 - date
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  sigSheet.addRow([]);
  const dateRow = sigSheet.addRow([`Tanggal: _________________, ${today.split(' ').slice(-2).join(' ')}`]);
  dateRow.getCell(1).font = { size: 10, color: { argb: 'FF6B7280' } };

  sigSheet.columns = [{ width: 30 }, { width: 4 }, { width: 30 }, { width: 4 }, { width: 30 }, { width: 4 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Laporan-IT-${Date.now()}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
};

// ─────────────────────────────────────────────
// PDF EXPORT — Professional + Tanda Tangan
// ─────────────────────────────────────────────
const exportPDF = async (req, res) => {
  const userBranchId = req.user.role === 'IT_STAFF' ? (req.user.branchId || null) : null;
  const tickets = await getReportData(req.query, userBranchId);
  const { dateFrom, dateTo, sigCreator = '', sigChecker = '', sigApprover = '', branchId } = req.query;

  // Load company settings
  const { prisma: db } = require('../config/database');
  const company = await db.companySetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  // Load branch info if scoped
  const effectiveBranchId = branchId || userBranchId;
  let branchInfo = null;
  if (effectiveBranchId) {
    branchInfo = await db.branch.findUnique({
      where: { id: effectiveBranchId },
      select: { name: true, code: true, city: true, address: true, phone: true, email: true, isHeadOffice: true },
    });
  }

  const doc = new PDFDocument({
    margin: 50,
    size: 'A4',
    bufferPages: true,
    info: {
      Title: `Laporan IT - ${company.companyName}`,
      Author: company.companyName,
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Laporan-IT-${Date.now()}.pdf"`);
  doc.pipe(res);

  const ML = 50;
  const W = doc.page.width - ML * 2; // usable width
  const PURPLE = '#4F46E5';
  const DARK = '#1F2937';
  const GRAY = '#6B7280';
  const LIGHT = '#F3F4F6';
  const GREEN = '#059669';
  const RED = '#DC2626';
  const BURL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

  const drawHLine = (y, color = '#E5E7EB', w = W) => {
    doc.moveTo(ML, y).lineTo(ML + w, y).strokeColor(color).lineWidth(0.5).stroke();
  };

  // ── Kop Surat — gunakan data cabang jika tersedia ──────────────────────────
  const effectiveSettings = {
    companyName:    branchInfo?.name    || company.companyName,
    companyAddress: branchInfo?.address || company.companyAddress,
    companyCity:    branchInfo?.city    || company.companyCity,
    companyPhone:   branchInfo?.phone   || company.companyPhone,
    companyEmail:   branchInfo?.email   || company.companyEmail,
    companyLogo:    company.companyLogo,
  };
  let y = drawKopSurat(doc, effectiveSettings, BURL, ML);
  y = drawDocTitle(doc, 'LAPORAN IT', y, ML);

  // Periode & cabang sebagai sub-info di bawah judul
  const periodLabel = dateFrom && dateTo
    ? `${new Date(dateFrom).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} s/d ${new Date(dateTo).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : 'Semua Periode';
  const branchLabel = branchInfo
    ? `${branchInfo.isHeadOffice ? '★ ' : ''}${branchInfo.name} (${branchInfo.code})${branchInfo.city ? ' — ' + branchInfo.city : ''}`
    : 'Semua Cabang';
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY)
    .text(`Periode: ${periodLabel}   |   Cabang: ${branchLabel}   |   Dicetak: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`, ML, y, { width: W, align: 'center' });
  y += 18;

  // ── RINGKASAN STATISTIK ───────────────────
  doc.fontSize(11).font('Helvetica-Bold').fillColor(DARK).text('RINGKASAN STATISTIK', ML, y);
  drawHLine(y + 16, PURPLE);
  y += 24;

  const resolved = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
  const slaOK = tickets.filter(t => (t.status === 'RESOLVED' || t.status === 'CLOSED') && !t.slaBreached).length;
  const slaRate = resolved > 0 ? Math.round((slaOK / resolved) * 100) : 0;

  const statCards = [
    { label: 'Total Tiket', value: tickets.length, color: PURPLE },
    { label: 'Open', value: tickets.filter(t => t.status === 'OPEN').length, color: '#3B82F6' },
    { label: 'On Progress', value: tickets.filter(t => t.status === 'ON_PROGRESS').length, color: '#F59E0B' },
    { label: 'Resolved', value: resolved, color: GREEN },
    { label: 'SLA Breached', value: tickets.filter(t => t.slaBreached).length, color: RED },
    { label: 'SLA Rate', value: `${slaRate}%`, color: slaRate >= 80 ? GREEN : RED },
  ];

  const cardW = Math.floor(W / 3) - 6;
  const cardH = 48;
  statCards.forEach((s, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = 50 + col * (cardW + 9);
    const cy = y + row * (cardH + 8);

    doc.roundedRect(cx, cy, cardW, cardH, 6).fill(s.color);
    doc.fontSize(18).font('Helvetica-Bold').fillColor('white')
      .text(String(s.value), cx + 10, cy + 8, { width: cardW - 20, align: 'left' });
    doc.fontSize(8).font('Helvetica').fillColor('rgba(255,255,255,0.85)')
      .text(s.label, cx + 10, cy + 31, { width: cardW - 20 });
  });

  y += 2 * (cardH + 8) + 20;

  // ── DISTRIBUSI KATEGORI ───────────────────
  const catMap = {};
  tickets.forEach(t => {
    const name = t.category?.name || 'Lainnya';
    catMap[name] = (catMap[name] || 0) + 1;
  });
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  if (cats.length > 0) {
    doc.fontSize(11).font('Helvetica-Bold').fillColor(DARK).text('DISTRIBUSI KATEGORI', 50, y);
    drawHLine(y + 16, PURPLE);
    y += 24;

    const barColors = [PURPLE, '#3B82F6', GREEN, '#F59E0B', RED, '#8B5CF6', '#6B7280'];
    const maxCount = cats[0][1];
    cats.slice(0, 6).forEach(([name, count], i) => {
      const barW = Math.max(20, Math.round((count / maxCount) * (W - 120)));
      doc.rect(50, y, barW, 14).fill(barColors[i % barColors.length]);
      doc.fontSize(8).font('Helvetica').fillColor(DARK)
        .text(name, 50 + barW + 6, y + 3, { width: 80 });
      doc.fontSize(8).font('Helvetica-Bold').fillColor(barColors[i % barColors.length])
        .text(String(count), 50 + barW + 90, y + 3);
      y += 20;
    });
    y += 10;
  }

  // ── TABEL TIKET ───────────────────────────
  if (y > 580) { doc.addPage(); y = 50; }

  doc.fontSize(11).font('Helvetica-Bold').fillColor(DARK).text('DETAIL TIKET', 50, y);
  drawHLine(y + 16, PURPLE);
  y += 22;

  // Table headers
  // Lebar kolom disesuaikan agar total = W (495pt)
  const cols = [
    { label: 'No. Tiket', w: 75 },
    { label: 'Judul',     w: 152 },
    { label: 'Kategori',  w: 65 },
    { label: 'Prioritas', w: 52 },
    { label: 'Status',    w: 62 },
    { label: 'Pelapor',   w: 65 },
    { label: 'SLA',       w: 24 },
  ];

  // Header row
  doc.rect(50, y, W, 18).fill(DARK);
  let cx = 50;
  cols.forEach(col => {
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('white')
      .text(col.label, cx + 4, y + 5, { width: col.w - 8, ellipsis: true });
    cx += col.w;
  });
  y += 18;

  const statusColors2 = {
    OPEN: '#DBEAFE', ON_PROGRESS: '#FEF3C7', PENDING: '#F3F4F6',
    RESOLVED: '#D1FAE5', CLOSED: '#E5E7EB',
  };
  const priorityColors2 = {
    LOW: '#D1FAE5', MEDIUM: '#DBEAFE', HIGH: '#FEF3C7', CRITICAL: '#FEE2E2',
  };

  const maxRows = 25;
  tickets.slice(0, maxRows).forEach((ticket, idx) => {
    if (y > 720) { doc.addPage(); y = 50; }

    const rowH = 16;
    const bg = idx % 2 === 0 ? 'white' : '#F9FAFB';
    doc.rect(50, y, W, rowH).fill(bg);

    cx = 50;
    const rowData = [
      ticket.ticketNo,
      ticket.title,
      ticket.category?.name || '-',
      ticket.priority,
      ticket.status.replace('_', ' '),
      ticket.creator?.name || '-',
      ticket.slaBreached ? 'BREACH' : 'OK',
    ];

    rowData.forEach((val, ci) => {
      const col = cols[ci];
      // Color cells
      if (ci === 3) {
        doc.rect(cx + 2, y + 2, col.w - 4, rowH - 4)
          .fill(priorityColors2[ticket.priority] || LIGHT);
      }
      if (ci === 4) {
        doc.rect(cx + 2, y + 2, col.w - 4, rowH - 4)
          .fill(statusColors2[ticket.status] || LIGHT);
      }
      if (ci === 6) {
        doc.rect(cx + 2, y + 2, col.w - 4, rowH - 4)
          .fill(ticket.slaBreached ? '#FEE2E2' : '#D1FAE5');
      }

      doc.fontSize(7).font('Helvetica').fillColor(DARK)
        .text(String(val), cx + 4, y + 5, { width: col.w - 8, ellipsis: true });
      cx += col.w;
    });

    // bottom border
    doc.moveTo(50, y + rowH).lineTo(50 + W, y + rowH)
      .strokeColor('#E5E7EB').lineWidth(0.3).stroke();
    y += rowH;
  });

  if (tickets.length > maxRows) {
    y += 6;
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
      .text(`... dan ${tickets.length - maxRows} tiket lainnya. Lihat file Excel untuk data lengkap.`, 50, y);
    y += 16;
  }

  // ── HALAMAN TANDA TANGAN ──────────────────
  doc.addPage();
  y = drawKopSurat(doc, effectiveSettings, BURL, ML);
  y = drawDocTitle(doc, 'LEMBAR PENGESAHAN', y, ML);

  // Info box — height adapts when branch is shown
  const infoBoxH = branchInfo ? 84 : 70;
  doc.roundedRect(50, y, W, infoBoxH, 6).fill('#F8FAFC').stroke('#E5E7EB');
  doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK).text('INFORMASI LAPORAN', 66, y + 10);
  doc.fontSize(8.5).font('Helvetica').fillColor(GRAY);
  doc.text(`Periode        : ${periodLabel}`, 66, y + 25);
  doc.text(`Total Tiket    : ${tickets.length} tiket`, 66, y + 37);
  doc.text(`Dicetak        : ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`, 66, y + 49);
  doc.text(`Resolved SLA   : ${slaRate}%`, 300, y + 25);
  doc.text(`SLA Breached   : ${tickets.filter(t => t.slaBreached).length} tiket`, 300, y + 37);
  doc.text(`Avg Resolved   : ${tickets.filter(t => t.resolvedAt).length} tiket selesai`, 300, y + 49);
  if (branchInfo) {
    const branchLabel = `${branchInfo.isHeadOffice ? '★ ' : ''}${branchInfo.name} (${branchInfo.code})${branchInfo.city ? ' — ' + branchInfo.city : ''}`;
    doc.fontSize(8).font('Helvetica-Bold').fillColor(PURPLE)
      .text(`Cabang         : ${branchLabel}`, 66, y + 64);
  }

  y += infoBoxH + 16;

  // Pernyataan
  doc.fontSize(9).font('Helvetica').fillColor(DARK)
    .text(
      'Dengan ini kami menyatakan bahwa laporan ticketing IT di atas adalah benar dan telah ' +
      'diperiksa sesuai dengan data yang ada pada sistem. Laporan ini dibuat untuk keperluan ' +
      'dokumentasi dan evaluasi performa layanan IT perusahaan.',
      50, y, { width: W, align: 'justify', lineGap: 3 }
    );

  y += 55;
  drawHLine(y, '#CBD5E1');
  y += 20;

  // ── 3 KOLOM TANDA TANGAN ──
  const sigW = Math.floor(W / 3) - 10;
  const signatures = [
    { title: 'Dibuat oleh,', role: 'Staff IT / Teknisi', dept: 'Divisi Teknologi Informasi', name: sigCreator },
    { title: 'Diperiksa oleh,', role: 'Kepala IT / Supervisor', dept: 'Divisi Teknologi Informasi', name: sigChecker },
    { title: 'Disetujui oleh,', role: 'Manager / Direktur', dept: 'Manajemen Perusahaan', name: sigApprover },
  ];

  signatures.forEach((sig, i) => {
    const sx = 50 + i * (sigW + 15);

    // Box
    doc.roundedRect(sx, y, sigW, 160, 8)
      .fill('#FAFAFA').stroke('#E5E7EB');

    // Top label
    doc.roundedRect(sx, y, sigW, 26, 8).fill(i === 0 ? '#EEF2FF' : i === 1 ? '#F0FDF4' : '#FFF7ED');

    const labelColor = i === 0 ? '#4F46E5' : i === 1 ? '#059669' : '#D97706';
    doc.fontSize(9).font('Helvetica-Bold').fillColor(labelColor)
      .text(sig.title, sx, y + 8, { width: sigW, align: 'center' });

    // Signature area — blank space for actual signature

    // Signature line
    const lineY = y + 115;
    doc.moveTo(sx + 15, lineY).lineTo(sx + sigW - 15, lineY)
      .strokeColor('#9CA3AF').lineWidth(1).stroke();

    // Name — use provided name or blank line
    if (sig.name && sig.name.trim()) {
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(DARK)
        .text(sig.name.trim(), sx, lineY + 6, { width: sigW, align: 'center' });
    } else {
      doc.fontSize(8).font('Helvetica').fillColor('#D1D5DB')
        .text('(                                  )', sx, lineY + 6, { width: sigW, align: 'center' });
    }

    // NIP / role
    doc.fontSize(7.5).font('Helvetica').fillColor(GRAY)
      .text(sig.role, sx, lineY + 22, { width: sigW, align: 'center' });
    doc.fontSize(7).fillColor(GRAY)
      .text(sig.dept, sx, lineY + 33, { width: sigW, align: 'center' });
  });

  y += 175;

  // ── TANGGAL ──
  const cityName = effectiveSettings.companyCity || 'Jakarta';
  const cityDate = `${cityName}, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  doc.fontSize(9).font('Helvetica').fillColor(DARK).text(cityDate, 50, y, { align: 'right', width: W });

  y += 20;
  drawHLine(y, '#E5E7EB');
  y += 12;

  // Footer
  doc.fontSize(7.5).font('Helvetica').fillColor(GRAY)
    .text(
      'Dokumen ini digenerate secara otomatis oleh Sistem IT Ticketing. ' +
      'Dokumen ini sah tanpa tanda tangan basah apabila digunakan untuk keperluan internal.',
      50, y, { width: W, align: 'center' }
    );

  // ── Nomor halaman di semua halaman ─────────────────────────────────────────
  const totalPages = doc.bufferedPageRange().count;
  for (let pi = 0; pi < totalPages; pi++) {
    doc.switchToPage(pi);
    const PH  = doc.page.height;
    const MB  = doc.page.margins.bottom;
    const fY  = PH - MB - 12;
    doc.moveTo(ML, fY - 6).lineTo(ML + W, fY - 6).strokeColor('#E5E7EB').lineWidth(0.4).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
      .text(`${effectiveSettings.companyName || 'IT Support'}  ·  Laporan IT`, ML, fY, { width: W / 2, lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
      .text(`Hal. ${pi + 1} / ${totalPages}`, ML + W / 2, fY, { width: W / 2, align: 'right', lineBreak: false });
  }
  doc.switchToPage(totalPages - 1);
  doc.y = doc.page.margins.top || 50;
  doc.end();
};

module.exports = { getReport, exportExcel, exportPDF };
