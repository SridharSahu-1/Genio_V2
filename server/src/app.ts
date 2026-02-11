import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { connectDB } from './config/db';
import authRoutes from './routes/authRoutes';
import videoRoutes from './routes/videoRoutes';
import { initSocket } from './services/socketService';
import { setupQueueListeners } from './services/queueListener';
import { ensureBucketExists } from './services/s3Service';

dotenv.config();

const app = Fastify({ logger: true });

// Plugins
// CORS configuration - allow specific origins in production
const corsOriginsEnv = process.env.CORS_ORIGINS || '';
const allowedOrigins = corsOriginsEnv 
  ? corsOriginsEnv.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:3001'];

// Check if wildcard is enabled
const allowAllOrigins = allowedOrigins.includes('*') || allowedOrigins.length === 0;

app.register(cors, { 
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // If wildcard is enabled, allow all origins
    if (allowAllOrigins) {
      return callback(null, true);
    }
    
    // In production, check against allowed origins
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true
});

// Validate JWT secret
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret === 'secret') {
  console.error('⚠️  WARNING: JWT_SECRET is not set or using default value. This is a security risk!');
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Cannot start in production without a secure JWT_SECRET');
    process.exit(1);
  }
}

app.register(jwt, {
  secret: jwtSecret || 'secret'
});

app.register(multipart, {
  limits: {
    fileSize: 4 * 1024 * 1024 * 1024, // 4GB
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

// Health check endpoint
app.get('/health', async (request, reply) => {
  try {
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Check Redis connection
    let redisStatus = 'unknown';
    try {
      // Helper to parse Redis config
      let redisHost = process.env.REDIS_HOST || 'localhost';
      
      // If REDIS_HOST contains a full URL, extract hostname
      if (redisHost.startsWith('redis://') || redisHost.startsWith('rediss://')) {
        try {
          const url = new URL(redisHost);
          redisHost = url.hostname;
        } catch (e) {
          // Ignore parse errors
        }
      }

      const redisConfig: any = {
        host: redisHost,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        connectTimeout: 2000,
        lazyConnect: true,
      };

      if (process.env.REDIS_USERNAME) redisConfig.username = process.env.REDIS_USERNAME;
      if (process.env.REDIS_PASSWORD) redisConfig.password = process.env.REDIS_PASSWORD;

      // Enable TLS for Upstash (rediss://) or if REDIS_TLS is set
      if (process.env.REDIS_URL?.startsWith('rediss://') || process.env.REDIS_TLS === 'true' || process.env.REDIS_TLS === '1') {
        redisConfig.tls = {};
      }

      const redisClient = new Redis(redisConfig);
      await redisClient.connect();
      await redisClient.ping();
      redisStatus = 'connected';
      redisClient.disconnect();
    } catch (err: any) {
      redisStatus = 'disconnected';
    }
    
    const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';
    
    if (!isHealthy) {
      reply.code(503);
    }
    
    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
      environment: process.env.NODE_ENV || 'development',
    };
  } catch (error: any) {
    reply.code(503).send({
      status: 'error',
      message: error.message,
    });
  }
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '5001');
    
    // Validate required environment variables
    const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0 && process.env.NODE_ENV === 'production') {
      console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
      process.exit(1);
    } else if (missingVars.length > 0) {
      console.warn(`⚠️  Missing environment variables (development mode): ${missingVars.join(', ')}`);
    }
    
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
