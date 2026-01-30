import { Queue } from 'bullmq';
import { getDownloadUrl, cleanS3Key } from './s3Service';

const connection: any = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Add username and password if provided (required for Redis Cloud)
if (process.env.REDIS_USERNAME) {
  connection.username = process.env.REDIS_USERNAME;
}
if (process.env.REDIS_PASSWORD) {
  connection.password = process.env.REDIS_PASSWORD;
}

export const videoQueue = new Queue('video-processing', { connection });

export const addVideoJob = async (videoUrlOrPath: string, videoKey: string, hfToken: string, videoId: string, docId: string) => {
  // Check if it's a local file path (starts with /) or S3 URL/key
  const isLocalFile = videoUrlOrPath.startsWith('/') || (!videoUrlOrPath.startsWith('http'));
  const cleanKey = isLocalFile ? videoKey : cleanS3Key(videoKey);

  console.log('='.repeat(70));
  console.log('📤 ADDING JOB TO QUEUE');
  console.log('='.repeat(70));
  console.log(`Video ID: ${videoId}`);
  console.log(`Video URL/Path: ${videoUrlOrPath}`);
  console.log(`Video Key: "${cleanKey}"`);
  console.log(`Is Local File: ${isLocalFile ? 'YES ✅' : 'NO (S3)'}`);
  console.log(`Doc ID: ${docId}`);
  if (!isLocalFile) {
    console.log(`Bucket: ${process.env.AWS_S3_BUCKET || 'NOT SET'}`);
    console.log(`Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  }
  console.log('='.repeat(70));

  const job = await videoQueue.add('process-video', {
    videoKey: cleanKey,
    videoUrl: videoUrlOrPath, // Can be local file path or S3 URL
    isLocalFile: isLocalFile, // Flag to indicate local file
    hfToken,
    videoId,
    docId
  }, {
    jobId: videoId,
    removeOnComplete: false,
  });

  console.log(`✅ Job added to queue - Job ID: ${job.id || 'unknown'}`);
  const displayUrl = videoUrlOrPath.length > 100 ? videoUrlOrPath.substring(0, 100) + '...' : videoUrlOrPath;
  console.log(`   Job data sent:`, JSON.stringify({ videoKey: cleanKey, videoUrl: displayUrl, isLocalFile, videoId, docId }, null, 2));

  if (job.id) {
    try {
      const storedJob = await videoQueue.getJob(job.id);
      if (storedJob) {
        const storedData = storedJob.data;
        console.log(`   Job data retrieved:`, JSON.stringify(storedData, null, 2));
        if (storedData.videoKey !== cleanKey) {
          console.error(`   ⚠️  WARNING: Key mismatch! Sent: "${cleanKey}", Stored: "${storedData.videoKey}"`);
        } else {
          console.log(`   ✅ Key matches in stored job data`);
        }
      }
    } catch (verifyError: any) {
      console.warn(`   ⚠️  Could not verify stored job data: ${verifyError.message}`);
    }
  }

  return job;
};

