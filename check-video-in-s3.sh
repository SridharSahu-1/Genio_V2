#!/bin/bash

# Script to check if a video exists in S3 and verify the key

VIDEO_ID="${1:-696caad6cb59d2198ccd412b}"

echo "🔍 Checking video in S3..."
echo "Video ID: $VIDEO_ID"
echo ""

# Check if video exists in MongoDB
echo "📊 Checking MongoDB..."
docker-compose exec mongo mongosh genio --quiet --eval "
var video = db.videos.findOne({ _id: ObjectId('$VIDEO_ID') });
if (video) {
  print('✅ Video found in DB');
  print('   Title: ' + video.title);
  print('   Key: \"' + video.originalKey + '\"');
  print('   Status: ' + video.status);
  print('   Video URL: ' + (video.videoUrl || 'NOT SET'));
} else {
  print('❌ Video NOT found in DB');
}
"

echo ""
echo "To check S3 manually, use AWS CLI with the key from above:"
echo "aws s3 ls s3://YOUR_BUCKET/YOUR_KEY"