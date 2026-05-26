const { prisma } = require('../config/database');

const generateTicketNumber = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `TKT-${year}${month}-`;

  // Count tickets this month
  const startOfMonth = new Date(year, now.getMonth(), 1);
  const endOfMonth = new Date(year, now.getMonth() + 1, 0, 23, 59, 59);

  const count = await prisma.ticket.count({
    where: {
      createdAt: { gte: startOfMonth, lte: endOfMonth },
    },
  });

  const sequence = String(count + 1).padStart(4, '0');
  return `${prefix}${sequence}`;
};

module.exports = { generateTicketNumber };
