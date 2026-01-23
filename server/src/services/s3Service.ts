import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Lazy initialization to ensure env vars are loaded
let s3Client: S3Client | null = null;

// Helper to get bucket name consistently
export const getBucketName = (): string => {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET environment variable is required');
  }
  return bucket;
};

const getS3Client = (): S3Client => {
  if (!s3Client) {
    const accessKey = process.env.AWS_ACCESS_KEY_ID || '';
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY || '';
    const region = process.env.AWS_REGION || 'us-east-1';

    if (!accessKey || !secretKey) {
      throw new Error('AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) are required');
    }

    console.log(`Initializing AWS S3 client - region: ${region}, bucket: ${getBucketName()}`);

    s3Client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      maxAttempts: 3, // Retry configuration
    });
  }
  return s3Client;
};

// Verify bucket exists
export const ensureBucketExists = async (): Promise<void> => {
  const s3 = getS3Client();
  const bucket = getBucketName();

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`✅ Bucket '${bucket}' exists`);
  } catch (error: any) {
    const errorName = error.name || error.Code || 'Unknown';
    const statusCode = error.$metadata?.httpStatusCode;

    if (errorName === 'NotFound' || statusCode === 404) {
      const message = `Bucket '${bucket}' does not exist in AWS S3. Please create it in your AWS account.`;
      console.error(`❌ ${message}`);
      throw new Error(message);
    } else if (errorName === 'Forbidden' || statusCode === 403) {
      const message = `Access forbidden to bucket '${bucket}'. Check your AWS credentials and bucket permissions.`;
      console.error(`❌ ${message}`);
      throw new Error(message);
    } else {
      const message = `Error checking bucket '${bucket}': ${error.message || errorName}`;
      console.error(`❌ ${message}`);
      throw new Error(message);
    }
  }
};

// Helper to clean S3 keys consistently
export const cleanS3Key = (key: string): string => {
  return key.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
};

export const getUploadUrl = async (key: string, contentType: string) => {
  const s3 = getS3Client();
  const bucket = getBucketName();
  const cleanKey = cleanS3Key(key);

  console.log(`🔗 Generating presigned upload URL`);
  console.log(`   Bucket: ${bucket}`);
  console.log(`   Original Key: ${key}`);
  console.log(`   Cleaned Key: ${cleanKey}`);
  console.log(`   ContentType: ${contentType}`);

  // Verify bucket exists first (non-blocking warning)
  try {
    await ensureBucketExists();
  } catch (error: any) {
    console.warn(`⚠️  Bucket verification failed: ${error.message}`);
    console.warn('   Continuing anyway - presigned URL will be generated');
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: cleanKey, // Use cleaned key
    ContentType: contentType,
  });

  try {
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    console.log(`✅ Generated presigned URL`);
    console.log(`   Key that will be used in S3: ${cleanKey}`);
    console.log(`   URL (first 150 chars): ${url.substring(0, 150)}...`);
    return url;
  } catch (error: any) {
    const errorMessage = error.message || error.name || 'Unknown error';
    console.error(`❌ Failed to generate upload URL: ${errorMessage}`);
    console.error('Error details:', {
      name: error.name,
      code: error.Code,
      statusCode: error.$metadata?.httpStatusCode,
      message: error.message,
    });
    throw new Error(`Failed to generate upload URL: ${errorMessage}`);
  }
};

export const getDownloadUrl = async (key: string) => {
  const s3 = getS3Client();
  const bucket = getBucketName();
  const cleanKey = cleanS3Key(key);

  console.log(`🔗 Generating presigned download URL`);
  console.log(`   Original key: "${key}"`);
  console.log(`   Cleaned key: "${cleanKey}"`);
  console.log(`   Bucket: ${bucket}`);

  // Verify file exists before generating presigned URL
  // S3 has eventual consistency, so we retry a few times with delays
  let fileExists = false;
  let lastError: any = null;
  const maxRetries = 10; // Increased retries
  const retryDelay = 2000; // 2 seconds between retries

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const verifyCommand = new HeadObjectCommand({
        Bucket: bucket,
        Key: cleanKey,
      });
      const response = await s3.send(verifyCommand);
      fileExists = true;
      console.log(`✅ File exists - verified on attempt ${attempt}/${maxRetries}`);
      console.log(`   File size: ${response.ContentLength} bytes`);
      console.log(`   Content type: ${response.ContentType}`);
      console.log(`   Last modified: ${response.LastModified}`);
      break;
    } catch (error: any) {
      lastError = error;
      const errorName = error.name || error.Code || 'Unknown';
      const statusCode = error.$metadata?.httpStatusCode;

      if (errorName === 'NotFound' || errorName === 'NoSuchKey' || statusCode === 404) {
        if (attempt < maxRetries) {
          console.log(`⏳ File not found yet (attempt ${attempt}/${maxRetries}), waiting ${retryDelay}ms...`);
          console.log(`   Trying key: "${cleanKey}"`);

          // Try to list objects with similar prefix to debug
          if (attempt === 3 || attempt === 6) {
            try {
              const prefix = cleanKey.split('/').slice(0, -1).join('/') + '/';
              const listCommand = new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                MaxKeys: 10,
              });
              const listResponse = await s3.send(listCommand);
              const keys = (listResponse.Contents || []).map(obj => obj.Key || '').filter(Boolean);
              console.log(`   🔍 Found ${keys.length} objects with prefix "${prefix}":`);
              keys.forEach(k => console.log(`      - ${k}`));
            } catch (listError) {
              // Ignore list errors
            }
          }

          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        } else {
          console.error(`❌ File does not exist in S3 after ${maxRetries} attempts`);
          console.error(`   Key: "${cleanKey}"`);
          console.error(`   Original key: "${key}"`);
          console.error(`   Error: ${errorName} - ${error.message}`);

          // Last attempt: try to list objects to help debug
          try {
            const prefix = cleanKey.split('/').slice(0, -1).join('/') + '/';
            const listCommand = new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix,
              MaxKeys: 10,
            });
            const listResponse = await s3.send(listCommand);
            const keys = (listResponse.Contents || []).map(obj => obj.Key || '').filter(Boolean);
            console.error(`   🔍 Found ${keys.length} objects with prefix "${prefix}":`);
            keys.forEach(k => console.error(`      - ${k}`));
            if (keys.length > 0) {
              console.error(`   💡 Tip: Check if the key stored in database matches the actual uploaded key`);
            }
          } catch (listError) {
            // Ignore list errors
          }

          throw new Error(`Video file does not exist in S3. Key: "${cleanKey}". Ensure the file was uploaded successfully before processing.`);
        }
      } else {
        // Non-404 error, don't retry
        console.error(`❌ Error verifying file exists: ${errorName} - ${error.message}`);
        console.error(`   Status code: ${statusCode}`);
        throw error;
      }
    }
  }

  if (!fileExists) {
    console.error(`❌ File verification failed after ${maxRetries} attempts`);
    throw new Error(`Video file does not exist in S3. Key: "${cleanKey}". Ensure the file was uploaded successfully before processing.`);
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: cleanKey,
  });
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
  console.log(`✅ Presigned download URL generated successfully`);
  console.log(`   URL (first 100 chars): ${presignedUrl.substring(0, 100)}...`);
  return presignedUrl;
};

