import { FastifyRequest, FastifyReply } from 'fastify';
import Video from '../models/Video';
import { getUploadUrl, getDownloadUrl, verifyFileExists, getPublicUrl, getPresignedUrl, getBucketName, cleanS3Key } from '../services/s3Service';
import { addVideoJob } from '../services/queueService';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const initUploadSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  hfToken: z.string().optional(), // In production, store this securely or per user
});

// DIRECT UPLOAD - Upload directly to S3
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

    // Generate S3 key
    const s3Key = `uploads/${userId}/${Date.now()}-${sanitizedFilename}`;
    const cleanKey = cleanS3Key(s3Key);

    console.log(`📤 Uploading file directly to S3: ${filename}`);
    console.log(`   S3 Key: ${cleanKey}`);
    console.log(`   User ID: ${userId}`);

    // Initialize S3 client
    const accessKey = process.env.AWS_ACCESS_KEY_ID || '';
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY || '';
    const region = process.env.AWS_REGION || 'us-east-1';
    const bucket = getBucketName();

    if (!accessKey || !secretKey) {
      return reply.code(500).send({ message: 'AWS credentials not configured' });
    }

    const s3Client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });

    // Read file stream into buffer
    const chunks: Buffer[] = [];
    const fileStream: NodeJS.ReadableStream = data.file as any;

    for await (const chunk of fileStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const fileBuffer = Buffer.concat(chunks);

    if (fileBuffer.length === 0) {
      return reply.code(400).send({ message: 'File is empty' });
    }

    // Detect content type from file extension
    const ext = path.extname(sanitizedFilename).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
    };
    const contentType = contentTypeMap[ext] || 'video/mp4';

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: cleanKey,
      Body: fileBuffer,
      ContentType: contentType,
    }));

    console.log(`✅ File uploaded to S3: ${cleanKey} (${fileBuffer.length} bytes)`);

    // Create video entry
    const video = await Video.create({
      user: userId,
      title: filename,
      originalKey: cleanKey,
      s3Key: cleanKey,
      status: 'pending',
    });

    console.log(`✅ Created video entry - ID: ${video._id}, S3 Key: ${cleanKey}`);

    reply.send({
      videoId: video._id,
      s3Key: cleanKey,
      message: 'File uploaded to S3 successfully'
    });
  } catch (error: any) {
    console.error('Error in directUpload:', error);
    reply.code(500).send({ message: error.message || 'Upload failed' });
  }
};

// Helper function to convert Google Drive sharing links to direct download links
const convertGoogleDriveLink = (url: string): string => {
  // Pattern: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // Or: https://drive.google.com/file/d/FILE_ID/edit?usp=sharing
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    const fileId = driveMatch[1];
    // Try direct download URL (requires file to be publicly shared)
    return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
  }
  return url;
};

// Helper function to validate if downloaded content is a video file
const isVideoFile = (filePath: string): boolean => {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.m4v', '.3gp', '.ogv'];
  const ext = path.extname(filePath).toLowerCase();
  return videoExtensions.includes(ext);
};

// Helper function to check file content type
const checkFileContentType = (filePath: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const buffer = Buffer.alloc(12); // Read first 12 bytes for magic numbers
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    // Check for video file magic numbers
    // MP4: ftyp
    // WebM: 1a 45 df a3
    // AVI: RIFF...AVI
    const header = buffer.toString('hex');
    const isVideo =
      header.startsWith('66747970') || // MP4: ftyp
      header.startsWith('1a45dfa3') || // WebM
      header.startsWith('52494646') || // AVI: RIFF
      header.startsWith('00000020') || // MP4 variant
      header.startsWith('00000018');   // MP4 variant

    resolve(isVideo);
  });
};

