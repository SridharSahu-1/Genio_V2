#!/bin/bash

# Simple video upload test script
set -e

SERVER="http://localhost:5001"
VIDEO_FILE="client/podcast.mp4"

if [ ! -f "$VIDEO_FILE" ]; then
    echo "❌ File not found: $VIDEO_FILE"
    exit 1
fi

echo "═══════════════════════════════════════════════════════════"
echo "🎬 Testing Video Upload & Processing"
echo "═══════════════════════════════════════════════════════════"
echo "File: $VIDEO_FILE"
echo ""

# Step 1: Init upload (without auth for testing - might fail)
echo "[1] Initializing upload..."
INIT=$(curl -s -X POST "$SERVER/api/videos/upload" \
    -H "Content-Type: application/json" \
    -d "{\"filename\":\"podcast.mp4\",\"contentType\":\"video/mp4\"}")

echo "Response: $INIT" | head -c 200
echo ""
echo ""

# Extract videoId and uploadUrl
VIDEO_ID=$(echo "$INIT" | grep -o '"videoId":"[^"]*' | cut -d'"' -f4)
UPLOAD_URL=$(echo "$INIT" | grep -o '"uploadUrl":"[^"]*' | cut -d'"' -f4)

if [ -z "$VIDEO_ID" ]; then
    echo "⚠️  Note: Upload requires authentication. Please run via web app or set AUTH_TOKEN"
    echo "   The upload flow is:"
    echo "   1. POST /api/videos/upload"
    echo "   2. PUT to uploadUrl (S3 presigned URL)"
    echo "   3. POST /api/videos/verify"
    echo "   4. POST /api/videos/process"
    exit 1
fi

echo "✅ Got Video ID: $VIDEO_ID"
echo ""

# Step 2: Upload to S3
echo "[2] Uploading to S3..."
curl -X PUT "$UPLOAD_URL" \
    -H "Content-Type: video/mp4" \
    --data-binary "@$VIDEO_FILE" \
    -w "\nHTTP Status: %{http_code}\n" || true
echo ""

# Step 3: Verify
echo "[3] Verifying upload..."
curl -s -X POST "$SERVER/api/videos/verify" \
    -H "Content-Type: application/json" \
    -d "{\"videoId\":\"$VIDEO_ID\"}" || true
echo ""
echo ""

# Step 4: Start processing
echo "[4] Starting processing..."
curl -s -X POST "$SERVER/api/videos/process" \
    -H "Content-Type: application/json" \
    -d "{\"videoId\":\"$VIDEO_ID\"}" || true
echo ""
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "📊 Monitoring Logs"
echo "═══════════════════════════════════════════════════════════"
echo "Video ID: $VIDEO_ID"
echo ""
echo "Watch worker logs:"
echo "  docker-compose logs -f worker"
echo ""

# Start monitoring in background
echo "Starting log monitor (30 seconds)..."
timeout 30 docker-compose logs -f --tail=0 worker 2>&1 | grep --line-buffered -i "$VIDEO_ID\|DOWNLOADING\|Failed\|Success\|ERROR" || true
