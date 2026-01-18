#!/usr/bin/env node

/**
 * Script to upload video and track end-to-end
 * Usage: node upload-video.js [video-file-path]
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5001';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const videoFile = process.argv[2] || path.join(__dirname, 'client/podcast.mp4');

if (!fs.existsSync(videoFile)) {
  console.error(`❌ Error: Video file not found: ${videoFile}`);
  process.exit(1);
}

const stats = fs.statSync(videoFile);
const filename = path.basename(videoFile);

console.log('═══════════════════════════════════════════════════════════');
console.log('🎬 VIDEO UPLOAD & PROCESSING TEST');
console.log('═══════════════════════════════════════════════════════════');
console.log(`File: ${videoFile}`);
console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
console.log('');

const api = axios.create({
  baseURL: SERVER_URL,
  headers: {
    'Content-Type': 'application/json',
    ...(AUTH_TOKEN && { Authorization: `Bearer ${AUTH_TOKEN}` }),
  },
});

async function uploadVideo() {
  try {
    // Step 1: Init Upload
    console.log('[1/5] Initializing upload...');
    const initRes = await api.post('/api/videos/upload', {
      filename: filename,
      contentType: 'video/mp4',
    });

    const { uploadUrl, videoId } = initRes.data;
    console.log(`✅ Upload initialized - Video ID: ${videoId}`);
    console.log('');

    // Step 2: Upload to S3
    console.log('[2/5] Uploading file to S3...');
    const fileBuffer = fs.readFileSync(videoFile);
    
    const uploadRes = await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          process.stdout.write(`\r   Progress: ${percent}%`);
        }
      },
    });

    if (uploadRes.status !== 200 && uploadRes.status !== 204) {
      throw new Error(`Upload failed with status ${uploadRes.status}`);
    }
    console.log('\n✅ File uploaded successfully to S3');
    console.log('');

    // Step 3: Verify upload
    console.log('[3/5] Verifying upload...');
    let verified = false;
    const maxAttempts = 10;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const verifyRes = await api.post('/api/videos/verify', { videoId });
        if (verifyRes.data.verified) {
          verified = true;
          console.log(`✅ Upload verified on attempt ${attempt}`);
          break;
        } else {
          console.log(`   Waiting for verification... (${attempt}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (err) {
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    if (!verified) {
      console.warn('⚠️  Verification timeout, but continuing...');
    }
    console.log('');

    // Step 4: Start processing
    console.log('[4/5] Starting video processing...');
    const processRes = await api.post('/api/videos/process', { videoId });
    console.log('✅ Processing started!');
    console.log('');

    // Step 5: Monitor logs
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 Monitoring Logs');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Video ID: ${videoId}`);
    console.log('');
    console.log('To monitor logs:');
    console.log('  docker-compose logs -f worker | grep "' + videoId + '"');
    console.log('');

    return videoId;

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

uploadVideo()
  .then((videoId) => {
    console.log('✅ Upload and processing initiated successfully!');
    console.log(`   Video ID: ${videoId}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error.message);
    process.exit(1);
  });
