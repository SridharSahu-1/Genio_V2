import { FastifyRequest, FastifyReply } from 'fastify';
import Video from '../models/Video';
import { getUploadUrl, getDownloadUrl, verifyFileExists, getPublicUrl } from '../services/s3Service';
import { addVideoJob } from '../services/queueService';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const initUploadSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  hfToken: z.string().optional(), // In production, store this securely or per user
});

// DIRECT UPLOAD - Bypass S3, save locally
export const directUpload = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const userId = (req.user as any).id;
    const data = await req.file();

    if (!data) {
      return reply.code(400).send({ message: 'No file provided' });
    }

    const filename = data.filename;
    const sanitizedFilename = filename
      .replace(/[<>:"|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/\/+/g, '_');

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Save file locally
    const filePath = path.join(uploadsDir, `${userId}-${Date.now()}-${sanitizedFilename}`);
    const writeStream = fs.createWriteStream(filePath);

    // Fastify multipart file - data.file is a readable stream (BusboyFileStream)
    const fileStream: NodeJS.ReadableStream = data.file as any;
    fileStream.pipe(writeStream);

    // Wait for file to be written
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => {
        // Verify file was actually written
        if (!fs.existsSync(filePath)) {
          reject(new Error('File was not written to disk'));
          return;
        }
        resolve();
      });
      writeStream.on('error', (err) => {
        console.error('❌ Write stream error:', err);
        reject(err);
      });
      fileStream.on('error', (err) => {
        console.error('❌ File stream error:', err);
        reject(err);
      });
    });

    // Verify file exists and has content
    if (!fs.existsSync(filePath)) {
      throw new Error('File upload failed: file was not saved to disk');
    }

    const fileSize = fs.statSync(filePath).size;
    if (fileSize === 0) {
      fs.unlinkSync(filePath); // Clean up empty file
      throw new Error('File upload failed: file is empty');
    }

    console.log(`✅ File uploaded locally: ${filePath} (${fileSize} bytes)`);

    // Create video entry
    const video = await Video.create({
      user: userId,
      title: filename,
      originalKey: filePath, // Store local path instead of S3 key
      status: 'pending',
      videoUrl: `/uploads/${path.basename(filePath)}`, // Relative path for serving
    });

    console.log(`✅ Created video entry - ID: ${video._id}, Local path: ${filePath}`);

    reply.send({
      videoId: video._id,
      filePath: filePath,
      message: 'File uploaded successfully'
    });
  } catch (error: any) {
    console.error('Error in directUpload:', error);
    reply.code(500).send({ message: error.message || 'Upload failed' });
  }
};

export const initUpload = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { filename, contentType, hfToken } = initUploadSchema.parse(req.body);
    const userId = (req.user as any).id;

    console.log(`Init upload request - filename: ${filename}, contentType: ${contentType}, userId: ${userId}`);

    // Generate key - S3 keys can contain most characters, but we'll sanitize to be safe
    // Replace problematic characters but keep the filename recognizable
    const sanitizedFilename = filename
      .replace(/[<>:"|?*]/g, '_') // Replace Windows-incompatible chars
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/\/+/g, '_'); // Replace slashes with underscores
    const rawKey = `uploads/${userId}/${Date.now()}-${sanitizedFilename}`;
    // Clean the key to ensure consistency (remove leading/trailing slashes, double slashes)
    const key = rawKey.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');

    console.log(`📤 INIT UPLOAD`);
    console.log(`   Original filename: ${filename}`);
    console.log(`   Sanitized filename: ${sanitizedFilename}`);
    console.log(`   Generated S3 key: ${key}`);
    console.log(`   User ID: ${userId}`);

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadUrl(key, contentType);
      console.log(`✅ Generated presigned URL for key: ${key}`);
    } catch (s3Error: any) {
      console.error('❌ Error generating upload URL:', s3Error);
      return reply.code(500).send({
        message: `Failed to generate upload URL: ${s3Error.message || 'Unknown S3 error'}`
      });
    }

    // Create placeholder video entry
    let video;
    try {
      video = await Video.create({
        user: userId,
        title: filename,
        originalKey: key, // Store the cleaned key that will be used in S3
        status: 'pending',
      });
      console.log(`✅ Created video entry - ID: ${video._id}, Key: ${key}`);
    } catch (dbError: any) {
      console.error('❌ Error creating video entry:', dbError);
      return reply.code(500).send({
        message: `Failed to create video entry: ${dbError.message || 'Database error'}`
      });
    }

    reply.send({ uploadUrl, videoId: video._id, key });
  } catch (error: any) {
    console.error('Error in initUpload:', error);
    const errorMessage = error.message || 'Unknown error occurred';
    console.error('Error details:', {
      message: errorMessage,
      stack: error.stack,
      name: error.name,
    });
    reply.code(400).send({ message: errorMessage });
  }
};