// Generate presigned URL for any S3 key (simpler version without retry logic)
// Use this when you know the file exists or want to generate URL without verification
export const getPresignedUrl = async (key: string, expiresIn: number = 3600, forceDownload: boolean = false, filename?: string): Promise<string> => {
  const s3 = getS3Client();
  const bucket = getBucketName();
  const cleanKey = cleanS3Key(key);

  console.log(`🔗 Generating presigned URL`);
  console.log(`   Key: "${cleanKey}"`);
  console.log(`   Bucket: ${bucket}`);
  console.log(`   Expires in: ${expiresIn} seconds`);
  console.log(`   Force download: ${forceDownload}`);

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: cleanKey,
    ...(forceDownload && filename ? {
      ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
    } : {}),
  });
  
  try {
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn });
    console.log(`✅ Presigned URL generated successfully`);
    console.log(`   URL (first 100 chars): ${presignedUrl.substring(0, 100)}...`);
    return presignedUrl;
  } catch (error: any) {
    console.error(`❌ Failed to generate presigned URL: ${error.message}`);
    throw new Error(`Failed to generate presigned URL: ${error.message}`);
  }
};

// Helper to list objects with a prefix (for debugging)
export const listObjectsWithPrefix = async (prefix: string, maxKeys: number = 10): Promise<string[]> => {
  try {
    const s3 = getS3Client();
    const bucket = getBucketName();
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });
    const response = await s3.send(command);
    const keys = (response.Contents || []).map(obj => obj.Key || '').filter(Boolean);
    return keys;
  } catch (error: any) {
    console.error(`Error listing objects with prefix ${prefix}:`, error.message);
    return [];
  }
};

// Generate public S3 URL (for direct access when bucket is public)
export const getPublicUrl = (key: string): string => {
  const bucket = getBucketName();
  const region = process.env.AWS_REGION || 'us-east-1';
  const cleanKey = cleanS3Key(key);

  // Public S3 URL format: https://{bucket}.s3.{region}.amazonaws.com/{key}
  const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${cleanKey}`;
  return publicUrl;
};

export const verifyFileExists = async (key: string): Promise<boolean> => {
  try {
    const s3 = getS3Client();
    const bucket = getBucketName();

    // Clean the key to match what was actually stored
    const cleanKey = cleanS3Key(key);

    console.log(`🔍 Verifying file - Bucket: ${bucket}, Key: ${cleanKey}`);

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: cleanKey,
    });
    const response = await s3.send(command);
    console.log(`✅ File verified: ${cleanKey}`);
    console.log(`   Size: ${response.ContentLength} bytes, Type: ${response.ContentType}`);
    console.log(`   LastModified: ${response.LastModified}`);
    return true;
  } catch (error: any) {
    const errorName = error.name || error.Code || 'Unknown';
    const statusCode = error.$metadata?.httpStatusCode;

    if (errorName === 'NotFound' || errorName === 'NoSuchKey' || statusCode === 404) {
      // If file not found, try to list objects with similar prefix for debugging
      const prefix = key.split('/').slice(0, -1).join('/');
      if (prefix) {
        const cleanPrefix = cleanS3Key(prefix);
        console.log(`   🔍 Searching for similar objects with prefix: ${cleanPrefix}/`);
        const similarKeys = await listObjectsWithPrefix(cleanPrefix + '/', 10);
        if (similarKeys.length > 0) {
          console.log(`   📋 Found ${similarKeys.length} objects in this prefix:`);
          similarKeys.forEach(k => {
            const match = k === cleanS3Key(key) ? '✅ MATCH' : '  ';
            console.log(`   ${match} ${k}`);
          });
        } else {
          console.log(`   ❌ No objects found in prefix: ${cleanPrefix}/`);
        }
      }
      // Don't log as error during retries, just return false
      return false;
    }
    console.error(`❌ Error verifying file: ${errorName} - ${error.message || error.Code || 'Unknown error'}`);
    console.error(`   Status Code: ${statusCode}`);
    throw error;
  }
};