// UPLOAD FROM URL - Download video from URL and upload directly to S3
export const uploadFromUrl = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const userId = (req.user as any).id;
    const { url } = req.body as { url: string };

    if (!url || typeof url !== 'string') {
      return reply.code(400).send({ message: 'Valid URL is required' });
    }

    // Validate URL format
    let videoUrl: URL;
    try {
      videoUrl = new URL(url);
    } catch {
      return reply.code(400).send({ message: 'Invalid URL format' });
    }

    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(videoUrl.protocol)) {
      return reply.code(400).send({ message: 'Only HTTP and HTTPS URLs are supported' });
    }

    // Convert Google Drive sharing links to direct download links
    const isGoogleDrive = url.includes('drive.google.com');
    let downloadUrl = url;
    if (isGoogleDrive) {
      downloadUrl = convertGoogleDriveLink(url);
      console.log(`🔄 Converted Google Drive link:`);
      console.log(`   Original: ${url}`);
      console.log(`   Direct download: ${downloadUrl}`);
      console.log(`   ⚠️  Note: File must be publicly shared for direct download to work`);
    }

    console.log(`📥 Downloading video from URL: ${downloadUrl}`);
    console.log(`   User ID: ${userId}`);

    // Extract filename from URL or generate one
    const urlPath = new URL(downloadUrl).pathname;
    let urlFilename = urlPath.split('/').pop() || 'video.mp4';

    // Remove query parameters from filename
    urlFilename = urlFilename.split('?')[0];

    // If no extension or invalid, add .mp4
    const ext = path.extname(urlFilename).toLowerCase();
    if (!ext || !['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.m4v', '.3gp', '.ogv'].includes(ext)) {
      urlFilename = urlFilename || 'video';
      urlFilename = urlFilename + '.mp4';
    }

    const sanitizedFilename = urlFilename
      .replace(/[<>:"|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/\/+/g, '_');

    // Generate S3 key
    const s3Key = `uploads/${userId}/${Date.now()}-${sanitizedFilename}`;
    const cleanS3KeyValue = cleanS3Key(s3Key);

    // Initialize S3 client
    const accessKey = process.env.AWS_ACCESS_KEY_ID || '';
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY || '';
    const region = process.env.AWS_REGION || 'us-east-1';
    const bucket = getBucketName();

    if (!accessKey || !secretKey) {
      return reply.code(500).send({ message: 'AWS credentials not configured' });
    }

    const s3Client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });

    // Detect content type from file extension
    const contentTypeMap: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
    };
    const contentType = contentTypeMap[ext] || 'video/mp4';

    // Download and stream directly to S3
    const chunks: Buffer[] = [];
    let firstChunk: Buffer | null = null;
    let totalSize = 0;
    let isValidVideo = false;

    await new Promise<void>((resolve, reject) => {
      const handleGoogleDriveDownload = (urlToDownload: string, redirectCount = 0, isGDrive = isGoogleDrive): void => {
        if (redirectCount > 10) {
          reject(new Error('Too many redirects (max 10)'));
          return;
        }

        const urlObj = new URL(urlToDownload);
        const proto = urlObj.protocol === 'https:' ? https : http;
        const options: any = {
          hostname: urlObj.hostname,
          port: urlObj.port || undefined,
          path: urlObj.pathname + urlObj.search,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        };

        const request = proto.get(options, (response) => {
          const statusCode = response.statusCode || 0;
          const responseContentType = (response.headers['content-type'] || '').toLowerCase();

          // Handle redirects
          if (statusCode >= 300 && statusCode < 400) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              const absoluteRedirectUrl = redirectUrl.startsWith('http')
                ? redirectUrl
                : new URL(redirectUrl, urlToDownload).toString();
              return handleGoogleDriveDownload(absoluteRedirectUrl, redirectCount + 1, isGDrive);
            }
          }

          if (statusCode !== 200) {
            reject(new Error(`Failed to download: HTTP ${statusCode}`));
            return;
          }

          // Check if we got HTML instead of video
          if (responseContentType.includes('text/html')) {
            let htmlData = '';
            response.on('data', (chunk) => {
              htmlData += chunk.toString();
              if (htmlData.length > 50000) {
                response.destroy();
                const downloadMatch = htmlData.match(/href="([^"]*uc\?[^"]*export=download[^"]*)"/i) ||
                  htmlData.match(/action="([^"]*uc\?[^"]*export=download[^"]*)"/i);
                if (downloadMatch && downloadMatch[1]) {
                  const actualUrl = downloadMatch[1].startsWith('http')
                    ? downloadMatch[1]
                    : new URL(downloadMatch[1], urlToDownload).toString();
                  return handleGoogleDriveDownload(actualUrl, redirectCount + 1, isGDrive);
                }
                const errorMsg = isGDrive
                  ? 'Google Drive file is not publicly accessible. Please share the file publicly (Anyone with the link can view) and try again.'
                  : 'Downloaded content is HTML, not a video file. Please provide a direct link to the video file.';
                reject(new Error(errorMsg));
              }
            });
            response.on('end', () => {
              if (htmlData.length > 0 && htmlData.includes('<html')) {
                reject(new Error('Downloaded content is an HTML page, not a video file. Please provide a direct video file URL.'));
              }
            });
            return;
          }

          // Stream video data to buffer
          response.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            totalSize += chunk.length;
            if (firstChunk === null && chunk.length > 0) {
              firstChunk = Buffer.from(chunk.slice(0, Math.min(12, chunk.length)));
            }
          });

          response.on('end', () => {
            if (totalSize === 0) {
              reject(new Error('File download failed: file is empty'));
              return;
            }
            resolve();
          });

          response.on('error', (err) => {
            reject(err);
          });
        });

        request.on('error', (err) => {
          reject(err);
        });
      };

      handleGoogleDriveDownload(downloadUrl);
    });

    // Validate it's a video file by checking first bytes
    if (firstChunk) {
      const chunk: Buffer = firstChunk;
      const header = chunk.toString('hex');
      isValidVideo =
        header.startsWith('66747970') || // MP4: ftyp
        header.startsWith('1a45dfa3') || // WebM
        header.startsWith('52494646') || // AVI: RIFF
        header.startsWith('00000020') || // MP4 variant
        header.startsWith('00000018');   // MP4 variant

      if (!isValidVideo) {
        // Check if it's HTML
        const previewLength = Math.min(500, chunk.length);
        const preview = chunk.toString('utf-8', 0, previewLength).toLowerCase();
        if (preview.includes('<html') || preview.includes('<!doctype')) {
          throw new Error('Downloaded content is an HTML page, not a video file. Please provide a direct link to the video file.');
        }
        throw new Error('Downloaded file does not appear to be a valid video file. Please ensure the URL points directly to a video file (MP4, WebM, etc.).');
      }
    }

    console.log(`✅ File downloaded from URL: ${totalSize} bytes`);

    // Upload to S3
    const fileBuffer = Buffer.concat(chunks);
    console.log(`📤 Uploading to S3: ${cleanS3KeyValue}`);

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: cleanS3KeyValue,
      Body: fileBuffer,
      ContentType: contentType,
    }));

    console.log(`✅ Video uploaded to S3: ${cleanS3KeyValue}`);

    // Create video entry - store only S3 key
    const video = await Video.create({
      user: userId,
      title: sanitizedFilename,
      originalKey: cleanS3KeyValue,
      s3Key: cleanS3KeyValue,
      status: 'pending',
    });

    console.log(`✅ Created video entry - ID: ${video._id}, S3 Key: ${cleanS3KeyValue}`);

    reply.send({
      videoId: video._id,
      s3Key: cleanS3KeyValue,
      message: 'Video downloaded and uploaded to S3 successfully'
    });
  } catch (error: any) {
    console.error('Error in uploadFromUrl:', error);
    reply.code(500).send({ message: error.message || 'URL upload failed' });
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
        s3Key: key, // Also store in s3Key for consistency
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
    console.log(`   S3 Key: "${video.s3Key || video.originalKey}"`);

    // Use s3Key if available, otherwise use originalKey (should be S3 key now)
    const s3Key = video.s3Key || video.originalKey;
    const cleanKey = cleanS3Key(s3Key);

    console.log(`   Cleaned Key: "${cleanKey}"`);
    console.log(`   Bucket: ${process.env.AWS_S3_BUCKET || 'not set'}`);
    console.log(`   Region: ${process.env.AWS_REGION || 'us-east-1'}`);

    // Verify file exists in S3
    console.log(`🔍 Verifying file exists in S3 before processing...`);
    const keyExists = await verifyFileExists(cleanKey);
    if (!keyExists) {
      console.error(`❌ CRITICAL: Key does not exist in S3!`);
      console.error(`   Key: "${cleanKey}"`);

      // Try one more time with a short delay (S3 eventual consistency)
      await new Promise(resolve => setTimeout(resolve, 2000));
      const keyExistsRetry = await verifyFileExists(cleanKey);
      if (!keyExistsRetry) {
        return reply.code(404).send({
          message: `Video file not found in S3. Key: ${cleanKey}. Please ensure the upload completed successfully before processing.`
        });
      }
      console.log(`✅ Key found on retry (S3 eventual consistency)`);
    } else {
      console.log(`✅ Key verified exists in S3`);
    }

    // Generate presigned URL for worker
    const videoUrl = await getPresignedUrl(cleanKey, 3600); // 1 hour expiry
    console.log(`✅ Generated presigned URL for processing`);

    console.log('======================================================================');
    console.log('📤 ADDING JOB TO QUEUE');
    console.log('======================================================================');
    console.log(`Video ID: ${videoId}`);
    console.log(`Video Key: "${cleanKey}"`);
    console.log(`Doc ID: ${video._id}`);
    console.log('======================================================================');

    await addVideoJob(
      videoUrl, // Presigned S3 URL
      cleanKey, // S3 key
      hfToken || '',
      videoId,
      video._id.toString()
    );

    video.status = 'processing';
    await video.save();

    console.log(`✅ Processing started for video ${videoId}`);
    return reply.send({ message: 'Processing started', videoId });
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
    const s3Key = video.s3Key || video.originalKey;
    console.log(`   S3 Key: ${s3Key}`);

    // S3 verification
    const exists = await verifyFileExists(s3Key);
    if (exists) {
      console.log(`✅ File verified in S3: ${s3Key}`);
      return reply.send({ verified: true, s3Key });
    } else {
      return reply.send({ verified: false, message: 'File not found in S3' });
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

    console.log(`🔍 Getting playback URLs for video ${videoId}`);
    console.log(`   Video S3 Key: ${video.s3Key || video.originalKey}`);
    console.log(`   Subtitle S3 Key: ${video.subtitleS3Key || 'NOT SET'}`);
    console.log(`   Video Status: ${video.status}`);
    console.log(`   Full video object:`, JSON.stringify({
      _id: video._id,
      subtitleS3Key: video.subtitleS3Key,
      status: video.status,
      s3Key: video.s3Key,
      originalKey: video.originalKey
    }, null, 2));

    // Generate presigned URL for S3 video
    const videoS3Key = video.s3Key || video.originalKey;
    let videoUrl: string;
    try {
      videoUrl = await getPresignedUrl(videoS3Key, 3600); // 1 hour expiry
      console.log(`✅ Generated presigned URL for video: ${videoS3Key}`);
    } catch (error: any) {
      console.error(`❌ Failed to generate presigned URL for video: ${error.message}`);
      return reply.code(500).send({ message: 'Failed to generate video URL' });
    }

    // Generate presigned URL for subtitle if available
    let subtitleUrl: string | null = null;
    if (video.subtitleS3Key && video.subtitleS3Key.trim() !== '') {
      try {
        console.log(`   Attempting to generate presigned URL for subtitleS3Key: ${video.subtitleS3Key}`);
        // Verify the file exists in S3 first
        const subtitleExists = await verifyFileExists(video.subtitleS3Key);
        if (subtitleExists) {
          subtitleUrl = await getPresignedUrl(video.subtitleS3Key, 3600); // 1 hour expiry
          console.log(`✅ Generated presigned URL for subtitle: ${video.subtitleS3Key}`);
          console.log(`   Subtitle URL (first 100 chars): ${subtitleUrl.substring(0, 100)}...`);
        } else {
          console.warn(`⚠️  Subtitle file not found in S3: ${video.subtitleS3Key}`);
          subtitleUrl = null;
        }
      } catch (error: any) {
        console.error(`❌ Failed to generate presigned URL for subtitle: ${error.message}`);
        console.error(`   Error stack:`, error.stack);
        console.error(`   Subtitle S3 Key: ${video.subtitleS3Key}`);
        // Subtitle URL generation failed, but continue without it
        subtitleUrl = null;
      }
    } else {
      console.warn(`⚠️  No subtitleS3Key found for video ${videoId}`);
      console.warn(`   Video status: ${video.status}`);
      console.warn(`   Subtitle key (legacy): ${video.subtitleKey || 'NOT SET'}`);
      console.warn(`   subtitleS3Key value: ${video.subtitleS3Key}`);
      console.warn(`   subtitleS3Key type: ${typeof video.subtitleS3Key}`);
      
      // Try to find subtitle by pattern if status is completed
      if (video.status === 'completed') {
        console.log(`   🔍 Attempting to find subtitle file in S3 by pattern...`);
        try {
          // Try common subtitle paths based on video key
          const videoS3Key = video.s3Key || video.originalKey;
          const userId = video.user.toString();
          const docId = video._id.toString();
          
          // Try different possible subtitle paths
          const possibleKeys = [
            `subtitles/${userId}/${docId}.ass`,
            `subtitles/${userId}/${video._id}.ass`,
            `subtitles/${userId}/${videoId}.ass`,
          ];
          
          // Extract userId from video key if possible
          if (videoS3Key.includes('/')) {
            const parts = videoS3Key.split('/');
            if (parts.length >= 2 && parts[0] === 'uploads') {
              const extractedUserId = parts[1];
              possibleKeys.unshift(
                `subtitles/${extractedUserId}/${docId}.ass`,
                `subtitles/${extractedUserId}/${video._id}.ass`,
                `subtitles/${extractedUserId}/${videoId}.ass`
              );
            }
          }
          
          console.log(`   Trying possible subtitle keys:`, possibleKeys);
          
          for (const possibleKey of possibleKeys) {
            const exists = await verifyFileExists(possibleKey);
            if (exists) {
              console.log(`   ✅ Found subtitle at: ${possibleKey}`);
              // Update the database with the found key
              await Video.findByIdAndUpdate(videoId, { subtitleS3Key: possibleKey });
              subtitleUrl = await getPresignedUrl(possibleKey, 3600);
              console.log(`   ✅ Generated presigned URL for found subtitle: ${possibleKey}`);
              break;
            }
          }
          
          if (!subtitleUrl) {
            console.warn(`   ⚠️  Could not find subtitle file in S3 with any of the tried patterns`);
          }
        } catch (error: any) {
          console.error(`   ❌ Error searching for subtitle: ${error.message}`);
        }
      }
    }

    const response = {
      videoUrl,
      subtitleUrl: subtitleUrl || null, // Ensure null instead of undefined
      docId: video._id.toString(),
      title: video.title,
      subtitleS3Key: video.subtitleS3Key || null, // Also return the S3 key for debugging
    };

    console.log(`📤 Returning playback URLs:`);
    console.log(`   Video URL: ${videoUrl.substring(0, 100)}...`);
    console.log(`   Subtitle URL: ${subtitleUrl ? subtitleUrl.substring(0, 100) + '...' : 'null'}`);
    console.log(`   Subtitle S3 Key in DB: ${video.subtitleS3Key || 'NOT SET'}`);
    console.log(`   Response:`, JSON.stringify({ ...response, videoUrl: response.videoUrl.substring(0, 50) + '...', subtitleUrl: response.subtitleUrl ? response.subtitleUrl.substring(0, 50) + '...' : 'null' }, null, 2));

    return reply.send(response);
  } catch (error: any) {
    console.error(`❌ Error in getVideoPlaybackUrl:`, error);
    reply.code(500).send({ message: error.message });
  }
};

