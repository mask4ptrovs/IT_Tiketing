const { logger } = require('../utils/logger');
const { verifyToken } = require('../utils/jwt');

const connectedUsers = new Map();

const setupSocketHandlers = (io) => {
  // Auth middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const decoded = verifyToken(token);
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        next();
      } catch {
        next(new Error('Authentication error'));
      }
    } else {
      next(new Error('Authentication required'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (User: ${socket.userId})`);

    // Track connected users
    connectedUsers.set(socket.userId, socket.id);

    // Join user-specific room
    socket.join(`user:${socket.userId}`);

    // Join role room
    socket.join(`role:${socket.userRole}`);

    socket.on('join-ticket', (ticketId) => {
      socket.join(`ticket:${ticketId}`);
    });

    socket.on('leave-ticket', (ticketId) => {
      socket.leave(`ticket:${ticketId}`);
    });

    socket.on('disconnect', () => {
      connectedUsers.delete(socket.userId);
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });
};

const emitToUser = (io, userId, event, data) => {
  io.to(`user:${userId}`).emit(event, data);
};

const emitToRole = (io, role, event, data) => {
  io.to(`role:${role}`).emit(event, data);
};

const emitToTicket = (io, ticketId, event, data) => {
  io.to(`ticket:${ticketId}`).emit(event, data);
};

module.exports = { setupSocketHandlers, emitToUser, emitToRole, emitToTicket, connectedUsers };