export const startProcessing = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { videoId, hfToken } = req.body as { videoId: string, hfToken?: string };
    const video = await Video.findById(videoId);

    if (!video) return reply.code(404).send({ message: 'Video not found' });
    if (video.user.toString() !== (req.user as any).id) return reply.code(403).send({ message: 'Unauthorized' });

    console.log(`🔍 START PROCESSING`);
    console.log(`   Video ID: ${videoId}`);
    console.log(`   User ID: ${(req.user as any).id}`);
    console.log(`   Original Key: "${video.originalKey}"`);
    console.log(`   Original Key type: ${typeof video.originalKey}`);
    console.log(`   Original Key length: ${video.originalKey?.length || 0}`);

    // Check if it's a local file path (starts with /) or S3 key
    // Also check if it contains the uploads directory path (more reliable)
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    const isLocalFile = video.originalKey && (
      video.originalKey.startsWith('/') ||
      path.isAbsolute(video.originalKey) ||
      video.originalKey.includes(uploadsDir) ||
      video.originalKey.includes('server/uploads')
    );

    console.log(`   Is Local File: ${isLocalFile ? 'YES ✅' : 'NO (S3)'}`);
    console.log(`   Uploads Dir: ${uploadsDir}`);

    if (isLocalFile) {
      // LOCAL FILE PROCESSING - No S3 needed
      console.log(`📁 Processing LOCAL file: ${video.originalKey}`);

      if (!fs.existsSync(video.originalKey)) {
        return reply.code(404).send({
          message: `Video file not found at: ${video.originalKey}`
        });
      }

      const fileSize = fs.statSync(video.originalKey).size;
      console.log(`✅ Local file verified: ${fileSize} bytes`);

      // Add job with local file path
      await addVideoJob(
        video.originalKey, // Local file path
        video.originalKey, // videoKey (same for local)
        hfToken || '',
        videoId,
        video._id.toString()
      );

      video.status = 'processing';
      await video.save();

      console.log(`✅ Processing started for local video ${videoId}`);
      return reply.send({ message: 'Processing started', videoId });
    } else {
      // S3 PROCESSING (existing flow)
      console.log(`   S3 Key from DB: "${video.originalKey}"`);
      console.log(`   Key length: ${video.originalKey.length}`);
      console.log(`   Key JSON: ${JSON.stringify(video.originalKey)}`);
      console.log(`   Bucket: ${process.env.AWS_S3_BUCKET || 'not set'}`);
      console.log(`   Region: ${process.env.AWS_REGION || 'us-east-1'}`);

      // CRITICAL: Verify file exists before processing (worker needs this)
      console.log(`🔍 Verifying file exists in S3 before processing...`);
      const keyExists = await verifyFileExists(video.originalKey);
      if (!keyExists) {
        console.error(`❌ CRITICAL: Key does not exist in S3!`);
        console.error(`   Key: "${video.originalKey}"`);
        console.error(`   This means the upload didn't complete successfully`);

        // Try one more time with a short delay (S3 eventual consistency)
        await new Promise(resolve => setTimeout(resolve, 2000));
        const keyExistsRetry = await verifyFileExists(video.originalKey);
        if (!keyExistsRetry) {
          return reply.code(404).send({
            message: `Video file not found in storage. Key: ${video.originalKey}. Please ensure the upload completed successfully before processing.`
          });
        }
        console.log(`✅ Key found on retry (S3 eventual consistency)`);
      } else {
        console.log(`✅ Key verified exists in S3`);
      }

      console.log('======================================================================');
      console.log('🚀 STARTING PROCESSING');
      console.log('======================================================================');
      console.log(`Video ID: ${videoId}`);
      console.log(`Video Key from DB: "${video.originalKey}"`);
      const cleanKey = video.originalKey.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
      console.log(`Cleaned Key: "${cleanKey}"`);
      console.log(`Key length: ${cleanKey.length}`);
      console.log(`Doc ID: ${video._id}`);
      console.log(`Bucket: ${process.env.AWS_S3_BUCKET || 'not set'}`);
      console.log(`Region: ${process.env.AWS_REGION || 'us-east-1'}`);
      console.log(`AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.substring(0, 10) + '...' : 'NOT SET'}`);
      console.log('======================================================================');

      // Verify the cleaned key exists (double-check after cleaning)
      console.log(`🔍 Verifying cleaned key exists in S3...`);
      const cleanKeyExists = await verifyFileExists(cleanKey);
      if (!cleanKeyExists) {
        console.error(`❌ Cleaned key does not exist: "${cleanKey}"`);
        console.error(`   Original key: "${video.originalKey}"`);
        console.error(`   This may indicate a key mismatch issue`);
        return reply.code(404).send({
          message: `Video file not found in storage. Key: ${cleanKey}. Please ensure the upload completed successfully.`
        });
      }
      console.log(`✅ Cleaned key verified exists in S3`);

      // Get or generate public URL
      let videoUrl = video.videoUrl;
      if (!videoUrl) {
        videoUrl = getPublicUrl(cleanKey);
        video.videoUrl = videoUrl;
        await video.save();
        console.log(`✅ Generated and stored public URL: ${videoUrl}`);
      } else {
        console.log(`✅ Using stored public URL: ${videoUrl}`);
      }

      console.log('======================================================================');
      console.log('📤 ADDING JOB TO QUEUE');
      console.log('======================================================================');
      console.log(`Video ID: ${videoId}`);
      console.log(`Video URL: ${videoUrl}`);
      console.log(`Video Key: "${cleanKey}"`);
      console.log(`Doc ID: ${video._id}`);
      console.log(`Bucket: ${process.env.AWS_S3_BUCKET || 'not set'}`);
      console.log(`Region: ${process.env.AWS_REGION || 'us-east-1'}`);
      console.log('======================================================================');

      await addVideoJob(
        videoUrl, // Public S3 URL
        cleanKey, // S3 key
        hfToken || '',
        videoId,
        video._id.toString()
      );

      video.status = 'processing';
      await video.save();

      console.log(`✅ Processing started for video ${videoId}`);
      return reply.send({ message: 'Processing started', videoId });
    }
  } catch (error: any) {
    console.error('Error in startProcessing:', error);
    reply.code(500).send({ message: error.message || 'Failed to start processing' });
  }
};

