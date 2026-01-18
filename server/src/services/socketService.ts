import { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';

let io: Server;

export const initSocket = (server: any) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Allow all for dev
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('join-user', (userId) => {
      console.log(`User ${userId} joined their room`);
      socket.join(userId);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

// Plugin to attach io to fastify instance if needed, 
// but we'll mainly use getIO in queue listeners
export default async function socketPlugin(fastify: FastifyInstance) {
    // Just a placeholder if we want to attach to request
}



