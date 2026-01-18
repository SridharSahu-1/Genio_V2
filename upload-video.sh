#!/bin/bash

# Script to upload video and track end-to-end
# Usage: ./upload-video.sh [video-file-path]

set -e

SERVER_URL="http://localhost:5001"
VIDEO_FILE="${1:-client/podcast.mp4}"

if [ ! -f "$VIDEO_FILE" ]; then
    echo "❌ Error: Video file not found: $VIDEO_FILE"
    exit 1
fi

echo "═══════════════════════════════════════════════════════════"
echo "🎬 VIDEO UPLOAD & PROCESSING TEST"
echo "═══════════════════════════════════════════════════════════"
echo "File: $VIDEO_FILE"
echo "Size: $(ls -lh "$VIDEO_FILE" | awk '{print $5}')"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Check if logged in (we'll need a token)
echo -e "${YELLOW}[1/5]${NC} Checking authentication..."
echo "Note: You need to be logged in via the web app first"
echo "   Get your token from browser cookies (token) and set it:"
echo "   export AUTH_TOKEN=your_token_here"
echo ""

if [ -z "$AUTH_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  AUTH_TOKEN not set. Trying without auth (will fail if auth required)...${NC}"
    AUTH_HEADER=""
else
    AUTH_HEADER="-H \"Authorization: Bearer $AUTH_TOKEN\""
    echo -e "${GREEN}✅ Using provided token${NC}"
fi

# Get filename and content type
FILENAME=$(basename "$VIDEO_FILE")
CONTENT_TYPE="video/mp4"

echo -e "${YELLOW}[2/5]${NC} Initializing upload..."
echo "   Filename: $FILENAME"
echo "   Content-Type: $CONTENT_TYPE"
echo ""

# Step 2: Init Upload
INIT_RESPONSE=$(eval curl -s -X POST "$SERVER_URL/api/videos/upload" \
    -H "Content-Type: application/json" \
    $AUTH_HEADER \
    -d "{\"filename\":\"$FILENAME\",\"contentType\":\"$CONTENT_TYPE\"}")

if [ $? -ne 0 ] || echo "$INIT_RESPONSE" | grep -q "error\|Error\|failed"; then
    echo -e "${RED}❌ Failed to initialize upload${NC}"
    echo "Response: $INIT_RESPONSE"
    exit 1
fi

UPLOAD_URL=$(echo "$INIT_RESPONSE" | grep -o '"uploadUrl":"[^"]*' | cut -d'"' -f4)
VIDEO_ID=$(echo "$INIT_RESPONSE" | grep -o '"videoId":"[^"]*' | cut -d'"' -f4)

if [ -z "$UPLOAD_URL" ] || [ -z "$VIDEO_ID" ]; then
    echo -e "${RED}❌ Failed to get uploadUrl or videoId${NC}"
    echo "Response: $INIT_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✅ Upload initialized${NC}"
echo "   Video ID: $VIDEO_ID"
echo "   Upload URL: ${UPLOAD_URL:0:100}..."
echo ""

# Step 3: Upload to S3
echo -e "${YELLOW}[3/5]${NC} Uploading file to S3..."
UPLOAD_RESULT=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X PUT "$UPLOAD_URL" \
    -H "Content-Type: $CONTENT_TYPE" \
    --data-binary "@$VIDEO_FILE")

HTTP_STATUS=$(echo "$UPLOAD_RESULT" | grep "HTTP_STATUS" | cut -d':' -f2)
BODY=$(echo "$UPLOAD_RESULT" | sed '/HTTP_STATUS/d')

if [ "$HTTP_STATUS" != "200" ] && [ "$HTTP_STATUS" != "204" ]; then
    echo -e "${RED}❌ Upload failed with status: $HTTP_STATUS${NC}"
    echo "Response: $BODY"
    exit 1
fi

echo -e "${GREEN}✅ File uploaded successfully${NC}"
echo ""

# Step 4: Verify upload
echo -e "${YELLOW}[4/5]${NC} Verifying upload..."
VERIFY_RESPONSE=$(eval curl -s -X POST "$SERVER_URL/api/videos/verify" \
    -H "Content-Type: application/json" \
    $AUTH_HEADER \
    -d "{\"videoId\":\"$VIDEO_ID\"}")

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Verify request failed, but continuing...${NC}"
else
    echo -e "${GREEN}✅ Upload verified${NC}"
fi
echo ""

# Step 5: Start processing
echo -e "${YELLOW}[5/5]${NC} Starting video processing..."
PROCESS_RESPONSE=$(eval curl -s -X POST "$SERVER_URL/api/videos/process" \
    -H "Content-Type: application/json" \
    $AUTH_HEADER \
    -d "{\"videoId\":\"$VIDEO_ID\"}")

if [ $? -ne 0 ] || echo "$PROCESS_RESPONSE" | grep -q "error\|Error"; then
    echo -e "${RED}❌ Failed to start processing${NC}"
    echo "Response: $PROCESS_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✅ Processing started!${NC}"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📊 Monitoring Logs${NC}"
echo "═══════════════════════════════════════════════════════════"
echo "Video ID: $VIDEO_ID"
echo ""
echo "To monitor logs:"
echo "  - Server: Check your server terminal/logs"
echo "  - Worker: docker-compose logs -f worker | grep '$VIDEO_ID'"
echo ""

# Monitor worker logs for this video
echo -e "${BLUE}Monitoring worker logs for 30 seconds...${NC}"
echo ""
timeout 30 docker-compose logs -f --tail=0 worker 2>&1 | grep --line-buffered -i "$VIDEO_ID\|DOWNLOADING\|Processing\|ERROR\|Failed\|Success" || true

echo ""
echo -e "${GREEN}✅ Upload and processing initiated!${NC}"
echo "   Check logs above for any errors"
