import { QueueEvents } from 'bullmq';
import { getIO } from './socketService';
import Video from '../models/Video';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const setupQueueListeners = () => {
  const queueEvents = new QueueEvents('video-processing', { connection });

  queueEvents.on('progress', async ({ jobId, data }) => {
    const io = getIO();
    
    let progress = 0;
    let message = '';

    if (typeof data === 'number') {
        progress = data;
    } else if (typeof data === 'object' && data !== null) {
        // @ts-ignore
        progress = data.percent || 0;
        // @ts-ignore
        message = data.message || '';
    }

    io.emit('video-progress', { videoId: jobId, progress, message });
    
    // Update DB status asynchronously
    await Video.findByIdAndUpdate(jobId, { progress });
  });

  queueEvents.on('completed', async ({ jobId, returnvalue }) => {
    const io = getIO();
    console.log(`Job ${jobId} completed. Result:`, returnvalue);
    
    // Extract subtitleKey from returnvalue (which comes from worker resolve)
    // returnvalue might be a stringified JSON if passed through Redis depending on BullMQ version, 
    // but usually it's the object.
    const result = typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue;
    const subtitleKey = result?.subtitleKey;

    io.emit('video-completed', { videoId: jobId, subtitleKey });
    
    const updateData: any = { status: 'completed', progress: 100 };
    if (subtitleKey) updateData.subtitleKey = subtitleKey;

    await Video.findByIdAndUpdate(jobId, updateData);
  });

  queueEvents.on('failed', async ({ jobId, failedReason }) => {
    const io = getIO();
    console.error(`❌ Job ${jobId} failed:`);
    console.error(`   Failed reason type: ${typeof failedReason}`);
    console.error(`   Failed reason:`, JSON.stringify(failedReason, null, 2));
    
    // Extract a more user-friendly error message
    let errorMessage = 'Unknown error';
    if (typeof failedReason === 'string') {
      errorMessage = failedReason;
      // Check if it's a local file error (not S3)
      if (errorMessage.includes('Local video file not found') || 
          (errorMessage.includes('file not found') && !errorMessage.includes('S3') && !errorMessage.includes('specified key'))) {
        errorMessage = `Video file not found on server. This may be because:
   1. The file was not uploaded successfully
   2. The file path is incorrect
   3. The file was moved or deleted
   Check server logs for more details.`;
      } else if (errorMessage.includes('specified key does not exist') && !errorMessage.includes('Local')) {
        // This is likely an S3 error
        errorMessage = `Video file not found. This may be because:
   1. The file was not uploaded successfully
   2. The file path/key is incorrect
   Check server logs for more details.`;
      }
    } else if (failedReason && typeof failedReason === 'object') {
      // Handle Error objects or objects with message property
      const reason = failedReason as any;
      if (reason.message) {
        errorMessage = reason.message;
      } else if (reason.error?.message) {
        errorMessage = reason.error.message;
      }
      
      // Check for S3-specific errors
      if (reason.name === 'NoSuchKey' || reason.Code === 'NoSuchKey') {
        errorMessage = `Video file not found in S3. This may be because:
   1. The file was not uploaded successfully to S3
   2. The S3 key is incorrect
   Check server logs for more details.`;
      } else if (typeof errorMessage === 'string') {
        // Check if it's a local file error
        if (errorMessage.includes('Local video file not found') || 
            (errorMessage.includes('file not found') && !errorMessage.includes('S3') && !errorMessage.includes('specified key'))) {
          errorMessage = `Video file not found on server. This may be because:
   1. The file was not uploaded successfully
   2. The file path is incorrect
   3. The file was moved or deleted
   Check server logs for more details.`;
        } else if (errorMessage.includes('specified key does not exist') && !errorMessage.includes('Local')) {
          // This is likely an S3 error
          errorMessage = `Video file not found. This may be because:
   1. The file was not uploaded successfully
   2. The file path/key is incorrect
   Check server logs for more details.`;
        }
      }
    }
    
    console.error(`   Extracted error message: ${errorMessage}`);
    io.emit('video-failed', { videoId: jobId, reason: errorMessage });
    await Video.findByIdAndUpdate(jobId, { status: 'failed' });
  });
  
  console.log('Queue listeners setup');
};

