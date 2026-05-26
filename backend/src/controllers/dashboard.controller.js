const { prisma } = require('../config/database');
const { successResponse } = require('../utils/response');

const getDashboardStats = async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // Branch-aware base filter
  let baseWhere = {};
  if (req.user.role === 'USER') {
    baseWhere = { creatorId: req.user.id };
  } else if (req.user.role === 'IT_STAFF') {
    baseWhere = req.user.branchId ? { branchId: req.user.branchId } : {};
  } else {
    // ADMIN — optionally filter by branchId query param
    if (req.query.branchId) baseWhere = { branchId: req.query.branchId };
  }

  const [
    totalTickets, openTickets, onProgressTickets, resolvedTickets,
    closedTickets, slaBreachedTickets, thisMonthTickets, lastMonthTickets,
  ] = await Promise.all([
    prisma.ticket.count({ where: baseWhere }),
    prisma.ticket.count({ where: { ...baseWhere, status: 'OPEN' } }),
    prisma.ticket.count({ where: { ...baseWhere, status: 'ON_PROGRESS' } }),
    prisma.ticket.count({ where: { ...baseWhere, status: 'RESOLVED' } }),
    prisma.ticket.count({ where: { ...baseWhere, status: 'CLOSED' } }),
    prisma.ticket.count({ where: { ...baseWhere, slaBreached: true } }),
    prisma.ticket.count({ where: { ...baseWhere, createdAt: { gte: startOfMonth } } }),
    prisma.ticket.count({ where: { ...baseWhere, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
  ]);

  // Monthly chart data (last 12 months)
  const monthlyData = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const [created, resolved] = await Promise.all([
      prisma.ticket.count({ where: { ...baseWhere, createdAt: { gte: date, lte: endDate } } }),
      prisma.ticket.count({
        where: {
          ...baseWhere,
          status: { in: ['RESOLVED', 'CLOSED'] },
          resolvedAt: { gte: date, lte: endDate },
        },
      }),
    ]);
    monthlyData.push({
      month: date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }),
      created,
      resolved,
    });
  }

  // Category distribution
  const categoryStats = await prisma.ticket.groupBy({
    by: ['categoryId'],
    where: baseWhere,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const categories = await prisma.category.findMany({ select: { id: true, name: true, color: true } });
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

  const categoryDistribution = categoryStats.map(stat => ({
    category: categoryMap[stat.categoryId]?.name || 'Unknown',
    color: categoryMap[stat.categoryId]?.color || '#6366f1',
    count: stat._count.id,
  }));

  // Priority distribution
  const priorityStats = await prisma.ticket.groupBy({
    by: ['priority'],
    where: { ...baseWhere, status: { in: ['OPEN', 'ON_PROGRESS', 'PENDING'] } },
    _count: { id: true },
  });

  // Recent tickets
  const recentTickets = await prisma.ticket.findMany({
    where: baseWhere,
    include: {
      creator: { select: { id: true, name: true, avatar: true } },
      category: { select: { id: true, name: true, color: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  // Technician performance (admin and IT_STAFF)
  let technicianStats = [];
  if (req.user.role === 'ADMIN' || req.user.role === 'IT_STAFF') {
    const techWhere = { role: 'IT_STAFF', isActive: true };
    if (req.user.role === 'IT_STAFF' && req.user.branchId) techWhere.branchId = req.user.branchId;
    else if (req.query.branchId) techWhere.branchId = req.query.branchId;

    const techStats = await prisma.user.findMany({
      where: techWhere,
      select: {
        id: true, name: true, avatar: true,
        assignedTickets: {
          where: req.user.branchId && req.user.role === 'IT_STAFF' ? { branchId: req.user.branchId } : req.query.branchId ? { branchId: req.query.branchId } : {},
          select: { id: true, status: true, slaBreached: true },
        },
      },
      take: 10,
    });

    technicianStats = techStats.map(tech => ({
      id: tech.id,
      name: tech.name,
      avatar: tech.avatar,
      totalAssigned: tech.assignedTickets.length,
      resolved: tech.assignedTickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
      slaBreached: tech.assignedTickets.filter(t => t.slaBreached).length,
    }));
  }

  // Department stats (admin + IT_STAFF)
  let departmentStats = [];
  if (req.user.role === 'ADMIN' || req.user.role === 'IT_STAFF') {
    const deptStats = await prisma.ticket.groupBy({
      by: ['departmentId'],
      where: baseWhere,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const departments = await prisma.department.findMany({ select: { id: true, name: true } });
    const deptMap = Object.fromEntries(departments.map(d => [d.id, d]));

    departmentStats = deptStats.map(stat => ({
      department: deptMap[stat.departmentId]?.name || 'Unknown',
      count: stat._count.id,
    }));
  }

  return successResponse(res, {
    stats: {
      totalTickets,
      openTickets,
      onProgressTickets,
      resolvedTickets,
      closedTickets,
      slaBreachedTickets,
      thisMonthTickets,
      lastMonthTickets,
      growthRate: lastMonthTickets > 0
        ? ((thisMonthTickets - lastMonthTickets) / lastMonthTickets * 100).toFixed(1)
        : 0,
    },
    monthlyData,
    categoryDistribution,
    priorityDistribution: priorityStats.map(p => ({ priority: p.priority, count: p._count.id })),
    recentTickets,
    technicianStats,
    departmentStats,
  });
};

module.exports = { getDashboardStats };