// These endpoints are deprecated - all files are now served from S3 via presigned URLs
// Keeping them for backward compatibility but they will redirect to S3
export const serveVideoFile = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { videoId } = req.params as { videoId: string };
    const video = await Video.findById(videoId);

    if (!video) return reply.code(404).send({ message: 'Video not found' });
    if (video.user.toString() !== (req.user as any).id) return reply.code(403).send({ message: 'Unauthorized' });

    // Generate presigned URL and redirect
    const videoS3Key = video.s3Key || video.originalKey;
    const presignedUrl = await getPresignedUrl(videoS3Key, 3600);
    return reply.redirect(presignedUrl);
  } catch (error: any) {
    reply.code(500).send({ message: error.message });
  }
};

export const serveSubtitleFile = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { videoId } = req.params as { videoId: string };
    const video = await Video.findById(videoId);

    if (!video) return reply.code(404).send({ message: 'Video not found' });
    if (video.user.toString() !== (req.user as any).id) return reply.code(403).send({ message: 'Unauthorized' });

    if (!video.subtitleS3Key) {
      return reply.code(404).send({ message: 'Subtitle not found' });
    }

    // Generate presigned URL and redirect
    const presignedUrl = await getPresignedUrl(video.subtitleS3Key, 3600);
    return reply.redirect(presignedUrl);
  } catch (error: any) {
    reply.code(500).send({ message: error.message });
  }
};
