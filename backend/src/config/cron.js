const cron = require('node-cron');
const { prisma } = require('./database');
const { logger } = require('../utils/logger');
const { sendEmailNotification } = require('../services/email.service');

const setupCronJobs = () => {
  // Check SLA every hour
  cron.schedule(process.env.SLA_CRON_SCHEDULE || '0 * * * *', async () => {
    logger.info('Running SLA check cron job...');
    await checkSLABreaches();
  });

  // Daily cleanup of old refresh tokens
  cron.schedule('0 0 * * *', async () => {
    logger.info('Cleaning up expired refresh tokens...');
    await cleanupExpiredTokens();
  });

  logger.info('Cron jobs initialized');
};

const checkSLABreaches = async () => {
  try {
    const now = new Date();

    // Find tickets approaching SLA (within 2 hours)
    const warningTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const warningTickets = await prisma.ticket.findMany({
      where: {
        status: { in: ['OPEN', 'ON_PROGRESS', 'PENDING'] },
        slaDeadline: { lte: warningTime, gt: now },
        slaBreached: false,
      },
      include: { creator: true, assignee: true, category: true },
    });

    for (const ticket of warningTickets) {
      // Create SLA warning notification
      await prisma.notification.createMany({
        data: [
          ticket.creator && {
            userId: ticket.creator.id,
            ticketId: ticket.id,
            type: 'SLA_WARNING',
            title: 'SLA Warning',
            message: `Ticket #${ticket.ticketNo} will breach SLA in less than 2 hours`,
          },
          ticket.assignee && {
            userId: ticket.assignee.id,
            ticketId: ticket.id,
            type: 'SLA_WARNING',
            title: 'SLA Warning',
            message: `Ticket #${ticket.ticketNo} will breach SLA in less than 2 hours`,
          },
        ].filter(Boolean),
        skipDuplicates: true,
      });
    }

    // Mark overdue tickets
    const overdueTickets = await prisma.ticket.findMany({
      where: {
        status: { in: ['OPEN', 'ON_PROGRESS', 'PENDING'] },
        slaDeadline: { lt: now },
        slaBreached: false,
      },
      include: { creator: true, assignee: true },
    });

    for (const ticket of overdueTickets) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { slaBreached: true },
      });

      // Create SLA overdue notifications
      const recipients = [ticket.creator, ticket.assignee].filter(Boolean);
      for (const user of recipients) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            ticketId: ticket.id,
            type: 'SLA_OVERDUE',
            title: 'SLA Breached!',
            message: `Ticket #${ticket.ticketNo} has breached its SLA deadline`,
          },
        });

        if (user.email) {
          await sendEmailNotification(user.email, 'SLA Breached', `Ticket #${ticket.ticketNo} has breached SLA`);
        }
      }
    }

    if (overdueTickets.length > 0) {
      logger.warn(`${overdueTickets.length} tickets marked as SLA breached`);
    }
  } catch (error) {
    logger.error('SLA check error:', error);
  }
};

const cleanupExpiredTokens = async () => {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    logger.info(`Deleted ${result.count} expired refresh tokens`);
  } catch (error) {
    logger.error('Token cleanup error:', error);
  }
};

module.exports = { setupCronJobs };
