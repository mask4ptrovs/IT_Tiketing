const { prisma } = require('../config/database');
const { successResponse, errorResponse, paginatedResponse, getPagination, getPaginationMeta } = require('../utils/response');

// ── BRANCHES ─────────────────────────────────────────────────────────────────

const getBranches = async (req, res) => {
  const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
  const { search, isActive } = req.query;

  const where = {};
  if (isActive !== undefined) where.isActive = isActive === 'true';
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [branches, total] = await Promise.all([
    prisma.branch.findMany({
      where,
      include: {
        _count: { select: { users: true, tickets: true, regulations: true } },
      },
      orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.branch.count({ where }),
  ]);

  return paginatedResponse(res, branches, getPaginationMeta(total, page, limit));
};

const getBranchById = async (req, res) => {
  const branch = await prisma.branch.findUnique({
    where: { id: req.params.id },
    include: {
      regulations: { where: { isActive: true }, orderBy: { orderIndex: 'asc' } },
      _count: { select: { users: true, tickets: true } },
    },
  });
  if (!branch) return errorResponse(res, 'Cabang tidak ditemukan', 404);
  return successResponse(res, branch);
};

const createBranch = async (req, res) => {
  const { name, code, address, city, phone, email, managerName, isHeadOffice } = req.body;

  const exists = await prisma.branch.findFirst({
    where: { OR: [{ name }, { code: code.toUpperCase() }] },
  });
  if (exists) return errorResponse(res, 'Nama atau kode cabang sudah digunakan', 409);

  // If this is set as head office, unset any existing head office
  if (isHeadOffice) {
    await prisma.branch.updateMany({ where: { isHeadOffice: true }, data: { isHeadOffice: false } });
  }

  const branch = await prisma.branch.create({
    data: {
      name,
      code: code.toUpperCase(),
      address,
      city,
      phone,
      email,
      managerName,
      isHeadOffice: isHeadOffice || false,
    },
    include: { _count: { select: { users: true, tickets: true, regulations: true } } },
  });

  return successResponse(res, branch, 'Cabang berhasil ditambahkan', 201);
};

const updateBranch = async (req, res) => {
  const { id } = req.params;
  const { name, code, address, city, phone, email, managerName, isActive, isHeadOffice } = req.body;

  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) return errorResponse(res, 'Cabang tidak ditemukan', 404);

  if (isHeadOffice) {
    await prisma.branch.updateMany({
      where: { isHeadOffice: true, id: { not: id } },
      data: { isHeadOffice: false },
    });
  }

  const updated = await prisma.branch.update({
    where: { id },
    data: {
      ...(name        !== undefined && { name }),
      ...(code        !== undefined && { code: code.toUpperCase() }),
      ...(address     !== undefined && { address }),
      ...(city        !== undefined && { city }),
      ...(phone       !== undefined && { phone }),
      ...(email       !== undefined && { email }),
      ...(managerName !== undefined && { managerName }),
      ...(isActive    !== undefined && { isActive }),
      ...(isHeadOffice !== undefined && { isHeadOffice }),
    },
    include: { _count: { select: { users: true, tickets: true, regulations: true } } },
  });

  return successResponse(res, updated, 'Cabang berhasil diperbarui');
};

// PATCH /:id/signatures — IT_STAFF (own branch) or ADMIN
const updateBranchSignatures = async (req, res) => {
  const { id } = req.params;
  const { sigCreator, sigChecker, sigApprover } = req.body;

  // IT_STAFF can only update their own branch's signatures
  if (req.user.role === 'IT_STAFF' && req.user.branchId !== id) {
    return errorResponse(res, 'Anda hanya dapat mengubah tanda tangan cabang sendiri', 403);
  }

  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) return errorResponse(res, 'Cabang tidak ditemukan', 404);

  const data = {};
  if (sigCreator  !== undefined) data.sigCreator  = sigCreator;
  if (sigChecker  !== undefined) data.sigChecker  = sigChecker;
  if (sigApprover !== undefined) data.sigApprover = sigApprover;

  const updated = await prisma.branch.update({ where: { id }, data });
  return successResponse(res, updated, 'Tanda tangan cabang berhasil disimpan');
};

const deleteBranch = async (req, res) => {
  const { id } = req.params;
  const branch = await prisma.branch.findUnique({
    where: { id },
    include: { _count: { select: { users: true, tickets: true } } },
  });
  if (!branch) return errorResponse(res, 'Cabang tidak ditemukan', 404);
  if (branch._count.users > 0 || branch._count.tickets > 0) {
    return errorResponse(res, `Tidak bisa hapus: cabang memiliki ${branch._count.users} user dan ${branch._count.tickets} tiket aktif. Nonaktifkan cabang atau pindahkan data terlebih dahulu.`, 400);
  }

  await prisma.branch.delete({ where: { id } });
  return successResponse(res, null, 'Cabang berhasil dihapus');
};

// ── REGULATIONS ───────────────────────────────────────────────────────────────

const getRegulations = async (req, res) => {
  const { branchId } = req.params;
  const { isActive } = req.query;

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return errorResponse(res, 'Cabang tidak ditemukan', 404);

  const where = { branchId };
  if (isActive !== undefined) where.isActive = isActive === 'true';

  const regulations = await prisma.branchRegulation.findMany({
    where,
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  });

  return successResponse(res, { branch, regulations });
};

const createRegulation = async (req, res) => {
  const { branchId } = req.params;
  const { title, content, type, orderIndex } = req.body;

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return errorResponse(res, 'Cabang tidak ditemukan', 404);

  const maxOrder = await prisma.branchRegulation.aggregate({
    where: { branchId },
    _max: { orderIndex: true },
  });

  const regulation = await prisma.branchRegulation.create({
    data: {
      branchId,
      title,
      content,
      type: type || 'OPERATIONAL',
      orderIndex: orderIndex ?? (maxOrder._max.orderIndex ?? 0) + 1,
    },
  });

  return successResponse(res, regulation, 'Regulasi berhasil ditambahkan', 201);
};

const updateRegulation = async (req, res) => {
  const { branchId, regulationId } = req.params;
  const { title, content, type, orderIndex, isActive } = req.body;

  const regulation = await prisma.branchRegulation.findFirst({
    where: { id: regulationId, branchId },
  });
  if (!regulation) return errorResponse(res, 'Regulasi tidak ditemukan', 404);

  const updated = await prisma.branchRegulation.update({
    where: { id: regulationId },
    data: {
      ...(title      !== undefined && { title }),
      ...(content    !== undefined && { content }),
      ...(type       !== undefined && { type }),
      ...(orderIndex !== undefined && { orderIndex }),
      ...(isActive   !== undefined && { isActive }),
    },
  });

  return successResponse(res, updated, 'Regulasi berhasil diperbarui');
};

const deleteRegulation = async (req, res) => {
  const { branchId, regulationId } = req.params;
  const regulation = await prisma.branchRegulation.findFirst({
    where: { id: regulationId, branchId },
  });
  if (!regulation) return errorResponse(res, 'Regulasi tidak ditemukan', 404);
  await prisma.branchRegulation.delete({ where: { id: regulationId } });
  return successResponse(res, null, 'Regulasi berhasil dihapus');
};

module.exports = {
  getBranches, getBranchById, createBranch, updateBranch, deleteBranch,
  updateBranchSignatures,
  getRegulations, createRegulation, updateRegulation, deleteRegulation,
};
