import { QueueEvents } from 'bullmq';
import { getIO } from './socketService';
import Video from '../models/Video';

const connection: any = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

if (process.env.REDIS_USERNAME) {
  connection.username = process.env.REDIS_USERNAME;
}
if (process.env.REDIS_PASSWORD) {
  connection.password = process.env.REDIS_PASSWORD;
}

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
    console.log('='.repeat(70));
    console.log(`✅ Job ${jobId} completed. Processing returnvalue...`);
    console.log('='.repeat(70));
    console.log(`   Returnvalue:`, returnvalue);
    console.log(`   Returnvalue type: ${typeof returnvalue}`);
    console.log(`   Returnvalue is null: ${returnvalue === null}`);
    console.log(`   Returnvalue is undefined: ${returnvalue === undefined}`);
    
    // Extract subtitleS3Key from returnvalue (which comes from worker resolve)
    // returnvalue might be a stringified JSON if passed through Redis depending on BullMQ version, 
    // but usually it's the object.
    let result: any = null;
    let subtitleS3Key: string | null = null;
    
    try {
      if (returnvalue === null || returnvalue === undefined) {
        console.warn(`   ⚠️  Returnvalue is null/undefined`);
      } else if (typeof returnvalue === 'string') {
        console.log(`   Parsing returnvalue as JSON string...`);
        result = JSON.parse(returnvalue);
      } else if (typeof returnvalue === 'object') {
        console.log(`   Using returnvalue as object directly...`);
        result = returnvalue;
      } else {
        console.warn(`   ⚠️  Unexpected returnvalue type: ${typeof returnvalue}`);
        result = returnvalue;
      }
      
      console.log(`   Parsed result:`, JSON.stringify(result, null, 2));
      console.log(`   Result type: ${typeof result}`);
      console.log(`   Result keys: ${result ? Object.keys(result).join(', ') : 'N/A'}`);
      
      subtitleS3Key = result?.subtitleS3Key;
      console.log(`   Extracted subtitleS3Key: ${subtitleS3Key || 'NOT FOUND'}`);
      console.log(`   subtitleS3Key type: ${typeof subtitleS3Key}`);
      console.log(`   subtitleS3Key length: ${subtitleS3Key ? subtitleS3Key.length : 'N/A'}`);
      
    } catch (e) {
      console.error(`   ❌ Failed to parse returnvalue:`, e);
      console.error(`   Error:`, e);
      result = returnvalue;
      subtitleS3Key = result?.subtitleS3Key;
    }

    const updateData: any = { status: 'completed', progress: 100 };
    if (subtitleS3Key && subtitleS3Key.trim() !== '') {
      updateData.subtitleS3Key = subtitleS3Key;
      console.log(`   ✅ Updating video ${jobId} with subtitleS3Key: ${subtitleS3Key}`);
    } else {
      console.warn(`   ⚠️  No valid subtitleS3Key found in returnvalue for job ${jobId}`);
      console.warn(`   Full returnvalue:`, JSON.stringify(returnvalue, null, 2));
      console.warn(`   Parsed result:`, JSON.stringify(result, null, 2));
    }

    // Update the video in database
    console.log(`   Updating database with:`, JSON.stringify(updateData, null, 2));
    const updated = await Video.findByIdAndUpdate(jobId, updateData, { new: true });
    console.log(`   ✅ Video updated in DB. SubtitleS3Key: ${updated?.subtitleS3Key || 'NOT SET'}`);
    
    // Verify the update worked by fetching again
    const verifyVideo = await Video.findById(jobId);
    if (verifyVideo) {
      console.log(`   🔍 Verification - Video ${jobId} subtitleS3Key in DB: ${verifyVideo.subtitleS3Key || 'NOT SET'}`);
      console.log(`   🔍 Verification - Video ${jobId} status: ${verifyVideo.status}`);
      console.log(`   🔍 Verification - Full video object:`, JSON.stringify({
        _id: verifyVideo._id,
        subtitleS3Key: verifyVideo.subtitleS3Key,
        status: verifyVideo.status
      }, null, 2));
      
      // Emit the completion event with the verified subtitleS3Key
      const finalSubtitleS3Key = verifyVideo.subtitleS3Key || subtitleS3Key;
      console.log(`   📤 Emitting video-completed event with subtitleS3Key: ${finalSubtitleS3Key || 'NOT SET'}`);
      io.emit('video-completed', { 
        videoId: jobId, 
        subtitleS3Key: finalSubtitleS3Key 
      });
    } else {
      console.error(`   ❌ Video ${jobId} not found after update!`);
      io.emit('video-completed', { videoId: jobId, subtitleS3Key: subtitleS3Key });
    }
    console.log('='.repeat(70));
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

