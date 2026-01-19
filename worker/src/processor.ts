import { Job } from 'bullmq';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// Helper to get bucket name consistently
const getBucketName = (): string => {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET environment variable is required');
  }
  return bucket;
};

// Lazy S3 client initialization to ensure env vars are loaded
let s3Client: S3Client | null = null;
const getS3Client = (): S3Client => {
  if (!s3Client) {
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
    
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) are required in worker/.env');
    }
    
    console.log(`🔧 Initializing S3 client - Region: ${region}, AccessKey: ${accessKeyId.substring(0, 8)}...`);
    
    s3Client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
      maxAttempts: 3,
    });
  }
  return s3Client;
};

// Log S3 configuration lazily (only when first used)
let configLogged = false;
const logS3Config = () => {
  if (!configLogged) {
    try {
      console.log(`Worker S3 Config - Region: ${process.env.AWS_REGION || 'us-east-1'}, Bucket: ${getBucketName()}`);
      configLogged = true;
    } catch (error) {
      // Ignore error during logging, will be caught when actually used
    }
  }
};

export const processVideo = async (job: Job) => {
  // Log S3 config on first use (after env vars are loaded)
  logS3Config();
  
  console.log('='.repeat(70));
  console.log('📥 WORKER RECEIVED JOB');
  console.log('='.repeat(70));
  console.log(`Job ID: ${job.id}`);
  console.log(`Job Data:`, JSON.stringify(job.data, null, 2));
  console.log(`Raw job.data.videoKey:`, job.data.videoKey);
  console.log(`videoKey type:`, typeof job.data.videoKey);
  console.log(`videoKey length:`, job.data.videoKey?.length);
  if (job.data.videoKey) {
    console.log(`videoKey bytes: ${Buffer.from(job.data.videoKey).toString('hex').substring(0, 100)}...`);
  }
  console.log('='.repeat(70));
  
  // Extract job data - ensure we get the exact key
  const jobData = job.data;
  const videoKey = jobData?.videoKey;
  const videoUrl = jobData?.videoUrl; // Presigned URL from server (REQUIRED)
  // Handle hfToken - empty string from job should fall back to env
  const hfTokenFromJob = jobData?.hfToken;
  const hfTokenFromEnv = process.env.HF_TOKEN;
  // Use job token if it's a non-empty string, otherwise use env token
  const hfToken = (hfTokenFromJob && hfTokenFromJob.trim() !== '') ? hfTokenFromJob : hfTokenFromEnv;
  const docId = jobData?.docId;
  const videoId = jobData?.videoId;
  
  // videoUrl is optional now - we use direct S3 download with videoKey
  // But we'll log it for reference if provided

  console.log('='.repeat(70));
  console.log('📥 EXTRACTING JOB DATA');
  console.log('='.repeat(70));
  console.log(`Raw job.data:`, JSON.stringify(jobData, null, 2));
  console.log(`videoKey extracted: "${videoKey}"`);
  console.log(`videoUrl provided: ${videoUrl ? 'YES ✅' : 'NO - will download from S3'}`);
  if (videoUrl) {
    console.log(`   Presigned URL (first 100 chars): ${videoUrl.substring(0, 100)}...`);
  }
  console.log(`videoKey type: ${typeof videoKey}`);
  console.log(`videoKey is null/undefined: ${videoKey == null}`);
  console.log(`HF_TOKEN from job: ${hfTokenFromJob ? (hfTokenFromJob.trim() ? 'PROVIDED (non-empty)' : 'PROVIDED (empty)') : 'NOT PROVIDED'}`);
  console.log(`HF_TOKEN from env: ${hfTokenFromEnv ? 'PROVIDED ✅' : 'NOT PROVIDED ❌'}`);
  console.log(`HF_TOKEN final: ${hfToken ? 'AVAILABLE ✅' : 'MISSING ❌'}`);
  console.log('='.repeat(70));

  if (!hfToken || hfToken.trim() === '') {
    const errorMsg = 'HF_TOKEN is missing. Please set HF_TOKEN in worker/.env file.';
    console.error(`❌ ${errorMsg}`);
    console.error(`   Job hfToken: "${hfTokenFromJob || 'undefined'}"`);
    console.error(`   Env HF_TOKEN: ${hfTokenFromEnv ? `SET (${hfTokenFromEnv.substring(0, 10)}...)` : 'NOT SET ❌'}`);
    console.error(`   Please add HF_TOKEN=your_token_here to worker/.env file`);
    throw new Error(errorMsg);
  }
  
  console.log(`✅ HF_TOKEN available (masked for security)`);

  if (!videoKey || typeof videoKey !== 'string') {
    console.error('❌ videoKey is missing or invalid from job data');
    console.error('   Full job.data:', JSON.stringify(jobData, null, 2));
    console.error('   job.data keys:', Object.keys(jobData || {}));
    throw new Error(`videoKey is missing or invalid from job data. Type: ${typeof videoKey}, Value: ${videoKey}`);
  }

  console.log(`📥 Processing video - Job ID: ${job.id}, Video ID: ${videoId}, Video Key: "${videoKey}", Doc ID: ${docId || 'N/A'}`);

  const tempDir = path.resolve(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  
  // Log temp directory for debugging
  console.log(`📁 Temp directory: ${tempDir}`);
  console.log(`📁 Temp directory exists: ${fs.existsSync(tempDir)}`);
  console.log(`📁 Temp directory absolute: ${path.resolve(tempDir)}`);
  
  // Cleanup old temp files (older than 1 hour) to prevent disk space issues
  try {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const files = fs.readdirSync(tempDir);
    let cleanedCount = 0;
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      } catch (err) {
        // Ignore errors for individual files
      }
    });
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old temp file(s)`);
    }
  } catch (cleanupError: any) {
    console.warn(`⚠️  Error during temp cleanup: ${cleanupError.message}`);
  }

  // Helper function to clean S3 keys (used for subtitles)
  const cleanS3Key = (key: string): string => {
    if (!key || typeof key !== 'string') {
      throw new Error(`Invalid key provided to cleanS3Key: ${typeof key} - ${key}`);
    }
    return key.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  };

  // Handle local file or download from URL
  let localVideoPath: string;
  // Check if it's a local file: explicit flag OR videoUrl is a file path (not HTTP)
  const isLocalFile = jobData?.isLocalFile || (videoUrl && !videoUrl.startsWith('http') && (videoUrl.startsWith('/') || path.isAbsolute(videoUrl)));
  
  if (isLocalFile) {
    // LOCAL FILE - Use directly
    console.log('='.repeat(70));
    console.log('📁 USING LOCAL VIDEO FILE');
    console.log('='.repeat(70));
    console.log(`✅ Local file path provided`);
    console.log(`   Original path: ${videoUrl}`);
    
    // Check if we're running in Docker
    const isDocker = fs.existsSync('/.dockerenv') || process.env.REDIS_HOST === 'redis';
    console.log(`   Running in Docker: ${isDocker ? 'YES ✅' : 'NO (local)'}`);
    
    // Map server path to Docker mount path
    // Server saves to: /path/to/server/uploads/filename.mp4
    // Docker mount: /app/server-uploads/filename.mp4
    let actualPath = videoUrl;
    const filename = path.basename(videoUrl) || `video-${videoId || Date.now()}.mp4`;
    const dockerPath = path.join('/app/server-uploads', filename);
    
    console.log(`   🔍 Looking for file:`);
    console.log(`      Original path: ${videoUrl}`);
    console.log(`      Extracted filename: ${filename}`);
    
    // Try Docker mount path if in Docker, otherwise try original path first
    console.log(`      Docker mount path: ${dockerPath}`);
    
    if (isDocker) {
      // In Docker: try Docker mount path first (volume mount)
      // List all files in Docker mount for debugging
      try {
        const allFiles = fs.readdirSync('/app/server-uploads');
        console.log(`      Files in Docker mount (${allFiles.length} total):`, allFiles.slice(-5).join(', '));
      } catch (err) {
        console.warn(`      Could not list Docker mount directory: ${err}`);
      }
      
      if (fs.existsSync(dockerPath)) {
        actualPath = dockerPath;
        console.log(`   ✅ Found in Docker mount: ${actualPath}`);
      } else if (fs.existsSync(videoUrl)) {
        actualPath = videoUrl;
        console.log(`   ✅ Found at original path: ${actualPath}`);
      } else {
        // Try to find file by matching timestamp or user ID from filename
        // Filename format: {userId}-{timestamp}-{originalName}
        try {
          const allFiles = fs.readdirSync('/app/server-uploads');
          const matchingFiles = allFiles.filter(f => 
            f.includes(filename.split('-')[0]) || // Match user ID
            f.endsWith(path.extname(filename)) || // Match extension
            f.includes(path.basename(filename, path.extname(filename))) // Match base name
          );
          
          if (matchingFiles.length > 0) {
            console.log(`   🔍 Found ${matchingFiles.length} potential matches:`, matchingFiles.slice(0, 3).join(', '));
            // Try the most recent match
            const matchedPath = path.join('/app/server-uploads', matchingFiles[matchingFiles.length - 1]);
            if (fs.existsSync(matchedPath)) {
              actualPath = matchedPath;
              console.log(`   ✅ Using matched file: ${actualPath}`);
            }
          }
        } catch (err) {
          console.warn(`   ⚠️  Could not search for matching files: ${err}`);
        }
      }
    } else {
      // NOT in Docker: try original path first
      if (fs.existsSync(videoUrl)) {
        actualPath = videoUrl;
        console.log(`   ✅ Found at original path (local): ${actualPath}`);
      } else {
        // Try Docker path as fallback (in case config is wrong)
        if (fs.existsSync(dockerPath)) {
          actualPath = dockerPath;
          console.log(`   ✅ Found in Docker mount (unexpected): ${actualPath}`);
        }
      }
    }
    
    // Final check
    if (!fs.existsSync(actualPath)) {
        // Try alternative paths
        const altPaths = [
          dockerPath,
          path.join('/app', 'server-uploads', filename),
          videoUrl,
        ];
        
        let found = false;
        for (const altPath of altPaths) {
          if (fs.existsSync(altPath)) {
            actualPath = altPath;
            found = true;
            console.log(`   ✅ Found at: ${actualPath}`);
            break;
          }
        }
        
        if (!found) {
          // Last resort: wait a bit and retry (Docker volume sync delay)
          console.log(`   ⏳ File not found immediately, waiting 2 seconds for Docker volume sync...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Retry all paths
          if (fs.existsSync(dockerPath)) {
            actualPath = dockerPath;
            console.log(`   ✅ Found after retry: ${actualPath}`);
          } else if (fs.existsSync(videoUrl)) {
            actualPath = videoUrl;
            console.log(`   ✅ Found after retry: ${actualPath}`);
          } else {
            console.error(`   ❌ File still not found after retry. Tried:`);
            altPaths.forEach(p => console.error(`      - ${p}`));
            // List recent files to help debug
            try {
              const allFiles = fs.readdirSync('/app/server-uploads');
              const recentFiles = allFiles.slice(-10);
              console.error(`   Recent files in Docker mount (${allFiles.length} total):`, recentFiles.join(', '));
              console.error(`   Looking for filename containing: ${filename.split('-')[0]} (user ID)`);
            } catch (err) {
              console.error(`   Could not list files: ${err}`);
            }
            throw new Error(`Local video file not found. Original: ${videoUrl}, Docker: ${dockerPath}. Check if file exists in /app/server-uploads/`);
          }
        }
      }
    
    const fileSize = fs.statSync(actualPath).size;
    console.log(`✅ Local file verified: ${fileSize} bytes`);
    
    // Copy to temp directory for processing (Python script expects it there)
    localVideoPath = path.join(tempDir, filename);
    fs.copyFileSync(actualPath, localVideoPath);
    console.log(`✅ Copied local file to temp directory: ${localVideoPath}`);
    job.updateProgress(10);
  } else {
    // DOWNLOAD FROM URL (S3 public URL)
    if (!videoUrl || typeof videoUrl !== 'string' || !videoUrl.startsWith('http')) {
      throw new Error(`Invalid or missing public video URL. videoUrl: ${videoUrl}. The bucket must be public and videoUrl must be a valid HTTP(S) URL.`);
    }
    
    console.log('='.repeat(70));
    console.log('📥 DOWNLOADING VIDEO FROM PUBLIC URL (HTTP)');
    console.log('='.repeat(70));
    console.log(`✅ Using public URL - downloading via HTTP`);
    console.log(`   Video URL: ${videoUrl}`);
    console.log(`   Video Key: "${videoKey}" (for reference only)`);
    
    try {
      console.log(`🔄 Downloading from URL...`);
      const https = require('https');
      const http = require('http');
      
      const parsedUrl = new URL(videoUrl);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      const filename = path.basename(videoKey) || `video-${videoId || Date.now()}.mp4`;
      localVideoPath = path.join(tempDir, filename);
      
      console.log(`   Downloading to: ${localVideoPath}`);
      console.log(`   URL: ${videoUrl}`);
      
      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(localVideoPath);
        let downloadedBytes = 0;
        
        const request = protocol.get(videoUrl, (response: any) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            fileStream.close();
            if (fs.existsSync(localVideoPath)) {
              try { fs.unlinkSync(localVideoPath); } catch {}
            }
            const redirectUrl = response.headers.location;
            console.log(`   Following redirect to: ${redirectUrl}`);
            protocol.get(redirectUrl!, (redirectResponse: any) => {
              if (redirectResponse.statusCode !== 200) {
                reject(new Error(`HTTP ${redirectResponse.statusCode}: Failed to download video from redirect URL`));
                return;
              }
              redirectResponse.pipe(fileStream);
              redirectResponse.on('data', (chunk: Buffer) => { downloadedBytes += chunk.length; });
              fileStream.on('finish', () => {
                fileStream.close();
                console.log(`   Downloaded ${downloadedBytes} bytes`);
                resolve(null);
              });
            }).on('error', (err: any) => {
              fileStream.close();
              if (fs.existsSync(localVideoPath)) fs.unlinkSync(localVideoPath);
              reject(err);
            });
            return;
          }
          
          if (response.statusCode !== 200) {
            fileStream.close();
            reject(new Error(`HTTP ${response.statusCode}: Failed to download video from URL`));
            return;
          }
          
          response.pipe(fileStream);
          response.on('data', (chunk: Buffer) => { 
            downloadedBytes += chunk.length;
          });
          
          fileStream.on('finish', () => {
            fileStream.close();
            console.log(`   Downloaded ${downloadedBytes} bytes`);
            resolve(null);
          });
        });
        
        request.on('error', (err: any) => {
          fileStream.close();
          if (fs.existsSync(localVideoPath)) {
            try { fs.unlinkSync(localVideoPath); } catch {}
          }
          reject(err);
        });
        
        fileStream.on('error', (err: any) => {
          request.abort();
          if (fs.existsSync(localVideoPath)) {
            try { fs.unlinkSync(localVideoPath); } catch {}
          }
          reject(err);
        });
      });
      
      const fileSize = fs.statSync(localVideoPath).size;
      console.log(`✅ Successfully downloaded video to: ${localVideoPath}`);
      console.log(`   File size: ${fileSize} bytes`);
      job.updateProgress(10);
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      console.error(`❌ Failed to download video from URL: ${errorMessage}`);
      console.error(`   URL: ${videoUrl}`);
      console.error(`   Error type: ${error.name || 'Unknown'}`);
      if (error.code) console.error(`   Error code: ${error.code}`);
      throw new Error(`Failed to download video from URL: ${errorMessage}`);
    }
  }

  // 2. Run Python Script
  const scriptPath = path.resolve(__dirname, '../python/script.py');
  
  return new Promise((resolve, reject) => {
    // Check if python command exists, prefer venv
    const venvPython = path.resolve(__dirname, '../venv/bin/python');
    const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';
    
    console.log(`Using python executable: ${pythonCmd}`);
    console.log(`Spawning python script: ${pythonCmd} ${scriptPath}`);
    console.log(`HF Token provided: ${hfToken ? 'Yes (masked)' : 'No'}`);

    let currentProgress = 0;

    // Build Python command args - use local file (already downloaded from S3)
    const pythonArgs = [scriptPath];
    
    // Use local file (already downloaded from S3 using AWS credentials)
    console.log(`📁 Using local file (downloaded from S3): ${localVideoPath}`);
    pythonArgs.push('--input', localVideoPath);
    pythonArgs.push('--token', hfToken);
    pythonArgs.push('--output_dir', tempDir);
    
    console.log(`Python command: ${pythonCmd} ${scriptPath} --input ${localVideoPath} --token [TOKEN] --output_dir ${tempDir}`);
    // Set environment variables for Python subprocess to match standalone execution
    const pythonEnv = {
      ...process.env,
      PYTHONUNBUFFERED: '1',  // Ensure Python output is unbuffered
      OMP_NUM_THREADS: '1',   // Limit OpenMP threads to avoid conflicts
      MKL_NUM_THREADS: '1',   // Limit MKL threads
      NUMEXPR_NUM_THREADS: '1', // Limit NumExpr threads
    };
    
    const pythonProcess = spawn(pythonCmd, pythonArgs, {
      env: pythonEnv,
      cwd: path.resolve(__dirname, '../../'), // Set working directory to worker root
    });

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (!output) return;
      
      console.log(`Python: ${output}`);
      // Parse progress if possible
      if (output.includes('Step 1')) currentProgress = 10;
      if (output.includes('Detected Language')) currentProgress = 20;
      if (output.includes('Step 2')) currentProgress = 40;
      if (output.includes('Step 3')) currentProgress = 70;
      if (output.includes('Success')) currentProgress = 90;

      // Send structured data
      job.updateProgress({ percent: currentProgress, message: output });
    });

    pythonProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (!output) return;
      
      // Filter out warnings and non-critical errors to avoid confusing the user
      if (output.includes('UserWarning') || 
          output.includes('FutureWarning') || 
          output.includes('DeprecationWarning') ||
          output.includes('Lightning automatically upgraded') ||
          output.includes('Model was trained with')) {
          return;
      }

      console.error(`Python Error: ${output}`);
      // Also send stderr as log
      job.updateProgress({ percent: currentProgress, message: `[LOG] ${output}` });
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start python process:', err);
      
      // Cleanup on process error
      try {
        if (localVideoPath && fs.existsSync(localVideoPath)) {
          fs.unlinkSync(localVideoPath);
          console.log(`🧹 Cleaned up video file after process error: ${localVideoPath}`);
        }
      } catch (cleanupError: any) {
        console.warn(`⚠️  Error cleaning up after process error: ${cleanupError.message}`);
      }
      
      reject(new Error(`Failed to start python process: ${err.message}`));
    });

    pythonProcess.on('close', async (code, signal) => {
      if (code !== 0) {
        // Handle crashes - provide clear error messages
        let exitMsg: string;
        if (code === null) {
          if (signal === 'SIGSEGV') {
            exitMsg = `Python script crashed with SIGSEGV (segmentation fault). This is a known issue with faster-whisper/ctranslate2 on macOS.\n   Possible solutions:\n   1. Try a smaller video file\n   2. Check Python dependencies: pip install --upgrade whisperx faster-whisper\n   3. Try using a different model size (currently using 'small')\n   4. Check system memory availability\n   5. Ensure you're using the correct Python version (3.11 recommended)`;
          } else if (signal === 'SIGKILL') {
            exitMsg = `Python script was killed (OOM - out of memory). Try reducing video size or freeing up system memory.`;
          } else {
            exitMsg = `Python script crashed/killed (Signal: ${signal}). Check memory and dependencies.`;
          }
        } else {
          // Python script exited with non-zero code - check stderr output
          exitMsg = `Python script exited with code ${code}.`;
          if (currentProgress === 0) {
            // If we haven't made progress, it's likely a download or script startup error
            exitMsg = `Python script failed immediately (exit code ${code}).`;
            exitMsg += `\n   This usually means:`;
            exitMsg += `\n   1. Video download failed from: ${videoUrl}`;
            exitMsg += `\n   2. Python dependencies missing (whisperx, torch, etc.)`;
            exitMsg += `\n   3. Local video file path invalid: ${localVideoPath || 'N/A'}`;
            exitMsg += `\n   Check worker logs above for actual Python error output.`;
          } else {
            exitMsg = `Python script exited with code ${code} at ${currentProgress}% progress. Check Python output above for details.`;
          }
        }
        
        console.error(`❌ ${exitMsg}`);
        console.error(`   Exit code: ${code}`);
        console.error(`   Signal: ${signal}`);
        console.error(`   Video URL: ${videoUrl || 'MISSING'}`);
        console.error(`   Video Key: "${videoKey}"`);
        console.error(`   Full URL for debugging: ${videoUrl}`);
        
        // Cleanup temp files on error
        try {
          if (localVideoPath && fs.existsSync(localVideoPath)) {
            fs.unlinkSync(localVideoPath);
            console.log(`🧹 Cleaned up video file after error: ${localVideoPath}`);
          }
        } catch (cleanupError: any) {
          console.warn(`⚠️  Error cleaning up after failure: ${cleanupError.message}`);
        }
        
        reject(new Error(exitMsg));
        return;
      }

      // 3. Upload Result
      job.updateProgress({ percent: 95, message: 'Uploading subtitles to S3...' });
      
      // Find ASS file - Python script generates files like: {base_name}_{detected_lang}.ass
      // The base_name is derived from the downloaded video filename
      console.log(`📁 Looking for ASS files in: ${tempDir}`);
      console.log(`📁 Temp directory exists: ${fs.existsSync(tempDir)}`);
      
      let files: string[] = [];
      try {
        files = fs.readdirSync(tempDir);
        console.log(`📁 Files in temp directory (${files.length} total): ${files.join(', ') || 'NONE'}`);
      } catch (err: any) {
        console.error(`❌ Error reading temp directory: ${err.message}`);
        throw new Error(`Cannot read temp directory: ${tempDir}`);
      }
      
      // Look for .ass files - Python generates them with the pattern {base_name}_{lang}.ass
      // But since we're using presigned URLs, the filename might not match exactly
      // So we'll find ANY .ass file in the temp directory
      const assFiles = files.filter(f => f.endsWith('.ass'));
      console.log(`🔍 Found ${assFiles.length} ASS file(s): ${assFiles.join(', ') || 'NONE'}`);
      
      if (assFiles.length === 0) {
        // List all files for debugging
        console.error(`❌ No ASS file found in temp directory`);
        console.error(`   Temp directory: ${tempDir}`);
        console.error(`   Temp directory absolute: ${path.resolve(tempDir)}`);
        console.error(`   All files: ${files.join(', ') || 'NONE'}`);
        console.error(`   This usually means the Python script crashed before generating the subtitle file.`);
        console.error(`   Check the Python output above for SIGSEGV or other errors.`);
        throw new Error('No subtitle file (.ass) was generated by Python script. The script likely crashed during transcription.');
      }
      
      let subtitleKey: string | null = null;
      
      if (assFiles.length > 0) {
        // Use the first ASS file found (there should only be one)
        const assFile = assFiles[0];
        const assFilePath = path.join(tempDir, assFile);
        
        // Store subtitle locally in client/public/subtitles (accessible via web)
        // From worker/dist/src -> worker/dist -> worker -> root -> client/public/subtitles
        const subtitlesDir = path.resolve(__dirname, '../../../client/public/subtitles');
        if (!fs.existsSync(subtitlesDir)) {
          fs.mkdirSync(subtitlesDir, { recursive: true });
        }
        
        // Use docId or videoId for filename
        const subtitleFilename = docId ? `${docId}.ass` : `${videoId}.ass`;
        const localSubtitlePath = path.join(subtitlesDir, subtitleFilename);
        
        // Copy subtitle file to local subtitles directory
        fs.copyFileSync(assFilePath, localSubtitlePath);
        
        // Set subtitleKey to relative path for API access (client/public/subtitles/{id}.ass)
        subtitleKey = `subtitles/${subtitleFilename}`;
        
        console.log(`✅ Subtitle saved locally:`);
        console.log(`   Source: ${assFilePath}`);
        console.log(`   Destination: ${localSubtitlePath}`);
        console.log(`   Subtitle Key: ${subtitleKey}`);
        console.log(`   File size: ${fs.statSync(localSubtitlePath).size} bytes`);
        console.log(`   Doc ID: ${docId || 'N/A'}`);
        console.log(`   Video ID: ${videoId || 'N/A'}`);
      } else {
        console.error(`❌ No ASS file found in ${tempDir}`);
        console.error(`   Files in directory: ${files.join(', ')}`);
        throw new Error('No subtitle file generated by Python script');
      }

      // Cleanup local files - COMMENTED OUT: Keep files locally for now
      // try {
      //   if (fs.existsSync(localVideoPath)) {
      //     fs.unlinkSync(localVideoPath);
      //     console.log(`🧹 Cleaned up video file: ${localVideoPath}`);
      //   }
      //   if (assFiles.length > 0) {
      //     assFiles.forEach(file => {
      //       const filePath = path.join(tempDir, file);
      //       if (fs.existsSync(filePath)) {
      //         fs.unlinkSync(filePath);
      //         console.log(`🧹 Cleaned up subtitle file: ${filePath}`);
      //       }
      //     });
      //   }
      // } catch (cleanupError: any) {
      //   console.warn(`⚠️  Error during cleanup: ${cleanupError.message}`);
      //   // Don't fail the job if cleanup fails
      // }
      console.log(`📁 Keeping files locally for debugging:`);
      console.log(`   Video: ${localVideoPath}`);
      if (assFiles.length > 0) {
        assFiles.forEach(file => {
          const filePath = path.join(tempDir, file);
          console.log(`   Subtitle: ${filePath}`);
        });
      }
      
      job.updateProgress({ percent: 100, message: 'Processing complete! Subtitle saved locally.' });
      
      // Return the result so queue listener can use it
      resolve({ subtitleKey });
    });
  });
};

