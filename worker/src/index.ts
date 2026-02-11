import dotenv from 'dotenv';

// Load environment variables FIRST before importing any modules that use them
dotenv.config();

// IMPORTANT: Local worker on macOS crashes with SIGSEGV due to faster-whisper compatibility
// Only use Docker worker: docker-compose up worker
// Check if we're running locally (not in Docker) by checking Redis host
const redisHost = process.env.REDIS_HOST || 'localhost';

// Detect environment
if (redisHost === 'localhost' || redisHost === '127.0.0.1') {
  console.log('✅ Running local worker (localhost Redis)');
} else {
  // Running in cloud (Railway, Fly.io, Render, etc.) with Upstash or cloud Redis
  console.log('✅ Running in cloud/Docker environment - worker enabled');
  console.log(`   Redis Host: ${redisHost}`);
}

import { Worker } from 'bullmq';
import { processVideo } from './processor';

// Helper to parse Redis URL or use individual env vars (same as server)
const getRedisConnection = () => {
  // If REDIS_URL is provided, parse it
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL);
      const connection: any = {
        host: url.hostname,
        port: parseInt(url.port || '6379'),
      };

      // Extract username and password from URL if present
      if (url.username) {
        connection.username = url.username;
      }
      if (url.password) {
        connection.password = url.password;
      }

      // Enable TLS for rediss:// URLs
      if (url.protocol === 'rediss:') {
        // Redis Cloud requires TLS but may need specific configuration
        connection.tls = {
          rejectUnauthorized: false, // Redis Cloud uses self-signed certs
        };
        console.log('🔒 Using TLS for Redis connection (from REDIS_URL)');
      }

      return connection;
    } catch (e) {
      console.warn('⚠️  Failed to parse REDIS_URL, using individual env vars');
    }
  }

  // Otherwise, use individual env vars
  let host = process.env.REDIS_HOST || 'localhost';

  // If REDIS_HOST contains a full URL (common mistake), extract hostname
  if (host.startsWith('redis://') || host.startsWith('rediss://')) {
    try {
      const url = new URL(host);
      host = url.hostname;
      console.warn('⚠️  REDIS_HOST contains full URL, extracted hostname:', host);
    } catch (e) {
      console.warn('⚠️  REDIS_HOST looks like URL but failed to parse');
    }
  }

  const connection: any = {
    host: host,
    port: parseInt(process.env.REDIS_PORT || '6379'),
  };

  // Add username and password if provided (required for Redis Cloud/Upstash)
  if (process.env.REDIS_USERNAME) {
    connection.username = process.env.REDIS_USERNAME;
  }
  if (process.env.REDIS_PASSWORD) {
    connection.password = process.env.REDIS_PASSWORD;
  }

  // Enable TLS only if explicitly required
  // Priority: REDIS_URL protocol > REDIS_TLS env var
  const hasRedissProtocol = process.env.REDIS_URL?.startsWith('rediss://');
  const tlsExplicitlyEnabled = process.env.REDIS_TLS === 'true' || process.env.REDIS_TLS === '1';
  const tlsExplicitlyDisabled = process.env.REDIS_TLS === 'false' || process.env.REDIS_TLS === '0';

  // Debug logging
  console.log(`   TLS Debug: REDIS_URL=${process.env.REDIS_URL ? 'set' : 'not set'}, hasRedissProtocol=${hasRedissProtocol}`);
  console.log(`   TLS Debug: REDIS_TLS="${process.env.REDIS_TLS || 'not set'}", enabled=${tlsExplicitlyEnabled}, disabled=${tlsExplicitlyDisabled}`);

  if (hasRedissProtocol || (tlsExplicitlyEnabled && !tlsExplicitlyDisabled)) {
    // Redis Cloud/Upstash may need permissive TLS settings
    connection.tls = {
      rejectUnauthorized: false, // Allow self-signed certificates (common with Redis Cloud)
    };
    console.log('🔒 Using TLS for Redis connection');
  } else if (tlsExplicitlyDisabled) {
    console.log('🔓 TLS explicitly disabled');
  } else {
    // Default: no TLS unless REDIS_URL uses rediss://
    console.log('🔓 Not using TLS for Redis connection (default)');
  }

  return connection;
};

const connection = getRedisConnection();

// Log connection details (without password)
const logHost = connection.host || 'localhost';
const logPort = connection.port || 6379;
const hasAuth = !!(connection.username || connection.password);
const hasPassword = !!connection.password;
const hasUsername = !!connection.username;

console.log(`🔗 Worker connecting to Redis at ${logHost}:${logPort}`);
console.log(`   Queue name: video-processing`);
console.log(`   Authentication: ${hasAuth ? '✅ Configured' : '❌ Not configured'}`);
if (hasUsername) {
  console.log(`   Username: ${connection.username}`);
}
if (hasPassword) {
  console.log(`   Password: ${'*'.repeat(Math.min(connection.password.length, 8))} (${connection.password.length} chars)`);
} else {
  console.log(`   ⚠️  WARNING: No password provided. Redis may require authentication.`);
  console.log(`   Check REDIS_PASSWORD or REDIS_URL environment variable.`);
}

