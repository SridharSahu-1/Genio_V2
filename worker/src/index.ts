import dotenv from 'dotenv';

// Load environment variables FIRST before importing any modules that use them
dotenv.config();

// IMPORTANT: Local worker on macOS crashes with SIGSEGV due to faster-whisper compatibility
// Only use Docker worker: docker-compose up worker
// Check if we're running locally (not in Docker) by checking Redis host
const redisHost = process.env.REDIS_HOST || 'localhost';

// Allow local worker - user wants to run worker locally for debugging
// Note: For production, use Docker worker to avoid macOS compatibility issues
if (redisHost === 'localhost') {
  console.log('✅ Running local worker (localhost Redis)');
}

// Also check if we're in Docker by checking environment
// In Docker, HOSTNAME typically contains container name or is set
if (process.env.REDIS_HOST === 'redis' || process.env.REDIS_HOST?.includes('redis')) {
  console.log('✅ Running in Docker environment - worker enabled');
}

import { Worker } from 'bullmq';
import { processVideo } from './processor';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

console.log(`🔗 Worker connecting to Redis at ${connection.host}:${connection.port}`);
console.log(`   Queue name: video-processing`);

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

worker.on('error', (error) => {
  console.error(`❌ Worker error:`, error);
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️  Job ${jobId} stalled`);
});

console.log('Worker started...');

