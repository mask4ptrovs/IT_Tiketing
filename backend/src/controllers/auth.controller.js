const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { successResponse, errorResponse } = require('../utils/response');

const login = async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      department: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true, code: true, city: true, isHeadOffice: true } },
    },
  });

  if (!user) return errorResponse(res, 'Invalid email or password', 401);
  if (!user.isActive) return errorResponse(res, 'Your account has been deactivated', 403);

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) return errorResponse(res, 'Invalid email or password', 401);

  // Update last login
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokenPayload = { userId: user.id, role: user.role, email: user.email };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Store refresh token
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const { password: _, ...userWithoutPassword } = user;

  return successResponse(res, {
    user: userWithoutPassword,
    accessToken,
    refreshToken,
  }, 'Login successful');
};

const refreshToken = async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) return errorResponse(res, 'Refresh token required', 401);

  const storedToken = await prisma.refreshToken.findUnique({ where: { token } });
  if (!storedToken || storedToken.expiresAt < new Date()) {
    return errorResponse(res, 'Invalid or expired refresh token', 401);
  }

  const decoded = verifyRefreshToken(token);
  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || !user.isActive) return errorResponse(res, 'User not found or deactivated', 401);

  const newAccessToken = generateAccessToken({ userId: user.id, role: user.role, email: user.email });
  const newRefreshToken = generateRefreshToken({ userId: user.id, role: user.role, email: user.email });

  // Rotate refresh token
  await prisma.$transaction([
    prisma.refreshToken.delete({ where: { token } }),
    prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  return successResponse(res, { accessToken: newAccessToken, refreshToken: newRefreshToken }, 'Token refreshed');
};

const logout = async (req, res) => {
  const { refreshToken: token } = req.body;
  if (token) {
    await prisma.refreshToken.deleteMany({ where: { token } });
  }
  return successResponse(res, null, 'Logged out successfully');
};

const getMe = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true, employeeId: true, name: true, email: true,
      role: true, phone: true, avatar: true, isActive: true,
      lastLoginAt: true, createdAt: true, departmentId: true, branchId: true,
      department: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true, code: true, city: true, isHeadOffice: true } },
    },
  });
  return successResponse(res, user);
};

const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) return errorResponse(res, 'Current password is incorrect', 400);

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: req.user.id }, data: { password: hashedPassword } });

  // Invalidate all refresh tokens
  await prisma.refreshToken.deleteMany({ where: { userId: req.user.id } });

  return successResponse(res, null, 'Password changed successfully');
};

module.exports = { login, refreshToken, logout, getMe, changePassword };
