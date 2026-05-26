const path = require('path');
const fs = require('fs');
const { prisma } = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');

// Helper: upsert the single settings row
const upsertSettings = (data) =>
  prisma.companySetting.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  });

// GET /api/settings  — public (no auth required for sidebar branding)
const getSettings = async (req, res) => {
  const settings = await prisma.companySetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  return successResponse(res, settings);
};

// PUT /api/settings  — admin only
const updateSettings = async (req, res) => {
  const {
    companyName, companyTagline, companyAddress,
    companyCity, companyPhone, companyEmail, companyWebsite,
    sigCreator, sigChecker, sigApprover,
  } = req.body;

  const data = {};
  if (companyName    !== undefined) data.companyName    = companyName;
  if (companyTagline !== undefined) data.companyTagline = companyTagline;
  if (companyAddress !== undefined) data.companyAddress = companyAddress;
  if (companyCity    !== undefined) data.companyCity    = companyCity;
  if (companyPhone   !== undefined) data.companyPhone   = companyPhone;
  if (companyEmail   !== undefined) data.companyEmail   = companyEmail;
  if (companyWebsite !== undefined) data.companyWebsite = companyWebsite;
  if (sigCreator     !== undefined) data.sigCreator     = sigCreator;
  if (sigChecker     !== undefined) data.sigChecker     = sigChecker;
  if (sigApprover    !== undefined) data.sigApprover    = sigApprover;

  const settings = await upsertSettings(data);
  return successResponse(res, settings, 'Pengaturan perusahaan berhasil diperbarui');
};

// POST /api/settings/logo  — admin only, multipart
const uploadLogo = async (req, res) => {
  if (!req.file) return errorResponse(res, 'File logo tidak ditemukan', 400);

  // Build public URL
  const logoUrl = `/uploads/logo/${req.file.filename}`;

  // Delete old logo file if exists
  try {
    const current = await prisma.companySetting.findUnique({ where: { id: 'singleton' } });
    if (current?.companyLogo) {
      const oldPath = path.join(process.cwd(), current.companyLogo.replace(/^\//, ''));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
  } catch {}

  const settings = await upsertSettings({ companyLogo: logoUrl });
  return successResponse(res, settings, 'Logo berhasil diupload');
};

// DELETE /api/settings/logo  — admin only
const deleteLogo = async (req, res) => {
  const current = await prisma.companySetting.findUnique({ where: { id: 'singleton' } });
  if (current?.companyLogo) {
    try {
      const filePath = path.join(process.cwd(), current.companyLogo.replace(/^\//, ''));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
  }
  const settings = await upsertSettings({ companyLogo: null });
  return successResponse(res, settings, 'Logo berhasil dihapus');
};

module.exports = { getSettings, updateSettings, uploadLogo, deleteLogo };