export const getVideos = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const userId = (req.user as any).id;
    const videos = await Video.find({ user: userId }).sort({ createdAt: -1 });
    reply.send(videos);
  } catch (error: any) {
    reply.code(500).send({ message: error.message });
  }
};

export const verifyUpload = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { videoId } = req.body as { videoId: string };
    const video = await Video.findById(videoId);

    if (!video) return reply.code(404).send({ message: 'Video not found' });
    if (video.user.toString() !== (req.user as any).id) return reply.code(403).send({ message: 'Unauthorized' });

    console.log(`🔍 Verifying upload for video ${videoId}`);
    console.log(`   Key: ${video.originalKey}`);

    // Check if it's a local file
    const isLocalFile = video.originalKey.startsWith('/') || path.isAbsolute(video.originalKey);

    if (isLocalFile) {
      // Verify local file exists
      if (fs.existsSync(video.originalKey)) {
        const stats = fs.statSync(video.originalKey);
        console.log(`✅ Local file verified: ${video.originalKey}`);
        console.log(`   Size: ${stats.size} bytes`);
        return reply.send({ verified: true, size: stats.size });
      } else {
        return reply.send({ verified: false, message: 'File not found' });
      }
    } else {
      // S3 verification
      const exists = await verifyFileExists(video.originalKey);
      if (exists) {
        console.log(`✅ File verified: ${video.originalKey}`);
        const publicUrl = getPublicUrl(video.originalKey);
        video.videoUrl = publicUrl;
        await video.save();
        console.log(`✅ Upload verified successfully for video ${videoId}`);
        console.log(`   Public URL: ${publicUrl}`);
        return reply.send({ verified: true, publicUrl });
      } else {
        return reply.send({ verified: false, message: 'File not found in S3' });
      }
    }
  } catch (error: any) {
    console.error('Error in verifyUpload:', error);
    reply.code(500).send({ message: error.message });
  }
};

