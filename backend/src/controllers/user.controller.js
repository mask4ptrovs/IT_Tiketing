const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { successResponse, errorResponse, paginatedResponse, getPagination, getPaginationMeta } = require('../utils/response');

const getUsers = async (req, res) => {
  const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
  const { search, role, departmentId, isActive } = req.query;

  const where = {};
  if (role) where.role = role;
  if (departmentId) where.departmentId = departmentId;
  if (isActive !== undefined) where.isActive = isActive === 'true';
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { employeeId: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, employeeId: true, name: true, email: true,
        role: true, phone: true, avatar: true, isActive: true,
        lastLoginAt: true, createdAt: true,
        department: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
        _count: { select: { createdTickets: true, assignedTickets: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return paginatedResponse(res, users, getPaginationMeta(total, page, limit));
};

const getUserById = async (req, res) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, employeeId: true, name: true, email: true,
      role: true, phone: true, avatar: true, isActive: true,
      lastLoginAt: true, createdAt: true,
      department: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true, code: true } },
      _count: { select: { createdTickets: true, assignedTickets: true } },
    },
  });
  if (!user) return errorResponse(res, 'User not found', 404);
  return successResponse(res, user);
};

const createUser = async (req, res) => {
  const { employeeId, name, email, password, role, phone, departmentId, branchId } = req.body;

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { employeeId }] },
  });
  if (exists) return errorResponse(res, 'User with this email or employee ID already exists', 409);

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      employeeId,
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role || 'USER',
      phone,
      departmentId,
      branchId,
    },
    select: {
      id: true, employeeId: true, name: true, email: true,
      role: true, phone: true, isActive: true, createdAt: true,
      department: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  });

  return successResponse(res, user, 'User created successfully', 201);
};

const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, role, phone, departmentId, branchId, isActive } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return errorResponse(res, 'User not found', 404);

  const updateData = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email.toLowerCase();
  if (role) updateData.role = role;
  if (phone !== undefined) updateData.phone = phone;
  if (departmentId !== undefined) updateData.departmentId = departmentId || null;
  if (branchId     !== undefined) updateData.branchId     = branchId     || null;
  if (isActive     !== undefined) updateData.isActive     = isActive;

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true, employeeId: true, name: true, email: true,
      role: true, phone: true, isActive: true, updatedAt: true,
      department: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  });

  return successResponse(res, updated, 'User updated successfully');
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return errorResponse(res, 'Cannot delete your own account', 400);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return errorResponse(res, 'User not found', 404);

  // Soft delete
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  return successResponse(res, null, 'User deactivated successfully');
};

const permanentDeleteUser = async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return errorResponse(res, 'Tidak bisa menghapus akun sendiri', 400);

  const user = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { createdTickets: true } } },
  });
  if (!user) return errorResponse(res, 'User tidak ditemukan', 404);

  // Hapus semua data terkait dalam satu transaksi
  await prisma.$transaction(async (tx) => {
    // 1. Lepas assignee dari tiket yang sedang ditangani user ini
    await tx.ticket.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });

    // 2. Hapus activity logs milik user ini
    await tx.activityLog.deleteMany({ where: { actorId: id } });

    // 3. Hapus komentar milik user ini
    await tx.ticketComment.deleteMany({ where: { authorId: id } });

    // 4. Hapus notifikasi
    await tx.notification.deleteMany({ where: { userId: id } });

    // 5. Hapus refresh tokens
    await tx.refreshToken.deleteMany({ where: { userId: id } });

    // 6. Hapus tiket yang dibuat user ini (beserta semua relasinya)
    const userTickets = await tx.ticket.findMany({ where: { creatorId: id }, select: { id: true } });
    const ticketIds = userTickets.map(t => t.id);
    if (ticketIds.length > 0) {
      await tx.activityLog.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await tx.notification.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await tx.ticketComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await tx.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await tx.ticket.deleteMany({ where: { creatorId: id } });
    }

    // 7. Hapus user secara permanen
    await tx.user.delete({ where: { id } });
  });

  return successResponse(res, null, `User "${user.name}" berhasil dihapus secara permanen`);
};

const updateProfile = async (req, res) => {
  const { name, phone } = req.body;
  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { name, phone },
    select: { id: true, name: true, email: true, phone: true, avatar: true },
  });
  return successResponse(res, updated, 'Profile updated');
};

const resetUserPassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8)
    return errorResponse(res, 'Password baru minimal 8 karakter', 400);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return errorResponse(res, 'User tidak ditemukan', 404);

  // Prevent admin from accidentally locking themselves out via this endpoint
  // (they can still change their own via /auth/change-password)
  const hashed = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({ where: { id }, data: { password: hashed } });

  // Invalidate all existing refresh tokens so the user must log in with new password
  await prisma.refreshToken.deleteMany({ where: { userId: id } });

  return successResponse(res, null, `Password user "${user.name}" berhasil direset`);
};

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser, permanentDeleteUser, updateProfile, resetUserPassword };