// Debug: Log actual connection object (without password)
console.log(`   Connection config:`, {
  host: connection.host,
  port: connection.port,
  username: connection.username ? 'set' : 'not set',
  password: connection.password ? 'set (' + connection.password.length + ' chars)' : 'not set',
  tls: connection.tls ? 'enabled' : 'disabled'
});

const worker = new Worker(
  'video-processing',
  async (job) => {
    try {
      console.log('='.repeat(70));
      console.log(`🔄 PROCESSING JOB ${job.id}`);
      console.log('='.repeat(70));
      console.log(`   Job ID: ${job.id}`);
      console.log(`   Job data:`, JSON.stringify(job.data, null, 2));
      console.log(`   Job data keys:`, Object.keys(job.data || {}));
      console.log(`   Has videoUrl:`, !!job.data?.videoUrl);
      if (job.data?.videoUrl) {
        console.log(`   videoUrl (first 100 chars):`, job.data.videoUrl.substring(0, 100));
      }

      // IMPORTANT: Return the result from processVideo so it's available in returnvalue
      const result = await processVideo(job);
      console.log(`✅ Job ${job.id} completed successfully`);
      console.log(`   Result returned:`, JSON.stringify(result, null, 2));

      // Return the result so it's available in queueListener's returnvalue
      return result;
    } catch (error: any) {
      console.error(`❌ Error processing job ${job?.id}:`, error);
      console.error(`   Error name: ${error?.name || 'Unknown'}`);
      console.error(`   Error message: ${error?.message || 'Unknown error'}`);
      console.error(`   Error code: ${error?.Code || 'N/A'}`);
      console.error(`   Error stack:`, error?.stack);
      // Re-throw with more context
      const enhancedError = new Error(error?.message || 'Unknown error');
      if (error?.stack) (enhancedError as any).stack = error.stack;
      throw enhancedError;
    }
  },
  {
    connection,
    lockDuration: 300000, // 5 minutes
    maxStalledCount: 1, // Don't retry immediately if stalled
    concurrency: 1, // Process one job at a time
  }
);

worker.on('active', (job) => {
  console.log(`🟢 Job ${job.id} is now active`);
});

worker.on('ready', () => {
  console.log(`✅ Worker ready and listening for jobs on queue 'video-processing'`);
});

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed with: ${err.message}`);
  console.error(`   Error details:`, err);
  if (err.stack) {
    console.error(`   Stack trace:`, err.stack);
  }
});

worker.on('error', (error: any) => {
  // Don't spam logs with repeated errors
  const errorMessage = error?.message || String(error);
  const errorCode = error?.code || '';
  const now = Date.now();

  if (errorMessage.includes('NOAUTH') || errorMessage.includes('Authentication required')) {
    // Only log once per minute to avoid spam
    if (!(worker as any).lastAuthError || now - (worker as any).lastAuthError > 60000) {
      console.error(`❌ Worker Redis authentication error:`, errorMessage);
      console.error(`   This usually means REDIS_PASSWORD or REDIS_USERNAME is missing or incorrect.`);
      console.error(`   Current config:`);
      console.error(`     REDIS_HOST: ${process.env.REDIS_HOST || 'not set'}`);
      console.error(`     REDIS_PORT: ${process.env.REDIS_PORT || 'not set'}`);
      console.error(`     REDIS_USERNAME: ${process.env.REDIS_USERNAME ? 'set' : 'not set'}`);
      console.error(`     REDIS_PASSWORD: ${process.env.REDIS_PASSWORD ? 'set' : 'not set'}`);
      console.error(`     REDIS_URL: ${process.env.REDIS_URL ? 'set (first 50 chars): ' + process.env.REDIS_URL.substring(0, 50) + '...' : 'not set'}`);
      console.error(`   Check your .env file or environment variables.`);
      console.error(`   For Redis Cloud, you need either:`);
      console.error(`     1. REDIS_URL=rediss://username:password@host:port`);
      console.error(`     2. REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD`);
      (worker as any).lastAuthError = now;
    }
  } else if (errorCode === 'ERR_SSL_PACKET_LENGTH_TOO_LONG' || errorMessage.includes('packet length too long')) {
    // TLS configuration issue - only log once per minute
    if (!(worker as any).lastTLSError || now - (worker as any).lastTLSError > 60000) {
      console.error(`❌ Worker Redis TLS error:`, errorMessage);
      console.error(`   This usually means TLS is enabled but the server doesn't support it, or TLS config is incorrect.`);
      console.error(`   Current TLS config: ${connection.tls ? 'enabled' : 'disabled'}`);
      console.error(`   REDIS_TLS: ${process.env.REDIS_TLS || 'not set'}`);
      console.error(`   REDIS_URL protocol: ${process.env.REDIS_URL ? (process.env.REDIS_URL.startsWith('rediss://') ? 'rediss:// (TLS)' : 'redis:// (no TLS)') : 'not set'}`);
      console.error(`   Solutions:`);
      console.error(`     1. If your Redis doesn't require TLS, set REDIS_TLS=false`);
      console.error(`     2. If using REDIS_URL, use redis:// instead of rediss://`);
      console.error(`     3. For Redis Cloud, ensure you're using the correct port and TLS settings`);
      (worker as any).lastTLSError = now;
    }
  } else {
    console.error(`❌ Worker error:`, error);
  }
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️  Job ${jobId} stalled`);
});

console.log('Worker started...');

