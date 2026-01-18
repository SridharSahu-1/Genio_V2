import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import { connectDB } from './config/db';
import authRoutes from './routes/authRoutes';
import videoRoutes from './routes/videoRoutes';
import { initSocket } from './services/socketService';
import { setupQueueListeners } from './services/queueListener';
import { ensureBucketExists } from './services/s3Service';

dotenv.config();

const app = Fastify({ logger: true });

// Plugins
app.register(cors, { 
  origin: true, // Allows all origins by reflecting the origin header
  credentials: true
});

app.register(jwt, {
  secret: process.env.JWT_SECRET || 'secret'
});

app.register(multipart, {
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
});

// Database
connectDB();

// Routes
app.register(authRoutes, { prefix: '/api/auth' });
app.register(videoRoutes, { prefix: '/api/videos' });

app.get('/', async (request, reply) => {
  return { status: 'ok', message: 'Genio V2 API is running' };
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '5001');
    await app.ready(); // Wait for plugins
    
    // Check if S3 bucket exists (non-blocking)
    ensureBucketExists().catch((err) => {
      app.log.warn(`⚠️  S3 bucket check failed: ${err.message}`);
      app.log.warn('   Ensure your AWS credentials are configured and the bucket exists');
    });
    
    // Initialize Socket.io with the underlying Node.js server
    initSocket(app.server);
    
    // Start Queue Listeners (to push events to Socket)
    setupQueueListeners();

    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`🚀 Server running on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
