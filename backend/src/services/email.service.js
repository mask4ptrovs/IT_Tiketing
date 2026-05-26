const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

const sendEmailNotification = async (to, subject, text, html = null) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    logger.warn('Email not configured, skipping email notification');
    return;
  }

  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: process.env.EMAIL_FROM || 'IT Support <noreply@company.com>',
      to,
      subject,
      text,
      html: html || `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #4F46E5; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">IT Support</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <p style="color: #374151; font-size: 16px;">${text}</p>
          </div>
          <div style="padding: 15px; text-align: center; background: #e5e7eb;">
            <p style="color: #6b7280; font-size: 12px;">IT Ticketing System — ${new Date().getFullYear()}</p>
          </div>
        </div>
      `,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (error) {
    logger.error(`Email send failed to ${to}:`, error.message);
  }
};

const sendTicketCreatedEmail = async (user, ticket) => {
  await sendEmailNotification(
    user.email,
    `[${ticket.ticketNo}] Tiket Anda Telah Dibuat`,
    `Tiket #${ticket.ticketNo} dengan judul "${ticket.title}" telah berhasil dibuat. Status: ${ticket.status}`,
  );
};

const sendTicketAssignedEmail = async (technician, ticket) => {
  await sendEmailNotification(
    technician.email,
    `[${ticket.ticketNo}] Tiket Telah Ditugaskan Kepada Anda`,
    `Anda telah ditugaskan untuk menangani tiket #${ticket.ticketNo}: "${ticket.title}"`,
  );
};

module.exports = { sendEmailNotification, sendTicketCreatedEmail, sendTicketAssignedEmail };
