import { FastifyRequest, FastifyReply } from 'fastify';
import Video from '../models/Video';
import { getUploadUrl, getDownloadUrl, verifyFileExists, getPublicUrl } from '../services/s3Service';
import { addVideoJob } from '../services/queueService';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

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

// UPLOAD FROM URL - Download video from URL and save locally
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

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

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

    const filePath = path.join(uploadsDir, `${userId}-${Date.now()}-${sanitizedFilename}`);

    // Download the file with proper redirect and Google Drive handling
    await new Promise<void>((resolve, reject) => {
      // Helper to handle Google Drive virus scan page
      // Capture isGoogleDrive in closure
      const handleGoogleDriveDownload = (urlToDownload: string, redirectCount = 0, isGDrive = isGoogleDrive): void => {
        if (redirectCount > 10) {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
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
          const contentType = (response.headers['content-type'] || '').toLowerCase();

          // Handle redirects
          if (statusCode >= 300 && statusCode < 400) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              // Handle relative redirects
              const absoluteRedirectUrl = redirectUrl.startsWith('http')
                ? redirectUrl
                : new URL(redirectUrl, urlToDownload).toString();
              return handleGoogleDriveDownload(absoluteRedirectUrl, redirectCount + 1, isGDrive);
            }
          }

          if (statusCode !== 200) {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            reject(new Error(`Failed to download: HTTP ${statusCode}`));
            return;
          }

          // Check if we got HTML instead of video (Google Drive virus scan page)
          if (contentType.includes('text/html')) {
            let htmlData = '';
            response.on('data', (chunk) => {
              htmlData += chunk.toString();
              // Stop if we've collected enough to check
              if (htmlData.length > 50000) {
                response.destroy();
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
                // Try to extract download link from Google Drive virus scan page
                const downloadMatch = htmlData.match(/href="([^"]*uc\?[^"]*export=download[^"]*)"/i) ||
                  htmlData.match(/action="([^"]*uc\?[^"]*export=download[^"]*)"/i);
                if (downloadMatch && downloadMatch[1]) {
                  const actualUrl = downloadMatch[1].startsWith('http')
                    ? downloadMatch[1]
                    : new URL(downloadMatch[1], urlToDownload).toString();
                  return handleGoogleDriveDownload(actualUrl, redirectCount + 1, isGDrive);
                }
                const errorMsg = isGDrive
                  ? 'Google Drive file is not publicly accessible. Please share the file publicly (Anyone with the link can view) and try again, or use a direct video file URL from another source.'
                  : 'Downloaded content is HTML, not a video file. Please provide a direct link to the video file.';
                reject(new Error(errorMsg));
              }
            });
            response.on('end', () => {
              // If we got HTML and it's the end, check if it's valid
              if (htmlData.length > 0 && htmlData.includes('<html')) {
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
                reject(new Error('Downloaded content is an HTML page, not a video file. Please provide a direct video file URL.'));
              }
            });
            return;
          }

          // Valid video response - pipe to file
          const fileStream = fs.createWriteStream(filePath);
          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });

          fileStream.on('error', (err) => {
            request.abort();
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            reject(err);
          });
        });

        request.on('error', (err) => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          reject(err);
        });
      };

      handleGoogleDriveDownload(downloadUrl);
    });

    // Verify file was downloaded
    if (!fs.existsSync(filePath)) {
      throw new Error('File download failed: file was not saved');
    }

    const fileSize = fs.statSync(filePath).size;
    if (fileSize === 0) {
      fs.unlinkSync(filePath);
      throw new Error('File download failed: file is empty');
    }

    console.log(`✅ File downloaded from URL: ${filePath} (${fileSize} bytes)`);

    // Validate it's actually a video file
    if (!isVideoFile(filePath)) {
      // Check file content type
      const isVideoContent = await checkFileContentType(filePath);
      if (!isVideoContent) {
        // Read first few bytes to check if it's HTML/text
        const buffer = Buffer.alloc(Math.min(1000, fileSize));
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);
        const contentPreview = buffer.toString('utf-8', 0, 500).toLowerCase();

        if (contentPreview.includes('<html') || contentPreview.includes('<!doctype')) {
          fs.unlinkSync(filePath);
          const errorMsg = isGoogleDrive
            ? 'Downloaded content is an HTML page. Google Drive files must be publicly shared (Anyone with the link can view) for direct download. Alternatively, download the file manually and upload it directly.'
            : 'Downloaded content is an HTML page, not a video file. Please provide a direct link to the video file (not a web page).';
          throw new Error(errorMsg);
        }

        fs.unlinkSync(filePath);
        throw new Error('Downloaded file does not appear to be a valid video file. Please ensure the URL points directly to a video file (MP4, WebM, etc.).');
      }
    }

    console.log(`✅ Verified as video file: ${filePath}`);

    // Upload to S3 while keeping local copy
    const s3Key = `uploads/${userId}/${Date.now()}-${sanitizedFilename}`;
    const cleanS3Key = s3Key.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');

    // Upload to S3
    let s3UploadSuccess = false;
    try {
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const accessKey = process.env.AWS_ACCESS_KEY_ID || '';
      const secretKey = process.env.AWS_SECRET_ACCESS_KEY || '';
      const region = process.env.AWS_REGION || 'us-east-1';
      const bucket = process.env.AWS_S3_BUCKET || '';

      if (accessKey && secretKey && bucket) {
        const s3Client = new S3Client({
          region: region,
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
          },
        });

        console.log(`📤 Uploading to S3: ${cleanS3Key}`);
        const fileContent = fs.readFileSync(filePath);

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

        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: cleanS3Key,
          Body: fileContent,
          ContentType: contentType,
        }));

        console.log(`✅ Video uploaded to S3: ${cleanS3Key}`);
        s3UploadSuccess = true;
      } else {
        console.warn(`⚠️  S3 credentials not configured, skipping S3 upload`);
      }
    } catch (s3Error: any) {
      console.error(`❌ Failed to upload to S3: ${s3Error.message}`);
      console.warn(`⚠️  Continuing with local file only`);
    }

    // Create video entry - store local path for processing, S3 key if available
    const videoData: any = {
      user: userId,
      title: sanitizedFilename,
      originalKey: filePath, // Local path for processing (worker will use this)
      status: 'pending',
      videoUrl: `/uploads/${path.basename(filePath)}`,
    };

    // Store S3 key if upload was successful
    if (s3UploadSuccess) {
      videoData.s3Key = cleanS3Key;
    }

    const video = await Video.create(videoData);

    console.log(`✅ Created video entry - ID: ${video._id}`);
    console.log(`   Local path: ${filePath}`);
    if (s3UploadSuccess) {
      console.log(`   S3 key: ${cleanS3Key}`);
    }

    reply.send({
      videoId: video._id,
      filePath: filePath,
      s3Key: s3UploadSuccess ? cleanS3Key : null,
      message: s3UploadSuccess
        ? 'Video downloaded, saved locally, and uploaded to S3 successfully'
        : 'Video downloaded and saved locally (S3 upload skipped)'
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