export const getSubtitleDownloadUrl = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { key } = req.params as { key: string };
    const subtitlePath = path.resolve(__dirname, `../../client/public/subtitles/${key}`);

    if (fs.existsSync(subtitlePath)) {
      const fileStream = fs.createReadStream(subtitlePath);
      reply.type('text/plain');
      reply.send(fileStream);
    } else {
      return reply.code(404).send({ message: 'Subtitle not found' });
    }
  } catch (error: any) {
    reply.code(500).send({ message: error.message });
  }
};

export const getVideoPlaybackUrl = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { videoId } = req.params as { videoId: string };
    const video = await Video.findById(videoId);

    if (!video) return reply.code(404).send({ message: 'Video not found' });
    if (video.user.toString() !== (req.user as any).id) return reply.code(403).send({ message: 'Unauthorized' });

    const isLocalFile = video.originalKey.startsWith('/') || path.isAbsolute(video.originalKey);

    if (isLocalFile) {
      // Serve local file
      if (fs.existsSync(video.originalKey)) {
        return reply.send({
          videoUrl: `/api/videos/file/${videoId}`,
          subtitleUrl: video.subtitleKey ? `/subtitles/${path.basename(video.subtitleKey)}` : null,
          docId: video._id.toString(),
          title: video.title,
        });
      } else {
        return reply.code(404).send({ message: 'Video file not found' });
      }
    } else {
      // S3 URL
      const videoUrl = video.videoUrl || getPublicUrl(video.originalKey);
      const subtitleUrl = video.subtitleKey ? `/subtitles/${path.basename(video.subtitleKey)}` : null;

      return reply.send({
        videoUrl,
        subtitleUrl,
        docId: video._id.toString(),
        title: video.title,
      });
    }
  } catch (error: any) {
    reply.code(500).send({ message: error.message });
  }
};

// Serve local video files
export const serveVideoFile = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { videoId } = req.params as { videoId: string };
    const video = await Video.findById(videoId);

    if (!video) return reply.code(404).send({ message: 'Video not found' });
    if (video.user.toString() !== (req.user as any).id) return reply.code(403).send({ message: 'Unauthorized' });

    const isLocalFile = video.originalKey.startsWith('/') || path.isAbsolute(video.originalKey);

    if (isLocalFile && fs.existsSync(video.originalKey)) {
      const fileStream = fs.createReadStream(video.originalKey);
      reply.type('video/mp4');
      reply.send(fileStream);
    } else {
      return reply.code(404).send({ message: 'Video file not found' });
    }
  } catch (error: any) {
    reply.code(500).send({ message: error.message });
  }
};
